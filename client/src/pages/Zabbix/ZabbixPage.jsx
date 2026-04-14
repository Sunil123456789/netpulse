import { useEffect, useState } from 'react'
import { zabbixAPI } from '../../api/zabbix'

const C = { accent:'#4f7ef5', accent2:'#7c5cfc', green:'#22d3a0', red:'#f5534f', amber:'#f5a623', cyan:'#22d3ee', text:'#e8eaf2', text2:'#8b90aa', text3:'#555a72' }

const TABS = [
  { id:'overview', label:'Overview' },
  { id:'hosts',    label:'Hosts'    },
  { id:'problems', label:'Problems' },
  { id:'groups',   label:'Groups'   },
  { id:'events',   label:'Events'   },
]

// severity 0-5
const SEV_LABEL = ['Not classified', 'Info', 'Warning', 'Average', 'High', 'Disaster']
const SEV_COLOR = [C.text3, C.text3, C.accent, C.amber, C.amber, C.red]
const SEV_CLASS = ['blue', 'blue', 'blue', 'amber', 'amber', 'red']
const sevLabel = n => SEV_LABEL[n] ?? 'Unknown'
const sevColor = n => SEV_COLOR[n] ?? C.text3
const sevClass = n => SEV_CLASS[n] ?? 'blue'

function fmtDuration(secs) {
  if (!secs && secs !== 0) return '—'
  const d = Math.floor(secs / 86400)
  const h = Math.floor((secs % 86400) / 3600)
  const m = Math.floor((secs % 3600) / 60)
  if (d > 0) return `${d}d ${h}h`
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

function metricColor(v) {
  if (v === null || v === undefined) return C.text3
  return v >= 90 ? C.red : v >= 70 ? C.amber : C.green
}

function StatusDot({ available }) {
  const c = available === 1 ? C.green : available === 2 ? C.red : C.amber
  return (
    <div style={{
      width: 8, height: 8, borderRadius: '50%', background: c, flexShrink: 0,
      animation: available === 2 ? 'pulse 1.5s infinite' : undefined,
      boxShadow: available === 2 ? `0 0 4px ${C.red}` : undefined,
    }} />
  )
}

function MetricBar({ label, value }) {
  const v = value ?? null
  const c = metricColor(v)
  return (
    <div style={{ display:'flex', alignItems:'center', gap:6 }}>
      <span style={{ fontSize:9, fontFamily:'var(--mono)', color:C.text3, width:28, flexShrink:0 }}>{label}</span>
      <div style={{ flex:1, height:4, background:'var(--bg4)', borderRadius:2, overflow:'hidden' }}>
        <div style={{ width:`${Math.min(v ?? 0, 100)}%`, height:'100%', background:c, borderRadius:2, transition:'width 0.3s' }} />
      </div>
      <span style={{ fontSize:9, fontFamily:'var(--mono)', color:c, width:32, textAlign:'right', flexShrink:0 }}>
        {v !== null ? `${v}%` : '—'}
      </span>
    </div>
  )
}

function KPI({ label, value, sub, color }) {
  const colors = { blue:C.accent, red:C.red, green:C.green, amber:C.amber, cyan:C.cyan, purple:C.accent2 }
  return (
    <div className={`kpi ${color}`}>
      <div style={{ fontSize:10, fontWeight:600, color:C.text3, letterSpacing:1, textTransform:'uppercase', marginBottom:6, fontFamily:'var(--mono)' }}>{label}</div>
      <div style={{ fontSize:24, fontWeight:700, lineHeight:1, marginBottom:4, color:colors[color]||C.accent }}>{value ?? '—'}</div>
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

function BarRows({ items, colorFn }) {
  const max = Math.max(...items.map(i => i.count || 0), 1)
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
      {items.map((item, i) => {
        const val   = item.count || 0
        const color = colorFn ? colorFn(i) : [C.red, C.amber, C.accent, C.cyan, C.green, C.accent2][i % 6]
        return (
          <div key={i} style={{ display:'flex', alignItems:'center', gap:8 }}>
            <span style={{ fontSize:11, fontFamily:'var(--mono)', color:C.text2, width:130, flexShrink:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
              {item.label || item.key || '—'}
            </span>
            <div style={{ flex:1, height:6, background:'var(--bg4)', borderRadius:3, overflow:'hidden' }}>
              <div style={{ width:`${(val / max * 100).toFixed(0)}%`, height:'100%', background:color, borderRadius:3 }} />
            </div>
            <span style={{ fontSize:10, fontFamily:'var(--mono)', color:C.text3, width:50, textAlign:'right', flexShrink:0 }}>
              {val.toLocaleString()}
            </span>
          </div>
        )
      })}
    </div>
  )
}

export default function ZabbixPage() {
  const [tab, setTab]           = useState('overview')
  const [overview, setOverview] = useState(null)
  const [hosts, setHosts]       = useState([])
  const [problems, setProblems] = useState([])
  const [groups, setGroups]     = useState([])
  const [events, setEvents]     = useState([])
  const [fetchError, setFetchError] = useState(null)
  const [degradedSources, setDegradedSources] = useState([])
  const [loading, setLoading]   = useState(true)
  const [lastRefresh, setLastRefresh] = useState(null)

  // Hosts tab filters
  const [hostSearch, setHostSearch] = useState('')
  const [hostStatus, setHostStatus] = useState('all')

  // Problems tab filters
  const [probSev, setProbSev] = useState('all')
  const [probAck, setProbAck] = useState('all')

  // Events tab filter
  const [evFilter, setEvFilter] = useState('all')

  function normalizeOverview(result) {
    if (result.status === 'fulfilled') {
      const payload = result.value.data || {}
      return {
        data: payload,
        issue: payload.connected === false ? payload.error || 'Zabbix unavailable' : null,
      }
    }

    const payload = result.reason?.response?.data || {}
    return {
      data: {
        connected: false,
        degraded: true,
        error: payload.error || result.reason.message || 'Zabbix unavailable',
        hosts: payload.hosts || { total: 0, up: 0, down: 0, unknown: 0 },
        problems: payload.problems || { total: 0, disaster: 0, high: 0, average: 0, warning: 0, info: 0 },
        groups: payload.groups || 0,
      },
      issue: payload.error || result.reason.message || 'Zabbix unavailable',
    }
  }

  function normalizeCollection(result, label) {
    if (result.status === 'fulfilled') {
      const payload = result.value.data || {}
      return {
        items: payload.data || [],
        issue: payload.connected === false ? payload.error || `${label} unavailable` : null,
      }
    }

    const payload = result.reason?.response?.data || {}
    return {
      items: payload.data || [],
      issue: payload.error || result.reason.message || `${label} unavailable`,
    }
  }

  useEffect(() => {
    async function load() {
      try {
        const [ov, hs, pr, gr, ev] = await Promise.allSettled([
          zabbixAPI.getOverview(),
          zabbixAPI.getHosts(),
          zabbixAPI.getProblems(),
          zabbixAPI.getGroups(),
          zabbixAPI.getEvents(),
        ])

        const overviewState = normalizeOverview(ov)
        const hostsState = normalizeCollection(hs, 'Hosts')
        const problemsState = normalizeCollection(pr, 'Problems')
        const groupsState = normalizeCollection(gr, 'Groups')
        const eventsState = normalizeCollection(ev, 'Events')

        setOverview(overviewState.data)
        setHosts(hostsState.items)
        setProblems(problemsState.items)
        setGroups(groupsState.items)
        setEvents(eventsState.items)

        const issues = [
          overviewState.issue && `Overview: ${overviewState.issue}`,
          hostsState.issue && `Hosts: ${hostsState.issue}`,
          problemsState.issue && `Problems: ${problemsState.issue}`,
          groupsState.issue && `Groups: ${groupsState.issue}`,
          eventsState.issue && `Events: ${eventsState.issue}`,
        ].filter(Boolean)

        setDegradedSources(issues)
        setFetchError(issues.length > 0 ? issues[0] : null)
        setLastRefresh(new Date().toLocaleTimeString())
      } catch (err) {
        setDegradedSources([err.response?.data?.error || err.message])
        setFetchError(err.response?.data?.error || err.message)
      } finally {
        setLoading(false)
      }
    }
    load()
    const t = setInterval(load, 30000)
    return () => clearInterval(t)
  }, [])

  const h = overview?.hosts    || {}
  const p = overview?.problems || {}

  const filteredHosts = hosts.filter(host => {
    if (hostSearch && !host.name.toLowerCase().includes(hostSearch.toLowerCase()) && !host.ip.includes(hostSearch)) return false
    if (hostStatus === 'up'      && host.available !== 1) return false
    if (hostStatus === 'down'    && host.available !== 2) return false
    if (hostStatus === 'unknown' && host.available !== 0) return false
    return true
  })

  const filteredProblems = problems.filter(prob => {
    if (probSev !== 'all' && prob.severity !== +probSev) return false
    if (probAck === 'ack'   && !prob.acknowledged) return false
    if (probAck === 'unack' &&  prob.acknowledged) return false
    return true
  })

  const filteredEvents = events.filter(ev => {
    if (evFilter === 'ack'     && !ev.acknowledged) return false
    if (evFilter === 'problem' &&  ev.acknowledged) return false
    return true
  })

  // ── Tab 1: Overview ─────────────────────────────────────────────────────────
  function renderOverview() {
    const probBars = [
      { label:'Disaster', count: p.disaster || 0 },
      { label:'High',     count: p.high     || 0 },
      { label:'Average',  count: p.average  || 0 },
      { label:'Warning',  count: p.warning  || 0 },
      { label:'Info',     count: p.info     || 0 },
    ]
    return (
      <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
        {/* KPI row */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(6,1fr)', gap:10 }}>
          <KPI label="Hosts Up"       value={h.up}      color="green" sub="available" />
          <KPI label="Hosts Down"     value={h.down}    color={h.down > 0 ? 'red' : 'green'} sub="unreachable" />
          <KPI label="Unknown"        value={h.unknown} color="amber" sub="no data" />
          <KPI label="Active Problems" value={p.total}  color={p.total > 0 ? 'red' : 'green'} sub="open" />
          <KPI label="Disaster / High" value={(p.disaster||0)+(p.high||0)} color={(p.disaster||0)+(p.high||0)>0?'red':'green'} sub="critical" />
          <KPI label="Host Groups"    value={overview?.groups} color="blue" sub="groups" />
        </div>

        {/* Host health + problem breakdown */}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
          <Card title="Host Health">
            <div>
              {/* ratio bar */}
              <div style={{ display:'flex', height:10, borderRadius:5, overflow:'hidden', marginBottom:10, gap:2 }}>
                <div style={{ flex: h.up      || 0, background: C.green, minWidth: h.up      ? 4 : 0 }} />
                <div style={{ flex: h.unknown || 0, background: C.amber, minWidth: h.unknown ? 4 : 0 }} />
                <div style={{ flex: h.down    || 0, background: C.red,   minWidth: h.down    ? 4 : 0 }} />
              </div>
              <div style={{ display:'flex', gap:16 }}>
                {[{l:'Up',c:C.green,v:h.up},{l:'Unknown',c:C.amber,v:h.unknown},{l:'Down',c:C.red,v:h.down}].map(x => (
                  <div key={x.l} style={{ display:'flex', alignItems:'center', gap:4, fontSize:10, fontFamily:'var(--mono)' }}>
                    <div style={{ width:6, height:6, borderRadius:'50%', background:x.c }} />
                    <span style={{ color:C.text3 }}>{x.l}</span>
                    <span style={{ color:x.c, fontWeight:600 }}>{x.v ?? 0}</span>
                  </div>
                ))}
              </div>
              <div style={{ marginTop:12, fontSize:22, fontWeight:700, color: h.down > 0 ? C.red : C.green }}>
                {h.up ?? 0}
                <span style={{ fontSize:13, fontWeight:400, color:C.text3 }}>/{h.total ?? 0} online</span>
              </div>
            </div>
          </Card>

          <Card title="Problems by Severity">
            <BarRows items={probBars} colorFn={i => [C.red, C.amber, C.amber, C.accent, C.text3][i]} />
          </Card>
        </div>

        {/* Recent active problems */}
        <Card title="Active Problems" badge={problems.length} badgeClass="amber" noPad>
          <div style={{ maxHeight:280, overflowY:'auto' }}>
            {problems.length === 0
              ? <div style={{ padding:20, textAlign:'center', color:C.text3, fontSize:12 }}>{loading ? 'Loading…' : 'No active problems'}</div>
              : problems.slice(0, 10).map((pr, i) => (
                <div key={i} style={{ display:'grid', gridTemplateColumns:'90px 1fr 70px 20px', alignItems:'center', gap:8, padding:'7px 14px', borderBottom:'1px solid var(--border)' }}>
                  <span className={`badge badge-${sevClass(pr.severity)}`} style={{ fontSize:9, textAlign:'center' }}>{sevLabel(pr.severity)}</span>
                  <div style={{ minWidth:0 }}>
                    <div style={{ fontSize:11, color:C.text, fontWeight:600, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{pr.name}</div>
                    <div style={{ fontSize:9, color:C.text3, fontFamily:'var(--mono)' }}>{pr.host} • {fmtDuration(pr.duration)}</div>
                  </div>
                  <span style={{ fontSize:9, color:C.text3, fontFamily:'var(--mono)', textAlign:'right' }}>
                    {new Date(pr.startedAt).toLocaleTimeString('en',{hour:'2-digit',minute:'2-digit'})}
                  </span>
                  <span style={{ color:pr.acknowledged ? C.green : C.red, fontSize:12, textAlign:'center' }}>{pr.acknowledged ? '✓' : '✗'}</span>
                </div>
              ))
            }
          </div>
        </Card>
      </div>
    )
  }

  // ── Tab 2: Hosts ─────────────────────────────────────────────────────────────
  function renderHosts() {
    return (
      <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
        {/* toolbar */}
        <div style={{ display:'flex', gap:10, alignItems:'center', flexWrap:'wrap' }}>
          <input
            placeholder="Search hostname or IP…" value={hostSearch}
            onChange={e => setHostSearch(e.target.value)}
            style={{ flex:1, minWidth:180, background:'var(--bg3)', border:'1px solid var(--border)', borderRadius:6, padding:'6px 10px', color:C.text, fontSize:11, fontFamily:'var(--mono)', outline:'none' }}
          />
          <div style={{ display:'flex', gap:4 }}>
            {[['all','All'],['up','Up'],['down','Down'],['unknown','Unknown']].map(([v, l]) => (
              <button key={v} onClick={() => setHostStatus(v)} style={{
                padding:'5px 10px', border:`1px solid ${hostStatus===v ? C.amber : 'var(--border)'}`,
                borderRadius:6, background:hostStatus===v ? `${C.amber}22` : 'var(--bg3)',
                color:hostStatus===v ? C.amber : C.text3, fontSize:10, fontFamily:'var(--mono)', cursor:'pointer',
              }}>{l}</button>
            ))}
          </div>
          <span style={{ fontSize:10, color:C.text3, fontFamily:'var(--mono)' }}>{filteredHosts.length} hosts</span>
        </div>

        {/* host cards grid */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(260px,1fr))', gap:10 }}>
          {filteredHosts.map(host => {
            const border = host.available === 2 ? C.red : host.problems > 0 ? C.amber : 'var(--border)'
            return (
              <div key={host.id} style={{ background:'var(--bg2)', border:`1px solid ${border}`, borderRadius:10, padding:'12px 14px' }}>
                <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
                  <StatusDot available={host.available} />
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:12, fontWeight:700, color:C.cyan, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{host.name}</div>
                    <div style={{ fontSize:10, color:C.text3, fontFamily:'var(--mono)' }}>{host.ip || '—'}</div>
                  </div>
                  {host.problems > 0 && <span className="badge badge-red" style={{ fontSize:9 }}>{host.problems}</span>}
                </div>
                {host.groups.length > 0 && (
                  <div style={{ display:'flex', flexWrap:'wrap', gap:3, marginBottom:8 }}>
                    {host.groups.slice(0, 3).map((g, i) => (
                      <span key={i} style={{ fontSize:9, fontFamily:'var(--mono)', color:C.text3, background:'var(--bg4)', padding:'1px 5px', borderRadius:3 }}>{g}</span>
                    ))}
                    {host.groups.length > 3 && <span style={{ fontSize:9, color:C.text3 }}>+{host.groups.length-3}</span>}
                  </div>
                )}
                {(host.metrics.cpu !== null || host.metrics.ram !== null || host.metrics.disk !== null) ? (
                  <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
                    <MetricBar label="CPU"  value={host.metrics.cpu}  />
                    <MetricBar label="RAM"  value={host.metrics.ram}  />
                    <MetricBar label="Disk" value={host.metrics.disk} />
                  </div>
                ) : (
                  <div style={{ fontSize:10, color:C.text3, fontFamily:'var(--mono)', textAlign:'center', padding:'6px 0' }}>No metrics</div>
                )}
              </div>
            )
          })}
          {filteredHosts.length === 0 && (
            <div style={{ gridColumn:'1/-1', textAlign:'center', color:C.text3, fontSize:12, padding:40 }}>No hosts match filter</div>
          )}
        </div>
      </div>
    )
  }

  // ── Tab 3: Problems ───────────────────────────────────────────────────────────
  function renderProblems() {
    return (
      <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
        <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
          <div style={{ display:'flex', gap:3 }}>
            {[['all','All'],[5,'Disaster'],[4,'High'],[3,'Average'],[2,'Warning'],[1,'Info']].map(([v, l]) => (
              <button key={v} onClick={() => setProbSev(String(v))} style={{
                padding:'4px 10px', border:`1px solid ${probSev===String(v) ? sevColor(+v||0) : 'var(--border)'}`,
                borderRadius:5, background:probSev===String(v) ? `${sevColor(+v||0)}22` : 'var(--bg3)',
                color:probSev===String(v) ? sevColor(+v||0) : C.text3, fontSize:10, fontFamily:'var(--mono)', cursor:'pointer',
              }}>{l}</button>
            ))}
          </div>
          <div style={{ display:'flex', gap:3 }}>
            {[['all','All'],['unack','Unacknowledged'],['ack','Acknowledged']].map(([v, l]) => (
              <button key={v} onClick={() => setProbAck(v)} style={{
                padding:'4px 10px', border:`1px solid ${probAck===v ? C.amber : 'var(--border)'}`,
                borderRadius:5, background:probAck===v ? `${C.amber}22` : 'var(--bg3)',
                color:probAck===v ? C.amber : C.text3, fontSize:10, fontFamily:'var(--mono)', cursor:'pointer',
              }}>{l}</button>
            ))}
          </div>
          <span className="badge badge-amber">{filteredProblems.length}</span>
        </div>

        <div className="card" style={{ overflow:'hidden' }}>
          <div style={{ overflowX:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:11 }}>
              <thead>
                <tr style={{ borderBottom:'1px solid var(--border)' }}>
                  {['Severity','Host','Problem','Duration','Since','Ack'].map(col => (
                    <th key={col} style={{ padding:'8px 12px', textAlign:'left', fontSize:10, fontFamily:'var(--mono)', color:C.text3, fontWeight:600, letterSpacing:0.5, whiteSpace:'nowrap' }}>{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredProblems.length === 0
                  ? <tr><td colSpan={6} style={{ padding:30, textAlign:'center', color:C.text3, fontSize:12 }}>No problems match filters</td></tr>
                  : filteredProblems.map((pr, i) => (
                    <tr key={i} style={{ borderBottom:'1px solid var(--border)', background: pr.severity >= 4 ? `${C.red}06` : pr.severity === 3 ? `${C.amber}06` : 'transparent' }}>
                      <td style={{ padding:'7px 12px' }}>
                        <span className={`badge badge-${sevClass(pr.severity)}`} style={{ fontSize:9 }}>{sevLabel(pr.severity)}</span>
                      </td>
                      <td style={{ padding:'7px 12px', fontFamily:'var(--mono)', color:C.cyan, whiteSpace:'nowrap' }}>{pr.host || '—'}</td>
                      <td style={{ padding:'7px 12px', color:C.text, maxWidth:300, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{pr.name}</td>
                      <td style={{ padding:'7px 12px', fontFamily:'var(--mono)', color:C.text3, whiteSpace:'nowrap' }}>{fmtDuration(pr.duration)}</td>
                      <td style={{ padding:'7px 12px', fontFamily:'var(--mono)', color:C.text3, whiteSpace:'nowrap', fontSize:10 }}>
                        {new Date(pr.startedAt).toLocaleString('en',{month:'short',day:'2-digit',hour:'2-digit',minute:'2-digit'})}
                      </td>
                      <td style={{ padding:'7px 12px', textAlign:'center' }}>
                        <span style={{ color:pr.acknowledged ? C.green : C.red, fontSize:14 }}>{pr.acknowledged ? '✓' : '✗'}</span>
                      </td>
                    </tr>
                  ))
                }
              </tbody>
            </table>
          </div>
        </div>
      </div>
    )
  }

  // ── Tab 4: Groups ─────────────────────────────────────────────────────────────
  function renderGroups() {
    return (
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(260px,1fr))', gap:12 }}>
        {groups.map(g => (
          <div key={g.id} className="card">
            <div className="card-header">
              <span className="card-title">{g.name}</span>
              {g.problems > 0 && <span className="badge badge-red" style={{ fontSize:9 }}>{g.problems} problems</span>}
            </div>
            <div style={{ padding:'10px 14px' }}>
              <div style={{ fontSize:22, fontWeight:700, color:C.accent, marginBottom:8 }}>
                {g.hostCount} <span style={{ fontSize:11, fontWeight:400, color:C.text3 }}>hosts</span>
              </div>
              <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
                {g.hosts.slice(0, 5).map((host, i) => (
                  <div key={i} style={{ display:'flex', alignItems:'center', gap:6, fontSize:11 }}>
                    <StatusDot available={host.available} />
                    <span style={{ color:C.text2, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{host.name}</span>
                  </div>
                ))}
                {g.hostCount > 5 && <div style={{ fontSize:10, color:C.text3, fontFamily:'var(--mono)' }}>+{g.hostCount-5} more</div>}
              </div>
            </div>
          </div>
        ))}
        {groups.length === 0 && (
          <div style={{ gridColumn:'1/-1', textAlign:'center', color:C.text3, fontSize:12, padding:40 }}>No groups</div>
        )}
      </div>
    )
  }

  // ── Tab 5: Events ─────────────────────────────────────────────────────────────
  function renderEvents() {
    return (
      <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
        <div style={{ display:'flex', gap:8, alignItems:'center' }}>
          {[['all','All'],['problem','Problems'],['ack','Acknowledged']].map(([v, l]) => (
            <button key={v} onClick={() => setEvFilter(v)} style={{
              padding:'5px 12px', border:`1px solid ${evFilter===v ? C.amber : 'var(--border)'}`,
              borderRadius:6, background:evFilter===v ? `${C.amber}22` : 'var(--bg3)',
              color:evFilter===v ? C.amber : C.text3, fontSize:10, fontFamily:'var(--mono)', cursor:'pointer',
            }}>{l}</button>
          ))}
          <span style={{ marginLeft:'auto', fontSize:10, color:C.text3, fontFamily:'var(--mono)' }}>
            Last 24 hours • {filteredEvents.length} events
          </span>
        </div>

        <Card title="Recent Events" badge={filteredEvents.length} badgeClass="amber" noPad>
          <div style={{ maxHeight:520, overflowY:'auto' }}>
            {filteredEvents.length === 0
              ? <div style={{ padding:30, textAlign:'center', color:C.text3, fontSize:12 }}>No events</div>
              : filteredEvents.map((ev, i) => (
                <div key={i} style={{ display:'grid', gridTemplateColumns:'90px 1fr 90px 20px', alignItems:'center', gap:8, padding:'8px 14px', borderBottom:'1px solid var(--border)', borderLeft:`3px solid ${ev.acknowledged ? C.amber : sevColor(ev.severity)}` }}>
                  <span style={{ fontSize:9, fontFamily:'var(--mono)', color:C.text3 }}>
                    {new Date(ev.timestamp).toLocaleTimeString()}
                  </span>
                  <div style={{ minWidth:0 }}>
                    <div style={{ fontSize:11, color:C.text, fontWeight:600, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{ev.name}</div>
                    <div style={{ fontSize:9, color:C.cyan, fontFamily:'var(--mono)' }}>{ev.host}</div>
                  </div>
                  <span className={`badge badge-${sevClass(ev.severity)}`} style={{ fontSize:9, textAlign:'center' }}>{sevLabel(ev.severity)}</span>
                  <span style={{ color:ev.acknowledged ? C.green : C.text3, fontSize:12, textAlign:'center' }}>{ev.acknowledged ? '✓' : ''}</span>
                </div>
              ))
            }
          </div>
        </Card>
      </div>
    )
  }

  // ── Main render ───────────────────────────────────────────────────────────────
  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', overflow:'hidden' }}>

      {/* Error / disconnected banner */}
      {fetchError && (
        <div style={{ background:`${C.red}22`, borderBottom:`1px solid ${C.red}44`, padding:'7px 20px', display:'flex', alignItems:'center', gap:10, flexShrink:0 }}>
          <div style={{ width:6, height:6, borderRadius:'50%', background:C.red, flexShrink:0 }} />
          <span style={{ fontSize:11, color:C.red, fontFamily:'var(--mono)', fontWeight:600 }}>
            {degradedSources.length > 1 ? 'Zabbix Degraded' : 'Zabbix Unreachable'}
          </span>
          <span style={{ fontSize:11, color:C.text3, fontFamily:'var(--mono)' }}>
            {degradedSources.length > 1 ? degradedSources.join(' • ') : fetchError}
          </span>
        </div>
      )}

      {/* Status bar + tab bar */}
      <div style={{ padding:'10px 20px 0', flexShrink:0 }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <div style={{ width:7, height:7, borderRadius:'50%', background:fetchError ? C.red : C.green, boxShadow:`0 0 6px ${fetchError ? C.red : C.green}`, animation:'pulse 2s infinite' }} />
            <span style={{ fontSize:10, fontFamily:'var(--mono)', color:fetchError ? C.red : C.green }}>
              {fetchError ? 'DEGRADED' : 'CONNECTED'}
            </span>
            {lastRefresh && <span style={{ fontSize:10, fontFamily:'var(--mono)', color:C.text3 }}>• Updated {lastRefresh}</span>}
          </div>
          <span style={{ fontSize:10, fontFamily:'var(--mono)', color:C.text3 }}>Auto-refresh 30s</span>
        </div>

        {/* Tab bar — amber active color */}
        <div style={{ display:'flex', gap:2, borderBottom:'1px solid var(--border)' }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              padding:'8px 16px', border:'none', background:'transparent', cursor:'pointer',
              fontSize:12, fontWeight:600, fontFamily:'var(--mono)',
              color: tab === t.id ? C.amber : C.text3,
              borderBottom: tab === t.id ? `2px solid ${C.amber}` : '2px solid transparent',
              transition:'all 0.15s',
            }}>{t.label}</button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div style={{ flex:1, overflowY:'auto', padding:'14px 20px' }}>
        {tab === 'overview' && renderOverview()}
        {tab === 'hosts'    && renderHosts()}
        {tab === 'problems' && renderProblems()}
        {tab === 'groups'   && renderGroups()}
        {tab === 'events'   && renderEvents()}
      </div>
    </div>
  )
}
