import { useEffect, useState, useRef, useCallback } from 'react'
import { Line } from 'react-chartjs-2'
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend, Filler } from 'chart.js'
import { zabbixAPI } from '../../api/zabbix'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend, Filler)

const C = { accent:'#4f7ef5', accent2:'#7c5cfc', green:'#22d3a0', red:'#f5534f', amber:'#f5a623', cyan:'#22d3ee', text:'#e8eaf2', text2:'#8b90aa', text3:'#555a72' }
const AMBER = C.amber

const TABS = [
  { id:'overview', label:'Overview' },
  { id:'hosts',    label:'Hosts' },
  { id:'problems', label:'Problems' },
  { id:'groups',   label:'Groups' },
  { id:'events',   label:'Events' },
]

const SEV_COLOR   = ['#8b90aa', C.cyan, C.amber, '#f5a033', C.red, '#c0392b']
const SEV_CLASS   = ['blue',    'cyan',  'amber',  'amber',  'red', 'red']
const SEV_LABELS  = ['Not classified','Info','Warning','Average','High','Disaster']

function sevColor(n) { return SEV_COLOR[n] ?? C.text3 }
function sevClass(n) { return SEV_CLASS[n] ?? 'blue' }
function sevLabel(n) { return SEV_LABELS[n] ?? 'Unknown' }

function fmtDuration(secs) {
  if (!secs && secs !== 0) return '—'
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

function fmtUptime(secs) {
  if (!secs) return '—'
  const d = Math.floor(secs / 86400)
  const h = Math.floor((secs % 86400) / 3600)
  if (d > 0) return `${d}d ${h}h`
  return `${h}h`
}

function availDot(available, size = 8) {
  const color = available === 1 ? C.green : available === 2 ? C.red : C.amber
  const pulse = available === 2
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', background: color, flexShrink: 0,
      boxShadow: pulse ? `0 0 6px ${C.red}` : undefined,
      animation: pulse ? 'pulse 1.5s infinite' : undefined,
    }} />
  )
}

function MetricBar({ value, label }) {
  const v = value ?? null
  const color = v === null ? C.text3 : v >= 90 ? C.red : v >= 70 ? C.amber : C.green
  return (
    <div style={{ display:'flex', alignItems:'center', gap:6 }}>
      <span style={{ fontSize:9, fontFamily:'var(--mono)', color: C.text3, width:32, flexShrink:0 }}>{label}</span>
      <div style={{ flex:1, height:4, background:'var(--bg4)', borderRadius:2, overflow:'hidden' }}>
        <div style={{ width:`${Math.min(v ?? 0, 100)}%`, height:'100%', background: color, borderRadius:2, transition:'width 0.3s' }} />
      </div>
      <span style={{ fontSize:9, fontFamily:'var(--mono)', color, width:30, textAlign:'right', flexShrink:0 }}>
        {v !== null ? `${v}%` : '—'}
      </span>
    </div>
  )
}

function KPI({ label, value, sub, color }) {
  const colors = { blue:C.accent, red:C.red, green:C.green, amber:C.amber, cyan:C.cyan, purple:C.accent2 }
  return (
    <div className={`kpi ${color || 'blue'}`}>
      <div style={{ fontSize:10, fontWeight:600, color:C.text3, letterSpacing:1, textTransform:'uppercase', marginBottom:6, fontFamily:'var(--mono)' }}>{label}</div>
      <div style={{ fontSize:24, fontWeight:700, lineHeight:1, marginBottom:4, color: colors[color] || C.accent }}>{value ?? '—'}</div>
      <div style={{ fontSize:10, color:C.text3, fontFamily:'var(--mono)' }}>{sub}</div>
    </div>
  )
}

function Card({ title, badge, badgeClass='blue', height, children, noPad }) {
  return (
    <div className="card">
      <div className="card-header">
        <span className="card-title">{title}</span>
        {badge !== undefined && <span className={`badge badge-${badgeClass}`}>{badge}</span>}
      </div>
      <div style={noPad ? {} : { padding:'12px 14px', height }}>{children}</div>
    </div>
  )
}

function TabBar({ tab, setTab }) {
  return (
    <div style={{ display:'flex', gap:2, borderBottom:'1px solid var(--border)', paddingBottom:0, flexShrink:0 }}>
      {TABS.map(t => (
        <button key={t.id} onClick={() => setTab(t.id)} style={{
          padding:'8px 16px', border:'none', background:'transparent', cursor:'pointer',
          fontSize:12, fontWeight:600, fontFamily:'var(--mono)',
          color: tab === t.id ? AMBER : C.text3,
          borderBottom: tab === t.id ? `2px solid ${AMBER}` : '2px solid transparent',
          transition:'all 0.15s',
        }}>{t.label}</button>
      ))}
    </div>
  )
}

function SkeRow() {
  return <div style={{ height:14, background:'var(--bg4)', borderRadius:4, marginBottom:8, opacity:0.5 }} />
}

function Skeleton() {
  return <div style={{ padding:'12px 14px' }}>{[...Array(6)].map((_,i) => <SkeRow key={i} />)}</div>
}

// ─── Tab 1: Overview ─────────────────────────────────────────────────────────
function OverviewTab({ stats, events, loading }) {
  const h = stats?.hosts   || {}
  const p = stats?.problems || {}

  // Build hourly problem timeline from events
  const hourlyMap = {}
  for (let i = 23; i >= 0; i--) {
    const key = new Date(Date.now() - i * 3_600_000)
    key.setMinutes(0,0,0)
    hourlyMap[key.toISOString()] = 0
  }
  for (const ev of events) {
    const d = new Date(ev.clock * 1000)
    d.setMinutes(0,0,0)
    const k = d.toISOString()
    if (hourlyMap[k] !== undefined) hourlyMap[k]++
  }
  const tlLabels = Object.keys(hourlyMap).map(k => new Date(k).toLocaleTimeString('en',{ hour:'2-digit', minute:'2-digit' }))
  const tlData   = Object.values(hourlyMap)

  const timelineChart = {
    labels: tlLabels,
    datasets: [{
      label: 'Problems', data: tlData,
      borderColor: C.amber, backgroundColor: `${C.amber}22`, fill: true,
      tension: 0.4, pointRadius: 0, borderWidth: 1.5,
    }],
  }
  const chartOpts = {
    responsive:true, maintainAspectRatio:false,
    plugins:{ legend:{ display:false } },
    scales:{
      x:{ ticks:{ color:C.text3, font:{ size:8 }, maxTicksLimit:8 }, grid:{ color:'rgba(99,120,200,0.07)' } },
      y:{ ticks:{ color:C.text3, font:{ size:9 } }, grid:{ color:'rgba(99,120,200,0.07)' } },
    },
  }

  const hostStatusColor = h.down > 2 ? C.red : h.down > 0 ? C.amber : C.green
  const probStatusColor = (p.critical > 0 || p.high > 0) ? C.red : (p.average > 0 || p.warning > 0) ? C.amber : C.green

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
      {/* KPI Row */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(6,1fr)', gap:10 }}>
        <KPI label="Hosts Up"       value={h.up}           color="green" sub="monitored" />
        <KPI label="Hosts Down"     value={h.down}         color={h.down > 0 ? 'red' : 'green'} sub="unreachable" />
        <KPI label="Active Problems" value={p.total}       color={p.total > 0 ? 'red' : 'green'} sub="open" />
        <KPI label="Critical/Disaster" value={(p.critical||0)} color={p.critical > 0 ? 'red' : 'green'} sub="severity 4-5" />
        <KPI label="Host Groups"    value={stats?.groups}  color="blue"  sub="groups" />
        <KPI label="Maintenance"    value={h.maintenance}  color="amber" sub="hosts" />
      </div>

      {/* Status Summary Cards */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12 }}>
        {/* Hosts Health */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">Host Health</span>
            <div style={{ width:8, height:8, borderRadius:'50%', background: hostStatusColor, boxShadow:`0 0 6px ${hostStatusColor}` }} />
          </div>
          <div style={{ padding:'12px 14px' }}>
            <div style={{ fontSize:32, fontWeight:700, color: hostStatusColor, lineHeight:1, marginBottom:8 }}>
              {h.up ?? 0}<span style={{ fontSize:16, color:C.text3, fontWeight:400 }}>/{h.total ?? 0}</span>
            </div>
            <div style={{ fontSize:10, color:C.text3, fontFamily:'var(--mono)', marginBottom:10 }}>hosts online</div>
            {/* Mini bar */}
            <div style={{ height:8, background:'var(--bg4)', borderRadius:4, overflow:'hidden', display:'flex' }}>
              <div style={{ width:`${((h.up||0)/(h.total||1))*100}%`, background:C.green }} />
              <div style={{ width:`${((h.unknown||0)/(h.total||1))*100}%`, background:C.amber }} />
              <div style={{ width:`${((h.down||0)/(h.total||1))*100}%`, background:C.red }} />
            </div>
            <div style={{ display:'flex', gap:12, marginTop:6 }}>
              {[{l:'Up',c:C.green,v:h.up},{l:'Unknown',c:C.amber,v:h.unknown},{l:'Down',c:C.red,v:h.down}].map(x => (
                <div key={x.l} style={{ display:'flex', alignItems:'center', gap:4, fontSize:10, fontFamily:'var(--mono)' }}>
                  <div style={{ width:6, height:6, borderRadius:'50%', background:x.c }} />
                  <span style={{ color:C.text3 }}>{x.l}</span>
                  <span style={{ color:x.c, fontWeight:600 }}>{x.v ?? 0}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Problems */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">Active Problems</span>
            <div style={{ width:8, height:8, borderRadius:'50%', background: probStatusColor, boxShadow:`0 0 6px ${probStatusColor}` }} />
          </div>
          <div style={{ padding:'12px 14px', display:'flex', flexDirection:'column', gap:6 }}>
            {[{l:'Disaster',v:p.critical,c:C.red},{l:'High',v:p.high,c:C.red},{l:'Average',v:p.average,c:C.amber},{l:'Warning',v:p.warning,c:C.amber},{l:'Info',v:p.info,c:C.cyan}].map(x => (
              <div key={x.l} style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <span className={`badge badge-${x.v>0 ? (x.c===C.red?'red':'amber') : 'blue'}`} style={{ fontSize:9 }}>{x.l}</span>
                <span style={{ fontSize:14, fontWeight:700, color: x.v > 0 ? x.c : C.text3, fontFamily:'var(--mono)' }}>{x.v ?? 0}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Infrastructure */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">Infrastructure</span>
            <span className={`badge badge-blue`}>{stats?.groups ?? 0} groups</span>
          </div>
          <div style={{ padding:'12px 14px' }}>
            <div style={{ fontSize:28, fontWeight:700, color:C.accent, marginBottom:4 }}>{stats?.groups ?? 0}</div>
            <div style={{ fontSize:10, color:C.text3, fontFamily:'var(--mono)', marginBottom:10 }}>host groups total</div>
            <div style={{ fontSize:10, color:C.text3, fontFamily:'var(--mono)' }}>
              Last refreshed: {new Date().toLocaleTimeString()}
            </div>
          </div>
        </div>
      </div>

      {/* Problems Timeline */}
      <Card title="Problems — Last 24 Hours" height={180}>
        {loading
          ? <Skeleton />
          : <Line data={timelineChart} options={chartOpts} />
        }
      </Card>

      {/* Top Problems */}
      <Card title="Recent Problems" badge={events.length} badgeClass="amber" noPad>
        <div style={{ maxHeight:280, overflowY:'auto' }}>
          {events.length === 0
            ? <div style={{ padding:20, textAlign:'center', color:C.text3, fontSize:12 }}>No active problems</div>
            : events.slice(0,10).map((ev, i) => (
              <div key={i} style={{ display:'grid', gridTemplateColumns:'80px 1fr auto auto', alignItems:'center', gap:8, padding:'7px 14px', borderBottom:'1px solid var(--border)', fontSize:11 }}>
                <span className={`badge badge-${sevClass(ev.severity)}`} style={{ fontSize:9, textAlign:'center' }}>{sevLabel(ev.severity)}</span>
                <div>
                  <div style={{ color:C.text, fontWeight:600, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{ev.name}</div>
                  <div style={{ color:C.text3, fontSize:9, fontFamily:'var(--mono)' }}>{ev.host}</div>
                </div>
                <span style={{ fontSize:10, color:C.text3, fontFamily:'var(--mono)', whiteSpace:'nowrap' }}>{fmtDuration(ev.duration)}</span>
                <span style={{ color: ev.acknowledged ? C.green : C.red, fontSize:13 }}>{ev.acknowledged ? '✓' : '✗'}</span>
              </div>
            ))
          }
        </div>
      </Card>
    </div>
  )
}

// ─── Tab 2: Hosts ─────────────────────────────────────────────────────────────
function HostsTab({ hosts, groups, loading }) {
  const [search, setSearch] = useState('')
  const [groupFilter, setGroupFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')

  const filtered = hosts.filter(h => {
    if (search && !h.name.toLowerCase().includes(search.toLowerCase()) && !h.ip.includes(search)) return false
    if (groupFilter !== 'all' && !h.groups.includes(groupFilter)) return false
    if (statusFilter === 'up'      && h.available !== 1) return false
    if (statusFilter === 'down'    && h.available !== 2) return false
    if (statusFilter === 'unknown' && h.available !== 0) return false
    return true
  })

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
      {/* Toolbar */}
      <div style={{ display:'flex', gap:10, alignItems:'center', flexWrap:'wrap' }}>
        <input
          placeholder="Search hostname or IP…" value={search} onChange={e => setSearch(e.target.value)}
          style={{ flex:1, minWidth:180, background:'var(--bg3)', border:'1px solid var(--border)', borderRadius:6, padding:'6px 10px', color:C.text, fontSize:11, fontFamily:'var(--mono)', outline:'none' }}
        />
        <select value={groupFilter} onChange={e => setGroupFilter(e.target.value)}
          style={{ background:'var(--bg3)', border:'1px solid var(--border)', borderRadius:6, padding:'6px 10px', color:C.text, fontSize:11, fontFamily:'var(--mono)', cursor:'pointer' }}>
          <option value="all">All Groups</option>
          {groups.map(g => <option key={g.id} value={g.name}>{g.name}</option>)}
        </select>
        <div style={{ display:'flex', gap:4 }}>
          {[['all','All'],['up','Up'],['down','Down'],['unknown','Unknown']].map(([v,l]) => (
            <button key={v} onClick={() => setStatusFilter(v)} style={{
              padding:'5px 10px', border:`1px solid ${statusFilter===v ? AMBER : 'var(--border)'}`,
              borderRadius:6, background: statusFilter===v ? `${AMBER}22` : 'var(--bg3)',
              color: statusFilter===v ? AMBER : C.text3, fontSize:10, fontFamily:'var(--mono)', cursor:'pointer',
            }}>{l}</button>
          ))}
        </div>
        <span style={{ fontSize:10, color:C.text3, fontFamily:'var(--mono)' }}>{filtered.length} hosts</span>
      </div>

      {loading ? <Skeleton /> : (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))', gap:10 }}>
          {filtered.map(h => {
            const borderColor = h.available === 2 ? C.red : h.problems > 0 ? C.amber : 'var(--border)'
            return (
              <div key={h.id} style={{ background:'var(--bg2)', border:`1px solid ${borderColor}`, borderRadius:10, padding:'12px 14px' }}>
                <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
                  {availDot(h.available)}
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:12, fontWeight:700, color:C.cyan, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{h.name}</div>
                    <div style={{ fontSize:10, color:C.text3, fontFamily:'var(--mono)' }}>{h.ip || '—'}</div>
                  </div>
                  {h.problems > 0 && <span className="badge badge-red" style={{ fontSize:9 }}>{h.problems} problem{h.problems>1?'s':''}</span>}
                </div>

                {/* Groups */}
                {h.groups.length > 0 && (
                  <div style={{ display:'flex', flexWrap:'wrap', gap:4, marginBottom:8 }}>
                    {h.groups.slice(0,3).map((g,i) => (
                      <span key={i} style={{ fontSize:9, fontFamily:'var(--mono)', color:C.text3, background:'var(--bg4)', padding:'1px 6px', borderRadius:3 }}>{g}</span>
                    ))}
                    {h.groups.length > 3 && <span style={{ fontSize:9, color:C.text3 }}>+{h.groups.length-3}</span>}
                  </div>
                )}

                {/* Metrics */}
                {(h.metrics.cpu !== null || h.metrics.ram !== null || h.metrics.disk !== null) ? (
                  <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
                    <MetricBar value={h.metrics.cpu}  label="CPU" />
                    <MetricBar value={h.metrics.ram}  label="RAM" />
                    <MetricBar value={h.metrics.disk} label="Disk" />
                    {h.metrics.uptime !== null && (
                      <div style={{ fontSize:9, color:C.text3, fontFamily:'var(--mono)', marginTop:2 }}>
                        Uptime: {fmtUptime(h.metrics.uptime)}
                      </div>
                    )}
                  </div>
                ) : (
                  <div style={{ fontSize:10, color:C.text3, fontFamily:'var(--mono)', textAlign:'center', padding:'6px 0' }}>No metrics available</div>
                )}
              </div>
            )
          })}
          {filtered.length === 0 && (
            <div style={{ gridColumn:'1/-1', textAlign:'center', color:C.text3, fontSize:12, padding:40 }}>No hosts match filters</div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Tab 3: Problems ─────────────────────────────────────────────────────────
function ProblemsTab({ problems, loading }) {
  const [sevFilter, setSevFilter] = useState('all')
  const [ackFilter, setAckFilter] = useState('all')

  const filtered = problems.filter(p => {
    if (sevFilter !== 'all' && p.severity !== parseInt(sevFilter)) return false
    if (ackFilter === 'ack'   && !p.acknowledged) return false
    if (ackFilter === 'unack' &&  p.acknowledged) return false
    return true
  })

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
      {/* Filter row */}
      <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
        <div style={{ display:'flex', gap:3 }}>
          {[['all','All'],[5,'Disaster'],[4,'High'],[3,'Average'],[2,'Warning'],[1,'Info']].map(([v,l]) => (
            <button key={v} onClick={() => setSevFilter(String(v))} style={{
              padding:'4px 10px', border:`1px solid ${sevFilter===String(v) ? sevColor(Number(v)||0) : 'var(--border)'}`,
              borderRadius:5, background: sevFilter===String(v) ? `${sevColor(Number(v)||0)}22` : 'var(--bg3)',
              color: sevFilter===String(v) ? sevColor(Number(v)||0) : C.text3,
              fontSize:10, fontFamily:'var(--mono)', cursor:'pointer',
            }}>{l}</button>
          ))}
        </div>
        <div style={{ display:'flex', gap:3 }}>
          {[['all','All'],['unack','Unacknowledged'],['ack','Acknowledged']].map(([v,l]) => (
            <button key={v} onClick={() => setAckFilter(v)} style={{
              padding:'4px 10px', border:`1px solid ${ackFilter===v ? AMBER : 'var(--border)'}`,
              borderRadius:5, background: ackFilter===v ? `${AMBER}22` : 'var(--bg3)',
              color: ackFilter===v ? AMBER : C.text3, fontSize:10, fontFamily:'var(--mono)', cursor:'pointer',
            }}>{l}</button>
          ))}
        </div>
        <span className="badge badge-amber">{filtered.length}</span>
      </div>

      {loading ? <Skeleton /> : (
        <div className="card" style={{ overflow:'hidden' }}>
          <div style={{ overflowX:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:11 }}>
              <thead>
                <tr style={{ borderBottom:'1px solid var(--border)' }}>
                  {['Severity','Host','Problem','Duration','Since','Ack','Tags'].map(h => (
                    <th key={h} style={{ padding:'8px 12px', textAlign:'left', fontSize:10, fontFamily:'var(--mono)', color:C.text3, fontWeight:600, letterSpacing:0.5, whiteSpace:'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0
                  ? <tr><td colSpan={7} style={{ padding:30, textAlign:'center', color:C.text3, fontSize:12 }}>No problems match filters</td></tr>
                  : filtered.map((p, i) => (
                    <tr key={i} style={{ borderBottom:'1px solid var(--border)', background: p.severity >= 4 ? `${C.red}06` : p.severity === 3 ? `${C.amber}06` : 'transparent' }}>
                      <td style={{ padding:'7px 12px' }}>
                        <span className={`badge badge-${sevClass(p.severity)}`} style={{ fontSize:9 }}>{sevLabel(p.severity)}</span>
                      </td>
                      <td style={{ padding:'7px 12px', fontFamily:'var(--mono)', color:C.cyan, whiteSpace:'nowrap' }}>{p.host || '—'}</td>
                      <td style={{ padding:'7px 12px', color:C.text, maxWidth:280, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{p.name}</td>
                      <td style={{ padding:'7px 12px', fontFamily:'var(--mono)', color:C.text3, whiteSpace:'nowrap' }}>{fmtDuration(p.duration)}</td>
                      <td style={{ padding:'7px 12px', fontFamily:'var(--mono)', color:C.text3, whiteSpace:'nowrap', fontSize:10 }}>
                        {new Date(p.startedAt).toLocaleString('en',{ month:'short', day:'2-digit', hour:'2-digit', minute:'2-digit' })}
                      </td>
                      <td style={{ padding:'7px 12px', textAlign:'center' }}>
                        <span style={{ color: p.acknowledged ? C.green : C.red, fontSize:14 }}>{p.acknowledged ? '✓' : '✗'}</span>
                      </td>
                      <td style={{ padding:'7px 12px' }}>
                        <div style={{ display:'flex', gap:3, flexWrap:'wrap' }}>
                          {p.tags.slice(0,3).map((t,j) => (
                            <span key={j} style={{ fontSize:9, fontFamily:'var(--mono)', color:C.text3, background:'var(--bg4)', padding:'1px 5px', borderRadius:3 }}>
                              {t.tag}{t.value ? `=${t.value}` : ''}
                            </span>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))
                }
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Tab 4: Groups ────────────────────────────────────────────────────────────
function GroupsTab({ groups, problems, loading, onFilterHosts }) {
  const probByHost = {}
  for (const p of problems) {
    if (p.hostId) probByHost[p.hostId] = (probByHost[p.hostId] || 0) + 1
  }

  return loading ? <Skeleton /> : (
    <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(260px,1fr))', gap:12 }}>
      {groups.map(g => {
        const groupProbs = g.hosts.reduce((acc, h) => acc + (probByHost[h.id] || 0), 0)
        return (
          <div key={g.id} className="card" style={{ cursor:'pointer' }} onClick={() => onFilterHosts(g.name)}>
            <div className="card-header">
              <span className="card-title" style={{ color:C.text }}>{g.name}</span>
              {groupProbs > 0 && <span className="badge badge-red" style={{ fontSize:9 }}>{groupProbs} problems</span>}
            </div>
            <div style={{ padding:'10px 14px' }}>
              <div style={{ fontSize:22, fontWeight:700, color:C.accent, marginBottom:8 }}>
                {g.hostCount} <span style={{ fontSize:11, fontWeight:400, color:C.text3 }}>hosts</span>
              </div>
              <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
                {g.hosts.slice(0,5).map((h, i) => (
                  <div key={i} style={{ display:'flex', alignItems:'center', gap:6, fontSize:11 }}>
                    {availDot(h.available, 6)}
                    <span style={{ color:C.text2, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{h.name}</span>
                  </div>
                ))}
                {g.hostCount > 5 && <div style={{ fontSize:10, color:C.text3, fontFamily:'var(--mono)' }}>+{g.hostCount-5} more</div>}
              </div>
            </div>
          </div>
        )
      })}
      {groups.length === 0 && <div style={{ gridColumn:'1/-1', textAlign:'center', color:C.text3, padding:40 }}>No groups</div>}
    </div>
  )
}

// ─── Tab 5: Events ────────────────────────────────────────────────────────────
function EventsTab({ events, loading, lastUpdated }) {
  const [filter, setFilter] = useState('all')

  const filtered = events.filter(ev => {
    if (filter === 'ack'      && !ev.acknowledged) return false
    if (filter === 'problem'  && ev.acknowledged)  return false
    return true
  })

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
      <div style={{ display:'flex', gap:8, alignItems:'center' }}>
        {[['all','All'],['problem','Problems'],['ack','Acknowledged']].map(([v,l]) => (
          <button key={v} onClick={() => setFilter(v)} style={{
            padding:'5px 12px', border:`1px solid ${filter===v ? AMBER : 'var(--border)'}`,
            borderRadius:6, background: filter===v ? `${AMBER}22` : 'var(--bg3)',
            color: filter===v ? AMBER : C.text3, fontSize:10, fontFamily:'var(--mono)', cursor:'pointer',
          }}>{l}</button>
        ))}
        <span style={{ marginLeft:'auto', fontSize:10, color:C.text3, fontFamily:'var(--mono)' }}>
          Last updated: {lastUpdated || '—'}
        </span>
      </div>

      {loading ? <Skeleton /> : (
        <Card title="Recent Events — Last 24h" badge={filtered.length} badgeClass="amber" noPad>
          <div style={{ maxHeight:500, overflowY:'auto' }}>
            {filtered.length === 0
              ? <div style={{ padding:30, textAlign:'center', color:C.text3, fontSize:12 }}>No events</div>
              : filtered.map((ev, i) => {
                const borderColor = ev.acknowledged ? C.amber : C.red
                return (
                  <div key={i} style={{ display:'grid', gridTemplateColumns:'90px 1fr 90px auto', alignItems:'center', gap:8, padding:'8px 14px', borderBottom:'1px solid var(--border)', borderLeft:`3px solid ${borderColor}` }}>
                    <span style={{ fontSize:9, fontFamily:'var(--mono)', color:C.text3 }}>
                      {new Date(ev.timestamp).toLocaleTimeString()}
                    </span>
                    <div>
                      <div style={{ color:C.text, fontSize:11, fontWeight:600, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{ev.name}</div>
                      <div style={{ color:C.cyan, fontSize:10, fontFamily:'var(--mono)' }}>{ev.host}</div>
                    </div>
                    <span className={`badge badge-${sevClass(ev.severity)}`} style={{ fontSize:9, textAlign:'center' }}>{sevLabel(ev.severity)}</span>
                    <span style={{ color: ev.acknowledged ? C.green : C.red, fontSize:13 }}>{ev.acknowledged ? '✓' : '✗'}</span>
                  </div>
                )
              })
            }
          </div>
        </Card>
      )}
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function ZabbixPage() {
  const [tab, setTab]           = useState('overview')
  const [stats, setStats]       = useState(null)
  const [hosts, setHosts]       = useState([])
  const [problems, setProblems] = useState([])
  const [groups, setGroups]     = useState([])
  const [events, setEvents]     = useState([])
  const [loading, setLoading]   = useState(true)
  const [connected, setConnected] = useState(true)
  const [connError, setConnError] = useState(null)
  const [lastUpdated, setLastUpdated] = useState(null)
  const [hostGroupFilter, setHostGroupFilter] = useState(null)
  const timerRef = useRef(null)

  const load = useCallback(async () => {
    try {
      const [statsRes, hostsRes, problemsRes, groupsRes, eventsRes] = await Promise.all([
        zabbixAPI.getStats(),
        zabbixAPI.getHosts(),
        zabbixAPI.getProblems(),
        zabbixAPI.getGroups(),
        zabbixAPI.getEvents(),
      ])
      const s = statsRes.data
      if (s.connected === false) {
        setConnected(false)
        setConnError(s.error || 'Zabbix unreachable')
      } else {
        setConnected(true)
        setConnError(null)
      }
      setStats(s)
      setHosts(hostsRes.data     || [])
      setProblems(problemsRes.data || [])
      setGroups(groupsRes.data   || [])
      setEvents(eventsRes.data   || [])
      setLastUpdated(new Date().toLocaleTimeString())
    } catch (err) {
      setConnected(false)
      setConnError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
    timerRef.current = setInterval(load, 30_000)
    return () => clearInterval(timerRef.current)
  }, [load])

  function handleFilterHosts(groupName) {
    setHostGroupFilter(groupName)
    setTab('hosts')
  }

  // If groups tab triggers host filter, pass it down
  const hostsWithFilter = hostGroupFilter
    ? hosts.filter(h => h.groups.includes(hostGroupFilter))
    : hosts

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', overflow:'hidden' }}>
      {/* Connection banner */}
      {!connected && (
        <div style={{ background:`${C.red}22`, borderBottom:`1px solid ${C.red}44`, padding:'8px 20px', display:'flex', alignItems:'center', gap:12, flexShrink:0 }}>
          <div style={{ width:8, height:8, borderRadius:'50%', background:C.red }} />
          <span style={{ fontSize:11, color:C.red, fontFamily:'var(--mono)', fontWeight:600 }}>Zabbix Unreachable</span>
          <span style={{ fontSize:11, color:C.text3, fontFamily:'var(--mono)' }}>{connError}</span>
          <button onClick={load} style={{ marginLeft:'auto', padding:'4px 12px', background:`${C.red}22`, border:`1px solid ${C.red}66`, borderRadius:6, color:C.red, fontSize:10, fontFamily:'var(--mono)', cursor:'pointer' }}>
            Retry
          </button>
        </div>
      )}

      {/* Header */}
      <div style={{ padding:'12px 20px 0', flexShrink:0 }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 }}>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <div style={{ width:8, height:8, borderRadius:'50%', background: connected ? C.green : C.red, boxShadow: connected ? `0 0 6px ${C.green}` : `0 0 6px ${C.red}`, animation: connected ? 'pulse 2s infinite' : undefined }} />
            <span style={{ fontSize:10, fontFamily:'var(--mono)', color: connected ? C.green : C.red }}>
              {connected ? 'CONNECTED' : 'DISCONNECTED'}
            </span>
            {lastUpdated && <span style={{ fontSize:10, fontFamily:'var(--mono)', color:C.text3 }}>• Updated {lastUpdated}</span>}
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:6, fontSize:10, fontFamily:'var(--mono)', color:C.text3 }}>
            <span>Auto-refresh 30s</span>
            {hostGroupFilter && (
              <button onClick={() => { setHostGroupFilter(null); setTab('hosts') }} style={{ padding:'3px 8px', background:`${AMBER}22`, border:`1px solid ${AMBER}66`, borderRadius:4, color:AMBER, fontSize:9, fontFamily:'var(--mono)', cursor:'pointer' }}>
                Group: {hostGroupFilter} ✕
              </button>
            )}
          </div>
        </div>
        <TabBar tab={tab} setTab={t => { setTab(t); if (t !== 'hosts') setHostGroupFilter(null) }} />
      </div>

      {/* Tab content */}
      <div style={{ flex:1, overflowY:'auto', padding:'14px 20px' }}>
        {tab === 'overview' && <OverviewTab stats={stats} events={events} loading={loading} />}
        {tab === 'hosts'    && <HostsTab hosts={hostGroupFilter ? hostsWithFilter : hosts} groups={groups} loading={loading} />}
        {tab === 'problems' && <ProblemsTab problems={problems} loading={loading} />}
        {tab === 'groups'   && <GroupsTab groups={groups} problems={problems} loading={loading} onFilterHosts={handleFilterHosts} />}
        {tab === 'events'   && <EventsTab events={events} loading={loading} lastUpdated={lastUpdated} />}
      </div>
    </div>
  )
}
