/**
 * Interactive TUI hire flow.
 * Triggered when `arc402 hire` is run without arguments in TUI mode.
 *
 * Flow:
 * 1. Fetch top 5 agents via kernel
 * 2. Show tree-style agent picker (interactive — only when a real TTY is present)
 * 3. Prompt for task + price
 * 4. Show HireCard confirmation
 * 5. Dispatch hire command
 */

import * as readline from "readline";
import { executeKernelForPayload } from "./kernel";
import type { DiscoverAgent } from "./components/commerce/DiscoverList";
import { writeTuiLine } from "./render-inline";

function prompt(rl: readline.Interface, question: string): Promise<string> {
  return new Promise((resolve) => rl.question(question, resolve));
}

function printAgentTree(agents: DiscoverAgent[], selectedIndex: number): void {
  writeTuiLine("");
  writeTuiLine("  ◈ Available Agents ──────────────────────────────────");
  writeTuiLine("");
  for (let i = 0; i < agents.length; i++) {
    const agent = agents[i];
    const isLast = i === agents.length - 1;
    const border = isLast ? "└─" : "├─";
    const statusBadge = agent.endpointStatus === "online" ? "◉ online" : agent.endpointStatus === "offline" ? "⊘ offline" : "○";
    const price = agent.priceLabel ? `$${agent.priceLabel}` : "";
    const sel = i === selectedIndex ? "▶" : " ";
    writeTuiLine(`  ${sel} #${agent.rank}  ${border} ${agent.name.padEnd(20)} trust ${String(agent.trustScore).padStart(4)}  ${price.padEnd(12)} ${statusBadge}`);
  }
  writeTuiLine("");
}

export async function interactiveHireTui(): Promise<void> {
  writeTuiLine("  ◈ Hire ─────────────────────────────────────────────");
  writeTuiLine("  Fetching top agents…");

  // 1. Fetch agents
  const payload = await executeKernelForPayload("discover --limit 5");
  if (!payload || payload.type !== "discover" || payload.props.agents.length === 0) {
    writeTuiLine("  ✗ No agents found. Check your config or network.");
    return;
  }

  const agents = payload.props.agents;
  writeTuiLine(`  Found ${agents.length} agent${agents.length === 1 ? "" : "s"}.`);
  writeTuiLine("");

  // 2. Show static tree + prompt for selection (line-by-line input — no raw mode required)
  printAgentTree(agents, -1);

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  let selectedAgent: DiscoverAgent | undefined;

  while (!selectedAgent) {
    const input = (await prompt(rl, `  Select agent (1-${agents.length}) or q to cancel: `)).trim();
    if (input === "q" || input === "") {
      writeTuiLine("  Cancelled.");
      rl.close();
      return;
    }
    const num = parseInt(input, 10);
    if (!isNaN(num) && num >= 1 && num <= agents.length) {
      selectedAgent = agents[num - 1];
    } else {
      writeTuiLine(`  Invalid selection. Enter a number between 1 and ${agents.length}.`);
    }
  }

  writeTuiLine(`  Selected: ${selectedAgent.name} (${selectedAgent.wallet})`);
  writeTuiLine("");

  // 3. Prompt for task + price
  const task = (await prompt(rl, "  Task description: ")).trim();
  if (!task) {
    writeTuiLine("  Cancelled — task is required.");
    rl.close();
    return;
  }

  const priceRaw = (await prompt(rl, "  Max price (e.g. 0.01eth or 1USDC): ")).trim();
  if (!priceRaw) {
    writeTuiLine("  Cancelled — price is required.");
    rl.close();
    return;
  }

  const serviceType = selectedAgent.serviceType || "ai.assistant";

  // 4. Confirmation
  writeTuiLine("");
  writeTuiLine(`  ┌─ Hire Confirmation ────────────────────────────────`);
  writeTuiLine(`  │  Agent:    ${selectedAgent.name} (${selectedAgent.wallet})`);
  writeTuiLine(`  │  Service:  ${serviceType}`);
  writeTuiLine(`  │  Task:     ${task.slice(0, 60)}${task.length > 60 ? "…" : ""}`);
  writeTuiLine(`  │  Price:    ${priceRaw}`);
  writeTuiLine(`  └────────────────────────────────────────────────────`);
  writeTuiLine("");

  const confirm = (await prompt(rl, `  Hire ${selectedAgent.name} for ${priceRaw}? (y/n): `)).trim().toLowerCase();
  rl.close();

  if (confirm !== "y" && confirm !== "yes") {
    writeTuiLine("  Cancelled.");
    return;
  }

  // 5. Dispatch: import + invoke hire command programmatically via child_process (avoids circular import)
  writeTuiLine("  Dispatching hire…");
  const { execSync } = await import("child_process");
  const deadline = "24h";
  const args = [
    "hire",
    selectedAgent.wallet,
    "--task", task,
    "--service-type", serviceType,
    "--max", priceRaw,
    "--deadline", deadline,
  ].map((a) => JSON.stringify(a)).join(" ");

  try {
    // Re-invoke the arc402 CLI without TUI mode so it uses normal output
    const env = { ...process.env, ARC402_TUI_MODE: "0" };
    const cmd = `node ${JSON.stringify(process.argv[1])} ${args}`;
    const out = execSync(cmd, { env, encoding: "utf8", stdio: ["inherit", "pipe", "pipe"] });
    writeTuiLine(out.trim());
    writeTuiLine("");
    writeTuiLine("  ✓ Hire dispatched.");
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    writeTuiLine(`  ✗ Hire failed: ${msg.split("\n")[0]}`);
  }
}
