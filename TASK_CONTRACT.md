# TASK CONTRACT — ARC-402 Freeze Baseline Then Arbitration Prep

You are working in: `/home/lego/.openclaw/workspace-engineering/products/arc-402`

## Objective
Close the planned freeze baseline cleanly first, then prepare the arbitration-layer implementation plan on top of that baseline without contaminating the baseline itself.

## Hard rules
1. Do **not** silently mix freeze-baseline work with arbitration-layer implementation.
2. Treat the freeze baseline as a distinct target from the current preseal/arbitration-aware branch state.
3. Do **not** edit tests to make failures disappear unless the change is strictly required by the intended baseline truth.
4. You are **not done** until commands are run and results are recorded.
5. Prefer explicit `cd /home/lego/.openclaw/workspace-engineering/products/arc-402/... && <command>` command style. Do not rely on tool workdir.

## Deliverables
Create or update the following if needed:
- `reference/FREEZE-COMPLETION-REPORT.md`
- `reference/POST-FREEZE-ARBITRATION-PREP.md`
- freeze artifacts only if they are inconsistent with the chosen baseline and require correction:
  - `reference/AUDIT-TARGET-SHA.txt`
  - `reference/AUDIT-SCOPE.md`
  - `reference/AUDIT-ASSUMPTIONS.md`
  - `reference/AUDIT-EXCLUSIONS.md`

## Freeze-baseline target
Use repo history to determine the correct planned freeze baseline. Current steering indicates this should likely be the RC-C aligned point, not the later arbitration-aware preseal line.

## Required verification for freeze closure
Run and record results for the chosen baseline:
1. `cd .../reference && forge build`
2. `cd .../reference && forge test -vv`
3. `cd .../reference/sdk && npm run build && npm test`
4. `cd .../cli && npm run build && npm test`
5. `cd .../python-sdk && <isolated env if needed> pytest && python -m build`

## Freeze-completion report must answer
- what still remained before the planned freeze state was truly complete
- what exact tasks were left
- what had to be done to close Step 4 cleanly
- what final baseline SHA/branch/tag should represent the freeze state
- whether current freeze artifacts are internally coherent or need correction

## Post-freeze arbitration prep must answer
Assume the updated arbitration design:
- protocol-defined dispute fee, not arbitrator-priced
- fee = min(max(3% of agreement value, $5), $250)
- two dispute modes:
  - unilateral: opener pays full fee, refund 50% if opener wins, consumed if opener loses
  - mutual: both parties each pay half
- dispute classes affect fee tiers:
  - hard-failure = 1.0x
  - ambiguity/quality = 1.25x
  - high-sensitivity = 1.5x
  - still subject to global cap
- arbitrator bond separate from dispute fee
- no extra party bond in v1
- no DeFi insurance / pooled financialization in freeze state

Report must specify:
- exact contract changes required
- whether this should be a new branch after freeze
- exact docs / SDK / CLI changes required
- the added audit surface
- safest sequencing: freeze -> arbitration layer -> refreeze -> mega audit

## Output quality bar
Be concrete. Name files. Name commands. Name the architectural boundary.

## Completion signal
When completely finished, provide a concise summary with:
- baseline SHA
- verification results
- files changed
- key conclusion
