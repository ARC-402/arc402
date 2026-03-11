import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { ethers } from "ethers";
import { loadConfig } from "../config";
import { requireSigner } from "../client";
import { SERVICE_AGREEMENT_ABI } from "../abis";

export function registerDisputeCommand(program: Command): void {
  program
    .command("dispute <id>")
    .description("Raise a dispute on an accepted agreement")
    .requiredOption("--reason <reason>", "Reason for the dispute")
    .option("--json", "Output raw JSON")
    .action(async (idStr: string, opts) => {
      const id = parseInt(idStr, 10);
      const config = loadConfig();
      const { signer } = await requireSigner(config);

      const contract = new ethers.Contract(
        config.serviceAgreementAddress,
        SERVICE_AGREEMENT_ABI,
        signer
      );

      const spinner = ora(`Raising dispute on agreement #${id}…`).start();
      try {
        const tx = await contract.dispute(id, opts.reason);
        await tx.wait();
        spinner.succeed(chalk.yellow(`⚠ Dispute raised on agreement #${id}`));
        if (opts.json) {
          console.log(
            JSON.stringify({ agreementId: id, reason: opts.reason, txHash: tx.hash }, null, 2)
          );
        } else {
          console.log(`  Reason: ${opts.reason}`);
          console.log(`  tx: ${tx.hash}`);
          console.log(
            chalk.yellow("\n  Escrow remains locked pending dispute resolution.")
          );
        }
      } catch (err: unknown) {
        spinner.fail(chalk.red("Dispute failed"));
        console.error(err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });
}
