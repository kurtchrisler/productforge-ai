import { DatabaseSync } from "node:sqlite";
import path from "path";
import fs from "fs";

const dataDir = path.join(process.cwd(), "data");
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, "app.db");

declare global {
  var __afdb: DatabaseSync | undefined;
}

// Uses Node's built-in SQLite (available without any native build step —
// no node-gyp, no Python, no Visual Studio Build Tools required). This
// avoids the native-compile problems packages like better-sqlite3 run into
// on machines without a C++ toolchain configured.
export const db: DatabaseSync = global.__afdb ?? new DatabaseSync(dbPath);
if (process.env.NODE_ENV !== "production") {
  global.__afdb = db;
}

db.exec("PRAGMA journal_mode = WAL");
db.exec("PRAGMA foreign_keys = ON");

db.exec(`
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

export type User = {
  id: number;
  email: string;
  password_hash: string;
  name: string | null;
  created_at: string;
};

export type Product = {
  id: number;
  user_id: number;
  idea: string;
  product_type: string;
  title: string | null;
  status: "pending" | "generating" | "ready" | "error";
  content_json: string | null;
  html: string | null;
  pdf_path: string | null;
  error: string | null;
  created_at: string;
  updated_at: string;
};
