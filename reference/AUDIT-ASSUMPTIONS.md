# ARC-402 Audit Assumptions (provisional)

1. The intended release-candidate target is the current local `main` line ending at `ce34123`, plus the present uncommitted worktree changes.
2. No additional hidden repo/worktree contains required release-candidate code.
3. Untracked markdown files under `reference/` and `reference/audit-independent/` are descriptive artifacts, not missing executable code.
4. Tracked Python `__pycache__` deletions are cleanup only and do not affect runtime behavior.
5. ZK remains out of default public-launch scope unless explicitly reintroduced in the final freeze decision.
6. Final audit reproducibility requires a new clean commit SHA after the dirty worktree is split, verified, and recommitted.
