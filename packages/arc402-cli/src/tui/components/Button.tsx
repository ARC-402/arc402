import React from "react";
import { Box, Text, useFocus, useInput } from "../../renderer/index.js";

export interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: "primary" | "danger" | "dim";
}

const VARIANT_COLORS: Record<string, string> = {
  primary: "cyan",
  danger: "red",
  dim: "slate",
};

export function Button({ label, onPress, variant = "primary" }: ButtonProps) {
  const { isFocused } = useFocus();

  useInput(
    (event) => {
      if (event.key === "enter") {
        onPress();
      }
    },
    { isActive: isFocused }
  );

  const color = isFocused ? VARIANT_COLORS[variant] ?? "cyan" : "white";

  return (
    <Box>
      <Text color={color} bold={isFocused}>
        {isFocused ? "▸ " : "  "}
        {label}
      </Text>
    </Box>
  );
}
