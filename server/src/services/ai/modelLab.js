import { buildContext } from './context.js'
import { scoreResponse } from './scorer.js'
import { taskRouter } from './taskRouter.js'
import { claudeProvider } from './providers/claude.js'
import { openaiProvider } from './providers/openai.js'
import { ollamaProvider } from './providers/ollama.js'
import { buildDisplayFromText, buildMetering } from './presentation.js'

const MODEL_LAB_PROMPT = `You are NetPulse AI, an intelligent network
and security operations assistant for Lenskart's IT infrastructure.

You help NOC/SOC analysts by:
- Answering questions about network security events
- Explaining alerts and anomalies in plain language
- Recommending specific remediation actions
- Identifying patterns and trends
- Generating concise operational summaries

Guidelines:
- Always be specific with numbers and timestamps when available
- Keep responses concise but useful for analysts
- Use bullet points for lists when helpful
- If context data is available, reference specific details
- For security issues, include a clear recommendation
- Never make up data you do not have`

function getSources(context) {
  return context === 'soc' ? ['es']
    : context === 'noc' ? ['es']
    : context === 'zabbix' ? ['zabbix']
    : ['es', 'zabbix', 'mongo']
}

function buildRunner({ provider, model, index, ollamaReady }) {
  const useModel = model || 'auto'
  const targetId = `${provider}:${useModel}:${index}`

  if (provider === 'claude') {
    return {
      targetId,
      provider,
      model: useModel,
      ready: claudeProvider.isConfigured(),
      execute: (messages, systemPrompt) => claudeProvider.chat(messages, systemPrompt, useModel),
      reason: 'ANTHROPIC_API_KEY not set',
    }
  }

  if (provider === 'openai') {
    return {
      targetId,
      provider,
      model: useModel,
      ready: openaiProvider.isConfigured(),
      execute: (messages, systemPrompt) => openaiProvider.chat(messages, systemPrompt, useModel),
      reason: 'OPENAI_API_KEY not set',
    }
  }

  if (provider === 'ollama') {
    return {
      targetId,
      provider,
      model: useModel,
      ready: ollamaReady,
      execute: (messages, systemPrompt) => ollamaProvider.chat(messages, systemPrompt, useModel),
      reason: 'Ollama not running',
    }
  }

  return {
    targetId,
    provider,
    model: useModel,
    ready: false,
    execute: null,
    reason: `Unknown provider: ${provider}`,
  }
}

async function compareModels({
  question,
  context = 'all',
  dateRange = null,
  modelOverrides = {},
  targets = [],
}) {
  const sources = getSources(context)
  const contextData = await buildContext(sources, dateRange)
  const systemWithContext = `${MODEL_LAB_PROMPT}

CURRENT NETWORK CONTEXT:
${contextData.text}

Instructions: Use the above context to answer the user's question accurately.
Reference concrete data points whenever possible.`

  const messages = [{ role: 'user', content: question }]
  const ollamaReady = await ollamaProvider.isRunning()
  const explicitTargets = Array.isArray(targets) && targets.length > 0
  const requestedTargets = explicitTargets
    ? targets.map((target, index) => ({
      provider: String(target?.provider || '').trim().toLowerCase(),
      model: String(target?.model || '').trim() || 'auto',
      index,
    }))
    : ['claude', 'openai', 'ollama'].map((provider, index) => ({
      provider,
      model: modelOverrides[provider] || 'auto',
      index,
    }))
  const runners = requestedTargets.map(target => buildRunner({ ...target, ollamaReady }))

  const active = runners.filter(r => r.ready)
  if (active.length === 0) {
    throw new Error('No AI providers are currently available for Model Lab')
  }

  const comparisons = await Promise.all(runners.map(async (runner) => {
    if (!runner.ready) {
      return {
        targetId: runner.targetId,
        provider: runner.provider,
        model: runner.model,
        available: false,
        error: runner.reason,
        metering: buildMetering({
          provider: runner.provider,
          model: runner.model,
          tokensUsed: 0,
          responseTimeMs: 0,
        }),
      }
    }

    try {
      const result = await runner.execute(messages, systemWithContext)
      const scoring = await scoreResponse({
        task: 'comparison',
        provider: result.provider,
        model: result.model,
        query: question,
        response: result.content,
        responseTimeMs: result.responseTimeMs,
        tokensUsed: result.tokensUsed,
        save: true,
      })

      return {
        targetId: runner.targetId,
        provider: result.provider,
        model: result.model,
        available: true,
        response: result.content,
        tokensUsed: result.tokensUsed,
        responseTimeMs: result.responseTimeMs,
        totalScore: scoring.totalScore,
        scores: scoring.scores,
        scoreId: scoring.scoreId,
        display: buildDisplayFromText({ text: result.content }),
        metering: buildMetering(result),
      }
    } catch (err) {
      return {
        targetId: runner.targetId,
        provider: runner.provider,
        model: runner.model,
        available: true,
        error: err.message,
        metering: buildMetering({
          provider: runner.provider,
          model: runner.model,
          tokensUsed: 0,
          responseTimeMs: 0,
        }),
      }
    }
  }))

  const ranked = comparisons
    .filter(c => c.response && c.totalScore != null)
    .sort((a, b) => b.totalScore - a.totalScore)

  const best = ranked[0] || null
  await taskRouter.updateLastRun(
    'comparison',
    best ? 'success' : 'failed',
    Math.max(...comparisons.filter(c => c.responseTimeMs != null).map(c => c.responseTimeMs), 0)
  )

  return {
    question,
    context,
    dateRange,
    mode: explicitTargets ? 'same-provider' : 'providers',
    comparedAt: new Date().toISOString(),
    contextSources: contextData.sources,
    comparisons,
    winner: best ? {
      targetId: best.targetId,
      provider: best.provider,
      model: best.model,
      totalScore: best.totalScore,
      scoreId: best.scoreId,
    } : null,
  }
}

export { compareModels }
