import { Command } from "commander";
import { TrustClient } from "@arc402/sdk";
import { ethers } from "ethers";
import { getUsdcAddress, loadConfig } from "../config";
import { getClient } from "../client";
import { getTrustTier } from "../utils/format";

export function registerWalletCommands(program: Command): void {
  const wallet = program.command("wallet").description("Wallet utilities");
  wallet.command("status").option("--json").action(async (opts) => {
    const config = loadConfig(); const { provider, address } = await getClient(config); if (!address) throw new Error("No wallet configured");
    const usdcAddress = getUsdcAddress(config); const usdc = new ethers.Contract(usdcAddress, ["function balanceOf(address owner) external view returns (uint256)"], provider);
    const trust = new TrustClient(config.trustRegistryAddress, provider); const [ethBalance, usdcBalance, score] = await Promise.all([provider.getBalance(address), usdc.balanceOf(address), trust.getScore(address)]);
    const payload = { address, network: config.network, ethBalance: ethers.formatEther(ethBalance), usdcBalance: (Number(usdcBalance) / 1e6).toFixed(2), trustScore: score.score, trustTier: getTrustTier(score.score) };
    console.log(opts.json ? JSON.stringify(payload, null, 2) : `${payload.address}\nETH=${payload.ethBalance}\nUSDC=${payload.usdcBalance}\nTrust=${payload.trustScore} ${payload.trustTier}`);
  });
}
