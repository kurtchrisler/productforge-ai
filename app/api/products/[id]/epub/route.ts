import { NextRequest, NextResponse } from "next/server";
import { getDb, Product } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import fs from "fs";
import path from "path";

// Downloads the Kindle-ready EPUB — reflowable text, uploadable to Amazon
// KDP as-is. Document-kind products only (see lib/epub.ts).
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const db = getDb();
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  if (!user.kdp_accelerator) {
    return NextResponse.json(
      {
        error:
          "The Kindle (.epub) download is part of the KDP Accelerator add-on. Head to Settings to purchase it.",
        code: "kdp_accelerator_required",
      },
      { status: 403 }
    );
  }

  const { id } = await params;
  const product = db
    .prepare("SELECT * FROM products WHERE id = ? AND user_id = ?")
    .get(id, user.id) as Product | undefined;

  if (!product || !product.epub_path) {
    return NextResponse.json({ error: "No Kindle file found." }, { status: 404 });
  }

  const filePath = path.join(process.cwd(), "data", "epubs", product.epub_path);
  if (!fs.existsSync(filePath)) {
    return NextResponse.json({ error: "EPUB file missing." }, { status: 404 });
  }

  const fileBuffer = fs.readFileSync(filePath);
  const safeTitle = (product.title || "product")
    .replace(/[^a-z0-9\- ]/gi, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 60);

  return new NextResponse(new Uint8Array(fileBuffer), {
    headers: {
      "Content-Type": "application/epub+zip",
      "Content-Disposition": `attachment; filename="${safeTitle || "product"}.epub"`,
    },
  });
}
