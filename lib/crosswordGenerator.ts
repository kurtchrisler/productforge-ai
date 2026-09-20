import { PuzzleEntry } from "./productTypes";

// A lightweight, dependency-free crossword layout algorithm: greedily place
// the longest word first, then place each remaining word at the first valid
// letter-intersection it finds with an already-placed word (flipping
// orientation at the crossing point, like a real crossword). Words that
// can't find any valid crossing are dropped onto a fresh empty row below the
// grid so every requested word still appears somewhere in the puzzle, even
// if disconnected. This won't produce a perfectly symmetric NYT-style grid,
// but it reliably produces a valid, non-overlapping, printable puzzle.

export type CrosswordDirection = "across" | "down";

export type CrosswordPlacement = {
  number: number;
  direction: CrosswordDirection;
  row: number;
  col: number;
  answer: string;
  clue: string;
};

export type CrosswordGrid = {
  width: number;
  height: number;
  cells: (string | null)[][]; // letter at [row][col], or null (blocked/unused)
  placements: CrosswordPlacement[];
};

type PlacedWord = {
  answer: string;
  clue: string;
  row: number;
  col: number;
  direction: CrosswordDirection;
};

const ORIGIN = 200; // virtual center; coordinates are normalized to 0-based at the end

function cleanAnswer(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z]/g, "");
}

function boundsOf(placed: PlacedWord[]) {
  let minRow = Infinity,
    maxRow = -Infinity,
    minCol = Infinity,
    maxCol = -Infinity;
  for (const w of placed) {
    const dr = w.direction === "down" ? 1 : 0;
    const dc = w.direction === "across" ? 1 : 0;
    const endRow = w.row + dr * (w.answer.length - 1);
    const endCol = w.col + dc * (w.answer.length - 1);
    minRow = Math.min(minRow, w.row, endRow);
    maxRow = Math.max(maxRow, w.row, endRow);
    minCol = Math.min(minCol, w.col, endCol);
    maxCol = Math.max(maxCol, w.col, endCol);
  }
  return { minRow, maxRow, minCol, maxCol };
}

export function generateCrossword(
  rawEntries: PuzzleEntry[],
  maxWordLength = 21
): CrosswordGrid {
  const seen = new Set<string>();
  const entries = rawEntries
    .map((e) => ({ answer: cleanAnswer(e.answer), clue: (e.clue || "").trim() }))
    .filter((e) => e.answer.length >= 3 && e.answer.length <= maxWordLength && e.clue)
    .filter((e) => {
      if (seen.has(e.answer)) return false;
      seen.add(e.answer);
      return true;
    })
    .sort((a, b) => b.answer.length - a.answer.length);

  if (entries.length === 0) {
    return { width: 1, height: 1, cells: [[null]], placements: [] };
  }

  const grid = new Map<string, string>();
  const placed: PlacedWord[] = [];

  const cellAt = (r: number, c: number) => grid.get(`${r},${c}`);

  function canPlace(word: string, row: number, col: number, dir: CrosswordDirection): boolean {
    const dr = dir === "down" ? 1 : 0;
    const dc = dir === "across" ? 1 : 0;

    // The cell just before the start and just after the end must be empty,
    // or this word would butt against / merge into another word.
    if (cellAt(row - dr, col - dc) !== undefined) return false;
    if (cellAt(row + dr * word.length, col + dc * word.length) !== undefined) return false;

    let hasIntersection = false;
    for (let i = 0; i < word.length; i++) {
      const r = row + dr * i;
      const c = col + dc * i;
      const existing = cellAt(r, c);
      if (existing !== undefined) {
        if (existing !== word[i]) return false;
        hasIntersection = true;
      } else if (dir === "across") {
        if (cellAt(r - 1, c) !== undefined || cellAt(r + 1, c) !== undefined) return false;
      } else {
        if (cellAt(r, c - 1) !== undefined || cellAt(r, c + 1) !== undefined) return false;
      }
    }
    return hasIntersection || placed.length === 0;
  }

  function place(word: string, clue: string, row: number, col: number, dir: CrosswordDirection) {
    const dr = dir === "down" ? 1 : 0;
    const dc = dir === "across" ? 1 : 0;
    for (let i = 0; i < word.length; i++) {
      grid.set(`${row + dr * i},${col + dc * i}`, word[i]);
    }
    placed.push({ answer: word, clue, row, col, direction: dir });
  }

  place(entries[0].answer, entries[0].clue, ORIGIN, ORIGIN, "across");

  for (let idx = 1; idx < entries.length; idx++) {
    const { answer, clue } = entries[idx];
    let best: { row: number; col: number; dir: CrosswordDirection } | null = null;

    outer: for (const existing of placed) {
      for (let i = 0; i < existing.answer.length; i++) {
        const er = existing.row + (existing.direction === "down" ? i : 0);
        const ec = existing.col + (existing.direction === "across" ? i : 0);
        const letter = existing.answer[i];
        const dir: CrosswordDirection = existing.direction === "across" ? "down" : "across";
        for (let j = 0; j < answer.length; j++) {
          if (answer[j] !== letter) continue;
          const row = dir === "down" ? er - j : er;
          const col = dir === "across" ? ec - j : ec;
          if (canPlace(answer, row, col, dir)) {
            best = { row, col, dir };
            break outer;
          }
        }
      }
    }

    if (best) {
      place(answer, clue, best.row, best.col, best.dir);
    } else {
      // No valid crossing anywhere — drop it on a fresh row below the
      // current grid so it still appears in the puzzle.
      const bounds = boundsOf(placed);
      place(answer, clue, bounds.maxRow + 2, ORIGIN, "across");
    }
  }

  const bounds = boundsOf(placed);
  const height = bounds.maxRow - bounds.minRow + 1;
  const width = bounds.maxCol - bounds.minCol + 1;

  const cells: (string | null)[][] = Array.from({ length: height }, () =>
    new Array(width).fill(null)
  );
  for (const [key, letter] of grid.entries()) {
    const [r, c] = key.split(",").map(Number);
    cells[r - bounds.minRow][c - bounds.minCol] = letter;
  }

  const numberAt = new Map<string, number>();
  let nextNumber = 1;
  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) {
      if (!cells[r][c]) continue;
      const startsAcross = !cells[r][c - 1] && !!cells[r][c + 1];
      const startsDown = !(r > 0 && cells[r - 1][c]) && r + 1 < height && !!cells[r + 1][c];
      if (startsAcross || startsDown) {
        numberAt.set(`${r},${c}`, nextNumber++);
      }
    }
  }

  const placements: CrosswordPlacement[] = placed.map((w) => {
    const row = w.row - bounds.minRow;
    const col = w.col - bounds.minCol;
    const number = numberAt.get(`${row},${col}`) ?? 0;
    return { number, direction: w.direction, row, col, answer: w.answer, clue: w.clue };
  });

  placements.sort((a, b) => a.number - b.number || a.direction.localeCompare(b.direction));

  return { width, height, cells, placements };
}
