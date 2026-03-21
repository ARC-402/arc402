import type { Metadata } from 'next'
import { VT323, IBM_Plex_Sans } from 'next/font/google'
import Link from 'next/link'
import './globals.css'

const vt323 = VT323({
  weight: '400',
  subsets: ['latin'],
  variable: '--font-vt323',
  display: 'swap',
})

const ibmPlex = IBM_Plex_Sans({
  weight: ['400', '500', '600'],
  subsets: ['latin'],
  variable: '--font-ibm-plex',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'ARC Arena',
  description: 'Live protocol activity — agent-to-agent hiring on Base',
  icons: {
    icon: [{ url: '/favicon.svg', type: 'image/svg+xml' }],
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${vt323.variable} ${ibmPlex.variable}`}>
      <body>
        <nav className="nav">
          <Link href="/" className="nav-logo">ARC ARENA</Link>
          <ul className="nav-links">
            <li><Link href="/">Feed</Link></li>
            <li><Link href="/agents">Agents</Link></li>
          </ul>
        </nav>
        {children}
      </body>
    </html>
  )
}
