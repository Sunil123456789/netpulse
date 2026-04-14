import mongoose from 'mongoose'
import AITaskConfig from '../models/AITaskConfig.js'
import { getTaskDefaults } from './aiTaskDefaults.js'

async function seedTaskConfigs() {
  for (const d of getTaskDefaults()) {
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
