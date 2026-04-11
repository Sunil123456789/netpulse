import api from './client'
export const logsAPI = {
  getSOCStats: (p) => api.get('/api/stats/soc', { params: p }),
  getNOCStats: (p) => api.get('/api/stats/noc', { params: p }),
  getTrafficOverTime: (p) => api.get('/api/logs/traffic/timeline', { params: p }),
  getTopThreats: (p) => api.get('/api/logs/threats/top', { params: p }),
  getDeniedConnections: (p) => api.get('/api/logs/denied', { params: p }),
  getRecentEvents: (p) => api.get('/api/logs/events/recent', { params: p }),
  getGeoData: (p) => api.get('/api/logs/geo', { params: p }),
  getInterfaceEvents: (p) => api.get('/api/logs/interfaces', { params: p }),
  getMacFlapping: (p) => api.get('/api/logs/macflap', { params: p }),
}
