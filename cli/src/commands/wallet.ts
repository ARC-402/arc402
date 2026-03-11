import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { ethers } from "ethers";
import { loadConfig, getUsdcAddress } from "../config";
import { getClient } from "../client";
import { TRUST_REGISTRY_ABI, ERC20_ABI } from "../abis";
import { getTrustTier } from "../utils/format";

export function registerWalletCommands(program: Command): void {
  const wallet = program
    .command("wallet")
    .description("Wallet utilities");

  wallet
    .command("status")
    .description("Show wallet address, ETH balance, USDC balance, and trust score")
    .option("--json", "Output raw JSON")
    .action(async (opts) => {
      const config = loadConfig();
      const { provider, address } = await getClient(config);
      if (!address) {
        console.error(chalk.red("No private key configured."));
        process.exit(1);
      }

      const spinner = ora("Fetching wallet status…").start();

      try {
        const usdcAddress = getUsdcAddress(config);

        const [ethBalance, trustScore] = await Promise.all([
          provider.getBalance(address),
          (async () => {
            const trust = new ethers.Contract(
              config.trustRegistryAddress,
              TRUST_REGISTRY_ABI,
              provider
            );
            try {
              return Number(await trust.getScore(address));
            } catch {
              return 0;
            }
          })(),
        ]);

        let usdcBalance = "0";
        if (usdcAddress && usdcAddress !== "0x0000000000000000000000000000000000000000") {
          try {
            const usdc = new ethers.Contract(usdcAddress, ERC20_ABI, provider);
            const bal = await usdc.balanceOf(address);
            usdcBalance = (Number(bal) / 1e6).toFixed(2);
          } catch {
            usdcBalance = "N/A";
          }
        }

        const tier = getTrustTier(trustScore);

        spinner.stop();

        if (opts.json) {
          console.log(
            JSON.stringify(
              {
                address,
                network: config.network,
                ethBalance: ethers.formatEther(ethBalance),
                usdcBalance,
                trustScore,
                trustTier: tier,
              },
              null,
              2
            )
          );
          return;
        }

        console.log(chalk.cyan("\n─── Wallet Status ───────────────────────────"));
        console.log(`  Address:  ${address}`);
        console.log(`  Network:  ${config.network}`);
        console.log(`  ETH:      ${chalk.bold(ethers.formatEther(ethBalance))} ETH`);
        console.log(`  USDC:     ${chalk.bold(usdcBalance)} USDC`);
        console.log(
          `  Trust:    ${chalk.bold(String(trustScore))} / 1000 — ${tier}`
        );
        console.log();
      } catch (err: unknown) {
        spinner.fail(chalk.red("Wallet status failed"));
        console.error(err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });
}
