import { useState } from 'react'
import {
  aiAPI,
  AI_TIMEOUT_OPTIONS,
  DEFAULT_AI_TIMEOUT_MS,
  getAIRequestTimeoutMs,
  setAIRequestTimeoutMs,
} from '../../../api/ai.js'
import { C, PROVIDER_MODELS, SCHEDULE_LABELS, POPULAR_MODELS, selSx } from '../constants'
import { Card } from '../components/Common.jsx'
import { getProviderOverrideModels } from '../utils/common.js'

export default function SettingsTab({
  configs,
  setConfigs,
  providerStatus,
  ollamaStatus,
  schedulerStatus,
  setSchedulerStatus,
  addToast,
  onRefresh,
}) {
  const [saving, setSaving] = useState({})
  const [pullModel, setPullModel] = useState('')
  const [pulling, setPulling] = useState(false)
  const [aiTimeoutMs, setAiTimeoutMs] = useState(() => getAIRequestTimeoutMs())

  const setSav = (key, val) => setSaving(s => ({ ...s, [key]: val }))
  const ollamaModels = getProviderOverrideModels('ollama', providerStatus, ollamaStatus)

  async function saveConfig(task, patch) {
    setSav(task, true)
    try {
      const { data } = await aiAPI.updateConfig(task, patch)
      setConfigs(prev => prev.map(c => (c.task === task ? { ...c, ...data } : c)))
      addToast(`${task} config saved`, 'success')
    } catch (err) {
      addToast(err.response?.data?.error || err.message, 'error')
    } finally {
      setSav(task, false)
    }
  }

  async function toggleAuto(task) {
    setSav(`auto_${task}`, true)
    try {
      const { data } = await aiAPI.toggleAuto(task)
      setConfigs(prev => prev.map(c => (c.task === task ? { ...c, autoEnabled: data.autoEnabled } : c)))
      addToast(data.message, 'success')
    } catch (err) {
      addToast(err.response?.data?.error || err.message, 'error')
    } finally {
      setSav(`auto_${task}`, false)
    }
  }

  async function runNow(task) {
    setSav(`run_${task}`, true)
    try {
      await aiAPI.runNow(task)
      addToast(`${task} started`, 'success')
      setTimeout(onRefresh, 2000)
    } catch (err) {
      addToast(err.response?.data?.error || err.message, 'error')
    } finally {
      setSav(`run_${task}`, false)
    }
  }

  async function toggleScheduler(task, currentlyEnabled) {
    try {
      if (currentlyEnabled) {
        await aiAPI.stopScheduler(task)
        addToast(`Scheduler stopped for ${task}`, 'success')
      } else {
        await aiAPI.startScheduler(task)
        addToast(`Scheduler started for ${task}`, 'success')
      }
      onRefresh()
    } catch (err) {
      addToast(err.response?.data?.error || err.message, 'error')
    }
  }

  async function doPull(modelName) {
    if (!modelName.trim()) return
    setPulling(true)
    try {
      await aiAPI.pullModel(modelName.trim())
      addToast(`${modelName} pull initiated`, 'success')
      setPullModel('')
      setTimeout(onRefresh, 3000)
    } catch (err) {
      addToast(err.response?.data?.error || err.message, 'error')
    } finally {
      setPulling(false)
    }
  }

  function StatusBadge({ status }) {
    const map = { never: ['text3', '—'], success: ['green', 'success'], failed: ['red', 'failed'], running: ['cyan', 'running'] }
    const [col, lbl] = map[status] || ['text3', status || '—']
    return <span className={`badge badge-${col === 'text3' ? 'blue' : col}`} style={{ fontSize: 9 }}>{lbl}</span>
  }

  const taskNames = { chat: 'Chat', anomaly: 'Anomaly', triage: 'Triage', brief: 'Brief', search: 'Search', comparison: 'Comparison' }

  function saveTimeout(nextTimeoutMs) {
    setAiTimeoutMs(nextTimeoutMs)
    setAIRequestTimeoutMs(nextTimeoutMs)
    addToast(`AI request timeout set to ${Math.round(nextTimeoutMs / 1000)} seconds`, 'success')
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card title="AI EXPERIENCE" badge="CLIENT-SIDE REQUEST CONTROL" badgeClass="amber">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 280 }}>
            <span style={{ fontSize: 11, color: C.text, fontFamily: 'var(--mono)', fontWeight: 600 }}>
              AI request timeout
            </span>
            <span style={{ fontSize: 10, color: C.text3, fontFamily: 'var(--mono)', lineHeight: 1.6 }}>
              Controls how long the browser will wait for long AI tasks like Chat, Brief, Triage, Search, Model Lab, and ML analysis before showing a timeout error.
            </span>
          </div>

          <select value={aiTimeoutMs} onChange={e => saveTimeout(Number(e.target.value))} style={selSx}>
            {AI_TIMEOUT_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>

          <div style={{ fontSize: 10, color: C.text3, fontFamily: 'var(--mono)' }}>
            Default: {Math.round(DEFAULT_AI_TIMEOUT_MS / 1000)}s
          </div>
        </div>
      </Card>

      <Card title="TASK CONFIGURATION" badge="PER-TASK AI ROUTING" badgeClass="purple" noPad>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, fontFamily: 'var(--mono)' }}>
            <thead>
              <tr style={{ background: 'var(--bg3)' }}>
                {['Task', 'Provider', 'Model', 'Auto', 'Schedule', 'Last Run', 'Status', ''].map(h => (
                  <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontSize: 10, color: C.text3, fontWeight: 600, letterSpacing: 0.5, borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {configs.map(cfg => {
                const models = cfg.provider === 'ollama'
                  ? ['auto', ...ollamaModels]
                  : PROVIDER_MODELS[cfg.provider] || ['auto']
                return (
                  <tr key={cfg.task} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '8px 12px', color: C.text, fontWeight: 600, whiteSpace: 'nowrap' }}>
                      {taskNames[cfg.task] || cfg.task}
                    </td>
                    <td style={{ padding: '8px 12px' }}>
                      <select
                        value={cfg.provider}
                        disabled={!!saving[cfg.task]}
                        style={selSx}
                        onChange={e => saveConfig(cfg.task, { provider: e.target.value, model: 'auto' })}
                      >
                        {['claude', 'openai', 'ollama'].map(p => <option key={p} value={p}>{p}</option>)}
                      </select>
                    </td>
                    <td style={{ padding: '8px 12px' }}>
                      <select
                        value={cfg.model}
                        disabled={!!saving[cfg.task]}
                        style={{ ...selSx, maxWidth: 200 }}
                        onChange={e => saveConfig(cfg.task, { model: e.target.value })}
                      >
                        {models.map(m => <option key={m} value={m}>{m}</option>)}
                      </select>
                    </td>
                    <td style={{ padding: '8px 12px' }}>
                      <button
                        onClick={() => toggleAuto(cfg.task)}
                        disabled={!!saving[`auto_${cfg.task}`]}
                        style={{
                          width: 42, height: 22, borderRadius: 11, border: 'none', cursor: 'pointer', position: 'relative',
                          background: cfg.autoEnabled ? C.accent2 : 'var(--bg4)', transition: 'background 0.2s',
                        }}
                      >
                        <span
                          style={{
                            position: 'absolute',
                            top: 3,
                            left: cfg.autoEnabled ? 22 : 3,
                            width: 16,
                            height: 16,
                            borderRadius: '50%',
                            background: '#fff',
                            transition: 'left 0.2s',
                          }}
                        />
                      </button>
                    </td>
                    <td style={{ padding: '8px 12px' }}>
                      {cfg.autoEnabled ? (
                        <select
                          value={cfg.schedule}
                          disabled={!!saving[cfg.task]}
                          style={selSx}
                          onChange={e => saveConfig(cfg.task, { schedule: e.target.value })}
                        >
                          {Object.entries(SCHEDULE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                        </select>
                      ) : (
                        <span style={{ color: C.text3, fontSize: 11 }}>—</span>
                      )}
                    </td>
                    <td style={{ padding: '8px 12px', color: C.text3, fontSize: 11, whiteSpace: 'nowrap' }}>
                      {cfg.lastRun ? new Date(cfg.lastRun).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
                    </td>
                    <td style={{ padding: '8px 12px' }}>
                      <StatusBadge status={cfg.lastRunStatus} />
                    </td>
                    <td style={{ padding: '8px 12px' }}>
                      {saving[cfg.task] && <span style={{ color: C.amber, fontSize: 10 }}>saving…</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="PROVIDER STATUS" badge="3 PROVIDERS" badgeClass="blue">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
          {(() => {
            const ready = providerStatus?.claude?.ready
            return (
              <div style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 10, padding: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <span style={{ fontSize: 20 }}>🟣</span>
                  <span style={{ fontWeight: 700, fontSize: 13, color: C.text }}>Claude</span>
                  <span className={`badge badge-${ready ? 'green' : 'red'}`} style={{ marginLeft: 'auto' }}>
                    {ready ? 'Ready' : 'No API Key'}
                  </span>
                </div>
                <div style={{ fontSize: 10, color: C.text3, fontFamily: 'var(--mono)' }}>Anthropic API</div>
                {!ready && <div style={{ fontSize: 10, color: C.amber, marginTop: 6, fontFamily: 'var(--mono)' }}>Set ANTHROPIC_API_KEY in .env</div>}
                {ready && <div style={{ fontSize: 10, color: C.text3, marginTop: 6, fontFamily: 'var(--mono)' }}>Models: claude-sonnet-4, claude-opus-4</div>}
              </div>
            )
          })()}

          {(() => {
            const ready = providerStatus?.openai?.ready
            return (
              <div style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 10, padding: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <span style={{ fontSize: 20 }}>🟢</span>
                  <span style={{ fontWeight: 700, fontSize: 13, color: C.text }}>OpenAI</span>
                  <span className={`badge badge-${ready ? 'green' : 'red'}`} style={{ marginLeft: 'auto' }}>
                    {ready ? 'Ready' : 'No API Key'}
                  </span>
                </div>
                <div style={{ fontSize: 10, color: C.text3, fontFamily: 'var(--mono)' }}>OpenAI API</div>
                {!ready && <div style={{ fontSize: 10, color: C.amber, marginTop: 6, fontFamily: 'var(--mono)' }}>Set OPENAI_API_KEY in .env</div>}
                {ready && <div style={{ fontSize: 10, color: C.text3, marginTop: 6, fontFamily: 'var(--mono)' }}>Models: gpt-4o, gpt-4o-mini, gpt-4-turbo</div>}
              </div>
            )
          })()}

          {(() => {
            const ready = ollamaStatus?.connected
            const models = ollamaStatus?.models || []
            return (
              <div style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 10, padding: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <span style={{ fontSize: 20 }}>🟡</span>
                  <span style={{ fontWeight: 700, fontSize: 13, color: C.text }}>Ollama</span>
                  <span className={`badge badge-${ready ? 'green' : 'red'}`} style={{ marginLeft: 'auto' }}>
                    {ready ? 'Connected' : 'Offline'}
                  </span>
                </div>
                <div style={{ fontSize: 10, color: C.text3, fontFamily: 'var(--mono)', marginBottom: 4 }}>
                  {ollamaStatus?.host || 'http://localhost:11434'}
                </div>
                <div style={{ fontSize: 10, color: C.text3, fontFamily: 'var(--mono)', marginBottom: 8 }}>
                  {models.length} model{models.length !== 1 ? 's' : ''} installed
                </div>
                {models.slice(0, 3).map(m => (
                  <div key={m.name} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: C.text2, fontFamily: 'var(--mono)', marginBottom: 2 }}>
                    <span>{m.name}</span>
                    <span style={{ color: C.text3 }}>{m.sizeGB ? `${m.sizeGB} GB` : ''}</span>
                  </div>
                ))}
                {models.length > 3 && <div style={{ fontSize: 10, color: C.text3, fontFamily: 'var(--mono)', marginTop: 2 }}>+{models.length - 3} more</div>}
              </div>
            )
          })()}
        </div>
      </Card>

      {ollamaStatus?.connected && (
        <Card title="OLLAMA MODEL MANAGER" badge={`${(ollamaStatus?.models || []).length} INSTALLED`} badgeClass="amber">
          <div style={{ marginBottom: 16 }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, fontFamily: 'var(--mono)' }}>
                <thead>
                  <tr>
                    {['Model', 'Size', 'Modified', ''].map(h => (
                      <th key={h} style={{ padding: '6px 10px', textAlign: 'left', fontSize: 10, color: C.text3, fontWeight: 600, borderBottom: '1px solid var(--border)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(ollamaStatus?.models || []).map(m => (
                    <tr key={m.name} style={{ borderBottom: '1px solid rgba(99,120,200,0.08)' }}>
                      <td style={{ padding: '7px 10px', color: C.text }}>{m.name}</td>
                      <td style={{ padding: '7px 10px', color: C.text3 }}>{m.sizeGB ? `${m.sizeGB} GB` : '—'}</td>
                      <td style={{ padding: '7px 10px', color: C.text3 }}>
                        {m.modified ? new Date(m.modified).toLocaleDateString() : '—'}
                      </td>
                      <td style={{ padding: '7px 10px' }}>
                        <button
                          onClick={() => saveConfig('search', { provider: 'ollama', model: m.name })}
                          style={{ fontSize: 10, padding: '3px 10px', borderRadius: 5, border: `1px solid ${C.accent2}40`, background: `${C.accent2}15`, color: C.accent2, cursor: 'pointer', fontFamily: 'var(--mono)' }}
                        >
                          Use
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
            <div style={{ fontSize: 11, color: C.text2, fontFamily: 'var(--mono)', marginBottom: 8, fontWeight: 600 }}>PULL NEW MODEL</div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
              <input
                value={pullModel}
                onChange={e => setPullModel(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && doPull(pullModel)}
                placeholder="e.g. llama3.2, mistral, phi3"
                style={{ flex: 1, background: 'var(--bg4)', border: '1px solid var(--border)', color: C.text, borderRadius: 6, padding: '6px 10px', fontSize: 11, fontFamily: 'var(--mono)', outline: 'none' }}
              />
              <button
                onClick={() => doPull(pullModel)}
                disabled={pulling || !pullModel.trim()}
                style={{ padding: '6px 16px', borderRadius: 6, border: 'none', background: pulling ? 'var(--bg4)' : C.accent2, color: '#fff', fontSize: 11, fontFamily: 'var(--mono)', cursor: pulling ? 'not-allowed' : 'pointer', fontWeight: 600 }}
              >
                {pulling ? 'Pulling…' : 'Pull Model'}
              </button>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              <span style={{ fontSize: 10, color: C.text3, fontFamily: 'var(--mono)', alignSelf: 'center' }}>Popular:</span>
              {POPULAR_MODELS.map(m => (
                <button
                  key={m}
                  onClick={() => doPull(m)}
                  disabled={pulling}
                  style={{ fontSize: 10, padding: '3px 10px', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--bg4)', color: C.text2, cursor: 'pointer', fontFamily: 'var(--mono)' }}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>
        </Card>
      )}

      <Card title="AUTOMATION SCHEDULER" badge={`${schedulerStatus.filter(s => s.autoEnabled).length} ACTIVE`} badgeClass="cyan" noPad>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, fontFamily: 'var(--mono)' }}>
            <thead>
              <tr style={{ background: 'var(--bg3)' }}>
                {['Task', 'Auto', 'Schedule', 'Last Run', 'Status', 'Next Run', 'Actions'].map(h => (
                  <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontSize: 10, color: C.text3, fontWeight: 600, letterSpacing: 0.5, borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {schedulerStatus.map(s => (
                <tr key={s.task} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '8px 12px', color: C.text, fontWeight: 600 }}>
                    {taskNames[s.task] || s.task}
                    {s.isRunning && <span style={{ marginLeft: 6, fontSize: 9, color: C.cyan }}>● running</span>}
                  </td>
                  <td style={{ padding: '8px 12px' }}>
                    <button
                      onClick={() => toggleScheduler(s.task, s.autoEnabled)}
                      style={{
                        width: 42,
                        height: 22,
                        borderRadius: 11,
                        border: 'none',
                        cursor: 'pointer',
                        position: 'relative',
                        background: s.autoEnabled ? C.green : 'var(--bg4)',
                        transition: 'background 0.2s',
                      }}
                    >
                      <span
                        style={{
                          position: 'absolute',
                          top: 3,
                          left: s.autoEnabled ? 22 : 3,
                          width: 16,
                          height: 16,
                          borderRadius: '50%',
                          background: '#fff',
                          transition: 'left 0.2s',
                        }}
                      />
                    </button>
                  </td>
                  <td style={{ padding: '8px 12px', color: C.text3, fontSize: 11 }}>
                    {SCHEDULE_LABELS[s.schedule] || s.schedule || '—'}
                  </td>
                  <td style={{ padding: '8px 12px', color: C.text3, fontSize: 11, whiteSpace: 'nowrap' }}>
                    {s.lastRun ? new Date(s.lastRun).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
                  </td>
                  <td style={{ padding: '8px 12px' }}>
                    <span className={`badge badge-${s.lastRunStatus === 'success' ? 'green' : s.lastRunStatus === 'failed' ? 'red' : s.lastRunStatus === 'running' ? 'cyan' : 'blue'}`} style={{ fontSize: 9 }}>
                      {s.lastRunStatus || 'never'}
                    </span>
                  </td>
                  <td style={{ padding: '8px 12px', color: C.text3, fontSize: 11, whiteSpace: 'nowrap' }}>
                    {s.nextRun ? new Date(s.nextRun).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
                  </td>
                  <td style={{ padding: '8px 12px' }}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        onClick={() => runNow(s.task)}
                        disabled={!!saving[`run_${s.task}`] || s.isRunning}
                        style={{ fontSize: 10, padding: '3px 10px', borderRadius: 5, border: `1px solid ${C.accent}40`, background: `${C.accent}15`, color: C.accent, cursor: 'pointer', fontFamily: 'var(--mono)', whiteSpace: 'nowrap' }}
                      >
                        {saving[`run_${s.task}`] ? '…' : 'Run Now'}
                      </button>
                      <button
                        onClick={() => toggleScheduler(s.task, s.autoEnabled)}
                        style={{ fontSize: 10, padding: '3px 10px', borderRadius: 5, border: `1px solid ${s.autoEnabled ? C.red : C.green}40`, background: `${s.autoEnabled ? C.red : C.green}15`, color: s.autoEnabled ? C.red : C.green, cursor: 'pointer', fontFamily: 'var(--mono)' }}
                      >
                        {s.autoEnabled ? 'Stop' : 'Start'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
