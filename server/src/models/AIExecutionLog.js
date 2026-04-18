import mongoose from 'mongoose'

const aiExecutionLogSchema = new mongoose.Schema({
  taskKey: {
    type: String,
    required: true,
    index: true,
  },
  domain: {
    type: String,
    required: true,
    enum: ['ai', 'ml'],
    index: true,
  },
  provider: {
    type: String,
    default: null,
    index: true,
  },
  model: {
    type: String,
    default: null,
    index: true,
  },
  trigger: {
    type: String,
    required: true,
    enum: ['manual', 'scheduled', 'websocket', 'http'],
    default: 'http',
    index: true,
  },
  status: {
    type: String,
    required: true,
    enum: ['running', 'success', 'failed', 'canceled'],
    default: 'running',
    index: true,
  },
  startedAt: {
    type: Date,
    required: true,
    index: true,
  },
  completedAt: {
    type: Date,
    default: null,
  },
  durationMs: {
    type: Number,
    default: 0,
  },
  promptTokens: {
    type: Number,
    default: 0,
  },
  completionTokens: {
    type: Number,
    default: 0,
  },
  totalTokens: {
    type: Number,
    default: 0,
  },
  estimatedCostUsd: {
    type: Number,
    default: 0,
  },
  billingMode: {
    type: String,
    default: 'cloud',
    enum: ['cloud', 'local', 'internal'],
  },
  requestLabel: {
    type: String,
    default: '',
  },
  scoreId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'AIScore',
    default: null,
  },
  errorMessage: {
    type: String,
    default: null,
  },
}, {
  timestamps: true,
})

aiExecutionLogSchema.index({ taskKey: 1, startedAt: -1 })
aiExecutionLogSchema.index({ status: 1, startedAt: -1 })
aiExecutionLogSchema.index({ provider: 1, model: 1, startedAt: -1 })

export default mongoose.model('AIExecutionLog', aiExecutionLogSchema)
