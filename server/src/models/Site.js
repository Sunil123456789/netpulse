import mongoose from 'mongoose'

const siteSchema = new mongoose.Schema({
  name:        { type: String, required: true, unique: true },
  location:    { type: String },
  description: { type: String },
  ipRanges:    [String],
  timezone:    { type: String, default: 'UTC' },
  active:      { type: Boolean, default: true },
}, { timestamps: true })

export default mongoose.model('Site', siteSchema)
