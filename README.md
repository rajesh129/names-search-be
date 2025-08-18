# names-search-be

Backend for **Names Search** — a multilingual name search API (English, Tamil, French) with alias support, keyset pagination, optional materialized-view “hyperspeed” read path, and reCAPTCHA v3 protection.

## Features

- **POST** `/api/names/search` — search by variant in selected language
- Returns grouped variants (ta/en/fr) + description (in requested language; English fallback)
- **Keyset pagination** via `nextCursor` (fast), with page/limit backward-compat
- **Two read paths**
  - **Normalized schema** (joins, simple to maintain)
  - **Materialized View** (pre-aggregated, very fast) — toggle via `USE_MV`
- **Security**: Zod validation, Helmet, CORS, rate-limit, reCAPTCHA v3 (toggle)
- **k6** script for quick load testing
