import { Command } from "commander";
import { ServiceAgreementClient } from "@arc402/sdk";
import { loadConfig } from "../config";
import { requireSigner } from "../client";

export function registerVerifyCommand(program: Command): void {
  program
    .command("verify <id>")
    .description("Client verifies delivered work and releases escrow")
    .option("--auto", "Call autoRelease instead (for when verify window has elapsed and client is silent)")
    .option("--json")
    .action(async (id, opts) => {
      const config = loadConfig();
      if (!config.serviceAgreementAddress) throw new Error("serviceAgreementAddress missing in config");
      const { signer } = await requireSigner(config);
      const client = new ServiceAgreementClient(config.serviceAgreementAddress, signer);

      if (opts.auto) {
        const tx = await client.autoRelease(BigInt(id));
        if (opts.json) return console.log(JSON.stringify({ agreementId: id, action: "autoRelease", txHash: tx.hash }));
        console.log(`autoRelease submitted for agreement #${id}. tx=${tx.hash}`);
      } else {
        const tx = await client.verifyDeliverable(BigInt(id));
        if (opts.json) return console.log(JSON.stringify({ agreementId: id, action: "verifyDeliverable", txHash: tx.hash }));
        console.log(`Agreement #${id} verified — escrow released. tx=${tx.hash}`);
      }
    });
}
