import { taskRouter } from './taskRouter.js'
import { buildContext } from './context.js'
import { scoreResponse } from './scorer.js'
import { buildChatDisplay, buildMetering } from './presentation.js'
import { ollamaProvider } from './providers/ollama.js'
import { normalizeTimeoutMs, runWithTimeout } from '../../utils/providerTimeout.js'
import {
  completeExecutionLog,
  failExecutionLog,
  isAbortError,
  startExecutionLog,
} from './executionTracking.js'
import {
  createModelMissingError,
  createProviderAuthError,
  createProviderUnreachableError,
  formatChatTarget,
  normalizeChatError,
} from './chatErrors.js'

const SYSTEM_PROMPT = `You are NetPulse AI, an intelligent network
and security operations assistant for Lenskart's IT infrastructure.

You have access to real-time data from:
- FortiGate firewall logs (Elasticsearch index: firewall-*)
- Cisco switch logs (Elasticsearch index: cisco-*)
- SentinelOne EDR (Elasticsearch index: sentinel-*)
- Zabbix infrastructure monitoring (303 hosts, 36 groups)
- NetPulse tickets and alert rules (MongoDB)

Sites monitored:
- Bhiwadi-WH (Bhiwadi, Rajasthan)
- Gurgaon-WH (Gurgaon, Haryana)

You help NOC/SOC analysts by:
- Answering questions about network security events
- Explaining alerts and anomalies in plain language
- Recommending specific remediation actions
- Identifying patterns and trends
- Generating incident summaries

Guidelines:
- Always be specific with numbers and timestamps when available
- Format responses with bullet points for lists
- Keep responses concise — analysts are busy
- If context data is available, reference specific numbers
- For security incidents, always include a recommendation
- If you don't have enough data, say so clearly
- Never make up data — only use what is provided in context`

const DEFAULT_CHAT_MODEL_TIMEOUT_MS = normalizeTimeoutMs(
  process.env.AI_CHAT_TIMEOUT_MS || process.env.AI_PROVIDER_TIMEOUT_MS,
  90000
)
const DEFAULT_OLLAMA_CHAT_TIMEOUT_MS = normalizeTimeoutMs(
  process.env.AI_OLLAMA_CHAT_TIMEOUT_MS || process.env.OLLAMA_CHAT_TIMEOUT_MS,
  900000
)

function getProviderTimeoutMs(provider) {
  const timeoutMs = Number(provider?.chatTimeoutMs ?? provider?.requestTimeoutMs)
  return Number.isFinite(timeoutMs) && timeoutMs > 0 ? Math.floor(timeoutMs) : 0
}

async function resolveChatModelTimeoutMs(providerName) {
  const primaryProviderTimeoutMs = getProviderTimeoutMs(taskRouter.getProvider(providerName))

  return Math.max(
    DEFAULT_CHAT_MODEL_TIMEOUT_MS,
    primaryProviderTimeoutMs,
    providerName === 'ollama' ? DEFAULT_OLLAMA_CHAT_TIMEOUT_MS : 0
  )
}

function buildRunningStageLabel(target) {
  const targetLabel = formatChatTarget(target.providerName, target.model)
  return target.providerName === 'ollama'
    ? `Running ${targetLabel}... this model can take several minutes`
    : `Running ${targetLabel}...`
}

async function validateChatTarget(target) {
  if (target.providerName !== 'ollama') return

  const status = await ollamaProvider.getStatus()
  if (!status.connected) {
    if (status.requiresAuth) {
      throw createProviderAuthError({
        provider: target.providerName,
        model: target.model,
        detail: status.detail,
      })
    }

    throw createProviderUnreachableError({
      provider: target.providerName,
      model: target.model,
      detail: status.detail || `Ollama is not reachable at ${ollamaProvider.baseUrl}.`,
    })
  }

  const modelExists = status.models.some(entry => entry?.name === target.model)
  if (!modelExists) {
    throw createModelMissingError({
      provider: target.providerName,
      model: target.model,
    })
  }
}

function getSources(context) {
  return context === 'soc' ? ['es']
    : context === 'noc' ? ['es']
      : context === 'zabbix' ? ['zabbix']
        : ['es', 'zabbix', 'mongo']
}

async function buildChatContext(context, dateRange) {
  const sources = getSources(context)
  const contextData = await buildContext(sources, dateRange)

  return {
    contextData,
    systemWithContext: `${SYSTEM_PROMPT}

CURRENT NETWORK CONTEXT:
${contextData.text}

Instructions: Use the above context to answer questions accurately.
Always reference specific numbers from the context when relevant.`,
  }
}

async function finalizeChatResult({ messages, contextData, result }) {
  const lastUserMessage = messages.filter(m => m.role === 'user').pop()

  const scoring = await scoreResponse({
    task:          'chat',
    provider:      result.provider,
    model:         result.model,
    query:         lastUserMessage?.content || '',
    response:      result.content,
    responseTimeMs: result.responseTimeMs,
    tokensUsed:    result.totalTokens,
    save:          true,
  })

  await taskRouter.updateLastRun('chat', 'success', result.responseTimeMs)

  return {
    response:       result.content,
    provider:       result.provider,
    model:          result.model,
    promptTokens:   result.promptTokens,
    completionTokens: result.completionTokens,
    totalTokens:    result.totalTokens,
    tokensUsed:     result.totalTokens,
    responseTimeMs: result.responseTimeMs,
    scores:         scoring.scores,
    totalScore:     scoring.totalScore,
    scoreId:        scoring.scoreId,
    contextSources: contextData.sources,
    display:        buildChatDisplay(result.content),
    metering:       buildMetering(result),
  }
}

async function runChatModelRequest({
  messages,
  systemWithContext,
  target,
  handlers = {},
  signal = null,
}) {
  const timeoutMs = await resolveChatModelTimeoutMs(target.providerName)

  try {
    return await runWithTimeout(
      timeoutSignal => taskRouter.routeStream(
        'chat',
        messages,
        systemWithContext,
        target.providerName,
        target.model,
        handlers,
        timeoutSignal,
        target.providerName === 'ollama' ? { timeoutMs } : {}
      ),
      {
        parentSignal: signal,
        timeoutMs,
        timeoutMessage: `Chat model request timed out after ${timeoutMs}ms`,
      }
    )
  } catch (err) {
    throw normalizeChatError(err, {
      provider: target.providerName,
      model: target.model,
      timeoutMs,
    })
  }
}

async function processChat({
  messages,
  context = 'all',
  dateRange = null,
  overrideProvider = null,
  overrideModel = null,
  trigger = 'http',
  signal = null,
}) {
  const startedAt = Date.now()
  const lastUserMessage = messages.filter(message => message.role === 'user').pop()
  const target = await taskRouter.resolveTaskTarget('chat', overrideProvider, overrideModel)
  const execution = await startExecutionLog({
    taskKey: 'ai.chat',
    domain: 'ai',
    trigger,
    requestLabel: lastUserMessage?.content || 'Chat request',
    provider: target.providerName,
    model: target.model,
  })

  try {
    await validateChatTarget(target)
    const { contextData, systemWithContext } = await buildChatContext(context, dateRange)
    const result = await runChatModelRequest({
      messages,
      systemWithContext,
      target,
      handlers: {},
      signal
    })

    const payload = await finalizeChatResult({ messages, contextData, result })
    await completeExecutionLog(execution._id, {
      result,
      durationMs: Date.now() - startedAt,
      scoreId: payload.scoreId,
    })
    return payload
  } catch (err) {
    const chatError = normalizeChatError(err, {
      provider: target.providerName,
      model: target.model,
    })

    await failExecutionLog(execution._id, chatError, {
      status: isAbortError(chatError) ? 'canceled' : 'failed',
      durationMs: Date.now() - startedAt,
      result: {
        provider: target.providerName,
        model: target.model,
      },
    })
    throw chatError
  }
}

async function streamChat({
  messages,
  context = 'all',
  dateRange = null,
  overrideProvider = null,
  overrideModel = null,
  signal = null,
  onStage = null,
  onToken = null,
}) {
  const startedAt = Date.now()
  const lastUserMessage = messages.filter(message => message.role === 'user').pop()
  const target = await taskRouter.resolveTaskTarget('chat', overrideProvider, overrideModel)
  const execution = await startExecutionLog({
    taskKey: 'ai.chat',
    domain: 'ai',
    trigger: 'websocket',
    requestLabel: lastUserMessage?.content || 'Chat request',
    provider: target.providerName,
    model: target.model,
  })

  try {
    onStage?.('collecting_context', 'Collecting network context...')
    await validateChatTarget(target)
    const { contextData, systemWithContext } = await buildChatContext(context, dateRange)

    onStage?.('running_model', buildRunningStageLabel(target))
    const result = await runChatModelRequest({
      messages,
      systemWithContext,
      target,
      handlers: { onStage, onToken },
      signal
    })

    onStage?.('formatting_response', 'Formatting response...')
    const payload = await finalizeChatResult({ messages, contextData, result })
    await completeExecutionLog(execution._id, {
      result,
      durationMs: Date.now() - startedAt,
      scoreId: payload.scoreId,
    })
    return payload
  } catch (err) {
    const chatError = normalizeChatError(err, {
      provider: target.providerName,
      model: target.model,
    })

    await failExecutionLog(execution._id, chatError, {
      status: isAbortError(chatError) ? 'canceled' : 'failed',
      durationMs: Date.now() - startedAt,
      result: {
        provider: target.providerName,
        model: target.model,
      },
    })
    throw chatError
  }
}

export { processChat, streamChat }
