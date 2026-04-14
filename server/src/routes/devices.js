import { Router } from 'express'
import Device from '../models/Device.js'
import { sendWriteError, validateDeviceWrite, validateObjectIdParam } from '../middleware/validators.js'

const router = Router()

router.get('/', async (req, res) => {
  try {
    const devices = await Device.find().populate('site', 'name')
    res.json(devices)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

router.post('/', validateDeviceWrite, async (req, res) => {
  try {
    const device = await Device.create(req.body)
    res.status(201).json(device)
  } catch (err) { sendWriteError(res, err) }
})

router.put('/:id', validateObjectIdParam(), validateDeviceWrite, async (req, res) => {
  try {
    const device = await Device.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true })
    res.json(device)
  } catch (err) { sendWriteError(res, err) }
})

router.delete('/:id', validateObjectIdParam(), async (req, res) => {
  try {
    await Device.findByIdAndDelete(req.params.id)
    res.json({ message: 'Device deleted' })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

export default router
