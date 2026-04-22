# 49 — ARC-402 CLI App Information Architecture

## Purpose

This document translates the CLI product strategy into a concrete information architecture.

The question is not “what commands exist?”
The question is:

> **What should the operator see first, and how should the product guide them through work?**

---

## Primary product frame

The default `arc402` experience should feel like an app with five persistent zones:

1. **Overview** — current operator/system state
2. **Approvals** — pending wallet actions and routing health
3. **Work** — hires, agreements, deliveries, compute sessions
4. **Setup** — onboarding, endpoint, workroom, messaging
5. **Debug** — doctor, logs, remediation, recovery

These are app sections first, command families second.

---

## Default shell layout

### Header
Always-visible compact state strip:
- active network
- active wallet
- trust / registration state
- daemon state
- workroom state
- messaging route state

### Main panel
Context-dependent view based on current section.

### Secondary panel / inspector
Shows:
- selected item details
- next recommended action
- warnings / blockers
- recent activity

### Footer / command line
- global search / command palette
- quick actions
- current mode hint

---

## Top-level app sections

## 1. Overview

### Goal
Answer, at a glance:
- Is the operator ready?
- What is broken?
- What should happen next?

### Contents
- Wallet readiness card
- Agent readiness card
- Workroom/daemon readiness card
- Approval routing card
- Recent event feed
- “Next best action” panel

### Key actions
- Continue onboarding
- Open approvals
- Start workroom
- Register agent
- Run doctor

---

## 2. Approvals

### Goal
Make approvals a first-class operating surface.

### Contents
- current approval route:
  - OpenClaw-native
  - Telegram bot
  - WalletConnect QR / deep-link fallback
- pending approval requests
- recent approval attempts
- last approval result
- route health / missing config warnings

### Key actions
- test delivery route
- re-send approval prompt
- switch delivery method
- inspect current routing config
- recover interrupted approval flow

### Why this matters
This section turns approval routing from hidden plumbing into visible operator state.

---

## 3. Work

### Goal
Operate actual ARC-402 commerce from one place.

### Subsections
- Hires
- Agreements
- Deliveries
- Compute sessions
- Disputes / remediation
- Arena / discovery events

### Key views
- inbox / pending work
- active agreements
- provider obligations
- buyer verification queue
- recent delivery activity

### Key actions
- hire
- accept
- deliver
- verify
- cancel
- dispute
- negotiate

---

## 4. Setup

### Goal
Bundle all onboarding/configuration into guided flows.

### Subsections
- First-run setup
- Wallet setup
- Approval routing setup
- Agent setup
- Endpoint setup
- Workroom setup

### Key flows
#### First-run setup
Collect:
- network
- wallet connection method
- WalletConnect project ID
- approval delivery route
- Telegram/OpenClaw details if needed
- endpoint preference
- workroom/daemon preference

#### Wallet setup
- create/import owner wallet
- deploy ARC-402 wallet
- passkey activation
- policy defaults
- spend limits

#### Approval routing setup
- OpenClaw-native route detection
- Telegram setup/test
- WalletConnect fallback preview
- route health test

#### Agent setup
- register/update agent
- endpoint claim
- capability/service type config

#### Workroom setup
- boot daemon
- boot workroom
- verify health

---

## 5. Debug

### Goal
Make repair fast and explicit.

### Subsections
- doctor
- logs
- recovery
- config diff
- on-chain state diff
- daemon/workroom diagnostics

### Key actions
- run health checks
- inspect exact blocker
- resume interrupted flow
- compare local config vs canonical defaults
- inspect on-chain readiness vs local assumptions

---

## Global interaction model

## Command palette
The shell should allow command-style access from anywhere, but the app frame should remain visible.

Examples:
- `/approve route test`
- `/setup telegram`
- `/wallet deploy`
- `/doctor`
- `/hire <agent>`

## Suggested actions
Each major section should suggest context-sensitive actions.
Examples:
- “Telegram route not configured — run setup now”
- “Wallet deployed but passkey inactive — continue onboarding”
- “Daemon offline — start locally”

## Mode awareness
Recommended modes:
- **Operate** — production workflows
- **Build** — setup and lifecycle changes
- **Debug** — doctor and remediation
- **Plan** — preview writes before action

Modes should change both tone and default actions.

---

## Command architecture mapping

The raw command surface should map into app sections instead of being the primary mental model.

### Overview-backed commands
- `status`
- `feed`
- `watch`

### Approvals-backed commands
- `wallet connect`
- `telegram init`
- approval testing / route inspection commands

### Work-backed commands
- `hire`
- `accept`
- `deliver`
- `verify`
- `cancel`
- `dispute`
- `negotiate`
- `compute`

### Setup-backed commands
- `setup`
- `config`
- `wallet`
- `agent`
- `endpoint`
- `daemon`
- `workroom`

### Debug-backed commands
- `doctor`
- `migrate`
- logs / recovery commands

---

## Recovery model

Every guided flow should preserve and expose:
- current stage
- completed stages
- pending stages
- last failure reason
- safe next action

The shell should never force the user to reconstruct state from memory.

---

## App-like CLI acceptance test

The CLI feels app-like when a new operator can:
1. launch `arc402`
2. see readiness state immediately
3. enter setup from a visible prompt
4. configure approval delivery in one obvious place
5. deploy or connect wallet cleanly
6. recover after interruption without guessing commands
7. move into work mode without leaving the shell

---

## Recommended implementation order

1. **Approval center**
   - route visibility
   - delivery tests
   - missing-config diagnosis
2. **Unified setup funnel**
   - include Telegram/OpenClaw path selection
3. **Overview dashboard**
   - readiness cards + next action
4. **Recovery surfaces**
   - resume interrupted flows
   - error → next step transitions
5. **Workflow-first navigation**
   - make core tasks more prominent than raw nouns

---

## Immediate design consequence

Do not add more isolated commands until they have a place in this app frame.

ARC-402 already has enough commands.
What it needs now is:
- hierarchy,
- state clarity,
- guidance,
- and recovery.
