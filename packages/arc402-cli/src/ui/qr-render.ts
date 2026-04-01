import QRCode from "qrcode";

export interface QRRenderOptions {
  /** Error correction level. L = smallest QR. Default: 'L' */
  errorCorrection?: "L" | "M" | "Q" | "H";
  /** Quiet zone size in modules. Default: 1 (standard is 4, but 1 suffices for terminal) */
  quiet?: number;
  /** Invert colors for dark terminal backgrounds. Default: true */
  invert?: boolean;
}

/**
 * Render a QR code as terminal-friendly half-block Unicode characters.
 * Returns an array of strings, one per terminal row.
 *
 * Uses qrcode library for matrix generation, custom renderer for compact output.
 * Key optimizations vs qrcode-terminal:
 *   - Error correction L (not M) — ~20% fewer modules
 *   - Quiet zone 1 (not 4) — saves ~6 rows
 *   - Half-block chars: each terminal row = 2 QR module rows
 */
export function renderQR(data: string, options?: QRRenderOptions): string[] {
  const ec = options?.errorCorrection ?? "L";
  const quiet = options?.quiet ?? 1;
  const invert = options?.invert ?? true;

  // Generate QR matrix
  const qr = QRCode.create(data, {
    errorCorrectionLevel: ec,
  });

  const size = qr.modules.size;
  const modules = qr.modules.data;

  // Helper: is module at (row, col) dark? (with quiet zone)
  const totalSize = size + quiet * 2;
  const isDark = (row: number, col: number): boolean => {
    const r = row - quiet;
    const c = col - quiet;
    if (r < 0 || r >= size || c < 0 || c >= size) return false;
    return modules[r * size + c] === 1;
  };

  const lines: string[] = [];

  // Process 2 rows at a time using half-block characters
  for (let row = 0; row < totalSize; row += 2) {
    let line = "";
    for (let col = 0; col < totalSize; col++) {
      const top = isDark(row, col);
      const bottom = row + 1 < totalSize ? isDark(row + 1, col) : false;

      if (invert) {
        // Dark terminal: dark modules = space (background), light = filled
        if (top && bottom) {
          line += " ";       // both dark → background
        } else if (top && !bottom) {
          line += "▄";       // top dark, bottom light → bottom half filled
        } else if (!top && bottom) {
          line += "▀";       // top light, bottom dark → top half filled
        } else {
          line += "█";       // both light → full block
        }
      } else {
        // Light terminal: dark modules = filled
        if (top && bottom) {
          line += "█";
        } else if (top && !bottom) {
          line += "▀";
        } else if (!top && bottom) {
          line += "▄";
        } else {
          line += " ";
        }
      }
    }
    lines.push(line);
  }

  return lines;
}

/**
 * Render QR code to stdout (for non-TUI / child process context).
 * Drop-in replacement for qrcode-terminal.generate().
 */
export function printQR(data: string, options?: QRRenderOptions): void {
  const lines = renderQR(data, options);
  for (const line of lines) {
    console.log("  " + line);
  }
}
