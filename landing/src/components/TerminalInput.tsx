'use client'

import React from 'react'
import styles from './TerminalShowcase.module.css'
import type { DropdownState } from './types'

interface TerminalInputProps {
  text: string;
  dropdown: DropdownState | null;
}

export function TerminalInput({ text, dropdown }: TerminalInputProps) {
  return (
    <div className={styles.inputLine}>
      <span className={styles.inputPromptIcon}>&#x25C8;</span>
      <span className={styles.inputPromptLabel}>arc402 &gt;</span>
      <span className={styles.inputText}>
        {text}
        <span className={styles.cursor} />
      </span>
      {dropdown && dropdown.visible && (
        <div className={styles.dropdown}>
          {dropdown.items.map((item, i) => (
            <div
              key={item}
              className={`${styles.dropdownItem} ${i === dropdown.selected ? styles.dropdownItemActive : ''}`}
            >
              {item}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
