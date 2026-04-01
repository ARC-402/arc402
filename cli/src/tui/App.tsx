import React, { useState, useCallback, useEffect, useRef } from "react";
import { Box, Text, useApp, measureElement } from "ink";
import type { DOMElement } from "ink/build/dom.js";
import { Header } from "./Header";
import { Viewport } from "./Viewport";
import { Footer } from "./Footer";
import { InputLine } from "./InputLine";
import { useCommand } from "./useCommand";
import { useChat } from "./useChat";
import { useScroll } from "./useScroll";
import { useTerminalSize } from "./useTerminalSize";
import { useNotifications } from "./useNotifications";
import { createProgram } from "../program";
import { StatusCard } from "./components/StatusCard";
import { ToastContainer } from "./components/Toast";
import chalk from "chalk";

const BUILTIN_CMDS = ["help", "exit", "quit", "clear", "status"];

interface AppProps {
  version: string;
  network?: string;
  wallet?: string;
  balance?: string;
}

/**
 * Root TUI component — fixed header/footer with scrollable viewport.
 */
export function App({ version, network, wallet, balance }: AppProps) {
  const { exit } = useApp();
  const [outputBuffer, setOutputBuffer] = useState<React.ReactNode[]>([
    chalk.dim("  Type 'help' to see available commands"),
    "",
  ]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [headerHeight, setHeaderHeight] = useState(0);
  const [footerHeight, setFooterHeight] = useState(1);
  const headerRef = useRef<DOMElement>(null);
  const footerRef = useRef<DOMElement>(null);

  const { execute, isRunning } = useCommand();
  const { send, isSending } = useChat();
  const { rows } = useTerminalSize();
  const { toasts, dismiss } = useNotifications();

  useEffect(() => {
    if (headerRef.current) {
      setHeaderHeight(measureElement(headerRef.current).height);
    }
    if (footerRef.current) {
      setFooterHeight(Math.max(1, measureElement(footerRef.current).height));
    }
  }, [rows, version, network, wallet, balance, toasts.length]);

  const viewportHeight = Math.max(1, rows - headerHeight - footerHeight);

  const { scrollOffset, isAutoScroll, scrollUp, scrollDown, snapToBottom } =
    useScroll(viewportHeight);

  // Get top-level command names for dispatch detection
  const [topCmds] = useState<string[]>(() => {
    try {
      const prog = createProgram();
      return prog.commands.map((cmd) => cmd.name());
    } catch {
      return [];
    }
  });

  const appendEntry = useCallback((entry: React.ReactNode) => {
    setOutputBuffer((prev) => [...prev, entry]);
  }, []);

  const appendLine = useCallback(
    (line: string) => {
      appendEntry(line);
    },
    [appendEntry]
  );

  const handleCommand = useCallback(
    async (input: string): Promise<void> => {
      // Echo command to viewport
      appendLine(
        chalk.cyanBright("◈") +
          " " +
          chalk.dim("arc402") +
          " " +
          chalk.white(">") +
          " " +
          chalk.white(input)
      );

      // Snap to bottom on new command
      snapToBottom();
      setIsProcessing(true);

      const firstWord = input.split(/\s+/)[0];
      const allKnown = [...BUILTIN_CMDS, ...topCmds];

      // ── Built-in: exit/quit ────────────────────────────────────────────────
      if (input === "exit" || input === "quit") {
        appendLine(
          " " + chalk.cyanBright("◈") + chalk.dim(" goodbye")
        );
        setIsProcessing(false);
        setTimeout(() => exit(), 100);
        return;
      }

      // ── Built-in: clear ────────────────────────────────────────────────────
      if (input === "clear") {
        setOutputBuffer([]);
        setIsProcessing(false);
        return;
      }

      // ── Built-in: help ─────────────────────────────────────────────────────
      if (input === "help" || input === "/help") {
        const lines: string[] = [];
        try {
          const prog = createProgram();
          prog.exitOverride();
          const helpText: string[] = [];
          prog.configureOutput({
            writeOut: (str) => helpText.push(str),
            writeErr: (str) => helpText.push(str),
          });
          try {
            await prog.parseAsync(["node", "arc402", "--help"]);
          } catch {
            /* commander throws after printing help */
          }
          for (const chunk of helpText) {
            for (const l of chunk.split("\n")) lines.push(l);
          }
        } catch {
          lines.push(chalk.red("Failed to load help"));
        }
        lines.push("");
        lines.push(chalk.cyanBright("Chat"));
        lines.push(
          "  " +
            chalk.white("<message>") +
            chalk.dim("          Send message to OpenClaw gateway")
        );
        lines.push(
          "  " +
            chalk.white("/chat <message>") +
            chalk.dim("   Explicitly route to chat")
        );
        lines.push(
          chalk.dim(
            "  Gateway: http://localhost:19000  (openclaw gateway start)"
          )
        );
        lines.push("");
        for (const l of lines) appendLine(l);
        setIsProcessing(false);
        return;
      }

      // ── Built-in: status ───────────────────────────────────────────────────
      if (input === "status") {
        appendEntry(
          <StatusCard
            network={network}
            wallet={wallet}
            balance={balance}
          />
        );
        appendLine("");
        setIsProcessing(false);
        return;
      }

      // ── /chat prefix or unknown command → chat ─────────────────────────────
      const isExplicitChat = input.startsWith("/chat ");
      const isChatInput =
        isExplicitChat || (!allKnown.includes(firstWord) && firstWord !== "");

      if (isChatInput) {
        const msg = isExplicitChat ? input.slice(6).trim() : input;
        if (msg) {
          await send(msg, appendLine);
        }
        appendLine("");
        setIsProcessing(false);
        return;
      }

      // ── Dispatch to commander ──────────────────────────────────────────────
      await execute(input, appendLine);
      appendLine("");
      setIsProcessing(false);
    },
    [appendLine, execute, send, snapToBottom, topCmds, network, wallet, balance, exit]
  );

  const isDisabled = isProcessing || isRunning || isSending;

  return (
    <Box flexDirection="column" height="100%">
      {/* HEADER — fixed, never scrolls */}
      <Header
        ref={headerRef}
        version={version}
        network={network}
        wallet={wallet}
        balance={balance}
      />

      {/* Separator */}
      <Box>
        <Text dimColor>{"─".repeat(60)}</Text>
      </Box>

      {/* VIEWPORT — fills remaining space */}
      <Viewport
        lines={outputBuffer}
        scrollOffset={scrollOffset}
        isAutoScroll={isAutoScroll}
        viewportHeight={viewportHeight}
      />

      {/* FOOTER — fixed, input pinned */}
      <Footer ref={footerRef}>
        <ToastContainer toasts={toasts} onDismiss={dismiss} />
        <InputLine onSubmit={handleCommand} isDisabled={isDisabled} />
      </Footer>
    </Box>
  );
}
