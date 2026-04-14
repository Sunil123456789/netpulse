import mongoose from 'mongoose'

const aiBaselineSchema = new mongoose.Schema({
  metric: {
    type: String,
    required: true,
    enum: [
      'firewall_denied',
      'firewall_ips',
      'firewall_total',
      'cisco_macflap',
      'cisco_updown',
      'cisco_total',
      'zabbix_problems',
      'sentinel_total',
    ],
  },
  hour:      { type: Number, required: true, min: 0, max: 23 },
  dayOfWeek: { type: Number, required: true, min: 0, max: 6 },
  mean:      { type: Number, required: true },
  stddev:    { type: Number, required: true },
  min:       { type: Number, default: 0 },
  max:       { type: Number, default: 0 },
  samples:   { type: Number, default: 0 },
  updatedAt: { type: Date, default: Date.now },
})

aiBaselineSchema.index({ metric: 1, hour: 1, dayOfWeek: 1 }, { unique: true })

export default mongoose.model('AIBaseline', aiBaselineSchema)
