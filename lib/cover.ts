import path from "path";
import fs from "fs";

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

export function deleteCoverImage(filename: string | null): void {
  if (!filename) return;
  const filePath = path.join(coverDir, filename);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}
