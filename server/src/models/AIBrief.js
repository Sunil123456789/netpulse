import mongoose from 'mongoose'

const sectionSchema = {
  summary:         String,
  highlights:      [String],
  recommendations: [String],
}

const aiBriefSchema = new mongoose.Schema({
  title:            { type: String, default: 'NetPulse Intelligence Brief' },
  executiveSummary: { type: String, default: '' },
  riskLevel: {
    type: String,
    default: 'medium',
    enum: ['low', 'medium', 'high', 'critical'],
  },
  generatedAt:      { type: Date, default: Date.now },
  rangeFrom:        { type: Date, required: true },
  rangeTo:          { type: Date, required: true },
  provider:         { type: String, required: true },
  model:            { type: String, default: 'auto' },
  triggeredBy: {
    type: String,
    default: 'manual',
    enum: ['manual', 'schedule'],
  },
  sections: {
    security:       sectionSchema,
    network:        sectionSchema,
    infrastructure: sectionSchema,
  },
  topRecommendations: [String],
  fullReport:         { type: String, required: true },
  tokensUsed:         { type: Number, default: 0 },
  generationTimeMs:   { type: Number, default: 0 },
  totalScore:         { type: Number, default: 0 },
  scoreId:            { type: String, default: null },
  createdAt:          { type: Date, default: Date.now },
})

export default mongoose.model('AIBrief', aiBriefSchema)
