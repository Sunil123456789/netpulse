import { complete } from './aiRouter.js'

const SYSTEM = `You are a security analyst AI. Triage network alerts.
Return ONLY valid JSON:
{ "severity": "critical|high|medium|low", "category": "intrusion|malware|policy|anomaly|auth|network",
  "summary": "one sentence", "recommendation": "specific action",
  "falsePositiveLikelihood": "low|medium|high", "relatedCVE": "CVE-XXXX or null" }`

export async function triageAlert(alert) {
  const prompt = `Triage this alert:
Source: ${alert.srcip || 'unknown'} → Dest: ${alert.dstip || 'unknown'}
Action: ${alert.action || alert.cisco_mnemonic || 'unknown'}
Message: ${alert.message || alert.cisco_message || 'unknown'}
Device: ${alert.device_name || 'unknown'} Site: ${alert.site_name || 'unknown'}`
  try {
    const raw = await complete(prompt, { system: SYSTEM, maxTokens: 500 })
    return JSON.parse(raw.replace(/```json|```/g, '').trim())
  } catch {
    return { severity: 'medium', category: 'network', summary: 'Manual review required',
      recommendation: 'Review manually', falsePositiveLikelihood: 'medium', relatedCVE: null }
  }
}
