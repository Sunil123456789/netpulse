import { taskRouter } from './taskRouter.js'
import { scoreResponse } from './scorer.js'
import { buildContext } from './context.js'
import AIBrief from '../../models/AIBrief.js'
import { getESClient } from '../../config/elasticsearch.js'
import { buildBriefDisplay, buildMetering } from './presentation.js'
import {
  completeExecutionLog,
  failExecutionLog,
  startExecutionLog,
} from './executionTracking.js'

const BRIEF_SYSTEM_PROMPT = `You are a senior network security analyst
writing an intelligence brief for Lenskart's IT leadership team.

Write a clear, professional intelligence report based on the data provided.
Structure your response as JSON with this exact format:
{
  "title": "NetPulse Intelligence Brief - [date]",
  "executiveSummary": "2-3 sentence overview for management",
  "sections": {
    "security": {
      "summary": "paragraph about security posture",
      "highlights": ["key finding 1", "key finding 2", "key finding 3"],
      "recommendations": ["action 1", "action 2"]
    },
    "network": {
      "summary": "paragraph about network health",
      "highlights": ["key finding 1", "key finding 2"],
      "recommendations": ["action 1", "action 2"]
    },
    "infrastructure": {
      "summary": "paragraph about infrastructure status",
      "highlights": ["key finding 1", "key finding 2"],
      "recommendations": ["action 1", "action 2"]
    }
  },
  "topRecommendations": ["most important action 1", "action 2", "action 3"],
  "riskLevel": "low" | "medium" | "high" | "critical",
  "fullReport": "complete markdown formatted report with all sections"
}

Guidelines:
- Be specific with numbers from the data provided
- Compare to normal baselines when mentioned
- Keep language professional but clear
- Prioritize actionable recommendations
- fullReport should be 300-500 words in markdown format`

async function generateBrief({
  dateRange = null,
  overrideProvider = null,
  overrideModel = null,
  triggeredBy = 'manual',
  trigger = 'http',
  signal = null,
}) {
  const startTime = Date.now()
  const from = dateRange?.from || 'now-24h'
  const to = dateRange?.to || 'now'
  const execution = await startExecutionLog({
    taskKey: 'ai.brief',
    domain: 'ai',
    trigger,
    requestLabel: `Intelligence brief ${from} to ${to}`,
  })

  try {
    // Fetch comprehensive context
    const contextData = await buildContext(
      ['es', 'zabbix', 'mongo'],
      { from, to }
    )

    // Fetch additional stats for the brief
    const additionalStats = await fetchAdditionalStats(from, to)

    // Build detailed prompt
    const briefPrompt = `Generate an intelligence brief for the following period: ${from} to ${to}

NETWORK DATA:
${contextData.text}

ADDITIONAL STATISTICS:
${additionalStats}

Generate a comprehensive intelligence brief covering security, network,
and infrastructure status. Include specific numbers and actionable recommendations.`

    // Generate brief using AI
    const aiResult = await taskRouter.routeStream(
      'brief',
      [{ role: 'user', content: briefPrompt }],
      BRIEF_SYSTEM_PROMPT,
      overrideProvider,
      overrideModel,
      {},
      signal,
      {
        maxTokens: 1200,
        temperature: 0.2,
      }
    )

    // Parse AI response
    let briefData
    try {
      const cleaned = aiResult.content
        .replace(/```json/g, '')
        .replace(/```/g, '')
        .trim()
      briefData = JSON.parse(cleaned)
    } catch {
      // If JSON fails, create structured response from text
      briefData = {
        title: `NetPulse Intelligence Brief`,
        executiveSummary: aiResult.content?.slice(0, 300) || 'Brief generation failed',
        sections: {
          security: { summary: '', highlights: [], recommendations: [] },
          network: { summary: '', highlights: [], recommendations: [] },
          infrastructure: { summary: '', highlights: [], recommendations: [] }
        },
        topRecommendations: [],
        riskLevel: 'medium',
        fullReport: aiResult.content || 'Brief generation failed'
      }
    }

    // Score the brief
    const scoring = await scoreResponse({
      task: 'brief',
      provider: aiResult.provider,
      model: aiResult.model,
      query: `Intelligence brief ${from} to ${to}`,
      response: briefData.fullReport || JSON.stringify(briefData),
      responseTimeMs: aiResult.responseTimeMs,
      tokensUsed: aiResult.totalTokens,
      save: true
    })

    // Save to MongoDB
    const savedBrief = await AIBrief.create({
      title: briefData.title,
      executiveSummary: briefData.executiveSummary,
      riskLevel: briefData.riskLevel,
      rangeFrom: new Date(from.startsWith('now') ? Date.now() - 86400000 : from),
      rangeTo: new Date(to === 'now' ? Date.now() : to),
      provider: aiResult.provider,
      model: aiResult.model,
      triggeredBy,
      sections: briefData.sections,
      topRecommendations: briefData.topRecommendations || [],
      fullReport: briefData.fullReport || JSON.stringify(briefData),
      tokensUsed: aiResult.totalTokens,
      generationTimeMs: Date.now() - startTime,
      totalScore: scoring.totalScore,
      scoreId: scoring.scoreId
    })

    await taskRouter.updateLastRun('brief', 'success', Date.now() - startTime)

    const payload = buildBriefResponse(savedBrief, {
      id: savedBrief._id,
      title: briefData.title,
      executiveSummary: briefData.executiveSummary,
      sections: briefData.sections,
      topRecommendations: briefData.topRecommendations,
      riskLevel: briefData.riskLevel,
      fullReport: briefData.fullReport,
      provider: aiResult.provider,
      model: aiResult.model,
      promptTokens: aiResult.promptTokens,
      completionTokens: aiResult.completionTokens,
      totalTokens: aiResult.totalTokens,
      tokensUsed: aiResult.totalTokens,
      generationTimeMs: Date.now() - startTime,
      scores: scoring.scores,
      totalScore: scoring.totalScore,
      scoreId: scoring.scoreId,
      generatedAt: savedBrief.generatedAt,
    })

    await completeExecutionLog(execution._id, {
      result: aiResult,
      durationMs: Date.now() - startTime,
      scoreId: scoring.scoreId,
    })

    return payload
  } catch (err) {
    await failExecutionLog(execution._id, err, {
      durationMs: Date.now() - startTime,
    })
    throw err
  }
}

async function fetchAdditionalStats(from, to) {
  try {
    const es = getESClient()
    const timeRange = { gte: from, lte: to === 'now' ? undefined : to }
    if (to === 'now') delete timeRange.lte

    const [topAttacks, topCountries, topApps] = await Promise.allSettled([
      es.search({
        index: 'firewall-*',
        body: {
          size: 0,
          query: { bool: { must: [
            { range: { '@timestamp': timeRange } },
            { term: { 'fgt.subtype.keyword': 'ips' } }
          ]}},
          aggs: { attacks: { terms: { field: 'fgt.attack.keyword', size: 5 } } }
        }
      }),
      es.search({
        index: 'firewall-*',
        body: {
          size: 0,
          query: { bool: { must: [
            { range: { '@timestamp': timeRange } },
            { term: { 'fgt.action.keyword': 'deny' } }
          ]}},
          aggs: { countries: { terms: { field: 'fgt.srccountry.keyword', size: 5 } } }
        }
      }),
      es.search({
        index: 'firewall-*',
        body: {
          size: 0,
          query: { range: { '@timestamp': timeRange } },
          aggs: { apps: { terms: { field: 'fgt.app.keyword', size: 5 } } }
        }
      })
    ])

    const lines = []

    if (topAttacks.status === 'fulfilled') {
      const attacks = topAttacks.value.aggregations?.attacks?.buckets || []
      if (attacks.length > 0) {
        lines.push('Top Attack Types:')
        attacks.forEach(a => lines.push(`  - ${a.key}: ${a.doc_count.toLocaleString()} events`))
      }
    }

    if (topCountries.status === 'fulfilled') {
      const countries = topCountries.value.aggregations?.countries?.buckets || []
      if (countries.length > 0) {
        lines.push('Top Blocked Countries:')
        countries.forEach(c => lines.push(`  - ${c.key}: ${c.doc_count.toLocaleString()} blocked`))
      }
    }

    if (topApps.status === 'fulfilled') {
      const apps = topApps.value.aggregations?.apps?.buckets || []
      if (apps.length > 0) {
        lines.push('Top Applications:')
        apps.forEach(a => lines.push(`  - ${a.key}: ${a.doc_count.toLocaleString()} events`))
      }
    }

    return lines.join('\n') || 'No additional stats available'
  } catch (err) {
    return `Stats fetch failed: ${err.message}`
  }
}

async function getLatestBrief() {
  const brief = await AIBrief.findOne().sort({ generatedAt: -1 }).lean()
  return buildBriefResponse(brief)
}

async function getBriefById(id) {
  const brief = await AIBrief.findById(id).lean()
  return buildBriefResponse(brief)
}

async function getBriefHistory(limit = 30) {
  const history = await AIBrief.find()
    .sort({ generatedAt: -1 })
    .limit(limit)
    .select('-fullReport')
    .lean()

  return history.map(item => buildBriefResponse(item))
}

function buildBriefResponse(record, overrides = {}) {
  if (!record) return null

  const base = {
    ...record,
    ...overrides,
  }

  return {
    ...base,
    display: buildBriefDisplay(base),
    metering: buildMetering({
      provider: base.provider,
      model: base.model,
      promptTokens: base.promptTokens,
      completionTokens: base.completionTokens,
      totalTokens: base.totalTokens,
      tokensUsed: base.tokensUsed,
      responseTimeMs: base.generationTimeMs,
    }),
  }
}

export { generateBrief, getLatestBrief, getBriefById, getBriefHistory }
