'use client'

import React from 'react'
import styles from './TerminalShowcase.module.css'
import type { TreeItem } from './types'

interface TerminalTreeProps {
  items: TreeItem[];
}

export function TerminalTree({ items }: TerminalTreeProps) {
  return (
    <div className={styles.treeBlock}>
      {items.map((item, i) => {
        const isLast = item.last ?? i === items.length - 1
        return (
          <div key={item.label} className={styles.treeLine}>
            <span className={styles.treeBranch}>{isLast ? '└' : '├'}</span>
            <span className={styles.treeLabel}>{item.label}</span>
            <span className={styles.treeValue}>{item.value}</span>
          </div>
        )
      })}
    </div>
  )
}
