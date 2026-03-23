'use client'

import React, { useMemo } from 'react'
import styles from './TerminalShowcase.module.css'

// Deterministic fake QR pattern (21x21 — QR version 1)
function generateQRPattern(): boolean[][] {
  const size = 21
  const grid: boolean[][] = Array.from({ length: size }, () =>
    Array.from({ length: size }, () => false)
  )

  // Finder patterns (top-left, top-right, bottom-left)
  const drawFinder = (r: number, c: number) => {
    for (let dr = 0; dr < 7; dr++) {
      for (let dc = 0; dc < 7; dc++) {
        const isOuter = dr === 0 || dr === 6 || dc === 0 || dc === 6
        const isInner = dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4
        grid[r + dr][c + dc] = isOuter || isInner
      }
    }
  }

  drawFinder(0, 0)
  drawFinder(0, 14)
  drawFinder(14, 0)

  // Fill data area with pseudo-random pattern
  let seed = 42
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (grid[r][c]) continue
      // Skip separator areas around finders
      if ((r < 8 && c < 8) || (r < 8 && c > 12) || (r > 12 && c < 8)) continue
      seed = (seed * 1103515245 + 12345) & 0x7fffffff
      grid[r][c] = (seed >> 16) % 3 === 0
    }
  }

  return grid
}

export function TerminalQR() {
  const pattern = useMemo(() => generateQRPattern(), [])

  return (
    <div className={styles.qrBlock}>
      <div className={styles.qrGrid}>
        {pattern.flatMap((row, r) =>
          row.map((dark, c) => (
            <div
              key={`${r}-${c}`}
              className={`${styles.qrCell} ${dark ? styles.qrDark : styles.qrLight}`}
            />
          ))
        )}
      </div>
    </div>
  )
}
