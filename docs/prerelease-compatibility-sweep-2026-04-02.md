# Prerelease Compatibility Sweep
*Date: 2026-04-02*
*Scope: current prerelease lane in `packages/arc402-cli` and `packages/arc402-daemon`, plus `reference/sdk`, `python-sdk`, `plugin`, and Hermes integration assets*

---

## Summary Matrix

| Surface | Lane status vs prerelease packages | Required action | Prerelease blocker | Notes |
|---------|------------------------------------|-----------------|--------------------|-------|
| TypeScript SDK (`reference/sdk`) | Compatible with current prerelease lane | `1. no change` | No | `packages/arc402-cli` still consumes `@arc402/sdk` by semver and the current SDK surface already exports the delivery/endpoint/arena helpers used by the operator lane. |
| Python SDK (`python-sdk`) | Compatible and still intentionally separate from the package publish lane | `1. no change` | No | Current `0.5.5` package already mirrors the operator-facing delivery and endpoint model; no prerelease-lane package contract changed it. |
| OpenClaw plugin (`plugin`) | Compatible, but metadata drift existed | `2. docs/version change only` | No | `plugin/package.json` is `1.3.5`, while `openclaw.plugin.json` was still `1.0.1`. This sweep syncs the manifest to `1.3.5`. |
| Hermes integration (`hermes/` plus `arc402 hermes init`) | Required alignment with the prerelease CLI packaging | `3. code alignment` | Yes, before this sweep; cleared now | `arc402 hermes init` depends on `hermes/` assets, but `packages/arc402-cli` did not package them. This sweep stages `../../hermes` into the CLI tarball during `prepack` and removes it in `postpack`. |

---

## What Changed In This Sweep

### 1. Hermes integration blocker fixed

Problem:
- `packages/arc402-cli/src/commands/hermes-init.ts` copies files from `hermes/skills/...`, `hermes/plugins/...`, and `hermes/workroom/...`.
- The publish surface for `arc402-cli` only included `dist/` and `workroom/`.
- A published or packed CLI would therefore ship the `hermes init` command without the Hermes assets it needs at runtime.

Fix applied:
- Added `hermes/` to `packages/arc402-cli/package.json` `files`.
- Extended `prepack` to stage both `../../workroom` and `../../hermes` into the package directory.
- Extended `postpack` to remove both staged directories after pack.

Result:
- `arc402 hermes init` now has the required packaged assets in the CLI tarball.
- This was the only compatibility issue found that rose to prerelease-blocker level.

### 2. OpenClaw plugin manifest version synced

Problem:
- `plugin/package.json` already declares `@arc402/arc402` as `1.3.5`.
- `plugin/openclaw.plugin.json` still declared `1.0.1`.

Fix applied:
- Updated `plugin/openclaw.plugin.json` version to `1.3.5`.

Result:
- Internal plugin metadata now matches the package version and README/package framing.
- This was not a blocker, but it was obvious low-risk drift worth correcting.

---

## Surface Notes

### TypeScript SDK

Assessment:
- The active prerelease lane is the `packages/` pair, not `reference/sdk`.
- `packages/arc402-cli` still depends on `@arc402/sdk` by semver (`^0.6.0`), and the current installed resolution remains `0.6.5`.
- The SDK already exposes `DeliveryClient`, `DEFAULT_DAEMON_URL`, endpoint helpers, arena exports, and the contract clients used by the operator flow.

Decision:
- No change required.
- Not a prerelease blocker.

### Python SDK

Assessment:
- `python-sdk` remains explicitly outside the current npm prerelease lane.
- Current `0.5.5` exports already include delivery, endpoint, compute, and arena helpers aligned with the operator/runtime story.
- The prerelease `packages/arc402-daemon` split does not force a Python SDK API change because the daemon URL and delivery model remain the same.

Decision:
- No change required.
- Not a prerelease blocker.

### OpenClaw plugin

Assessment:
- The plugin remains a separate lane and still delegates to `arc402-cli` as a peer dependency.
- Tool registration and CLI command naming still line up with the current operator CLI.
- The concrete drift found was version metadata only.

Decision:
- Docs/version change only.
- Not a prerelease blocker.

### Hermes integration

Assessment:
- The CLI now exposes a first-class `arc402 hermes init` path in the prerelease lane.
- That command is packaging-sensitive because it copies repo assets rather than generating everything from code.
- Before this sweep, those assets were not shipped in the CLI package.

Decision:
- Code alignment required.
- Was a prerelease blocker until fixed in this sweep.

---

## Verification

Commands run:

```bash
cd packages/arc402-cli && npm run build
cd packages/arc402-cli && npm_config_cache=/tmp/arc402-npm-cache npm pack --dry-run
cd plugin && npm run build
```

Results:
- `packages/arc402-cli` build passed.
- `packages/arc402-cli` pack dry-run passed and the tarball contents now include `hermes/skills`, `hermes/plugins`, and `hermes/workroom`.
- `plugin` build passed.

---

## Final Call

- TypeScript SDK: no change, not a blocker.
- Python SDK: no change, not a blocker.
- OpenClaw plugin: docs/version change only, not a blocker.
- Hermes integration: code alignment required, blocker found and fixed in this sweep.
