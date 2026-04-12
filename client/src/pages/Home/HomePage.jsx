import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Line } from 'react-chartjs-2'
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend, Filler } from 'chart.js'
import api from '../../api/client'
import RangePicker from '../../components/ui/RangePicker.jsx'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend, Filler)

const C = { accent:'#4f7ef5', accent2:'#7c5cfc', green:'#22d3a0', red:'#f5534f', amber:'#f5a623', cyan:'#22d3ee', text:'#e8eaf2', text2:'#8b90aa', text3:'#555a72' }

const SEV_COLOR = { critical: C.red, high: C.amber, medium: C.accent, low: C.green, info: C.text3 }
const BORDER = { soc: C.red, noc: C.cyan, edr: C.accent2 }

function StatusCard({ label, route, color, stats, lines }) {
  const navigate = useNavigate()
  return (
    <div
      onClick={() => navigate(route)}
      style={{ flex:1, minWidth:200, background:'var(--bg2)', border:`1px solid ${color}44`, borderTop:`3px solid ${color}`, borderRadius:10, padding:'14px 16px', cursor:'pointer', transition:'all 0.15s', position:'relative' }}
      onMouseEnter={e => e.currentTarget.style.background = 'var(--bg3)'}
      onMouseLeave={e => e.currentTarget.style.background = 'var(--bg2)'}
    >
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
        <span style={{ fontSize:11, fontWeight:700, color, fontFamily:'var(--mono)', letterSpacing:1, textTransform:'uppercase' }}>{label}</span>
        <div style={{ width:6, height:6, borderRadius:'50%', background: color, boxShadow:`0 0 6px ${color}` }} />
      </div>
      <div style={{ fontSize:28, fontWeight:700, color: C.text, lineHeight:1, marginBottom:8 }}>{stats.total?.toLocaleString() ?? '—'}</div>
      <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
        {lines.map((l, i) => (
          <div key={i} style={{ display:'flex', justifyContent:'space-between', fontSize:10, fontFamily:'var(--mono)' }}>
            <span style={{ color: C.text3 }}>{l.label}</span>
            <span style={{ color: l.color || C.text2, fontWeight:600 }}>{l.value ?? 0}</span>
          </div>
        ))}
      </div>
      <div style={{ position:'absolute', bottom:10, right:12, fontSize:9, color: color, fontFamily:'var(--mono)', opacity:0.7 }}>VIEW →</div>
    </div>
  )
}

function KPI({ label, value, color, sub }) {
  return (
    <div className={`kpi ${color || 'blue'}`} style={{ minWidth:0 }}>
      <div style={{ fontSize:10, fontWeight:600, color:C.text3, letterSpacing:1, textTransform:'uppercase', marginBottom:6, fontFamily:'var(--mono)' }}>{label}</div>
      <div style={{ fontSize:22, fontWeight:700, lineHeight:1, marginBottom:4, color: color ? (SEV_COLOR[color] || C.accent) : C.accent }}>{value ?? '—'}</div>
      {sub && <div style={{ fontSize:10, color:C.text3, fontFamily:'var(--mono)' }}>{sub}</div>}
    </div>
  )
}

function Card({ title, badge, badgeClass='blue', height, children, noPad }) {
  return (
    <div className="card">
      <div className="card-header">
        <span className="card-title">{title}</span>
        {badge && <span className={`badge badge-${badgeClass}`}>{badge}</span>}
      </div>
      <div style={ noPad ? {} : { padding:'12px 14px', height }}>
        {children}
      </div>
    </div>
  )
}

const chartOpts = {
  responsive: true, maintainAspectRatio: false,
  plugins: { legend: { position: 'top', labels: { color: C.text3, font: { size: 9 }, boxWidth: 10, padding: 8 } } },
  scales: {
    x: { ticks: { color: C.text3, font: { size: 8 }, maxTicksLimit: 8 }, grid: { color: 'rgba(99,120,200,0.07)' } },
    y: { ticks: { color: C.text3, font: { size: 9 } }, grid: { color: 'rgba(99,120,200,0.07)' } },
  },
}

function sevBadge(sev) {
  const s = (sev || 'info').toLowerCase()
  const colorClass = { critical:'red', high:'amber', medium:'blue', low:'green', warning:'amber', emergency:'red', info:'blue', notice:'blue' }
  return <span className={`badge badge-${colorClass[s] || 'blue'}`} style={{ fontSize:9 }}>{s}</span>
}

export default function HomePage() {
  const [range, setRange] = useState('24h')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  async function load(r, df, dt) {
    setLoading(true); setError(null)
    try {
      const params = { range: r }
      if (df && dt) { params.from = df; params.to = dt }
      const res = await api.get('/api/stats/home', { params })
      setData(res.data)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load(range, dateFrom, dateTo) }, [range, dateFrom, dateTo])

  const soc = data?.soc || {}
  const noc = data?.noc || {}
  const edr = data?.edr || {}
  const tickets = data?.tickets || {}
  const alerts = data?.alerts || {}
  const timeline = data?.timeline || []
  const recentCritical = data?.recentCritical || []

  const tLabels = timeline.map(t => {
    const d = new Date(t.time)
    return d.toLocaleTimeString('en', { hour:'2-digit', minute:'2-digit' })
  })

  const timelineChart = {
    labels: tLabels,
    datasets: [
      { label: 'Firewall', data: timeline.map(t => t.firewall), borderColor: C.red, backgroundColor: `${C.red}18`, fill: true, tension: 0.4, pointRadius: 0, borderWidth: 1.5 },
      { label: 'Network', data: timeline.map(t => t.cisco), borderColor: C.cyan, backgroundColor: `${C.cyan}18`, fill: true, tension: 0.4, pointRadius: 0, borderWidth: 1.5 },
      { label: 'Endpoint', data: timeline.map(t => t.sentinel), borderColor: C.accent2, backgroundColor: `${C.accent2}18`, fill: true, tension: 0.4, pointRadius: 0, borderWidth: 1.5 },
    ],
  }

  return (
    <div style={{ padding:'16px 20px', display:'flex', flexDirection:'column', gap:14, overflowY:'auto', height:'100%' }}>

      {/* Header row */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0 }}>
        <div>
          <div style={{ fontSize:15, fontWeight:700, color: C.text }}>Command Center</div>
          <div style={{ fontSize:10, color: C.text3, fontFamily:'var(--mono)' }}>Unified platform overview</div>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          {loading && <span style={{ fontSize:10, color: C.text3, fontFamily:'var(--mono)' }}>Refreshing...</span>}
          {error && <span style={{ fontSize:10, color: C.red, fontFamily:'var(--mono)' }}>Error: {error}</span>}
          <RangePicker range={range} setRange={setRange} dateFrom={dateFrom} setDateFrom={setDateFrom} dateTo={dateTo} setDateTo={setDateTo} />
        </div>
      </div>

      {/* Section 1: Status Cards */}
      <div style={{ display:'flex', gap:12, flexShrink:0 }}>
        <StatusCard
          label="SOC" route="/soc" color={BORDER.soc} stats={soc}
          lines={[
            { label: 'Denied', value: soc.denied?.toLocaleString(), color: C.red },
            { label: 'IPS Events', value: soc.ips?.toLocaleString(), color: C.amber },
            { label: 'UTM Events', value: soc.utm?.toLocaleString(), color: C.accent },
            { label: 'VPN Sessions', value: soc.vpn?.toLocaleString(), color: C.green },
          ]}
        />
        <StatusCard
          label="NOC" route="/noc" color={BORDER.noc} stats={noc}
          lines={[
            { label: 'Interface Up/Down', value: noc.updown?.toLocaleString(), color: C.amber },
            { label: 'MAC Flap', value: noc.macflap?.toLocaleString(), color: C.red },
            { label: 'VLAN Mismatch', value: noc.vlanmismatch?.toLocaleString(), color: C.amber },
            { label: 'Active Sites', value: noc.sites?.length, color: C.cyan },
          ]}
        />
        <StatusCard
          label="EDR" route="/edr" color={BORDER.edr} stats={edr}
          lines={[
            { label: 'Threats Detected', value: edr.threats?.toLocaleString(), color: C.red },
            { label: 'USB Events', value: edr.usb_events?.toLocaleString(), color: C.amber },
            { label: 'Endpoints', value: edr.endpoints?.toLocaleString(), color: C.accent2 },
          ]}
        />
      </div>

      {/* Section 2: Quick KPIs */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(7, 1fr)', gap:10, flexShrink:0 }}>
        <KPI label="Open Tickets" value={tickets.open ?? 0} color="blue" sub="open+in-progress" />
        <KPI label="Critical" value={tickets.critical ?? 0} color="red" sub="tickets" />
        <KPI label="High" value={tickets.high ?? 0} color="amber" sub="tickets" />
        <KPI label="Alert Rules" value={alerts.total ?? 0} color="blue" sub="total rules" />
        <KPI label="Enabled" value={alerts.enabled ?? 0} color="green" sub="active rules" />
        <KPI label="Devices" value={data?.devices ?? 0} color="blue" sub="registered" />
        <KPI label="Users" value={data?.users ?? 0} color="blue" sub="accounts" />
      </div>

      {/* Section 3: Combined Timeline */}
      <Card title="Combined Activity Timeline" badge={range.toUpperCase()} height={180}>
        {timeline.length > 0
          ? <Line data={timelineChart} options={chartOpts} />
          : <div style={{ height:180, display:'flex', alignItems:'center', justifyContent:'center', color: C.text3, fontSize:12 }}>No data for selected range</div>
        }
      </Card>

      {/* Section 4: Two column — Recent Critical + System Status */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>

        {/* Recent Critical Events */}
        <Card title="Recent Critical Events" badge={recentCritical.length} noPad>
          <div style={{ maxHeight:260, overflowY:'auto' }}>
            {recentCritical.length === 0
              ? <div style={{ padding:16, textAlign:'center', color: C.text3, fontSize:12 }}>No events</div>
              : recentCritical.map((ev, i) => (
                <div key={i} style={{ display:'grid', gridTemplateColumns:'auto 1fr auto', alignItems:'center', gap:8, padding:'7px 14px', borderBottom:'1px solid var(--border)', fontSize:11 }}>
                  <div style={{ width:6, height:6, borderRadius:'50%', background: SEV_COLOR[(ev.severity || '').toLowerCase()] || C.text3, flexShrink:0 }} />
                  <div style={{ minWidth:0 }}>
                    <div style={{ color: C.text, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', fontSize:11 }}>{ev.message}</div>
                    <div style={{ color: C.text3, fontSize:9, fontFamily:'var(--mono)' }}>
                      {ev.type} {ev.site ? `• ${ev.site}` : ''} • {new Date(ev.timestamp).toLocaleTimeString()}
                    </div>
                  </div>
                  {sevBadge(ev.severity)}
                </div>
              ))
            }
          </div>
        </Card>

        {/* System Status */}
        <Card title="System Status" noPad>
          <div style={{ padding:'12px 14px', display:'flex', flexDirection:'column', gap:10 }}>

            {/* Alert rule last fired */}
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'8px 10px', background:'var(--bg3)', borderRadius:6 }}>
              <div>
                <div style={{ fontSize:11, color: C.text, fontWeight:600 }}>Alert Engine</div>
                <div style={{ fontSize:10, color: C.text3, fontFamily:'var(--mono)' }}>
                  Last fired: {alerts.lastFired ? new Date(alerts.lastFired).toLocaleString() : 'Never'}
                </div>
              </div>
              <span className={`badge badge-${alerts.enabled > 0 ? 'green' : 'amber'}`}>{alerts.enabled ?? 0} active</span>
            </div>

            {/* NOC Sites */}
            {noc.sites && noc.sites.length > 0 && (
              <div>
                <div style={{ fontSize:10, color: C.text3, fontFamily:'var(--mono)', marginBottom:6, letterSpacing:0.5 }}>TOP ACTIVE SITES</div>
                <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
                  {noc.sites.slice(0, 5).map((s, i) => {
                    const max = noc.sites[0]?.doc_count || 1
                    const pct = ((s.doc_count / max) * 100).toFixed(0)
                    return (
                      <div key={i} style={{ display:'flex', alignItems:'center', gap:8 }}>
                        <div style={{ width:80, fontSize:10, color: C.text2, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{s.key}</div>
                        <div style={{ flex:1, height:4, background:'var(--bg4)', borderRadius:2, overflow:'hidden' }}>
                          <div style={{ width:`${pct}%`, height:'100%', background: C.cyan, borderRadius:2 }} />
                        </div>
                        <div style={{ fontSize:10, color: C.cyan, fontFamily:'var(--mono)', width:40, textAlign:'right' }}>{s.doc_count?.toLocaleString()}</div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Ticket summary */}
            <div>
              <div style={{ fontSize:10, color: C.text3, fontFamily:'var(--mono)', marginBottom:6, letterSpacing:0.5 }}>OPEN TICKET SEVERITY</div>
              <div style={{ display:'flex', gap:8 }}>
                {['critical','high','medium','low'].map(sev => (
                  <div key={sev} style={{ flex:1, textAlign:'center', padding:'6px 4px', background:'var(--bg3)', borderRadius:6, border:`1px solid ${SEV_COLOR[sev]}33` }}>
                    <div style={{ fontSize:16, fontWeight:700, color: SEV_COLOR[sev] }}>{tickets[sev] ?? 0}</div>
                    <div style={{ fontSize:9, color: C.text3, fontFamily:'var(--mono)', textTransform:'uppercase' }}>{sev}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* Section 5: Site comparison mini-cards */}
      {noc.sites && noc.sites.length > 0 && (
        <div style={{ flexShrink:0 }}>
          <div style={{ fontSize:10, fontWeight:600, color: C.text3, fontFamily:'var(--mono)', letterSpacing:1, textTransform:'uppercase', marginBottom:8 }}>Site Activity Comparison</div>
          <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
            {noc.sites.map((site, i) => {
              const colors = [C.cyan, C.accent, C.green, C.amber, C.accent2, C.red]
              const c = colors[i % colors.length]
              return (
                <div key={i} style={{ background:'var(--bg2)', border:`1px solid ${c}33`, borderLeft:`3px solid ${c}`, borderRadius:8, padding:'10px 14px', minWidth:130 }}>
                  <div style={{ fontSize:11, fontWeight:600, color: C.text, marginBottom:4, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{site.key}</div>
                  <div style={{ fontSize:20, fontWeight:700, color: c }}>{site.doc_count?.toLocaleString()}</div>
                  <div style={{ fontSize:9, color: C.text3, fontFamily:'var(--mono)' }}>events</div>
                </div>
              )
            })}
          </div>
        </div>
      )}

    </div>
  )
}
