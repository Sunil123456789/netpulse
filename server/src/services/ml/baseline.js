import { getESClient } from '../../config/elasticsearch.js'
import AIBaseline from '../../models/AIBaseline.js'
import {
  completeExecutionLog,
  failExecutionLog,
  startExecutionLog,
} from '../ai/executionTracking.js'

const METRICS = [
  {
    name: 'firewall_denied',
    index: 'firewall-*',
    query: (gte, lte) => ({ bool: { must: [
      { range: { '@timestamp': { gte, lte } } },
      { term: { 'fgt.action.keyword': 'deny' } }
    ]}}),
    description: 'Denied firewall connections per hour'
  },
  {
    name: 'firewall_ips',
    index: 'firewall-*',
    query: (gte, lte) => ({ bool: { must: [
      { range: { '@timestamp': { gte, lte } } },
      { term: { 'fgt.subtype.keyword': 'ips' } }
    ]}}),
    description: 'IPS alerts per hour'
  },
  {
    name: 'firewall_total',
    index: 'firewall-*',
    query: (gte, lte) => ({ range: { '@timestamp': { gte, lte } } }),
    description: 'Total firewall events per hour'
  },
  {
    name: 'cisco_macflap',
    index: 'cisco-*',
    query: (gte, lte) => ({ bool: { must: [
      { range: { '@timestamp': { gte, lte } } },
      { term: { 'cisco_mnemonic.keyword': 'MACFLAP_NOTIF' } }
    ]}}),
    description: 'MAC flapping events per hour'
  },
  {
    name: 'cisco_updown',
    index: 'cisco-*',
    query: (gte, lte) => ({ bool: { must: [
      { range: { '@timestamp': { gte, lte } } },
      { term: { 'cisco_mnemonic.keyword': 'UPDOWN' } }
    ]}}),
    description: 'Interface up/down events per hour'
  },
  {
    name: 'cisco_total',
    index: 'cisco-*',
    query: (gte, lte) => ({ range: { '@timestamp': { gte, lte } } }),
    description: 'Total Cisco switch events per hour'
  },
  {
    name: 'sentinel_total',
    index: 'sentinel-*',
    query: (gte, lte) => ({ range: { '@timestamp': { gte, lte } } }),
    description: 'Total SentinelOne EDR events per hour'
  }
]

// Calculate mean of array
function mean(arr) {
  if (!arr.length) return 0
  return arr.reduce((a, b) => a + b, 0) / arr.length
}

// Calculate standard deviation
function stddev(arr, avg) {
  if (arr.length < 2) return 0
  const m = avg !== undefined ? avg : mean(arr)
  const variance = arr.reduce((sum, val) => sum + Math.pow(val - m, 2), 0) / arr.length
  return Math.sqrt(variance)
}

// Get hourly counts for a metric over a time period
async function getHourlyCounts(metric, daysBack = 7) {
  const es = getESClient()
  const now = Date.now()
  const fromTs = now - (daysBack * 24 * 60 * 60 * 1000)

  try {
    const result = await es.search({
      index: metric.index,
      body: {
        size: 0,
        query: metric.query(
          new Date(fromTs).toISOString(),
          new Date(now).toISOString()
        ),
        aggs: {
          hourly: {
            date_histogram: {
              field: '@timestamp',
              fixed_interval: '1h',
              min_doc_count: 0
            }
          }
        }
      }
    })

    return result.aggregations?.hourly?.buckets?.map(b => ({
      timestamp: new Date(b.key),
      count: b.doc_count,
      hour: new Date(b.key).getUTCHours(),
      dayOfWeek: new Date(b.key).getUTCDay()
    })) || []
  } catch (err) {
    console.error(`Failed to get counts for ${metric.name}:`, err.message)
    return []
  }
}

// Build baseline for a single metric
async function buildMetricBaseline(metric, daysBack = 7) {
  const buckets = await getHourlyCounts(metric, daysBack)

  if (buckets.length < 3) {
    return { metric: metric.name, slotsBuilt: 0, reason: 'insufficient data' }
  }

  // Group by hour + dayOfWeek
  const slots = {}
  for (const b of buckets) {
    const key = `${b.dayOfWeek}_${b.hour}`
    if (!slots[key]) slots[key] = []
    slots[key].push(b.count)
  }

  // Calculate stats per slot and save to MongoDB
  let slotsBuilt = 0
  for (const [key, counts] of Object.entries(slots)) {
    if (counts.length < 1) continue

    const [dayOfWeek, hour] = key.split('_').map(Number)
    const avg = mean(counts)
    const sd = stddev(counts, avg)

    await AIBaseline.findOneAndUpdate(
      { metric: metric.name, hour, dayOfWeek },
      {
        metric: metric.name,
        hour,
        dayOfWeek,
        mean: Math.round(avg),
        stddev: Math.round(sd),
        min: Math.min(...counts),
        max: Math.max(...counts),
        samples: counts.length,
        updatedAt: new Date()
      },
      { upsert: true, new: true }
    )
    slotsBuilt++
  }

  return {
    metric: metric.name,
    slotsBuilt,
    totalBuckets: buckets.length,
    daysBack
  }
}

// Build baselines for ALL metrics
async function buildAllBaselines(daysBack = 7, { trigger = 'http' } = {}) {
  const startTime = Date.now()
  const execution = await startExecutionLog({
    taskKey: 'ml.baseline.build',
    domain: 'ml',
    trigger,
    requestLabel: 'all metrics',
  })

  try {
    const results = []
    for (const metric of METRICS) {
      try {
        const result = await buildMetricBaseline(metric, daysBack)
        results.push({ ...result, status: 'success' })
        console.log(`Baseline built: ${metric.name} - ${result.slotsBuilt} slots`)
      } catch (err) {
        results.push({ metric: metric.name, status: 'failed', error: err.message })
        console.error(`Baseline failed: ${metric.name}:`, err.message)
      }
    }

    await completeExecutionLog(execution._id, {
      result: {
        provider: null,
        model: null,
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        billingMode: 'internal',
        responseTimeMs: Date.now() - startTime,
      },
      durationMs: Date.now() - startTime,
    })

    return results
  } catch (err) {
    await failExecutionLog(execution._id, err, {
      durationMs: Date.now() - startTime,
      result: {
        provider: null,
        model: null,
        billingMode: 'internal',
      },
    })
    throw err
  }
}

// Build baseline for specific metric
async function buildBaseline(metricName, daysBack = 7, { trigger = 'http' } = {}) {
  const startTime = Date.now()
  const execution = await startExecutionLog({
    taskKey: 'ml.baseline.build',
    domain: 'ml',
    trigger,
    requestLabel: metricName,
  })

  try {
    const metric = METRICS.find(m => m.name === metricName)
    if (!metric) throw new Error(`Unknown metric: ${metricName}`)
    const result = await buildMetricBaseline(metric, daysBack)

    await completeExecutionLog(execution._id, {
      result: {
        provider: null,
        model: null,
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        billingMode: 'internal',
        responseTimeMs: Date.now() - startTime,
      },
      durationMs: Date.now() - startTime,
    })

    return result
  } catch (err) {
    await failExecutionLog(execution._id, err, {
      durationMs: Date.now() - startTime,
      result: {
        provider: null,
        model: null,
        billingMode: 'internal',
      },
    })
    throw err
  }
}

// Get current value for a metric (last 1 hour)
async function getCurrentValue(metric) {
  const es = getESClient()
  const now = Date.now()
  const oneHourAgo = now - 3600000

  try {
    const result = await es.count({
      index: metric.index,
      body: {
        query: metric.query(
          new Date(oneHourAgo).toISOString(),
          new Date(now).toISOString()
        )
      }
    })
    return result.count
  } catch {
    return null
  }
}

// Get baseline status - summary of all baselines
async function getBaselineStatus() {
  const status = []

  for (const metric of METRICS) {
    const count = await AIBaseline.countDocuments({ metric: metric.name })
    const latest = await AIBaseline.findOne({ metric: metric.name })
      .sort({ updatedAt: -1 })
      .lean()

    status.push({
      metric: metric.name,
      description: metric.description,
      slotsLearned: count,
      totalPossibleSlots: 168, // 24 hours x 7 days
      completeness: Math.round((count / 168) * 100),
      lastUpdated: latest?.updatedAt || null,
      ready: count >= 24 // need at least 24 slots to be useful
    })
  }

  return status
}

export {
  buildBaseline,
  buildAllBaselines,
  getCurrentValue,
  getBaselineStatus,
  METRICS
}
