import { Router } from 'express'
const router = Router()
router.get('/', (req, res) => res.json({ message: 'stats route ok' }))
export default router
