const { createServerFrom } = require('wss')


const rooms = [] 

function init (server) {
  let wss = createServerFrom(server)

  wss.on('connection', ws => {
    ws.id = new Date().getTime() + '.' + Math.random()
    send(ws, { type: 'connected', id: ws.id })
    console.log(ws.id, 'connect')

    ws.on('message', messageReceive)
    ws.onclose = disconnect
  })
}

function messageReceive (msg) {
  let data = JSON.parse(msg)
  switch (data.type) {
    case 'join':
      join(this, data)
      return
    case 'create': 
      create(this, data)
      return
  }

  if (this.room)
    return broadcastTo(this, data)
  
  send(this, { error: 'No such type' })
} 

function broadcastTo (ws, data) {
  if (ws.room) {
    if (!rooms[ws.room])
      return send(ws, { error: 'room not found' })
    // change type to from and add who its from 
    data.from = ws.id
    
    // send to all in room 
    let msg = JSON.stringify(data)
    for (let client of rooms[ws.room].clients)
      if (client.id !== ws.id) // except sender
        client.send(msg)

    return
  }

  // websocket has no room assigned
  send(ws, { error: 'No room assigned' })
}

function join (ws, data) {
  // disconnect from other room
  if (ws.room) {
    if (ws.room === data.room) 
      return send(ws, { type: 'error', error: 'You\'re already connected to this room'})
    disconnectRoom(ws)
  }

  // potential logic for rooms (like validation function etc [pass, amount of clients])
  let room = rooms[data.room]
  if (room) {
    let ans = room.validate(data)
    if (ans !== '')
      return send(ws, { type: 'error', error: ans })

    ws.room = data.room 
    room.level++
    broadcastTo(ws, { type: 'new client', id: ws.id, name: data.name, level: room.level })
    room.clients.push(ws)
    send(ws, { type: 'room connect', message : 'joined room', room: 
      { password: room.password, id: room.id, types: room.types }, level: room.level })
  }
  else send(ws, { type: 'error', error: 'room not found' })
}
function create (ws, data) {
  if (data.room === '') send(ws, { type: 'error', error : 'room must have a name' })
  else if (rooms[data.room] === undefined) {
    let room = {
      clients: [ws],
      id: data.room,
      level: 0,
      password: data.password,
      maxClients: data.max || 10,
      types: data.types || ['data'],
      validate: (data) => {
        let msg = ''
        if (data.password !== room.password) 
          msg = 'Invalid password'
        else if (room.clients.length >= room.maxClients)
          msg = 'Too many in room'
        
        return msg 
      }
    }
    // if any rooms are attached 
    if (ws.room !== undefined)
      disconnectRoom(ws)
    
    rooms[data.room] = room 
    ws.room = data.room
    ws.host = true 
    console.log(`room : ${data.room} was created`)
    send(ws, { type: 'room connect', message : 'created and joined room', room: 
      { password: room.password, id: room.id, types: room.types }, host: true, level: 0 })
  }
  else send(ws, { type: 'error', error : 'room already exist' })
}

function send (ws, data) {
  ws.send(JSON.stringify(data))
}

function disconnectRoom (ws) {
  if (!ws.room)
    return send(ws, { type: 'error', error: 'no room assigned'})
  if (!rooms[ws.room]) {
    send(ws, { type: 'error', error: 'room not found' }) 
    ws.room = undefined
    return 
  }
  broadcastTo(ws, { type: 'disconnect' })

  // remove from room
  rooms[ws.room].clients = rooms[ws.room].clients.filter(s => s.id !== ws.id)
  if (!ws.disconnect) send(ws, { type: 'room disconnect' })
  // if room is now empty remove it
  if (rooms[ws.room].clients.length === 0) {
    console.log(`room : ${ws.room} was deleted`)
    delete rooms[ws.room]
  } else if (ws.host) {
    rooms[ws.room].clients[0].host = true 
    send(rooms[ws.room].clients[0], { type: 'host' })
  }
}
function disconnect () {
  this.disconnect = true 
  if (this.room) 
    disconnectRoom(this)
}

module.exports = { init }