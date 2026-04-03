// eslint-disable-next-line @typescript-eslint/no-require-imports
const Yoga = require('yoga-layout-prebuilt') as typeof import('yoga-layout-prebuilt');

// A layout node: wraps a Yoga node + stores computed position
export interface LayoutNode {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  yogaNode: any;
  x: number;      // computed absolute x (col)
  y: number;      // computed absolute y (row)
  width: number;  // computed width
  height: number; // computed height
  children: LayoutNode[];
}

export interface BoxStyle {
  width?: number | string;  // number = fixed, '50%' = percentage
  height?: number | string;
  flexDirection?: 'row' | 'column';
  flexGrow?: number;
  flexShrink?: number;
  padding?: number;
  paddingTop?: number;
  paddingBottom?: number;
  paddingLeft?: number;
  paddingRight?: number;
  margin?: number;
  marginTop?: number;
  marginBottom?: number;
  marginLeft?: number;
  marginRight?: number;
  alignItems?: 'flex-start' | 'flex-end' | 'center' | 'stretch';
  justifyContent?: 'flex-start' | 'flex-end' | 'center' | 'space-between' | 'space-around';
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ALIGN_MAP: Record<string, any> = {
  'flex-start': Yoga.ALIGN_FLEX_START,
  'flex-end':   Yoga.ALIGN_FLEX_END,
  'center':     Yoga.ALIGN_CENTER,
  'stretch':    Yoga.ALIGN_STRETCH,
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const JUSTIFY_MAP: Record<string, any> = {
  'flex-start':    Yoga.JUSTIFY_FLEX_START,
  'flex-end':      Yoga.JUSTIFY_FLEX_END,
  'center':        Yoga.JUSTIFY_CENTER,
  'space-between': Yoga.JUSTIFY_SPACE_BETWEEN,
  'space-around':  Yoga.JUSTIFY_SPACE_AROUND,
};

export function createLayoutNode(style: BoxStyle): LayoutNode {
  const node = Yoga.Node.create();

  // Width
  if (style.width !== undefined) {
    if (typeof style.width === 'string' && style.width.endsWith('%')) {
      node.setWidthPercent(parseFloat(style.width));
    } else if (typeof style.width === 'number') {
      node.setWidth(style.width);
    }
  }

  // Height
  if (style.height !== undefined) {
    if (typeof style.height === 'string' && style.height.endsWith('%')) {
      node.setHeightPercent(parseFloat(style.height));
    } else if (typeof style.height === 'number') {
      node.setHeight(style.height);
    }
  }

  // Flex direction
  if (style.flexDirection !== undefined) {
    node.setFlexDirection(style.flexDirection === 'row' ? Yoga.FLEX_DIRECTION_ROW : Yoga.FLEX_DIRECTION_COLUMN);
  }

  // Flex grow / shrink
  if (style.flexGrow !== undefined)   node.setFlexGrow(style.flexGrow);
  if (style.flexShrink !== undefined) node.setFlexShrink(style.flexShrink);

  // Padding (shorthand first, then overrides)
  if (style.padding !== undefined)       node.setPadding(Yoga.EDGE_ALL, style.padding);
  if (style.paddingTop !== undefined)    node.setPadding(Yoga.EDGE_TOP, style.paddingTop);
  if (style.paddingBottom !== undefined) node.setPadding(Yoga.EDGE_BOTTOM, style.paddingBottom);
  if (style.paddingLeft !== undefined)   node.setPadding(Yoga.EDGE_LEFT, style.paddingLeft);
  if (style.paddingRight !== undefined)  node.setPadding(Yoga.EDGE_RIGHT, style.paddingRight);

  // Margin
  if (style.margin !== undefined)       node.setMargin(Yoga.EDGE_ALL, style.margin);
  if (style.marginTop !== undefined)    node.setMargin(Yoga.EDGE_TOP, style.marginTop);
  if (style.marginBottom !== undefined) node.setMargin(Yoga.EDGE_BOTTOM, style.marginBottom);
  if (style.marginLeft !== undefined)   node.setMargin(Yoga.EDGE_LEFT, style.marginLeft);
  if (style.marginRight !== undefined)  node.setMargin(Yoga.EDGE_RIGHT, style.marginRight);

  // Align / justify
  if (style.alignItems !== undefined) {
    node.setAlignItems(ALIGN_MAP[style.alignItems] ?? Yoga.ALIGN_FLEX_START);
  }
  if (style.justifyContent !== undefined) {
    node.setJustifyContent(JUSTIFY_MAP[style.justifyContent] ?? Yoga.JUSTIFY_FLEX_START);
  }

  return {
    yogaNode: node,
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    children: [],
  };
}

function populateComputedValues(node: LayoutNode, offsetX: number, offsetY: number): void {
  const layout = node.yogaNode.getComputedLayout();
  node.x      = offsetX + layout.left;
  node.y      = offsetY + layout.top;
  node.width  = layout.width;
  node.height = layout.height;

  for (const child of node.children) {
    populateComputedValues(child, node.x, node.y);
  }
}

export function calculateLayout(root: LayoutNode, availableWidth: number, availableHeight: number): void {
  // Attach children to Yoga tree
  function attachChildren(node: LayoutNode): void {
    for (let i = 0; i < node.children.length; i++) {
      const child = node.children[i];
      node.yogaNode.insertChild(child.yogaNode, i);
      attachChildren(child);
    }
  }
  attachChildren(root);

  root.yogaNode.calculateLayout(availableWidth, availableHeight, Yoga.DIRECTION_LTR);
  populateComputedValues(root, 0, 0);
}

export function freeLayoutNode(node: LayoutNode): void {
  for (const child of node.children) {
    freeLayoutNode(child);
  }
  node.yogaNode.freeRecursive();
}
