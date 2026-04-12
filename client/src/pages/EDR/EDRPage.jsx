import { useEffect, useState } from 'react'
import { Line, Bar, Doughnut } from 'react-chartjs-2'
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, BarElement, ArcElement, Tooltip, Legend, Filler } from 'chart.js'
import RangePicker from '../../components/ui/RangePicker.jsx'
import { edrAPI } from '../../api/edr.js'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, ArcElement, Tooltip, Legend, Filler)

const C = { accent:'#4f7ef5', accent2:'#7c5cfc', green:'#22d3a0', red:'#f5534f', amber:'#f5a623', cyan:'#22d3ee', text:'#e8eaf2', text2:'#8b90aa', text3:'#555a72' }

const TABS = [
  { id:'overview',  label:'Overview' },
  { id:'endpoints', label:'Endpoints' },
  { id:'usb',       label:'USB & Devices' },
  { id:'sites',     label:'Site Comparison' },
  { id:'feed',      label:'Event Feed' },
]

const co = {
  responsive: true, maintainAspectRatio: false,
  plugins: { legend: { display: false } },
  scales: {
    x: { ticks: { color: C.text3, font: { size: 9 }, maxTicksLimit: 8 }, grid: { color: 'rgba(99,120,200,0.07)' } },
    y: { ticks: { color: C.text3, font: { size: 9 } }, grid: { color: 'rgba(99,120,200,0.07)' } },
  },
}

const coMulti = {
  ...co,
  plugins: { legend: { display: true, labels: { color: C.text2, font: { size: 10 }, boxWidth: 10 } } },
}

// Get flattened or nested field from ES document
const df = (e, key) => e[`data.${key}`]    ?? e?.data?.[key]    ?? ''
const hf = (e, key) => e[`host.${key}`]    ?? e?.host?.[key]    ?? ''
const ef = (e, key) => e[`event.${key}`]   ?? e?.event?.[key]   ?? ''

function KPI({ label, value, sub, color }) {
  const colors = { blue: C.accent, red: C.red, green: C.green, amber: C.amber, cyan: C.cyan, purple: C.accent2 }
  return (
    <div className={`kpi ${color}`}>
      <div style={{ fontSize: 10, fontWeight: 600, color: C.text3, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6, fontFamily: 'var(--mono)' }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 700, lineHeight: 1, marginBottom: 4, color: colors[color] || C.accent }}>{value ?? '—'}</div>
      <div style={{ fontSize: 10, color: C.text3, fontFamily: 'var(--mono)' }}>{sub}</div>
    </div>
  )
}

function Card({ title, badge, badgeClass = 'blue', height, children, noPad }) {
  return (
    <div className="card">
      <div className="card-header">
        <span className="card-title">{title}</span>
        {badge !== undefined && <span className={`badge badge-${badgeClass}`}>{badge}</span>}
      </div>
      <div style={noPad ? {} : { padding: '12px 14px', height }}>{children}</div>
    </div>
  )
}

function BarRows({ items, labelKey = 'label', color, max: maxProp }) {
  const max = maxProp || Math.max(...items.map(i => i.count || 0), 1)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {items.map((item, i) => {
        const label = item[labelKey] || item.endpoint || item.device || item.user || item.site || item.action || '?'
        return (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 140, fontSize: 10, color: C.text2, fontFamily: 'var(--mono)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flexShrink: 0 }} title={label}>{label}</div>
            <div style={{ flex: 1, height: 5, background: 'var(--bg4)', borderRadius: 3 }}>
              <div style={{ width: `${Math.min((item.count / max) * 100, 100)}%`, height: '100%', background: color || C.accent, borderRadius: 3, transition: 'width 0.4s ease' }} />
            </div>
            <div style={{ width: 50, textAlign: 'right', fontSize: 10, color: C.text3, fontFamily: 'var(--mono)' }}>{item.count?.toLocaleString()}</div>
          </div>
        )
      })}
      {items.length === 0 && <div style={{ padding: 20, textAlign: 'center', color: C.text3, fontSize: 11, fontFamily: 'var(--mono)' }}>No data</div>}
    </div>
  )
}

function ThreatBadge({ threatId }) {
  if (!threatId || threatId === '-') return null
  return <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 4, fontFamily: 'var(--mono)', fontWeight: 700, color: C.red, background: `${C.red}20`, border: `1px solid ${C.red}40` }}>THREAT</span>
}

function fmt(ts) {
  if (!ts) return '—'
  return new Date(ts).toLocaleString('en', { month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function fmtShort(ts) {
  if (!ts) return '—'
  return new Date(ts).toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

export default function EDRPage() {
  const [tab, setTab]               = useState('overview')
  const [range, setRange]           = useState({ type: 'preset', value: '24h', label: '24h' })
  const [stats, setStats]           = useState(null)
  const [timeline, setTimeline]     = useState([])
  const [events, setEvents]         = useState([])
  const [topEndpoints, setTopEndpoints] = useState([])
  const [topDevices, setTopDevices] = useState([])
  const [topUsers, setTopUsers]     = useState([])
  const [activityTypes, setActivityTypes] = useState({ by_action: [], by_activity: [], by_interface: [] })
  const [sites, setSites]           = useState([])
  const [eventFilter, setEventFilter] = useState('all')
  const [siteFilter, setSiteFilter]   = useState('all')
  const [loading, setLoading]       = useState(false)
  const [fetchError, setFetchError] = useState(null)

  const rangeParams = { range: range?.value || '', from: range?.from || '', to: range?.to || '' }

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const [s, t, e, ep, dv, u, at, si] = await Promise.all([
          edrAPI.getStats(rangeParams),
          edrAPI.getTimeline(rangeParams),
          edrAPI.getRecentEvents({ ...rangeParams, size: 200 }),
          edrAPI.getTopEndpoints(rangeParams),
          edrAPI.getTopDevices(rangeParams),
          edrAPI.getTopUsers(rangeParams),
          edrAPI.getActivityTypes(rangeParams),
          edrAPI.getSites(rangeParams),
        ])
        setStats(s.data)
        setTimeline(t.data)
        setEvents(e.data)
        setTopEndpoints(ep.data)
        setTopDevices(dv.data)
        setTopUsers(u.data)
        setActivityTypes(at.data)
        setSites(si.data)
        setFetchError(null)
      } catch (err) {
        setFetchError(err.response?.data?.error || err.message)
      } finally {
        setLoading(false)
      }
    }
    load()
    const t = setInterval(load, 60000)
    return () => clearInterval(t)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range])

  // ── Derived data ──────────────────────────────────────────────────────────
  const usbEvents      = events.filter(e => df(e, 'interface') === 'USB')
  const usbConnects    = usbEvents.filter(e => ef(e, 'action') === 'connected'    || df(e, 'eventType') === 'connected')
  const usbDisconnects = usbEvents.filter(e => ef(e, 'action') === 'disconnected' || df(e, 'eventType') === 'disconnected')
  const threatEvents   = events.filter(e => e.threatId && e.threatId !== '-')

  const allSites = ['all', ...new Set(topEndpoints.map(ep => ep.site).filter(Boolean))]
  const filteredEndpoints = siteFilter === 'all' ? topEndpoints : topEndpoints.filter(ep => ep.site === siteFilter)

  const feedEvents = (() => {
    switch (eventFilter) {
      case 'usb':          return usbEvents
      case 'threats':      return threatEvents
      case 'connected':    return events.filter(e => ef(e,'action') === 'connected'    || df(e,'eventType') === 'connected')
      case 'disconnected': return events.filter(e => ef(e,'action') === 'disconnected' || df(e,'eventType') === 'disconnected')
      default:             return events
    }
  })()

  // ── Chart data ─────────────────────────────────────────────────────────────
  const rv        = range?.value || '24h'
  const isShort   = rv === '15m' || rv === '1h'
  const timeFmt   = isShort ? { hour: '2-digit', minute: '2-digit' } : { month: 'short', day: 'numeric', hour: '2-digit' }
  const tickLimit = rv === '15m' ? 15 : rv === '1h' ? 12 : 8

  const timelineChart = {
    labels: timeline.map(d => new Date(d.time).toLocaleTimeString([], timeFmt)),
    datasets: [
      { label: 'Total',   data: timeline.map(d => d.total),   borderColor: C.accent, backgroundColor: 'rgba(79,126,245,0.08)', fill: true, tension: 0.4, borderWidth: 1.5, pointRadius: isShort ? 2 : 0 },
      { label: 'Threats', data: timeline.map(d => d.threats), borderColor: C.red,    backgroundColor: 'rgba(245,83,79,0.08)',  fill: true, tension: 0.4, borderWidth: 1.5, pointRadius: isShort ? 2 : 0 },
    ],
  }

  const usbTimelineChart = {
    labels: timeline.map(d => new Date(d.time).toLocaleTimeString([], timeFmt)),
    datasets: [
      { label: 'Connect',    data: timeline.map(d => d.usb_connect    || 0), borderColor: C.green, backgroundColor: 'rgba(34,211,160,0.08)', fill: true, tension: 0.4, borderWidth: 1.5, pointRadius: isShort ? 2 : 0 },
      { label: 'Disconnect', data: timeline.map(d => d.usb_disconnect || 0), borderColor: C.red,   backgroundColor: 'rgba(245,83,79,0.08)',  fill: true, tension: 0.4, borderWidth: 1.5, pointRadius: isShort ? 2 : 0 },
    ],
  }

  const activityDonut = {
    labels: activityTypes.by_action.slice(0, 6).map(a => a.action || 'unknown'),
    datasets: [{
      data: activityTypes.by_action.slice(0, 6).map(a => a.count),
      backgroundColor: [C.accent, C.cyan, C.green, C.amber, C.red, C.accent2],
      borderWidth: 0, hoverOffset: 4,
    }],
  }

  const sitesBarChart = {
    labels: sites.map(s => s.site),
    datasets: [
      { label: 'Total',   data: sites.map(s => s.count),   backgroundColor: `${C.accent}99`,  borderRadius: 4 },
      { label: 'Threats', data: sites.map(s => s.threats), backgroundColor: `${C.red}99`,     borderRadius: 4 },
      { label: 'USB',     data: sites.map(s => s.usb),     backgroundColor: `${C.amber}99`,   borderRadius: 4 },
    ],
  }

  const endpointBarChart = {
    labels: topEndpoints.slice(0, 10).map(e => e.endpoint),
    datasets: [{ data: topEndpoints.slice(0, 10).map(e => e.count), backgroundColor: `${C.cyan}99`, borderRadius: 4 }],
  }

  const coBar = { ...co, plugins: { legend: { display: false } }, indexAxis: 'y' }
  const coBarMulti = { ...co, plugins: { legend: { display: true, labels: { color: C.text2, font: { size: 10 }, boxWidth: 10 } } } }

  // ── Helpers ────────────────────────────────────────────────────────────────
  const TH = ({ children }) => (
    <th style={{ padding: '8px 10px', textAlign: 'left', borderBottom: '1px solid var(--border)', color: C.text3, fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, fontFamily: 'var(--mono)', whiteSpace: 'nowrap' }}>{children}</th>
  )
  const TD = ({ children, color, mono = true }) => (
    <td style={{ padding: '8px 10px', borderBottom: '1px solid rgba(99,120,200,0.07)', color: color || C.text2, fontSize: 11, fontFamily: mono ? 'var(--mono)' : 'var(--sans)', whiteSpace: 'nowrap', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis' }}>{children || '—'}</td>
  )

  const subLabel = `last ${range?.label || range?.value || '24h'}`

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>

      {/* Tab bar + range picker */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ display: 'flex', gap: 2, background: 'var(--bg3)', borderRadius: 10, padding: 3 }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              padding: '6px 14px', fontSize: 12, fontWeight: 600, borderRadius: 7,
              cursor: 'pointer', border: 'none', fontFamily: 'var(--sans)', letterSpacing: 0.3,
              background: tab === t.id ? C.cyan : 'transparent',
              color: tab === t.id ? '#0a0c10' : C.text2,
              transition: 'all 0.15s',
            }}>{t.label}</button>
          ))}
        </div>
        <RangePicker range={range} onChange={setRange} accentColor={C.cyan} />
      </div>

      {/* Banners */}
      {fetchError && (
        <div style={{ background: 'rgba(245,166,35,0.1)', border: '1px solid rgba(245,166,35,0.3)', borderRadius: 8, padding: '6px 14px', marginBottom: 10, fontSize: 11, color: C.amber, fontFamily: 'var(--mono)' }}>
          Data fetch error: {fetchError}
        </div>
      )}
      {loading && !stats && (
        <div style={{ background: 'rgba(79,126,245,0.08)', border: '1px solid rgba(79,126,245,0.2)', borderRadius: 8, padding: '6px 14px', marginBottom: 10, fontSize: 11, color: C.accent, fontFamily: 'var(--mono)' }}>
          Loading EDR data…
        </div>
      )}

      {/* ── TAB: OVERVIEW ────────────────────────────────────────────────── */}
      {tab === 'overview' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

          {/* KPI row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 10 }}>
            <KPI label="Total Events"     value={stats?.total?.toLocaleString()}      sub={subLabel}          color="blue"   />
            <KPI label="Threats"          value={stats?.threats?.toLocaleString()}    sub="detected"          color="red"    />
            <KPI label="Active Endpoints" value={stats?.devices?.toLocaleString()}    sub="unique computers"  color="cyan"   />
            <KPI label="USB Events"       value={stats?.usb_events?.toLocaleString()} sub="peripheral activity" color="amber" />
            <KPI label="Sites"            value={stats?.sites?.toLocaleString()}      sub="locations"         color="green"  />
            <KPI label="Unique Users"     value={stats?.users?.toLocaleString()}      sub="active accounts"   color="purple" />
          </div>

          {/* Timeline + Donut */}
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12 }}>
            <Card title="ACTIVITY TIMELINE" badge={`${timeline.length} buckets`} height={200}>
              {timeline.length > 0
                ? <Line data={timelineChart} options={{ ...coMulti, scales: { ...coMulti.scales, x: { ...coMulti.scales.x, ticks: { ...coMulti.scales.x.ticks, maxTicksLimit: tickLimit } } } }} />
                : <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.text3, fontSize: 11, fontFamily: 'var(--mono)' }}>No data for this range</div>}
            </Card>
            <Card title="EVENT TYPES" badge="breakdown" height={200}>
              {activityTypes.by_action.length > 0
                ? <Doughnut data={activityDonut} options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { display: true, position: 'right', labels: { color: C.text2, font: { size: 9 }, boxWidth: 8 } } }, cutout: '65%' }} />
                : <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.text3, fontSize: 11, fontFamily: 'var(--mono)' }}>No data</div>}
            </Card>
          </div>

          {/* Top endpoints + top USB devices */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <Card title="TOP ENDPOINTS" badge={topEndpoints.length}>
              <BarRows items={topEndpoints.slice(0, 8)} labelKey="endpoint" color={C.cyan} />
            </Card>
            <Card title="TOP USB DEVICES" badge={topDevices.length} badgeClass="amber">
              <BarRows items={topDevices.slice(0, 8)} labelKey="device" color={C.amber} />
            </Card>
            <Card title="TOP USERS" badge={topUsers.length} badgeClass="purple">
              <BarRows items={topUsers.slice(0, 8)} labelKey="user" color={C.accent2} />
            </Card>
          </div>

        </div>
      )}

      {/* ── TAB: ENDPOINTS ───────────────────────────────────────────────── */}
      {tab === 'endpoints' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12 }}>
            {/* Endpoint bar chart */}
            <Card title="ENDPOINT ACTIVITY" badge={`top ${Math.min(topEndpoints.length, 10)}`} height={220}>
              {topEndpoints.length > 0
                ? <Bar data={endpointBarChart} options={{ ...coBar, scales: { x: { ticks: { color: C.text3, font: { size: 9 } }, grid: { color: 'rgba(99,120,200,0.07)' } }, y: { ticks: { color: C.text3, font: { size: 9 } }, grid: { color: 'rgba(99,120,200,0.07)' } } } }} />
                : <div style={{ height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.text3, fontSize: 11 }}>No data</div>}
            </Card>

            {/* Site filter + summary */}
            <Card title="FILTER BY SITE">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {allSites.map(s => (
                    <button key={s} onClick={() => setSiteFilter(s)} style={{
                      padding: '4px 10px', fontSize: 10, borderRadius: 6, border: 'none',
                      cursor: 'pointer', fontFamily: 'var(--mono)',
                      background: siteFilter === s ? C.cyan : 'var(--bg4)',
                      color: siteFilter === s ? '#0a0c10' : C.text2,
                    }}>{s === 'all' ? 'All Sites' : s}</button>
                  ))}
                </div>
                <div style={{ marginTop: 8 }}>
                  {sites.map((s, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: 11, fontFamily: 'var(--mono)' }}>
                      <span style={{ color: C.text2 }}>{s.site}</span>
                      <span style={{ color: C.cyan, fontWeight: 600 }}>{s.endpoints} endpoints</span>
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          </div>

          {/* Endpoints table */}
          <Card title="ENDPOINT INVENTORY" badge={`${filteredEndpoints.length} endpoints`} badgeClass="cyan" noPad>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr><TH>Hostname</TH><TH>IP Address</TH><TH>OS</TH><TH>Last User</TH><TH>Site</TH><TH>Events</TH><TH>Threats</TH><TH>Last Seen</TH></tr>
                </thead>
                <tbody>
                  {filteredEndpoints.map((ep, i) => (
                    <tr key={i}
                      onMouseEnter={el => el.currentTarget.style.background = 'var(--bg3)'}
                      onMouseLeave={el => el.currentTarget.style.background = 'transparent'}>
                      <TD color={C.cyan}>{ep.endpoint}</TD>
                      <TD>{ep.ip}</TD>
                      <TD>{ep.osType}</TD>
                      <TD color={C.text2}>{ep.lastUser}</TD>
                      <TD>{ep.site}</TD>
                      <TD color={C.accent}>{ep.count?.toLocaleString()}</TD>
                      <TD color={ep.threats > 0 ? C.red : C.text3}>{ep.threats > 0 ? ep.threats : '—'}</TD>
                      <TD color={C.text3}>{ep.lastSeen ? new Date(ep.lastSeen).toLocaleString('en', { month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'}</TD>
                    </tr>
                  ))}
                  {filteredEndpoints.length === 0 && (
                    <tr><td colSpan={8} style={{ padding: 30, textAlign: 'center', color: C.text3, fontFamily: 'var(--mono)', fontSize: 11 }}>No endpoints found</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {/* ── TAB: USB & DEVICES ───────────────────────────────────────────── */}
      {tab === 'usb' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

          {/* USB KPIs */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
            <KPI label="USB Events"       value={usbEvents.length.toLocaleString()}      sub={subLabel}           color="amber"  />
            <KPI label="Unique Devices"   value={new Set(usbEvents.map(e => df(e,'deviceName')).filter(Boolean)).size} sub="peripheral models" color="cyan"   />
            <KPI label="Connect Events"   value={usbConnects.length.toLocaleString()}    sub="device connected"   color="green"  />
            <KPI label="Disconnect Events" value={usbDisconnects.length.toLocaleString()} sub="device removed"   color="red"    />
          </div>

          {/* USB timeline */}
          <Card title="USB CONNECT / DISCONNECT TIMELINE" badge={`${timeline.length} buckets`} badgeClass="amber" height={180}>
            {timeline.length > 0
              ? <Line data={usbTimelineChart} options={{ ...coMulti, scales: { ...coMulti.scales, x: { ...coMulti.scales.x, ticks: { ...coMulti.scales.x.ticks, maxTicksLimit: tickLimit } } } }} />
              : <div style={{ height: 180, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.text3, fontSize: 11 }}>No USB activity in this range</div>}
          </Card>

          {/* Top USB devices + recent USB events */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 12 }}>
            <Card title="TOP USB DEVICES" badge={topDevices.length} badgeClass="amber">
              <BarRows items={topDevices.slice(0, 10)} labelKey="device" color={C.amber} />
            </Card>

            {/* USB detail table */}
            <Card title="USB DEVICE LOG" badge={usbEvents.length} badgeClass="amber" noPad>
              <div style={{ overflowX: 'auto', maxHeight: 360, overflowY: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead style={{ position: 'sticky', top: 0, background: 'var(--bg2)', zIndex: 1 }}>
                    <tr><TH>Time</TH><TH>Device Name</TH><TH>Interface</TH><TH>Vendor ID</TH><TH>Computer</TH><TH>User</TH><TH>Site</TH><TH>Action</TH></tr>
                  </thead>
                  <tbody>
                    {usbEvents.slice(0, 100).map((e, i) => {
                      const action   = ef(e, 'action') || df(e, 'eventType')
                      const isConn   = action === 'connected'
                      return (
                        <tr key={i}
                          onMouseEnter={el => el.currentTarget.style.background = 'var(--bg3)'}
                          onMouseLeave={el => el.currentTarget.style.background = 'transparent'}>
                          <TD color={C.text3}>{fmtShort(e['@timestamp'])}</TD>
                          <TD color={C.amber}>{df(e, 'deviceName')}</TD>
                          <TD>{df(e, 'interface')}</TD>
                          <TD color={C.text3}>{df(e, 'vendorId')}</TD>
                          <TD color={C.cyan}>{df(e, 'computerName') || hf(e, 'name')}</TD>
                          <TD>{df(e, 'lastLoggedInUserName')}</TD>
                          <TD>{e.site_name}</TD>
                          <td style={{ padding: '8px 10px', borderBottom: '1px solid rgba(99,120,200,0.07)' }}>
                            <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 4, fontFamily: 'var(--mono)', fontWeight: 600,
                              color: isConn ? C.green : C.red,
                              background: isConn ? `${C.green}20` : `${C.red}20`,
                              border: `1px solid ${isConn ? C.green : C.red}40` }}>
                              {action?.toUpperCase() || '—'}
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                    {usbEvents.length === 0 && (
                      <tr><td colSpan={8} style={{ padding: 30, textAlign: 'center', color: C.text3, fontFamily: 'var(--mono)', fontSize: 11 }}>No USB events in this range</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        </div>
      )}

      {/* ── TAB: SITE COMPARISON ─────────────────────────────────────────── */}
      {tab === 'sites' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

          {/* Sites bar chart */}
          <Card title="EVENTS BY SITE" badge={`${sites.length} sites`} height={220}>
            {sites.length > 0
              ? <Bar data={sitesBarChart} options={coBarMulti} />
              : <div style={{ height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.text3, fontSize: 11 }}>No site data</div>}
          </Card>

          {/* Per-site KPI cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
            {sites.map((s, i) => (
              <div key={i} className="card" style={{ padding: 0 }}>
                <div className="card-header">
                  <span className="card-title">{s.site}</span>
                  <span className={`badge badge-${s.threats > 0 ? 'red' : 'green'}`}>{s.threats > 0 ? `${s.threats} threats` : 'clean'}</span>
                </div>
                <div style={{ padding: '14px 16px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  {[
                    { label: 'Total Events',     value: s.count,     color: C.accent  },
                    { label: 'Threats',          value: s.threats,   color: s.threats > 0 ? C.red : C.text3 },
                    { label: 'USB Events',       value: s.usb,       color: C.amber   },
                    { label: 'Active Endpoints', value: s.endpoints, color: C.cyan    },
                    { label: 'Active Users',     value: s.users,     color: C.accent2 },
                  ].map((item, j) => (
                    <div key={j} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <div style={{ fontSize: 9, color: C.text3, fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: 0.5 }}>{item.label}</div>
                      <div style={{ fontSize: 18, fontWeight: 700, color: item.color, fontFamily: 'var(--mono)' }}>{item.value?.toLocaleString() ?? '—'}</div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            {sites.length === 0 && (
              <div style={{ gridColumn: '1 / -1', padding: 40, textAlign: 'center', color: C.text3, fontFamily: 'var(--mono)', fontSize: 11 }}>No site data for this range</div>
            )}
          </div>
        </div>
      )}

      {/* ── TAB: EVENT FEED ──────────────────────────────────────────────── */}
      {tab === 'feed' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

          {/* Filter buttons */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {[
              { id: 'all',          label: `All (${events.length})` },
              { id: 'usb',          label: `USB (${usbEvents.length})` },
              { id: 'threats',      label: `Threats (${threatEvents.length})` },
              { id: 'connected',    label: `Connected (${usbConnects.length})` },
              { id: 'disconnected', label: `Disconnected (${usbDisconnects.length})` },
            ].map(f => (
              <button key={f.id} onClick={() => setEventFilter(f.id)} style={{
                padding: '5px 14px', fontSize: 11, fontWeight: 600, borderRadius: 7,
                border: 'none', cursor: 'pointer', fontFamily: 'var(--mono)',
                background: eventFilter === f.id ? C.cyan : 'var(--bg3)',
                color: eventFilter === f.id ? '#0a0c10' : C.text2,
                transition: 'all 0.15s',
              }}>{f.label}</button>
            ))}
            <span style={{ marginLeft: 'auto', fontSize: 10, color: C.text3, fontFamily: 'var(--mono)' }}>
              showing {feedEvents.length} events
            </span>
          </div>

          {/* Event feed table */}
          <div style={{ background: 'var(--bg2)', borderRadius: 10, border: '1px solid var(--border)', overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: 600 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead style={{ position: 'sticky', top: 0, background: 'var(--bg2)', zIndex: 1 }}>
                  <tr><TH>Time</TH><TH>Computer</TH><TH>Event Type</TH><TH>Device</TH><TH>Interface</TH><TH>User</TH><TH>Site</TH><TH>Description</TH></tr>
                </thead>
                <tbody>
                  {feedEvents.map((e, i) => {
                    const isThreat  = e.threatId && e.threatId !== '-'
                    const action    = ef(e, 'action') || df(e, 'eventType')
                    const isConn    = action === 'connected'
                    const isDisc    = action === 'disconnected'
                    const rowColor  = isThreat ? `${C.red}08` : 'transparent'
                    const typeColor = isThreat ? C.red : isConn ? C.green : isDisc ? C.red : C.text2
                    const msg       = e.event_message || e.description || e.secondaryDescription || ''

                    return (
                      <tr key={i} style={{ background: rowColor }}
                        onMouseEnter={el => el.currentTarget.style.background = isThreat ? `${C.red}14` : 'var(--bg3)'}
                        onMouseLeave={el => el.currentTarget.style.background = rowColor}>
                        <td style={{ padding: '7px 10px', borderBottom: '1px solid rgba(99,120,200,0.06)', color: C.text3, fontSize: 10, fontFamily: 'var(--mono)', whiteSpace: 'nowrap' }}>{fmt(e['@timestamp'])}</td>
                        <td style={{ padding: '7px 10px', borderBottom: '1px solid rgba(99,120,200,0.06)', color: C.cyan, fontSize: 11, fontFamily: 'var(--mono)', whiteSpace: 'nowrap' }}>
                          {df(e, 'computerName') || hf(e, 'name') || '—'}
                        </td>
                        <td style={{ padding: '7px 10px', borderBottom: '1px solid rgba(99,120,200,0.06)', whiteSpace: 'nowrap' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                            <span style={{ fontSize: 10, fontFamily: 'var(--mono)', color: typeColor, fontWeight: isThreat ? 700 : 400 }}>
                              {action || df(e, 'eventType') || '—'}
                            </span>
                            <ThreatBadge threatId={e.threatId} />
                          </div>
                        </td>
                        <td style={{ padding: '7px 10px', borderBottom: '1px solid rgba(99,120,200,0.06)', color: C.amber, fontSize: 10, fontFamily: 'var(--mono)', whiteSpace: 'nowrap', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {df(e, 'deviceName') || '—'}
                        </td>
                        <td style={{ padding: '7px 10px', borderBottom: '1px solid rgba(99,120,200,0.06)', color: C.text2, fontSize: 10, fontFamily: 'var(--mono)', whiteSpace: 'nowrap' }}>
                          {df(e, 'interface') || '—'}
                        </td>
                        <td style={{ padding: '7px 10px', borderBottom: '1px solid rgba(99,120,200,0.06)', color: C.text2, fontSize: 10, fontFamily: 'var(--mono)', whiteSpace: 'nowrap' }}>
                          {df(e, 'lastLoggedInUserName') || '—'}
                        </td>
                        <td style={{ padding: '7px 10px', borderBottom: '1px solid rgba(99,120,200,0.06)', color: C.text3, fontSize: 10, fontFamily: 'var(--mono)', whiteSpace: 'nowrap' }}>
                          {e.site_name || '—'}
                        </td>
                        <td style={{ padding: '7px 10px', borderBottom: '1px solid rgba(99,120,200,0.06)', color: C.text3, fontSize: 10, fontFamily: 'var(--mono)', maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={msg}>
                          {msg.slice(0, 120) + (msg.length > 120 ? '…' : '') || '—'}
                        </td>
                      </tr>
                    )
                  })}
                  {feedEvents.length === 0 && (
                    <tr><td colSpan={8} style={{ padding: 40, textAlign: 'center', color: C.text3, fontFamily: 'var(--mono)', fontSize: 11 }}>No events match this filter</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
