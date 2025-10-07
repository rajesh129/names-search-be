// src/controllers/auth.controller.ts
import { Request, Response } from "express";
import { z } from "zod";
import jwt from "jsonwebtoken";
import { AuthService } from "../services/auth.service";
import { Env } from "../config/env";
import { UsersRepo } from "../repositories/users.repo";
import { authenticator } from "otplib";
import QRCode from "qrcode";
import { seal } from "../utils/crypto";

// Optional reCAPTCHA helper (you already have middleware/recaptcha.ts;
// if you prefer, swap this for your existing middleware usage)
async function verifyRecaptchaIfEnabled(req: Request): Promise<void> {
  if (!Env.RECAPTCHA_ENABLED) return;
  const token = req.body?.recaptchaToken;
  if (!token || !Env.RECAPTCHA_SECRET) {
    const e: any = new Error("reCAPTCHA verification required");
    e.status = 400;
    throw e;
  }
  // Minimal verification via fetch; replace with your existing code if present
  const params = new URLSearchParams({
    secret: Env.RECAPTCHA_SECRET,
    response: token,
  });
  const resp = await fetch("https://www.google.com/recaptcha/api/siteverify", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params,
  });
  const data = (await resp.json()) as { success: boolean; score?: number; action?: string };
  if (!data.success) {
    const e: any = new Error("reCAPTCHA verification failed");
    e.status = 400;
    throw e;
  }
}

const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(8),
  recaptchaToken: z.string().optional(),
});

const verifyTotpSchema = z.object({
  challengeToken: z.string().min(1),
  code: z.string().regex(/^\d{6}$/),
});

const enrollTotpSchema = z.object({
  // “admin bootstrap only” — require password re-auth
  password: z.string().min(8),
  // If client already scanned and submits a first code in same call, we can confirm immediately:
  code: z.string().regex(/^\d{6}$/).optional(),
});

const svc = new AuthService();
const usersRepo = new UsersRepo();

// ---- Cookie helpers ----
function cookieOptions(maxAgeMs: number) {
  return {
    httpOnly: true,
    secure: true, // set to true in prod (HTTPS); keep true to be safe
    sameSite: "strict" as const,
    maxAge: maxAgeMs,
  };
}

export async function login(req: Request, res: Response) {
  const input = loginSchema.safeParse(req.body);
  if (!input.success) return res.status(422).json({ message: "Invalid input", errors: input.error.flatten() });

  await verifyRecaptchaIfEnabled(req);

  const result = await svc.passwordLogin(input.data.email, input.data.password);
  if (!result) return res.status(401).json({ message: "Invalid credentials" });

  // Return short-lived challenge; do NOT set cookies yet
  return res.json({ challengeToken: result.challengeToken, user: result.user });
}

export async function verifyTotp(req: Request, res: Response) {
  const input = verifyTotpSchema.safeParse(req.body);
  if (!input.success) return res.status(422).json({ message: "Invalid input", errors: input.error.flatten() });

  const result = await svc.verifyTotpAndIssueTokens(input.data.challengeToken, input.data.code);
  if (!result) return res.status(401).json({ message: "Invalid or expired challenge/code" });

  // Set HttpOnly cookies
  res.cookie("access_token", result.accessToken, cookieOptions(Env.ACCESS_TOKEN_TTL_MIN * 60 * 1000));
  if (result.refreshToken) {
    res.cookie("refresh_token", result.refreshToken, cookieOptions(Env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000));
  }
  return res.json({ user: result.user });
}

export async function logout(_req: Request, res: Response) {
  // Clear cookies
  res.clearCookie("access_token");
  res.clearCookie("refresh_token");
  return res.json({ ok: true });
}

/**
 * POST /auth/totp/enroll
 * “Admin bootstrap only” — require existing password re-auth on the current user.
 * Behavior:
 *  - If no `code` provided:
 *      * Verify password
 *      * Generate a new TOTP secret (base32), build otpauth URL, return QR data URL + secret
 *      * NOTE: NOT stored yet — client must call again with the 6-digit code to confirm
 *  - If `code` provided:
 *      * Verify password
 *      * Verify code against (secret provided in this call) OR suggest 2-step (start then confirm)
 *      * If valid, seal & store secret; set is_totp_enabled=true
 */
export async function enrollTotp(req: Request, res: Response) {
  // You must be authenticated already to know the current user. If you haven’t wired requireAuth yet,
  // you can pass userId in body during bootstrap (not recommended in prod). Assume req.user.id exists.
  const userId = (req as any).user?.sub ?? null;
  if (!userId) return res.status(401).json({ message: "Unauthorized" });

  const parsed = enrollTotpSchema.safeParse(req.body);
  if (!parsed.success) return res.status(422).json({ message: "Invalid input", errors: parsed.error.flatten() });

  // Re-fetch user and verify password again (re-auth)
  const me = await usersRepo.findByEmail((req as any).user.email);
  if (!me) return res.status(404).json({ message: "User not found" });

  // Reauth using password (we reuse AuthService.passwordLogin but ignore challenge result)
  const pwdCheck = await svc.passwordLogin(me.email, parsed.data.password);
  if (!pwdCheck) return res.status(401).json({ message: "Invalid password" });

  // If client did not provide code -> start enrollment: generate & return QR
  if (!parsed.data.code) {
    const secretBase32 = authenticator.generateSecret(); // base32
    const label = encodeURIComponent(me.email);
    const issuer = encodeURIComponent("names-search");
    const otpauth = `otpauth://totp/${issuer}:${label}?secret=${secretBase32}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30`;
    const qrDataUrl = await QRCode.toDataURL(otpauth);

    // Return secret & QR; client should immediately prompt for a 6-digit code and call this endpoint again including `code` and the same `secretBase32`.
    // To avoid sending secret back again from client, you could issue a one-time "enrollToken" (JWT) that carries the secret for a short TTL.
    const enrollToken = jwt.sign(
        { sub: me.id, email: me.email, stage: "enroll", secretBase32 },
        Env.AUTH_JWT_SECRET,
        { expiresIn: "10m", issuer: "names-search", audience: "auth" }
    );

    return res.json({ otpauthUrl: otpauth, qrDataUrl, secretBase32, enrollToken });
  }

  // If code provided, we expect an enrollToken too — safer than trusting client to resend secret
  const enrollToken = req.body?.enrollToken as string | undefined;
  if (!enrollToken) return res.status(400).json({ message: "Missing enrollToken for confirmation" });

  let tokenPayload: { sub: number; email: string; stage: string; secretBase32: string };
  try {
    tokenPayload = jwt.verify(enrollToken, Env.AUTH_JWT_SECRET, {
      issuer: "names-search",
      audience: "auth",
    }) as unknown as { sub: number; email: string; stage: string; secretBase32: string };
  } catch {
    return res.status(401).json({ message: "Invalid/expired enrollToken" });
  }
  if (tokenPayload.stage !== "enroll" || tokenPayload.sub !== me.id) {
    return res.status(401).json({ message: "Invalid enroll token payload" });
  }

  const ok = authenticator.check(parsed.data.code, tokenPayload.secretBase32);
  if (!ok) return res.status(400).json({ message: "Invalid TOTP code, try again" });

  // Store sealed secret & enable TOTP
  const sealed = seal(Buffer.from(tokenPayload.secretBase32, "utf8"), `user:${me.id}`);
  await usersRepo.storeTotpSecret(me.id, sealed, true);

  return res.json({ enabled: true });
}
