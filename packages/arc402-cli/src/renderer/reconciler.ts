// eslint-disable-next-line @typescript-eslint/no-require-imports
const ReactReconciler = require('react-reconciler');
import { DOMNode, createNode, appendChild, removeChild, insertBefore } from './dom.js';
import type { BoxStyle } from './layout.js';
import type { Color } from './cell.js';
import { COLORS } from './cell.js';

// Props types
interface BoxProps { style?: BoxStyle; children?: unknown; }
interface TextProps {
  color?: Color | keyof typeof COLORS | string;
  bold?: boolean;
  dim?: boolean;
  inverse?: boolean;
  italic?: boolean;
  underline?: boolean;
  children?: unknown;
}
type Props = BoxProps | TextProps;

let onCommit: (() => void) | null = null;

export function setOnCommit(fn: () => void): void {
  onCommit = fn;
}

function resolveColor(color?: Color | keyof typeof COLORS | string): Color | null {
  if (!color) return null;
  if (typeof color === 'string') {
    if (color in COLORS) {
      return COLORS[color as keyof typeof COLORS] ?? null;
    }
    const hex = color.trim().match(/^#?([0-9a-fA-F]{6})$/);
    if (hex) {
      const value = hex[1];
      return {
        r: Number.parseInt(value.slice(0, 2), 16),
        g: Number.parseInt(value.slice(2, 4), 16),
        b: Number.parseInt(value.slice(4, 6), 16),
      };
    }
    return null;
  }
  return color;
}

function applyProps(node: DOMNode, props: Props): void {
  if (node.type === 'box') {
    const boxProps = props as BoxProps;
    if (boxProps.style !== undefined) {
      node.style = boxProps.style;
    }
  } else if (node.type === 'text') {
    const textProps = props as TextProps;
    const fg = resolveColor(textProps.color);
    node.textStyle = {
      fg: textProps.inverse ? null : fg,
      bg: textProps.inverse ? (fg ?? COLORS.white) : null,
      bold: textProps.bold,
      dim: textProps.dim,
      italic: textProps.italic,
      underline: textProps.underline,
    };
  }
}

// react-reconciler v0.26.x host config
const hostConfig = {
  supportsMutation: true,
  supportsPersistence: false,
  supportsHydration: false,
  isPrimaryRenderer: true,
  warnsIfNotActing: false,
  now: Date.now,

  createInstance(type: string, props: Props): DOMNode {
    const node = createNode(type === 'arc-text' ? 'text' : 'box');
    applyProps(node, props);
    return node;
  },

  createTextInstance(text: string): DOMNode {
    const node = createNode('text');
    node.text = text;
    return node;
  },

  appendInitialChild: appendChild,
  appendChild,
  insertBefore,
  removeChild,
  appendChildToContainer: appendChild,
  insertInContainerBefore: insertBefore,
  removeChildFromContainer: removeChild,

  prepareForCommit() { return null; },

  resetAfterCommit() {
    if (onCommit) onCommit();
  },

  getPublicInstance(instance: DOMNode) { return instance; },
  getRootHostContext() { return {}; },
  getChildHostContext() { return {}; },
  shouldSetTextContent() { return false; },
  finalizeInitialChildren() { return false; },
  prepareUpdate() { return {}; },

  commitUpdate(node: DOMNode, _updatePayload: unknown, _type: string, _oldProps: Props, newProps: Props) {
    applyProps(node, newProps);
  },

  commitTextUpdate(node: DOMNode, _old: string, newText: string) {
    node.text = newText;
  },

  clearContainer() {},
  scheduleTimeout: setTimeout,
  cancelTimeout: clearTimeout,
  noTimeout: -1,

  // v0.26 specific
  getInstanceFromNode() { return null; },
  beforeActiveInstanceBlur() {},
  afterActiveInstanceBlur() {},
  preparePortalMount() {},
  getInstanceFromScope() { return null; },
  detachDeletedInstance() {},
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const reconciler: any = ReactReconciler(hostConfig);
