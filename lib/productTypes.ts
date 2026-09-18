export type ProductTypeId =
  | "ebook"
  | "guide"
  | "planner"
  | "workbook"
  | "template";

export type ProductTypeMeta = {
  id: ProductTypeId;
  label: string;
  shortLabel: string;
  description: string;
  accent: string; // hex accent color
  accentSoft: string; // light tint for backgrounds
  emoji: string;
  sectionNoun: string; // what to call a "section" in prompts (chapter, day, module...)
  sectionCountHint: number;
  worksheetHint: boolean; // whether worksheet-style fill-in blocks make sense
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
    sectionNoun: "chapter",
    sectionCountHint: 6,
    worksheetHint: false,
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
    sectionNoun: "step",
    sectionCountHint: 7,
    worksheetHint: false,
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
    sectionNoun: "section",
    sectionCountHint: 6,
    worksheetHint: true,
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
    sectionNoun: "exercise",
    sectionCountHint: 6,
    worksheetHint: true,
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
    sectionNoun: "module",
    sectionCountHint: 5,
    worksheetHint: true,
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
    paragraphCount: "1",
    sentenceRange: "3-5",
    bulletRange: "2-4",
    introSentenceRange: "2-3",
  },
  medium: {
    id: "medium",
    label: "Medium",
    description: "A solid, well-rounded, genuinely complete product — the default.",
    sectionDelta: 1,
    paragraphCount: "2",
    sentenceRange: "4-6",
    bulletRange: "4-6",
    introSentenceRange: "3-5",
  },
  long: {
    id: "long",
    label: "Long",
    description: "An in-depth, comprehensive product — more sections, and each one written in real depth.",
    sectionDelta: 4,
    paragraphCount: "3-4",
    sentenceRange: "4-6",
    bulletRange: "5-8",
    introSentenceRange: "5-8",
  },
};

export const PRODUCT_LENGTH_LIST = Object.values(PRODUCT_LENGTHS);

export function isProductLength(value: string): value is ProductLength {
  return Object.prototype.hasOwnProperty.call(PRODUCT_LENGTHS, value);
}

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
