import path from "path";
import fs from "fs";
import OpenAI from "openai";
import { getClient } from "./ai";
import { ColoringBookContent } from "./productTypes";
import { mapWithConcurrency } from "./concurrency";

const coloringDir = path.join(process.cwd(), "data", "coloring");

function pageFilePath(productId: number, pageIndex: number): string {
  return path.join(coloringDir, String(productId), `page-${pageIndex + 1}.png`);
}

function isGptImageModel(model: string): boolean {
  return model.startsWith("gpt-image");
}

// At most this many page-image generations run at once. A coloring book can
// have up to 45 pages and each is its own image-generation call, so this
// keeps wall-clock time reasonable without hammering the customer's OpenAI
// rate limit or firing dozens of simultaneous image requests (deliberately
// lower than CHAPTER_CONCURRENCY in lib/ai.ts — image calls are slower and
// pricier than a chat completion).
const COLORING_IMAGE_CONCURRENCY = 3;

async function generateColoringPageImage(
  client: OpenAI,
  prompt: string
): Promise<{ buffer: Buffer } | { error: string }> {
  const model = process.env.OPENAI_IMAGE_MODEL || "gpt-image-1";
  const gptImage = isGptImageModel(model);

  const fullPrompt = `Create a black-and-white LINE ART coloring book page (to be printed and colored in with crayons or markers) of: ${prompt}.

Strict requirements:
- Pure black outlines on a solid white background only — absolutely NO color, NO shading, NO gray fill, NO gradients, NO cross-hatching.
- Bold, clean, fully closed line-work with clearly separated areas someone could color in with a crayon.
- Simple, uncluttered composition that fills the page, with a small white margin around the edge.
- No text, no watermark, no signature, no border frame — just the illustration itself.`;

  try {
    type GenerateParams = OpenAI.Images.ImageGenerateParamsNonStreaming;
    const params: GenerateParams = {
      model,
      prompt: fullPrompt,
      n: 1,
      size: gptImage ? "1024x1536" : "1024x1792",
      // GPT image models always return b64_json and don't support
      // response_format/style — only dall-e-3 does. Quality defaults to
      // "medium" (vs. the cover's "high") since a book can call this up to
      // 45 times — cost adds up fast at max quality for line art that
      // doesn't need photorealistic detail.
      ...(gptImage
        ? {
            quality:
              (process.env.OPENAI_COLORING_IMAGE_QUALITY as GenerateParams["quality"]) ||
              "medium",
          }
        : {
            response_format: "b64_json" as const,
            quality: "standard" as GenerateParams["quality"],
            style: "natural" as GenerateParams["style"],
          }),
    };

    const response = await client.images.generate(params);

    const b64 = response.data?.[0]?.b64_json;
    if (!b64) return { error: "No image was returned by the model." };
    return { buffer: Buffer.from(b64, "base64") };
  } catch (err) {
    console.error("Coloring page image generation failed:", err);
    const message = err instanceof Error ? err.message : "Image generation failed.";
    return { error: message };
  }
}

// Generates one line-art image per page and saves each to disk, returning a
// data: URI per page (null for any page whose generation failed). Mirrors
// the cover-art policy: a single bad page should never take down the whole
// book — the renderer shows a placeholder with that page's caption/prompt
// instead of failing the entire PDF. In mock mode (no client) this makes no
// AI calls at all and returns an array of nulls, same as cover art.
export async function generateAndSaveColoringPages(
  content: ColoringBookContent,
  apiKey: string | null | undefined,
  productId: number
): Promise<(string | null)[]> {
  const client = getClient(apiKey);
  if (!client) return content.pages.map(() => null);

  const dir = path.join(coloringDir, String(productId));
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  return mapWithConcurrency(content.pages, COLORING_IMAGE_CONCURRENCY, async (page, i) => {
    const result = await generateColoringPageImage(client, page.prompt);
    if ("error" in result) return null;
    fs.writeFileSync(pageFilePath(productId, i), result.buffer);
    return `data:image/png;base64,${result.buffer.toString("base64")}`;
  });
}

// Reads already-saved page images back off disk as data: URIs (null for any
// page with no saved file). Used by the cover-only regeneration route so
// refreshing just the cover doesn't re-spend AI credits re-illustrating
// every page.
export function readColoringPageDataUris(
  productId: number,
  pageCount: number
): (string | null)[] {
  return Array.from({ length: pageCount }, (_, i) => {
    const filePath = pageFilePath(productId, i);
    if (!fs.existsSync(filePath)) return null;
    const buffer = fs.readFileSync(filePath);
    return `data:image/png;base64,${buffer.toString("base64")}`;
  });
}

// Same as above but returns raw buffers rather than data: URIs — used when
// embedding page images as their own binary files inside a package format
// like EPUB, rather than inlining them into an HTML string.
export function readColoringPageBuffers(
  productId: number,
  pageCount: number
): (Buffer | null)[] {
  return Array.from({ length: pageCount }, (_, i) => {
    const filePath = pageFilePath(productId, i);
    if (!fs.existsSync(filePath)) return null;
    return fs.readFileSync(filePath);
  });
}

export function deleteColoringImages(productId: number): void {
  const dir = path.join(coloringDir, String(productId));
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
