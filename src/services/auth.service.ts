// src/services/auth.service.ts
import jwt from "jsonwebtoken";
import { authenticator } from "otplib";
import { UsersRepo } from "../repositories/users.repo";
import { verifyPassword } from "../utils/crypto";
import { open, seal } from "../utils/crypto";
import { Env } from "../config/env";
import { PublicUser, UserRow } from "../types/auth";

type ChallengePayload = { sub: number; email: string; stage: "pwd-ok" };
type AccessPayload = { sub: number; role: "user" | "admin" };

function msFromMinutes(m: number) { return m * 60 * 1000; }
function msFromDays(d: number) { return d * 24 * 60 * 60 * 1000; }

export class AuthService {
  constructor(private readonly users = new UsersRepo()) {}

  /** Step 1: Password check → returns short-lived challenge token if OK */
  async passwordLogin(email: string, password: string): Promise<{ challengeToken: string; user: PublicUser } | null> {
    const user = await this.users.findByEmail(email);
    if (!user) return null;

    const ok = await verifyPassword(user.password_hash, password);
    if (!ok) return null;

    const challengePayload: ChallengePayload = { sub: user.id, email: user.email, stage: "pwd-ok" };
    const challengeToken = jwt.sign(
        { sub: user.id, email: user.email, stage: "pwd-ok" },
        Env.AUTH_JWT_SECRET,
        { expiresIn: "5m", issuer: "names-search", audience: "auth" } // ← must match requireChallenge()
    );

    const pub: PublicUser = {
      id: user.id, email: user.email, role: user.role, is_totp_enabled: user.is_totp_enabled,
    };
    return { challengeToken, user: pub };
  }

  /** Step 2: Verify TOTP using challenge token → return access/refresh tokens */
  async verifyTotpAndIssueTokens(challengeToken: string, totpCode: string): Promise<{
    accessToken: string;
    refreshToken?: string;
    user: PublicUser;
  } | null> {
    let payload: ChallengePayload;
    try {
      payload = jwt.verify(challengeToken, Env.AUTH_JWT_SECRET, {
        issuer: "names-search",
        audience: "auth",
      }) as unknown as ChallengePayload;
    } catch {
      return null;
    }
    if (payload.stage !== "pwd-ok") return null;

    const user = await this.users.findByEmail(payload.email);
    if (!user || user.id !== payload.sub) return null;
    if (!user.is_totp_enabled) return null;

    // Decrypt the user's TOTP secret (sealed string) with AAD
    const sealed = await this.users.getTotpSecret(user.id);
    if (!sealed) return null;
    const rawSecret = open(sealed, `user:${user.id}`); // Buffer
    // otplib expects a base32 string normally; we’ll set a custom key encoder:
    // But simpler: store base32 text as sealed bytes originally. If your stored value
    // is raw random bytes, convert to base32 first. Here we assume base32 text stored.
    const secretBase32 = rawSecret.toString("utf8");

    const isValid = authenticator.check(totpCode, secretBase32);
    if (!isValid) return null;

    await this.users.updateLastLogin(user.id);

    const accessPayload: AccessPayload = { sub: user.id, role: user.role };
    const accessToken = jwt.sign(
        { sub: user.id, role: user.role },
        Env.AUTH_JWT_SECRET,
        { expiresIn: `${Env.ACCESS_TOKEN_TTL_MIN}m`, issuer: "names-search", audience: "api" }
    );

    // (Optional) issue refresh; you can add rotation later
    const refreshToken = jwt.sign(
        { sub: user.id },
        Env.AUTH_JWT_SECRET,
        { expiresIn: `${Env.REFRESH_TOKEN_TTL_DAYS}d`, issuer: "names-search", audience: "refresh" }
    );

    const pub: PublicUser = {
      id: user.id, email: user.email, role: user.role, is_totp_enabled: user.is_totp_enabled,
    };
    return { accessToken, refreshToken, user: pub };
  }

  /** Enroll TOTP: generate & store sealed secret (call AFTER password re-auth) */
  async enrollTotp(userId: number, secretBase32: string): Promise<{ sealed: string }> {
    // seal using AAD to bind to user
    const sealed = seal(Buffer.from(secretBase32, "utf8"), `user:${userId}`);
    await this.users.storeTotpSecret(userId, sealed, true);
    return { sealed };
  }
}
