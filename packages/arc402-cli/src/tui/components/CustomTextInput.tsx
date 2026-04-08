import React, { useState, useEffect } from "react";
import { Text, useInput } from "../../renderer/index.js";

interface CustomTextInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit?: (value: string) => void;
  focus?: boolean;
  /** When true, Enter key is NOT handled — let parent handle it (e.g. dropdown selection) */
  suppressEnter?: boolean;
}

/**
 * Minimal text input that does NOT intercept Tab, Up, Down, Escape, or Ctrl+C,
 * allowing parent renderer input handlers to receive those keys.
 */
export function CustomTextInput({
  value,
  onChange,
  onSubmit,
  focus = true,
  suppressEnter = false,
}: CustomTextInputProps) {
  const [cursorPos, setCursorPos] = useState(value.length);
  const [cursorVisible, setCursorVisible] = useState(true);

  // Keep cursor within bounds when value changes externally
  useEffect(() => {
    setCursorPos((pos) => Math.min(pos, value.length));
  }, [value]);

  // Blink cursor
  useEffect(() => {
    if (!focus) return;
    const timer = setInterval(() => {
      setCursorVisible((v) => !v);
    }, 530);
    return () => clearInterval(timer);
  }, [focus]);

  useInput(
    (event) => {
      if (event.key === "tab" || event.key === "up" || event.key === "down" || event.key === "escape" || event.key === "ctrl-c") {
        return;
      }

      if (event.key === "enter") {
        if (!suppressEnter) {
          onSubmit?.(value);
        }
        return;
      }

      if (event.key === "backspace" || event.key === "delete") {
        if (cursorPos > 0) {
          const next = value.slice(0, cursorPos - 1) + value.slice(cursorPos);
          setCursorPos(cursorPos - 1);
          onChange(next);
        }
        return;
      }

      if (event.key === "left") {
        setCursorPos((p) => Math.max(0, p - 1));
        return;
      }

      if (event.key === "right") {
        setCursorPos((p) => Math.min(value.length, p + 1));
        return;
      }

      if (event.key === "ctrl-a" || event.key === "home") {
        setCursorPos(0);
        return;
      }

      if (event.key === "ctrl-e" || event.key === "end") {
        setCursorPos(value.length);
        return;
      }

      if (event.key === "ctrl-u") {
        setCursorPos(0);
        onChange("");
        return;
      }

      if (event.key === "ctrl-k") {
        onChange(value.slice(0, cursorPos));
        return;
      }

      if (event.key === "char" && event.char) {
        const next = value.slice(0, cursorPos) + event.char + value.slice(cursorPos);
        setCursorPos(cursorPos + event.char.length);
        onChange(next);
      }
    },
    { isActive: focus }
  );

  if (!focus) {
    return <Text dimColor>{value}</Text>;
  }

  const before = value.slice(0, cursorPos);
  const cursorChar = cursorPos < value.length ? value[cursorPos] : " ";
  const after = value.slice(cursorPos + 1);

  return (
    <Text>
      {before}
      <Text inverse={cursorVisible}>{cursorChar}</Text>
      {after}
    </Text>
  );
}
