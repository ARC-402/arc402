import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'ARC-402 Protocol',
  description: 'The governed agent wallet protocol',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
