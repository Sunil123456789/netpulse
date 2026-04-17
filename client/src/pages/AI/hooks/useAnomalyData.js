import { useEffect, useState } from 'react'
import { aiAPI, mlAPI } from '../../../api/ai.js'
import { buildDateRange, getProviderOverrideModels, getReadyProviders } from '../utils/common.js'

export function useAnomalyData({ range, providerStatus, ollamaStatus, addToast }) {
  const [anomalyResult, setAnomalyResult] = useState(null)
  const [anomalyHistory, setAnomalyHistory] = useState([])
  const [baselineStatus, setBaselineStatus] = useState([])
  const [anomalyLoading, setAnomalyLoading] = useState(false)
  const [baselineLoading, setBaselineLoading] = useState(false)
  const [sensitivity, setSensitivity] = useState(2.0)
  const [sources, setSources] = useState(['firewall', 'cisco', 'sentinel'])
  const [feedback, setFeedback] = useState({})
  const [mlModel, setMlModel] = useState('baseline_anomaly')
  const [improvementStats, setImprovementStats] = useState(null)
  const [improvementHistory, setImprovementHistory] = useState([])
  const [improvementLoading, setImprovementLoading] = useState(false)
  const [improvementProvider, setImprovementProvider] = useState(null)
  const [improvementModel, setImprovementModel] = useState(null)
  const [latestImprovement, setLatestImprovement] = useState(null)

  const availableProviders = getReadyProviders(providerStatus)
  const improvementOverrideModels = getProviderOverrideModels(improvementProvider, providerStatus, ollamaStatus)

  function refreshAnomalyHistory() {
    return mlAPI.getAnomalyHistory().then(r => setAnomalyHistory(r.data || [])).catch(() => null)
  }

  function refreshBaselineStatus() {
    return mlAPI.getBaselineStatus().then(r => setBaselineStatus(r.data || [])).catch(() => null)
  }

  useEffect(() => {
    refreshAnomalyHistory()
    refreshBaselineStatus()
  }, [])

  useEffect(() => {
    Promise.allSettled([
      mlAPI.getStats(mlModel),
      mlAPI.getImprovementHistory(mlModel),
    ]).then(([statsRes, historyRes]) => {
      if (statsRes.status === 'fulfilled') setImprovementStats(statsRes.value.data || null)
      if (historyRes.status === 'fulfilled') setImprovementHistory(historyRes.value.data || [])
    })
  }, [mlModel])

  function toggleSource(src) {
    setSources(prev => (prev.includes(src) ? prev.filter(s => s !== src) : [...prev, src]))
  }

  async function runDetection() {
    setAnomalyLoading(true)
    try {
      const { data } = await mlAPI.detectAnomalies(buildDateRange(range), sensitivity, sources)
      setAnomalyResult(data)
      setFeedback({})
      refreshAnomalyHistory()
      addToast(`Detection complete — ${data.anomalies?.length ?? 0} anomalies found`, 'success')
    } catch (err) {
      addToast(err.response?.data?.error || err.message, 'error')
    } finally {
      setAnomalyLoading(false)
    }
  }

  async function buildBaseline() {
    setBaselineLoading(true)
    try {
      await mlAPI.buildBaseline(null, 7)
      addToast('Baseline build started (7 days back)', 'success')
      setTimeout(() => {
        refreshBaselineStatus()
      }, 2000)
    } catch (err) {
      addToast(err.response?.data?.error || err.message, 'error')
    } finally {
      setBaselineLoading(false)
    }
  }

  async function runScheduled() {
    try {
      await aiAPI.runNow('anomaly')
      addToast('Anomaly scheduler triggered', 'success')
    } catch (err) {
      addToast(err.response?.data?.error || err.message, 'error')
    }
  }

  async function saveFeedback(runId, idx, value) {
    const key = `${runId}_${idx}`
    setFeedback(prev => ({ ...prev, [key]: value }))
    try {
      await mlAPI.saveAnomalyFeedback(runId, idx, value)
      addToast('Feedback saved', 'success')
    } catch (err) {
      setFeedback(prev => {
        const next = { ...prev }
        delete next[key]
        return next
      })
      addToast(err.response?.data?.error || err.message, 'error')
    }
  }

  async function requestImprovement() {
    setImprovementLoading(true)
    try {
      const { data } = await mlAPI.requestImprovement(
        mlModel,
        improvementProvider || undefined,
        improvementModel || undefined,
      )
      setLatestImprovement(data)
      const [statsRes, historyRes] = await Promise.allSettled([
        mlAPI.getStats(mlModel),
        mlAPI.getImprovementHistory(mlModel),
      ])
      if (statsRes.status === 'fulfilled') setImprovementStats(statsRes.value.data || null)
      if (historyRes.status === 'fulfilled') setImprovementHistory(historyRes.value.data || [])
      addToast('Improvement suggestion generated', 'success')
    } catch (err) {
      addToast(err.response?.data?.error || err.message, 'error')
    } finally {
      setImprovementLoading(false)
    }
  }

  async function applySuggestion(id) {
    try {
      const { data } = await mlAPI.applyImprovement(id)
      setLatestImprovement(prev => (prev?.id === id ? { ...prev, status: data.status, appliedAt: data.appliedAt } : prev))
      mlAPI.getImprovementHistory(mlModel).then(r => setImprovementHistory(r.data || [])).catch(() => null)
      addToast('Improvement marked as applied', 'success')
    } catch (err) {
      addToast(err.response?.data?.error || err.message, 'error')
    }
  }

  async function rejectSuggestion(id) {
    try {
      await mlAPI.rejectImprovement(id)
      setLatestImprovement(prev => (prev?.id === id ? { ...prev, status: 'rejected' } : prev))
      mlAPI.getImprovementHistory(mlModel).then(r => setImprovementHistory(r.data || [])).catch(() => null)
      addToast('Improvement rejected', 'success')
    } catch (err) {
      addToast(err.response?.data?.error || err.message, 'error')
    }
  }

  return {
    anomalyResult,
    anomalyHistory,
    baselineStatus,
    anomalyLoading,
    baselineLoading,
    sensitivity,
    setSensitivity,
    sources,
    toggleSource,
    feedback,
    mlModel,
    setMlModel,
    improvementStats,
    improvementHistory,
    improvementLoading,
    improvementProvider,
    setImprovementProvider,
    improvementModel,
    setImprovementModel,
    latestImprovement,
    availableProviders,
    improvementOverrideModels,
    runDetection,
    buildBaseline,
    runScheduled,
    saveFeedback,
    requestImprovement,
    applySuggestion,
    rejectSuggestion,
  }
}
