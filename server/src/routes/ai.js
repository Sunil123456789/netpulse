import { Router } from 'express'
const router = Router()
router.get('/', (req, res) => res.json({ message: 'ai route ok' }))
export default router
