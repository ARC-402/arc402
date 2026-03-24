/**
 * HandshakeWatcher — scans historical and live HandshakeSent events
 * directed at this agent's wallet address.
 *
 * On startup: catch-up scan over the last SCAN_BLOCKS blocks.
 * Then: subscribes to live events via provider.on().
 * Idempotency: processed handshake IDs are persisted to processedIdsPath.
 */
import * as fs from "fs";
import * as path from "path";
import { ethers } from "ethers";

const SCAN_BLOCKS = 10_000;

const HANDSHAKE_SENT_ABI = [
  "event HandshakeSent(uint256 indexed handshakeId, address indexed from, address indexed to, uint8 hsType, address token, uint256 amount, string note, uint256 timestamp)",
];

export interface HandshakeEvent {
  handshakeId: string;
  from: string;
  to: string;
  hsType: number;
  token: string;
  amount: bigint;
  note: string;
  timestamp: number;
  blockNumber: number;
  txHash: string;
}

export class HandshakeWatcher {
  private provider: ethers.Provider;
  private contract: ethers.Contract;
  private myAddress: string;
  private onHandshake: (event: HandshakeEvent) => Promise<void>;
  private processedIdsPath: string;
  private processedIds: Set<string> = new Set();
  private liveListener: ((...args: unknown[]) => void) | null = null;

  constructor(
    provider: ethers.Provider,
    handshakeAddress: string,
    myAddress: string,
    onHandshake: (event: HandshakeEvent) => Promise<void>,
    processedIdsPath: string
  ) {
    this.provider = provider;
    this.contract = new ethers.Contract(handshakeAddress, HANDSHAKE_SENT_ABI, provider);
    this.myAddress = myAddress.toLowerCase();
    this.onHandshake = onHandshake;
    this.processedIdsPath = processedIdsPath;
  }

  async start(): Promise<void> {
    this.loadProcessedIds();
    await this.catchupScan();
    this.subscribeLive();
  }

  async stop(): Promise<void> {
    if (this.liveListener) {
      this.contract.off("HandshakeSent", this.liveListener);
      this.liveListener = null;
    }
  }

  // ── Private ──────────────────────────────────────────────────────────────

  private loadProcessedIds(): void {
    try {
      const dir = path.dirname(this.processedIdsPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      if (fs.existsSync(this.processedIdsPath)) {
        const raw = fs.readFileSync(this.processedIdsPath, "utf-8");
        const ids: string[] = JSON.parse(raw);
        this.processedIds = new Set(ids);
      }
    } catch {
      // Start fresh — non-fatal
      this.processedIds = new Set();
    }
  }

  private saveProcessedIds(): void {
    try {
      fs.writeFileSync(
        this.processedIdsPath,
        JSON.stringify([...this.processedIds]),
        { mode: 0o600 }
      );
    } catch {
      // Non-fatal — will reprocess on next restart at worst
    }
  }

  private async catchupScan(): Promise<void> {
    try {
      const latest = await this.provider.getBlockNumber();
      const fromBlock = Math.max(0, latest - SCAN_BLOCKS);

      // Filter: HandshakeSent where `to` = this agent
      const filter = this.contract.filters.HandshakeSent(null, null, this.myAddress);
      const logs = await this.contract.queryFilter(filter, fromBlock, latest);

      for (const log of logs) {
        await this.handleLog(log as ethers.EventLog);
      }
    } catch (err) {
      console.error("[handshake-watcher] catchup scan error:", err);
    }
  }

  private subscribeLive(): void {
    const listener = async (...args: unknown[]) => {
      // ethers v6: last arg is the EventLog
      const log = args[args.length - 1] as ethers.EventLog;
      await this.handleLog(log).catch((err) => {
        console.error("[handshake-watcher] live event error:", err);
      });
    };

    this.liveListener = listener;
    this.contract.on("HandshakeSent", listener);
  }

  private async handleLog(log: ethers.EventLog): Promise<void> {
    try {
      const args = log.args;
      const handshakeId = args[0].toString();
      const to: string = args[2];

      // Only process events directed at this agent
      if (to.toLowerCase() !== this.myAddress) return;

      // Idempotency check
      if (this.processedIds.has(handshakeId)) return;

      const event: HandshakeEvent = {
        handshakeId,
        from: args[1] as string,
        to,
        hsType: Number(args[3]),
        token: args[4] as string,
        amount: BigInt(args[5].toString()),
        note: args[6] as string,
        timestamp: Number(args[7]),
        blockNumber: log.blockNumber,
        txHash: log.transactionHash,
      };

      await this.onHandshake(event);

      this.processedIds.add(handshakeId);
      this.saveProcessedIds();
    } catch (err) {
      console.error("[handshake-watcher] error processing event:", err);
    }
  }
}
