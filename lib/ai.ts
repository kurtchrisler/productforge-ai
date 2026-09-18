import OpenAI from "openai";
import {
  ProductContent,
  ProductTypeId,
  ProductLength,
  PRODUCT_TYPES,
  PRODUCT_LENGTHS,
  resolveSectionCount,
} from "./productTypes";

function getClient(apiKey: string | null | undefined): OpenAI | null {
  // Intentionally does NOT fall back to a server-wide env var: generation
  // always runs on the requesting customer's own OpenAI key, never ours.
  // No key on file for that user -> mock content (see buildMockContent).
  if (!apiKey) return null;
  return new OpenAI({ apiKey });
}

function maxTokensFor(length: ProductLength): number {
  // Generous budgets so long, multi-paragraph JSON output never gets cut off
  // mid-document (a truncated response fails JSON parsing entirely).
  if (length === "long") return 15000;
  if (length === "medium") return 7000;
  return 3500;
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

This needs to read like a real, finished ${meta.label.toLowerCase()} a customer would pay for — specific, concrete, and genuinely useful — never a thin outline, never generic filler, and never placeholder text like "insert example here." Write with real expertise: concrete examples, specific numbers or scenarios where relevant, and actionable advice a reader could follow immediately.

Format requirements:
- Produce exactly ${sectionCount} ${meta.sectionNoun}s (sections). Each one should cover distinct ground — no repeating the same point across sections.
- Each section needs a short punchy "heading" and a "body" written as ${lengthMeta.paragraphCount} full paragraph(s), each paragraph ${lengthMeta.sentenceRange} sentences of substantive, specific content. Separate paragraphs within "body" with a blank line ("\\n\\n").
- Where useful, add a "bullets" array of ${lengthMeta.bulletRange} short actionable bullet points for that section.
${
  meta.worksheetHint
    ? `- Because this is a ${meta.label.toLowerCase()}, most sections should also include a "worksheet" array of 3-6 short fill-in-the-blank prompts or tracking lines the reader will physically write answers next to (e.g. "Today's top priority: ____").`
    : `- Only include a "worksheet" array if genuinely useful; otherwise omit it.`
}
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

function safeParseContent(raw: string): ProductContent {
  let jsonText = raw.trim();
  // Strip markdown code fences if the model added them anyway.
  const fenceMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch) jsonText = fenceMatch[1].trim();

  const parsed = JSON.parse(jsonText);

  if (
    !parsed ||
    typeof parsed.title !== "string" ||
    !Array.isArray(parsed.sections)
  ) {
    throw new Error("AI response was missing required fields.");
  }

  return {
    title: parsed.title,
    subtitle: parsed.subtitle ?? "",
    tagline: parsed.tagline ?? "",
    introduction: parsed.introduction ?? "",
    sections: parsed.sections.map(
      (s: {
        heading?: string;
        body?: string;
        bullets?: string[];
        worksheet?: string[];
      }) => ({
        heading: s.heading ?? "",
        body: s.body ?? "",
        bullets: Array.isArray(s.bullets) ? s.bullets : undefined,
        worksheet: Array.isArray(s.worksheet) ? s.worksheet : undefined,
      })
    ),
    conclusion: parsed.conclusion ?? "",
    callToAction: parsed.callToAction ?? "",
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
      const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
      const completion = await client.chat.completions.create({
        model,
        messages: [
          {
            role: "system",
            content:
              "You generate structured digital-product content and reply with strict JSON only.",
          },
          { role: "user", content: buildPrompt(idea, type, length) },
        ],
        response_format: { type: "json_object" },
        temperature: 0.8,
        max_tokens: maxTokensFor(length),
      });

      const raw = completion.choices[0]?.message?.content;
      if (!raw) throw new Error("Empty response from AI model.");
      return { content: safeParseContent(raw), mode: "ai" };
    } catch (err) {
      // The user supplied their own key, so a failure here is theirs to
      // know about (bad key, no quota, etc.) — don't paper over it with
      // silent mock content, which would look like a real generation.
      console.error("AI generation failed with user-supplied key:", err);
      const message =
        err instanceof Error ? err.message : "AI generation failed.";
      throw new Error(
        `Your OpenAI API key was rejected or the request failed: ${message}. Check your key in Settings.`
      );
    }
  }

  return { content: buildMockContent(idea, type, length), mode: "mock" };
}

// Generates AI cover art for the product using the customer's own OpenAI
// key. Returns the raw PNG bytes, or null if there's no key (demo mode) or
// the image request fails for any reason — a missing cover should never
// fail the whole product generation, so callers just fall back to the
// existing gradient-only cover.
export async function generateCoverImage(
  idea: string,
  type: ProductTypeId,
  content: ProductContent,
  apiKey: string | null | undefined
): Promise<Buffer | null> {
  const client = getClient(apiKey);
  if (!client) return null;

  const meta = PRODUCT_TYPES[type];
  const prompt = `Create a professional, commercial-quality cover illustration for a digital ${meta.label.toLowerCase()} titled "${content.title}".
Subject / theme: ${idea}
${content.tagline ? `Tagline: "${content.tagline}"` : ""}

Style: modern, polished, eye-catching cover art — the kind you'd see on a bestselling ebook, online course, or premium digital guide. Use imagery, color, and composition that fits the topic and feels professional, not generic stock art.

Absolutely no text, words, letters, numbers, or typography anywhere in the image — this is pure background artwork; the real title will be overlaid separately as live text. Keep the lower portion of the image visually calm enough that white text can be legibly placed over it.`;

  try {
    const response = await client.images.generate({
      model: process.env.OPENAI_IMAGE_MODEL || "dall-e-3",
      prompt,
      n: 1,
      size: "1024x1792",
      quality:
        (process.env.OPENAI_IMAGE_QUALITY as "standard" | "hd" | undefined) ||
        "standard",
      style:
        (process.env.OPENAI_IMAGE_STYLE as "vivid" | "natural" | undefined) ||
        "vivid",
      response_format: "b64_json",
    });

    const b64 = response.data?.[0]?.b64_json;
    if (!b64) return null;
    return Buffer.from(b64, "base64");
  } catch (err) {
    console.error("Cover image generation failed (continuing without one):", err);
    return null;
  }
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
  const paragraphTarget = lengthMeta.paragraphCount === "1" ? 1 : lengthMeta.paragraphCount === "2" ? 2 : 3;

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

  const sections = sectionTitles.map((heading, i) => {
    const paragraphs = [
      `This ${meta.sectionNoun} walks through "${heading.toLowerCase()}" as it applies to ${topic}. It breaks the idea down into plain language, gives the reader a clear next action, and connects back to the bigger goal of ${topic}.`,
      `In practice, this means starting small: pick one concrete change related to ${topic}, try it this week, and notice what shifts. The goal isn't perfection — it's steady, visible progress you can build on.`,
      `Revisit this ${meta.sectionNoun} whenever ${topic} starts to feel overwhelming again; the same core idea applies whether you're just starting out or refining something that's already working.`,
    ].slice(0, paragraphTarget);

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
    const bulletCount = lengthMeta.id === "short" ? 3 : lengthMeta.id === "long" ? 7 : 5;

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
