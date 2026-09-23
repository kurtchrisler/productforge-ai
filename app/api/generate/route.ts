import { NextRequest, NextResponse } from "next/server";
import { getDb, Product } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import {
  isProductType,
  normalizeLength,
  isProductDifficulty,
  PRODUCT_TYPES,
  PUZZLE_COUNTS,
  COLORING_PAGE_COUNTS,
  PUZZLE_DIFFICULTIES,
  ProductTypeId,
  isAllowedForMembership,
  requiredMembershipFor,
} from "@/lib/productTypes";
import { generateProductContent, generateAndSaveCover } from "@/lib/ai";
import { generatePuzzleContent } from "@/lib/puzzleContent";
import { generateColoringBookContent } from "@/lib/coloringBookContent";
import { generateAndSaveColoringPages } from "@/lib/coloringImages";
import { generateCrossword } from "@/lib/crosswordGenerator";
import { generateWordSearch } from "@/lib/wordSearchGenerator";
import { renderProductHtml } from "@/lib/render";
import { renderPuzzleBookHtml, GeneratedPuzzle } from "@/lib/renderPuzzles";
import { renderColoringBookHtml } from "@/lib/renderColoringBook";
import { renderHtmlToPdf } from "@/lib/pdf";
import { decryptSecret } from "@/lib/crypto";
import { readCoverImageDataUri, readCoverImageBuffer } from "@/lib/cover";
import { generateEpub } from "@/lib/epub";

export async function POST(req: NextRequest) {
  const db = getDb();
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const { idea, productType, length, difficulty, instructions } = await req
    .json()
    .catch(() => ({}));

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
  const resolvedLength = normalizeLength(typeof length === "string" ? length : undefined);
  const resolvedDifficulty =
    typeof difficulty === "string" && isProductDifficulty(difficulty) ? difficulty : "medium";
  const resolvedInstructions =
    typeof instructions === "string" ? instructions.trim().slice(0, 2000) : "";

  // Membership gating -- enforced here regardless of what the dashboard UI
  // shows/hides, since a request could otherwise bypass it entirely (e.g.
  // a crafted request, or a stale page from before an account was
  // downgraded). 'none' means no active license on file at all: blocked
  // outright. 'standard'/'pro' are checked against this exact
  // type+length combination -- see requiredMembershipFor in productTypes.ts
  // for how Standard vs Pro is decided.
  if (user.membership_level === "none") {
    return NextResponse.json(
      {
        error:
          "Activate your ProductGenie AI license to start creating. Head to Settings and enter the email you purchased with, or click \"Refresh my license\" if you just bought it.",
        code: "no_license",
      },
      { status: 403 }
    );
  }
  if (!isAllowedForMembership(productType, resolvedLength, user.membership_level)) {
    const required = requiredMembershipFor(productType, resolvedLength);
    return NextResponse.json(
      {
        error:
          required === "pro"
            ? "That product type or page length is a Pro feature. Upgrade to ProductGenie AI Pro to unlock it."
            : "Upgrade required to create this product.",
        code: "upgrade_required",
        requiredMembership: required,
      },
      { status: 403 }
    );
  }

  const kind = PRODUCT_TYPES[productType].kind;

  const insert = db
    .prepare(
      `INSERT INTO products (user_id, idea, product_type, length, difficulty, status) VALUES (?, ?, ?, ?, ?, 'generating')`
    )
    .run(
      user.id,
      idea.trim(),
      productType,
      resolvedLength,
      kind === "puzzle" ? resolvedDifficulty : null
    );
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
    if (kind === "puzzle") {
      const puzzleType = productType as Extract<ProductTypeId, "crossword" | "word_search">;
      const puzzleCount = PUZZLE_COUNTS[resolvedLength];
      const diffMeta = PUZZLE_DIFFICULTIES[resolvedDifficulty];

      const { content, mode } = await generatePuzzleContent(
        idea.trim(),
        puzzleType,
        resolvedDifficulty,
        puzzleCount,
        userApiKey
      );

      const generatedPuzzles: GeneratedPuzzle[] = content.puzzles.map((p) => {
        if (puzzleType === "crossword") {
          return {
            subtitle: p.subtitle,
            crossword: generateCrossword(p.entries, diffMeta.crosswordGridCap),
          };
        }
        return {
          subtitle: p.subtitle,
          wordSearch: generateWordSearch(
            p.entries.map((e) => e.answer),
            diffMeta.wordSearchGridSize
          ),
        };
      });

      // Same policy as document-kind cover art: only attempt it when
      // generation actually ran on a real key, never in demo/mock mode, and
      // a failure here should never take down the whole product.
      let coverImagePath: string | null = null;
      let coverError: string | null = null;
      if (mode === "ai") {
        const cover = await generateAndSaveCover(
          idea.trim(),
          puzzleType,
          content,
          userApiKey,
          productId
        );
        coverImagePath = cover.path;
        coverError = cover.error;
      }
      const coverImageDataUri = readCoverImageDataUri(coverImagePath);

      const html = renderPuzzleBookHtml(
        content,
        puzzleType,
        resolvedDifficulty,
        generatedPuzzles,
        coverImageDataUri
      );
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
    }

    if (kind === "coloring") {
      const pageCount = COLORING_PAGE_COUNTS[resolvedLength];
      const { content, mode } = await generateColoringBookContent(
        idea.trim(),
        resolvedInstructions,
        pageCount,
        userApiKey
      );

      // Same policy as document/puzzle cover art: only spend real AI calls
      // (cover art AND per-page illustrations) when generation actually ran
      // on a real key, never in demo/mock mode.
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

      const pageDataUris =
        mode === "ai"
          ? await generateAndSaveColoringPages(content, userApiKey, productId)
          : content.pages.map(() => null);

      const html = renderColoringBookHtml(content, pageDataUris, coverImageDataUri);
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
    }

    // kind === "document" (ebook, guide, planner, workbook, template, checklist)
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

    // Kindle-ready EPUB download (document-kind products only — the
    // reflowable-text format KDP actually wants). No AI call needed, it's
    // just a repackaging of the same content, so it's cheap to build
    // eagerly alongside the PDF rather than on first download.
    const epubFilename = await generateEpub(
      content,
      productType,
      readCoverImageBuffer(coverImagePath),
      productId
    );

    db.prepare(
      `UPDATE products
       SET status = 'ready', title = ?, content_json = ?, html = ?, pdf_path = ?, cover_image_path = ?, cover_error = ?, epub_path = ?, updated_at = datetime('now')
       WHERE id = ?`
    ).run(
      content.title,
      JSON.stringify(content),
      html,
      `${productId}.pdf`,
      coverImagePath,
      coverError,
      epubFilename,
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
