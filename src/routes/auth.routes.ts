// src/routes/auth.routes.ts
import { Router } from "express";
import { login, verifyTotp, logout, enrollTotp } from "../controllers/auth.controller";
import { limitLogin, limitTotp } from "../middleware/rateLimit";
import { requireAuth, requireChallenge } from "../middleware/auth";

const r = Router();

r.post("/login", limitLogin, login);
r.post("/verify-totp", limitTotp, verifyTotp);
r.post("/logout", logout);

// Require current auth to enroll TOTP
r.post("/totp/enroll", requireChallenge, enrollTotp);

export default r;
