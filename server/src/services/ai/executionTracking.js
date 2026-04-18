import AIExecutionLog from '../../models/AIExecutionLog.js'
import {
  estimateCostUsd,
  getProviderBillingMode,
} from './presentation.js'

const VALID_TRIGGERS = new Set(['manual', 'scheduled', 'websocket', 'http'])
const MAX_REQUEST_LABEL_LENGTH = 240
const MAX_ERROR_LENGTH = 300

function normalizeNumber(value, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function normalizeTrigger(trigger = 'http') {
  return VALID_TRIGGERS.has(trigger) ? trigger : 'http'
}

function truncate(value, maxLength) {
  const text = String(value || '').trim()
  if (!text) return ''
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text
}

function isAbortError(err) {
  const name = String(err?.name || '')
  const message = String(err?.message || '').toLowerCase()
  return name === 'AbortError' || message.includes('aborted') || message.includes('canceled')
}

function extractMetering(result = {}) {
  const promptTokens = Math.max(0, normalizeNumber(result.promptTokens, 0))
  const completionTokens = Math.max(0, normalizeNumber(result.completionTokens, 0))
  const totalTokens = Math.max(
    0,
    normalizeNumber(
      result.totalTokens,
      result.tokensUsed ?? (promptTokens + completionTokens)
    )
  )
  const provider = result.provider || null
  const billingMode = result.billingMode || getProviderBillingMode(provider)

  return {
    provider,
    model: result.model || null,
    promptTokens,
    completionTokens,
    totalTokens,
    estimatedCostUsd: normalizeNumber(
      result.estimatedCostUsd,
      estimateCostUsd(provider, totalTokens)
    ),
    billingMode,
    durationMs: Math.max(0, normalizeNumber(result.responseTimeMs ?? result.durationMs, 0)),
  }
}

async function startExecutionLog({
  taskKey,
  domain,
  trigger = 'http',
  requestLabel = '',
  provider = null,
  model = null,
}) {
  return await AIExecutionLog.create({
    taskKey,
    domain,
    provider,
    model,
    trigger: normalizeTrigger(trigger),
    status: 'running',
    startedAt: new Date(),
    requestLabel: truncate(requestLabel, MAX_REQUEST_LABEL_LENGTH),
  })
}

async function completeExecutionLog(
  logId,
  {
    result = {},
    durationMs = null,
    scoreId = null,
  } = {}
) {
  if (!logId) return

  const metering = extractMetering(result)
  await AIExecutionLog.findByIdAndUpdate(logId, {
    provider: metering.provider,
    model: metering.model,
    status: 'success',
    completedAt: new Date(),
    durationMs: durationMs == null ? metering.durationMs : Math.max(0, normalizeNumber(durationMs, 0)),
    promptTokens: metering.promptTokens,
    completionTokens: metering.completionTokens,
    totalTokens: metering.totalTokens,
    estimatedCostUsd: metering.estimatedCostUsd,
    billingMode: metering.billingMode,
    scoreId: scoreId || null,
    errorMessage: null,
  })
}

async function failExecutionLog(
  logId,
  err,
  {
    status = null,
    durationMs = 0,
    result = {},
  } = {}
) {
  if (!logId) return

  const metering = extractMetering(result)
  await AIExecutionLog.findByIdAndUpdate(logId, {
    provider: metering.provider,
    model: metering.model,
    status: status || (isAbortError(err) ? 'canceled' : 'failed'),
    completedAt: new Date(),
    durationMs: Math.max(0, normalizeNumber(durationMs, 0)),
    promptTokens: metering.promptTokens,
    completionTokens: metering.completionTokens,
    totalTokens: metering.totalTokens,
    estimatedCostUsd: metering.estimatedCostUsd,
    billingMode: metering.billingMode,
    errorMessage: truncate(err?.message || (isAbortError(err) ? 'Request canceled' : 'Execution failed'), MAX_ERROR_LENGTH) || null,
  })
}

async function trackExecution({
  taskKey,
  domain,
  trigger = 'http',
  requestLabel = '',
  run,
}) {
  const startedAt = Date.now()
  const log = await startExecutionLog({ taskKey, domain, trigger, requestLabel })

  try {
    const result = await run(log)
    await completeExecutionLog(log._id, {
      result,
      durationMs: Date.now() - startedAt,
      scoreId: result?.scoreId || null,
    })
    return result
  } catch (err) {
    await failExecutionLog(log._id, err, {
      durationMs: Date.now() - startedAt,
    })
    throw err
  }
}

export {
  completeExecutionLog,
  extractMetering,
  failExecutionLog,
  isAbortError,
  normalizeTrigger,
  startExecutionLog,
  trackExecution,
}
