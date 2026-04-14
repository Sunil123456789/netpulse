import mongoose from 'mongoose'

const aiMLFeedbackSchema = new mongoose.Schema({
  anomalyRunId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'AIAnomaly',
    required: true,
  },
  anomalyIndex: { type: Number, required: true },
  metric:       { type: String, required: true },
  userFeedback: {
    type: String,
    required: true,
    enum: ['true_positive', 'false_positive', 'unsure'],
  },
  markedAt: { type: Date, default: Date.now },
  markedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  aiReviewed:   { type: Boolean, default: false },
  aiConclusion: { type: String, default: null },
  mlAdjusted:   { type: Boolean, default: false },
})

export default mongoose.model('AIMLFeedback', aiMLFeedbackSchema)
