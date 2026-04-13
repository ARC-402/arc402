import React from "react";
import { Box, Text } from "../renderer/index.js";
import type { KernelPayload } from "./kernel-payload";
import { KernelPayloadRenderer } from "./KernelPayloadRenderer";
import { buildKernelPayloadLines } from "./command-renderers";
import { AnsiTextLine } from "./components/AnsiTextLine.js";
import { measureLogicalEntries, sliceVisibleLogicalEntries } from "./viewport-measure.js";

export type ViewportEntry = string | KernelPayload;

interface ViewportProps {
  lines: ViewportEntry[];
  scrollOffset: number;
  isAutoScroll: boolean;
  /** Exact number of rows available for content, computed by App from measured layout. */
  viewportHeight: number;
}

function toLogicalLines(entry: ViewportEntry): string[] {
  return typeof entry === "string" ? [entry] : buildKernelPayloadLines(entry);
}

/**
 * Scrollable output area that fills remaining terminal space.
 *
 * Full kernel payloads still render as structured components when fully inside
 * the viewport. If a payload is only partially visible due to scroll position,
 * the viewport falls back to a clipped text snapshot of the same payload so row
 * accounting stays honest for multiline cards.
 */
export function Viewport({ lines, scrollOffset, isAutoScroll, viewportHeight }: ViewportProps) {
  const { measured } = measureLogicalEntries(lines.map((entry) => ({ entry, logicalLines: toLogicalLines(entry) })));
  const { segments: visibleSegments, padCount } = sliceVisibleLogicalEntries(measured, scrollOffset, viewportHeight);
  const canScrollDown = scrollOffset > 0;

  return (
    <Box flexDirection="column" flexGrow={1} flexShrink={1}>
      <Box flexDirection="column" flexGrow={1} flexShrink={1}>
        {Array.from({ length: padCount }, (_, i) => (
          <AnsiTextLine key={`pad:${i}`} line="" />
        ))}

        {visibleSegments.map((segment, index) => {
          const { item, sliceStart, sliceEnd, isFull } = segment;
          if (typeof item.entry !== "string" && isFull) {
            return (
              <Box key={`payload:${item.rowStart}:${index}`} flexDirection="column">
                <KernelPayloadRenderer payload={item.entry} />
              </Box>
            );
          }

          return item.logicalLines.slice(sliceStart, sliceEnd).map((line, lineIndex) => (
            <AnsiTextLine
              key={`line:${item.rowStart}:${sliceStart + lineIndex}:${index}`}
              line={line}
            />
          ));
        })}
      </Box>
      {canScrollDown && !isAutoScroll && (
        <Box justifyContent="flex-end" flexShrink={0}>
          <Text dimColor>↓ more</Text>
        </Box>
      )}
    </Box>
  );
}
