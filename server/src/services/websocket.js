import jwt from 'jsonwebtoken'
import { getESClient } from '../config/elasticsearch.js'
import User from '../models/User.js'

const LIVE_FEED_ROOMS = new Set(['soc', 'noc'])
const AUTHENTICATED_ROOM = 'authenticated'

function getRoomSize(io, room) {
  return io.sockets.adapter.rooms.get(room)?.size || 0
}

export function initWebSocket(io) {
  io.use(async (socket, next) => {
    try {
      const rawToken =
        socket.handshake.auth?.token ||
        socket.handshake.headers?.authorization?.replace('Bearer ', '')

      if (!rawToken) return next(new Error('Authentication required'))

      const decoded = jwt.verify(rawToken, process.env.JWT_SECRET)
      const user = await User.findById(decoded.id)
      if (!user || !user.active) return next(new Error('Unauthorized'))

      socket.user = {
        id: String(user._id),
        role: user.role,
      }

      next()
    } catch {
      next(new Error('Invalid token'))
    }
  })

  io.on('connection', socket => {
    socket.join(AUTHENTICATED_ROOM)
    console.log('Client connected:', socket.id, 'user:', socket.user?.id)

    socket.on('subscribe', payload => {
      const requestedRoom = payload?.channel || payload?.room || payload?.index
      if (!LIVE_FEED_ROOMS.has(requestedRoom)) return
      socket.join(requestedRoom)
      console.log(`${socket.id} subscribed to ${requestedRoom}`)
    })

    socket.on('disconnect', () => console.log('Client disconnected:', socket.id))
  })

  setInterval(async () => {
    try {
      const socListeners = getRoomSize(io, 'soc')
      const nocListeners = getRoomSize(io, 'noc')
      if (socListeners === 0 && nocListeners === 0) return

      const es = getESClient()
      const result = await es.search({
        index: 'firewall-*,cisco-*',
        body: {
          size: 10,
          sort: [{ '@timestamp': { order: 'desc' } }],
          query: { range: { '@timestamp': { gte: 'now-10s' } } },
          _source: [
            '@timestamp', '_index',
            'syslog_severity_label', 'cisco_severity_label',
            'fgt.action', 'fgt.srcip', 'fgt.dstip', 'fgt.srccountry', 'fgt.app', 'fgt.subtype', 'fgt.type', 'fgt.msg',
            'cisco_mnemonic', 'cisco_message', 'cisco_interface_full', 'cisco_vlan_id',
            'device_name', 'site_name',
          ],
        },
      })
      if (result.hits.hits.length > 0) {
        const events = result.hits.hits.map(h => ({ ...h._source, _index: h._index }))
        const socEvents = events.filter(event => event._index?.includes('firewall'))
        const nocEvents = events.filter(event => event._index?.includes('cisco'))

        if (socEvents.length > 0) io.to('soc').emit('live:events', socEvents)
        if (nocEvents.length > 0) io.to('noc').emit('live:events', nocEvents)
      }
    } catch (err) { console.error('websocket live feed error:', err.message) }
  }, 5000)
}
