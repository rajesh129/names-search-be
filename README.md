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

# Local Development Setup Guide

This document will help you get the **names-search-be** backend running locally.

## Prerequisites

- **Node.js** (v18+ recommended)
- **npm** or **yarn**
- **PostgreSQL** (v13+ recommended)
- [Optional] **k6** for load testing (https://k6.io/)

## 1. Clone the Repository

```bash
git clone https://github.com/rajesh129/names-search-be.git
cd names-search-be
```

## 2. Install Dependencies

```bash
npm install
# or
yarn install
```

## 3. Configure Environment Variables

Create a `.env` file in the root directory. Below is a template; adjust values as needed:

```env
NODE_ENV=development
PORT=3000

# PostgreSQL DB connection
PGHOST=localhost
PGPORT=5432
PGDATABASE=names_search
PGUSER=your_pg_user
PGPASSWORD=your_pg_password
PG_POOL_MAX=20

# Feature toggles
USE_MV=false

# reCAPTCHA (optional)
RECAPTCHA_ENABLED=false
RECAPTCHA_SECRET=
RECAPTCHA_MIN_SCORE=0.5
RECAPTCHA_EXPECT_ACTION=

# CORS
CORS_ORIGIN=http://localhost:3000
```

- Set your PostgreSQL credentials.
- If you wish to use Google reCAPTCHA v3, set `RECAPTCHA_ENABLED=true` and provide a valid `RECAPTCHA_SECRET`.
- `USE_MV=true` enables hyperspeed materialized view search (see DB setup).

## 4. Database Setup

- Create the database and run the necessary schema and seed scripts.
- Ensure the following tables exist:
  - `languages` (must include 'en', 'ta', 'fr' codes)
  - `name_variants`
  - `name_meanings`
  - `names`
  - [Optional] `name_search_mv` (for materialized view speed path)

- Example (psql):
  ```sql
  CREATE DATABASE names_search;
  -- Add schema/DDL for the required tables here...
  ```

- If using the MV path, populate and refresh the `name_search_mv` materialized view as needed.

## 5. Run the Server

```bash
npm run dev
# or
yarn dev
```
By default, the API will be available at `http://localhost:3000/api/`.

## 6. Running Tests

_TODO: Add details if tests are available._

## 7. API Reference

See [README.md](./README.md) for endpoint and feature summary.

---

## Troubleshooting

- **DB Connection Errors**: Check `.env` and ensure PostgreSQL is running and accessible.
- **Missing Languages**: The `languages` table must include 'en', 'ta', 'fr' codes.
- **CORS Issues**: Adjust `CORS_ORIGIN` in your `.env`.

---

## License

MIT © 2025 rajesh129

