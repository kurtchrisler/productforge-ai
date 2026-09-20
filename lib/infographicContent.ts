import { InfographicContent } from "./productTypes";
import { getClient } from "./ai";

function buildInfographicPrompt(idea: string, instructions: string): string {
  return `You are creating the content for a single-page shareable infographic on this topic:

"""
${idea}
"""
${
  instructions.trim()
    ? `\nThe customer's specific instructions for this infographic:\n"""\n${instructions.trim()}\n"""\n`
    : ""
}
Produce real, accurate, specific content — concrete numbers, facts, or steps, never generic filler or placeholder text like "Lorem Ipsum" or "insert stat here". If exact statistics aren't verifiable, use realistic, clearly-labeled illustrative figures rather than inventing fake precise citations.

Format requirements:
- A short, punchy "title" (under 8 words) and a one-line "subtitle".
- Exactly 3 to 4 "stats": short standout numbers/figures (the "value", e.g. "73%", "10x", "5 Steps") each with a brief "label" explaining it (under 8 words).
- 4 to 6 "points": short, scannable takeaways or steps (under 14 words each) — the meat of the infographic.
- A short one-line "footerNote" (e.g. a source note, a call to action, or a summary line).

Respond with ONLY a single JSON object, no markdown fences, no commentary, in this exact shape:
{
  "title": string,
  "subtitle": string,
  "stats": [ { "value": string, "label": string } ],
  "points": string[],
  "footerNote": string
}`;
}

function safeParseInfographicContent(raw: string): InfographicContent {
  let jsonText = raw.trim();
  const fenceMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch) jsonText = fenceMatch[1].trim();

  const parsed = JSON.parse(jsonText);
  if (!parsed || typeof parsed.title !== "string") {
    throw new Error("AI response was missing required fields.");
  }

  return {
    title: parsed.title,
    subtitle: typeof parsed.subtitle === "string" ? parsed.subtitle : "",
    stats: Array.isArray(parsed.stats)
      ? parsed.stats
          .map((s: { value?: string; label?: string }) => ({
            value: typeof s?.value === "string" ? s.value : "",
            label: typeof s?.label === "string" ? s.label : "",
          }))
          .filter((s: { value: string; label: string }) => s.value && s.label)
          .slice(0, 4)
      : [],
    points: Array.isArray(parsed.points)
      ? parsed.points
          .filter((p: unknown): p is string => typeof p === "string" && p.trim().length > 0)
          .slice(0, 6)
      : [],
    footerNote: typeof parsed.footerNote === "string" ? parsed.footerNote : "",
  };
}

export async function generateInfographicContent(
  idea: string,
  instructions: string,
  apiKey: string | null | undefined
): Promise<{ content: InfographicContent; mode: "ai" | "mock" }> {
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
              "You generate structured infographic content and reply with strict JSON only.",
          },
          { role: "user", content: buildInfographicPrompt(idea, instructions) },
        ],
        response_format: { type: "json_object" },
        temperature: 0.8,
        max_tokens: 2000,
      });

      const choice = completion.choices[0];
      if (choice?.finish_reason === "length") {
        throw new Error(
          `The response was cut off because it was too long for "${model}"'s output limit.`
        );
      }

      const raw = choice?.message?.content;
      if (!raw) throw new Error("Empty response from AI model.");
      return { content: safeParseInfographicContent(raw), mode: "ai" };
    } catch (err) {
      console.error("Infographic content generation failed with user-supplied key:", err);
      const message = err instanceof Error ? err.message : "AI generation failed.";
      throw new Error(
        message.includes("cut off")
          ? message
          : `Your OpenAI API key was rejected or the request failed: ${message}. Check your key in Settings.`
      );
    }
  }

  return { content: buildMockInfographicContent(idea), mode: "mock" };
}

function buildMockInfographicContent(idea: string): InfographicContent {
  const topic = idea.trim() || "your topic";
  const capitalized = topic.charAt(0).toUpperCase() + topic.slice(1);

  return {
    title: `${capitalized}: At a Glance`,
    subtitle: `Key facts and takeaways about ${topic}.`,
    stats: [
      { value: "4", label: "key takeaways below" },
      { value: "100%", label: "focused on your topic" },
      { value: "1", label: "page, ready to share" },
    ],
    points: [
      `Understand the core idea behind ${topic}.`,
      `Identify the first concrete step to take.`,
      `Avoid the most common mistake people make.`,
      `Track progress with one simple metric.`,
    ],
    footerNote:
      "Demo content — add your OpenAI key in Settings to generate a real, topic-specific infographic.",
  };
}
