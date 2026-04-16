import { useState } from 'react'
import { aiAPI } from '../../../api/ai.js'
import { buildDateRange, getProviderOverrideModels, getReadyProviders } from '../utils/common.js'

export function useChatSession({ range, providerStatus, ollamaStatus, addToast }) {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [chatContext, setChatContext] = useState('all')
  const [chatProvider, setChatProvider] = useState(null)
  const [chatModel, setChatModel] = useState(null)
  const [lastScore, setLastScore] = useState(null)

  const availableProviders = getReadyProviders(providerStatus)
  const overrideModels = getProviderOverrideModels(chatProvider, providerStatus, ollamaStatus)
  const activeProvider = chatProvider ||
    (providerStatus ? Object.entries(providerStatus).find(([, value]) => value.ready)?.[0] : null)

  async function sendMessage(text) {
    if (!text.trim() || loading) return false

    const userMsg = { role: 'user', content: text, timestamp: new Date().toISOString() }
    const nextMessages = [...messages, userMsg]

    setMessages(nextMessages)
    setInput('')
    setLoading(true)

    try {
      const apiMsgs = nextMessages.map(msg => ({ role: msg.role, content: msg.content }))
      const { data } = await aiAPI.chat(
        apiMsgs,
        chatContext,
        buildDateRange(range),
        chatProvider || undefined,
        chatModel || undefined,
      )

      setMessages(prev => [...prev, {
        role: 'assistant',
        content: data.response || data.content || '(no response)',
        timestamp: new Date().toISOString(),
        provider: data.provider,
        model: data.model,
        responseTimeMs: data.responseTimeMs,
        totalScore: data.totalScore,
        scoreId: data.scoreId,
      }])
      setLastScore(data.totalScore)
      return true
    } catch (err) {
      addToast(err.response?.data?.error || err.message, 'error')
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `Error: ${err.response?.data?.error || err.message}`,
        timestamp: new Date().toISOString(),
        isError: true,
      }])
      return false
    } finally {
      setLoading(false)
    }
  }

  function clearChat() {
    setMessages([])
    setLastScore(null)
  }

  return {
    messages,
    input,
    setInput,
    loading,
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
    clearChat,
  }
}
