import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { ethers } from "ethers";
import { loadConfig } from "../config";
import { requireSigner } from "../client";
import { SERVICE_AGREEMENT_ABI } from "../abis";

export function registerCancelCommand(program: Command): void {
  program
    .command("cancel <id>")
    .description("Cancel a proposed agreement and reclaim escrow (client only)")
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

      // Fetch price before cancelling to show refund amount
      let refundInfo = "";
      try {
        const ag = await contract.getAgreement(id);
        const isEth = ag.token === "0x0000000000000000000000000000000000000000";
        refundInfo = isEth
          ? `${ethers.formatEther(ag.price)} ETH`
          : `${(Number(ag.price) / 1e6).toFixed(2)} USDC`;
      } catch {
        // proceed without refund info
      }

      const spinner = ora(`Cancelling agreement #${id}…`).start();
      try {
        const tx = await contract.cancel(id);
        await tx.wait();
        spinner.succeed(chalk.green(`✓ Agreement #${id} cancelled`));
        if (opts.json) {
          console.log(
            JSON.stringify({ agreementId: id, txHash: tx.hash, refund: refundInfo }, null, 2)
          );
        } else {
          if (refundInfo) {
            console.log(`  Refunded: ${chalk.bold(refundInfo)}`);
          }
          console.log(`  tx: ${tx.hash}`);
        }
      } catch (err: unknown) {
        spinner.fail(chalk.red("Cancel failed"));
        console.error(err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });
}
