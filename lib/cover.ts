import path from "path";
import fs from "fs";
import sharp from "sharp";

const coverDir = path.join(process.cwd(), "data", "covers");

export function saveCoverImage(buffer: Buffer, productId: number): string {
  if (!fs.existsSync(coverDir)) {
    fs.mkdirSync(coverDir, { recursive: true });
  }
  const filename = `${productId}.png`;
  fs.writeFileSync(path.join(coverDir, filename), buffer);
  return filename;
}

// Reads the saved cover off disk and returns it as a data: URI, so it can be
// embedded directly into the self-contained HTML that both the preview
// iframe and the Playwright PDF renderer consume.
export function readCoverImageDataUri(filename: string | null): string | null {
  if (!filename) return null;
  const filePath = path.join(coverDir, filename);
  if (!fs.existsSync(filePath)) return null;
  const buffer = fs.readFileSync(filePath);
  return `data:image/png;base64,${buffer.toString("base64")}`;
}

// Raw bytes (not a data: URI) — used when embedding the cover as its own
// binary file inside a package format like EPUB, rather than inlining it
// into an HTML string.
export function readCoverImageBuffer(filename: string | null): Buffer | null {
  if (!filename) return null;
  const filePath = path.join(coverDir, filename);
  if (!fs.existsSync(filePath)) return null;
  return fs.readFileSync(filePath);
}

export function deleteCoverImage(filename: string | null): void {
  if (!filename) return;
  const filePath = path.join(coverDir, filename);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}

// Amazon KDP requires cover art as a JPG (our cover is generated/stored as
// PNG for the PDF/preview pipeline) — this converts on demand rather than
// storing a second file on disk, so it's always derived from whatever the
// current cover actually is (including after a "regenerate cover"). JPEG
// has no alpha channel, so any transparency is flattened onto a white
// background first rather than silently turning black.
export async function convertCoverToKindleJpeg(pngBuffer: Buffer): Promise<Buffer> {
  return sharp(pngBuffer)
    .flatten({ background: "#ffffff" })
    .jpeg({ quality: 92 })
    .toBuffer();
}
