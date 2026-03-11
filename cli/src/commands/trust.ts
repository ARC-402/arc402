import { Command } from "commander";
import chalk from "chalk";
import { ethers } from "ethers";
import { loadConfig } from "../config";
import { getClient } from "../client";
import { TRUST_REGISTRY_ABI } from "../abis";
import { getTrustTier } from "../utils/format";

export function registerTrustCommand(program: Command): void {
  program
    .command("trust <address>")
    .description("Look up the trust score for an address")
    .option("--json", "Output raw JSON")
    .action(async (address: string, opts) => {
      const config = loadConfig();
      const { provider } = await getClient(config);

      const trust = new ethers.Contract(
        config.trustRegistryAddress,
        TRUST_REGISTRY_ABI,
        provider
      );

      try {
        const score = await trust.getScore(address);
        const scoreNum = Number(score);
        const tier = getTrustTier(scoreNum);

        if (opts.json) {
          console.log(
            JSON.stringify({ address, score: scoreNum, tier }, null, 2)
          );
          return;
        }

        console.log(chalk.cyan(`\n─── Trust Score: ${address} ─────────────────`));
        console.log(
          `  Score: ${chalk.bold(String(scoreNum))} / 1000`
        );
        console.log(`  Tier:  ${chalk.bold(tier)}`);

        // Visual bar
        const filled = Math.round(scoreNum / 50);
        const bar =
          chalk.green("█".repeat(filled)) + chalk.gray("░".repeat(20 - filled));
        console.log(`  ${bar}`);
        console.log();
      } catch (err: unknown) {
        console.error(
          chalk.red("Trust lookup failed:"),
          err instanceof Error ? err.message : String(err)
        );
        process.exit(1);
      }
    });
}
