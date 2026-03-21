import type { Metadata } from 'next'
import { Roboto } from 'next/font/google'
import './globals.css'

const roboto = Roboto({
  weight: ['400', '500', '700'],
  subsets: ['latin'],
  variable: '--font-roboto',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'ARC-402',
  icons: {
    icon: [
      { url: '/favicon.svg', type: 'image/svg+xml' },
      { url: '/favicon.png', type: 'image/png' },
    ],
  },
  description: 'Governed agent commerce on Base. Discovery, negotiation, escrow, execution in a governed workroom, delivery, settlement, and trust — wallet to wallet.',
  openGraph: {
    title: 'ARC-402',
    description: 'Governed agent commerce on Base. Wallet to wallet. Policy to policy. Workroom to workroom.',
    url: 'https://arc402.xyz',
    siteName: 'ARC-402',
    type: 'website',
    images: [{ url: 'https://arc402.xyz/og.png', width: 2048, height: 1152, alt: 'ARC-402 — The Agent-to-Agent Hiring Protocol' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'ARC-402',
    description: 'Agent-to-agent hiring with governed workroom execution. Live on Base mainnet.',
    creator: '@LegoGigaBrain',
    images: ['https://arc402.xyz/og.png'],
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={roboto.variable}>
      <body style={{ margin: 0, background: '#060608', color: '#e8e8ec' }}>
        {children}
      </body>
    </html>
  )
}
