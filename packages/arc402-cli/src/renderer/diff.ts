import { Frame, Cell, cellsEqual } from './cell.js';

export interface Patch {
  row: number;
  col: number;
  cells: Cell[]; // consecutive run of cells to write
}

// Compare front (current screen) vs back (desired screen)
// Return minimal set of patches needed to update the screen
export function diff(front: Frame, back: Frame): Patch[] {
  const patches: Patch[] = [];
  const rows = Math.min(front.length, back.length);

  for (let row = 0; row < rows; row++) {
    const frontRow = front[row];
    const backRow = back[row];
    const cols = Math.min(frontRow.length, backRow.length);

    let currentPatch: Patch | null = null;

    for (let col = 0; col < cols; col++) {
      if (!cellsEqual(frontRow[col], backRow[col])) {
        if (currentPatch && currentPatch.row === row && currentPatch.col + currentPatch.cells.length === col) {
          // Extend current run
          currentPatch.cells.push(backRow[col]);
        } else {
          // Start a new patch
          currentPatch = { row, col, cells: [backRow[col]] };
          patches.push(currentPatch);
        }
      } else {
        // Unchanged — break the current run
        currentPatch = null;
      }
    }
  }

  return patches;
}

// Merge patches that are adjacent in the same row
export function optimizePatches(patches: Patch[]): Patch[] {
  if (patches.length === 0) return [];

  const result: Patch[] = [];
  let current = { ...patches[0], cells: [...patches[0].cells] };

  for (let i = 1; i < patches.length; i++) {
    const next = patches[i];
    if (next.row === current.row && current.col + current.cells.length === next.col) {
      current.cells = current.cells.concat(next.cells);
    } else {
      result.push(current);
      current = { ...next, cells: [...next.cells] };
    }
  }
  result.push(current);

  return result;
}
