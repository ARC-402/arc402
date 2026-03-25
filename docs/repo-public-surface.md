# ARC-402 Repo Public Surface Policy

## Goal
Keep the public repository clean, launch-focused, and free of private IP/work artifacts.

## Public (allow by default)
- `README.md`
- `cli/` (published CLI source)
- `plugin/` (published OpenClaw plugin source)
- `python-sdk/` (published Python SDK source)
- `docs/` (curated launch docs only)
- `landing/` (public site surface)
- `LICENSE`

## Private / noisy (must stay untracked)
- Runtime outputs: `broadcast/`, `cache/`, `.wake/`, `deliverables/`
- Private IP/contracts internals: `reference/contracts/`, `reference/script/`, `reference/src/`
- Deep research/workfiles: `spec/`, `specs/`, `articles/`, `subgraph/`, `tools/`, `scripts/`
- Sensitive/local context: `memory/`, `brand/`, local env files

## Guardrails
1. `.gitignore` enforces ignore rules for private/noisy paths.
2. `scripts/repo-hygiene-check.sh` blocks:
   - tracked-but-ignored files
   - forbidden tracked paths
3. Local pre-commit hook runs hygiene checks (`.githooks/pre-commit`).
4. CI workflow runs hygiene on every PR/push (`.github/workflows/repo-hygiene.yml`).

## Operator note
If a file is already tracked, adding it to `.gitignore` is not enough.
Use `git rm --cached <path>` to stop tracking while keeping the local file.
