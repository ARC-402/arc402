import React from "react";
import { Box, useInput } from "../../renderer/index.js";
import { ThemedText } from "../../renderer/ThemedText.js";
import type { HarnessChoice } from "../../chat/harness.js";

interface ChatHarnessSelectorProps {
  choices: HarnessChoice[];
  selectedIndex: number;
  onMove: (delta: number) => void;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ChatHarnessSelector({ choices, selectedIndex, onMove, onConfirm, onCancel }: ChatHarnessSelectorProps) {
  useInput((event) => {
    if (event.key === "up" || event.key === "shift-tab") onMove(-1);
    else if (event.key === "down" || event.key === "tab") onMove(1);
    else if (event.key === "enter") onConfirm();
    else if (event.key === "escape") onCancel();
  });

  return (
    <Box flexDirection="column" marginLeft={2}>
      <ThemedText variant="header">◈ Select chat harness</ThemedText>
      {choices.map((choice, index) => {
        const selected = index === selectedIndex;
        const badge = choice.readiness.ready ? "ready" : "setup needed";
        return (
          <ThemedText key={choice.harness} themeColor={selected ? "primary" : "white"} bold={selected}>
            {selected ? "  ▶ " : "    "}
            {`${choice.label}, ${badge}: ${choice.readiness.summary}`}
          </ThemedText>
        );
      })}
      <ThemedText themeColor="dim">  ↑↓ or Tab select, Enter confirm, Esc cancel</ThemedText>
    </Box>
  );
}
