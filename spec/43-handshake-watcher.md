# Spec 43 — Handshake Event Watcher

*Status: Specifying*
*Created: 2026-03-24*
*Owner: Engineering (Forge)*
*Priority: Post-first-hire*

---

## Problem

The ARC-402 daemon only receives handshakes via HTTP notification. The on-chain `HandshakeSent` event is the source of truth, but the daemon never reads it. If the HTTP ping fails (bad endpoint, tunnel down, rate limit), the handshake is permanently missed by the recipient — even though it exists on-chain.

**Real example:** MegaBrain sent a valid on-chain handshake to GigaBrain. HTTP ping failed because GigaBrain's endpoint was misconfigured. GigaBrain never received it. No retry mechanism exists.

---

## Solution: Block-range Event Watcher

A daemon module (`handshake-watcher.ts`) that:

1. **On startup:** Scans the last N blocks for `HandshakeSent(from, to=myWallet)` events
2. **Continuously:** Subscribes to new `HandshakeSent` events directed at this agent
3. **On match:** Processes the handshake exactly as if the HTTP notification arrived

---

## Implementation

### New file: `daemon/handshake-watcher.ts`

```typescript
import { ethers } from "ethers";
import type { DaemonConfig } from "./config";

const HANDSHAKE_ABI = [
  "event HandshakeSent(uint256 indexed handshakeId, address indexed from, address indexed to, uint8 hsType, address token, uint256 amount, string note, uint256 timestamp)",
];

const SCAN_BLOCKS = 10_000; // ~33 hours on Base (2s blocks)

export class HandshakeWatcher {
  private provider: ethers.Provider;
  private contract: ethers.Contract;
  private myAddress: string;
  private onHandshake: (event: HandshakeEvent) => Promise<void>;

  async start(): Promise<void> {
    // 1. Catch-up scan on startup
    const latest = await this.provider.getBlockNumber();
    const from = Math.max(0, latest - SCAN_BLOCKS);
    const filter = this.contract.filters.HandshakeSent(null, null, this.myAddress);
    const events = await this.contract.queryFilter(filter, from, latest);
    
    for (const e of events) {
      if (e instanceof ethers.EventLog) {
        await this.onHandshake(parseEvent(e));
      }
    }

    // 2. Live subscription
    this.contract.on(filter, async (...args) => {
      const event = args[args.length - 1] as ethers.EventLog;
      await this.onHandshake(parseEvent(event));
    });
  }

  async stop(): Promise<void> {
    this.contract.removeAllListeners();
  }
}
```

### Integration point: `daemon/index.ts`

```typescript
const watcher = new HandshakeWatcher({
  provider,
  handshakeAddress: config.handshakeAddress,
  myAddress: config.walletAddress,
  onHandshake: async (event) => {
    // Same handler as HTTP /handshake endpoint
    await processIncomingHandshake(event);
  },
});
await watcher.start();
```

### Idempotency

Track processed handshake IDs in a simple local file `~/.arc402/processed-handshakes.json`. Skip already-processed IDs on catchup scan to avoid duplicate processing.

---

## Startup Catchup Window

| Scenario | Covered? |
|----------|---------|
| Tunnel was down for 1 hour | ✅ Yes (10k block scan = ~33h) |
| Agent restarted after 2 days | ⚠️ Partial (only last 10k blocks) |
| Handshake sent before agent ever ran | ❌ No (increase SCAN_BLOCKS or use subgraph) |

For production: query the subgraph instead of raw RPC for full history.

---

## Why This Matters

After this ships, on-chain is the source of truth. HTTP notification becomes an **optimization** (faster delivery) not a **requirement** (single point of failure). Agents never miss handshakes, even if their tunnel was down when the handshake arrived.

---

## Effort

~1 day. Low risk — pure read path, no state mutation beyond the processed-IDs file.
