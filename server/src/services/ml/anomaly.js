import { getESClient } from '../../config/elasticsearch.js'
import AIBaseline from '../../models/AIBaseline.js'
import AIAnomaly from '../../models/AIAnomaly.js'
import { METRICS } from './baseline.js'

function resolveDateInput(input, fallbackDate = new Date()) {
  if (!input) return fallbackDate
  if (input instanceof Date) return input

  const value = String(input).trim()
  if (value === 'now') return new Date()

  const match = value.match(/^now-(\d+)([smhdw])$/i)
  if (match) {
    const amount = Number(match[1])
    const unit = match[2].toLowerCase()
    const multipliers = {
      s: 1000,
      m: 60 * 1000,
      h: 60 * 60 * 1000,
      d: 24 * 60 * 60 * 1000,
      w: 7 * 24 * 60 * 60 * 1000,
    }
    return new Date(Date.now() - (amount * multipliers[unit]))
  }

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid date value: ${value}`)
  }
  return parsed
}

// Get current value for a metric in a time window
async function getCurrentMetricValue(metric, from, to) {
  const es = getESClient()
  try {
    const result = await es.count({
      index: metric.index,
      body: {
        query: metric.query(
          from instanceof Date ? from.toISOString() : from,
          to instanceof Date ? to.toISOString() : to
        )
      }
    })
    return result.count
  } catch (err) {
    console.error(`Error getting current value for ${metric.name}:`, err.message)
    return null
  }
}

// Get baseline for specific time
async function getBaselineForTime(metricName, time) {
  const d = new Date(time)
  const hour = d.getUTCHours()
  const dayOfWeek = d.getUTCDay()

  return AIBaseline.findOne({
    metric: metricName,
    hour,
    dayOfWeek
  }).lean()
}

// Calculate anomaly severity based on deviation
function getSeverity(deviationSigma) {
  if (deviationSigma >= 4.0) return 'critical'
  if (deviationSigma >= 2.5) return 'high'
  if (deviationSigma >= 1.5) return 'medium'
  return 'low'
}

// Generate human readable description
function generateDescription(metricName, current, baseline) {
  const pctAbove = baseline.mean > 0
    ? Math.round(((current - baseline.mean) / baseline.mean) * 100)
    : 0

  const descriptions = {
    firewall_denied: `Denied connections ${pctAbove > 0 ? pctAbove + '% above' : Math.abs(pctAbove) + '% below'} normal (current: ${current.toLocaleString()}, normal: ${baseline.mean.toLocaleString()})`,
    firewall_ips: `IPS alerts ${pctAbove > 0 ? pctAbove + '% above' : Math.abs(pctAbove) + '% below'} normal (current: ${current.toLocaleString()}, normal: ${baseline.mean.toLocaleString()})`,
    firewall_total: `Total firewall events ${pctAbove > 0 ? pctAbove + '% above' : Math.abs(pctAbove) + '% below'} normal`,
    cisco_macflap: `MAC flapping events ${pctAbove > 0 ? pctAbove + '% above' : Math.abs(pctAbove) + '% below'} normal (current: ${current.toLocaleString()}, normal: ${baseline.mean.toLocaleString()})`,
    cisco_updown: `Interface up/down events ${pctAbove > 0 ? pctAbove + '% above' : Math.abs(pctAbove) + '% below'} normal`,
    cisco_total: `Cisco switch events ${pctAbove > 0 ? pctAbove + '% above' : Math.abs(pctAbove) + '% below'} normal`,
    sentinel_total: `EDR endpoint events ${pctAbove > 0 ? pctAbove + '% above' : Math.abs(pctAbove) + '% below'} normal`
  }

  return descriptions[metricName] || `${metricName}: ${current} (baseline: ${baseline.mean})`
}

// Generate recommendation based on metric and severity
function generateRecommendation(metricName, severity, deviation) {
  const recs = {
    firewall_denied: {
      critical: 'Immediate investigation required - possible DDoS or mass scanning. Check top source IPs and consider rate limiting.',
      high: 'Review top denied source IPs. Check for port scanning or brute force attempts.',
      medium: 'Monitor closely. Review firewall logs for unusual patterns.',
      low: 'Minor deviation - continue monitoring.'
    },
    firewall_ips: {
      critical: 'Critical threat activity detected. Isolate affected systems and escalate to security team immediately.',
      high: 'Multiple attack attempts detected. Review IPS alerts and block top attacking IPs.',
      medium: 'Elevated attack activity. Review IPS signatures triggering.',
      low: 'Slightly elevated - monitor IPS dashboard.'
    },
    cisco_macflap: {
      critical: 'Possible network loop detected. Check spanning tree configuration immediately.',
      high: 'Significant MAC flapping - investigate switch ports and check for loops.',
      medium: 'MAC instability detected. Review switch logs for affected VLANs.',
      low: 'Minor MAC flapping - normal for some network changes.'
    },
    cisco_updown: {
      critical: 'Mass interface outages detected. Check physical infrastructure and power.',
      high: 'Multiple interface changes - possible hardware issue or misconfiguration.',
      medium: 'Elevated interface changes - review NOC dashboard.',
      low: 'Minor interface activity - possibly planned maintenance.'
    },
    sentinel_total: {
      critical: 'Unusual endpoint activity surge. Check for malware outbreak.',
      high: 'Elevated endpoint events. Review EDR dashboard for threats.',
      medium: 'Above normal endpoint activity. Monitor closely.',
      low: 'Slightly elevated endpoint events.'
    }
  }

  return recs[metricName]?.[severity] || `Investigate ${metricName} anomaly - ${deviation.toFixed(1)} standard deviations above baseline.`
}

// Main anomaly detection function
async function detectAnomalies({
  dateRange = null,
  sensitivity = 2.0,
  sources = ['firewall', 'cisco', 'zabbix'],
  triggeredBy = 'manual'
}) {
  const startTime = Date.now()

  // Determine time range
  const to = resolveDateInput(dateRange?.to, new Date())
  const from = dateRange?.from
    ? resolveDateInput(dateRange.from, new Date(to.getTime() - 3600000))
    : new Date(to.getTime() - 3600000) // default last 1 hour

  const anomalies = []
  let totalChecked = 0

  // Filter metrics by sources
  const metricsToCheck = METRICS.filter(m => {
    if (sources.includes('firewall') && m.name.startsWith('firewall')) return true
    if (sources.includes('cisco') && m.name.startsWith('cisco')) return true
    if (sources.includes('sentinel') && m.name.startsWith('sentinel')) return true
    return false
  })

  for (const metric of metricsToCheck) {
    try {
      // Get current value
      const current = await getCurrentMetricValue(metric, from, to)
      if (current === null) continue

      totalChecked++

      // Get baseline for this time slot
      const baseline = await getBaselineForTime(metric.name, from)
      if (!baseline || baseline.samples < 2) {
        continue // Skip if no baseline yet
      }

      // Skip if stddev is 0 (constant metric)
      if (baseline.stddev === 0) continue

      // Calculate deviation in standard deviations (sigma)
      const deviation = (current - baseline.mean) / baseline.stddev

      // Only flag if above sensitivity threshold and current > baseline
      // (we care about spikes, not drops, for security metrics)
      if (deviation >= sensitivity) {
        const severity = getSeverity(deviation)

        anomalies.push({
          metric: metric.name,
          current,
          baseline: baseline.mean,
          baselineStddev: baseline.stddev,
          deviation: Math.round(deviation * 100) / 100,
          severity,
          description: generateDescription(metric.name, current, baseline),
          recommendation: generateRecommendation(metric.name, severity, deviation),
          timeSlot: {
            hour: baseline.hour,
            dayOfWeek: baseline.dayOfWeek
          },
          userFeedback: null,
          aiReviewed: false,
          aiConclusion: null
        })
      }
    } catch (err) {
      console.error(`Anomaly check failed for ${metric.name}:`, err.message)
    }
  }

  const executionTimeMs = Date.now() - startTime

  // Save anomaly run to MongoDB
  const saved = await AIAnomaly.create({
    rangeFrom: from,
    rangeTo: to,
    sensitivity,
    sources,
    triggeredBy,
    anomalies,
    totalChecked,
    executionTimeMs
  })

  return {
    id: saved._id,
    runAt: saved.runAt,
    rangeFrom: from,
    rangeTo: to,
    sensitivity,
    sources,
    triggeredBy,
    anomalies,
    totalChecked,
    totalAnomalies: anomalies.length,
    executionTimeMs
  }
}

// Get anomaly history
async function getAnomalyHistory(limit = 20) {
  return AIAnomaly.find()
    .sort({ runAt: -1 })
    .limit(limit)
    .lean()
}

// Get single anomaly run
async function getAnomalyRun(id) {
  return AIAnomaly.findById(id).lean()
}

// Save user feedback on an anomaly
async function saveAnomalyFeedback(runId, anomalyIndex, feedback) {
  const run = await AIAnomaly.findById(runId)
  if (!run) throw new Error('Anomaly run not found')
  if (!run.anomalies[anomalyIndex]) throw new Error('Anomaly index not found')

  run.anomalies[anomalyIndex].userFeedback = feedback
  await run.save()
  return run
}

export {
  detectAnomalies,
  getAnomalyHistory,
  getAnomalyRun,
  saveAnomalyFeedback
}
