import { Command } from "commander";
import { ServiceAgreementClient, uploadEncryptedIPFS } from "@arc402/sdk";
import { loadConfig } from "../config";
import { requireSigner } from "../client";
import { hashFile, hashString } from "../utils/hash";
import { printSenderInfo, executeContractWriteViaWallet } from "../wallet-router";
import { SERVICE_AGREEMENT_ABI } from "../abis";
import { readFile } from "fs/promises";
import prompts from "prompts";

export function registerDeliverCommand(program: Command): void {
  program
    .command("deliver <id>")
    .description("Provider commits a deliverable for verification; legacy fulfill mode is compatibility-only")
    .option("--output <filepath>")
    .option("--message <text>")
    .option("--fulfill", "Use legacy trusted-only fulfill() instead of commitDeliverable()", false)
    .option("--encrypt", "Encrypt the deliverable before uploading to IPFS (prompts for recipient public key)", false)
    .action(async (id, opts) => {
      const config = loadConfig();
      if (!config.serviceAgreementAddress) throw new Error("serviceAgreementAddress missing in config");
      const { signer } = await requireSigner(config);
      printSenderInfo(config);

      if (opts.encrypt) {
        if (!opts.output) throw new Error("--encrypt requires --output <filepath>");

        const { recipientPubKeyHex } = await prompts({
          type: "text",
          name: "recipientPubKeyHex",
          message: "Recipient NaCl box public key (32 bytes, hex):",
          validate: (v: string) => /^[0-9a-fA-F]{64}$/.test(v.trim()) || "Must be 64 hex characters (32 bytes)",
        });
        if (!recipientPubKeyHex) throw new Error("Recipient public key is required for encrypted delivery");

        const recipientPublicKey = Uint8Array.from(Buffer.from(recipientPubKeyHex.trim(), "hex"));
        const buffer = await readFile(opts.output);
        const { cid, uri } = await uploadEncryptedIPFS(buffer, recipientPublicKey);
        // Hash plaintext so recipient can verify integrity after decryption
        const { ethers } = await import("ethers");
        const hash = ethers.keccak256(buffer);

        console.log(`encrypted upload: ${uri} (CID: ${cid})`);

        if (config.walletContractAddress) {
          await executeContractWriteViaWallet(
            config.walletContractAddress, signer, config.serviceAgreementAddress,
            SERVICE_AGREEMENT_ABI, "commitDeliverable", [BigInt(id), hash],
          );
        } else {
          const client = new ServiceAgreementClient(config.serviceAgreementAddress, signer);
          await client.commitDeliverable(BigInt(id), hash);
        }
        console.log(`committed ${id} hash=${hash} (plaintext hash; encrypted at ${uri})`);
        return;
      }

      const hash = opts.output ? hashFile(opts.output) : hashString(opts.message ?? `agreement:${id}`);
      if (config.walletContractAddress) {
        const fn = opts.fulfill ? "fulfill" : "commitDeliverable";
        await executeContractWriteViaWallet(
          config.walletContractAddress, signer, config.serviceAgreementAddress,
          SERVICE_AGREEMENT_ABI, fn, [BigInt(id), hash],
        );
      } else {
        const client = new ServiceAgreementClient(config.serviceAgreementAddress, signer);
        if (opts.fulfill) await client.fulfill(BigInt(id), hash); else await client.commitDeliverable(BigInt(id), hash);
      }
      console.log(`${opts.fulfill ? 'fulfilled' : 'committed'} ${id} hash=${hash}`);
    });
}
