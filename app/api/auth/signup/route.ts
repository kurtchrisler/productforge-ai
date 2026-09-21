import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { hashPassword, createSession, setSessionCookie } from "@/lib/auth";
import { checkLicense } from "@/lib/license";

export async function POST(req: NextRequest) {
  try {
    const db = getDb();
    const { email, password, name } = await req.json();

    if (!email || typeof email !== "string" || !email.includes("@")) {
      return NextResponse.json(
        { error: "A valid email is required." },
        { status: 400 }
      );
    }
    if (!password || typeof password !== "string" || password.length < 6) {
      return NextResponse.json(
        { error: "Password must be at least 6 characters." },
        { status: 400 }
      );
    }

    const existing = db
      .prepare("SELECT id FROM users WHERE email = ?")
      .get(email.toLowerCase().trim());
    if (existing) {
      return NextResponse.json(
        { error: "An account with that email already exists." },
        { status: 409 }
      );
    }

    const normalizedEmail = email.toLowerCase().trim();
    const passwordHash = await hashPassword(password);
    const result = db
      .prepare(
        "INSERT INTO users (email, password_hash, name, license_email) VALUES (?, ?, ?, ?)"
      )
      .run(normalizedEmail, passwordHash, name ?? null, normalizedEmail);

    const userId = Number(result.lastInsertRowid);

    const token = createSession(userId);
    await setSessionCookie(token);

    // Best-effort: if this person already purchased Standard or Pro with
    // this same email (e.g. bought on WarriorPlus first, then signed up),
    // grant access immediately instead of making them click "Refresh my
    // license" after account creation. A brand-new account has no existing
    // access to protect, so per the three-way result semantics in
    // lib/license.ts, we only act on a real answer from the server:
    //   - ok:true            -> set membership_level to the confirmed tier
    //   - ok:false, reachable -> explicit "no license" - leave at 'none'
    //   - ok:false, unreachable -> leave at 'none', just note the message
    // In every case we record when we checked and what the server said, so
    // the Settings page has something to show even before the customer
    // clicks "Refresh my license" themselves.
    try {
      const result = await checkLicense(normalizedEmail);
      // kdpAccelerator only exists on the two "reachable" branches (ok:true,
      // or ok:false+reachable:true) — an unreachable server tells us
      // nothing, so a brand-new account correctly just keeps the column's
      // default of 0 in that case.
      const kdpAccelerator = "kdpAccelerator" in result ? result.kdpAccelerator : false;
      db.prepare(
        "UPDATE users SET membership_level = ?, license_checked_at = datetime('now'), license_message = ?, kdp_accelerator = ? WHERE id = ?"
      ).run(result.ok ? result.tier : "none", result.message, kdpAccelerator ? 1 : 0, userId);
    } catch (err) {
      console.error("Post-signup license check failed:", err);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: "Something went wrong creating your account." },
      { status: 500 }
    );
  }
}
