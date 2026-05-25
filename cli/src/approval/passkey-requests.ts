import fs from "fs";
import os from "os";
import path from "path";
import crypto from "crypto";
import { ApprovalIntent } from "./types";

export interface StoredPasskeyApprovalRequest {
  approvalId: string;
  challenge: string;
  createdAt: string;
  expiresAt: string;
  status: "pending" | "approved" | "rejected" | "expired";
  intent: ApprovalIntent;
  approvedAt?: string;
  rejectedAt?: string;
  completedAt?: string;
  signature?: string;
  credentialId?: string;
  operation?: string;
  wallet?: string;
}

const APPROVAL_DIR = path.join(os.homedir(), ".arc402", "approvals");
const PASSKEY_TTL_MS = 10 * 60 * 1000;

function requestPath(approvalId: string): string {
  return path.join(APPROVAL_DIR, `${approvalId}.json`);
}

export function createPasskeyApprovalRequest(intent: ApprovalIntent): StoredPasskeyApprovalRequest {
  fs.mkdirSync(APPROVAL_DIR, { recursive: true });

  const now = Date.now();
  const request: StoredPasskeyApprovalRequest = {
    approvalId: crypto.randomUUID(),
    challenge: intent.metadata?.passkeyChallenge ?? `0x${crypto.randomBytes(32).toString("hex")}`,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + PASSKEY_TTL_MS).toISOString(),
    status: "pending",
    intent,
  };

  fs.writeFileSync(requestPath(request.approvalId), JSON.stringify(request, null, 2));
  return request;
}

export function listPasskeyApprovalRequests(): StoredPasskeyApprovalRequest[] {
  if (!fs.existsSync(APPROVAL_DIR)) return [];

  return fs.readdirSync(APPROVAL_DIR)
    .filter((name) => name.endsWith(".json"))
    .map((name) => {
      try {
        return JSON.parse(fs.readFileSync(path.join(APPROVAL_DIR, name), "utf8")) as StoredPasskeyApprovalRequest;
      } catch {
        return null;
      }
    })
    .filter((value): value is StoredPasskeyApprovalRequest => Boolean(value))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function getPasskeyApprovalRequest(approvalId: string): StoredPasskeyApprovalRequest | null {
  try {
    return JSON.parse(fs.readFileSync(requestPath(approvalId), "utf8")) as StoredPasskeyApprovalRequest;
  } catch {
    return null;
  }
}

export function updatePasskeyApprovalRequest(
  approvalId: string,
  patch: Partial<StoredPasskeyApprovalRequest>,
): StoredPasskeyApprovalRequest | null {
  const current = getPasskeyApprovalRequest(approvalId);
  if (!current) return null;

  const next = { ...current, ...patch };
  fs.writeFileSync(requestPath(approvalId), JSON.stringify(next, null, 2));
  return next;
}

export async function waitForPasskeyApprovalRequest(
  approvalId: string,
  timeoutMs: number,
): Promise<StoredPasskeyApprovalRequest | null> {
  const deadline = Date.now() + Math.max(timeoutMs, 0);

  while (Date.now() <= deadline) {
    const current = getPasskeyApprovalRequest(approvalId);
    if (!current) return null;

    if (current.status !== "pending") {
      return current;
    }

    if (Date.now() > Date.parse(current.expiresAt)) {
      return updatePasskeyApprovalRequest(approvalId, {
        status: "expired",
        completedAt: new Date().toISOString(),
      });
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  return getPasskeyApprovalRequest(approvalId);
}
