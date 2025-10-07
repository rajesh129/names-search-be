// src/middleware/rateLimit.ts
import type { Request, Response, NextFunction } from "express";

/** Generic in-memory sliding window limiter */
type KeyFn = (req: Request) => string;

type LimiterOpts = {
  windowMs: number;
  max: number;
  key: KeyFn;
  name?: string; // for logging/headers
};

type Bucket = { count: number; resetAt: number };

function now() { return Date.now(); }

export function createRateLimiter(opts: LimiterOpts) {
  const store = new Map<string, Bucket>();

  return function rateLimit(req: Request, res: Response, next: NextFunction) {
    const k = opts.key(req);
    const t = now();
    let b = store.get(k);

    if (!b || t >= b.resetAt) {
      b = { count: 0, resetAt: t + opts.windowMs };
      store.set(k, b);
    }

    b.count += 1;

    if (b.count > opts.max) {
      const retryAfter = Math.max(0, Math.ceil((b.resetAt - t) / 1000));
      res.setHeader("Retry-After", String(retryAfter));
      if (opts.name) res.setHeader("X-RateLimit-Name", opts.name);
      res.setHeader("X-RateLimit-Limit", String(opts.max));
      res.setHeader("X-RateLimit-Remaining", "0");
      res.setHeader("X-RateLimit-Reset", String(Math.floor(b.resetAt / 1000)));
      return res.status(429).json({ message: "Too many requests, please try again later." });
    }

    if (opts.name) res.setHeader("X-RateLimit-Name", opts.name);
    res.setHeader("X-RateLimit-Limit", String(opts.max));
    res.setHeader("X-RateLimit-Remaining", String(Math.max(0, opts.max - b.count)));
    res.setHeader("X-RateLimit-Reset", String(Math.floor(b.resetAt / 1000)));
    return next();
  };
}

/** Utility to apply multiple limiters for different windows */
export function combine(middlewares: Array<(req: Request, res: Response, next: NextFunction) => any>) {
  return (req: Request, res: Response, next: NextFunction) => {
    let idx = 0;
    const run = (err?: any) => {
      if (err) return next(err);
      const mw = middlewares[idx++];
      if (!mw) return next();
      mw(req, res, run);
    };
    run();
  };
}

/* ---------------------------
   Ready-made limiters to use
   --------------------------- */

// helpers to extract keys
const keyByIpAndEmail: KeyFn = (req) => {
  const ip = req.ip || req.socket.remoteAddress || "unknown";
  const email = (req.body?.email || "").toString().toLowerCase();
  return `login:${ip}:${email}`;
};

// We don't want to fully parse/verify challenge token here; just key the bucket roughly.
const keyByIpAndChallenge: KeyFn = (req) => {
  const ip = req.ip || req.socket.remoteAddress || "unknown";
  const token = (req.body?.challengeToken || "").toString();
  const short = token ? token.slice(0, 16) : "no-token";
  return `totp:${ip}:${short}`;
};

// /auth/login: 5/min/IP+email & 20/hour/IP+email
export const limitLogin = combine([
  createRateLimiter({ windowMs: 60 * 1000, max: 5, key: keyByIpAndEmail, name: "login-1m" }),
  createRateLimiter({ windowMs: 60 * 60 * 1000, max: 20, key: keyByIpAndEmail, name: "login-1h" }),
]);

// /auth/verify-totp: 5/min/IP+challenge & 20/hour/IP+challenge
export const limitTotp = combine([
  createRateLimiter({ windowMs: 60 * 1000, max: 5, key: keyByIpAndChallenge, name: "totp-1m" }),
  createRateLimiter({ windowMs: 60 * 60 * 1000, max: 20, key: keyByIpAndChallenge, name: "totp-1h" }),
]);
