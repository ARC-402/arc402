import { useState, useCallback } from "react";
import chalk from "chalk";
import fs from "fs";
import path from "path";
import os from "os";

const c = { failure: "✗" };

function resolveGatewayEndpoint(): { url: string; token?: string } {
  try {
    const configPath = path.join(os.homedir(), ".openclaw", "openclaw.json");
    const raw = fs.readFileSync(configPath, "utf-8");
    const config = JSON.parse(raw) as Record<string, unknown>;
    const gateway = config["gateway"] as Record<string, unknown> | undefined;
    const port = (gateway?.["port"] as number | undefined) ?? 18789;
    const token = (gateway?.["auth"] as Record<string, unknown> | undefined)?.["token"] as string | undefined;
    return {
      url: `http://127.0.0.1:${port}/v1/chat/completions`,
      token,
    };
  } catch {
    return { url: "http://127.0.0.1:18789/v1/chat/completions" };
  }
}

interface UseChatResult {
  send: (message: string, onLine: (line: string) => void) => Promise<void>;
  isSending: boolean;
}

/**
 * Sends messages to the OpenClaw gateway and streams responses
 * line-by-line into the viewport buffer via onLine callback.
 */
export function useChat(): UseChatResult {
  const [isSending, setIsSending] = useState(false);

  const send = useCallback(
    async (message: string, onLine: (line: string) => void): Promise<void> => {
      setIsSending(true);
      const trimmed = message.trim().slice(0, 10000);

      // Show thinking placeholder
      onLine(chalk.dim(" ◈ ") + chalk.dim("thinking..."));

      const { url: gatewayUrl, token: gatewayToken } = resolveGatewayEndpoint();
      let res: Response;
      try {
        const headers: Record<string, string> = { "Content-Type": "application/json" };
        if (gatewayToken) headers["Authorization"] = `Bearer ${gatewayToken}`;
        res = await fetch(gatewayUrl, {
          method: "POST",
          headers,
          body: JSON.stringify({
            model: "claude-sonnet-4-6",
            stream: true,
            messages: [{ role: "user", content: trimmed }],
          }),
          signal: AbortSignal.timeout(30000),
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        const isDown =
          msg.includes("ECONNREFUSED") ||
          msg.includes("fetch failed") ||
          msg.includes("ENOTFOUND") ||
          msg.includes("UND_ERR_SOCKET");
        if (isDown) {
          onLine(
            " " +
              chalk.yellow("⚠") +
              " " +
              chalk.dim("OpenClaw gateway not running. Start with: ") +
              chalk.white("openclaw gateway start")
          );
        } else {
          onLine(` ${c.failure} ${chalk.red(msg)}`);
        }
        setIsSending(false);
        return;
      }

      if (!res.body) {
        onLine(chalk.dim(" ◈ ") + chalk.white("(empty response)"));
        setIsSending(false);
        return;
      }

      const flushLine = (line: string): void => {
        // Unwrap SSE data lines
        if (line.startsWith("data: ")) {
          line = line.slice(6);
          if (line === "[DONE]") return;
          try {
            const j = JSON.parse(line) as {
              text?: string;
              content?: string;
              delta?: { text?: string };
            };
            line = j.text ?? j.content ?? j.delta?.text ?? line;
          } catch {
            /* use raw */
          }
        }
        if (line.trim()) {
          onLine(chalk.dim(" ◈ ") + chalk.white(line));
        }
      };

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) flushLine(line);
      }

      if (buffer.trim()) flushLine(buffer);

      setIsSending(false);
    },
    []
  );

  return { send, isSending };
}
