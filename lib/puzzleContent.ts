import {
  PuzzleBookContent,
  PuzzleSet,
  PuzzleEntry,
  ProductDifficulty,
  PUZZLE_DIFFICULTIES,
} from "./productTypes";
import { getClient } from "./ai";

type PuzzleProductType = "crossword" | "word_search";

function wordCountFor(type: PuzzleProductType, difficulty: ProductDifficulty): number {
  const meta = PUZZLE_DIFFICULTIES[difficulty];
  return type === "crossword" ? meta.crosswordWordCount : meta.wordSearchWordCount;
}

function buildPuzzlePrompt(
  idea: string,
  type: PuzzleProductType,
  difficulty: ProductDifficulty,
  puzzleCount: number
): string {
  const wordCount = wordCountFor(type, difficulty);
  const label = type === "crossword" ? "crossword puzzle" : "word search puzzle";

  return `You are creating the word lists for a ${puzzleCount}-puzzle ${label} ebook on this topic:

"""
${idea}
"""

Generate exactly ${puzzleCount} distinct puzzles, each covering a different sub-theme within the topic so the ebook doesn't repeat itself. For each puzzle, produce exactly ${wordCount} entries.

Each entry needs:
- "answer": a SINGLE word only — letters only, no spaces, hyphens, or punctuation — between 3 and 12 letters long, genuinely relevant to that puzzle's sub-theme. No duplicate answers within the same puzzle.
${
  type === "crossword"
    ? `- "clue": a short, clear crossword-style clue for that word (do not simply restate the word itself).`
    : `- "clue": a short one-line note about the word (not shown to the solver, but keep it accurate and on-topic).`
}

Also write an overall "title", one-line "subtitle", and short "tagline" for the ebook's cover, plus a short "subtitle" for each individual puzzle describing its sub-theme (e.g. "Puzzle 3: Kitchen Essentials").

Respond with ONLY a single JSON object, no markdown fences, no commentary, in this exact shape:
{
  "title": string,
  "subtitle": string,
  "tagline": string,
  "puzzles": [
    { "subtitle": string, "entries": [ { "answer": string, "clue": string } ] }
  ]
}`;
}

function safeParsePuzzleContent(raw: string): PuzzleBookContent {
  let jsonText = raw.trim();
  const fenceMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch) jsonText = fenceMatch[1].trim();

  const parsed = JSON.parse(jsonText);
  if (!parsed || !Array.isArray(parsed.puzzles) || parsed.puzzles.length === 0) {
    throw new Error("AI response was missing required fields.");
  }

  const puzzles: PuzzleSet[] = parsed.puzzles
    .map((p: { subtitle?: string; entries?: { answer?: string; clue?: string }[] }) => ({
      subtitle: typeof p?.subtitle === "string" ? p.subtitle : "",
      entries: Array.isArray(p?.entries)
        ? p.entries
            .map((e) => ({
              answer: typeof e?.answer === "string" ? e.answer : "",
              clue: typeof e?.clue === "string" ? e.clue : "",
            }))
            .filter((e: PuzzleEntry) => e.answer.trim().length >= 3)
        : [],
    }))
    .filter((p: PuzzleSet) => p.entries.length >= 3);

  if (puzzles.length === 0) {
    throw new Error("AI response didn't include any usable puzzle words.");
  }

  return {
    title: typeof parsed.title === "string" ? parsed.title : "Puzzle Book",
    subtitle: typeof parsed.subtitle === "string" ? parsed.subtitle : "",
    tagline: typeof parsed.tagline === "string" ? parsed.tagline : "",
    puzzles,
  };
}

export async function generatePuzzleContent(
  idea: string,
  type: PuzzleProductType,
  difficulty: ProductDifficulty,
  puzzleCount: number,
  apiKey: string | null | undefined
): Promise<{ content: PuzzleBookContent; mode: "ai" | "mock" }> {
  const client = getClient(apiKey);

  if (client) {
    try {
      const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
      const wordCount = wordCountFor(type, difficulty);
      const maxTokens = Math.min(16000, 2000 + puzzleCount * wordCount * 40);

      const completion = await client.chat.completions.create({
        model,
        messages: [
          {
            role: "system",
            content:
              "You generate structured word-puzzle content and reply with strict JSON only.",
          },
          { role: "user", content: buildPuzzlePrompt(idea, type, difficulty, puzzleCount) },
        ],
        response_format: { type: "json_object" },
        temperature: 0.8,
        max_tokens: maxTokens,
      });

      const choice = completion.choices[0];
      if (choice?.finish_reason === "length") {
        throw new Error(
          `The response was cut off because it was too long for "${model}"'s output limit. Try fewer puzzles (a shorter Length) or an easier Difficulty.`
        );
      }

      const raw = choice?.message?.content;
      if (!raw) throw new Error("Empty response from AI model.");
      return { content: safeParsePuzzleContent(raw), mode: "ai" };
    } catch (err) {
      console.error("Puzzle content generation failed with user-supplied key:", err);
      const message = err instanceof Error ? err.message : "AI generation failed.";
      throw new Error(
        message.includes("cut off")
          ? message
          : `Your OpenAI API key was rejected or the request failed: ${message}. Check your key in Settings.`
      );
    }
  }

  return {
    content: buildMockPuzzleContent(idea, type, difficulty, puzzleCount),
    mode: "mock",
  };
}

// Deterministic, no-API-key-required fallback so puzzle products are
// demo-able before anyone wires up an OpenAI key. Pulls real words out of
// the customer's idea text first, then pads with a generic filler pool.
function buildMockPuzzleContent(
  idea: string,
  type: PuzzleProductType,
  difficulty: ProductDifficulty,
  puzzleCount: number
): PuzzleBookContent {
  const wordCount = wordCountFor(type, difficulty);
  const topic = idea.trim() || "your topic";
  const capitalized = topic.charAt(0).toUpperCase() + topic.slice(1);

  const ideaWords = Array.from(
    new Set(
      topic
        .toUpperCase()
        .replace(/[^A-Z\s]/g, " ")
        .split(/\s+/)
        .filter((w) => w.length >= 3 && w.length <= 12)
    )
  );

  const fillerPool = [
    "PUZZLE", "LEARN", "CREATE", "TOPIC", "FOCUS", "GROWTH", "SUCCESS", "PROGRESS",
    "SKILL", "GOAL", "PLAN", "ACTION", "RESULT", "VALUE", "QUALITY", "DETAIL",
    "METHOD", "SYSTEM", "PROCESS", "CHANGE", "BALANCE", "ENERGY", "MINDSET", "HABIT",
    "ROUTINE", "CHOICE", "EFFORT", "REWARD", "CHALLENGE", "VICTORY", "JOURNEY",
    "VISION", "PURPOSE", "STRATEGY", "PRACTICE", "MASTERY", "INSIGHT", "CLARITY",
    "CONFIDENCE", "DISCIPLINE", "PATIENCE", "CURIOSITY", "CREATIVITY", "RESILIENCE",
    "GRATITUDE", "STRENGTH", "WISDOM", "HARMONY", "MOTION", "SPARK", "BRIGHT",
    "STEADY", "CALM", "BOLD", "SHARP", "QUICK", "FRESH", "CLEAR", "SOLID", "VIVID",
  ];

  const subthemePool = [
    "Getting Started", "The Fundamentals", "Building Momentum", "Leveling Up",
    "Common Mistakes", "Advanced Ideas", "Putting It Together", "Staying Consistent",
    "Making It Stick", "The Next Level", "Fine-Tuning", "Going Deeper",
    "The Big Picture", "Everyday Practice", "Mastering the Basics", "New Perspectives",
    "Real-World Application", "Troubleshooting", "Best Practices", "What's Next",
  ];

  let fillerIdx = 0;
  const puzzles: PuzzleSet[] = Array.from({ length: puzzleCount }, (_, i) => {
    const entries: PuzzleEntry[] = [];
    for (let w = 0; w < wordCount; w++) {
      let word = ideaWords[(i * wordCount + w) % Math.max(ideaWords.length, 1)];
      if (!word || entries.some((e) => e.answer === word)) {
        word = fillerPool[fillerIdx % fillerPool.length];
        fillerIdx++;
      }
      entries.push({ answer: word, clue: `Related to ${topic}` });
    }
    return { subtitle: subthemePool[i % subthemePool.length], entries };
  });

  return {
    title: `${capitalized}: The Complete ${
      type === "crossword" ? "Crossword" : "Word Search"
    } Collection`,
    subtitle: `${puzzleCount} ${
      type === "crossword" ? "crossword" : "word search"
    } puzzles (${difficulty} difficulty) built around ${topic}.`,
    tagline:
      "Demo content — add your OpenAI key in Settings to generate puzzles built from real, topic-specific words and clues.",
    puzzles,
  };
}
