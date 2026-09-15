import { NextRequest, NextResponse } from "next/server";
import { db, Product } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import fs from "fs";
import path from "path";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  const { id } = await params;
  const product = db
    .prepare("SELECT * FROM products WHERE id = ? AND user_id = ?")
    .get(id, user.id) as Product | undefined;

  if (!product || !product.pdf_path) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const filePath = path.join(process.cwd(), "data", "pdfs", product.pdf_path);
  if (!fs.existsSync(filePath)) {
    return NextResponse.json({ error: "PDF file missing." }, { status: 404 });
  }

  const fileBuffer = fs.readFileSync(filePath);
  const safeTitle = (product.title || "product")
    .replace(/[^a-z0-9\- ]/gi, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 60);

  return new NextResponse(new Uint8Array(fileBuffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${safeTitle || "product"}.pdf"`,
    },
  });
}
