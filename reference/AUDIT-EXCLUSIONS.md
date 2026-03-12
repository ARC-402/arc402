# ARC-402 Audit Exclusions (provisional)

Until a final freeze commit is produced, the following should be treated as excluded from the audited target unless intentionally versioned and verified:

- local install directories:
  - `cli/node_modules/`
  - `reference/node_modules/`
  - `reference/circuits/node_modules/`
- generated Python caches:
  - `python-sdk/**/__pycache__/`
- ignored local build outputs:
  - `reference/cache/`
  - `reference/out/`
  - `reference/broadcast/`
  - `reference/typechain-types/`
- any machine-local environment/config values not intentionally committed
- ZK/privacy machinery for launch readiness decisions unless the final freeze explicitly brings it back into scope
