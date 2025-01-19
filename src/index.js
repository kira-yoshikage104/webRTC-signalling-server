import { WebSocketServer, WebSocket } from "ws"
import { v4 as uuid } from 'uuid'

const wss = new WebSocketServer({ port : 8080 })

const userIdToWebSocket = new Map()
const webSocketToUserId = new Map()

const addUser = (socket) => {
    const userId = uuid()
    userIdToWebSocket.set(userId, socket)
    webSocketToUserId.set(socket, userId)
    console.log(`new user : ${userId}`)
}

const removeUser = (socket) => {
    const userId = webSocketToUserId.get(socket)
    if(userId) {
        userIdToWebSocket.delete(userId)
        webSocketToUserId.delete(socket)
    }
}

const rooms = new Map() //hostId to member Id

const createRoom = (hostSocket) => {
    const hostId = webSocketToUserId.get(hostSocket)
    rooms.set(hostId, [])
    return hostId
}

const joinRoom = (memberSocket, hostId) => {
    const memberId = webSocketToUserId.get(memberSocket)
    if(!rooms.has(hostId)) {
        return memberSocket.send(JSON.stringify({ error : "invalid id" }))
    }
    rooms.get(hostId).push(memberId)
    console.log(`member ${memberId} joined room ${hostId}`)
}

wss.on("connection", (ws) => {
    addUser(ws)
    
    ws.on("close", () => {
        removeUser(ws)
    })

    ws.on("error", (err) => {
        console.error("websocket error : ", err)
        removeConnection(ws)
    })

    ws.on("message", (data ) => {
        const message  = JSON.parse(data)
        if(message.type === "create-room") {
            const hostId = createRoom(ws)
            ws.send(JSON.stringify({ type : "host-id", hostId })) 
            console.log(`user created room ${hostId}`)
        } 
        else if(message.type === "join-room") { 
            const hostId = message.hostId 
            joinRoom(ws, hostId)
            const hostSocket = userIdToWebSocket.get(hostId)
            const memberId = webSocketToUserId.get(ws)
            if(!message.offer) {
                return ws.send(JSON.stringify({ error : "must send offer" }))
            }
            hostSocket.send(JSON.stringify({ type: "new-member", username : memberId, offer : message.offer }))
        }else if(message.type === "create-answer") {
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