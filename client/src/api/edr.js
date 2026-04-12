import api from './client'

export const edrAPI = {
  getStats:        (params) => api.get('/api/edr/stats',          { params }),
  getTimeline:     (params) => api.get('/api/edr/timeline',        { params }),
  getRecentEvents: (params) => api.get('/api/edr/events/recent',   { params }),
  getTopEndpoints: (params) => api.get('/api/edr/top/endpoints',   { params }),
  getTopDevices:   (params) => api.get('/api/edr/top/devices',     { params }),
  getTopUsers:     (params) => api.get('/api/edr/top/users',       { params }),
  getActivityTypes:(params) => api.get('/api/edr/activity/types',  { params }),
  getSites:        (params) => api.get('/api/edr/sites',           { params }),
}
