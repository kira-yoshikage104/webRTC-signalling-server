import { WebSocketServer, WebSocket } from "ws"
import { v4 as uuid } from 'uuid'

const wss = new WebSocketServer({ port : 8080 })

interface WebSocketMessage {
    type : string;
    connId? : string;
    offer?: RTCSessionDescriptionInit;
    candidates?: RTCIceCandidateInit;
    error?: string
}

interface Connections {
    ids : string[];
    senders : Record<string, WebSocket>;
    recievers : Record<string, WebSocket>;
}

let connections : Connections = {
    ids : [],
    senders : {},
    recievers : {}
}

const addSender = (id : string, socket : WebSocket) => {
    connections.ids.push(id)
    connections.senders[id] = socket
}

const addReciever = (id : string, socket : WebSocket) => {
    if(!connections.senders[id]) {
        return false
    }
    connections.recievers[id] = socket
    return true
}

const removeConnection = (socket : WebSocket) => {
    const senderConnId = Object.entries(connections.senders).find(([_, senderEntry]) => socket === senderEntry)?.[0]
    const recieverConnId = Object.entries(connections.recievers).find(([_, recieverEntry]) => socket === recieverEntry)?.[0]

    if(senderConnId) {
        delete connections.senders[senderConnId]
        delete connections.recievers[senderConnId]
        connections.ids = connections.ids.filter(id => id !== senderConnId)
        console.log(`Sender disconnected from ${senderConnId}`)
    }

    if(recieverConnId) {
        delete connections.recievers[recieverConnId]
        console.log(`Reciever disconnected from ${recieverConnId}`)
    }
}

wss.on("connection", (ws : WebSocket) => {
    console.log(`new connection : ${ws}`)
    ws.on("close", () => {
        removeConnection(ws)
    })

    ws.on("error", (err) => {
        console.error("websocket error : ", err)
        removeConnection(ws)
    })

    ws.on("message", (data : string) => {
        const message : WebSocketMessage = JSON.parse(data)
        if(message.type === "sender") {
            const connId = uuid()
            addSender(connId, ws)
            ws.send(JSON.stringify({ type : "connection-id", connId }))
            // senderSocket = ws
            console.log(`sender created connId ${connId}`)
        } else if(message.type === "reciever") { 
            // recieverSocket = ws
            if(!message.connId) {
                return ws.send(JSON.stringify({ error : "message must have a connId field." }))
            }
            const success = addReciever(message.connId, ws)
            if(!success) {
                return ws.send(JSON.stringify({ error : "invalid connection id" }))
            }
            console.log(`reciever added to connId ${message.connId}`)
        } else if(message.type === "create-offer") { // message = { type : "create-offer", offer : sdp, connId : "somethins" }
            if(!message.connId) {
                return ws.send(JSON.stringify({ error : "must include connection id to create offer" }))
            }
            if(!connections.senders[message.connId]) {
                return ws.send(JSON.stringify({ error : "must be a sender to create offer" }))
            }
            const recieverSocket = connections.recievers[message.connId]
            if(!recieverSocket) {
                return ws.send(JSON.stringify({ error : "reciever doesnt exist" }))
            }
            recieverSocket?.send(JSON.stringify({ type : "create-offer", offer : message.offer }))
            console.log(`offer sent from ${ws} to ${recieverSocket} on connection ${message.connId}`)
        } else if(message.type === "create-answer") {
            if(!message.connId) {
                return ws.send(JSON.stringify({ error : "must include connection id to create answer" }))
            }
            if(!connections.recievers[message.connId]) {
                return ws.send(JSON.stringify({ error : "must be a reciever to create answer" }))
            }
            const senderSocket = connections.senders[message.connId]
            if(!senderSocket) {
                return ws.send(JSON.stringify({ type : "invalid connection id" }))
            }
            senderSocket?.send(JSON.stringify({ type : "create-answer", offer : message.offer }))
            console.log(`answer sent from ${ws} to ${senderSocket} on connection ${message.connId}`)
        } else if(message.type === "ice-candidates") {
            if(!message.connId) {
                return ws.send(JSON.stringify({ error : "must include connection id to send ice candidates" }))
            }
            if(ws === connections.senders[message.connId]) {
                const recieverSocket = connections.recievers[message.connId]
                if(!recieverSocket) {
                    return ws.send(JSON.stringify({ error : "reciever doesnt exist"}))
                }
                recieverSocket?.send(JSON.stringify({ type : 'ice-candidates', candidates : message.candidates }))
            } else if(ws === connections.recievers[message.connId]) {
                const senderSocket = connections.senders[message.connId]
                if(!senderSocket) {
                    return ws.send(JSON.stringify({ error : "sender doesnt exist" }))
                }
                senderSocket?.send(JSON.stringify({ type : 'ice-candidates', candidates : message.candidates }))
            }
        } else {
            ws.send(JSON.stringify({ error : "invalid message type" }))
        }
    })
})