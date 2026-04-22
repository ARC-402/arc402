# 48 — ARC-402 CLI Product Strategy

## Why this exists

ARC-402 CLI is already powerful, but it still behaves too much like a large command collection instead of a coherent operator product.

The goal of this strategy is to move ARC-402 from:
- **toolbox with many commands**

to:
- **operator console with commands inside it**

That is the difference between a useful CLI and a CLI that feels like an app.

---

## Product diagnosis

### Current strengths
- Deep protocol coverage already exists: wallet, daemon, workroom, agent, endpoint, compute, subscription, arena, disputes.
- A TUI shell already exists in `packages/arc402-cli/src/tui`.
- WalletConnect pairing already exists inside the shell.
- Notifications, command catalog, daemon events, and kernel execution primitives already exist.
- ARC-402 already has the ingredients of an app-like terminal product.

### Current weaknesses
- Product center of gravity is still in scattered commands, hidden config, and partial flows.
- New-user setup is fragmented across `config`, `wallet`, `setup`, docs, and implicit assumptions.
- Recovery is inconsistent — users often need to know the right command rather than being guided to the next action.
- Messaging/approval routing is not presented as one unified system.
- Hosted onboarding, CLI onboarding, and daemon/operator setup are still too loosely coupled.

### Core product problem
ARC-402 has **surface power** but not enough **interaction coherence**.

The user should not have to mentally compose the product from commands.
The product should compose itself around the user’s current state.

---

## Reference patterns worth borrowing

This strategy borrows patterns from strong modern coding CLIs and operator tools.

### OpenCode patterns worth stealing
Source: official docs at `opencode.ai/docs`
- Treat terminal as a real product surface, not only a command dispatcher.
- Support multiple surfaces while preserving one product identity.
- Keep initialization and connection flows first-class.
- Make customization and mode-switching explicit.

### Aider patterns worth stealing
Source: official repo/docs at `github.com/Aider-AI/aider`
- Make iterative correction easy.
- Keep the git/test loop visible and central.
- Optimize for “do work, inspect result, recover quickly.”
- Reduce ambiguity about what changed.

### Claude Code patterns worth stealing
Source: official docs at `code.claude.com/docs`
- Make the terminal feel like the primary home of the product.
- Keep permissions, state, and instructions explicit.
- Favor direct environment action over conceptual abstraction.
- Make workflows feel like a guided operating mode, not a manual.

---

## Strategic product decision

ARC-402 CLI should become:

> **The ARC-402 operator app for terminal-first users.**

Not a wrapper around protocol functions.
Not a command encyclopedia.
Not a dev-only toolkit.

It should be the place where an operator:
- sees system state,
- approves or routes actions,
- debugs failures,
- completes setup,
- and continues work.

---

## Product principles

### 1. Workflow-first, not noun-first
Primary UX should be organized around user intentions:
- get started
- connect wallet
- deploy wallet
- configure approvals
- register agent
- start workroom
- accept work
- deliver work
- recover from issues

Noun commands (`wallet`, `agent`, `daemon`) can still exist, but they should support the workflow layer, not replace it.

### 2. State should lead the interface
The CLI should always know enough to answer:
- where am I?
- what’s already done?
- what’s broken?
- what should I do next?

### 3. Recovery is a primary feature
If onboarding, approvals, pairing, daemon boot, or agent registration fails, the product should:
- explain the exact blocker,
- preserve progress,
- and present the next best action.

### 4. Messaging is part of the operator product
Approval routing is not “just integration.”
It is part of the core user experience.
The product must make explicit:
- where approvals go,
- how they will appear,
- what is configured,
- and what happens when delivery is missing.

### 5. TUI is not decoration
The TUI should become the default interaction hub for operators, not a sidecar demo.

---

## Product architecture direction

### Layer 1 — Workflow shell
Default `arc402` experience should behave like opening an operator app.

It should surface:
- wallet state
- daemon/workroom state
- endpoint/agent state
- pending approvals
- recent jobs and events
- current blockers
- recommended next action

### Layer 2 — Guided flows
Each critical lifecycle path should have an explicit guided flow:
- onboarding
- telegram / approval routing setup
- wallet deploy
- passkey activation
- policy setup
- agent registration
- workroom boot
- hire/accept/deliver cycle
- recovery / doctor

### Layer 3 — Expert command layer
Keep the deep command surface for power users and scripts.
This is the right place for granular commands and advanced flags.

### Layer 4 — Shared state model
Web, mobile, daemon, and CLI should converge on the same state model for:
- onboarding progress
- approval routing
- wallet readiness
- agent readiness
- workroom readiness

---

## Product roadmap

### Phase 1 — Stabilize the setup + approval story
- unify setup around a real onboarding funnel
- make approval routing visible and testable
- clarify standalone vs OpenClaw-native messaging model
- improve resume/recovery around onboarding and wallet flows

### Phase 2 — Promote TUI to primary operator surface
- dashboard view
- approvals center
- inbox/event feed
- health cards
- suggested next action
- keyboard-driven workflow navigation

### Phase 3 — Workflow UX over raw commands
- guided flows for high-value tasks
- plan/preview mode before writes
- better error-to-recovery transitions
- persistent progress markers

### Phase 4 — Multi-surface coherence
- terminal/web/mobile parity around states and flows
- same approval semantics everywhere
- same labels, same transitions, same recovery language

---

## Messaging strategy decision

There are two valid deployment modes.

### Mode A — Standalone ARC-402
ARC-402 CLI owns:
- WalletConnect session initiation
- Telegram bot delivery
- approval-button routing

### Mode B — OpenClaw-native ARC-402
When OpenClaw is present, ARC-402 should reuse OpenClaw’s messaging identity/routing instead of asking the user to configure Telegram twice.

### Recommendation
Support both, but prefer **OpenClaw-native when available**.

That gives:
- standalone usability for external operators,
- less duplicated setup in the GigaBrain environment,
- and a cleaner long-term product architecture.

---

## Success criteria

ARC-402 CLI feels like an app when a user can:
- run `arc402`
- immediately understand current state
- complete the next meaningful task without hunting docs
- recover from failure without guessing commands
- trust approval routing and delivery
- and feel like they are operating one product, not stitching five tools together

---

## Immediate follow-up docs
This strategy should be paired with:
- a concrete interaction architecture doc
- a setup funnel doc
- an approval routing model doc
- and a recovery model doc
