import React from "react";
import { Box } from "../../renderer/index.js";
import { ThemedText } from "../../renderer/ThemedText.js";

export interface CompletionDropdownProps {
  candidates: string[];
  selectedIndex: number;
  visible: boolean;
}

const MAX_VISIBLE = 8;

export function CompletionDropdown({
  candidates,
  selectedIndex,
  visible,
}: CompletionDropdownProps) {
  if (!visible || candidates.length === 0) return null;

  // Window the list if there are too many candidates
  let startIdx = 0;
  if (candidates.length > MAX_VISIBLE) {
    startIdx = Math.max(0, selectedIndex - Math.floor(MAX_VISIBLE / 2));
    startIdx = Math.min(startIdx, candidates.length - MAX_VISIBLE);
  }
  const visibleCandidates = candidates.slice(
    startIdx,
    startIdx + MAX_VISIBLE
  );

  return (
    <Box flexDirection="column" marginLeft={4}>
      <Box>
        <ThemedText themeColor="dim">{"┌─ completions ─"}</ThemedText>
      </Box>
      {visibleCandidates.map((candidate, i) => {
        const actualIdx = startIdx + i;
        const isSelected = actualIdx === selectedIndex;
        return (
          <Box key={candidate}>
            <ThemedText themeColor="dim">{"│"}</ThemedText>
            <ThemedText themeColor={isSelected ? "primary" : "white"} bold={isSelected}>
              {isSelected ? " ▸ " : "   "}
              {candidate}
            </ThemedText>
          </Box>
        );
      })}
      <Box>
        <ThemedText themeColor="dim">{"└─"}</ThemedText>
        {candidates.length > MAX_VISIBLE && (
          <ThemedText themeColor="dim">{" "}({candidates.length} total)</ThemedText>
        )}
      </Box>
    </Box>
  );
}
