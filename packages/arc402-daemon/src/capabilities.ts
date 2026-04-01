/**
 * Capability maps — session token access control.
 * Spec 46 §16 Pattern 3.
 *
 * SESSION_CAPABILITIES: what a session token MAY trigger.
 * SESSION_FORBIDDEN: never executes via session token, ever.
 *
 * Hardcoded — not configurable at runtime. Policy changes require daemon rebuild.
 */

// Capabilities a session token MAY trigger
export const SESSION_CAPABILITIES = new Set([
  "wallet.read",
  "agreement.read",
  "agreement.propose",
  "agreement.accept",
  "agreement.deliver",
  "agreement.verify",
  "compute.propose",
  "compute.end",
  "subscribe",
  "arena.*",
  "workroom.status",
  "userop.simulate",
  "userop.execute",          // routes to signer; PolicyEngine bounds apply
  "session.revoke:self",
]);

// These NEVER execute via session token — ever
export const SESSION_FORBIDDEN = new Set([
  "wallet.setGuardian",
  "wallet.setMachineKey",
  "wallet.authorizeMachineKey",
  "policy.setSpendLimit",
  "daemon.exportKey",
  "daemon.readSecrets",
  "daemon.shell",
  "daemon.restart",          // local admin only
  "daemon.config.write",
]);

/**
 * Check whether a capability is permitted for session token use.
 * Returns true if allowed, false if forbidden or not in the capability set.
 */
export function isCapabilityAllowed(capability: string): boolean {
  if (SESSION_FORBIDDEN.has(capability)) return false;
  if (SESSION_CAPABILITIES.has(capability)) return true;
  // arena.* wildcard: allow any capability starting with "arena."
  if (capability.startsWith("arena.")) return true;
  return false;
}
