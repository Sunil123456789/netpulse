import jwt from 'jsonwebtoken'
import { getESClient } from '../config/elasticsearch.js'
import User from '../models/User.js'
import { streamChat } from './ai/chat.js'
import { buildChatErrorPayload } from './ai/chatErrors.js'

const LIVE_FEED_ROOMS = new Set(['soc', 'noc'])
const AUTHENTICATED_ROOM = 'authenticated'
const activeChatStreams = new Map()

function getRoomSize(io, room) {
  return io.sockets.adapter.rooms.get(room)?.size || 0
}

function getChatStreamKey(socketId, requestId) {
  return `${socketId}:${requestId}`
}

function emitChatEvent(socket, event, requestId, payload = {}) {
  socket.emit(event, { requestId, ...payload })
}

function assertValidChatMessages(messages) {
  if (!Array.isArray(messages) || messages.length === 0) {
    throw new Error('messages array is required')
  }

  for (const msg of messages) {
    if (!msg?.role || !msg?.content) {
      throw new Error('Each message must have role and content')
    }
    if (!['user', 'assistant'].includes(msg.role)) {
      throw new Error('Message role must be user or assistant')
    }
  }
}

async function handleChatStream(socket, payload = {}) {
  const requestId = String(payload.requestId || '').trim()
  if (!requestId) {
    emitChatEvent(socket, 'ai:chat:error', null, {
      code: 'bad_request',
      error: 'requestId is required',
    })
    return
  }

  try {
    assertValidChatMessages(payload.messages)
  } catch (err) {
    emitChatEvent(socket, 'ai:chat:error', requestId, {
      code: 'bad_request',
      error: err.message,
    })
    return
  }

  const key = getChatStreamKey(socket.id, requestId)
  activeChatStreams.get(key)?.abort()

  const controller = new AbortController()
  activeChatStreams.set(key, controller)
  console.log('AI chat stream started:', {
    requestId,
    socketId: socket.id,
    userId: socket.user?.id,
    provider: payload.provider || 'task-config',
    model: payload.model || 'auto',
    context: payload.context || 'all',
  })
  emitChatEvent(socket, 'ai:chat:stage', requestId, {
    stage: 'queued',
    message: 'Preparing request...',
  })

  try {
    const result = await streamChat({
      messages: payload.messages,
      context: payload.context || 'all',
      dateRange: payload.dateRange || null,
      overrideProvider: payload.provider || null,
      overrideModel: payload.model || null,
      signal: controller.signal,
      onStage: (stage, message) => emitChatEvent(socket, 'ai:chat:stage', requestId, { stage, message }),
      onToken: delta => emitChatEvent(socket, 'ai:chat:chunk', requestId, { delta }),
    })

    if (!controller.signal.aborted) {
      console.log('AI chat stream completed:', {
        requestId,
        socketId: socket.id,
        provider: result.provider,
        model: result.model,
        responseTimeMs: result.responseTimeMs,
      })
      emitChatEvent(socket, 'ai:chat:done', requestId, result)
    }
  } catch (err) {
    const aborted = controller.signal.aborted || err?.name === 'AbortError'
    const payload = aborted
      ? {
          code: 'aborted',
          kind: 'canceled',
          error: 'Request canceled',
          message: 'Request canceled',
        }
      : buildChatErrorPayload(err)
    console.error('AI chat stream failed:', {
      requestId,
      socketId: socket.id,
      aborted,
      error: payload.error,
      kind: payload.kind,
      provider: payload.provider,
      model: payload.model,
      timeoutMs: payload.timeoutMs,
    })
    emitChatEvent(socket, 'ai:chat:error', requestId, {
      code: aborted ? 'aborted' : (payload.kind || 'chat_failed'),
      ...payload,
    })
  } finally {
    activeChatStreams.delete(key)
  }
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

    socket.on('ai:chat:start', payload => {
      handleChatStream(socket, payload).catch(err => {
        const requestId = String(payload?.requestId || '').trim() || null
        const chatPayload = buildChatErrorPayload(err)
        emitChatEvent(socket, 'ai:chat:error', requestId, {
          code: chatPayload.kind || 'chat_failed',
          ...chatPayload,
        })
      })
    })

    socket.on('ai:chat:cancel', payload => {
      const requestId = String(payload?.requestId || '').trim()
      if (!requestId) return
      activeChatStreams.get(getChatStreamKey(socket.id, requestId))?.abort()
    })

    socket.on('disconnect', () => {
      for (const [key, controller] of activeChatStreams.entries()) {
        if (key.startsWith(`${socket.id}:`)) {
          controller.abort()
          activeChatStreams.delete(key)
        }
      }
      console.log('Client disconnected:', socket.id)
    })
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
