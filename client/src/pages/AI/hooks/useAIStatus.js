import { useEffect, useState } from 'react'
import { aiAPI } from '../../../api/ai.js'

export function useAIStatus() {
  const [configs, setConfigs] = useState([])
  const [providerStatus, setProviderStatus] = useState(null)
  const [ollamaStatus, setOllamaStatus] = useState(null)
  const [schedulerStatus, setSchedulerStatus] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  async function fetchAll() {
    try {
      const [cfgRes, provRes, ollamaRes, schedRes] = await Promise.allSettled([
        aiAPI.getConfigs(),
        aiAPI.getProviderStatus(),
        aiAPI.getOllamaStatus(),
        aiAPI.getSchedulerStatus(),
      ])

      if (cfgRes.status === 'fulfilled') setConfigs(cfgRes.value.data)
      if (provRes.status === 'fulfilled') setProviderStatus(provRes.value.data)
      if (ollamaRes.status === 'fulfilled') setOllamaStatus(ollamaRes.value.data)
      if (schedRes.status === 'fulfilled') setSchedulerStatus(schedRes.value.data)

      setError(null)
    } catch (err) {
      setError(err.response?.data?.error || err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchAll()
    const interval = setInterval(fetchAll, 60000)
    return () => clearInterval(interval)
  }, [])

  const activeProvider = providerStatus
    ? Object.entries(providerStatus).find(([, value]) => value.ready)?.[0] ?? 'ollama'
    : null

  return {
    configs,
    setConfigs,
    providerStatus,
    ollamaStatus,
    schedulerStatus,
    setSchedulerStatus,
    loading,
    error,
    fetchAll,
    activeProvider,
  }
}
