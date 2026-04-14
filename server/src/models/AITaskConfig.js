import mongoose from 'mongoose'
import { getPreferredProvider } from '../config/aiTaskDefaults.js'

const aiTaskConfigSchema = new mongoose.Schema({
  task: {
    type: String,
    required: true,
    unique: true,
    enum: ['chat', 'anomaly', 'triage', 'brief', 'search', 'comparison'],
  },
  provider: {
    type: String,
    default: getPreferredProvider,
    enum: ['claude', 'openai', 'ollama'],
  },
  model: { type: String, default: 'auto' },
  autoEnabled: { type: Boolean, default: false },
  schedule: {
    type: String,
    default: 'every_hour',
    enum: ['every_15m', 'every_hour', 'every_6h', 'every_12h', 'daily_6am', 'daily_9am', 'manual'],
  },
  lastRun:         { type: Date, default: null },
  nextRun:         { type: Date, default: null },
  lastRunStatus: {
    type: String,
    default: 'never',
    enum: ['never', 'running', 'success', 'failed'],
  },
  lastRunDuration: { type: Number, default: 0 },
  createdAt:       { type: Date, default: Date.now },
  updatedAt:       { type: Date, default: Date.now },
})

export default mongoose.model('AITaskConfig', aiTaskConfigSchema)
