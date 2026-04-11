import api from './client'
export const ticketsAPI = {
  getAll: (p) => api.get('/api/tickets', { params: p }),
  getById: (id) => api.get(`/api/tickets/${id}`),
  create: (data) => api.post('/api/tickets', data),
  update: (id, data) => api.put(`/api/tickets/${id}`, data),
  addComment: (id, message) => api.post(`/api/tickets/${id}/comments`, { message }),
  close: (id) => api.patch(`/api/tickets/${id}/close`),
}
