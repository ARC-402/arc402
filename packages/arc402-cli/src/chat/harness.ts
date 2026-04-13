import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { spawnSync } from "child_process";
import { configExists, loadConfig, saveConfig, type Arc402Config } from "../config";
import { DAEMON_TOML, loadDaemonConfig } from "../daemon/config";
import { inferDaemonNodeMode, resolveChatDaemonTarget, type DaemonNodeMode } from "../commerce-client";

export type SupportedHarness = "openclaw" | "claude-code" | "codex" | "hermes";

export type ChatRuntimeConfig = {
  daemonUrl: string;
  nodeMode: DaemonNodeMode;
  harness?: SupportedHarness;
  model?: string;
};

export type HarnessReadiness = {
  ready: boolean;
  summary: string;
  nextStep?: string;
};

export type HarnessChoice = {
  harness: SupportedHarness;
  label: string;
  readiness: HarnessReadiness;
};

const OPENCLAW_CONFIG_PATH = process.env.OPENCLAW_CONFIG || path.join(os.homedir(), ".openclaw", "openclaw.json");
export const SUPPORTED_HARNESSES: SupportedHarness[] = ["openclaw", "claude-code", "codex", "hermes"];

export function normalizeHarness(value?: string): SupportedHarness | undefined {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return undefined;
  if (normalized === "openclaw") return "openclaw";
  if (normalized === "claude" || normalized === "claude-code") return "claude-code";
  if (normalized === "codex") return "codex";
  if (normalized === "hermes") return "hermes";
  return undefined;
}

export function getHarnessLabel(harness: SupportedHarness): string {
  switch (harness) {
    case "openclaw": return "OpenClaw";
    case "claude-code": return "Claude Code";
    case "codex": return "Codex";
    case "hermes": return "Hermes";
  }
}

function commandExists(command: string): boolean {
  const result = spawnSync("sh", ["-lc", `command -v ${command}`], { stdio: "ignore" });
  return result.status === 0;
}

export function getHarnessReadiness(harness: SupportedHarness): HarnessReadiness {
  switch (harness) {
    case "openclaw":
      if (fs.existsSync(OPENCLAW_CONFIG_PATH)) {
        return { ready: true, summary: `gateway config found at ${OPENCLAW_CONFIG_PATH}` };
      }
      return {
        ready: false,
        summary: `missing ${OPENCLAW_CONFIG_PATH}`,
        nextStep: "Run OpenClaw locally or create ~/.openclaw/openclaw.json before relying on OpenClaw-backed execution.",
      };
    case "claude-code":
      return commandExists("claude")
        ? { ready: true, summary: "claude CLI found on PATH" }
        : { ready: false, summary: "claude CLI not found on PATH", nextStep: "Install Claude Code or pick a different harness." };
    case "codex":
      return commandExists("codex")
        ? { ready: true, summary: "codex CLI found on PATH" }
        : { ready: false, summary: "codex CLI not found on PATH", nextStep: "Install Codex CLI or pick a different harness." };
    case "hermes":
      return commandExists("hermes")
        ? { ready: true, summary: "hermes CLI found on PATH" }
        : { ready: false, summary: "hermes CLI not found on PATH", nextStep: "Run `arc402 hermes init` or install Hermes before using this harness." };
  }
}

export function getHarnessChoices(): HarnessChoice[] {
  return SUPPORTED_HARNESSES.map((harness) => ({
    harness,
    label: getHarnessLabel(harness),
    readiness: getHarnessReadiness(harness),
  }));
}

export function normalizeOpenClawModel(value?: string): string {
  const trimmed = value?.trim();
  if (!trimmed || trimmed === "openclaw") return "openclaw";
  if (trimmed.startsWith("openclaw/")) {
    const agentId = trimmed.slice("openclaw/".length).trim();
    return agentId ? `openclaw/${agentId}` : "openclaw";
  }
  if (trimmed.startsWith("openclaw:")) {
    const agentId = trimmed.slice("openclaw:".length).trim();
    return agentId ? `openclaw/${agentId}` : "openclaw";
  }
  return "openclaw";
}

function normalizeRuntimeModel(harness: SupportedHarness | undefined, model?: string): string | undefined {
  const trimmed = model?.trim();
  if (harness === "openclaw") return normalizeOpenClawModel(trimmed);
  return trimmed || undefined;
}

function loadSavedChatConfig(): NonNullable<Arc402Config["chat"]> | undefined {
  if (!configExists()) return undefined;
  return loadConfig().chat;
}

export function loadDaemonHarnessDefault(): SupportedHarness | undefined {
  if (!fs.existsSync(DAEMON_TOML)) return undefined;
  try {
    return normalizeHarness(loadDaemonConfig().worker?.agent_type);
  } catch {
    return undefined;
  }
}

export function resolveInitialChatRuntime(options: {
  daemonUrl?: string;
  harness?: string;
  model?: string;
  local?: boolean;
  remote?: boolean;
} = {}): { config: ChatRuntimeConfig; missingHarness: boolean } {
  const saved = loadSavedChatConfig();
  const daemonHarness = loadDaemonHarnessDefault();
  const explicitNodeMode = options.local ? "local" : options.remote ? "remote" : undefined;
  const target = resolveChatDaemonTarget({ explicitBaseUrl: options.daemonUrl, explicitNodeMode });
  const harness = normalizeHarness(options.harness) ?? normalizeHarness(saved?.harness) ?? daemonHarness;
  const rawModel = options.model?.trim() || saved?.model?.trim() || undefined;
  const model = normalizeRuntimeModel(harness, rawModel);
  const nodeMode = explicitNodeMode ?? saved?.nodeMode ?? target.mode ?? inferDaemonNodeMode(target.baseUrl);

  return {
    missingHarness: !harness,
    config: {
      daemonUrl: target.baseUrl,
      nodeMode,
      harness,
      model,
    },
  };
}

export function persistChatHarnessSelection(runtime: ChatRuntimeConfig): void {
  const existing = configExists() ? loadConfig() : undefined;
  const nextConfig: Arc402Config = {
    ...(existing ?? loadConfig()),
    chat: {
      daemonUrl: runtime.daemonUrl,
      nodeMode: runtime.nodeMode,
      harness: runtime.harness,
      model: normalizeRuntimeModel(runtime.harness, runtime.model),
    },
  };
  saveConfig(nextConfig);
}

export function resolveOpenClawEndpoint(): { url: string; token?: string } {
  try {
    const raw = fs.readFileSync(OPENCLAW_CONFIG_PATH, "utf-8");
    const config = JSON.parse(raw) as Record<string, unknown>;
    const gateway = config.gateway as Record<string, unknown> | undefined;
    let gatewayUrl = gateway?.url as string | undefined;
    if (!gatewayUrl || gatewayUrl === "lan" || gatewayUrl === "local") {
      const port = (gateway?.port as number | undefined) ?? 18789;
      gatewayUrl = `http://127.0.0.1:${port}`;
    }
    const token = (gateway?.auth as Record<string, unknown> | undefined)?.token as string | undefined;
    return { url: `${String(gatewayUrl).replace(/\/$/, "")}/v1/chat/completions`, token };
  } catch {
    return { url: "http://127.0.0.1:18789/v1/chat/completions" };
  }
}

export async function dispatchHarnessChat(params: {
  harness: SupportedHarness;
  message: string;
  model?: string;
  systemPrompt?: string;
  daemonUrl?: string;
}): Promise<string> {
  const { harness, message, model, systemPrompt, daemonUrl } = params;

  if (harness === "openclaw" || harness === "hermes") {
    const endpoint = harness === "openclaw"
      ? resolveOpenClawEndpoint().url
      : `${(daemonUrl ?? "http://127.0.0.1:4403").replace(/\/$/, "")}/v1/chat/completions`;
    const token = harness === "openclaw" ? resolveOpenClawEndpoint().token : undefined;
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token) headers.Authorization = `Bearer ${token}`;

    const messages = [] as Array<{ role: "system" | "user"; content: string }>;
    if (systemPrompt?.trim()) messages.push({ role: "system", content: systemPrompt });
    messages.push({ role: "user", content: message });

    const resolvedModel = harness === "openclaw"
      ? normalizeOpenClawModel(model)
      : model?.trim() || "claude-sonnet-4-6";

    const res = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({ model: resolvedModel, stream: false, messages }),
      signal: AbortSignal.timeout(120000),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`${getHarnessLabel(harness)} responded with HTTP ${res.status}${text ? `: ${text}` : ""}`);
    }
    const json = await res.json() as Record<string, unknown>;
    const choice = (json.choices as Array<Record<string, unknown>> | undefined)?.[0];
    const content = (choice?.message as Record<string, unknown> | undefined)?.content;
    if (typeof content === "string") return content;
    if (typeof json.content === "string") return json.content;
    return JSON.stringify(json, null, 2);
  }

  if (harness === "claude-code") {
    const env = { ...process.env };
    delete env.ANTHROPIC_API_KEY;
    const prompt = systemPrompt?.trim() ? `${systemPrompt}\n\nUser request: ${message}` : message;
    const result = spawnSync("claude", ["--print", "--permission-mode", "bypassPermissions"], {
      input: prompt,
      encoding: "utf8",
      env,
      timeout: 120000,
    });
    if (result.error) throw result.error;
    if (result.status !== 0 && !result.stdout?.trim()) {
      throw new Error((result.stderr || `Claude Code exited with status ${result.status ?? "unknown"}`).trim());
    }
    return (result.stdout || result.stderr || "").trim();
  }

  const prompt = systemPrompt?.trim() ? `${systemPrompt}\n\nUser request: ${message}` : message;
  const result = spawnSync("codex", ["exec", prompt], { encoding: "utf8", timeout: 120000 });
  if (result.error) throw result.error;
  if (result.status !== 0 && !result.stdout?.trim()) {
    throw new Error((result.stderr || `Codex exited with status ${result.status ?? "unknown"}`).trim());
  }
  return (result.stdout || result.stderr || "").trim();
}
