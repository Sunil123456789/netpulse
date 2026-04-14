import { getESClient } from '../../config/elasticsearch.js'
import { zabbix } from '../zabbix.js'
import Ticket from '../../models/Ticket.js'
import AlertRule from '../../models/AlertRule.js'

async function buildContext(sources = ['es', 'zabbix', 'mongo'], dateRange = null) {
  const from = dateRange?.from || 'now-1h'
  const to   = dateRange?.to   || 'now'
  const timeRange = { gte: from, ...(to !== 'now' && { lte: to }) }

  const results = await Promise.allSettled([
    sources.includes('es')     ? fetchSOCStats(timeRange)  : null,
    sources.includes('es')     ? fetchNOCStats(timeRange)  : null,
    sources.includes('es')     ? fetchRecentCritical(timeRange) : null,
    sources.includes('zabbix') ? fetchZabbixStats()        : null,
    sources.includes('mongo')  ? fetchMongoStats()         : null,
  ])

  const [socResult, nocResult, eventsResult, zabbixResult, mongoResult] = results

  const soc        = socResult?.status    === 'fulfilled' ? socResult.value    : null
  const noc        = nocResult?.status    === 'fulfilled' ? nocResult.value    : null
  const events     = eventsResult?.status === 'fulfilled' ? eventsResult.value : []
  const zabbixData = zabbixResult?.status === 'fulfilled' ? zabbixResult.value : null
  const mongoData  = mongoResult?.status  === 'fulfilled' ? mongoResult.value  : null

  const contextString = buildContextString({
    soc, noc, events, zabbix: zabbixData, mongo: mongoData,
    from, to, generatedAt: new Date().toISOString(),
  })

  return {
    raw: { soc, noc, events, zabbix: zabbixData, mongo: mongoData },
    text: contextString,
    generatedAt: new Date().toISOString(),
    sources: results.map((r, i) => ({
      source: ['es_soc', 'es_noc', 'es_events', 'zabbix', 'mongo'][i],
      status: r?.status || 'skipped',
    })),
  }
}

async function fetchSOCStats(timeRange) {
  const es = getESClient()
  const [total, denied, ips, utm] = await Promise.all([
    es.count({ index: 'firewall-*', body: { query: { range: { '@timestamp': timeRange } } } }),
    es.count({ index: 'firewall-*', body: { query: { bool: { must: [
      { range: { '@timestamp': timeRange } },
      { term: { 'fgt.action.keyword': 'deny' } },
    ] } } } }),
    es.count({ index: 'firewall-*', body: { query: { bool: { must: [
      { range: { '@timestamp': timeRange } },
      { term: { 'fgt.subtype.keyword': 'ips' } },
    ] } } } }),
    es.count({ index: 'firewall-*', body: { query: { bool: { must: [
      { range: { '@timestamp': timeRange } },
      { term: { 'fgt.type.keyword': 'utm' } },
    ] } } } }),
  ])
  return {
    total:     total.count,
    denied:    denied.count,
    ips:       ips.count,
    utm:       utm.count,
    blockRate: total.count > 0 ? Math.round((denied.count / total.count) * 100) : 0,
  }
}

async function fetchNOCStats(timeRange) {
  const es = getESClient()
  const [total, macflap, updown, vlan] = await Promise.all([
    es.count({ index: 'cisco-*', body: { query: { range: { '@timestamp': timeRange } } } }),
    es.count({ index: 'cisco-*', body: { query: { bool: { must: [
      { range: { '@timestamp': timeRange } },
      { term: { 'cisco_mnemonic.keyword': 'MACFLAP_NOTIF' } },
    ] } } } }),
    es.count({ index: 'cisco-*', body: { query: { bool: { must: [
      { range: { '@timestamp': timeRange } },
      { term: { 'cisco_mnemonic.keyword': 'UPDOWN' } },
    ] } } } }),
    es.count({ index: 'cisco-*', body: { query: { bool: { must: [
      { range: { '@timestamp': timeRange } },
      { term: { 'cisco_mnemonic.keyword': 'NATIVE_VLAN_MISMATCH' } },
    ] } } } }),
  ])
  return { total: total.count, macflap: macflap.count, updown: updown.count, vlan: vlan.count }
}

async function fetchRecentCritical(timeRange) {
  const es = getESClient()
  const result = await es.search({
    index: 'firewall-*',
    body: {
      size: 5,
      sort: [{ '@timestamp': { order: 'desc' } }],
      query: { bool: { must: [
        { range: { '@timestamp': timeRange } },
        { term: { 'fgt.subtype.keyword': 'ips' } },
      ] } },
      _source: ['@timestamp', 'fgt.srcip', 'fgt.attack', 'fgt.severity', 'site_name'],
    },
  })
  return result.hits.hits.map(h => h._source)
}

async function fetchZabbixStats() {
  const [hosts, problems] = await Promise.allSettled([
    zabbix.getHosts(),
    zabbix.getProblems(),
  ])

  const hostList    = hosts.status    === 'fulfilled' ? hosts.value    : []
  const problemList = problems.status === 'fulfilled' ? problems.value : []

  let up = 0, down = 0
  for (const h of hostList) {
    const avail = +((h.interfaces || []).find(i => i.main === '1')?.available ?? h.available)
    if (avail === 1) up++
    else if (avail === 2) down++
  }

  const high     = problemList.filter(p => +p.severity >= 4).length
  const critical = problemList.filter(p => +p.severity === 5).length

  return {
    totalHosts:       hostList.length,
    hostsUp:          up,
    hostsDown:        down,
    totalProblems:    problemList.length,
    highProblems:     high,
    criticalProblems: critical,
    topProblems: problemList.slice(0, 3).map(p => ({
      name:     p.name,
      host:     p.hosts?.[0]?.name || 'unknown',
      severity: p.severity,
    })),
  }
}

async function fetchMongoStats() {
  const [tickets, alerts] = await Promise.allSettled([
    Ticket.countDocuments({ status: { $in: ['open', 'in_progress'] } }),
    AlertRule.countDocuments({ enabled: true }),
  ])

  return {
    openTickets:  tickets.status === 'fulfilled' ? tickets.value : 0,
    activeAlerts: alerts.status  === 'fulfilled' ? alerts.value  : 0,
  }
}

function buildContextString({ soc, noc, events, zabbix, mongo, from, to, generatedAt }) {
  const lines = []
  lines.push(`NETPULSE NETWORK STATUS — Generated: ${generatedAt}`)
  lines.push(`Analysis Period: ${from} to ${to}`)
  lines.push('')

  if (soc) {
    lines.push('=== SECURITY (FortiGate Firewall) ===')
    lines.push(`Total Events: ${soc.total?.toLocaleString()}`)
    lines.push(`Denied/Blocked: ${soc.denied?.toLocaleString()} (${soc.blockRate}% block rate)`)
    lines.push(`IPS Alerts: ${soc.ips?.toLocaleString()}`)
    lines.push(`UTM Events: ${soc.utm?.toLocaleString()}`)
    lines.push('')
  }

  if (noc) {
    lines.push('=== NETWORK (Cisco Switches) ===')
    lines.push(`Total Switch Events: ${noc.total?.toLocaleString()}`)
    lines.push(`Interface Changes (Up/Down): ${noc.updown?.toLocaleString()}`)
    lines.push(`MAC Flapping Events: ${noc.macflap?.toLocaleString()}`)
    lines.push(`VLAN Mismatches: ${noc.vlan?.toLocaleString()}`)
    lines.push('')
  }

  if (zabbix) {
    lines.push('=== INFRASTRUCTURE (Zabbix) ===')
    lines.push(`Monitored Hosts: ${zabbix.totalHosts} total, ${zabbix.hostsUp} UP, ${zabbix.hostsDown} DOWN`)
    lines.push(`Active Problems: ${zabbix.totalProblems} (${zabbix.highProblems} high, ${zabbix.criticalProblems} critical)`)
    if (zabbix.topProblems?.length > 0) {
      lines.push('Top Problems:')
      zabbix.topProblems.forEach(p => lines.push(`  - ${p.host}: ${p.name}`))
    }
    lines.push('')
  }

  if (events?.length > 0) {
    lines.push('=== RECENT SECURITY EVENTS ===')
    events.forEach(e => {
      lines.push(`  - ${e['@timestamp']}: ${e['fgt.attack'] || 'IPS Alert'} from ${e['fgt.srcip'] || 'unknown'} [${e.site_name || 'unknown site'}]`)
    })
    lines.push('')
  }

  if (mongo) {
    lines.push('=== TICKETS & ALERTS ===')
    lines.push(`Open Tickets: ${mongo.openTickets}`)
    lines.push(`Active Alert Rules: ${mongo.activeAlerts}`)
  }

  return lines.join('\n')
}

export { buildContext }
