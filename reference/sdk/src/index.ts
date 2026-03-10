/**
 * ARC-402 TypeScript SDK
 * Reference implementation — DRAFT
 *
 * Exports:
 *   - ARC402Wallet: wallet client with policy, context, trust, intent
 *   - PolicyObject: policy schema and validation
 *   - ContextBinding: context lifecycle management
 *   - TrustPrimitive: trust score queries
 *   - IntentAttestation: attestation creation and signing
 *   - MultiAgentSettlement: bilateral settlement protocol
 */

export { ARC402Wallet } from './wallet'
export { PolicyObject, PolicyValidator } from './policy'
export { ContextBinding } from './context'
export { TrustPrimitive } from './trust'
export { IntentAttestation } from './intent'
export { MultiAgentSettlement } from './settlement'

export type {
  Policy,
  PolicyCategory,
  EscalationConfig,
  Context,
  TrustScore,
  TrustThreshold,
  Intent,
  Attestation,
  SettlementProposal,
  AcceptanceProof,
  RejectionProof,
  RejectionCode,
} from './types'
