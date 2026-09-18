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
  created_at: string;
};

export type Product = {
  id: number;
  user_id: number;
  idea: string;
  product_type: string;
  length: string;
  cover_image_path: string | null;
  title: string | null;
  status: "pending" | "generating" | "ready" | "error";
  content_json: string | null;
  html: string | null;
  pdf_path: string | null;
  error: string | null;
  created_at: string;
  updated_at: string;
};
