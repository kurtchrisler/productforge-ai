import path from "path";
import fs from "fs";
import { chromium } from "playwright";

const imageDir = path.join(process.cwd(), "data", "infographics");

// Renders a fixed-size HTML page to a PNG via a real browser viewport (not
// an AI image model) — used for infographics, where accurate baked-in text
// matters more than illustration, and a headless-browser screenshot of our
// own HTML/CSS is far more reliable than asking an image model to render
// text correctly.
export async function renderHtmlToPng(
  html: string,
  productId: number,
  width: number,
  height: number
): Promise<string> {
  if (!fs.existsSync(imageDir)) {
    fs.mkdirSync(imageDir, { recursive: true });
  }
  const filename = `${productId}.png`;
  const filePath = path.join(imageDir, filename);

  const browser = await chromium.launch({
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined,
    args: ["--no-sandbox"],
  });

  try {
    const page = await browser.newPage({ viewport: { width, height } });
    await page.setContent(html, { waitUntil: "networkidle" });
    await page.screenshot({ path: filePath, type: "png" });
  } finally {
    await browser.close();
  }

  return filename;
}

export function infographicFilePath(filename: string | null): string | null {
  if (!filename) return null;
  const filePath = path.join(imageDir, filename);
  return fs.existsSync(filePath) ? filePath : null;
}

export function deleteInfographicImage(filename: string | null): void {
  if (!filename) return;
  const filePath = path.join(imageDir, filename);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}
