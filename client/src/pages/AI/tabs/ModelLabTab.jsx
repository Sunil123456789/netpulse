import { useEffect, useRef, useState } from 'react'
import { aiAPI } from '../../../api/ai.js'
import { C, CTX_OPTIONS, selSx } from '../constants'
import { Card, ProviderBadge } from '../components/Common.jsx'
import { buildDateRange, formatTimestamp, getProviderOverrideModels } from '../utils/common.js'

const MODEL_LAB_SUGGESTIONS = [
  'Summarize the current network risk posture',
  'What needs urgent action right now?',
  'Which security events look most concerning today?',
  'Give me an executive summary of the last 24 hours',
]

function ModelLabResponseCard({ result, isWinner, rated, hoveredStar, setHoveredStar, onRate }) {
  const score = result?.totalScore
  const scoreBg = score >= 7 ? 'rgba(34,211,160,0.12)' : score >= 5 ? 'rgba(245,166,35,0.12)' : 'rgba(245,83,79,0.12)'
  const scoreColor = score >= 7 ? C.green : score >= 5 ? C.amber : C.red
  const scoreBorder = score >= 7 ? 'rgba(34,211,160,0.3)' : score >= 5 ? 'rgba(245,166,35,0.3)' : 'rgba(245,83,79,0.3)'

  return (
    <div
      style={{
        background: 'var(--bg3)',
        border: '1px solid var(--border)',
        borderLeft: `4px solid ${isWinner ? C.green : C.accent2}`,
        borderRadius: 10,
        overflow: 'hidden',
        boxShadow: isWinner ? '0 0 0 1px rgba(34,211,160,0.18)' : 'none',
      }}
    >
      <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <ProviderBadge provider={result.provider} />
        <span style={{ fontSize: 10, color: C.text3, fontFamily: 'var(--mono)', background: 'var(--bg4)', padding: '2px 8px', borderRadius: 5 }}>
          {result.model}
        </span>
        {isWinner && (
          <span style={{ fontSize: 10, color: C.green, fontFamily: 'var(--mono)', fontWeight: 700, marginLeft: 'auto' }}>
            WINNER
          </span>
        )}
      </div>

      <div style={{ padding: '14px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {result.error ? (
          <div style={{ fontSize: 12, color: C.red, lineHeight: 1.7 }}>{result.error}</div>
        ) : (
          <>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
              {result.responseTimeMs != null && (
                <span style={{ fontSize: 10, color: C.text3, fontFamily: 'var(--mono)' }}>
                  {(result.responseTimeMs / 1000).toFixed(1)}s
                </span>
              )}
              {result.tokensUsed != null && (
                <span style={{ fontSize: 10, color: C.text3, fontFamily: 'var(--mono)' }}>
                  {result.tokensUsed} tokens
                </span>
              )}
              {score != null && (
                <span
                  style={{
                    fontSize: 10,
                    padding: '2px 9px',
                    borderRadius: 10,
                    fontFamily: 'var(--mono)',
                    fontWeight: 600,
                    background: scoreBg,
                    color: scoreColor,
                    border: `1px solid ${scoreBorder}`,
                  }}
                >
                  Score: {score}/10
                </span>
              )}
            </div>

            <div style={{ fontSize: 12, color: C.text, lineHeight: 1.75, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
              {result.response || '(no response)'}
            </div>

            {result.scoreId && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                {rated ? (
                  <span style={{ fontSize: 10, color: C.green, fontFamily: 'var(--mono)' }}>Thanks for rating!</span>
                ) : (
                  <>
                    <span style={{ fontSize: 10, color: C.text3, fontFamily: 'var(--mono)' }}>Rate:</span>
                    {[1, 2, 3, 4, 5].map(star => (
                      <button
                        key={star}
                        onMouseEnter={() => setHoveredStar(star)}
                        onMouseLeave={() => setHoveredStar(null)}
                        onClick={() => onRate(star)}
                        style={{
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          fontSize: 15,
                          padding: '0 1px',
                          lineHeight: 1,
                          opacity: hoveredStar != null ? (star <= hoveredStar ? 1 : 0.3) : 0.3,
                          filter: hoveredStar != null && star <= hoveredStar ? 'none' : 'grayscale(1)',
                        }}
                      >
                        ⭐
                      </button>
                    ))}
                  </>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

export default function ModelLabTab({ providerStatus, ollamaStatus, range, addToast }) {
  const [question, setQuestion] = useState('')
  const [labContext, setLabContext] = useState('all')
  const [modelLabLoading, setModelLabLoading] = useState(false)
  const [comparisonResult, setComparisonResult] = useState(null)
  const [comparisonHistory, setComparisonHistory] = useState([])
  const [ratedScores, setRatedScores] = useState({})
  const [hoveredStars, setHoveredStars] = useState({})
  const [modelOverrides, setModelOverrides] = useState({ claude: 'auto', openai: 'auto', ollama: 'auto' })
  const inputRef = useRef(null)

  useEffect(() => {
    aiAPI.getRecentScores('comparison').then(r => setComparisonHistory(r.data || [])).catch(() => {})
  }, [])

  const providerModels = {
    claude: getProviderOverrideModels('claude', providerStatus, ollamaStatus),
    openai: getProviderOverrideModels('openai', providerStatus, ollamaStatus),
    ollama: getProviderOverrideModels('ollama', providerStatus, ollamaStatus),
  }

  async function runComparison(text = question) {
    const prompt = text.trim()
    if (!prompt || modelLabLoading) return
    setModelLabLoading(true)
    setRatedScores({})
    try {
      const { data } = await aiAPI.compareModels(
        prompt,
        labContext,
        buildDateRange(range),
        {
          claude: modelOverrides.claude === 'auto' ? null : modelOverrides.claude,
          openai: modelOverrides.openai === 'auto' ? null : modelOverrides.openai,
          ollama: modelOverrides.ollama === 'auto' ? null : modelOverrides.ollama,
        }
      )
      setQuestion(prompt)
      setComparisonResult(data)
      aiAPI.getRecentScores('comparison').then(r => setComparisonHistory(r.data || [])).catch(() => {})
      addToast('Model comparison complete', 'success')
    } catch (err) {
      addToast(err.response?.data?.error || err.message, 'error')
    } finally {
      setModelLabLoading(false)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }

  async function rateComparison(scoreId, star) {
    if (!scoreId || ratedScores[scoreId]) return
    try {
      await aiAPI.rateResponse(scoreId, star)
      setRatedScores(prev => ({ ...prev, [scoreId]: true }))
      addToast('Rating saved', 'success')
    } catch {}
  }

  function isReady(provider) {
    if (provider === 'ollama') return !!ollamaStatus?.connected
    return !!providerStatus?.[provider]?.ready
  }

  const resultCards = comparisonResult?.comparisons || []

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card title="MODEL LAB CONTROLS" noPad>
        <div style={{ padding: '14px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 10, color: C.text3, fontFamily: 'var(--mono)' }}>Context:</span>
            <select value={labContext} onChange={e => setLabContext(e.target.value)} style={selSx}>
              {CTX_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
            </select>
            <span style={{ fontSize: 10, color: C.text3, fontFamily: 'var(--mono)' }}>Range:</span>
            <span style={{ fontSize: 10, color: C.text2, fontFamily: 'var(--mono)', background: 'var(--bg4)', padding: '4px 10px', borderRadius: 6 }}>
              {range?.label || range?.value || '24h'}
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
            {[
              ['claude', providerModels.claude],
              ['openai', providerModels.openai],
              ['ollama', providerModels.ollama],
            ].map(([provider, models]) => (
              <div key={provider} style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', opacity: isReady(provider) ? 1 : 0.55 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <ProviderBadge provider={provider} />
                  <span className={`badge badge-${isReady(provider) ? 'green' : 'red'}`} style={{ marginLeft: 'auto' }}>
                    {isReady(provider) ? 'Ready' : 'Unavailable'}
                  </span>
                </div>
                <select
                  value={modelOverrides[provider]}
                  onChange={e => setModelOverrides(prev => ({ ...prev, [provider]: e.target.value }))}
                  style={{ ...selSx, width: '100%' }}
                  disabled={!isReady(provider)}
                >
                  <option value="auto">auto</option>
                  {(models || []).map(model => <option key={model} value={model}>{model}</option>)}
                </select>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'stretch' }}>
            <textarea
              ref={inputRef}
              value={question}
              onChange={e => setQuestion(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); runComparison() }
              }}
              rows={3}
              placeholder="Ask one question and compare how each provider answers it"
              disabled={modelLabLoading}
              style={{
                flex: 1,
                background: 'var(--bg3)',
                border: '1px solid var(--border)',
                color: C.text,
                borderRadius: 8,
                padding: '10px 12px',
                fontSize: 12,
                resize: 'vertical',
                outline: 'none',
                lineHeight: 1.5,
              }}
            />
            <button
              onClick={() => runComparison()}
              disabled={!question.trim() || modelLabLoading}
              style={{
                minWidth: 150,
                border: 'none',
                borderRadius: 8,
                background: (!question.trim() || modelLabLoading) ? 'var(--bg4)' : C.accent2,
                color: (!question.trim() || modelLabLoading) ? C.text3 : '#fff',
                cursor: (!question.trim() || modelLabLoading) ? 'not-allowed' : 'pointer',
                fontFamily: 'var(--mono)',
                fontWeight: 700,
                fontSize: 12,
                padding: '10px 14px',
              }}
            >
              {modelLabLoading ? 'Comparing...' : '▶ Compare Models'}
            </button>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {MODEL_LAB_SUGGESTIONS.map(s => (
              <button
                key={s}
                onClick={() => runComparison(s)}
                disabled={modelLabLoading}
                style={{
                  fontSize: 10,
                  padding: '5px 10px',
                  borderRadius: 20,
                  border: '1px solid var(--border)',
                  background: 'var(--bg3)',
                  color: C.text2,
                  cursor: modelLabLoading ? 'not-allowed' : 'pointer',
                  fontFamily: 'var(--mono)',
                }}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      </Card>

      {comparisonResult ? (
        <>
          <Card title="COMPARISON SUMMARY" noPad>
            <div style={{ padding: '12px 14px', display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ fontSize: 10, color: C.text3, fontFamily: 'var(--mono)' }}>Question:</span>
              <span style={{ fontSize: 12, color: C.text, lineHeight: 1.6 }}>{comparisonResult.question}</span>
              {comparisonResult.winner && (
                <span style={{ marginLeft: 'auto', fontSize: 10, color: C.green, fontFamily: 'var(--mono)', fontWeight: 700 }}>
                  Best score: {comparisonResult.winner.provider} ({comparisonResult.winner.totalScore}/10)
                </span>
              )}
            </div>
          </Card>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 12 }}>
            {resultCards.map(result => (
              <ModelLabResponseCard
                key={result.provider}
                result={result}
                isWinner={comparisonResult.winner?.provider === result.provider}
                rated={!!ratedScores[result.scoreId]}
                hoveredStar={hoveredStars[result.scoreId] ?? null}
                setHoveredStar={star => setHoveredStars(prev => ({ ...prev, [result.scoreId]: star }))}
                onRate={star => rateComparison(result.scoreId, star)}
              />
            ))}
          </div>
        </>
      ) : (
        <Card title="MODEL LAB" noPad>
          <div style={{ padding: '28px 18px', textAlign: 'center', color: C.text3, fontFamily: 'var(--mono)', fontSize: 11 }}>
            Run one prompt across Claude, OpenAI, and Ollama to compare quality, speed, and score side by side
          </div>
        </Card>
      )}

      <Card title="RECENT COMPARISON RUNS" badge={comparisonHistory.length} badgeClass="blue" noPad>
        {comparisonHistory.length === 0 ? (
          <div style={{ padding: '20px 14px', textAlign: 'center', color: C.text3, fontFamily: 'var(--mono)', fontSize: 11 }}>
            No comparison runs yet
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, fontFamily: 'var(--mono)' }}>
              <thead>
                <tr style={{ background: 'var(--bg3)', borderBottom: '1px solid var(--border)' }}>
                  {['Time', 'Provider', 'Model', 'Score', 'Response Time', 'Query'].map(h => (
                    <th key={h} style={{ padding: '7px 12px', textAlign: 'left', color: C.text3, fontWeight: 600, fontSize: 10, whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {comparisonHistory.slice(0, 12).map((row, i) => (
                  <tr key={row._id || i} style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 0 ? 'transparent' : 'var(--bg3)' }}>
                    <td style={{ padding: '7px 12px', color: C.text3, whiteSpace: 'nowrap' }}>{formatTimestamp(row.createdAt)}</td>
                    <td style={{ padding: '7px 12px' }}>{row.provider ? <ProviderBadge provider={row.provider} /> : '—'}</td>
                    <td style={{ padding: '7px 12px', color: C.text3 }}>{row.model || '—'}</td>
                    <td style={{ padding: '7px 12px', color: C.text3 }}>{row.totalScore ?? '—'}</td>
                    <td style={{ padding: '7px 12px', color: C.text3 }}>{row.responseTimeMs != null ? `${(row.responseTimeMs / 1000).toFixed(1)}s` : '—'}</td>
                    <td style={{ padding: '7px 12px', color: C.text, maxWidth: 420, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.query || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}
