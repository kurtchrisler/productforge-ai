import OpenAI from "openai";
import {
  ProductContent,
  ProductSection,
  ProductTypeId,
  ProductLength,
  PRODUCT_TYPES,
  PRODUCT_LENGTHS,
  resolveSectionCount,
  CoverContentInput,
} from "./productTypes";
import { saveCoverImage } from "./cover";
import { mapWithConcurrency } from "./concurrency";

export function getClient(apiKey: string | null | undefined): OpenAI | null {
  // Intentionally does NOT fall back to a server-wide env var: generation
  // always runs on the requesting customer's own OpenAI key, never ours.
  // No key on file for that user -> mock content (see buildMockContent).
  if (!apiKey) return null;
  return new OpenAI({ apiKey });
}

// At most this many chapter-generation calls run at once for a long-form
// (multiCall) book. High enough to keep wall-clock time reasonable for a
// 100-150 page book (which can be 18-22 chapters), low enough to stay well
// under a typical OpenAI account's burst rate limit.
const CHAPTER_CONCURRENCY = 4;

// Returns the parsed JSON body of a chat completion, or throws a clear,
// customer-facing error. Shared by the single-call path, the outline call,
// and each per-chapter call in the long-form path, so all three fail the
// same way on a cut-off or empty response.
async function callChatJSON(
  client: OpenAI,
  systemPrompt: string,
  userPrompt: string,
  maxTokens: number,
  label: string
): Promise<Record<string, unknown>> {
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
  const completion = await client.chat.completions.create({
    model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    response_format: { type: "json_object" },
    temperature: 0.8,
    max_tokens: maxTokens,
  });

  const choice = completion.choices[0];
  if (choice?.finish_reason === "length") {
    throw new Error(
      `${label} was cut off because it was too long for "${model}"'s output limit.`
    );
  }

  const raw = choice?.message?.content;
  if (!raw) throw new Error(`${label}: empty response from AI model.`);

  let jsonText = raw.trim();
  const fenceMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch) jsonText = fenceMatch[1].trim();

  try {
    return JSON.parse(jsonText);
  } catch {
    throw new Error(`${label}: AI response wasn't valid JSON.`);
  }
}

async function withRetry<T>(fn: () => Promise<T>, retries = 1, delayMs = 1200): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (retries <= 0) throw err;
    await new Promise((r) => setTimeout(r, delayMs));
    return withRetry(fn, retries - 1, delayMs);
  }
}

// Parses a leading integer out of a range string like "4-6" or "9" (used to
// scale the deterministic mock-content generator to the requested tier).
function parseFirstInt(range: string, fallback: number): number {
  const match = range.match(/\d+/);
  return match ? parseInt(match[0], 10) : fallback;
}

const SYSTEM_PROMPT =
  "You generate structured digital-product content and reply with strict JSON only.";

// Shared "how to format a section" rules, reused by both the single-call
// prompt (whole book at once) and the per-chapter prompt (long-form path).
function sectionFormatRules(type: ProductTypeId, length: ProductLength): string {
  const meta = PRODUCT_TYPES[type];
  const lengthMeta = PRODUCT_LENGTHS[length];
  return meta.checklistStyle
    ? `- The "heading" should be short and punchy. The "body" is a brief 1-2 sentence setup for what the checklist covers — this is NOT a prose product, so keep "body" short.
- The real content goes in "bullets": a long array of 8-14 individual, specific, checkable action items — each one a single concrete checklist item the reader can literally check off (short, imperative, no fluff — e.g. "Back up your files before starting" not "It is important to back up your files").`
    : `- The "heading" should be short and punchy. The "body" should be roughly ${lengthMeta.wordTarget} words, written as ${lengthMeta.paragraphCount} full paragraphs (each paragraph ${lengthMeta.sentenceRange} sentences). This is a hard target — a body noticeably shorter than ${lengthMeta.wordTarget} words is not acceptable. Separate paragraphs within "body" with a blank line ("\\n\\n").
- Where useful, add a "bullets" array of ${lengthMeta.bulletRange} short actionable bullet points.${
        meta.worksheetHint
          ? ` Also include a "worksheet" array of 3-6 short fill-in-the-blank prompts or tracking lines the reader will physically write answers next to (e.g. "Today's top priority: ____").`
          : ""
      }`;
}

function buildPrompt(
  idea: string,
  type: ProductTypeId,
  length: ProductLength
): string {
  const meta = PRODUCT_TYPES[type];
  const lengthMeta = PRODUCT_LENGTHS[length];
  const sectionCount = resolveSectionCount(type, length);

  return `You are a senior digital-product creator and professional nonfiction writer. Generate the FULL, complete, publication-ready content for a ${meta.label.toLowerCase()} based on this idea from the customer:

"""
${idea}
"""

This needs to read like a real, finished ${meta.label.toLowerCase()} a customer would pay for — specific, concrete, and genuinely useful — never a thin outline, never generic filler, and never placeholder text like "insert example here." Write with real expertise: concrete examples, specific numbers, scenarios, mini case-studies, or step-by-step detail wherever relevant. Do not pad with repetition — every sentence should add new information.

Format requirements:
- Produce exactly ${sectionCount} ${meta.sectionNoun}s (sections). Each one should cover distinct ground — no repeating the same point across sections.
${sectionFormatRules(type, length)}
- Write a compelling "title", a one-line "subtitle", a short punchy "tagline" for the cover, a substantive "introduction" (${lengthMeta.introSentenceRange} sentences) that sets up exactly what the reader will get and why it matters, a "conclusion" (${lengthMeta.introSentenceRange} sentences) that ties it together, and a short "callToAction" encouraging the reader to take the next step.

Respond with ONLY a single JSON object with this exact shape, no markdown fences, no commentary:
{
  "title": string,
  "subtitle": string,
  "tagline": string,
  "introduction": string,
  "sections": [ { "heading": string, "body": string, "bullets": string[]?, "worksheet": string[]? } ],
  "conclusion": string,
  "callToAction": string
}`;
}

function parseSection(s: {
  heading?: string;
  body?: string;
  bullets?: string[];
  worksheet?: string[];
}): ProductSection {
  return {
    heading: s.heading ?? "",
    body: s.body ?? "",
    bullets: Array.isArray(s.bullets) ? s.bullets : undefined,
    worksheet: Array.isArray(s.worksheet) ? s.worksheet : undefined,
  };
}

function safeParseContent(parsed: Record<string, unknown>): ProductContent {
  if (typeof parsed.title !== "string" || !Array.isArray(parsed.sections)) {
    throw new Error("AI response was missing required fields.");
  }
  return {
    title: parsed.title,
    subtitle: typeof parsed.subtitle === "string" ? parsed.subtitle : "",
    tagline: typeof parsed.tagline === "string" ? parsed.tagline : "",
    introduction:
      typeof parsed.introduction === "string" ? parsed.introduction : "",
    sections: (parsed.sections as Parameters<typeof parseSection>[0][]).map(parseSection),
    conclusion: typeof parsed.conclusion === "string" ? parsed.conclusion : "",
    callToAction:
      typeof parsed.callToAction === "string" ? parsed.callToAction : "",
  };
}

async function generateSingleCallContent(
  client: OpenAI,
  idea: string,
  type: ProductTypeId,
  length: ProductLength
): Promise<ProductContent> {
  const lengthMeta = PRODUCT_LENGTHS[length];
  const parsed = await callChatJSON(
    client,
    SYSTEM_PROMPT,
    buildPrompt(idea, type, length),
    lengthMeta.maxTokens,
    "The response"
  );
  return safeParseContent(parsed);
}

// ---- Long-form (multi-call, chapter-by-chapter) generation ----
//
// A single chat completion tops out around 16k output tokens (~11-12k
// words once JSON/heading/bullet overhead is accounted for) — nowhere near
// enough for a genuine 50-150 page book. So above that ceiling, generation
// happens in two passes instead of one call: first a cheap "outline" call
// that plans the book (title/intro/conclusion + one heading+synopsis per
// chapter, so chapters don't repeat each other's ground), then one AI call
// PER CHAPTER to write that chapter's full body — batched with limited
// concurrency (see CHAPTER_CONCURRENCY) so a 150-page book doesn't fire 20+
// requests at once, and retried once per chapter before failing the whole
// generation.

type OutlineChapter = { heading: string; synopsis: string };
type Outline = {
  title: string;
  subtitle: string;
  tagline: string;
  introduction: string;
  conclusion: string;
  callToAction: string;
  chapters: OutlineChapter[];
};

function buildOutlinePrompt(
  idea: string,
  type: ProductTypeId,
  length: ProductLength,
  sectionCount: number
): string {
  const meta = PRODUCT_TYPES[type];
  const lengthMeta = PRODUCT_LENGTHS[length];

  return `You are a senior digital-product creator and professional nonfiction writer, planning the outline for a ${meta.label.toLowerCase()} based on this idea from the customer:

"""
${idea}
"""

This is the FIRST step of a two-step process — you are writing the outline only, not the full content. Each ${meta.sectionNoun} will be written separately afterward using the "synopsis" you provide here, so make each synopsis specific enough to guide that writing and make sure no two ${meta.sectionNoun}s cover the same ground — this is a real, in-depth, ${lengthMeta.targetPages}-page book, so the ${sectionCount} ${meta.sectionNoun}s need to build on each other and cover meaningfully distinct territory, not overlapping generalities.

Respond with ONLY a single JSON object with this exact shape, no markdown fences, no commentary:
{
  "title": string,
  "subtitle": string,
  "tagline": string,
  "introduction": string (${lengthMeta.introSentenceRange} sentences, sets up exactly what the reader will get and why it matters),
  "chapters": [ { "heading": string, "synopsis": string (2-4 sentences describing specifically what this ${meta.sectionNoun} will cover and what makes it distinct from the others) } ] (exactly ${sectionCount} entries),
  "conclusion": string (${lengthMeta.introSentenceRange} sentences, ties the whole book together),
  "callToAction": string (short, encourages the reader to take the next step)
}`;
}

function parseOutline(parsed: Record<string, unknown>, expectedCount: number): Outline {
  if (
    typeof parsed.title !== "string" ||
    !Array.isArray(parsed.chapters) ||
    parsed.chapters.length === 0
  ) {
    throw new Error("Outline response was missing required fields.");
  }
  const chapters = (parsed.chapters as { heading?: string; synopsis?: string }[])
    .slice(0, expectedCount)
    .map((c) => ({
      heading: c.heading ?? "",
      synopsis: c.synopsis ?? "",
    }));
  return {
    title: parsed.title,
    subtitle: typeof parsed.subtitle === "string" ? parsed.subtitle : "",
    tagline: typeof parsed.tagline === "string" ? parsed.tagline : "",
    introduction:
      typeof parsed.introduction === "string" ? parsed.introduction : "",
    conclusion: typeof parsed.conclusion === "string" ? parsed.conclusion : "",
    callToAction:
      typeof parsed.callToAction === "string" ? parsed.callToAction : "",
    chapters,
  };
}

function buildChapterPrompt(
  idea: string,
  type: ProductTypeId,
  length: ProductLength,
  bookTitle: string,
  chapter: OutlineChapter,
  chapterIndex: number,
  totalChapters: number
): string {
  const meta = PRODUCT_TYPES[type];

  return `You are a senior digital-product creator and professional nonfiction writer, writing ONE ${meta.sectionNoun} of a ${meta.label.toLowerCase()} called "${bookTitle}", based on this idea from the customer:

"""
${idea}
"""

This is ${meta.sectionNoun} ${chapterIndex + 1} of ${totalChapters}, titled "${chapter.heading}". Here is what this ${meta.sectionNoun} needs to cover: ${chapter.synopsis}

Write ONLY this ${meta.sectionNoun} in full. It needs to read like part of a real, finished ${meta.label.toLowerCase()} a customer would pay for — specific, concrete, and genuinely useful — never a thin outline, never generic filler, and never placeholder text like "insert example here." Write with real expertise: concrete examples, specific numbers, scenarios, mini case-studies, or step-by-step detail wherever relevant. Do not pad with repetition — every sentence should add new information. Do not repeat ground already covered by other ${meta.sectionNoun}s in this book — stay focused on what was described above.

Format requirements:
${sectionFormatRules(type, length)}

Respond with ONLY a single JSON object with this exact shape, no markdown fences, no commentary:
{ "body": string, "bullets": string[]?, "worksheet": string[]? }`;
}

async function generateLongFormContent(
  client: OpenAI,
  idea: string,
  type: ProductTypeId,
  length: ProductLength
): Promise<ProductContent> {
  const sectionCount = resolveSectionCount(type, length);

  const outlineParsed = await callChatJSON(
    client,
    SYSTEM_PROMPT,
    buildOutlinePrompt(idea, type, length, sectionCount),
    4000,
    "The outline"
  );
  const outline = parseOutline(outlineParsed, sectionCount);
  const lengthMeta = PRODUCT_LENGTHS[length];

  const sections = await mapWithConcurrency(
    outline.chapters,
    CHAPTER_CONCURRENCY,
    async (chapter, i) => {
      try {
        const parsed = await withRetry(() =>
          callChatJSON(
            client,
            SYSTEM_PROMPT,
            buildChapterPrompt(idea, type, length, outline.title, chapter, i, outline.chapters.length),
            lengthMeta.chapterMaxTokens,
            `Chapter ${i + 1}`
          )
        );
        return parseSection({
          heading: chapter.heading,
          body: typeof parsed.body === "string" ? parsed.body : "",
          bullets: Array.isArray(parsed.bullets) ? (parsed.bullets as string[]) : undefined,
          worksheet: Array.isArray(parsed.worksheet) ? (parsed.worksheet as string[]) : undefined,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : "generation failed";
        throw new Error(`Chapter ${i + 1} ("${chapter.heading}"): ${message}`);
      }
    }
  );

  return {
    title: outline.title,
    subtitle: outline.subtitle,
    tagline: outline.tagline,
    introduction: outline.introduction,
    sections,
    conclusion: outline.conclusion,
    callToAction: outline.callToAction,
  };
}

export async function generateProductContent(
  idea: string,
  type: ProductTypeId,
  length: ProductLength,
  apiKey: string | null | undefined
): Promise<{ content: ProductContent; mode: "ai" | "mock" }> {
  const client = getClient(apiKey);

  if (client) {
    try {
      const lengthMeta = PRODUCT_LENGTHS[length];
      const content = lengthMeta.multiCall
        ? await generateLongFormContent(client, idea, type, length)
        : await generateSingleCallContent(client, idea, type, length);
      return { content, mode: "ai" };
    } catch (err) {
      // The user supplied their own key, so a failure here is theirs to
      // know about (bad key, no quota, cut-off response, a failed chapter,
      // etc.) — don't paper over it with silent mock content, which would
      // look like a real generation.
      console.error("AI generation failed with user-supplied key:", err);
      const message =
        err instanceof Error ? err.message : "AI generation failed.";
      throw new Error(
        message.includes("cut off") || message.startsWith("Chapter ")
          ? message
          : `Your OpenAI API key was rejected or the request failed: ${message}. Check your key in Settings.`
      );
    }
  }

  return { content: buildMockContent(idea, type, length), mode: "mock" };
}

function isGptImageModel(model: string): boolean {
  return model.startsWith("gpt-image");
}

// Generates AI cover art for the product using the customer's own OpenAI
// key, with the title/subtitle/callouts baked directly into the image (not
// overlaid afterward) — matching a real commercial digital-product cover.
// Returns the raw PNG bytes on success, or an error message on failure. A
// missing cover should never fail the whole product generation — callers
// fall back to the plain gradient cover and can offer a "regenerate" retry.
export async function generateCoverImage(
  idea: string,
  type: ProductTypeId,
  content: CoverContentInput,
  apiKey: string | null | undefined
): Promise<{ buffer: Buffer } | { error: string }> {
  const client = getClient(apiKey);
  if (!client) return { error: "No OpenAI API key on file." };

  const meta = PRODUCT_TYPES[type];
  const model = process.env.OPENAI_IMAGE_MODEL || "gpt-image-1";
  const gptImage = isGptImageModel(model);

  const prompt = `Design a bold, professional, high-converting DIGITAL PRODUCT COVER for a ${meta.label.toLowerCase()} called "${content.title}"${content.subtitle ? ` — "${content.subtitle}"` : ""}.

This must be a complete, finished graphic-design cover with ALL text rendered directly in the artwork itself — like the front cover of a bestselling ebook, online course, or premium digital guide sold on a marketplace. Do not leave space for text to be added later; render it now, as part of the image.

Required elements, all baked into the artwork:
- A dramatic, high-quality photo-realistic or illustrated hero image directly related to: ${idea}
- The main title "${content.title}" rendered in large, bold, stacked, professional sans-serif typography — a mix of white and one bright accent color to emphasize key words. The title must dominate the composition and be perfectly legible, correctly spelled, and exactly as written above.
${content.tagline ? `- A short tagline rendered near the top or bottom: "${content.tagline}"` : ""}
- A row of 3 small icon + short-label callouts relevant to the topic (simple flat icons with a 1-2 word label under each, arranged neatly in a row)
- A colored accent banner or bar (top or bottom) containing a short supporting line of real, relevant text
- Color palette: a dark, moody background with one vivid accent color (gold, orange, teal, or red) for energy and contrast
- Composition: sharp typography, clean icon work, a well-balanced professional layout — the kind of cover that performs well on a top-selling digital product listing

Do not include any watermark, logo, placeholder text, or "Lorem Ipsum" — every word of text in the image must be real, correctly spelled, and relevant to the topic.`;

  try {
    type GenerateParams = OpenAI.Images.ImageGenerateParamsNonStreaming;
    const params: GenerateParams = {
      model,
      prompt,
      n: 1,
      size: gptImage ? "1024x1536" : "1024x1792",
      // GPT image models always return b64_json and don't support
      // response_format/style — only dall-e-3 does.
      ...(gptImage
        ? {
            quality:
              (process.env.OPENAI_IMAGE_QUALITY as GenerateParams["quality"]) ||
              "high", // low | medium | high | auto
          }
        : {
            response_format: "b64_json" as const,
            quality:
              (process.env.OPENAI_IMAGE_QUALITY as GenerateParams["quality"]) ||
              "standard", // standard | hd
            style:
              (process.env.OPENAI_IMAGE_STYLE as GenerateParams["style"]) ||
              "vivid", // vivid | natural
          }),
    };

    const response = await client.images.generate(params);

    const b64 = response.data?.[0]?.b64_json;
    if (!b64) return { error: "No image was returned by the model." };
    return { buffer: Buffer.from(b64, "base64") };
  } catch (err) {
    console.error("Cover image generation failed:", err);
    const message = err instanceof Error ? err.message : "Image generation failed.";
    // gpt-image-1 requires the OpenAI org to complete identity verification —
    // a very common first-run failure — so call that out specifically.
    if (/organization.*verif|verify.*organization/i.test(message)) {
      return {
        error:
          "Your OpenAI organization needs to complete identity verification before it can use gpt-image-1 (see platform.openai.com/settings/organization/general).",
      };
    }
    return { error: message };
  }
}

// Generates cover art and saves it to disk in one step — used by both the
// initial generate route and the standalone "regenerate cover" route.
export async function generateAndSaveCover(
  idea: string,
  type: ProductTypeId,
  content: CoverContentInput,
  apiKey: string | null | undefined,
  productId: number
): Promise<{ path: string | null; error: string | null }> {
  const result = await generateCoverImage(idea, type, content, apiKey);
  if ("error" in result) {
    return { path: null, error: result.error };
  }
  const path = saveCoverImage(result.buffer, productId);
  return { path, error: null };
}

// Deterministic, no-API-key-required generator so the product is fully
// demo-able before anyone wires up an OpenAI key.
function buildMockContent(
  idea: string,
  type: ProductTypeId,
  length: ProductLength
): ProductContent {
  const meta = PRODUCT_TYPES[type];
  const lengthMeta = PRODUCT_LENGTHS[length];
  const sectionCount = resolveSectionCount(type, length);
  const topic = idea.trim() || "your idea";
  const capitalized = topic.charAt(0).toUpperCase() + topic.slice(1);
  // The demo paragraph/bullet pools below only have 5-8 unique entries, so
  // this caps out gracefully via .slice() even for the biggest tiers —
  // mock content is just a functional placeholder, not meant to actually
  // hit the real word-count target the way AI-generated content does.
  const paragraphTarget = parseFirstInt(lengthMeta.paragraphCount, 3);

  const titlePool = [
    "Getting clear on the goal",
    "Laying the foundation",
    "Building momentum",
    "Avoiding common mistakes",
    "Leveling up",
    "Making it stick",
    "Putting it into practice",
    "Handling setbacks",
    "Measuring progress",
    "Getting others on board",
    "Refining your approach",
    "Planning the next chapter",
  ];
  const sectionTitles = Array.from({ length: sectionCount }, (_, i) =>
    titlePool[i] ?? `Going deeper, part ${i + 1 - titlePool.length}`
  );

  const paragraphPool = [
    `This ${meta.sectionNoun} walks through "%h%" as it applies to ${topic}. It breaks the idea down into plain language, gives the reader a clear next action, and connects back to the bigger goal of ${topic}.`,
    `In practice, this means starting small: pick one concrete change related to ${topic}, try it this week, and notice what shifts. The goal isn't perfection — it's steady, visible progress you can build on.`,
    `Revisit this ${meta.sectionNoun} whenever ${topic} starts to feel overwhelming again; the same core idea applies whether you're just starting out or refining something that's already working.`,
    `Think of this as a checkpoint, not a finish line — come back to it after you've tried a few things and see what's actually changed for you with ${topic}.`,
    `The people who get the most out of this ${meta.sectionNoun} are the ones who write things down as they go, rather than trying to hold it all in their head.`,
  ];

  const sections = sectionTitles.map((heading, i) => {
    const paragraphs = paragraphPool
      .slice(0, paragraphTarget)
      .map((p) => p.replace("%h%", heading.toLowerCase()));

    const bulletPool = [
      `Identify where you are today with ${topic}`,
      `Pick one small action to take this week`,
      `Track the result and adjust`,
      `Write down what surprised you`,
      `Share your progress with someone else`,
      `Set a reminder to revisit this in a week`,
      `Note one thing you'd do differently next time`,
      `Ask someone you trust for honest feedback`,
    ];
    const bulletCount = parseFirstInt(lengthMeta.bulletRange, 5);

    return {
      heading: `${meta.sectionNoun.charAt(0).toUpperCase() + meta.sectionNoun.slice(1)} ${
        i + 1
      }: ${heading}`,
      body: paragraphs.join("\n\n"),
      bullets: bulletPool.slice(0, bulletCount),
      worksheet: meta.worksheetHint
        ? [
            "My goal for this section: ____________________",
            "One obstacle I expect: ____________________",
            "By when will I complete this: ____________________",
          ]
        : undefined,
    };
  });

  return {
    title: `${capitalized}: The Complete ${meta.label}`,
    subtitle: `A practical ${meta.label.toLowerCase()} to help you go from idea to result with ${topic}.`,
    tagline: `Everything you need to get started with ${topic}, in one place.`,
    introduction: `Welcome! This ${meta.label.toLowerCase()} was built around one idea: ${topic}. Instead of overwhelming you with theory, each ${meta.sectionNoun} gives you something concrete to do next. This is demo content generated without an OpenAI key connected — add your own key in Settings to generate real, in-depth, idea-specific content (and AI cover art) instead.`,
    sections,
    conclusion: `You now have a complete path through ${topic}. Revisit any ${meta.sectionNoun} whenever you need a refresher, and keep taking the next small step.`,
    callToAction: `Ready for more? Turn your next idea into a ${meta.label.toLowerCase()} in minutes.`,
  };
}
