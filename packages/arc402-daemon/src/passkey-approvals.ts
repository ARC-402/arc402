import fs from "fs";
import os from "os";
import path from "path";

export interface StoredPasskeyApprovalRequest {
  approvalId: string;
  challenge: string;
  createdAt: string;
  expiresAt: string;
  status: "pending" | "approved" | "rejected" | "expired";
  intent: {
    walletAddress?: string;
    ui?: { title?: string; summary?: string };
  };
  approvedAt?: string;
  rejectedAt?: string;
  completedAt?: string;
  signature?: string;
  credentialId?: string;
  operation?: string;
  wallet?: string;
}

const APPROVAL_DIR = path.join(os.homedir(), ".arc402", "approvals");

function requestPath(approvalId: string): string {
  return path.join(APPROVAL_DIR, `${approvalId}.json`);
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
