# Ink 6 UX Enhancement Spec

## Context
CLI is now on Ink 6 + React 19 + ESM. The WalletConnect native component exists.
This spec covers ALL remaining Ink 6 UX capabilities to build before the article demo.

## Current TUI Architecture
```
src/tui/
├── App.tsx              — Root component, layout, command dispatch
├── Header.tsx           — ASCII banner + network/wallet/balance
├── Viewport.tsx         — Scrollable output buffer
├── InputLine.tsx        — Text input with history + tab completion
├── Footer.tsx           — Footer wrapper
├── WalletConnectPairing.tsx — Native WC QR + status (new from Phase 3)
├── index.tsx            — TUI launcher
├── useCommand.ts        — Command dispatch (in-process + child process)
├── useChat.ts           — Chat gateway integration
└── useScroll.ts         — Viewport scroll state
```

---

## Feature 1: Full-Screen Mode

### What
Use Ink 6's `fullScreen` option on `render()` to use the alternate screen buffer.

### Why
- Clean entry: terminal history preserved, TUI gets a blank canvas
- Clean exit: original terminal content restored
- Proper resize: Ink reflows on SIGWINCH in full-screen mode
- No visual artifacts from previous commands bleeding into the TUI

### Implementation
In `src/tui/index.tsx`, change the render call:
```tsx
const { waitUntilExit } = render(<App ... />, { 
  exitOnCtrlC: true,
});
```
Ink 6's `render()` supports a second options argument. Check if `fullScreen` is a boolean option or if it's handled via `<Box height="100%">` with the alternate buffer.

If Ink 6 doesn't have a built-in fullScreen option, implement manually:
```tsx
// Enter alternate buffer
process.stdout.write('\x1b[?1049h');
// ... render ...
// On exit, restore
process.stdout.write('\x1b[?1049l');
```

### Files to change
- `src/tui/index.tsx` — add alternate screen buffer enter/exit

---

## Feature 2: Static Banner with `<Static>`

### What
Wrap the ASCII art banner in Ink's `<Static>` component so it renders once and never re-renders.

### Why
- The banner is ~12 lines of ASCII art that NEVER changes after launch
- Currently re-renders on every state change (output buffer update, scroll, input change)
- `<Static>` renders items once above the dynamic area — perfect for the banner

### Implementation
In `App.tsx`, replace the `<Header>` component with a `<Static>` block:
```tsx
import { Static } from "ink";

// Banner lines computed once
const [bannerItems] = useState(() => getBannerLines({ network, wallet, balance }));

return (
  <Box flexDirection="column" height="100%">
    <Static items={bannerItems}>
      {(line, i) => <Text key={i}>{line}</Text>}
    </Static>
    <Text>{separator}</Text>
    <Viewport ... />
    <Text>{separator}</Text>
    <InputLine ... />
  </Box>
);
```

### Files to change
- `src/tui/App.tsx` — use `<Static>` for banner
- `src/tui/Header.tsx` — may become unnecessary (inline into App)

---

## Feature 3: Spinner Components for Deploy Ceremony

### What
Create reusable `<StepSpinner>` and `<StepComplete>` components for multi-step flows.

### Why
The deploy + onboarding ceremony has 8+ sequential steps. Each should show:
- `◈ Step 3/8 — Setting guardian...` (spinning) while in progress
- `✓ Step 3/8 — Guardian set` (static) when done
- `✗ Step 3/8 — Failed: reason` (static) on error

### Implementation
Create `src/tui/components/StepSpinner.tsx`:
```tsx
interface StepSpinnerProps {
  step: number;
  total: number;
  label: string;
  status: "pending" | "running" | "done" | "error";
  detail?: string;  // e.g. tx hash, address
  error?: string;
}
```

Uses Ink's built-in spinner frames (or a simple `◈ ◇ ◆ ◈` cycle):
```
 ◈ Step 1/8 — Deploying wallet...
 ✓ Step 1/8 — Wallet deployed
   └ 0xA34B...a5dc
 ◈ Step 2/8 — Authorizing machine key...
```

Create `src/tui/components/CeremonyView.tsx`:
A container that manages the step list and renders each StepSpinner.
```tsx
interface CeremonyStep {
  label: string;
  status: "pending" | "running" | "done" | "error";
  detail?: string;
  error?: string;
}

interface CeremonyViewProps {
  title: string;
  steps: CeremonyStep[];
}
```

### Files to create
- `src/tui/components/StepSpinner.tsx`
- `src/tui/components/CeremonyView.tsx`

### Integration
Wire into `useCommand.ts` — when `wallet deploy` runs, instead of spawning a child process, render `<CeremonyView>` in the viewport with steps updating via React state.

---

## Feature 4: Focus Management (`useFocus` / `useFocusManager`)

### What
Tab-navigable interactive elements in the TUI.

### Why
- Deploy wizard: Tab between "Confirm" / "Cancel" / "Change settings"
- WalletConnect: Tab between QR display and wallet link list
- Any confirmation prompt: focus on Yes/No buttons

### Implementation
Create `src/tui/components/Button.tsx`:
```tsx
interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: "primary" | "danger" | "dim";
}

function Button({ label, onPress, variant = "primary" }: ButtonProps) {
  const { isFocused } = useFocus();
  return (
    <Box>
      <Text 
        color={isFocused ? "cyan" : "white"}
        bold={isFocused}
      >
        {isFocused ? "▸ " : "  "}{label}
      </Text>
    </Box>
  );
}
```

Create `src/tui/components/ConfirmPrompt.tsx`:
```tsx
interface ConfirmPromptProps {
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}
```
Renders two focusable buttons. Enter on focused button triggers action.

### Files to create
- `src/tui/components/Button.tsx`
- `src/tui/components/ConfirmPrompt.tsx`

---

## Feature 5: Enhanced Input (useInput)

### What
Better keyboard handling in the TUI.

### Why
- Ctrl+C: graceful shutdown (cleanup WC sessions, save state)
- Ctrl+L: clear viewport (like terminal clear)
- Page Up/Down: fast viewport scrolling
- Escape: cancel current operation / close prompts

### Implementation
In `App.tsx`, add a top-level `useInput` handler:
```tsx
useInput((input, key) => {
  if (key.ctrl && input === 'l') {
    setOutputBuffer([]);
    return;
  }
  if (key.pageUp) {
    scrollUp(viewportHeight);
    return;
  }
  if (key.pageDown) {
    scrollDown(viewportHeight);
    return;
  }
  if (key.escape) {
    // Cancel current operation if any
    return;
  }
});
```

### Files to change
- `src/tui/App.tsx` — add useInput handler
- `src/tui/useScroll.ts` — expose page-size scroll functions

---

## Feature 6: FlexWrap for Status Bar

### What
Use `flexWrap="wrap"` on the header status info so it wraps on narrow terminals.

### Why
`Network   Base Mainnet    Wallet   0xa9e0...83bE    Balance   0.0042 ETH`
On a narrow terminal this truncates. With flexWrap it becomes:
```
Network   Base Mainnet
Wallet    0xa9e0...83bE
Balance   0.0042 ETH
```

### Implementation
In the banner/header, wrap status items in a `<Box flexWrap="wrap">`:
```tsx
<Box flexWrap="wrap" columnGap={2}>
  <Box><Text dimColor>Network</Text><Text>  {network}</Text></Box>
  <Box><Text dimColor>Wallet</Text><Text>  {wallet}</Text></Box>
  <Box><Text dimColor>Balance</Text><Text>  {balance}</Text></Box>
</Box>
```

### Files to change
- `src/ui/banner.ts` — return structured data instead of pre-formatted strings
- `src/tui/Header.tsx` — use flexWrap Box layout

---

## Feature 7: Notification Toasts

### What
Non-blocking notifications that appear briefly in the TUI when background events occur.

### Why
When the daemon is running and receives a hire request, dispute, or payment — show it.

### Implementation
Create `src/tui/components/Toast.tsx`:
```tsx
interface ToastProps {
  message: string;
  variant: "info" | "success" | "warning" | "error";
  duration?: number;  // ms, default 5000
}
```

Create `src/tui/useNotifications.ts`:
```tsx
function useNotifications() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = (toast: Omit<Toast, "id">) => { ... };
  const dismiss = (id: string) => { ... };
  return { toasts, push, dismiss };
}
```

Toasts render in a fixed position above the input line, auto-dismiss after duration.

### Files to create
- `src/tui/components/Toast.tsx`
- `src/tui/useNotifications.ts`

### Integration
The daemon WebSocket connection (if running) emits events → push toast.

---

## Feature 8: Tab-Completion Dropdown

### What
Show a dropdown list of completion candidates when Tab is pressed.

### Why
Current tab completion silently completes in the input. Users don't know what's available.

### Implementation
Create `src/tui/components/CompletionDropdown.tsx`:
```tsx
interface CompletionDropdownProps {
  candidates: string[];
  selectedIndex: number;
  visible: boolean;
}
```

Renders a floating box above the input line showing matching commands:
```
  wallet deploy
  wallet status
  wallet balance
  wallet freeze
◈ arc402 > wallet d_
```

Arrow keys navigate, Tab/Enter selects, Escape dismisses.

### Files to create
- `src/tui/components/CompletionDropdown.tsx`

### Files to change
- `src/tui/InputLine.tsx` — manage dropdown state, render above input

---

## Feature 9: Interactive Tables

### What
Scrollable, selectable table component for list views.

### Why
`discover`, `agreements list`, `wallet list`, `list-machine-keys` all return tabular data.
Currently rendered as plain text. Should be interactive: arrow keys to navigate rows, Enter to drill in.

### Implementation
Create `src/tui/components/InteractiveTable.tsx`:
```tsx
interface Column {
  header: string;
  key: string;
  width?: number;
  align?: "left" | "right";
}

interface InteractiveTableProps {
  columns: Column[];
  rows: Record<string, string>[];
  onSelect?: (row: Record<string, string>, index: number) => void;
  selectedIndex?: number;
}
```

Renders with box-drawing borders for the header row:
```
 Agent              Service      Trust   Endpoint
─────────────────────────────────────────────────
▸ GigaBrain         intelligence  850    gigabrain.arc402.xyz
  CodeReviewer      code.review   720    reviewer.arc402.xyz
  DataOracle        data.feed     690    oracle.arc402.xyz
```

### Files to create
- `src/tui/components/InteractiveTable.tsx`

---

## Feature 10: Split Pane (Future — Post-Launch)

### What
Side-by-side panes: command output left, daemon logs right.

### Why
Power users running the daemon want to see live events while issuing commands.

### Implementation (design only — build post-launch)
Create `src/tui/components/SplitPane.tsx`:
```tsx
interface SplitPaneProps {
  left: React.ReactNode;
  right: React.ReactNode;
  ratio?: number;  // 0.0-1.0, default 0.6
}
```

Uses Ink 6's `<Box width="60%">` + `<Box width="40%">` for the split.

### Files to create (post-launch)
- `src/tui/components/SplitPane.tsx`

---

## Build Order

1. Full-screen mode (Feature 1) — foundational
2. Static banner (Feature 2) — performance
3. Enhanced input / keyboard (Feature 5) — UX basics
4. Spinner components (Feature 3) — deploy ceremony visual
5. Focus management + buttons (Feature 4) — interactive deploy wizard
6. FlexWrap status bar (Feature 6) — responsive layout
7. Tab-completion dropdown (Feature 8) — discoverability
8. Interactive tables (Feature 9) — list views
9. Notification toasts (Feature 7) — daemon integration
10. Split pane (Feature 10) — post-launch

Features 1-8 are for the article demo. Feature 9 is nice-to-have. Feature 10 is post-launch.

---

## Testing Checklist

After build:
- [ ] `arc402` launches in full-screen mode, clean entry
- [ ] Ctrl+C exits cleanly, original terminal restored
- [ ] Ctrl+L clears viewport
- [ ] Page Up/Down scrolls viewport
- [ ] Tab shows completion dropdown
- [ ] `wallet deploy` shows QR inside viewport
- [ ] Deploy ceremony shows step spinners
- [ ] Confirmation prompts are focusable (Tab between buttons)
- [ ] `discover` renders interactive table
- [ ] Narrow terminal: status bar wraps correctly
- [ ] `exit` / `quit` restores terminal cleanly
- [ ] `arc402 wallet status` (one-shot mode) still works outside TUI
- [ ] `arc402 --help` still works
