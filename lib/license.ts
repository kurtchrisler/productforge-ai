// Talks to the WP Marketer Tools license server's ProductGenie AI endpoint
// (a new, isolated addition to the same server that already handles
// AffiliEngine AI / AffiliTube AI licensing — see afai-license/v1/pg-validate
// in the license server plugin). License key = purchase email, same
// convention as Kurt's other WP Marketer Tools products.

const LICENSE_SERVER_URL =
  process.env.LICENSE_SERVER_URL ||
  "https://wpmarketertools.com/wp-json/afai-license/v1/pg-validate";

export type MembershipLevel = "none" | "standard" | "pro";

// KDP Accelerator is a separate, independent add-on purchase (unlocks the
// Kindle EPUB + Kindle cover JPG downloads) — a customer can have it
// alongside either Standard or Pro, or not at all. It rides along on the
// same pg-validate call as the tier check rather than a separate request.
export type LicenseCheckResult =
  // The server confirmed an active tier.
  | { ok: true; tier: "standard" | "pro"; kdpAccelerator: boolean; message: string }
  // The server responded, but this email has no active license (never
  // purchased, or a refund/chargeback revoked it) — safe to downgrade to
  // 'none' on this result. kdpAccelerator can still be true here (e.g. the
  // base tier was refunded but the KDP add-on purchase wasn't).
  | { ok: false; reachable: true; kdpAccelerator: boolean; message: string }
  // Could not get a real answer from the server (network error, timeout,
  // non-200, malformed response) — never change the customer's existing
  // access based on this; just surface the error.
  | { ok: false; reachable: false; message: string };

export async function checkLicense(email: string): Promise<LicenseCheckResult> {
  const trimmed = email.trim().toLowerCase();
  if (!trimmed || !trimmed.includes("@")) {
    return { ok: false, reachable: false, message: "Enter a valid license email first." };
  }

  let res: Response;
  try {
    res = await fetch(LICENSE_SERVER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ license_key: trimmed }),
      signal: AbortSignal.timeout(10000),
    });
  } catch (err) {
    console.error("License server unreachable:", err);
    return {
      ok: false,
      reachable: false,
      message: "Couldn't reach the license server. Please try again in a moment.",
    };
  }

  if (!res.ok) {
    console.error("License server returned non-200:", res.status);
    return {
      ok: false,
      reachable: false,
      message: `License server returned an unexpected response (${res.status}). Please try again shortly.`,
    };
  }

  let data: { success?: boolean; tier?: string; kdp_accelerator?: boolean; message?: string };
  try {
    data = await res.json();
  } catch (err) {
    console.error("License server returned invalid JSON:", err);
    return {
      ok: false,
      reachable: false,
      message: "License server returned an unexpected response. Please try again shortly.",
    };
  }

  const kdpAccelerator = Boolean(data.kdp_accelerator);

  if (data.success && (data.tier === "standard" || data.tier === "pro")) {
    return {
      ok: true,
      tier: data.tier,
      kdpAccelerator,
      message: data.message || "License valid.",
    };
  }

  return {
    ok: false,
    reachable: true,
    kdpAccelerator,
    message: data.message || "No ProductGenie AI license found for this email.",
  };
}
