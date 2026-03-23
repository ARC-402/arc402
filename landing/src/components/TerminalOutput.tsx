'use client'

import React from 'react'
import styles from './TerminalShowcase.module.css'
import type { OutputLine } from './types'

const colorMap: Record<string, string> = {
  cyan: styles.colorCyan,
  green: styles.colorGreen,
  red: styles.colorRed,
  dim: styles.colorDim,
  white: styles.colorWhite,
  yellow: styles.colorYellow,
}

const prefixMap: Record<string, string> = {
  success: styles.prefixSuccess,
  error: styles.prefixError,
  info: styles.prefixInfo,
  dim: styles.colorDim,
}

interface TerminalOutputProps {
  lines: OutputLine[];
}

export function TerminalOutput({ lines }: TerminalOutputProps) {
  return (
    <div className={styles.outputBlock}>
      {lines.map((line, i) => {
        const colorClass = line.color ? colorMap[line.color] || '' : ''
        const prefixClass = line.prefix ? prefixMap[line.prefix] || '' : ''
        const indent = line.indent ? { paddingLeft: `${line.indent * 16}px` } : undefined

        return (
          <div
            key={i}
            className={`${styles.outputLine} ${colorClass} ${prefixClass}`}
            style={indent}
          >
            {line.text}
          </div>
        )
      })}
    </div>
  )
}
