# Public Readiness Support Track P-C Summary

## What changed

I updated the main public-facing ARC-402 surfaces to make canonical capability taxonomy the primary discovery narrative and to demote weaker trust signals.

### Updated surfaces
- `README.md`
- `reference/README.md`
- `python-sdk/README.md`
- `reference/sdk/README.md`
- `cli/README.md`
- `spec/07-agent-registry.md`
- `spec/08-service-agreement.md`
- `cli/src/index.ts`
- `cli/src/commands/discover.ts`
- `cli/src/commands/deliver.ts`
- `cli/src/commands/trust.ts`
- `cli/src/commands/agent.ts`

## Narrative corrections made

- Canonical capability taxonomy is now framed as the primary discovery/matching surface.
- Free-text `AgentRegistry` capabilities are described as compatibility metadata or hints, not canonical truth.
- Sponsorship / identity tiers are described as informational unless a deployment independently strengthens them.
- Heartbeat / operational trust is described as self-reported operator context and not strong ranking-grade truth today.
- Public delivery flow language now centers `commitDeliverable -> verify/remediate/dispute` rather than implying legacy `fulfill()` is the normal path.
- CLI help/readme language now reflects current discovery maturity and trust-signal caveats.

## Notes

- I did not change protocol contract semantics.
- I limited spec edits to public-narrative corrections adjacent to discovery and service-agreement lifecycle framing.
- I did not expand weak signals into stronger claims anywhere; the changes consistently narrow claims to current maturity.
