/**
 * ComputeMetering — GPU utilization tracking for ARC-402 compute sessions.
 *
 * - Polls nvidia-smi every N seconds (configurable; default 30)
 * - Falls back to mock metrics when nvidia-smi is not available (testing)
 * - Aggregates into 15-minute UsageReports signed with the provider key
 * - Persists raw metrics to ~/.arc402/compute/<sessionId>/metrics.jsonl
 * - Persists signed reports to ~/.arc402/compute/<sessionId>/reports/
 */

import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { execSync } from "child_process";
import { ethers } from "ethers";
import { DAEMON_DIR } from "./config";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ComputeMetrics {
  sessionId: string;
  gpuUtilizationPercent: number;
  gpuMemoryUsedMB: number;
  gpuTemperatureC: number;
  activeMinutes: number;   // wall-clock since session start
  computeMinutes: number;  // GPU-active minutes (util > 5%)
  timestamp: number;
}

export interface UsageReport {
  sessionId: string;
  periodStart: number;
  periodEnd: number;
  computeMinutes: number;
  avgUtilization: number;
  providerSignature: string;  // hex, 65 bytes
  metricsHash: string;        // keccak256 of raw metrics JSON
}

interface SessionMeteringState {
  sessionId: string;
  startTime: number;
  lastReportTime: number;
  intervalHandle: ReturnType<typeof setInterval>;
  reportIntervalHandle: ReturnType<typeof setInterval>;
  rawMetrics: ComputeMetrics[];     // current period buffer
  allReports: UsageReport[];
  metricsFilePath: string;
  reportsDir: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const COMPUTE_DATA_DIR = path.join(DAEMON_DIR, "compute");
const GPU_ACTIVE_THRESHOLD = 5;  // utilization % above which we count compute-minutes

// ─── nvidia-smi poll ──────────────────────────────────────────────────────────

function pollNvidiaSmi(): { utilization: number; memoryMB: number; temperatureC: number } | null {
  try {
    const output = execSync(
      "nvidia-smi --query-gpu=utilization.gpu,memory.used,temperature.gpu --format=csv,noheader,nounits",
      { timeout: 5000, stdio: ["ignore", "pipe", "ignore"] }
    ).toString().trim();

    const parts = output.split(",").map(s => s.trim());
    if (parts.length < 3) return null;

    const utilization  = parseFloat(parts[0]);
    const memoryMB     = parseFloat(parts[1]);
    const temperatureC = parseFloat(parts[2]);

    if (isNaN(utilization) || isNaN(memoryMB) || isNaN(temperatureC)) return null;

    return { utilization, memoryMB, temperatureC };
  } catch {
    return null;
  }
}

function mockMetrics(): { utilization: number; memoryMB: number; temperatureC: number } {
  // Deterministic-ish mock that oscillates for test realism
  const t = Date.now() / 1000;
  return {
    utilization:  Math.round(50 + 30 * Math.sin(t / 60)),
    memoryMB:     Math.round(4000 + 1000 * Math.cos(t / 90)),
    temperatureC: Math.round(65 + 10 * Math.sin(t / 120)),
  };
}

// ─── Report signing ───────────────────────────────────────────────────────────

/**
 * Produce the same digest that ComputeAgreement.sol verifies.
 * CA-IND-1: includes chainId and contractAddress to prevent cross-chain/cross-contract replay.
 * structHash = keccak256(abi.encode(chainId, contractAddress, sessionId, periodStart,
 *                         periodEnd, computeMinutes, avgUtilization, metricsHash))
 * digest     = EIP-191 personal_sign(structHash)
 */
function buildReportDigest(
  chainId: number,
  contractAddress: string,
  sessionId: string,
  periodStart: number,
  periodEnd: number,
  computeMinutes: number,
  avgUtilization: number,
  metricsHash: string
): string {
  const encoded = ethers.AbiCoder.defaultAbiCoder().encode(
    ["uint256", "address", "bytes32", "uint256", "uint256", "uint256", "uint256", "bytes32"],
    [
      BigInt(chainId),
      contractAddress,
      sessionId,
      BigInt(periodStart),
      BigInt(periodEnd),
      BigInt(computeMinutes),
      BigInt(avgUtilization),
      metricsHash,
    ]
  );
  const structHash = ethers.keccak256(encoded);
  // EIP-191 prefix — matches "\x19Ethereum Signed Message:\n32" + structHash
  return ethers.hashMessage(ethers.getBytes(structHash));
}

async function signReport(
  wallet: ethers.Wallet,
  chainId: number,
  contractAddress: string,
  sessionId: string,
  periodStart: number,
  periodEnd: number,
  computeMinutes: number,
  avgUtilization: number,
  metricsHash: string
): Promise<string> {
  const encoded = ethers.AbiCoder.defaultAbiCoder().encode(
    ["uint256", "address", "bytes32", "uint256", "uint256", "uint256", "uint256", "bytes32"],
    [
      BigInt(chainId),
      contractAddress,
      sessionId,
      BigInt(periodStart),
      BigInt(periodEnd),
      BigInt(computeMinutes),
      BigInt(avgUtilization),
      metricsHash,
    ]
  );
  const structHash = ethers.keccak256(encoded);
  return wallet.signMessage(ethers.getBytes(structHash));
}

// ─── Main class ───────────────────────────────────────────────────────────────

export class ComputeMetering {
  private sessions: Map<string, SessionMeteringState> = new Map();
  private wallet: ethers.Wallet;
  private chainId: number;
  private contractAddress: string;
  private meteringIntervalMs: number;
  private reportIntervalMs: number;

  constructor(
    providerPrivateKey: string,
    chainId: number,
    contractAddress: string,
    meteringIntervalSeconds = 30,
    reportIntervalMinutes   = 15
  ) {
    this.wallet              = new ethers.Wallet(providerPrivateKey);
    this.chainId             = chainId;
    this.contractAddress     = contractAddress;
    this.meteringIntervalMs  = meteringIntervalSeconds * 1000;
    this.reportIntervalMs    = reportIntervalMinutes * 60 * 1000;
  }

  /**
   * Start metering a new session.
   * Polls nvidia-smi on the metering interval and aggregates 15-min reports.
   */
  startMetering(sessionId: string): void {
    if (this.sessions.has(sessionId)) return;

    const sessionDir  = path.join(COMPUTE_DATA_DIR, sessionId);
    const reportsDir  = path.join(sessionDir, "reports");
    fs.mkdirSync(reportsDir, { recursive: true, mode: 0o700 });

    const state: SessionMeteringState = {
      sessionId,
      startTime:        Date.now(),
      lastReportTime:   Date.now(),
      rawMetrics:       [],
      allReports:       [],
      metricsFilePath:  path.join(sessionDir, "metrics.jsonl"),
      reportsDir,
      intervalHandle:       null as unknown as ReturnType<typeof setInterval>,
      reportIntervalHandle: null as unknown as ReturnType<typeof setInterval>,
    };

    // Metering poll
    state.intervalHandle = setInterval(() => {
      this._collectMetric(state);
    }, this.meteringIntervalMs);

    // Report generation
    state.reportIntervalHandle = setInterval(() => {
      void this._generateReport(state);
    }, this.reportIntervalMs);

    this.sessions.set(sessionId, state);
  }

  /**
   * Stop metering and return the final usage report.
   * Generates a final report covering remaining metrics since last report.
   */
  async stopMetering(sessionId: string): Promise<UsageReport | null> {
    const state = this.sessions.get(sessionId);
    if (!state) return null;

    clearInterval(state.intervalHandle);
    clearInterval(state.reportIntervalHandle);

    // Final report from remaining buffered metrics
    const finalReport = await this._generateReport(state);

    this.sessions.delete(sessionId);
    return finalReport;
  }

  /**
   * Return the latest metrics snapshot for a running session.
   */
  getCurrentMetrics(sessionId: string): ComputeMetrics | null {
    const state = this.sessions.get(sessionId);
    if (!state || state.rawMetrics.length === 0) return null;
    return state.rawMetrics[state.rawMetrics.length - 1];
  }

  /**
   * Return all usage reports generated for a session.
   */
  getUsageReports(sessionId: string): UsageReport[] {
    const state = this.sessions.get(sessionId);
    if (!state) {
      // Try to load persisted reports from disk
      return this._loadReportsFromDisk(sessionId);
    }
    return [...state.allReports];
  }

  // ─── Private ────────────────────────────────────────────────────────────────

  private _collectMetric(state: SessionMeteringState): void {
    const gpu = pollNvidiaSmi() ?? mockMetrics();

    const now      = Date.now();
    const wallMs   = now - state.startTime;
    const wallMins = wallMs / 60_000;

    // Compute-minutes: count wall-clock intervals where utilization exceeded threshold
    const active = gpu.utilization > GPU_ACTIVE_THRESHOLD;
    const addComputeMins = active ? this.meteringIntervalMs / 60_000 : 0;

    // Accumulate into the current period buffer
    const prevComputeMins = state.rawMetrics.length > 0
      ? state.rawMetrics[state.rawMetrics.length - 1].computeMinutes
      : 0;

    const metric: ComputeMetrics = {
      sessionId:            state.sessionId,
      gpuUtilizationPercent: gpu.utilization,
      gpuMemoryUsedMB:       gpu.memoryMB,
      gpuTemperatureC:       gpu.temperatureC,
      activeMinutes:         wallMins,
      computeMinutes:        prevComputeMins + addComputeMins,
      timestamp:             now,
    };

    state.rawMetrics.push(metric);

    // Persist to JSONL
    try {
      fs.appendFileSync(
        state.metricsFilePath,
        JSON.stringify(metric) + "\n",
        { mode: 0o600 }
      );
    } catch { /* non-fatal — disk full etc */ }
  }

  private async _generateReport(state: SessionMeteringState): Promise<UsageReport | null> {
    if (state.rawMetrics.length === 0) return null;

    const periodStart = state.lastReportTime;
    const periodEnd   = Date.now();

    // Metrics accumulated in this period
    const periodMetrics = state.rawMetrics.filter(m => m.timestamp >= periodStart);
    if (periodMetrics.length === 0) return null;

    const computeMinutes = periodMetrics.reduce((acc, m) => {
      // Each poll interval contributes proportionally
      const active = m.gpuUtilizationPercent > GPU_ACTIVE_THRESHOLD;
      return acc + (active ? this.meteringIntervalMs / 60_000 : 0);
    }, 0);

    const avgUtilization = Math.round(
      periodMetrics.reduce((acc, m) => acc + m.gpuUtilizationPercent, 0) / periodMetrics.length
    );

    // Hash raw metrics for dispute evidence
    const metricsJson = JSON.stringify(periodMetrics);
    const metricsHash = ethers.keccak256(ethers.toUtf8Bytes(metricsJson));

    const roundedMinutes = Math.round(computeMinutes);

    const sig = await signReport(
      this.wallet,
      this.chainId,
      this.contractAddress,
      state.sessionId,
      Math.floor(periodStart / 1000),
      Math.floor(periodEnd / 1000),
      roundedMinutes,
      avgUtilization,
      metricsHash
    );

    const report: UsageReport = {
      sessionId:         state.sessionId,
      periodStart:       Math.floor(periodStart / 1000),
      periodEnd:         Math.floor(periodEnd / 1000),
      computeMinutes:    roundedMinutes,
      avgUtilization,
      providerSignature: sig,
      metricsHash,
    };

    state.allReports.push(report);
    state.lastReportTime = periodEnd;
    // Clear the processed period's metrics from the buffer
    state.rawMetrics = state.rawMetrics.filter(m => m.timestamp >= periodEnd);

    // Persist report to disk
    const reportFile = path.join(
      state.reportsDir,
      `report_${report.periodStart}.json`
    );
    try {
      fs.writeFileSync(reportFile, JSON.stringify(report, null, 2), { mode: 0o600 });
    } catch { /* non-fatal */ }

    return report;
  }

  private _loadReportsFromDisk(sessionId: string): UsageReport[] {
    const reportsDir = path.join(COMPUTE_DATA_DIR, sessionId, "reports");
    if (!fs.existsSync(reportsDir)) return [];
    try {
      const files = fs.readdirSync(reportsDir)
        .filter(f => f.endsWith(".json"))
        .sort();
      return files.map(f => {
        const raw = fs.readFileSync(path.join(reportsDir, f), "utf-8");
        return JSON.parse(raw) as UsageReport;
      });
    } catch {
      return [];
    }
  }
}
