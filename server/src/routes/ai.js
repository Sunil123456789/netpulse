import { Router } from 'express'
import { ollamaProvider } from '../services/ai/providers/ollama.js'
import { taskRouter } from '../services/ai/taskRouter.js'
import { buildContext } from '../services/ai/context.js'
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

export default router
