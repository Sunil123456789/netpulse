import { buildContext } from './context.js'
import { scoreResponse } from './scorer.js'
import { taskRouter } from './taskRouter.js'
import { claudeProvider } from './providers/claude.js'
import { openaiProvider } from './providers/openai.js'
import { ollamaProvider } from './providers/ollama.js'

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

async function compareModels({
  question,
  context = 'all',
  dateRange = null,
  modelOverrides = {},
}) {
  const sources = getSources(context)
  const contextData = await buildContext(sources, dateRange)
  const systemWithContext = `${MODEL_LAB_PROMPT}

CURRENT NETWORK CONTEXT:
${contextData.text}

Instructions: Use the above context to answer the user's question accurately.
Reference concrete data points whenever possible.`

  const messages = [{ role: 'user', content: question }]
  const runners = [
    {
      provider: 'claude',
      ready: claudeProvider.isConfigured(),
      model: modelOverrides.claude || 'auto',
      run: () => claudeProvider.chat(messages, systemWithContext, modelOverrides.claude || 'auto'),
      reason: 'ANTHROPIC_API_KEY not set',
    },
    {
      provider: 'openai',
      ready: openaiProvider.isConfigured(),
      model: modelOverrides.openai || 'auto',
      run: () => openaiProvider.chat(messages, systemWithContext, modelOverrides.openai || 'auto'),
      reason: 'OPENAI_API_KEY not set',
    },
    {
      provider: 'ollama',
      ready: await ollamaProvider.isRunning(),
      model: modelOverrides.ollama || 'auto',
      run: () => ollamaProvider.chat(messages, systemWithContext, modelOverrides.ollama || 'auto'),
      reason: 'Ollama not running',
    },
  ]

  const active = runners.filter(r => r.ready)
  if (active.length === 0) {
    throw new Error('No AI providers are currently available for Model Lab')
  }

  const comparisons = await Promise.all(runners.map(async (runner) => {
    if (!runner.ready) {
      return {
        provider: runner.provider,
        model: runner.model,
        available: false,
        error: runner.reason,
      }
    }

    try {
      const result = await runner.run()
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
        provider: result.provider,
        model: result.model,
        available: true,
        response: result.content,
        tokensUsed: result.tokensUsed,
        responseTimeMs: result.responseTimeMs,
        totalScore: scoring.totalScore,
        scores: scoring.scores,
        scoreId: scoring.scoreId,
      }
    } catch (err) {
      return {
        provider: runner.provider,
        model: runner.model,
        available: true,
        error: err.message,
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
    comparedAt: new Date().toISOString(),
    contextSources: contextData.sources,
    comparisons,
    winner: best ? {
      provider: best.provider,
      model: best.model,
      totalScore: best.totalScore,
      scoreId: best.scoreId,
    } : null,
  }
}

export { compareModels }
