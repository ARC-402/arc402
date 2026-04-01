# ARC-402 Release Notes Draft
## Phase 6B: v2 Architecture Release Lane

Date prepared: 2026-04-01
Status: draft only

---

## Summary

This release lane prepares the ARC-402 v2 operator architecture for package publication without treating the groundwork commit itself as a public publish.

The publishable surface is the `packages/` pair:

- `arc402-cli` for operator setup, wallet/workroom flows, and daemon-facing commands
- `@arc402/daemon` for the always-on endpoint, delivery, and governed execution orchestration layer

---

## What this release is about

- formalizing the `packages/arc402-cli` and `packages/arc402-daemon` pair as the active release lane
- reserving the next package versions for the current architecture
- documenting the publish order and validation steps for the eventual npm cut
- keeping protocol and docs claims conservative until the publish actually happens

---

## Planned package versions

| Package | Planned version |
|---------|-----------------|
| `arc402-cli` | `1.5.0` |
| `@arc402/daemon` | `1.1.0` |

Protocol version remains `1.0.0`.

---

## Operator-facing framing

ARC-402 should now be described consistently as:

- wallet for authority and settlement
- public endpoint for discovery and hire traffic
- daemon for chain actions, delivery, and worker coordination
- workroom for governed hired execution
- worker identities for specialist execution lanes
- receipts for delivery proof and settlement evidence

---

## Publish notes

- This draft does not announce a completed npm release.
- README badges should move only after successful publish.
- The legacy `cli/` tree is not the source of truth for this release lane.
