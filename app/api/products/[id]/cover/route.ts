import { NextRequest, NextResponse } from "next/server";
import { getDb, Product } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { ProductContent, ProductTypeId } from "@/lib/productTypes";
import { generateAndSaveCover } from "@/lib/ai";
import { renderProductHtml } from "@/lib/render";
import { renderHtmlToPdf } from "@/lib/pdf";
import { readCoverImageDataUri } from "@/lib/cover";
import { decryptSecret } from "@/lib/crypto";

// Regenerates just the cover image for an existing product (text content is
// untouched) — AI text-in-image rendering isn't perfectly reliable, so this
// gives customers a retry button instead of forcing a full regeneration.
export async function POST(
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
  if (product.status !== "ready" || !product.content_json) {
    return NextResponse.json(
      { error: "This product isn't ready yet." },
      { status: 400 }
    );
  }

  let userApiKey: string | null = null;
  if (user.openai_api_key) {
    try {
      userApiKey = decryptSecret(user.openai_api_key);
    } catch (err) {
      console.error("Failed to decrypt stored OpenAI key:", err);
    }
  }
  if (!userApiKey) {
    return NextResponse.json(
      { error: "Add an OpenAI API key in Settings to generate cover art." },
      { status: 400 }
    );
  }

  try {
    const content = JSON.parse(product.content_json) as ProductContent;
    const productId = Number(id);

    const cover = await generateAndSaveCover(
      product.idea,
      product.product_type as ProductTypeId,
      content,
      userApiKey,
      productId
    );

    const coverImageDataUri = readCoverImageDataUri(cover.path);
    const html = renderProductHtml(
      content,
      product.product_type as ProductTypeId,
      coverImageDataUri
    );
    await renderHtmlToPdf(html, productId);

    db.prepare(
      `UPDATE products
       SET html = ?, pdf_path = ?, cover_image_path = ?, cover_error = ?, updated_at = datetime('now')
       WHERE id = ?`
    ).run(html, `${productId}.pdf`, cover.path, cover.error, productId);

    if (cover.error) {
      return NextResponse.json({ ok: false, error: cover.error }, { status: 502 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Cover regeneration failed:", err);
    return NextResponse.json(
      { error: "Couldn't regenerate the cover. Please try again." },
      { status: 500 }
    );
  }
}
