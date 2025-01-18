import { WebSocketServer, WebSocket } from "ws"

const wss = new WebSocketServer({ port : 8080 })

let senderSocket : null | WebSocket = null
let recieverSocket : null | WebSocket = null

wss.on("connection", (ws) => {
    ws.on("message", (data : any) => {
        const message = JSON.parse(data)
        if(message.type === "sender") {
            senderSocket = ws
            console.log("sender set")
        } else if(message.type === "reciever") {
            recieverSocket = ws
            console.log("reciever set")
        } else if(message.type === "create-offer" && ws === senderSocket) {
            recieverSocket?.send(JSON.stringify({ type : "create-offer", offer : message.offer }))
            console.log("offer sent")
        } else if(message.type === "create-answer" && ws === recieverSocket) {
            senderSocket?.send(JSON.stringify({ type : "create-answer", offer : message.offer }))
            console.log("answer sent")
        } else if(message.type === "ice-candidates") {
            if(ws === senderSocket) {
                recieverSocket?.send(JSON.stringify({ type : 'ice-candidates', candidates : message.candidates }))
            } else if(ws === recieverSocket) {
                senderSocket?.send(JSON.stringify({ type : 'ice-candidates', candidates : message.candidates }))
            }
        }
    })
})