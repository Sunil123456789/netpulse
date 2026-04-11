import { Router } from 'express'
const router = Router()
router.get('/', (req, res) => res.json({ message: 'tickets route ok' }))
export default router
