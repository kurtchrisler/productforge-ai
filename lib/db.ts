import { DatabaseSync } from "node:sqlite";
import path from "path";
import fs from "fs";

declare global {
  var __afdb: DatabaseSync | undefined;
}

function createDb(): DatabaseSync {
  const dataDir = path.join(process.cwd(), "data");
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  const dbPath = path.join(dataDir, "app.db");

  const database = new DatabaseSync(dbPath);

  // busy_timeout makes concurrent opens/writes wait and retry instead of
  // immediately failing with "database is locked" — belt-and-suspenders
  // alongside lazy init below, since Next can still spin up more than one
  // server-side runtime in dev/production.
  database.exec("PRAGMA busy_timeout = 5000");
  database.exec("PRAGMA journal_mode = WAL");
  database.exec("PRAGMA foreign_keys = ON");

  database.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  idea TEXT NOT NULL,
  product_type TEXT NOT NULL,
  length TEXT NOT NULL DEFAULT 'medium',
  title TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  content_json TEXT,
  html TEXT,
  pdf_path TEXT,
  error TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL
);
`);

  // Migration: add openai_api_key to users if it doesn't exist yet (this
  // table already existed in production before this column was introduced,
  // so CREATE TABLE IF NOT EXISTS above won't add it for existing databases).
  const userColumns = database
    .prepare(`PRAGMA table_info(users)`)
    .all() as { name: string }[];
  if (!userColumns.some((c) => c.name === "openai_api_key")) {
    database.exec(`ALTER TABLE users ADD COLUMN openai_api_key TEXT`);
  }

  // Migration: add length to products if it doesn't exist yet, for the same
  // reason as above — existing production rows predate this column.
  const productColumns = database
    .prepare(`PRAGMA table_info(products)`)
    .all() as { name: string }[];
  if (!productColumns.some((c) => c.name === "length")) {
    database.exec(
      `ALTER TABLE products ADD COLUMN length TEXT NOT NULL DEFAULT 'medium'`
    );
  }
  if (!productColumns.some((c) => c.name === "cover_image_path")) {
    database.exec(`ALTER TABLE products ADD COLUMN cover_image_path TEXT`);
  }
  if (!productColumns.some((c) => c.name === "cover_error")) {
    database.exec(`ALTER TABLE products ADD COLUMN cover_error TEXT`);
  }
  // Migration: puzzle difficulty (crossword/word search only) and a generic
  // non-PDF asset path. asset_path was originally used by infographics
  // (removed — see coloring_book in lib/productTypes.ts) to deliver a
  // single PNG rather than a multi-page PDF; the column is kept (unused)
  // rather than dropped, since node:sqlite has no DROP COLUMN migration
  // here and old rows may still reference it.
  if (!productColumns.some((c) => c.name === "difficulty")) {
    database.exec(`ALTER TABLE products ADD COLUMN difficulty TEXT`);
  }
  if (!productColumns.some((c) => c.name === "asset_path")) {
    database.exec(`ALTER TABLE products ADD COLUMN asset_path TEXT`);
  }
  // Migration: Kindle-ready EPUB download (document-kind products only).
  if (!productColumns.some((c) => c.name === "epub_path")) {
    database.exec(`ALTER TABLE products ADD COLUMN epub_path TEXT`);
  }

  // Migration: Standard/Pro membership. 'membership_level' is one of
  // 'none' | 'standard' | 'pro' — 'none' means no purchased license on
  // file yet (blocks the whole app). license_email is the purchase email
  // checked against the WP Marketer Tools license server; it defaults to
  // the account's login email but customers can point it at a different
  // purchase email in Settings.
  //
  // This block only ever runs ONCE per database — the very first time the
  // app starts after this migration ships — because the column-existence
  // check below makes it permanently skip on every later restart. That's
  // exactly what makes the one-time grandfather step safe: every account
  // that exists at that single moment (every account signed up before
  // this feature existed) gets bumped straight to 'pro', full access,
  // no purchase required. Any account created after that moment starts
  // at 'none' like a normal new signup and has to go through licensing.
  if (!userColumns.some((c) => c.name === "membership_level")) {
    database.exec(
      `ALTER TABLE users ADD COLUMN membership_level TEXT NOT NULL DEFAULT 'none'`
    );
    database.exec(`UPDATE users SET membership_level = 'pro'`);
  }
  if (!userColumns.some((c) => c.name === "license_email")) {
    database.exec(`ALTER TABLE users ADD COLUMN license_email TEXT`);
    // Default each grandfathered/existing account's license email to their
    // login email, so the Settings page has something sensible to show
    // rather than a blank field.
    database.exec(
      `UPDATE users SET license_email = email WHERE license_email IS NULL`
    );
  }
  if (!userColumns.some((c) => c.name === "license_checked_at")) {
    database.exec(`ALTER TABLE users ADD COLUMN license_checked_at TEXT`);
  }
  if (!userColumns.some((c) => c.name === "license_message")) {
    database.exec(`ALTER TABLE users ADD COLUMN license_message TEXT`);
  }

  // Migration: KDP Accelerator add-on. 0/1 — unlocks the Kindle-ready EPUB
  // download and the Kindle cover JPG download, independently of
  // membership_level. It's a separate purchase from Standard/Pro (a
  // Standard customer can buy it without upgrading to Pro, and vice versa),
  // so it's its own column rather than another membership_level value.
  //
  // Grandfathering: the ORIGINAL pre-launch accounts (from the
  // membership_level migration above) get this for free too, per "anyone
  // already registered gets access to everything." But by the time this
  // column ships, some accounts will already be real, paying Standard/Pro
  // customers who've never bought KDP Accelerator — we must NOT hand them
  // free access just because they predate this specific column.
  //
  // license_checked_at is the reliable marker: it's NULL only for accounts
  // that were bumped straight to 'pro' by the original grandfather UPDATE
  // and have never been through an actual checkLicense() call (signup's
  // instant check, or a "Refresh my license" click) — i.e. exactly the
  // original bootstrap cohort. Every real customer, grandfathered or not,
  // gets license_checked_at set the first time their license is checked, so
  // this filter naturally stops matching new accounts going forward.
  if (!userColumns.some((c) => c.name === "kdp_accelerator")) {
    database.exec(
      `ALTER TABLE users ADD COLUMN kdp_accelerator INTEGER NOT NULL DEFAULT 0`
    );
    database.exec(
      `UPDATE users SET kdp_accelerator = 1 WHERE license_checked_at IS NULL`
    );
  }

  return database;
}

// Uses Node's built-in SQLite (available without any native build step —
// no node-gyp, no Python, no Visual Studio Build Tools required).
//
// The connection is created lazily, on first actual call to getDb(), NOT
// at module import time. This matters: Next.js evaluates route modules
// (including their imports) across several parallel worker processes
// during `next build`'s page-data-collection step, purely for static
// analysis — it never calls into the route handlers themselves. Opening
// and initializing the SQLite file as a top-level side effect meant every
// one of those workers raced to open/write the same file at once, which
// SQLite (correctly) rejected with "database is locked". Deferring the
// open until a request handler actually runs avoids the race entirely.
export function getDb(): DatabaseSync {
  if (!global.__afdb) {
    global.__afdb = createDb();
  }
  return global.__afdb;
}

export type User = {
  id: number;
  email: string;
  password_hash: string;
  name: string | null;
  openai_api_key: string | null;
  membership_level: "none" | "standard" | "pro";
  license_email: string | null;
  license_checked_at: string | null;
  license_message: string | null;
  kdp_accelerator: number;
  created_at: string;
};

export type Product = {
  id: number;
  user_id: number;
  idea: string;
  product_type: string;
  length: string;
  cover_image_path: string | null;
  cover_error: string | null;
  difficulty: string | null;
  asset_path: string | null;
  epub_path: string | null;
  title: string | null;
  status: "pending" | "generating" | "ready" | "error";
  content_json: string | null;
  html: string | null;
  pdf_path: string | null;
  error: string | null;
  created_at: string;
  updated_at: string;
};
