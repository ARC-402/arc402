import React from "react";
import { Box, Text } from "../renderer/index.js";
import type { KernelPayload } from "./kernel-payload";
import { KernelPayloadRenderer } from "./KernelPayloadRenderer";

function stripAnsi(text: string): string {
  return text.replace(/\u001B\[[0-9;]*m/g, "");
}

export type ViewportEntry = string | KernelPayload;

interface ViewportProps {
  lines: ViewportEntry[];
  scrollOffset: number;
  isAutoScroll: boolean;
  /** Exact number of rows available for content, computed by App from measured layout. */
  viewportHeight: number;
}

/**
 * Scrollable output area that fills remaining terminal space.
 * Renders strings as Text lines and KernelPayloads as Phase 2 Ink components.
 *
 * NOTE: KernelPayload entries are treated as single logical blocks that always
 * render fully — they are not sliced by the scroll window. Only string lines
 * participate in the scroll window calculation. This keeps the Phase 2
 * components rendering correctly while maintaining scroll for text output.
 *
 * For the viewport height calculation, each payload counts as 1 "slot" in
 * the buffer but renders as a full component block.
 */
export function Viewport({ lines, scrollOffset, isAutoScroll, viewportHeight }: ViewportProps) {
  const totalLines = lines.length;
  let endIdx: number;
  let startIdx: number;

  if (scrollOffset === 0) {
    endIdx = totalLines;
    startIdx = Math.max(0, endIdx - viewportHeight);
  } else {
    endIdx = Math.max(0, totalLines - scrollOffset);
    startIdx = Math.max(0, endIdx - viewportHeight);
  }

  const visibleEntries = lines.slice(startIdx, endIdx);
  const padCount = Math.max(0, viewportHeight - visibleEntries.length);
  const paddedEntries: ViewportEntry[] = [
    ...Array<ViewportEntry>(padCount).fill(""),
    ...visibleEntries,
  ];

  const canScrollDown = scrollOffset > 0;

  return (
    <Box flexDirection="column" flexGrow={1} flexShrink={1}>
      <Box flexDirection="column" flexGrow={1} flexShrink={1}>
        {paddedEntries.map((entry, i) =>
          typeof entry === "string" ? (
            <Text key={i}>{stripAnsi(entry)}</Text>
          ) : (
            <Box key={i} flexDirection="column" marginBottom={1}>
              <KernelPayloadRenderer payload={entry} />
            </Box>
          )
        )}
      </Box>
      {canScrollDown && !isAutoScroll && (
        <Box justifyContent="flex-end" flexShrink={0}>
          <Text dimColor>↓ more</Text>
        </Box>
      )}
    </Box>
  );
}
