import { useEffect, useState } from 'react'
import { aiAPI } from '../../../api/ai.js'
import { ticketsAPI } from '../../../api/tickets.js'
import { getProviderOverrideModels, getReadyProviders } from '../utils/common.js'

export function useTriageFlow({ providerStatus, ollamaStatus, addToast, canCreateTickets, blankForm }) {
  const [triageResult, setTriageResult] = useState(null)
  const [triageHistory, setTriageHistory] = useState([])
  const [triageLoading, setTriageLoading] = useState(false)
  const [triageProvider, setTriageProvider] = useState(null)
  const [triageModel, setTriageModel] = useState(null)
  const [alertForm, setAlertForm] = useState(blankForm)
  const [starRated, setStarRated] = useState(false)
  const [ticketCreating, setTicketCreating] = useState(false)
  const [ticketCreated, setTicketCreated] = useState(null)

  useEffect(() => {
    aiAPI.getTriageHistory().then(r => setTriageHistory(r.data || [])).catch(() => null)
  }, [])

  const availableProviders = getReadyProviders(providerStatus)
  const overrideModels = getProviderOverrideModels(triageProvider, providerStatus, ollamaStatus)

  function setField(key, value) {
    setAlertForm(prev => ({ ...prev, [key]: value }))
  }

  function resetForm() {
    setAlertForm(blankForm)
    setTriageResult(null)
    setStarRated(false)
    setTicketCreated(null)
  }

  function loadSampleAlert(sample) {
    setAlertForm(sample)
    setTriageResult(null)
    setStarRated(false)
    setTicketCreated(null)
  }

  async function runTriage() {
    if (!alertForm.name.trim()) {
      addToast('Alert name is required', 'error')
      return false
    }

    setTriageLoading(true)
    setTriageResult(null)
    setStarRated(false)
    setTicketCreated(null)

    try {
      const { data } = await aiAPI.triage(
        alertForm,
        triageProvider || undefined,
        triageModel || undefined,
      )
      setTriageResult(data)
      aiAPI.getTriageHistory().then(r => setTriageHistory(r.data || [])).catch(() => null)
      addToast('Triage complete', 'success')
      return true
    } catch (err) {
      addToast(err.response?.data?.error || err.message, 'error')
      return false
    } finally {
      setTriageLoading(false)
    }
  }

  async function rateResponse(star) {
    if (!triageResult?.scoreId || starRated) return
    try {
      await aiAPI.rateResponse(triageResult.scoreId, star)
      setStarRated(true)
      addToast('Rating saved', 'success')
    } catch {
      addToast('Rating failed', 'error')
    }
  }

  async function createTicket() {
    if (!triageResult || !canCreateTickets) return
    setTicketCreating(true)
    try {
      const sev = (triageResult.severity || alertForm.severity || 'high').toLowerCase()
      const { data } = await ticketsAPI.create({
        title: `[AI Triage] ${alertForm.name}`,
        description: [
          `**AI Triage Summary:** ${triageResult.summary || ''}`,
          `**Recommendation:** ${triageResult.recommendation || ''}`,
          `**Category:** ${triageResult.category || ''}`,
          `**Source IP:** ${alertForm.srcip}  →  **Dest IP:** ${alertForm.dstip}`,
          `**Attack:** ${alertForm.attack}`,
          `**Site:** ${alertForm.site_name}  |  **Device:** ${alertForm.device_name}`,
          triageResult.mitreTactic ? `**MITRE Tactic:** ${triageResult.mitreTactic}` : '',
          triageResult.relatedCVE ? `**CVE:** ${triageResult.relatedCVE}` : '',
        ].filter(Boolean).join('\n'),
        severity: sev,
        source: 'ai_triage',
        tags: ['ai-triage', triageResult.category || 'security'].filter(Boolean),
      })
      setTicketCreated(data._id || data.id || data.ticketId || 'created')
      addToast('Ticket created successfully', 'success')
    } catch (err) {
      addToast(err.response?.data?.error || err.message, 'error')
    } finally {
      setTicketCreating(false)
    }
  }

  return {
    triageResult,
    triageHistory,
    triageLoading,
    triageProvider,
    setTriageProvider,
    triageModel,
    setTriageModel,
    alertForm,
    setField,
    starRated,
    ticketCreating,
    ticketCreated,
    availableProviders,
    overrideModels,
    resetForm,
    loadSampleAlert,
    runTriage,
    rateResponse,
    createTicket,
  }
}
