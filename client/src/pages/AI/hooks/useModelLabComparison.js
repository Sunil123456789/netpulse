import { useEffect, useRef, useState } from 'react'
import { aiAPI, describeAIRequestError } from '../../../api/ai.js'
import { buildDateRange, getProviderOverrideModels } from '../utils/common.js'

function arraysEqual(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index])
}

export function useModelLabComparison({ range, providerStatus, ollamaStatus, addToast }) {
  const [question, setQuestion] = useState('')
  const [labContext, setLabContext] = useState('all')
  const [modelLabLoading, setModelLabLoading] = useState(false)
  const [comparisonResult, setComparisonResult] = useState(null)
  const [comparisonHistory, setComparisonHistory] = useState([])
  const [ratedScores, setRatedScores] = useState({})
  const [modelOverrides, setModelOverrides] = useState({ claude: 'auto', openai: 'auto', ollama: 'auto' })
  const [compareMode, setCompareMode] = useState('providers')
  const [sameProvider, setSameProvider] = useState('claude')
  const [sameProviderSelections, setSameProviderSelections] = useState(['', '', ''])
  const [modelLabError, setModelLabError] = useState(null)
  const abortRef = useRef(null)

  useEffect(() => {
    aiAPI.getRecentScores('comparison').then(r => setComparisonHistory(r.data || [])).catch(() => null)
  }, [])

  useEffect(() => () => {
    abortRef.current?.abort()
  }, [])

  const providerModels = {
    claude: getProviderOverrideModels('claude', providerStatus, ollamaStatus),
    openai: getProviderOverrideModels('openai', providerStatus, ollamaStatus),
    ollama: getProviderOverrideModels('ollama', providerStatus, ollamaStatus),
  }

  function isReady(provider) {
    if (provider === 'ollama') return !!ollamaStatus?.connected
    return !!providerStatus?.[provider]?.ready
  }

  const readyProviders = ['claude', 'openai', 'ollama'].filter(isReady)
  const sameProviderOptions = providerModels[sameProvider] || []
  const sameProviderOptionsJson = JSON.stringify(sameProviderOptions)
  const selectedSameProviderModels = Array.from(new Set(
    sameProviderSelections.map(model => String(model || '').trim()).filter(Boolean)
  ))
  const canRunComparison = compareMode === 'providers'
    ? !!question.trim()
    : !!question.trim() && isReady(sameProvider) && selectedSameProviderModels.length >= 2

  useEffect(() => {
    if (!sameProvider || !readyProviders.includes(sameProvider)) {
      setSameProvider(readyProviders[0] || 'claude')
    }
  }, [readyProviders, sameProvider])

  useEffect(() => {
    const options = sameProviderOptionsJson ? JSON.parse(sameProviderOptionsJson) : []

    setSameProviderSelections(prev => {
      if (options.length === 0) {
        const empty = ['', '', '']
        return arraysEqual(prev, empty) ? prev : empty
      }

      const next = []
      for (const model of prev) {
        if (options.includes(model) && !next.includes(model)) next.push(model)
      }
      for (const model of options) {
        if (next.length >= Math.min(2, options.length)) break
        if (!next.includes(model)) next.push(model)
      }
      while (next.length < 3) next.push('')
      return arraysEqual(prev, next) ? prev : next
    })
  }, [sameProvider, sameProviderOptionsJson])

  function setSameProviderModelAt(index, model) {
    setSameProviderSelections(prev => prev.map((value, idx) => (idx === index ? model : value)))
  }

  async function runComparison(text = question) {
    const prompt = text.trim()
    if (!prompt || modelLabLoading) return false
    if (compareMode === 'same-provider' && selectedSameProviderModels.length < 2) {
      addToast('Select at least two different models from the same provider', 'error')
      return false
    }

    setModelLabLoading(true)
    setRatedScores({})
    setModelLabError(null)
    setQuestion(prompt)
    const controller = new AbortController()
    abortRef.current = controller

    try {
      const { data } = await aiAPI.compareModels(
        prompt,
        labContext,
        buildDateRange(range),
        compareMode === 'providers'
          ? {
            claude: modelOverrides.claude === 'auto' ? null : modelOverrides.claude,
            openai: modelOverrides.openai === 'auto' ? null : modelOverrides.openai,
            ollama: modelOverrides.ollama === 'auto' ? null : modelOverrides.ollama,
          }
          : {},
        compareMode === 'same-provider'
          ? selectedSameProviderModels.map(model => ({ provider: sameProvider, model }))
          : [],
        { signal: controller.signal }
      )
      setQuestion(prompt)
      setComparisonResult(data)
      aiAPI.getRecentScores('comparison').then(r => setComparisonHistory(r.data || [])).catch(() => null)
      addToast('Model comparison complete', 'success')
      return true
    } catch (err) {
      const error = describeAIRequestError(err, 'Model comparison failed')
      if (error.kind !== 'canceled') {
        setModelLabError(error)
        addToast(error.message, 'error')
      }
      return false
    } finally {
      abortRef.current = null
      setModelLabLoading(false)
    }
  }

  function cancelComparison() {
    abortRef.current?.abort()
  }

  async function rateComparison(scoreId, star) {
    if (!scoreId || ratedScores[scoreId]) return
    try {
      await aiAPI.rateResponse(scoreId, star)
      setRatedScores(prev => ({ ...prev, [scoreId]: true }))
      addToast('Rating saved', 'success')
    } catch {
      addToast('Rating failed', 'error')
    }
  }

  return {
    question,
    setQuestion,
    labContext,
    setLabContext,
    modelLabLoading,
    comparisonResult,
    comparisonHistory,
    ratedScores,
    modelLabError,
    modelOverrides,
    setModelOverrides,
    providerModels,
    isReady,
    compareMode,
    setCompareMode,
    sameProvider,
    setSameProvider,
    sameProviderSelections,
    setSameProviderModelAt,
    sameProviderOptions,
    selectedSameProviderModels,
    canRunComparison,
    runComparison,
    cancelComparison,
    retryComparison: () => runComparison(question),
    rateComparison,
  }
}
