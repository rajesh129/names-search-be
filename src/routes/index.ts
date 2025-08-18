import { Router } from 'express';
import namesRouter from './names.routes';

const router = Router();

router.post('/health', (_req, res) => res.json({ ok: true }));
router.use('/names', namesRouter);

export default router;
