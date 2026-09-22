import archiver from "archiver";
import { ProductContent, ProductTypeId, PRODUCT_TYPES } from "./productTypes";
import { getClient } from "./ai";

// ---- Sales copy generation ----
//
// Turns a product's own generated content (title/subtitle/tagline/
// introduction/section headings/conclusion) into short, punchy
// direct-response sales copy for a standalone landing page. This is a
// second, cheap AI call on top of the product's own content -- it does not
// re-read or re-summarize the whole book, just the framing pieces already
// on hand, so it stays fast and inexpensive even for a 150-page book.

export type SalesCopy = {
  headline: string;
  subheadline: string;
  bullets: string[];
  description: string;
  closingLine: string;
};

const SALES_SYSTEM_PROMPT =
  "You write short, high-converting direct-response sales copy and reply with strict JSON only.";

function buildSalesPrompt(content: ProductContent, type: ProductTypeId): string {
  const meta = PRODUCT_TYPES[type];
  const headings = content.sections
    .map((s) => s.heading)
    .filter(Boolean)
    .join("; ");

  return `Write direct-response sales copy for a ${meta.label.toLowerCase()} called "${content.title}". This copy will sit on a standalone landing page selling this exact product -- sell the outcome and transformation it delivers, not just a restatement of its table of contents.

Here is the product's own content, for context:
Subtitle: ${content.subtitle}
Tagline: ${content.tagline}
Introduction: ${content.introduction}
${meta.sectionNoun.charAt(0).toUpperCase() + meta.sectionNoun.slice(1)} headings: ${headings}
Conclusion: ${content.conclusion}

Respond with ONLY a single JSON object with this exact shape, no markdown fences, no commentary:
{
  "headline": string (a punchy, benefit-driven headline, under 100 characters, no quotation marks),
  "subheadline": string (one supporting sentence under the headline),
  "bullets": string[] (5 to 7 specific, benefit-driven bullets describing what the reader gets and why it matters -- not the section headings restated verbatim),
  "description": string (2-3 short paragraphs, separated by a blank line, written in a warm, confident, direct-response style, explaining who this is for and what they'll walk away with),
  "closingLine": string (one short, urgency-driven line encouraging the reader to get it now)
}`;
}

function buildMockSalesCopy(content: ProductContent, type: ProductTypeId): SalesCopy {
  const meta = PRODUCT_TYPES[type];
  const bullets = content.sections
    .map((s) => s.heading)
    .filter(Boolean)
    .slice(0, 6);
  return {
    headline: content.title,
    subheadline:
      content.subtitle ||
      content.tagline ||
      `A complete ${meta.label.toLowerCase()} that walks you through it step by step.`,
    bullets: bullets.length ? bullets : [`Everything you need to get started`],
    description:
      content.introduction ||
      `This ${meta.label.toLowerCase()} was built to take you from idea to result, one step at a time.`,
    closingLine: content.callToAction || "Get instant access below.",
  };
}

export async function generateSalesCopy(
  content: ProductContent,
  type: ProductTypeId,
  apiKey: string | null | undefined
): Promise<{ copy: SalesCopy; mode: "ai" | "mock" }> {
  const client = getClient(apiKey);
  if (!client) {
    return { copy: buildMockSalesCopy(content, type), mode: "mock" };
  }

  try {
    const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
    const completion = await client.chat.completions.create({
      model,
      messages: [
        { role: "system", content: SALES_SYSTEM_PROMPT },
        { role: "user", content: buildSalesPrompt(content, type) },
      ],
      response_format: { type: "json_object" },
      temperature: 0.85,
      max_tokens: 1200,
    });

    const raw = completion.choices[0]?.message?.content;
    if (!raw) throw new Error("Empty response from AI model.");
    let jsonText = raw.trim();
    const fenceMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenceMatch) jsonText = fenceMatch[1].trim();

    const parsed = JSON.parse(jsonText) as Record<string, unknown>;
    const fallback = buildMockSalesCopy(content, type);
    const bullets = Array.isArray(parsed.bullets)
      ? (parsed.bullets as unknown[]).filter((b): b is string => typeof b === "string")
      : [];

    return {
      copy: {
        headline: typeof parsed.headline === "string" ? parsed.headline : fallback.headline,
        subheadline:
          typeof parsed.subheadline === "string" ? parsed.subheadline : fallback.subheadline,
        bullets: bullets.length ? bullets : fallback.bullets,
        description:
          typeof parsed.description === "string" ? parsed.description : fallback.description,
        closingLine:
          typeof parsed.closingLine === "string" ? parsed.closingLine : fallback.closingLine,
      },
      mode: "ai",
    };
  } catch (err) {
    console.error("Sales copy generation failed:", err);
    // Same policy as content generation: the user supplied their own key,
    // so a failure here is theirs to know about rather than silently
    // papering over it with mock copy.
    const message = err instanceof Error ? err.message : "Sales copy generation failed.";
    throw new Error(
      `Couldn't generate sales copy: ${message}. Check your OpenAI key in Settings.`
    );
  }
}

// ---- HTML rendering ----
//
// Both pages are fully self-contained (inline CSS, no external fonts or
// scripts, images/PDF embedded as data: URIs) so they work the moment the
// customer uploads them to their own site -- nothing else to host or wire
// up. The sales page's "Buy Now" links point at "#" with a comment marking
// where the customer needs to drop in their own checkout URL, since
// ProductGenie AI has no way to know where they're selling from.

function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escAttr(s: string): string {
  return escHtml(s).replace(/"/g, "&quot;");
}

function paragraphsHtml(text: string): string {
  return text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${escHtml(p)}</p>`)
    .join("\n");
}

const SHARED_STYLE = `
  * { box-sizing: border-box; }
  body { margin: 0; font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; color: #1a1a2e; background: #f7f7fb; }
  a { text-decoration: none; }
  .wrap { max-width: 760px; margin: 0 auto; padding: 0 24px; }
  .btn { display: inline-flex; align-items: center; justify-content: center; gap: 10px; padding: 18px 36px; border-radius: 10px; font-weight: 700; font-size: 17px; color: #fff; box-shadow: 0 10px 26px rgba(0,0,0,0.18); }
  .card { background: #fff; border: 1px solid rgba(0,0,0,0.08); border-radius: 14px; }
  @media (max-width: 640px) {
    h1 { font-size: 30px !important; }
    .btn { width: 100%; }
  }
`;

export function renderSalesPageHtml(
  content: ProductContent,
  type: ProductTypeId,
  copy: SalesCopy,
  coverDataUri: string | null
): string {
  const accent = PRODUCT_TYPES[type].accent;

  const bulletsHtml = copy.bullets
    .map(
      (b) =>
        `<li style="display:flex; gap:12px; align-items:flex-start; padding:10px 0;"><span style="color:${accent}; font-weight:800; flex:0 0 auto;">&#10003;</span><span>${escHtml(
          b
        )}</span></li>`
    )
    .join("\n");

  const coverHtml = coverDataUri
    ? `<img src="${coverDataUri}" alt="${escAttr(content.title)}" style="width:220px; max-width:60%; border-radius:10px; box-shadow:0 20px 45px rgba(0,0,0,0.28); margin:0 auto 32px; display:block;">`
    : "";

  return `<!doctype html>
<!--
  Sales page generated by ProductGenie AI for "${escHtml(content.title)}".

  Before uploading this page to your site:
  1) Find the "Get Instant Access" buttons below (href="#") and replace
     "#" with your real checkout / payment link.
  2) Feel free to edit the headline, bullets, or description text.
-->
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escHtml(copy.headline || content.title)}</title>
<style>${SHARED_STYLE}</style>
</head>
<body>

  <div style="width:100%; background:#14122b; padding:72px 0 64px;">
    <div class="wrap" style="text-align:center;">
      ${coverHtml}
      <h1 style="color:#fff; font-size:40px; font-weight:800; line-height:1.2; margin:0 0 16px;">${escHtml(
        copy.headline || content.title
      )}</h1>
      <p style="color:rgba(255,255,255,0.72); font-size:18px; line-height:1.6; max-width:560px; margin:0 auto 32px;">${escHtml(
        copy.subheadline
      )}</p>
      <a href="#" class="btn" style="background:${accent};">Get Instant Access &rarr;</a>
    </div>
  </div>

  <div style="width:100%; padding:64px 0;">
    <div class="wrap">
      <div class="card" style="padding:36px;">
        <h2 style="font-size:24px; font-weight:800; margin:0 0 20px;">What You Get</h2>
        <ul style="list-style:none; margin:0; padding:0;">
          ${bulletsHtml}
        </ul>
      </div>
    </div>
  </div>

  <div style="width:100%; background:#fff; padding:8px 0 64px;">
    <div class="wrap">
      ${paragraphsHtml(copy.description)
        .replace(/<p>/g, `<p style="font-size:16px; line-height:1.75; color:#33324a; margin:0 0 18px;">`)}
    </div>
  </div>

  <div style="width:100%; background:#14122b; padding:64px 0;">
    <div class="wrap" style="text-align:center;">
      <p style="color:#fff; font-size:20px; font-weight:700; margin:0 0 24px;">${escHtml(
        copy.closingLine
      )}</p>
      <a href="#" class="btn" style="background:${accent};">Get Instant Access &rarr;</a>
    </div>
  </div>

  <div style="width:100%; padding:24px 0;">
    <div class="wrap" style="text-align:center;">
      <p style="color:#9d9caf; font-size:12px;">Delivered instantly as a digital download after purchase.</p>
    </div>
  </div>

</body>
</html>
`;
}

export function renderDownloadPageHtml(
  content: ProductContent,
  coverDataUri: string | null,
  pdfDataUri: string
): string {
  const safeTitle = (content.title || "your-product")
    .replace(/[^a-z0-9\- ]/gi, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 60) || "download";

  const coverHtml = coverDataUri
    ? `<img src="${coverDataUri}" alt="${escAttr(content.title)}" style="width:180px; max-width:55%; border-radius:10px; box-shadow:0 20px 45px rgba(0,0,0,0.22); margin:0 auto 28px; display:block;">`
    : "";

  return `<!doctype html>
<!--
  Download page generated by ProductGenie AI for "${escHtml(content.title)}".
  The PDF is embedded directly in this file, so it works as soon as you
  upload it -- nothing else to configure. Send buyers to this page (or
  redirect them here) right after checkout.
-->
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Your Download Is Ready — ${escHtml(content.title)}</title>
<style>${SHARED_STYLE}</style>
</head>
<body>
  <div style="width:100%; min-height:100vh; display:flex; align-items:center; padding:64px 0;">
    <div class="wrap" style="text-align:center;">
      <div class="card" style="padding:48px 36px;">
        ${coverHtml}
        <p style="text-transform:uppercase; letter-spacing:0.08em; font-size:12px; font-weight:700; color:#7a7891; margin:0 0 12px;">Thank you for your purchase</p>
        <h1 style="font-size:30px; font-weight:800; margin:0 0 14px;">Your Download Is Ready</h1>
        <p style="color:#5b5975; font-size:16px; line-height:1.6; max-width:460px; margin:0 auto 32px;">Click the button below to download <strong>${escHtml(
          content.title
        )}</strong>. Save it somewhere you'll find it again.</p>
        <a href="${pdfDataUri}" download="${escAttr(safeTitle)}.pdf" class="btn" style="background:#16a34a;">Download Now &darr;</a>
      </div>
      <p style="color:#9d9caf; font-size:12px; margin-top:24px;">Having trouble? Reply to your purchase confirmation email and we'll help.</p>
    </div>
  </div>
</body>
</html>
`;
}

// ---- Zip packaging ----
//
// Built entirely in memory (no disk writes) since the kit is generated
// fresh on every request rather than cached alongside the product.
export async function buildSalesKitZip(
  files: { name: string; content: string }[]
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const archive = archiver("zip", { zlib: { level: 9 } });
    const chunks: Buffer[] = [];
    archive.on("data", (chunk: Buffer) => chunks.push(chunk));
    archive.on("error", (err) => reject(err));
    archive.on("end", () => resolve(Buffer.concat(chunks)));
    for (const f of files) {
      archive.append(f.content, { name: f.name });
    }
    archive.finalize();
  });
}
