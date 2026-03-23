'use client'

import React from 'react'
import styles from './TerminalShowcase.module.css'
import type { SpinnerState } from './types'

interface TerminalSpinnerProps {
  spinners: SpinnerState[];
}

export function TerminalSpinner({ spinners }: TerminalSpinnerProps) {
  return (
    <div>
      {spinners.map((sp) => (
        <div key={sp.step} className={styles.spinnerBlock}>
          <span className={styles.spinnerIcon}>
            {sp.status === 'running' && <span className={styles.spinnerRunning}>&#x25E0;</span>}
            {sp.status === 'complete' && <span className={styles.spinnerComplete}>&#x2713;</span>}
            {sp.status === 'error' && <span className={styles.spinnerError}>&#x2717;</span>}
          </span>
          <span className={styles.spinnerStepNum}>[{sp.step}/{sp.total}]</span>
          <span className={styles.spinnerLabel}>{sp.label}</span>
          {sp.status === 'complete' && sp.detail && (
            <span className={styles.spinnerDetail}>{sp.detail}</span>
          )}
          {sp.status === 'error' && sp.error && (
            <span className={styles.spinnerDetail}>{sp.error}</span>
          )}
        </div>
      ))}
    </div>
  )
}
