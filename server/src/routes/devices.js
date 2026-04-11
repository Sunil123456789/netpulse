import { Router } from 'express'
const router = Router()
router.get('/', (req, res) => res.json({ message: 'devices route ok' }))
export default router
