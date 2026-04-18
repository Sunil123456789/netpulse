import { Router } from 'express'
import { ollamaProvider } from '../services/ai/providers/ollama.js'
import { buildContext } from '../services/ai/context.js'
import { processChat } from '../services/ai/chat.js'
import { processNLSearch } from '../services/ai/nlSearch.js'
import { triageAlert } from '../services/ai/triage.js'
import { generateBrief, getLatestBrief, getBriefById, getBriefHistory } from '../services/ai/dailyBrief.js'
import { compareModels } from '../services/ai/modelLab.js'
import {
  saveUserRating,
  getLeaderboard, getProviderStats, getRecentScores,
} from '../services/ai/scorer.js'
import {
  getAnalyticsOverview,
  getAnalyticsRuns,
} from '../services/ai/analytics.js'
import AITaskConfig from '../models/AITaskConfig.js'
import { scheduler } from '../services/ai/scheduler.js'
import { getTaskDefault, getTaskDefaults } from '../config/aiTaskDefaults.js'
import { createRequestAbortSignal } from '../utils/requestAbort.js'
import { buildChatErrorPayload, normalizeChatError } from '../services/ai/chatErrors.js'

const router = Router()

// GET /api/ai/status
// Returns status of all AI providers
router.get('/status', async (req, res) => {
  try {
    const ollamaStatus = await ollamaProvider.getStatus()

    res.json({
      providers: {
        claude: {
          configured: !!process.env.ANTHROPIC_API_KEY,
          name: 'Claude (Anthropic)',
          models: ['claude-sonnet-4-20250514', 'claude-opus-4-20250514'],
        },
        openai: {
          configured: !!process.env.OPENAI_API_KEY,
          name: 'OpenAI GPT',
          models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo'],
        },
        ollama: {
          configured: ollamaProvider.isConfigured(),
          name: 'Ollama (Local)',
          running: ollamaStatus.connected,
          requiresAuth: ollamaStatus.requiresAuth,
          authConfigured: ollamaStatus.authConfigured,
          detail: ollamaStatus.detail,
          models: ollamaStatus.models.map(m => ({
            name: m.name,
            size: m.size,
            modified: m.modified_at,
          })),
        },
      },
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET /api/ai/ollama/status
// Returns Ollama connection status and installed models
router.get('/ollama/status', async (req, res) => {
  try {
    const status = await ollamaProvider.getStatus()
    res.json({
      connected: status.connected,
      host: status.host,
      statusCode: status.statusCode,
      requiresAuth: status.requiresAuth,
      authConfigured: status.authConfigured,
      error: status.error,
      detail: status.detail,
      models: status.models.map(m => ({
        name: m.name,
        size: m.size,
        sizeGB: m.size ? (m.size / 1024 / 1024 / 1024).toFixed(1) : null,
        modified: m.modified_at,
        digest: m.digest,
      })),
    })
  } catch (err) {
    res.json({ connected: false, error: err.message, models: [] })
  }
})

// POST /api/ai/benchmark
// Run a single-model benchmark with TTFT, quality scoring, and streaming metrics
router.post('/benchmark', async (req, res) => {
  try {
    const { model, prompt, rounds = 1, testType = 'generic', expectedAnswer = null } = req.body
    if (!model || !prompt) return res.status(400).json({ error: 'model and prompt required' })

    const roundCount = Math.min(Math.max(1, Number(rounds) || 1), 5)
    const results = []

    for (let i = 0; i < roundCount; i++) {
      const t0 = Date.now()
      let ttft = null

      try {
        const result = await ollamaProvider.streamChat(
          [{ role: 'user', content: prompt }],
          'You are a helpful assistant. Be concise and follow instructions exactly.',
          model,
          {
            timeoutMs: 120000,
            onToken: (token) => {
              if (ttft === null && token.trim()) ttft = Date.now() - t0
            },
          }
        )

        const tps = result.completionTokens > 0 && result.responseTimeMs > 0
          ? Math.round((result.completionTokens / result.responseTimeMs) * 1000 * 10) / 10
          : 0

        const reply = (result.content || '').toLowerCase().trim()
        let qualityScore = null
        if ((testType === 'exact' || testType === 'contains') && expectedAnswer) {
          qualityScore = reply.includes(expectedAnswer.toLowerCase()) ? 100 : 0
        } else if (testType === 'code') {
          qualityScore = /def |=>|lambda |return |\w\s*=\s*/.test(result.content) ? 100 : 0
        } else if (testType === 'format_list') {
          const has3 = /1\.\s*\w/.test(result.content) && /2\.\s*\w/.test(result.content) && /3\.\s*\w/.test(result.content)
          qualityScore = has3 ? 100 : 0
        } else if (testType === 'length') {
          qualityScore = (result.content || '').trim().split(/\s+/).length >= 10 ? 100 : 0
        }

        results.push({
          round: i + 1,
          responseTimeMs: result.responseTimeMs,
          ttft: ttft ?? result.responseTimeMs,
          promptTokens: result.promptTokens || 0,
          completionTokens: result.completionTokens || 0,
          totalTokens: result.totalTokens || 0,
          tokensPerSec: tps,
          qualityScore,
          content: result.content,
          error: null,
        })
      } catch (err) {
        results.push({ round: i + 1, error: err.message, responseTimeMs: Date.now() - t0, ttft: null })
      }
    }

    const successful = results.filter(r => !r.error)
    const avg = (key) => successful.length > 0
      ? Math.round(successful.reduce((s, r) => s + Number(r[key] || 0), 0) / successful.length)
      : 0
    const avgTps = successful.length > 0
      ? Math.round(successful.reduce((s, r) => s + r.tokensPerSec, 0) / successful.length * 10) / 10
      : 0
    const qualRounds = successful.filter(r => r.qualityScore !== null)
    const avgQuality = qualRounds.length > 0
      ? Math.round(qualRounds.reduce((s, r) => s + r.qualityScore, 0) / qualRounds.length)
      : null

    res.json({
      model, prompt, testType, rounds: results.length, results,
      summary: {
        avgResponseTimeMs: avg('responseTimeMs'),
        avgTtft: avg('ttft'),
        avgTokensPerSec: avgTps,
        avgQualityScore: avgQuality,
        successRate: `${successful.length}/${results.length}`,
        totalTokens: successful.reduce((s, r) => s + (r.completionTokens || 0), 0),
        sampleReply: (successful[0]?.content || '').slice(0, 140),
      },
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// POST /api/ai/ollama/pull
// Pull a new Ollama model
router.post('/ollama/pull', async (req, res) => {
  try {
    const { model } = req.body
    if (!model) return res.status(400).json({ error: 'model name required' })
    const result = await ollamaProvider.pullModel(model)
    res.json({ success: true, model, result })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET /api/ai/config
// Get all task configurations
router.get('/config', async (req, res) => {
  try {
    const configs = await AITaskConfig.find().sort({ task: 1 })
    res.json(configs)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// PUT /api/ai/config/:task
// Update a task configuration
router.put('/config/:task', async (req, res) => {
  try {
    const { task } = req.params
    const { provider, model, autoEnabled, schedule } = req.body

    const config = await AITaskConfig.findOneAndUpdate(
      { task },
      {
        ...(provider !== undefined && { provider }),
        ...(model !== undefined && { model }),
        ...(autoEnabled !== undefined && { autoEnabled }),
        ...(schedule !== undefined && { schedule }),
        updatedAt: new Date(),
      },
      { new: true, upsert: true }
    )
    res.json(config)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// POST /api/ai/config/reset-all
// Reset ALL task configs to defaults (must be before /:task routes)
router.post('/config/reset-all', async (req, res) => {
  try {
    for (const d of getTaskDefaults()) {
      await AITaskConfig.findOneAndUpdate(
        { task: d.task },
        { ...d, updatedAt: new Date() },
        { upsert: true }
      )
    }
    const all = await AITaskConfig.find().sort({ task: 1 })
    res.json({ message: 'All configs reset to defaults', configs: all })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET /api/ai/config/:task
// Get single task config
router.get('/config/:task', async (req, res) => {
  try {
    const config = await AITaskConfig.findOne({ task: req.params.task })
    if (!config) return res.status(404).json({ error: 'Task not found' })
    res.json(config)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// POST /api/ai/config/:task/reset
// Reset a single task config to defaults
router.post('/config/:task/reset', async (req, res) => {
  try {
    const { task } = req.params
    const defaults = getTaskDefault(task)
    if (!defaults) {
      return res.status(400).json({ error: `Unknown task: ${task}` })
    }
    const config = await AITaskConfig.findOneAndUpdate(
      { task },
      { ...defaults, updatedAt: new Date() },
      { new: true }
    )
    res.json(config)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// POST /api/ai/config/:task/toggle-auto
// Toggle autoEnabled for a task
router.post('/config/:task/toggle-auto', async (req, res) => {
  try {
    const config = await AITaskConfig.findOne({ task: req.params.task })
    if (!config) return res.status(404).json({ error: 'Task not found' })
    config.autoEnabled = !config.autoEnabled
    config.updatedAt = new Date()
    await config.save()
    res.json({
      task: config.task,
      autoEnabled: config.autoEnabled,
      message: `Auto ${config.autoEnabled ? 'enabled' : 'disabled'} for ${config.task}`,
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET /api/ai/provider/status
// Quick check — which providers are ready to use
router.get('/provider/status', async (req, res) => {
  try {
    const ollamaStatus = await ollamaProvider.getStatus()

    res.json({
      claude: {
        ready: !!process.env.ANTHROPIC_API_KEY,
        reason: !process.env.ANTHROPIC_API_KEY ? 'ANTHROPIC_API_KEY not set' : null,
      },
      openai: {
        ready: !!process.env.OPENAI_API_KEY,
        reason: !process.env.OPENAI_API_KEY ? 'OPENAI_API_KEY not set' : null,
      },
      ollama: {
        ready: ollamaStatus.connected,
        reason: ollamaStatus.connected
          ? null
          : ollamaStatus.requiresAuth
            ? 'Ollama host requires authentication. Configure OLLAMA_AUTH_TOKEN or OLLAMA_EXTRA_HEADERS.'
            : (ollamaStatus.detail || 'Ollama not running or OLLAMA_HOST not reachable'),
        requiresAuth: ollamaStatus.requiresAuth,
        authConfigured: ollamaStatus.authConfigured,
        models: ollamaStatus.models.map(m => m.name),
        modelCount: ollamaStatus.models.length,
      },
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET /api/ai/context
// Returns current network context from all sources
router.get('/context', async (req, res) => {
  try {
    const sources = req.query.sources
      ? req.query.sources.split(',')
      : ['es', 'zabbix', 'mongo']

    const from = req.query.from || 'now-1h'
    const to   = req.query.to   || 'now'

    const context = await buildContext(sources, { from, to })
    res.json(context)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// POST /api/ai/chat
router.post('/chat', async (req, res) => {
  const { signal, cleanup } = createRequestAbortSignal(req, res)
  try {
    const {
      messages,
      context,
      dateRange,
      provider: overrideProvider,
      model: overrideModel,
    } = req.body

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'messages array is required' })
    }

    for (const msg of messages) {
      if (!msg.role || !msg.content) {
        return res.status(400).json({ error: 'Each message must have role and content' })
      }
      if (!['user', 'assistant'].includes(msg.role)) {
        return res.status(400).json({ error: 'Message role must be user or assistant' })
      }
    }

    const result = await processChat({
      messages,
      context:          context || 'all',
      dateRange:        dateRange || null,
      overrideProvider,
      overrideModel,
      trigger: 'http',
      signal,
    })

    res.json(result)
  } catch (err) {
    if (signal.aborted) return
    const chatError = normalizeChatError(err)
    console.error('Chat error:', {
      kind: chatError.kind,
      provider: chatError.provider,
      model: chatError.model,
      timeoutMs: chatError.timeoutMs,
      error: chatError.message,
    })
    res.status(chatError.statusCode).json(buildChatErrorPayload(chatError))
  } finally {
    cleanup()
  }
})

// GET /api/ai/chat/history
// Returns recent chat scores/history
router.get('/chat/history', async (req, res) => {
  try {
    const history = await getRecentScores('chat', 20)
    res.json(history)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// POST /api/ai/compare
router.post('/compare', async (req, res) => {
  const { signal, cleanup } = createRequestAbortSignal(req, res)
  try {
    const { question, context, dateRange, modelOverrides, targets } = req.body

    if (!question || !String(question).trim()) {
      return res.status(400).json({ error: 'question is required' })
    }

    const result = await compareModels({
      question: String(question).trim(),
      context: context || 'all',
      dateRange: dateRange || null,
      modelOverrides: modelOverrides || {},
      targets: Array.isArray(targets) ? targets : [],
      trigger: 'http',
      signal,
    })

    res.json(result)
  } catch (err) {
    if (signal.aborted) return
    console.error('Model compare error:', err.message)
    res.status(500).json({
      error: err.message,
      hint: 'Check provider availability and retry the comparison',
    })
  } finally {
    cleanup()
  }
})

// GET /api/ai/scores/leaderboard
router.get('/scores/leaderboard', async (req, res) => {
  try {
    const leaderboard = await getLeaderboard()
    res.json(leaderboard)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET /api/ai/scores/provider-stats
router.get('/scores/provider-stats', async (req, res) => {
  try {
    const stats = await getProviderStats()
    res.json(stats)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET /api/ai/analytics/overview
router.get('/analytics/overview', async (req, res) => {
  try {
    const overview = await getAnalyticsOverview({
      from: req.query.from || null,
      to: req.query.to || null,
    })
    res.json(overview)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET /api/ai/analytics/runs
router.get('/analytics/runs', async (req, res) => {
  try {
    const runs = await getAnalyticsRuns({
      from: req.query.from || null,
      to: req.query.to || null,
      task: req.query.task || null,
      provider: req.query.provider || null,
      model: req.query.model || null,
      status: req.query.status || null,
      trigger: req.query.trigger || null,
      page: req.query.page || 1,
      limit: req.query.limit || 20,
    })
    res.json(runs)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET /api/ai/scores/recent/:task
router.get('/scores/recent/:task', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20
    const scores = await getRecentScores(req.params.task, limit)
    res.json(scores)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// POST /api/ai/scores/:id/rate
// Save user rating 1-5 stars for a response
router.post('/scores/:id/rate', async (req, res) => {
  try {
    const { rating } = req.body
    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ error: 'Rating must be 1-5' })
    }
    const updated = await saveUserRating(req.params.id, parseInt(rating))
    res.json({
      success: true,
      newTotalScore: updated.totalScore,
      userRating: updated.scores.userRating,
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// POST /api/ai/search
router.post('/search', async (req, res) => {
  const { signal, cleanup } = createRequestAbortSignal(req, res)
  try {
    const {
      question,
      source,
      dateRange,
      provider: overrideProvider,
      model: overrideModel
    } = req.body

    if (!question || question.trim().length === 0) {
      return res.status(400).json({ error: 'question is required' })
    }

    if (question.length > 500) {
      return res.status(400).json({ error: 'question too long (max 500 chars)' })
    }

    const result = await processNLSearch({
      question: question.trim(),
      source: source || 'auto',
      dateRange: dateRange || null,
      overrideProvider,
      overrideModel,
      trigger: 'http',
    })

    res.json(result)
  } catch (err) {
    if (signal.aborted) return
    console.error('NL Search error:', err.message)
    res.status(500).json({
      error: err.message,
      hint: 'Try rephrasing your question'
    })
  } finally {
    cleanup()
  }
})

// GET /api/ai/search/history
router.get('/search/history', async (_req, res) => {
  try {
    const history = await getRecentScores('search', 20)
    res.json(history)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// POST /api/ai/triage
router.post('/triage', async (req, res) => {
  const { signal, cleanup } = createRequestAbortSignal(req, res)
  try {
    const {
      alert,
      provider: overrideProvider,
      model: overrideModel
    } = req.body

    if (!alert) {
      return res.status(400).json({ error: 'alert object is required' })
    }

    const result = await triageAlert({
      alert,
      overrideProvider,
      overrideModel,
      trigger: 'http',
      signal,
    })

    res.json(result)
  } catch (err) {
    if (signal.aborted) return
    console.error('Triage error:', err.message)
    res.status(500).json({
      error: err.message,
      hint: 'Check AI provider configuration'
    })
  } finally {
    cleanup()
  }
})

// GET /api/ai/triage/history
router.get('/triage/history', async (_req, res) => {
  try {
    const history = await getRecentScores('triage', 20)
    res.json(history)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// POST /api/ai/brief/generate
router.post('/brief/generate', async (req, res) => {
  const { signal, cleanup } = createRequestAbortSignal(req, res)
  try {
    const {
      dateRange,
      provider: overrideProvider,
      model: overrideModel
    } = req.body

    const result = await generateBrief({
      dateRange: dateRange || null,
      overrideProvider,
      overrideModel,
      triggeredBy: 'manual',
      trigger: 'http',
      signal,
    })

    res.json(result)
  } catch (err) {
    if (signal.aborted) return
    console.error('Brief generation error:', err.message)
    res.status(500).json({
      error: err.message,
      hint: 'Brief generation failed - check AI provider'
    })
  } finally {
    cleanup()
  }
})

// GET /api/ai/brief/latest
router.get('/brief/latest', async (_req, res) => {
  try {
    const brief = await getLatestBrief()
    if (!brief) return res.json({ message: 'No briefs generated yet' })
    res.json(brief)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET /api/ai/brief/history
router.get('/brief/history', async (_req, res) => {
  try {
    const history = await getBriefHistory(30)
    res.json(history)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET /api/ai/brief/:id
router.get('/brief/:id', async (req, res) => {
  try {
    const brief = await getBriefById(req.params.id)
    if (!brief) return res.status(404).json({ error: 'Brief not found' })
    res.json(brief)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET /api/ai/scheduler/status
router.get('/scheduler/status', async (_req, res) => {
  try {
    const status = await scheduler.getStatus()
    res.json(status)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// POST /api/ai/scheduler/start/:task
router.post('/scheduler/start/:task', async (req, res) => {
  try {
    const { task } = req.params

    // Enable the task first
    await AITaskConfig.findOneAndUpdate(
      { task },
      { autoEnabled: true, updatedAt: new Date() }
    )

    await scheduler.startTask(task)
    res.json({
      success: true,
      message: `Scheduler started for ${task}`,
      task
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// POST /api/ai/scheduler/stop/:task
router.post('/scheduler/stop/:task', async (req, res) => {
  try {
    const { task } = req.params

    // Disable in MongoDB
    await AITaskConfig.findOneAndUpdate(
      { task },
      { autoEnabled: false, nextRun: null, updatedAt: new Date() }
    )

    scheduler.stopTask(task)
    res.json({
      success: true,
      message: `Scheduler stopped for ${task}`,
      task
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// POST /api/ai/scheduler/run/:task
// Run a task immediately (manual trigger)
router.post('/scheduler/run/:task', async (req, res) => {
  try {
    const { task } = req.params

    // Run immediately in background
    scheduler.runTask(task, { trigger: 'manual' }).catch(err =>
      console.error(`Manual run error for ${task}:`, err.message)
    )

    res.json({
      success: true,
      message: `${task} started manually`,
      task
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

export default router
