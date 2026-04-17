import { useRef, useState } from 'react'
import { C, CTX_OPTIONS, selSx } from '../constants'
import { Card, ProviderBadge } from '../components/Common.jsx'
import { MeteringRow, StructuredResponse, TaskShell } from '../components/TaskSupport.jsx'
import { useTaskProgress } from '../hooks/useTaskProgress.js'
import { formatTimestamp } from '../utils/common.js'
import { useModelLabComparison } from '../hooks/useModelLabComparison.js'

const MODEL_LAB_SUGGESTIONS = [
  'Summarize the current network risk posture',
  'What needs urgent action right now?',
  'Which security events look most concerning today?',
  'Give me an executive summary of the last 24 hours',
]

const MODEL_LAB_STEPS = [
  'Preparing the shared context...',
  'Running each target model...',
  'Scoring and comparing responses...',
]

function ModelLabResponseCard({ result, isWinner, rated, hoveredStar, setHoveredStar, onRate }) {
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
            <MeteringRow
              metering={result.metering}
              provider={result.provider}
              model={result.model}
              responseTimeMs={result.responseTimeMs}
              tokensUsed={result.tokensUsed}
              totalScore={result.totalScore}
            />

            <StructuredResponse display={result.display} fallbackText={result.response || '(no response)'} />

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
  const [hoveredStars, setHoveredStars] = useState({})
  const inputRef = useRef(null)
  const {
    question,
    setQuestion,
    labContext,
    setLabContext,
    modelLabLoading,
    comparisonResult,
    comparisonHistory,
    ratedScores,
    modelLabError,
    modelOverrides,
    setModelOverrides,
    providerModels,
    isReady,
    compareMode,
    setCompareMode,
    sameProvider,
    setSameProvider,
    sameProviderSelections,
    setSameProviderModelAt,
    sameProviderOptions,
    selectedSameProviderModels,
    canRunComparison,
    runComparison,
    cancelComparison,
    retryComparison,
    rateComparison,
  } = useModelLabComparison({
    range,
    providerStatus,
    ollamaStatus,
    addToast,
  })
  const { stageLabel, startedAt } = useTaskProgress(modelLabLoading, MODEL_LAB_STEPS, 3200)

  async function handleRunComparison(text = question) {
    const ran = await runComparison(text)
    if (ran) {
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }

  const resultCards = comparisonResult?.comparisons || []

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card title="MODEL LAB CONTROLS" noPad>
        <div style={{ padding: '14px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 10, color: C.text3, fontFamily: 'var(--mono)' }}>Mode:</span>
            {[
              { value: 'providers', label: 'Across Providers' },
              { value: 'same-provider', label: 'Within One Provider' },
            ].map(option => (
              <button
                key={option.value}
                onClick={() => setCompareMode(option.value)}
                style={{
                  fontSize: 10,
                  padding: '4px 10px',
                  borderRadius: 999,
                  border: `1px solid ${compareMode === option.value ? C.accent2 : 'var(--border)'}`,
                  background: compareMode === option.value ? 'rgba(124,92,252,0.18)' : 'var(--bg4)',
                  color: compareMode === option.value ? C.text : C.text3,
                  cursor: 'pointer',
                  fontFamily: 'var(--mono)',
                  fontWeight: compareMode === option.value ? 700 : 500,
                }}
              >
                {option.label}
              </button>
            ))}
            <span style={{ fontSize: 10, color: C.text3, fontFamily: 'var(--mono)' }}>Context:</span>
            <select value={labContext} onChange={e => setLabContext(e.target.value)} style={selSx}>
              {CTX_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
            </select>
            <span style={{ fontSize: 10, color: C.text3, fontFamily: 'var(--mono)' }}>Range:</span>
            <span style={{ fontSize: 10, color: C.text2, fontFamily: 'var(--mono)', background: 'var(--bg4)', padding: '4px 10px', borderRadius: 6 }}>
              {range?.label || range?.value || '24h'}
            </span>
          </div>

          {compareMode === 'providers' ? (
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
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
              <div style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', opacity: isReady(sameProvider) ? 1 : 0.55 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <span style={{ fontSize: 10, color: C.text3, fontFamily: 'var(--mono)' }}>Provider</span>
                  <span className={`badge badge-${isReady(sameProvider) ? 'green' : 'red'}`} style={{ marginLeft: 'auto' }}>
                    {isReady(sameProvider) ? 'Ready' : 'Unavailable'}
                  </span>
                </div>
                <select
                  value={sameProvider}
                  onChange={e => setSameProvider(e.target.value)}
                  style={{ ...selSx, width: '100%' }}
                >
                  {['claude', 'openai', 'ollama'].map(provider => (
                    <option key={provider} value={provider}>{provider}</option>
                  ))}
                </select>
              </div>

              {sameProviderSelections.map((selectedModel, index) => (
                <div key={`${sameProvider}-slot-${index}`} style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', opacity: isReady(sameProvider) ? 1 : 0.55 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <span style={{ fontSize: 10, color: C.text3, fontFamily: 'var(--mono)' }}>
                      Model {index + 1}{index === 2 ? ' (optional)' : ''}
                    </span>
                  </div>
                  <select
                    value={selectedModel}
                    onChange={e => setSameProviderModelAt(index, e.target.value)}
                    style={{ ...selSx, width: '100%' }}
                    disabled={!isReady(sameProvider) || sameProviderOptions.length === 0}
                  >
                    <option value="">{index === 2 ? 'not used' : 'select model'}</option>
                    {sameProviderOptions.map(model => <option key={model} value={model}>{model}</option>)}
                  </select>
                </div>
              ))}
            </div>
          )}

          {compareMode === 'same-provider' && (
            <div style={{ fontSize: 10, color: C.text3, fontFamily: 'var(--mono)' }}>
              Compare 2-3 different models from the same provider. Selected: {selectedSameProviderModels.length}
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, alignItems: 'stretch' }}>
            <textarea
              ref={inputRef}
              value={question}
              onChange={e => setQuestion(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleRunComparison() }
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
              onClick={() => handleRunComparison()}
              disabled={!canRunComparison || modelLabLoading}
              style={{
                minWidth: 150,
                border: 'none',
                borderRadius: 8,
                background: (!canRunComparison || modelLabLoading) ? 'var(--bg4)' : C.accent2,
                color: (!canRunComparison || modelLabLoading) ? C.text3 : '#fff',
                cursor: (!canRunComparison || modelLabLoading) ? 'not-allowed' : 'pointer',
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
                onClick={() => handleRunComparison(s)}
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

      <TaskShell
        title="Model comparison"
        loading={modelLabLoading}
        error={modelLabError}
        steps={MODEL_LAB_STEPS}
        stageLabel={stageLabel}
        startedAt={startedAt}
        onRetry={retryComparison}
        onCancel={cancelComparison}
      />

      {comparisonResult ? (
        <>
          <Card title="COMPARISON SUMMARY" noPad>
            <div style={{ padding: '12px 14px', display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ fontSize: 10, color: C.text3, fontFamily: 'var(--mono)' }}>Question:</span>
              <span style={{ fontSize: 12, color: C.text, lineHeight: 1.6 }}>{comparisonResult.question}</span>
              {comparisonResult.winner && (
                <span style={{ marginLeft: 'auto', fontSize: 10, color: C.green, fontFamily: 'var(--mono)', fontWeight: 700 }}>
                  Best score: {comparisonResult.winner.provider} / {comparisonResult.winner.model} ({comparisonResult.winner.totalScore}/10)
                </span>
              )}
            </div>
          </Card>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 12 }}>
            {resultCards.map(result => (
              <ModelLabResponseCard
                key={result.targetId || `${result.provider}:${result.model}`}
                result={result}
                isWinner={comparisonResult.winner?.targetId === result.targetId}
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
            Compare providers side by side, or test 2-3 different models from the same provider with one prompt
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
