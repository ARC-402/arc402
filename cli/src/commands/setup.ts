import { Command } from "commander";
import * as net from "net";
import { execSync, spawn } from "child_process";
import chalk from "chalk";
import prompts from "prompts";
import { configExists, loadConfig, getSubdomainApi } from "../config";

const DAEMON_PORT = 4402;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function checkPort(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(1000);
    socket.on("connect", () => { socket.destroy(); resolve(true); });
    socket.on("timeout", () => { socket.destroy(); resolve(false); });
    socket.on("error", () => resolve(false));
    socket.connect(port, "127.0.0.1");
  });
}

function isNgrokInstalled(): boolean {
  try {
    execSync("which ngrok", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ─── Step handlers ────────────────────────────────────────────────────────────

async function stepDaemon(): Promise<boolean> {
  process.stdout.write("Checking relay daemon on port 4402… ");
  const running = await checkPort(DAEMON_PORT);

  if (running) {
    console.log(chalk.green("✓ Daemon running on port 4402"));
    return true;
  }

  console.log(chalk.yellow("not detected"));

  const { start } = await prompts({
    type: "confirm",
    name: "start",
    message: "Start the arc402 relay daemon now?",
    initial: true,
  });

  if (!start) {
    console.log(chalk.dim("  Skipping — continuing without a local daemon."));
    return false;
  }

  // Attempt to start the daemon. Requires a configured wallet address; fall back
  // gracefully if config is missing or the daemon does not answer quickly.
  let address = "0x0000000000000000000000000000000000000000";
  try {
    if (configExists()) {
      const cfg = loadConfig();
      // Prefer the wallet address stored in config (Coinbase / EOA) if available.
      address = (cfg as unknown as Record<string, unknown>).address as string ?? address;
    }
  } catch { /* ignore — best-effort */ }

  console.log(chalk.dim("  Spawning arc402 relay daemon…"));
  const child = spawn(
    "arc402",
    [
      "relay", "daemon", "start",
      "--relay",         `http://localhost:${DAEMON_PORT}`,
      "--address",       address,
      "--poll-interval", "2000",
      "--on-message",    "echo",
    ],
    { detached: true, stdio: "ignore" }
  );
  child.unref();

  await sleep(1500);

  const nowRunning = await checkPort(DAEMON_PORT);
  if (nowRunning) {
    console.log(chalk.green("✓ Daemon running on port 4402"));
    return true;
  }

  console.log(chalk.yellow("  Daemon did not respond on port 4402 yet."));
  console.log(chalk.dim("  If you haven't configured a wallet, run `arc402 config init` first."));
  console.log(chalk.dim("  Then re-run this wizard.\n"));
  return false;
}

async function stepNgrok(): Promise<void> {
  if (!isNgrokInstalled()) {
    console.log(chalk.yellow("\nngrok is not installed. Install it first:\n"));
    console.log(chalk.bold("  macOS (Homebrew)"));
    console.log("    brew install ngrok/ngrok/ngrok\n");
    console.log(chalk.bold("  Linux (apt)"));
    console.log(
      "    curl -sSL https://ngrok-agent.s3.amazonaws.com/ngrok.asc \\\n" +
      "      | sudo tee /etc/apt/trusted.gpg.d/ngrok.asc >/dev/null\n" +
      "    echo 'deb https://ngrok-agent.s3.amazonaws.com buster main' \\\n" +
      "      | sudo tee /etc/apt/sources.list.d/ngrok.list\n" +
      "    sudo apt update && sudo apt install ngrok\n"
    );
    console.log(chalk.bold("  Direct download"));
    console.log("    https://ngrok.com/download\n");
    console.log(chalk.dim("After installing, authenticate once:"));
    console.log("    ngrok config add-authtoken <YOUR_TOKEN>\n");
    console.log(chalk.dim("Then expose your relay:"));
    console.log(`    ngrok http ${DAEMON_PORT}\n`);
    console.log(chalk.dim("Re-run this wizard and choose 'I have a public URL already'."));
    return;
  }

  console.log(chalk.cyan(`\nStarting ngrok tunnel → port ${DAEMON_PORT}…`));
  console.log(chalk.dim("  Copy the Forwarding URL shown below and register it with the agent registry."));
  console.log(chalk.dim("  Press Ctrl+C to stop.\n"));

  const ngrok = spawn("ngrok", ["http", String(DAEMON_PORT)], { stdio: "inherit" });
  await new Promise<void>((resolve) => { ngrok.on("exit", () => resolve()); });
}

async function stepSubdomainService(apiBase: string): Promise<void> {
  let subdomain: string | undefined;

  // Keep prompting until the user picks an available name or cancels
  while (true) {
    const result = await prompts({
      type: "text",
      name: "subdomain",
      message: "Choose a subdomain name (e.g. my-agent → my-agent.arc402.xyz):",
      hint: "lowercase letters, numbers, and hyphens only",
      validate: (v: string) =>
        /^[a-z0-9-]+$/.test(v) ? true : "Use lowercase letters, numbers, and hyphens only",
    });

    if (!result.subdomain) return; // user cancelled

    process.stdout.write(chalk.dim(`  Checking availability of ${result.subdomain}.arc402.xyz… `));

    try {
      const checkRes = await fetch(`${apiBase}/check/${result.subdomain}`);
      const checkData = await checkRes.json() as { available?: boolean };

      if (checkData.available) {
        console.log(chalk.green("available"));
        subdomain = result.subdomain;
        break;
      } else {
        console.log(chalk.red("taken"));
        console.log(chalk.dim("  That name is already registered. Try another.\n"));
        // loop and prompt again
      }
    } catch {
      console.log(chalk.yellow("could not check — continuing anyway"));
      subdomain = result.subdomain;
      break;
    }
  }

  if (!subdomain) return;

  console.log(chalk.dim(`\n  Using subdomain API: ${apiBase}`));
  console.log(chalk.dim(`  Registering ${subdomain} …`));

  try {
    const res = await fetch(`${apiBase}/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subdomain }),
    });
    const data = await res.json() as { url?: string; error?: string };

    if (!res.ok) {
      console.log(chalk.red(`\n✗ Registration failed: ${data.error ?? res.statusText}`));
      return;
    }

    const endpoint = data.url ?? `https://${subdomain}.arc402.xyz`;
    console.log(chalk.green(`\n✓ Subdomain registered: ${endpoint}`));
    console.log(chalk.dim("\nRegister it with the agent registry:"));
    console.log(`    arc402 agent update --endpoint ${endpoint}`);
  } catch (err) {
    console.log(chalk.red(`\n✗ Request failed: ${err instanceof Error ? err.message : String(err)}`));
  }
}

async function stepManualUrl(): Promise<void> {
  const { url } = await prompts({
    type: "text",
    name: "url",
    message: "Your public endpoint URL:",
    hint: "e.g. https://my-node.example.com",
    validate: (v: string) =>
      v.startsWith("http://") || v.startsWith("https://")
        ? true
        : "Must start with http:// or https://",
  });

  if (!url) return;

  console.log(chalk.green(`\n✓ Public endpoint: ${url}`));
  console.log(chalk.dim("\nRegister it with the agent registry:"));
  console.log(`    arc402 agent update --endpoint ${url}`);
}

async function stepCloudflare(): Promise<void> {
  console.log(chalk.cyan("\nCloudflare Tunnel — quick-start:\n"));
  console.log(chalk.bold("  1. Install cloudflared"));
  console.log("       brew install cloudflare/cloudflare/cloudflared   # macOS");
  console.log("       # Linux: https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/\n");
  console.log(chalk.bold("  2. Authenticate"));
  console.log("       cloudflared tunnel login\n");
  console.log(chalk.bold("  3. Create and run a tunnel"));
  console.log("       cloudflared tunnel create arc402-node");
  console.log("       cloudflared tunnel route dns arc402-node <your-subdomain.example.com>");
  console.log(`       cloudflared tunnel run --url http://localhost:${DAEMON_PORT} arc402-node\n`);
  console.log(chalk.dim("Then re-run this wizard and choose 'I have a public URL already'."));
}

// ─── Command registration ─────────────────────────────────────────────────────

export function registerSetupCommands(program: Command): void {
  const setup = program
    .command("setup")
    .description("Onboarding wizards for first-time node operators");

  setup
    .command("transfer-subdomain <subdomain>")
    .description("Transfer a subdomain to your current wallet (verified by shared owner())")
    .action(async (subdomain: string) => {
      let config;
      try {
        config = loadConfig();
      } catch {
        console.log(chalk.red("No config found. Run `arc402 config init` first."));
        process.exit(1);
      }

      const newWalletAddress = config.walletContractAddress;
      if (!newWalletAddress) {
        console.log(chalk.red("No walletContractAddress in config. Run `arc402 config init` first."));
        process.exit(1);
      }

      const apiBase = getSubdomainApi(config);
      const short = newWalletAddress.slice(0, 8) + "…" + newWalletAddress.slice(-4);
      console.log(chalk.bold(`\nTransferring ${subdomain}.arc402.xyz → ${short}\n`));

      let res: Response;
      try {
        res = await fetch(`${apiBase}/transfer`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ subdomain, newWalletAddress }),
        });
      } catch (e) {
        console.log(chalk.red(`\n✗ Request failed: ${e instanceof Error ? e.message : String(e)}`));
        process.exit(1);
      }

      const data = await res.json() as { status?: string; newWalletAddress?: string; error?: string };

      if (!res.ok) {
        console.log(chalk.red(`\n✗ Transfer failed: ${data.error ?? res.statusText}`));
        process.exit(1);
      }

      console.log(chalk.green(`✅ ${subdomain}.arc402.xyz now points to ${short}`));
    });

  setup
    .command("endpoint")
    .description(
      "Interactive wizard: start the relay daemon → create a public tunnel → " +
      "get a live, hirable endpoint in under 2 minutes"
    )
    .action(async () => {
      console.log(chalk.bold("\narc402 endpoint setup\n"));

      // ── Step 1: Daemon ───────────────────────────────────────────────────────
      await stepDaemon();

      // Resolve subdomain API base from config (falls back to https://api.arc402.xyz)
      let apiBase = "https://api.arc402.xyz";
      try {
        if (configExists()) {
          apiBase = getSubdomainApi(loadConfig());
        }
      } catch { /* ignore — use default */ }

      // ── Step 2: Exposure method ──────────────────────────────────────────────
      const { method } = await prompts({
        type: "select",
        name: "method",
        message: "How do you want to expose your node to the network?",
        choices: [
          { title: "arc402.xyz subdomain (easiest — free, instant)",  value: "subdomain" },
          { title: "ngrok (free, runs locally)",                       value: "ngrok" },
          { title: "I have a public URL already",                      value: "manual" },
          { title: "Cloudflare Tunnel (advanced)",                     value: "cloudflare" },
          { title: "Skip for now (client-only mode)",                  value: "skip" },
        ],
        initial: 0,
      });

      if (!method) {
        // User hit Ctrl+C
        console.log(chalk.dim("\nSetup cancelled."));
        return;
      }

      // ── Step 3: Handle selection ─────────────────────────────────────────────
      switch (method) {
        case "subdomain":
          await stepSubdomainService(apiBase);
          break;
        case "ngrok":
          await stepNgrok();
          break;
        case "manual":
          await stepManualUrl();
          break;
        case "cloudflare":
          await stepCloudflare();
          break;
        case "skip":
          console.log(chalk.dim(
            "\nRunning in client-only mode — your node won't be discoverable by others."
          ));
          console.log(chalk.dim("Re-run `arc402 setup endpoint` whenever you're ready to go public."));
          break;
      }
    });
}
