import api from './client.js'

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
    api.post('/api/ai/chat', { messages, context, dateRange, provider, model }),
  getChatHistory: () => api.get('/api/ai/chat/history'),
  compareModels: (question, context, dateRange, modelOverrides) =>
    api.post('/api/ai/compare', { question, context, dateRange, modelOverrides }),

  // Search
  search: (question, source, dateRange, provider, model) =>
    api.post('/api/ai/search', { question, source, dateRange, provider, model }),
  getSearchHistory: () => api.get('/api/ai/search/history'),

  // Triage
  triage: (alert, provider, model) =>
    api.post('/api/ai/triage', { alert, provider, model }),
  getTriageHistory: () => api.get('/api/ai/triage/history'),

  // Brief
  generateBrief: (dateRange, provider, model) =>
    api.post('/api/ai/brief/generate', { dateRange, provider, model }),
  getLatestBrief: () => api.get('/api/ai/brief/latest'),
  getBrief: (id) => api.get(`/api/ai/brief/${id}`),
  getBriefHistory: () => api.get('/api/ai/brief/history'),

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
    api.post('/api/ml/anomaly/detect', { dateRange, sensitivity, sources }),
  getAnomalyHistory: () => api.get('/api/ml/anomaly/history'),
  getAnomalyRun: (id) => api.get(`/api/ml/anomaly/${id}`),
  saveAnomalyFeedback: (id, anomalyIndex, feedback) =>
    api.post(`/api/ml/anomaly/${id}/feedback`, { anomalyIndex, feedback }),

  // Threats
  detectPortScans: (dateRange, portThreshold) =>
    api.post('/api/ml/threats/port-scan', { dateRange, portThreshold }),
  detectBruteForce: (dateRange, failureThreshold) =>
    api.post('/api/ml/threats/brute-force', { dateRange, failureThreshold }),
  detectGeoAnomalies: (dateRange, expectedCountries) =>
    api.post('/api/ml/threats/geo', { dateRange, expectedCountries }),
  detectAllThreats: (dateRange) =>
    api.post('/api/ml/threats/all', { dateRange }),

  // Improvement
  getStats: (model) => api.get(`/api/ml/improve/stats/${model}`),
  requestImprovement: (mlModel, provider, model) =>
    api.post('/api/ml/improve/request', { mlModel, provider, model }),
  applyImprovement: (id) => api.post(`/api/ml/improve/${id}/apply`),
  rejectImprovement: (id) => api.post(`/api/ml/improve/${id}/reject`),
  getImprovementHistory: (model) =>
    api.get('/api/ml/improve/history', { params: { model } }),
}
