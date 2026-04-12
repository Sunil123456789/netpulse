import { Router } from 'express'
import jwt from 'jsonwebtoken'  // used for login token signing
import rateLimit from 'express-rate-limit'
import User from '../models/User.js'
import { authenticate, authorize } from '../middleware/auth.js'

const router = Router()

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: 'Too many login attempts. Try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
})

router.post('/login', loginLimiter, async (req, res) => {
  try {
    const { email, password } = req.body
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' })

    const user = await User.findOne({ email, active: true }).select('+password')
    if (!user) return res.status(401).json({ error: 'Invalid credentials' })

    const valid = await user.comparePassword(password)
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' })

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '7d' })

    await User.findByIdAndUpdate(user._id, { lastLogin: new Date() })

    res.json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.post('/register', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { name, email, password, role } = req.body
    const exists = await User.findOne({ email })
    if (exists) return res.status(400).json({ error: 'Email already registered' })
    const user = await User.create({ name, email, password, role: role || 'viewer' })
    res.status(201).json({ message: 'User created', id: user._id })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.get('/me', authenticate, (req, res) => {
  const u = req.user
  res.json({ id: u._id, name: u.name, email: u.email, role: u.role })
})

export default router
