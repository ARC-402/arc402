// SessionManager — session token store (Spec 46 §11/§16)
// TODO: implement token issuance, validation, revocation
// Tokens are stored as sha256(token) only — never the raw token

export interface SessionRecord {
  sessionId: string;
  tokenHash: string;             // sha256(rawToken) — raw token never stored
  wallet: `0x${string}`;
  scope: string;
  issuedAt: number;
  expiresAt: number;             // 24h from issuance
  revokedAt?: number;
  stepUpAt?: number;             // set after step-up auth
}

export class SessionManager {
  // TODO: implement SQLite-backed session store
  // TODO: implement createSession(wallet, scope) → rawToken
  // TODO: implement validateSession(rawToken) → SessionRecord | null
  // TODO: implement revokeSession(sessionId) → void
  // TODO: implement grantStepUp(sessionId) → void
}
