import readline from "node:readline";
import chalk from "chalk";
import fs from "fs";
import path from "path";
import os from "os";
import { createProgram } from "./program";
import { renderBanner, BannerConfig } from "./ui/banner";
import { c } from "./ui/colors";

// ─── Prompt ───────────────────────────────────────────────────────────────────

const PROMPT =
  chalk.cyanBright("◈") +
  " " +
  chalk.dim("arc402") +
  " " +
  chalk.white(">") +
  " ";

// ─── Sentinel thrown to intercept process.exit() from commands ───────────────

class REPLExitSignal extends Error {
  constructor(public readonly code: number = 0) {
    super("repl-exit-signal");
  }
}

// ─── Config / banner helpers ──────────────────────────────────────────────────

const CONFIG_PATH = path.join(os.homedir(), ".arc402", "config.json");

async function loadBannerConfig(): Promise<BannerConfig | undefined> {
  if (!fs.existsSync(CONFIG_PATH)) return undefined;
  try {
    const raw = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8")) as {
      network?: string;
      walletContractAddress?: string;
      rpcUrl?: string;
    };
    const cfg: BannerConfig = { network: raw.network };
    if (raw.walletContractAddress) {
      const w = raw.walletContractAddress;
      cfg.wallet = `${w.slice(0, 6)}...${w.slice(-4)}`;
    }
    if (raw.rpcUrl && raw.walletContractAddress) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const ethersLib = require("ethers") as typeof import("ethers");
        const provider = new ethersLib.ethers.JsonRpcProvider(raw.rpcUrl);
        const bal = await Promise.race([
          provider.getBalance(raw.walletContractAddress),
          new Promise<never>((_, r) =>
            setTimeout(() => r(new Error("timeout")), 2000)
          ),
        ]);
        cfg.balance = `${parseFloat(
          ethersLib.ethers.formatEther(bal)
        ).toFixed(4)} ETH`;
      } catch {
        /* skip balance on timeout */
      }
    }
    return cfg;
  } catch {
    return undefined;
  }
}

// ─── Status dashboard ─────────────────────────────────────────────────────────

async function showStatus(): Promise<void> {
  console.log();
  console.log(
    " " + chalk.cyanBright("◈") + " " + chalk.dim("─".repeat(45))
  );
  if (!fs.existsSync(CONFIG_PATH)) {
    console.log(
      chalk.dim("  No config found. Run 'config init' to get started.")
    );
    console.log();
    return;
  }
  try {
    const raw = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8")) as {
      network?: string;
      walletContractAddress?: string;
      rpcUrl?: string;
    };
    if (raw.network)
      console.log(` ${chalk.dim("Network")}   ${chalk.white(raw.network)}`);
    if (raw.walletContractAddress) {
      const w = raw.walletContractAddress;
      console.log(
        ` ${chalk.dim("Wallet")}    ${chalk.white(`${w.slice(0, 6)}...${w.slice(-4)}`)}`
      );
    }
    if (raw.rpcUrl && raw.walletContractAddress) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const ethersLib = require("ethers") as typeof import("ethers");
        const provider = new ethersLib.ethers.JsonRpcProvider(raw.rpcUrl);
        const bal = await Promise.race([
          provider.getBalance(raw.walletContractAddress),
          new Promise<never>((_, r) =>
            setTimeout(() => r(new Error("timeout")), 2000)
          ),
        ]);
        console.log(
          ` ${chalk.dim("Balance")}   ${chalk.white(
            `${parseFloat(ethersLib.ethers.formatEther(bal)).toFixed(4)} ETH`
          )}`
        );
      } catch {
        /* skip */
      }
    }
  } catch {
    /* skip */
  }
  console.log();
}

// ─── Shell-style tokenizer (handles "quoted strings") ────────────────────────

function parseTokens(input: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let inQuote = false;
  let quoteChar = "";

  for (const ch of input) {
    if (inQuote) {
      if (ch === quoteChar) {
        inQuote = false;
      } else {
        current += ch;
      }
    } else if (ch === '"' || ch === "'") {
      inQuote = true;
      quoteChar = ch;
    } else if (ch === " ") {
      if (current) {
        tokens.push(current);
        current = "";
      }
    } else {
      current += ch;
    }
  }
  if (current) tokens.push(current);
  return tokens;
}

// ─── Tab completer ────────────────────────────────────────────────────────────

function buildCompleter(
  topCmds: string[],
  subCmds: Map<string, string[]>
): readline.Completer {
  const specialCmds = ["help", "exit", "quit", "clear", "status"];
  const allTop = [...specialCmds, ...topCmds];

  return function completer(line: string): [string[], string] {
    const trimmed = line.trimStart();
    const spaceIdx = trimmed.indexOf(" ");

    if (spaceIdx === -1) {
      // Completing the first word (top-level command)
      const hits = allTop.filter((cmd) => cmd.startsWith(trimmed));
      return [hits.length ? hits : allTop, trimmed];
    }

    // Completing a subcommand
    const parent = trimmed.slice(0, spaceIdx);
    const rest = trimmed.slice(spaceIdx + 1);
    const subs = subCmds.get(parent) ?? [];
    const hits = subs.filter((s) => s.startsWith(rest));
    return [
      hits.map((s) => `${parent} ${s}`),
      trimmed,
    ];
  };
}

// ─── REPL entry point ─────────────────────────────────────────────────────────

export async function startREPL(): Promise<void> {
  // Show the banner
  const bannerCfg = await loadBannerConfig();
  renderBanner(bannerCfg);

  // Build a template program once just to extract command metadata for completions
  const template = createProgram();
  const topCmds = template.commands.map((cmd) => cmd.name());
  const subCmds = new Map<string, string[]>();
  for (const cmd of template.commands) {
    if (cmd.commands.length > 0) {
      subCmds.set(
        cmd.name(),
        cmd.commands.map((s) => s.name())
      );
    }
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: PROMPT,
    completer: buildCompleter(topCmds, subCmds),
    terminal: true,
    historySize: 200,
  });

  function goodbye(): void {
    console.log(
      "\n " + chalk.cyanBright("◈") + chalk.dim(" goodbye")
    );
  }

  rl.on("SIGINT", () => {
    goodbye();
    rl.close();
    process.exit(0);
  });

  rl.on("close", () => {
    goodbye();
    process.exit(0);
  });

  rl.prompt();

  // Process lines one at a time
  for await (const line of rl) {
    const input = line.trim();

    if (!input) {
      rl.prompt();
      continue;
    }

    // ── Special built-in commands ──────────────────────────────────────────

    if (input === "exit" || input === "quit") {
      goodbye();
      rl.close();
      process.exit(0);
    }

    if (input === "clear") {
      console.clear();
      const cfg = await loadBannerConfig();
      renderBanner(cfg);
      rl.prompt();
      continue;
    }

    if (input === "status") {
      await showStatus();
      rl.prompt();
      continue;
    }

    if (input === "help" || input === "help ") {
      // Show the full commander help via the program
      const prog = createProgram();
      prog.exitOverride();
      prog.configureOutput({
        writeOut: (str) => process.stdout.write(str),
        writeErr: (str) => process.stderr.write(str),
      });
      try {
        await prog.parseAsync(["node", "arc402", "--help"]);
      } catch {
        /* commander throws after printing help — ignore */
      }
      rl.prompt();
      continue;
    }

    // ── Dispatch to commander ──────────────────────────────────────────────

    const tokens = parseTokens(input);
    const prog = createProgram();
    prog.exitOverride();
    prog.configureOutput({
      writeOut: (str) => process.stdout.write(str),
      writeErr: (str) => process.stderr.write(str),
    });

    // Intercept process.exit() so a command exiting doesn't kill the REPL
    const origExit = process.exit;
    (process as NodeJS.Process).exit = ((code?: number) => {
      throw new REPLExitSignal(code ?? 0);
    }) as typeof process.exit;

    try {
      await prog.parseAsync(["node", "arc402", ...tokens]);
    } catch (err) {
      if (err instanceof REPLExitSignal) {
        // Command called process.exit() — normal, just continue the REPL
      } else {
        const e = err as { code?: string; message?: string };
        if (
          e.code === "commander.helpDisplayed" ||
          e.code === "commander.version"
        ) {
          // Help / version output was already written — nothing to do
        } else if (e.code === "commander.unknownCommand") {
          console.log(
            `\n ${c.failure} ${chalk.red(`Unknown command: ${chalk.white(tokens[0])}`)}`
          );
          console.log(chalk.dim("  Type 'help' for available commands\n"));
        } else if (e.code?.startsWith("commander.")) {
          console.log(`\n ${c.failure} ${chalk.red(e.message ?? String(err))}\n`);
        } else {
          console.log(
            `\n ${c.failure} ${chalk.red(e.message ?? String(err))}\n`
          );
        }
      }
    } finally {
      (process as NodeJS.Process).exit = origExit;
    }

    rl.prompt();
  }
}
