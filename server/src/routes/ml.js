import { Router } from 'express'
import {
  buildBaseline,
  buildAllBaselines,
  getBaselineStatus,
  METRICS
} from '../services/ml/baseline.js'
import {
  detectAnomalies,
  getAnomalyHistory,
  getAnomalyRun,
  saveAnomalyFeedback
} from '../services/ml/anomaly.js'
import {
  detectPortScans,
  detectBruteForce,
  detectGeoAnomalies
} from '../services/ml/threatDetection.js'
import {
  requestMLImprovement,
  applyImprovement,
  rejectImprovement,
  getImprovementHistory,
  getMLPerformanceStats
} from '../services/ml/improvement.js'
import {
  completeExecutionLog,
  failExecutionLog,
  startExecutionLog,
} from '../services/ai/executionTracking.js'
import { createRequestAbortSignal } from '../utils/requestAbort.js'

const router = Router()

async function withTrackedInternalOperation({ taskKey, requestLabel }, operation) {
  const startTime = Date.now()
  const execution = await startExecutionLog({
    taskKey,
    domain: 'ml',
    trigger: 'http',
    requestLabel,
  })

  try {
    const result = await operation()
    await completeExecutionLog(execution._id, {
      result: {
        provider: null,
        model: null,
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        billingMode: 'internal',
        responseTimeMs: Date.now() - startTime,
      },
      durationMs: Date.now() - startTime,
    })
    return result
  } catch (err) {
    await failExecutionLog(execution._id, err, {
      durationMs: Date.now() - startTime,
      result: {
        provider: null,
        model: null,
        billingMode: 'internal',
      },
    })
    throw err
  }
}

// GET /api/ml/baseline/status
router.get('/baseline/status', async (_req, res) => {
  try {
    const status = await getBaselineStatus()
    res.json(status)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// POST /api/ml/baseline/build
// Build baseline for one or all metrics
router.post('/baseline/build', async (req, res) => {
  try {
    const { metric, daysBack = 7 } = req.body

    if (metric) {
      const result = await buildBaseline(metric, daysBack, { trigger: 'http' })
      res.json(result)
    } else {
      // Build all
      const results = await buildAllBaselines(daysBack, { trigger: 'http' })
      res.json({
        message: 'All baselines built',
        results,
        successful: results.filter(r => r.status === 'success').length,
        failed: results.filter(r => r.status === 'failed').length
      })
    }
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET /api/ml/baseline/metrics
// List available metrics
router.get('/baseline/metrics', async (_req, res) => {
  res.json(METRICS.map(m => ({
    name: m.name,
    description: m.description,
    index: m.index
  })))
})

// POST /api/ml/anomaly/detect
router.post('/anomaly/detect', async (req, res) => {
  try {
    const {
      dateRange,
      sensitivity = 2.0,
      sources = ['firewall', 'cisco', 'sentinel']
    } = req.body

    const result = await detectAnomalies({
      dateRange: dateRange || null,
      sensitivity: parseFloat(sensitivity),
      sources,
      triggeredBy: 'manual',
      trigger: 'http',
    })

    res.json(result)
  } catch (err) {
    console.error('Anomaly detection error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

// GET /api/ml/anomaly/history
router.get('/anomaly/history', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20
    const history = await getAnomalyHistory(limit)
    res.json(history)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET /api/ml/anomaly/:id
router.get('/anomaly/:id', async (req, res) => {
  try {
    const run = await getAnomalyRun(req.params.id)
    if (!run) return res.status(404).json({ error: 'Run not found' })
    res.json(run)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// POST /api/ml/anomaly/:id/feedback
router.post('/anomaly/:id/feedback', async (req, res) => {
  try {
    const { anomalyIndex, feedback } = req.body
    if (!['true_positive', 'false_positive', 'unsure'].includes(feedback)) {
      return res.status(400).json({
        error: 'feedback must be true_positive, false_positive, or unsure'
      })
    }
    const updated = await saveAnomalyFeedback(
      req.params.id,
      parseInt(anomalyIndex),
      feedback
    )
    res.json({ success: true, anomalies: updated.anomalies })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// POST /api/ml/threats/port-scan
router.post('/threats/port-scan', async (req, res) => {
  try {
    const { dateRange, portThreshold = 15 } = req.body
    const result = await withTrackedInternalOperation({
      taskKey: 'ml.threat.port-scan',
      requestLabel: `port threshold ${portThreshold}`,
    }, async () => await detectPortScans({
      dateRange,
      portThreshold: parseInt(portThreshold)
    }))
    res.json(result)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// POST /api/ml/threats/brute-force
router.post('/threats/brute-force', async (req, res) => {
  try {
    const { dateRange, failureThreshold = 50 } = req.body
    const result = await withTrackedInternalOperation({
      taskKey: 'ml.threat.brute-force',
      requestLabel: `failure threshold ${failureThreshold}`,
    }, async () => await detectBruteForce({
      dateRange,
      failureThreshold: parseInt(failureThreshold)
    }))
    res.json(result)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// POST /api/ml/threats/geo
router.post('/threats/geo', async (req, res) => {
  try {
    const { dateRange, expectedCountries } = req.body
    const result = await withTrackedInternalOperation({
      taskKey: 'ml.threat.geo',
      requestLabel: (expectedCountries || ['India', 'Reserved']).join(', '),
    }, async () => await detectGeoAnomalies({
      dateRange,
      expectedCountries: expectedCountries || ['India', 'Reserved']
    }))
    res.json(result)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// POST /api/ml/threats/all
// Run all threat detections at once
router.post('/threats/all', async (req, res) => {
  try {
    const { dateRange } = req.body
    const result = await withTrackedInternalOperation({
      taskKey: 'ml.threat.all',
      requestLabel: 'full threat sweep',
    }, async () => {
      const [portScan, bruteForce, geo] = await Promise.allSettled([
        detectPortScans({ dateRange }),
        detectBruteForce({ dateRange }),
        detectGeoAnomalies({ dateRange })
      ])

      return {
        portScan: portScan.status === 'fulfilled' ? portScan.value : { error: portScan.reason?.message },
        bruteForce: bruteForce.status === 'fulfilled' ? bruteForce.value : { error: bruteForce.reason?.message },
        geo: geo.status === 'fulfilled' ? geo.value : { error: geo.reason?.message },
        runAt: new Date().toISOString()
      }
    })

    res.json(result)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET /api/ml/improve/stats/:model
router.get('/improve/stats/:model', async (req, res) => {
  try {
    const stats = await getMLPerformanceStats(req.params.model)
    res.json(stats)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// POST /api/ml/improve/request
router.post('/improve/request', async (req, res) => {
  const { signal, cleanup } = createRequestAbortSignal(req, res)
  try {
    const {
      mlModel = 'baseline_anomaly',
      provider: overrideProvider,
      model: overrideModel
    } = req.body

    const result = await requestMLImprovement({
      mlModel,
      overrideProvider,
      overrideModel,
      trigger: 'http',
      signal,
    })
    res.json(result)
  } catch (err) {
    if (signal.aborted) return
    res.status(500).json({ error: err.message })
  } finally {
    cleanup()
  }
})

// POST /api/ml/improve/:id/apply
router.post('/improve/:id/apply', async (req, res) => {
  try {
    const result = await applyImprovement(req.params.id)
    res.json(result)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// POST /api/ml/improve/:id/reject
router.post('/improve/:id/reject', async (req, res) => {
  try {
    const result = await rejectImprovement(req.params.id)
    res.json(result)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET /api/ml/improve/history
router.get('/improve/history', async (req, res) => {
  try {
    const { model } = req.query
    const history = await getImprovementHistory(model || null)
    res.json(history)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

export default router
