import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { checkLicense } from "@/lib/license";

// Current membership status, for the Settings page to render on load.
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  return NextResponse.json({
    membershipLevel: user.membership_level,
    licenseEmail: user.license_email || user.email,
    licenseCheckedAt: user.license_checked_at,
    licenseMessage: user.license_message,
    kdpAccelerator: Boolean(user.kdp_accelerator),
  });
}

// The "Refresh my license" button. Optionally updates the purchase email
// first (so a customer who bought with a different email than their
// account login can point the check at the right address), then re-checks
// it against the WP Marketer Tools license server.
//
// Only ever changes membership_level on an explicit answer from the
// server -- a confirmed tier, or an explicit "no license found". A
// network/server failure is surfaced as an error message but never
// downgrades existing access (see the three-way result type in
// lib/license.ts).
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const { licenseEmail } = await req.json().catch(() => ({}));
  let emailToCheck = user.license_email || user.email;
  if (typeof licenseEmail === "string" && licenseEmail.trim()) {
    const trimmed = licenseEmail.trim().toLowerCase();
    if (!trimmed.includes("@")) {
      return NextResponse.json(
        { error: "Enter a valid email address." },
        { status: 400 }
      );
    }
    emailToCheck = trimmed;
  }

  const db = getDb();
  const result = await checkLicense(emailToCheck);

  if (result.ok) {
    db.prepare(
      `UPDATE users SET membership_level = ?, license_email = ?, license_checked_at = datetime('now'), license_message = ?, kdp_accelerator = ? WHERE id = ?`
    ).run(result.tier, emailToCheck, result.message, result.kdpAccelerator ? 1 : 0, user.id);
  } else if (result.reachable) {
    // Explicit "no license found for this email" -- safe to downgrade the
    // tier. kdp_accelerator still gets a real answer here too (a license
    // record can hold kdp_accelerator=true with no tier -- e.g. the base
    // tier was refunded but the KDP add-on purchase wasn't), so it's set
    // from the server's answer rather than left alone.
    db.prepare(
      `UPDATE users SET membership_level = 'none', license_email = ?, license_checked_at = datetime('now'), license_message = ?, kdp_accelerator = ? WHERE id = ?`
    ).run(emailToCheck, result.message, result.kdpAccelerator ? 1 : 0, user.id);
  } else {
    // Server unreachable / bad response -- keep existing membership_level
    // AND kdp_accelerator untouched, just record the email (if changed) and
    // the error message so the UI can explain what happened.
    db.prepare(
      `UPDATE users SET license_email = ?, license_checked_at = datetime('now'), license_message = ? WHERE id = ?`
    ).run(emailToCheck, result.message, user.id);
  }

  const updated = db
    .prepare(
      `SELECT membership_level, license_email, license_checked_at, license_message, kdp_accelerator FROM users WHERE id = ?`
    )
    .get(user.id) as {
    membership_level: string;
    license_email: string | null;
    license_checked_at: string | null;
    license_message: string | null;
    kdp_accelerator: number;
  };

  return NextResponse.json({
    ok: result.ok,
    reachable: !result.ok ? result.reachable : true,
    membershipLevel: updated.membership_level,
    licenseEmail: updated.license_email,
    licenseCheckedAt: updated.license_checked_at,
    licenseMessage: updated.license_message,
    kdpAccelerator: Boolean(updated.kdp_accelerator),
  });
}
