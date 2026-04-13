import api from './client'

export const zabbixAPI = {
  getStats:      ()   => api.get('/api/zabbix/stats'),
  getHosts:      ()   => api.get('/api/zabbix/hosts'),
  getProblems:   ()   => api.get('/api/zabbix/problems'),
  getGroups:     ()   => api.get('/api/zabbix/groups'),
  getEvents:     ()   => api.get('/api/zabbix/events'),
  getHostMetrics:(id) => api.get(`/api/zabbix/host/${id}/metrics`),
}
