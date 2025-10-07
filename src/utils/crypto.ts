// src/utils/crypto.ts
import { randomBytes, createCipheriv, createDecipheriv, timingSafeEqual } from "crypto";
import argon2 from "argon2";
import { Env } from "../config/env";

/**
 * Password hashing — Argon2id
 */
export async function hashPassword(plain: string): Promise<string> {
  if (!plain || typeof plain !== "string") throw new Error("hashPassword: invalid input");
  return argon2.hash(plain, {
    type: argon2.argon2id,              // ✅ valid here
    memoryCost: Env.ARGON2.MEMORY_KiB,
    timeCost: Env.ARGON2.ITERATIONS,
    parallelism: Env.ARGON2.PARALLELISM,
  });
}

export async function verifyPassword(hash: string, plain: string): Promise<boolean> {
  if (!hash || !plain) return false;
  try {
    return await argon2.verify(hash, plain); // ✅ no options needed
  } catch {
    return false;
  }
}

/**
 * Authenticated encryption — AES-256-GCM
 *
 * Output format (string):
 *   v1.gcm.<iv_b64url>.<ct_b64url>.<tag_b64url>
 *
 * - iv: 12 bytes random
 * - key: Env.ENC_KEY (32 bytes) from Task 0.1
 * - aad: optional associated data (not stored; must be re-supplied on open if used)
 */
const VERSION = "v1";
const ALGO = "aes-256-gcm"; // 32-byte key -> AES-256
const IV_BYTES = 12;
const TAG_BYTES = 16;

// base64url helpers (no padding)
function toB64Url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
function fromB64Url(s: string): Buffer {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  const pad = s.length % 4;
  if (pad) s += "=".repeat(4 - pad);
  return Buffer.from(s, "base64");
}

export type SealInput = string | Buffer;
export type AAD = string | Buffer | undefined;

/**
 * Encrypt small secrets (e.g., TOTP secret bytes).
 * Returns a compact, versioned, base64url string.
 */
export function seal(data: SealInput, aad?: AAD): string {
  if (!Buffer.isBuffer(data)) data = Buffer.from(data, "utf8");

  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGO, Env.ENC_KEY, iv);

  if (aad !== undefined) {
    const aadBuf = Buffer.isBuffer(aad) ? aad : Buffer.from(aad, "utf8");
    cipher.setAAD(aadBuf, { plaintextLength: data.length });
  }

  const ciphertext = Buffer.concat([cipher.update(data), cipher.final()]);
  const tag = cipher.getAuthTag(); // 16 bytes

  return [
    VERSION,
    "gcm",
    toB64Url(iv),
    toB64Url(ciphertext),
    toB64Url(tag),
  ].join(".");
}

/**
 * Decrypt string produced by seal().
 * If aad was provided to seal, the same aad must be provided here.
 */
export function open(sealed: string | Buffer, aad?: AAD): Buffer {
  if (sealed == null) {
    throw new Error("open: missing sealed payload");
  }

  const sealedStr = Buffer.isBuffer(sealed) ? sealed.toString("utf8") : String(sealed);
  const parts = sealedStr.split(".");
  if (parts.length !== 5) {
    throw new Error("open: malformed payload");
  }

  const [version, mode, ivB64, ctB64, tagB64] = parts;
  if (version !== VERSION || mode !== "gcm") {
    throw new Error("open: unsupported version/mode");
  }

  const iv = fromB64Url(ivB64);
  const ct = fromB64Url(ctB64);
  const tag = fromB64Url(tagB64);

  if (iv.length !== IV_BYTES) throw new Error("open: invalid IV length");
  if (tag.length !== TAG_BYTES) throw new Error("open: invalid auth tag length");

  const decipher = createDecipheriv(ALGO, Env.ENC_KEY, iv);
  if (aad !== undefined) {
    const aadBuf = Buffer.isBuffer(aad) ? aad : Buffer.from(aad, "utf8");
    decipher.setAAD(aadBuf, { plaintextLength: ct.length });
  }
  decipher.setAuthTag(tag);

  return Buffer.concat([decipher.update(ct), decipher.final()]);
}

/**
 * Constant-time compare utility for secrets (e.g., verifying fixed-size codes).
 * Returns false if lengths differ.
 */
export function safeEqual(a: Buffer, b: Buffer): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
