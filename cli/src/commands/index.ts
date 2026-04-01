import { Command } from "commander";
import chalk from "chalk";
import { fetchCapabilityIndex, fetchCapabilityPriceSnapshot } from "../commerce-index";

function formatEth(value: number): string {
  return `${value.toFixed(value >= 1 ? 2 : 4)} ETH`;
}

function formatTrend(value: number): string {
  if (value > 0) return `+${value.toFixed(0)}%`;
  return `${value.toFixed(0)}%`;
}

export function registerIndexCommands(program: Command): void {
  const index = program
    .command("index")
    .description("CommerceIndex read models over the ARC-402 subgraph (Spec 46 §13)");

  index
    .command("capabilities")
    .description("Show capability demand, pricing, and provider coverage from recent fulfilled agreements")
    .option("--days <n>", "Lookback window in days", "30")
    .option("--limit <n>", "Maximum rows", "10")
    .option("--json", "Output as JSON")
    .action(async (opts) => {
      const days = Number.parseInt(opts.days as string, 10);
      const limit = Number.parseInt(opts.limit as string, 10);
      const entries = (await fetchCapabilityIndex(days)).slice(0, limit);

      if (opts.json) {
        console.log(JSON.stringify(entries, null, 2));
        return;
      }

      console.log(chalk.bold("◈ Capability Index"));
      console.log(chalk.dim("  derived from fulfilled agreements, active capability claims, and x402 payment hints"));
      console.log("");

      if (entries.length === 0) {
        console.log(chalk.dim("  No capability data found in the selected window."));
        return;
      }

      for (const entry of entries) {
        const demand = `${entry.recentAgreements} hires/${days}d`;
        const x402 = entry.x402Payments > 0 ? `  ${entry.x402Payments} x402` : "";
        console.log(
          `  ${entry.capability.padEnd(28)} ${entry.trendLabel.padEnd(11)} ${formatEth(entry.avgPriceEth).padEnd(12)} ${String(entry.providerCount).padStart(2)} providers  ${demand}${x402}`
        );
      }
    });

  index
    .command("price")
    .description("Show a 30d/7d pricing snapshot for one capability or service type")
    .requiredOption("--capability <capability>", "Capability/serviceType to inspect")
    .option("--days <n>", "Lookback window in days", "30")
    .option("--json", "Output as JSON")
    .action(async (opts) => {
      const days = Number.parseInt(opts.days as string, 10);
      const snapshot = await fetchCapabilityPriceSnapshot(opts.capability as string, days);

      if (opts.json) {
        console.log(JSON.stringify(snapshot, null, 2));
        return;
      }

      console.log(chalk.bold(`◈ Market Price — ${snapshot.capability}`));
      console.log("");
      console.log(`  ${"30d avg".padEnd(14)} ${formatEth(snapshot.avg30dEth)}`);
      console.log(`  ${"7d avg".padEnd(14)} ${formatEth(snapshot.avg7dEth)}  ${formatTrend(snapshot.deltaPct)}`);
      console.log(
        `  ${"Last 5 hires".padEnd(14)} ${
          snapshot.lastFive.length > 0
            ? snapshot.lastFive.map((entry) => formatEth(Number(entry.priceWei) / 1e18)).join(" · ")
            : "none"
        }`
      );
      console.log("");
      console.log(`  ${"Price range".padEnd(14)} ${formatEth(snapshot.floorEth)} -> ${formatEth(snapshot.ceilingEth)}`);
      console.log(`  ${"Volume".padEnd(14)} ${snapshot.agreements} hires · ${formatEth(snapshot.totalVolumeEth)} total`);
      console.log(`  ${"Providers".padEnd(14)} ${snapshot.providers}`);
    });
}
