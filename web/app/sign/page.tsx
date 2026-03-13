import { Suspense } from 'react'
import SignPageContent from './SignPageContent'

export default function SignPage() {
  return (
    <Suspense fallback={
      <div className="app">
        <div className="header"><h1>ARC-402 Protocol</h1></div>
        <div className="card">
          <div className="status"><span className="spinner" />Verifying request…</div>
        </div>
      </div>
    }>
      <SignPageContent />
    </Suspense>
  )
}
