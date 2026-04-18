import express from 'express'
import jwt from 'jsonwebtoken'
import request from 'supertest'
import { jest } from '@jest/globals'

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret'
process.env.JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '1h'
process.env.AI_PROVIDER = process.env.AI_PROVIDER || 'ollama'

const mockUserModel = {
  findOne: jest.fn(),
  findById: jest.fn(),
  findByIdAndUpdate: jest.fn(),
  create: jest.fn(),
}

const mockOllamaProvider = {
  getStatus: jest.fn(),
  pullModel: jest.fn(),
  chat: jest.fn(),
  isConfigured: jest.fn(() => true),
}

const mockClaudeProvider = {
  chat: jest.fn(),
  isConfigured: jest.fn(() => false),
}

const mockOpenAIProvider = {
  chat: jest.fn(),
  isConfigured: jest.fn(() => false),
}

jest.unstable_mockModule('../src/models/User.js', () => ({
  default: mockUserModel,
}))

jest.unstable_mockModule('../src/services/ai/providers/claude.js', () => ({
  claudeProvider: mockClaudeProvider,
}))

jest.unstable_mockModule('../src/services/ai/providers/openai.js', () => ({
  openaiProvider: mockOpenAIProvider,
}))

jest.unstable_mockModule('../src/services/ai/providers/ollama.js', () => ({
  ollamaProvider: mockOllamaProvider,
}))

const authRoutes = (await import('../src/routes/auth.js')).default
const userRoutes = (await import('../src/routes/users.js')).default
const deviceRoutes = (await import('../src/routes/devices.js')).default
const siteRoutes = (await import('../src/routes/sites.js')).default
const alertRoutes = (await import('../src/routes/alerts.js')).default
const aiRoutes = (await import('../src/routes/ai.js')).default
const { authenticate, authorize } = await import('../src/middleware/auth.js')

function createToken(id = '507f191e810c19729de860ea') {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '1h',
  })
}

function buildTestApp() {
  const app = express()
  app.use(express.json())

  app.use('/api/auth', authRoutes)
  app.use('/api/users', authenticate, authorize('admin'), userRoutes)
  app.use('/api/devices', authenticate, authorize('admin'), deviceRoutes)
  app.use('/api/sites', authenticate, authorize('admin'), siteRoutes)
  app.use('/api/alerts', authenticate, authorize('admin'), alertRoutes)
  app.use('/api/ai', authenticate, aiRoutes)

  return app
}

function activeUser(role = 'viewer') {
  return {
    _id: '507f191e810c19729de860ea',
    name: `${role} user`,
    email: `${role}@netpulse.local`,
    role,
    active: true,
  }
}

function mockLoginUser(user) {
  const doc = {
    ...user,
    comparePassword: jest.fn().mockResolvedValue(true),
  }

  mockUserModel.findOne.mockReturnValue({
    select: jest.fn().mockResolvedValue(doc),
  })

  return doc
}

const app = buildTestApp()

beforeEach(() => {
  jest.clearAllMocks()
  mockOllamaProvider.getStatus.mockResolvedValue({
    connected: false,
    models: [],
    requiresAuth: false,
    authConfigured: false,
    detail: null,
  })
})

describe('authentication flow', () => {
  test('login rejects missing credentials with 400', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .send({ email: '', password: '' })

    expect(response.status).toBe(400)
    expect(response.body.error).toBe('Email and password required')
    expect(mockUserModel.findOne).not.toHaveBeenCalled()
  })

  test('login returns token and user payload for valid credentials', async () => {
    const user = activeUser('admin')
    mockLoginUser(user)
    mockUserModel.findByIdAndUpdate.mockResolvedValue(null)

    const response = await request(app)
      .post('/api/auth/login')
      .send({ email: user.email, password: 'secret123' })

    expect(response.status).toBe(200)
    expect(response.body.user).toMatchObject({
      name: user.name,
      email: user.email,
      role: user.role,
    })
    expect(response.body.token).toEqual(expect.any(String))
    expect(mockUserModel.findByIdAndUpdate).toHaveBeenCalled()
  })
})

describe('admin route hardening', () => {
  test.each(['/api/users', '/api/devices', '/api/sites', '/api/alerts'])(
    'viewer token is rejected from %s',
    async (path) => {
      mockUserModel.findById.mockResolvedValue(activeUser('viewer'))

      const response = await request(app)
        .get(path)
        .set('Authorization', `Bearer ${createToken()}`)

      expect(response.status).toBe(403)
      expect(response.body.error).toBe('Insufficient permissions')
    }
  )

  test('admin user creation validates payload and rejects invalid email', async () => {
    mockUserModel.findById.mockResolvedValue(activeUser('admin'))

    const response = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${createToken()}`)
      .send({
        name: 'Broken User',
        email: 'not-an-email',
        password: 'secret123',
        role: 'viewer',
      })

    expect(response.status).toBe(400)
    expect(response.body.error).toBe('Validation failed')
    expect(response.body.details).toContain('email must be a valid email')
    expect(mockUserModel.create).not.toHaveBeenCalled()
  })
})

describe('authenticated AI route', () => {
  test('provider status returns ollama readiness for an authenticated user', async () => {
    mockUserModel.findById.mockResolvedValue(activeUser('viewer'))
    mockOllamaProvider.getStatus.mockResolvedValue({
      connected: true,
      models: [
        { name: 'llama3.2:3b' },
        { name: 'mistral' },
      ],
      requiresAuth: false,
      authConfigured: false,
      detail: null,
    })

    const response = await request(app)
      .get('/api/ai/provider/status')
      .set('Authorization', `Bearer ${createToken()}`)

    expect(response.status).toBe(200)
    expect(response.body.ollama).toMatchObject({
      ready: true,
      modelCount: 2,
    })
    expect(response.body.ollama.models).toEqual(['llama3.2:3b', 'mistral'])
  })
})
