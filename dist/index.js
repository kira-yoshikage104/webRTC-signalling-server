"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const ws_1 = require("ws");
const uuid_1 = require("uuid");
const wss = new ws_1.WebSocketServer({ port: 8080 });
let connections = {
    ids: [],
    users: {}
};
const addUser = (id, socket) => {
    connections.ids.push(id);
    connections.users[id] = socket;
};
const addReciever = (id, socket) => {
    if (!connections.senders[id]) {
        return false;
    }
    connections.recievers[id] = socket;
    return true;
};
const removeConnection = (socket) => {
    var _a, _b;
    const senderConnId = (_a = Object.entries(connections.senders).find(([_, senderEntry]) => socket === senderEntry)) === null || _a === void 0 ? void 0 : _a[0];
    const recieverConnId = (_b = Object.entries(connections.recievers).find(([_, recieverEntry]) => socket === recieverEntry)) === null || _b === void 0 ? void 0 : _b[0];
    if (senderConnId) {
        delete connections.senders[senderConnId];
        delete connections.recievers[senderConnId];
        connections.ids = connections.ids.filter(id => id !== senderConnId);
        console.log(`Sender disconnected from ${senderConnId}`);
    }
    if (recieverConnId) {
        delete connections.recievers[recieverConnId];
        console.log(`Reciever disconnected from ${recieverConnId}`);
    }
};
wss.on("connection", (ws) => {
    console.log(`new connection : ${ws}`);
    ws.on("close", () => {
        removeConnection(ws);
    });
    ws.on("error", (err) => {
        console.error("websocket error : ", err);
        removeConnection(ws);
    });
    ws.on("message", (data) => {
        const message = JSON.parse(data);
        if (message.type === "sender") {
            const connId = (0, uuid_1.v4)();
            addSender(connId, ws);
            ws.send(JSON.stringify({ type: "connection-id", connId }));
            console.log(`sender created connId ${connId}`);
        }
        else if (message.type === "reciever") {
            if (!message.connId) {
                return ws.send(JSON.stringify({ error: "message must have a connId field." }));
            }
            const success = addReciever(message.connId, ws);
            if (!success) {
                return ws.send(JSON.stringify({ error: "invalid connection id" }));
            }
            console.log(`reciever added to connId ${message.connId}`);
        }
        else if (message.type === "create-offer") {
            if (!message.connId) {
                return ws.send(JSON.stringify({ error: "must include connection id to create offer" }));
            }
            if (!connections.senders[message.connId]) {
                return ws.send(JSON.stringify({ error: "must be a sender to create offer" }));
            }
            const recieverSocket = connections.recievers[message.connId];
            if (!recieverSocket) {
                return ws.send(JSON.stringify({ error: "reciever doesnt exist" }));
            }
            recieverSocket === null || recieverSocket === void 0 ? void 0 : recieverSocket.send(JSON.stringify({ type: "create-offer", offer: message.offer }));
            console.log(`offer sent from ${ws} to ${recieverSocket} on connection ${message.connId}`);
        }
        else if (message.type === "create-answer") {
            if (!message.connId) {
                return ws.send(JSON.stringify({ error: "must include connection id to create answer" }));
            }
            if (!connections.recievers[message.connId]) {
                return ws.send(JSON.stringify({ error: "must be a reciever to create answer" }));
            }
            const senderSocket = connections.senders[message.connId];
            if (!senderSocket) {
                return ws.send(JSON.stringify({ type: "invalid connection id" }));
            }
            senderSocket === null || senderSocket === void 0 ? void 0 : senderSocket.send(JSON.stringify({ type: "create-answer", offer: message.offer }));
            console.log(`answer sent from ${ws} to ${senderSocket} on connection ${message.connId}`);
        }
        else if (message.type === "ice-candidates") {
            if (!message.connId) {
                return ws.send(JSON.stringify({ error: "must include connection id to send ice candidates" }));
            }
            if (ws === connections.senders[message.connId]) {
                const recieverSocket = connections.recievers[message.connId];
                if (!recieverSocket) {
                    return ws.send(JSON.stringify({ error: "reciever doesnt exist" }));
                }
                recieverSocket === null || recieverSocket === void 0 ? void 0 : recieverSocket.send(JSON.stringify({ type: 'ice-candidates', candidates: message.candidates }));
            }
            else if (ws === connections.recievers[message.connId]) {
                const senderSocket = connections.senders[message.connId];
                if (!senderSocket) {
                    return ws.send(JSON.stringify({ error: "sender doesnt exist" }));
                }
                senderSocket === null || senderSocket === void 0 ? void 0 : senderSocket.send(JSON.stringify({ type: 'ice-candidates', candidates: message.candidates }));
            }
        }
        else {
            ws.send(JSON.stringify({ error: "invalid message type" }));
        }
    });
});
