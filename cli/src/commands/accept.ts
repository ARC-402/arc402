import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { ethers } from "ethers";
import { loadConfig } from "../config";
import { requireSigner } from "../client";
import { SERVICE_AGREEMENT_ABI } from "../abis";

export function registerAcceptCommand(program: Command): void {
  program
    .command("accept <id>")
    .description("Accept a proposed agreement (provider only)")
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

      const spinner = ora(`Accepting agreement #${id}…`).start();
      try {
        const tx = await contract.accept(id);
        await tx.wait();
        spinner.succeed(chalk.green(`✓ Agreement #${id} accepted`));
        if (opts.json) {
          console.log(JSON.stringify({ agreementId: id, txHash: tx.hash }, null, 2));
        } else {
          console.log(`  tx: ${tx.hash}`);
        }
      } catch (err: unknown) {
        spinner.fail(chalk.red("Accept failed"));
        console.error(err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });
}
