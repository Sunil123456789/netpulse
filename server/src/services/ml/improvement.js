import AIMLImprovement from '../../models/AIMLImprovement.js'
import AIAnomaly from '../../models/AIAnomaly.js'
import AIBaseline from '../../models/AIBaseline.js'
import { taskRouter } from '../ai/taskRouter.js'
import { buildImprovementDisplay, buildMetering } from '../ai/presentation.js'

const IMPROVEMENT_SYSTEM_PROMPT = `You are an ML optimization expert
for network security monitoring systems.

You analyze ML model performance data and suggest specific improvements
to reduce false positives while maintaining detection accuracy.

Respond with ONLY valid JSON in this format:
{
  "analysis": "brief analysis of the performance issue",
  "suggestedChanges": [
    {
      "field": "sensitivity",
      "oldValue": "2.0",
      "newValue": "2.5",
      "reason": "explanation"
    }
  ],
  "expectedImprovement": "description of expected improvement",
  "confidence": "high" | "medium" | "low",
  "additionalNotes": "any other observations"
}`

// Get ML performance stats for a model
async function getMLPerformanceStats(mlModel) {
  void mlModel
  try {
    // Get all anomaly runs
    const runs = await AIAnomaly.find()
      .sort({ runAt: -1 })
      .limit(50)
      .lean()

    if (!runs.length) {
      return { totalRuns: 0, totalAnomalies: 0, falsePositiveRate: 0 }
    }

    // Count feedback
    let totalAnomalies = 0
    let falsePositives = 0
    let truePositives = 0

    for (const run of runs) {
      for (const anomaly of run.anomalies || []) {
        totalAnomalies++
        if (anomaly.userFeedback === 'false_positive') falsePositives++
        if (anomaly.userFeedback === 'true_positive') truePositives++
      }
    }

    const falsePositiveRate = totalAnomalies > 0
      ? Math.round((falsePositives / totalAnomalies) * 100) / 100
      : 0

    // Get current baseline stats
    const baselineStats = await AIBaseline.aggregate([
      { $group: {
        _id: '$metric',
        avgMean: { $avg: '$mean' },
        avgStddev: { $avg: '$stddev' },
        totalSlots: { $sum: 1 }
      }}
    ])

    return {
      totalRuns: runs.length,
      totalAnomalies,
      falsePositives,
      truePositives,
      unreviewed: totalAnomalies - falsePositives - truePositives,
      falsePositiveRate,
      baselineStats
    }
  } catch (err) {
    return { error: err.message }
  }
}

// Ask AI to suggest ML improvements
async function requestMLImprovement({
  mlModel,
  overrideProvider = null,
  overrideModel = null
}) {
  const stats = await getMLPerformanceStats(mlModel)

  const prompt = `ML Model Performance Analysis Request:

Model: ${mlModel}
Total Detection Runs: ${stats.totalRuns}
Total Anomalies Detected: ${stats.totalAnomalies}
False Positives (user confirmed): ${stats.falsePositives}
True Positives (user confirmed): ${stats.truePositives}
Unreviewed: ${stats.unreviewed}
False Positive Rate: ${(stats.falsePositiveRate * 100).toFixed(1)}%

Baseline Statistics:
${JSON.stringify(stats.baselineStats, null, 2)}

Current Configuration:
- Detection method: Statistical baseline (mean + standard deviation)
- Default sensitivity threshold: 2.0 sigma
- Metrics monitored: firewall_denied, firewall_ips, cisco_macflap, cisco_updown

Please analyze this performance data and suggest specific improvements
to reduce false positives while maintaining detection accuracy.
Focus on threshold adjustments, metric-specific settings, and
time-of-day considerations.`

  const aiResult = await taskRouter.route(
    'anomaly',
    [{ role: 'user', content: prompt }],
    IMPROVEMENT_SYSTEM_PROMPT,
    overrideProvider,
    overrideModel
  )

  // Parse AI response
  let suggestion
  try {
    const cleaned = aiResult.content
      .replace(/```json/g, '')
      .replace(/```/g, '')
      .trim()
    suggestion = JSON.parse(cleaned)
  } catch {
    suggestion = {
      analysis: aiResult.content?.slice(0, 500) || 'Analysis failed',
      suggestedChanges: [],
      expectedImprovement: 'Manual review required',
      confidence: 'low',
      additionalNotes: 'AI response parsing failed'
    }
  }

  // Save improvement suggestion to MongoDB
  const saved = await AIMLImprovement.create({
    mlModel,
    triggeredBy: 'manual',
    aiProvider: aiResult.provider,
    aiModel: aiResult.model,
    performanceBefore: {
      falsePositiveRate: stats.falsePositiveRate,
      totalRuns: stats.totalRuns,
      totalAnomalies: stats.totalAnomalies,
      threshold: 2.0
    },
    aiSuggestion: aiResult.content,
    suggestedChanges: suggestion.suggestedChanges || [],
    status: 'pending'
  })

  return {
    id: saved._id,
    mlModel,
    stats,
    suggestion,
    provider: aiResult.provider,
    model: aiResult.model,
    tokensUsed: aiResult.tokensUsed,
    responseTimeMs: aiResult.responseTimeMs,
    status: 'pending',
    createdAt: saved.createdAt,
    display: buildImprovementDisplay({ mlModel, suggestion }),
    metering: buildMetering(aiResult),
  }
}

// Apply an AI improvement suggestion
async function applyImprovement(improvementId) {
  const improvement = await AIMLImprovement.findById(improvementId)
  if (!improvement) throw new Error('Improvement not found')
  if (improvement.status !== 'pending') {
    throw new Error(`Cannot apply - status is ${improvement.status}`)
  }

  improvement.status = 'applied'
  improvement.appliedAt = new Date()
  await improvement.save()

  return {
    id: improvement._id,
    mlModel: improvement.mlModel,
    status: 'applied',
    appliedAt: improvement.appliedAt,
    suggestedChanges: improvement.suggestedChanges,
    message: 'Improvement marked as applied. Adjust your detection settings accordingly.'
  }
}

// Reject an improvement suggestion
async function rejectImprovement(improvementId) {
  const improvement = await AIMLImprovement.findById(improvementId)
  if (!improvement) throw new Error('Improvement not found')

  improvement.status = 'rejected'
  await improvement.save()

  return { id: improvement._id, status: 'rejected' }
}

// Get improvement history
async function getImprovementHistory(mlModel = null) {
  const query = mlModel ? { mlModel } : {}
  return AIMLImprovement.find(query)
    .sort({ createdAt: -1 })
    .limit(20)
    .lean()
}

export {
  requestMLImprovement,
  applyImprovement,
  rejectImprovement,
  getImprovementHistory,
  getMLPerformanceStats
}
