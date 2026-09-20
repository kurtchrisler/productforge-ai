// Deterministic-shape (randomized placement) word search generator: places
// each word in one of the 8 compass directions at a random valid position
// (allowing letter-matching crossings, same as a real word search), then
// fills every remaining empty cell with a random letter. Placements are kept
// so the answer-key page can highlight exactly where each word landed.

export type WordSearchPlacement = {
  word: string;
  row: number;
  col: number;
  dRow: -1 | 0 | 1;
  dCol: -1 | 0 | 1;
};

export type WordSearchGrid = {
  size: number;
  cells: string[][];
  placements: WordSearchPlacement[];
  missingWords: string[]; // words that couldn't find a spot (rare, small grids only)
};

const DIRECTIONS: { dRow: -1 | 0 | 1; dCol: -1 | 0 | 1 }[] = [
  { dRow: 0, dCol: 1 },
  { dRow: 0, dCol: -1 },
  { dRow: 1, dCol: 0 },
  { dRow: -1, dCol: 0 },
  { dRow: 1, dCol: 1 },
  { dRow: 1, dCol: -1 },
  { dRow: -1, dCol: 1 },
  { dRow: -1, dCol: -1 },
];

function cleanWord(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z]/g, "");
}

export function generateWordSearch(rawWords: string[], size: number): WordSearchGrid {
  const seen = new Set<string>();
  const words = rawWords
    .map(cleanWord)
    .filter((w) => w.length >= 3 && w.length <= size)
    .filter((w) => {
      if (seen.has(w)) return false;
      seen.add(w);
      return true;
    })
    .sort((a, b) => b.length - a.length);

  const cells: (string | null)[][] = Array.from({ length: size }, () =>
    new Array(size).fill(null)
  );
  const placements: WordSearchPlacement[] = [];
  const missingWords: string[] = [];

  function fits(word: string, row: number, col: number, dRow: number, dCol: number): boolean {
    for (let i = 0; i < word.length; i++) {
      const r = row + dRow * i;
      const c = col + dCol * i;
      if (r < 0 || r >= size || c < 0 || c >= size) return false;
      const existing = cells[r][c];
      if (existing !== null && existing !== word[i]) return false;
    }
    return true;
  }

  function place(word: string, row: number, col: number, dRow: -1 | 0 | 1, dCol: -1 | 0 | 1) {
    for (let i = 0; i < word.length; i++) {
      cells[row + dRow * i][col + dCol * i] = word[i];
    }
    placements.push({ word, row, col, dRow, dCol });
  }

  for (const word of words) {
    let ok = false;
    for (let attempt = 0; attempt < 300 && !ok; attempt++) {
      const dir = DIRECTIONS[Math.floor(Math.random() * DIRECTIONS.length)];
      const row = Math.floor(Math.random() * size);
      const col = Math.floor(Math.random() * size);
      if (fits(word, row, col, dir.dRow, dir.dCol)) {
        place(word, row, col, dir.dRow, dir.dCol);
        ok = true;
      }
    }
    if (!ok) missingWords.push(word);
  }

  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (cells[r][c] === null) {
        cells[r][c] = alphabet[Math.floor(Math.random() * alphabet.length)];
      }
    }
  }

  return { size, cells: cells as string[][], placements, missingWords };
}
