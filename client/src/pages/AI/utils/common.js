import { PROVIDER_MODELS } from '../constants'

export function buildDateRange(range) {
  return range?.type === 'preset'
    ? { from: `now-${range.value}`, to: 'now' }
    : { from: range?.from, to: range?.to }
}

export function formatTimestamp(ts) {
  if (!ts) return '—'
  try {
    return new Date(ts).toLocaleString([], {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return ts
  }
}

export function formatCoveredRange(from, to) {
  if (!from && !to) return '—'
  try {
    const fromText = from ? formatTimestamp(from) : '—'
    const toText = to ? formatTimestamp(to) : '—'
    return `${fromText} → ${toText}`
  } catch {
    return [from, to].filter(Boolean).join(' → ')
  }
}

export function formatMetricName(metric) {
  return (metric || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

export function getReadyProviders(providerStatus) {
  return Object.entries(providerStatus || {})
    .filter(([, value]) => value?.ready)
    .map(([provider]) => provider)
}

export function getProviderOverrideModels(provider, providerStatus, ollamaStatus) {
  if (!provider) return []
  if (provider === 'ollama') {
    const ollamaModels = ollamaStatus?.models || providerStatus?.ollama?.models || []
    return ollamaModels.map(model => model.name)
  }
  return (PROVIDER_MODELS[provider] || []).slice(1)
}
