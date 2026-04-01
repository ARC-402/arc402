/**
 * ExecState machine — UserOp execution lifecycle tracking.
 * Spec 46 §16 Pattern 4.
 * Persisted to SQLite per-transition.
 */

export enum ExecState {
  RECEIVED  = "received",
  SESSION_OK = "session_ok",
  POLICY_OK  = "policy_ok",
  BUILT      = "built",
  SIMULATED  = "simulated",
  SIGNED     = "signed",
  SUBMITTED  = "submitted",
  INCLUDED   = "included",
  FINALIZED  = "finalized",
  REJECTED   = "rejected",
}

// Allowed transitions only — any other transition throws
export const ALLOWED_TRANSITIONS: Record<ExecState, ExecState[]> = {
  [ExecState.RECEIVED]:   [ExecState.SESSION_OK, ExecState.REJECTED],
  [ExecState.SESSION_OK]: [ExecState.POLICY_OK,  ExecState.REJECTED],
  [ExecState.POLICY_OK]:  [ExecState.BUILT,      ExecState.REJECTED],
  [ExecState.BUILT]:      [ExecState.SIMULATED,  ExecState.REJECTED],
  [ExecState.SIMULATED]:  [ExecState.SIGNED,     ExecState.REJECTED],  // ← only state that may call signer
  [ExecState.SIGNED]:     [ExecState.SUBMITTED,  ExecState.REJECTED],
  [ExecState.SUBMITTED]:  [ExecState.INCLUDED,   ExecState.REJECTED],
  [ExecState.INCLUDED]:   [ExecState.FINALIZED,  ExecState.REJECTED],
  [ExecState.FINALIZED]:  [],
  [ExecState.REJECTED]:   [],
};

// SQLite record per transition
export interface ExecRecord {
  requestId: string;
  sessionId: string;
  wallet: string;
  target: string;
  calldataHash: string;
  state: ExecState;
  reason?: string;        // populated on REJECTED
  timestamp: number;
}

/**
 * Validate a state transition. Throws if the transition is not allowed.
 */
export function validateTransition(from: ExecState, to: ExecState): void {
  const allowed = ALLOWED_TRANSITIONS[from];
  if (!allowed.includes(to)) {
    throw new Error(
      `Invalid ExecState transition: ${from} → ${to}. ` +
      `Allowed from ${from}: [${allowed.join(", ") || "none"}]`
    );
  }
}

/**
 * Returns true if the given state is a terminal state (no further transitions).
 */
export function isTerminal(state: ExecState): boolean {
  return ALLOWED_TRANSITIONS[state].length === 0;
}
