# ARC-402 Public Repo Manifest (Launch Window)

## Keep Public (essentials)
- README.md
- LICENSE
- CONTRIBUTING.md
- cli/
- plugin/
- python-sdk/ (excluding changelog/examples)
- landing/
- workroom/
- docs/ (curated operator-facing docs only)
- contracts/ (public contract interfaces/surfaces only)
- script/ (minimal public deployment helpers only)
- test/ (public confidence tests)

## Keep Private / Untracked (IP + process + noise)
- All audit reports and internal review artifacts
- Internal changelogs/process checklists
- Internal specs and design docs (`spec/`, `specs/`)
- runtime/build outputs (`broadcast/`, `cache/`, `.wake/`, `deliverables/`)
- private research internals (`reference/`, `subgraph/`, `tools/`)
- brand/memory/internal operational docs

## Enforcement
- scripts/repo-hygiene-check.sh
- .githooks/pre-commit
- .github/workflows/repo-hygiene.yml

