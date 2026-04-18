import { taskRouter } from './taskRouter.js'
import { scoreResponse } from './scorer.js'
import { buildMetering, buildTriageDisplay } from './presentation.js'
import {
  completeExecutionLog,
  failExecutionLog,
  startExecutionLog,
} from './executionTracking.js'

const TRIAGE_SYSTEM_PROMPT = `You are a senior SOC analyst for
Lenskart's network security team. You analyze security alerts and
provide expert triage assessments.

When given a security alert, respond with ONLY a JSON object.
No explanation, no markdown, just pure JSON.

Required format:
{
  "severity": "critical" | "high" | "medium" | "low",
  "category": "intrusion" | "malware" | "policy_violation" | "anomaly" | "brute_force" | "reconnaissance" | "data_exfiltration" | "other",
  "summary": "one sentence description of what happened",
  "recommendation": "specific action to take",
  "falsePositiveLikelihood": "low" | "medium" | "high",
  "autoTicket": true | false,
  "reasoning": "brief explanation of your assessment",
  "relatedCVE": "CVE-XXXX-XXXX or null",
  "mitreTactic": "MITRE ATT&CK tactic or null"
}

Rules:
- autoTicket = true when severity is critical or (high + falsePositiveLikelihood is low)
- Be specific in recommendation — name exact steps
- If srcip is provided, consider geographic context
- For internal IPs (10.x, 192.168.x, 172.16-31.x) lower false positive likelihood`

async function checkIPReputation(ip) {
  const apiKey = process.env.ABUSEIPDB_KEY
  if (!apiKey) return null

  // Skip private IPs
  if (ip.startsWith('10.') || ip.startsWith('192.168.') ||
      ip.startsWith('172.') || ip === 'unknown') return null

  try {
    const response = await fetch(
      `https://api.abuseipdb.com/api/v2/check?ipAddress=${ip}&maxAgeInDays=30`,
      {
        headers: {
          'Key': apiKey,
          'Accept': 'application/json'
        },
        signal: AbortSignal.timeout(5000)
      }
    )
    if (!response.ok) return null
    const data = await response.json()
    return {
      abuseScore: data.data?.abuseConfidenceScore || 0,
      totalReports: data.data?.totalReports || 0,
      countryCode: data.data?.countryCode || null,
      isp: data.data?.isp || null,
      usageType: data.data?.usageType || null,
      lastReported: data.data?.lastReportedAt || null
    }
  } catch {
    return null
  }
}

async function triageAlert({
  alert,
  overrideProvider = null,
  overrideModel = null,
  trigger = 'http',
  signal = null,
}) {
  const startTime = Date.now()
  const execution = await startExecutionLog({
    taskKey: 'ai.triage',
    domain: 'ai',
    trigger,
    requestLabel: alert.name || alert.message || alert.description || 'Alert triage',
  })

  try {
    // Check IP reputation if srcip available
    let ipReputation = null
    if (alert.srcip || alert.data?.srcip) {
      const ip = alert.srcip || alert.data?.srcip
      ipReputation = await checkIPReputation(ip)
    }

    // Build alert context for AI
    const alertContext = `Security Alert Details:
Name: ${alert.name || 'Unknown'}
Type: ${alert.type || alert.subtype || 'Unknown'}
Source IP: ${alert.srcip || alert.data?.srcip || 'Unknown'}
Destination IP: ${alert.dstip || alert.data?.dstip || 'Unknown'}
Source Country: ${alert.srccountry || 'Unknown'}
Protocol: ${alert.proto || 'Unknown'}
Application: ${alert.app || 'Unknown'}
Attack: ${alert.attack || 'Unknown'}
Severity: ${alert.severity || 'Unknown'}
Site: ${alert.site_name || 'Unknown'}
Device: ${alert.device_name || 'Unknown'}
Message: ${alert.message || alert.description || 'No message'}
Timestamp: ${alert.timestamp || new Date().toISOString()}
${ipReputation ? `
IP Reputation Check:
- Abuse Score: ${ipReputation.abuseScore}/100
- Total Reports: ${ipReputation.totalReports}
- Country: ${ipReputation.countryCode}
- ISP: ${ipReputation.isp}
- Usage Type: ${ipReputation.usageType}` : ''}`

    // Route to AI for triage
    const aiResult = await taskRouter.routeStream(
      'triage',
      [{ role: 'user', content: alertContext }],
      TRIAGE_SYSTEM_PROMPT,
      overrideProvider,
      overrideModel,
      {},
      signal,
      {
        maxTokens: 384,
        temperature: 0.2,
      }
    )

    // Parse AI response
    let triageResult
    try {
      const cleaned = aiResult.content
        .replace(/```json/g, '')
        .replace(/```/g, '')
        .trim()
      triageResult = JSON.parse(cleaned)
    } catch {
      // If JSON parsing fails, create a basic response
      triageResult = {
        severity: 'medium',
        category: 'other',
        summary: aiResult.content?.slice(0, 200) || 'Analysis failed',
        recommendation: 'Manual review required',
        falsePositiveLikelihood: 'medium',
        autoTicket: false,
        reasoning: 'AI response parsing failed',
        relatedCVE: null,
        mitreTactic: null
      }
    }

    // Score the triage response
    const scoring = await scoreResponse({
      task: 'triage',
      provider: aiResult.provider,
      model: aiResult.model,
      query: alert.name || 'Unknown alert',
      response: aiResult.content,
      responseTimeMs: aiResult.responseTimeMs,
      tokensUsed: aiResult.totalTokens,
      save: true
    })

    await taskRouter.updateLastRun('triage', 'success', Date.now() - startTime)

    const payload = {
      ...triageResult,
      ipReputation,
      provider: aiResult.provider,
      model: aiResult.model,
      promptTokens: aiResult.promptTokens,
      completionTokens: aiResult.completionTokens,
      totalTokens: aiResult.totalTokens,
      tokensUsed: aiResult.totalTokens,
      responseTimeMs: aiResult.responseTimeMs,
      scores: scoring.scores,
      totalScore: scoring.totalScore,
      scoreId: scoring.scoreId,
      triageAt: new Date().toISOString(),
      display: buildTriageDisplay({ ...triageResult, ipReputation }, aiResult.content),
      metering: buildMetering(aiResult),
    }

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

export { triageAlert }
