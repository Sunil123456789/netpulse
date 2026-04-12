import { Router } from 'express'
import { getESClient } from '../config/elasticsearch.js'
import { getRedis } from '../config/redis.js'
import Ticket    from '../models/Ticket.js'
import AlertRule from '../models/AlertRule.js'
import Device    from '../models/Device.js'
import User      from '../models/User.js'
const router = Router()

const SERVER_TZ = process.env.TZ || 'UTC'

function getTimeRange(req) {
  const range = req.query.range || '24h'
  const dateFrom = req.query.from
  const dateTo = req.query.to
  return dateFrom && dateTo ? { gte: dateFrom, lte: dateTo } : { gte: 'now-' + range }
}

function getInterval(range, dateFrom, dateTo) {
  if (dateFrom && dateTo) {
    const ms = new Date(dateTo) - new Date(dateFrom)
    if (ms <= 3_600_000)   return '1m'
    if (ms <= 21_600_000)  return '5m'
    if (ms <= 86_400_000)  return '30m'
    if (ms <= 604_800_000) return '2h'
    return '6h'
  }
  return { '15m':'1m','1h':'1m','6h':'5m','12h':'15m','24h':'1h','3d':'2h','7d':'6h','30d':'12h' }[range] || '1h'
}

function cacheTTL(range) {
  if (['15m','1h'].includes(range)) return 30
  if (['6h','12h','24h'].includes(range)) return 60
  return 300
}

async function withCache(key, ttl, fn) {
  const redis = getRedis()
  if (redis) {
    try {
      const hit = await redis.get(key)
      if (hit) return JSON.parse(hit)
    } catch { /* skip cache on error */ }
  }
  const data = await fn()
  if (redis) redis.setex(key, ttl, JSON.stringify(data)).catch(() => {})
  return data
}

// Combined SOC overview — all 11 ES queries in one round-trip, Redis-cached
router.get('/soc/overview', async (req, res) => {
  const { range = '24h', from: dateFrom, to: dateTo } = req.query
  const cacheKey = `soc:overview:${range}:${dateFrom||''}:${dateTo||''}`
  try {
    const data = await withCache(cacheKey, cacheTTL(range), async () => {
      const es = getESClient()
      const tr = dateFrom && dateTo ? { gte: dateFrom, lte: dateTo } : { gte: 'now-' + range }
      const interval = getInterval(range, dateFrom, dateTo)

      const [total, denied, ips, auth, utm, vpn, timelineR, threatsR, deniedR, eventsR, sessionsR] = await Promise.all([
        es.count({ index:'firewall-*', body:{ query:{ range:{ '@timestamp': tr } } } }),
        es.count({ index:'firewall-*', body:{ query:{ bool:{ must:[{ range:{ '@timestamp': tr } },{ term:{ 'fgt.action.keyword':'deny' } }] } } } }),
        es.count({ index:'firewall-*', body:{ query:{ bool:{ must:[{ range:{ '@timestamp': tr } },{ term:{ 'fgt.subtype.keyword':'ips' } }] } } } }),
        es.count({ index:'cisco-*',    body:{ query:{ bool:{ must:[{ range:{ '@timestamp': tr } },{ terms:{ 'cisco_mnemonic.keyword':['LOGIN_SUCCESS','LOGOUT','SSH2_USERAUTH','SSH2_SESSION'] } }] } } } }),
        es.count({ index:'firewall-*', body:{ query:{ bool:{ must:[{ range:{ '@timestamp': tr } },{ term:{ 'fgt.type.keyword':'utm' } }] } } } }),
        es.count({ index:'firewall-*', body:{ query:{ bool:{ must:[{ range:{ '@timestamp': tr } },{ term:{ 'fgt.type.keyword':'vpn' } }] } } } }),
        es.search({ index:'firewall-*', body:{ size:0, query:{ range:{ '@timestamp': tr } }, aggs:{ timeline:{ date_histogram:{ field:'@timestamp', fixed_interval: interval, time_zone: SERVER_TZ }, aggs:{ allowed:{ filter:{ term:{ 'fgt.action.keyword':'allow' } } }, denied:{ filter:{ term:{ 'fgt.action.keyword':'deny' } } } } } } } }),
        es.search({ index:'firewall-*', body:{ size:0, query:{ bool:{ must:[{ range:{ '@timestamp': tr } },{ term:{ 'fgt.subtype.keyword':'ips' } }] } }, aggs:{ attacks:{ terms:{ field:'fgt.attack.keyword', size:10 } } } } }),
        es.search({ index:'firewall-*', body:{ size:0, query:{ bool:{ must:[{ range:{ '@timestamp': tr } },{ term:{ 'fgt.action.keyword':'deny' } }] } }, aggs:{ by_src:{ terms:{ field:'fgt.srcip.keyword', size:15 } }, by_country:{ terms:{ field:'fgt.srccountry.keyword', size:20, exclude:['Reserved','private','Private'] } }, reserved_count:{ filter:{ term:{ 'fgt.srccountry.keyword':'Reserved' } } } } } }),
        es.search({ index:'firewall-*', body:{ size:50, sort:[{ '@timestamp':{ order:'desc' } }], query:{ range:{ '@timestamp': tr } }, _source:['@timestamp','syslog_severity_label','fgt.action','fgt.srcip','fgt.dstip','fgt.srccountry','fgt.app','fgt.subtype','fgt.type','fgt.msg','fgt.attack','site_name'] } }),
        es.search({ index:'firewall-*', body:{ size:100, sort:[{ '@timestamp':{ order:'desc' } }], query:{ bool:{ must:[{ range:{ '@timestamp': tr } },{ term:{ 'fgt.type.keyword':'traffic' } }] } }, _source:['@timestamp','fgt.srcip','fgt.srcport','fgt.dstip','fgt.dstport','fgt.proto','fgt.action','fgt.app','fgt.sentbyte','fgt.rcvdbyte','fgt.srccountry','site_name'] } }),
      ])

      return {
        stats:    { total: total.count, denied: denied.count, ips: ips.count, auth: auth.count, utm: utm.count, vpn: vpn.count },
        timeline: timelineR.aggregations?.timeline?.buckets?.map(b => ({ time: b.key_as_string, allowed: b.allowed.doc_count, denied: b.denied.doc_count, total: b.doc_count })) ?? [],
        threats:  threatsR.aggregations?.attacks?.buckets?.map(b => ({ name: b.key, count: b.doc_count })) ?? [],
        denied:   { by_src: deniedR.aggregations?.by_src?.buckets?.map(b => ({ ip: b.key, count: b.doc_count })) ?? [], by_country: deniedR.aggregations?.by_country?.buckets?.map(b => ({ country: b.key, count: b.doc_count })) ?? [], reserved_count: deniedR.aggregations?.reserved_count?.doc_count ?? 0 },
        events:   eventsR.hits.hits.map(h => ({ ...h._source, _index: h._index })),
        sessions: sessionsR.hits.hits.map(h => h._source),
      }
    })
    res.json(data)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

router.get('/soc', async (req, res) => {
  try {
    const es = getESClient()
    const tr = getTimeRange(req)
    const [totalHits, deniedHits, ipsHits, authHits, utmHits, vpnHits] = await Promise.all([
      es.count({ index: 'firewall-*', body: { query: { range: { '@timestamp': tr } } } }),
      es.count({ index: 'firewall-*', body: { query: { bool: { must: [{ range: { '@timestamp': tr } }, { term: { 'fgt.action.keyword': 'deny' } }] } } } }),
      es.count({ index: 'firewall-*', body: { query: { bool: { must: [{ range: { '@timestamp': tr } }, { term: { 'fgt.subtype.keyword': 'ips' } }] } } } }),
      es.count({ index: 'cisco-*', body: { query: { bool: { must: [{ range: { '@timestamp': tr } }, { terms: { 'cisco_mnemonic.keyword': ['LOGIN_SUCCESS','LOGOUT','SSH2_USERAUTH','SSH2_SESSION'] } }] } } } }),
      es.count({ index: 'firewall-*', body: { query: { bool: { must: [{ range: { '@timestamp': tr } }, { term: { 'fgt.type.keyword': 'utm' } }] } } } }),
      es.count({ index: 'firewall-*', body: { query: { bool: { must: [{ range: { '@timestamp': tr } }, { term: { 'fgt.type.keyword': 'vpn' } }] } } } }),
    ])
    res.json({
      total:  totalHits.count,
      denied: deniedHits.count,
      ips:    ipsHits.count,
      auth:   authHits.count,
      utm:    utmHits.count,
      vpn:    vpnHits.count,
    })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

router.get('/home', async (req, res) => {
  const { range = '24h', from: dateFrom, to: dateTo } = req.query
  const cacheKey = `home:overview:${range}:${dateFrom||''}:${dateTo||''}`
  try {
    const data = await withCache(cacheKey, cacheTTL(range), async () => {
      const es = getESClient()
      const tr = dateFrom && dateTo ? { gte: dateFrom, lte: dateTo } : { gte: 'now-' + range }
      const interval = getInterval(range, dateFrom, dateTo)

      const [
        socTotal, socDenied, socIps, socUtm, socVpn,
        nocTotal, nocUpdown, nocMacflap, nocVlan, nocSites,
        edrTotal, edrThreats, edrUsb, edrEndpoints,
        timelineFirewall, timelineCisco, timelineSentinel,
        recentFW, recentCisco,
        ticketStats, alertStats, deviceCount, userCount
      ] = await Promise.all([
        // SOC
        es.count({ index:'firewall-*', body:{ query:{ range:{ '@timestamp': tr } } } }),
        es.count({ index:'firewall-*', body:{ query:{ bool:{ must:[{ range:{ '@timestamp': tr } },{ term:{ 'fgt.action.keyword':'deny' } }] } } } }),
        es.count({ index:'firewall-*', body:{ query:{ bool:{ must:[{ range:{ '@timestamp': tr } },{ term:{ 'fgt.subtype.keyword':'ips' } }] } } } }),
        es.count({ index:'firewall-*', body:{ query:{ bool:{ must:[{ range:{ '@timestamp': tr } },{ term:{ 'fgt.type.keyword':'utm' } }] } } } }),
        es.count({ index:'firewall-*', body:{ query:{ bool:{ must:[{ range:{ '@timestamp': tr } },{ term:{ 'fgt.type.keyword':'vpn' } }] } } } }),
        // NOC
        es.count({ index:'cisco-*', body:{ query:{ range:{ '@timestamp': tr } } } }),
        es.count({ index:'cisco-*', body:{ query:{ bool:{ must:[{ range:{ '@timestamp': tr } },{ term:{ 'cisco_mnemonic.keyword':'UPDOWN' } }] } } } }),
        es.count({ index:'cisco-*', body:{ query:{ bool:{ must:[{ range:{ '@timestamp': tr } },{ term:{ 'cisco_mnemonic.keyword':'MACFLAP_NOTIF' } }] } } } }),
        es.count({ index:'cisco-*', body:{ query:{ bool:{ must:[{ range:{ '@timestamp': tr } },{ term:{ 'cisco_mnemonic.keyword':'NATIVE_VLAN_MISMATCH' } }] } } } }),
        es.search({ index:'cisco-*,firewall-*', body:{ size:0, query:{ range:{ '@timestamp': tr } }, aggs:{ sites:{ terms:{ field:'site_name.keyword', size:10 } } } } }),
        // EDR
        es.count({ index:'sentinel-*', body:{ query:{ range:{ '@timestamp': tr } } } }).catch(() => ({ count: 0 })),
        es.count({ index:'sentinel-*', body:{ query:{ bool:{ must:[{ range:{ '@timestamp': tr } }], must_not:[{ term:{ 'threatId.keyword':'-' } }] } } } }).catch(() => ({ count: 0 })),
        es.count({ index:'sentinel-*', body:{ query:{ bool:{ must:[{ range:{ '@timestamp': tr } },{ term:{ 'data.interface.keyword':'USB' } }] } } } }).catch(() => ({ count: 0 })),
        es.search({ index:'sentinel-*', body:{ size:0, query:{ range:{ '@timestamp': tr } }, aggs:{ endpoints:{ cardinality:{ field:'host.hostname.keyword' } } } } }).catch(() => ({ aggregations: null })),
        // Timeline
        es.search({ index:'firewall-*', body:{ size:0, query:{ range:{ '@timestamp': tr } }, aggs:{ tl:{ date_histogram:{ field:'@timestamp', fixed_interval: interval, time_zone: SERVER_TZ } } } } }),
        es.search({ index:'cisco-*', body:{ size:0, query:{ range:{ '@timestamp': tr } }, aggs:{ tl:{ date_histogram:{ field:'@timestamp', fixed_interval: interval, time_zone: SERVER_TZ } } } } }),
        es.search({ index:'sentinel-*', body:{ size:0, query:{ range:{ '@timestamp': tr } }, aggs:{ tl:{ date_histogram:{ field:'@timestamp', fixed_interval: interval, time_zone: SERVER_TZ } } } } }).catch(() => ({ aggregations: null })),
        // Recent critical events (firewall deny/ips)
        es.search({ index:'firewall-*', body:{ size:20, sort:[{ '@timestamp':{ order:'desc' } }], query:{ bool:{ must:[{ range:{ '@timestamp': tr } }], should:[{ term:{ 'fgt.action.keyword':'deny' } },{ term:{ 'fgt.subtype.keyword':'ips' } }], minimum_should_match:1 } }, _source:['@timestamp','syslog_severity_label','fgt.subtype','fgt.type','fgt.msg','fgt.attack','fgt.srcip','site_name'] } }),
        es.search({ index:'cisco-*', body:{ size:10, sort:[{ '@timestamp':{ order:'desc' } }], query:{ bool:{ must:[{ range:{ '@timestamp': tr } },{ terms:{ 'cisco_mnemonic.keyword':['UPDOWN','MACFLAP_NOTIF','NATIVE_VLAN_MISMATCH'] } }] } }, _source:['@timestamp','cisco_mnemonic','message','site_name'] } }),
        // MongoDB
        Ticket.aggregate([
          { $match: { status: { $in: ['open','in-progress'] } } },
          { $group: { _id: '$severity', count: { $sum: 1 } } }
        ]),
        AlertRule.aggregate([
          { $group: { _id: null, total: { $sum: 1 }, enabled: { $sum: { $cond: ['$enabled', 1, 0] } }, lastFired: { $max: '$lastFired' } } }
        ]),
        Device.countDocuments(),
        User.countDocuments(),
      ])

      // Merge timeline buckets by key_as_string
      const fwBuckets = timelineFirewall.aggregations?.tl?.buckets ?? []
      const ciscoBuckets = timelineCisco.aggregations?.tl?.buckets ?? []
      const sentinelBuckets = timelineSentinel?.aggregations?.tl?.buckets ?? []
      const tlMap = {}
      for (const b of fwBuckets) tlMap[b.key_as_string] = { time: b.key_as_string, firewall: b.doc_count, cisco: 0, sentinel: 0 }
      for (const b of ciscoBuckets) {
        if (tlMap[b.key_as_string]) tlMap[b.key_as_string].cisco = b.doc_count
        else tlMap[b.key_as_string] = { time: b.key_as_string, firewall: 0, cisco: b.doc_count, sentinel: 0 }
      }
      for (const b of sentinelBuckets) {
        if (tlMap[b.key_as_string]) tlMap[b.key_as_string].sentinel = b.doc_count
        else tlMap[b.key_as_string] = { time: b.key_as_string, firewall: 0, cisco: 0, sentinel: b.doc_count }
      }
      const timeline = Object.values(tlMap).sort((a, b) => a.time.localeCompare(b.time))

      // Recent critical events
      const recentCritical = [
        ...recentFW.hits.hits.map(h => ({
          timestamp: h._source['@timestamp'],
          severity: h._source.syslog_severity_label || 'medium',
          type: h._source['fgt.subtype'] === 'ips' ? 'IPS' : 'Firewall',
          message: h._source['fgt.msg'] || h._source['fgt.attack'] || `Deny from ${h._source['fgt.srcip']}`,
          site: h._source.site_name || '',
        })),
        ...recentCisco.hits.hits.map(h => ({
          timestamp: h._source['@timestamp'],
          severity: 'medium',
          type: 'NOC',
          message: h._source.message || h._source.cisco_mnemonic,
          site: h._source.site_name || '',
        })),
      ].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).slice(0, 20)

      // Ticket breakdown
      const ticketMap = { open: 0, critical: 0, high: 0, medium: 0, low: 0 }
      for (const g of ticketStats) {
        const sev = g._id?.toLowerCase()
        if (sev && ticketMap[sev] !== undefined) ticketMap[sev] = g.count
        ticketMap.open += g.count
      }

      const alertRow = alertStats[0] ?? { total: 0, enabled: 0, lastFired: null }

      return {
        soc: { total: socTotal.count, denied: socDenied.count, ips: socIps.count, utm: socUtm.count, vpn: socVpn.count },
        noc: { total: nocTotal.count, updown: nocUpdown.count, macflap: nocMacflap.count, vlanmismatch: nocVlan.count, sites: nocSites.aggregations?.sites?.buckets ?? [] },
        edr: { total: edrTotal.count, threats: edrThreats.count, usb_events: edrUsb.count, endpoints: edrEndpoints.aggregations?.endpoints?.value ?? 0 },
        tickets: ticketMap,
        alerts: { total: alertRow.total, enabled: alertRow.enabled, lastFired: alertRow.lastFired },
        devices: deviceCount,
        users: userCount,
        timeline,
        recentCritical,
      }
    })
    res.json(data)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

router.get('/noc', async (req, res) => {
  try {
    const es = getESClient()
    const tr = getTimeRange(req)
    const [total, updown, macflap, vlanmismatch, sites] = await Promise.all([
      es.count({ index: 'cisco-*', body: { query: { range: { '@timestamp': tr } } } }),
      es.count({ index: 'cisco-*', body: { query: { bool: { must: [{ range: { '@timestamp': tr } }, { term: { 'cisco_mnemonic.keyword': 'UPDOWN' } }] } } } }),
      es.count({ index: 'cisco-*', body: { query: { bool: { must: [{ range: { '@timestamp': tr } }, { term: { 'cisco_mnemonic.keyword': 'MACFLAP_NOTIF' } }] } } } }),
      es.count({ index: 'cisco-*', body: { query: { bool: { must: [{ range: { '@timestamp': tr } }, { term: { 'cisco_mnemonic.keyword': 'NATIVE_VLAN_MISMATCH' } }] } } } }),
      es.search({ index: 'cisco-*,firewall-*', body: { size: 0, query: { range: { '@timestamp': tr } }, aggs: { sites: { terms: { field: 'site_name.keyword', size: 10 } } } } }),
    ])
    res.json({
      total:        total.count,
      updown:       updown.count,
      macflap:      macflap.count,
      vlanmismatch: vlanmismatch.count,
      sites:        sites.aggregations?.sites?.buckets ?? [],
    })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

export default router
