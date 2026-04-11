import { Router } from 'express'
const router = Router()
router.get('/', (req, res) => res.json({ message: 'alerts route ok' }))
export default router
