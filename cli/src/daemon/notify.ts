/**
 * Telegram notification module for daemon events.
 * Uses Telegram Bot API — no external dependencies.
 */
import * as https from "https";
import * as http from "http";

export type NotifyEvent =
  | "hire_request"
  | "hire_accepted"
  | "hire_rejected"
  | "delivery"
  | "dispute"
  | "channel_challenge"
  | "low_balance"
  | "daemon_started"
  | "daemon_stopped";

export interface TelegramConfig {
  botToken: string;
  chatId: string;
}

function telegramPost(botToken: string, method: string, body: object): Promise<void> {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const options: https.RequestOptions = {
      hostname: "api.telegram.org",
      port: 443,
      path: `/bot${botToken}/${method}`,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(payload),
      },
    };
    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (c: Buffer) => { data += c.toString(); });
      res.on("end", () => {
        const parsed = JSON.parse(data) as { ok: boolean; description?: string };
        if (!parsed.ok) {
          reject(new Error(`Telegram API error: ${parsed.description}`));
        } else {
          resolve();
        }
      });
    });
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

export class Notifier {
  private config: TelegramConfig | null;
  private notifyFlags: Record<NotifyEvent, boolean>;

  constructor(
    botToken: string,
    chatId: string,
    flags: Partial<Record<NotifyEvent, boolean>> = {}
  ) {
    this.config = botToken && chatId ? { botToken, chatId } : null;
    this.notifyFlags = {
      hire_request: flags.hire_request ?? true,
      hire_accepted: flags.hire_accepted ?? true,
      hire_rejected: flags.hire_rejected ?? true,
      delivery: flags.delivery ?? true,
      dispute: flags.dispute ?? true,
      channel_challenge: flags.channel_challenge ?? true,
      low_balance: flags.low_balance ?? true,
      daemon_started: true,
      daemon_stopped: true,
    };
  }

  isEnabled(): boolean {
    return this.config !== null;
  }

  async send(event: NotifyEvent, message: string): Promise<void> {
    if (!this.config) return;
    if (!this.notifyFlags[event]) return;
    try {
      await telegramPost(this.config.botToken, "sendMessage", {
        chat_id: this.config.chatId,
        text: message,
        parse_mode: "HTML",
      });
    } catch (err) {
      // Non-fatal — log and continue
      process.stderr.write(`[notify] Telegram send failed: ${err}\n`);
    }
  }

  async notifyHireRequest(hireId: string, hirerAddress: string, priceEth: string, capability: string): Promise<void> {
    const short = hirerAddress.slice(0, 10);
    const msg = [
      `⚡ <b>Hire Request</b>`,
      `ID: <code>${hireId}</code>`,
      `From: <code>${short}...</code>`,
      `Capability: ${capability || "unspecified"}`,
      `Price: ${priceEth} ETH`,
      ``,
      `Approve: <code>arc402 daemon approve ${hireId}</code>`,
      `Reject:  <code>arc402 daemon reject ${hireId}</code>`,
    ].join("\n");
    await this.send("hire_request", msg);
  }

  async notifyHireAccepted(hireId: string, agreementId: string): Promise<void> {
    await this.send("hire_accepted",
      `✅ <b>Hire Accepted</b>\nID: <code>${hireId}</code>\nAgreement: <code>${agreementId}</code>`
    );
  }

  async notifyHireRejected(hireId: string, reason: string): Promise<void> {
    await this.send("hire_rejected",
      `❌ <b>Hire Rejected</b>\nID: <code>${hireId}</code>\nReason: ${reason}`
    );
  }

  async notifyDelivery(agreementId: string, deliveryHash: string, userOpHash: string): Promise<void> {
    await this.send("delivery",
      `📦 <b>Delivery Submitted</b>\nAgreement: <code>${agreementId}</code>\nDelivery hash: <code>${deliveryHash.slice(0, 16)}...</code>\nUserOp: <code>${userOpHash.slice(0, 16)}...</code>`
    );
  }

  async notifyDispute(agreementId: string, raisedBy: string): Promise<void> {
    await this.send("dispute",
      `⚠️ <b>Dispute Raised</b>\nAgreement: <code>${agreementId}</code>\nBy: <code>${raisedBy}</code>`
    );
  }

  async notifyChannelChallenge(channelId: string, txHash: string): Promise<void> {
    await this.send("channel_challenge",
      `🔔 <b>Channel Challenged</b>\nChannel: <code>${channelId.slice(0, 16)}...</code>\nTx: <code>${txHash.slice(0, 16)}...</code>`
    );
  }

  async notifyLowBalance(balanceEth: string, thresholdEth: string): Promise<void> {
    await this.send("low_balance",
      `💸 <b>Low Balance Alert</b>\nCurrent: ${balanceEth} ETH\nThreshold: ${thresholdEth} ETH`
    );
  }

  async notifyStarted(walletAddress: string, subsystems: string[]): Promise<void> {
    await this.send("daemon_started",
      `🟢 <b>ARC-402 Daemon Started</b>\nWallet: <code>${walletAddress}</code>\nSubsystems: ${subsystems.join(", ")}`
    );
  }

  async notifyStopped(): Promise<void> {
    await this.send("daemon_stopped", `🔴 <b>ARC-402 Daemon Stopped</b>`);
  }
}
