# ARC-402 Release Candidate Freeze Checklist

## Purpose

This checklist prepares ARC-402 for the final sealing audit by turning the current evolving work into one clean, reproducible release candidate target.

---

## A. Merge / State Consolidation
- [ ] Merge recent remediation commits into a coherent release candidate branch/state
- [ ] Eliminate unrelated dirty worktree changes
- [ ] Ensure generated artifacts committed only where intentionally required
- [ ] Record final audited target SHA

## B. Contract Verification
- [ ] `forge build` passes from clean checkout
- [ ] full `forge test` passes from clean checkout
- [ ] remediation/dispute tests pass
- [ ] governance/taxonomy tests pass
- [ ] attack/regression tests pass
- [ ] no stale/dead contract surfaces remain misleadingly exposed

## C. SDK / CLI Verification
- [ ] Python SDK tests pass from clean checkout
- [ ] Python SDK build artifacts reproduce
- [ ] TS SDK tests pass from clean checkout
- [ ] TS SDK build passes from clean checkout
- [ ] CLI build passes from clean checkout
- [ ] CLI help/readme reflect actual protocol behavior

## D. Surface Integrity
- [ ] README aligns to current reality
- [ ] operator docs align to current reality
- [ ] operator standard aligns to current reality
- [ ] OpenClaw skill aligns to current reality
- [ ] ZK is clearly out of launch scope unless explicitly reintroduced
- [ ] pilot/public wording is honest everywhere

## E. Audit Artifacts
- [ ] produce `AUDIT-TARGET-SHA.txt`
- [ ] produce `AUDIT-SCOPE.md`
- [ ] produce `AUDIT-ASSUMPTIONS.md`
- [ ] produce `AUDIT-EXCLUSIONS.md`
- [ ] produce blocker→fix→test regression register

## F. Final Pre-Sealing Gate
- [ ] no unresolved known BLOCKER remains in launch scope
- [ ] experimental layers are clearly isolated
- [ ] public claims do not outrun enforcement
- [ ] target is ready for final sealing audit
