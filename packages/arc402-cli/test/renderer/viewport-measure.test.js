import { test } from 'node:test';
import assert from 'node:assert/strict';
import { measureLogicalEntries, sliceVisibleLogicalEntries } from '../../dist/tui/viewport-measure.js';

test('measureLogicalEntries assigns cumulative row ranges for multiline entries', () => {
  const { measured, totalRows } = measureLogicalEntries([
    { entry: 'a', logicalLines: ['line 1'] },
    { entry: 'b', logicalLines: ['line 2', 'line 3', 'line 4'] },
    { entry: 'c', logicalLines: ['line 5', 'line 6'] },
  ]);

  assert.equal(totalRows, 6);
  assert.deepEqual(
    measured.map((item) => ({ entry: item.entry, rowStart: item.rowStart, rowEnd: item.rowEnd })),
    [
      { entry: 'a', rowStart: 0, rowEnd: 1 },
      { entry: 'b', rowStart: 1, rowEnd: 4 },
      { entry: 'c', rowStart: 4, rowEnd: 6 },
    ],
  );
});

test('sliceVisibleLogicalEntries clips partially visible multiline entries honestly', () => {
  const { measured } = measureLogicalEntries([
    { entry: 'a', logicalLines: ['one'] },
    { entry: 'card', logicalLines: ['two', 'three', 'four'] },
    { entry: 'tail', logicalLines: ['five'] },
  ]);

  const { segments, startRow, endRow, visibleRowCount, padCount } = sliceVisibleLogicalEntries(measured, 1, 3);

  assert.equal(startRow, 1);
  assert.equal(endRow, 4);
  assert.equal(visibleRowCount, 3);
  assert.equal(padCount, 0);
  assert.deepEqual(
    segments.map((segment) => ({
      entry: segment.item.entry,
      sliceStart: segment.sliceStart,
      sliceEnd: segment.sliceEnd,
      isFull: segment.isFull,
    })),
    [
      { entry: 'card', sliceStart: 0, sliceEnd: 3, isFull: true },
    ],
  );

  const clipped = sliceVisibleLogicalEntries(measured, 0, 3);
  assert.deepEqual(
    clipped.segments.map((segment) => ({
      entry: segment.item.entry,
      sliceStart: segment.sliceStart,
      sliceEnd: segment.sliceEnd,
      isFull: segment.isFull,
    })),
    [
      { entry: 'card', sliceStart: 1, sliceEnd: 3, isFull: false },
      { entry: 'tail', sliceStart: 0, sliceEnd: 1, isFull: true },
    ],
  );
});

test('sliceVisibleLogicalEntries pads when viewport is taller than content', () => {
  const { measured } = measureLogicalEntries([
    { entry: 'short', logicalLines: ['one', 'two'] },
  ]);

  const { visibleRowCount, padCount, segments } = sliceVisibleLogicalEntries(measured, 0, 5);

  assert.equal(visibleRowCount, 2);
  assert.equal(padCount, 3);
  assert.equal(segments.length, 1);
  assert.equal(segments[0].isFull, true);
});
