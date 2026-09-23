import { NextRequest, NextResponse } from "next/server";
import { getDb, Product } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import {
  ProductContent,
  ProductTypeId,
  ProductDifficulty,
  PuzzleBookContent,
  ColoringBookContent,
  PRODUCT_TYPES,
  PUZZLE_DIFFICULTIES,
} from "@/lib/productTypes";
import { generateAndSaveCover } from "@/lib/ai";
import { renderProductHtml } from "@/lib/render";
import { generateCrossword } from "@/lib/crosswordGenerator";
import { generateWordSearch } from "@/lib/wordSearchGenerator";
import { renderPuzzleBookHtml, GeneratedPuzzle } from "@/lib/renderPuzzles";
import { renderColoringBookHtml } from "@/lib/renderColoringBook";
import { readColoringPageDataUris } from "@/lib/coloringImages";
import { renderHtmlToPdf } from "@/lib/pdf";
import { readCoverImageDataUri, readCoverImageBuffer } from "@/lib/cover";
import { generateEpub } from "@/lib/epub";
import { decryptSecret } from "@/lib/crypto";
import fs from "fs";
import path from "path";

// Downloads the cover art as a standalone PNG, so customers can reuse it
// elsewhere (a store listing, social post, etc.) without pulling it out of
// the PDF.
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

  if (!product || !product.cover_image_path) {
    return NextResponse.json({ error: "No cover image found." }, { status: 404 });
  }

  const filePath = path.join(process.cwd(), "data", "covers", product.cover_image_path);
  if (!fs.existsSync(filePath)) {
    return NextResponse.json({ error: "Cover image file missing." }, { status: 404 });
  }

  const fileBuffer = fs.readFileSync(filePath);
  const safeTitle = (product.title || "cover")
    .replace(/[^a-z0-9\- ]/gi, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 60);

  return new NextResponse(new Uint8Array(fileBuffer), {
    headers: {
      "Content-Type": "image/png",
      "Content-Disposition": `attachment; filename="${safeTitle || "cover"}-cover.png"`,
    },
  });
}

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

  const productType = product.product_type as ProductTypeId;
  const kind = PRODUCT_TYPES[productType]?.kind;

  try {
    const productId = Number(id);

    if (kind === "puzzle") {
      const content = JSON.parse(product.content_json) as PuzzleBookContent;
      const puzzleType = productType as "crossword" | "word_search";
      const difficulty = (product.difficulty as ProductDifficulty) || "medium";
      const diffMeta = PUZZLE_DIFFICULTIES[difficulty];

      const cover = await generateAndSaveCover(product.idea, productType, content, userApiKey, productId);
      const coverImageDataUri = readCoverImageDataUri(cover.path);

      const generatedPuzzles: GeneratedPuzzle[] = content.puzzles.map((p) => {
        if (puzzleType === "crossword") {
          return { subtitle: p.subtitle, crossword: generateCrossword(p.entries, diffMeta.crosswordGridCap) };
        }
        return {
          subtitle: p.subtitle,
          wordSearch: generateWordSearch(p.entries.map((e) => e.answer), diffMeta.wordSearchGridSize),
        };
      });

      const html = renderPuzzleBookHtml(content, puzzleType, difficulty, generatedPuzzles, coverImageDataUri);
      await renderHtmlToPdf(html, productId);

      // The Kindle EPUB embeds the cover too, so keep it in sync.
      const epubFilename = await generateEpub(
        content,
        productType,
        readCoverImageBuffer(cover.path),
        productId,
        difficulty
      );

      db.prepare(
        `UPDATE products
         SET html = ?, pdf_path = ?, cover_image_path = ?, cover_error = ?, epub_path = ?, updated_at = datetime('now')
         WHERE id = ?`
      ).run(html, `${productId}.pdf`, cover.path, cover.error, epubFilename, productId);

      if (cover.error) {
        return NextResponse.json({ ok: false, error: cover.error }, { status: 502 });
      }
      return NextResponse.json({ ok: true });
    }

    if (kind === "coloring") {
      const content = JSON.parse(product.content_json) as ColoringBookContent;

      const cover = await generateAndSaveCover(product.idea, productType, content, userApiKey, productId);
      const coverImageDataUri = readCoverImageDataUri(cover.path);

      // Reuse the already-saved page illustrations from disk rather than
      // re-spending AI credits re-generating every page just to refresh
      // the cover.
      const pageDataUris = readColoringPageDataUris(productId, content.pages.length);
      const html = renderColoringBookHtml(content, pageDataUris, coverImageDataUri);
      await renderHtmlToPdf(html, productId);

      // The Kindle EPUB embeds the cover too, so keep it in sync — the
      // page illustrations themselves are re-read from disk, not
      // re-generated, same as the PDF above.
      const epubFilename = await generateEpub(
        content,
        productType,
        readCoverImageBuffer(cover.path),
        productId
      );

      db.prepare(
        `UPDATE products
         SET html = ?, pdf_path = ?, cover_image_path = ?, cover_error = ?, epub_path = ?, updated_at = datetime('now')
         WHERE id = ?`
      ).run(html, `${productId}.pdf`, cover.path, cover.error, epubFilename, productId);

      if (cover.error) {
        return NextResponse.json({ ok: false, error: cover.error }, { status: 502 });
      }
      return NextResponse.json({ ok: true });
    }

    const content = JSON.parse(product.content_json) as ProductContent;

    const cover = await generateAndSaveCover(product.idea, productType, content, userApiKey, productId);

    const coverImageDataUri = readCoverImageDataUri(cover.path);
    const html = renderProductHtml(content, productType, coverImageDataUri);
    await renderHtmlToPdf(html, productId);

    // The Kindle EPUB embeds the cover too, so keep it in sync.
    const epubFilename = await generateEpub(
      content,
      productType,
      readCoverImageBuffer(cover.path),
      productId
    );

    db.prepare(
      `UPDATE products
       SET html = ?, pdf_path = ?, cover_image_path = ?, cover_error = ?, epub_path = ?, updated_at = datetime('now')
       WHERE id = ?`
    ).run(html, `${productId}.pdf`, cover.path, cover.error, epubFilename, productId);

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
