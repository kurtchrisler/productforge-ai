import path from "path";
import fs from "fs";
import crypto from "crypto";
import archiver from "archiver";
import {
  ProductContent,
  PuzzleBookContent,
  ColoringBookContent,
  ProductTypeId,
  ProductTypeMeta,
  ProductDifficulty,
  PRODUCT_TYPES,
  PUZZLE_DIFFICULTIES,
} from "./productTypes";
import { CrosswordGrid, generateCrossword } from "./crosswordGenerator";
import { WordSearchGrid, generateWordSearch } from "./wordSearchGenerator";
import { readColoringPageBuffers } from "./coloringImages";

const epubDir = path.join(process.cwd(), "data", "epubs");

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function paragraphs(body: string): string {
  return body
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${esc(p)}</p>`)
    .join("\n");
}

function wrapXhtml(title: string, bodyHtml: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="en" xml:lang="en">
<head>
<meta charset="utf-8"/>
<title>${esc(title)}</title>
<link rel="stylesheet" type="text/css" href="styles.css"/>
</head>
<body>
${bodyHtml}
</body>
</html>`;
}

type ManifestItem = {
  id: string;
  href: string;
  mediaType: string;
  properties?: string;
};

type Chapter = {
  id: string;
  href: string;
  title: string;
  xhtml: string;
  inToc: boolean;
};

type ExtraImage = {
  id: string;
  href: string; // relative to OEBPS/, e.g. "images/page-3.png"
  mediaType: string;
  buffer: Buffer;
};

const STYLES_CSS = `body {
  font-family: 'Georgia', 'Times New Roman', serif;
  line-height: 1.6;
  margin: 0;
  padding: 0 1.2em;
  color: #1a1a1a;
}
h1 {
  font-family: 'Helvetica', 'Arial', sans-serif;
  font-size: 1.5em;
  line-height: 1.25;
  margin: 1.3em 0 0.6em 0;
}
h2 {
  font-family: 'Helvetica', 'Arial', sans-serif;
  font-size: 1.1em;
  margin: 1.2em 0 0.5em 0;
}
p { margin: 0 0 1em 0; }
.cover { text-align: center; margin: 0; padding: 0; }
.cover-img { width: 100%; height: auto; }
.titlepage { text-align: center; margin-top: 3.5em; }
.titlepage h1 { font-size: 2em; margin-top: 0.4em; }
.titlepage .subtitle { font-size: 1.1em; color: #444; margin-top: 0.4em; }
.titlepage .tagline { font-size: 0.9em; color: #777; margin-top: 2em; font-style: italic; }
.badge, .kicker {
  font-family: 'Helvetica', 'Arial', sans-serif;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-size: 0.75em;
  color: #555;
  margin: 0;
}
.bullets, .checklist, .worksheet {
  margin: 0 0 1.2em 0;
  padding-left: 1.4em;
}
.checklist { list-style: none; padding-left: 0.2em; }
.checklist li:before { content: "\\2610\\a0\\a0"; }
.worksheet { list-style: none; padding-left: 0.2em; }
.worksheet li { border-bottom: 1px dashed #999; padding: 0.35em 0; }
.cta {
  font-weight: bold;
  margin-top: 2em;
  padding: 0.8em 1em;
  border: 1px solid #ccc;
  display: inline-block;
}
table.xw-grid, table.ws-grid {
  border-collapse: collapse;
  margin: 1em auto;
}
table.xw-grid td, table.ws-grid td {
  border: 1px solid #333;
  width: 1.6em;
  height: 1.6em;
  text-align: center;
  vertical-align: middle;
  font-family: 'Helvetica', 'Arial', sans-serif;
  font-size: 0.8em;
  padding: 0;
}
table.xw-grid td.xw-blocked { background: #222; border-color: #222; }
table.xw-grid sup { font-size: 0.6em; }
table.ws-grid td { font-family: 'Courier New', monospace; font-weight: bold; }
table.ws-grid td.ws-found { background: #ddd; }
.clue-heading {
  font-family: 'Helvetica', 'Arial', sans-serif;
  font-size: 1em;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: #555;
  margin: 1.2em 0 0.4em 0;
}
ul.clues { list-style: none; padding-left: 0; margin: 0 0 1em; }
ul.clues li { font-size: 0.88em; margin-bottom: 0.3em; }
ul.word-list { columns: 2; margin: 0.6em 0; padding-left: 1.2em; }
ul.word-list li { font-family: 'Courier New', monospace; text-transform: uppercase; font-size: 0.9em; }
p.note { font-size: 0.85em; color: #666; }
.coloring-page { text-align: center; }
.coloring-img { width: 100%; height: auto; margin: 0 auto; }
.coloring-caption {
  font-family: 'Helvetica', 'Arial', sans-serif;
  font-size: 0.8em;
  color: #555;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-top: 0.7em;
}
.coloring-placeholder {
  border: 2px dashed #999;
  padding: 2em;
  margin: 1em 0;
  color: #555;
}
`;

// ---- Document-kind (ebook/guide/planner/workbook/template/checklist) ----

function buildSectionXhtml(
  heading: string,
  sectionNoun: string,
  index: number,
  body: string,
  bullets: string[] | undefined,
  worksheet: string[] | undefined,
  checklistStyle: boolean
): string {
  const bulletsHtml =
    bullets && bullets.length
      ? checklistStyle
        ? `<ul class="checklist">${bullets.map((b) => `<li>${esc(b)}</li>`).join("")}</ul>`
        : `<ul class="bullets">${bullets.map((b) => `<li>${esc(b)}</li>`).join("")}</ul>`
      : "";
  const worksheetHtml =
    worksheet && worksheet.length
      ? `<ul class="worksheet">${worksheet.map((w) => `<li>${esc(w)}</li>`).join("")}</ul>`
      : "";

  return `<p class="kicker">${esc(sectionNoun.toUpperCase())} ${index + 1}</p>
<h1>${esc(heading)}</h1>
${paragraphs(body)}
${bulletsHtml}
${worksheetHtml}`;
}

function buildDocumentChapters(
  content: ProductContent,
  meta: ProductTypeMeta,
  coverImageBuffer: Buffer | null
): Chapter[] {
  const chapters: Chapter[] = [];

  if (coverImageBuffer) {
    chapters.push({
      id: "cover",
      href: "cover.xhtml",
      title: "Cover",
      inToc: false,
      xhtml: wrapXhtml(
        content.title,
        `<div class="cover"><img src="images/cover.png" alt="${esc(content.title)}" class="cover-img"/></div>`
      ),
    });
  } else {
    chapters.push({
      id: "titlepage",
      href: "titlepage.xhtml",
      title: "Title Page",
      inToc: false,
      xhtml: wrapXhtml(
        content.title,
        `<div class="titlepage">
<p class="badge">${esc(meta.label)}</p>
<h1>${esc(content.title)}</h1>
<p class="subtitle">${esc(content.subtitle)}</p>
<p class="tagline">${esc(content.tagline)}</p>
</div>`
      ),
    });
  }

  if (content.introduction.trim()) {
    chapters.push({
      id: "intro",
      href: "intro.xhtml",
      title: "Introduction",
      inToc: true,
      xhtml: wrapXhtml("Introduction", `<h1>Introduction</h1>\n${paragraphs(content.introduction)}`),
    });
  }

  content.sections.forEach((section, i) => {
    const chapterTitle = section.heading || `${meta.sectionNoun} ${i + 1}`;
    chapters.push({
      id: `chap${i + 1}`,
      href: `chap${i + 1}.xhtml`,
      title: chapterTitle,
      inToc: true,
      xhtml: wrapXhtml(
        chapterTitle,
        buildSectionXhtml(
          chapterTitle,
          meta.sectionNoun,
          i,
          section.body,
          section.bullets,
          section.worksheet,
          meta.checklistStyle
        )
      ),
    });
  });

  if (content.conclusion.trim() || content.callToAction.trim()) {
    chapters.push({
      id: "closing",
      href: "closing.xhtml",
      title: "Final Word",
      inToc: true,
      xhtml: wrapXhtml(
        "Final Word",
        `<h1>Final Word</h1>\n${paragraphs(content.conclusion)}${
          content.callToAction.trim() ? `\n<p class="cta">${esc(content.callToAction)}</p>` : ""
        }`
      ),
    });
  }

  return chapters;
}

// ---- Puzzle-kind (crossword/word search) ----
//
// The grid layout isn't stored on the product row — only the puzzle's
// word/clue list is (PuzzleBookContent). The visual grid is deterministic
// from that list, so it's regenerated here with the same generateCrossword/
// generateWordSearch functions the PDF and cover-regen route already use,
// guaranteeing the EPUB always matches the PDF exactly rather than risking
// two independently-maintained puzzle renderers drifting apart.
//
// Crossword/word-search grids are rendered as plain HTML tables rather than
// images, so the EPUB stays true reflowable text (no screenshot step, small
// file size) — the same approach real published puzzle-book EPUBs use.

function crosswordGridTable(grid: CrosswordGrid, revealAnswers: boolean): string {
  const numberAt = new Map<string, number>();
  for (const p of grid.placements) numberAt.set(`${p.row},${p.col}`, p.number);

  let rows = "";
  for (let r = 0; r < grid.height; r++) {
    let cells = "";
    for (let c = 0; c < grid.width; c++) {
      const letter = grid.cells[r][c];
      if (!letter) {
        cells += `<td class="xw-blocked"></td>`;
        continue;
      }
      const number = numberAt.get(`${r},${c}`);
      cells += `<td>${number ? `<sup>${number}</sup>` : ""}${revealAnswers ? esc(letter) : ""}</td>`;
    }
    rows += `<tr>${cells}</tr>`;
  }
  return `<table class="xw-grid">${rows}</table>`;
}

function crosswordCluesHtml(grid: CrosswordGrid): string {
  const across = grid.placements.filter((p) => p.direction === "across");
  const down = grid.placements.filter((p) => p.direction === "down");
  const list = (items: typeof across) =>
    items.map((p) => `<li><strong>${p.number}.</strong> ${esc(p.clue)}</li>`).join("");
  return `<h2 class="clue-heading">Across</h2>
<ul class="clues">${list(across)}</ul>
<h2 class="clue-heading">Down</h2>
<ul class="clues">${list(down)}</ul>`;
}

function wordSearchGridTable(grid: WordSearchGrid, highlightWords: boolean): string {
  const highlighted = new Set<string>();
  if (highlightWords) {
    for (const p of grid.placements) {
      for (let i = 0; i < p.word.length; i++) {
        highlighted.add(`${p.row + p.dRow * i},${p.col + p.dCol * i}`);
      }
    }
  }
  let rows = "";
  for (let r = 0; r < grid.size; r++) {
    let cells = "";
    for (let c = 0; c < grid.size; c++) {
      const found = highlighted.has(`${r},${c}`);
      cells += `<td${found ? ' class="ws-found"' : ""}>${esc(grid.cells[r][c])}</td>`;
    }
    rows += `<tr>${cells}</tr>`;
  }
  return `<table class="ws-grid">${rows}</table>`;
}

function wordListHtml(words: string[]): string {
  return `<ul class="word-list">${words.map((w) => `<li>${esc(w)}</li>`).join("")}</ul>`;
}

function buildPuzzleChapters(
  content: PuzzleBookContent,
  type: ProductTypeId,
  difficulty: ProductDifficulty,
  meta: ProductTypeMeta,
  coverImageBuffer: Buffer | null
): Chapter[] {
  const chapters: Chapter[] = [];
  const puzzleType = type as "crossword" | "word_search";
  const diffMeta = PUZZLE_DIFFICULTIES[difficulty];

  if (coverImageBuffer) {
    chapters.push({
      id: "cover",
      href: "cover.xhtml",
      title: "Cover",
      inToc: false,
      xhtml: wrapXhtml(
        content.title,
        `<div class="cover"><img src="images/cover.png" alt="${esc(content.title)}" class="cover-img"/></div>`
      ),
    });
  } else {
    chapters.push({
      id: "titlepage",
      href: "titlepage.xhtml",
      title: "Title Page",
      inToc: false,
      xhtml: wrapXhtml(
        content.title,
        `<div class="titlepage">
<p class="badge">${esc(meta.label)} &middot; ${esc(diffMeta.label)} difficulty</p>
<h1>${esc(content.title)}</h1>
<p class="subtitle">${esc(content.subtitle)}</p>
<p class="tagline">${esc(content.tagline)}</p>
</div>`
      ),
    });
  }

  const generated = content.puzzles.map((p) => {
    if (puzzleType === "crossword") {
      return { subtitle: p.subtitle, crossword: generateCrossword(p.entries, diffMeta.crosswordGridCap) };
    }
    return {
      subtitle: p.subtitle,
      wordSearch: generateWordSearch(
        p.entries.map((e) => e.answer),
        diffMeta.wordSearchGridSize
      ),
    };
  });

  generated.forEach((p, i) => {
    const chapterTitle = p.subtitle || `Puzzle ${i + 1}`;
    let bodyHtml = `<p class="kicker">PUZZLE ${i + 1}</p>\n<h1>${esc(chapterTitle)}</h1>\n`;
    if (puzzleType === "crossword" && p.crossword) {
      bodyHtml += crosswordGridTable(p.crossword, false) + crosswordCluesHtml(p.crossword);
    } else if (puzzleType === "word_search" && p.wordSearch) {
      const words = p.wordSearch.placements.map((pl) => pl.word);
      bodyHtml +=
        wordSearchGridTable(p.wordSearch, false) +
        `<p class="note">Find these words — they may run forward, backward, or diagonally.</p>` +
        wordListHtml(words);
    }
    chapters.push({
      id: `puzzle${i + 1}`,
      href: `puzzle${i + 1}.xhtml`,
      title: chapterTitle,
      inToc: true,
      xhtml: wrapXhtml(chapterTitle, bodyHtml),
    });
  });

  chapters.push({
    id: "answers-divider",
    href: "answers.xhtml",
    title: "Answer Keys",
    inToc: true,
    xhtml: wrapXhtml("Answer Keys", `<div class="titlepage"><h1>Answer Keys</h1></div>`),
  });

  generated.forEach((p, i) => {
    const puzzleTitle = p.subtitle || `Puzzle ${i + 1}`;
    let bodyHtml = `<p class="kicker">ANSWER KEY — PUZZLE ${i + 1}</p>\n<h1>${esc(puzzleTitle)}</h1>\n`;
    if (puzzleType === "crossword" && p.crossword) {
      bodyHtml += crosswordGridTable(p.crossword, true);
    } else if (puzzleType === "word_search" && p.wordSearch) {
      bodyHtml += wordSearchGridTable(p.wordSearch, true);
    }
    chapters.push({
      id: `answer${i + 1}`,
      href: `answer${i + 1}.xhtml`,
      title: `Answer — ${puzzleTitle}`,
      inToc: false,
      xhtml: wrapXhtml(`Answer — ${puzzleTitle}`, bodyHtml),
    });
  });

  return chapters;
}

// ---- Coloring-kind ----
//
// Each page is its own AI-generated line-art image, already saved to disk
// from generation (see lib/coloringImages.ts) — the EPUB just repackages
// those same PNGs as one full-page image per chapter, the same way a
// picture book or comic EPUB works. No new AI calls.

function buildColoringChapters(
  content: ColoringBookContent,
  meta: ProductTypeMeta,
  coverImageBuffer: Buffer | null,
  productId: number
): { chapters: Chapter[]; images: ExtraImage[] } {
  const chapters: Chapter[] = [];
  const images: ExtraImage[] = [];

  if (coverImageBuffer) {
    chapters.push({
      id: "cover",
      href: "cover.xhtml",
      title: "Cover",
      inToc: false,
      xhtml: wrapXhtml(
        content.title,
        `<div class="cover"><img src="images/cover.png" alt="${esc(content.title)}" class="cover-img"/></div>`
      ),
    });
  } else {
    chapters.push({
      id: "titlepage",
      href: "titlepage.xhtml",
      title: "Title Page",
      inToc: false,
      xhtml: wrapXhtml(
        content.title,
        `<div class="titlepage">
<p class="badge">${esc(meta.label)}</p>
<h1>${esc(content.title)}</h1>
<p class="subtitle">${esc(content.subtitle)}</p>
<p class="tagline">${esc(content.tagline)}</p>
</div>`
      ),
    });
  }

  chapters.push({
    id: "pages-divider",
    href: "pages-start.xhtml",
    title: "Coloring Pages",
    inToc: true,
    xhtml: wrapXhtml(
      "Coloring Pages",
      `<div class="titlepage"><h1>Coloring Pages</h1><p class="subtitle">${content.pages.length} pages</p></div>`
    ),
  });

  const pageBuffers = readColoringPageBuffers(productId, content.pages.length);

  content.pages.forEach((p, i) => {
    const num = i + 1;
    const caption = p.caption || `Page ${num}`;
    const buffer = pageBuffers[i];
    let bodyHtml: string;
    if (buffer) {
      const href = `images/page-${num}.png`;
      images.push({ id: `page-img-${num}`, href, mediaType: "image/png", buffer });
      bodyHtml = `<div class="coloring-page"><img src="${href}" alt="${esc(caption)}" class="coloring-img"/><p class="coloring-caption">${esc(
        caption
      )}</p></div>`;
    } else {
      bodyHtml = `<div class="coloring-page"><div class="coloring-placeholder"><p>${esc(
        p.prompt
      )}</p></div><p class="coloring-caption">${esc(caption)}</p></div>`;
    }
    chapters.push({
      id: `page${num}`,
      href: `page${num}.xhtml`,
      title: caption,
      inToc: false,
      xhtml: wrapXhtml(caption, bodyHtml),
    });
  });

  return { chapters, images };
}

// ---- Packaging (shared across all three kinds) ----
//
// Assembles a valid, KDP-uploadable EPUB 3 file from a product's content —
// the same content that produced the PDF, repackaged as reflowable
// chapters (or, for coloring books, one full-page image per chapter)
// instead of fixed print pages. Written by hand (mimetype/container.xml/
// OPF/nav/NCX/XHTML) rather than via a templating library, so we have full
// control over exactly what goes in the package.
export async function generateEpub(
  content: ProductContent | PuzzleBookContent | ColoringBookContent,
  type: ProductTypeId,
  coverImageBuffer: Buffer | null,
  productId: number,
  difficulty?: ProductDifficulty | null
): Promise<string> {
  if (!fs.existsSync(epubDir)) {
    fs.mkdirSync(epubDir, { recursive: true });
  }

  const meta = PRODUCT_TYPES[type];
  let chapters: Chapter[];
  let extraImages: ExtraImage[] = [];
  let title: string;

  if (meta.kind === "puzzle") {
    const c = content as PuzzleBookContent;
    title = c.title;
    chapters = buildPuzzleChapters(c, type, difficulty ?? "medium", meta, coverImageBuffer);
  } else if (meta.kind === "coloring") {
    const c = content as ColoringBookContent;
    title = c.title;
    const built = buildColoringChapters(c, meta, coverImageBuffer, productId);
    chapters = built.chapters;
    extraImages = built.images;
  } else {
    const c = content as ProductContent;
    title = c.title;
    chapters = buildDocumentChapters(c, meta, coverImageBuffer);
  }

  const manifestItems: ManifestItem[] = [
    { id: "nav", href: "nav.xhtml", mediaType: "application/xhtml+xml", properties: "nav" },
    { id: "css", href: "styles.css", mediaType: "text/css" },
    { id: "ncx", href: "toc.ncx", mediaType: "application/x-dtbncx+xml" },
    ...(coverImageBuffer
      ? [{ id: "cover-image", href: "images/cover.png", mediaType: "image/png", properties: "cover-image" }]
      : []),
    ...extraImages.map((img) => ({ id: img.id, href: img.href, mediaType: img.mediaType })),
    ...chapters.map((c) => ({ id: c.id, href: c.href, mediaType: "application/xhtml+xml" })),
  ];

  const spineIds = chapters.map((c) => c.id);
  const tocChapters = chapters.filter((c) => c.inToc);

  const uuid = `urn:uuid:${crypto.randomUUID()}`;
  const modified = new Date().toISOString().replace(/\.\d+Z$/, "Z");

  const containerXml = `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`;

  const manifestXml = manifestItems
    .map(
      (item) =>
        `    <item id="${item.id}" href="${item.href}" media-type="${item.mediaType}"${
          item.properties ? ` properties="${item.properties}"` : ""
        }/>`
    )
    .join("\n");

  const spineXml = spineIds.map((id) => `    <itemref idref="${id}"/>`).join("\n");

  const opfXml = `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="BookId">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="BookId">${uuid}</dc:identifier>
    <dc:title>${esc(title)}</dc:title>
    <dc:language>en</dc:language>
    <meta property="dcterms:modified">${modified}</meta>
  </metadata>
  <manifest>
${manifestXml}
  </manifest>
  <spine>
${spineXml}
  </spine>
</package>`;

  const navLis = tocChapters.map((c) => `      <li><a href="${c.href}">${esc(c.title)}</a></li>`).join("\n");
  const navXhtml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head>
<meta charset="utf-8"/>
<title>Table of Contents</title>
<link rel="stylesheet" type="text/css" href="styles.css"/>
</head>
<body>
<nav epub:type="toc" id="toc">
<h1>Table of Contents</h1>
<ol>
${navLis}
</ol>
</nav>
</body>
</html>`;

  const navPoints = tocChapters
    .map(
      (c, i) => `    <navPoint id="navpoint-${i + 1}" playOrder="${i + 1}">
      <navLabel><text>${esc(c.title)}</text></navLabel>
      <content src="${c.href}"/>
    </navPoint>`
    )
    .join("\n");
  const ncxXml = `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head>
    <meta name="dtb:uid" content="${uuid}"/>
  </head>
  <docTitle><text>${esc(title)}</text></docTitle>
  <navMap>
${navPoints}
  </navMap>
</ncx>`;

  const filename = `${productId}.epub`;
  const filePath = path.join(epubDir, filename);

  await new Promise<void>((resolve, reject) => {
    const output = fs.createWriteStream(filePath);
    const archive = archiver("zip", { zlib: { level: 9 } });

    output.on("close", () => resolve());
    archive.on("error", (err) => reject(err));
    archive.pipe(output);

    // The mimetype file MUST be the first entry in the zip and MUST be
    // stored (not compressed) — this is a hard EPUB/OCF requirement that
    // some readers and validators check explicitly.
    archive.append("application/epub+zip", { name: "mimetype", store: true });
    archive.append(containerXml, { name: "META-INF/container.xml" });
    archive.append(opfXml, { name: "OEBPS/content.opf" });
    archive.append(navXhtml, { name: "OEBPS/nav.xhtml" });
    archive.append(ncxXml, { name: "OEBPS/toc.ncx" });
    archive.append(STYLES_CSS, { name: "OEBPS/styles.css" });
    if (coverImageBuffer) {
      archive.append(coverImageBuffer, { name: "OEBPS/images/cover.png" });
    }
    for (const img of extraImages) {
      archive.append(img.buffer, { name: `OEBPS/${img.href}` });
    }
    for (const chapter of chapters) {
      archive.append(chapter.xhtml, { name: `OEBPS/${chapter.href}` });
    }

    archive.finalize();
  });

  return filename;
}

export function deleteEpub(filename: string | null): void {
  if (!filename) return;
  const filePath = path.join(epubDir, filename);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}
