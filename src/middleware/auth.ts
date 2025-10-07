// src/middleware/auth.ts
import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import { Env } from "../config/env";

type JwtUser = { sub: number; role: "user" | "admin"; iat?: number; exp?: number };

function unauthorized(res: Response, message = "Unauthorized") {
  return res.status(401).json({ message });
}
function forbidden(res: Response, message = "Forbidden") {
  return res.status(403).json({ message });
}

/** AuthN: requires a valid access_token cookie (JWT) */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.cookies?.["access_token"];
  if (!token) return unauthorized(res);

  try {
    const payload = jwt.verify(token, Env.AUTH_JWT_SECRET, {
      issuer: "names-search",
      audience: "api",
    }) as unknown as JwtUser;

    (req as any).user = payload; // attach { sub, role, iat, exp }
    return next();
  } catch {
    return unauthorized(res, "Invalid or expired token");
  }
}

/** AuthZ: requires a specific role */
export function requireRole(role: "admin" | "user") {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = (req as any).user as JwtUser | undefined;
    if (!user) return unauthorized(res);
    if (role === "admin" && user.role !== "admin") {
      return forbidden(res, "Admin only");
    }
    return next();
  };
}

/* =========================
   CSRF (double-submit) utils
   ========================= */

/**
 * CSRF token format: base64url(nonce).base64url(HMAC_SHA256(secret, nonce))
 * We store ONLY the full token in a non-HttpOnly cookie; FE reads cookie and sends it in header.
 */
const CSRF_COOKIE = "csrf_token";
const CSRF_HEADER = "x-csrf-token";

function b64url(buf: Buffer) {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
function fromB64url(s: string) {
  const p = s.replace(/-/g, "+").replace(/_/g, "/");
  const pad = p.length % 4 ? "=".repeat(4 - (p.length % 4)) : "";
  return Buffer.from(p + pad, "base64");
}

function signCsrf(nonce: Buffer) {
  const h = createHmac("sha256", Env.CSRF_SECRET);
  h.update(nonce);
  return h.digest();
}

function makeCsrfToken(): string {
  const nonce = randomBytes(32);
  const sig = signCsrf(nonce);
  return `${b64url(nonce)}.${b64url(sig)}`;
}

function verifyCsrfToken(token: string): boolean {
  const parts = token.split(".");
  if (parts.length !== 2) return false;
  const [nonceB64, sigB64] = parts;
  const nonce = fromB64url(nonceB64);
  const sig = fromB64url(sigB64);
  if (nonce.length !== 32 || sig.length !== 32) return false;

  const expected = signCsrf(nonce);
  try {
    return timingSafeEqual(expected, sig);
  } catch {
    return false;
  }
}

/**
 * Sets a CSRF cookie if absent. Use on GET/HEAD (safe methods) or globally.
 * Cookie is NOT HttpOnly so the FE can read it and mirror to the header.
 */
export function ensureCsrfCookie(req: Request, res: Response, next: NextFunction) {
  const method = req.method.toUpperCase();
  const isSafe = method === "GET" || method === "HEAD" || method === "OPTIONS";
  // We can set this on any request; typically done on safe methods.
  const hasCookie = Boolean(req.cookies?.[CSRF_COOKIE]);
  if (!hasCookie && isSafe) {
    const token = makeCsrfToken();
    res.cookie(CSRF_COOKIE, token, {
      httpOnly: false,                // FE must read and reflect to header
      secure: true,                   // keep true; use HTTPS in dev or toggle if needed
      sameSite: "strict",
      maxAge: 1000 * 60 * 60 * 24,    // 1 day
      path: "/",
    });
  }
  return next();
}

/**
 * Verifies CSRF for state-changing requests.
 * Require header x-csrf-token and cookie csrf_token to match and validate signature.
 */
export function verifyCsrf(req: Request, res: Response, next: NextFunction) {
  const header = String(req.headers[CSRF_HEADER] || "");
  const cookie = String(req.cookies?.[CSRF_COOKIE] || "");
  if (!header || !cookie) {
    return unauthorized(res, "CSRF token missing");
  }
  if (header !== cookie) {
    return unauthorized(res, "CSRF token mismatch");
  }
  if (!verifyCsrfToken(header)) {
    return unauthorized(res, "Invalid CSRF token");
  }
  return next();
}

export function requireChallenge(req: Request, res: Response, next: NextFunction) {
  const h = req.headers["authorization"] || "";
  const m = /^Bearer\s+(.+)$/.exec(Array.isArray(h) ? h[0] : h);
  if (!m) return res.status(401).json({ message: "Unauthorized" });

  try {
    const payload = jwt.verify(m[1], Env.AUTH_JWT_SECRET, {
      issuer: "names-search",
      audience: "auth",
    }) as any;

    // must be the password-ok challenge
    if (payload?.stage !== "pwd-ok") {
      return res.status(401).json({ message: "Invalid challenge token" });
    }

    // sub can be number or string; coerce safely
    const subRaw = payload.sub ?? payload.userId;
    const sub = typeof subRaw === "string" ? Number(subRaw) : subRaw;
    if (!Number.isFinite(sub)) {
      return res.status(401).json({ message: "Invalid challenge token" });
    }

    (req as any).user = { sub, email: payload.email, role: payload.role ?? "admin" };
    return next();
  } catch (e) {
    return res.status(401).json({ message: "Unauthorized" });
  }
}

