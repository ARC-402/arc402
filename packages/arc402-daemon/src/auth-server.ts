// RemoteAuth — owner key challenge-response (Spec 46 §11/§16)
// TODO: implement challenge issuance, owner key verification, session token

import type { Express } from "express";

export type SessionScope =
  | "read"
  | "execute"
  | "full";

export interface AuthChallenge {
  challengeId: string;           // random 32 bytes, single-use
  daemonId: string;              // stable identifier for this daemon instance
  wallet: `0x${string}`;        // which wallet this auth is for
  chainId: number;               // Base mainnet: 8453
  requestedScope: SessionScope;  // what capabilities are being requested
  expiresAt: number;             // Unix timestamp, 5 minutes from issuance
  issuedAt: number;
}

// Owner signs: keccak256(abi.encodePacked(
//   challengeId, daemonId, wallet, chainId, requestedScope, expiresAt
// ))

export function registerAuthRoutes(app: Express): void {
  // TODO: POST /v1/auth/challenge — issue challenge bound to full context
  // TODO: POST /v1/auth/verify   — verify owner signature, issue session token
  // TODO: POST /v1/auth/step-up  — fresh owner sig for high-value ops
  // TODO: DELETE /v1/auth/session/:id — revoke session token
  void app;
}
