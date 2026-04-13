import React from "react";
import { Box } from "../../renderer/index.js";
import { ThemedText } from "../../renderer/ThemedText.js";
import { Button } from "./Button.js";

export interface ConfirmPromptProps {
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  confirmLabel?: string;
  cancelLabel?: string;
}

export function ConfirmPrompt({
  message,
  onConfirm,
  onCancel,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
}: ConfirmPromptProps) {
  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <ThemedText variant="header">
          ◈ {message}
        </ThemedText>
      </Box>
      <Box>
        <Box marginRight={2}><Button label={confirmLabel} onPress={onConfirm} variant="primary" /></Box>
        <Button label={cancelLabel} onPress={onCancel} variant="dim" />
      </Box>
      <Box marginTop={1}>
        <ThemedText themeColor="dim">Tab to switch · Enter to select</ThemedText>
      </Box>
    </Box>
  );
}
