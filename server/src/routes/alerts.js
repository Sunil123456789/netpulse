import { Router } from 'express'
import AlertRule from '../models/AlertRule.js'
import { sendWriteError, validateAlertRuleWrite, validateObjectIdParam } from '../middleware/validators.js'

const router = Router()

router.get('/', async (req, res) => {
  try {
    const rules = await AlertRule.find()
    res.json(rules)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

router.post('/', validateAlertRuleWrite, async (req, res) => {
  try {
    const rule = await AlertRule.create(req.body)
    res.status(201).json(rule)
  } catch (err) { sendWriteError(res, err) }
})

router.put('/:id', validateObjectIdParam(), validateAlertRuleWrite, async (req, res) => {
  try {
    const rule = await AlertRule.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true })
    res.json(rule)
  } catch (err) { sendWriteError(res, err) }
})

router.delete('/:id', validateObjectIdParam(), async (req, res) => {
  try {
    await AlertRule.findByIdAndDelete(req.params.id)
    res.json({ message: 'Rule deleted' })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

export default router
