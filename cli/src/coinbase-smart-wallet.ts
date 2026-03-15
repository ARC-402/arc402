/**
 * coinbase-smart-wallet.ts
 *
 * Base Smart Wallet connection via Coinbase Wallet SDK.
 *
 * IMPORTANT — Node.js limitation:
 * @coinbase/wallet-sdk v4 is a browser-only library.  It communicates with the
 * wallet through a popup opened to keys.coinbase.com using window.postMessage.
 * There is no scannable QR URL emitted — the popup IS the transport layer.
 *
 * Running the SDK in Node.js fails at the `window.open` call inside openPopup().
 * See TODO.md at the project root for resolution paths.
 *
 * This module is a typed stub so that:
 *   - `arc402 wallet deploy --smart-wallet` exists and compiles cleanly.
 *   - The error shown to users is clear and actionable, not a raw stack trace.
 *   - The interface matches requestPhoneWalletSignature() so the caller in
 *     wallet.ts requires zero changes once a real implementation lands.
 */

// eslint-disable-next-line @typescript-eslint/no-unused-vars
import type { CoinbaseWalletSDK } from "@coinbase/wallet-sdk";

export async function requestCoinbaseSmartWalletSignature(
  chainId: number,
  buildTx: (account: string) => { to: string; data: string; value?: string },
  prompt: string
): Promise<{ txHash: string; account: string }> {
  console.log(`\n${prompt}`);
  console.log("─────────────────────────────────────────────────────────");
  console.log("Connect your Base Smart Wallet:\n");
  console.log(
    "⚠  Base Smart Wallet (Coinbase Wallet SDK v4) is not yet supported in the CLI.\n"
  );
  console.log(
    "   The SDK requires a browser environment — it opens a popup to\n" +
      "   keys.coinbase.com and communicates via window.postMessage.\n" +
      "   There is no scannable QR URL available outside a browser context.\n"
  );
  console.log(
    "   Workarounds are tracked in TODO.md at the project root.\n"
  );
  console.log(
    "   To sign this transaction today, omit --smart-wallet and use WalletConnect instead:\n" +
      "     arc402 wallet deploy\n"
  );
  process.exit(1);

  // Unreachable — satisfies the return type so the caller compiles without a cast.
  return { txHash: "", account: "" };
}
