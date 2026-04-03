# Spec 47 — ARC-402 Premium TUI Renderer
*Status: Specced — not yet built*
*Date: 2026-04-03*
*Owner: Forge (Engineering)*

---

## The Goal

Make the ARC-402 CLI terminal experience better than Claude Code's.

Not "on par." Better.

We have the architectural reference (Kuberwastaken spec `08_ink_terminal.md`), we have the existing component surface (all Phase 2 Ink components from Spec 46), and we have a working baseline (arc402-cli@1.6.5 launches).

The existing TUI has two hard problems:
1. **Keyboard input is unreliable.** The dropdown exists but arrow key selection doesn't work consistently. Tab interception fights with ink-text-input.
2. **Performance is noticeably slow.** No double-buffer. Every render rewrites the full screen. No diff engine.

Spec 47 fixes both at the root. Not patches — proper architecture.

---

## What We're Building

A custom rendering layer that lives inside `packages/arc402-cli/src/renderer/`. The existing React components (`StatusCard`, `HireCard`, `CompletionDropdown`, etc.) are preserved — just the engine beneath them changes.

The architecture Claude Code built (from the Kuberwastaken spec):

```
React tree
    → React Reconciler (custom)
    → Virtual DOM (dom.ts)
    → Yoga layout engine
    → Screen cell buffer (front frame + back frame)
    → Diff engine (compare frames, emit only changed cells)
    → Patch optimizer (merge adjacent changes)
    → Terminal write (ANSI sequences to stdout)
```

We build the same pipeline. This is not a fork of ink — it's a clean implementation of the same architecture.

---

## Architecture

### Layer 1 — Screen Cell Model

```typescript
// src/renderer/cell.ts
interface Cell {
  char: string;       // single character
  fg: Color | null;   // foreground color (RGB or named)
  bg: Color | null;   // background color
  bold: boolean;
  dim: boolean;
  italic: boolean;
  underline: boolean;
}

// A frame is rows × cols of cells
type Frame = Cell[][];
```

Every position on the terminal is a `Cell`. Two frames live in memory at all times: `frontFrame` (what the terminal currently shows) and `backFrame` (what we want it to show after the next render).

### Layer 2 — Diff Engine

```typescript
// src/renderer/diff.ts
interface Patch {
  row: number;
  col: number;
  cells: Cell[];  // consecutive cells to write
}

function diff(front: Frame, back: Frame): Patch[]
```

Compare front vs back frame cell-by-cell. Emit patches for changed runs. The optimizer merges adjacent changed cells so we write one ANSI sequence instead of N.

### Layer 3 — Render Loop

```typescript
// src/renderer/loop.ts
const FRAME_INTERVAL_MS = 16;  // ~60fps

function scheduleRender(): void {
  // Throttled: leading + trailing, deferred via queueMicrotask
  // Identical to Claude Code's approach
}
```

### Layer 4 — Input System

```typescript
// src/renderer/input.ts
type KeyEvent = {
  key: 'tab' | 'shift-tab' | 'enter' | 'escape' | 
       'up' | 'down' | 'left' | 'right' | 
       'pgup' | 'pgdn' | 'ctrl-c' | 'backspace' | 'char';
  char?: string;  // when key === 'char'
};
```

Raw stdin mode. We parse ANSI escape sequences ourselves (`\x1b[A` = up, `\x1b[B` = down, `\t` = tab, etc.). No library interception. This is why Claude Code's keyboard handling is bulletproof.

### Layer 5 — Alt-Screen

```typescript
// src/renderer/screen.ts
const ENTER_ALT_SCREEN = '\x1b[?1049h';
const EXIT_ALT_SCREEN  = '\x1b[?1049l';
const HIDE_CURSOR      = '\x1b[?25l';
const SHOW_CURSOR      = '\x1b[?25h';
const SYNCHRONIZED_OUTPUT_BEGIN = '\x1b[?2026h';
const SYNCHRONIZED_OUTPUT_END   = '\x1b[?2026l';
```

On TUI launch: enter alt-screen, hide cursor. On exit: restore. The terminal is ours for the duration. Synchronized output (BSU/ESU) prevents flickering during frame writes.

### Layer 6 — Yoga Layout

```typescript
// src/renderer/layout.ts
import { Node as YogaNode } from 'yoga-layout-prebuilt';

// Walk React virtual DOM, build Yoga node tree, calculate layout
// Map computed positions/sizes to screen coordinates
// Render each component into the cell buffer at its calculated position
```

We use `yoga-layout-prebuilt` (same as the original ink) — it's a pure JS Yoga build, no native addon. Our `Box` and `Text` primitives call into this.

### Layer 7 — React Reconciler

```typescript
// src/renderer/reconciler.ts
import { createReconciler } from 'react-reconciler';

// Our host config: creates DOM nodes that map to the cell model
// When React commits, we write to the backFrame and schedule render
```

This is the bridge between React component state and our cell buffer. Same pattern as ink's `reconciler.ts`.

### Layer 8 — Design System

```typescript
// src/renderer/theme.ts
export const theme = {
  colors: {
    primary:    '#22d3ee',  // ARC-402 cyan
    secondary:  '#94a3b8',  // slate
    success:    '#4ade80',  // green
    warning:    '#fbbf24',  // amber
    danger:     '#f87171',  // red
    dim:        '#475569',  // muted
    background: null,       // terminal default
  },
  
  components: {
    header:     { fg: 'primary', bold: true },
    label:      { fg: 'secondary' },
    value:      { fg: null },          // terminal default
    badge:      { fg: 'background', bg: 'primary', bold: true },
    separator:  { fg: 'dim' },
    prompt:     { fg: 'primary', bold: true },
    cursor:     { fg: 'background', bg: 'primary' },
  }
};
```

Every component uses `theme.colors.*` — no hardcoded chalk calls.

---

## Build Phases

### Phase 1 — Cell model + diff engine + render loop
**Deliverables:**
- `src/renderer/cell.ts` — Cell type, Frame type, blank frame creation
- `src/renderer/diff.ts` — diff() + optimize() producing Patch[]
- `src/renderer/terminal.ts` — serialize Patch[] to ANSI, write to stdout
- `src/renderer/loop.ts` — 16ms throttled render loop

**Test:** unit tests for diff engine (blank→content, content→blank, partial change)

**Does NOT include:** React, Yoga, components. Just the rendering pipeline.

### Phase 2 — Input system
**Deliverables:**
- `src/renderer/input.ts` — raw stdin mode, ANSI sequence parser, KeyEvent emitter
- Full key table: tab, shift-tab, enter, escape, arrows, pgup/pgdn, ctrl-c, printable chars

**Test:** `node -e "require('./dist/renderer/input').startListening(); process.stdin.resume()"` — press keys, see parsed events

**This is what fixes the dropdown.** Once input is ours, arrow keys work everywhere.

### Phase 3 — Alt-screen + layout engine
**Deliverables:**
- `src/renderer/screen.ts` — alt-screen enter/exit, cursor hide/show, synchronized output
- `src/renderer/layout.ts` — Yoga integration, position computation, frame writing

**Test:** `arc402` launches in alt-screen. Resize triggers clean repaint. Exit restores terminal.

### Phase 4 — React reconciler
**Deliverables:**
- `src/renderer/reconciler.ts` — react-reconciler host config for our DOM
- `src/renderer/dom.ts` — virtual DOM node types (container, box, text)
- `src/renderer/ink.ts` — public API: `render()`, `createRoot()`, `Box`, `Text`, primitives

**Test:** render a simple `<Box><Text>Hello ARC-402</Text></Box>` in alt-screen

### Phase 5 — Design system
**Deliverables:**
- `src/renderer/theme.ts` — color tokens + component styles
- `src/renderer/ThemedBox.tsx` — Box with theme awareness
- `src/renderer/ThemedText.tsx` — Text with theme awareness
- `src/renderer/ThemeProvider.tsx` — React context

**Test:** all components use theme tokens, not hardcoded colors

### Phase 6 — Migrate existing TUI components
**Deliverables:**
- Swap ink@3 imports → our renderer in all `src/tui/**` files
- `StatusCard`, `HireCard`, `DiscoverList`, etc. use `ThemedBox`/`ThemedText`
- `CompletionDropdown` uses new input system (actually works)
- `InputLine` uses raw input (Tab/arrows reliable)

**Test:** Full TUI walkthrough — dropdown, hire flow, discover, status

### Phase 7 — Advanced features (post-baseline)
- Text selection (SelectionState + cell inversion)
- Search highlighting (pre-scanned match positions)
- Mouse tracking (click to focus, scroll wheel)
- Scrollable cards (per-card internal scroll, not just viewport)

---

## Files Created

```
packages/arc402-cli/src/renderer/
  cell.ts           ← Cell model, Frame type
  diff.ts           ← diff() + optimize()
  terminal.ts       ← ANSI serialization, stdout write
  loop.ts           ← 16ms render loop
  input.ts          ← raw stdin, key event parser
  screen.ts         ← alt-screen, cursor, synchronized output
  layout.ts         ← Yoga integration
  reconciler.ts     ← react-reconciler host config
  dom.ts            ← virtual DOM node types
  theme.ts          ← design system tokens
  ThemedBox.tsx     ← themed Box primitive
  ThemedText.tsx    ← themed Text primitive
  ThemeProvider.tsx ← React context
  index.ts          ← public API (replaces ink imports)
```

Existing `src/tui/**` components are unchanged in structure — imports swap from `ink` to `../renderer`.

---

## Dependencies

**New:**
- `react-reconciler` — already in ink's deps, we use directly
- `yoga-layout-prebuilt` — pure JS, no native addon (already used by ink)

**Removed:**
- `ink@3.2.0` — replaced by our renderer
- `ink-text-input@4.0.3` — replaced by our `InputLine` using raw input

**No new peer deps.** React@18 stays.

---

## Acceptance Criteria

- [ ] `arc402` launches in alt-screen — full terminal takeover
- [ ] Arrow keys cycle through completion dropdown reliably
- [ ] Enter selects a completion
- [ ] Tab also selects
- [ ] Esc dismisses dropdown
- [ ] Resize triggers clean repaint — no flicker, no jump
- [ ] 60fps render loop — commands feel instantaneous
- [ ] Commerce components render with consistent ARC-402 visual language
- [ ] `arc402 hire` interactive flow works end-to-end in TUI
- [ ] `arc402 chat` harness dispatch works
- [ ] Exit restores terminal cleanly
- [ ] Lego signs off: "this is better than Claude Code"

---

## What This Is NOT

- Not a rewrite of CLI commands
- Not touching daemon, contracts, SDK, workroom
- Not changing component APIs (props stay the same)
- Not a fork of ink — a clean implementation of the same architecture

---

## Version

Ships as `arc402-cli@2.0.0` — the renderer is a major architectural change.
Daemon stays at `@arc402/daemon@0.9.x` — no changes to daemon.

---

*Build sequence: Phase 1 → 2 → 3 → 4 (can be parallel after Phase 1) → 5 → 6 → 7*
*Sub-agents: Phase 1-4 are each independently buildable by one sub-agent.*
