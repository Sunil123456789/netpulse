import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

function loadDotEnv() {
  const envPath = resolve(process.cwd(), '.env')
  if (!existsSync(envPath)) return

  const lines = readFileSync(envPath, 'utf8').split(/\r?\n/)
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    const value = trimmed.slice(eq + 1).trim()
    if (!(key in process.env)) process.env[key] = value
  }
}

function parseArgs(argv) {
  const flags = new Set(argv.slice(2))
  return {
    full: flags.has('--full'),
    help: flags.has('--help') || flags.has('-h'),
  }
}

function getBaseUrl() {
  const port = process.env.PORT || process.env.APP_PORT || '5000'
  return process.env.NP_E2E_BASE_URL || `http://localhost:${port}`
}

async function jsonFetch(url, options = {}) {
  const res = await fetch(url, options)
  const text = await res.text()
  let data = null
  try { data = text ? JSON.parse(text) : null } catch { data = text }

  if (!res.ok) {
    const message = typeof data === 'object' && data?.error ? data.error : `${res.status} ${res.statusText}`
    throw new Error(`${options.method || 'GET'} ${url} failed: ${message}`)
  }

  return data
}

function logStep(name) {
  console.log(`\n[STEP] ${name}`)
}

function assertEnv(name) {
  const value = process.env[name]
  if (!value) throw new Error(`Missing required env var: ${name}`)
  return value
}

async function main() {
  loadDotEnv()
  const { full, help } = parseArgs(process.argv)
  if (help) {
    console.log(`NetPulse AI/ML E2E smoke runner

Usage:
  node scripts/e2e-ai-workflow.mjs [--full]

Required env:
  NP_E2E_EMAIL
  NP_E2E_PASSWORD

Optional env:
  NP_E2E_BASE_URL   default: http://localhost:$PORT or http://localhost:$APP_PORT

Modes:
  default  Runs auth, search, anomaly, triage, stats/history, and safe read checks
  --full   Also runs provider-backed compare, improvement request, and brief generation`)
    return
  }

  const baseUrl = getBaseUrl()
  const email = assertEnv('NP_E2E_EMAIL')
  const password = assertEnv('NP_E2E_PASSWORD')

  console.log(`NetPulse E2E starting against ${baseUrl}`)

  logStep('Health check')
  const health = await jsonFetch(`${baseUrl}/health`)
  console.log(`Health OK: ${health.status}`)

  logStep('Login')
  const login = await jsonFetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  const token = login.token
  if (!token) throw new Error('Login succeeded but token missing')
  console.log(`Authenticated as ${login.user?.email || email}`)

  const authHeaders = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  }

  logStep('Session validation')
  const me = await jsonFetch(`${baseUrl}/api/auth/me`, { headers: authHeaders })
  console.log(`Session user: ${me.email}`)

  logStep('AI provider/config checks')
  const providerStatus = await jsonFetch(`${baseUrl}/api/ai/provider/status`, { headers: authHeaders })
  const configs = await jsonFetch(`${baseUrl}/api/ai/config`, { headers: authHeaders })
  console.log(`Providers checked, ${configs.length} AI task configs loaded`)

  logStep('Natural language search')
  const search = await jsonFetch(`${baseUrl}/api/ai/search`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      question: 'Top denied IPs in the last 24 hours',
      source: 'auto',
      dateRange: { from: 'now-24h', to: 'now' },
    }),
  })
  console.log(`Search template: ${search.matchedTemplate}, hits: ${search.totalHits}`)

  logStep('Anomaly detection')
  const anomaly = await jsonFetch(`${baseUrl}/api/ml/anomaly/detect`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      dateRange: { from: new Date(Date.now() - 60 * 60 * 1000).toISOString(), to: new Date().toISOString() },
      sensitivity: 2.0,
      sources: ['firewall', 'cisco', 'sentinel'],
    }),
  })
  console.log(`Anomaly run complete, found: ${anomaly.totalAnomalies ?? anomaly.anomalies?.length ?? 0}`)

  logStep('Triage workflow')
  const triage = await jsonFetch(`${baseUrl}/api/ai/triage`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      alert: {
        name: 'E2E Test Alert',
        type: 'ips',
        srcip: '185.220.101.3',
        dstip: '10.0.0.45',
        srccountry: 'Russia',
        attack: 'SQL.Injection.Login.Bypass',
        severity: 'high',
        site_name: 'Gurgaon-WH',
        device_name: 'Gurgaon-FW-01',
        message: 'Synthetic alert used for end-to-end validation',
      },
    }),
  })
  console.log(`Triage complete via ${triage.provider || 'unknown'} / ${triage.model || 'unknown'}`)

  logStep('History and ML stats')
  const [searchHistory, triageHistory, briefHistory, improvementStats, improvementHistory] = await Promise.all([
    jsonFetch(`${baseUrl}/api/ai/search/history`, { headers: authHeaders }),
    jsonFetch(`${baseUrl}/api/ai/triage/history`, { headers: authHeaders }),
    jsonFetch(`${baseUrl}/api/ai/brief/history`, { headers: authHeaders }),
    jsonFetch(`${baseUrl}/api/ml/improve/stats/baseline_anomaly`, { headers: authHeaders }),
    jsonFetch(`${baseUrl}/api/ml/improve/history?model=baseline_anomaly`, { headers: authHeaders }),
  ])
  console.log(`History OK: search=${searchHistory.length}, triage=${triageHistory.length}, brief=${briefHistory.length}, improvements=${improvementHistory.length}`)
  console.log(`Improvement stats: runs=${improvementStats.totalRuns ?? 0}, anomalies=${improvementStats.totalAnomalies ?? 0}`)

  if (full) {
    logStep('Model comparison')
    const compare = await jsonFetch(`${baseUrl}/api/ai/compare`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        question: 'Summarize the current network risk posture',
        context: 'all',
        dateRange: { from: 'now-24h', to: 'now' },
        modelOverrides: {},
      }),
    })
    console.log(`Comparison complete, winner: ${compare.winner?.provider || 'none'}`)

    logStep('ML improvement request')
    const improvement = await jsonFetch(`${baseUrl}/api/ml/improve/request`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ mlModel: 'baseline_anomaly' }),
    })
    console.log(`Improvement suggestion created: ${improvement.id}`)

    logStep('Brief generation')
    const brief = await jsonFetch(`${baseUrl}/api/ai/brief/generate`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        dateRange: { from: 'now-24h', to: 'now' },
      }),
    })
    console.log(`Brief generated: ${brief.title || 'NetPulse Intelligence Brief'}`)
  } else {
    console.log('\nSkipped provider-backed compare/improvement/brief generation. Run with --full to include them.')
  }

  console.log('\nNetPulse E2E workflow completed successfully.')
}

main().catch(err => {
  console.error(`\nE2E failed: ${err.message}`)
  process.exit(1)
})
