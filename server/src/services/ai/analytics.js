import AIExecutionLog from '../../models/AIExecutionLog.js'
import AIScore from '../../models/AIScore.js'

const TASK_LABELS = {
  'ai.chat': 'Chat',
  'ai.triage': 'Triage',
  'ai.search': 'Search',
  'ai.brief': 'Brief',
  'ai.comparison': 'Model Comparison',
  'ml.improvement': 'ML Improvement',
  'ml.anomaly.detect': 'Anomaly Detection',
  'ml.baseline.build': 'Baseline Build',
  'ml.threat.port-scan': 'Port Scan',
  'ml.threat.brute-force': 'Brute Force',
  'ml.threat.geo': 'Geo Anomaly',
  'ml.threat.all': 'Threat Sweep',
}

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

function round(value, precision = 1) {
  const factor = 10 ** precision
  return Math.round(Number(value || 0) * factor) / factor
}

function normalizeFilterValue(value) {
  const text = String(value || '').trim()
  if (!text || text === 'all') return null
  return text
}

function getRangeDates({ from = null, to = null } = {}) {
  const toDate = resolveDateInput(to, new Date())
  const fromDate = resolveDateInput(from, new Date(toDate.getTime() - (24 * 60 * 60 * 1000)))
  return { fromDate, toDate }
}

function buildMatchFilter({
  from = null,
  to = null,
  task = null,
  provider = null,
  model = null,
  status = null,
  trigger = null,
} = {}) {
  const { fromDate, toDate } = getRangeDates({ from, to })

  return {
    startedAt: {
      $gte: fromDate,
      $lte: toDate,
    },
    ...(normalizeFilterValue(task) && { taskKey: normalizeFilterValue(task) }),
    ...(normalizeFilterValue(provider) && { provider: normalizeFilterValue(provider) }),
    ...(normalizeFilterValue(model) && { model: normalizeFilterValue(model) }),
    ...(normalizeFilterValue(status) && { status: normalizeFilterValue(status) }),
    ...(normalizeFilterValue(trigger) && { trigger: normalizeFilterValue(trigger) }),
  }
}

function summarizeRows(rows = [], keyFields = []) {
  const map = new Map()

  for (const row of rows) {
    const key = keyFields.map(field => row[field] ?? '').join('::')
    const existing = map.get(key) || {
      ...Object.fromEntries(keyFields.map(field => [field, row[field] ?? null])),
      totalRuns: 0,
      successfulRuns: 0,
      failedRuns: 0,
      canceledRuns: 0,
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      estimatedCostUsd: 0,
      totalDurationMs: 0,
      lastRunAt: null,
    }

    existing.totalRuns += 1
    if (row.status === 'success') existing.successfulRuns += 1
    if (row.status === 'failed') existing.failedRuns += 1
    if (row.status === 'canceled') existing.canceledRuns += 1
    existing.promptTokens += Number(row.promptTokens || 0)
    existing.completionTokens += Number(row.completionTokens || 0)
    existing.totalTokens += Number(row.totalTokens || 0)
    existing.estimatedCostUsd += Number(row.estimatedCostUsd || 0)
    existing.totalDurationMs += Number(row.durationMs || 0)

    if (!existing.lastRunAt || new Date(row.startedAt) > new Date(existing.lastRunAt)) {
      existing.lastRunAt = row.startedAt
    }

    map.set(key, existing)
  }

  return Array.from(map.values()).map(row => ({
    ...row,
    avgDurationMs: row.totalRuns > 0 ? Math.round(row.totalDurationMs / row.totalRuns) : 0,
  }))
}

function buildTrendRows(rows = [], fromDate, toDate) {
  const spanMs = Math.max(0, toDate.getTime() - fromDate.getTime())
  const bucketMs = spanMs <= 48 * 60 * 60 * 1000 ? 60 * 60 * 1000 : 24 * 60 * 60 * 1000
  const bucketType = bucketMs === 60 * 60 * 1000 ? 'hour' : 'day'
  const buckets = []

  const start = new Date(fromDate)
  if (bucketType === 'hour') start.setMinutes(0, 0, 0)
  else start.setHours(0, 0, 0, 0)

  for (let bucketStart = start.getTime(); bucketStart <= toDate.getTime(); bucketStart += bucketMs) {
    buckets.push({
      bucketStart: new Date(bucketStart).toISOString(),
      totalRuns: 0,
      totalTokens: 0,
      estimatedCostUsd: 0,
      totalDurationMs: 0,
    })
  }

  for (const row of rows) {
    const startedAt = new Date(row.startedAt).getTime()
    const index = Math.max(0, Math.min(
      buckets.length - 1,
      Math.floor((startedAt - start.getTime()) / bucketMs)
    ))
    const bucket = buckets[index]
    if (!bucket) continue
    bucket.totalRuns += 1
    bucket.totalTokens += Number(row.totalTokens || 0)
    bucket.estimatedCostUsd += Number(row.estimatedCostUsd || 0)
    bucket.totalDurationMs += Number(row.durationMs || 0)
  }

  return {
    bucketType,
    rows: buckets.map(bucket => ({
      bucketStart: bucket.bucketStart,
      totalRuns: bucket.totalRuns,
      totalTokens: bucket.totalTokens,
      estimatedCostUsd: round(bucket.estimatedCostUsd, 4),
      avgDurationMs: bucket.totalRuns > 0 ? Math.round(bucket.totalDurationMs / bucket.totalRuns) : 0,
    })),
  }
}

function sortSummaryRows(rows = [], primaryKey = 'totalTokens') {
  return rows.sort((left, right) => {
    const primaryDiff = Number(right[primaryKey] || 0) - Number(left[primaryKey] || 0)
    if (primaryDiff !== 0) return primaryDiff
    return Number(right.totalRuns || 0) - Number(left.totalRuns || 0)
  })
}

function decorateTaskRows(rows = []) {
  return rows.map(row => ({
    ...row,
    label: TASK_LABELS[row.taskKey] || row.taskKey,
  }))
}

async function getTrackingStartedAt() {
  const firstLog = await AIExecutionLog.findOne()
    .sort({ startedAt: 1 })
    .select('startedAt')
    .lean()

  return firstLog?.startedAt || null
}

async function getLegacySummary({ fromDate, toDate, trackingStartedAt }) {
  if (!trackingStartedAt || fromDate >= trackingStartedAt) return null

  const match = {
    createdAt: {
      $gte: fromDate,
      $lt: new Date(Math.min(toDate.getTime(), new Date(trackingStartedAt).getTime())),
    },
  }

  const [summary] = await AIScore.aggregate([
    { $match: match },
    { $group: {
      _id: null,
      totalRuns: { $sum: 1 },
      totalTokens: { $sum: '$tokensUsed' },
      avgResponseTimeMs: { $avg: '$responseTimeMs' },
    } },
  ])

  if (!summary) return null

  return {
    totalRuns: summary.totalRuns || 0,
    totalTokens: summary.totalTokens || 0,
    avgResponseTimeMs: Math.round(summary.avgResponseTimeMs || 0),
  }
}

async function getAnalyticsOverview({ from = null, to = null } = {}) {
  const { fromDate, toDate } = getRangeDates({ from, to })
  const rows = await AIExecutionLog.find(buildMatchFilter({ from, to }))
    .sort({ startedAt: -1 })
    .lean()

  const trackingStartedAt = await getTrackingStartedAt()
  const modelRows = sortSummaryRows(summarizeRows(rows, ['provider', 'model']))
    .filter(row => row.provider || row.model)
    .map(row => ({
      ...row,
      estimatedCostUsd: round(row.estimatedCostUsd, 4),
    }))
  const taskRows = sortSummaryRows(decorateTaskRows(summarizeRows(rows, ['taskKey', 'domain'])), 'totalRuns')
    .map(row => ({
      ...row,
      estimatedCostUsd: round(row.estimatedCostUsd, 4),
    }))
  const providerRows = sortSummaryRows(summarizeRows(rows, ['provider']), 'totalRuns')
    .filter(row => row.provider)
    .map(row => ({
      ...row,
      estimatedCostUsd: round(row.estimatedCostUsd, 4),
    }))
  const trend = buildTrendRows(rows, fromDate, toDate)

  const kpis = {
    totalRuns: rows.length,
    successfulRuns: rows.filter(row => row.status === 'success').length,
    failedRuns: rows.filter(row => row.status === 'failed').length,
    canceledRuns: rows.filter(row => row.status === 'canceled').length,
    promptTokens: rows.reduce((sum, row) => sum + Number(row.promptTokens || 0), 0),
    completionTokens: rows.reduce((sum, row) => sum + Number(row.completionTokens || 0), 0),
    totalTokens: rows.reduce((sum, row) => sum + Number(row.totalTokens || 0), 0),
    estimatedCostUsd: round(rows.reduce((sum, row) => sum + Number(row.estimatedCostUsd || 0), 0), 4),
    avgDurationMs: rows.length > 0
      ? Math.round(rows.reduce((sum, row) => sum + Number(row.durationMs || 0), 0) / rows.length)
      : 0,
  }

  const legacySummary = await getLegacySummary({ fromDate, toDate, trackingStartedAt })

  return {
    trackingStartedAt,
    window: {
      from: fromDate.toISOString(),
      to: toDate.toISOString(),
    },
    kpis,
    modelRows,
    taskRows,
    providerRows,
    trend,
    filters: {
      tasks: taskRows.map(row => ({ value: row.taskKey, label: row.label })),
      providers: providerRows.map(row => row.provider),
      models: modelRows.map(row => ({
        provider: row.provider,
        model: row.model,
      })),
      statuses: ['running', 'success', 'failed', 'canceled'],
      triggers: ['manual', 'scheduled', 'websocket', 'http'],
    },
    legacyNotice: legacySummary
      ? 'Detailed execution tracking starts from the new AI execution log. Older history is partial.'
      : null,
    legacySummary,
  }
}

async function getAnalyticsRuns({
  from = null,
  to = null,
  task = null,
  provider = null,
  model = null,
  status = null,
  trigger = null,
  page = 1,
  limit = 20,
} = {}) {
  const match = buildMatchFilter({ from, to, task, provider, model, status, trigger })
  const pageNumber = Math.max(1, Number(page || 1))
  const pageSize = Math.min(100, Math.max(1, Number(limit || 20)))

  const [total, items] = await Promise.all([
    AIExecutionLog.countDocuments(match),
    AIExecutionLog.find(match)
      .sort({ startedAt: -1 })
      .skip((pageNumber - 1) * pageSize)
      .limit(pageSize)
      .lean(),
  ])

  return {
    page: pageNumber,
    limit: pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    items: items.map(item => ({
      ...item,
      label: TASK_LABELS[item.taskKey] || item.taskKey,
    })),
  }
}

export {
  getAnalyticsOverview,
  getAnalyticsRuns,
  getRangeDates,
}
