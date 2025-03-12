import { WebSocketServer, WebSocket } from "ws"
import { v4 as uuid } from 'uuid'

const wss = new WebSocketServer({ port : 5000 })

const userIdToWebSocket = new Map()
const webSocketToUserId = new Map()
const rooms = new Map() //hostId to member Id
const memberIdToRooms = new Map()

const addUser = (socket) => {
    const userId = uuid()
    userIdToWebSocket.set(userId, socket)
    webSocketToUserId.set(socket, userId)
    //socket.send(JSON.stringify({ type : "userId", userId }))
    return userId
}

const removeUser = (socket) => {
    const userId = webSocketToUserId.get(socket)
    if(rooms.has(userId)) {
        const members = rooms.get(userId)
        members.map(memberId => {
            const memberSock = userIdToWebSocket.get(memberId)
            memberSock?.send(JSON.stringify({ type : 'disconnected' }))
        })
        userIdToWebSocket.delete(userId)
        webSocketToUserId.delete(socket)
        rooms.delete(userId) //update remove member from array
        console.log(`host ${userId} disconnected`) 
    } else if(userId) {
        userIdToWebSocket.delete(userId)
        webSocketToUserId.delete(socket)
        console.log(`member ${userId} disconnected`)

        const host = memberIdToRooms.get(userId)
        rooms.get(host)?.filter(memberId => memberId !== userId)
        const hostSocket = userIdToWebSocket.get(host)

        hostSocket?.send(JSON.stringify({ type : 'disconnected', memberId : userId }))
    }
}

const createRoom = (hostSocket) => {
    let hostId = webSocketToUserId.get(hostSocket);

    // Assign a user ID if they don't have one
    if (!hostId) {
        hostId = addUser(hostSocket);
    }

    rooms.set(hostId, [hostId]); // Set the host as the only member initially
    memberIdToRooms.set(hostId, hostId);    // Host is in their own room

    console.log(`Room created with hostId: ${hostId}`);
    return hostId;
};

const joinRoom = (memberId, hostId) => {
    const memberSocket = userIdToWebSocket.get(memberId)
    if(!rooms.has(hostId)) {
        return memberSocket.send(JSON.stringify({ error : "invalid id" }))
    }if(!rooms.get(hostId)) {
        rooms.set(hostId, [memberId])
    } else if(memberId !== hostId){   
        rooms.get(hostId).push(memberId)
    }
    memberIdToRooms.set(memberId, hostId)
    const roomMembers = rooms.get(hostId) || [];
    roomMembers.forEach((id)=>{
        console.log(id);
    })
    roomMembers.forEach((id) => {
        if (id !== memberId) { // Exclude the new member from receiving this
            const socket = userIdToWebSocket.get(id);
            if (socket) {
                socket.send(JSON.stringify({
                    type: "new-member",
                    memberId: memberId,
                    roomId: hostId,
                    members: roomMembers
                }));
            }
        }
    });
    console.log(`member ${memberId} joined room ${hostId}`)
    //memberSocket.send(JSON.stringify({ type: "room-members", members: rooms.get(hostId) }));
}

const sendAnswer = (socket, message) => {   // socket = new member socket
    if (!message.answer) {
        return socket.send(JSON.stringify({ error: "Must include answer" }));
    }
    const senderId = message.senderId    // new member id
    
    if (!senderId) {
        return socket.send(JSON.stringify({ error: "Sender not recognized" }));
    }
    const roomId = message.roomId
    if (!roomId) {
        return socket.send(JSON.stringify({ error: "You are not in a room" }));
    }
    const members = rooms.get(roomId);
    if (!members || !Array.isArray(members)) {
        return socket.send(JSON.stringify({ error: "Invalid room" }));
    }
    const receiverId = message.targetId;
    if(!receiverId) {
        return socket.send(JSON.stringify({ error : "must include receiverId" }))
    }
    const receiverSocket = userIdToWebSocket.get(receiverId);
    receiverSocket.send(JSON.stringify({ type: "received-answer", answer: message.answer, senderId: senderId }));
    console.log(`Answer ${message.answer} sent from ${senderId} to ${receiverId}`);
};



const exchangeCandidate = (socket, message) => {
    if (!message.candidate) {
        return socket.send(JSON.stringify({ error: "Must include candidate" }));
    }
    const roomId = message.roomId
    const userId = message.senderId   
    const targetId = message.targetId
    if (!roomId) {
        return socket.send(JSON.stringify({ error: "You are not in a room" }));
    }
    const members = rooms.get(roomId);
    if (!members) {
        return socket.send(JSON.stringify({ error: "Invalid room" }));
    }
    if (!members.includes(userId) || !members.includes(targetId)) {
        return socket.send(JSON.stringify({ error: "Both users must be in the room" }));
    }    
    const targetSocket = userIdToWebSocket.get(targetId);
    if (targetSocket && targetId !== userId) {
        targetSocket.send(JSON.stringify({ 
            type: "ice-candidate", 
            candidate: message.candidate, 
            senderId: userId,

        }));
        console.log(`ICE candidate sent from ${userId} to ${targetId}`);
    }
};
// user joins (send join-room message) to sever
// server sends new-member msg to everyone else in the room along with offer
// new member receives offer and sends answer to server
// server sends answer to everyone in the room
// ice candidate exchange
// server sends ice candidate to everyone in the room
wss.on("connection", (ws) => {
    
    console.log('New connection established');
    ws.on("close", (code, reason) => {
        removeUser(ws);
    });
    

    ws.on("error", (err) => {
        removeUser(ws);
    });

    ws.on("message", (data) => {
        const message  = JSON.parse(data)
        if(message.type === "create-room") {
            const hostId = createRoom(ws)
            ws.send(JSON.stringify({ type : "host-id", hostId, members: [hostId] })) 
            console.log(`user created room ${hostId}`)
        } else if(message.type === "get-id") {
            const userId = addUser(ws)
            ws.send(JSON.stringify({ type : "user-id", userId }))
        } else if(message.type === "join-room") { // { type, hostId, memberId, offer }
            const hostId = message.roomId
            if(!hostId) {
                return ws.send(JSON.stringify({ error : "message should include hostId" }))
            }
            console.log(`${message.memberId} wants to join the room`)
            const memberId = message.memberId     // new joiner
            joinRoom(memberId, hostId)
        } else if(message.type === "send-offer"){
            const roomId = message.roomId
            const memberId = message.receiverId   // new joiner
            const senderId = message.senderId
            if(!roomId) {
                return ws.send(JSON.stringify({ error : "message should include hostId" }))
            }
            const memberSocket = userIdToWebSocket.get(memberId)
            if(!memberSocket) {
                return ws.send(JSON.stringify({ error : "invalid room" }));
            }
            if(!message.offer) {
                return ws.send(JSON.stringify({ error : "must send offer" }))
            }
            memberSocket.send(JSON.stringify({ type: "received-offer", offer: message.offer, roomId: roomId, memberId: memberId, senderId: senderId }));
            console.log(`Offer ${message.offer} sent from ${senderId} to ${memberId}`);            
        }else if(message.type === "request-users"){
            const roomId = message.roomId
            if (!rooms.has(roomId)) {
                return ws.send(JSON.stringify({ type: "user-list", members: [] }));  // Send empty array instead of undefined
            }
            if (!rooms.has(roomId)) {
                return ws.send(JSON.stringify({ type: "user-list", members: [] }));  
            }
            const membersList = rooms.get(roomId) || []; 
            console.log(`Sending updated user list for room ${roomId}:`, membersList);
            ws.send(JSON.stringify({ type: "user-list", members: membersList }));
            
        }
        else if(message.type === "send-answer") {
            sendAnswer(ws, message)
        } else if(message.type === "ice-candidate") {
            exchangeCandidate(ws, message)          // not sure about sender and receiver ids
        } else {
            ws.send(JSON.stringify({ error : "invalid message type" }))
        }
    })
})