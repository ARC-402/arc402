# Public Readiness Support P-B Summary

## Scope completed
Quarantined ZK from ARC-402 public-launch scope without deleting the work.

## What changed
- Reframed `spec/13-zk-extensions.md` as **experimental / non-launch scope**.
- Added explicit warning that ZK flows are roadmap-only and should not be presented as production-ready or part of the launch-grade happy path.
- Softened wording in the ZK spec so “architecture support” is no longer read as launch readiness.
- Updated `reference/README.md` to present the repo as a **closed-pilot candidate**, not open-public-launch ready.
- Marked ZK in the reference spec index as **experimental roadmap, non-launch scope**.
- Added launch-scope warnings to both SDK READMEs (`python-sdk/README.md`, `reference/sdk/README.md`) so ZK/privacy work is clearly outside the default integration path.
- Updated the CLI README to:
  - state that ZK/privacy work is not part of the default/launch-ready CLI path
  - reframe `deliver` as entering review/remediation/dispute rather than implying immediate payout
  - soften the example output so it no longer implies unconditional instant release
- Added a top-level root README note that current public scope is governed wallets, discovery, escrow, remediation, dispute, and reputation — **not** ZK-assisted proofs.

## Files changed
- `README.md`
- `spec/13-zk-extensions.md`
- `reference/README.md`
- `reference/sdk/README.md`
- `python-sdk/README.md`
- `cli/README.md`

## Notes
- I did not remove ZK contracts or draft interfaces; this was a launch-surface isolation pass only.
- The ZK contract comments already say draft / not for production, so I left code intact.
- The original task pointed to `reference/spec/13-zk-extensions.md`, but the actual file in repo is `spec/13-zk-extensions.md`.
