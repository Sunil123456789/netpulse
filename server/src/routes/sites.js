import { Router } from 'express'
import Site from '../models/Site.js'
import { sendWriteError, validateObjectIdParam, validateSiteWrite } from '../middleware/validators.js'

const router = Router()

router.get('/', async (req, res) => {
  try {
    const sites = await Site.find()
    res.json(sites)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

router.post('/', validateSiteWrite, async (req, res) => {
  try {
    const site = await Site.create(req.body)
    res.status(201).json(site)
  } catch (err) { sendWriteError(res, err) }
})

router.put('/:id', validateObjectIdParam(), validateSiteWrite, async (req, res) => {
  try {
    const site = await Site.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true })
    res.json(site)
  } catch (err) { sendWriteError(res, err) }
})

router.delete('/:id', validateObjectIdParam(), async (req, res) => {
  try {
    await Site.findByIdAndDelete(req.params.id)
    res.json({ message: 'Site deleted' })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

export default router
