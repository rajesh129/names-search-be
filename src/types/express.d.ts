declare namespace Express {
  interface Request {
    user?: { sub: number; role: "user" | "admin"; iat?: number; exp?: number };
  }
}
