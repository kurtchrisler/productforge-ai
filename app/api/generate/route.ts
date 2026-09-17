import { NextRequest, NextResponse } from "next/server";
import { getDb, Product } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { isProductType } from "@/lib/productTypes";
import { generateProductContent } from "@/lib/ai";
import { renderProductHtml } from "@/lib/render";
import { renderHtmlToPdf } from "@/lib/pdf";

export async function POST(req: NextRequest) {
  const db = getDb();
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const { idea, productType } = await req.json().catch(() => ({}));

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

  const insert = db
    .prepare(
      `INSERT INTO products (user_id, idea, product_type, status) VALUES (?, ?, ?, 'generating')`
    )
    .run(user.id, idea.trim(), productType);
  const productId = Number(insert.lastInsertRowid);

  try {
    const { content, mode } = await generateProductContent(
      idea.trim(),
      productType
    );
    const html = renderProductHtml(content, productType);
    await renderHtmlToPdf(html, productId);

    db.prepare(
      `UPDATE products
       SET status = 'ready', title = ?, content_json = ?, html = ?, pdf_path = ?, updated_at = datetime('now')
       WHERE id = ?`
    ).run(
      content.title,
      JSON.stringify(content),
      html,
      `${productId}.pdf`,
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
