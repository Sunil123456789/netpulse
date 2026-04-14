import mongoose from 'mongoose'
import AITaskConfig from '../models/AITaskConfig.js'

const TASK_DEFAULTS = [
  { task: 'chat',       provider: 'claude', model: 'auto',    autoEnabled: false, schedule: 'manual' },
  { task: 'anomaly',    provider: 'ollama', model: 'llama3',  autoEnabled: false, schedule: 'every_hour' },
  { task: 'triage',     provider: 'claude', model: 'auto',    autoEnabled: false, schedule: 'manual' },
  { task: 'brief',      provider: 'claude', model: 'auto',    autoEnabled: false, schedule: 'daily_6am' },
  { task: 'search',     provider: 'ollama', model: 'mistral', autoEnabled: false, schedule: 'manual' },
  { task: 'comparison', provider: 'claude', model: 'auto',    autoEnabled: false, schedule: 'manual' },
]

async function seedTaskConfigs() {
  for (const d of TASK_DEFAULTS) {
    await AITaskConfig.findOneAndUpdate(
      { task: d.task },
      { $setOnInsert: d },
      { upsert: true, new: true }
    )
  }
  console.log('AI task configs seeded')
}

export async function connectMongo() {
  try {
    await mongoose.connect(process.env.MONGO_URI)
    console.log('MongoDB connected')
    await seedTaskConfigs()
  } catch (err) {
    console.error('MongoDB connection error:', err.message)
    process.exit(1)
  }
}
