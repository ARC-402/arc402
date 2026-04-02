# Spec 46 UX Completion Plan
*Status: Active execution plan*
*Date: 2026-04-02*
*Owner: Forge (Engineering)*
*Execution runtime: Claude Code*

---

## Purpose

This document is the single source of truth for completing the **Spec 46 CLI/TUI UX ambition**.

It exists so the work is not trapped in Telegram chat. It should be used as:
- the execution plan
- the progress tracker
- the review checklist
- the Claude Code prompt pack
- the manual signoff document

Mark items with ✅ only when the acceptance criteria for that phase are actually met.

---

## Executive Diagnosis

The **Spec 46 architecture landed**.
The **Spec 46 UX ambition did not**.

What exists today:
- a real TUI shell foundation
- generic UI primitives
- broader architecture/package split progress
- published command surface

What does **not** yet exist in a truthful, complete way:
- resize-safe layout
- measured header/viewport system
- command-specific commerce renderers promised by the spec
- proper inline status rendering
- a finished `arc402 chat` commerce shell
- live protocol/event UX
- acceptance proof that the real CLI matches the landing-page demo ambition

**Verdict:** this is a **UX completion lane** built on top of one necessary structural repair layer.

---

## Definition of Done

Spec 46 UX is only complete when all of the following are true:

### Shell foundation
- [ ] Header height is measured, not hardcoded
- [ ] Terminal resize recalculates layout reactively
- [ ] Viewport does not jump / overflow / underflow on resize
- [ ] No hardcoded `HEADER_ROWS = 15` remains in active TUI layout logic

### Commerce renderer system
- [ ] `StatusCard` exists and is wired
- [ ] `HireCard` exists and is wired
- [ ] `DiscoverList` exists and is wired
- [ ] `AgreementList` exists and is wired
- [ ] `ComputeCard` exists and is wired
- [ ] `SubscribeCard` exists and is wired
- [ ] `RoundsList` exists and is wired
- [ ] `SquadCard` exists and is wired
- [ ] `WorkroomCard` exists and is wired

### Command integration
- [ ] `arc402 status` renders inline in TUI mode
- [ ] No subprocess-inside-TUI pattern remains in flagship command flows
- [ ] TUI-mode output is routed through structured rendering, not ad hoc console dumping

### Commerce shell
- [ ] `arc402 chat` is a real commerce shell, not a partial stub
- [ ] Harness context is injected coherently
- [ ] Wallet / trust / agreement context improves the shell experience

### Live protocol UX
- [ ] Live event stream exists
- [ ] CLI/TUI renders the event feed as signal, not noise
- [ ] Agreement / compute / arena activity can be monitored in real time

### Acceptance proof
- [ ] Real terminal resize tests pass
- [ ] Real operator walkthrough passes
- [ ] CLI visually feels aligned with the landing-page terminal demo
- [ ] Lego manually signs off on the real experience

---

# Program Structure

## Phase Order

1. **Phase 1 — Shell foundation**
2. **Phase 2 — Commerce renderer layer**
3. **Phase 3 — Command integration + status de-brickification**
4. **Phase 4 — Commerce shell (`arc402 chat`)**
5. **Phase 5 — Live event UX**
6. **Phase 6 — Acceptance + refinement + claim audit**

No claiming completion before Phase 6 is complete.

---

# Phase Tracker

## Phase 1 — Shell Foundation
**Goal:** make the TUI structurally honest.

### Deliverables
- [x] `useTerminalSize.ts`
- [x] measured header height implementation
- [x] viewport height driven by measured layout
- [x] remove hardcoded `HEADER_ROWS = 15`
- [ ] clean resize behavior in real terminal
- [x] update scroll logic if required by measured viewport changes

### Likely files
- `packages/arc402-cli/src/tui/App.tsx`
- `packages/arc402-cli/src/tui/Viewport.tsx`
- `packages/arc402-cli/src/tui/Header.tsx`
- `packages/arc402-cli/src/tui/useScroll.ts`
- `packages/arc402-cli/src/tui/useTerminalSize.ts` (new)

### Acceptance criteria
- [x] no hardcoded header sizing remains in shell layout logic
- [ ] resize works in real terminal session
- [ ] no header/viewport jump during resize
- [ ] no clipping / overflow on narrow and wide terminal states

### Forge review gate
- [x] diff read line-by-line
- [x] layout architecture makes sense, not just symptom patching
- [x] fallback behavior for first render / zero measurement is safe

### Lego manual review
- [ ] real resize in your own terminal feels stable

---

## Phase 2 — Commerce Renderer Layer
**Goal:** build the actual domain render system.

### Deliverables
- [x] `StatusCard`
- [x] `HireCard`
- [x] `DiscoverList`
- [x] `AgreementList`
- [x] `ComputeCard`
- [x] `SubscribeCard`
- [x] `RoundsList`
- [x] `SquadCard`
- [x] `WorkroomCard`
- [x] shared rendering conventions documented in code comments / pattern usage

### Likely files
- `packages/arc402-cli/src/tui/components/commerce/StatusCard.tsx`
- `packages/arc402-cli/src/tui/components/commerce/HireCard.tsx`
- `packages/arc402-cli/src/tui/components/commerce/DiscoverList.tsx`
- `packages/arc402-cli/src/tui/components/commerce/AgreementList.tsx`
- `packages/arc402-cli/src/tui/components/commerce/ComputeCard.tsx`
- `packages/arc402-cli/src/tui/components/commerce/SubscribeCard.tsx`
- `packages/arc402-cli/src/tui/components/commerce/RoundsList.tsx`
- `packages/arc402-cli/src/tui/components/commerce/SquadCard.tsx`
- `packages/arc402-cli/src/tui/components/commerce/WorkroomCard.tsx`

### Acceptance criteria
- [x] all 9 components exist
- [x] all have typed props
- [x] all can render real command data
- [x] visual language is consistent across all components
- [x] status/color semantics are consistent

### Forge review gate
- [x] renderer pattern is coherent
- [x] no fragmented visual language
- [x] typography / spacing / hierarchy feel branded and intentional

### Lego manual review
- [ ] the renderer system feels like one product, not 9 separate experiments

---

## Phase 3 — Command Integration + Status De-Brickification
**Goal:** wire the commerce renderer system into actual command flows.

### Deliverables
- [ ] `arc402 status` uses `StatusCard`
- [ ] `discover` uses `DiscoverList`
- [ ] `hire` uses `HireCard`
- [ ] `agreements` uses `AgreementList`
- [ ] `compute` uses `ComputeCard`
- [ ] `subscribe` uses `SubscribeCard`
- [ ] arena flows use `RoundsList` / `SquadCard`
- [ ] `workroom status` uses `WorkroomCard`
- [ ] subprocess-inside-TUI anti-pattern audited and removed from flagship commands

### Acceptance criteria
- [ ] `arc402 status` no longer bricks
- [ ] command outputs render inline in TUI mode
- [ ] no flagship command falls back to ugly utility output while claiming completion
- [ ] `--json` behavior remains clean and non-decorative

### Forge review gate
- [ ] command wiring matches phase intent
- [ ] no hidden subprocess recursion
- [ ] no TUI-only hacks that break non-TUI mode

### Lego manual review
- [ ] status / discover / hire flow feels premium in a real terminal

---

## Phase 4 — Commerce Shell (`arc402 chat`)
**Goal:** turn `arc402 chat` into the actual commerce shell.

### Deliverables
- [ ] coherent `ChatSession` / shell session model
- [ ] harness-aware adapter design
- [ ] wallet / network / trust / agreement context injection
- [ ] ARC-402 tool registry exposed cleanly to the shell
- [ ] shell UI feels aligned with the commerce render system

### Acceptance criteria
- [ ] `arc402 chat` feels like an intentional product surface
- [ ] commerce context materially improves the session
- [ ] shell experience is coherent under real use
- [ ] scope is kept under control; no runaway platform sprawl

### Forge review gate
- [ ] architecture is clean
- [ ] shell is not overfit to one demo path only
- [ ] context injection is useful, not noisy

### Lego manual review
- [ ] first real `arc402 chat` session feels like the flagship behavior

---

## Phase 5 — Live Event UX
**Goal:** make ARC-402 feel alive in the terminal.

### Deliverables
- [ ] live event stream path exists
- [ ] CLI/TUI event feed exists
- [ ] event categories defined cleanly
- [ ] agreement / compute / arena activity rendered in real time

### Acceptance criteria
- [ ] event feed feels like signal, not logs
- [ ] event vocabulary is coherent
- [ ] event stream works without subprocess hacks

### Forge review gate
- [ ] event schema is sane
- [ ] UX is useful and readable
- [ ] live feed does not pollute normal shell behavior

### Lego manual review
- [ ] the event stream feels premium, not noisy

---

## Phase 6 — Acceptance, Refinement, and Claim Audit
**Goal:** prove the thing is actually done.

### Deliverables
- [ ] full resize walkthrough
- [ ] command-by-command visual QA
- [ ] real terminal walkthrough
- [ ] refinement pass from real use
- [ ] explicit comparison against landing-page ambition
- [ ] explicit comparison against “better than Claude Code” claim

### Acceptance criteria
- [ ] shell survives real use cleanly
- [ ] no obvious layout lies remain
- [ ] no placeholder-grade flagship flows remain
- [ ] the CLI now feels like the living version of the landing-page terminal vision

### Forge review gate
- [ ] final audit written
- [ ] remaining gaps explicitly listed if any still exist
- [ ] no false-complete claim

### Lego manual review
- [ ] you sign off that this is worthy
- [ ] you decide whether “better than Claude Code” has been earned

---

# Ownership Model

## Forge owns
- architecture guardrails
- reference-pattern definition
- review gate enforcement
- spec-vs-reality truth checks
- final acceptance framing

## Claude Code owns
- implementation of each phase
- broad multi-file execution
- iterative fixes inside phase guardrails
- code-level completion of the planned lane

---

# Risks / Failure Modes

- [ ] **Cosmetic drift:** pretty components built on broken layout foundation
- [ ] **Scope explosion:** `arc402 chat` grows into endless platform work
- [ ] **Renderer inconsistency:** components feel fragmented
- [ ] **Subprocess anti-pattern recurrence:** hidden bricking remains in other commands
- [ ] **Live event feed becomes noisy logs**
- [ ] **Acceptance skipped again:** false-complete risk returns

---

# Claude Code Prompt Pack

> **Important execution rule for every phase:**
> - Build only the scope for that phase.
> - Do not silently spill into later phases.
> - Keep non-TUI / JSON behavior correct.
> - Prefer explicit, typed renderers over ad hoc output.
> - Do not claim completion unless the phase acceptance criteria are satisfied.

---

## Prompt 1 — Phase 1: Shell Foundation

```text
You are implementing Phase 1 of the ARC-402 Spec 46 UX Completion lane.

Repo root:
/home/lego/.openclaw/workspace-engineering/products/arc-402

Primary spec:
/home/lego/.openclaw/workspace-engineering/products/arc-402/spec/46-universal-commerce-harness.md

Tracking doc:
/home/lego/.openclaw/workspace-engineering/products/arc-402/docs/spec46-ux-completion-plan.md

Goal:
Make the TUI shell structurally honest and resize-safe.

Current known issues:
- `HEADER_ROWS = 15` is hardcoded in App.tsx and Viewport.tsx
- terminal resize is not wired properly
- header height is guessed, not measured
- viewport sizing is therefore fragile and misaligned with the spec

Phase 1 deliverables:
1. Add a real terminal size hook (`useTerminalSize.ts`) or equivalent reactive sizing mechanism
2. Remove hardcoded header sizing from active shell layout logic
3. Measure header height properly
4. Pass real layout dimensions from App to Viewport
5. Preserve scroll behavior or improve it if needed
6. Make resize behavior stable in real terminal use

Likely files:
- packages/arc402-cli/src/tui/App.tsx
- packages/arc402-cli/src/tui/Viewport.tsx
- packages/arc402-cli/src/tui/Header.tsx
- packages/arc402-cli/src/tui/useScroll.ts
- packages/arc402-cli/src/tui/useTerminalSize.ts (new)

Hard constraints:
- Do not start Phase 2 renderer work
- Do not build new commerce cards in this phase
- Do not change product scope beyond shell layout correctness
- Keep non-TUI behavior intact
- If measurement APIs need a safe fallback, implement one consciously

Acceptance target:
- no hardcoded HEADER_ROWS in active layout logic
- resize-safe viewport
- no header/viewport jump
- layout stable under narrow/wide terminal sizes

Output required at end:
- summary of what changed
- exact files changed
- any follow-up risks
- note whether acceptance criteria appear satisfied
```

---

## Prompt 2 — Phase 2: Commerce Renderer Layer

```text
You are implementing Phase 2 of the ARC-402 Spec 46 UX Completion lane.

Repo root:
/home/lego/.openclaw/workspace-engineering/products/arc-402

Primary spec:
/home/lego/.openclaw/workspace-engineering/products/arc-402/spec/46-universal-commerce-harness.md

Tracking doc:
/home/lego/.openclaw/workspace-engineering/products/arc-402/docs/spec46-ux-completion-plan.md

Goal:
Build the command-specific commerce renderer layer promised by Spec 46.

Required components:
- StatusCard
- HireCard
- DiscoverList
- AgreementList
- ComputeCard
- SubscribeCard
- RoundsList
- SquadCard
- WorkroomCard

Recommended target folder:
- packages/arc402-cli/src/tui/components/commerce/

Requirements:
- typed props for each component
- shared visual language
- consistent status/color semantics
- terminal-native hierarchy and spacing
- components should be reusable by command integrations in the next phase

Hard constraints:
- Do not wire all commands yet unless minimal test wiring is necessary
- Do not start full command integration phase
- Do not start `arc402 chat` work
- Do not build live event feed work

Focus:
- create the renderer system cleanly
- treat this as a domain component layer, not random UI snippets
- align tone and structure with the landing-page terminal ambition where possible inside terminal constraints

Output required at end:
- list of all new components
- props/interfaces for each
- shared rendering conventions used
- any uncertainties that should be reviewed before command integration
```

---

## Prompt 3 — Phase 3: Command Integration + Status De-Brickification

```text
You are implementing Phase 3 of the ARC-402 Spec 46 UX Completion lane.

Repo root:
/home/lego/.openclaw/workspace-engineering/products/arc-402

Primary spec:
/home/lego/.openclaw/workspace-engineering/products/arc-402/spec/46-universal-commerce-harness.md

Tracking doc:
/home/lego/.openclaw/workspace-engineering/products/arc-402/docs/spec46-ux-completion-plan.md

Goal:
Wire the commerce renderer components into real command flows and eliminate the subprocess-inside-TUI failure pattern.

Required command integrations:
- `arc402 status` -> StatusCard
- `discover` -> DiscoverList
- `hire` -> HireCard
- `agreements` -> AgreementList
- `compute` surfaces -> ComputeCard
- `subscribe` surfaces -> SubscribeCard
- arena surfaces -> RoundsList / SquadCard
- `workroom status` -> WorkroomCard

Critical bug to fix:
- `arc402 status` should render inline in TUI mode and must not brick or spawn recursive TUI subprocess behavior

Requirements:
- TUI mode uses structured rendering
- JSON mode remains clean and undecorated
- non-TUI mode remains functional
- audit for subprocess-in-TUI anti-patterns in related flagship commands

Hard constraints:
- Do not start full `arc402 chat` shell work
- Do not start live event feed work
- Stay focused on command integration and de-bricking

Output required at end:
- list of integrated commands
- explanation of how TUI vs non-TUI vs JSON behavior now works
- note any remaining commands still using legacy output patterns
```

---

## Prompt 4 — Phase 4: Commerce Shell (`arc402 chat`)

```text
You are implementing Phase 4 of the ARC-402 Spec 46 UX Completion lane.

Repo root:
/home/lego/.openclaw/workspace-engineering/products/arc-402

Primary spec:
/home/lego/.openclaw/workspace-engineering/products/arc-402/spec/46-universal-commerce-harness.md

Tracking doc:
/home/lego/.openclaw/workspace-engineering/products/arc-402/docs/spec46-ux-completion-plan.md

Goal:
Turn `arc402 chat` into a real commerce shell instead of a partial stub.

Desired qualities:
- coherent shell/session model
- harness-aware architecture
- wallet / trust / agreement / workroom context injection
- ARC-402 tool awareness
- visually aligned with the TUI commerce shell

Requirements:
- improve `arc402 chat` meaningfully as a product surface
- keep scope controlled
- avoid turning this phase into an endless platform rewrite
- prefer a strong, clean first implementation over overextended harness sprawl

Hard constraints:
- Do not start live event feed work in this phase
- Do not silently redesign unrelated CLI systems
- Keep compatibility with existing command architecture where reasonable

Output required at end:
- architecture summary for the shell/session model
- files changed
- what harness/context behavior is now actually supported
- what remains intentionally deferred, if anything
```

---

## Prompt 5 — Phase 5: Live Event UX

```text
You are implementing Phase 5 of the ARC-402 Spec 46 UX Completion lane.

Repo root:
/home/lego/.openclaw/workspace-engineering/products/arc-402

Primary spec:
/home/lego/.openclaw/workspace-engineering/products/arc-402/spec/46-universal-commerce-harness.md

Tracking doc:
/home/lego/.openclaw/workspace-engineering/products/arc-402/docs/spec46-ux-completion-plan.md

Goal:
Add the live protocol/event UX that makes ARC-402 feel alive in the terminal.

Desired surface:
- event stream path
- CLI/TUI event feed
- coherent event categories
- readable real-time agreement / compute / arena activity

Requirements:
- event feed should feel like signal, not raw logs
- avoid subprocess hacks
- avoid noisy spammy rendering
- maintain compatibility with the existing daemon/CLI split

Hard constraints:
- Do not reopen earlier phase architecture unless absolutely necessary
- If daemon changes are needed, keep them tightly scoped to event streaming and consumption

Output required at end:
- event model summary
- files changed
- categories/events now supported
- UX notes about how noise was controlled
```

---

## Prompt 6 — Phase 6: Acceptance, Refinement, and Claim Audit

```text
You are implementing Phase 6 of the ARC-402 Spec 46 UX Completion lane.

Repo root:
/home/lego/.openclaw/workspace-engineering/products/arc-402

Primary spec:
/home/lego/.openclaw/workspace-engineering/products/arc-402/spec/46-universal-commerce-harness.md

Tracking doc:
/home/lego/.openclaw/workspace-engineering/products/arc-402/docs/spec46-ux-completion-plan.md

Goal:
Do the final acceptance/refinement pass and produce a truthful completion audit.

Tasks:
- review the shell against the tracking doc acceptance criteria
- refine rough edges discovered from real usage
- document what is truly complete
- document what is still not at the intended level if any gaps remain
- do not produce a false-complete narrative

Important:
- the bar is not “code exists”
- the bar is that the CLI now feels like the living version of the landing-page terminal ambition
- if “better than Claude Code” is not earned, say so plainly

Output required at end:
- final audit summary
- refined gap list if anything remains
- statement of whether the Spec 46 UX ambition is now truthfully complete
- explicit note of what must still be reviewed manually by Lego
```

---

# Forge Review Checklist (Use After Every Phase)

## Phase review questions
- [ ] Did the implementation actually satisfy the phase goal?
- [ ] Did Claude Code stay within scope?
- [ ] Did the work preserve product coherence?
- [ ] Was any false-complete language used?
- [ ] Were non-TUI and JSON behaviors preserved where required?
- [ ] Is the next phase still the right next phase, or did reality change?

---

# Lego Manual Signoff Checklist

Use this before declaring the lane complete.

## Product feel
- [ ] This feels like ARC-402, not a generic CLI skin
- [ ] The shell feels aligned with the landing-page terminal vision
- [ ] The visual hierarchy feels premium

## Real usage
- [ ] Resize behavior feels stable in my real terminal
- [ ] Status / discover / hire feels good under real use
- [ ] `arc402 chat` feels worthy as a flagship shell
- [ ] Event feed feels useful and premium

## Final claim
- [ ] I agree this lane is truly complete
- [ ] I agree the experience now earns the claims we want to make publicly

---

# Progress Log

## 2026-04-02
- [x] Execution plan written into document form
- [x] Phase tracker created
- [x] Claude Code prompt pack created for all 6 phases
- [x] Phase 1 launched
- [x] Phase 1 reviewed
- [x] Phase 2 launched
- [x] Phase 2 reviewed
- [ ] Phase 3 launched
- [ ] Phase 3 reviewed
- [ ] Phase 4 launched
- [ ] Phase 4 reviewed
- [ ] Phase 5 launched
- [ ] Phase 5 reviewed
- [ ] Phase 6 launched
- [ ] Final signoff complete
