import { useEffect, useState } from 'react'
import { C } from '../constants'
import { ProviderBadge } from './Common.jsx'

function renderInlineParts(text) {
  const value = String(text || '')
  const parts = value.split(/(\*\*[^*]+\*\*)/g).filter(Boolean)

  return parts.map((part, index) => (
    part.startsWith('**') && part.endsWith('**')
      ? <strong key={`${part}-${index}`}>{part.slice(2, -2)}</strong>
      : <span key={`${part}-${index}`}>{part}</span>
  ))
}

function normalizeLines(text) {
  return String(text || '')
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
}

export function StructuredResponse({ display, fallbackText, compact = false }) {
  const payload = display || null
  const paragraphs = !payload ? String(fallbackText || '').split(/\r?\n\r?\n+/).map(part => part.trim()).filter(Boolean) : []

  if (!payload && paragraphs.length === 0) return null

  const sectionTitleStyle = {
    fontSize: compact ? 9 : 10,
    color: C.text3,
    fontFamily: 'var(--mono)',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: compact ? 5 : 6,
  }

  const cardStyle = {
    background: compact ? 'transparent' : 'var(--bg3)',
    border: compact ? 'none' : '1px solid var(--border)',
    borderRadius: compact ? 0 : 8,
    padding: compact ? 0 : '12px 14px',
  }

  if (!payload) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: compact ? 8 : 10 }}>
        {paragraphs.map((paragraph, index) => (
          <p key={index} style={{ margin: 0, fontSize: compact ? 11 : 12, color: C.text, lineHeight: 1.75 }}>
            {renderInlineParts(paragraph)}
          </p>
        ))}
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: compact ? 10 : 12 }}>
      {payload.summary && (
        <div style={{ ...cardStyle, borderLeft: compact ? 'none' : `3px solid ${C.accent2}` }}>
          <div style={sectionTitleStyle}>Summary</div>
          <div style={{ fontSize: compact ? 11 : 12, color: C.text, lineHeight: 1.75 }}>
            {renderInlineParts(payload.summary)}
          </div>
        </div>
      )}

      {payload.metrics?.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fit, minmax(${compact ? 120 : 140}px, 1fr))`, gap: 8 }}>
          {payload.metrics.map(metric => (
            <div key={`${metric.label}-${metric.value}`} style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 8, padding: compact ? '8px 10px' : '10px 12px' }}>
              <div style={{ fontSize: 9, color: C.text3, fontFamily: 'var(--mono)', textTransform: 'uppercase', marginBottom: 4 }}>{metric.label}</div>
              <div style={{ fontSize: compact ? 11 : 12, color: C.text, fontFamily: 'var(--mono)', fontWeight: 700 }}>{metric.value}</div>
            </div>
          ))}
        </div>
      )}

      {[
        ['Highlights', payload.highlights, C.accent2],
        ['Actions', payload.actions, C.green],
        ['Evidence', payload.evidence, C.amber],
      ].map(([label, items, color]) => (
        items?.length > 0 && (
          <div key={label} style={cardStyle}>
            <div style={sectionTitleStyle}>{label}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: compact ? 6 : 8 }}>
              {items.map(item => (
                <div key={item} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <span style={{ color, fontSize: compact ? 11 : 12, lineHeight: 1.6 }}>•</span>
                  <span style={{ fontSize: compact ? 11 : 12, color: C.text2, lineHeight: 1.7 }}>{renderInlineParts(item)}</span>
                </div>
              ))}
            </div>
          </div>
        )
      ))}

      {payload.diagram && (
        <div style={cardStyle}>
          <div style={sectionTitleStyle}>Diagram</div>
          <pre style={{ margin: 0, fontSize: compact ? 10 : 11, color: C.text2, fontFamily: 'var(--mono)', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
            {payload.diagram}
          </pre>
        </div>
      )}

      {!payload.summary && normalizeLines(fallbackText).length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {normalizeLines(fallbackText).slice(0, 6).map((line, index) => (
            <div key={`${line}-${index}`} style={{ fontSize: compact ? 11 : 12, color: C.text2, lineHeight: 1.7 }}>
              {renderInlineParts(line)}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function MeteringRow({ metering, provider, model, responseTimeMs, tokensUsed, totalScore }) {
  const meta = metering || {
    provider,
    model,
    responseTimeMs,
    tokensUsed,
  }

  if (!meta?.provider && !meta?.model && meta?.responseTimeMs == null && meta?.tokensUsed == null && totalScore == null) {
    return null
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      {meta.provider && <ProviderBadge provider={meta.provider} />}
      {meta.model && (
        <span style={{ fontSize: 10, color: C.text3, fontFamily: 'var(--mono)', background: 'var(--bg4)', padding: '2px 8px', borderRadius: 5 }}>
          {meta.model}
        </span>
      )}
      {meta.responseTimeMs != null && (
        <span style={{ fontSize: 10, color: C.text3, fontFamily: 'var(--mono)' }}>
          {(meta.responseTimeMs / 1000).toFixed(meta.responseTimeMs >= 10000 ? 0 : 1)}s
        </span>
      )}
      {meta.tokensUsed != null && (
        <span style={{ fontSize: 10, color: C.text3, fontFamily: 'var(--mono)' }}>
          {meta.tokensUsed} tokens
        </span>
      )}
      {meta.billingMode === 'local' && (
        <span style={{ fontSize: 10, color: C.amber, fontFamily: 'var(--mono)' }}>
          Local compute
        </span>
      )}
      {meta.billingMode === 'internal' && (
        <span style={{ fontSize: 10, color: C.cyan, fontFamily: 'var(--mono)' }}>
          Internal query
        </span>
      )}
      {meta.billingMode === 'cloud' && meta.estimatedCostUsd != null && (
        <span style={{ fontSize: 10, color: C.text3, fontFamily: 'var(--mono)' }}>
          ${Number(meta.estimatedCostUsd).toFixed(4)}
        </span>
      )}
      {totalScore != null && (
        <span style={{
          fontSize: 10,
          padding: '2px 9px',
          borderRadius: 10,
          fontFamily: 'var(--mono)',
          fontWeight: 600,
          background: totalScore >= 7 ? 'rgba(34,211,160,0.12)' : totalScore >= 5 ? 'rgba(245,166,35,0.12)' : 'rgba(245,83,79,0.12)',
          color: totalScore >= 7 ? C.green : totalScore >= 5 ? C.amber : C.red,
          border: `1px solid ${totalScore >= 7 ? 'rgba(34,211,160,0.3)' : totalScore >= 5 ? 'rgba(245,166,35,0.3)' : 'rgba(245,83,79,0.3)'}`,
        }}>
          Score: {totalScore}/10
        </span>
      )}
    </div>
  )
}

export function TaskShell({
  title,
  loading,
  error,
  steps = [],
  stageLabel,
  startedAt,
  onRetry,
  onCancel,
  compact = false,
}) {
  const [elapsedSeconds, setElapsedSeconds] = useState(0)

  useEffect(() => {
    if (!loading || !startedAt) {
      setElapsedSeconds(0)
      return undefined
    }

    setElapsedSeconds(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)))
    const timer = window.setInterval(() => {
      setElapsedSeconds(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)))
    }, 1000)

    return () => window.clearInterval(timer)
  }, [loading, startedAt])

  if (!loading && !error) return null

  const accent = error ? C.red : C.accent2
  const bodyStyle = compact
    ? { padding: '10px 12px', borderRadius: 10 }
    : { padding: '14px 16px', borderRadius: 10 }

  return (
    <div style={{ background: error ? 'rgba(245,83,79,0.08)' : 'var(--bg3)', border: `1px solid ${error ? 'rgba(245,83,79,0.22)' : 'var(--border)'}`, borderLeft: `3px solid ${accent}`, ...bodyStyle, display: 'flex', flexDirection: 'column', gap: compact ? 8 : 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: compact ? 11 : 12, color: C.text, fontFamily: 'var(--mono)', fontWeight: 700 }}>
          {title}
        </span>
        {loading && (
          <span style={{ fontSize: 10, color: C.text3, fontFamily: 'var(--mono)', marginLeft: 'auto' }}>
            {elapsedSeconds}s elapsed
          </span>
        )}
      </div>

      {loading ? (
        <>
          <div style={{ fontSize: compact ? 11 : 12, color: C.text2, lineHeight: 1.7 }}>
            {stageLabel || 'Working...'}
          </div>
          {steps.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {steps.map(step => {
                const isActive = step === stageLabel
                return (
                  <div key={step} style={{ display: 'flex', alignItems: 'center', gap: 8, color: isActive ? C.text : C.text3 }}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: isActive ? C.accent2 : 'var(--border)', display: 'inline-block' }} />
                    <span style={{ fontSize: 10, fontFamily: 'var(--mono)' }}>{step}</span>
                  </div>
                )
              })}
            </div>
          )}
          {onCancel && (
            <div>
              <button onClick={onCancel} style={{ fontSize: 10, padding: '5px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg4)', color: C.text3, cursor: 'pointer', fontFamily: 'var(--mono)' }}>
                Cancel
              </button>
            </div>
          )}
        </>
      ) : (
        <>
          <div style={{ fontSize: compact ? 11 : 12, color: C.text, lineHeight: 1.7 }}>
            {error.kind === 'timeout' ? `${error.message} Your input is still here, so you can retry.` : error.message}
          </div>
          {onRetry && (
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={onRetry} style={{ fontSize: 10, padding: '5px 10px', borderRadius: 6, border: 'none', background: C.red, color: '#fff', cursor: 'pointer', fontFamily: 'var(--mono)', fontWeight: 700 }}>
                Retry
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
