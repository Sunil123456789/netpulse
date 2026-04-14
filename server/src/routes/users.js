import { Router } from 'express'
import User from '../models/User.js'
import { sendWriteError, validateObjectIdParam, validateUserCreate, validateUserUpdate } from '../middleware/validators.js'

const router = Router()

router.get('/', async (req, res) => {
  try {
    const users = await User.find()
    res.json(users)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

router.post('/', validateUserCreate, async (req, res) => {
  try {
    const user = await User.create(req.body)
    res.status(201).json({ id: user._id, name: user.name, email: user.email, role: user.role })
  } catch (err) { sendWriteError(res, err) }
})

router.put('/:id', validateObjectIdParam(), validateUserUpdate, async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true })
    res.json(user)
  } catch (err) { sendWriteError(res, err) }
})

router.delete('/:id', validateObjectIdParam(), async (req, res) => {
  try {
    await User.findByIdAndDelete(req.params.id)
    res.json({ message: 'User deleted' })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

export default router
