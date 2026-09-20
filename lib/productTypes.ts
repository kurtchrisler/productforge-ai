export type ProductTypeId =
  | "ebook"
  | "guide"
  | "planner"
  | "workbook"
  | "template"
  | "checklist"
  | "crossword"
  | "word_search"
  | "infographic";

// What generation/rendering pipeline a product type uses:
// - "document": AI writes prose sections -> multi-page PDF (existing pipeline)
// - "puzzle": AI writes word/clue sets -> deterministic grid generator -> multi-page PDF
// - "infographic": AI writes structured stats/points -> single-page PNG (not a PDF)
export type ProductKind = "document" | "puzzle" | "infographic";

export type ProductTypeMeta = {
  id: ProductTypeId;
  label: string;
  shortLabel: string;
  description: string;
  accent: string; // hex accent color
  accentSoft: string; // light tint for backgrounds
  emoji: string;
  kind: ProductKind;
  // Document-kind fields (still present with harmless defaults on
  // non-document types, so callers never need an extra null-check).
  sectionNoun: string; // what to call a "section" in prompts (chapter, day, module...)
  sectionCountHint: number;
  worksheetHint: boolean; // whether worksheet-style fill-in blocks make sense
  checklistStyle: boolean; // render bullets as checkboxes instead of dots
};

export const PRODUCT_TYPES: Record<ProductTypeId, ProductTypeMeta> = {
  ebook: {
    id: "ebook",
    label: "Ebook",
    shortLabel: "Ebook",
    description:
      "A polished, narrative digital book that teaches or tells — ready to sell or give away.",
    accent: "#4f46e5",
    accentSoft: "#eef2ff",
    emoji: "\u{1F4D8}",
    kind: "document",
    sectionNoun: "chapter",
    sectionCountHint: 6,
    worksheetHint: false,
    checklistStyle: false,
  },
  guide: {
    id: "guide",
    label: "Guide",
    shortLabel: "Guide",
    description:
      "A focused, step-by-step how-to guide that walks the reader from problem to result.",
    accent: "#0d9488",
    accentSoft: "#f0fdfa",
    emoji: "\u{1F9ED}",
    kind: "document",
    sectionNoun: "step",
    sectionCountHint: 7,
    worksheetHint: false,
    checklistStyle: false,
  },
  planner: {
    id: "planner",
    label: "Planner",
    shortLabel: "Planner",
    description:
      "A structured planner with fill-in prompts, checklists, and tracking pages.",
    accent: "#db2777",
    accentSoft: "#fdf2f8",
    emoji: "\u{1F5D3}\u{FE0F}",
    kind: "document",
    sectionNoun: "section",
    sectionCountHint: 6,
    worksheetHint: true,
    checklistStyle: false,
  },
  workbook: {
    id: "workbook",
    label: "Workbook",
    shortLabel: "Workbook",
    description:
      "An interactive workbook with exercises and reflection prompts for hands-on learning.",
    accent: "#ea580c",
    accentSoft: "#fff7ed",
    emoji: "\u{1F4DD}",
    kind: "document",
    sectionNoun: "exercise",
    sectionCountHint: 6,
    worksheetHint: true,
    checklistStyle: false,
  },
  template: {
    id: "template",
    label: "Template",
    shortLabel: "Template",
    description:
      "A ready-to-use, fill-in-the-blank template pack the reader can put to work immediately.",
    accent: "#7c3aed",
    accentSoft: "#f5f3ff",
    emoji: "\u{1F4CB}",
    kind: "document",
    sectionNoun: "module",
    sectionCountHint: 5,
    worksheetHint: true,
    checklistStyle: false,
  },
  checklist: {
    id: "checklist",
    label: "Checklist",
    shortLabel: "Checklist",
    description:
      "A clean, scannable checklist pack — grouped checkboxes the reader can actually check off.",
    accent: "#16a34a",
    accentSoft: "#f0fdf4",
    emoji: "\u{2705}",
    kind: "document",
    sectionNoun: "checklist",
    sectionCountHint: 5,
    worksheetHint: false,
    checklistStyle: true,
  },
  crossword: {
    id: "crossword",
    label: "Crossword Puzzles",
    shortLabel: "Crossword",
    description:
      "A full ebook of crossword puzzles built around your topic, with an answer key at the back.",
    accent: "#1d4ed8",
    accentSoft: "#eff6ff",
    emoji: "\u{1F9E9}",
    kind: "puzzle",
    sectionNoun: "puzzle",
    sectionCountHint: 0,
    worksheetHint: false,
    checklistStyle: false,
  },
  word_search: {
    id: "word_search",
    label: "Word Search Puzzles",
    shortLabel: "Word Search",
    description:
      "A full ebook of word search puzzles built around your topic, with an answer key at the back.",
    accent: "#0891b2",
    accentSoft: "#ecfeff",
    emoji: "\u{1F50D}",
    kind: "puzzle",
    sectionNoun: "puzzle",
    sectionCountHint: 0,
    worksheetHint: false,
    checklistStyle: false,
  },
  infographic: {
    id: "infographic",
    label: "Infographic",
    shortLabel: "Infographic",
    description:
      "A single shareable infographic image built from your topic and instructions — no PDF, just the image.",
    accent: "#c2410c",
    accentSoft: "#fff7ed",
    emoji: "\u{1F4CA}",
    kind: "infographic",
    sectionNoun: "section",
    sectionCountHint: 0,
    worksheetHint: false,
    checklistStyle: false,
  },
};

export const PRODUCT_TYPE_LIST = Object.values(PRODUCT_TYPES);

export function isProductType(value: string): value is ProductTypeId {
  return Object.prototype.hasOwnProperty.call(PRODUCT_TYPES, value);
}

export type ProductLength = "short" | "medium" | "long";

export type ProductLengthMeta = {
  id: ProductLength;
  label: string;
  description: string;
  // Added to (or subtracted from) a product type's sectionCountHint.
  sectionDelta: number;
  // How many paragraphs each section's body should be written as.
  paragraphCount: string;
  // Target sentence count PER PARAGRAPH, given to the AI prompt.
  sentenceRange: string;
  // Target WORD count per section body — this is what actually moves the
  // model to write real depth; sentence/paragraph counts alone are too easy
  // for it to satisfy with short sentences.
  wordTarget: string;
  // Target bullet count per section, given to the AI prompt.
  bulletRange: string;
  // Target sentence count for the introduction and conclusion.
  introSentenceRange: string;
};

export const PRODUCT_LENGTHS: Record<ProductLength, ProductLengthMeta> = {
  short: {
    id: "short",
    label: "Short",
    description: "A quick, concise read — fewer sections, brief sections.",
    sectionDelta: -1,
    paragraphCount: "2",
    sentenceRange: "3-5",
    wordTarget: "150-250",
    bulletRange: "3-5",
    introSentenceRange: "3-4",
  },
  medium: {
    id: "medium",
    label: "Medium",
    description: "A solid, well-rounded, genuinely complete product — the default.",
    sectionDelta: 2,
    paragraphCount: "3",
    sentenceRange: "5-7",
    wordTarget: "350-550",
    bulletRange: "4-7",
    introSentenceRange: "5-7",
  },
  long: {
    id: "long",
    label: "Long",
    description: "An in-depth, comprehensive product — more sections, each one written in real depth.",
    sectionDelta: 5,
    paragraphCount: "4-5",
    sentenceRange: "5-8",
    wordTarget: "650-900",
    bulletRange: "5-8",
    introSentenceRange: "8-12",
  },
};

export const PRODUCT_LENGTH_LIST = Object.values(PRODUCT_LENGTHS);

export function isProductLength(value: string): value is ProductLength {
  return Object.prototype.hasOwnProperty.call(PRODUCT_LENGTHS, value);
}

// How many individual puzzles a crossword/word-search product contains, tied
// to the same Short/Medium/Long control used by document-kind products.
export const PUZZLE_COUNTS: Record<ProductLength, number> = {
  short: 5,
  medium: 10,
  long: 20,
};

export function resolveSectionCount(
  type: ProductTypeId,
  length: ProductLength
): number {
  const base = PRODUCT_TYPES[type].sectionCountHint;
  const delta = PRODUCT_LENGTHS[length].sectionDelta;
  return Math.min(12, Math.max(3, base + delta));
}

// Shared content shape produced by the AI (or mock) generator and consumed
// by the HTML/PDF renderer, regardless of product type.
export type ProductSection = {
  heading: string;
  body: string;
  bullets?: string[];
  worksheet?: string[];
};

export type ProductContent = {
  title: string;
  subtitle: string;
  tagline: string;
  introduction: string;
  sections: ProductSection[];
  conclusion: string;
  callToAction: string;
};

// The minimal shape cover-art generation actually needs — both
// ProductContent (document-kind) and PuzzleBookContent (puzzle-kind)
// structurally satisfy this, so one cover generator serves both.
export type CoverContentInput = {
  title: string;
  subtitle: string;
  tagline: string;
};

// ---- Puzzle (crossword / word search) types ----

export type ProductDifficulty = "easy" | "medium" | "hard";

export type PuzzleDifficultyMeta = {
  id: ProductDifficulty;
  label: string;
  description: string;
  crosswordWordCount: number; // how many entries to ask the AI for, per puzzle
  crosswordGridCap: number; // max grid dimension (square) allowed
  wordSearchWordCount: number;
  wordSearchGridSize: number; // fixed square grid dimension
};

export const PUZZLE_DIFFICULTIES: Record<ProductDifficulty, PuzzleDifficultyMeta> = {
  easy: {
    id: "easy",
    label: "Easy",
    description: "Shorter words, smaller grids — great for kids or casual solvers.",
    crosswordWordCount: 8,
    crosswordGridCap: 13,
    wordSearchWordCount: 10,
    wordSearchGridSize: 12,
  },
  medium: {
    id: "medium",
    label: "Medium",
    description: "A solid challenge for most solvers — the default.",
    crosswordWordCount: 12,
    crosswordGridCap: 15,
    wordSearchWordCount: 15,
    wordSearchGridSize: 15,
  },
  hard: {
    id: "hard",
    label: "Hard",
    description: "More words, bigger grids, tougher clues.",
    crosswordWordCount: 16,
    crosswordGridCap: 19,
    wordSearchWordCount: 20,
    wordSearchGridSize: 18,
  },
};

export const PUZZLE_DIFFICULTY_LIST = Object.values(PUZZLE_DIFFICULTIES);

export function isProductDifficulty(value: string): value is ProductDifficulty {
  return Object.prototype.hasOwnProperty.call(PUZZLE_DIFFICULTIES, value);
}

// A single word/answer + its clue (word search ignores the clue text itself
// but the shape is shared so one AI generator + one JSON schema serves both
// puzzle types).
export type PuzzleEntry = {
  answer: string; // letters only, uppercase, no spaces/punctuation
  clue: string;
};

export type PuzzleSet = {
  subtitle: string; // e.g. "Puzzle 3: Kitchen Tools"
  entries: PuzzleEntry[];
};

export type PuzzleBookContent = {
  title: string;
  subtitle: string;
  tagline: string;
  puzzles: PuzzleSet[];
};

// ---- Infographic types ----

export type InfographicStat = {
  value: string; // e.g. "73%" or "10x"
  label: string; // e.g. "of marketers say..."
};

export type InfographicContent = {
  title: string;
  subtitle: string;
  stats: InfographicStat[];
  points: string[];
  footerNote: string;
};
