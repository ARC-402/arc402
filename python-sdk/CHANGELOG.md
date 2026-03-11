# Changelog

## [0.1.0] — 2026-03-10

Initial release of the ARC-402 Python SDK.

### Added
- `ARC402Wallet` — main entry point with `context()`, `spend()`, `set_policy()`, `trust_score()`, `attestations()`
- `PolicyClient` — set and validate category spend limits
- `TrustClient` — query and update trust scores
- `IntentAttestation` — create and verify on-chain intent attestations
- `MultiAgentSettlement` — propose, accept, reject, and execute agent-to-agent settlements
- `ContextBinding` — async context manager for task-scoped spending
- Full Pydantic models: `TrustScore`, `AttestationRecord`, `PolicyConfig`, `ProposalStatus`
- Exception hierarchy: `ARC402Error`, `PolicyViolation`, `TrustInsufficient`, `ContextAlreadyOpen`, `ContextNotOpen`, `TransactionFailed`, `AttestationNotFound`
- Base Sepolia network support with canonical contract addresses
- Examples: insurance claims agent, research agent, multi-agent settlement
