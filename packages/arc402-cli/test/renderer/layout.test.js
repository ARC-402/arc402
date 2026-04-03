import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLayoutNode, calculateLayout, freeLayoutNode } from '../../dist/renderer/layout.js';

test('createLayoutNode({ width: 80, height: 24 }) creates a node', () => {
  const node = createLayoutNode({ width: 80, height: 24 });
  assert.ok(node.yogaNode, 'should have yogaNode');
  assert.equal(node.children.length, 0);
  // verify Yoga actually stored the width/height
  assert.equal(node.yogaNode.getWidth().value, 80);
  assert.equal(node.yogaNode.getHeight().value, 24);
  node.yogaNode.freeRecursive();
});

test('calculateLayout: root 80×24 with two row-children each gets width 40', () => {
  const root = createLayoutNode({ width: 80, height: 24, flexDirection: 'row' });
  const child1 = createLayoutNode({ flexGrow: 1 });
  const child2 = createLayoutNode({ flexGrow: 1 });
  root.children.push(child1, child2);

  calculateLayout(root, 80, 24);

  assert.equal(root.width, 80);
  assert.equal(root.height, 24);
  assert.equal(child1.width, 40);
  assert.equal(child2.width, 40);

  freeLayoutNode(root);
});

test('calculateLayout: padding reduces inner child area', () => {
  const root = createLayoutNode({ width: 80, height: 24, flexDirection: 'row', padding: 4 });
  const child = createLayoutNode({ flexGrow: 1 });
  root.children.push(child);

  calculateLayout(root, 80, 24);

  // Inner width = 80 - 4*2 = 72, inner height = 24 - 4*2 = 16
  assert.equal(child.width, 72);
  assert.equal(child.height, 16);
  assert.equal(child.x, 4);
  assert.equal(child.y, 4);

  freeLayoutNode(root);
});

test('freeLayoutNode does not throw', () => {
  const root = createLayoutNode({ width: 80, height: 24 });
  const child = createLayoutNode({ flexGrow: 1 });
  root.children.push(child);
  assert.doesNotThrow(() => freeLayoutNode(root));
});
