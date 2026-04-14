import mongoose from 'mongoose'

const aiScoreSchema = new mongoose.Schema({
  task:            { type: String, required: true },
  provider:        { type: String, required: true },
  model:           { type: String, required: true },
  query:           { type: String, required: true },
  response:        { type: String, required: true },
  responseTimeMs:  { type: Number, default: 0 },
  tokensUsed:      { type: Number, default: 0 },
  scores: {
    speed:          { type: Number, default: 0 },
    specificity:    { type: Number, default: 0 },
    actionability:  { type: Number, default: 0 },
    length:         { type: Number, default: 0 },
    userRating:     { type: Number, default: null },
  },
  totalScore: { type: Number, default: 0 },
  createdAt:  { type: Date, default: Date.now },
})

export default mongoose.model('AIScore', aiScoreSchema)
