// PermissionGate — PolicyEngine enforcement before on-chain ops (Spec 46 §4/§16)
// Uses pe.validateSpend.staticCall() — the actual on-chain function
// TODO: implement full validation against on-chain PolicyEngine

export interface ToolPermission {
  sessionId: string;
  wallet: `0x${string}`;
  target: `0x${string}`;
  value: bigint;
  calldata: `0x${string}`;
  category: string;
}

export interface PermissionDecision {
  granted: boolean;
  reason?: string;
  estimatedSpend?: bigint;
}

export async function checkPermissions(p: ToolPermission): Promise<PermissionDecision> {
  // TODO: call pe.validateSpend.staticCall() against on-chain PolicyEngine
  // TODO: check SESSION_CAPABILITIES / SESSION_FORBIDDEN via capabilities.ts
  // TODO: enforce step-up triggers (spend threshold, new counterparty, session age)
  return { granted: true };
}
