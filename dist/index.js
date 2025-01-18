"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const ws_1 = require("ws");
const wss = new ws_1.WebSocketServer({ port: 8080 });
let senderSocket = null;
let recieverSocket = null;
wss.on("connection", (ws) => {
    ws.on("message", (data) => {
        const message = JSON.parse(data);
        if (message.type === "sender") {
            senderSocket = ws;
            console.log("sender set");
        }
        else if (message.type === "reciever") {
            recieverSocket = ws;
            console.log("reciever set");
        }
        else if (message.type === "create-offer" && ws === senderSocket) {
            recieverSocket === null || recieverSocket === void 0 ? void 0 : recieverSocket.send(JSON.stringify({ type: "create-offer", offer: message.offer }));
            console.log("offer sent");
        }
        else if (message.type === "create-answer" && ws === recieverSocket) {
            senderSocket === null || senderSocket === void 0 ? void 0 : senderSocket.send(JSON.stringify({ type: "create-answer", offer: message.offer }));
            console.log("answer sent");
        }
        else if (message.type === "ice-candidates") {
            if (ws === senderSocket) {
                recieverSocket === null || recieverSocket === void 0 ? void 0 : recieverSocket.send(JSON.stringify({ type: 'ice-candidates', candidates: message.candidates }));
            }
            else if (ws === recieverSocket) {
                senderSocket === null || senderSocket === void 0 ? void 0 : senderSocket.send(JSON.stringify({ type: 'ice-candidates', candidates: message.candidates }));
            }
        }
    });
});
