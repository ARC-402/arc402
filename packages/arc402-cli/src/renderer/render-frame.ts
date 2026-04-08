import { DOMNode } from './dom.js';
import { LayoutNode, createLayoutNode } from './layout.js';
import { Frame, Color } from './cell.js';

interface TextStyle {
  fg: Color | null;
  bg: Color | null;
  bold: boolean;
  dim: boolean;
  italic: boolean;
  underline: boolean;
}

const DEFAULT_STYLE: TextStyle = {
  fg: null, bg: null, bold: false, dim: false, italic: false, underline: false,
};

interface StyledChar {
  char: string;
  style: TextStyle;
}

const ANSI_ESCAPE_REGEX = /\u001B\[[0-9;]*[A-Za-z]/g;

function stripAnsi(value: string): string {
  return value.replace(ANSI_ESCAPE_REGEX, '');
}

/** Build a LayoutNode tree mirroring the DOMNode tree */
export function buildLayoutTree(dom: DOMNode): LayoutNode {
  if (dom.type === 'root' || dom.type === 'box') {
    const layout = createLayoutNode(dom.style ?? {});
    for (const child of dom.children) {
      const childLayout = buildLayoutTree(child);
      layout.children.push(childLayout);
    }
    return layout;
  }

  const flatText = flattenText(dom);
  const textLines = flatText.split('\n');
  const textWidth = textLines.reduce((max, line) => Math.max(max, line.length), 0);
  return createLayoutNode({
    width: textWidth || 1,
    height: flatText.length > 0 ? Math.max(1, textLines.length) : 0,
  });
}

function flattenText(dom: DOMNode): string {
  if (dom.text !== undefined) return stripAnsi(dom.text);
  return dom.children.map(flattenText).join('');
}

/** Walk DOMNode + LayoutNode trees in parallel, write to frame */
export function renderToFrame(dom: DOMNode, layout: LayoutNode, frame: Frame): void {
  renderNode(dom, layout, frame, DEFAULT_STYLE);
}

function renderNode(dom: DOMNode, layout: LayoutNode, frame: Frame, inherited: TextStyle): void {
  const rows = frame.length;
  const cols = rows > 0 ? frame[0].length : 0;
  const { x, y, width, height } = layout;

  if (dom.type === 'root' || dom.type === 'box') {
    for (let i = 0; i < dom.children.length; i++) {
      if (i < layout.children.length) {
        renderNode(dom.children[i], layout.children[i], frame, inherited);
      }
    }
    return;
  }

  const chars = collectStyledChars(dom, inherited);
  const renderWidth = Math.max(1, Math.min(width || cols, Math.max(1, cols - Math.floor(x))));
  const renderHeight = Math.max(0, Math.min(height || rows, Math.max(0, rows - Math.floor(y))));
  let cx = 0;
  let cy = 0;

  for (const { char, style } of chars) {
    if (char === '\n') {
      cx = 0;
      cy++;
      if (cy >= renderHeight) break;
      continue;
    }
    if (cx >= renderWidth) {
      cx = 0;
      cy++;
    }
    if (cy >= renderHeight) break;
    const row = Math.floor(y + cy);
    const col = Math.floor(x + cx);
    if (row >= 0 && row < rows && col >= 0 && col < cols) {
      const cell = frame[row][col];
      cell.char = char;
      cell.fg = style.fg;
      cell.bg = style.bg;
      cell.bold = style.bold;
      cell.dim = style.dim;
      cell.italic = style.italic;
      cell.underline = style.underline;
    }
    cx++;
  }
}

function collectStyledChars(dom: DOMNode, inherited: TextStyle): StyledChar[] {
  const merged = mergeStyle(inherited, dom.textStyle);
  if (dom.text !== undefined) {
    return [...stripAnsi(dom.text)].map(ch => ({ char: ch, style: merged }));
  }
  const result: StyledChar[] = [];
  for (const child of dom.children) {
    result.push(...collectStyledChars(child, merged));
  }
  return result;
}

function mergeStyle(parent: TextStyle, child?: DOMNode['textStyle']): TextStyle {
  if (!child) return parent;
  return {
    fg: child.fg !== undefined ? child.fg : parent.fg,
    bg: child.bg !== undefined ? child.bg : parent.bg,
    bold: child.bold !== undefined ? child.bold : parent.bold,
    dim: child.dim !== undefined ? child.dim : parent.dim,
    italic: child.italic !== undefined ? child.italic : parent.italic,
    underline: child.underline !== undefined ? child.underline : parent.underline,
  };
}
