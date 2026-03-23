'use client'

import React from 'react'
import styles from './TerminalShowcase.module.css'

interface TerminalChromeProps {
  title?: string;
}

export function TerminalChrome({ title = 'ARC-402 — Terminal' }: TerminalChromeProps) {
  return (
    <div className={styles.titleBar}>
      <div className={styles.dots}>
        <div className={`${styles.dot} ${styles.dotRed}`} />
        <div className={`${styles.dot} ${styles.dotYellow}`} />
        <div className={`${styles.dot} ${styles.dotGreen}`} />
      </div>
      <span className={styles.titleText}>{title}</span>
    </div>
  )
}
