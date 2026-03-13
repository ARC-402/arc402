# ARC-402 Audit Assumptions (freeze baseline)

1. Planned freeze baseline is RC-C aligned commit `7c79ae7129e222da6391bb198ab93770589507ea`.
2. Arbitration-aware preseal commits after this point are post-freeze work, not part of baseline truth.
3. Freeze closure requires reproducible verification evidence across contracts, TS SDK, CLI, and Python SDK.
4. Known verification failures at baseline are documented, not hidden, and must be resolved before a final all-green freeze seal.
5. No DeFi insurance / pooled financialization is in freeze scope.