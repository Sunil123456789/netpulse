import api from './client'

export const zabbixAPI = {
  getOverview: () => api.get('/api/zabbix/overview'),
  getHosts:    () => api.get('/api/zabbix/hosts'),
  getProblems: () => api.get('/api/zabbix/problems'),
  getGroups:   () => api.get('/api/zabbix/groups'),
  getEvents:   () => api.get('/api/zabbix/events'),
}
