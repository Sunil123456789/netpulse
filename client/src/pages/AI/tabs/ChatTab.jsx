import { useEffect, useRef, useState } from 'react'
import { aiAPI } from '../../../api/ai.js'
import { C, CTX_OPTIONS, selSx } from '../constants'
import { ProviderBadge } from '../components/Common.jsx'
import { MeteringRow, StructuredResponse, TaskShell } from '../components/TaskSupport.jsx'
import { useChatSession } from '../hooks/useChatSession.js'

const CHAT_SUGGESTIONS = [
  'Any anomalies right now?',
  'Top threats today',
  'How many events last hour?',
  'Which hosts are down?',
  'Summarize network status',
  'Any brute force attempts?',
]

function ChatBubble({ msg, onCopy, onRetry, onCancel }) {
  const isUser = msg.role === 'user'
  const [rated, setRated] = useState(false)
  const [hoveredStar, setHoveredStar] = useState(null)

  async function handleRate(star) {
    if (!msg.scoreId || rated) return
    try {
      await aiAPI.rateResponse(msg.scoreId, star)
      setRated(true)
    } catch {}
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: isUser ? 'row-reverse' : 'row',
        gap: 10,
        alignItems: 'flex-start',
        marginBottom: 14,
      }}
    >
      <div
        style={{
          width: 30,
          height: 30,
          borderRadius: 8,
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 14,
          background: isUser ? `${C.accent}22` : `${C.accent2}22`,
          border: `1px solid ${isUser ? C.accent : C.accent2}33`,
        }}
      >
        {isUser ? '👤' : '🤖'}
      </div>

      <div
        style={{
          maxWidth: isUser ? '70%' : '85%',
          minWidth: 60,
          marginLeft: isUser ? 'auto' : undefined,
          background: isUser ? `${C.accent}14` : 'var(--bg3)',
          border: `1px solid ${isUser ? `${C.accent}30` : 'var(--border)'}`,
          borderLeft: isUser ? undefined : `3px solid ${C.accent2}`,
          borderRadius: isUser ? '12px 4px 12px 12px' : '4px 12px 12px 12px',
          padding: '10px 14px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 10, color: C.text3, fontFamily: 'var(--mono)' }}>
            {isUser ? 'You' : 'NetPulse AI'}
          </span>
          {!isUser && msg.provider && <ProviderBadge provider={msg.provider} />}
          <span style={{ fontSize: 9, color: C.text3, fontFamily: 'var(--mono)', marginLeft: 'auto' }}>
            {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
          {!isUser && !msg.pending && msg.status !== 'canceled' && msg.content && (
            <button onClick={() => onCopy(msg.content)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: C.text3, padding: 0, lineHeight: 1 }} title="Copy">
              ⧉
            </button>
          )}
        </div>

        {isUser ? (
          <div
            style={{
              fontSize: 12,
              color: C.text,
              lineHeight: 1.6,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              fontFamily: 'var(--mono)',
            }}
          >
            {msg.content}
          </div>
        ) : msg.pending ? (
          <TaskShell
            title={msg.provider ? `Streaming from ${msg.provider}` : 'Generating response'}
            loading
            steps={['Preparing request...', 'Collecting network context...', 'Running model...', 'Formatting response...']}
            stageLabel={msg.stageLabel}
            startedAt={msg.startedAt}
            onCancel={onCancel}
            compact
          />
        ) : msg.isError ? (
          <TaskShell
            title="Response failed"
            error={msg.error || { kind: 'generic', message: msg.content || 'Response failed' }}
            onRetry={onRetry}
            compact
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <MeteringRow
              metering={msg.metering}
              provider={msg.provider}
              model={msg.model}
              responseTimeMs={msg.responseTimeMs}
              totalScore={msg.totalScore}
            />
            <StructuredResponse display={msg.display} fallbackText={msg.content} compact />
            {msg.status === 'canceled' && (
              <div style={{ fontSize: 10, color: C.amber, fontFamily: 'var(--mono)' }}>
                Response canceled before completion
              </div>
            )}
          </div>
        )}

        {!isUser && msg.scoreId && (
          <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
            {rated ? (
              <span style={{ fontSize: 10, color: C.green, fontFamily: 'var(--mono)' }}>Thanks for rating!</span>
            ) : (
              <>
                <span style={{ fontSize: 10, color: C.text3, fontFamily: 'var(--mono)' }}>Rate this response:</span>
                {[1, 2, 3, 4, 5].map(star => (
                  <button
                    key={star}
                    onMouseEnter={() => setHoveredStar(star)}
                    onMouseLeave={() => setHoveredStar(null)}
                    onClick={() => handleRate(star)}
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      fontSize: 15,
                      padding: '0 1px',
                      lineHeight: 1,
                      opacity: hoveredStar != null ? (star <= hoveredStar ? 1 : 0.3) : 0.3,
                      filter: hoveredStar != null && star <= hoveredStar ? 'none' : 'grayscale(1)',
                      transition: 'all 0.1s',
                    }}
                  >
                    ⭐
                  </button>
                ))}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default function ChatTab({ providerStatus, ollamaStatus, range, addToast }) {
  const bottomRef = useRef(null)
  const inputRef = useRef(null)
  const {
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
    sendMessage,
    retryLastMessage,
    cancelActiveResponse,
    clearChat,
  } = useChatSession({
    range,
    providerStatus,
    ollamaStatus,
    addToast,
  })

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  function copyText(text) {
    navigator.clipboard.writeText(text).catch(() => {})
    addToast('Copied to clipboard', 'success')
  }

  async function handleSendMessage(text) {
    const sent = await sendMessage(text)
    if (sent) {
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }

  function handleClearChat() {
    clearChat()
    inputRef.current?.focus()
  }

  const welcomeState = (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 10, color: C.text3, padding: 32 }}>
      <div style={{ fontSize: 48 }}>🤖</div>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 15, color: C.text, fontWeight: 600 }}>Hello! I am NetPulse AI</div>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 12, color: C.text2, textAlign: 'center', maxWidth: 420, lineHeight: 1.7 }}>
        I can analyze your security events, network health, and infrastructure status.
      </div>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: C.text3 }}>
        Ask me anything about your network.
      </div>
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', marginBottom: 8, borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 10, color: C.text3, fontFamily: 'var(--mono)', whiteSpace: 'nowrap' }}>Context:</span>
        <select value={chatContext} onChange={e => setChatContext(e.target.value)} style={selSx}>
          {CTX_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>

        <div style={{ width: 1, height: 16, background: 'var(--border)' }} />

        <span style={{ fontSize: 10, color: C.text3, fontFamily: 'var(--mono)', whiteSpace: 'nowrap' }}>Provider:</span>
        <select
          value={chatProvider || 'default'}
          onChange={e => {
            setChatProvider(e.target.value === 'default' ? null : e.target.value)
            setChatModel(null)
          }}
          style={selSx}
        >
          <option value="default">Use Task Config</option>
          {availableProviders.map(p => <option key={p} value={p}>{p}</option>)}
        </select>

        {chatProvider && (
          <>
            <span style={{ fontSize: 10, color: C.text3, fontFamily: 'var(--mono)', whiteSpace: 'nowrap' }}>Model:</span>
            <select
              value={chatModel || 'auto'}
              onChange={e => setChatModel(e.target.value === 'auto' ? null : e.target.value)}
              style={selSx}
            >
              <option value="auto">auto</option>
              {overrideModels.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </>
        )}

        <div style={{ flex: 1 }} />

        <span style={{ fontSize: 10, color: socketReady ? C.green : C.amber, fontFamily: 'var(--mono)', background: socketReady ? 'rgba(34,211,160,0.12)' : 'rgba(245,166,35,0.12)', border: `1px solid ${socketReady ? 'rgba(34,211,160,0.3)' : 'rgba(245,166,35,0.3)'}`, padding: '3px 10px', borderRadius: 20 }}>
          {socketReady ? 'Streaming ready' : 'Buffered fallback'}
        </span>

        {lastScore != null && (
          <span
            style={{
              fontSize: 10,
              padding: '3px 10px',
              borderRadius: 20,
              fontFamily: 'var(--mono)',
              fontWeight: 600,
              background: lastScore >= 7 ? 'rgba(34,211,160,0.12)' : lastScore >= 5 ? 'rgba(245,166,35,0.12)' : 'rgba(245,83,79,0.12)',
              color: lastScore >= 7 ? C.green : lastScore >= 5 ? C.amber : C.red,
              border: `1px solid ${lastScore >= 7 ? 'rgba(34,211,160,0.3)' : lastScore >= 5 ? 'rgba(245,166,35,0.3)' : 'rgba(245,83,79,0.3)'}`,
            }}
          >
            Score: {lastScore}/10
          </span>
        )}

        <button
          onClick={handleClearChat}
          disabled={messages.length === 0}
          style={{ fontSize: 10, padding: '4px 12px', borderRadius: 5, border: '1px solid var(--border)', background: 'var(--bg4)', color: C.text3, cursor: messages.length ? 'pointer' : 'not-allowed', fontFamily: 'var(--mono)' }}
        >
          Clear chat
        </button>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
        {CHAT_SUGGESTIONS.map(q => (
          <button
            key={q}
            onClick={() => handleSendMessage(q)}
            disabled={loading}
            style={{
              fontSize: 11,
              padding: '5px 12px',
              borderRadius: 20,
              border: '1px solid var(--border)',
              background: 'var(--bg3)',
              color: C.text2,
              cursor: loading ? 'not-allowed' : 'pointer',
              fontFamily: 'var(--mono)',
              opacity: loading ? 0.5 : 1,
              transition: 'border-color 0.15s, color 0.15s',
            }}
          >
            {q}
          </button>
        ))}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', background: 'var(--bg2)', borderRadius: 12, padding: 14, minHeight: 400 }}>
        {messages.length === 0 && !loading ? (
          welcomeState
        ) : (
          <div style={{ paddingBottom: 8 }}>
            {messages.map((m, i) => (
              <ChatBubble
                key={m.id || i}
                msg={m}
                onCopy={copyText}
                onRetry={retryLastMessage}
                onCancel={cancelActiveResponse}
              />
            ))}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12, flexShrink: 0 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                handleSendMessage(input)
              }
            }}
            placeholder="Ask anything about your network..."
            rows={2}
            disabled={loading}
            style={{
              flex: 1,
              background: 'var(--bg3)',
              border: '1px solid var(--border)',
              color: C.text,
              borderRadius: 8,
              padding: '10px 12px',
              fontSize: 12,
              fontFamily: 'inherit',
              resize: 'none',
              outline: 'none',
              lineHeight: 1.5,
              opacity: loading ? 0.7 : 1,
            }}
          />
          <button
            onClick={() => (loading ? cancelActiveResponse() : handleSendMessage(input))}
            disabled={!input.trim() && !loading}
            style={{
              padding: '10px 20px',
              borderRadius: 8,
              border: 'none',
              height: 44,
              background: (!input.trim() && !loading) ? 'var(--bg4)' : loading ? C.red : C.accent2,
              color: (!input.trim() && !loading) ? C.text3 : '#fff',
              cursor: (!input.trim() && !loading) ? 'not-allowed' : 'pointer',
              fontFamily: 'var(--mono)',
              fontSize: loading ? 12 : 16,
              fontWeight: 600,
              transition: 'all 0.15s',
              alignSelf: 'flex-end',
            }}
          >
            {loading ? 'Stop' : '➤'}
          </button>
        </div>
        <div style={{ fontSize: 10, color: C.text3, fontFamily: 'var(--mono)', marginTop: 6 }}>
          Enter to send · Shift+Enter for newline · {messages.filter(m => m.role === 'assistant').length} AI responses
        </div>
      </div>
    </div>
  )
}
