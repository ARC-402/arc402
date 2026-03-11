# ARC-402 Python SDK v0.2 summary

Date: 2026-03-11

## What was upgraded

The Python SDK under `products/arc-402/python-sdk` was upgraded from `0.1.0` to `0.2.0` to align with the current ARC-402 reference contracts.

### Added / expanded protocol coverage

- `ServiceAgreementClient`
  - v2 agreement reads now include `verify_window_end` and `committed_hash`
  - negotiated remediation helpers:
    - `request_revision()`
    - `respond_to_revision()`
    - `propose_partial_settlement()`
    - `request_human_review()`
    - `remediation_history()`
  - dispute flow helpers:
    - `submit_dispute_evidence()`
    - `resolve_dispute_detailed()`
    - `dispute_evidence_list()`
    - `get_dispute_case()` / `get_dispute_evidence()`
  - kept low-level one-to-one contract methods where appropriate

- `TrustClient`
  - v2 reads added:
    - `get_global_score()`
    - `get_effective_score()`
    - `get_profile()`
    - `get_capability_score()`
    - `get_capability_slots()`
    - `meets_threshold()`
    - `meets_capability_threshold()`
  - write methods updated to support v2 `recordSuccess` / `recordAnomaly` signatures while staying backward-tolerant

- `AgentRegistryClient`
  - heartbeat / operational trust reads:
    - `get_operational_metrics()`
    - `get_endpoint_stability()`
    - `get_operational_trust()`
  - heartbeat interactions:
    - `submit_heartbeat()`
    - `set_heartbeat_policy()`
  - `get_agent(..., include_operational=True)` enriches registry reads with operational metrics

- New `ReputationOracleClient`
  - `publish_signal()`
  - `get_reputation()`
  - `get_capability_reputation()`
  - `get_signal_count()` / `get_signal()` / `list_signals()`

- New `SponsorshipAttestationClient`
  - `publish()`
  - `publish_with_tier()`
  - `revoke()`
  - `is_active()`
  - `get_active_attestation()`
  - `get_attestation()`
  - `get_sponsor_attestations()` / `get_agent_attestations()`
  - `active_sponsor_count()`
  - `get_highest_tier()` / `is_verified()`

- New `CapabilityRegistryClient`
  - capability taxonomy reads:
    - `list_roots()`
    - `get_root()` / `get_root_at()`
    - `is_root_active()`
    - `get_capabilities()`
    - `capability_count()`
    - `is_capability_claimed()`

- New `ARC402GovernanceClient`
  - governance reads:
    - `threshold()`
    - `transaction_count()`
    - `get_transaction()`
    - `list_signers()`
    - `is_confirmed()`

### Types added / updated

Added strongly typed Python models / enums for:
- agreement lifecycle enums
- remediation cases, feedback, responses
- dispute cases, evidence, outcomes
- reputation signals and summaries
- sponsorship identity tiers and attestation records
- capability slot / trust profile models
- governance transactions
- operational metrics

## README updates

README now reflects the current protocol direction with examples for:
- governed wallet spending
- remediation-first service agreement flow
- dispute evidence + partial resolution
- reputation publication
- sponsorship / identity tiers
- capability taxonomy / governance / operational trust reads

## Explicit gaps not invented in SDK

The SDK intentionally does **not** invent unsupported protocol features. The current reference contracts do not yet expose dedicated on-chain APIs for:
- peer arbitrator marketplace selection
- automated evidence adjudication engines
- richer structured delivery schemas beyond hash-anchored payloads

Those were documented as gaps rather than wrapped speculatively.

## Verification

### Tests

Command:

```bash
PYTEST_DISABLE_PLUGIN_AUTOLOAD=1 python3 -m pytest -q tests/test_types.py tests/test_policy.py tests/test_wallet.py
```

Result:
- 16 passed

### Build

Command:

```bash
python3 -m build
```

Result:
- built `arc402-0.2.0.tar.gz`
- built `arc402-0.2.0-py3-none-any.whl`
