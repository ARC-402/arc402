import { Suspense } from 'react'
import PasskeySignContent from './PasskeySignContent'

export default function PasskeySignPage() {
  return (
    <Suspense fallback={
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: '#0a0a0a', color: '#f0f0f0', fontFamily: 'system-ui' }}>
        Loading...
      </div>
    }>
      <PasskeySignContent />
    </Suspense>
  )
}
