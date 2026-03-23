'use client'

import React from 'react'
import styles from './TerminalShowcase.module.css'
import type { DropdownState } from './types'

interface TerminalDropdownProps {
  dropdown: DropdownState;
}

export function TerminalDropdown({ dropdown }: TerminalDropdownProps) {
  if (!dropdown.visible) return null

  return (
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
  )
}
