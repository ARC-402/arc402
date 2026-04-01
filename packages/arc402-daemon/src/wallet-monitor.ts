/**
 * Wallet monitor — verifies wallet contract exists and is operational.
 * Steps 4 and 5 of the daemon startup sequence (Spec 32 §3).
 */
import { ethers } from "ethers";
import type { DaemonConfig } from "./config";
import {
  ARC402_WALLET_GUARDIAN_ABI,
  ARC402_WALLET_MACHINE_KEY_ABI,
} from "./abis";

export interface WalletStatus {
  contractAddress: string;
  ownerAddress: string;
  isFrozen: boolean;
  machineKeyAuthorized: boolean;
  ethBalance: string;
}

export async function verifyWallet(
  config: DaemonConfig,
  provider: ethers.Provider,
  machineKeyAddress: string
): Promise<WalletStatus> {
  const { contract_address, owner_address } = config.wallet;

  // Step 4: Verify wallet contract exists
  const code = await provider.getCode(contract_address);
  if (code === "0x") {
    throw new Error(`No contract at wallet address ${contract_address}`);
  }

  const guardianContract = new ethers.Contract(
    contract_address,
    ARC402_WALLET_GUARDIAN_ABI,
    provider
  );

  // Verify owner matches config (if owner_address is set)
  if (owner_address) {
    const onChainOwner: string = await guardianContract.owner();
    if (onChainOwner.toLowerCase() !== owner_address.toLowerCase()) {
      throw new Error(
        `Wallet owner mismatch. Config: ${owner_address}, On-chain: ${onChainOwner}`
      );
    }
  }

  const onChainOwner: string = await guardianContract.owner();

  // Step 5: Check wallet is not frozen
  const frozen: boolean = await guardianContract.frozen();
  if (frozen) {
    throw new Error("Wallet is frozen. Daemon cannot operate.");
  }

  // Check machine key authorization (best effort — v1 wallets may not have registry)
  let machineKeyAuthorized = false;
  try {
    const machineKeyContract = new ethers.Contract(
      contract_address,
      ARC402_WALLET_MACHINE_KEY_ABI,
      provider
    );
    machineKeyAuthorized = await machineKeyContract.authorizedMachineKeys(machineKeyAddress);
  } catch {
    // v1 wallet may not have machine key registry — policy-based auth, continue
    machineKeyAuthorized = true;
  }

  // Get ETH balance
  const balanceBig = await provider.getBalance(contract_address);
  const ethBalance = ethers.formatEther(balanceBig);

  return {
    contractAddress: contract_address,
    ownerAddress: onChainOwner,
    isFrozen: false,
    machineKeyAuthorized,
    ethBalance,
  };
}

export async function getWalletBalance(
  contractAddress: string,
  provider: ethers.Provider
): Promise<string> {
  const balanceBig = await provider.getBalance(contractAddress);
  return ethers.formatEther(balanceBig);
}
