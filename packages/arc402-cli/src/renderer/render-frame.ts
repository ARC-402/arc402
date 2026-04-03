import { DOMNode } from './dom.js';
import { LayoutNode, createLayoutNode, calculateLayout, freeLayoutNode, BoxStyle } from './layout.js';
import { Frame, Cell, Color } from './cell.js';

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

  // Text node: width = text length, height = 1
  const flatText = flattenText(dom);
  const textLen = flatText.length;
  return createLayoutNode({
    width: textLen || 1,
    height: textLen > 0 ? 1 : 0,
  });
}

function flattenText(dom: DOMNode): string {
  if (dom.text !== undefined) return dom.text;
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

  // Text node
  const chars = collectStyledChars(dom, inherited);
  let cx = 0, cy = 0;
  for (const { char, style } of chars) {
    if (cx >= width) { cx = 0; cy++; }
    if (cy >= height) break;
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
    return [...dom.text].map(ch => ({ char: ch, style: merged }));
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
    fg:        child.fg !== undefined ? child.fg : parent.fg,
    bg:        child.bg !== undefined ? child.bg : parent.bg,
    bold:      child.bold !== undefined ? child.bold : parent.bold,
    dim:       child.dim !== undefined ? child.dim : parent.dim,
    italic:    child.italic !== undefined ? child.italic : parent.italic,
    underline: child.underline !== undefined ? child.underline : parent.underline,
  };
}
