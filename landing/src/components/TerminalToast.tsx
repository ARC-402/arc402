'use client'

import React from 'react'
import styles from './TerminalShowcase.module.css'
import type { ToastState } from './types'

interface TerminalToastProps {
  toast: ToastState;
}

export function TerminalToast({ toast }: TerminalToastProps) {
  return (
    <div className={`${styles.toast} ${toast.variant === 'success' ? styles.toastSuccess : styles.toastInfo}`}>
      {toast.message}
    </div>
  )
}
