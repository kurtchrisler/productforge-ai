import path from "path";
import fs from "fs";
import { chromium } from "playwright";

const pdfDir = path.join(process.cwd(), "data", "pdfs");

export async function renderHtmlToPdf(
  html: string,
  productId: number
): Promise<string> {
  if (!fs.existsSync(pdfDir)) {
    fs.mkdirSync(pdfDir, { recursive: true });
  }

  const filePath = path.join(pdfDir, `${productId}.pdf`);

  // Only override the browser location if explicitly configured (useful in
  // sandboxed/CI environments with a pre-installed Chromium at a fixed
  // path). Otherwise let Playwright find the browser it downloaded via
  // `npx playwright install chromium`.
  const browser = await chromium.launch({
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined,
    args: ["--no-sandbox"],
  });

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle" });
    await page.pdf({
      path: filePath,
      printBackground: true,
      preferCSSPageSize: true,
    });
  } finally {
    await browser.close();
  }

  return filePath;
}
