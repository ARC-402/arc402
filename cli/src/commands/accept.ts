import { Command } from "commander";
import { ServiceAgreementClient } from "@arc402/sdk";
import { loadConfig } from "../config";
import { requireSigner } from "../client";

export function registerAcceptCommand(program: Command): void {
  program.command("accept <id>").description("Provider accepts a proposed agreement").action(async (id) => {
    const config = loadConfig(); if (!config.serviceAgreementAddress) throw new Error("serviceAgreementAddress missing in config");
    const { signer } = await requireSigner(config); const client = new ServiceAgreementClient(config.serviceAgreementAddress, signer);
    await client.accept(BigInt(id)); console.log(`accepted ${id}`);
  });
}
