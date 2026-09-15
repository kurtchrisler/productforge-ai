# ProductForge AI

Turn any idea into a ready-to-launch digital product. Describe an idea, pick
a format (ebook, guide, planner, workbook, or template), and get a fully
written, typeset, downloadable PDF in minutes.

This is a full-stack Next.js app: accounts, a dashboard, an AI content
pipeline, and server-side PDF generation. It works out of the box with no
API keys — without an `OPENAI_API_KEY` it falls back to a deterministic demo
generator so you can try the whole flow immediately; add a key to get real,
idea-specific AI content.

## Stack

- **Next.js 16** (App Router, TypeScript, Tailwind CSS)
- **`node:sqlite`** — Node's built-in SQLite module for the local file
  database (`data/app.db`). No native compiling, no Python, no Visual
  Studio Build Tools — it ships with Node itself (requires Node 22.5+).
- **bcryptjs** + signed session cookies — accounts, no third-party auth service
- **openai** SDK — content generation (optional; falls back to a mock generator)
- **Playwright (Chromium)** — renders each generated product to a print-quality PDF

## Getting started

```bash
npm install
npx playwright install chromium   # one-time: downloads the PDF-rendering browser
cp .env.example .env.local        # optional — fill in OPENAI_API_KEY to enable real AI generation
npm run dev
```

Open http://localhost:3000, sign up, and create your first product from
**Dashboard → New product**. In demo mode (no API key) generation is
instant; with a real key it takes a few seconds per product.

Requires Node.js 22.5 or newer (for the built-in `node:sqlite` module —
check with `node -v`; if you're on an older Node, upgrade from
nodejs.org). You'll see a one-line `ExperimentalWarning: SQLite is an
experimental feature` in the terminal when the server starts — that's
expected and harmless, not an error.

## How it's organized

- `lib/productTypes.ts` — the five product types (ebook, guide, planner,
  workbook, template), their metadata, and the shared content shape
- `lib/ai.ts` — builds the prompt, calls OpenAI (JSON mode) when
  `OPENAI_API_KEY` is set, otherwise generates deterministic demo content
- `lib/render.ts` — turns generated content into a styled, print-ready HTML
  document (cover page, intro, sections, worksheet fields, closing CTA)
- `lib/pdf.ts` — renders that HTML to a PDF file with headless Chromium
- `lib/db.ts` / `lib/auth.ts` — SQLite schema and cookie-based sessions
- `app/api/generate` — the endpoint that ties it all together: create a
  product row → generate content → render HTML → render PDF → save
- `app/dashboard` — the product library, the "new product" form, and the
  per-product preview/download page

## Where this can go next

- Swap the single shared `OPENAI_API_KEY` for per-user billing/credits
  (there's already a `users` table to hang that off of) — this mirrors the
  credit-based licensing model used in your other WP Marketer Tools products
- Add more product types or let the AI propose a cover image
- Add a Stripe checkout so customers can buy a product export directly
- Move from SQLite to Postgres if you deploy this behind multiple server
  instances (SQLite here is single-file and fine for one instance / low-to-
  moderate traffic)
- Deploy: this needs a Node server (not static hosting) because of
  `node:sqlite` and Playwright — Render, Fly.io, Railway, or a VPS all
  work well. Vercel's serverless functions don't support the bundled
  Chromium binary without extra configuration, so a container-based host is
  the simpler path. See **DEPLOY.md** for step-by-step instructions to run
  this on your own VPS with Docker (a `Dockerfile` and `docker-compose.yml`
  are included).

## Environment variables

| Variable          | Required | Default          | Purpose                                   |
| ------------------ | -------- | ---------------- | ------------------------------------------ |
| `OPENAI_API_KEY`   | No       | _(unset)_        | Enables real AI generation instead of demo content |
| `OPENAI_MODEL`     | No       | `gpt-4o-mini`     | Chat Completions model used for generation |
