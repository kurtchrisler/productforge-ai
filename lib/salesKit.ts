import archiver from "archiver";
import { ProductContent, ProductTypeId, PRODUCT_TYPES } from "./productTypes";
import { getClient } from "./ai";

// ---- Sales copy generation ----
//
// Turns a product's own generated content (title/subtitle/tagline/
// introduction/section headings+bodies/conclusion) into a full set of
// direct-response sales page copy: hero, agitation, a benefits grid, a
// "who this is for" list, and a grounded FAQ. This is a second, cheap AI
// call on top of the product's own content -- it does not re-read or
// re-summarize the whole book, just the framing pieces already on hand
// plus a one-sentence taste of each section, so it stays fast and
// inexpensive even for a 150-page book.
//
// Anything page-owner-specific that ProductGenie AI has no way to know --
// the checkout link, the price, the refund policy, the business name --
// is deliberately left OUT of the AI prompt and instead rendered as a
// visible [BRACKETED PLACEHOLDER] in the HTML, never fabricated. See
// craft note in renderSalesPageHtml.

export type SalesBenefit = { heading: string; description: string };
export type SalesFaqItem = { q: string; a: string };

export type SalesCopy = {
  headline: string;
  subheadline: string;
  painPoints: string[];
  solutionIntro: string;
  benefits: SalesBenefit[];
  whoFor: string[];
  faq: SalesFaqItem[];
  closingLine: string;
};

const SALES_SYSTEM_PROMPT =
  "You write complete, professional direct-response sales page copy and reply with strict JSON only.";

function buildSalesPrompt(content: ProductContent, type: ProductTypeId): string {
  const meta = PRODUCT_TYPES[type];
  const sectionTaste = content.sections
    .map((s) => `- ${s.heading}: ${s.body.split(/(?<=[.!?])\s+/)[0] ?? ""}`)
    .join("\n");

  return `Write the full copy for a direct-response sales page selling a ${meta.label.toLowerCase()} called "${content.title}". Sell the transformation and outcome it delivers -- never just restate its table of contents.

Here is the product's own content, for context:
Subtitle: ${content.subtitle}
Tagline: ${content.tagline}
Introduction: ${content.introduction}
${meta.sectionNoun.charAt(0).toUpperCase() + meta.sectionNoun.slice(1)}s (heading + opening line of each):
${sectionTaste}
Conclusion: ${content.conclusion}

Important: do NOT mention price, discounts, guarantees, refund policy, bonuses, or how the product is delivered/checked out -- none of that is known to you and it's handled elsewhere on the page. Ground every FAQ answer ONLY in the information given above -- never invent a claim (no "lifetime updates," no "includes video," etc.) that isn't supported by it.

Respond with ONLY a single JSON object with this exact shape, no markdown fences, no commentary:
{
  "headline": string (a punchy, benefit-driven headline, under 100 characters, no quotation marks),
  "subheadline": string (one supporting sentence under the headline),
  "painPoints": string[] (exactly 4 specific problems the reader is dealing with right now, second person "You...", each one sentence),
  "solutionIntro": string (2-3 sentences introducing this ${meta.label.toLowerCase()} as the specific answer to those problems, naming what makes it different),
  "benefits": [{ "heading": string (3-6 words, punchy), "description": string (1-2 sentences, a concrete benefit -- not a restated feature) }] (exactly 6 items),
  "whoFor": string[] (exactly 5 short bullets, second person "You're ready for this if..." style, each under 16 words),
  "faq": [{ "q": string, "a": string (1-3 sentences) }] (exactly 6 pairs a real buyer would ask before purchasing -- cover who it's for, the format/length, how specific and practical the content is, whether prior experience is needed, and how it's meant to be used),
  "closingLine": string (one short, confident line encouraging the reader to get it now)
}`;
}

function firstSentence(text: string, maxLen = 140): string {
  const s = (text.split(/(?<=[.!?])\s+/)[0] ?? text).trim();
  return s.length > maxLen ? `${s.slice(0, maxLen - 1).trim()}…` : s;
}

function buildMockSalesCopy(content: ProductContent, type: ProductTypeId): SalesCopy {
  const meta = PRODUCT_TYPES[type];
  const topic = content.title || "this topic";

  const benefits: SalesBenefit[] = content.sections.slice(0, 6).map((s) => ({
    heading: s.heading || "A focused, practical section",
    description: firstSentence(s.body) || `Covers exactly what you need to know, in plain language.`,
  }));
  while (benefits.length < 6) {
    benefits.push({
      heading: "Built to actually use",
      description: `Practical, step-by-step guidance you can apply right away.`,
    });
  }

  return {
    headline: content.title,
    subheadline:
      content.subtitle ||
      content.tagline ||
      `A complete ${meta.label.toLowerCase()} that walks you through it step by step.`,
    painPoints: [
      `You know ${topic} matters, but you're not sure where to actually start.`,
      `Every time you try to figure it out on your own, you end up more confused than before.`,
      `You've read scattered advice online, but nothing pulls it together into one clear path.`,
      `You want real progress, not another resource that sits unread.`,
    ],
    solutionIntro:
      content.introduction ||
      `${content.title} was built to take you from confused to confident, one clear step at a time.`,
    benefits,
    whoFor: [
      `You're ready to stop guessing and follow a clear, complete path.`,
      `You'd rather have this laid out for you than piece it together yourself.`,
      `You're willing to put in a little effort once the path is clear.`,
      `You want something practical, not just theory.`,
      `You're ready to actually finish something for once.`,
    ],
    faq: [
      {
        q: "Who is this for?",
        a: `Anyone who wants a clear, complete path through ${topic} instead of piecing it together from scattered sources.`,
      },
      {
        q: "What format do I get?",
        a: `A digital ${meta.label.toLowerCase()} you can read on any device.`,
      },
      {
        q: "Do I need any experience first?",
        a: `No — it's written to be followed from wherever you're starting.`,
      },
      {
        q: `How is the ${meta.sectionNoun}-by-${meta.sectionNoun} content organized?`,
        a: `Each ${meta.sectionNoun} covers one clear piece of the topic, building on the one before it.`,
      },
      {
        q: "Is this practical or just theory?",
        a: `It's written to be used, not just read — you'll come away with concrete next steps.`,
      },
      {
        q: "How do I get started?",
        a: `As soon as you have it, start with the introduction and work through it in order.`,
      },
    ],
    closingLine: content.callToAction || "Get instant access below.",
  };
}

export async function generateSalesCopy(
  content: ProductContent,
  type: ProductTypeId,
  apiKey: string | null | undefined
): Promise<{ copy: SalesCopy; mode: "ai" | "mock" }> {
  const client = getClient(apiKey);
  const fallback = buildMockSalesCopy(content, type);
  if (!client) {
    return { copy: fallback, mode: "mock" };
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
      max_tokens: 3200,
    });

    const raw = completion.choices[0]?.message?.content;
    if (!raw) throw new Error("Empty response from AI model.");
    let jsonText = raw.trim();
    const fenceMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenceMatch) jsonText = fenceMatch[1].trim();

    const parsed = JSON.parse(jsonText) as Record<string, unknown>;

    const painPoints = Array.isArray(parsed.painPoints)
      ? (parsed.painPoints as unknown[]).filter((p): p is string => typeof p === "string")
      : [];
    const benefits = Array.isArray(parsed.benefits)
      ? (parsed.benefits as unknown[])
          .filter(
            (b): b is Record<string, unknown> => typeof b === "object" && b !== null
          )
          .map((b) => ({
            heading: typeof b.heading === "string" ? b.heading : "",
            description: typeof b.description === "string" ? b.description : "",
          }))
          .filter((b) => b.heading && b.description)
      : [];
    const whoFor = Array.isArray(parsed.whoFor)
      ? (parsed.whoFor as unknown[]).filter((p): p is string => typeof p === "string")
      : [];
    const faq = Array.isArray(parsed.faq)
      ? (parsed.faq as unknown[])
          .filter((f): f is Record<string, unknown> => typeof f === "object" && f !== null)
          .map((f) => ({
            q: typeof f.q === "string" ? f.q : "",
            a: typeof f.a === "string" ? f.a : "",
          }))
          .filter((f) => f.q && f.a)
      : [];

    return {
      copy: {
        headline: typeof parsed.headline === "string" ? parsed.headline : fallback.headline,
        subheadline:
          typeof parsed.subheadline === "string" ? parsed.subheadline : fallback.subheadline,
        painPoints: painPoints.length ? painPoints : fallback.painPoints,
        solutionIntro:
          typeof parsed.solutionIntro === "string" ? parsed.solutionIntro : fallback.solutionIntro,
        benefits: benefits.length ? benefits : fallback.benefits,
        whoFor: whoFor.length ? whoFor : fallback.whoFor,
        faq: faq.length ? faq : fallback.faq,
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
// Both pages are fully self-contained (inline CSS, system fonts, no
// external scripts, images/PDF embedded as data: URIs) so they work the
// moment the customer uploads them to their own site -- nothing else to
// host or wire up.
//
// Anything ProductGenie AI cannot know about the customer's own business
// -- their checkout link, price, refund policy, and business/legal
// details -- is rendered as a visible [BRACKETED PLACEHOLDER] directly in
// the page text (never a fabricated value), plus an HTML comment at the
// top of the file summarizing what to edit before publishing.

function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escAttr(s: string): string {
  return escHtml(s).replace(/"/g, "&quot;");
}

function paragraphsHtml(text: string, pStyle: string): string {
  return text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p style="${pStyle}">${escHtml(p)}</p>`)
    .join("\n");
}

const SHARED_STYLE = `
  * { box-sizing: border-box; }
  body { margin: 0; font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; color: #1a1a2e; background: #f7f7fb; }
  a { text-decoration: none; }
  .wrap { max-width: 880px; margin: 0 auto; padding: 0 24px; }
  .wrap-narrow { max-width: 720px; margin: 0 auto; padding: 0 24px; }
  .btn { display: inline-flex; align-items: center; justify-content: center; gap: 10px; padding: 18px 36px; border-radius: 10px; font-weight: 700; font-size: 17px; color: #fff; box-shadow: 0 10px 26px rgba(0,0,0,0.18); }
  .card { background: #fff; border: 1px solid rgba(0,0,0,0.08); border-radius: 14px; }
  .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
  .grid-3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; }
  @media (max-width: 680px) {
    h1 { font-size: 30px !important; }
    .btn { width: 100%; }
    .grid-2 { grid-template-columns: 1fr; }
    .grid-3 { grid-template-columns: 1fr; }
  }
`;

export function renderSalesPageHtml(
  content: ProductContent,
  type: ProductTypeId,
  copy: SalesCopy,
  coverDataUri: string | null
): string {
  const meta = PRODUCT_TYPES[type];
  const accent = meta.accent;
  const accentSoft = meta.accentSoft;
  const year = new Date().getFullYear();

  const coverHeroHtml = coverDataUri
    ? `<img src="${coverDataUri}" alt="${escAttr(content.title)}" style="width:220px; max-width:60%; border-radius:10px; box-shadow:0 20px 45px rgba(0,0,0,0.28); margin:0 auto 32px; display:block;">`
    : "";
  const coverBandHtml = coverDataUri
    ? `<img src="${coverDataUri}" alt="${escAttr(content.title)}" style="width:200px; max-width:55%; border-radius:10px; box-shadow:0 20px 45px rgba(0,0,0,0.3); display:block;">`
    : "";

  const painPointsHtml = copy.painPoints
    .map(
      (p) =>
        `<div class="card" style="padding:22px 24px;"><p style="margin:0; font-size:15px; line-height:1.6; color:#33324a;">${escHtml(
          p
        )}</p></div>`
    )
    .join("\n");

  const whatsInsideHtml = content.sections
    .map(
      (s, i) =>
        `<div style="display:flex; gap:14px; align-items:flex-start; padding:14px 0; border-bottom:1px solid rgba(0,0,0,0.06);"><span style="flex:0 0 auto; width:26px; height:26px; border-radius:999px; background:${accentSoft}; color:${accent}; font-weight:800; font-size:12px; display:flex; align-items:center; justify-content:center;">${
          i + 1
        }</span><span style="font-size:15px; padding-top:3px; color:#242338;">${escHtml(
          s.heading
        )}</span></div>`
    )
    .join("\n");

  const benefitsHtml = copy.benefits
    .map(
      (b) => `<div class="card" style="padding:24px;">
        <div style="display:flex; gap:12px; align-items:flex-start;">
          <span style="flex:0 0 auto; color:${accent}; font-weight:800; font-size:18px; line-height:1.4;">&#10003;</span>
          <div>
            <div style="font-weight:700; font-size:16px; margin-bottom:6px;">${escHtml(b.heading)}</div>
            <p style="margin:0; font-size:14.5px; line-height:1.6; color:#4b4a63;">${escHtml(
              b.description
            )}</p>
          </div>
        </div>
      </div>`
    )
    .join("\n");

  const whoForHtml = copy.whoFor
    .map(
      (w) =>
        `<li style="display:flex; gap:12px; align-items:flex-start; padding:9px 0;"><span style="color:#16a34a; font-weight:800; flex:0 0 auto;">&#10003;</span><span style="font-size:15.5px; color:#242338;">${escHtml(
          w
        )}</span></li>`
    )
    .join("\n");

  const faqHtml = copy.faq
    .map(
      (f) => `<div class="card" style="padding:22px 24px;">
        <div style="font-weight:700; font-size:15.5px; margin-bottom:8px;">${escHtml(f.q)}</div>
        <p style="margin:0; font-size:14.5px; line-height:1.6; color:#4b4a63;">${escHtml(f.a)}</p>
      </div>`
    )
    .join("\n");

  return `<!doctype html>
<!--
  Sales page generated by ProductGenie AI for "${escHtml(content.title)}".

  Before uploading this page to your site, edit or replace:
  1) The "Get Instant Access" buttons (href="#") -- point these at your
     real checkout / payment link.
  2) The [ADD YOUR PRICE] placeholder in the pricing area.
  3) The guarantee section -- it's a generic placeholder; set it to your
     real refund policy, or delete the section if you don't offer one.
  4) The footer -- replace [YOUR BUSINESS NAME] and [YOUR SUPPORT EMAIL].
  Everything else (headline, copy, chapter list, FAQ) was written from
  this product's own content and is ready to use as-is, or edit freely.
-->
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escHtml(copy.headline || content.title)}</title>
<style>${SHARED_STYLE}</style>
</head>
<body>

  <!-- HERO -->
  <div style="width:100%; background:#14122b; background-image: radial-gradient(rgba(255,255,255,0.06) 1px, transparent 1px); background-size: 24px 24px; padding:72px 0 56px;">
    <div class="wrap-narrow" style="text-align:center;">
      ${coverHeroHtml}
      <h1 style="color:#fff; font-size:40px; font-weight:800; line-height:1.2; margin:0 0 16px;">${escHtml(
        copy.headline || content.title
      )}</h1>
      <p style="color:rgba(255,255,255,0.72); font-size:18px; line-height:1.6; max-width:560px; margin:0 auto 32px;">${escHtml(
        copy.subheadline
      )}</p>
      <a href="#" class="btn" style="background:${accent};">Get Instant Access &rarr;</a>
      <p style="color:rgba(255,255,255,0.45); font-size:13px; margin:16px 0 0;">Instant digital download &middot; Delivered immediately after checkout</p>
    </div>
  </div>

  <!-- AGITATION -->
  <div style="width:100%; padding:64px 0;">
    <div class="wrap">
      <h2 style="text-align:center; font-size:26px; font-weight:800; margin:0 0 32px;">Sound familiar?</h2>
      <div class="grid-2">
        ${painPointsHtml}
      </div>
    </div>
  </div>

  <!-- SOLUTION -->
  <div style="width:100%; background:${accentSoft}; padding:56px 0;">
    <div class="wrap-narrow" style="text-align:center;">
      <h2 style="font-size:26px; font-weight:800; margin:0 0 18px;">${escHtml(content.title)}</h2>
      <p style="font-size:16.5px; line-height:1.7; color:#33324a; margin:0;">${escHtml(
        copy.solutionIntro
      )}</p>
    </div>
  </div>

  <!-- WHAT'S INSIDE -->
  <div style="width:100%; padding:64px 0;">
    <div class="wrap-narrow">
      <h2 style="text-align:center; font-size:26px; font-weight:800; margin:0 0 8px;">What's Inside</h2>
      <p style="text-align:center; color:#6b6a82; font-size:14.5px; margin:0 0 28px;">${
        content.sections.length
      } ${meta.sectionNoun}${content.sections.length === 1 ? "" : "s"}, start to finish</p>
      <div class="card" style="padding:8px 28px;">
        ${whatsInsideHtml}
      </div>
    </div>
  </div>

  <!-- COVER BAND -->
  ${
    coverBandHtml
      ? `<div style="width:100%; background:#14122b; padding:56px 0;">
    <div class="wrap-narrow" style="display:flex; align-items:center; gap:40px; flex-wrap:wrap; justify-content:center; text-align:left;">
      ${coverBandHtml}
      <p style="color:rgba(255,255,255,0.75); font-size:17px; line-height:1.7; max-width:340px; margin:0; font-style:italic;">"${escHtml(
        content.tagline
      )}"</p>
    </div>
  </div>`
      : ""
  }

  <!-- BENEFITS -->
  <div style="width:100%; padding:64px 0;">
    <div class="wrap">
      <h2 style="text-align:center; font-size:26px; font-weight:800; margin:0 0 32px;">What You'll Get Out Of It</h2>
      <div class="grid-2">
        ${benefitsHtml}
      </div>
    </div>
  </div>

  <!-- WHO FOR -->
  <div style="width:100%; background:${accentSoft}; padding:56px 0;">
    <div class="wrap-narrow">
      <h2 style="text-align:center; font-size:26px; font-weight:800; margin:0 0 24px;">This Is For You If...</h2>
      <ul style="list-style:none; margin:0; padding:0;">
        ${whoForHtml}
      </ul>
    </div>
  </div>

  <!-- PRICING / CTA -->
  <div style="width:100%; background:#14122b; padding:64px 0;">
    <div class="wrap-narrow" style="text-align:center;">
      <p style="color:#fff; font-size:20px; font-weight:700; margin:0 0 20px;">${escHtml(
        copy.closingLine
      )}</p>
      <div class="card" style="display:inline-block; padding:32px 40px; text-align:center;">
        <div style="font-size:36px; font-weight:800; color:${accent}; margin-bottom:18px;">[ADD YOUR PRICE]</div>
        <a href="#" class="btn" style="background:${accent};">Get Instant Access &rarr;</a>
      </div>
    </div>
  </div>

  <!-- FAQ -->
  <div style="width:100%; padding:64px 0;">
    <div class="wrap">
      <h2 style="text-align:center; font-size:26px; font-weight:800; margin:0 0 32px;">Questions? We've Got Answers.</h2>
      <div style="display:flex; flex-direction:column; gap:16px;">
        ${faqHtml}
      </div>
    </div>
  </div>

  <!-- GUARANTEE (placeholder -- edit or remove) -->
  <div style="width:100%; background:${accentSoft}; padding:56px 0;">
    <div class="wrap-narrow" style="text-align:center;">
      <h2 style="font-size:22px; font-weight:800; margin:0 0 12px;">[YOUR GUARANTEE HEADLINE]</h2>
      <p style="font-size:15px; line-height:1.7; color:#4b4a63; margin:0;">[Replace this with your real refund/guarantee policy, or delete this whole section if you don't offer one.]</p>
    </div>
  </div>

  <!-- FINAL CTA -->
  <div style="width:100%; background:#14122b; padding:64px 0;">
    <div class="wrap-narrow" style="text-align:center;">
      <a href="#" class="btn" style="background:${accent};">Get Instant Access &rarr;</a>
    </div>
  </div>

  <!-- FOOTER -->
  <div style="width:100%; padding:32px 0;">
    <div class="wrap" style="text-align:center;">
      <p style="color:#9d9caf; font-size:12px; margin:0 0 6px;">Delivered instantly as a digital download after purchase.</p>
      <p style="color:#9d9caf; font-size:12px; margin:0;">&copy; ${year} [YOUR BUSINESS NAME] &middot; [YOUR SUPPORT EMAIL]</p>
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
    <div class="wrap-narrow" style="text-align:center;">
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
