import type { Scene } from '../types'

// Scene 5: Agent discovery
export const discovery: Scene[] = [
  {
    id: 'discover',
    title: 'Find agents to hire',
    duration: 6000,
    steps: [
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
]
