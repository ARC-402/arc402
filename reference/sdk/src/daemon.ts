import { existsSync, readFileSync } from "fs";
import os from "os";
import path from "path";

export const DEFAULT_DAEMON_HTTP_URL = "http://127.0.0.1:4402";
export const DEFAULT_DAEMON_API_URL = "http://127.0.0.1:4403";
export const DEFAULT_DAEMON_TOKEN_PATH = path.join(os.homedir(), ".arc402", "daemon.token");
export const DEFAULT_DAEMON_CONFIG_PATH = path.join(os.homedir(), ".arc402", "daemon.toml");

export interface DaemonHealthStatus {
  ok: boolean;
  wallet: string;
}

export interface DaemonWalletStatus {
  ok: boolean;
  wallet: string;
  daemonId: string;
  chainId: number;
  rpcUrl: string;
  policyEngineAddress: string;
}

export interface DaemonWorkroomStatus {
  ok: boolean;
  status: string;
}

export interface DaemonAgreementRecord {
  id: string;
  agreement_id: string | null;
  hirer_address: string;
  capability: string;
  price_eth: string;
  deadline_unix: number;
  spec_hash: string;
  task_description: string | null;
  status: string;
  created_at: number;
  updated_at: number;
  reject_reason: string | null;
}

export interface DaemonAgreementsResponse {
  ok: boolean;
  agreements: DaemonAgreementRecord[];
}

export interface AuthChallengeResponse {
  challengeId: string;
  challenge: string;
  daemonId: string;
  wallet: string;
  chainId: number;
  scope: string;
  expiresAt: number;
  issuedAt: number;
}

export interface AuthSessionResponse {
  ok: true;
  token: string;
  wallets: string[];
  wallet: string;
  scope: string;
  expiresAt: number;
}

export interface RevokeSessionsResponse {
  ok: boolean;
  revoked: string;
}

export interface DaemonNodeClientOptions {
  /** Split daemon API base URL. Defaults to http://127.0.0.1:4403. */
  apiUrl?: string;
  /** Alias for apiUrl to match older docs/examples. */
  baseUrl?: string;
  /** Local daemon token. Defaults to ~/.arc402/daemon.token when present. */
  token?: string;
  /** Explicit path to daemon.token if you don't want the default. */
  tokenPath?: string;
  /** Explicit path to daemon.toml if you want port inference from a non-default location. */
  configPath?: string;
  /** Custom fetch implementation for testing or non-standard runtimes. */
  fetchImpl?: typeof fetch;
}

export class DaemonClientError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "DaemonClientError";
  }
}

function trimTrailingSlash(input: string): string {
  return input.replace(/\/$/, "");
}

function readTomlInteger(contents: string, key: string): number | undefined {
  const match = contents.match(new RegExp(`^\\s*${key}\\s*=\\s*(\\d+)\\s*$`, "m"));
  if (!match) return undefined;
  const parsed = Number.parseInt(match[1], 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function loadLocalDaemonToken(tokenPath = DEFAULT_DAEMON_TOKEN_PATH): string | undefined {
  try {
    const token = readFileSync(tokenPath, "utf-8").trim();
    return token.length > 0 ? token : undefined;
  } catch {
    return undefined;
  }
}

export function resolveDaemonHttpBaseUrl(configPath = DEFAULT_DAEMON_CONFIG_PATH): string {
  try {
    if (existsSync(configPath)) {
      const config = readFileSync(configPath, "utf-8");
      const port = readTomlInteger(config, "listen_port") ?? 4402;
      return `http://127.0.0.1:${port}`;
    }
  } catch {
    // Fall through to default.
  }
  return DEFAULT_DAEMON_HTTP_URL;
}

export function resolveDaemonApiBaseUrl(options: Pick<DaemonNodeClientOptions, "apiUrl" | "baseUrl" | "configPath"> = {}): string {
  const explicit = options.apiUrl ?? options.baseUrl;
  if (explicit && explicit.trim().length > 0) {
    return trimTrailingSlash(explicit.trim());
  }

  const httpBase = resolveDaemonHttpBaseUrl(options.configPath ?? DEFAULT_DAEMON_CONFIG_PATH);

  try {
    const url = new URL(httpBase);
    const httpPort = url.port ? Number.parseInt(url.port, 10) : (url.protocol === "https:" ? 443 : 80);
    if (Number.isFinite(httpPort)) {
      url.port = String(httpPort + 1);
      return trimTrailingSlash(url.toString());
    }
  } catch {
    // Fall through to default.
  }

  return DEFAULT_DAEMON_API_URL;
}

function safeJsonParse(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

/**
 * Thin typed client for the split ARC-402 node API (`arc402-api`).
 *
 * This surface is for operator-side reads and auth against the host daemon/node process:
 * - `/health`
 * - `/auth/challenge`
 * - `/auth/session`
 * - `/auth/revoke`
 * - `/wallet/status`
 * - `/workroom/status`
 * - `/agreements`
 *
 * The delivery plane still lives on the host daemon HTTP port (usually `:4402`)
 * and is wrapped separately by `DeliveryClient`.
 */
export class DaemonNodeClient {
  readonly apiUrl: string;
  private readonly options: DaemonNodeClientOptions;
  private readonly fetchImpl: typeof fetch;

  constructor(options: DaemonNodeClientOptions = {}) {
    this.options = options;
    this.apiUrl = resolveDaemonApiBaseUrl(options);
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  private async request<T>(
    method: "GET" | "POST",
    urlPath: string,
    body?: unknown,
    useSession = false,
  ): Promise<T> {
    const token = this.options.token ?? loadLocalDaemonToken(this.options.tokenPath ?? DEFAULT_DAEMON_TOKEN_PATH);
    const headers: Record<string, string> = {};

    if (body !== undefined) {
      headers["Content-Type"] = "application/json";
    }
    if (useSession) {
      if (!token) {
        throw new DaemonClientError("No daemon session token available");
      }
      headers.Authorization = `Bearer ${token}`;
    }

    const response = await this.fetchImpl(`${this.apiUrl}${urlPath}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    const text = await response.text();
    const payload = text.length > 0 ? safeJsonParse(text) : undefined;

    if (!response.ok) {
      const message =
        typeof payload === "object" &&
        payload !== null &&
        "error" in payload &&
        typeof (payload as { error?: unknown }).error === "string"
          ? (payload as { error: string }).error
          : text || `Daemon request failed (${response.status})`;
      throw new DaemonClientError(message, response.status, payload ?? text);
    }

    return (payload ?? {}) as T;
  }

  async getHealth(): Promise<DaemonHealthStatus> {
    return this.request<DaemonHealthStatus>("GET", "/health");
  }

  async requestAuthChallenge(wallet: string, requestedScope = "operator"): Promise<AuthChallengeResponse> {
    return this.request<AuthChallengeResponse>("POST", "/auth/challenge", { wallet, requestedScope });
  }

  async health(): Promise<DaemonHealthStatus> {
    return this.getHealth();
  }

  async createSession(challengeId: string, signature: string): Promise<AuthSessionResponse> {
    return this.request<AuthSessionResponse>("POST", "/auth/session", { challengeId, signature });
  }

  async revokeSessions(): Promise<RevokeSessionsResponse> {
    return this.request<RevokeSessionsResponse>("POST", "/auth/revoke", undefined, true);
  }

  async revokeSession(): Promise<RevokeSessionsResponse> {
    return this.revokeSessions();
  }

  async getWalletStatus(): Promise<DaemonWalletStatus> {
    return this.request<DaemonWalletStatus>("GET", "/wallet/status", undefined, true);
  }

  async walletStatus(): Promise<DaemonWalletStatus> {
    return this.getWalletStatus();
  }

  async getWorkroomStatus(): Promise<DaemonWorkroomStatus> {
    return this.request<DaemonWorkroomStatus>("GET", "/workroom/status", undefined, true);
  }

  async workroomStatus(): Promise<DaemonWorkroomStatus> {
    return this.getWorkroomStatus();
  }

  async listAgreements(): Promise<DaemonAgreementsResponse> {
    return this.request<DaemonAgreementsResponse>("GET", "/agreements", undefined, true);
  }

  async agreements(): Promise<DaemonAgreementsResponse> {
    return this.listAgreements();
  }
}

export { DaemonNodeClient as DaemonClient };
