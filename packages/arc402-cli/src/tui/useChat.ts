import { useState, useCallback, useMemo } from "react";
import {
  dispatchHarnessChat,
  getHarnessChoices,
  getHarnessLabel,
  normalizeHarness,
  persistChatHarnessSelection,
  resolveInitialChatRuntime,
  type ChatRuntimeConfig,
  type HarnessChoice,
  type SupportedHarness,
} from "../chat/harness.js";

interface UseChatResult {
  isSending: boolean;
  isChatMode: boolean;
  activeHarnessLabel?: string;
  harnessChoices: HarnessChoice[];
  selectedHarnessIndex: number;
  selectorVisible: boolean;
  beginChat: (onLine: (line: string) => void, requestedHarness?: string) => void;
  cancelSelector: () => void;
  moveSelection: (delta: number) => void;
  confirmSelection: (onLine: (line: string) => void) => void;
  send: (message: string, onLine: (line: string) => void, harnessOverride?: string) => Promise<void>;
}

export function useChat(): UseChatResult {
  const initial = useMemo(() => resolveInitialChatRuntime(), []);
  const [runtime, setRuntime] = useState<ChatRuntimeConfig>(initial.config);
  const [isSending, setIsSending] = useState(false);
  const [isChatMode, setIsChatMode] = useState(false);
  const [selectorVisible, setSelectorVisible] = useState<boolean>(initial.missingHarness || !initial.config.harness);
  const [selectionIndex, setSelectionIndex] = useState(0);
  const [pendingHarness, setPendingHarness] = useState<SupportedHarness | undefined>(undefined);

  const harnessChoices = useMemo(() => getHarnessChoices(), []);

  const activateHarness = useCallback((harness: SupportedHarness, onLine: (line: string) => void) => {
    const nextRuntime = { ...runtime, harness };
    setRuntime(nextRuntime);
    persistChatHarnessSelection(nextRuntime);
    setSelectorVisible(false);
    setPendingHarness(undefined);
    setIsChatMode(true);
    onLine(`  ◈ Commerce Shell ready · Harness: ${getHarnessLabel(harness)}`);
  }, [runtime]);

  const beginChat = useCallback((onLine: (line: string) => void, requestedHarness?: string) => {
    const explicit = normalizeHarness(requestedHarness);
    if (explicit) {
      activateHarness(explicit, onLine);
      return;
    }
    setIsChatMode(true);
    if (runtime.harness) {
      onLine(`  ◈ Commerce Shell ready · Harness: ${getHarnessLabel(runtime.harness)}`);
      return;
    }
    setSelectorVisible(true);
    onLine("  ⚠ No chat harness selected yet. Choose one below.");
  }, [activateHarness, runtime.harness]);

  const cancelSelector = useCallback(() => {
    setSelectorVisible(false);
    setPendingHarness(undefined);
  }, []);

  const moveSelection = useCallback((delta: number) => {
    setSelectionIndex((current) => {
      const next = current + delta;
      return Math.max(0, Math.min(harnessChoices.length - 1, next));
    });
  }, [harnessChoices.length]);

  const confirmSelection = useCallback((onLine: (line: string) => void) => {
    const chosen = pendingHarness ?? harnessChoices[selectionIndex]?.harness;
    if (!chosen) return;
    activateHarness(chosen, onLine);
  }, [activateHarness, harnessChoices, pendingHarness, selectionIndex]);

  const send = useCallback(async (message: string, onLine: (line: string) => void, harnessOverride?: string) => {
    const trimmed = message.trim().slice(0, 10000);
    if (!trimmed) return;

    const explicit = normalizeHarness(harnessOverride);
    if (explicit) {
      setPendingHarness(undefined);
      const nextRuntime = { ...runtime, harness: explicit };
      setRuntime(nextRuntime);
      persistChatHarnessSelection(nextRuntime);
    }
    const harness = explicit ?? runtime.harness;
    if (!harness) {
      setIsChatMode(true);
      setSelectorVisible(true);
      onLine("  ⚠ Choose a harness before sending chat.");
      return;
    }

    setIsSending(true);
    setIsChatMode(true);
    onLine(`  ◈ ${getHarnessLabel(harness)} thinking...`);

    try {
      const output = await dispatchHarnessChat({
        harness,
        message: trimmed,
        model: runtime.model,
        daemonUrl: runtime.daemonUrl,
      });
      for (const line of output.split(/\r?\n/)) {
        if (line.trim()) onLine(`  ◈ ${line}`);
      }
      const nextRuntime = explicit ? { ...runtime, harness: explicit } : runtime;
      if (explicit) {
        persistChatHarnessSelection(nextRuntime);
      }
      setRuntime(nextRuntime);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      onLine(`  ✗ ${msg}`);
      if (harness === "openclaw") {
        onLine("  Hint: make sure OpenClaw gateway is running (openclaw gateway start).");
      }
      if (harness === "hermes") {
        onLine(`  Hint: make sure the ARC-402 daemon is reachable at ${runtime.daemonUrl}.`);
      }
    } finally {
      setIsSending(false);
    }
  }, [runtime]);

  return {
    isSending,
    isChatMode,
    activeHarnessLabel: runtime.harness ? getHarnessLabel(runtime.harness) : undefined,
    harnessChoices,
    selectedHarnessIndex: selectionIndex,
    selectorVisible,
    beginChat,
    cancelSelector,
    moveSelection,
    confirmSelection,
    send,
  };
}
