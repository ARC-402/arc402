import { Command } from "commander";
import chalk from "chalk";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import prompts from "prompts";
import readline from "readline";
import { spawnSync } from "child_process";
import {
  fetchDaemonAgreements,
  fetchDaemonHealth,
  fetchDaemonWalletStatus,
  fetchDaemonWorkroomStatus,
  inferDaemonNodeMode,
  resolveChatDaemonTarget,
  resolveDaemonApiBaseUrl,
  type DaemonCommerceClientOptions,
  type DaemonNodeMode,
} from "../commerce-client";
import { configExists, loadConfig, saveConfig, type Arc402Config } from "../config";
import { DAEMON_TOML, loadDaemonConfig } from "../daemon/config";

type SupportedHarness = "openclaw" | "claude-code" | "codex" | "hermes";

type ChatOptions = {
  daemonUrl?: string;
  harness?: string;
  model?: string;
  setup?: boolean;
  local?: boolean;
  remote?: boolean;
};

type SavedChatConfig = NonNullable<Arc402Config["chat"]>;

type ChatRuntimeConfig = {
  daemonUrl: string;
  nodeMode: DaemonNodeMode;
  harness: SupportedHarness;
  model?: string;
};

type HarnessReadiness = {
  ready: boolean;
  summary: string;
  nextStep?: string;
};

const OPENCLAW_CONFIG_PATH = process.env.OPENCLAW_CONFIG || path.join(os.homedir(), ".openclaw", "openclaw.json");
const SUPPORTED_HARNESSES: SupportedHarness[] = ["openclaw", "claude-code", "codex", "hermes"];

function parseTokens(input: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let inQuote = false;
  let quoteChar = "";
  let escape = false;

  for (const ch of input) {
    if (escape) {
      current += ch;
      escape = false;
      continue;
    }
    if (inQuote) {
      if (quoteChar === '"' && ch === "\\") {
        escape = true;
      } else if (ch === quoteChar) {
        inQuote = false;
      } else {
        current += ch;
      }
      continue;
    }
    if (ch === '"' || ch === "'") {
      inQuote = true;
      quoteChar = ch;
      continue;
    }
    if (/\s/.test(ch)) {
      if (current) {
        tokens.push(current);
        current = "";
      }
      continue;
    }
    current += ch;
  }

  if (current) {
    tokens.push(current);
  }

  return tokens;
}

function truncateAddress(address: string): string {
  return address.length > 12 ? `${address.slice(0, 6)}…${address.slice(-4)}` : address;
}

function formatAgreementStatus(value: unknown): string {
  const raw = typeof value === "string" ? value : typeof value === "number" ? String(value) : "unknown";
  return raw.toUpperCase();
}

function normalizeHarness(value?: string): SupportedHarness | undefined {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return undefined;
  if (normalized === "openclaw") return "openclaw";
  if (normalized === "claude" || normalized === "claude-code") return "claude-code";
  if (normalized === "codex") return "codex";
  if (normalized === "hermes") return "hermes";
  return undefined;
}

function getHarnessLabel(harness: SupportedHarness): string {
  switch (harness) {
    case "openclaw":
      return "OpenClaw";
    case "claude-code":
      return "Claude Code";
    case "codex":
      return "Codex";
    case "hermes":
      return "Hermes";
  }
}

function commandExists(command: string): boolean {
  const result = spawnSync("sh", ["-lc", `command -v ${command}`], { stdio: "ignore" });
  return result.status === 0;
}

function getHarnessReadiness(harness: SupportedHarness): HarnessReadiness {
  switch (harness) {
    case "openclaw":
      if (fs.existsSync(OPENCLAW_CONFIG_PATH)) {
        return {
          ready: true,
          summary: `gateway config found at ${OPENCLAW_CONFIG_PATH}`,
        };
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

async function testDaemonConnection(options: DaemonCommerceClientOptions): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await fetchDaemonHealth(options);
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function loadSavedChatConfig(): SavedChatConfig | undefined {
  if (!configExists()) return undefined;
  return loadConfig().chat;
}

function loadDaemonHarnessDefault(): SupportedHarness | undefined {
  if (!fs.existsSync(DAEMON_TOML)) return undefined;
  try {
    return normalizeHarness(loadDaemonConfig().worker?.agent_type);
  } catch {
    return undefined;
  }
}

function resolveInitialRuntimeConfig(opts: ChatOptions): {
  config?: ChatRuntimeConfig;
  missingHarness: boolean;
} {
  const saved = loadSavedChatConfig();
  const daemonHarness = loadDaemonHarnessDefault();
  const explicitNodeMode = opts.local ? "local" : opts.remote ? "remote" : undefined;
  const target = resolveChatDaemonTarget({
    explicitBaseUrl: opts.daemonUrl,
    explicitNodeMode,
  });
  const harness = normalizeHarness(opts.harness) ?? normalizeHarness(saved?.harness) ?? daemonHarness;
  const model = opts.model?.trim() || saved?.model?.trim() || undefined;
  const nodeMode = explicitNodeMode ?? saved?.nodeMode ?? target.mode ?? inferDaemonNodeMode(target.baseUrl);

  if (!harness) {
    return { missingHarness: true };
  }

  return {
    missingHarness: false,
    config: {
      daemonUrl: target.baseUrl,
      nodeMode,
      harness,
      model,
    },
  };
}

async function runGuidedSetup(seed?: Partial<ChatRuntimeConfig>): Promise<ChatRuntimeConfig | null> {
  const saved = loadSavedChatConfig();
  const daemonHarness = loadDaemonHarnessDefault();
  const recommendedLocalUrl = resolveDaemonApiBaseUrl();
  const initialNodeMode = seed?.nodeMode ?? saved?.nodeMode ?? "local";
  const initialDaemonUrl =
    seed?.daemonUrl ??
    saved?.daemonUrl ??
    (initialNodeMode === "local" ? recommendedLocalUrl : "https://your-node.example.com");
  const initialHarness = seed?.harness ?? normalizeHarness(saved?.harness) ?? daemonHarness ?? "openclaw";
  const initialModel = seed?.model ?? saved?.model ?? "";

  console.log(chalk.bold("◈ Commerce chat setup"));
  console.log("  ARC-402 chat reads daemon state from either a local node on this machine or a remote node over HTTP.");
  console.log("  It also needs a harness choice so chat can explain how hired work should be executed.");
  console.log("");

  const setup = await prompts([
    {
      type: "select",
      name: "nodeMode",
      message: "Which node should chat talk to?",
      initial: initialNodeMode === "remote" ? 1 : 0,
      choices: [
        { title: `Local node on this machine (${recommendedLocalUrl})`, value: "local" },
        { title: "Remote ARC-402 node", value: "remote" },
      ],
    },
    {
      type: "text",
      name: "daemonUrl",
      message: "Daemon API base URL",
      initial: (_prev: unknown, values: { nodeMode?: DaemonNodeMode }) =>
        values.nodeMode === "local" ? recommendedLocalUrl : initialDaemonUrl,
      validate: (value: string) => {
        try {
          const parsed = new URL(value.trim());
          return parsed.protocol === "http:" || parsed.protocol === "https:"
            ? true
            : "Use an http:// or https:// URL";
        } catch {
          return "Enter a valid URL";
        }
      },
    },
    {
      type: "select",
      name: "harness",
      message: "Which harness should arc402 chat describe and expect?",
      initial: Math.max(SUPPORTED_HARNESSES.indexOf(initialHarness), 0),
      choices: [
        { title: "OpenClaw", value: "openclaw" },
        { title: "Claude Code", value: "claude-code" },
        { title: "Codex", value: "codex" },
        { title: "Hermes", value: "hermes" },
      ],
    },
    {
      type: "text",
      name: "model",
      message: "Default model hint for chat (optional)",
      initial: initialModel,
    },
  ], {
    onCancel: () => true,
  });

  const harness = normalizeHarness(setup.harness);
  if (!setup.nodeMode || !setup.daemonUrl || !harness) {
    console.log(chalk.yellow("Setup cancelled."));
    return null;
  }

  const runtime: ChatRuntimeConfig = {
    nodeMode: setup.nodeMode,
    daemonUrl: String(setup.daemonUrl).trim().replace(/\/$/, ""),
    harness,
    model: String(setup.model ?? "").trim() || undefined,
  };

  console.log("");
  console.log("Testing daemon endpoint...");
  const daemonTest = await testDaemonConnection({ baseUrl: runtime.daemonUrl });
  console.log(
    daemonTest.ok
      ? chalk.green(`  OK: daemon responded at ${runtime.daemonUrl}`)
      : chalk.yellow(`  Daemon check failed: ${daemonTest.error}`)
  );

  const readiness = getHarnessReadiness(runtime.harness);
  console.log(
    readiness.ready
      ? chalk.green(`  Harness check: ${getHarnessLabel(runtime.harness)} ready (${readiness.summary})`)
      : chalk.yellow(`  Harness check: ${getHarnessLabel(runtime.harness)} not ready (${readiness.summary})`)
  );
  if (readiness.nextStep) {
    console.log(chalk.dim(`  ${readiness.nextStep}`));
  }

  const existing = configExists() ? loadConfig() : undefined;
  const nextConfig: Arc402Config = {
    ...(existing ?? loadConfig()),
    chat: {
      daemonUrl: runtime.daemonUrl,
      nodeMode: runtime.nodeMode,
      harness: runtime.harness,
      model: runtime.model,
    },
  };
  saveConfig(nextConfig);

  console.log("");
  console.log(chalk.green("Saved chat setup to ~/.arc402/config.json"));
  return runtime;
}

function describeNodeMode(config: ChatRuntimeConfig): string {
  if (config.nodeMode === "local") {
    return `Local node: chat will read daemon state from ${config.daemonUrl} on this machine.`;
  }
  return `Remote node: chat will read daemon state from ${config.daemonUrl} over HTTP instead of assuming a local daemon.`;
}

function printBanner(config: ChatRuntimeConfig): void {
  console.log(chalk.cyanBright("◈"), chalk.bold("ARC-402 Commerce Shell"));
  console.log(chalk.dim(`Node: ${config.nodeMode}  Endpoint: ${config.daemonUrl}`));
  console.log(
    chalk.dim(
      `Harness: ${getHarnessLabel(config.harness)}${config.model ? `  Model: ${config.model}` : ""}  Use /<command> for direct CLI commands`
    )
  );
  console.log(chalk.dim(describeNodeMode(config)));

  const readiness = getHarnessReadiness(config.harness);
  console.log(
    readiness.ready
      ? chalk.dim(`Harness check: ${readiness.summary}`)
      : chalk.yellow(`Harness check: ${readiness.summary}`)
  );
  if (!readiness.ready && readiness.nextStep) {
    console.log(chalk.dim(`Next: ${readiness.nextStep}`));
  }
}

async function renderStatus(options: DaemonCommerceClientOptions): Promise<void> {
  const [health, wallet, workroom, agreements] = await Promise.all([
    fetchDaemonHealth(options),
    fetchDaemonWalletStatus(options),
    fetchDaemonWorkroomStatus(options),
    fetchDaemonAgreements(options),
  ]);

  console.log(chalk.bold("◈ ARC-402 Commerce Shell"));
  console.log(
    `  Wallet: ${truncateAddress(wallet.wallet)}  Chain: ${wallet.chainId}  Workroom: ${workroom.status}  Agreements: ${agreements.agreements.length}`
  );
  console.log(`  Daemon: ${truncateAddress(wallet.daemonId)}  RPC: ${wallet.rpcUrl}`);
  console.log(`  Health: ${health.ok ? chalk.green("ok") : chalk.red("down")}`);
}

async function renderAgreements(options: DaemonCommerceClientOptions): Promise<void> {
  const result = await fetchDaemonAgreements(options);
  console.log(chalk.bold("◈ Agreements"));
  if (result.agreements.length === 0) {
    console.log("  No agreements found.");
    return;
  }

  for (const agreement of result.agreements.slice(0, 10)) {
    const id = agreement["agreement_id"] ?? agreement["id"] ?? "n/a";
    const counterparty =
      agreement["provider_address"] ??
      agreement["hirer_address"] ??
      agreement["counterparty"] ??
      "unknown";
    const status = formatAgreementStatus(agreement["status"]);
    console.log(`  #${String(id).padEnd(6)} ${status.padEnd(22)} ${truncateAddress(String(counterparty))}`);
  }
}

async function renderWorkroom(options: DaemonCommerceClientOptions): Promise<void> {
  const result = await fetchDaemonWorkroomStatus(options);
  console.log(chalk.bold("◈ Workroom"));
  console.log(`  Status: ${result.status}`);
}

function printHelp(): void {
  console.log(chalk.bold("◈ Commerce REPL"));
  console.log("  status            Refresh wallet/workroom/agreement context from the configured node");
  console.log("  agreements        List recent agreements from the configured node");
  console.log("  workroom          Show current workroom status");
  console.log("  setup             Re-run the guided node/harness setup");
  console.log("  /<command>        Run any existing arc402 CLI command inside the shell");
  console.log("  help              Show this help");
  console.log("  exit              Leave the shell");
}

async function dispatchCliCommand(line: string): Promise<void> {
  const tokens = parseTokens(line);
  if (tokens.length === 0) return;

  const { createProgram } = await import("../program");
  const program = createProgram();
  program.exitOverride();
  program.configureOutput({
    writeOut: (str) => process.stdout.write(str),
    writeErr: (str) => process.stderr.write(str),
  });

  try {
    await program.parseAsync(["node", "arc402", ...tokens]);
  } catch (err) {
    const error = err as { code?: string; message?: string };
    if (
      error.code === "commander.helpDisplayed" ||
      error.code === "commander.version" ||
      error.code === "commander.executeSubCommandAsync"
    ) {
      return;
    }
    throw err;
  }
}

function inferIntent(input: string): "status" | "agreements" | "workroom" | "setup" | "help" | "unknown" {
  const normalized = input.trim().toLowerCase();
  if (normalized === "help") return "help";
  if (normalized === "setup") return "setup";
  if (normalized.includes("agreement")) return "agreements";
  if (normalized.includes("workroom")) return "workroom";
  if (normalized.includes("status") || normalized.includes("wallet") || normalized.includes("balance")) return "status";
  return "unknown";
}

export function registerChatCommand(program: Command): void {
  program
    .command("chat")
    .description("Launch the ARC-402 Commerce REPL with guided node and harness setup")
    .option("--daemon-url <url>", "Override the daemon API base URL")
    .option("--harness <name>", "Harness to describe and expect: openclaw | claude-code | codex | hermes")
    .option("--model <name>", "Default model hint shown in the shell")
    .option("--setup", "Run guided chat setup before entering the shell")
    .option("--local", "Force local node mode")
    .option("--remote", "Force remote node mode")
    .action(async (opts: ChatOptions) => {
      if (!process.stdin.isTTY || !process.stdout.isTTY) {
        throw new Error("arc402 chat requires an interactive TTY");
      }
      if (opts.local && opts.remote) {
        throw new Error("Choose either --local or --remote, not both.");
      }

      let state = resolveInitialRuntimeConfig(opts);
      let runtimeConfig: ChatRuntimeConfig | null | undefined = state.config;

      if (opts.setup || state.missingHarness) {
        if (state.missingHarness) {
          console.log(chalk.yellow("No chat harness is configured yet. Running guided setup."));
          console.log("");
        }
        runtimeConfig = await runGuidedSetup(runtimeConfig);
        if (!runtimeConfig) {
          return;
        }
        state = { missingHarness: false, config: runtimeConfig };
      }

      if (!runtimeConfig) {
        throw new Error("Chat setup is incomplete. Run `arc402 chat --setup`.");
      }

      let activeConfig: ChatRuntimeConfig = runtimeConfig;
      const clientOptions: DaemonCommerceClientOptions = { baseUrl: activeConfig.daemonUrl };

      printBanner(activeConfig);

      try {
        await renderStatus(clientOptions);
      } catch (err) {
        console.log(
          chalk.yellow(
            `  Daemon context unavailable from ${activeConfig.nodeMode} node ${activeConfig.daemonUrl}: ${err instanceof Error ? err.message : String(err)}`
          )
        );
      }

      printHelp();

      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        prompt: `${chalk.cyanBright(">")} `,
        terminal: true,
      });

      rl.prompt();

      rl.on("line", async (line) => {
        const trimmed = line.trim();

        if (!trimmed) {
          rl.prompt();
          return;
        }

        try {
          if (trimmed === "exit" || trimmed === "quit") {
            rl.close();
            return;
          }

          if (trimmed.startsWith("/")) {
            await dispatchCliCommand(trimmed.slice(1));
            console.log("");
            rl.prompt();
            return;
          }

          switch (inferIntent(trimmed)) {
            case "help":
              printHelp();
              break;
            case "setup": {
              const updated = await runGuidedSetup(activeConfig);
              if (updated) {
                activeConfig = updated;
                clientOptions.baseUrl = updated.daemonUrl;
                printBanner(activeConfig);
              }
              break;
            }
            case "status":
              await renderStatus(clientOptions);
              break;
            case "agreements":
              await renderAgreements(clientOptions);
              break;
            case "workroom":
              await renderWorkroom(clientOptions);
              break;
            default:
              console.log(`  Chat is connected to a ${activeConfig.nodeMode} node and expects ${getHarnessLabel(activeConfig.harness)}.`);
              console.log("  Use `status`, `agreements`, `workroom`, `setup`, or `/...` for direct CLI commands.");
              break;
          }
        } catch (err) {
          console.log(`  ${chalk.red(err instanceof Error ? err.message : String(err))}`);
        }

        console.log("");
        rl.prompt();
      });

      rl.on("close", () => {
        console.log(chalk.dim("Commerce shell closed."));
        process.exit(0);
      });

      await new Promise<never>(() => {
        // readline keeps the process alive until close()
      });
    });
}
