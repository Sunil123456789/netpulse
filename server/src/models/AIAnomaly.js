import mongoose from 'mongoose'

const aiAnomalySchema = new mongoose.Schema({
  runAt:       { type: Date, default: Date.now },
  rangeFrom:   { type: Date, required: true },
  rangeTo:     { type: Date, required: true },
  sensitivity: { type: Number, default: 2.0 },
  sources:     [{ type: String }],
  triggeredBy: {
    type: String,
    default: 'manual',
    enum: ['manual', 'schedule', 'live'],
  },
  anomalies: [{
    metric:         String,
    current:        Number,
    baseline:       Number,
    deviation:      Number,
    severity: {
      type: String,
      enum: ['low', 'medium', 'high', 'critical'],
    },
    description:    String,
    recommendation: String,
    userFeedback: {
      type: String,
      default: null,
      enum: ['true_positive', 'false_positive', 'unsure', null],
    },
    aiReviewed:    { type: Boolean, default: false },
    aiConclusion:  { type: String, default: null },
  }],
  totalChecked:     { type: Number, default: 0 },
  executionTimeMs:  { type: Number, default: 0 },
  aiExplanation:    { type: String, default: null },
  aiProvider:       { type: String, default: null },
  createdAt:        { type: Date, default: Date.now },
})

export default mongoose.model('AIAnomaly', aiAnomalySchema)
