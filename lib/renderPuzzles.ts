import { PuzzleBookContent, PRODUCT_TYPES, ProductDifficulty } from "./productTypes";
import { CrosswordGrid } from "./crosswordGenerator";
import { WordSearchGrid } from "./wordSearchGenerator";

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

type PuzzleKind = "crossword" | "word_search";

export type GeneratedPuzzle = {
  subtitle: string;
  crossword?: CrosswordGrid;
  wordSearch?: WordSearchGrid;
};

function gridStyle(size: number): string {
  return `grid-template-columns: repeat(${size}, 1fr);`;
}

function renderCrosswordGridHtml(grid: CrosswordGrid, revealAnswers: boolean): string {
  const numberAt = new Map<string, number>();
  for (const p of grid.placements) numberAt.set(`${p.row},${p.col}`, p.number);

  let cellsHtml = "";
  for (let r = 0; r < grid.height; r++) {
    for (let c = 0; c < grid.width; c++) {
      const letter = grid.cells[r][c];
      if (!letter) {
        cellsHtml += `<div class="xw-cell xw-blocked"></div>`;
        continue;
      }
      const number = numberAt.get(`${r},${c}`);
      cellsHtml += `<div class="xw-cell">${
        number ? `<span class="xw-num">${number}</span>` : ""
      }${revealAnswers ? `<span class="xw-letter">${letter}</span>` : ""}</div>`;
    }
  }
  return `<div class="xw-grid" style="${gridStyle(grid.width)}">${cellsHtml}</div>`;
}

function renderCrosswordClues(grid: CrosswordGrid): string {
  const across = grid.placements.filter((p) => p.direction === "across");
  const down = grid.placements.filter((p) => p.direction === "down");
  const list = (items: typeof across) =>
    items.map((p) => `<li><strong>${p.number}.</strong> ${esc(p.clue)}</li>`).join("");
  return `
    <div class="xw-clues">
      <div class="xw-clue-col">
        <h3>Across</h3>
        <ul>${list(across)}</ul>
      </div>
      <div class="xw-clue-col">
        <h3>Down</h3>
        <ul>${list(down)}</ul>
      </div>
    </div>`;
}

function renderWordSearchGridHtml(grid: WordSearchGrid, revealAnswers: boolean): string {
  const highlighted = new Set<string>();
  if (revealAnswers) {
    for (const p of grid.placements) {
      for (let i = 0; i < p.word.length; i++) {
        highlighted.add(`${p.row + p.dRow * i},${p.col + p.dCol * i}`);
      }
    }
  }
  let cellsHtml = "";
  for (let r = 0; r < grid.size; r++) {
    for (let c = 0; c < grid.size; c++) {
      const found = highlighted.has(`${r},${c}`);
      cellsHtml += `<div class="ws-cell${found ? " ws-found" : ""}">${grid.cells[r][c]}</div>`;
    }
  }
  return `<div class="ws-grid" style="${gridStyle(grid.size)}">${cellsHtml}</div>`;
}

function renderWordList(words: string[]): string {
  return `<div class="ws-words"><ul>${words.map((w) => `<li>${esc(w)}</li>`).join("")}</ul></div>`;
}

export function renderPuzzleBookHtml(
  content: PuzzleBookContent,
  type: PuzzleKind,
  difficulty: ProductDifficulty,
  puzzles: GeneratedPuzzle[]
): string {
  const meta = PRODUCT_TYPES[type];
  const accent = meta.accent;
  const accentSoft = meta.accentSoft;
  const coverGradient = `linear-gradient(160deg, ${accent} 0%, #111827 120%)`;

  const puzzlePages = puzzles
    .map((p, i) => {
      const num = i + 1;
      if (type === "crossword" && p.crossword) {
        return `
        <div class="page puzzle-page">
          <div class="puzzle-eyebrow">PUZZLE ${num}</div>
          <h2>${esc(p.subtitle || `Puzzle ${num}`)}</h2>
          ${renderCrosswordGridHtml(p.crossword, false)}
          ${renderCrosswordClues(p.crossword)}
        </div>`;
      }
      if (type === "word_search" && p.wordSearch) {
        const words = p.wordSearch.placements.map((pl) => pl.word);
        return `
        <div class="page puzzle-page">
          <div class="puzzle-eyebrow">PUZZLE ${num}</div>
          <h2>${esc(p.subtitle || `Puzzle ${num}`)}</h2>
          ${renderWordSearchGridHtml(p.wordSearch, false)}
          <p style="font-size:12px;color:#6b7280;margin:-10px 0 10px 0;">Find these words — they may run forward, backward, or diagonally.</p>
          ${renderWordList(words)}
        </div>`;
      }
      return "";
    })
    .join("");

  const answerPages = puzzles
    .map((p, i) => {
      const num = i + 1;
      const isLast = i === puzzles.length - 1;
      const cls = `page puzzle-page answer-page${isLast ? " last-page" : ""}`;
      if (type === "crossword" && p.crossword) {
        return `
        <div class="${cls}">
          <div class="puzzle-eyebrow">ANSWER KEY — PUZZLE ${num}</div>
          <h2>${esc(p.subtitle || `Puzzle ${num}`)}</h2>
          ${renderCrosswordGridHtml(p.crossword, true)}
        </div>`;
      }
      if (type === "word_search" && p.wordSearch) {
        return `
        <div class="${cls}">
          <div class="puzzle-eyebrow">ANSWER KEY — PUZZLE ${num}</div>
          <h2>${esc(p.subtitle || `Puzzle ${num}`)}</h2>
          ${renderWordSearchGridHtml(p.wordSearch, true)}
        </div>`;
      }
      return "";
    })
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${esc(content.title)}</title>
<style>
  @page { margin: 0; }
  * { box-sizing: border-box; }
  html, body {
    margin: 0;
    padding: 0;
    font-family: 'Helvetica Neue', Arial, sans-serif;
    color: #1f2430;
    background: #ffffff;
  }
  .page {
    width: 8.5in;
    min-height: 11in;
    padding: 0.7in 0.75in;
    margin: 0 auto;
    page-break-after: always;
    position: relative;
  }
  .cover {
    background: ${coverGradient};
    color: #ffffff;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: flex-start;
    padding: 0.85in 0.9in;
  }
  .cover-badge {
    display: inline-block;
    background: rgba(255,255,255,0.15);
    padding: 6px 14px;
    border-radius: 999px;
    font-size: 12px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    margin-bottom: 28px;
  }
  .cover h1 { font-size: 40px; line-height: 1.15; margin: 0 0 18px 0; max-width: 6.4in; }
  .cover .subtitle { font-size: 18px; opacity: 0.92; max-width: 5.8in; line-height: 1.5; margin-bottom: 34px; }
  .cover .tagline { font-size: 13px; opacity: 0.75; border-top: 1px solid rgba(255,255,255,0.3); padding-top: 14px; max-width: 5in; }

  .puzzle-eyebrow { font-size: 11px; letter-spacing: 0.14em; color: ${accent}; font-weight: 700; margin-bottom: 6px; }
  .puzzle-page h2 { font-size: 22px; margin: 0 0 18px 0; color: #14151a; }

  .xw-grid, .ws-grid {
    display: grid;
    width: 100%;
    max-width: 6.6in;
    aspect-ratio: 1;
    border: 2px solid #14151a;
    margin: 0 auto 22px auto;
  }
  .xw-cell {
    position: relative;
    border: 0.5px solid #b8bcc4;
    background: #ffffff;
    aspect-ratio: 1;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .xw-blocked { background: #14151a; border-color: #14151a; }
  .xw-num { position: absolute; top: 1px; left: 2px; font-size: 6px; font-weight: 700; color: #4b4f5b; }
  .xw-letter { font-size: 11px; font-weight: 700; color: ${accent}; }

  .xw-clues { display: flex; gap: 30px; margin-top: 10px; }
  .xw-clue-col { flex: 1; }
  .xw-clue-col h3 {
    font-size: 12px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: ${accent};
    margin: 0 0 8px 0;
    border-bottom: 2px solid ${accentSoft};
    padding-bottom: 6px;
  }
  .xw-clue-col ul { margin: 0; padding-left: 0; list-style: none; }
  .xw-clue-col li { font-size: 10.5px; line-height: 1.6; margin-bottom: 4px; color: #2b2f3a; }

  .ws-cell {
    border: 0.5px solid #e4e6ea;
    background: #ffffff;
    aspect-ratio: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: 'Courier New', monospace;
    font-weight: 700;
    font-size: 10px;
    color: #2b2f3a;
  }
  .ws-found { background: ${accentSoft}; color: ${accent}; border-radius: 999px; }
  .ws-words ul { columns: 3; margin: 0; padding-left: 18px; }
  .ws-words li { font-size: 12px; line-height: 1.9; color: #2b2f3a; text-transform: uppercase; }

  .last-page { page-break-after: auto; }
</style>
</head>
<body>

  <div class="page cover">
    <div class="cover-badge">${esc(meta.label)} · ${esc(difficulty)} difficulty</div>
    <h1>${esc(content.title)}</h1>
    <div class="subtitle">${esc(content.subtitle)}</div>
    <div class="tagline">${esc(content.tagline)}</div>
  </div>

  ${puzzlePages}

  <div class="page" style="display:flex;align-items:center;justify-content:center;">
    <h2 style="font-size:28px;color:#14151a;">Answer Keys</h2>
  </div>

  ${answerPages}

</body>
</html>`;
}
