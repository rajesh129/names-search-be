// src/types/auth.ts
export type UserRow = {
  id: number;
  email: string;
  password_hash: string;
  role: "user" | "admin";
  totp_secret_encrypted: string | null; // stored sealed (AES-GCM) string
  is_totp_enabled: boolean;
  last_login_at: string | null; // ISO from DB
  created_at: string;
  updated_at: string;
};

export type PublicUser = Pick<UserRow, "id" | "email" | "role" | "is_totp_enabled">;
