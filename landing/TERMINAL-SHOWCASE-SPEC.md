# Terminal Showcase Animation Spec

## Overview
A scripted terminal animation component for the ARC-402 landing page, article embeds, and GitHub README (as animated SVG).
Not a recording — a React component that renders a fake terminal and plays through a screenplay.

## Architecture

### Component: `<TerminalShowcase>`
```tsx
interface TerminalShowcaseProps {
  screenplay: Scene[];
  autoPlay?: boolean;      // default true
  loop?: boolean;          // default true
  pauseOnHover?: boolean;  // default true
  theme?: "dark" | "light";
  width?: string;          // default "100%"
  height?: string;         // default "500px"
}
```

### Data Model: Screenplay
```tsx
interface Scene {
  id: string;
  title?: string;           // shown as a label above the terminal during this scene
  duration: number;          // ms — total scene duration
  steps: Step[];
}

type Step =
  | { type: "type"; text: string; delay?: number; speed?: number }  // simulate typing
  | { type: "execute"; delay?: number }                              // press Enter
  | { type: "output"; lines: OutputLine[]; delay?: number }          // render output
  | { type: "clear"; delay?: number }                                // clear viewport
  | { type: "cursor-move"; direction: "up" | "down"; count?: number; delay?: number }
  | { type: "tab"; delay?: number }                                  // trigger tab completion
  | { type: "dropdown"; items: string[]; selected: number; delay?: number }
  | { type: "dropdown-navigate"; direction: "up" | "down"; delay?: number }
  | { type: "dropdown-select"; delay?: number }
  | { type: "qr"; delay?: number }                                   // show QR code block
  | { type: "qr-dismiss"; delay?: number }                           // QR disappears
  | { type: "spinner-start"; step: number; total: number; label: string; delay?: number }
  | { type: "spinner-complete"; step: number; detail?: string; delay?: number }
  | { type: "spinner-error"; step: number; error: string; delay?: number }
  | { type: "table"; columns: string[]; rows: string[][]; delay?: number }
  | { type: "table-cursor"; row: number; delay?: number }
  | { type: "toast"; message: string; variant: "info" | "success"; delay?: number }
  | { type: "toast-dismiss"; delay?: number }
  | { type: "tree"; items: TreeItem[]; delay?: number }              // summary tree
  | { type: "pause"; duration: number }                              // hold on current state
  | { type: "transition"; delay?: number }                           // scene fade transition

interface OutputLine {
  text: string;
  color?: string;    // cyan, green, red, dim, white
  indent?: number;
  prefix?: "success" | "error" | "info" | "dim";  // ✓, ✗, ◈, dim
}

interface TreeItem {
  label: string;
  value: string;
  last?: boolean;
}
```

---

## Terminal Chrome

The component renders a terminal window with:
```
┌─────────────────────────────────────────────────────┐
│  ●  ●  ●   ARC-402 — Terminal                      │  ← title bar (macOS dots)
├─────────────────────────────────────────────────────┤
│                                                     │
│  (content area — banner, output, tables, etc.)      │
│                                                     │
│                                                     │
├─────────────────────────────────────────────────────┤
│  ◈ arc402 > _                                       │  ← input line
└─────────────────────────────────────────────────────┘
```

- Dark background (#0d1117 or similar)
- Monospace font (JetBrains Mono, Fira Code, or system monospace)
- Colored text matches actual CLI colors: cyan for ◈, dim for labels, white for values, green for ✓
- Cursor blink animation on the input line
- Typing animation: characters appear one by one with slight random delay (40-80ms per char)

---

## Screenplay: Full Showcase (Landing Page)

### Scene 1: Launch (4s)
**Title: "Install and launch"**
```
Steps:
1. type "npm install -g arc402-cli" speed:fast
2. execute
3. output: ["◈ Installing arc402-cli@0.8.0...", "added 142 packages in 3.2s"] delay:1000
4. clear delay:500
5. type "arc402"
6. execute
7. output: [ASCII banner lines — cyan colored] delay:200
8. output: ["agent-to-agent arcing · v0.8.0"] color:dim
9. output: ["◈ ──────────────────────────────────"] color:dim
10. output: ["Network   Base Mainnet    Wallet   not configured"]
11. pause 1000
```

### Scene 2: Tab Completion (5s)
**Title: "Smart tab completion"**
```
Steps:
1. type "wal" speed:normal
2. pause 400
3. tab
4. dropdown: ["wallet balance", "wallet deploy", "wallet drain", "wallet freeze", "wallet governance setup", "wallet status"] selected:0 delay:300
5. pause 600
6. dropdown-navigate: down delay:200
7. dropdown-navigate: down delay:200  (now on "wallet deploy")
8. pause 400
9. dropdown-select
10. pause 300
```
Input line now shows: `◈ arc402 > wallet deploy`

### Scene 3: Wallet Deploy + QR (8s)
**Title: "Deploy with your phone"**
```
Steps:
1. execute  (Enter on "wallet deploy")
2. spinner-start: step:1 total:8 label:"Connecting wallet..." delay:300
3. output: ["Scan QR or tap a link:"] delay:500
4. qr delay:300
5. output: ["🦊 MetaMask: tap to open"] color:dim delay:100
6. output: ["🌈 Rainbow:  tap to open"] color:dim delay:100
7. output: ["🔵 Trust:    tap to open"] color:dim delay:100
8. pause 2000  (simulating phone scan)
9. qr-dismiss
10. spinner-complete: step:1 detail:"0x7745...c7c00 on Base" delay:300
```

### Scene 4: Deploy Ceremony (8s)
**Title: "Automated onboarding"**
```
Steps:
1. spinner-start: step:2 total:8 label:"Deploying wallet contract..." delay:300
2. pause 800
3. spinner-complete: step:2 detail:"0xA34B...a5dc" delay:200
4. spinner-start: step:3 total:8 label:"Authorizing machine key..." delay:200
5. pause 600
6. spinner-complete: step:3 detail:"0x9f22...8811" delay:200
7. spinner-start: step:4 total:8 label:"Setting guardian..." delay:200
8. pause 600
9. spinner-complete: step:4 detail:"0x5be5...f75F" delay:200
10. spinner-start: step:5 total:8 label:"Configuring policy..." delay:200
11. pause 500
12. spinner-complete: step:5 delay:200
13. spinner-start: step:6 total:8 label:"Registering agent..." delay:200
14. pause 500
15. spinner-complete: step:6 detail:"GigaBrain" delay:200
16. spinner-start: step:7 total:8 label:"Initializing workroom..." delay:200
17. pause 400
18. spinner-complete: step:7 delay:200
19. spinner-start: step:8 total:8 label:"Starting daemon..." delay:200
20. pause 400
21. spinner-complete: step:8 delay:200
22. pause 300
23. output: [""] delay:100
24. output: ["✓ Onboarding complete"] prefix:success color:white delay:300
25. tree: [
      {label:"Wallet", value:"0xA34B...a5dc"},
      {label:"Agent", value:"GigaBrain"},
      {label:"Service", value:"intelligence"},
      {label:"Endpoint", value:"gigabrain.arc402.xyz"},
      {label:"Trust", value:"100", last:true}
    ] delay:200
26. pause 1500
```

### Scene 5: Discover Agents (6s)
**Title: "Find agents to hire"**
```
Steps:
1. clear delay:300
2. type "discover --service intelligence" speed:fast
3. execute
4. pause 500
5. table:
    columns: ["Agent", "Service", "Trust", "Price", "Endpoint"]
    rows: [
      ["GigaBrain", "intelligence", "850", "0.01 ETH", "gigabrain.arc402.xyz"],
      ["CodeReviewer", "code.review", "720", "0.005 ETH", "reviewer.arc402.xyz"],
      ["DataOracle", "data.feed", "690", "0.008 ETH", "oracle.arc402.xyz"],
      ["ResearchBot", "intelligence", "650", "0.003 ETH", "research.arc402.xyz"],
      ["DeepThink", "intelligence", "620", "0.02 ETH", "deepthink.arc402.xyz"]
    ]
    delay:300
6. pause 600
7. table-cursor: row:0 delay:200
8. table-cursor: row:1 delay:400
9. table-cursor: row:2 delay:400
10. table-cursor: row:0 delay:400  (back to GigaBrain)
11. pause 800
```

### Scene 6: Hire + Toast (5s)
**Title: "Hire an agent on-chain"**
```
Steps:
1. type "hire GigaBrain --price 0.01eth" speed:fast
2. execute
3. spinner-start: step:1 total:3 label:"Creating agreement..." delay:300
4. pause 800
5. spinner-complete: step:1 delay:200
6. spinner-start: step:2 total:3 label:"Signing on-chain..." delay:200
7. pause 1000
8. spinner-complete: step:2 delay:200
9. spinner-start: step:3 total:3 label:"Confirming..." delay:200
10. pause 600
11. spinner-complete: step:3 delay:200
12. toast: message:"✓ Agreement #42 signed — GigaBrain hired" variant:success delay:500
13. pause 2000
14. toast-dismiss delay:300
15. transition
```

### Scene 7: End Card (3s)
**Title: null (no label)**
```
Steps:
1. clear
2. output: [""] delay:200
3. output: ["  npm install -g arc402-cli"] color:cyan delay:300
4. output: [""] delay:100
5. output: ["  Autonomous agent commerce."] color:dim delay:200
6. output: ["  On-chain trust. Off-chain speed."] color:dim delay:200
7. output: [""] delay:100
8. output: ["  arc402.xyz"] color:white delay:300
9. pause 2000
10. transition (loops back to Scene 1)
```

---

## Total runtime: ~39 seconds, loops

---

## Surface Adaptations

### Landing Page
- Full screenplay (all 7 scenes)
- Auto-plays, loops, pause on hover
- Full-width terminal chrome with macOS dots
- Scene titles shown as labels above the terminal

### Article Embeds
- Individual scenes as standalone clips
- Scene 3+4: "Onboarding experience" — deploy + ceremony
- Scene 5: "Agent discovery" — discover + table
- Scene 6: "Hiring on-chain" — hire + toast
- Each embed is a smaller `<TerminalShowcase>` with 1-2 scenes, no loop

### GitHub README
- Export Scene 2+3+4 as animated SVG (using svg-term or custom renderer)
- ~15 seconds, loops
- Light enough for GitHub to render inline
- Fallback: static screenshot with "▶ Watch demo" link to landing page

---

## Implementation Plan

### Files to create
```
products/arc-402/landing/src/components/
├── TerminalShowcase.tsx       — main component
├── TerminalChrome.tsx         — window frame (dots, title bar)
├── TerminalInput.tsx          — input line with cursor blink
├── TerminalOutput.tsx         — scrollable output area
├── TerminalQR.tsx             — fake QR code block
├── TerminalTable.tsx          — table renderer
├── TerminalSpinner.tsx        — step spinner
├── TerminalTree.tsx           — summary tree (├ └ lines)
├── TerminalToast.tsx          — notification toast
├── TerminalDropdown.tsx       — tab completion dropdown
├── useScreenplay.ts           — animation state machine + timer
└── screenplays/
    ├── full-showcase.ts       — all 7 scenes (landing page)
    ├── onboarding.ts          — scenes 3+4 (article)
    ├── discovery.ts           — scene 5 (article)
    └── hiring.ts              — scene 6 (article)
```

### Dependencies
- React (already on the landing page)
- Framer Motion or CSS animations for transitions
- No terminal emulator library needed — pure styled divs

### Font
- JetBrains Mono (available via Google Fonts) or Fira Code
- Fallback: `ui-monospace, SFMono-Regular, Menlo, monospace`

---

## Design Tokens

```css
--terminal-bg: #0d1117;
--terminal-fg: #e6edf3;
--terminal-cyan: #58a6ff;
--terminal-green: #3fb950;
--terminal-red: #f85149;
--terminal-dim: #484f58;
--terminal-yellow: #d29922;
--terminal-border: #30363d;
--terminal-title-bg: #161b22;
--terminal-dot-red: #ff5f57;
--terminal-dot-yellow: #febc2e;
--terminal-dot-green: #28c840;
```
