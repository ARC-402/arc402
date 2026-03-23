/**
 * ComputeSessionManager — session lifecycle management for ARC-402 compute rental.
 *
 * Owns the in-memory + persisted state for all compute sessions handled by
 * this provider node. Coordinates with ComputeMetering for GPU tracking.
 */

import * as fs from "fs";
import * as path from "path";
import { DAEMON_DIR } from "./config";
import { ComputeMetering, UsageReport } from "./compute-metering";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ComputeSessionStatus =
  | "proposed"
  | "accepted"
  | "active"
  | "completed"
  | "disputed";

export interface ComputeProposal {
  sessionId:           string;
  clientAddress:       string;
  providerAddress:     string;
  ratePerHourWei:      string;    // bigint as decimal string
  maxHours:            number;
  gpuSpecHash:         string;    // bytes32 hex
  workloadDescription: string;
  depositAmount:       string;    // bigint as decimal string
  proposedAt:          number;    // unix seconds
}

export interface ComputeSessionState {
  proposal:        ComputeProposal;
  status:          ComputeSessionStatus;
  startedAt:       number | null;    // unix seconds
  endedAt:         number | null;    // unix seconds
  accessEndpoint:  string | null;    // SSH / API endpoint given to client
  consumedMinutes: number;           // running total from usage reports
  usageReports:    UsageReport[];
  updatedAt:       number;
}

export interface SettlementResult {
  sessionId:       string;
  consumedMinutes: number;
  costWei:         bigint;
  depositWei:      bigint;
  refundWei:       bigint;
  reports:         UsageReport[];
}

// ─── Persistence ──────────────────────────────────────────────────────────────

const SESSIONS_DIR = path.join(DAEMON_DIR, "compute");

function sessionsFile(): string {
  return path.join(SESSIONS_DIR, "sessions.json");
}

function persistSessions(sessions: Map<string, ComputeSessionState>): void {
  fs.mkdirSync(SESSIONS_DIR, { recursive: true, mode: 0o700 });
  const obj = Object.fromEntries(sessions.entries());
  fs.writeFileSync(sessionsFile(), JSON.stringify(obj, null, 2), { mode: 0o600 });
}

function loadSessions(): Map<string, ComputeSessionState> {
  const file = sessionsFile();
  if (!fs.existsSync(file)) return new Map();
  try {
    const raw = fs.readFileSync(file, "utf-8");
    const obj = JSON.parse(raw) as Record<string, ComputeSessionState>;
    return new Map(Object.entries(obj));
  } catch {
    return new Map();
  }
}

// ─── Manager class ────────────────────────────────────────────────────────────

export class ComputeSessionManager {
  public sessions: Map<string, ComputeSessionState>;
  private metering: ComputeMetering | null;

  constructor(metering?: ComputeMetering) {
    this.sessions = loadSessions();
    this.metering = metering ?? null;
  }

  /**
   * Record an incoming compute proposal (from a client).
   * Validates it doesn't conflict with capacity limits.
   */
  handleProposal(proposal: ComputeProposal): { ok: boolean; error?: string } {
    if (this.sessions.has(proposal.sessionId)) {
      return { ok: false, error: "session_already_exists" };
    }

    const state: ComputeSessionState = {
      proposal,
      status:          "proposed",
      startedAt:       null,
      endedAt:         null,
      accessEndpoint:  null,
      consumedMinutes: 0,
      usageReports:    [],
      updatedAt:       Math.floor(Date.now() / 1000),
    };

    this.sessions.set(proposal.sessionId, state);
    persistSessions(this.sessions);
    return { ok: true };
  }

  /**
   * Provider accepts the proposal. On-chain call should follow.
   */
  acceptSession(sessionId: string): { ok: boolean; error?: string } {
    const s = this.sessions.get(sessionId);
    if (!s) return { ok: false, error: "session_not_found" };
    if (s.status !== "proposed") return { ok: false, error: `wrong_status:${s.status}` };

    s.status    = "accepted";
    s.updatedAt = Math.floor(Date.now() / 1000);
    persistSessions(this.sessions);
    return { ok: true };
  }

  /**
   * Provider marks the session as active. Starts GPU metering.
   * @param accessEndpoint  Optional SSH / API endpoint to surface to client.
   */
  startSession(sessionId: string, accessEndpoint?: string): { ok: boolean; error?: string } {
    const s = this.sessions.get(sessionId);
    if (!s) return { ok: false, error: "session_not_found" };
    if (s.status !== "accepted") return { ok: false, error: `wrong_status:${s.status}` };

    const now = Math.floor(Date.now() / 1000);
    s.status         = "active";
    s.startedAt      = now;
    s.accessEndpoint = accessEndpoint ?? null;
    s.updatedAt      = now;

    persistSessions(this.sessions);

    if (this.metering) {
      this.metering.startMetering(sessionId);
    }

    return { ok: true };
  }

  /**
   * Either party ends the session. Stops metering, calculates settlement.
   */
  async endSession(sessionId: string): Promise<{ ok: boolean; error?: string; result?: SettlementResult }> {
    const s = this.sessions.get(sessionId);
    if (!s) return { ok: false, error: "session_not_found" };
    if (s.status !== "active") return { ok: false, error: `wrong_status:${s.status}` };

    // Stop metering — generates final usage report
    if (this.metering) {
      const finalReport = await this.metering.stopMetering(sessionId);
      if (finalReport) {
        s.usageReports.push(finalReport);
        s.consumedMinutes += finalReport.computeMinutes;
      }
      // Absorb any other reports generated during the session
      const allReports = this.metering.getUsageReports(sessionId);
      for (const r of allReports) {
        if (!s.usageReports.find(x => x.periodStart === r.periodStart)) {
          s.usageReports.push(r);
        }
      }
    }

    const now = Math.floor(Date.now() / 1000);
    s.status  = "completed";
    s.endedAt = now;
    s.updatedAt = now;
    persistSessions(this.sessions);

    // Settlement math: (consumedMinutes * ratePerHour) / 60
    const deposit   = BigInt(s.proposal.depositAmount);
    const rate      = BigInt(s.proposal.ratePerHourWei);
    const costWei   = BigInt(s.consumedMinutes) * rate / 60n;
    const clamped   = costWei > deposit ? deposit : costWei;
    const refundWei = deposit - clamped;

    const result: SettlementResult = {
      sessionId,
      consumedMinutes: s.consumedMinutes,
      costWei:         clamped,
      depositWei:      deposit,
      refundWei,
      reports:         s.usageReports,
    };

    return { ok: true, result };
  }

  /**
   * Client disputes the session — freezes it pending arbitration.
   */
  disputeSession(sessionId: string): { ok: boolean; error?: string } {
    const s = this.sessions.get(sessionId);
    if (!s) return { ok: false, error: "session_not_found" };
    if (s.status !== "active") return { ok: false, error: `wrong_status:${s.status}` };

    s.status    = "disputed";
    s.updatedAt = Math.floor(Date.now() / 1000);
    persistSessions(this.sessions);
    return { ok: true };
  }

  /**
   * Append a usage report (from daemon's periodic reporting loop).
   */
  appendUsageReport(sessionId: string, report: UsageReport): { ok: boolean; error?: string } {
    const s = this.sessions.get(sessionId);
    if (!s) return { ok: false, error: "session_not_found" };
    if (s.status !== "active") return { ok: false, error: `wrong_status:${s.status}` };

    s.usageReports.push(report);
    s.consumedMinutes += report.computeMinutes;
    s.updatedAt = Math.floor(Date.now() / 1000);
    persistSessions(this.sessions);
    return { ok: true };
  }

  /**
   * Get a single session by ID.
   */
  getSession(sessionId: string): ComputeSessionState | null {
    return this.sessions.get(sessionId) ?? null;
  }

  /**
   * List all sessions.
   */
  listSessions(): ComputeSessionState[] {
    return Array.from(this.sessions.values());
  }

  /**
   * Count sessions in a given status.
   */
  countByStatus(status: ComputeSessionStatus): number {
    let n = 0;
    for (const s of this.sessions.values()) {
      if (s.status === status) n++;
    }
    return n;
  }
}
