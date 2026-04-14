import api from './client.js'

export const AI_TIMEOUT_STORAGE_KEY = 'netpulse.aiTimeoutMs'
export const DEFAULT_AI_TIMEOUT_MS = 90000
export const AI_TIMEOUT_OPTIONS = [
  { value: 30000, label: '30s' },
  { value: 60000, label: '60s' },
  { value: 90000, label: '90s' },
  { value: 120000, label: '120s' },
  { value: 180000, label: '180s' },
]

export function getAIRequestTimeoutMs() {
  if (typeof window === 'undefined') return DEFAULT_AI_TIMEOUT_MS
  const raw = window.localStorage.getItem(AI_TIMEOUT_STORAGE_KEY)
  const parsed = Number(raw)
  return Number.isFinite(parsed) && parsed >= 30000 ? parsed : DEFAULT_AI_TIMEOUT_MS
}

export function setAIRequestTimeoutMs(timeoutMs) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(AI_TIMEOUT_STORAGE_KEY, String(timeoutMs))
}

function withAITimeout(config = {}) {
  return { ...config, timeout: getAIRequestTimeoutMs() }
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
  chat: (messages, context, dateRange, provider, model) =>
    api.post('/api/ai/chat', { messages, context, dateRange, provider, model }, withAITimeout()),
  getChatHistory: () => api.get('/api/ai/chat/history', withAITimeout()),
  compareModels: (question, context, dateRange, modelOverrides) =>
    api.post('/api/ai/compare', { question, context, dateRange, modelOverrides }, withAITimeout()),

  // Search
  search: (question, source, dateRange, provider, model) =>
    api.post('/api/ai/search', { question, source, dateRange, provider, model }, withAITimeout()),
  getSearchHistory: () => api.get('/api/ai/search/history', withAITimeout()),

  // Triage
  triage: (alert, provider, model) =>
    api.post('/api/ai/triage', { alert, provider, model }, withAITimeout()),
  getTriageHistory: () => api.get('/api/ai/triage/history', withAITimeout()),

  // Brief
  generateBrief: (dateRange, provider, model) =>
    api.post('/api/ai/brief/generate', { dateRange, provider, model }, withAITimeout()),
  getLatestBrief: () => api.get('/api/ai/brief/latest', withAITimeout()),
  getBrief: (id) => api.get(`/api/ai/brief/${id}`, withAITimeout()),
  getBriefHistory: () => api.get('/api/ai/brief/history', withAITimeout()),

  // Scores
  getLeaderboard: () => api.get('/api/ai/scores/leaderboard'),
  getProviderStats: () => api.get('/api/ai/scores/provider-stats'),
  getRecentScores: (task) => api.get(`/api/ai/scores/recent/${task}`),
  rateResponse: (scoreId, rating) =>
    api.post(`/api/ai/scores/${scoreId}/rate`, { rating }),

  // Scheduler
  getSchedulerStatus: () => api.get('/api/ai/scheduler/status'),
  startScheduler: (task) => api.post(`/api/ai/scheduler/start/${task}`),
  stopScheduler: (task) => api.post(`/api/ai/scheduler/stop/${task}`),
  runNow: (task) => api.post(`/api/ai/scheduler/run/${task}`),

  // Ollama
  getOllamaStatus: () => api.get('/api/ai/ollama/status'),
  pullModel: (model) => api.post('/api/ai/ollama/pull', { model }),
}

export const mlAPI = {
  // Baseline
  getBaselineStatus: () => api.get('/api/ml/baseline/status'),
  buildBaseline: (metric, daysBack) =>
    api.post('/api/ml/baseline/build', { metric, daysBack }),
  getMetrics: () => api.get('/api/ml/baseline/metrics'),

  // Anomaly
  detectAnomalies: (dateRange, sensitivity, sources) =>
    api.post('/api/ml/anomaly/detect', { dateRange, sensitivity, sources }, withAITimeout()),
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
  requestImprovement: (mlModel, provider, model) =>
    api.post('/api/ml/improve/request', { mlModel, provider, model }, withAITimeout()),
  applyImprovement: (id) => api.post(`/api/ml/improve/${id}/apply`, {}, withAITimeout()),
  rejectImprovement: (id) => api.post(`/api/ml/improve/${id}/reject`, {}, withAITimeout()),
  getImprovementHistory: (model) =>
    api.get('/api/ml/improve/history', withAITimeout({ params: { model } })),
}
