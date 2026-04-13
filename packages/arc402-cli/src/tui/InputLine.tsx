import React, { useState, useCallback } from "react";
import { Box, useApp, useInput } from "../renderer/index.js";
import { ThemedText } from "../renderer/ThemedText.js";
import { BUILTIN_CMDS, TUI_SUBCOMMANDS, TUI_TOP_LEVEL_COMMANDS } from "./command-catalog.js";
import { CompletionDropdown } from "./components/CompletionDropdown.js";

interface InputLineProps {
  onSubmit: (value: string) => void;
  isDisabled?: boolean;
}

const ALL_TOP = [...BUILTIN_CMDS, ...TUI_TOP_LEVEL_COMMANDS];
const SUB_MAP = new Map(Object.entries(TUI_SUBCOMMANDS));

/**
 * Input line with:
 * - Command history navigation (↑/↓)
 * - Live completion dropdown (Tab cycles, Esc dismisses)
 * - Tab expansion on single match
 * - Driven by renderer runtime input, so arrow keys and completion stay coherent
 */
export function InputLine({ onSubmit, isDisabled = false }: InputLineProps) {
  const { exit } = useApp();
  const [value, setValue] = useState("");
  const [cursorPos, setCursorPos] = useState(0);
  const [history, setHistory] = useState<string[]>([]);
  const [historyIdx, setHistoryIdx] = useState(-1);
  const [historyTemp, setHistoryTemp] = useState("");

  // Completion state
  const [completions, setCompletions] = useState<string[]>([]);
  const [completionIdx, setCompletionIdx] = useState(0);
  const [dropdownVisible, setDropdownVisible] = useState(false);

  const computeCompletions = useCallback((input: string): string[] => {
    const trimmed = input.trimStart();
    if (!trimmed) return [];
    const spaceIdx = trimmed.indexOf(" ");
    if (spaceIdx === -1) {
      return ALL_TOP.filter((cmd) => cmd.startsWith(trimmed) && cmd !== trimmed);
    }
    const parent = trimmed.slice(0, spaceIdx);
    const rest = trimmed.slice(spaceIdx + 1);
    const subs = SUB_MAP.get(parent) ?? [];
    return subs
      .filter((s) => s.startsWith(rest) && s !== rest)
      .map((s) => `${parent} ${s}`);
  }, []);

  const handleChange = useCallback((newVal: string) => {
    setValue(newVal);
    setCursorPos(newVal.length);
    const candidates = computeCompletions(newVal);
    setCompletions(candidates);
    setCompletionIdx(0);
    setDropdownVisible(candidates.length > 0);
  }, [computeCompletions]);

  const handleSubmit = useCallback(
    (val: string) => {
      const trimmed = val.trim();
      if (!trimmed) return;
      setHistory((prev) => {
        if (prev[prev.length - 1] === trimmed) return prev;
        return [...prev, trimmed];
      });
      setHistoryIdx(-1);
      setHistoryTemp("");
      setValue("");
      setCursorPos(0);
      setCompletions([]);
      setDropdownVisible(false);
      onSubmit(trimmed);
    },
    [onSubmit]
  );

  useInput((event) => {
    if (isDisabled) return;

    if (event.key === 'escape') {
      setDropdownVisible(false);
      return;
    }

    if (event.key === 'up') {
      if (dropdownVisible && completions.length > 0) {
        setCompletionIdx((idx) => Math.max(0, idx - 1));
        return;
      }
      setHistory((hist) => {
        setHistoryIdx((idx) => {
          if (idx === -1) {
            setHistoryTemp(value);
            const newIdx = hist.length - 1;
            if (newIdx >= 0) {
              setValue(hist[newIdx]);
              setCursorPos(hist[newIdx].length);
              setCompletions([]);
              setDropdownVisible(false);
            }
            return newIdx;
          } else if (idx > 0) {
            const newIdx = idx - 1;
            setValue(hist[newIdx]);
            setCursorPos(hist[newIdx].length);
            setCompletions([]);
            setDropdownVisible(false);
            return newIdx;
          }
          return idx;
        });
        return hist;
      });
      return;
    }

    if (event.key === 'down') {
      if (dropdownVisible && completions.length > 0) {
        setCompletionIdx((idx) => Math.min(completions.length - 1, idx + 1));
        return;
      }
      setHistory((hist) => {
        setHistoryIdx((idx) => {
          if (idx >= 0) {
            const newIdx = idx + 1;
            if (newIdx >= hist.length) {
              setValue(historyTemp);
              setCursorPos(historyTemp.length);
              setCompletions([]);
              setDropdownVisible(false);
              return -1;
            }

            setValue(hist[newIdx]);
            setCursorPos(hist[newIdx].length);
            setCompletions([]);
            setDropdownVisible(false);
            return newIdx;
          }
          return idx;
        });
        return hist;
      });
      return;
    }

    if (event.key === 'tab') {
      if (completions.length === 0) return;
      if (!dropdownVisible) {
        setDropdownVisible(true);
        return;
      }
      const nextIdx = completionIdx + 1 >= completions.length ? 0 : completionIdx + 1;
      setCompletionIdx(nextIdx);
      return;
    }

    if (event.key === 'enter') {
      if (dropdownVisible && completions.length > 0) {
        const selected = completions[completionIdx];
        if (selected) {
          handleChange(selected + ' ');
        }
        return;
      }
      handleSubmit(value);
      return;
    }

    if (event.key === 'backspace') {
      if (cursorPos === 0) return;
      setValue((prev) => {
        const newVal = prev.slice(0, cursorPos - 1) + prev.slice(cursorPos);
        const nextPos = cursorPos - 1;
        setCursorPos(nextPos);
        const candidates = computeCompletions(newVal);
        setCompletions(candidates);
        setCompletionIdx(0);
        setDropdownVisible(candidates.length > 0);
        return newVal;
      });
      return;
    }

    if (event.key === 'left') {
      setCursorPos((prev) => Math.max(0, prev - 1));
      return;
    }

    if (event.key === 'right') {
      setCursorPos((prev) => Math.min(value.length, prev + 1));
      return;
    }

    if (event.key === 'home' || event.key === 'ctrl-a') {
      setCursorPos(0);
      return;
    }

    if (event.key === 'end' || event.key === 'ctrl-e') {
      setCursorPos(value.length);
      return;
    }

    if (event.key === 'delete') {
      return;
    }

    if (event.key === 'ctrl-c') {
      exit();
      return;
    }

    if (event.key === 'ctrl-u') {
      handleChange('');
      return;
    }

    if (event.key === 'ctrl-w') {
      setValue((prev) => {
        const left = prev.slice(0, cursorPos).replace(/\s+$/, '');
        const cutTo = left.lastIndexOf(' ') + 1;
        const newVal = prev.slice(0, cutTo) + prev.slice(cursorPos);
        setCursorPos(cutTo);
        const candidates = computeCompletions(newVal);
        setCompletions(candidates);
        setCompletionIdx(0);
        setDropdownVisible(candidates.length > 0);
        return newVal;
      });
      return;
    }

    if (event.key === 'char' && event.char) {
      const char = event.char;
      setValue((prev) => {
        const newVal = prev.slice(0, cursorPos) + char + prev.slice(cursorPos);
        const nextPos = cursorPos + char.length;
        setCursorPos(nextPos);
        const candidates = computeCompletions(newVal);
        setCompletions(candidates);
        setCompletionIdx(0);
        setDropdownVisible(candidates.length > 0);
        return newVal;
      });
    }
  }, { isActive: !isDisabled });

  // Render cursor as block char at cursor position
  const displayValue = value.slice(0, cursorPos) + "█" + value.slice(cursorPos);

  return (
    <Box flexDirection="column">
      {dropdownVisible && completions.length > 0 && (
        <CompletionDropdown
          candidates={completions}
          selectedIndex={completionIdx}
          visible={dropdownVisible}
        />
      )}
      <Box>
        <ThemedText variant="prompt">◈</ThemedText>
        <ThemedText themeColor="dim"> arc402 </ThemedText>
        <ThemedText themeColor="white">{">"} </ThemedText>
        <ThemedText themeColor="white">{displayValue}</ThemedText>
      </Box>
    </Box>
  );
}
