/**
 * arc402 hermes init
 *
 * One-command setup for Hermes operators integrating with ARC-402.
 *
 * What it does:
 *   1. Checks Hermes is installed
 *   2. Installs the arc402-agent skill into ~/.hermes/skills/
 *   3. Copies the arc402 plugin into ~/.hermes/plugins/
 *   4. Scaffolds ~/.arc402/worker/hermes-arc/ with SOUL.md, IDENTITY.md, config.json
 *   5. Generates ~/.arc402/hermes-daemon.toml with prompts for wallet + endpoint
 *   6. Prints a setup summary and next steps
 */

import { Command } from "commander";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { execSync } from "child_process";
import chalk from "chalk";
import prompts from "prompts";

const ARC402_DIR = path.join(os.homedir(), ".arc402");
const HERMES_DIR = path.join(os.homedir(), ".hermes");

// Resolve the repo root relative to this compiled file.
// In the built tree: dist/commands/hermes-init.js → ../../.. → repo root
// We look for hermes/ from the package root (one level above dist/).
function findRepoRoot(): string {
  // __dirname at runtime is <repo>/cli/dist/commands (after tsc)
  // Walk up to find the hermes/ directory.
  let dir = __dirname;
  for (let i = 0; i < 6; i++) {
    if (fs.existsSync(path.join(dir, "hermes"))) return dir;
    dir = path.dirname(dir);
  }
  // Fallback: assume CWD is repo root (dev / test mode)
  return process.cwd();
}

function isHermesInstalled(): boolean {
  try {
    execSync("which hermes", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function ensureDir(p: string): void {
  fs.mkdirSync(p, { recursive: true });
}

function copyFile(src: string, dest: string, label: string): void {
  if (!fs.existsSync(src)) {
    console.log(chalk.yellow(`  skip  ${label} (source not found: ${src})`));
    return;
  }
  fs.copyFileSync(src, dest);
  console.log(chalk.green(`  copied ${label}`));
}

function writeFileAtomic(dest: string, content: string, label: string): void {
  fs.writeFileSync(dest, content, "utf-8");
  console.log(chalk.green(`  wrote  ${label}`));
}

function printSection(title: string): void {
  console.log(`\n${chalk.bold.cyan(`── ${title}`)}`);
}

export function registerHermesInitCommand(program: Command): void {
  const hermes = program
    .command("hermes")
    .description("Hermes gateway integration commands");

  hermes
    .command("init")
    .description(
      "Set up ARC-402 integration for a Hermes operator — installs skill, plugin, workroom scaffold, and daemon config"
    )
    .option("--yes", "Skip confirmation prompts (use defaults)")
    .action(async (opts: { yes?: boolean }) => {
      const skipPrompts = opts.yes ?? false;

      console.log(chalk.bold("\nARC-402 × Hermes Integration Setup\n"));

      // ── Step 1: Check Hermes ───────────────────────────────────────────────

      printSection("Checking Hermes");
      if (isHermesInstalled()) {
        let version = "(unknown)";
        try {
          version = execSync("hermes --version", { encoding: "utf-8" }).trim();
        } catch { /* ignore */ }
        console.log(chalk.green(`  ✓ Hermes found: ${version}`));
        if (!version.match(/v?0\.([6-9]|[1-9]\d)/)) {
          console.log(
            chalk.yellow(
              "  ⚠  Hermes v0.6.0+ is required for ctx.inject_message() support.\n" +
              "     Plugin will install but on_message hook needs Hermes ≥ v0.6.0."
            )
          );
        }
      } else {
        console.log(
          chalk.yellow(
            "  ⚠  Hermes not found in PATH.\n" +
            "     The skill and plugin files will still be installed to standard paths.\n" +
            "     Install Hermes first: https://github.com/NousResearch/hermes-agent"
          )
        );
        if (!skipPrompts) {
          const { cont } = await prompts({
            type: "confirm",
            name: "cont",
            message: "Continue anyway?",
            initial: true,
          });
          if (!cont) {
            console.log("Aborted.");
            process.exit(0);
          }
        }
      }

      const repoRoot = findRepoRoot();

      // ── Step 2: Skill ──────────────────────────────────────────────────────

      printSection("Installing arc402-agent skill");
      const skillSrc = path.join(repoRoot, "hermes", "skills", "arc402-agent", "SKILL.md");
      const skillDestDir = path.join(HERMES_DIR, "skills", "arc402-agent");
      ensureDir(skillDestDir);
      copyFile(skillSrc, path.join(skillDestDir, "SKILL.md"), "~/.hermes/skills/arc402-agent/SKILL.md");

      // ── Step 3: Plugin ─────────────────────────────────────────────────────

      printSection("Installing arc402 plugin");
      const pluginSrc = path.join(repoRoot, "hermes", "plugins", "arc402_plugin.py");
      const pluginDestDir = path.join(HERMES_DIR, "plugins");
      ensureDir(pluginDestDir);
      copyFile(pluginSrc, path.join(pluginDestDir, "arc402_plugin.py"), "~/.hermes/plugins/arc402_plugin.py");

      console.log(
        chalk.dim(
          "\n  Add to ~/.hermes/config.yaml:\n\n" +
          "    plugins:\n" +
          "      arc402:\n" +
          "        enabled: true\n" +
          "        wallet_address: \"0x...\"\n" +
          "        machine_key_env: \"ARC402_MACHINE_KEY\"\n" +
          "        daemon_port: 4402\n" +
          "        auto_accept: true\n" +
          "        spend_limits:\n" +
          "          hire: 0.1\n" +
          "          compute: 0.05\n" +
          "          arena: 0.05\n" +
          "          general: 0.001\n" +
          "        workroom:\n" +
          "          enabled: true\n" +
          "          agent_id: hermes-arc\n" +
          "          inference_endpoint: http://localhost:8080/v1\n"
        )
      );

      // ── Step 4: Worker scaffold ────────────────────────────────────────────

      printSection("Scaffolding ~/.arc402/worker/hermes-arc/");
      const workerSrcDir = path.join(repoRoot, "hermes", "workroom", "hermes-worker");
      const workerDestDir = path.join(ARC402_DIR, "worker", "hermes-arc");

      ensureDir(path.join(workerDestDir, "memory"));
      ensureDir(path.join(workerDestDir, "skills"));
      ensureDir(path.join(workerDestDir, "knowledge"));
      ensureDir(path.join(workerDestDir, "datasets"));

      const workerFiles = ["SOUL.md", "IDENTITY.md", "config.json"] as const;
      for (const file of workerFiles) {
        const src = path.join(workerSrcDir, file);
        const dest = path.join(workerDestDir, file);
        if (fs.existsSync(dest)) {
          console.log(chalk.dim(`  exists  ${path.join("~/.arc402/worker/hermes-arc", file)} (skipped — not overwriting)`));
        } else {
          copyFile(src, dest, path.join("~/.arc402/worker/hermes-arc", file));
        }
      }

      const learningsSrc = path.join(workerSrcDir, "memory", "learnings.md");
      const learningsDest = path.join(workerDestDir, "memory", "learnings.md");
      if (!fs.existsSync(learningsDest)) {
        copyFile(learningsSrc, learningsDest, "~/.arc402/worker/hermes-arc/memory/learnings.md");
      } else {
        console.log(chalk.dim("  exists  ~/.arc402/worker/hermes-arc/memory/learnings.md (skipped — keeping existing learnings)"));
      }

      // ── Step 5: hermes-daemon.toml ─────────────────────────────────────────

      printSection("Generating ~/.arc402/hermes-daemon.toml");

      const daemonDest = path.join(ARC402_DIR, "hermes-daemon.toml");
      ensureDir(ARC402_DIR);

      let walletAddress = "";
      let inferenceEndpoint = "http://localhost:8080/v1";

      if (!skipPrompts) {
        const answers = await prompts([
          {
            type: "text",
            name: "walletAddress",
            message: "Your ARC-402 wallet address on Base (leave blank to fill in later):",
            initial: "",
            validate: (v: string) =>
              v === "" || /^0x[0-9a-fA-F]{40}$/.test(v) || "Must be a valid 0x Ethereum address",
          },
          {
            type: "text",
            name: "inferenceEndpoint",
            message: "Hermes inference endpoint:",
            initial: "http://localhost:8080/v1",
          },
        ]);
        walletAddress = answers.walletAddress ?? "";
        inferenceEndpoint = answers.inferenceEndpoint ?? "http://localhost:8080/v1";
      }

      if (fs.existsSync(daemonDest)) {
        console.log(chalk.dim("  exists  ~/.arc402/hermes-daemon.toml (skipped — not overwriting)"));
        console.log(chalk.dim("  Delete and re-run if you want a fresh config."));
      } else {
        const tomlContent = [
          `[agent]`,
          `name = "hermes-arc"`,
          `wallet_address = "${walletAddress}"      # set your ERC-4337 wallet address on Base`,
          `endpoint = ""            # set after tunnel setup: arc402 endpoint init <name>`,
          ``,
          `[worker]`,
          `agent_type = "hermes"`,
          `inference_endpoint = "${inferenceEndpoint}"`,
          `# Docker: use "http://host.docker.internal:8080/v1" when running in container`,
          `model = "hermes-arc"`,
          `max_concurrent_jobs = 2`,
          `job_timeout_seconds = 3600`,
          `auto_execute = true`,
          `auto_accept = true`,
          ``,
          `[policy]`,
          `file = "~/.arc402/arena-policy.yaml"`,
          ``,
          `[workroom]`,
          `data_dir = "~/.arc402/workroom"`,
          `jobs_dir = "~/.arc402/jobs"`,
          ``,
        ].join("\n");

        writeFileAtomic(daemonDest, tomlContent, "~/.arc402/hermes-daemon.toml");
      }

      // ── Summary ────────────────────────────────────────────────────────────

      console.log(`\n${chalk.bold.green("Setup complete.")}\n`);

      console.log(chalk.bold("Files installed:"));
      console.log(`  ${chalk.cyan("~/.hermes/skills/arc402-agent/SKILL.md")}   — teaches your agent to use arc402 CLI`);
      console.log(`  ${chalk.cyan("~/.hermes/plugins/arc402_plugin.py")}        — gateway-level hire interception`);
      console.log(`  ${chalk.cyan("~/.arc402/worker/hermes-arc/")}              — worker identity + memory scaffold`);
      console.log(`  ${chalk.cyan("~/.arc402/hermes-daemon.toml")}             — daemon config`);

      console.log(`\n${chalk.bold("Next steps:")}`);
      console.log(`  1. ${chalk.white("Deploy your wallet:")}            arc402 wallet deploy`);
      console.log(`  2. ${chalk.white("Configure the daemon:")}          arc402 daemon init`);
      console.log(`     Select ${chalk.cyan('"hermes"')} as the harness when prompted.`);
      console.log(`  3. ${chalk.white("Initialise the workroom:")}       arc402 workroom init`);
      console.log(`  4. ${chalk.white("Start the workroom:")}            arc402 workroom start`);
      console.log(`  5. ${chalk.white("Register your agent:")}           arc402 agent register --capability <type> --endpoint <url>`);
      console.log(`  6. ${chalk.white("Add plugin config to:")}          ~/.hermes/config.yaml  (config block shown above)`);
      console.log(`  7. ${chalk.white("Set machine key env var:")}       export ARC402_MACHINE_KEY=<your-machine-key>`);
      console.log(`  8. ${chalk.white("Restart Hermes:")}                hermes restart  (or restart your gateway)`);

      console.log(`\n${chalk.dim("Docs: hermes/workroom/README.md | docs/hermes-integration.md | hermes/DELIVERY-SPEC.md")}`);
    });
}
