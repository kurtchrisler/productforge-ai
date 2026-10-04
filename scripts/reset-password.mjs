#!/usr/bin/env node
// Admin tool: manually reset a customer's ProductGenie AI login password.
//
// There's no self-service "forgot password" flow in the app yet (no
// transactional email service is wired up to send a reset link), so this
// is how a reset actually happens today: Kurt runs this, picks a new
// password, and relays it to the customer however he chooses (email,
// support reply, etc.) so they can log in and change it in Settings
// afterward if a Settings "change password" field exists — currently it
// doesn't, so for now the password this script sets IS their new password
// until they're given another one.
//
// Run this INSIDE the running app container -- that's where node_modules
// (bcryptjs) and the live data/app.db both are:
//
//   docker exec -it productforge-ai node scripts/reset-password.mjs customer@example.com "NewPassword123"
//
// Wrap the password in quotes if it has spaces or special shell characters.

import { DatabaseSync } from "node:sqlite";
import path from "path";
import bcrypt from "bcryptjs";

const [, , emailArg, passwordArg] = process.argv;

if (!emailArg || !passwordArg) {
  console.error("Usage: node scripts/reset-password.mjs <email> <new-password>");
  process.exit(1);
}

const email = emailArg.trim().toLowerCase();
if (passwordArg.length < 6) {
  console.error(
    "Password must be at least 6 characters (same minimum the signup form enforces)."
  );
  process.exit(1);
}

const dbPath = path.join(process.cwd(), "data", "app.db");
const db = new DatabaseSync(dbPath);
db.exec("PRAGMA busy_timeout = 5000");

const user = db.prepare("SELECT id, email FROM users WHERE email = ?").get(email);
if (!user) {
  console.error(`No account found with email: ${email}`);
  process.exit(1);
}

const hash = await bcrypt.hash(passwordArg, 10);
db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(hash, user.id);

// Resetting a password is also a reasonable moment to sign the account out
// everywhere else -- if this reset is happening because the account may
// have been compromised, any session token issued before the reset stays
// valid otherwise (sessions are independent of the password).
const result = db.prepare("DELETE FROM sessions WHERE user_id = ?").run(user.id);

console.log(`Password reset for ${user.email} (user id ${user.id}).`);
console.log(
  `${result.changes} existing login session(s) for this account were signed out.`
);
