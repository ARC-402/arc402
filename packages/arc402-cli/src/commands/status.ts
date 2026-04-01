import { Command } from "commander";
import chalk from "chalk";
import {
  fetchDaemonAgreements,
  fetchDaemonHealth,
  fetchDaemonWalletStatus,
  fetchDaemonWorkroomStatus,
  resolveChatDaemonTarget,
  type DaemonCommerceClientOptions,
} from "../commerce-client";

async function renderStatus(options: DaemonCommerceClientOptions): Promise<void> {
  const [health, wallet, workroom, agreements] = await Promise.all([
    fetchDaemonHealth(options),
    fetchDaemonWalletStatus(options),
    fetchDaemonWorkroomStatus(options),
    fetchDaemonAgreements(options),
  ]);

  console.log(chalk.bold("◈ ARC-402 status"));
  console.log(`  Wallet:    ${wallet.wallet}`);
  console.log(`  Daemon:    ${health.ok ? chalk.green("online") : chalk.red("offline")} (${wallet.daemonId})`);
  console.log(`  Workroom:  ${workroom.status}`);
  console.log(`  Chain ID:  ${wallet.chainId}`);
  console.log(`  RPC:       ${wallet.rpcUrl}`);
  console.log(`  Agreements ${agreements.agreements.length}`);
}

export function registerStatusCommand(program: Command): void {
  program
    .command("status")
    .description("Show top-level operator status for the configured node")
    .option("--daemon-url <url>", "Override the daemon API base URL")
    .action(async (opts: { daemonUrl?: string }) => {
      const target = resolveChatDaemonTarget({ explicitBaseUrl: opts.daemonUrl });
      try {
        await renderStatus({ baseUrl: target.baseUrl });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.log(chalk.yellow(`Unable to load daemon status from ${target.baseUrl}`));
        console.log(chalk.dim(message));
        console.log("");
        console.log("Next steps:");
        console.log("  • If this machine should host the node, run `arc402 setup` or `arc402 daemon init`.");
        console.log("  • If you meant to use a remote node, run `arc402 chat --setup` and choose Remote.");
        process.exitCode = 1;
      }
    });
}
