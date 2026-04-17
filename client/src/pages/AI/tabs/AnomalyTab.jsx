import { Fragment, useState } from 'react'
import { C, selSx } from '../constants'
import { Card, ProviderBadge } from '../components/Common.jsx'
import { MeteringRow, StructuredResponse, TaskShell } from '../components/TaskSupport.jsx'
import { useTaskProgress } from '../hooks/useTaskProgress.js'
import { formatMetricName, formatTimestamp } from '../utils/common.js'
import { useAnomalyData } from '../hooks/useAnomalyData.js'

const SEV_COLOR = { critical: '#f5534f', high: '#f5a623', medium: '#4f7ef5', low: '#555a72' }
const SEV_BG    = { critical: 'rgba(245,83,79,0.12)', high: 'rgba(245,166,35,0.12)', medium: 'rgba(79,126,245,0.12)', low: 'rgba(85,90,114,0.12)' }
const SEV_BORDER= { critical: 'rgba(245,83,79,0.35)', high: 'rgba(245,166,35,0.35)', medium: 'rgba(79,126,245,0.35)', low: 'rgba(85,90,114,0.35)' }
const IMPROVEMENT_STATUS_COLOR = { pending: C.amber, applied: C.green, rejected: C.red }
const IMPROVEMENT_STATUS_BG = { pending: 'rgba(245,166,35,0.12)', applied: 'rgba(34,211,160,0.12)', rejected: 'rgba(245,83,79,0.12)' }
const IMPROVEMENT_STATUS_BORDER = { pending: 'rgba(245,166,35,0.35)', applied: 'rgba(34,211,160,0.35)', rejected: 'rgba(245,83,79,0.35)' }
const ML_MODEL_OPTIONS = [
  { value: 'baseline_anomaly', label: 'Baseline Anomaly' },
  { value: 'port_scan', label: 'Port Scan' },
  { value: 'brute_force', label: 'Brute Force' },
  { value: 'mac_flap', label: 'MAC Flap' },
]

const IMPROVEMENT_STEPS = [
  'Reviewing model performance...',
  'Generating improvement suggestions...',
  'Formatting advisor output...',
]

function ProgressBar({ pct }) {
  const color = pct < 30 ? C.red : pct < 70 ? C.amber : C.green
  return (
    <div style={{ height: 5, background: 'var(--bg4)', borderRadius: 3, overflow: 'hidden', marginTop: 4 }}>
      <div style={{ width: `${Math.min(pct, 100)}%`, height: '100%', background: color, borderRadius: 3, transition: 'width 0.4s' }} />
    </div>
  )
}

export default function AnomalyTab({ providerStatus, ollamaStatus, range, addToast }) {
  const [expandedHistory, setExpandedHistory] = useState(null)
  const {
    anomalyResult,
    anomalyHistory,
    baselineStatus,
    anomalyLoading,
    baselineLoading,
    sensitivity,
    setSensitivity,
    sources,
    toggleSource,
    feedback,
    mlModel,
    setMlModel,
    improvementStats,
    improvementHistory,
    improvementLoading,
    improvementError,
    improvementProvider,
    setImprovementProvider,
    improvementModel,
    setImprovementModel,
    latestImprovement,
    availableProviders,
    improvementOverrideModels,
    runDetection,
    buildBaseline,
    runScheduled,
    saveFeedback,
    requestImprovement,
    cancelImprovementRequest,
    retryImprovementRequest,
    applySuggestion,
    rejectSuggestion,
  } = useAnomalyData({
    range,
    providerStatus,
    ollamaStatus,
    addToast,
  })
  const { stageLabel, startedAt } = useTaskProgress(improvementLoading, IMPROVEMENT_STEPS, 3200)

  /* ── sensitivity options ───────────────────────────────────────── */
  const SENS_OPTS = [
    { label: 'Conservative 3σ', value: 3.0 },
    { label: 'Balanced 2σ',     value: 2.0 },
    { label: 'Sensitive 1.5σ',  value: 1.5 },
  ]

  const ALL_SOURCES = ['firewall', 'cisco', 'sentinel']

  /* ── render ────────────────────────────────────────────────────── */
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* ── 1. CONTROLS ROW ──────────────────────────────────────── */}
      <Card title="ANOMALY DETECTION CONTROLS" noPad>
        <div style={{ padding: '12px 14px', display: 'flex', alignItems: 'flex-start', gap: 24, flexWrap: 'wrap' }}>

          {/* left: run controls */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, flex: 1, minWidth: 280 }}>
            {/* sensitivity */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 10, color: C.text3, fontFamily: 'var(--mono)', whiteSpace: 'nowrap' }}>Sensitivity:</span>
              <div style={{ display: 'flex', gap: 4 }}>
                {SENS_OPTS.map(o => (
                  <button
                    key={o.value}
                    onClick={() => setSensitivity(o.value)}
                    style={{
                      fontSize: 10, padding: '4px 10px', borderRadius: 6, cursor: 'pointer',
                      fontFamily: 'var(--mono)', fontWeight: sensitivity === o.value ? 700 : 400,
                      background: sensitivity === o.value ? `${C.accent}22` : 'var(--bg4)',
                      color: sensitivity === o.value ? C.accent : C.text3,
                      border: `1px solid ${sensitivity === o.value ? C.accent : 'var(--border)'}`,
                      transition: 'all 0.15s',
                    }}
                  >{o.label}</button>
                ))}
              </div>
            </div>

            {/* sources */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 10, color: C.text3, fontFamily: 'var(--mono)', whiteSpace: 'nowrap' }}>Sources:</span>
              {ALL_SOURCES.map(src => (
                <label key={src} style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer', fontSize: 11, color: C.text2, fontFamily: 'var(--mono)' }}>
                  <input
                    type="checkbox"
                    checked={sources.includes(src)}
                    onChange={() => toggleSource(src)}
                    style={{ accentColor: C.accent, cursor: 'pointer' }}
                  />
                  {src.charAt(0).toUpperCase() + src.slice(1)}
                </label>
              ))}
            </div>
          </div>

          {/* right: action buttons */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              onClick={buildBaseline}
              disabled={baselineLoading}
              style={{
                fontSize: 11, padding: '7px 14px', borderRadius: 7, cursor: baselineLoading ? 'not-allowed' : 'pointer',
                background: baselineLoading ? 'var(--bg4)' : `${C.amber}22`,
                color: baselineLoading ? C.text3 : C.amber,
                border: `1px solid ${baselineLoading ? 'var(--border)' : `${C.amber}44`}`,
                fontFamily: 'var(--mono)', fontWeight: 600, transition: 'all 0.15s',
              }}
            >
              {baselineLoading ? '⏳ Building...' : '🔨 Build Baseline'}
            </button>

            <button
              onClick={runDetection}
              disabled={anomalyLoading || sources.length === 0}
              style={{
                fontSize: 11, padding: '7px 14px', borderRadius: 7, cursor: (anomalyLoading || sources.length === 0) ? 'not-allowed' : 'pointer',
                background: (anomalyLoading || sources.length === 0) ? 'var(--bg4)' : `${C.green}22`,
                color: (anomalyLoading || sources.length === 0) ? C.text3 : C.green,
                border: `1px solid ${(anomalyLoading || sources.length === 0) ? 'var(--border)' : `${C.green}44`}`,
                fontFamily: 'var(--mono)', fontWeight: 600, transition: 'all 0.15s',
              }}
            >
              {anomalyLoading ? '⏳ Detecting...' : '▶ Run Detection'}
            </button>

            <button
              onClick={runScheduled}
              style={{
                fontSize: 11, padding: '7px 14px', borderRadius: 7, cursor: 'pointer',
                background: `${C.accent2}22`, color: C.accent2,
                border: `1px solid ${C.accent2}44`,
                fontFamily: 'var(--mono)', fontWeight: 600, transition: 'all 0.15s',
              }}
            >
              ⚡ Run via Scheduler
            </button>
          </div>
        </div>
      </Card>

      {/* ── 2. BASELINE STATUS ───────────────────────────────────── */}
      <Card title="ML BASELINE STATUS" badge={`${baselineStatus.length} metrics`} badgeClass="blue" noPad>
        <div style={{ padding: '12px 14px' }}>
          {baselineStatus.length === 0 ? (
            <div style={{ color: C.text3, fontFamily: 'var(--mono)', fontSize: 11, padding: '12px 0', textAlign: 'center' }}>
              No baseline data yet — click <strong style={{ color: C.amber }}>Build Baseline</strong> to start training.
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
              {baselineStatus.map(b => {
                const pct = Math.round((b.completeness ?? 0) * 100)
                const slots = b.slotsLearned ?? b.slots_learned ?? 0
                const ready = pct >= 70
                return (
                  <div key={b.metric} style={{
                    background: 'var(--bg3)', borderRadius: 8, padding: '10px 12px',
                      border: `1px solid var(--border)`,
                      borderLeft: `3px solid ${pct < 30 ? C.red : pct < 70 ? C.amber : C.green}`,
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <span style={{ fontSize: 11, color: C.text, fontFamily: 'var(--mono)', fontWeight: 600 }}>
                        {formatMetricName(b.metric)}
                      </span>
                      <span style={{
                        fontSize: 9, padding: '1px 7px', borderRadius: 10, fontFamily: 'var(--mono)', fontWeight: 700,
                        background: ready ? 'rgba(34,211,160,0.15)' : 'rgba(245,166,35,0.15)',
                        color: ready ? C.green : C.amber,
                        border: `1px solid ${ready ? 'rgba(34,211,160,0.3)' : 'rgba(245,166,35,0.3)'}`,
                      }}>
                        {ready ? 'Ready' : 'Learning'}
                      </span>
                    </div>
                    <ProgressBar pct={pct} />
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 5, fontSize: 10, color: C.text3, fontFamily: 'var(--mono)' }}>
                      <span>{pct}% complete</span>
                      <span>{slots}/168 slots</span>
                    </div>
                    {b.updatedAt && (
                      <div style={{ fontSize: 9, color: C.text3, fontFamily: 'var(--mono)', marginTop: 3 }}>
                        Updated {formatTimestamp(b.updatedAt)}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </Card>

      {/* ── 3. DETECTION RESULTS ─────────────────────────────────── */}
      {anomalyResult && (
        <Card title="DETECTION RESULTS" noPad>
          {/* summary row */}
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 20, flexWrap: 'wrap' }}>
            {[
              ['Run time',  formatTimestamp(anomalyResult.runAt || anomalyResult.createdAt)],
              ['Range',     anomalyResult.dateRange ? `${anomalyResult.dateRange.from} → ${anomalyResult.dateRange.to}` : '—'],
              ['Sensitivity', `${anomalyResult.sensitivity ?? sensitivity}σ`],
              ['Checked',   `${anomalyResult.metricsChecked ?? anomalyResult.metrics_checked ?? '—'} metrics`],
              ['Anomalies', `${anomalyResult.anomalies?.length ?? 0} found`],
            ].map(([k, v]) => (
              <div key={k} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={{ fontSize: 9, color: C.text3, fontFamily: 'var(--mono)', textTransform: 'uppercase' }}>{k}</span>
                <span style={{ fontSize: 11, color: C.text, fontFamily: 'var(--mono)', fontWeight: 600 }}>{v}</span>
              </div>
            ))}
          </div>

          <div style={{ padding: '12px 14px' }}>
            {(!anomalyResult.anomalies || anomalyResult.anomalies.length === 0) ? (
              <div style={{ background: 'rgba(34,211,160,0.08)', border: '1px solid rgba(34,211,160,0.25)', borderRadius: 10, padding: '20px 24px', textAlign: 'center' }}>
                <div style={{ fontSize: 22, marginBottom: 6 }}>✅</div>
                <div style={{ color: C.green, fontFamily: 'var(--mono)', fontSize: 13, fontWeight: 700 }}>Network Normal — No anomalies detected</div>
                <div style={{ color: C.text3, fontFamily: 'var(--mono)', fontSize: 11, marginTop: 4 }}>
                  All {anomalyResult.metricsChecked ?? anomalyResult.metrics_checked ?? ''} metrics within normal baseline ranges
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {anomalyResult.anomalies.map((a, i) => {
                  const sev = (a.severity || 'medium').toLowerCase()
                  const fbKey = `${anomalyResult._id || anomalyResult.id}_${i}`
                  const myFb = feedback[fbKey]
                  return (
                    <div key={i} style={{
                      background: SEV_BG[sev] || SEV_BG.medium,
                      border: `1px solid ${SEV_BORDER[sev] || SEV_BORDER.medium}`,
                      borderLeft: `4px solid ${SEV_COLOR[sev] || SEV_COLOR.medium}`,
                      borderRadius: 8, padding: '12px 14px',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6, flexWrap: 'wrap' }}>
                        <span style={{
                          fontSize: 10, padding: '2px 9px', borderRadius: 10, fontFamily: 'var(--mono)', fontWeight: 700,
                          background: SEV_BG[sev], color: SEV_COLOR[sev], border: `1px solid ${SEV_BORDER[sev]}`,
                          textTransform: 'uppercase',
                        }}>{sev}</span>
                        <span style={{ fontSize: 12, color: C.text, fontFamily: 'var(--mono)', fontWeight: 600 }}>
                          {formatMetricName(a.metric)}
                        </span>
                        {a.deviation != null && (
                          <span style={{ fontSize: 10, color: C.text3, fontFamily: 'var(--mono)', marginLeft: 'auto' }}>
                            {Number(a.deviation).toFixed(1)}σ above normal
                          </span>
                        )}
                      </div>

                      {a.description && (
                        <div style={{ fontSize: 11, color: C.text2, fontFamily: 'var(--mono)', marginBottom: 6, lineHeight: 1.5 }}>
                          {a.description}
                        </div>
                      )}

                      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', marginBottom: 8 }}>
                        {a.currentValue != null && (
                          <span style={{ fontSize: 10, color: C.text3, fontFamily: 'var(--mono)' }}>
                            Current: <span style={{ color: SEV_COLOR[sev], fontWeight: 600 }}>{Number(a.currentValue).toFixed(2)}</span>
                          </span>
                        )}
                        {a.baselineValue != null && (
                          <span style={{ fontSize: 10, color: C.text3, fontFamily: 'var(--mono)' }}>
                            Baseline: <span style={{ color: C.text2, fontWeight: 600 }}>{Number(a.baselineValue).toFixed(2)}</span>
                          </span>
                        )}
                      </div>

                      {a.recommendation && (
                        <div style={{ fontSize: 10, color: C.text3, fontFamily: 'var(--mono)', borderTop: '1px solid var(--border)', paddingTop: 6, marginBottom: 8, lineHeight: 1.5 }}>
                          💡 {a.recommendation}
                        </div>
                      )}

                      {/* feedback */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        {myFb ? (
                          <span style={{ fontSize: 10, color: C.green, fontFamily: 'var(--mono)' }}>
                            Feedback saved: {myFb === 'true_positive' ? '✓ True Positive' : myFb === 'false_positive' ? '✗ False Positive' : '? Unsure'}
                          </span>
                        ) : (
                          <>
                            {[
                              { key: 'true_positive',  label: '✓ True Positive',  color: C.green },
                              { key: 'false_positive', label: '✗ False Positive', color: C.red   },
                              { key: 'unsure', label: '? Unsure',         color: C.text3 },
                            ].map(fb => (
                              <button
                                key={fb.key}
                                onClick={() => saveFeedback(anomalyResult._id || anomalyResult.id, i, fb.key)}
                                style={{
                                  fontSize: 10, padding: '3px 9px', borderRadius: 5, cursor: 'pointer',
                                  background: 'var(--bg4)', color: fb.color,
                                  border: `1px solid ${fb.color}44`,
                                  fontFamily: 'var(--mono)', transition: 'all 0.15s',
                                }}
                              >{fb.label}</button>
                            ))}
                          </>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </Card>
      )}

      {/* ── 4. HISTORY TABLE ─────────────────────────────────────── */}
      <Card title="DETECTION HISTORY" badge={anomalyHistory.length} badgeClass="blue" noPad>
        {anomalyHistory.length === 0 ? (
          <div style={{ padding: '20px 14px', textAlign: 'center', color: C.text3, fontFamily: 'var(--mono)', fontSize: 11 }}>
            No detection runs yet
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, fontFamily: 'var(--mono)' }}>
              <thead>
                <tr style={{ background: 'var(--bg3)', borderBottom: '1px solid var(--border)' }}>
                  {['Time', 'Range', 'Sensitivity', 'Checked', 'Anomalies', 'Duration', ''].map(h => (
                    <th key={h} style={{ padding: '7px 12px', textAlign: 'left', color: C.text3, fontWeight: 600, fontSize: 10, whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {anomalyHistory.slice(0, 10).map((row, i) => {
                  const count = row.anomalies?.length ?? row.anomalyCount ?? 0
                  const isExpanded = expandedHistory === i
                  return (
                    <Fragment key={row._id || row.id || i}>
                      <tr style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 0 ? 'transparent' : 'var(--bg3)' }}>
                        <td style={{ padding: '7px 12px', color: C.text2, whiteSpace: 'nowrap' }}>{formatTimestamp(row.runAt || row.createdAt)}</td>
                        <td style={{ padding: '7px 12px', color: C.text3, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {row.dateRange ? `${row.dateRange.from}` : '—'}
                        </td>
                        <td style={{ padding: '7px 12px', color: C.text3 }}>{row.sensitivity ?? '—'}σ</td>
                        <td style={{ padding: '7px 12px', color: C.text3 }}>{row.metricsChecked ?? row.metrics_checked ?? '—'}</td>
                        <td style={{ padding: '7px 12px' }}>
                          <span style={{
                            fontSize: 10, padding: '2px 8px', borderRadius: 10, fontWeight: 700,
                            background: count > 0 ? 'rgba(245,83,79,0.12)' : 'rgba(34,211,160,0.1)',
                            color: count > 0 ? C.red : C.green,
                            border: `1px solid ${count > 0 ? 'rgba(245,83,79,0.3)' : 'rgba(34,211,160,0.25)'}`,
                          }}>{count}</span>
                        </td>
                        <td style={{ padding: '7px 12px', color: C.text3 }}>
                          {row.durationMs ? `${(row.durationMs / 1000).toFixed(1)}s` : '—'}
                        </td>
                        <td style={{ padding: '7px 12px' }}>
                          <button
                            onClick={() => setExpandedHistory(isExpanded ? null : i)}
                            style={{ fontSize: 10, padding: '3px 9px', borderRadius: 5, cursor: 'pointer', background: 'var(--bg4)', color: C.accent, border: `1px solid ${C.accent}33`, fontFamily: 'var(--mono)' }}
                          >{isExpanded ? 'Hide' : 'View'}</button>
                        </td>
                      </tr>
                      {isExpanded && row.anomalies?.length > 0 && (
                        <tr>
                          <td colSpan={7} style={{ padding: '0 12px 12px' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingTop: 8 }}>
                              {row.anomalies.map((a, ai) => {
                                const sev = (a.severity || 'medium').toLowerCase()
                                return (
                                  <div key={ai} style={{ padding: '8px 12px', borderRadius: 6, background: SEV_BG[sev], border: `1px solid ${SEV_BORDER[sev]}`, borderLeft: `3px solid ${SEV_COLOR[sev]}`, fontSize: 11, color: C.text2, fontFamily: 'var(--mono)' }}>
                                    <span style={{ color: SEV_COLOR[sev], fontWeight: 700, marginRight: 8, textTransform: 'uppercase' }}>{sev}</span>
                                    <span style={{ color: C.text, fontWeight: 600, marginRight: 8 }}>{formatMetricName(a.metric)}</span>
                                    {a.description}
                                  </div>
                                )
                              })}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* ── 5. ML IMPROVEMENT ───────────────────────────────────── */}      
      <Card title="ML IMPROVEMENT ADVISOR" badge={mlModel.replace(/_/g, ' ').toUpperCase()} badgeClass="purple" noPad>
        <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 10, color: C.text3, fontFamily: 'var(--mono)' }}>Model:</span>
            <select value={mlModel} onChange={e => setMlModel(e.target.value)} style={selSx}>
              {ML_MODEL_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
            </select>

            <span style={{ fontSize: 10, color: C.text3, fontFamily: 'var(--mono)' }}>Provider:</span>
            <select
              value={improvementProvider || 'default'}
              onChange={e => { setImprovementProvider(e.target.value === 'default' ? null : e.target.value); setImprovementModel(null) }}
              style={selSx}
            >
              <option value="default">Use Task Config</option>
              {availableProviders.map(p => <option key={p} value={p}>{p}</option>)}
            </select>

            {improvementProvider && (
              <select
                value={improvementModel || 'auto'}
                onChange={e => setImprovementModel(e.target.value === 'auto' ? null : e.target.value)}
                style={selSx}
              >
                <option value="auto">auto</option>
                {improvementOverrideModels.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            )}

            <div style={{ flex: 1 }} />

            <button
              onClick={requestImprovement}
              disabled={improvementLoading}
              style={{
                fontSize: 11, padding: '7px 14px', borderRadius: 7,
                cursor: improvementLoading ? 'not-allowed' : 'pointer',
                background: improvementLoading ? 'var(--bg4)' : `${C.accent2}22`,
                color: improvementLoading ? C.text3 : C.accent2,
                border: `1px solid ${improvementLoading ? 'var(--border)' : `${C.accent2}44`}`,
                fontFamily: 'var(--mono)', fontWeight: 600,
              }}
            >
              {improvementLoading ? '⏳ Analyzing...' : '✨ Request Improvement'}
            </button>
          </div>

          <TaskShell
            title="Improvement advisor"
            loading={improvementLoading}
            error={improvementError}
            steps={IMPROVEMENT_STEPS}
            stageLabel={stageLabel}
            startedAt={startedAt}
            onRetry={retryImprovementRequest}
            onCancel={cancelImprovementRequest}
          />

          {improvementStats && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10 }}>
              {[
                ['Runs', improvementStats.totalRuns ?? 0],
                ['Anomalies', improvementStats.totalAnomalies ?? 0],
                ['False Positives', improvementStats.falsePositives ?? 0],
                ['True Positives', improvementStats.truePositives ?? 0],
                ['Unreviewed', improvementStats.unreviewed ?? 0],
                ['FP Rate', improvementStats.falsePositiveRate != null ? `${(improvementStats.falsePositiveRate * 100).toFixed(1)}%` : '—'],
              ].map(([label, value]) => (
                <div key={label} style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px' }}>
                  <div style={{ fontSize: 9, color: C.text3, fontFamily: 'var(--mono)', textTransform: 'uppercase', marginBottom: 4 }}>{label}</div>
                  <div style={{ fontSize: 14, color: C.text, fontFamily: 'var(--mono)', fontWeight: 700 }}>{value}</div>
                </div>
              ))}
            </div>
          )}

          {latestImprovement && (
            <div style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderLeft: `4px solid ${C.accent2}`, borderRadius: 8, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 11, color: C.text, fontFamily: 'var(--mono)', fontWeight: 700 }}>LATEST SUGGESTION</span>
                <span style={{
                  fontSize: 9, padding: '2px 8px', borderRadius: 10, fontFamily: 'var(--mono)', fontWeight: 700,
                  color: IMPROVEMENT_STATUS_COLOR[latestImprovement.status || 'pending'],
                  background: IMPROVEMENT_STATUS_BG[latestImprovement.status || 'pending'],
                  border: `1px solid ${IMPROVEMENT_STATUS_BORDER[latestImprovement.status || 'pending']}`,
                  textTransform: 'uppercase',
                }}>
                  {latestImprovement.status || 'pending'}
                </span>
                {latestImprovement.provider && <ProviderBadge provider={latestImprovement.provider} />}
              </div>

              <MeteringRow
                metering={latestImprovement.metering}
                provider={latestImprovement.provider}
                model={latestImprovement.model}
                responseTimeMs={latestImprovement.responseTimeMs}
                tokensUsed={latestImprovement.tokensUsed}
              />

              <StructuredResponse display={latestImprovement.display} fallbackText={latestImprovement.suggestion?.analysis} />

              {(latestImprovement.status || 'pending') === 'pending' && latestImprovement.id && (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button
                    onClick={() => applySuggestion(latestImprovement.id)}
                    style={{
                      fontSize: 11, padding: '7px 12px', borderRadius: 7, cursor: 'pointer',
                      background: `${C.green}22`, color: C.green, border: `1px solid ${C.green}44`,
                      fontFamily: 'var(--mono)', fontWeight: 600,
                    }}
                  >
                    ✓ Apply Suggestion
                  </button>
                  <button
                    onClick={() => rejectSuggestion(latestImprovement.id)}
                    style={{
                      fontSize: 11, padding: '7px 12px', borderRadius: 7, cursor: 'pointer',
                      background: `${C.red}18`, color: C.red, border: `1px solid ${C.red}44`,
                      fontFamily: 'var(--mono)', fontWeight: 600,
                    }}
                  >
                    ✕ Reject
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </Card>

      <Card title="IMPROVEMENT HISTORY" badge={improvementHistory.length} badgeClass="blue" noPad>
        {improvementHistory.length === 0 ? (
          <div style={{ padding: '20px 14px', textAlign: 'center', color: C.text3, fontFamily: 'var(--mono)', fontSize: 11 }}>
            No ML improvement suggestions yet
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {improvementHistory.slice(0, 10).map((item, i) => {
              const status = item.status || 'pending'
              return (
                <div key={item._id || i} style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)', background: i % 2 === 0 ? 'transparent' : 'var(--bg3)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                    <span style={{ fontSize: 11, color: C.text, fontFamily: 'var(--mono)', fontWeight: 700 }}>{formatTimestamp(item.createdAt)}</span>
                    <span style={{
                      fontSize: 9, padding: '2px 8px', borderRadius: 10, fontFamily: 'var(--mono)', fontWeight: 700,
                      color: IMPROVEMENT_STATUS_COLOR[status],
                      background: IMPROVEMENT_STATUS_BG[status],
                      border: `1px solid ${IMPROVEMENT_STATUS_BORDER[status]}`,
                      textTransform: 'uppercase',
                    }}>
                      {status}
                    </span>
                    {item.aiProvider && <ProviderBadge provider={item.aiProvider} />}
                    {item.aiModel && (
                      <span style={{ fontSize: 10, color: C.text3, fontFamily: 'var(--mono)' }}>{item.aiModel}</span>
                    )}
                  </div>

                  <div style={{ fontSize: 11, color: C.text2, lineHeight: 1.6, marginBottom: 8 }}>
                    {item.aiSuggestion?.slice(0, 220) || 'No suggestion text'}
                    {(item.aiSuggestion?.length || 0) > 220 ? '...' : ''}
                  </div>

                  {item.suggestedChanges?.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {item.suggestedChanges.slice(0, 3).map((chg, idx) => (
                        <div key={idx} style={{ fontSize: 10, color: C.text3, fontFamily: 'var(--mono)' }}>
                          {chg.field || 'setting'}: {chg.oldValue ?? '—'} → {chg.newValue ?? '—'}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </Card>
    </div>
  )
}

