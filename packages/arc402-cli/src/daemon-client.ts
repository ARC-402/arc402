/**
 * DaemonClient — thin HTTP client for the @arc402/daemon.
 * Replaces direct daemon imports with HTTP calls to localhost:4402.
 * Spec 46 §14 — Node Architecture.
 */

const DAEMON_BASE_URL = process.env.ARC402_DAEMON_URL ?? "http://localhost:4402";

export class DaemonClientError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
    public readonly code?: string
  ) {
    super(message);
    this.name = "DaemonClientError";
  }
}

async function daemonFetch<T>(
  method: string,
  path: string,
  body?: unknown,
  sessionToken?: string
): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (sessionToken) headers["Authorization"] = `Bearer ${sessionToken}`;

  const res = await fetch(`${DAEMON_BASE_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const json = (await res.json()) as { error?: string; code?: string } & T;
  if (!res.ok) {
    throw new DaemonClientError(
      json.error ?? `Daemon HTTP ${res.status}`,
      res.status,
      json.code
    );
  }
  return json;
}

// ─── Health ───────────────────────────────────────────────────────────────────

export async function daemonHealth(): Promise<{ status: string; version: string }> {
  return daemonFetch("GET", "/v1/health");
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

export async function requestAuthChallenge(
  wallet: string,
  requestedScope: "read" | "execute" | "full"
): Promise<{ challengeId: string; challengeBytes: string; expiresAt: number }> {
  return daemonFetch("POST", "/v1/auth/challenge", { wallet, requestedScope });
}

export async function verifyAuthChallenge(
  challengeId: string,
  signature: string
): Promise<{ sessionToken: string; expiresAt: number }> {
  return daemonFetch("POST", "/v1/auth/verify", { challengeId, signature });
}

export async function revokeSession(sessionToken: string): Promise<void> {
  await daemonFetch("DELETE", "/v1/auth/session", undefined, sessionToken);
}

// ─── Hire requests ────────────────────────────────────────────────────────────

export async function listHireRequests(
  status?: string,
  sessionToken?: string
): Promise<unknown[]> {
  const qs = status ? `?status=${encodeURIComponent(status)}` : "";
  return daemonFetch("GET", `/v1/hire${qs}`, undefined, sessionToken);
}

export async function approveHireRequest(
  id: string,
  sessionToken?: string
): Promise<{ ok: boolean }> {
  return daemonFetch("POST", `/v1/hire/${id}/approve`, undefined, sessionToken);
}

export async function rejectHireRequest(
  id: string,
  reason: string,
  sessionToken?: string
): Promise<{ ok: boolean }> {
  return daemonFetch("POST", `/v1/hire/${id}/reject`, { reason }, sessionToken);
}

// ─── UserOp execution ─────────────────────────────────────────────────────────

export async function simulateUserOp(
  intent: unknown,
  sessionToken?: string
): Promise<{ simulationId: string; state: string }> {
  return daemonFetch("POST", "/v1/userop/simulate", { intent }, sessionToken);
}

export async function executeUserOp(
  simulationId: string,
  sessionToken?: string
): Promise<{ requestId: string; state: string }> {
  return daemonFetch("POST", "/v1/userop/execute", { simulationId }, sessionToken);
}

// ─── Daemon status ────────────────────────────────────────────────────────────

export async function getDaemonStatus(sessionToken?: string): Promise<{
  wallet: string;
  chainId: number;
  uptime: number;
  activeAgreements: number;
}> {
  return daemonFetch("GET", "/v1/status", undefined, sessionToken);
}
