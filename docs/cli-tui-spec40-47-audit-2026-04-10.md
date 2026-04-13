# ARC-402 CLI/TUI Audit — Specs 40–47
*Date: 2026-04-10*
*Auditor: Forge*
*Scope: `packages/arc402-cli/src/tui/**`, `src/renderer/**`, chat shell, worker routing surfaces, daemon event UX surfaces used by the TUI*

---

## Executive Verdict

The ARC-402 CLI/TUI is now **substantially healthier and releaseable for the repaired surfaces**, but it is **not fully complete against the total ambition claimed by Specs 40–47**.

What is now true:
- the TUI launches, renders in ARC cyan, and exits cleanly
- OpenClaw routing is fixed
- chat mode no longer steals valid operator commands
- daemon live event UX is actually wired
- header/viewport ANSI rendering is repaired
- builds and package tests are green

What is not yet honest to claim:
- full Spec 47 theming migration
- true measured multiline viewport behavior
- full premium component coverage promised by Spec 46
- full WalletConnect-in-TUI completion implied by Spec 41 + Spec 46/47 ambitions
- exhaustive TUI integration/E2E coverage

---

## Verification Performed

### Automated
- `packages/arc402-cli`: `npm run build` ✅
- `packages/arc402-cli`: `npm test` ✅ (46 passing)
- `packages/arc402-daemon`: `npm run build` ✅
- `packages/arc402-daemon`: `npm test` ✅ (6 passing)

### Manual / interactive
- TUI launch smoke test in PTY ✅
- TUI quit path verified ✅
- ARC banner color visually restored via ANSI-aware rendering path ✅

---

## Cross-Spec Findings

### Fixed during this audit
1. **OpenClaw model formatting bug**
   - invalid fallback / legacy model strings were still being emitted
   - fixed to normalize to `openclaw` or `openclaw/<agentId>`

2. **ASCII/banner + viewport color regression**
   - renderer was flattening ANSI/chalk styling to white
   - fixed with ANSI-aware renderer component (`AnsiTextLine`) and color resolution support

3. **Chat-mode operator command misrouting**
   - valid commands like `wallet`, `daemon`, `doctor`, `agent`, `compute` could be routed into chat while chat mode was active
   - fixed by using full top-level command catalog for command detection

4. **Live daemon events were only half-implemented**
   - TUI hook existed, but daemon-side `/events` stream was missing/incomplete
   - fixed by exposing SSE stream and emitting lifecycle events used by the TUI

5. **Unsupported color token drift**
   - some UI code used `gray`, which the renderer does not support
   - replaced with supported ARC palette tone `slate`

6. **Internal implementation copy leaking into product UI**
   - removed artifact text like “Structured for inline TUI status rendering in Phase 3”

---

## Spec-by-Spec Audit

## Spec 40 — Subscription Agreement
**File:** `spec/40-subscription-agreement.md`

### Verified
- `subscribe` / `subscription status` / `subscription list` surfaces exist in the TUI command catalog
- `SubscribeCard` exists and renders typed data
- kernel path supports `subscribe` / `subscription *` read surface routing

### Remaining gaps
- subscription UX is present, but not yet obviously at the full “category-defining” polish level implied by the later shell/TUI specs
- no dedicated interaction/E2E proof from this audit that the full subscription lifecycle feels premium inside the TUI
- no evidence in this audit that subscription renewal / lifecycle transitions are surfaced in a premium live-updating way

### Status
**Partial, functional, not fully proven against ambition**

---

## Spec 41 — Desktop Wallet Connect
**File:** `spec/41-desktop-wallet-connect.md`

### Verified
- `WalletConnectPairing.tsx` exists
- wallet-related command surfaces still exist in the CLI

### Remaining gaps
- WalletConnect pairing is **not yet clearly integrated into the main premium TUI flow**
- no audit proof that the pairing component is actually wired into the dominant operator shell path end-to-end
- no interactive test was completed here proving connection state transitions, QR flow, app links, chain switching, and ready state inside the TUI

### Status
**Partial, exists in code, not fully integrated/proven in the premium shell**

---

## Spec 42 — ARC-402 Plugin
**File:** `spec/42-arc402-plugin.md`

### Verified
- no TUI-blocking plugin regression was found in this audit lane

### Remaining gaps
- this audit was focused on CLI/TUI code, not full plugin runtime verification
- no claim should be made that the plugin UX is fully audited here beyond its CLI/TUI touchpoints

### Status
**Outside primary audit lane, no new CLI/TUI blocker identified**

---

## Spec 43 — Handshake Watcher
**File:** `spec/43-handshake-watcher.md`

### Verified
- daemon/TUI live event UX now emits and receives handshake-related events
- handshake events are now capable of appearing through the TUI event stream rather than being trapped only in daemon internals/logging

### Remaining gaps
- no full user-visible handshake event walkthrough was executed during this audit
- broader notification choreography may still need dedicated acceptance testing

### Status
**Functionally improved and wired, but not fully acceptance-proven**

---

## Spec 43 — Workroom OpenClaw Gateway
**File:** `spec/43-workroom-openclaw-gateway.md`

### Verified
- worker paths now emit valid OpenClaw model values
- TUI/worker routing bug that caused bad gateway `model` values is fixed
- workroom-related TUI status surfaces remain present

### Remaining gaps
- this audit did not run a full hired-task gateway execution from the TUI all the way through deliverable completion
- workroom status remains better than before, but not yet a full live “job status window” experience as later specs envision

### Status
**Core routing fixed, deeper live UX still incomplete**

---

## Spec 44
**File:** not present in the repository at audit time

### Note
No `spec/44-*.md` file was found in the repo during this audit. No checklist can honestly be produced for a missing spec file.

### Status
**Blocked by missing source spec**

---

## Spec 45 — MegaBrain / Arc / AgentOS E2E plan
**File:** `spec/45-megabrain-arc-agentos-e2e-plan.md`

### Verified
- relevant worker and routing surfaces are healthier after this audit
- live daemon events now make protocol activity more observable in the CLI/TUI

### Remaining gaps
- this was not a fresh end-to-end MegaBrain ↔ workroom execution validation run
- no new proof was generated in this audit that the TUI itself fully supports the intended E2E operator experience for this flow

### Status
**Supportive surfaces improved, E2E proof not re-run in this audit**

---

## Spec 46 — Universal Commerce Harness
**File:** `spec/46-universal-commerce-harness.md`

### Verified
- `arc402 chat` exists as the commerce shell path
- harness routing exists for the supported harness family
- command-specific premium surfaces exist for core reads: status, discover, agreements, workroom, subscriptions, arena rounds, squad info
- daemon event UX is now materially real instead of half-wired
- chat-mode command routing bug has been fixed

### Remaining gaps
- full premium coverage promised by the spec is not complete
- the following surfaces still look under-brought-up relative to the spec ambition:
  - compute live cards / real-time billing UX
  - job status live workroom window
  - arena profile / standings / feed premium surfaces
  - broader high-polish shell behavior around all commerce write paths
- the old completion claims in `docs/spec46-ux-completion-plan.md` are too generous relative to the real audited state

### Status
**Partially realized, materially better, not fully complete**

---

## Spec 47 — Premium TUI Renderer
**File:** `spec/47-premium-tui-renderer.md`

### Verified
- custom renderer files exist
- alt-screen, cursor hide/show, synchronized output, raw input parsing, and render loop all exist
- input parsing tests pass
- launch/quit path works in real PTY smoke testing
- ANSI-aware rendering path now restores intended color styling in key shell surfaces

### Remaining gaps
1. **Theming architecture is incomplete**
   - spec requires systematic theme-token usage
   - current TUI still heavily uses raw `Text color=` props and ANSI/chalk bridges
   - `ThemeProvider`, `ThemedText`, and `ThemedBox` exist but are not yet systemic

2. **Viewport measurement is incomplete**
   - typed payload cards are still treated as single logical entries rather than true rendered-height blocks
   - this means multiline/premium-card scroll behavior can still diverge from the intended design

3. **Acceptance criteria are not fully closed**
   - no full proof yet that all premium interactions feel better than Claude Code
   - no comprehensive integration/E2E test layer for the TUI itself

4. **Advanced renderer ambitions remain open**
   - mouse tracking integration into product behavior is not fully realized
   - per-card internal scrolling is not delivered
   - text selection/search-highlight style ambitions are still future work

### Status
**Renderer foundation is real, premium completion is partial**

---

## Remaining Gap Checklist (Actionable)

### P0 — truth/alignment
- [ ] mark prior “Spec 46 complete” claim as superseded by the 2026-04-10 audit reality
- [ ] stop claiming full 40–47 completion until the items below are genuinely closed

### P1 — shell correctness
- [ ] fix viewport accounting for multiline component blocks
- [ ] add a real TUI integration test harness for command entry, dropdown behavior, scroll, and chat mode
- [ ] run a fresh manual acceptance pass for resize, dropdowns, and inline command rendering

### P2 — theme architecture
- [ ] migrate flagship TUI components from raw `Text color=` usage to theme-token-driven `ThemedText`/`ThemedBox`
- [ ] remove remaining non-essential chalk/ANSI bridges from product UI paths
- [ ] add tests that fail if unsupported color names or hardcoded visual drift reappear

### P3 — missing premium command surfaces
- [ ] implement/polish compute live card and session billing UX
- [ ] implement/polish `job status` live workroom window
- [ ] implement/polish arena profile / standings / live feed surfaces
- [ ] verify full premium subscription lifecycle in TUI
- [ ] verify WalletConnect pairing is fully wired in the premium shell path

### P4 — acceptance proof
- [ ] operator walkthrough: status → discover → hire → agreements → chat → workroom → watch
- [ ] wallet-connect walkthrough in TUI
- [ ] compute walkthrough in TUI
- [ ] arena premium surface walkthrough
- [ ] final founder signoff after real terminal use

---

## Recommended Next Order
1. **viewport correctness**
2. **theme-token migration of flagship surfaces**
3. **compute/job/arena premium gaps**
4. **WalletConnect shell proof**
5. **final acceptance walkthrough**

---

## 2026-04-12 Follow-up Closure Work

Additional commits landed after the initial audit:
- `56d0eb8a` — `fix(arc402): account for multiline tui viewport entries`
- `1c432e9a` — `feat(arc402): land premium tui renderer foundation`
- `d3e68a6b` — `feat(arc402): add premium tui routes for compute and arena`
- `3f2a37fc` — `feat(arc402): add premium tui arena feed surface`
- `31908667` — `feat(arc402): add premium tui feed and job status surfaces`

### What these follow-up commits closed
- multiline viewport accounting is now real instead of treating premium cards as single-row ghosts
- the custom renderer, theme primitives, renderer tests, and TUI foundation are now committed instead of stranded in a dirty tree
- the TUI kernel now treats these as first-class premium surfaces:
  - `compute status`
  - `compute sessions`
  - `arena profile`
  - `arena standings`
  - `feed`
  - `job status <agreementId>`
- `arena profile` kernel routing now falls back to the configured wallet when no address is provided, matching normal CLI behavior

### Remaining gaps after the follow-up work
- WalletConnect is operational in command flows but still lacks a fully wired premium-shell pairing flow, despite the presence of `WalletConnectPairing.tsx`
- Final founder acceptance walkthrough is still required before claiming the full design goal is achieved

## Honest Summary

The CLI/TUI is no longer in the “claiming completion while visibly broken” state.
That part is fixed.

But the repo should now speak truth:
- the **foundation is real**
- the **critical regressions were fixed**
- the **premium renderer vision is much closer to real product now**
- Specs 40–47 are **still not fully done** until the remaining checklist above is genuinely closed
