# TASK CONTRACT — ARC-402 Freeze Closure Repair

You are working in: `/home/lego/.openclaw/workspace-engineering/products/arc-402`

## Objective
Repair the RC-C freeze baseline so Step 4 becomes fully green.

## Baseline boundary
Use the RC-C freeze target identified in `reference/FREEZE-COMPLETION-REPORT.md`:
- baseline SHA: `7c79ae7129e222da6391bb198ab93770589507ea`

Work from the current branch, but your job is to make the repository satisfy the freeze-closure matrix for that baseline intent.
Do **not** add new arbitration-layer functionality.
Do **not** expand scope beyond freeze closure.

## What must be fixed
Based on the freeze report, close these three failure classes:

1. Solidity reference tests
- `cd /home/lego/.openclaw/workspace-engineering/products/arc-402/reference && forge test -vv`
- Current failure summary: remediation-first / dispute path mismatches
- Goal: full pass

2. TypeScript SDK build/test
- `cd /home/lego/.openclaw/workspace-engineering/products/arc-402/reference/sdk && npm run build && npm test`
- Current failure summary: export surface mismatch in `src/index.ts`
- Goal: build passes and tests pass

3. CLI build/test
- `cd /home/lego/.openclaw/workspace-engineering/products/arc-402/cli && npm run build && npm test`
- Current failure summary: CLI imports missing SDK exports
- Goal: build passes and tests pass

4. Python SDK confirmation
- Re-run isolated verification after fixes to ensure nothing regressed:
  - create/use isolated venv
  - `pytest`
  - `python -m build`

## Constraints
- Use explicit command style: `cd /full/path && <command>`
- Do not rely on implicit workdir resolution
- Do not edit tests unless the test change is strictly required to reflect the chosen freeze truth
- Prefer minimal fixes that restore coherence to the intended RC-C baseline
- Do not modify arbitration design documents except if a factual freeze status line must be updated after green verification

## Required deliverables
1. Make the code green for the freeze matrix
2. Update `reference/FREEZE-COMPLETION-REPORT.md` with final green results if achieved
3. If all green, update freeze artifacts minimally to reflect verified closure
4. Return a concise summary with:
   - root causes fixed
   - commands run
   - pass/fail results
   - files changed
   - whether freeze is now truly sealable

## Completion criteria
You are **not done** until all of the following are true:
- `forge test -vv` passes in `reference/`
- `npm run build && npm test` passes in `reference/sdk`
- `npm run build && npm test` passes in `cli`
- isolated `pytest` and `python -m build` pass in `python-sdk`
- results are recorded clearly
