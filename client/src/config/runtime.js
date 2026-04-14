function isLocalDevBrowser() {
  if (typeof window === 'undefined') return false
  const { hostname, port } = window.location
  return ['localhost', '127.0.0.1'].includes(hostname) && ['3000', '4173', '5173'].includes(port)
}

export function getApiBaseUrl() {
  if (import.meta.env.VITE_API_URL) return import.meta.env.VITE_API_URL
  return isLocalDevBrowser() ? 'http://localhost:5000' : ''
}

export function getSocketUrl() {
  if (import.meta.env.VITE_WS_URL) return import.meta.env.VITE_WS_URL
  if (typeof window === 'undefined') return 'http://localhost:5000'
  return isLocalDevBrowser() ? 'http://localhost:5000' : window.location.origin
}
