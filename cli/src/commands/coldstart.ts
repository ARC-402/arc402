import { Command } from "commander";
import { ethers } from "ethers";
import { loadConfig } from "../config";
import { getClient, requireSigner } from "../client";

const VOUCHING_REGISTRY_ABI = [
  "function vouch(address newAgent, uint256 stakeAmount) external payable",
  "function getVouchedBoost(address agent) external view returns (uint256)",
  "function getVoucher(address agent) external view returns (address)",
] as const;

const TRUST_REGISTRY_BOND_ABI = [
  "function postBond() external payable",
  "function claimBond() external",
  "function getBondInfo(address agent) external view returns (uint256 amount, uint256 postedAt, bool active)",
] as const;

const BOND_DEFAULT_AMOUNT = ethers.parseEther("0.01");
const BOND_LOCK_SECONDS = 90 * 24 * 60 * 60; // 90 days

export function registerColdStartCommands(program: Command): void {
  // ─── vouch ─────────────────────────────────────────────────────────────────

  program
    .command("vouch <address>")
    .description("Stake-backed introduction for a new agent (cold start boost)")
    .option("--stake <wei>", "Amount to stake in wei (default: 0)")
    .option("--signer <key>", "Private key override (hex, 0x-prefixed)")
    .option("--json")
    .action(async (address, opts) => {
      const config = loadConfig();
      if (!config.vouchingRegistryAddress) {
        console.error("vouchingRegistryAddress not configured. Run `arc402 config set vouchingRegistryAddress <address>`.");
        process.exit(1);
      }

      let { signer, provider } = await requireSigner(config);
      if (opts.signer) {
        signer = new ethers.Wallet(opts.signer, provider);
      }

      const stakeAmount = opts.stake ? BigInt(opts.stake) : 0n;
      const contract = new ethers.Contract(config.vouchingRegistryAddress, VOUCHING_REGISTRY_ABI, signer);

      const tx = await contract.vouch(address, stakeAmount);
      const receipt = await tx.wait();

      const boost = await contract.getVouchedBoost(address);

      const payload = {
        newAgent: address,
        stakeAmount: stakeAmount.toString(),
        boostGranted: boost.toString(),
        txHash: receipt.hash,
      };
      if (opts.json) return console.log(JSON.stringify(payload, null, 2));
      console.log(`vouched for ${address}`);
      if (stakeAmount > 0n) console.log(`  stake: ${ethers.formatEther(stakeAmount)} ETH`);
      console.log(`  boost granted: +${boost} trust points`);
      console.log(`  tx: ${receipt.hash}`);
    });

  // ─── bond ──────────────────────────────────────────────────────────────────

  const bond = program
    .command("bond")
    .description("Bonded-entry cold start: post 0.01 ETH bond for trust boost, or claim after 90 days")
    .option("--amount <wei>", `Bond amount in wei (default: ${BOND_DEFAULT_AMOUNT})`)
    .option("--claim", "Claim bond after 90-day lock period")
    .option("--json")
    .action(async (opts) => {
      const config = loadConfig();
      if (!config.trustRegistryAddress) {
        console.error("trustRegistryAddress not configured.");
        process.exit(1);
      }
      const { signer } = await requireSigner(config);
      const contract = new ethers.Contract(config.trustRegistryAddress, TRUST_REGISTRY_BOND_ABI, signer);

      if (opts.claim) {
        const tx = await contract.claimBond();
        const receipt = await tx.wait();
        const payload = { claimed: true, txHash: receipt.hash };
        if (opts.json) return console.log(JSON.stringify(payload, null, 2));
        console.log(`bond claimed`);
        console.log(`  tx: ${receipt.hash}`);
        return;
      }

      const amount = opts.amount ? BigInt(opts.amount) : BOND_DEFAULT_AMOUNT;
      const tx = await contract.postBond({ value: amount });
      const receipt = await tx.wait();

      const payload = { bonded: true, amount: amount.toString(), txHash: receipt.hash };
      if (opts.json) return console.log(JSON.stringify(payload, null, 2));
      console.log(`bond posted: ${ethers.formatEther(amount)} ETH`);
      console.log(`  claimable after 90 days of clean operation`);
      console.log(`  tx: ${receipt.hash}`);
    });

  // arc402 bond status <address>
  bond
    .command("status <address>")
    .description("Show active bond and time remaining for an address")
    .option("--json")
    .action(async (address, opts) => {
      const config = loadConfig();
      if (!config.trustRegistryAddress) {
        console.error("trustRegistryAddress not configured.");
        process.exit(1);
      }
      const { provider } = await getClient(config);
      const contract = new ethers.Contract(config.trustRegistryAddress, TRUST_REGISTRY_BOND_ABI, provider);

      let amount: bigint, postedAt: bigint, active: boolean;
      try {
        const result = await contract.getBondInfo(address);
        amount = result.amount;
        postedAt = result.postedAt;
        active = result.active;
      } catch {
        const payload = { address, bonded: false };
        if (opts.json) return console.log(JSON.stringify(payload, null, 2));
        console.log(`address=${address}`);
        console.log(`  no active bond`);
        return;
      }

      const now = Math.floor(Date.now() / 1000);
      const claimableAt = Number(postedAt) + BOND_LOCK_SECONDS;
      const secondsRemaining = Math.max(0, claimableAt - now);
      const daysRemaining = Math.ceil(secondsRemaining / 86400);

      const payload = {
        address,
        bonded: active,
        amount: amount.toString(),
        postedAt: new Date(Number(postedAt) * 1000).toISOString(),
        claimableAt: new Date(claimableAt * 1000).toISOString(),
        daysRemaining,
      };
      if (opts.json) return console.log(JSON.stringify(payload, null, 2));
      console.log(`address=${address}`);
      if (!active) {
        console.log(`  no active bond`);
        return;
      }
      console.log(`  amount: ${ethers.formatEther(amount)} ETH`);
      console.log(`  posted: ${new Date(Number(postedAt) * 1000).toISOString()}`);
      if (daysRemaining > 0) {
        console.log(`  claimable in: ${daysRemaining} days`);
      } else {
        console.log(`  claimable: now`);
      }
    });
}
