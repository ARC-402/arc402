# Ink 6 + ESM Migration Spec

## Goal
Migrate ARC-402 CLI from Ink 3 (CommonJS) to Ink 6 (ESM + React 19).
Also build a native WalletConnect Ink component so QR codes render inside the TUI viewport.

## Current State
- ink@3.2.0, react@18.3.1, ink-text-input@4.0.3
- tsconfig: module=commonjs, target=ES2020
- ~33k lines of TypeScript across 53+ source files
- All source uses `import/export` syntax, compiled to CJS by tsc
- Some files use `require()` for package.json reads
- TUI files: src/tui/ (App.tsx, Header.tsx, Viewport.tsx, InputLine.tsx, Footer.tsx, index.tsx, useChat.ts, useCommand.ts, useScroll.ts)

## Phase 1: ESM + Ink 6 Migration

### Step 1: Update package.json
- Add `"type": "module"`
- Update deps: `ink@^6.8.0`, `react@^19.0.0`, `@types/react@^19.0.0`, `ink-text-input@^6.0.0`
- Add `react-devtools-core` as optional peer dep if needed
- Run `npm install`

### Step 2: Update tsconfig.json
- Change `"module": "NodeNext"` and add `"moduleResolution": "NodeNext"`
- Change `"target": "ES2022"` and `"lib": ["ES2022"]`
- Remove the `paths` entries for ink/ink-text-input (Ink 6 has proper types)
- Add ethers path mapping if needed: `"ethers": ["./node_modules/ethers/lib.commonjs/index.d.ts"]`

### Step 3: Fix ALL relative imports
Every `import ... from "./foo"` must become `import ... from "./foo.js"`.
Every `import ... from "../foo"` must become `import ... from "../foo.js"`.
TSX files: `import ... from "./App"` → `import ... from "./App.js"` (tsc compiles .tsx to .js)

### Step 4: Convert require() calls to import
- `require("../../package.json")` → use `createRequire(import.meta.url)` from `"node:module"`
- `require("ethers")` etc → already using `import`, should be fine
- Dynamic requires → convert to dynamic `import()`

### Step 5: Fix Ink 6 API changes
- Check if `useStdout`, `useInput`, `useApp` signatures changed
- `ink-text-input@6` may have different import path or component API
- `<Static>` component may have changed
- Verify `render()` function signature

### Step 6: Build & fix errors iteratively
- Run `npx tsc --noEmit` after each batch of changes
- Fix type errors in batches by file category (TUI files first, then commands, then daemon)

## Phase 2: TUI Design Improvements

### Step 7: Remove vertical box borders
The TUI should use horizontal separator lines only (no │ borders — they break on resize):
```
 ██████╗ ██████╗  ██████╗ ...
 agent-to-agent arcing · v0.7.5
 ◈ ──────────────────────────────────────
 Network   Base Mainnet    Wallet   0xa9e0..
─────────────────────────────────────────────
 scrollable output area
─────────────────────────────────────────────
 ◈ arc402 > _
```

### Step 8: ARC402_NO_TUI env guard
In src/index.ts, the TTY TUI launch condition must check `!process.env.ARC402_NO_TUI`:
```ts
} else if (process.stdout.isTTY && !hasSubcommand && process.argv.length <= 2 && !process.env.ARC402_NO_TUI) {
```

## Phase 3: Native WalletConnect Component

### Step 9: Create WalletConnect Ink component
Create `src/tui/WalletConnectPairing.tsx`:
- Renders QR code as ASCII text inside the viewport
- Shows wallet deep links (MetaMask, Rainbow, Trust)
- Shows "Waiting for approval..." status
- Handles connection success/failure as React state transitions

This requires refactoring `src/walletconnect.ts`:
- Extract the pairing logic into an event-emitter or callback-based API
- The current `connectPhoneWallet()` does console.log for QR — change it to accept
  an `onUri` callback and an `onStatus` callback instead
- Keep the existing console.log behavior as the default (for one-shot CLI mode)

### Step 10: Wire WalletConnect component into useCommand
Instead of spawning a child process for interactive commands, render the
WalletConnect pairing component inside the viewport when `wallet deploy` runs.

The multi-step deploy wizard becomes a state machine:
1. CONNECTING → show QR + links
2. CONNECTED → show account, deploy tx
3. DEPLOYING → show spinner
4. ONBOARDING → show each ceremony step
5. COMPLETE → show summary tree

## Rules
- Do NOT change any business logic in command handlers
- Do NOT change contract addresses, ABIs, or deployment logic
- Keep all existing CLI one-shot behavior working (`arc402 wallet deploy` outside TUI)
- Test with `npx tsc --noEmit` frequently
- After build succeeds, test `node dist/index.js --help` to verify one-shot mode works

## Build & verify
```bash
npm run build
node dist/index.js --help  # one-shot mode
node dist/index.js         # TUI mode (if TTY)
```
