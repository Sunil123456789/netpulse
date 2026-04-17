import AIScore from '../../models/AIScore.js'
import { estimateCostUsd } from './presentation.js'

// Score response speed based on response time
function scoreSpeed(responseTimeMs) {
  if (responseTimeMs < 1000)  return 10
  if (responseTimeMs < 3000)  return 8
  if (responseTimeMs < 7000)  return 6
  if (responseTimeMs < 15000) return 4
  return 2
}

// Score specificity — does response contain specific details?
// Counts: IP addresses, numbers, hostnames, CVEs, ports, timestamps
function scoreSpecificity(text) {
  if (!text) return 0
  let score = 0
  const checks = [
    /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g,  // IP addresses
    /\bCVE-\d{4}-\d+\b/gi,                         // CVE numbers
    /\bport\s+\d+\b/gi,                             // port numbers
    /\b\d{4,}\b/g,                                  // large numbers
    /\b\w+[-_]\w+[-_]\w+\b/g,                      // hostnames like server-01-prod
    /\d{2}:\d{2}:\d{2}/g,                           // timestamps
  ]
  checks.forEach(regex => {
    const matches = text.match(regex) || []
    score += Math.min(matches.length * 1.5, 10)
  })
  return Math.min(Math.round(score / checks.length), 10)
}

// Score actionability — does response tell you what to DO?
function scoreActionability(text) {
  if (!text) return 0
  const actionWords = [
    'block', 'check', 'investigate', 'restart', 'update',
    'patch', 'monitor', 'alert', 'escalate', 'review',
    'disable', 'enable', 'configure', 'verify', 'analyze',
    'isolate', 'quarantine', 'remediate', 'mitigate', 'fix',
    'recommend', 'suggest', 'should', 'must', 'need to',
    'immediately', 'urgent', 'critical action', 'next step',
  ]
  const lowerText = text.toLowerCase()
  const found = actionWords.filter(w => lowerText.includes(w))
  const score = Math.min(found.length * 1.2, 10)
  return Math.round(score)
}

// Score response length — 150-400 words is ideal
function scoreLength(text) {
  if (!text) return 0
  const wordCount = text.split(/\s+/).filter(w => w.length > 0).length
  if (wordCount < 20)   return 2
  if (wordCount < 50)   return 4
  if (wordCount < 150)  return 7
  if (wordCount <= 400) return 10
  if (wordCount <= 600) return 8
  if (wordCount <= 800) return 6
  return 4
}

// Calculate total weighted score
// userRating has 2x weight since it's most important
function calculateTotal(scores) {
  const { speed, specificity, actionability, length, userRating } = scores
  const rating = userRating || 5  // default to 5 if not rated yet
  const total = (speed + specificity + actionability + length + (rating * 2)) / 6
  return Math.round(total * 10) / 10
}

// Auto-score a response and optionally save to MongoDB
async function scoreResponse({
  task,
  provider,
  model,
  query,
  response,
  responseTimeMs,
  tokensUsed = 0,
  save = true,
}) {
  const scores = {
    speed:         scoreSpeed(responseTimeMs),
    specificity:   scoreSpecificity(response),
    actionability: scoreActionability(response),
    length:        scoreLength(response),
    userRating:    null,  // filled in later by user
  }

  const totalScore = calculateTotal(scores)

  if (!save) {
    return { scores, totalScore }
  }

  const saved = await AIScore.create({
    task,
    provider,
    model,
    query:    query?.slice(0, 500),      // limit query length stored
    response: response?.slice(0, 2000),  // limit response length stored
    responseTimeMs,
    tokensUsed,
    scores,
    totalScore,
  })

  return { scores, totalScore, scoreId: saved._id.toString() }
}

// Save user rating for a score
async function saveUserRating(scoreId, userRating) {
  if (userRating < 1 || userRating > 5) {
    throw new Error('Rating must be between 1 and 5')
  }

  const score = await AIScore.findById(scoreId)
  if (!score) throw new Error('Score not found')

  score.scores.userRating = userRating
  score.totalScore = calculateTotal(score.scores)
  await score.save()

  return score
}

// Get leaderboard — best models per task
async function getLeaderboard() {
  const tasks = ['chat', 'anomaly', 'triage', 'brief', 'search', 'comparison']
  const leaderboard = {}

  for (const task of tasks) {
    const results = await AIScore.aggregate([
      { $match: { task } },
      { $group: {
        _id: { provider: '$provider', model: '$model' },
        avgScore:        { $avg: '$totalScore' },
        avgSpeed:        { $avg: '$scores.speed' },
        avgSpecificity:  { $avg: '$scores.specificity' },
        avgActionability:{ $avg: '$scores.actionability' },
        avgLength:       { $avg: '$scores.length' },
        avgUserRating:   { $avg: '$scores.userRating' },
        totalRuns:       { $sum: 1 },
        totalTokens:     { $sum: '$tokensUsed' },
        avgResponseTime: { $avg: '$responseTimeMs' },
      }},
      { $sort: { avgScore: -1 } },
      { $limit: 5 },
    ])

    leaderboard[task] = results.map(r => ({
      provider:          r._id.provider,
      model:             r._id.model,
      avgScore:          Math.round(r.avgScore * 10) / 10,
      avgSpeed:          Math.round(r.avgSpeed * 10) / 10,
      avgSpecificity:    Math.round(r.avgSpecificity * 10) / 10,
      avgActionability:  Math.round(r.avgActionability * 10) / 10,
      avgUserRating:     r.avgUserRating ? Math.round(r.avgUserRating * 10) / 10 : null,
      totalRuns:         r.totalRuns,
      totalTokens:       r.totalTokens,
      avgResponseTimeMs: Math.round(r.avgResponseTime),
    }))
  }

  return leaderboard
}

// Get provider cost/usage stats
async function getProviderStats() {
  const results = await AIScore.aggregate([
    { $group: {
      _id: '$provider',
      totalTokens:     { $sum: '$tokensUsed' },
      totalRuns:       { $sum: 1 },
      avgScore:        { $avg: '$totalScore' },
      avgResponseTime: { $avg: '$responseTimeMs' },
    }},
    { $sort: { totalRuns: -1 } },
  ])

  return results.map(r => ({
    provider:          r._id,
    totalTokens:       r.totalTokens,
    totalRuns:         r.totalRuns,
    avgScore:          Math.round(r.avgScore * 10) / 10,
    avgResponseTimeMs: Math.round(r.avgResponseTime),
    estimatedCost:     estimateCostUsd(r._id, r.totalTokens),
  }))
}

// Get recent scores for a task
async function getRecentScores(task, limit = 20) {
  return AIScore.find({ task })
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean()
}

export {
  scoreResponse,
  saveUserRating,
  getLeaderboard,
  getProviderStats,
  getRecentScores,
}
