export interface LogicalViewportEntry<T = unknown> {
  entry: T;
  logicalLines: string[];
  rowStart: number;
  rowEnd: number;
}

export interface VisibleLogicalSegment<T = unknown> {
  item: LogicalViewportEntry<T>;
  sliceStart: number;
  sliceEnd: number;
  isFull: boolean;
}

export function measureLogicalEntries<T>(
  items: Array<{ entry: T; logicalLines: string[] }>,
): { measured: LogicalViewportEntry<T>[]; totalRows: number } {
  let cursor = 0;
  const measured = items.map(({ entry, logicalLines }) => {
    const rowStart = cursor;
    const rowEnd = rowStart + logicalLines.length;
    cursor = rowEnd;
    return { entry, logicalLines, rowStart, rowEnd };
  });
  return { measured, totalRows: cursor };
}

export function sliceVisibleLogicalEntries<T>(
  measured: LogicalViewportEntry<T>[],
  scrollOffset: number,
  viewportHeight: number,
): {
  segments: VisibleLogicalSegment<T>[];
  totalRows: number;
  startRow: number;
  endRow: number;
  visibleRowCount: number;
  padCount: number;
} {
  const totalRows = measured.length > 0 ? measured[measured.length - 1]!.rowEnd : 0;
  const endRow = Math.max(0, totalRows - scrollOffset);
  const startRow = Math.max(0, endRow - viewportHeight);

  const segments = measured.flatMap((item) => {
    if (item.rowEnd <= startRow || item.rowStart >= endRow) return [];
    const sliceStart = Math.max(0, startRow - item.rowStart);
    const sliceEnd = Math.min(item.logicalLines.length, endRow - item.rowStart);
    return [{
      item,
      sliceStart,
      sliceEnd,
      isFull: sliceStart === 0 && sliceEnd === item.logicalLines.length,
    }];
  });

  const visibleRowCount = segments.reduce((sum, segment) => sum + (segment.sliceEnd - segment.sliceStart), 0);
  const padCount = Math.max(0, viewportHeight - visibleRowCount);

  return { segments, totalRows, startRow, endRow, visibleRowCount, padCount };
}
