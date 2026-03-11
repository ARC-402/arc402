import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { ethers } from "ethers";
import { loadConfig } from "../config";
import { requireSigner } from "../client";
import { SERVICE_AGREEMENT_ABI } from "../abis";
import { hashFile } from "../utils/hash";

export function registerDeliverCommand(program: Command): void {
  program
    .command("deliver <id>")
    .description("Fulfill an agreement and commit deliverables hash (provider only)")
    .requiredOption("--output <filepath>", "Path to the deliverable file to hash and commit")
    .option("--json", "Output raw JSON")
    .action(async (idStr: string, opts) => {
      const id = parseInt(idStr, 10);

      // Hash the output file
      let hash: string;
      try {
        hash = hashFile(opts.output);
      } catch (err: unknown) {
        console.error(
          chalk.red(`Cannot read output file: ${err instanceof Error ? err.message : String(err)}`)
        );
        process.exit(1);
      }

      const config = loadConfig();
      const { signer } = await requireSigner(config);

      const contract = new ethers.Contract(
        config.serviceAgreementAddress,
        SERVICE_AGREEMENT_ABI,
        signer
      );

      const spinner = ora(`Delivering agreement #${id}…`).start();
      try {
        const tx = await contract.fulfill(id, hash);
        spinner.text = "Waiting for confirmation…";
        const receipt = await tx.wait();

        spinner.succeed(chalk.green(`✓ Agreement #${id} fulfilled — payment released`));

        if (opts.json) {
          console.log(
            JSON.stringify(
              {
                agreementId: id,
                deliverablesHash: hash,
                txHash: tx.hash,
                gasUsed: receipt.gasUsed.toString(),
              },
              null,
              2
            )
          );
        } else {
          console.log(`  Deliverables hash: ${chalk.bold(hash)}`);
          console.log(`  Payment released ✓`);
          console.log(`  tx: ${tx.hash}`);
        }
      } catch (err: unknown) {
        spinner.fail(chalk.red("Deliver failed"));
        console.error(err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });
}
