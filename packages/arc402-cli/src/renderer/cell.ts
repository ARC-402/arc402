export interface Color {
  r: number; g: number; b: number; // 0-255
}

// Named ANSI colors as Color-compatible values
export const COLORS = {
  cyan:   { r: 34,  g: 211, b: 238 }, // #22d3ee — ARC-402 primary
  green:  { r: 74,  g: 222, b: 128 }, // #4ade80
  yellow: { r: 251, g: 191, b: 36  }, // #fbbf24
  red:    { r: 248, g: 113, b: 113 }, // #f87171
  slate:  { r: 148, g: 163, b: 184 }, // #94a3b8
  dim:    { r: 71,  g: 85,  b: 105 }, // #475569
  white:  { r: 255, g: 255, b: 255 },
} as const;

export interface Cell {
  char: string;      // single character, space = empty
  fg: Color | null;  // null = terminal default
  bg: Color | null;
  bold: boolean;
  dim: boolean;
  italic: boolean;
  underline: boolean;
}

export type Frame = Cell[][];

export function emptyCell(): Cell {
  return { char: ' ', fg: null, bg: null, bold: false, dim: false, italic: false, underline: false };
}

export function createFrame(rows: number, cols: number): Frame {
  return Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => emptyCell())
  );
}

export function cellsEqual(a: Cell, b: Cell): boolean {
  if (a.char !== b.char) return false;
  if (a.bold !== b.bold) return false;
  if (a.dim !== b.dim) return false;
  if (a.italic !== b.italic) return false;
  if (a.underline !== b.underline) return false;
  // fg comparison
  if (a.fg === null && b.fg !== null) return false;
  if (a.fg !== null && b.fg === null) return false;
  if (a.fg !== null && b.fg !== null) {
    if (a.fg.r !== b.fg.r || a.fg.g !== b.fg.g || a.fg.b !== b.fg.b) return false;
  }
  // bg comparison
  if (a.bg === null && b.bg !== null) return false;
  if (a.bg !== null && b.bg === null) return false;
  if (a.bg !== null && b.bg !== null) {
    if (a.bg.r !== b.bg.r || a.bg.g !== b.bg.g || a.bg.b !== b.bg.b) return false;
  }
  return true;
}
