import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFrame, emptyCell } from '../../dist/renderer/cell.js';
import { diff, optimizePatches } from '../../dist/renderer/diff.js';

function makeCell(char) {
  return { ...emptyCell(), char };
}

function fillFrame(frame, char) {
  for (let r = 0; r < frame.length; r++) {
    for (let c = 0; c < frame[r].length; c++) {
      frame[r][c] = makeCell(char);
    }
  }
  return frame;
}

test('blank frame → content frame: produces correct patches', () => {
  const front = createFrame(1, 3);
  const back = createFrame(1, 3);
  back[0][0] = makeCell('A');
  back[0][1] = makeCell('B');
  back[0][2] = makeCell('C');

  const patches = diff(front, back);
  assert.ok(patches.length > 0);
  // All three cells changed — should be one merged patch
  const allCells = patches.flatMap(p => p.cells);
  assert.equal(allCells.map(c => c.char).join(''), 'ABC');
});

test('content frame → blank frame: produces correct patches', () => {
  const front = createFrame(1, 3);
  fillFrame(front, 'X');
  const back = createFrame(1, 3);

  const patches = diff(front, back);
  assert.ok(patches.length > 0);
});

test('partial change: only changed cells in patches', () => {
  const front = createFrame(1, 4);
  const back = createFrame(1, 4);
  back[0][2] = makeCell('Z');

  const patches = diff(front, back);
  assert.equal(patches.length, 1);
  assert.equal(patches[0].col, 2);
  assert.equal(patches[0].cells.length, 1);
  assert.equal(patches[0].cells[0].char, 'Z');
});

test('no change: empty patch array', () => {
  const front = createFrame(2, 4);
  const back = createFrame(2, 4);
  const patches = diff(front, back);
  assert.equal(patches.length, 0);
});

test('adjacent changes in same row: merged into single patch', () => {
  const front = createFrame(1, 5);
  const back = createFrame(1, 5);
  back[0][1] = makeCell('A');
  back[0][2] = makeCell('B');

  const patches = diff(front, back);
  assert.equal(patches.length, 1);
  assert.equal(patches[0].col, 1);
  assert.equal(patches[0].cells.length, 2);
});

test('changes in different rows: separate patches', () => {
  const front = createFrame(3, 4);
  const back = createFrame(3, 4);
  back[0][0] = makeCell('A');
  back[2][0] = makeCell('B');

  const patches = diff(front, back);
  assert.equal(patches.length, 2);
  assert.equal(patches[0].row, 0);
  assert.equal(patches[1].row, 2);
});

test('optimizePatches merges adjacent patches in same row', () => {
  const cell = makeCell('X');
  const patches = [
    { row: 0, col: 0, cells: [cell] },
    { row: 0, col: 1, cells: [cell] },
    { row: 0, col: 2, cells: [cell] },
  ];
  const optimized = optimizePatches(patches);
  assert.equal(optimized.length, 1);
  assert.equal(optimized[0].cells.length, 3);
});

test('optimizePatches keeps non-adjacent patches separate', () => {
  const cell = makeCell('X');
  const patches = [
    { row: 0, col: 0, cells: [cell] },
    { row: 0, col: 2, cells: [cell] }, // gap at col 1
  ];
  const optimized = optimizePatches(patches);
  assert.equal(optimized.length, 2);
});
