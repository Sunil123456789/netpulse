const PROVIDER_PRICING_PER_1K = {
  claude: 0.003,
  openai: 0.005,
  ollama: 0,
  template: 0,
}

const ACTION_WORDS = [
  'recommend',
  'should',
  'must',
  'check',
  'verify',
  'review',
  'block',
  'restart',
  'update',
  'monitor',
  'investigate',
  'isolate',
  'quarantine',
  'remediate',
  'patch',
  'escalate',
  'rotate',
  'revoke',
  'disable',
  'enable',
]

function roundCost(value) {
  return Math.round(Number(value || 0) * 10000) / 10000
}

function dedupe(values = []) {
  const seen = new Set()
  const output = []

  for (const value of values) {
    const normalized = String(value || '').trim()
    if (!normalized) continue
    const key = normalized.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    output.push(normalized)
  }

  return output
}

function splitParagraphs(text = '') {
  return String(text)
    .split(/\r?\n\r?\n+/)
    .map(part => part.trim())
    .filter(Boolean)
}

function splitLines(text = '') {
  return String(text)
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
}

function cleanListPrefix(line = '') {
  return String(line).replace(/^[-*•]\s+/, '').replace(/^\d+\.\s+/, '').trim()
}

function isActionText(text = '') {
  const lower = String(text).toLowerCase()
  return ACTION_WORDS.some(word => lower.includes(word))
}

function looksLikeEvidence(text = '') {
  const value = String(text)
  return /\b\d{1,3}(?:\.\d{1,3}){3}\b/.test(value) ||
    /\bCVE-\d{4}-\d+\b/i.test(value) ||
    /\b\d{2}:\d{2}(?::\d{2})?\b/.test(value) ||
    /\b\d{3,}\b/.test(value)
}

function extractDiagram(text = '') {
  const fenced = String(text).match(/```(?:\w+)?\s*([\s\S]+?)```/)
  if (fenced?.[1]) return fenced[1].trim()

  const asciiLines = splitLines(text).filter(line =>
    line.includes('->') ||
    line.includes('|') ||
    /^[+\-=]{3,}$/.test(line)
  )

  if (asciiLines.length >= 2) return asciiLines.slice(0, 8).join('\n')
  return null
}

function summarizeResultRow(row) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) {
    return String(row || '').trim()
  }

  return Object.entries(row)
    .slice(0, 4)
    .map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(', ') : value}`)
    .join(' | ')
}

function normalizeMetrics(metrics = []) {
  return metrics
    .map(item => {
      if (!item) return null
      const label = String(item.label || '').trim()
      const value = item.value == null ? '' : String(item.value).trim()
      if (!label || !value) return null
      return {
        label,
        value,
        tone: item.tone || 'neutral',
      }
    })
    .filter(Boolean)
}

function normalizeDisplayPayload(payload = {}) {
  const summary = String(payload.summary || '').trim()
  const highlights = dedupe(payload.highlights || []).slice(0, 6)
  const actions = dedupe(payload.actions || []).slice(0, 6)
  const evidence = dedupe(payload.evidence || []).slice(0, 6)
  const metrics = normalizeMetrics(payload.metrics || []).slice(0, 8)
  const diagram = String(payload.diagram || '').trim() || null

  if (!summary && highlights.length === 0 && actions.length === 0 && evidence.length === 0 && metrics.length === 0 && !diagram) {
    return null
  }

  return {
    summary,
    highlights,
    actions,
    evidence,
    metrics,
    diagram,
  }
}

function buildDisplayFromText({ text = '', summary = '', metrics = [] } = {}) {
  const content = String(text || '').trim()
  const paragraphs = splitParagraphs(content)
  const lines = splitLines(content)
  const listItems = lines
    .filter(line => /^[-*•]\s+/.test(line) || /^\d+\.\s+/.test(line))
    .map(cleanListPrefix)

  const derivedSummary = String(summary || paragraphs[0] || '').trim()
  const highlights = []
  const actions = []

  for (const item of listItems) {
    if (isActionText(item)) actions.push(item)
    else highlights.push(item)
  }

  if (highlights.length === 0) {
    highlights.push(...paragraphs.slice(1, 4).map(part => part.replace(/\s+/g, ' ').trim()).filter(Boolean))
  }

  if (actions.length === 0) {
    actions.push(
      ...lines
        .filter(line => isActionText(line))
        .map(cleanListPrefix)
    )
  }

  const evidence = lines
    .filter(line => looksLikeEvidence(line))
    .map(cleanListPrefix)

  return normalizeDisplayPayload({
    summary: derivedSummary,
    highlights,
    actions,
    evidence,
    metrics,
    diagram: extractDiagram(content),
  })
}

function buildChatDisplay(responseText) {
  return buildDisplayFromText({ text: responseText })
}

function buildTriageDisplay(triageResult, rawContent) {
  const metrics = [
    triageResult?.severity ? { label: 'Severity', value: triageResult.severity, tone: triageResult.severity } : null,
    triageResult?.category ? { label: 'Category', value: triageResult.category.replace(/_/g, ' ') } : null,
    triageResult?.falsePositiveLikelihood ? { label: 'FP Risk', value: triageResult.falsePositiveLikelihood } : null,
    triageResult?.mitreTactic ? { label: 'MITRE', value: triageResult.mitreTactic } : null,
    triageResult?.relatedCVE ? { label: 'CVE', value: triageResult.relatedCVE, tone: 'critical' } : null,
  ].filter(Boolean)

  const evidence = [
    triageResult?.ipReputation?.abuseScore != null ? `Abuse score: ${triageResult.ipReputation.abuseScore}/100` : null,
    triageResult?.ipReputation?.totalReports != null ? `Total reports: ${triageResult.ipReputation.totalReports}` : null,
    triageResult?.ipReputation?.countryCode ? `Country: ${triageResult.ipReputation.countryCode}` : null,
    triageResult?.reasoning || null,
  ].filter(Boolean)

  return normalizeDisplayPayload({
    summary: triageResult?.summary || buildDisplayFromText({ text: rawContent })?.summary || '',
    highlights: [triageResult?.reasoning].filter(Boolean),
    actions: [triageResult?.recommendation].filter(Boolean),
    evidence,
    metrics,
  })
}

function buildBriefDisplay(briefData = {}) {
  const sectionHighlights = Object.values(briefData.sections || {})
    .flatMap(section => section?.highlights || [])

  const recommendations = briefData.topRecommendations?.length
    ? briefData.topRecommendations
    : Object.values(briefData.sections || {}).flatMap(section => section?.recommendations || [])

  return normalizeDisplayPayload({
    summary: briefData.executiveSummary || '',
    highlights: sectionHighlights,
    actions: recommendations,
    metrics: [
      briefData.riskLevel ? { label: 'Risk Level', value: briefData.riskLevel, tone: briefData.riskLevel } : null,
      briefData.title ? { label: 'Brief', value: briefData.title } : null,
    ].filter(Boolean),
  })
}

function buildSearchDisplay({ matchedTemplate, templateDescription, totalHits, source, results }) {
  const rows = Array.isArray(results) ? results : [results]
  return normalizeDisplayPayload({
    summary: `${templateDescription || 'Search completed'}${totalHits != null ? ` with ${totalHits} result${totalHits === 1 ? '' : 's'}` : ''}.`,
    highlights: rows.slice(0, 3).map(summarizeResultRow).filter(Boolean),
    evidence: rows.slice(3, 6).map(summarizeResultRow).filter(Boolean),
    metrics: [
      matchedTemplate ? { label: 'Template', value: matchedTemplate } : null,
      source ? { label: 'Source', value: source } : null,
      totalHits != null ? { label: 'Hits', value: String(totalHits) } : null,
    ].filter(Boolean),
  })
}

function buildImprovementDisplay(payload = {}) {
  const suggestion = payload.suggestion || {}

  return normalizeDisplayPayload({
    summary: suggestion.analysis || '',
    highlights: [suggestion.expectedImprovement, suggestion.additionalNotes].filter(Boolean),
    actions: (suggestion.suggestedChanges || []).map(change => {
      const field = change.field || 'setting'
      return `${field}: ${change.oldValue ?? '—'} -> ${change.newValue ?? '—'}${change.reason ? ` (${change.reason})` : ''}`
    }),
    metrics: [
      payload.mlModel ? { label: 'ML Model', value: payload.mlModel.replace(/_/g, ' ') } : null,
      suggestion.confidence ? { label: 'Confidence', value: suggestion.confidence, tone: suggestion.confidence } : null,
    ].filter(Boolean),
  })
}

function getProviderBillingMode(provider = '') {
  if (provider === 'ollama') return 'local'
  if (provider === 'template') return 'internal'
  return 'cloud'
}

function getProviderPricePer1K(provider = '') {
  return PROVIDER_PRICING_PER_1K[provider] || 0
}

function normalizeTokenUsage({
  promptTokens = 0,
  completionTokens = 0,
  totalTokens = null,
  tokensUsed = null,
} = {}) {
  const prompt = Number(promptTokens || 0)
  const completion = Number(completionTokens || 0)
  const total = Number(
    totalTokens != null
      ? totalTokens
      : tokensUsed != null
        ? tokensUsed
        : (prompt + completion)
  ) || 0

  return {
    promptTokens: prompt,
    completionTokens: completion,
    totalTokens: total,
    tokensUsed: total,
  }
}

function estimateCostUsd(provider, totalTokens = 0) {
  return roundCost((Number(totalTokens || 0) / 1000) * getProviderPricePer1K(provider))
}

function buildMetering({
  provider,
  model,
  promptTokens = 0,
  completionTokens = 0,
  totalTokens = null,
  tokensUsed = 0,
  responseTimeMs = 0,
}) {
  const usage = normalizeTokenUsage({
    promptTokens,
    completionTokens,
    totalTokens,
    tokensUsed,
  })

  return {
    provider,
    model,
    promptTokens: usage.promptTokens,
    completionTokens: usage.completionTokens,
    totalTokens: usage.totalTokens,
    tokensUsed: usage.tokensUsed,
    responseTimeMs: Number(responseTimeMs || 0),
    estimatedCostUsd: estimateCostUsd(provider, usage.totalTokens),
    billingMode: getProviderBillingMode(provider),
  }
}

export {
  buildBriefDisplay,
  buildChatDisplay,
  buildDisplayFromText,
  buildImprovementDisplay,
  buildMetering,
  buildSearchDisplay,
  buildTriageDisplay,
  estimateCostUsd,
  getProviderBillingMode,
  getProviderPricePer1K,
  normalizeTokenUsage,
  normalizeDisplayPayload,
}
