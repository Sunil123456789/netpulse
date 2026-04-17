import { useEffect, useRef, useState } from 'react'
import { aiAPI, describeAIRequestError } from '../../../api/ai.js'
import { buildDateRange, getProviderOverrideModels, getReadyProviders } from '../utils/common.js'

export function useBriefData({ range, providerStatus, ollamaStatus, addToast, generationSteps }) {
  const [brief, setBrief] = useState(null)
  const [briefHistory, setBriefHistory] = useState([])
  const [briefLoading, setBriefLoading] = useState(false)
  const [briefProvider, setBriefProvider] = useState(null)
  const [briefModel, setBriefModel] = useState(null)
  const [selectedBrief, setSelectedBrief] = useState(null)
  const [genStep, setGenStep] = useState(0)
  const [starRated, setStarRated] = useState(false)
  const [briefError, setBriefError] = useState(null)
  const [briefStartedAt, setBriefStartedAt] = useState(null)
  const stepTimerRef = useRef(null)
  const abortRef = useRef(null)

  const displayed = selectedBrief || brief
  const availableProviders = getReadyProviders(providerStatus)
  const overrideModels = getProviderOverrideModels(briefProvider, providerStatus, ollamaStatus)

  function normalizeBriefPayload(payload) {
    if (!payload || payload.message === 'No briefs generated yet') return null
    return payload
  }

  useEffect(() => {
    aiAPI.getLatestBrief().then(r => setBrief(normalizeBriefPayload(r.data))).catch(() => null)
    aiAPI.getBriefHistory().then(r => setBriefHistory(r.data || [])).catch(() => null)
  }, [])

  useEffect(() => () => {
    abortRef.current?.abort()
  }, [])

  useEffect(() => {
    if (briefLoading) {
      setBriefStartedAt(Date.now())
      setGenStep(0)
      stepTimerRef.current = setInterval(() => {
        setGenStep(step => (step < generationSteps.length - 1 ? step + 1 : step))
      }, 5000)
    } else {
      clearInterval(stepTimerRef.current)
      setBriefStartedAt(null)
    }

    return () => clearInterval(stepTimerRef.current)
  }, [briefLoading, generationSteps.length])

  async function generateBrief() {
    setBriefLoading(true)
    setSelectedBrief(null)
    setStarRated(false)
    setBriefError(null)
    const controller = new AbortController()
    abortRef.current = controller
    try {
      const { data } = await aiAPI.generateBrief(
        buildDateRange(range),
        briefProvider || undefined,
        briefModel || undefined,
        { signal: controller.signal },
      )
      setBrief(normalizeBriefPayload(data))
      aiAPI.getBriefHistory().then(r => setBriefHistory(r.data || [])).catch(() => null)
      addToast('Brief generated successfully', 'success')
    } catch (err) {
      const error = describeAIRequestError(err, 'Brief generation failed')
      if (error.kind !== 'canceled') {
        setBriefError(error)
        addToast(error.message, 'error')
      }
    } finally {
      abortRef.current = null
      setBriefLoading(false)
    }
  }

  function cancelBriefGeneration() {
    abortRef.current?.abort()
  }

  async function refreshBrief() {
    try {
      const [latestRes, histRes] = await Promise.allSettled([
        aiAPI.getLatestBrief(),
        aiAPI.getBriefHistory(),
      ])
      if (latestRes.status === 'fulfilled') setBrief(normalizeBriefPayload(latestRes.value.data))
      if (histRes.status === 'fulfilled') setBriefHistory(histRes.value.data || [])
      setSelectedBrief(null)
      addToast('Refreshed', 'success')
    } catch {
      addToast('Refresh failed', 'error')
    }
  }

  async function loadHistoryBrief(historyItem) {
    const briefId = historyItem?._id || historyItem?.id
    if (!briefId || historyItem.fullReport) {
      setSelectedBrief(historyItem)
      setStarRated(false)
      return
    }

    try {
      const { data } = await aiAPI.getBrief(briefId)
      setSelectedBrief(normalizeBriefPayload(data) || historyItem)
      setStarRated(false)
    } catch (err) {
      addToast(err.response?.data?.error || err.message, 'error')
    }
  }

  async function rateResponse(star) {
    if (!displayed?.scoreId || starRated) return
    try {
      await aiAPI.rateResponse(displayed.scoreId, star)
      setStarRated(true)
      addToast('Rating saved', 'success')
    } catch {
      addToast('Rating failed', 'error')
    }
  }

  return {
    brief,
    briefHistory,
    briefLoading,
    briefProvider,
    setBriefProvider,
    briefModel,
    setBriefModel,
    briefError,
    briefStartedAt,
    selectedBrief,
    setSelectedBrief,
    genStep,
    starRated,
    setStarRated,
    displayed,
    availableProviders,
    overrideModels,
    generateBrief,
    cancelBriefGeneration,
    retryBriefGeneration: generateBrief,
    refreshBrief,
    loadHistoryBrief,
    rateResponse,
  }
}
