#!/usr/bin/env node
import { createProgram } from "./program";
import { startREPL } from "./repl";
import { configExists, loadConfig, saveConfig } from "./config";
import { renderOperatorSummary } from "./commands/status";

// ── Upgrade safety check ────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-var-requires
const currentVersion: string = (require("../package.json") as { version: string }).version;

async function checkUpgrade(): Promise<void> {
  if (!configExists()) return;
  try {
    const config = loadConfig();
    const prev = config.lastCliVersion;
    if (prev && prev !== currentVersion) {
      await renderOperatorSummary({
        heading: { type: "upgrade", from: prev, to: currentVersion },
        includeGuidance: false,
      });
    }
    if (config.lastCliVersion !== currentVersion) {
      // Never overwrite existing fields — only update lastCliVersion
      saveConfig({ ...config, lastCliVersion: currentVersion });
    }
  } catch {
    // Never crash on upgrade check
  }
}

const printMode = process.argv.includes("--print");

// Detect if a subcommand was provided (any arg after the binary that doesn't start with -)
const knownSubcommands = (() => {
  try {
    const prog = createProgram();
    return new Set(prog.commands.map((cmd) => cmd.name()));
  } catch {
    return new Set<string>();
  }
})();
const argv = process.argv.slice(2).filter((a) => a !== "--print");
const hasSubcommand = argv.some((a) => !a.startsWith("-") && knownSubcommands.has(a));

async function main(): Promise<void> {
  if (printMode) {
    process.argv = process.argv.filter((a) => a !== "--print");
    process.env["NO_COLOR"] = "1";
    process.env["FORCE_COLOR"] = "0";
    process.env["ARC402_PRINT"] = "1";
    await checkUpgrade();
    const program = createProgram();
    await program.parseAsync(process.argv);
    return;
  }

  if (process.stdout.isTTY && !hasSubcommand && process.argv.length <= 2) {
    await checkUpgrade();
    try {
      const { launchTUI } = await import("./tui/index");
      await launchTUI();
      return;
    } catch (e) {
      console.error("TUI failed to start:", e instanceof Error ? e.message : String(e));
      await startREPL();
      return;
    }
  }

  if (process.argv.length <= 2) {
    await checkUpgrade();
    await startREPL();
    return;
  }

  await checkUpgrade();
  const program = createProgram();
  program.parse(process.argv);
}

void main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
