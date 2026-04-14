import 'dotenv/config'
import express from 'express'
import { createServer } from 'http'
import { Server } from 'socket.io'
import cors from 'cors'
import helmet from 'helmet'
import compression from 'compression'
import morgan from 'morgan'
import rateLimit from 'express-rate-limit'
import { connectMongo } from './config/mongo.js'
import { connectRedis } from './config/redis.js'
import { initWebSocket } from './services/websocket.js'
import { startAlertEngine } from './services/alertEngine.js'
import { scheduler } from './services/ai/scheduler.js'
import authRoutes from './routes/auth.js'
import userRoutes from './routes/users.js'
import deviceRoutes from './routes/devices.js'
import siteRoutes from './routes/sites.js'
import ticketRoutes from './routes/tickets.js'
import logsRoutes from './routes/logs.js'
import alertRoutes from './routes/alerts.js'
import aiRoutes from './routes/ai.js'
import mlRoutes from './routes/ml.js'
import statsRoutes from './routes/stats.js'
import edrRoutes from './routes/edr.js'
import zabbixRoutes from './routes/zabbix.js'
import { errorHandler } from './middleware/errorHandler.js'
import { authenticate, authorize } from './middleware/auth.js'
import './models/AITaskConfig.js'
import './models/AIScore.js'
import './models/AIAnomaly.js'
import './models/AIBrief.js'
import './models/AIBaseline.js'
import './models/AIMLImprovement.js'
import './models/AIMLFeedback.js'

for (const v of ['JWT_SECRET', 'MONGO_URI', 'ES_HOST']) {
  if (!process.env[v]) throw new Error(`Missing required env var: ${v}`)
}

const app = express()
const httpServer = createServer(app)
const io = new Server(httpServer, {
  cors: { origin: process.env.CORS_ORIGIN || 'http://localhost:3000', methods: ['GET', 'POST'] },
})

app.use(helmet())
app.use(compression())
app.use(cors({ origin: process.env.CORS_ORIGIN || 'http://localhost:3000' }))
app.use(express.json({ limit: '10mb' }))
app.use(morgan('dev'))
app.use('/api/', rateLimit({ windowMs: 15 * 60 * 1000, max: 500 }))

app.use('/api/auth',    authRoutes)
app.use('/api/users',   authenticate, authorize('admin'), userRoutes)
app.use('/api/devices', authenticate, authorize('admin'), deviceRoutes)
app.use('/api/sites',   authenticate, authorize('admin'), siteRoutes)
app.use('/api/tickets', authenticate, ticketRoutes)
app.use('/api/logs',    authenticate, logsRoutes)
app.use('/api/alerts',  authenticate, authorize('admin'), alertRoutes)
app.use('/api/ai',      authenticate, aiRoutes)
app.use('/api/ml',      authenticate, mlRoutes)
app.use('/api/stats',   authenticate, statsRoutes)
app.use('/api/edr',     authenticate, edrRoutes)
app.use('/api/zabbix', authenticate, zabbixRoutes)
app.get('/health', (req, res) => res.json({ status: 'ok', version: '1.0.0', ai: process.env.AI_PROVIDER || 'claude' }))
app.use(errorHandler)

async function start() {
  await connectMongo()
  scheduler.initialize().catch(err =>
    console.error('Scheduler init failed:', err.message)
  )
  await connectRedis()
  initWebSocket(io)
  startAlertEngine(io)
  const PORT = process.env.PORT || 5000
  httpServer.listen(PORT, () => {
    console.log(`NetPulse server running on port ${PORT}`)
    console.log(`AI provider: ${process.env.AI_PROVIDER || 'claude'}`)
  })
}

start().catch(console.error)

