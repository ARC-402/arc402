/**
 * SessionManager — SQLite-backed session token store.
 * Spec 46 §11/§16.
 *
 * Raw tokens are never stored — only sha256(token).
 * Sessions are scoped to one wallet address, 24h expiry.
 */
import * as crypto from "crypto";
import Database from "better-sqlite3";

export interface SessionRecord {
  sessionId: string;
  tokenHash: string;           // sha256(rawToken) — raw token never stored
  wallet: string;
  scope: string;
  issuedAt: number;
  expiresAt: number;           // 24h from issuance
  revokedAt?: number;
  stepUpAt?: number;           // set after step-up auth
}

const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export class SessionManager {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
    this.initSchema();
  }

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        id          TEXT PRIMARY KEY,
        token_hash  TEXT NOT NULL UNIQUE,
        wallet      TEXT NOT NULL,
        scope       TEXT NOT NULL,
        expires_at  INTEGER NOT NULL,
        issued_at   INTEGER NOT NULL,
        revoked     INTEGER DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS auth_challenges (
        challenge_id  TEXT PRIMARY KEY,
        daemon_id     TEXT NOT NULL,
        wallet        TEXT NOT NULL,
        chain_id      INTEGER NOT NULL,
        scope         TEXT NOT NULL,
        expires_at    INTEGER NOT NULL,
        used          INTEGER DEFAULT 0
      );
    `);
  }

  /**
   * Create a new session. Returns the raw token (send once, never stored).
   */
  createSession(wallet: string, scope: string): string {
    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
    const sessionId = crypto.randomBytes(16).toString("hex");
    const now = Date.now();

    this.db.prepare(`
      INSERT INTO sessions (id, token_hash, wallet, scope, expires_at, issued_at, revoked)
      VALUES (?, ?, ?, ?, ?, ?, 0)
    `).run(sessionId, tokenHash, wallet, scope, now + SESSION_TTL_MS, now);

    return rawToken;
  }

  /**
   * Validate a raw token. Returns the session record or null if invalid/expired/revoked.
   */
  validateSession(rawToken: string): SessionRecord | null {
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
    const row = this.db.prepare(
      "SELECT * FROM sessions WHERE token_hash = ? AND expires_at > ? AND revoked = 0"
    ).get(tokenHash, Date.now()) as {
      id: string;
      token_hash: string;
      wallet: string;
      scope: string;
      expires_at: number;
      issued_at: number;
      revoked: number;
    } | undefined;

    if (!row) return null;

    return {
      sessionId: row.id,
      tokenHash: row.token_hash,
      wallet: row.wallet,
      scope: row.scope,
      issuedAt: row.issued_at,
      expiresAt: row.expires_at,
    };
  }

  /**
   * Revoke all sessions for a wallet (self-revoke pattern).
   */
  revokeByWallet(wallet: string): void {
    this.db.prepare(
      "UPDATE sessions SET revoked = 1, expires_at = 0 WHERE wallet = ?"
    ).run(wallet);
  }

  /**
   * Revoke a specific session by ID.
   */
  revokeSession(sessionId: string): void {
    this.db.prepare(
      "UPDATE sessions SET revoked = 1, expires_at = 0 WHERE id = ?"
    ).run(sessionId);
  }

  /**
   * Grant step-up for high-value operations.
   */
  grantStepUp(sessionId: string): void {
    this.db.prepare(
      "UPDATE sessions SET expires_at = ? WHERE id = ?"
    ).run(Date.now() + SESSION_TTL_MS, sessionId);
  }

  // ─── Challenge store ─────────────────────────────────────────────────────────

  storeChallenge(params: {
    challengeId: string;
    daemonId: string;
    wallet: string;
    chainId: number;
    scope: string;
    expiresAt: number;
  }): void {
    this.db.prepare(`
      INSERT OR REPLACE INTO auth_challenges
        (challenge_id, daemon_id, wallet, chain_id, scope, expires_at, used)
      VALUES (?, ?, ?, ?, ?, ?, 0)
    `).run(
      params.challengeId,
      params.daemonId,
      params.wallet,
      params.chainId,
      params.scope,
      params.expiresAt
    );
  }

  getChallenge(challengeId: string): {
    challenge_id: string;
    daemon_id: string;
    wallet: string;
    chain_id: number;
    scope: string;
    expires_at: number;
    used: number;
  } | null {
    return this.db.prepare(
      "SELECT * FROM auth_challenges WHERE challenge_id = ?"
    ).get(challengeId) as {
      challenge_id: string;
      daemon_id: string;
      wallet: string;
      chain_id: number;
      scope: string;
      expires_at: number;
      used: number;
    } | null;
  }

  markChallengeUsed(challengeId: string): void {
    this.db.prepare(
      "UPDATE auth_challenges SET used = 1 WHERE challenge_id = ?"
    ).run(challengeId);
  }
}
