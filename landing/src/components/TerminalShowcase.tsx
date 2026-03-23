'use client'

import React, { useRef, useEffect } from 'react'
import styles from './TerminalShowcase.module.css'
import { useScreenplay } from './useScreenplay'
import { TerminalChrome } from './TerminalChrome'
import { TerminalInput } from './TerminalInput'
import { TerminalOutput } from './TerminalOutput'
import { TerminalQR } from './TerminalQR'
import { TerminalTable } from './TerminalTable'
import { TerminalSpinner } from './TerminalSpinner'
import { TerminalTree } from './TerminalTree'
import { TerminalToast } from './TerminalToast'
import type { TerminalShowcaseProps } from './types'

export function TerminalShowcase({
  screenplay,
  autoPlay = true,
  loop = true,
  pauseOnHover = true,
  theme = 'dark',
  width = '100%',
  height = '500px',
}: TerminalShowcaseProps) {
  const {
    contentBlocks,
    inputText,
    sceneTitle,
    dropdown,
    toast,
    pause,
    resume,
  } = useScreenplay(screenplay, { autoPlay, loop })

  const viewportRef = useRef<HTMLDivElement>(null)

  // Auto-scroll viewport when content changes
  useEffect(() => {
    if (viewportRef.current) {
      viewportRef.current.scrollTop = viewportRef.current.scrollHeight
    }
  }, [contentBlocks])

  const handleMouseEnter = () => { if (pauseOnHover) pause() }
  const handleMouseLeave = () => { if (pauseOnHover) resume() }

  const themeClass = theme === 'light' ? `${styles.terminal} ${styles.light}` : styles.terminal

  return (
    <div
      className={themeClass}
      style={{ width, maxHeight: height, display: 'flex', flexDirection: 'column' }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <TerminalChrome />

      {sceneTitle && (
        <div className={styles.sceneTitle}>{sceneTitle}</div>
      )}

      <div
        className={styles.viewport}
        ref={viewportRef}
        style={{ flex: 1, maxHeight: `calc(${height} - 100px)` }}
      >
        {contentBlocks.map((block, i) => {
          switch (block.type) {
            case 'output':
              return <TerminalOutput key={`out-${i}`} lines={block.lines} />
            case 'command':
              return (
                <div key={`cmd-${i}`} className={styles.commandBlock}>
                  <span className={styles.commandPrompt}>&#x25C8;</span>
                  <span className={styles.commandPromptLabel}>arc402 &gt;</span>
                  <span className={styles.commandText}>{block.text}</span>
                </div>
              )
            case 'qr':
              return <TerminalQR key={`qr-${i}`} />
            case 'spinner':
              return <TerminalSpinner key={`spin-${i}`} spinners={block.spinners} />
            case 'table':
              return <TerminalTable key={`tbl-${i}`} table={block.table} />
            case 'tree':
              return <TerminalTree key={`tree-${i}`} items={block.items} />
            default:
              return null
          }
        })}

        {toast && toast.visible && <TerminalToast toast={toast} />}
      </div>

      <TerminalInput text={inputText} dropdown={dropdown} />
    </div>
  )
}

export default TerminalShowcase
