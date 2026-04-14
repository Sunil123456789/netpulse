import { taskRouter } from './taskRouter.js'
import { buildContext } from './context.js'
import { scoreResponse } from './scorer.js'

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

async function processChat({
  messages,
  context = 'all',
  dateRange = null,
  overrideProvider = null,
  overrideModel = null,
}) {
  // Build context from appropriate sources
  const sources = context === 'soc'    ? ['es']
    : context === 'noc'                ? ['es']
    : context === 'zabbix'             ? ['zabbix']
    : ['es', 'zabbix', 'mongo']  // 'all' and everything else

  const contextData = await buildContext(sources, dateRange)

  // Build system prompt with current context
  const systemWithContext = `${SYSTEM_PROMPT}

CURRENT NETWORK CONTEXT:
${contextData.text}

Instructions: Use the above context to answer questions accurately.
Always reference specific numbers from the context when relevant.`

  // Route to correct AI provider
  const result = await taskRouter.route(
    'chat',
    messages,
    systemWithContext,
    overrideProvider,
    overrideModel
  )

  // Score the response
  const lastUserMessage = messages.filter(m => m.role === 'user').pop()
  const scoring = await scoreResponse({
    task:          'chat',
    provider:      result.provider,
    model:         result.model,
    query:         lastUserMessage?.content || '',
    response:      result.content,
    responseTimeMs: result.responseTimeMs,
    tokensUsed:    result.tokensUsed,
    save:          true,
  })

  // Update last run in task config
  await taskRouter.updateLastRun('chat', 'success', result.responseTimeMs)

  return {
    response:       result.content,
    provider:       result.provider,
    model:          result.model,
    tokensUsed:     result.tokensUsed,
    responseTimeMs: result.responseTimeMs,
    scores:         scoring.scores,
    totalScore:     scoring.totalScore,
    scoreId:        scoring.scoreId,
    contextSources: contextData.sources,
  }
}

export { processChat }
