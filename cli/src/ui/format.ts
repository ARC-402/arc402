// ─── Address Formatting ───────────────────────────────────────────────────────

/**
 * Truncate an address to 0x1234...abcd format (first 6 + last 4 chars).
 * Full address is preserved in --json output only.
 */
export function formatAddress(address: string): string {
  if (address.length <= 12) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

// ─── Value Formatting ─────────────────────────────────────────────────────────

/**
 * Format a single token value: "0.024 ETH" or "150 USDC"
 */
export function formatValue(amount: string | number, token: string): string {
  return `${amount} ${token}`;
}

/**
 * Format a combined ETH + token balance: "0.024 ETH · 150 USDC"
 */
export function formatBalance(
  ethAmount: string | number,
  tokenAmount?: string | number,
  tokenSymbol?: string
): string {
  const eth = `${ethAmount} ETH`;
  if (tokenAmount !== undefined && tokenSymbol) {
    return `${eth} · ${tokenAmount} ${tokenSymbol}`;
  }
  return eth;
}

// ─── Timestamp Formatting ─────────────────────────────────────────────────────

/**
 * Format a unix timestamp (seconds) as a relative "time ago" string.
 */
export function formatTimeAgo(timestampSeconds: number): string {
  const now = Math.floor(Date.now() / 1000);
  const delta = now - timestampSeconds;

  if (delta < 60) return "just now";
  if (delta < 3600) {
    const m = Math.floor(delta / 60);
    return `${m}m ago`;
  }
  if (delta < 86400) {
    const h = Math.floor(delta / 3600);
    return `${h}h ago`;
  }
  const d = Math.floor(delta / 86400);
  return `${d}d ago`;
}

/**
 * Format seconds-until-expiry as "61h 14m" or "2d 3h".
 */
export function formatDuration(seconds: number): string {
  if (seconds <= 0) return "expired";
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);

  if (d > 0) return h > 0 ? `${d}d ${h}h` : `${d}d`;
  if (h > 0) return m > 0 ? `${h}h ${m}m` : `${h}h`;
  return `${m}m`;
}

/**
 * Format a unix timestamp (seconds) as a locale date/time string.
 */
export function formatTimestamp(timestampSeconds: number): string {
  return new Date(timestampSeconds * 1000).toLocaleString();
}
