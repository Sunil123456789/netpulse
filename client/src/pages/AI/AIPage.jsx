import { useState, useEffect, useCallback, useRef, Fragment } from 'react'
import RangePicker from '../../components/ui/RangePicker.jsx'
import {
  aiAPI,
  mlAPI,
  AI_TIMEOUT_OPTIONS,
  DEFAULT_AI_TIMEOUT_MS,
  getAIRequestTimeoutMs,
  setAIRequestTimeoutMs,
} from '../../api/ai.js'
import { ticketsAPI } from '../../api/tickets.js'

/* ─── colour palette ──────────────────────────────────────────────── */
const C = {
  accent: '#4f7ef5', accent2: '#7c5cfc', green: '#22d3a0',
  red: '#f5534f', amber: '#f5a623', cyan: '#22d3ee',
  text: '#e8eaf2', text2: '#8b90aa', text3: '#555a72',
}

const TABS = [
  { id: 'chat',     label: 'Chat',      icon: '💬' },
  { id: 'anomaly',  label: 'Anomaly',   icon: '📈' },
  { id: 'triage',   label: 'Triage',    icon: '🎯' },
  { id: 'brief',    label: 'Brief',     icon: '📋' },
  { id: 'search',   label: 'Search',    icon: '🔍' },
  { id: 'modellab', label: 'Model Lab', icon: '🧪' },
  { id: 'settings', label: 'Settings',  icon: '⚙️' },
]

const PROVIDER_MODELS = {
  claude: ['auto', 'claude-sonnet-4-20250514', 'claude-opus-4-20250514'],
  openai: ['auto', 'gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo'],
  ollama: [],
}

const SCHEDULE_LABELS = {
  every_15m: 'Every 15 min', every_hour: 'Every hour',
  every_6h: 'Every 6 h', every_12h: 'Every 12 h',
  daily_6am: 'Daily 6am', daily_9am: 'Daily 9am', manual: 'Manual',
}

const POPULAR_MODELS = ['llama3.2', 'llama3.2:3b', 'mistral', 'codellama', 'gemma2', 'phi3']

/* ─── shared helpers ──────────────────────────────────────────────── */
function Card({ title, badge, badgeClass = 'blue', children, noPad, style }) {
  return (
    <div className="card" style={style}>
      <div className="card-header">
        <span className="card-title">{title}</span>
        {badge !== undefined && <span className={`badge badge-${badgeClass}`}>{badge}</span>}
      </div>
      <div style={noPad ? {} : { padding: '12px 14px' }}>{children}</div>
    </div>
  )
}

function ProviderBadge({ provider }) {
  const map = { claude: { label: 'Claude', color: C.accent2 }, openai: { label: 'OpenAI', color: C.green }, ollama: { label: 'Ollama', color: C.amber } }
  const p = map[provider] || { label: provider || 'Unknown', color: C.text3 }
  return (
    <span style={{ fontSize: 10, padding: '3px 10px', borderRadius: 20, fontFamily: 'var(--mono)', fontWeight: 600, background: `${p.color}1a`, color: p.color, border: `1px solid ${p.color}44` }}>
      {p.label}
    </span>
  )
}

function TabPlaceholder({ tab }) {
  return (
    <Card title={tab.label}>
      <div style={{ padding: 32, textAlign: 'center', color: C.text3, fontFamily: 'var(--mono)', fontSize: 12 }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>{tab.icon}</div>
        <div style={{ color: C.text2 }}>{tab.label} — Coming in next step</div>
      </div>
    </Card>
  )
}

/* ─── inline select style ─────────────────────────────────────────── */
const selSx = {
  background: 'var(--bg4)', border: '1px solid var(--border)',
  color: 'var(--text)', borderRadius: 6, fontSize: 11,
  padding: '4px 8px', fontFamily: 'var(--mono)', cursor: 'pointer',
}

/* ─── tiny toast ──────────────────────────────────────────────────── */
function Toast({ toasts }) {
  return (
    <div style={{ position: 'fixed', bottom: 24, right: 24, display: 'flex', flexDirection: 'column', gap: 8, zIndex: 9999 }}>
      {toasts.map(t => (
        <div key={t.id} style={{
          padding: '9px 16px', borderRadius: 8, fontSize: 12,
          fontFamily: 'var(--mono)', animation: 'fadeIn 0.2s ease',
          background: t.type === 'error' ? 'rgba(245,83,79,0.18)' : 'rgba(34,211,160,0.15)',
          color: t.type === 'error' ? C.red : C.green,
          border: `1px solid ${t.type === 'error' ? 'rgba(245,83,79,0.4)' : 'rgba(34,211,160,0.3)'}`,
        }}>
          {t.type === 'error' ? '✕' : '✓'} {t.msg}
        </div>
      ))}
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════════
   SETTINGS TAB
══════════════════════════════════════════════════════════════════ */
function SettingsTab({ configs, setConfigs, providerStatus, ollamaStatus, schedulerStatus, setSchedulerStatus, addToast, onRefresh }) {
  const [saving, setSaving] = useState({})
  const [pullModel, setPullModel] = useState('')
  const [pulling, setPulling] = useState(false)
  const [aiTimeoutMs, setAiTimeoutMs] = useState(() => getAIRequestTimeoutMs())

  /* helpers */
  const setSav = (key, val) => setSaving(s => ({ ...s, [key]: val }))

  const ollamaModels = ollamaStatus?.models?.map(m => m.name) || []

  /* ── save task config ─────────────────────────────────────────── */
  async function saveConfig(task, patch) {
    setSav(task, true)
    try {
      const { data } = await aiAPI.updateConfig(task, patch)
      setConfigs(prev => prev.map(c => c.task === task ? { ...c, ...data } : c))
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
      setConfigs(prev => prev.map(c => c.task === task ? { ...c, autoEnabled: data.autoEnabled } : c))
      addToast(data.message, 'success')
    } catch (err) {
      addToast(err.response?.data?.error || err.message, 'error')
    } finally {
      setSav(`auto_${task}`, false)
    }
  }

  /* ── scheduler actions ───────────────────────────────────────── */
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

  /* ── pull model ───────────────────────────────────────────────── */
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

  /* ── status badge ─────────────────────────────────────────────── */
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

  /* ════════════════════════════════════════════════════════════════ */
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

          <select
            value={aiTimeoutMs}
            onChange={e => saveTimeout(Number(e.target.value))}
            style={selSx}
          >
            {AI_TIMEOUT_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>

          <div style={{ fontSize: 10, color: C.text3, fontFamily: 'var(--mono)' }}>
            Default: {Math.round(DEFAULT_AI_TIMEOUT_MS / 1000)}s
          </div>
        </div>
      </Card>

      {/* ── SECTION 1: Task Configuration ──────────────────────── */}
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
                    {/* Task name */}
                    <td style={{ padding: '8px 12px', color: C.text, fontWeight: 600, whiteSpace: 'nowrap' }}>
                      {taskNames[cfg.task] || cfg.task}
                    </td>
                    {/* Provider */}
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
                    {/* Model */}
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
                    {/* Auto toggle */}
                    <td style={{ padding: '8px 12px' }}>
                      <button
                        onClick={() => toggleAuto(cfg.task)}
                        disabled={!!saving[`auto_${cfg.task}`]}
                        style={{
                          width: 42, height: 22, borderRadius: 11, border: 'none', cursor: 'pointer', position: 'relative',
                          background: cfg.autoEnabled ? C.accent2 : 'var(--bg4)', transition: 'background 0.2s',
                        }}
                      >
                        <span style={{
                          position: 'absolute', top: 3, left: cfg.autoEnabled ? 22 : 3,
                          width: 16, height: 16, borderRadius: '50%', background: '#fff', transition: 'left 0.2s',
                        }} />
                      </button>
                    </td>
                    {/* Schedule */}
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
                    {/* Last run */}
                    <td style={{ padding: '8px 12px', color: C.text3, fontSize: 11, whiteSpace: 'nowrap' }}>
                      {cfg.lastRun ? new Date(cfg.lastRun).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
                    </td>
                    {/* Status */}
                    <td style={{ padding: '8px 12px' }}>
                      <StatusBadge status={cfg.lastRunStatus} />
                    </td>
                    {/* Save indicator */}
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

      {/* ── SECTION 2: Provider Status ─────────────────────────── */}
      <Card title="PROVIDER STATUS" badge="3 PROVIDERS" badgeClass="blue">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
          {/* Claude */}
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
          {/* OpenAI */}
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
          {/* Ollama */}
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

      {/* ── SECTION 3: Ollama Model Manager ───────────────────── */}
      {ollamaStatus?.connected && (
        <Card title="OLLAMA MODEL MANAGER" badge={`${(ollamaStatus?.models || []).length} INSTALLED`} badgeClass="amber">
          {/* Installed models table */}
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

          {/* Pull new model */}
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
            {/* Popular models */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              <span style={{ fontSize: 10, color: C.text3, fontFamily: 'var(--mono)', alignSelf: 'center' }}>Popular:</span>
              {POPULAR_MODELS.map(m => (
                <button
                  key={m}
                  onClick={() => doPull(m)}
                  disabled={pulling}
                  style={{ fontSize: 10, padding: '3px 10px', borderRadius: 12, border: `1px solid var(--border)`, background: 'var(--bg4)', color: C.text2, cursor: 'pointer', fontFamily: 'var(--mono)' }}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>
        </Card>
      )}

      {/* ── SECTION 4: Automation Scheduler ──────────────────── */}
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
                        width: 42, height: 22, borderRadius: 11, border: 'none', cursor: 'pointer', position: 'relative',
                        background: s.autoEnabled ? C.green : 'var(--bg4)', transition: 'background 0.2s',
                      }}
                    >
                      <span style={{
                        position: 'absolute', top: 3, left: s.autoEnabled ? 22 : 3,
                        width: 16, height: 16, borderRadius: '50%', background: '#fff', transition: 'left 0.2s',
                      }} />
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

/* ══════════════════════════════════════════════════════════════════
   CHAT TAB
══════════════════════════════════════════════════════════════════ */
const CTX_OPTIONS = [
  { value: 'all',    label: 'All Sources' },
  { value: 'soc',    label: 'SOC Only' },
  { value: 'noc',    label: 'NOC Only' },
  { value: 'zabbix', label: 'Infrastructure' },
]

const CHAT_SUGGESTIONS = [
  'Any anomalies right now?',
  'Top threats today',
  'How many events last hour?',
  'Which hosts are down?',
  'Summarize network status',
  'Any brute force attempts?',
]

function ChatBubble({ msg, onCopy }) {
  const isUser = msg.role === 'user'
  const [rated, setRated]           = useState(false)
  const [hoveredStar, setHoveredStar] = useState(null)

  async function handleRate(star) {
    if (!msg.scoreId || rated) return
    try {
      await aiAPI.rateResponse(msg.scoreId, star)
      setRated(true)
    } catch {}
  }

  return (
    <div style={{
      display: 'flex', flexDirection: isUser ? 'row-reverse' : 'row',
      gap: 10, alignItems: 'flex-start', marginBottom: 14,
    }}>
      {/* avatar */}
      <div style={{
        width: 30, height: 30, borderRadius: 8, flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 14,
        background: isUser ? `${C.accent}22` : `${C.accent2}22`,
        border: `1px solid ${isUser ? C.accent : C.accent2}33`,
      }}>
        {isUser ? '👤' : '🤖'}
      </div>

      {/* bubble */}
      <div style={{
        maxWidth: isUser ? '70%' : '85%', minWidth: 60,
        marginLeft: isUser ? 'auto' : undefined,
        background: isUser ? `${C.accent}14` : 'var(--bg3)',
        border: `1px solid ${isUser ? `${C.accent}30` : 'var(--border)'}`,
        borderLeft: isUser ? undefined : `3px solid ${C.accent2}`,
        borderRadius: isUser ? '12px 4px 12px 12px' : '4px 12px 12px 12px',
        padding: '10px 14px',
      }}>
        {/* meta line */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 10, color: C.text3, fontFamily: 'var(--mono)' }}>
            {isUser ? 'You' : 'NetPulse AI'}
          </span>
          {!isUser && msg.provider && <ProviderBadge provider={msg.provider} />}
          {!isUser && msg.model && (
            <span style={{ fontSize: 9, color: C.text3, fontFamily: 'var(--mono)', background: 'var(--bg4)', padding: '1px 6px', borderRadius: 4 }}>
              {msg.model}
            </span>
          )}
          {!isUser && msg.responseTimeMs && (
            <span style={{ fontSize: 9, color: C.text3, fontFamily: 'var(--mono)' }}>
              {(msg.responseTimeMs / 1000).toFixed(1)}s
            </span>
          )}
          {!isUser && msg.totalScore != null && (
            <span style={{
              fontSize: 9, padding: '1px 7px', borderRadius: 10,
              fontFamily: 'var(--mono)', fontWeight: 600,
              background: msg.totalScore >= 7 ? 'rgba(34,211,160,0.15)' : msg.totalScore >= 5 ? 'rgba(245,166,35,0.15)' : 'rgba(245,83,79,0.15)',
              color: msg.totalScore >= 7 ? C.green : msg.totalScore >= 5 ? C.amber : C.red,
              border: `1px solid ${msg.totalScore >= 7 ? 'rgba(34,211,160,0.3)' : msg.totalScore >= 5 ? 'rgba(245,166,35,0.3)' : 'rgba(245,83,79,0.3)'}`,
            }}>
              {msg.totalScore}/10
            </span>
          )}
          <span style={{ fontSize: 9, color: C.text3, fontFamily: 'var(--mono)', marginLeft: 'auto' }}>
            {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
          {!isUser && (
            <button onClick={() => onCopy(msg.content)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: C.text3, padding: 0, lineHeight: 1 }} title="Copy">⧉</button>
          )}
        </div>

        {/* content */}
        <div style={{
          fontSize: 12, color: msg.isError ? C.red : C.text,
          lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
          fontFamily: isUser ? 'var(--mono)' : 'inherit',
        }}>
          {msg.content}
        </div>

        {/* rating row */}
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
                      background: 'none', border: 'none', cursor: 'pointer',
                      fontSize: 15, padding: '0 1px', lineHeight: 1,
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
      </div>
    </div>
  )
}

function TypingIndicator({ provider }) {
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 14 }}>
      <div style={{ width: 30, height: 30, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, background: `${C.accent2}22`, border: `1px solid ${C.accent2}33` }}>🤖</div>
      <div style={{
        background: 'var(--bg3)', border: '1px solid var(--border)',
        borderLeft: `3px solid ${C.accent2}`,
        borderRadius: '4px 12px 12px 12px', padding: '12px 16px',
        display: 'flex', gap: 6, alignItems: 'center',
      }}>
        {[0, 1, 2].map(i => (
          <span key={i} style={{ width: 7, height: 7, borderRadius: '50%', background: C.accent2, display: 'inline-block', animation: `bounce 1.2s ${i * 0.2}s infinite` }} />
        ))}
        <span style={{ fontSize: 11, color: C.text3, fontFamily: 'var(--mono)', marginLeft: 4 }}>
          {provider ? `Asking ${provider}...` : 'Thinking...'}
        </span>
      </div>
    </div>
  )
}

function ChatTab({ providerStatus, range, addToast }) {
  const [messages, setMessages]         = useState([])
  const [input, setInput]               = useState('')
  const [loading, setLoading]           = useState(false)
  const [chatContext, setChatContext]    = useState('all')
  const [chatProvider, setChatProvider] = useState(null)
  const [chatModel, setChatModel]       = useState(null)
  const [lastScore, setLastScore]       = useState(null)
  const bottomRef = useRef(null)
  const inputRef  = useRef(null)

  /* scroll to bottom on new messages */
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  /* derive available providers from status */
  const availableProviders = Object.entries(providerStatus || {})
    .filter(([, v]) => v.ready)
    .map(([k]) => k)

  /* model list for selected override provider */
  const ollamaInstalledModels = providerStatus?.ollama?.models?.map(m => m.name) || []
  const overrideModels = !chatProvider
    ? []
    : chatProvider === 'ollama'
      ? ollamaInstalledModels
      : (PROVIDER_MODELS[chatProvider] || []).slice(1)

  /* active provider for typing indicator */
  const activeProvider = chatProvider ||
    (providerStatus ? Object.entries(providerStatus).find(([, v]) => v.ready)?.[0] : null)

  async function sendMessage(text) {
    if (!text.trim() || loading) return

    const userMsg = { role: 'user', content: text, timestamp: new Date().toISOString() }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setLoading(true)

    try {
      const dateRange = range?.type === 'preset'
        ? { from: `now-${range.value}`, to: 'now' }
        : { from: range?.from, to: range?.to }

      const apiMsgs = [...messages, userMsg].map(m => ({ role: m.role, content: m.content }))

      const { data } = await aiAPI.chat(
        apiMsgs,
        chatContext,
        dateRange,
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
    } catch (err) {
      addToast(err.response?.data?.error || err.message, 'error')
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `Error: ${err.response?.data?.error || err.message}`,
        timestamp: new Date().toISOString(),
        isError: true,
      }])
    } finally {
      setLoading(false)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }

  function clearChat() {
    setMessages([])
    setLastScore(null)
    inputRef.current?.focus()
  }

  function copyText(text) {
    navigator.clipboard.writeText(text).catch(() => {})
    addToast('Copied to clipboard', 'success')
  }

  /* ── welcome state ──────────────────────────────────────────────── */
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

      {/* ── CONTROLS ROW ─────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', marginBottom: 8, borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
        {/* Context */}
        <span style={{ fontSize: 10, color: C.text3, fontFamily: 'var(--mono)', whiteSpace: 'nowrap' }}>Context:</span>
        <select value={chatContext} onChange={e => setChatContext(e.target.value)} style={selSx}>
          {CTX_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>

        <div style={{ width: 1, height: 16, background: 'var(--border)' }} />

        {/* Provider override */}
        <span style={{ fontSize: 10, color: C.text3, fontFamily: 'var(--mono)', whiteSpace: 'nowrap' }}>Provider:</span>
        <select
          value={chatProvider || 'default'}
          onChange={e => { setChatProvider(e.target.value === 'default' ? null : e.target.value); setChatModel(null) }}
          style={selSx}
        >
          <option value="default">Use Task Config</option>
          {availableProviders.map(p => <option key={p} value={p}>{p}</option>)}
        </select>

        {/* Model override — only show when a provider is selected */}
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

        {/* Last response score badge */}
        {lastScore != null && (
          <span style={{
            fontSize: 10, padding: '3px 10px', borderRadius: 20,
            fontFamily: 'var(--mono)', fontWeight: 600,
            background: lastScore >= 7 ? 'rgba(34,211,160,0.12)' : lastScore >= 5 ? 'rgba(245,166,35,0.12)' : 'rgba(245,83,79,0.12)',
            color: lastScore >= 7 ? C.green : lastScore >= 5 ? C.amber : C.red,
            border: `1px solid ${lastScore >= 7 ? 'rgba(34,211,160,0.3)' : lastScore >= 5 ? 'rgba(245,166,35,0.3)' : 'rgba(245,83,79,0.3)'}`,
          }}>
            Score: {lastScore}/10
          </span>
        )}

        {/* Clear chat button */}
        <button
          onClick={clearChat}
          disabled={messages.length === 0}
          style={{ fontSize: 10, padding: '4px 12px', borderRadius: 5, border: '1px solid var(--border)', background: 'var(--bg4)', color: C.text3, cursor: messages.length ? 'pointer' : 'not-allowed', fontFamily: 'var(--mono)' }}
        >
          Clear chat
        </button>
      </div>

      {/* ── QUICK SUGGESTIONS ROW ────────────────────────────────── */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
        {CHAT_SUGGESTIONS.map(q => (
          <button
            key={q}
            onClick={() => sendMessage(q)}
            disabled={loading}
            style={{
              fontSize: 11, padding: '5px 12px', borderRadius: 20,
              border: '1px solid var(--border)', background: 'var(--bg3)',
              color: C.text2, cursor: loading ? 'not-allowed' : 'pointer',
              fontFamily: 'var(--mono)', opacity: loading ? 0.5 : 1,
              transition: 'border-color 0.15s, color 0.15s',
            }}
          >
            {q}
          </button>
        ))}
      </div>

      {/* ── MESSAGES AREA ────────────────────────────────────────── */}
      <div style={{ flex: 1, overflowY: 'auto', background: 'var(--bg2)', borderRadius: 12, padding: 14, minHeight: 400 }}>
        {messages.length === 0 && !loading ? welcomeState : (
          <div style={{ paddingBottom: 8 }}>
            {messages.map((m, i) => (
              <ChatBubble key={i} msg={m} onCopy={copyText} />
            ))}
            {loading && <TypingIndicator provider={activeProvider} />}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* ── INPUT ROW ────────────────────────────────────────────── */}
      <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12, flexShrink: 0 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(input) }
            }}
            placeholder="Ask anything about your network..."
            rows={2}
            disabled={loading}
            style={{
              flex: 1, background: 'var(--bg3)', border: '1px solid var(--border)',
              color: C.text, borderRadius: 8, padding: '10px 12px',
              fontSize: 12, fontFamily: 'inherit', resize: 'none',
              outline: 'none', lineHeight: 1.5, opacity: loading ? 0.7 : 1,
            }}
          />
          <button
            onClick={() => sendMessage(input)}
            disabled={!input.trim() || loading}
            style={{
              padding: '10px 20px', borderRadius: 8, border: 'none', height: 44,
              background: (!input.trim() || loading) ? 'var(--bg4)' : C.accent2,
              color: (!input.trim() || loading) ? C.text3 : '#fff',
              cursor: (!input.trim() || loading) ? 'not-allowed' : 'pointer',
              fontFamily: 'var(--mono)', fontSize: 16, fontWeight: 600,
              transition: 'all 0.15s', alignSelf: 'flex-end',
            }}
          >
            {loading ? '…' : '➤'}
          </button>
        </div>
        <div style={{ fontSize: 10, color: C.text3, fontFamily: 'var(--mono)', marginTop: 6 }}>
          Enter to send · Shift+Enter for newline · {messages.filter(m => m.role === 'assistant').length} AI responses
        </div>
      </div>

      {/* bouncing dots keyframe */}
      <style>{`@keyframes bounce { 0%,80%,100%{transform:translateY(0)} 40%{transform:translateY(-6px)} }`}</style>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════════
   SEARCH TAB
══════════════════════════════════════════════════════════════════ */
const SEARCH_SOURCES = [
  { value: 'auto', label: 'Auto Source' },
  { value: 'elasticsearch', label: 'Elasticsearch' },
  { value: 'zabbix', label: 'Zabbix' },
  { value: 'mongodb', label: 'MongoDB' },
]

const SEARCH_SUGGESTIONS = [
  'Top denied IPs in the last 24 hours',
  'Any IPS alerts today?',
  'Show active Zabbix problems',
  'Open tickets right now',
  'Any MAC flapping events?',
  'Top source countries in firewall logs',
]

const MODEL_LAB_SUGGESTIONS = [
  'Summarize the current network risk posture',
  'What needs urgent action right now?',
  'Which security events look most concerning today?',
  'Give me an executive summary of the last 24 hours',
]

function SearchResultsView({ results }) {
  if (!results?.length) {
    return (
      <div style={{ padding: '20px 14px', textAlign: 'center', color: C.text3, fontFamily: 'var(--mono)', fontSize: 11 }}>
        No results returned for this query
      </div>
    )
  }

  const rows = Array.isArray(results) ? results : [results]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {rows.map((row, idx) => {
        if (row && typeof row === 'object' && !Array.isArray(row)) {
          return (
            <div key={idx} style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 8, padding: '12px 14px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
                {Object.entries(row).map(([key, value]) => (
                  <div key={key}>
                    <div style={{ fontSize: 9, color: C.text3, fontFamily: 'var(--mono)', textTransform: 'uppercase', marginBottom: 4 }}>
                      {String(key).replace(/([A-Z])/g, ' $1').replace(/_/g, ' ').trim()}
                    </div>
                    <div style={{ fontSize: 12, color: C.text, lineHeight: 1.6, wordBreak: 'break-word' }}>
                      {Array.isArray(value)
                        ? value.map(v => typeof v === 'object' ? JSON.stringify(v) : String(v)).join(', ')
                        : value == null
                          ? '—'
                          : typeof value === 'object'
                            ? JSON.stringify(value)
                            : String(value)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )
        }

        return (
          <div key={idx} style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 8, padding: '12px 14px', fontSize: 12, color: C.text, lineHeight: 1.6 }}>
            {typeof row === 'string' ? row : JSON.stringify(row)}
          </div>
        )
      })}
    </div>
  )
}

function SearchTab({ providerStatus, ollamaStatus, range, addToast }) {
  const [query, setQuery] = useState('')
  const [searchSource, setSearchSource] = useState('auto')
  const [searchProvider, setSearchProvider] = useState(null)
  const [searchModel, setSearchModel] = useState(null)
  const [searchLoading, setSearchLoading] = useState(false)
  const [searchResult, setSearchResult] = useState(null)
  const [searchHistory, setSearchHistory] = useState([])
  const [starRated, setStarRated] = useState(false)
  const [hoveredStar, setHoveredStar] = useState(null)
  const inputRef = useRef(null)

  useEffect(() => {
    aiAPI.getSearchHistory().then(r => setSearchHistory(r.data || [])).catch(() => {})
  }, [])

  const availableProviders = Object.entries(providerStatus || {})
    .filter(([, v]) => v.ready).map(([k]) => k)
  const ollamaModels = ollamaStatus?.models?.map(m => m.name) || []
  const overrideModels = !searchProvider
    ? []
    : searchProvider === 'ollama'
      ? ollamaModels
      : (PROVIDER_MODELS[searchProvider] || []).slice(1)

  function buildDateRange() {
    return range?.type === 'preset'
      ? { from: `now-${range.value}`, to: 'now' }
      : { from: range?.from, to: range?.to }
  }

  async function runSearch(text = query) {
    const question = text.trim()
    if (!question || searchLoading) return

    setSearchLoading(true)
    setStarRated(false)
    try {
      const { data } = await aiAPI.search(
        question,
        searchSource,
        buildDateRange(),
        searchProvider || undefined,
        searchModel || undefined,
      )
      setQuery(question)
      setSearchResult(data)
      aiAPI.getSearchHistory().then(r => setSearchHistory(r.data || [])).catch(() => {})
      addToast('Search complete', 'success')
    } catch (err) {
      addToast(err.response?.data?.error || err.message, 'error')
    } finally {
      setSearchLoading(false)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }

  async function rateResponse(star) {
    if (!searchResult?.scoreId || starRated) return
    try {
      await aiAPI.rateResponse(searchResult.scoreId, star)
      setStarRated(true)
      addToast('Rating saved', 'success')
    } catch {}
  }

  function fmtTs(ts) {
    if (!ts) return '—'
    try { return new Date(ts).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) }
    catch { return ts }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 10, color: C.text3, fontFamily: 'var(--mono)' }}>Source:</span>
        <select value={searchSource} onChange={e => setSearchSource(e.target.value)} style={selSx}>
          {SEARCH_SOURCES.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
        </select>

        <span style={{ fontSize: 10, color: C.text3, fontFamily: 'var(--mono)' }}>Provider:</span>
        <select
          value={searchProvider || 'default'}
          onChange={e => { setSearchProvider(e.target.value === 'default' ? null : e.target.value); setSearchModel(null) }}
          style={selSx}
        >
          <option value="default">Use Task Config</option>
          {availableProviders.map(p => <option key={p} value={p}>{p}</option>)}
        </select>

        {searchProvider && (
          <select
            value={searchModel || 'auto'}
            onChange={e => setSearchModel(e.target.value === 'auto' ? null : e.target.value)}
            style={selSx}
          >
            <option value="auto">auto</option>
            {overrideModels.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        )}
      </div>

      <Card title="NATURAL LANGUAGE SEARCH" noPad>
        <div style={{ padding: '14px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'stretch' }}>
            <textarea
              ref={inputRef}
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); runSearch() }
              }}
              rows={3}
              placeholder="Ask a search question like 'top denied IPs in the last 24 hours'"
              disabled={searchLoading}
              style={{
                flex: 1, background: 'var(--bg3)', border: '1px solid var(--border)',
                color: C.text, borderRadius: 8, padding: '10px 12px',
                fontSize: 12, resize: 'vertical', outline: 'none', lineHeight: 1.5,
              }}
            />
            <button
              onClick={() => runSearch()}
              disabled={!query.trim() || searchLoading}
              style={{
                minWidth: 140, border: 'none', borderRadius: 8,
                background: (!query.trim() || searchLoading) ? 'var(--bg4)' : C.accent2,
                color: (!query.trim() || searchLoading) ? C.text3 : '#fff',
                cursor: (!query.trim() || searchLoading) ? 'not-allowed' : 'pointer',
                fontFamily: 'var(--mono)', fontWeight: 700, fontSize: 12, padding: '10px 14px',
              }}
            >
              {searchLoading ? 'Searching...' : '▶ Run Search'}
            </button>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {SEARCH_SUGGESTIONS.map(s => (
              <button
                key={s}
                onClick={() => runSearch(s)}
                disabled={searchLoading}
                style={{
                  fontSize: 10, padding: '5px 10px', borderRadius: 20,
                  border: '1px solid var(--border)', background: 'var(--bg3)',
                  color: C.text2, cursor: searchLoading ? 'not-allowed' : 'pointer',
                  fontFamily: 'var(--mono)',
                }}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      </Card>

      {searchResult ? (
        <Card title="SEARCH RESULTS" noPad>
          <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: 10, color: C.text3, fontFamily: 'var(--mono)' }}>Template:</span>
            <span style={{ fontSize: 10, color: C.text, fontFamily: 'var(--mono)', background: 'var(--bg4)', padding: '3px 8px', borderRadius: 12 }}>
              {searchResult.matchedTemplate}
            </span>
            <span style={{ fontSize: 10, color: C.text3, fontFamily: 'var(--mono)' }}>{searchResult.templateDescription}</span>
            <span style={{ fontSize: 10, color: C.text3, fontFamily: 'var(--mono)' }}>Source: {searchResult.source}</span>
            <span style={{ fontSize: 10, color: C.text3, fontFamily: 'var(--mono)' }}>{searchResult.totalHits} hit{searchResult.totalHits === 1 ? '' : 's'}</span>
            <span style={{ fontSize: 10, color: C.text3, fontFamily: 'var(--mono)' }}>{(searchResult.executionTimeMs / 1000).toFixed(2)}s</span>
            {searchResult.provider && <ProviderBadge provider={searchResult.provider} />}
            {searchResult.totalScore != null && (
              <span style={{
                fontSize: 10, padding: '2px 9px', borderRadius: 10, fontFamily: 'var(--mono)', fontWeight: 600,
                background: searchResult.totalScore >= 7 ? 'rgba(34,211,160,0.12)' : 'rgba(245,166,35,0.12)',
                color: searchResult.totalScore >= 7 ? C.green : C.amber,
                border: `1px solid ${searchResult.totalScore >= 7 ? 'rgba(34,211,160,0.3)' : 'rgba(245,166,35,0.3)'}`,
              }}>
                Score: {searchResult.totalScore}/10
              </span>
            )}
          </div>
          <div style={{ padding: '14px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 8, padding: '12px 14px' }}>
              <div style={{ fontSize: 9, color: C.text3, fontFamily: 'var(--mono)', textTransform: 'uppercase', marginBottom: 6 }}>Question</div>
              <div style={{ fontSize: 13, color: C.text, lineHeight: 1.7 }}>{searchResult.question}</div>
            </div>

            <SearchResultsView results={searchResult.results} />

            {searchResult.scoreId && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {starRated ? (
                  <span style={{ fontSize: 11, color: C.green, fontFamily: 'var(--mono)' }}>Thanks for rating!</span>
                ) : (
                  <>
                    <span style={{ fontSize: 11, color: C.text3, fontFamily: 'var(--mono)' }}>Rate this search:</span>
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
                        }}
                      >⭐</button>
                    ))}
                  </>
                )}
              </div>
            )}
          </div>
        </Card>
      ) : (
        <Card title="SEARCH RESULTS" noPad>
          <div style={{ padding: '28px 18px', textAlign: 'center', color: C.text3, fontFamily: 'var(--mono)', fontSize: 11 }}>
            Ask a natural language question above to query Elasticsearch, Zabbix, or MongoDB-backed operational data
          </div>
        </Card>
      )}

      <Card title="RECENT SEARCHES" badge={searchHistory.length} badgeClass="blue" noPad>
        {searchHistory.length === 0 ? (
          <div style={{ padding: '20px 14px', textAlign: 'center', color: C.text3, fontFamily: 'var(--mono)', fontSize: 11 }}>
            No searches run yet
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, fontFamily: 'var(--mono)' }}>
              <thead>
                <tr style={{ background: 'var(--bg3)', borderBottom: '1px solid var(--border)' }}>
                  {['Time', 'Question', 'Provider', 'Model', 'Score', 'Action'].map(h => (
                    <th key={h} style={{ padding: '7px 12px', textAlign: 'left', color: C.text3, fontWeight: 600, fontSize: 10, whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {searchHistory.slice(0, 10).map((row, i) => (
                  <tr key={row._id || i} style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 0 ? 'transparent' : 'var(--bg3)' }}>
                    <td style={{ padding: '7px 12px', color: C.text3, whiteSpace: 'nowrap' }}>{fmtTs(row.createdAt)}</td>
                    <td style={{ padding: '7px 12px', color: C.text, maxWidth: 420, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.query || '—'}</td>
                    <td style={{ padding: '7px 12px', color: C.text3 }}>{row.provider || '—'}</td>
                    <td style={{ padding: '7px 12px', color: C.text3 }}>{row.model || '—'}</td>
                    <td style={{ padding: '7px 12px', color: C.text3 }}>{row.totalScore ?? '—'}</td>
                    <td style={{ padding: '7px 12px' }}>
                      <button
                        onClick={() => runSearch(row.query || '')}
                        disabled={searchLoading || !row.query}
                        style={{ fontSize: 10, padding: '3px 10px', borderRadius: 5, border: `1px solid ${C.accent}40`, background: `${C.accent}15`, color: C.accent, cursor: 'pointer', fontFamily: 'var(--mono)' }}
                      >
                        Rerun
                      </button>
                    </td>
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

/* ══════════════════════════════════════════════════════════════════
   MODEL LAB TAB
══════════════════════════════════════════════════════════════════ */
function ModelLabResponseCard({ result, isWinner, rated, hoveredStar, setHoveredStar, onRate }) {
  const score = result?.totalScore
  const scoreBg = score >= 7 ? 'rgba(34,211,160,0.12)' : score >= 5 ? 'rgba(245,166,35,0.12)' : 'rgba(245,83,79,0.12)'
  const scoreColor = score >= 7 ? C.green : score >= 5 ? C.amber : C.red
  const scoreBorder = score >= 7 ? 'rgba(34,211,160,0.3)' : score >= 5 ? 'rgba(245,166,35,0.3)' : 'rgba(245,83,79,0.3)'

  return (
    <div style={{
      background: 'var(--bg3)',
      border: '1px solid var(--border)',
      borderLeft: `4px solid ${isWinner ? C.green : C.accent2}`,
      borderRadius: 10,
      overflow: 'hidden',
      boxShadow: isWinner ? '0 0 0 1px rgba(34,211,160,0.18)' : 'none',
    }}>
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
                <span style={{
                  fontSize: 10, padding: '2px 9px', borderRadius: 10, fontFamily: 'var(--mono)', fontWeight: 600,
                  background: scoreBg, color: scoreColor, border: `1px solid ${scoreBorder}`,
                }}>
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
                          background: 'none', border: 'none', cursor: 'pointer',
                          fontSize: 15, padding: '0 1px', lineHeight: 1,
                          opacity: hoveredStar != null ? (star <= hoveredStar ? 1 : 0.3) : 0.3,
                          filter: hoveredStar != null && star <= hoveredStar ? 'none' : 'grayscale(1)',
                        }}
                      >⭐</button>
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

function ModelLabTab({ providerStatus, ollamaStatus, range, addToast }) {
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

  const ollamaModels = ollamaStatus?.models?.map(m => m.name) || []

  function buildDateRange() {
    return range?.type === 'preset'
      ? { from: `now-${range.value}`, to: 'now' }
      : { from: range?.from, to: range?.to }
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
        buildDateRange(),
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

  function fmtTs(ts) {
    if (!ts) return '—'
    try { return new Date(ts).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) }
    catch { return ts }
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
              ['claude', PROVIDER_MODELS.claude.slice(1)],
              ['openai', PROVIDER_MODELS.openai.slice(1)],
              ['ollama', ollamaModels],
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
                flex: 1, background: 'var(--bg3)', border: '1px solid var(--border)',
                color: C.text, borderRadius: 8, padding: '10px 12px',
                fontSize: 12, resize: 'vertical', outline: 'none', lineHeight: 1.5,
              }}
            />
            <button
              onClick={() => runComparison()}
              disabled={!question.trim() || modelLabLoading}
              style={{
                minWidth: 150, border: 'none', borderRadius: 8,
                background: (!question.trim() || modelLabLoading) ? 'var(--bg4)' : C.accent2,
                color: (!question.trim() || modelLabLoading) ? C.text3 : '#fff',
                cursor: (!question.trim() || modelLabLoading) ? 'not-allowed' : 'pointer',
                fontFamily: 'var(--mono)', fontWeight: 700, fontSize: 12, padding: '10px 14px',
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
                  fontSize: 10, padding: '5px 10px', borderRadius: 20,
                  border: '1px solid var(--border)', background: 'var(--bg3)',
                  color: C.text2, cursor: modelLabLoading ? 'not-allowed' : 'pointer',
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
                setHoveredStar={(star) => setHoveredStars(prev => ({ ...prev, [result.scoreId]: star }))}
                onRate={(star) => rateComparison(result.scoreId, star)}
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
                    <td style={{ padding: '7px 12px', color: C.text3, whiteSpace: 'nowrap' }}>{fmtTs(row.createdAt)}</td>
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

/* ══════════════════════════════════════════════════════════════════
   ANOMALY TAB
══════════════════════════════════════════════════════════════════ */
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

function fmtMetric(s) {
  return (s || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

function fmtTime(ts) {
  if (!ts) return '—'
  try { return new Date(ts).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) }
  catch { return ts }
}

function ProgressBar({ pct }) {
  const color = pct < 30 ? C.red : pct < 70 ? C.amber : C.green
  return (
    <div style={{ height: 5, background: 'var(--bg4)', borderRadius: 3, overflow: 'hidden', marginTop: 4 }}>
      <div style={{ width: `${Math.min(pct, 100)}%`, height: '100%', background: color, borderRadius: 3, transition: 'width 0.4s' }} />
    </div>
  )
}

function AnomalyTab({ providerStatus, ollamaStatus, range, addToast }) {
  const [anomalyResult,   setAnomalyResult]   = useState(null)
  const [anomalyHistory,  setAnomalyHistory]  = useState([])
  const [baselineStatus,  setBaselineStatus]  = useState([])
  const [anomalyLoading,  setAnomalyLoading]  = useState(false)
  const [baselineLoading, setBaselineLoading] = useState(false)
  const [sensitivity,     setSensitivity]     = useState(2.0)
  const [sources,         setSources]         = useState(['firewall', 'cisco', 'sentinel'])
  const [feedback,        setFeedback]        = useState({})   // { "runId_idx": 'true_positive'|'false_positive'|'unsure' }
  const [expandedHistory, setExpandedHistory] = useState(null)
  const [mlModel, setMlModel] = useState('baseline_anomaly')
  const [improvementStats, setImprovementStats] = useState(null)
  const [improvementHistory, setImprovementHistory] = useState([])
  const [improvementLoading, setImprovementLoading] = useState(false)
  const [improvementProvider, setImprovementProvider] = useState(null)
  const [improvementModel, setImprovementModel] = useState(null)
  const [latestImprovement, setLatestImprovement] = useState(null)

  /* ── load on mount ─────────────────────────────────────────────── */
  useEffect(() => {
    mlAPI.getAnomalyHistory().then(r => setAnomalyHistory(r.data || [])).catch(() => {})
    mlAPI.getBaselineStatus().then(r => setBaselineStatus(r.data || [])).catch(() => {})
  }, [])

  useEffect(() => {
    mlAPI.getStats(mlModel).then(r => setImprovementStats(r.data || null)).catch(() => {})
    mlAPI.getImprovementHistory(mlModel).then(r => setImprovementHistory(r.data || [])).catch(() => {})
  }, [mlModel])

  /* ── helpers ───────────────────────────────────────────────────── */
  function buildDateRange() {
    return range?.type === 'preset'
      ? { from: `now-${range.value}`, to: 'now' }
      : { from: range?.from, to: range?.to }
  }

  function toggleSource(src) {
    setSources(prev => prev.includes(src) ? prev.filter(s => s !== src) : [...prev, src])
  }

  const availableProviders = Object.entries(providerStatus || {})
    .filter(([, v]) => v.ready).map(([k]) => k)
  const ollamaModels = ollamaStatus?.models?.map(m => m.name) || []
  const improvementOverrideModels = !improvementProvider
    ? []
    : improvementProvider === 'ollama'
      ? ollamaModels
      : (PROVIDER_MODELS[improvementProvider] || []).slice(1)

  /* ── actions ───────────────────────────────────────────────────── */
  async function runDetection() {
    setAnomalyLoading(true)
    try {
      const { data } = await mlAPI.detectAnomalies(buildDateRange(), sensitivity, sources)
      setAnomalyResult(data)
      setFeedback({})
      mlAPI.getAnomalyHistory().then(r => setAnomalyHistory(r.data || [])).catch(() => {})
      addToast(`Detection complete — ${data.anomalies?.length ?? 0} anomalies found`, 'success')
    } catch (err) {
      addToast(err.response?.data?.error || err.message, 'error')
    } finally {
      setAnomalyLoading(false)
    }
  }

  async function buildBaseline() {
    setBaselineLoading(true)
    try {
      await mlAPI.buildBaseline(null, 7)
      addToast('Baseline build started (7 days back)', 'success')
      setTimeout(() => mlAPI.getBaselineStatus().then(r => setBaselineStatus(r.data || [])).catch(() => {}), 2000)
    } catch (err) {
      addToast(err.response?.data?.error || err.message, 'error')
    } finally {
      setBaselineLoading(false)
    }
  }

  async function runScheduled() {
    try {
      await aiAPI.runNow('anomaly')
      addToast('Anomaly scheduler triggered', 'success')
    } catch (err) {
      addToast(err.response?.data?.error || err.message, 'error')
    }
  }

  async function saveFeedback(runId, idx, fb) {
    const key = `${runId}_${idx}`
    setFeedback(prev => ({ ...prev, [key]: fb }))
    try {
      await mlAPI.saveAnomalyFeedback(runId, idx, fb)
      addToast('Feedback saved', 'success')
    } catch (err) {
      setFeedback(prev => { const n = { ...prev }; delete n[key]; return n })
      addToast(err.response?.data?.error || err.message, 'error')
    }
  }

  async function requestImprovement() {
    setImprovementLoading(true)
    try {
      const { data } = await mlAPI.requestImprovement(
        mlModel,
        improvementProvider || undefined,
        improvementModel || undefined,
      )
      setLatestImprovement(data)
      const [statsRes, historyRes] = await Promise.allSettled([
        mlAPI.getStats(mlModel),
        mlAPI.getImprovementHistory(mlModel),
      ])
      if (statsRes.status === 'fulfilled') setImprovementStats(statsRes.value.data || null)
      if (historyRes.status === 'fulfilled') setImprovementHistory(historyRes.value.data || [])
      addToast('Improvement suggestion generated', 'success')
    } catch (err) {
      addToast(err.response?.data?.error || err.message, 'error')
    } finally {
      setImprovementLoading(false)
    }
  }

  async function applySuggestion(id) {
    try {
      const { data } = await mlAPI.applyImprovement(id)
      setLatestImprovement(prev => prev?.id === id ? { ...prev, status: data.status, appliedAt: data.appliedAt } : prev)
      mlAPI.getImprovementHistory(mlModel).then(r => setImprovementHistory(r.data || [])).catch(() => {})
      addToast('Improvement marked as applied', 'success')
    } catch (err) {
      addToast(err.response?.data?.error || err.message, 'error')
    }
  }

  async function rejectSuggestion(id) {
    try {
      await mlAPI.rejectImprovement(id)
      setLatestImprovement(prev => prev?.id === id ? { ...prev, status: 'rejected' } : prev)
      mlAPI.getImprovementHistory(mlModel).then(r => setImprovementHistory(r.data || [])).catch(() => {})
      addToast('Improvement rejected', 'success')
    } catch (err) {
      addToast(err.response?.data?.error || err.message, 'error')
    }
  }

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
                        {fmtMetric(b.metric)}
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
                        Updated {fmtTime(b.updatedAt)}
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
              ['Run time',  fmtTime(anomalyResult.runAt || anomalyResult.createdAt)],
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
                          {fmtMetric(a.metric)}
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
                        <td style={{ padding: '7px 12px', color: C.text2, whiteSpace: 'nowrap' }}>{fmtTime(row.runAt || row.createdAt)}</td>
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
                                    <span style={{ color: C.text, fontWeight: 600, marginRight: 8 }}>{fmtMetric(a.metric)}</span>
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
                {latestImprovement.model && (
                  <span style={{ fontSize: 10, color: C.text3, fontFamily: 'var(--mono)', background: 'var(--bg4)', padding: '2px 8px', borderRadius: 5 }}>
                    {latestImprovement.model}
                  </span>
                )}
              </div>

              {latestImprovement.suggestion?.analysis && (
                <div>
                  <div style={{ fontSize: 9, color: C.text3, fontFamily: 'var(--mono)', textTransform: 'uppercase', marginBottom: 4 }}>Analysis</div>
                  <div style={{ fontSize: 12, color: C.text, lineHeight: 1.7 }}>{latestImprovement.suggestion.analysis}</div>
                </div>
              )}

              {(latestImprovement.suggestion?.suggestedChanges || latestImprovement.suggestedChanges || []).length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ fontSize: 9, color: C.text3, fontFamily: 'var(--mono)', textTransform: 'uppercase' }}>Suggested Changes</div>
                  {(latestImprovement.suggestion?.suggestedChanges || latestImprovement.suggestedChanges || []).map((chg, i) => (
                    <div key={i} style={{ background: 'var(--bg4)', border: '1px solid var(--border)', borderRadius: 7, padding: '10px 12px' }}>
                      <div style={{ fontSize: 11, color: C.text, fontFamily: 'var(--mono)', fontWeight: 700, marginBottom: 4 }}>
                        {chg.field || 'setting'}: {chg.oldValue ?? '—'} → {chg.newValue ?? '—'}
                      </div>
                      <div style={{ fontSize: 11, color: C.text2, lineHeight: 1.6 }}>{chg.reason || 'No reason provided'}</div>
                    </div>
                  ))}
                </div>
              )}

              {latestImprovement.suggestion?.expectedImprovement && (
                <div style={{ fontSize: 11, color: C.green, lineHeight: 1.6, fontFamily: 'var(--mono)' }}>
                  Expected: {latestImprovement.suggestion.expectedImprovement}
                </div>
              )}

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
                    <span style={{ fontSize: 11, color: C.text, fontFamily: 'var(--mono)', fontWeight: 700 }}>{fmtTime(item.createdAt)}</span>
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

/* ══════════════════════════════════════════════════════════════════
   TRIAGE TAB
══════════════════════════════════════════════════════════════════ */
const TRIG_SEV_COLOR  = { critical: '#f5534f', high: '#f5a623', medium: '#4f7ef5', low: '#22d3a0' }
const TRIG_SEV_BG     = { critical: 'rgba(245,83,79,0.12)', high: 'rgba(245,166,35,0.12)', medium: 'rgba(79,126,245,0.12)', low: 'rgba(34,211,160,0.12)' }
const TRIG_SEV_BORDER = { critical: 'rgba(245,83,79,0.35)', high: 'rgba(245,166,35,0.35)', medium: 'rgba(79,126,245,0.35)', low: 'rgba(34,211,160,0.35)' }

const CAT_ICON = {
  intrusion: '🔴', malware: '☣️', brute_force: '🔑',
  reconnaissance: '👁️', policy_violation: '📋', anomaly: '📈', other: '❓',
}

const SAMPLE_ALERTS = {
  'SQL Injection': {
    name: 'SQL Injection Attack Detected', type: 'ips',
    srcip: '185.220.101.3', dstip: '10.0.0.45', srccountry: 'Russia',
    attack: 'SQL.Injection.Login.Bypass', severity: 'high',
    site_name: 'Gurgaon-WH', device_name: 'Gurgaon-FW-01',
    message: 'SQL injection attempt on login page',
  },
  'Port Scan': {
    name: 'Port Scan Detected', type: 'ips',
    srcip: '45.128.232.101', dstip: '10.0.1.100', srccountry: 'China',
    attack: 'Port.Scan.Multi', severity: 'medium',
    site_name: 'Mumbai-DC', device_name: 'Mumbai-FW-01',
    message: 'Sequential port scan from external IP',
  },
  'Brute Force': {
    name: 'SSH Brute Force Attack', type: 'auth',
    srcip: '193.32.162.44', dstip: '10.10.0.5', srccountry: 'Ukraine',
    attack: 'SSH.Brute.Force', severity: 'high',
    site_name: 'Delhi-HQ', device_name: 'Delhi-FW-01',
    message: 'Multiple failed SSH login attempts detected',
  },
  'Malware': {
    name: 'Malware C2 Communication', type: 'utm',
    srcip: '10.1.0.23', dstip: '91.108.4.167', srccountry: 'Netherlands',
    attack: 'Trojan.Generic.C2', severity: 'critical',
    site_name: 'Gurgaon-WH', device_name: 'Gurgaon-FW-01',
    message: 'Outbound C2 communication detected from internal host',
  },
  'DDoS': {
    name: 'DDoS Attack Incoming', type: 'traffic',
    srcip: '0.0.0.0', dstip: '203.0.113.10', srccountry: 'Multiple',
    attack: 'DDoS.SYN.Flood', severity: 'critical',
    site_name: 'Mumbai-DC', device_name: 'Mumbai-Edge-01',
    message: 'High volume SYN flood targeting public IP',
  },
}

const BLANK_FORM = {
  name: '', type: 'ips', srcip: '', dstip: '', srccountry: '',
  attack: '', severity: 'high', site_name: '', device_name: '', message: '',
}

function TriageTab({ providerStatus, addToast }) {
  const [triageResult,   setTriageResult]   = useState(null)
  const [triageHistory,  setTriageHistory]  = useState([])
  const [triageLoading,  setTriageLoading]  = useState(false)
  const [triageProvider, setTriageProvider] = useState(null)
  const [triageModel,    setTriageModel]    = useState(null)
  const [alertForm,      setAlertForm]      = useState(BLANK_FORM)
  const [starRated,      setStarRated]      = useState(false)
  const [hoveredStar,    setHoveredStar]    = useState(null)
  const [ticketCreating, setTicketCreating] = useState(false)
  const [ticketCreated,  setTicketCreated]  = useState(null)
  const resultRef = useRef(null)

  /* ── load history on mount ─────────────────────────────────────── */
  useEffect(() => {
    aiAPI.getTriageHistory().then(r => setTriageHistory(r.data || [])).catch(() => {})
  }, [])

  /* ── derived provider/model lists ─────────────────────────────── */
  const availableProviders = Object.entries(providerStatus || {})
    .filter(([, v]) => v.ready).map(([k]) => k)
  const ollamaModels = providerStatus?.ollama?.models?.map(m => m.name) || []
  const overrideModels = !triageProvider ? []
    : triageProvider === 'ollama' ? ollamaModels
    : (PROVIDER_MODELS[triageProvider] || []).slice(1)

  /* ── form helpers ──────────────────────────────────────────────── */
  const setField = (k, v) => setAlertForm(f => ({ ...f, [k]: v }))

  /* ── run triage ────────────────────────────────────────────────── */
  async function runTriage() {
    if (!alertForm.name.trim()) { addToast('Alert name is required', 'error'); return }
    setTriageLoading(true)
    setTriageResult(null)
    setStarRated(false)
    setTicketCreated(null)
    try {
      const { data } = await aiAPI.triage(
        alertForm,
        triageProvider || undefined,
        triageModel   || undefined,
      )
      setTriageResult(data)
      aiAPI.getTriageHistory().then(r => setTriageHistory(r.data || [])).catch(() => {})
      addToast('Triage complete', 'success')
      setTimeout(() => resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100)
    } catch (err) {
      addToast(err.response?.data?.error || err.message, 'error')
    } finally {
      setTriageLoading(false)
    }
  }

  /* ── star rating ───────────────────────────────────────────────── */
  async function rateResponse(star) {
    if (!triageResult?.scoreId || starRated) return
    try {
      await aiAPI.rateResponse(triageResult.scoreId, star)
      setStarRated(true)
      addToast('Rating saved', 'success')
    } catch {}
  }

  /* ── create ticket ─────────────────────────────────────────────── */
  async function createTicket() {
    if (!triageResult) return
    setTicketCreating(true)
    try {
      const sev = (triageResult.severity || alertForm.severity || 'high').toLowerCase()
      const { data } = await ticketsAPI.create({
        title: `[AI Triage] ${alertForm.name}`,
        description: [
          `**AI Triage Summary:** ${triageResult.summary || ''}`,
          `**Recommendation:** ${triageResult.recommendation || ''}`,
          `**Category:** ${triageResult.category || ''}`,
          `**Source IP:** ${alertForm.srcip}  →  **Dest IP:** ${alertForm.dstip}`,
          `**Attack:** ${alertForm.attack}`,
          `**Site:** ${alertForm.site_name}  |  **Device:** ${alertForm.device_name}`,
          triageResult.mitreTactic ? `**MITRE Tactic:** ${triageResult.mitreTactic}` : '',
          triageResult.relatedCVE  ? `**CVE:** ${triageResult.relatedCVE}` : '',
        ].filter(Boolean).join('\n'),
        severity: sev,
        source: 'ai_triage',
        tags: ['ai-triage', triageResult.category || 'security'].filter(Boolean),
      })
      setTicketCreated(data._id || data.id || data.ticketId || 'created')
      addToast('Ticket created successfully', 'success')
    } catch (err) {
      addToast(err.response?.data?.error || err.message, 'error')
    } finally {
      setTicketCreating(false)
    }
  }

  /* ── helpers ───────────────────────────────────────────────────── */
  function fmtTs(ts) {
    if (!ts) return '—'
    try { return new Date(ts).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) }
    catch { return ts }
  }

  function sevColor(s) { return TRIG_SEV_COLOR[(s || '').toLowerCase()] || C.text3 }
  function sevBg(s)    { return TRIG_SEV_BG[(s || '').toLowerCase()]    || 'transparent' }
  function sevBorder(s){ return TRIG_SEV_BORDER[(s || '').toLowerCase()] || 'var(--border)' }

  /* ── shared input style ────────────────────────────────────────── */
  const inSx = {
    width: '100%', background: 'var(--bg3)', border: '1px solid var(--border)',
    color: 'var(--text)', borderRadius: 6, padding: '6px 9px',
    fontSize: 11, fontFamily: 'var(--mono)', outline: 'none', boxSizing: 'border-box',
  }
  const labelSx = { fontSize: 10, color: C.text3, fontFamily: 'var(--mono)', marginBottom: 3, display: 'block' }

  /* ═══════════════════════════════════════════════════════════════ */
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* ── 1. CONTROLS ROW ────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 10, color: C.text3, fontFamily: 'var(--mono)' }}>Provider:</span>
        <select
          value={triageProvider || 'default'}
          onChange={e => { setTriageProvider(e.target.value === 'default' ? null : e.target.value); setTriageModel(null) }}
          style={selSx}
        >
          <option value="default">Use Task Config</option>
          {availableProviders.map(p => <option key={p} value={p}>{p}</option>)}
        </select>

        {triageProvider && (
          <>
            <span style={{ fontSize: 10, color: C.text3, fontFamily: 'var(--mono)' }}>Model:</span>
            <select
              value={triageModel || 'auto'}
              onChange={e => setTriageModel(e.target.value === 'auto' ? null : e.target.value)}
              style={selSx}
            >
              <option value="auto">auto</option>
              {overrideModels.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </>
        )}

        <div style={{ flex: 1 }} />

        <button
          onClick={() => { setAlertForm(BLANK_FORM); setTriageResult(null); setStarRated(false); setTicketCreated(null) }}
          style={{ fontSize: 10, padding: '4px 12px', borderRadius: 5, border: '1px solid var(--border)', background: 'var(--bg4)', color: C.text3, cursor: 'pointer', fontFamily: 'var(--mono)' }}
        >
          Clear Form
        </button>
      </div>

      {/* ── 2. ALERT INPUT FORM ────────────────────────────────── */}
      <Card title="ALERT DETAILS" noPad>
        <div style={{ padding: '14px 14px 0' }}>
          {/* quick fill */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 10, color: C.text3, fontFamily: 'var(--mono)', whiteSpace: 'nowrap' }}>Fill with sample:</span>
            {Object.keys(SAMPLE_ALERTS).map(name => (
              <button
                key={name}
                onClick={() => { setAlertForm(SAMPLE_ALERTS[name]); setTriageResult(null); setStarRated(false); setTicketCreated(null) }}
                style={{
                  fontSize: 10, padding: '4px 10px', borderRadius: 20, cursor: 'pointer',
                  background: 'var(--bg4)', color: C.accent, border: `1px solid ${C.accent}33`,
                  fontFamily: 'var(--mono)', transition: 'all 0.15s',
                }}
              >{name}</button>
            ))}
          </div>

          {/* two-column form grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 20px' }}>
            {/* LEFT COLUMN */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div>
                <label style={labelSx}>Alert Name *</label>
                <input style={inSx} value={alertForm.name} onChange={e => setField('name', e.target.value)} placeholder="e.g. SQL Injection Detected" />
              </div>
              <div>
                <label style={labelSx}>Alert Type</label>
                <select style={{ ...inSx, cursor: 'pointer' }} value={alertForm.type} onChange={e => setField('type', e.target.value)}>
                  {['ips', 'utm', 'traffic', 'vpn', 'auth', 'anomaly'].map(t => (
                    <option key={t} value={t}>{t.toUpperCase()}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={labelSx}>Source IP</label>
                <input style={inSx} value={alertForm.srcip} onChange={e => setField('srcip', e.target.value)} placeholder="e.g. 185.220.101.3" />
              </div>
              <div>
                <label style={labelSx}>Destination IP</label>
                <input style={inSx} value={alertForm.dstip} onChange={e => setField('dstip', e.target.value)} placeholder="e.g. 10.0.0.45" />
              </div>
              <div>
                <label style={labelSx}>Source Country</label>
                <input style={inSx} value={alertForm.srccountry} onChange={e => setField('srccountry', e.target.value)} placeholder="e.g. Russia" />
              </div>
            </div>

            {/* RIGHT COLUMN */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div>
                <label style={labelSx}>Attack Name</label>
                <input style={inSx} value={alertForm.attack} onChange={e => setField('attack', e.target.value)} placeholder="e.g. SQL.Injection.Login.Bypass" />
              </div>
              <div>
                <label style={labelSx}>Severity</label>
                <select style={{ ...inSx, cursor: 'pointer' }} value={alertForm.severity} onChange={e => setField('severity', e.target.value)}>
                  {['critical', 'high', 'medium', 'low'].map(s => (
                    <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={labelSx}>Site Name</label>
                <input style={inSx} value={alertForm.site_name} onChange={e => setField('site_name', e.target.value)} placeholder="e.g. Gurgaon-WH" />
              </div>
              <div>
                <label style={labelSx}>Device Name</label>
                <input style={inSx} value={alertForm.device_name} onChange={e => setField('device_name', e.target.value)} placeholder="e.g. Gurgaon-FW-01" />
              </div>
              <div>
                <label style={labelSx}>Message / Description</label>
                <textarea
                  style={{ ...inSx, resize: 'vertical', minHeight: 60, lineHeight: 1.5 }}
                  value={alertForm.message}
                  onChange={e => setField('message', e.target.value)}
                  placeholder="Describe the alert details…"
                  rows={3}
                />
              </div>
            </div>
          </div>
        </div>

        {/* run button */}
        <div style={{ padding: '14px' }}>
          <button
            onClick={runTriage}
            disabled={triageLoading}
            style={{
              width: '100%', padding: '11px', borderRadius: 8, border: 'none',
              background: triageLoading ? 'var(--bg4)' : C.accent2,
              color: triageLoading ? C.text3 : '#fff',
              cursor: triageLoading ? 'not-allowed' : 'pointer',
              fontFamily: 'var(--mono)', fontSize: 13, fontWeight: 700,
              transition: 'all 0.15s', letterSpacing: 0.3,
            }}
          >
            {triageLoading ? '⏳ Analyzing...' : '▶ Run Triage'}
          </button>
        </div>
      </Card>

      {/* ── 3. TRIAGE RESULT ───────────────────────────────────── */}
      {triageResult && (
        <div ref={resultRef}>
          <Card title="TRIAGE ASSESSMENT" noPad>
            {/* top badge row */}
            <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
              {/* severity large badge */}
              {triageResult.severity && (
                <span style={{
                  fontSize: 12, padding: '5px 14px', borderRadius: 20, fontFamily: 'var(--mono)', fontWeight: 800,
                  background: sevBg(triageResult.severity), color: sevColor(triageResult.severity),
                  border: `2px solid ${sevBorder(triageResult.severity)}`, textTransform: 'uppercase',
                }}>
                  {triageResult.severity}
                </span>
              )}
              {/* category badge */}
              {triageResult.category && (
                <span style={{
                  fontSize: 11, padding: '4px 12px', borderRadius: 20, fontFamily: 'var(--mono)', fontWeight: 600,
                  background: 'var(--bg3)', color: C.text2, border: '1px solid var(--border)',
                }}>
                  {CAT_ICON[triageResult.category] || '❓'} {triageResult.category.replace(/_/g, ' ')}
                </span>
              )}
              {/* auto-ticket badge */}
              {triageResult.autoTicket && (
                <span style={{
                  fontSize: 10, padding: '3px 10px', borderRadius: 20, fontFamily: 'var(--mono)', fontWeight: 600,
                  background: 'rgba(79,126,245,0.15)', color: C.accent, border: `1px solid ${C.accent}44`,
                }}>
                  🎫 Auto-Ticket Recommended
                </span>
              )}
              {/* fp likelihood */}
              {triageResult.falsePositiveLikelihood != null && (
                <span style={{
                  fontSize: 10, padding: '3px 10px', borderRadius: 20, fontFamily: 'var(--mono)', fontWeight: 600,
                  background: 'var(--bg3)', color: C.text3, border: '1px solid var(--border)', marginLeft: 'auto',
                }}>
                  FP Risk: {triageResult.falsePositiveLikelihood}
                </span>
              )}
            </div>

            <div style={{ padding: '14px', display: 'flex', flexDirection: 'column', gap: 12 }}>
              {/* summary */}
              {triageResult.summary && (
                <div style={{
                  background: 'var(--bg3)', borderRadius: 8, padding: '12px 14px',
                  borderLeft: `4px solid ${sevColor(triageResult.severity || 'medium')}`,
                }}>
                  <div style={{ fontSize: 9, color: C.text3, fontFamily: 'var(--mono)', textTransform: 'uppercase', marginBottom: 5 }}>Summary</div>
                  <div style={{ fontSize: 12, color: C.text, lineHeight: 1.7, fontFamily: 'inherit' }}>{triageResult.summary}</div>
                </div>
              )}

              {/* recommendation */}
              {triageResult.recommendation && (
                <div style={{
                  background: 'rgba(34,211,160,0.07)', borderRadius: 8, padding: '12px 14px',
                  border: '1px solid rgba(34,211,160,0.25)', borderLeft: `4px solid ${C.green}`,
                }}>
                  <div style={{ fontSize: 9, color: C.green, fontFamily: 'var(--mono)', textTransform: 'uppercase', marginBottom: 5 }}>Recommendation</div>
                  <div style={{ fontSize: 12, color: C.text, lineHeight: 1.7, fontFamily: 'inherit' }}>{triageResult.recommendation}</div>
                </div>
              )}

              {/* metadata grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 8 }}>
                {[
                  triageResult.mitreTactic  && ['MITRE Tactic',  triageResult.mitreTactic,  C.cyan],
                  triageResult.relatedCVE   && ['Related CVE',   triageResult.relatedCVE,   C.red],
                ].filter(Boolean).map(([label, value, color]) => (
                  <div key={label} style={{ background: 'var(--bg3)', borderRadius: 7, padding: '9px 12px', border: '1px solid var(--border)' }}>
                    <div style={{ fontSize: 9, color: C.text3, fontFamily: 'var(--mono)', textTransform: 'uppercase', marginBottom: 3 }}>{label}</div>
                    <div style={{ fontSize: 11, color: color || C.text, fontFamily: 'var(--mono)', fontWeight: 600 }}>{value}</div>
                  </div>
                ))}
              </div>

              {/* IP Reputation */}
              {triageResult.ipReputation && (
                <div style={{ background: 'var(--bg3)', borderRadius: 8, padding: '12px 14px', border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 9, color: C.text3, fontFamily: 'var(--mono)', textTransform: 'uppercase', marginBottom: 8 }}>IP Reputation</div>
                  <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
                    {[
                      ['Abuse Score', triageResult.ipReputation.abuseScore != null ? `${triageResult.ipReputation.abuseScore}/100` : null, triageResult.ipReputation.abuseScore > 50 ? C.red : C.green],
                      ['Total Reports', triageResult.ipReputation.totalReports, C.text2],
                      ['Country',       triageResult.ipReputation.countryCode || triageResult.ipReputation.country, C.text2],
                      ['ISP',           triageResult.ipReputation.isp, C.text2],
                    ].filter(([, v]) => v != null).map(([label, val, color]) => (
                      <div key={label}>
                        <div style={{ fontSize: 9, color: C.text3, fontFamily: 'var(--mono)', textTransform: 'uppercase', marginBottom: 2 }}>{label}</div>
                        <div style={{ fontSize: 12, color: color, fontFamily: 'var(--mono)', fontWeight: 600 }}>{val}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* provider info row */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', paddingTop: 4 }}>
                {triageResult.provider && <ProviderBadge provider={triageResult.provider} />}
                {triageResult.model && (
                  <span style={{ fontSize: 10, color: C.text3, fontFamily: 'var(--mono)', background: 'var(--bg4)', padding: '2px 8px', borderRadius: 5 }}>
                    {triageResult.model}
                  </span>
                )}
                {triageResult.responseTimeMs && (
                  <span style={{ fontSize: 10, color: C.text3, fontFamily: 'var(--mono)' }}>
                    {(triageResult.responseTimeMs / 1000).toFixed(1)}s
                  </span>
                )}
                {triageResult.totalScore != null && (
                  <span style={{
                    fontSize: 10, padding: '2px 9px', borderRadius: 10, fontFamily: 'var(--mono)', fontWeight: 600,
                    background: triageResult.totalScore >= 7 ? 'rgba(34,211,160,0.12)' : 'rgba(245,166,35,0.12)',
                    color: triageResult.totalScore >= 7 ? C.green : C.amber,
                    border: `1px solid ${triageResult.totalScore >= 7 ? 'rgba(34,211,160,0.3)' : 'rgba(245,166,35,0.3)'}`,
                  }}>
                    Score: {triageResult.totalScore}/10
                  </span>
                )}

                {/* star rating */}
                {triageResult.scoreId && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto' }}>
                    {starRated ? (
                      <span style={{ fontSize: 10, color: C.green, fontFamily: 'var(--mono)' }}>Thanks for rating!</span>
                    ) : (
                      <>
                        <span style={{ fontSize: 10, color: C.text3, fontFamily: 'var(--mono)' }}>Rate:</span>
                        {[1, 2, 3, 4, 5].map(star => (
                          <button
                            key={star}
                            onMouseEnter={() => setHoveredStar(star)}
                            onMouseLeave={() => setHoveredStar(null)}
                            onClick={() => rateResponse(star)}
                            style={{
                              background: 'none', border: 'none', cursor: 'pointer',
                              fontSize: 15, padding: '0 1px', lineHeight: 1,
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
              </div>

              {/* create ticket button */}
              <button
                onClick={createTicket}
                disabled={ticketCreating || !!ticketCreated}
                style={{
                  padding: '10px 16px', borderRadius: 8, cursor: (ticketCreating || ticketCreated) ? 'not-allowed' : 'pointer',
                  background: ticketCreated
                    ? 'rgba(34,211,160,0.12)'
                    : triageResult.autoTicket
                      ? C.accent2
                      : 'var(--bg4)',
                  color: ticketCreated ? C.green : triageResult.autoTicket ? '#fff' : C.text3,
                  fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 700,
                  border: ticketCreated ? `1px solid rgba(34,211,160,0.3)` : triageResult.autoTicket ? 'none' : '1px solid var(--border)',
                  transition: 'all 0.15s',
                }}
              >
                {ticketCreated
                  ? `✓ Ticket Created`
                  : ticketCreating
                    ? '⏳ Creating...'
                    : '🎫 Create Ticket'}
              </button>
            </div>
          </Card>
        </div>
      )}

      {/* ── 4. TRIAGE HISTORY ──────────────────────────────────── */}
      <Card title="RECENT TRIAGES" badge={triageHistory.length} badgeClass="blue" noPad>
        {triageHistory.length === 0 ? (
          <div style={{ padding: '20px 14px', textAlign: 'center', color: C.text3, fontFamily: 'var(--mono)', fontSize: 11 }}>
            No triage runs yet — fill in an alert above and click Run Triage
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, fontFamily: 'var(--mono)' }}>
              <thead>
                <tr style={{ background: 'var(--bg3)', borderBottom: '1px solid var(--border)' }}>
                  {['Time', 'Alert Name', 'Severity', 'Category', 'FP Risk', 'Score'].map(h => (
                    <th key={h} style={{ padding: '7px 12px', textAlign: 'left', color: C.text3, fontWeight: 600, fontSize: 10, whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {triageHistory.slice(0, 10).map((row, i) => {
                  const sev = (row.severity || row.result?.severity || '').toLowerCase()
                  const cat = row.category || row.result?.category || ''
                  const fp  = row.falsePositiveLikelihood || row.result?.falsePositiveLikelihood || '—'
                  const sc  = row.totalScore ?? row.result?.totalScore
                  const alertName = row.alertName || row.alert?.name || row.name || '—'
                  return (
                    <tr key={i} style={{
                      borderBottom: '1px solid var(--border)',
                      background: i % 2 === 0 ? 'transparent' : 'var(--bg3)',
                      borderLeft: `3px solid ${sevColor(sev) || 'transparent'}`,
                    }}>
                      <td style={{ padding: '7px 12px', color: C.text3, whiteSpace: 'nowrap' }}>{fmtTs(row.createdAt || row.runAt)}</td>
                      <td style={{ padding: '7px 12px', color: C.text, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{alertName}</td>
                      <td style={{ padding: '7px 12px' }}>
                        {sev && (
                          <span style={{
                            fontSize: 10, padding: '2px 8px', borderRadius: 10, fontWeight: 700,
                            background: sevBg(sev), color: sevColor(sev), border: `1px solid ${sevBorder(sev)}`,
                            textTransform: 'uppercase',
                          }}>{sev}</span>
                        )}
                      </td>
                      <td style={{ padding: '7px 12px', color: C.text3 }}>
                        {cat ? `${CAT_ICON[cat] || '❓'} ${cat.replace(/_/g, ' ')}` : '—'}
                      </td>
                      <td style={{ padding: '7px 12px', color: C.text3 }}>{fp}</td>
                      <td style={{ padding: '7px 12px' }}>
                        {sc != null ? (
                          <span style={{
                            fontSize: 10, padding: '2px 8px', borderRadius: 10, fontWeight: 600,
                            background: sc >= 7 ? 'rgba(34,211,160,0.12)' : 'rgba(245,166,35,0.12)',
                            color: sc >= 7 ? C.green : C.amber,
                            border: `1px solid ${sc >= 7 ? 'rgba(34,211,160,0.3)' : 'rgba(245,166,35,0.3)'}`,
                          }}>{sc}/10</span>
                        ) : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════════
   BRIEF TAB
══════════════════════════════════════════════════════════════════ */
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

function BriefTab({ providerStatus, ollamaStatus, range, setRange, addToast }) {
  const [brief,          setBrief]          = useState(null)
  const [briefHistory,   setBriefHistory]   = useState([])
  const [briefLoading,   setBriefLoading]   = useState(false)
  const [briefProvider,  setBriefProvider]  = useState(null)
  const [briefModel,     setBriefModel]     = useState(null)
  const [selectedBrief,  setSelectedBrief]  = useState(null)
  const [genStep,        setGenStep]        = useState(0)
  const [reportExpanded, setReportExpanded] = useState(false)
  const [starRated,      setStarRated]      = useState(false)
  const [hoveredStar,    setHoveredStar]    = useState(null)
  const stepTimerRef = useRef(null)

  const displayed = selectedBrief || brief

  function normalizeBriefPayload(payload) {
    if (!payload || payload.message === 'No briefs generated yet') return null
    return payload
  }

  /* ── load on mount ─────────────────────────────────────────────── */
  useEffect(() => {
    aiAPI.getLatestBrief().then(r => setBrief(normalizeBriefPayload(r.data))).catch(() => {})
    aiAPI.getBriefHistory().then(r => setBriefHistory(r.data || [])).catch(() => {})
  }, [])

  /* ── progress step ticker ──────────────────────────────────────── */
  useEffect(() => {
    if (briefLoading) {
      setGenStep(0)
      stepTimerRef.current = setInterval(() => {
        setGenStep(s => (s < GEN_STEPS.length - 1 ? s + 1 : s))
      }, 5000)
    } else {
      clearInterval(stepTimerRef.current)
    }
    return () => clearInterval(stepTimerRef.current)
  }, [briefLoading])

  /* ── derived ───────────────────────────────────────────────────── */
  const availableProviders = Object.entries(providerStatus || {})
    .filter(([, v]) => v.ready).map(([k]) => k)
  const ollamaModels = ollamaStatus?.models?.map(m => m.name) || []
  const overrideModels = !briefProvider ? []
    : briefProvider === 'ollama' ? ollamaModels
    : (PROVIDER_MODELS[briefProvider] || []).slice(1)

  /* ── generate brief ────────────────────────────────────────────── */
  async function generateBrief() {
    setBriefLoading(true)
    setSelectedBrief(null)
    setStarRated(false)
    try {
      const dateRange = range?.type === 'preset'
        ? { from: `now-${range.value}`, to: 'now' }
        : { from: range?.from, to: range?.to }
      const { data } = await aiAPI.generateBrief(
        dateRange,
        briefProvider || undefined,
        briefModel    || undefined,
      )
      setBrief(normalizeBriefPayload(data))
      aiAPI.getBriefHistory().then(r => setBriefHistory(r.data || [])).catch(() => {})
      addToast('Brief generated successfully', 'success')
      setReportExpanded(false)
    } catch (err) {
      addToast(err.response?.data?.error || err.message, 'error')
    } finally {
      setBriefLoading(false)
    }
  }

  async function refreshBrief() {
    try {
      const [latestRes, histRes] = await Promise.allSettled([
        aiAPI.getLatestBrief(),
        aiAPI.getBriefHistory(),
      ])
      if (latestRes.status === 'fulfilled') setBrief(normalizeBriefPayload(latestRes.value.data))
      if (histRes.status === 'fulfilled') setBriefHistory(histRes.value.data || [])
      setSelectedBrief(null)
      addToast('Refreshed', 'success')
    } catch {}
  }

  async function loadHistoryBrief(historyItem) {
    const briefId = historyItem?._id || historyItem?.id
    if (!briefId) {
      setSelectedBrief(historyItem)
      setStarRated(false)
      setReportExpanded(false)
      return
    }
    if (historyItem.fullReport) {
      setSelectedBrief(historyItem)
      setStarRated(false)
      setReportExpanded(false)
      return
    }
    try {
      const { data } = await aiAPI.getBrief(briefId)
      setSelectedBrief(normalizeBriefPayload(data) || historyItem)
      setStarRated(false)
      setReportExpanded(false)
    } catch (err) {
      addToast(err.response?.data?.error || err.message, 'error')
    }
  }

  /* ── star rating ───────────────────────────────────────────────── */
  async function rateResponse(star) {
    if (!displayed?.scoreId || starRated) return
    try {
      await aiAPI.rateResponse(displayed.scoreId, star)
      setStarRated(true)
      addToast('Rating saved', 'success')
    } catch {}
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
  function fmtTs(ts) {
    if (!ts) return '—'
    try { return new Date(ts).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) }
    catch { return ts }
  }

  function fmtRange(from, to) {
    if (!from && !to) return '—'
    try {
      const fromText = from ? new Date(from).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'
      const toText = to ? new Date(to).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'
      return `${fromText} → ${toText}`
    } catch {
      return [from, to].filter(Boolean).join(' → ')
    }
  }

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
            onClick={generateBrief}
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
            onClick={refreshBrief}
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
            onClick={generateBrief}
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
                      Generated {fmtTs(briefView.generatedAt || briefView.createdAt)}
                      {briefView.period && ` · Period: ${briefView.period}`}
                      {((briefView.rangeFrom || briefView.dateRange?.from) || (briefView.rangeTo || briefView.dateRange?.to)) && ` · Covered: ${fmtRange(briefView.rangeFrom || briefView.dateRange?.from, briefView.rangeTo || briefView.dateRange?.to)}`}
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
                  onClick={() => { if (isActive) { setSelectedBrief(null); setStarRated(false); setReportExpanded(false); return } loadHistoryBrief(h) }}
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
                      {fmtTs(h.generatedAt || h.createdAt)}
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

/* ══════════════════════════════════════════════════════════════════
   MAIN PAGE
══════════════════════════════════════════════════════════════════ */
export default function AIPage() {
  const [tab, setTab]     = useState('chat')
  const [range, setRange] = useState({ type: 'preset', value: '1h', label: '1h' })

  /* ─── settings data ──────────────────────────────────────────── */
  const [configs, setConfigs]             = useState([])
  const [providerStatus, setProviderStatus] = useState(null)
  const [ollamaStatus, setOllamaStatus]   = useState(null)
  const [schedulerStatus, setSchedulerStatus] = useState([])
  const [loading, setLoading]             = useState(true)
  const [error, setError]                 = useState(null)

  /* ─── toasts ─────────────────────────────────────────────────── */
  const [toasts, setToasts] = useState([])
  const toastRef = useRef(0)
  const addToast = useCallback((msg, type = 'success') => {
    const id = ++toastRef.current
    setToasts(p => [...p, { id, msg, type }])
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 3000)
  }, [])

  /* ─── data loading ───────────────────────────────────────────── */
  const fetchAll = useCallback(async () => {
    try {
      const [cfgRes, provRes, ollamaRes, schedRes] = await Promise.allSettled([
        aiAPI.getConfigs(),
        aiAPI.getProviderStatus(),
        aiAPI.getOllamaStatus(),
        aiAPI.getSchedulerStatus(),
      ])
      if (cfgRes.status === 'fulfilled')    setConfigs(cfgRes.value.data)
      if (provRes.status === 'fulfilled')   setProviderStatus(provRes.value.data)
      if (ollamaRes.status === 'fulfilled') setOllamaStatus(ollamaRes.value.data)
      if (schedRes.status === 'fulfilled')  setSchedulerStatus(schedRes.value.data)
      setError(null)
    } catch (err) {
      setError(err.response?.data?.error || err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchAll()
    const interval = setInterval(fetchAll, 60000)
    return () => clearInterval(interval)
  }, [fetchAll])

  /* ─── derived ────────────────────────────────────────────────── */
  const activeProvider = providerStatus
    ? Object.entries(providerStatus).find(([, v]) => v.ready)?.[0] ?? 'ollama'
    : null
  const activeTab = TABS.find(t => t.id === tab)

  /* ══════════════════════════════════════════════════════════════ */
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

      {/* header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', borderBottom: '1px solid var(--border)', background: 'var(--bg2)', flexShrink: 0, gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 18 }}>🤖</span>
          <span style={{ fontWeight: 700, fontSize: 14, color: C.text }}>AI Intelligence Center</span>
          {activeProvider && <ProviderBadge provider={activeProvider} />}
          <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontFamily: 'var(--mono)', fontSize: 10, color: C.green, background: 'rgba(34,211,160,0.08)', border: '1px solid rgba(34,211,160,0.2)', padding: '3px 9px', borderRadius: 20 }}>
            <span style={{ width: 6, height: 6, background: C.green, borderRadius: '50%', display: 'inline-block', animation: 'pulse 2s infinite' }} />
            LIVE
          </span>
        </div>
        <RangePicker range={range} onChange={setRange} />
      </div>

      {/* tab bar */}
      <div style={{ display: 'flex', gap: 2, padding: '8px 16px 0', background: 'var(--bg2)', borderBottom: '1px solid var(--border)', flexShrink: 0, overflowX: 'auto' }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', border: 'none', cursor: 'pointer', fontSize: 12, fontFamily: 'var(--mono)', fontWeight: 500, borderRadius: '8px 8px 0 0', background: tab === t.id ? 'var(--bg3)' : 'transparent', color: tab === t.id ? C.accent2 : C.text3, borderBottom: tab === t.id ? `2px solid ${C.accent2}` : '2px solid transparent', transition: 'all 0.15s', whiteSpace: 'nowrap' }}>
            <span>{t.icon}</span><span>{t.label}</span>
          </button>
        ))}
      </div>

      {/* content */}
      <div style={{ flex: 1, overflow: tab === 'chat' ? 'hidden' : 'auto', padding: 16, display: tab === 'chat' ? 'flex' : 'block', flexDirection: 'column' }}>
        {loading && <div style={{ color: C.text3, fontFamily: 'var(--mono)', fontSize: 12, padding: 20 }}>Loading AI status…</div>}
        {error && !loading && (
          <div style={{ background: 'rgba(245,83,79,0.08)', border: '1px solid rgba(245,83,79,0.25)', borderRadius: 8, padding: '10px 14px', marginBottom: 12, color: C.red, fontFamily: 'var(--mono)', fontSize: 11 }}>
            ⚠ {error}
          </div>
        )}
        {!loading && activeTab && (() => {
          if (tab === 'settings') return (
            <SettingsTab
              configs={configs}
              setConfigs={setConfigs}
              providerStatus={providerStatus}
              ollamaStatus={ollamaStatus}
              schedulerStatus={schedulerStatus}
              setSchedulerStatus={setSchedulerStatus}
              addToast={addToast}
              onRefresh={fetchAll}
            />
          )
          if (tab === 'chat') return (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
              <ChatTab
                providerStatus={providerStatus}
                range={range}
                addToast={addToast}
              />
            </div>
          )
          if (tab === 'anomaly') return (
            <AnomalyTab
              providerStatus={providerStatus}
              ollamaStatus={ollamaStatus}
              range={range}
              addToast={addToast}
            />
          )
          if (tab === 'triage') return (
            <TriageTab providerStatus={providerStatus} addToast={addToast} />
          )
          if (tab === 'brief') return (
            <BriefTab
              providerStatus={providerStatus}
              ollamaStatus={ollamaStatus}
              range={range}
              setRange={setRange}
              addToast={addToast}
            />
          )
          if (tab === 'search') return (
            <SearchTab
              providerStatus={providerStatus}
              ollamaStatus={ollamaStatus}
              range={range}
              addToast={addToast}
            />
          )
          if (tab === 'modellab') return (
            <ModelLabTab
              providerStatus={providerStatus}
              ollamaStatus={ollamaStatus}
              range={range}
              addToast={addToast}
            />
          )
          return <TabPlaceholder tab={activeTab} />
        })()}
      </div>

      <Toast toasts={toasts} />
    </div>
  )
}
