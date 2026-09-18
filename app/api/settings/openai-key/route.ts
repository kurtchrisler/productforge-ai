import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { encryptSecret, decryptSecret, maskKey } from "@/lib/crypto";

// Users provide their own OpenAI API key so generation is billed to their
// own OpenAI account, never ours. This route stores it encrypted and never
// returns the plaintext value back to the client after it's saved.

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  if (!user.openai_api_key) {
    return NextResponse.json({ hasKey: false });
  }
  try {
    const plaintext = decryptSecret(user.openai_api_key);
    return NextResponse.json({ hasKey: true, masked: maskKey(plaintext) });
  } catch {
    return NextResponse.json({ hasKey: true, masked: "sk-••••••••" });
  }
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const { apiKey } = await req.json().catch(() => ({}));
  if (typeof apiKey !== "string" || !apiKey.trim().startsWith("sk-")) {
    return NextResponse.json(
      { error: "That doesn't look like a valid OpenAI API key (should start with \"sk-\")." },
      { status: 400 }
    );
  }
  const trimmed = apiKey.trim();

  // Verify the key actually works before saving it, so people don't save a
  // typo'd or already-revoked key and find out only when generation fails.
  try {
    const res = await fetch("https://api.openai.com/v1/models", {
      headers: { Authorization: `Bearer ${trimmed}` },
    });
    if (!res.ok) {
      return NextResponse.json(
        {
          error:
            res.status === 401
              ? "OpenAI rejected that key. Double-check you copied it correctly."
              : `OpenAI returned an error (${res.status}) while verifying that key.`,
        },
        { status: 400 }
      );
    }
  } catch {
    return NextResponse.json(
      { error: "Couldn't reach OpenAI to verify the key. Please try again." },
      { status: 502 }
    );
  }

  const encrypted = encryptSecret(trimmed);
  const db = getDb();
  db.prepare("UPDATE users SET openai_api_key = ? WHERE id = ?").run(
    encrypted,
    user.id
  );

  return NextResponse.json({ ok: true, masked: maskKey(trimmed) });
}

export async function DELETE() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  const db = getDb();
  db.prepare("UPDATE users SET openai_api_key = NULL WHERE id = ?").run(
    user.id
  );
  return NextResponse.json({ ok: true });
}
