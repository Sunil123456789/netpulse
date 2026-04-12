import { Router } from 'express'
import { getESClient } from '../config/elasticsearch.js'

const router = Router()
const SERVER_TZ = process.env.TZ || 'UTC'

function getTimeRange(req) {
  const range = req.query.range || '24h'
  const dateFrom = req.query.from
  const dateTo = req.query.to
  return dateFrom && dateTo ? { gte: dateFrom, lte: dateTo } : { gte: 'now-' + range }
}

function getInterval(req) {
  const { from, to, range } = req.query
  if (from && to) {
    const ms = new Date(to) - new Date(from)
    if (ms <= 3_600_000)    return '1m'
    if (ms <= 21_600_000)   return '5m'
    if (ms <= 86_400_000)   return '30m'
    if (ms <= 604_800_000)  return '2h'
    return '6h'
  }
  const map = { '15m':'1m','1h':'1m','6h':'5m','12h':'15m','24h':'1h','3d':'2h','7d':'6h','30d':'12h' }
  return map[range] || '1h'
}

// GET /api/edr/stats
router.get('/stats', async (req, res) => {
  try {
    const es = getESClient()
    const tr = getTimeRange(req)

    const [total, threats, usb, sitesR, devicesR, endpointsR, usersR] = await Promise.all([
      es.count({ index: 'sentinel-*', body: { query: { range: { '@timestamp': tr } } } }),
      es.count({ index: 'sentinel-*', body: { query: { bool: { must: [{ range: { '@timestamp': tr } }], must_not: [{ term: { 'threatId.keyword': '-' } }] } } } }),
      es.count({ index: 'sentinel-*', body: { query: { bool: { must: [{ range: { '@timestamp': tr } }, { term: { 'data.interface.keyword': 'USB' } }] } } } }),
      es.search({ index: 'sentinel-*', body: { size: 0, query: { range: { '@timestamp': tr } }, aggs: { v: { cardinality: { field: 'site_name.keyword' } } } } }),
      es.search({ index: 'sentinel-*', body: { size: 0, query: { range: { '@timestamp': tr } }, aggs: { v: { cardinality: { field: 'data.computerName.keyword' } } } } }),
      es.search({ index: 'sentinel-*', body: { size: 0, query: { range: { '@timestamp': tr } }, aggs: { v: { cardinality: { field: 'host.name.keyword' } } } } }),
      es.search({ index: 'sentinel-*', body: { size: 0, query: { range: { '@timestamp': tr } }, aggs: { v: { cardinality: { field: 'data.lastLoggedInUserName.keyword' } } } } }),
    ])

    res.json({
      total:      total.count,
      threats:    threats.count,
      usb_events: usb.count,
      sites:      sitesR.aggregations?.v?.value    ?? 0,
      devices:    devicesR.aggregations?.v?.value  ?? 0,
      endpoints:  endpointsR.aggregations?.v?.value ?? 0,
      users:      usersR.aggregations?.v?.value    ?? 0,
    })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// GET /api/edr/timeline
router.get('/timeline', async (req, res) => {
  try {
    const es = getESClient()
    const tr = getTimeRange(req)
    const interval = getInterval(req)

    const result = await es.search({
      index: 'sentinel-*',
      body: {
        size: 0,
        query: { range: { '@timestamp': tr } },
        aggs: {
          timeline: {
            date_histogram: { field: '@timestamp', fixed_interval: interval, time_zone: SERVER_TZ },
            aggs: {
              threats:        { filter: { bool: { must_not: [{ term: { 'threatId.keyword': '-' } }] } } },
              usb:            { filter: { term: { 'data.interface.keyword': 'USB' } } },
              usb_connect:    { filter: { bool: { must: [{ term: { 'data.interface.keyword': 'USB' } }, { term: { 'event.action.keyword': 'connected' } }] } } },
              usb_disconnect: { filter: { bool: { must: [{ term: { 'data.interface.keyword': 'USB' } }, { term: { 'event.action.keyword': 'disconnected' } }] } } },
            },
          },
        },
      },
    })

    res.json(result.aggregations?.timeline?.buckets?.map(b => ({
      time:           b.key_as_string,
      total:          b.doc_count,
      threats:        b.threats.doc_count,
      usb:            b.usb.doc_count,
      usb_connect:    b.usb_connect.doc_count,
      usb_disconnect: b.usb_disconnect.doc_count,
    })) ?? [])
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// GET /api/edr/events/recent
router.get('/events/recent', async (req, res) => {
  try {
    const es = getESClient()
    const tr = getTimeRange(req)
    const size = Math.min(parseInt(req.query.size) || 100, 500)

    const result = await es.search({
      index: 'sentinel-*',
      body: {
        size,
        sort: [{ '@timestamp': { order: 'desc' } }],
        query: { range: { '@timestamp': tr } },
        _source: [
          '@timestamp', 'data.computerName', 'data.eventType', 'data.interface',
          'data.deviceName', 'data.lastLoggedInUserName', 'data.vendorId', 'data.productId',
          'data.osType', 'data.ipAddress', 'event.action', 'event_message',
          'site_name', 'activityType', 'threatId', 'host.name', 'host.ip',
          'description', 'secondaryDescription', 'groupName',
        ],
      },
    })

    res.json(result.hits.hits.map(h => ({ ...h._source, _id: h._id })))
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// GET /api/edr/top/endpoints
router.get('/top/endpoints', async (req, res) => {
  try {
    const es = getESClient()
    const tr = getTimeRange(req)

    const result = await es.search({
      index: 'sentinel-*',
      body: {
        size: 0,
        query: { range: { '@timestamp': tr } },
        aggs: {
          by_endpoint: {
            terms: { field: 'data.computerName.keyword', size: 50 },
            aggs: {
              last_seen:    { max: { field: '@timestamp' } },
              threat_count: { filter: { bool: { must_not: [{ term: { 'threatId.keyword': '-' } }] } } },
              last_detail:  {
                top_hits: {
                  size: 1,
                  sort: [{ '@timestamp': { order: 'desc' } }],
                  _source: ['host.ip', 'data.osType', 'data.lastLoggedInUserName', 'site_name'],
                },
              },
            },
          },
        },
      },
    })

    res.json(result.aggregations?.by_endpoint?.buckets?.map(b => {
      const src = b.last_detail?.hits?.hits?.[0]?._source || {}
      return {
        endpoint: b.key,
        count:    b.doc_count,
        threats:  b.threat_count.doc_count,
        lastSeen: b.last_seen.value_as_string,
        ip:       src['host.ip']                     || src.host?.ip                    || '',
        osType:   src['data.osType']                 || src.data?.osType                || '',
        lastUser: src['data.lastLoggedInUserName']   || src.data?.lastLoggedInUserName   || '',
        site:     src.site_name                      || '',
      }
    }) ?? [])
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// GET /api/edr/top/devices
router.get('/top/devices', async (req, res) => {
  try {
    const es = getESClient()
    const tr = getTimeRange(req)

    const result = await es.search({
      index: 'sentinel-*',
      body: {
        size: 0,
        query: { bool: { must: [{ range: { '@timestamp': tr } }, { term: { 'data.interface.keyword': 'USB' } }] } },
        aggs: {
          by_device: {
            terms: { field: 'data.deviceName.keyword', size: 20, missing: 'Unknown Device' },
            aggs: {
              connect:    { filter: { term: { 'event.action.keyword': 'connected' } } },
              disconnect: { filter: { term: { 'event.action.keyword': 'disconnected' } } },
            },
          },
        },
      },
    })

    res.json(result.aggregations?.by_device?.buckets?.map(b => ({
      device:     b.key,
      count:      b.doc_count,
      connect:    b.connect.doc_count,
      disconnect: b.disconnect.doc_count,
    })) ?? [])
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// GET /api/edr/top/users
router.get('/top/users', async (req, res) => {
  try {
    const es = getESClient()
    const tr = getTimeRange(req)

    const result = await es.search({
      index: 'sentinel-*',
      body: {
        size: 0,
        query: { range: { '@timestamp': tr } },
        aggs: {
          by_user: {
            terms: { field: 'data.lastLoggedInUserName.keyword', size: 20, exclude: ['-', 'N/A', 'n/a', ''] },
          },
        },
      },
    })

    res.json(result.aggregations?.by_user?.buckets?.map(b => ({
      user:  b.key,
      count: b.doc_count,
    })) ?? [])
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// GET /api/edr/activity/types
router.get('/activity/types', async (req, res) => {
  try {
    const es = getESClient()
    const tr = getTimeRange(req)

    const result = await es.search({
      index: 'sentinel-*',
      body: {
        size: 0,
        query: { range: { '@timestamp': tr } },
        aggs: {
          by_action:   { terms: { field: 'event.action.keyword',  size: 20 } },
          by_activity: { terms: { field: 'activityType.keyword',  size: 20 } },
          by_interface:{ terms: { field: 'data.interface.keyword', size: 10 } },
        },
      },
    })

    res.json({
      by_action:    result.aggregations?.by_action?.buckets?.map(b    => ({ action: b.key, count: b.doc_count })) ?? [],
      by_activity:  result.aggregations?.by_activity?.buckets?.map(b  => ({ action: b.key, count: b.doc_count })) ?? [],
      by_interface: result.aggregations?.by_interface?.buckets?.map(b => ({ action: b.key, count: b.doc_count })) ?? [],
    })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// GET /api/edr/sites
router.get('/sites', async (req, res) => {
  try {
    const es = getESClient()
    const tr = getTimeRange(req)

    const result = await es.search({
      index: 'sentinel-*',
      body: {
        size: 0,
        query: { range: { '@timestamp': tr } },
        aggs: {
          by_site: {
            terms: { field: 'site_name.keyword', size: 20 },
            aggs: {
              threats:   { filter: { bool: { must_not: [{ term: { 'threatId.keyword': '-' } }] } } },
              usb:       { filter: { term: { 'data.interface.keyword': 'USB' } } },
              endpoints: { cardinality: { field: 'data.computerName.keyword' } },
              users:     { cardinality: { field: 'data.lastLoggedInUserName.keyword' } },
            },
          },
        },
      },
    })

    res.json(result.aggregations?.by_site?.buckets?.map(b => ({
      site:      b.key,
      count:     b.doc_count,
      threats:   b.threats.doc_count,
      usb:       b.usb.doc_count,
      endpoints: b.endpoints.value,
      users:     b.users.value,
    })) ?? [])
  } catch (err) { res.status(500).json({ error: err.message }) }
})

export default router
