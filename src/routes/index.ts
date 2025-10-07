// src/routes/index.ts
import { Router } from "express";

const router = Router();

// keep your existing POST /health (unchanged)
router.post("/health", (_req, res) => res.json({ ok: true }));

// (optional convenience) add GET /health too — safe, non-breaking
router.get("/health", (_req, res) => res.json({ ok: true }));

export default router;
