import mongoose from 'mongoose'

const commentSchema = new mongoose.Schema({
  author:    { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  message:   { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
})

const ticketSchema = new mongoose.Schema({
  title:       { type: String, required: true },
  description: { type: String, required: true },
  severity:    { type: String, enum: ['critical', 'high', 'medium', 'low'], required: true },
  status:      { type: String, enum: ['open', 'in-progress', 'resolved', 'closed'], default: 'open' },
  category:    { type: String, enum: ['security', 'network', 'performance', 'config', 'other'] },
  assignee:    { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  createdBy:   { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  site:        { type: mongoose.Schema.Types.ObjectId, ref: 'Site' },
  device:      { type: mongoose.Schema.Types.ObjectId, ref: 'Device' },
  sourceAlert: { type: Object },
  comments:    [commentSchema],
  resolvedAt:  { type: Date },
  aiSummary:   { type: String },
}, { timestamps: true })

export default mongoose.model('Ticket', ticketSchema)
