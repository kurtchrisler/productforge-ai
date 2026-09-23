import type { MembershipLevel } from "./license";

export type ProductTypeId =
  | "ebook"
  | "guide"
  | "planner"
  | "workbook"
  | "template"
  | "checklist"
  | "crossword"
  | "word_search"
  | "coloring_book";

// What generation/rendering pipeline a product type uses:
// - "document": AI writes prose sections -> multi-page PDF (existing pipeline)
// - "puzzle": AI writes word/clue sets -> deterministic grid generator -> multi-page PDF
// - "coloring": AI writes one caption+prompt per page -> one AI line-art image per page -> multi-page PDF
export type ProductKind = "document" | "puzzle" | "coloring";

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
  // Small nudge applied on top of a length tier's base section count (see
  // resolveSectionCount) — e.g. templates read better as fewer, meatier
  // modules, so they get a negative nudge relative to an ebook's chapters.
  sectionCountHint: number;
  worksheetHint: boolean; // whether worksheet-style fill-in blocks make sense
  checklistStyle: boolean; // render bullets as checkboxes instead of dots
  // Lowest membership tier that can create this product type. 'standard'
  // means Standard-and-up (i.e. both tiers); 'pro' means Pro-only. Per
  // Kurt's spec: ebook/guide/planner/workbook/template/checklist are
  // Standard; crossword/word_search/coloring_book are Pro additions.
  minMembership: "standard" | "pro";
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
    sectionCountHint: 1,
    worksheetHint: false,
    checklistStyle: false,
    minMembership: "standard",
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
    sectionCountHint: 1,
    worksheetHint: false,
    checklistStyle: false,
    minMembership: "standard",
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
    sectionCountHint: 0,
    worksheetHint: true,
    checklistStyle: false,
    minMembership: "standard",
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
    sectionCountHint: 0,
    worksheetHint: true,
    checklistStyle: false,
    minMembership: "standard",
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
    sectionCountHint: -2,
    worksheetHint: true,
    checklistStyle: false,
    minMembership: "standard",
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
    sectionCountHint: -1,
    worksheetHint: false,
    checklistStyle: true,
    minMembership: "standard",
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
    minMembership: "pro",
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
    minMembership: "pro",
  },
  coloring_book: {
    id: "coloring_book",
    label: "Coloring Book",
    shortLabel: "Coloring Book",
    description:
      "A full coloring book with one original black-and-white line-art illustration per page.",
    accent: "#c2410c",
    accentSoft: "#fff7ed",
    emoji: "\u{1F58D}\u{FE0F}",
    kind: "coloring",
    sectionNoun: "page",
    sectionCountHint: 0,
    worksheetHint: false,
    checklistStyle: false,
    minMembership: "pro",
  },
};

export const PRODUCT_TYPE_LIST = Object.values(PRODUCT_TYPES);

export function isProductType(value: string): value is ProductTypeId {
  return Object.prototype.hasOwnProperty.call(PRODUCT_TYPES, value);
}

// Customers pick a target page count directly rather than a vague
// Short/Medium/Long label — the id IS the approximate page count.
export type ProductLength = "10" | "25" | "50" | "75" | "100" | "150";

export type ProductLengthMeta = {
  id: ProductLength;
  label: string; // "~10 pages"
  description: string;
  targetPages: number;
  // Base chapter/section count for this tier (nudged per product type by
  // PRODUCT_TYPES[type].sectionCountHint — see resolveSectionCount).
  sectionCount: number;
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
  // Tiers big enough to blow past a single chat-completion's output-token
  // ceiling are generated chapter-by-chapter (one AI call per chapter,
  // batched with limited concurrency) instead of one JSON blob for the
  // whole book — see generateLongFormContent in lib/ai.ts.
  multiCall: boolean;
  // Output-token budget for a single-call generation (multiCall: false).
  maxTokens: number;
  // Output-token budget PER CHAPTER for a multi-call generation.
  chapterMaxTokens: number;
  // Lowest membership tier that can generate at this page length. Per
  // Kurt's spec: 10/25/50 pages are Standard; 75/100/150 are Pro-only.
  minMembership: "standard" | "pro";
};

export const PRODUCT_LENGTHS: Record<ProductLength, ProductLengthMeta> = {
  "10": {
    id: "10",
    label: "~10 pages",
    description: "A quick, focused read.",
    targetPages: 10,
    sectionCount: 5,
    paragraphCount: "2-3",
    sentenceRange: "4-6",
    wordTarget: "550-850",
    bulletRange: "3-5",
    introSentenceRange: "4-6",
    multiCall: false,
    maxTokens: 7000,
    chapterMaxTokens: 0,
    minMembership: "standard",
  },
  "25": {
    id: "25",
    label: "~25 pages",
    description: "A short, complete book.",
    targetPages: 25,
    sectionCount: 8,
    paragraphCount: "4",
    sentenceRange: "5-7",
    wordTarget: "950-1300",
    bulletRange: "4-7",
    introSentenceRange: "6-9",
    multiCall: false,
    maxTokens: 16000,
    chapterMaxTokens: 0,
    minMembership: "standard",
  },
  "50": {
    id: "50",
    label: "~50 pages",
    description: "A standard, full-length book — the default.",
    targetPages: 50,
    sectionCount: 12,
    paragraphCount: "7-8",
    sentenceRange: "5-8",
    wordTarget: "1700-2100",
    bulletRange: "5-8",
    introSentenceRange: "8-12",
    multiCall: true,
    maxTokens: 0,
    chapterMaxTokens: 4000,
    minMembership: "standard",
  },
  "75": {
    id: "75",
    label: "~75 pages",
    description: "An in-depth, comprehensive book.",
    targetPages: 75,
    sectionCount: 15,
    paragraphCount: "9-10",
    sentenceRange: "6-9",
    wordTarget: "2150-2550",
    bulletRange: "6-9",
    introSentenceRange: "10-14",
    multiCall: true,
    maxTokens: 0,
    chapterMaxTokens: 4600,
    minMembership: "pro",
  },
  "100": {
    id: "100",
    label: "~100 pages",
    description: "A full, thorough book.",
    targetPages: 100,
    sectionCount: 18,
    paragraphCount: "10-11",
    sentenceRange: "6-9",
    wordTarget: "2450-2900",
    bulletRange: "6-10",
    introSentenceRange: "10-14",
    multiCall: true,
    maxTokens: 0,
    chapterMaxTokens: 5300,
    minMembership: "pro",
  },
  "150": {
    id: "150",
    label: "~150 pages",
    description: "A comprehensive, deep-dive book.",
    targetPages: 150,
    sectionCount: 22,
    paragraphCount: "12-13",
    sentenceRange: "6-9",
    wordTarget: "2950-3550",
    bulletRange: "7-10",
    introSentenceRange: "12-16",
    multiCall: true,
    maxTokens: 0,
    chapterMaxTokens: 6500,
    minMembership: "pro",
  },
};

export const PRODUCT_LENGTH_LIST = Object.values(PRODUCT_LENGTHS);

export function isProductLength(value: string): value is ProductLength {
  return Object.prototype.hasOwnProperty.call(PRODUCT_LENGTHS, value);
}

// Older products stored before this tier redesign have "short"/"medium"/
// "long" in the database — map those to the closest new tier so existing
// records still display and regenerate sensibly instead of falling back to
// a blank/undefined length.
const LEGACY_LENGTH_MAP: Record<string, ProductLength> = {
  short: "10",
  medium: "50",
  long: "100",
};

export function normalizeLength(value: string | null | undefined): ProductLength {
  if (value && isProductLength(value)) return value;
  if (value && LEGACY_LENGTH_MAP[value]) return LEGACY_LENGTH_MAP[value];
  return "50";
}

// How many individual puzzles a crossword/word-search product contains, tied
// to the same page-length control used by document-kind products (a puzzle
// "page" isn't literally the same as a book page, but more puzzles = a
// thicker book, so the same tiers scale the puzzle count up sensibly).
export const PUZZLE_COUNTS: Record<ProductLength, number> = {
  "10": 5,
  "25": 10,
  "50": 15,
  "75": 20,
  "100": 30,
  "150": 45,
};

// How many individual coloring pages a coloring-book product contains, tied
// to the same page-length control as everything else. Per Kurt's spec this
// scales identically to PUZZLE_COUNTS (5/10/15/20/30/45) — kept as its own
// named export so coloring-book call sites read clearly and the two can be
// tuned independently later if needed.
export const COLORING_PAGE_COUNTS: Record<ProductLength, number> = PUZZLE_COUNTS;

export function resolveSectionCount(
  type: ProductTypeId,
  length: ProductLength
): number {
  const base = PRODUCT_LENGTHS[length].sectionCount;
  const delta = PRODUCT_TYPES[type].sectionCountHint;
  return Math.min(30, Math.max(3, base + delta));
}

// ---- Standard/Pro membership gating ----
//
// Kurt's spec:
//   Standard: ebook, guide, planner, workbook, template, checklist -- at
//             the 10/25/50 page lengths.
//   Pro:      everything in Standard, PLUS crossword/word_search/
//             coloring_book, PLUS the 75/100/150 page lengths.
// So a request is allowed when the customer's tier is at or above BOTH the
// product type's minimum tier AND the page length's minimum tier -- e.g. a
// Standard member cannot make a 100-page ebook (blocked by length) or a
// 10-page crossword book (blocked by type), even though each limit on its
// own would allow it.
const MEMBERSHIP_RANK: Record<MembershipLevel, number> = {
  none: 0,
  standard: 1,
  pro: 2,
};

export function membershipMeetsRequirement(
  membership: MembershipLevel,
  required: "standard" | "pro"
): boolean {
  return MEMBERSHIP_RANK[membership] >= MEMBERSHIP_RANK[required];
}

// The single tier a customer would need to create this exact
// type+length combination -- whichever of the two requirements is higher.
export function requiredMembershipFor(
  type: ProductTypeId,
  length: ProductLength
): "standard" | "pro" {
  const typeReq = PRODUCT_TYPES[type].minMembership;
  const lengthReq = PRODUCT_LENGTHS[length].minMembership;
  return MEMBERSHIP_RANK[typeReq] >= MEMBERSHIP_RANK[lengthReq]
    ? typeReq
    : lengthReq;
}

export function isAllowedForMembership(
  type: ProductTypeId,
  length: ProductLength,
  membership: MembershipLevel
): boolean {
  return membershipMeetsRequirement(
    membership,
    requiredMembershipFor(type, length)
  );
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

// ---- Coloring book types ----

// One coloring-book page: "prompt" drives the AI image generator (the exact
// scene to illustrate), "caption" is the short label printed under the
// image (and shown in the placeholder box if that page's image generation
// failed or was never attempted, e.g. in mock/demo mode).
export type ColoringPageSpec = {
  caption: string;
  prompt: string;
};

export type ColoringBookContent = {
  title: string;
  subtitle: string;
  tagline: string;
  pages: ColoringPageSpec[];
};
