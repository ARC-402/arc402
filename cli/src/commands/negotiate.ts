import { Command } from "commander";
import { createNegotiationAccept, createNegotiationCounter, createNegotiationProposal, createNegotiationReject } from "@arc402/sdk";
import { ethers } from "ethers";
import { loadConfig } from "../config";
import { getClient } from "../client";
import { hashFile, hashString } from "../utils/hash";

export function registerNegotiateCommands(program: Command): void {
  const negotiate = program.command("negotiate").description("Spec 14 negotiation message helpers. These commands generate payloads only; transport is external/scaffolded.");
  negotiate.command("propose").requiredOption("--to <address>").requiredOption("--service-type <type>").requiredOption("--price <amountWei>").option("--token <token>", "Token address", ethers.ZeroAddress).requiredOption("--deadline <iso>").requiredOption("--spec <text>").option("--spec-file <path>").action(async (opts) => {
    const { address } = await getClient(loadConfig()); if (!address) throw new Error("No wallet configured");
    const specHash = opts.specFile ? hashFile(opts.specFile) : hashString(opts.spec);
    console.log(JSON.stringify(createNegotiationProposal({ from: address, to: opts.to, serviceType: opts.serviceType, price: opts.price, token: opts.token, deadline: opts.deadline, spec: opts.spec, specHash }), null, 2));
  });
  negotiate.command("counter").requiredOption("--to <address>").requiredOption("--ref-nonce <nonce>").requiredOption("--justification <text>").option("--price <amountWei>").option("--deadline <iso>").action(async (opts) => { const { address } = await getClient(loadConfig()); if (!address) throw new Error("No wallet configured"); console.log(JSON.stringify(createNegotiationCounter({ from: address, to: opts.to, refNonce: opts.refNonce, justification: opts.justification, price: opts.price, deadline: opts.deadline }), null, 2)); });
  negotiate.command("accept").requiredOption("--to <address>").requiredOption("--ref-nonce <nonce>").requiredOption("--price <amountWei>").requiredOption("--deadline <iso>").action(async (opts) => { const { address } = await getClient(loadConfig()); if (!address) throw new Error("No wallet configured"); console.log(JSON.stringify(createNegotiationAccept({ from: address, to: opts.to, refNonce: opts.refNonce, agreedPrice: opts.price, agreedDeadline: opts.deadline }), null, 2)); });
  negotiate.command("reject").requiredOption("--to <address>").requiredOption("--reason <text>").option("--ref-nonce <nonce>").action(async (opts) => { const { address } = await getClient(loadConfig()); if (!address) throw new Error("No wallet configured"); console.log(JSON.stringify(createNegotiationReject({ from: address, to: opts.to, reason: opts.reason, refNonce: opts.refNonce }), null, 2)); });
}
