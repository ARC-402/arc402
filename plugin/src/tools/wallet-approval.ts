/**
 * WalletConnect approval helper for plugin tools.
 *
 * Generates a WC session, returns deep-link text for each supported wallet,
 * waits for the user to approve, sends the transaction, and returns the tx hash.
 *
 * No Telegram config required — OpenClaw renders the links in whatever channel
 * the user is on (web, mobile, desktop, API).
 */
import { SignClient } from "@walletconnect/sign-client";
import { KeyValueStorage } from "@walletconnect/keyvaluestorage";
import path from "path";
import os from "os";
import type { ToolResult } from "./hire.js";

export const WC_PROJECT_ID = "455e9425343b9156fce1428250c9a54a";

// Suppress known-noisy unhandled rejections from stale WC sessions
process.on("unhandledRejection", (reason: unknown) => {
  const msg = reason instanceof Error ? reason.message : String(reason);
  if (msg.includes("No matching key") || msg.includes("session topic doesn't exist")) return;
});

type SignClientT = Awaited<ReturnType<typeof SignClient.init>>;

async function makeSignClient(): Promise<SignClientT> {
  const storagePath = path.join(os.homedir(), ".arc402", "wc-storage.json");
  return SignClient.init({
    projectId: WC_PROJECT_ID,
    metadata: {
      name: "ARC-402 Plugin",
      description: "ARC-402 Protocol Plugin",
      url: "https://app.arc402.xyz",
      icons: [],
    },
    storage: new KeyValueStorage({ database: storagePath }),
  });
}

function deepLinks(encodedUri: string): string[] {
  return [
    `🦊 [MetaMask](metamask://wc?uri=${encodedUri})`,
    `🐰 [Rabby](rabby://wc?uri=${encodedUri})`,
    `🔵 [Trust Wallet](trust://wc?uri=${encodedUri})`,
    `🔷 [Coinbase](cbwallet://wc?uri=${encodedUri})`,
    `🌈 [Rainbow](rainbow://wc?uri=${encodedUri})`,
  ];
}

/**
 * Connect a phone wallet via WalletConnect, send a signed transaction, return
 * the tx hash + the deep-link block that was shown.
 *
 * `buildTx` is called after the WC session is established and receives the
 * connected account address. It may be async (useful when the tx data depends
 * on an on-chain read that requires the owner address — e.g. predictAddress).
 */
export async function runWithWalletApproval(
  chainId: number,
  buildTx: (account: string) => Promise<{ to: string; data: string; value?: string }> | { to: string; data: string; value?: string },
  prompt: string,
): Promise<{ txHash: string; account: string; deepLinksText: string }> {
  const client = await makeSignClient();

  const { uri, approval } = await client.connect({
    requiredNamespaces: {
      eip155: {
        methods: ["eth_sendTransaction", "personal_sign", "wallet_switchEthereumChain"],
        chains: [`eip155:${chainId}`],
        events: ["accountsChanged"],
      },
    },
  });

  if (!uri) throw new Error("Failed to create WalletConnect session");

  const enc = encodeURIComponent(uri);
  const deepLinksText = [
    `🔗 **${prompt}** (tap your wallet app):`,
    "",
    ...deepLinks(enc),
    "",
    "⏳ Waiting for approval...",
  ].join("\n");

  // Block until the user approves the WC session in their wallet
  const session = await approval();
  const account = session.namespaces.eip155.accounts[0].split(":")[2];

  // Request chain switch — retry up to 3 times
  const hexChainId = `0x${chainId.toString(16)}`;
  for (let i = 0; i < 3; i++) {
    try {
      await client.request({
        topic: session.topic,
        chainId: `eip155:${chainId}`,
        request: { method: "wallet_switchEthereumChain", params: [{ chainId: hexChainId }] },
      });
      break;
    } catch {
      await new Promise(r => setTimeout(r, 1500));
    }
  }

  const tx = await buildTx(account);
  const txHash = await client.request<string>({
    topic: session.topic,
    chainId: `eip155:${chainId}`,
    request: {
      method: "eth_sendTransaction",
      params: [{ from: account, to: tx.to, data: tx.data, value: tx.value ?? "0x0" }],
    },
  });

  try {
    await client.disconnect({ topic: session.topic, reason: { code: 0, message: "done" } });
  } catch { /* best-effort — relay may have already cleaned up */ }

  return { txHash, account, deepLinksText };
}

/** Wrap a successful approval result into a ToolResult. */
export function approvalOk(deepLinksText: string, data: Record<string, unknown>): ToolResult {
  return {
    content: [{
      type: "text",
      text: [deepLinksText, "", "✅ Approved!", "", JSON.stringify(data, null, 2)].join("\n"),
    }],
  };
}

/** Wrap an error into a ToolResult. */
export function approvalErr(message: string): ToolResult {
  return { content: [{ type: "text", text: JSON.stringify({ error: message }) }] };
}
