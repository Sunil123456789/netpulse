import { useEffect, useState } from 'react'
import { aiAPI } from '../../../api/ai.js'
import { buildDateRange, getProviderOverrideModels } from '../utils/common.js'

export function useModelLabComparison({ range, providerStatus, ollamaStatus, addToast }) {
  const [question, setQuestion] = useState('')
  const [labContext, setLabContext] = useState('all')
  const [modelLabLoading, setModelLabLoading] = useState(false)
  const [comparisonResult, setComparisonResult] = useState(null)
  const [comparisonHistory, setComparisonHistory] = useState([])
  const [ratedScores, setRatedScores] = useState({})
  const [modelOverrides, setModelOverrides] = useState({ claude: 'auto', openai: 'auto', ollama: 'auto' })

  useEffect(() => {
    aiAPI.getRecentScores('comparison').then(r => setComparisonHistory(r.data || [])).catch(() => {})
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

  async function runComparison(text = question) {
    const prompt = text.trim()
    if (!prompt || modelLabLoading) return false

    setModelLabLoading(true)
    setRatedScores({})

    try {
      const { data } = await aiAPI.compareModels(
        prompt,
        labContext,
        buildDateRange(range),
        {
          claude: modelOverrides.claude === 'auto' ? null : modelOverrides.claude,
          openai: modelOverrides.openai === 'auto' ? null : modelOverrides.openai,
          ollama: modelOverrides.ollama === 'auto' ? null : modelOverrides.ollama,
        }
      )
      setQuestion(prompt)
      setComparisonResult(data)
      aiAPI.getRecentScores('comparison').then(r => setComparisonHistory(r.data || [])).catch(() => {})
      addToast('Model comparison complete', 'success')
      return true
    } catch (err) {
      addToast(err.response?.data?.error || err.message, 'error')
      return false
    } finally {
      setModelLabLoading(false)
    }
  }

  async function rateComparison(scoreId, star) {
    if (!scoreId || ratedScores[scoreId]) return
    try {
      await aiAPI.rateResponse(scoreId, star)
      setRatedScores(prev => ({ ...prev, [scoreId]: true }))
      addToast('Rating saved', 'success')
    } catch {}
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
    modelOverrides,
    setModelOverrides,
    providerModels,
    isReady,
    runComparison,
    rateComparison,
  }
}
