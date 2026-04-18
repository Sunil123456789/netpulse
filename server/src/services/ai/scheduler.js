import AITaskConfig from '../../models/AITaskConfig.js'
import { buildAllBaselines } from '../ml/baseline.js'
import { detectAnomalies } from '../ml/anomaly.js'
import { generateBrief } from './dailyBrief.js'

class AIScheduler {
  constructor() {
    this.intervals = {}
    this.running = {}
    this.initialized = false
  }

  // Convert schedule string to milliseconds
  scheduleToMs(schedule) {
    const map = {
      'every_15m':  15 * 60 * 1000,
      'every_hour':  60 * 60 * 1000,
      'every_6h':    6 * 60 * 60 * 1000,
      'every_12h':  12 * 60 * 60 * 1000,
      'daily_6am':  24 * 60 * 60 * 1000,
      'daily_9am':  24 * 60 * 60 * 1000,
      'manual':     null
    }
    return map[schedule] || null
  }

  // Run a specific task
  async runTask(task, { trigger = 'scheduled' } = {}) {
    if (this.running[task]) {
      console.log(`Scheduler: ${task} already running, skipping`)
      return
    }

    this.running[task] = true
    const startTime = Date.now()
    console.log(`Scheduler: Starting ${task}`)

    try {
      switch (task) {
        case 'anomaly':
          await detectAnomalies({
            triggeredBy: 'scheduled',
            sensitivity: 2.0,
            sources: ['firewall', 'cisco', 'sentinel'],
            trigger,
          })
          break

        case 'brief':
          await generateBrief({
            triggeredBy: 'scheduled',
            trigger,
          })
          break

        case 'baseline_update':
          await buildAllBaselines(7, { trigger })
          break

        default:
          console.log(`Scheduler: Unknown task ${task}`)
      }

      // Update lastRun in MongoDB
      await AITaskConfig.findOneAndUpdate(
        { task },
        {
          lastRun: new Date(),
          lastRunStatus: 'success',
          lastRunDuration: Date.now() - startTime,
          updatedAt: new Date()
        }
      )

      console.log(`Scheduler: ${task} completed in ${Date.now() - startTime}ms`)
    } catch (err) {
      console.error(`Scheduler: ${task} failed:`, err.message)
      await AITaskConfig.findOneAndUpdate(
        { task },
        {
          lastRun: new Date(),
          lastRunStatus: 'failed',
          lastRunDuration: Date.now() - startTime,
          updatedAt: new Date()
        }
      )
    } finally {
      this.running[task] = false
    }
  }

  // Start scheduler for a task
  async startTask(task) {
    // Clear existing interval
    if (this.intervals[task]) {
      clearInterval(this.intervals[task])
      delete this.intervals[task]
    }

    const config = await AITaskConfig.findOne({ task })
    if (!config || !config.autoEnabled) return

    const intervalMs = this.scheduleToMs(config.schedule)
    if (!intervalMs) return // manual task

    console.log(`Scheduler: Starting auto-run for ${task} every ${config.schedule}`)

    this.intervals[task] = setInterval(() => {
      this.runTask(task, { trigger: 'scheduled' }).catch(err =>
        console.error(`Scheduler interval error for ${task}:`, err.message)
      )
    }, intervalMs)

    // Update nextRun
    await AITaskConfig.findOneAndUpdate(
      { task },
      { nextRun: new Date(Date.now() + intervalMs), updatedAt: new Date() }
    )
  }

  // Stop scheduler for a task
  stopTask(task) {
    if (this.intervals[task]) {
      clearInterval(this.intervals[task])
      delete this.intervals[task]
      console.log(`Scheduler: Stopped ${task}`)
    }
  }

  // Initialize all enabled schedulers from MongoDB
  async initialize() {
    if (this.initialized) return

    try {
      const configs = await AITaskConfig.find({ autoEnabled: true })

      for (const config of configs) {
        await this.startTask(config.task)
      }

      // Always run baseline update every 6 hours regardless
      // (it's background ML learning, should always run)
      if (!this.intervals['baseline_update']) {
        this.intervals['baseline_update'] = setInterval(() => {
          this.runTask('baseline_update', { trigger: 'scheduled' }).catch(err =>
            console.error('Baseline update error:', err.message)
          )
        }, 6 * 60 * 60 * 1000) // every 6 hours

        console.log('Scheduler: Baseline auto-update started (every 6h)')
      }

      this.initialized = true
      console.log(`Scheduler: Initialized with ${configs.length} enabled tasks`)
    } catch (err) {
      console.error('Scheduler initialization failed:', err.message)
    }
  }

  // Get status of all scheduled tasks
  async getStatus() {
    const configs = await AITaskConfig.find().lean()
    return configs.map(c => ({
      task: c.task,
      autoEnabled: c.autoEnabled,
      schedule: c.schedule,
      isRunning: !!this.running[c.task],
      hasInterval: !!this.intervals[c.task],
      lastRun: c.lastRun,
      lastRunStatus: c.lastRunStatus,
      lastRunDuration: c.lastRunDuration,
      nextRun: c.nextRun,
      provider: c.provider,
      model: c.model
    }))
  }
}

// Singleton instance
export const scheduler = new AIScheduler()
