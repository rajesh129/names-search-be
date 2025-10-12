// src/middleware/auth.ts
import type { Request, Response, NextFunction, CookieOptions } from "express";
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
  if (!token) return res.status(401).json({ message: "No access_token cookie" });
  try {
    const payload = jwt.verify(token, Env.AUTH_JWT_SECRET, {
      issuer: "names-search",
      audience: "api",
    });
    (req as any).user = payload;
    return next();
  } catch (e:any) {
    return res.status(401).json({ message: `Invalid/expired access_token: ${e?.name || 'error'}` });
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
const isDev = Env.NODE_ENV === 'development';
const isDevCrossSite = false; // or drive from an ENV var
export function ensureCsrfCookie(req: Request, res: Response, next: NextFunction) {
  const method = req.method.toUpperCase();
  const isSafe = method === "GET" || method === "HEAD" || method === "OPTIONS";
  // We can set this on any request; typically done on safe methods.
  const hasCookie = Boolean(req.cookies?.[CSRF_COOKIE]);
  const sameSite: CookieOptions["sameSite"] = isDev ? "lax" : "strict";

  if (!hasCookie && isSafe) {
    const token = makeCsrfToken();
    res.cookie(CSRF_COOKIE, token, {
      httpOnly: false,                // FE must read and reflect to header
      secure: !isDev,                   // keep true; use HTTPS in dev or toggle if needed
      sameSite,
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
  const header = String(req.headers["x-csrf-token"] || "");
  const cookie = String(req.cookies?.["csrf_token"] || "");
  if (!header || !cookie) return res.status(401).json({ message: "CSRF token missing (header or cookie)" });
  if (header !== cookie) return res.status(401).json({ message: "CSRF token mismatch" });
  if (!verifyCsrfToken(header)) return res.status(401).json({ message: "CSRF token invalid signature" });
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

