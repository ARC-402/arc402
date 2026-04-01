import { ethers } from "ethers";

/**
 * Public RPC endpoints for Base mainnet, ordered by reliability.
 * Used as fallbacks when the configured RPC fails on read-only calls.
 */
const BASE_FALLBACK_RPCS = [
  "https://base.llamarpc.com",
  "https://base-rpc.publicnode.com",
  "https://1rpc.io/base",
];

/** Check if verbose mode is enabled via --verbose flag or ARC402_DEBUG env */
export function isVerbose(): boolean {
  return process.argv.includes("--verbose") || process.env.ARC402_DEBUG === "1";
}

/** Log only when verbose mode is on */
export function verbose(...args: unknown[]): void {
  if (isVerbose()) {
    console.log("\x1b[2m  [verbose]", ...args, "\x1b[22m");
  }
}

/**
 * Try a read-only call on the configured RPC first, then fall back
 * to public RPCs. Write operations always use the configured RPC.
 */
export async function callWithFallback<T>(
  configuredRpcUrl: string,
  fn: (provider: ethers.JsonRpcProvider) => Promise<T>,
): Promise<T> {
  // Try configured RPC first
  try {
    verbose(`RPC call via ${configuredRpcUrl}`);
    const provider = new ethers.JsonRpcProvider(configuredRpcUrl);
    const result = await fn(provider);
    verbose(`RPC call succeeded`);
    return result;
  } catch (e) {
    verbose(`RPC failed on ${configuredRpcUrl}: ${e instanceof Error ? e.message.slice(0, 80) : String(e)}`);
  }

  // Try each fallback
  for (const rpc of BASE_FALLBACK_RPCS) {
    try {
      verbose(`Falling back to ${rpc}`);
      const provider = new ethers.JsonRpcProvider(rpc);
      const result = await fn(provider);
      verbose(`Fallback succeeded on ${rpc}`);
      return result;
    } catch (e) {
      verbose(`Fallback failed on ${rpc}: ${e instanceof Error ? e.message.slice(0, 80) : String(e)}`);
      continue;
    }
  }

  throw new Error("All RPC endpoints failed for read-only call");
}
