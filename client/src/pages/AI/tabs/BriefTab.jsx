import { useState } from 'react'
import RangePicker from '../../../components/ui/RangePicker.jsx'
import { C, selSx } from '../constants'
import { Card, ProviderBadge } from '../components/Common.jsx'
import { formatCoveredRange, formatTimestamp } from '../utils/common.js'
import { useBriefData } from '../hooks/useBriefData.js'

const RISK_COLOR  = { critical: '#f5534f', high: '#f5a623', medium: '#4f7ef5', low: '#22d3a0' }
const RISK_BG     = { critical: 'rgba(245,83,79,0.12)', high: 'rgba(245,166,35,0.12)', medium: 'rgba(79,126,245,0.12)', low: 'rgba(34,211,160,0.12)' }
const RISK_BORDER = { critical: 'rgba(245,83,79,0.35)', high: 'rgba(245,166,35,0.35)', medium: 'rgba(79,126,245,0.35)', low: 'rgba(34,211,160,0.35)' }

const GEN_STEPS = [
  'Fetching network data...',
  'Analyzing security events...',
  'Consulting AI...',
  'Formatting report...',
]

/* ── simple inline markdown renderer ─────────────────────────── */
function MiniMD({ text }) {
  if (!text) return null
  const lines = String(text).split('\n')
  const nodes = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (!line.trim()) { nodes.push(<div key={i} style={{ height: 8 }} />); i++; continue }
    if (/^#{1,3}\s/.test(line)) {
      nodes.push(
        <div key={i} style={{ fontSize: 12, color: C.text, fontFamily: 'var(--mono)', fontWeight: 700, marginTop: 10, marginBottom: 4 }}>
          {line.replace(/^#{1,3}\s/, '')}
        </div>
      )
      i++; continue
    }
    if (/^[-*]\s/.test(line)) {
      nodes.push(
        <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 3 }}>
          <span style={{ color: C.accent2, fontSize: 11, flexShrink: 0, lineHeight: 1.6 }}>•</span>
          <span style={{ fontSize: 11, color: C.text2, lineHeight: 1.6, fontFamily: 'inherit' }}
            dangerouslySetInnerHTML={{ __html: line.replace(/^[-*]\s/, '').replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>') }} />
        </div>
      )
      i++; continue
    }
    if (/^\d+\.\s/.test(line)) {
      nodes.push(
        <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 3 }}>
          <span style={{ color: C.green, fontSize: 11, flexShrink: 0, lineHeight: 1.6, fontFamily: 'var(--mono)' }}>
            {line.match(/^(\d+)\./)[1]}.
          </span>
          <span style={{ fontSize: 11, color: C.text2, lineHeight: 1.6, fontFamily: 'inherit' }}
            dangerouslySetInnerHTML={{ __html: line.replace(/^\d+\.\s/, '').replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>') }} />
        </div>
      )
      i++; continue
    }
    nodes.push(
      <p key={i} style={{ margin: '0 0 6px', fontSize: 12, color: C.text2, lineHeight: 1.7, fontFamily: 'inherit' }}
        dangerouslySetInnerHTML={{ __html: line.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>') }} />
    )
    i++
  }
  return <div>{nodes}</div>
}

/* ── section card ─────────────────────────────────────────────── */
function SectionCard({ icon, title, borderColor, section }) {
  if (!section) return (
    <div style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderLeft: `3px solid ${borderColor}`, borderRadius: 8, padding: '14px', color: C.text3, fontFamily: 'var(--mono)', fontSize: 11 }}>
      <div style={{ marginBottom: 6, fontWeight: 700, color: C.text2 }}>{icon} {title}</div>
      Section not available
    </div>
  )
  return (
    <div style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderLeft: `3px solid ${borderColor}`, borderRadius: 8, padding: '14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ fontSize: 11, color: C.text, fontFamily: 'var(--mono)', fontWeight: 700, letterSpacing: 0.5 }}>{icon} {title}</div>
      {section.summary && (
        <p style={{ margin: 0, fontSize: 12, color: C.text2, lineHeight: 1.7 }}>{section.summary}</p>
      )}
      {section.highlights?.length > 0 && (
        <div>
          <div style={{ fontSize: 9, color: C.text3, fontFamily: 'var(--mono)', textTransform: 'uppercase', marginBottom: 6 }}>Highlights</div>
          {section.highlights.map((h, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
              <span style={{ color: borderColor, fontSize: 11, flexShrink: 0, lineHeight: 1.6 }}>•</span>
              <span style={{ fontSize: 11, color: C.text2, lineHeight: 1.6 }}>{h}</span>
            </div>
          ))}
        </div>
      )}
      {section.recommendations?.length > 0 && (
        <div>
          <div style={{ fontSize: 9, color: C.text3, fontFamily: 'var(--mono)', textTransform: 'uppercase', marginBottom: 6 }}>Recommendations</div>
          {section.recommendations.map((r, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
              <span style={{ color: C.green, fontSize: 11, flexShrink: 0, lineHeight: 1.6, fontFamily: 'var(--mono)' }}>{i + 1}.</span>
              <span style={{ fontSize: 11, color: C.text2, lineHeight: 1.6 }}>{r}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function StructuredReport({ data, level = 0 }) {
  if (data == null) return null
  if (typeof data === 'string') return <MiniMD text={data} />
  if (Array.isArray(data)) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {data.map((item, i) => (
          <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <span style={{ color: C.accent2, fontSize: 11, lineHeight: 1.6 }}>•</span>
            <div style={{ flex: 1, fontSize: 11, color: C.text2, lineHeight: 1.7 }}>
              {typeof item === 'string' ? item : <StructuredReport data={item} level={level + 1} />}
            </div>
          </div>
        ))}
      </div>
    )
  }
  if (typeof data !== 'object') {
    return <div style={{ fontSize: 11, color: C.text2, lineHeight: 1.7 }}>{String(data)}</div>
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {Object.entries(data).map(([key, value]) => (
        <div key={key}>
          <div style={{
            fontSize: level === 0 ? 11 : 10,
            color: level === 0 ? C.text : C.text3,
            fontFamily: 'var(--mono)',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: 0.4,
            marginBottom: 6,
          }}>
            {String(key).replace(/([A-Z])/g, ' $1').replace(/[_-]/g, ' ').trim()}
          </div>
          <div style={{
            paddingLeft: level === 0 ? 0 : 10,
            borderLeft: level === 0 ? 'none' : '1px solid var(--border)',
          }}>
            <StructuredReport data={value} level={level + 1} />
          </div>
        </div>
      ))}
    </div>
  )
}

export default function BriefTab({ providerStatus, ollamaStatus, range, setRange, addToast }) {
  const [reportExpanded, setReportExpanded] = useState(false)
  const [hoveredStar, setHoveredStar] = useState(null)
  const {
    briefHistory,
    briefLoading,
    briefProvider,
    setBriefProvider,
    briefModel,
    setBriefModel,
    selectedBrief,
    setSelectedBrief,
    genStep,
    starRated,
    setStarRated,
    displayed,
    availableProviders,
    overrideModels,
    generateBrief,
    refreshBrief,
    loadHistoryBrief,
    rateResponse,
  } = useBriefData({
    range,
    providerStatus,
    ollamaStatus,
    addToast,
    generationSteps: GEN_STEPS,
  })

  async function handleGenerateBrief() {
    setReportExpanded(false)
    await generateBrief()
  }

  async function handleRefreshBrief() {
    setReportExpanded(false)
    await refreshBrief()
  }

  async function handleLoadHistoryBrief(historyItem) {
    setReportExpanded(false)
    await loadHistoryBrief(historyItem)
  }

  /* ── parse fullReport (JSON or markdown) ───────────────────────── */
  function parseFullReport(raw) {
    if (!raw) return { type: 'empty' }
    if (typeof raw === 'object') return { type: 'obj', data: raw }
    const s = String(raw)
      .replace(/```json/gi, '')
      .replace(/```/g, '')
      .trim()
    if (s.startsWith('{') || s.startsWith('[')) {
      try { return { type: 'obj', data: JSON.parse(s) } } catch {}
    }
    return { type: 'md', text: s }
  }

  function normalizeBriefForRender(sourceBrief) {
    if (!sourceBrief) return null
    const parsed = parseFullReport(sourceBrief.fullReport || sourceBrief.full_report)
    if (parsed.type !== 'obj' || !parsed.data || Array.isArray(parsed.data)) {
      return { brief: sourceBrief, fullReport: parsed }
    }

    const parsedData = parsed.data
    const merged = {
      ...sourceBrief,
      title: sourceBrief.title || parsedData.title,
      executiveSummary: sourceBrief.executiveSummary || sourceBrief.executive_summary || parsedData.executiveSummary || parsedData.executive_summary,
      sections: sourceBrief.sections || parsedData.sections,
      security: sourceBrief.security || parsedData.security,
      network: sourceBrief.network || parsedData.network,
      infrastructure: sourceBrief.infrastructure || parsedData.infrastructure,
      topRecommendations: sourceBrief.topRecommendations?.length ? sourceBrief.topRecommendations : (parsedData.topRecommendations || parsedData.top_recommendations),
      riskLevel: sourceBrief.riskLevel || sourceBrief.risk_level || parsedData.riskLevel || parsedData.risk_level,
    }

    return { brief: merged, fullReport: parsed }
  }

  /* ── helpers ───────────────────────────────────────────────────── */
  function riskColor(r) { return RISK_COLOR[(r || '').toLowerCase()] || C.text3 }
  function riskBg(r)    { return RISK_BG[(r || '').toLowerCase()]    || 'var(--bg3)' }
  function riskBorder(r){ return RISK_BORDER[(r || '').toLowerCase()] || 'var(--border)' }

  /* ═══════════════════════════════════════════════════════════════ */
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* ── 1. CONTROLS ROW ──────────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <RangePicker range={range} onChange={setRange} accentColor={C.accent2} />
          <select
            value={briefProvider || 'default'}
            onChange={e => { setBriefProvider(e.target.value === 'default' ? null : e.target.value); setBriefModel(null) }}
            style={selSx}
          >
            <option value="default">Use Task Config</option>
            {availableProviders.map(p => <option key={p} value={p}>{p}</option>)}
          </select>

          <select
            value={briefModel || 'auto'}
            onChange={e => setBriefModel(e.target.value === 'auto' ? null : e.target.value)}
            style={selSx}
            disabled={!briefProvider}
          >
            <option value="auto">{briefProvider ? 'auto' : 'Model Override'}</option>
            {overrideModels.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <button
            onClick={handleGenerateBrief}
            disabled={briefLoading}
            style={{
              fontSize: 12, padding: '9px 16px', borderRadius: 8, border: 'none',
              background: briefLoading ? 'rgba(124,92,252,0.18)' : C.accent2,
              color: '#fff',
              cursor: briefLoading ? 'not-allowed' : 'pointer',
              fontFamily: 'var(--mono)', fontWeight: 700, transition: 'all 0.15s',
              display: 'flex', alignItems: 'center', gap: 8,
              boxShadow: briefLoading ? 'none' : '0 10px 24px rgba(124,92,252,0.22)',
            }}
          >
            <span style={{
              width: 14, height: 14, borderRadius: '50%',
              border: '2px solid rgba(255,255,255,0.35)',
              borderTopColor: '#fff',
              display: 'inline-block',
              animation: briefLoading ? 'spin 0.9s linear infinite' : 'none',
            }} />
            {briefLoading ? 'Generating... (30-60 seconds)' : '▶ Generate Brief'}
          </button>

          <button
            onClick={handleRefreshBrief}
            disabled={briefLoading}
            style={{ fontSize: 11, padding: '8px 12px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--bg4)', color: C.text3, cursor: 'pointer', fontFamily: 'var(--mono)' }}
          >
            🔄 Refresh
          </button>
        </div>
      </div>

      {/* ── 2. GENERATION PROGRESS ───────────────────────────────── */}
      {briefLoading && (
        <div style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 10, padding: '20px 24px' }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 12, color: C.text2, marginBottom: 16, fontWeight: 600 }}>
            Generating Intelligence Brief — this may take 30–60 seconds
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {GEN_STEPS.map((step, i) => {
              const done    = i < genStep
              const current = i === genStep
              return (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{
                    width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 11, fontWeight: 700,
                    background: done ? `${C.green}22` : current ? `${C.accent2}22` : 'var(--bg4)',
                    border: `2px solid ${done ? C.green : current ? C.accent2 : 'var(--border)'}`,
                    color: done ? C.green : current ? C.accent2 : C.text3,
                    transition: 'all 0.4s',
                  }}>
                    {done ? '✓' : i + 1}
                  </div>
                  <span style={{
                    fontSize: 11, fontFamily: 'var(--mono)',
                    color: done ? C.green : current ? C.text : C.text3,
                    transition: 'color 0.4s',
                  }}>
                    {step}
                    {current && (
                      <span style={{ display: 'inline-flex', gap: 3, marginLeft: 8 }}>
                        {[0, 1, 2].map(d => (
                          <span key={d} style={{ width: 5, height: 5, borderRadius: '50%', background: C.accent2, display: 'inline-block', animation: `bounce 1.2s ${d * 0.2}s infinite` }} />
                        ))}
                      </span>
                    )}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── 3. BRIEF DISPLAY ─────────────────────────────────────── */}
      {!briefLoading && !displayed && (
        <div style={{ background: 'var(--bg3)', borderRadius: 12, padding: '48px 24px', textAlign: 'center', border: '1px solid var(--border)' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>📋</div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 14, color: C.text2, marginBottom: 8 }}>No briefs generated yet</div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: C.text3, marginBottom: 20 }}>Generate your first AI intelligence brief to get a comprehensive overview of your network</div>
          <button
            onClick={handleGenerateBrief}
            style={{
              padding: '10px 24px', borderRadius: 8, border: 'none',
              background: C.accent2, color: '#fff', cursor: 'pointer',
              fontFamily: 'var(--mono)', fontSize: 13, fontWeight: 700,
            }}
          >▶ Generate First Brief</button>
        </div>
      )}

      {!briefLoading && displayed && (() => {
        const normalized = normalizeBriefForRender(displayed)
        const briefView = normalized?.brief || displayed
        const fullRpt = normalized?.fullReport || parseFullReport(displayed.fullReport || displayed.full_report)
        const rk = (briefView.riskLevel || briefView.risk_level || '').toLowerCase()

        return (
          <>
            {/* header card */}
            <Card title="INTELLIGENCE BRIEF" noPad>
              <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                {/* title + risk */}
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 16, color: C.text, fontWeight: 700, marginBottom: 3 }}>
                      {briefView.title || 'NetPulse Intelligence Brief'}
                    </div>
                    <div style={{ fontSize: 10, color: C.text3, fontFamily: 'var(--mono)' }}>
                      Generated {formatTimestamp(briefView.generatedAt || briefView.createdAt)}
                      {briefView.period && ` · Period: ${briefView.period}`}
                      {((briefView.rangeFrom || briefView.dateRange?.from) || (briefView.rangeTo || briefView.dateRange?.to)) && ` · Covered: ${formatCoveredRange(briefView.rangeFrom || briefView.dateRange?.from, briefView.rangeTo || briefView.dateRange?.to)}`}
                    </div>
                  </div>
                  {rk && (
                    <span style={{
                      fontSize: 12, padding: '5px 14px', borderRadius: 20,
                      fontFamily: 'var(--mono)', fontWeight: 800, textTransform: 'uppercase',
                      background: riskBg(rk), color: riskColor(rk), border: `2px solid ${riskBorder(rk)}`,
                    }}>
                      {rk} risk
                    </span>
                  )}
                </div>
                {/* meta row */}
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', paddingTop: 4, borderTop: '1px solid var(--border)' }}>
                  {briefView.provider && <ProviderBadge provider={briefView.provider} />}
                  {briefView.model && (
                    <span style={{ fontSize: 10, color: C.text3, fontFamily: 'var(--mono)', background: 'var(--bg4)', padding: '2px 8px', borderRadius: 5 }}>
                      {briefView.model}
                    </span>
                  )}
                  {(briefView.tokensUsed ?? briefView.tokens) != null && (
                    <span style={{ fontSize: 10, color: C.text3, fontFamily: 'var(--mono)' }}>
                      {(briefView.tokensUsed ?? briefView.tokens)} tokens used
                    </span>
                  )}
                  {(briefView.generationTimeMs ?? briefView.responseTimeMs) != null && (
                    <span style={{ fontSize: 10, color: C.text3, fontFamily: 'var(--mono)' }}>
                      {((briefView.generationTimeMs ?? briefView.responseTimeMs) / 1000).toFixed(1)}s
                    </span>
                  )}
                  {briefView.totalScore != null && (
                    <span style={{
                      fontSize: 10, padding: '2px 9px', borderRadius: 10, fontFamily: 'var(--mono)', fontWeight: 600,
                      background: briefView.totalScore >= 7 ? 'rgba(34,211,160,0.12)' : 'rgba(245,166,35,0.12)',
                      color: briefView.totalScore >= 7 ? C.green : C.amber,
                      border: `1px solid ${briefView.totalScore >= 7 ? 'rgba(34,211,160,0.3)' : 'rgba(245,166,35,0.3)'}`,
                    }}>
                      Score: {briefView.totalScore}/10
                    </span>
                  )}
                </div>
              </div>
            </Card>

            {/* executive summary */}
            {briefView.executiveSummary && (
              <div style={{
                background: 'var(--bg3)', border: '1px solid var(--border)',
                borderLeft: `4px solid ${C.accent2}`,
                borderRadius: 8, padding: '16px 18px',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <span style={{ fontSize: 16 }}>📋</span>
                  <span style={{ fontSize: 11, color: C.text2, fontFamily: 'var(--mono)', fontWeight: 700, letterSpacing: 0.5 }}>EXECUTIVE SUMMARY</span>
                </div>
                <div style={{ fontSize: 13, color: C.text, lineHeight: 1.8 }}>{briefView.executiveSummary}</div>
              </div>
            )}

            {/* three section cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
              <SectionCard icon="🔴" title="SECURITY"       borderColor={C.red}   section={briefView.sections?.security       || briefView.security} />
              <SectionCard icon="🌐" title="NETWORK"        borderColor={C.cyan}  section={briefView.sections?.network        || briefView.network} />
              <SectionCard icon="🖥" title="INFRASTRUCTURE" borderColor={C.amber} section={briefView.sections?.infrastructure || briefView.infrastructure} />
            </div>

            {/* top recommendations */}
            {(briefView.topRecommendations?.length > 0 || briefView.top_recommendations?.length > 0) && (() => {
              const recs = briefView.topRecommendations || briefView.top_recommendations
              return (
                <Card title="TOP RECOMMENDATIONS" badge={recs.length} badgeClass="green" noPad>
                  <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {recs.map((rec, i) => (
                      <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '8px 10px', background: 'var(--bg3)', borderRadius: 7, border: '1px solid var(--border)' }}>
                        <span style={{ fontSize: 14, flexShrink: 0, lineHeight: 1.4 }}>✅</span>
                        <div>
                          <span style={{ fontSize: 10, color: C.green, fontFamily: 'var(--mono)', fontWeight: 700, marginRight: 8 }}>{i + 1}.</span>
                          <span style={{ fontSize: 12, color: C.text, lineHeight: 1.6 }}>{typeof rec === 'string' ? rec : (rec.text || rec.recommendation || JSON.stringify(rec))}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>
              )
            })()}

            {/* full report (collapsible) */}
            {fullRpt.type !== 'empty' && (
              <Card title="FULL REPORT" noPad>
                <div style={{ padding: '0 14px' }}>
                  <button
                    onClick={() => setReportExpanded(e => !e)}
                    style={{
                      width: '100%', padding: '10px 0', background: 'none', border: 'none',
                      color: C.accent, fontFamily: 'var(--mono)', fontSize: 11, cursor: 'pointer',
                      textAlign: 'left', display: 'flex', alignItems: 'center', gap: 6,
                    }}
                  >
                    <span style={{ transition: 'transform 0.2s', display: 'inline-block', transform: reportExpanded ? 'rotate(90deg)' : 'rotate(0deg)' }}>▶</span>
                    {reportExpanded ? 'Collapse' : 'Expand full report'}
                  </button>
                  {reportExpanded && (
                    <div style={{ paddingBottom: 14, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
                      {fullRpt.type === 'md' && <MiniMD text={fullRpt.text} />}
                      {fullRpt.type === 'obj' && <StructuredReport data={fullRpt.data} />}
                    </div>
                  )}
                </div>
              </Card>
            )}

            {/* star rating */}
            {displayed.scoreId && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0' }}>
                {starRated ? (
                  <span style={{ fontSize: 11, color: C.green, fontFamily: 'var(--mono)' }}>Thanks for rating!</span>
                ) : (
                  <>
                    <span style={{ fontSize: 11, color: C.text3, fontFamily: 'var(--mono)' }}>Rate this brief:</span>
                    {[1, 2, 3, 4, 5].map(star => (
                      <button
                        key={star}
                        onMouseEnter={() => setHoveredStar(star)}
                        onMouseLeave={() => setHoveredStar(null)}
                        onClick={() => rateResponse(star)}
                        style={{
                          background: 'none', border: 'none', cursor: 'pointer',
                          fontSize: 18, padding: '0 1px', lineHeight: 1,
                          opacity: hoveredStar != null ? (star <= hoveredStar ? 1 : 0.3) : 0.3,
                          filter: hoveredStar != null && star <= hoveredStar ? 'none' : 'grayscale(1)',
                          transition: 'all 0.1s',
                        }}
                      >⭐</button>
                    ))}
                  </>
                )}
              </div>
            )}
          </>
        )
      })()}

      {/* ── 4. BRIEF HISTORY ─────────────────────────────────────── */}
      {briefHistory.length > 0 && (
        <Card title="BRIEF HISTORY" badge={briefHistory.length} badgeClass="blue" noPad>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {briefHistory.slice(0, 10).map((h, i) => {
              const rk = (h.riskLevel || h.risk_level || '').toLowerCase()
              const isActive = selectedBrief?._id === h._id || selectedBrief?.id === h.id
              return (
                <button
                  key={i}
                  onClick={() => { if (isActive) { setSelectedBrief(null); setStarRated(false); setReportExpanded(false); return } handleLoadHistoryBrief(h) }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
                    background: isActive ? `${C.accent2}14` : 'transparent',
                    border: 'none', borderBottom: '1px solid var(--border)',
                    borderLeft: `3px solid ${isActive ? C.accent2 : 'transparent'}`,
                    cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s',
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 11, color: C.text, fontFamily: 'var(--mono)', fontWeight: isActive ? 700 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {h.title || 'Intelligence Brief'}
                    </div>
                    <div style={{ fontSize: 10, color: C.text3, fontFamily: 'var(--mono)', marginTop: 2 }}>
                      {formatTimestamp(h.generatedAt || h.createdAt)}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
                    {rk && (
                      <span style={{
                        fontSize: 9, padding: '2px 7px', borderRadius: 10, fontFamily: 'var(--mono)', fontWeight: 700,
                        background: riskBg(rk), color: riskColor(rk), border: `1px solid ${riskBorder(rk)}`,
                        textTransform: 'uppercase',
                      }}>{rk}</span>
                    )}
                    {h.provider && <ProviderBadge provider={h.provider} />}
                    {h.totalScore != null && (
                      <span style={{ fontSize: 10, color: C.text3, fontFamily: 'var(--mono)' }}>{h.totalScore}/10</span>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        </Card>
      )}

      <style>{`@keyframes bounce { 0%,80%,100%{transform:translateY(0)} 40%{transform:translateY(-6px)} } @keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}

