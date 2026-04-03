import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFrame, emptyCell, cellsEqual, COLORS } from '../../dist/renderer/cell.js';

test('createFrame(3, 80) creates correct dimensions', () => {
  const frame = createFrame(3, 80);
  assert.equal(frame.length, 3);
  for (const row of frame) {
    assert.equal(row.length, 80);
  }
});

test('emptyCell() is a space with all nulls/false', () => {
  const cell = emptyCell();
  assert.equal(cell.char, ' ');
  assert.equal(cell.fg, null);
  assert.equal(cell.bg, null);
  assert.equal(cell.bold, false);
  assert.equal(cell.dim, false);
  assert.equal(cell.italic, false);
  assert.equal(cell.underline, false);
});

test('cellsEqual() correctly identifies equal cells', () => {
  const a = emptyCell();
  const b = emptyCell();
  assert.equal(cellsEqual(a, b), true);
});

test('cellsEqual() detects different char', () => {
  const a = emptyCell();
  const b = { ...emptyCell(), char: 'X' };
  assert.equal(cellsEqual(a, b), false);
});

test('cellsEqual() detects different fg color', () => {
  const a = { ...emptyCell(), fg: COLORS.cyan };
  const b = { ...emptyCell(), fg: COLORS.green };
  assert.equal(cellsEqual(a, b), false);
});

test('cellsEqual() detects fg null vs color', () => {
  const a = emptyCell();
  const b = { ...emptyCell(), fg: COLORS.cyan };
  assert.equal(cellsEqual(a, b), false);
});

test('cellsEqual() detects different bold', () => {
  const a = emptyCell();
  const b = { ...emptyCell(), bold: true };
  assert.equal(cellsEqual(a, b), false);
});

test('cellsEqual() handles equal non-null colors', () => {
  const a = { ...emptyCell(), fg: { r: 34, g: 211, b: 238 } };
  const b = { ...emptyCell(), fg: { r: 34, g: 211, b: 238 } };
  assert.equal(cellsEqual(a, b), true);
});
