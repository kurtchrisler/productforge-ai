import { NextRequest, NextResponse } from "next/server";
import { getDb, Product } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { isProductType, isProductLength } from "@/lib/productTypes";
import { generateProductContent, generateAndSaveCover } from "@/lib/ai";
import { renderProductHtml } from "@/lib/render";
import { renderHtmlToPdf } from "@/lib/pdf";
import { decryptSecret } from "@/lib/crypto";
import { readCoverImageDataUri } from "@/lib/cover";

export async function POST(req: NextRequest) {
  const db = getDb();
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const { idea, productType, length } = await req.json().catch(() => ({}));

  if (!idea || typeof idea !== "string" || idea.trim().length < 5) {
    return NextResponse.json(
      { error: "Tell us a bit more about your idea (at least 5 characters)." },
      { status: 400 }
    );
  }
  if (typeof productType !== "string" || !isProductType(productType)) {
    return NextResponse.json(
      { error: "Choose a valid product type." },
      { status: 400 }
    );
  }
  const resolvedLength =
    typeof length === "string" && isProductLength(length) ? length : "medium";

  const insert = db
    .prepare(
      `INSERT INTO products (user_id, idea, product_type, length, status) VALUES (?, ?, ?, ?, 'generating')`
    )
    .run(user.id, idea.trim(), productType, resolvedLength);
  const productId = Number(insert.lastInsertRowid);

  let userApiKey: string | null = null;
  if (user.openai_api_key) {
    try {
      userApiKey = decryptSecret(user.openai_api_key);
    } catch (err) {
      console.error("Failed to decrypt stored OpenAI key:", err);
    }
  }

  try {
    const { content, mode } = await generateProductContent(
      idea.trim(),
      productType,
      resolvedLength,
      userApiKey
    );

    // Cover art costs real money and only works with the customer's own
    // OpenAI key, so only attempt it when generation actually ran on a real
    // key (mode === "ai") — never in demo/mock mode. A failure here should
    // never take down the whole product, so it's caught independently and
    // recorded for the "regenerate cover" retry button to explain.
    let coverImagePath: string | null = null;
    let coverError: string | null = null;
    if (mode === "ai") {
      const cover = await generateAndSaveCover(
        idea.trim(),
        productType,
        content,
        userApiKey,
        productId
      );
      coverImagePath = cover.path;
      coverError = cover.error;
    }
    const coverImageDataUri = readCoverImageDataUri(coverImagePath);

    const html = renderProductHtml(content, productType, coverImageDataUri);
    await renderHtmlToPdf(html, productId);

    db.prepare(
      `UPDATE products
       SET status = 'ready', title = ?, content_json = ?, html = ?, pdf_path = ?, cover_image_path = ?, cover_error = ?, updated_at = datetime('now')
       WHERE id = ?`
    ).run(
      content.title,
      JSON.stringify(content),
      html,
      `${productId}.pdf`,
      coverImagePath,
      coverError,
      productId
    );

    return NextResponse.json({ ok: true, productId, mode });
  } catch (err) {
    console.error("Generation failed:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    db.prepare(
      `UPDATE products SET status = 'error', error = ?, updated_at = datetime('now') WHERE id = ?`
    ).run(message, productId);
    return NextResponse.json(
      { error: "Generation failed. You can try again.", productId },
      { status: 500 }
    );
  }
}

export async function GET() {
  const db = getDb();
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  const products = db
    .prepare(
      `SELECT id, idea, product_type, title, status, created_at FROM products WHERE user_id = ? ORDER BY id DESC`
    )
    .all(user.id) as Partial<Product>[];
  return NextResponse.json({ products });
}
