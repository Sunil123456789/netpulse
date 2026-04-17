import { useEffect, useRef, useState } from 'react'
import { io } from 'socket.io-client'
import { useAuthStore } from '../../../store/authStore'
import { aiAPI, describeAIRequestError } from '../../../api/ai.js'
import { getSocketUrl } from '../../../config/runtime.js'
import { buildDateRange, getProviderOverrideModels, getReadyProviders } from '../utils/common.js'

const FALLBACK_STAGES = [
  'Collecting network context...',
  'Running model...',
  'Formatting response...',
]

function updateMessageById(messages, id, updater) {
  return messages.map(message => (message.id === id ? updater(message) : message))
}

function buildConversationMessages(messages, userMessage) {
  return [...messages, userMessage]
    .filter(message => message.role && !message.pending && !message.isError && message.status !== 'canceled')
    .map(message => ({ role: message.role, content: message.content }))
}

export function useChatSession({ range, providerStatus, ollamaStatus, addToast }) {
  const token = useAuthStore(s => s.token)
  const socketRef = useRef(null)
  const activeRequestRef = useRef(null)
  const fallbackAbortRef = useRef(null)
  const lastFailedRequestRef = useRef(null)

  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [chatContext, setChatContext] = useState('all')
  const [chatProvider, setChatProvider] = useState(null)
  const [chatModel, setChatModel] = useState(null)
  const [lastScore, setLastScore] = useState(null)
  const [socketReady, setSocketReady] = useState(false)

  const availableProviders = getReadyProviders(providerStatus)
  const overrideModels = getProviderOverrideModels(chatProvider, providerStatus, ollamaStatus)
  const activeProvider = chatProvider ||
    (providerStatus ? Object.entries(providerStatus).find(([, value]) => value.ready)?.[0] : null)

  useEffect(() => {
    if (!token) return undefined

    const socket = io(getSocketUrl(), {
      auth: { token },
      reconnectionDelay: 2000,
    })

    socketRef.current = socket
    socket.on('connect', () => setSocketReady(true))
    socket.on('disconnect', () => setSocketReady(false))
    socket.on('connect_error', () => setSocketReady(false))

    socket.on('ai:chat:stage', payload => {
      if (!payload?.requestId) return
      setMessages(prev => updateMessageById(prev, payload.requestId, message => ({
        ...message,
        stageLabel: payload.message || message.stageLabel,
      })))
    })

    socket.on('ai:chat:chunk', payload => {
      if (!payload?.requestId) return
      setMessages(prev => updateMessageById(prev, payload.requestId, message => ({
        ...message,
        content: `${message.content || ''}${payload.delta || ''}`,
      })))
    })

    socket.on('ai:chat:done', payload => {
      if (!payload?.requestId) return

      activeRequestRef.current = null
      lastFailedRequestRef.current = null
      setLoading(false)
      setLastScore(payload.totalScore ?? null)
      setMessages(prev => updateMessageById(prev, payload.requestId, message => ({
        ...message,
        pending: false,
        stageLabel: null,
        content: payload.response || payload.content || message.content || '(no response)',
        provider: payload.provider,
        model: payload.model,
        responseTimeMs: payload.responseTimeMs,
        totalScore: payload.totalScore,
        scoreId: payload.scoreId,
        display: payload.display,
        metering: payload.metering,
        timestamp: new Date().toISOString(),
      })))
    })

    socket.on('ai:chat:error', payload => {
      if (!payload?.requestId) return

      const error = payload.code === 'aborted'
        ? { kind: 'canceled', message: 'Request canceled' }
        : describeAIRequestError({ message: payload.error }, 'Chat failed')
      const retryText = activeRequestRef.current?.retryText || ''

      activeRequestRef.current = null
      setLoading(false)

      if (error.kind === 'canceled') {
        setMessages(prev => updateMessageById(prev, payload.requestId, message => (
          message.content
            ? { ...message, pending: false, status: 'canceled', stageLabel: null }
            : { ...message, pending: false, status: 'canceled', stageLabel: null }
        )))
        return
      }

      lastFailedRequestRef.current = { text: retryText }
      addToast(error.message, 'error')
      setMessages(prev => updateMessageById(prev, payload.requestId, message => ({
        ...message,
        pending: false,
        isError: true,
        error,
        stageLabel: null,
        content: message.content || error.message,
      })))
    })

    return () => {
      socket.disconnect()
      socketRef.current = null
      setSocketReady(false)
    }
  }, [token, addToast])

  useEffect(() => () => {
    const active = activeRequestRef.current
    if (!active) return

    if (active.fallback) {
      fallbackAbortRef.current?.abort()
    } else if (active.requestId) {
      socketRef.current?.emit('ai:chat:cancel', { requestId: active.requestId })
    }

    activeRequestRef.current = null
  }, [])

  async function runBufferedChat({ requestId, apiMessages, retryText }) {
    const controller = new AbortController()
    fallbackAbortRef.current = controller
    activeRequestRef.current = { requestId, retryText, fallback: true }

    let stageIndex = 0
    setMessages(prev => updateMessageById(prev, requestId, message => ({
      ...message,
      stageLabel: FALLBACK_STAGES[stageIndex],
    })))
    const stageTimer = window.setInterval(() => {
      stageIndex = Math.min(stageIndex + 1, FALLBACK_STAGES.length - 1)
      setMessages(prev => updateMessageById(prev, requestId, message => ({
        ...message,
        stageLabel: FALLBACK_STAGES[stageIndex],
      })))
    }, 3500)

    try {
      const { data } = await aiAPI.chat(
        apiMessages,
        chatContext,
        buildDateRange(range),
        chatProvider || undefined,
        chatModel || undefined,
        { signal: controller.signal }
      )

      lastFailedRequestRef.current = null
      setLastScore(data.totalScore ?? null)
      setMessages(prev => updateMessageById(prev, requestId, message => ({
        ...message,
        pending: false,
        stageLabel: null,
        content: data.response || data.content || '(no response)',
        provider: data.provider,
        model: data.model,
        responseTimeMs: data.responseTimeMs,
        totalScore: data.totalScore,
        scoreId: data.scoreId,
        display: data.display,
        metering: data.metering,
      })))
      return true
    } catch (err) {
      const error = describeAIRequestError(err, 'Chat failed')

      if (error.kind !== 'canceled') {
        lastFailedRequestRef.current = { text: retryText }
        addToast(error.message, 'error')
        setMessages(prev => updateMessageById(prev, requestId, message => ({
          ...message,
          pending: false,
          isError: true,
          error,
          stageLabel: null,
          content: message.content || error.message,
        })))
      } else {
        setMessages(prev => updateMessageById(prev, requestId, message => ({
          ...message,
          pending: false,
          status: 'canceled',
          stageLabel: null,
        })))
      }

      return false
    } finally {
      window.clearInterval(stageTimer)
      if (activeRequestRef.current?.requestId === requestId) activeRequestRef.current = null
      fallbackAbortRef.current = null
      setLoading(false)
    }
  }

  async function sendMessage(text) {
    const question = text.trim()
    if (!question || loading) return false

    const timestamp = new Date().toISOString()
    const userMsg = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: question,
      timestamp,
    }
    const requestId = `assistant-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const assistantMsg = {
      id: requestId,
      role: 'assistant',
      content: '',
      timestamp,
      pending: true,
      stageLabel: 'Preparing request...',
      provider: activeProvider,
      startedAt: Date.now(),
    }
    const apiMessages = buildConversationMessages(messages, userMsg)

    setMessages(prev => [...prev, userMsg, assistantMsg])
    setInput('')
    setLoading(true)

    lastFailedRequestRef.current = null

    const requestPayload = {
      requestId,
      messages: apiMessages,
      context: chatContext,
      dateRange: buildDateRange(range),
      provider: chatProvider || undefined,
      model: chatModel || undefined,
    }

    if (socketRef.current?.connected) {
      activeRequestRef.current = { requestId, retryText: question, fallback: false }
      socketRef.current.emit('ai:chat:start', requestPayload)
      return true
    }

    return await runBufferedChat({
      requestId,
      apiMessages,
      retryText: question,
    })
  }

  async function retryLastMessage() {
    const retryText = lastFailedRequestRef.current?.text
    if (!retryText || loading) return false
    return await sendMessage(retryText)
  }

  function cancelActiveResponse() {
    const active = activeRequestRef.current
    if (!active) return

    if (active.fallback) {
      fallbackAbortRef.current?.abort()
    } else {
      socketRef.current?.emit('ai:chat:cancel', { requestId: active.requestId })
    }

    activeRequestRef.current = null
    setLoading(false)
    setMessages(prev => updateMessageById(prev, active.requestId, message => ({
      ...message,
      pending: false,
      status: 'canceled',
      stageLabel: null,
    })))
  }

  function clearChat() {
    cancelActiveResponse()
    setMessages([])
    setLastScore(null)
    lastFailedRequestRef.current = null
  }

  return {
    messages,
    input,
    setInput,
    loading,
    socketReady,
    chatContext,
    setChatContext,
    chatProvider,
    setChatProvider,
    chatModel,
    setChatModel,
    lastScore,
    availableProviders,
    overrideModels,
    activeProvider,
    sendMessage,
    retryLastMessage,
    cancelActiveResponse,
    clearChat,
  }
}
