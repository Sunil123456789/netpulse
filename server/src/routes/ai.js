import { Router } from 'express'
import { ollamaProvider } from '../services/ai/providers/ollama.js'
import { taskRouter } from '../services/ai/taskRouter.js'
import { buildContext } from '../services/ai/context.js'
import { processChat } from '../services/ai/chat.js'
import {
  scoreResponse, saveUserRating,
  getLeaderboard, getProviderStats, getRecentScores,
} from '../services/ai/scorer.js'
import AITaskConfig from '../models/AITaskConfig.js'

const router = Router()

// GET /api/ai/status
// Returns status of all AI providers
router.get('/status', async (req, res) => {
  try {
    const ollamaRunning = await ollamaProvider.isRunning()
    const ollamaModels = ollamaRunning ? await ollamaProvider.listModels() : []

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
          configured: ollamaRunning,
          name: 'Ollama (Local)',
          running: ollamaRunning,
          models: ollamaModels.map(m => ({
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
    const running = await ollamaProvider.isRunning()
    const models = running ? await ollamaProvider.listModels() : []
    res.json({
      connected: running,
      host: process.env.OLLAMA_HOST || 'http://localhost:11434',
      models: models.map(m => ({
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
    const defaults = [
      { task: 'chat',       provider: 'claude', model: 'auto',    autoEnabled: false, schedule: 'manual' },
      { task: 'anomaly',    provider: 'ollama', model: 'llama3',  autoEnabled: false, schedule: 'every_hour' },
      { task: 'triage',     provider: 'claude', model: 'auto',    autoEnabled: false, schedule: 'manual' },
      { task: 'brief',      provider: 'claude', model: 'auto',    autoEnabled: false, schedule: 'daily_6am' },
      { task: 'search',     provider: 'ollama', model: 'mistral', autoEnabled: false, schedule: 'manual' },
      { task: 'comparison', provider: 'claude', model: 'auto',    autoEnabled: false, schedule: 'manual' },
    ]
    for (const d of defaults) {
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
    const defaults = {
      chat:       { provider: 'claude', model: 'auto',    autoEnabled: false, schedule: 'manual' },
      anomaly:    { provider: 'ollama', model: 'llama3',  autoEnabled: false, schedule: 'every_hour' },
      triage:     { provider: 'claude', model: 'auto',    autoEnabled: false, schedule: 'manual' },
      brief:      { provider: 'claude', model: 'auto',    autoEnabled: false, schedule: 'daily_6am' },
      search:     { provider: 'ollama', model: 'mistral', autoEnabled: false, schedule: 'manual' },
      comparison: { provider: 'claude', model: 'auto',    autoEnabled: false, schedule: 'manual' },
    }
    if (!defaults[task]) {
      return res.status(400).json({ error: `Unknown task: ${task}` })
    }
    const config = await AITaskConfig.findOneAndUpdate(
      { task },
      { ...defaults[task], updatedAt: new Date() },
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
    const ollamaRunning = await ollamaProvider.isRunning()
    const ollamaModels = ollamaRunning ? await ollamaProvider.listModels() : []

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
        ready: ollamaRunning,
        reason: !ollamaRunning ? 'Ollama not running or OLLAMA_HOST not reachable' : null,
        models: ollamaModels.map(m => m.name),
        modelCount: ollamaModels.length,
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
    })

    res.json(result)
  } catch (err) {
    console.error('Chat error:', err.message)
    res.status(500).json({
      error: err.message,
      hint: 'Check AI provider configuration and API keys',
    })
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

export default router
