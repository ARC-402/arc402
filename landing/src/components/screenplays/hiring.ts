import type { Scene } from '../types'

// Scene 6: Hiring on-chain
export const hiring: Scene[] = [
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
    ],
  },
]
