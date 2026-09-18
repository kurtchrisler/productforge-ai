import OpenAI from "openai";
import {
  ProductContent,
  ProductTypeId,
  PRODUCT_TYPES,
} from "./productTypes";

function getClient(apiKey: string | null | undefined): OpenAI | null {
  // Intentionally does NOT fall back to a server-wide env var: generation
  // always runs on the requesting customer's own OpenAI key, never ours.
  // No key on file for that user -> mock content (see buildMockContent).
  if (!apiKey) return null;
  return new OpenAI({ apiKey });
}

function buildPrompt(idea: string, type: ProductTypeId): string {
  const meta = PRODUCT_TYPES[type];
  return `You are a senior digital-product creator. Generate the full content for a ${meta.label.toLowerCase()} based on this idea from the customer:

"""
${idea}
"""

Format requirements:
- Produce ${meta.sectionCountHint} ${meta.sectionNoun}s (sections).
- Each section needs a short punchy "heading" and a "body" of 2-4 sentences of real, useful, specific content (no filler, no placeholders like "insert example here").
- Where useful, add a "bullets" array of 3-6 short actionable bullet points for that section.
${
  meta.worksheetHint
    ? `- Because this is a ${meta.label.toLowerCase()}, most sections should also include a "worksheet" array of 3-6 short fill-in-the-blank prompts or tracking lines the reader will physically write answers next to (e.g. "Today's top priority: ____").`
    : `- Only include a "worksheet" array if genuinely useful; otherwise omit it.`
}
- Write a compelling "title", a one-line "subtitle", a short punchy "tagline" for the cover, a 2-3 sentence "introduction", a 2-3 sentence "conclusion", and a short "callToAction" encouraging the reader to take the next step.

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
          { role: "user", content: buildPrompt(idea, type) },
        ],
        response_format: { type: "json_object" },
        temperature: 0.8,
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

  return { content: buildMockContent(idea, type), mode: "mock" };
}

// Deterministic, no-API-key-required generator so the product is fully
// demo-able before anyone wires up an OPENAI_API_KEY.
function buildMockContent(
  idea: string,
  type: ProductTypeId
): ProductContent {
  const meta = PRODUCT_TYPES[type];
  const topic = idea.trim() || "your idea";
  const capitalized = topic.charAt(0).toUpperCase() + topic.slice(1);

  const sectionTitles = [
    "Getting clear on the goal",
    "Laying the foundation",
    "Building momentum",
    "Avoiding common mistakes",
    "Leveling up",
    "Making it stick",
    "Putting it into practice",
  ].slice(0, meta.sectionCountHint);

  const sections = sectionTitles.map((heading, i) => ({
    heading: `${meta.sectionNoun.charAt(0).toUpperCase() + meta.sectionNoun.slice(1)} ${
      i + 1
    }: ${heading}`,
    body: `This ${meta.sectionNoun} walks through "${heading.toLowerCase()}" as it applies to ${topic}. It breaks the idea down into plain language, gives the reader a clear next action, and connects back to the bigger goal of ${topic}.`,
    bullets: [
      `Identify where you are today with ${topic}`,
      `Pick one small action to take this week`,
      `Track the result and adjust`,
    ],
    worksheet: meta.worksheetHint
      ? [
          "My goal for this section: ____________________",
          "One obstacle I expect: ____________________",
          "By when will I complete this: ____________________",
        ]
      : undefined,
  }));

  return {
    title: `${capitalized}: The Complete ${meta.label}`,
    subtitle: `A practical ${meta.label.toLowerCase()} to help you go from idea to result with ${topic}.`,
    tagline: `Everything you need to get started with ${topic}, in one place.`,
    introduction: `Welcome! This ${meta.label.toLowerCase()} was built around one idea: ${topic}. Instead of overwhelming you with theory, each ${meta.sectionNoun} gives you something concrete to do next. This is demo content generated without an AI key connected — plug in OPENAI_API_KEY to generate real, idea-specific content instead.`,
    sections,
    conclusion: `You now have a complete path through ${topic}. Revisit any ${meta.sectionNoun} whenever you need a refresher, and keep taking the next small step.`,
    callToAction: `Ready for more? Turn your next idea into a ${meta.label.toLowerCase()} in minutes.`,
  };
}
