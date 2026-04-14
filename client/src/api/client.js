import axios from 'axios'
import { useAuthStore } from '../store/authStore'
import { getApiBaseUrl } from '../config/runtime'

const api = axios.create({ baseURL: getApiBaseUrl(), timeout: 30000 })
api.interceptors.request.use(config => {
  const token = useAuthStore.getState().token
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})
api.interceptors.response.use(res => res, err => {
  if (err.response?.status === 401) { useAuthStore.getState().logout(); window.location.href = '/login' }
  return Promise.reject(err)
})
export default api
