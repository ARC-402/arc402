# ARC-402 Post-Freeze Arbitration Prep (Design-Only Plan)

Date: 2026-03-12
Boundary: This is a **post-freeze layer** plan. No arbitration implementation was applied in this freeze-closure task.

## Branching boundary

- Baseline to branch from: `7c79ae7129e222da6391bb198ab93770589507ea`
- Create new branch after freeze: `feature/arbitration-layer-v1`
- Do not back-mix arbitration implementation into the freeze baseline tag.

## Required arbitration model (to implement post-freeze)

1. Protocol-defined dispute fee (not arbitrator-priced)
2. Base fee formula: `min(max(3% of agreement value, $5), $250)`
3. Dispute class multipliers:
   - hard-failure: `1.0x`
   - ambiguity/quality: `1.25x`
   - high-sensitivity: `1.5x`
   - final fee still subject to global cap
4. Modes:
   - unilateral: opener pays full fee; refund 50% if opener wins; consumed if opener loses
   - mutual: both parties each pay half
5. Arbitrator bond separate from dispute fee
6. No extra party bond in v1
7. No DeFi insurance / pooled financialization in freeze state

## Exact contract changes required

Primary target:
- `reference/contracts/ServiceAgreement.sol`

Likely supporting contract(s):
- `reference/contracts/PolicyEngine.sol` (if protocol parameters are routed via policy)
- optional new storage/helper module if separation is cleaner:
  - `reference/contracts/DisputeFeePolicy.sol` (or equivalent)

Concrete additions:
1. Add dispute fee config constants/params:
   - min fee USD, max fee USD, percent bps, class multipliers
2. Add agreement-value normalization path for fee calculation (token/ETH value reference approach must be explicit in docs)
3. Add enum(s): dispute class and dispute mode
4. Add accounting fields per dispute:
   - fee paid by opener
   - fee paid by counterparty
   - fee escrowed/consumed/refunded
   - arbitrator bond amount/status (separate ledger)
5. Add settlement logic in resolution path for unilateral refund rule
6. Add mutual mode path requiring both half-fees before arbitration activation
7. Emit explicit events for all fee and bond state transitions
8. Add guards so no extra party bond is required in v1

## Exact docs / SDK / CLI changes required

### Docs
- `reference/README.md` (dispute economics section)
- `docs/operator/**` and `docs/operator-standard/**` (operator dispute runbook + economics)
- `reference/AUDIT-SCOPE.md` + regression register updates after implementation

### TypeScript SDK
- `reference/sdk/src/types.ts` (new dispute enums/types)
- `reference/sdk/src/agreement.ts` (new dispute APIs/params)
- `reference/sdk/src/index.ts` exports synced
- tests under `reference/sdk/test/**` for fee math and mode behaviors

### CLI
- `cli/src/commands/dispute.ts`
- help text and examples for dispute class/mode and fee preview
- CLI tests for unilateral vs mutual flows

### Python SDK
- `python-sdk/arc402/types.py`
- `python-sdk/arc402/agreement.py` (or equivalent module)
- tests in `python-sdk/tests/**`

## Added audit surface

1. Economic correctness of fee formula, clamping, and class multiplier application
2. Token/value conversion assumptions used for USD-denominated fee boundaries
3. Resolution accounting correctness (refund/consume outcomes)
4. Fee griefing and deadlock vectors in mutual mode
5. Bond isolation correctness (bond not conflated with dispute fee)
6. Event-level observability for off-chain monitoring and evidence

## Safest sequencing

1. **Freeze** at `7c79ae7` boundary (baseline tagged)
2. Implement arbitration layer on `feature/arbitration-layer-v1`
3. Full verification sweep (contracts + TS SDK + CLI + Python SDK)
4. **Refreeze** at a new post-arbitration RC tag
5. Run mega audit on that refrozen SHA

## Architectural boundary statement

- Freeze baseline = RC-C aligned protocol surface (`7c79ae7`)
- Arbitration layer = separate post-freeze change set with separate audit surface
- No boundary mixing