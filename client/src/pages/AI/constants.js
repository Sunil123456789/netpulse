export const C = {
  accent: '#4f7ef5',
  accent2: '#7c5cfc',
  green: '#22d3a0',
  red: '#f5534f',
  amber: '#f5a623',
  cyan: '#22d3ee',
  text: '#e8eaf2',
  text2: '#8b90aa',
  text3: '#555a72',
}

export const TABS = [
  { id: 'chat', label: 'Chat', icon: '💬' },
  { id: 'anomaly', label: 'Anomaly', icon: '📈' },
  { id: 'triage', label: 'Triage', icon: '🎯' },
  { id: 'brief', label: 'Brief', icon: '📋' },
  { id: 'search', label: 'Search', icon: '🔍' },
  { id: 'modellab', label: 'Model Lab', icon: '🧪' },
  { id: 'settings', label: 'Settings', icon: '⚙️', capability: 'manageAISettings' },
]

export const PROVIDER_MODELS = {
  claude: ['auto', 'claude-sonnet-4-20250514', 'claude-opus-4-20250514'],
  openai: ['auto', 'gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo'],
  ollama: [],
}

export const CTX_OPTIONS = [
  { value: 'all', label: 'All Sources' },
  { value: 'soc', label: 'SOC Only' },
  { value: 'noc', label: 'NOC Only' },
  { value: 'zabbix', label: 'Infrastructure' },
]

export const SCHEDULE_LABELS = {
  every_15m: 'Every 15 min',
  every_hour: 'Every hour',
  every_6h: 'Every 6 h',
  every_12h: 'Every 12 h',
  daily_6am: 'Daily 6am',
  daily_9am: 'Daily 9am',
  manual: 'Manual',
}

export const POPULAR_MODELS = ['llama3.2', 'llama3.2:3b', 'mistral', 'codellama', 'gemma2', 'phi3']

export const selSx = {
  background: 'var(--bg4)',
  border: '1px solid var(--border)',
  color: 'var(--text)',
  borderRadius: 6,
  fontSize: 11,
  padding: '4px 8px',
  fontFamily: 'var(--mono)',
  cursor: 'pointer',
}
