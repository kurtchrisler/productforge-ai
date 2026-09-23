import { NextRequest, NextResponse } from "next/server";
import { getDb, Product } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import {
  PRODUCT_TYPES,
  ProductTypeId,
  ProductContent,
  PuzzleBookContent,
  ColoringBookContent,
  ProductDifficulty,
  membershipMeetsRequirement,
} from "@/lib/productTypes";
import { decryptSecret } from "@/lib/crypto";
import { readCoverImageDataUri } from "@/lib/cover";
import {
  generateSalesCopy,
  renderSalesPageHtml,
  renderDownloadPageHtml,
  buildSalesKitZip,
  buildSalesSource,
} from "@/lib/salesKit";
import fs from "fs";
import path from "path";

// Generates a standalone "sales page + download page" HTML kit for one of
// the customer's own products, zipped together. Pro-only: this is a
// membership-level gate (not an independent add-on like KDP Accelerator),
// since it's sold as a reason to upgrade to Pro rather than a separate
// purchase. Works across every product kind (document/puzzle/coloring) --
// buildSalesSource in lib/salesKit.ts normalizes each kind's own content
// shape into one common set of grounded facts the copy generator and page
// renderer both work from.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const db = getDb();
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  if (!membershipMeetsRequirement(user.membership_level, "pro")) {
    return NextResponse.json(
      {
        error:
          "The Sales Page & Download Page kit is a Pro feature. Upgrade to ProductGenie AI Pro in Settings to unlock it.",
        code: "pro_required",
      },
      { status: 403 }
    );
  }

  const { id } = await params;
  const product = db
    .prepare("SELECT * FROM products WHERE id = ? AND user_id = ?")
    .get(id, user.id) as Product | undefined;

  if (!product || product.status !== "ready" || !product.content_json) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const meta = PRODUCT_TYPES[product.product_type as ProductTypeId];
  if (!meta || !product.pdf_path) {
    return NextResponse.json(
      { error: "This product isn't ready for a sales kit yet." },
      { status: 400 }
    );
  }

  const filePath = path.join(process.cwd(), "data", "pdfs", product.pdf_path);
  if (!fs.existsSync(filePath)) {
    return NextResponse.json({ error: "PDF file missing." }, { status: 404 });
  }

  const productType = product.product_type as ProductTypeId;
  const content = JSON.parse(product.content_json) as
    | ProductContent
    | PuzzleBookContent
    | ColoringBookContent;
  const source = buildSalesSource(content, productType, product.difficulty as ProductDifficulty | null);

  let userApiKey: string | null = null;
  if (user.openai_api_key) {
    try {
      userApiKey = decryptSecret(user.openai_api_key);
    } catch (err) {
      console.error("Failed to decrypt stored OpenAI key:", err);
    }
  }

  let copy;
  try {
    const result = await generateSalesCopy(source, productType, userApiKey);
    copy = result.copy;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Sales copy generation failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const coverDataUri = readCoverImageDataUri(product.cover_image_path);
  const pdfBuffer = fs.readFileSync(filePath);
  const pdfDataUri = `data:application/pdf;base64,${pdfBuffer.toString("base64")}`;

  const salesPageHtml = renderSalesPageHtml(source, productType, copy, coverDataUri);
  const downloadPageHtml = renderDownloadPageHtml(source, coverDataUri, pdfDataUri);

  const zipBuffer = await buildSalesKitZip([
    { name: "sales-page.html", content: salesPageHtml },
    { name: "download-page.html", content: downloadPageHtml },
  ]);

  const safeTitle = (product.title || "product")
    .replace(/[^a-z0-9\- ]/gi, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 60);

  return new NextResponse(new Uint8Array(zipBuffer), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${safeTitle || "product"}-sales-kit.zip"`,
    },
  });
}
