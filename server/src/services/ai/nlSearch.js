import { complete } from './aiRouter.js'
import { getESClient } from '../../config/elasticsearch.js'

const SYSTEM = `You are a log analysis AI. Convert natural language to Elasticsearch query DSL.
Return ONLY valid JSON — no explanation, no markdown.
Indices: firewall-* (FortiGate) and cisco-* (Cisco switches).
Always include a 24h time range unless specified.
Format: { "index": "firewall-*", "body": { ...ES DSL... }, "size": 50 }`

export async function naturalLanguageSearch(question) {
  const raw = await complete(`Convert to ES query: "${question}"`, { system: SYSTEM, maxTokens: 800 })
  const query = JSON.parse(raw.replace(/```json|```/g, '').trim())
  const result = await getESClient().search({ index: query.index, body: query.body, size: query.size || 50 })
  return {
    query,
    total: result.hits.total.value,
    hits: result.hits.hits.map(h => h._source),
  }
}
