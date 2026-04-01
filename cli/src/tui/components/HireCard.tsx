import React from "react";
import { Box, Text } from "ink";
import { ConfirmPrompt } from "./ConfirmPrompt.js";

export interface HireCardField {
  label: string;
  value: string;
  isLast?: boolean;
}

export interface HireCardProps {
  title?: string;
  fields: HireCardField[];
  onConfirm?: () => void;
  onCancel?: () => void;
  showPrompt?: boolean;
}

/**
 * Displays tree output and a confirm prompt for the `arc402 hire` command.
 */
export function HireCard({
  title = "Agreement Draft",
  fields,
  onConfirm,
  onCancel,
  showPrompt = false,
}: HireCardProps) {
  return (
    <Box flexDirection="column" paddingLeft={1}>
      <Box marginBottom={1}>
        <Text color="cyan" bold>
          ◈ {title}
        </Text>
      </Box>
      <Box flexDirection="column" marginBottom={1}>
        {fields.map((field, i) => {
          const isLast = field.isLast ?? i === fields.length - 1;
          const connector = isLast ? "└" : "├";
          return (
            <Box key={i}>
              <Text dimColor>{connector} </Text>
              <Box width={10}>
                <Text dimColor>{field.label}</Text>
              </Box>
              <Text color="white">{field.value}</Text>
            </Box>
          );
        })}
      </Box>
      {showPrompt && onConfirm && onCancel && (
        <ConfirmPrompt
          message="Confirm this agreement?"
          onConfirm={onConfirm}
          onCancel={onCancel}
          confirmLabel="Hire"
          cancelLabel="Cancel"
        />
      )}
    </Box>
  );
}
