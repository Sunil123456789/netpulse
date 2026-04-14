const VALID_PROVIDERS = ['claude', 'openai', 'ollama']

export function getPreferredProvider() {
  const configured = String(process.env.AI_PROVIDER || '').trim().toLowerCase()
  if (VALID_PROVIDERS.includes(configured)) return configured
  if (process.env.OLLAMA_HOST) return 'ollama'
  if (process.env.ANTHROPIC_API_KEY) return 'claude'
  if (process.env.OPENAI_API_KEY) return 'openai'
  return 'ollama'
}

export function getTaskDefaults() {
  const provider = getPreferredProvider()

  return [
    { task: 'chat',       provider, model: 'auto', autoEnabled: false, schedule: 'manual' },
    { task: 'anomaly',    provider: 'ollama', model: 'auto', autoEnabled: false, schedule: 'every_hour' },
    { task: 'triage',     provider, model: 'auto', autoEnabled: false, schedule: 'manual' },
    { task: 'brief',      provider, model: 'auto', autoEnabled: false, schedule: 'daily_6am' },
    { task: 'search',     provider, model: 'auto', autoEnabled: false, schedule: 'manual' },
    { task: 'comparison', provider, model: 'auto', autoEnabled: false, schedule: 'manual' },
  ]
}

export function getTaskDefault(task) {
  return getTaskDefaults().find(item => item.task === task) || null
}
