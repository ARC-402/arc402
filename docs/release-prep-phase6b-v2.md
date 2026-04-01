# ARC-402 Phase 6B Release Prep
*Status: Ready for validation*
*Owner: Engineering*
*Date: 2026-04-01*

---

## Purpose

This document defines the release lane for the current v2 architecture without claiming that a public publish has already happened.

The goal is to make the next package cut concrete:

- identify the package manifests that actually belong to the release lane
- reserve the next versions that match the current architecture
- record the publish order and validation steps
- prevent accidental publishes from legacy or reference trees

---

## Release lane truth

The current v2 operator architecture in this repository is the paired package surface under `packages/`:

| Package | Path | Role | Planned version |
|---------|------|------|-----------------|
| `arc402-cli` | `packages/arc402-cli/package.json` | operator CLI, workroom entrypoint, daemon-facing control surface | `1.5.0` |
| `@arc402/daemon` | `packages/arc402-daemon/package.json` | always-on daemon for endpoint, delivery, worker routing, and signer/api split | `1.1.0` |

### Not in this release lane

These trees were reviewed and are intentionally not treated as the publish source of truth for this cut:

| Path | Why it is held |
|------|----------------|
| `cli/package.json` | legacy package tree; version trails `packages/arc402-cli` and would create split-brain publishes |
| `reference/` | reference material, not active product publish surface |
| `python-sdk/` | separate SDK lane with no Phase 6B changes prepared here |
| app/site packages (`web`, `landing`, `arena`, `plugin`, etc.) | not part of the operator package release lane requested for this phase |

---

## Version decisions

### Reserved package versions

| Package | Current | Reserved next version | Reason |
|---------|---------|-----------------------|--------|
| `arc402-cli` | `1.4.51` | `1.5.0` | minor release to mark the v2 architecture lane centered on workroom + daemon packaging |
| `@arc402/daemon` | `1.0.0` | `1.1.0` | minor release to mark the standalone daemon package as a first-class public release surface |

### Versions intentionally unchanged

- Protocol version remains `1.0.0` per `spec/20-protocol-versioning.md`.
- README badges remain as-is until packages are actually published.
- Legacy `cli/package.json` is not bumped in Phase 6B.

---

## Architecture truth to communicate in release notes

The release narrative for this cut should match the repository as it exists now:

- ARC-402 is operated as a node made of wallet, public endpoint, daemon, workroom, worker identities, and receipts.
- The daemon is a standalone package and not just an implementation detail hidden inside the CLI tree.
- The workroom is the governed hired-work lane of the node, not a generic sandbox.
- The public publish lane is the `packages/` pair, not the legacy `cli/` tree.

---

## Publish checklist

Use this list when the actual release candidate is cut.

1. Validate package metadata:
   - `packages/arc402-cli/package.json`
   - `packages/arc402-daemon/package.json`
   - matching `package-lock.json` files
2. Build both packages:
   - `cd packages/arc402-daemon && npm run build`
   - `cd packages/arc402-cli && npm run build`
3. Run CLI tests:
   - `cd packages/arc402-cli && npm test`
4. Verify the CLI tarball contains `dist/` and `workroom/`.
5. Dry-run pack both packages before any publish.
6. Confirm the daemon package is published before the CLI package.
7. Replace the CLI's local `file:../arc402-daemon` dependency with the exact release version only in the actual publish branch or release cut.
8. Update README badges and any npm install examples only after publish succeeds.
9. Tag the release from the publish commit, not from this groundwork commit.

---

## Release blockers to clear at publish time

- `packages/arc402-cli` currently depends on the daemon via `file:../arc402-daemon`, which is correct for this repo but must be converted to a publishable semver dependency when the release branch is cut.
- The repo still contains a legacy `cli/` package tree. Release execution must avoid using it as the package source of truth.

---

## Expected outputs from the actual publish cut

- npm publish of `@arc402/daemon@1.1.0`
- npm publish of `arc402-cli@1.5.0`
- README badge and install examples updated to the published versions
- release notes finalized from `docs/release-notes-phase6b-v2-draft.md`
