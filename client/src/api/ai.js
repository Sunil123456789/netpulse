import api from './client.js'

export const AI_TIMEOUT_STORAGE_KEY = 'netpulse.aiTimeoutMs'
export const DEFAULT_AI_TIMEOUT_MS = 90000
export const DEFAULT_OLLAMA_CHAT_TIMEOUT_MS = 900000
export const PROVIDER_MIN_TIMEOUT_MS = {
  ollama: 180000,
}
export const AI_TIMEOUT_OPTIONS = [
  { value: 30000, label: '30s' },
  { value: 60000, label: '60s' },
  { value: 90000, label: '90s' },
  { value: 120000, label: '120s' },
  { value: 180000, label: '180s' },
  { value: 300000, label: '300s' },
  { value: 600000, label: '600s' },
  { value: 900000, label: '900s' },
]

export function getAIRequestTimeoutMs(provider = null) {
  const minimumTimeoutMs = PROVIDER_MIN_TIMEOUT_MS[provider] || DEFAULT_AI_TIMEOUT_MS
  if (typeof window === 'undefined') return minimumTimeoutMs
  const raw = window.localStorage.getItem(AI_TIMEOUT_STORAGE_KEY)
  const parsed = Number(raw)
  const selectedTimeoutMs = Number.isFinite(parsed) && parsed >= 30000 ? parsed : DEFAULT_AI_TIMEOUT_MS
  return Math.max(selectedTimeoutMs, minimumTimeoutMs)
}

export function getAIChatRequestTimeoutMs(provider = null) {
  const genericTimeoutMs = getAIRequestTimeoutMs(provider)
  return provider === 'ollama'
    ? Math.max(genericTimeoutMs, DEFAULT_OLLAMA_CHAT_TIMEOUT_MS)
    : genericTimeoutMs
}

export function setAIRequestTimeoutMs(timeoutMs) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(AI_TIMEOUT_STORAGE_KEY, String(timeoutMs))
}

function resolveAITimeoutMs(task, provider = null) {
  return task === 'chat'
    ? getAIChatRequestTimeoutMs(provider)
    : getAIRequestTimeoutMs(provider)
}

function withAITimeout(config = {}, provider = null, task = 'generic') {
  const { timeoutProvider, timeoutTask, ...requestConfig } = config
  return {
    ...requestConfig,
    timeout: resolveAITimeoutMs(timeoutTask || task, provider || timeoutProvider || null),
  }
}

function formatAIRequestTarget(provider = null, model = null) {
  return [provider, model].filter(Boolean).join(' / ')
}

export function describeAIRequestError(err, fallbackMessage = 'Request failed', provider = null, options = {}) {
  const payload = err?.response?.data || {}
  const message = payload.error || payload.message || err?.message || fallbackMessage
  const kind = payload.kind || null
  const errorProvider = payload.provider || provider || null
  const errorModel = payload.model || null
  const timeoutMs = Number(payload.timeoutMs) || resolveAITimeoutMs(options.task || 'generic', errorProvider)

  if (err?.code === 'ERR_CANCELED' || kind === 'canceled' || /aborted|canceled/i.test(message)) {
    return {
      kind: 'canceled',
      message: 'Request canceled',
      detail: payload.detail || message,
      provider: errorProvider,
      model: errorModel,
    }
  }

  if (kind === 'model_missing') {
    return {
      kind,
      message,
      detail: payload.detail || message,
      provider: errorProvider,
      model: errorModel,
      timeoutMs: payload.timeoutMs || null,
    }
  }

  if (kind === 'provider_unreachable') {
    return {
      kind,
      message,
      detail: payload.detail || message,
      provider: errorProvider,
      model: errorModel,
      timeoutMs: payload.timeoutMs || null,
    }
  }

  if (kind === 'timeout' || err?.code === 'ECONNABORTED' || /timed out|timeout/i.test(message)) {
    const targetLabel = formatAIRequestTarget(errorProvider, errorModel)
    return {
      kind: 'timeout',
      message: kind === 'timeout' && message !== fallbackMessage
        ? message
        : `${targetLabel || 'This request'} timed out after ${Math.round(timeoutMs / 1000)} seconds.`,
      detail: payload.detail || message,
      provider: errorProvider,
      model: errorModel,
      timeoutMs,
    }
  }

  return {
    kind: kind || 'generic',
    message,
    detail: payload.detail || message,
    provider: errorProvider,
    model: errorModel,
    timeoutMs: payload.timeoutMs || null,
  }
}

export const aiAPI = {
  // Status
  getStatus: () => api.get('/api/ai/status'),
  getProviderStatus: () => api.get('/api/ai/provider/status'),

  // Config
  getConfigs: () => api.get('/api/ai/config'),
  getConfig: (task) => api.get(`/api/ai/config/${task}`),
  updateConfig: (task, data) => api.put(`/api/ai/config/${task}`, data),
  resetConfig: (task) => api.post(`/api/ai/config/${task}/reset`),
  resetAllConfigs: () => api.post('/api/ai/config/reset-all'),
  toggleAuto: (task) => api.post(`/api/ai/config/${task}/toggle-auto`),

  // Context
  getContext: (params) => api.get('/api/ai/context', { params }),

  // Chat
  chat: (messages, context, dateRange, provider, model, config = {}) =>
    api.post('/api/ai/chat', { messages, context, dateRange, provider, model }, withAITimeout(config, provider, 'chat')),
  getChatHistory: () => api.get('/api/ai/chat/history', withAITimeout()),
  compareModels: (question, context, dateRange, modelOverrides, targets, config = {}) =>
    api.post('/api/ai/compare', { question, context, dateRange, modelOverrides, targets }, withAITimeout(config)),

  // Search
  search: (question, source, dateRange, provider, model, config = {}) =>
    api.post('/api/ai/search', { question, source, dateRange, provider, model }, withAITimeout(config)),
  getSearchHistory: () => api.get('/api/ai/search/history', withAITimeout()),

  // Triage
  triage: (alert, provider, model, config = {}) =>
    api.post('/api/ai/triage', { alert, provider, model }, withAITimeout(config)),
  getTriageHistory: () => api.get('/api/ai/triage/history', withAITimeout()),

  // Brief
  generateBrief: (dateRange, provider, model, config = {}) =>
    api.post('/api/ai/brief/generate', { dateRange, provider, model }, withAITimeout(config)),
  getLatestBrief: () => api.get('/api/ai/brief/latest', withAITimeout()),
  getBrief: (id) => api.get(`/api/ai/brief/${id}`, withAITimeout()),
  getBriefHistory: () => api.get('/api/ai/brief/history', withAITimeout()),

  // Scores
  getLeaderboard: () => api.get('/api/ai/scores/leaderboard'),
  getProviderStats: () => api.get('/api/ai/scores/provider-stats'),
  getRecentScores: (task) => api.get(`/api/ai/scores/recent/${task}`),
  rateResponse: (scoreId, rating) =>
    api.post(`/api/ai/scores/${scoreId}/rate`, { rating }),

  // Analytics
  getAnalyticsOverview: (params, config = {}) => api.get('/api/ai/analytics/overview', { ...config, params }),
  getAnalyticsRuns: (params, config = {}) => api.get('/api/ai/analytics/runs', { ...config, params }),

  // Scheduler
  getSchedulerStatus: () => api.get('/api/ai/scheduler/status'),
  startScheduler: (task) => api.post(`/api/ai/scheduler/start/${task}`),
  stopScheduler: (task) => api.post(`/api/ai/scheduler/stop/${task}`),
  runNow: (task) => api.post(`/api/ai/scheduler/run/${task}`),

  // Ollama
  getOllamaStatus: () => api.get('/api/ai/ollama/status'),
  pullModel: (model) => api.post('/api/ai/ollama/pull', { model }),

  // Benchmark
  benchmarkModel: (model, prompt, rounds = 1, options = {}) => {
    const { testType = 'generic', expectedAnswer = null, ...config } = options
    return api.post('/api/ai/benchmark', { model, prompt, rounds, testType, expectedAnswer }, { ...config, timeout: 600000 })
  },
}

export const mlAPI = {
  // Baseline
  getBaselineStatus: () => api.get('/api/ml/baseline/status'),
  buildBaseline: (metric, daysBack) =>
    api.post('/api/ml/baseline/build', { metric, daysBack }),
  getMetrics: () => api.get('/api/ml/baseline/metrics'),

  // Anomaly
  detectAnomalies: (dateRange, sensitivity, sources, config = {}) =>
    api.post('/api/ml/anomaly/detect', { dateRange, sensitivity, sources }, withAITimeout(config)),
  getAnomalyHistory: () => api.get('/api/ml/anomaly/history', withAITimeout()),
  getAnomalyRun: (id) => api.get(`/api/ml/anomaly/${id}`, withAITimeout()),
  saveAnomalyFeedback: (id, anomalyIndex, feedback) =>
    api.post(`/api/ml/anomaly/${id}/feedback`, { anomalyIndex, feedback }, withAITimeout()),

  // Threats
  detectPortScans: (dateRange, portThreshold) =>
    api.post('/api/ml/threats/port-scan', { dateRange, portThreshold }, withAITimeout()),
  detectBruteForce: (dateRange, failureThreshold) =>
    api.post('/api/ml/threats/brute-force', { dateRange, failureThreshold }, withAITimeout()),
  detectGeoAnomalies: (dateRange, expectedCountries) =>
    api.post('/api/ml/threats/geo', { dateRange, expectedCountries }, withAITimeout()),
  detectAllThreats: (dateRange) =>
    api.post('/api/ml/threats/all', { dateRange }, withAITimeout()),

  // Improvement
  getStats: (model) => api.get(`/api/ml/improve/stats/${model}`),
  requestImprovement: (mlModel, provider, model, config = {}) =>
    api.post('/api/ml/improve/request', { mlModel, provider, model }, withAITimeout(config)),
  applyImprovement: (id) => api.post(`/api/ml/improve/${id}/apply`, {}, withAITimeout()),
  rejectImprovement: (id) => api.post(`/api/ml/improve/${id}/reject`, {}, withAITimeout()),
  getImprovementHistory: (model) =>
    api.get('/api/ml/improve/history', withAITimeout({ params: { model } })),
}
