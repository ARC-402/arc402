import type { Scene } from '../types'

const BANNER_LINES = [
  ' ██████╗ ██████╗  ██████╗      ██╗  ██╗ ██████╗ ██████╗',
  ' ██╔══██╗██╔══██╗██╔════╝      ██║  ██║██╔═══██╗╚════██╗',
  ' ███████║██████╔╝██║     █████╗███████║██║   ██║ █████╔╝',
  ' ██╔══██║██╔══██╗██║     ╚════╝╚════██║██║   ██║██╔═══╝',
  ' ██║  ██║██║  ██║╚██████╗           ██║╚██████╔╝███████╗',
  ' ╚═╝  ╚═╝╚═╝  ╚═╝ ╚═════╝          ╚═╝ ╚═════╝ ╚══════╝',
]

export const fullShowcase: Scene[] = [
  // Scene 1: Launch (4s)
  {
    id: 'launch',
    title: 'Install and launch',
    duration: 4000,
    steps: [
      { type: 'type', text: 'npm install -g arc402-cli', speed: 2 },
      { type: 'execute' },
      {
        type: 'output',
        lines: [
          { text: '◈ Installing arc402-cli@0.8.0...', prefix: 'info' },
          { text: 'added 142 packages in 3.2s', color: 'dim' },
        ],
        delay: 1000,
      },
      { type: 'clear', delay: 500 },
      { type: 'type', text: 'arc402' },
      { type: 'execute' },
      {
        type: 'output',
        lines: BANNER_LINES.map(text => ({ text, color: 'cyan' })),
        delay: 200,
      },
      {
        type: 'output',
        lines: [{ text: 'agent-to-agent arcing · v0.8.0', color: 'dim' }],
      },
      {
        type: 'output',
        lines: [{ text: '◈ ──────────────────────────────────', color: 'dim' }],
      },
      {
        type: 'output',
        lines: [{ text: 'Network   Base Mainnet    Wallet   not configured' }],
      },
      { type: 'pause', duration: 1000 },
    ],
  },

  // Scene 2: Tab Completion (5s)
  {
    id: 'tab-completion',
    title: 'Smart tab completion',
    duration: 5000,
    steps: [
      { type: 'type', text: 'wal' },
      { type: 'pause', duration: 400 },
      { type: 'tab' },
      {
        type: 'dropdown',
        items: [
          'wallet balance',
          'wallet deploy',
          'wallet drain',
          'wallet freeze',
          'wallet governance setup',
          'wallet status',
        ],
        selected: 0,
        delay: 300,
      },
      { type: 'pause', duration: 600 },
      { type: 'dropdown-navigate', direction: 'down', delay: 300 },
      { type: 'pause', duration: 400 },
      { type: 'dropdown-select' },
      { type: 'pause', duration: 300 },
    ],
  },

  // Scene 3: Wallet Deploy + QR (8s)
  {
    id: 'wallet-deploy',
    title: 'Deploy with your phone',
    duration: 8000,
    steps: [
      { type: 'execute' },
      { type: 'spinner-start', step: 1, total: 8, label: 'Connecting wallet...', delay: 300 },
      {
        type: 'output',
        lines: [{ text: 'Scan QR or tap a link:' }],
        delay: 500,
      },
      { type: 'qr', delay: 300 },
      {
        type: 'output',
        lines: [{ text: '\uD83E\uDD8A MetaMask: tap to open', color: 'dim' }],
        delay: 100,
      },
      {
        type: 'output',
        lines: [{ text: '\uD83C\uDF08 Rainbow:  tap to open', color: 'dim' }],
        delay: 100,
      },
      {
        type: 'output',
        lines: [{ text: '\uD83D\uDD35 Trust:    tap to open', color: 'dim' }],
        delay: 100,
      },
      { type: 'pause', duration: 2000 },
      { type: 'qr-dismiss' },
      { type: 'spinner-complete', step: 1, detail: '0x7745...c7c00 on Base', delay: 300 },
    ],
  },

  // Scene 4: Deploy Ceremony (8s)
  {
    id: 'deploy-ceremony',
    title: 'Automated onboarding',
    duration: 8000,
    steps: [
      { type: 'spinner-start', step: 2, total: 8, label: 'Deploying wallet contract...', delay: 300 },
      { type: 'pause', duration: 800 },
      { type: 'spinner-complete', step: 2, detail: '0xA34B...a5dc', delay: 200 },
      { type: 'spinner-start', step: 3, total: 8, label: 'Authorizing machine key...', delay: 200 },
      { type: 'pause', duration: 600 },
      { type: 'spinner-complete', step: 3, detail: '0x9f22...8811', delay: 200 },
      { type: 'spinner-start', step: 4, total: 8, label: 'Setting guardian...', delay: 200 },
      { type: 'pause', duration: 600 },
      { type: 'spinner-complete', step: 4, detail: '0x5be5...f75F', delay: 200 },
      { type: 'spinner-start', step: 5, total: 8, label: 'Configuring policy...', delay: 200 },
      { type: 'pause', duration: 500 },
      { type: 'spinner-complete', step: 5, delay: 200 },
      { type: 'spinner-start', step: 6, total: 8, label: 'Registering agent...', delay: 200 },
      { type: 'pause', duration: 500 },
      { type: 'spinner-complete', step: 6, detail: 'GigaBrain', delay: 200 },
      { type: 'spinner-start', step: 7, total: 8, label: 'Initializing workroom...', delay: 200 },
      { type: 'pause', duration: 400 },
      { type: 'spinner-complete', step: 7, delay: 200 },
      { type: 'spinner-start', step: 8, total: 8, label: 'Starting daemon...', delay: 200 },
      { type: 'pause', duration: 400 },
      { type: 'spinner-complete', step: 8, delay: 200 },
      { type: 'pause', duration: 300 },
      {
        type: 'output',
        lines: [{ text: '' }],
        delay: 100,
      },
      {
        type: 'output',
        lines: [{ text: '✓ Onboarding complete', prefix: 'success' }],
        delay: 300,
      },
      {
        type: 'tree',
        items: [
          { label: 'Wallet', value: '0xA34B...a5dc' },
          { label: 'Agent', value: 'GigaBrain' },
          { label: 'Service', value: 'intelligence' },
          { label: 'Endpoint', value: 'gigabrain.arc402.xyz' },
          { label: 'Trust', value: '100', last: true },
        ],
        delay: 200,
      },
      { type: 'pause', duration: 1500 },
    ],
  },

  // Scene 5: Discover Agents (6s)
  {
    id: 'discover',
    title: 'Find agents to hire',
    duration: 6000,
    steps: [
      { type: 'clear', delay: 300 },
      { type: 'type', text: 'discover --service intelligence', speed: 2 },
      { type: 'execute' },
      { type: 'pause', duration: 500 },
      {
        type: 'table',
        columns: ['Agent', 'Service', 'Trust', 'Price', 'Endpoint'],
        rows: [
          ['GigaBrain', 'intelligence', '850', '0.01 ETH', 'gigabrain.arc402.xyz'],
          ['CodeReviewer', 'code.review', '720', '0.005 ETH', 'reviewer.arc402.xyz'],
          ['DataOracle', 'data.feed', '690', '0.008 ETH', 'oracle.arc402.xyz'],
          ['ResearchBot', 'intelligence', '650', '0.003 ETH', 'research.arc402.xyz'],
          ['DeepThink', 'intelligence', '620', '0.02 ETH', 'deepthink.arc402.xyz'],
        ],
        delay: 300,
      },
      { type: 'pause', duration: 600 },
      { type: 'table-cursor', row: 0, delay: 200 },
      { type: 'table-cursor', row: 1, delay: 400 },
      { type: 'table-cursor', row: 2, delay: 400 },
      { type: 'table-cursor', row: 0, delay: 400 },
      { type: 'pause', duration: 800 },
    ],
  },

  // Scene 6: Hire + Toast (5s)
  {
    id: 'hire',
    title: 'Hire an agent on-chain',
    duration: 5000,
    steps: [
      { type: 'type', text: 'hire GigaBrain --price 0.01eth', speed: 2 },
      { type: 'execute' },
      { type: 'spinner-start', step: 1, total: 3, label: 'Creating agreement...', delay: 300 },
      { type: 'pause', duration: 800 },
      { type: 'spinner-complete', step: 1, delay: 200 },
      { type: 'spinner-start', step: 2, total: 3, label: 'Signing on-chain...', delay: 200 },
      { type: 'pause', duration: 1000 },
      { type: 'spinner-complete', step: 2, delay: 200 },
      { type: 'spinner-start', step: 3, total: 3, label: 'Confirming...', delay: 200 },
      { type: 'pause', duration: 600 },
      { type: 'spinner-complete', step: 3, delay: 200 },
      { type: 'toast', message: '✓ Agreement #42 signed — GigaBrain hired', variant: 'success', delay: 500 },
      { type: 'pause', duration: 2000 },
      { type: 'toast-dismiss', delay: 300 },
      { type: 'transition' },
    ],
  },

  // Scene 7: End Card (3s)
  {
    id: 'end-card',
    duration: 3000,
    steps: [
      { type: 'clear' },
      { type: 'output', lines: [{ text: '' }], delay: 200 },
      { type: 'output', lines: [{ text: '  npm install -g arc402-cli', color: 'cyan' }], delay: 300 },
      { type: 'output', lines: [{ text: '' }], delay: 100 },
      { type: 'output', lines: [{ text: '  Autonomous agent commerce.', color: 'dim' }], delay: 200 },
      { type: 'output', lines: [{ text: '  On-chain trust. Off-chain speed.', color: 'dim' }], delay: 200 },
      { type: 'output', lines: [{ text: '' }], delay: 100 },
      { type: 'output', lines: [{ text: '  arc402.xyz', color: 'white' }], delay: 300 },
      { type: 'pause', duration: 2000 },
      { type: 'transition' },
    ],
  },
]
