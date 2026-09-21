import { NextRequest, NextResponse } from "next/server";
import { getDb, Product } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { readCoverImageBuffer, convertCoverToKindleJpeg } from "@/lib/cover";

// Downloads the cover art as a Kindle-ready JPG — Amazon KDP requires JPG
// (or TIFF) for cover uploads and rejects PNG, so this converts our stored
// PNG cover on the fly. Gated behind the KDP Accelerator add-on, same as
// the EPUB download route — Standard/Pro alone doesn't unlock this.
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
          "The Kindle cover download is part of the KDP Accelerator add-on. Head to Settings to purchase it.",
        code: "kdp_accelerator_required",
      },
      { status: 403 }
    );
  }

  const { id } = await params;
  const product = db
    .prepare("SELECT * FROM products WHERE id = ? AND user_id = ?")
    .get(id, user.id) as Product | undefined;

  if (!product || !product.cover_image_path) {
    return NextResponse.json({ error: "No cover image found." }, { status: 404 });
  }

  const pngBuffer = readCoverImageBuffer(product.cover_image_path);
  if (!pngBuffer) {
    return NextResponse.json({ error: "Cover image file missing." }, { status: 404 });
  }

  let jpegBuffer: Buffer;
  try {
    jpegBuffer = await convertCoverToKindleJpeg(pngBuffer);
  } catch (err) {
    console.error("Kindle cover JPEG conversion failed:", err);
    return NextResponse.json(
      { error: "Couldn't convert the cover to JPG. Please try again." },
      { status: 500 }
    );
  }

  const safeTitle = (product.title || "cover")
    .replace(/[^a-z0-9\- ]/gi, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 60);

  return new NextResponse(new Uint8Array(jpegBuffer), {
    headers: {
      "Content-Type": "image/jpeg",
      "Content-Disposition": `attachment; filename="${safeTitle || "cover"}-kindle-cover.jpg"`,
    },
  });
}
