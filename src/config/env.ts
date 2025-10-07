// src/config/env.ts
import "dotenv/config";
import { z } from "zod";

const BoolFromString = z
  .string()
  .transform((v) => v.toLowerCase() === "true");

const OptionalCsv = z
  .string()
  .optional()
  .transform((v) => (v ? v.split(",").map((s) => s.trim()).filter(Boolean) : []));

const EnvSchema = z
  .object({
    // Runtime
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().int().positive().default(3000),

    // Postgres (required)
    PGHOST: z.string().min(1),
    PGPORT: z.coerce.number().int().positive().default(5432),
    PGDATABASE: z.string().min(1),
    PGUSER: z.string().min(1),
    PGPASSWORD: z.string().min(1, "PGPASSWORD is required"),
    PG_POOL_MAX: z.coerce.number().int().positive().default(20),

    // Feature flags
    USE_MV: z.string().default("false"),
    RECAPTCHA_ENABLED: z.string().default("false"),

    // reCAPTCHA
    RECAPTCHA_SECRET: z.string().optional(),
    RECAPTCHA_MIN_SCORE: z.coerce.number().min(0).max(1).default(0.5),
    RECAPTCHA_EXPECT_ACTION: z.string().optional(),

    // CORS
    CORS_ORIGIN: z.string().optional(),

    // Auth / Tokens
    AUTH_JWT_SECRET: z.string().min(32, "AUTH_JWT_SECRET must be at least 32 chars"),
    ACCESS_TOKEN_TTL_MIN: z.coerce.number().int().positive().default(30),
    REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(7),
    CSRF_SECRET: z.string().min(32, "CSRF_SECRET must be at least 32 chars"),

    // Argon2
    ARGON2_MEMORY: z.coerce.number().int().min(32768, "ARGON2_MEMORY should be >= 32768").default(65536),
    ARGON2_ITERATIONS: z.coerce.number().int().min(2).default(3),
    ARGON2_PARALLELISM: z.coerce.number().int().min(1).default(1),

    // Encryption key for TOTP secret (AES-256-GCM)
    ENC_KEY_BASE64: z
      .string()
      .refine((val) => {
        try {
          return Buffer.from(val, "base64").length === 32;
        } catch {
          return false;
        }
      }, "ENC_KEY_BASE64 must be base64 for exactly 32 bytes"),
  })
  // Extra rule: if recaptcha is enabled, secret must be present
  .superRefine((env, ctx) => {
    const recaptchaEnabled = env.RECAPTCHA_ENABLED.toLowerCase() === "true";
    if (recaptchaEnabled && !env.RECAPTCHA_SECRET) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["RECAPTCHA_SECRET"],
        message: "RECAPTCHA_ENABLED=true requires RECAPTCHA_SECRET to be set",
      });
    }
  });

const parsed = EnvSchema.safeParse(process.env);
if (!parsed.success) {
  const issues = parsed.error.issues
    .map((i) => `• ${i.path.join(".")}: ${i.message}`)
    .join("\n");
  throw new Error(
    [
      "❌ Environment validation failed. Fix the following:",
      issues,
      "",
      "Tip: Copy .env.example → .env and fill in strong secrets (see README).",
    ].join("\n")
  );
}

const e = parsed.data;

export const Env = {
  // Runtime
  NODE_ENV: e.NODE_ENV,
  PORT: e.PORT,

  // DB
  PGHOST: e.PGHOST,
  PGPORT: e.PGPORT,
  PGDATABASE: e.PGDATABASE,
  PGUSER: e.PGUSER,
  PGPASSWORD: e.PGPASSWORD,
  PG_POOL_MAX: e.PG_POOL_MAX,

  // Features
  USE_MV: e.USE_MV.toLowerCase() === "true",

  // reCAPTCHA
  RECAPTCHA_ENABLED: e.RECAPTCHA_ENABLED.toLowerCase() === "true",
  RECAPTCHA_SECRET: e.RECAPTCHA_SECRET || "",
  RECAPTCHA_MIN_SCORE: e.RECAPTCHA_MIN_SCORE,
  RECAPTCHA_EXPECT_ACTION: e.RECAPTCHA_EXPECT_ACTION || undefined,

  // CORS
  CORS_ORIGIN: (e.CORS_ORIGIN ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),

  // Auth / Tokens
  AUTH_JWT_SECRET: e.AUTH_JWT_SECRET,
  ACCESS_TOKEN_TTL_MIN: e.ACCESS_TOKEN_TTL_MIN,
  REFRESH_TOKEN_TTL_DAYS: e.REFRESH_TOKEN_TTL_DAYS,
  CSRF_SECRET: e.CSRF_SECRET,

  // Argon2
  ARGON2: {
    MEMORY_KiB: e.ARGON2_MEMORY,
    ITERATIONS: e.ARGON2_ITERATIONS,
    PARALLELISM: e.ARGON2_PARALLELISM,
  },

  // Crypto
  ENC_KEY: Buffer.from(e.ENC_KEY_BASE64, "base64"), // 32 bytes
} as const;

export type AppEnv = typeof Env;
