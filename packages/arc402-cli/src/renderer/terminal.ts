import { Patch } from './diff.js';
import { Cell, Color } from './cell.js';

function colorSeq(c: Color, isBg: boolean): string {
  const code = isBg ? 48 : 38;
  return `\x1b[${code};2;${c.r};${c.g};${c.b}m`;
}

function cellToAnsi(cell: Cell): string {
  let seq = '';
  if (cell.fg) seq += colorSeq(cell.fg, false);
  if (cell.bg) seq += colorSeq(cell.bg, true);
  if (cell.bold) seq += '\x1b[1m';
  if (cell.dim) seq += '\x1b[2m';
  if (cell.italic) seq += '\x1b[3m';
  if (cell.underline) seq += '\x1b[4m';
  seq += cell.char;
  return seq;
}

// Convert a patch to ANSI escape sequences and write to stdout
export function writePatches(patches: Patch[], stdout: NodeJS.WriteStream): void {
  if (patches.length === 0) return;

  let buf = '\x1b[?2026h'; // begin synchronized output

  for (const patch of patches) {
    buf += `\x1b[${patch.row + 1};${patch.col + 1}H`; // position cursor
    buf += '\x1b[0m'; // reset before each patch
    for (const cell of patch.cells) {
      buf += cellToAnsi(cell);
    }
    buf += '\x1b[0m'; // reset after patch
  }

  buf += '\x1b[?2026l'; // end synchronized output
  stdout.write(buf);
}

export function clearScreen(stdout: NodeJS.WriteStream): void {
  stdout.write('\x1b[2J\x1b[H');
}

export function moveCursor(row: number, col: number, stdout: NodeJS.WriteStream): void {
  stdout.write(`\x1b[${row + 1};${col + 1}H`);
}
