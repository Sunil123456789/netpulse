import { useEffect, useRef, useState } from 'react'
import { aiAPI } from '../../../api/ai.js'
import { ticketsAPI } from '../../../api/tickets.js'
import { useAuthStore } from '../../../store/authStore'
import { canUseCapability } from '../../../config/access'
import { C, selSx } from '../constants'
import { Card, ProviderBadge } from '../components/Common.jsx'
import { formatTimestamp, getProviderOverrideModels, getReadyProviders } from '../utils/common.js'

const TRIG_SEV_COLOR = { critical: '#f5534f', high: '#f5a623', medium: '#4f7ef5', low: '#22d3a0' }
const TRIG_SEV_BG = { critical: 'rgba(245,83,79,0.12)', high: 'rgba(245,166,35,0.12)', medium: 'rgba(79,126,245,0.12)', low: 'rgba(34,211,160,0.12)' }
const TRIG_SEV_BORDER = { critical: 'rgba(245,83,79,0.35)', high: 'rgba(245,166,35,0.35)', medium: 'rgba(79,126,245,0.35)', low: 'rgba(34,211,160,0.35)' }

const CAT_ICON = {
  intrusion: '🔴',
  malware: '☣️',
  brute_force: '🔑',
  reconnaissance: '👁️',
  policy_violation: '📋',
  anomaly: '📈',
  other: '❓',
}

const SAMPLE_ALERTS = {
  'SQL Injection': {
    name: 'SQL Injection Attack Detected',
    type: 'ips',
    srcip: '185.220.101.3',
    dstip: '10.0.0.45',
    srccountry: 'Russia',
    attack: 'SQL.Injection.Login.Bypass',
    severity: 'high',
    site_name: 'Gurgaon-WH',
    device_name: 'Gurgaon-FW-01',
    message: 'SQL injection attempt on login page',
  },
  'Port Scan': {
    name: 'Port Scan Detected',
    type: 'ips',
    srcip: '45.128.232.101',
    dstip: '10.0.1.100',
    srccountry: 'China',
    attack: 'Port.Scan.Multi',
    severity: 'medium',
    site_name: 'Mumbai-DC',
    device_name: 'Mumbai-FW-01',
    message: 'Sequential port scan from external IP',
  },
  'Brute Force': {
    name: 'SSH Brute Force Attack',
    type: 'auth',
    srcip: '193.32.162.44',
    dstip: '10.10.0.5',
    srccountry: 'Ukraine',
    attack: 'SSH.Brute.Force',
    severity: 'high',
    site_name: 'Delhi-HQ',
    device_name: 'Delhi-FW-01',
    message: 'Multiple failed SSH login attempts detected',
  },
  Malware: {
    name: 'Malware C2 Communication',
    type: 'utm',
    srcip: '10.1.0.23',
    dstip: '91.108.4.167',
    srccountry: 'Netherlands',
    attack: 'Trojan.Generic.C2',
    severity: 'critical',
    site_name: 'Gurgaon-WH',
    device_name: 'Gurgaon-FW-01',
    message: 'Outbound C2 communication detected from internal host',
  },
  DDoS: {
    name: 'DDoS Attack Incoming',
    type: 'traffic',
    srcip: '0.0.0.0',
    dstip: '203.0.113.10',
    srccountry: 'Multiple',
    attack: 'DDoS.SYN.Flood',
    severity: 'critical',
    site_name: 'Mumbai-DC',
    device_name: 'Mumbai-Edge-01',
    message: 'High volume SYN flood targeting public IP',
  },
}

const BLANK_FORM = {
  name: '',
  type: 'ips',
  srcip: '',
  dstip: '',
  srccountry: '',
  attack: '',
  severity: 'high',
  site_name: '',
  device_name: '',
  message: '',
}

export default function TriageTab({ providerStatus, ollamaStatus, addToast }) {
  const user = useAuthStore(s => s.user)
  const [triageResult, setTriageResult] = useState(null)
  const [triageHistory, setTriageHistory] = useState([])
  const [triageLoading, setTriageLoading] = useState(false)
  const [triageProvider, setTriageProvider] = useState(null)
  const [triageModel, setTriageModel] = useState(null)
  const [alertForm, setAlertForm] = useState(BLANK_FORM)
  const [starRated, setStarRated] = useState(false)
  const [hoveredStar, setHoveredStar] = useState(null)
  const [ticketCreating, setTicketCreating] = useState(false)
  const [ticketCreated, setTicketCreated] = useState(null)
  const resultRef = useRef(null)

  useEffect(() => {
    aiAPI.getTriageHistory().then(r => setTriageHistory(r.data || [])).catch(() => {})
  }, [])

  const availableProviders = getReadyProviders(providerStatus)
  const overrideModels = getProviderOverrideModels(triageProvider, providerStatus, ollamaStatus)
  const canCreateTickets = canUseCapability('createTickets', user)

  const setField = (k, v) => setAlertForm(f => ({ ...f, [k]: v }))

  async function runTriage() {
    if (!alertForm.name.trim()) {
      addToast('Alert name is required', 'error')
      return
    }
    setTriageLoading(true)
    setTriageResult(null)
    setStarRated(false)
    setTicketCreated(null)
    try {
      const { data } = await aiAPI.triage(
        alertForm,
        triageProvider || undefined,
        triageModel || undefined,
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

  async function rateResponse(star) {
    if (!triageResult?.scoreId || starRated) return
    try {
      await aiAPI.rateResponse(triageResult.scoreId, star)
      setStarRated(true)
      addToast('Rating saved', 'success')
    } catch {}
  }

  async function createTicket() {
    if (!triageResult || !canCreateTickets) return
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
          triageResult.relatedCVE ? `**CVE:** ${triageResult.relatedCVE}` : '',
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

  function sevColor(s) { return TRIG_SEV_COLOR[(s || '').toLowerCase()] || C.text3 }
  function sevBg(s) { return TRIG_SEV_BG[(s || '').toLowerCase()] || 'transparent' }
  function sevBorder(s) { return TRIG_SEV_BORDER[(s || '').toLowerCase()] || 'var(--border)' }

  const inSx = {
    width: '100%',
    background: 'var(--bg3)',
    border: '1px solid var(--border)',
    color: 'var(--text)',
    borderRadius: 6,
    padding: '6px 9px',
    fontSize: 11,
    fontFamily: 'var(--mono)',
    outline: 'none',
    boxSizing: 'border-box',
  }
  const labelSx = { fontSize: 10, color: C.text3, fontFamily: 'var(--mono)', marginBottom: 3, display: 'block' }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 10, color: C.text3, fontFamily: 'var(--mono)' }}>Provider:</span>
        <select
          value={triageProvider || 'default'}
          onChange={e => {
            setTriageProvider(e.target.value === 'default' ? null : e.target.value)
            setTriageModel(null)
          }}
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
          onClick={() => {
            setAlertForm(BLANK_FORM)
            setTriageResult(null)
            setStarRated(false)
            setTicketCreated(null)
          }}
          style={{ fontSize: 10, padding: '4px 12px', borderRadius: 5, border: '1px solid var(--border)', background: 'var(--bg4)', color: C.text3, cursor: 'pointer', fontFamily: 'var(--mono)' }}
        >
          Clear Form
        </button>
      </div>

      <Card title="ALERT DETAILS" noPad>
        <div style={{ padding: '14px 14px 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 10, color: C.text3, fontFamily: 'var(--mono)', whiteSpace: 'nowrap' }}>Fill with sample:</span>
            {Object.keys(SAMPLE_ALERTS).map(name => (
              <button
                key={name}
                onClick={() => {
                  setAlertForm(SAMPLE_ALERTS[name])
                  setTriageResult(null)
                  setStarRated(false)
                  setTicketCreated(null)
                }}
                style={{
                  fontSize: 10,
                  padding: '4px 10px',
                  borderRadius: 20,
                  cursor: 'pointer',
                  background: 'var(--bg4)',
                  color: C.accent,
                  border: `1px solid ${C.accent}33`,
                  fontFamily: 'var(--mono)',
                  transition: 'all 0.15s',
                }}
              >
                {name}
              </button>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 20px' }}>
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

        <div style={{ padding: '14px' }}>
          <button
            onClick={runTriage}
            disabled={triageLoading}
            style={{
              width: '100%',
              padding: '11px',
              borderRadius: 8,
              border: 'none',
              background: triageLoading ? 'var(--bg4)' : C.accent2,
              color: triageLoading ? C.text3 : '#fff',
              cursor: triageLoading ? 'not-allowed' : 'pointer',
              fontFamily: 'var(--mono)',
              fontSize: 13,
              fontWeight: 700,
              transition: 'all 0.15s',
              letterSpacing: 0.3,
            }}
          >
            {triageLoading ? '⏳ Analyzing...' : '▶ Run Triage'}
          </button>
        </div>
      </Card>

      {triageResult && (
        <div ref={resultRef}>
          <Card title="TRIAGE ASSESSMENT" noPad>
            <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
              {triageResult.severity && (
                <span
                  style={{
                    fontSize: 12,
                    padding: '5px 14px',
                    borderRadius: 20,
                    fontFamily: 'var(--mono)',
                    fontWeight: 800,
                    background: sevBg(triageResult.severity),
                    color: sevColor(triageResult.severity),
                    border: `2px solid ${sevBorder(triageResult.severity)}`,
                    textTransform: 'uppercase',
                  }}
                >
                  {triageResult.severity}
                </span>
              )}
              {triageResult.category && (
                <span style={{ fontSize: 11, padding: '4px 12px', borderRadius: 20, fontFamily: 'var(--mono)', fontWeight: 600, background: 'var(--bg3)', color: C.text2, border: '1px solid var(--border)' }}>
                  {CAT_ICON[triageResult.category] || '❓'} {triageResult.category.replace(/_/g, ' ')}
                </span>
              )}
              {triageResult.autoTicket && canCreateTickets && (
                <span style={{ fontSize: 10, padding: '3px 10px', borderRadius: 20, fontFamily: 'var(--mono)', fontWeight: 600, background: 'rgba(79,126,245,0.15)', color: C.accent, border: `1px solid ${C.accent}44` }}>
                  🎫 Auto-Ticket Recommended
                </span>
              )}
              {triageResult.autoTicket && !canCreateTickets && (
                <span style={{ fontSize: 10, padding: '3px 10px', borderRadius: 20, fontFamily: 'var(--mono)', fontWeight: 600, background: 'var(--bg3)', color: C.text3, border: '1px solid var(--border)' }}>
                  Ticketing unavailable in this environment
                </span>
              )}
              {triageResult.falsePositiveLikelihood != null && (
                <span style={{ fontSize: 10, padding: '3px 10px', borderRadius: 20, fontFamily: 'var(--mono)', fontWeight: 600, background: 'var(--bg3)', color: C.text3, border: '1px solid var(--border)', marginLeft: 'auto' }}>
                  FP Risk: {triageResult.falsePositiveLikelihood}
                </span>
              )}
            </div>

            <div style={{ padding: '14px', display: 'flex', flexDirection: 'column', gap: 12 }}>
              {triageResult.summary && (
                <div style={{ background: 'var(--bg3)', borderRadius: 8, padding: '12px 14px', borderLeft: `4px solid ${sevColor(triageResult.severity || 'medium')}` }}>
                  <div style={{ fontSize: 9, color: C.text3, fontFamily: 'var(--mono)', textTransform: 'uppercase', marginBottom: 5 }}>Summary</div>
                  <div style={{ fontSize: 12, color: C.text, lineHeight: 1.7, fontFamily: 'inherit' }}>{triageResult.summary}</div>
                </div>
              )}

              {triageResult.recommendation && (
                <div style={{ background: 'rgba(34,211,160,0.07)', borderRadius: 8, padding: '12px 14px', border: '1px solid rgba(34,211,160,0.25)', borderLeft: `4px solid ${C.green}` }}>
                  <div style={{ fontSize: 9, color: C.green, fontFamily: 'var(--mono)', textTransform: 'uppercase', marginBottom: 5 }}>Recommendation</div>
                  <div style={{ fontSize: 12, color: C.text, lineHeight: 1.7, fontFamily: 'inherit' }}>{triageResult.recommendation}</div>
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 8 }}>
                {[
                  triageResult.mitreTactic && ['MITRE Tactic', triageResult.mitreTactic, C.cyan],
                  triageResult.relatedCVE && ['Related CVE', triageResult.relatedCVE, C.red],
                ].filter(Boolean).map(([label, value, color]) => (
                  <div key={label} style={{ background: 'var(--bg3)', borderRadius: 7, padding: '9px 12px', border: '1px solid var(--border)' }}>
                    <div style={{ fontSize: 9, color: C.text3, fontFamily: 'var(--mono)', textTransform: 'uppercase', marginBottom: 3 }}>{label}</div>
                    <div style={{ fontSize: 11, color: color || C.text, fontFamily: 'var(--mono)', fontWeight: 600 }}>{value}</div>
                  </div>
                ))}
              </div>

              {triageResult.ipReputation && (
                <div style={{ background: 'var(--bg3)', borderRadius: 8, padding: '12px 14px', border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 9, color: C.text3, fontFamily: 'var(--mono)', textTransform: 'uppercase', marginBottom: 8 }}>IP Reputation</div>
                  <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
                    {[
                      ['Abuse Score', triageResult.ipReputation.abuseScore != null ? `${triageResult.ipReputation.abuseScore}/100` : null, triageResult.ipReputation.abuseScore > 50 ? C.red : C.green],
                      ['Total Reports', triageResult.ipReputation.totalReports, C.text2],
                      ['Country', triageResult.ipReputation.countryCode || triageResult.ipReputation.country, C.text2],
                      ['ISP', triageResult.ipReputation.isp, C.text2],
                    ].filter(([, v]) => v != null).map(([label, val, color]) => (
                      <div key={label}>
                        <div style={{ fontSize: 9, color: C.text3, fontFamily: 'var(--mono)', textTransform: 'uppercase', marginBottom: 2 }}>{label}</div>
                        <div style={{ fontSize: 12, color, fontFamily: 'var(--mono)', fontWeight: 600 }}>{val}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

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
                  <span style={{ fontSize: 10, padding: '2px 9px', borderRadius: 10, fontFamily: 'var(--mono)', fontWeight: 600, background: triageResult.totalScore >= 7 ? 'rgba(34,211,160,0.12)' : 'rgba(245,166,35,0.12)', color: triageResult.totalScore >= 7 ? C.green : C.amber, border: `1px solid ${triageResult.totalScore >= 7 ? 'rgba(34,211,160,0.3)' : 'rgba(245,166,35,0.3)'}` }}>
                    Score: {triageResult.totalScore}/10
                  </span>
                )}

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
                            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 15, padding: '0 1px', lineHeight: 1, opacity: hoveredStar != null ? (star <= hoveredStar ? 1 : 0.3) : 0.3, filter: hoveredStar != null && star <= hoveredStar ? 'none' : 'grayscale(1)', transition: 'all 0.1s' }}
                          >
                            ⭐
                          </button>
                        ))}
                      </>
                    )}
                  </div>
                )}
              </div>

              {canCreateTickets ? (
                <button
                  onClick={createTicket}
                  disabled={ticketCreating || !!ticketCreated}
                  style={{
                    padding: '10px 16px',
                    borderRadius: 8,
                    cursor: (ticketCreating || ticketCreated) ? 'not-allowed' : 'pointer',
                    background: ticketCreated ? 'rgba(34,211,160,0.12)' : triageResult.autoTicket ? C.accent2 : 'var(--bg4)',
                    color: ticketCreated ? C.green : triageResult.autoTicket ? '#fff' : C.text3,
                    fontFamily: 'var(--mono)',
                    fontSize: 12,
                    fontWeight: 700,
                    border: ticketCreated ? '1px solid rgba(34,211,160,0.3)' : triageResult.autoTicket ? 'none' : '1px solid var(--border)',
                    transition: 'all 0.15s',
                  }}
                >
                  {ticketCreated ? '✓ Ticket Created' : ticketCreating ? '⏳ Creating...' : '🎫 Create Ticket'}
                </button>
              ) : (
                <div style={{ padding: '10px 16px', borderRadius: 8, background: 'var(--bg4)', color: C.text3, fontFamily: 'var(--mono)', fontSize: 11, border: '1px solid var(--border)' }}>
                  Ticket creation is disabled for your role or current feature set.
                </div>
              )}
            </div>
          </Card>
        </div>
      )}

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
                  const fp = row.falsePositiveLikelihood || row.result?.falsePositiveLikelihood || '—'
                  const sc = row.totalScore ?? row.result?.totalScore
                  const alertName = row.alertName || row.alert?.name || row.name || '—'
                  return (
                    <tr
                      key={i}
                      style={{
                        borderBottom: '1px solid var(--border)',
                        background: i % 2 === 0 ? 'transparent' : 'var(--bg3)',
                        borderLeft: `3px solid ${sevColor(sev) || 'transparent'}`,
                      }}
                    >
                      <td style={{ padding: '7px 12px', color: C.text3, whiteSpace: 'nowrap' }}>{formatTimestamp(row.createdAt || row.runAt)}</td>
                      <td style={{ padding: '7px 12px', color: C.text, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{alertName}</td>
                      <td style={{ padding: '7px 12px' }}>
                        {sev && (
                          <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, fontWeight: 700, background: sevBg(sev), color: sevColor(sev), border: `1px solid ${sevBorder(sev)}`, textTransform: 'uppercase' }}>
                            {sev}
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '7px 12px', color: C.text3 }}>
                        {cat ? `${CAT_ICON[cat] || '❓'} ${cat.replace(/_/g, ' ')}` : '—'}
                      </td>
                      <td style={{ padding: '7px 12px', color: C.text3 }}>{fp}</td>
                      <td style={{ padding: '7px 12px' }}>
                        {sc != null ? (
                          <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, fontWeight: 600, background: sc >= 7 ? 'rgba(34,211,160,0.12)' : 'rgba(245,166,35,0.12)', color: sc >= 7 ? C.green : C.amber, border: `1px solid ${sc >= 7 ? 'rgba(34,211,160,0.3)' : 'rgba(245,166,35,0.3)'}` }}>
                            {sc}/10
                          </span>
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
