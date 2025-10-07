// src/app.ts
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";

import { Env } from "./config/env";

// Routers
import indexRoutes from "./routes";               // now only /health lives here
import authRoutes from "./routes/auth.routes";    // mount explicitly
import namesRoutes from "./routes/names.routes";  // mount explicitly
import { ensureCsrfCookie } from "./middleware/auth";

const app = express();

/** Body + cookies */
app.use(express.json({ limit: "2mb" }));
app.use(cookieParser());

/** CORS with credentials, allow only configured origins */
app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true); // same-origin / tools
      if (Env.CORS_ORIGIN.includes(origin)) return cb(null, true);
      return cb(new Error("Not allowed by CORS"));
    },
    credentials: true,
  })
);

app.use(ensureCsrfCookie); // issues csrf_token cookie on safe requests if missing

/** (Optional) separate readiness probe */
app.get("/ready", (_req, res) => res.json({ ready: true }));

/** Explicit mounts */
app.use("/api/auth", authRoutes);
app.use("/api/names", namesRoutes);

/** Health routes from index router */
app.use("/api", indexRoutes);

/** Centralized error handler */
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const status = err.status || 500;
  const message = err.message || "Internal Server Error";
  res.status(status).json({ message });
});

export default app;
