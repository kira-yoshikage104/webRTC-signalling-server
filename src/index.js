import { WebSocketServer, WebSocket } from "ws";
import { v4 as uuid } from "uuid";

const wss = new WebSocketServer({ port: 8080 });

const userIdToWebSocket = new Map();
const webSocketToUserId = new Map();
const rooms = new Map(); //hostId -> {roomName, genre, isPublic, members: []}
const memberIdToRooms = new Map();
const userIdToUsername = new Map();

const addUser = (socket) => {
  const userId = uuid();
  userIdToWebSocket.set(userId, socket);
  webSocketToUserId.set(socket, userId);
  socket.send(JSON.stringify({ type: "userId", userId }));
  console.log(`new user : ${userId}`);
};

const removeUser = (socket) => {
  const userId = webSocketToUserId.get(socket);
  userIdToUsername.delete(userId);
  if (rooms.has(userId)) {
    const members = rooms.get(userId).members;
    members.map((memberId) => {
      if(memberId !== userId) {
        const memberSock = userIdToWebSocket.get(memberId);
        memberSock?.send(JSON.stringify({ type: "room-closed" }));
      }
    });
    userIdToWebSocket.delete(userId);
    webSocketToUserId.delete(socket);
    rooms.delete(userId); //update remove member from array
    console.log(`host ${userId} disconnected`);
  } else if (userId) {
    userIdToWebSocket.delete(userId);
    webSocketToUserId.delete(socket);
    console.log(`member ${userId} disconnected`);

    const host = memberIdToRooms.get(userId);
    const room = rooms.get(host);
    if (room) {
      room.members = room.members.filter((memberId) => memberId !== userId);
      rooms.set(host, room);
      room.members.forEach(memberId => {
        const memberSocket = userIdToWebSocket.get(memberId);
        memberSocket.send(JSON.stringify({ type : "disconnected", memberId : userId }));
      })
    }
  }
};

const createRoom = (hostSocket, roomName, genre, isPublic, username) => {
  const hostId = webSocketToUserId.get(hostSocket);
  rooms.set(hostId, { roomName, genre, isPublic, members: [hostId] });
  memberIdToRooms.set(hostId, hostId);
  userIdToUsername.set(hostId, username);
  return hostId;
};

const joinRoom = (memberSocket, message) => {
  const { targetId, offer, username } = message;
  const memberId = webSocketToUserId.get(memberSocket);
  if(!memberId) {
    return memberSocket.send(JSON.stringify({ error : "invalid user" }));
  }
  if (!targetId) {
    return memberSocket.send(JSON.stringify({ error: "message should include targetId" }));
  }
  if (!rooms.has(targetId)) {
    return memberSocket.send(JSON.stringify({ error: "invalid targetId" }));
  }
  if (!offer) {
    return ws.send(JSON.stringify({ error: "must send offer" }));
  }
  if(!username) {
    userIdToUsername.set(memberId, memberId);
  } else {
    userIdToUsername.set(memberId, username);
  }
  const roomMembers = rooms.get(targetId).members.map(currMemberId => ({ memberId : currMemberId, username : userIdToUsername.get(currMemberId) }));
  memberSocket.send(JSON.stringify({ type : "room-members", members : roomMembers }));
  rooms.get(targetId).members.forEach(existingMemberId => {
    const existingMemberSock = userIdToWebSocket.get(existingMemberId);
    existingMemberSock.send(JSON.stringify({ type: "new-member", memberId, offer, username : userIdToUsername.get(memberId) }));
    console.log(`offer ${offer} sent from ${memberId} to ${existingMemberId}`); 
  });
  rooms.get(targetId).members.push(memberId);
  memberIdToRooms.set(memberId, targetId);
  console.log(`member ${memberId} joined room ${targetId}`);
};

const sendAnswer = (senderSocket, message) => {
  // message = {type="create-answer", answer}
  if (!message.answer || !message.targetId) {
    return senderSocket.send(
      JSON.stringify({ error: "must include answer and targetId" })
    );
  }
  const senderId = webSocketToUserId.get(senderSocket);
  const targetSocket = userIdToWebSocket.get(message.targetId);
  targetSocket.send(
    JSON.stringify({ type: "create-answer", answer: message.answer, senderId })
  );
  console.log(
    `answer ${message.answer} sent from ${senderId} to ${message.targetId}`
  );
};

const handlePeerConnectionRequest = (senderSocket, message) => {
  const senderId = webSocketToUserId.get(senderSocket);
  const { targetId } = message;
  if(!targetId) {
    return senderSocket.send(JSON.stringify({ error : "must include targetId" }));
  }
  const targetSocket = userIdToWebSocket.get(targetId);
  if(!targetSocket) {
    return senderSocket.send(JSON.stringify({ error : "invalid targetId" }));
  }
  targetSocket.send(JSON.stringify({ type : "peer-connection-request", senderId }));
}

const handlePeerConnectionOffer = (senderSocket, message) => {
  const senderId = webSocketToUserId.get(senderSocket);
  const { targetId, offer } = message;
  if(!targetId || !offer) {
    return senderSocket.send(JSON.stringify({ error : "must include targetId and offer" }));
  }
  const targetSocket = userIdToWebSocket.get(targetId);
  if(!targetSocket) {
    return senderSocket.send(JSON.stringify({ error : "invalid targetId"}));
  }
  targetSocket.send(JSON.stringify({ type : "peer-connection-offer", senderId, offer }));
}

const handlePeerConnectionAnswer = (senderSocket, message) => {
  const senderId = webSocketToUserId.get(senderSocket);
  const { targetId, answer } = message;
  if(!targetId || !answer) {
    return senderSocket.send(JSON.stringify({ error : "must include targetId and answer" }));
  }
  const targetSocket = userIdToWebSocket.get(targetId);
  if(!targetSocket) {
    return senderSocket.send(JSON.stringify({ error : "invalid targetId"}));
  }
  targetSocket.send(JSON.stringify({ type : "peer-connection-answer", senderId, answer }));
}

const exchangeCandidate = (socket, message) => {
  if (!message.targetId) {
    return socket.send(JSON.stringify({ error: "must include targetId" }));
  }
  const targetSocket = userIdToWebSocket.get(message.targetId);
  if (!targetSocket) {
    return socket.send(JSON.stringify({ error: "invalid target id" }));
  }
  if (!message.candidate) {
    return socket.send(JSON.stringify({ error: "must include candidates" }));
  }
  const senderId = webSocketToUserId.get(socket);
  targetSocket.send(
    JSON.stringify({
      type: "ice-candidate",
      candidate: message.candidate,
      senderId,
    })
  );
};

const sendChatMessage = (ws, text) => {
  const senderId = webSocketToUserId.get(ws);
  const roomId = memberIdToRooms.get(senderId) || senderId;
  const room = rooms.get(roomId);
  if(!room) {
    console.error(`Room not found for sender ${senderId}`);
    ws.send(JSON.stringify(`Room not found for sender ${senderId}`));
    return;
  }
  room.members.map(recieverId => {
    const recieverSock = userIdToWebSocket.get(recieverId);
    console.log(`sending message ${text} from ${senderId} to ${recieverId}`)
    recieverSock?.send(JSON.stringify({
      type : "chat-message",
      senderId,
      text,
      timestamp : Date.now()
    }))
  })
}

wss.on("connection", (ws) => {
  addUser(ws);

  ws.on("close", () => {
    removeUser(ws);
  });

  ws.on("error", (err) => {
    console.error("websocket error : ", err);
    removeUser(ws);
  });

  ws.on("message", (data) => {
    const message = JSON.parse(data);
    if (message.type === "create-room") {
      const hostId = createRoom(
        ws,
        message.roomName,
        message.genre,
        message.isPublic,
        message.username
      );
      ws.send(JSON.stringify({ type: "host-id", hostId }));
      console.log(`user created room ${hostId}`);
    } else if (message.type === "join-room") {
      joinRoom(ws, message);
    } else if (message.type === "create-answer") {
      sendAnswer(ws, message);
    } else if(message.type === "request-peer-connection") {
      handlePeerConnectionRequest(ws, message);
    } else if(message.type === "peer-connection-offer") {
      handlePeerConnectionOffer(ws, message);
    } else if(message.type === "peer-connection-answer") {
      handlePeerConnectionAnswer(ws, message);
    } else if (message.type === "ice-candidate") {
      exchangeCandidate(ws, message);
    } else if (message.type === "public-rooms") {
      const obj = Object.fromEntries(rooms);
      ws.send(JSON.stringify({ type: "public-rooms", rooms: obj }));
    } else if (message.type === "chat-message") { 
      sendChatMessage(ws, message.text)
    } else {
      ws.send(JSON.stringify({ error: "invalid message type" }));
    }
  });
});
