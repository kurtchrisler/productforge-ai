import { ColoringBookContent, ColoringPageSpec } from "./productTypes";
import { getClient } from "./ai";

function buildColoringPrompt(
  idea: string,
  instructions: string,
  pageCount: number
): string {
  return `You are planning a ${pageCount}-page black-and-white line-art coloring book on this theme:

"""
${idea}
"""
${
  instructions
    ? `\nAdditional instructions from the customer: """${instructions}"""\n`
    : ""
}
Generate exactly ${pageCount} distinct coloring pages. Each page needs its own single clear subject or scene so the book doesn't repeat itself — vary the objects, poses, and compositions across pages while staying on-theme.

For each page provide:
- "caption": a short 2-6 word title for the page (e.g. "Sleepy Fox Under the Moon")
- "prompt": one or two sentences describing exactly what the illustration should show — specific enough for an artist to draw, with a single clear focal subject well suited to a coloring-book page (avoid tiny background clutter that would be impossible to color in).

Also write an overall "title", one-line "subtitle", and short "tagline" for the book's cover.

Respond with ONLY a single JSON object, no markdown fences, no commentary, in this exact shape:
{
  "title": string,
  "subtitle": string,
  "tagline": string,
  "pages": [ { "caption": string, "prompt": string } ]
}`;
}

function safeParseColoringContent(
  raw: string,
  expectedCount: number
): ColoringBookContent {
  let jsonText = raw.trim();
  const fenceMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch) jsonText = fenceMatch[1].trim();

  const parsed = JSON.parse(jsonText);
  if (!parsed || !Array.isArray(parsed.pages) || parsed.pages.length === 0) {
    throw new Error("AI response was missing required fields.");
  }

  const pages: ColoringPageSpec[] = parsed.pages
    .slice(0, expectedCount)
    .map((p: { caption?: string; prompt?: string }) => ({
      caption: typeof p?.caption === "string" ? p.caption : "",
      prompt: typeof p?.prompt === "string" ? p.prompt : "",
    }))
    .filter((p: ColoringPageSpec) => p.prompt.trim().length > 0);

  if (pages.length === 0) {
    throw new Error("AI response didn't include any usable coloring pages.");
  }

  return {
    title: typeof parsed.title === "string" ? parsed.title : "Coloring Book",
    subtitle: typeof parsed.subtitle === "string" ? parsed.subtitle : "",
    tagline: typeof parsed.tagline === "string" ? parsed.tagline : "",
    pages,
  };
}

export async function generateColoringBookContent(
  idea: string,
  instructions: string,
  pageCount: number,
  apiKey: string | null | undefined
): Promise<{ content: ColoringBookContent; mode: "ai" | "mock" }> {
  const client = getClient(apiKey);

  if (client) {
    try {
      const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
      const maxTokens = Math.min(16000, 1200 + pageCount * 90);

      const completion = await client.chat.completions.create({
        model,
        messages: [
          {
            role: "system",
            content:
              "You generate structured coloring-book page plans and reply with strict JSON only.",
          },
          { role: "user", content: buildColoringPrompt(idea, instructions, pageCount) },
        ],
        response_format: { type: "json_object" },
        temperature: 0.85,
        max_tokens: maxTokens,
      });

      const choice = completion.choices[0];
      if (choice?.finish_reason === "length") {
        throw new Error(
          `The response was cut off because it was too long for "${model}"'s output limit. Try a shorter Length.`
        );
      }

      const raw = choice?.message?.content;
      if (!raw) throw new Error("Empty response from AI model.");
      return { content: safeParseColoringContent(raw, pageCount), mode: "ai" };
    } catch (err) {
      console.error("Coloring book content generation failed with user-supplied key:", err);
      const message = err instanceof Error ? err.message : "AI generation failed.";
      throw new Error(
        message.includes("cut off")
          ? message
          : `Your OpenAI API key was rejected or the request failed: ${message}. Check your key in Settings.`
      );
    }
  }

  return {
    content: buildMockColoringContent(idea, pageCount),
    mode: "mock",
  };
}

// Deterministic, no-API-key-required fallback so coloring-book products are
// demo-able before anyone wires up an OpenAI key. No images are generated in
// mock mode (see generateAndSaveColoringPages) — the renderer shows each
// page's caption/prompt in a placeholder box instead.
function buildMockColoringContent(idea: string, pageCount: number): ColoringBookContent {
  const topic = idea.trim() || "your theme";
  const capitalized = topic.charAt(0).toUpperCase() + topic.slice(1);

  const subjectPool = [
    "A friendly character taking center stage",
    "A close-up of a favorite detail",
    "A playful scene with two friends",
    "A big, bold single object filling the page",
    "A cozy indoor moment",
    "An outdoor adventure scene",
    "A pattern made from simple repeated shapes",
    "A celebration or party scene",
    "A quiet nighttime scene",
    "A sunny daytime scene",
  ];

  const pages: ColoringPageSpec[] = Array.from({ length: pageCount }, (_, i) => {
    const subject = subjectPool[i % subjectPool.length];
    return {
      caption: `Page ${i + 1}: ${capitalized}`,
      prompt: `${subject}, related to ${topic}, drawn as simple bold black-and-white line art.`,
    };
  });

  return {
    title: `${capitalized}: The Coloring Book`,
    subtitle: `${pageCount} original coloring pages built around ${topic}.`,
    tagline:
      "Demo content — add your OpenAI key in Settings to generate real, topic-specific illustrations.",
    pages,
  };
}
