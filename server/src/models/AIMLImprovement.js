import mongoose from 'mongoose'

const aiMLImprovementSchema = new mongoose.Schema({
  mlModel: {
    type: String,
    required: true,
    enum: [
      'baseline_anomaly',
      'pattern_recognition',
      'port_scan',
      'brute_force',
      'mac_flap',
      'edr_behavior',
    ],
  },
  triggeredBy: {
    type: String,
    enum: ['manual', 'false_positive_rate', 'scheduled'],
  },
  aiProvider: { type: String, required: true },
  aiModel:    { type: String, default: 'auto' },
  performanceBefore: {
    falsePositiveRate: Number,
    totalRuns:         Number,
    totalAnomalies:    Number,
    threshold:         Number,
  },
  aiSuggestion:   { type: String, required: true },
  suggestedChanges: [{
    field:    String,
    oldValue: String,
    newValue: String,
    reason:   String,
  }],
  status: {
    type: String,
    default: 'pending',
    enum: ['pending', 'applied', 'rejected'],
  },
  appliedAt: { type: Date, default: null },
  performanceAfter: {
    falsePositiveRate: Number,
    improvement:       Number,
  },
  createdAt: { type: Date, default: Date.now },
})

export default mongoose.model('AIMLImprovement', aiMLImprovementSchema)
