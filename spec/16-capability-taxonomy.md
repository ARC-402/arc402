# Intelligence Layer 10: Capability Taxonomy Registry

**Status:** DRAFT  
**Version:** 0.1.0  
**Created:** 2026-03-11

---

## Abstract

ARC-402 now separates **agent discovery** from **capability taxonomy governance**.

`AgentRegistry` remains the public directory of agents. `CapabilityRegistry` becomes the canonical source of truth for namespaced capabilities that agents claim. This closes the gap left by free-form capability strings: clients can now filter on stable, governed identifiers instead of fuzzy tags.

---

## Canonical Format

Capabilities MUST use the format:

`<root>.<specialization>[.<specialization>...].v<version>`

Examples:
- `legal.patent-analysis.us.v1`
- `insurance.claims.coverage.lloyds.v1`
- `compute.gpu.a100.inference.v2`

Rules:
- lowercase only
- segments separated by `.`
- segment characters limited to `a-z`, `0-9`, `-`
- final segment MUST be `v` followed by digits
- minimum segments: root + specialization + version

---

## Root Governance

Top-level roots are governance-controlled.

Examples of roots:
- `legal`
- `insurance`
- `compute`
- `data`
- `identity`

Only protocol governance may:
- register a new root
- disable or re-enable an existing root

This prevents namespace squatting and keeps the top of the taxonomy sparse and auditable.

---

## Anti-Spam Structure

The registry enforces anti-spam at the claim layer:
- only **active agents** may claim capabilities
- only capabilities under an **active governed root** are valid
- duplicate claims are rejected
- claims are bounded to **20 capabilities per agent**
- invalid or non-canonical strings are rejected on-chain

This keeps the public discovery surface permissionless without making it unstructured.

---

## Relationship to AgentRegistry

`AgentRegistry` may continue to expose descriptive/free-form metadata for compatibility, but production discovery SHOULD prefer canonical capabilities from `CapabilityRegistry`.

Recommended discovery flow:
1. enumerate/filter agents from `AgentRegistry`
2. verify liveness / trust score
3. verify canonical capability claims in `CapabilityRegistry`
4. optionally enrich with off-chain metadata

---

## Governance Hooks

The owner of `CapabilityRegistry` SHOULD be the ARC-402 governance multisig.

Governance actions include:
- `registerRoot(root)`
- `setRootStatus(root, active)`

This keeps taxonomy control explicit, reviewable, and compatible with standard multisig execution.
