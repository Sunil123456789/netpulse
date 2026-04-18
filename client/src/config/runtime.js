function isLocalDevBrowser() {
  if (typeof window === 'undefined') return false
  const { hostname, port } = window.location
  return ['localhost', '127.0.0.1'].includes(hostname) && ['3000', '4173', '5173'].includes(port)
}

function normalizeLocalUrl(rawUrl) {
  if (typeof window === 'undefined' || !rawUrl) return rawUrl

  try {
    const url = new URL(rawUrl, window.location.origin)
    if (['localhost', '127.0.0.1'].includes(url.hostname) && ['localhost', '127.0.0.1'].includes(window.location.hostname)) {
      url.hostname = window.location.hostname
      return url.toString().replace(/\/$/, '')
    }
    return url.toString().replace(/\/$/, '')
  } catch {
    return rawUrl
  }
}

export function getApiBaseUrl() {
  if (import.meta.env.VITE_API_URL) return normalizeLocalUrl(import.meta.env.VITE_API_URL)
  return isLocalDevBrowser() ? `${window.location.protocol}//${window.location.hostname}:5000` : ''
}

export function getSocketUrl() {
  if (import.meta.env.VITE_WS_URL) return normalizeLocalUrl(import.meta.env.VITE_WS_URL)
  if (typeof window === 'undefined') return 'http://localhost:5000'
  return isLocalDevBrowser() ? `${window.location.protocol}//${window.location.hostname}:5000` : window.location.origin
}

export function getOpenWebUiUrl() {
  return String(import.meta.env.VITE_OPEN_WEBUI_URL || '').trim()
}
