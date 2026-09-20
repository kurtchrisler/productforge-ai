import { NextRequest, NextResponse } from "next/server";
import { getDb, Product } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { ProductContent, ProductTypeId, PRODUCT_TYPES } from "@/lib/productTypes";
import { renderProductHtml } from "@/lib/render";
import { renderHtmlToPdf } from "@/lib/pdf";
import { readCoverImageDataUri, deleteCoverImage } from "@/lib/cover";
import { deleteInfographicImage } from "@/lib/screenshot";
import fs from "fs";
import path from "path";

function sanitizeContent(input: unknown): ProductContent | null {
  if (!input || typeof input !== "object") return null;
  const c = input as Record<string, unknown>;
  if (typeof c.title !== "string" || !c.title.trim()) return null;
  if (!Array.isArray(c.sections) || c.sections.length === 0) return null;

  const sections = c.sections.map((s) => {
    const section = (s ?? {}) as Record<string, unknown>;
    return {
      heading: typeof section.heading === "string" ? section.heading : "",
      body: typeof section.body === "string" ? section.body : "",
      bullets: Array.isArray(section.bullets)
        ? section.bullets.filter((b): b is string => typeof b === "string" && b.trim().length > 0)
        : undefined,
      worksheet: Array.isArray(section.worksheet)
        ? section.worksheet.filter((w): w is string => typeof w === "string" && w.trim().length > 0)
        : undefined,
    };
  });

  if (sections.some((s) => !s.heading.trim() || !s.body.trim())) return null;

  return {
    title: c.title.trim(),
    subtitle: typeof c.subtitle === "string" ? c.subtitle : "",
    tagline: typeof c.tagline === "string" ? c.tagline : "",
    introduction: typeof c.introduction === "string" ? c.introduction : "",
    sections,
    conclusion: typeof c.conclusion === "string" ? c.conclusion : "",
    callToAction: typeof c.callToAction === "string" ? c.callToAction : "",
  };
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const db = getDb();
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  const { id } = await params;
  const product = db
    .prepare("SELECT * FROM products WHERE id = ? AND user_id = ?")
    .get(id, user.id) as Product | undefined;

  if (!product) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  return NextResponse.json({ product });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const db = getDb();
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  const { id } = await params;
  const product = db
    .prepare("SELECT * FROM products WHERE id = ? AND user_id = ?")
    .get(id, user.id) as Product | undefined;

  if (!product) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  if (product.status !== "ready") {
    return NextResponse.json(
      { error: "This product isn't ready to edit yet." },
      { status: 400 }
    );
  }
  if (PRODUCT_TYPES[product.product_type as ProductTypeId]?.kind !== "document") {
    return NextResponse.json(
      { error: "This product type isn't editable this way." },
      { status: 400 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const content = sanitizeContent(body.content);
  if (!content) {
    return NextResponse.json(
      {
        error:
          "Every section needs a heading and body, and the product needs a title.",
      },
      { status: 400 }
    );
  }

  try {
    const coverImageDataUri = readCoverImageDataUri(product.cover_image_path);
    const html = renderProductHtml(
      content,
      product.product_type as ProductTypeId,
      coverImageDataUri
    );
    const productId = Number(id);
    await renderHtmlToPdf(html, productId);

    db.prepare(
      `UPDATE products
       SET title = ?, content_json = ?, html = ?, pdf_path = ?, updated_at = datetime('now')
       WHERE id = ?`
    ).run(content.title, JSON.stringify(content), html, `${productId}.pdf`, productId);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Failed to save edited product:", err);
    return NextResponse.json(
      { error: "Couldn't save your changes. Please try again." },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const db = getDb();
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  const { id } = await params;
  const product = db
    .prepare("SELECT * FROM products WHERE id = ? AND user_id = ?")
    .get(id, user.id) as Product | undefined;

  if (!product) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  if (product.pdf_path) {
    const filePath = path.join(process.cwd(), "data", "pdfs", product.pdf_path);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }
  deleteCoverImage(product.cover_image_path);
  deleteInfographicImage(product.asset_path);

  db.prepare("DELETE FROM products WHERE id = ?").run(id);
  return NextResponse.json({ ok: true });
}
