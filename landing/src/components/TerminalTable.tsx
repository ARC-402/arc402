'use client'

import React from 'react'
import styles from './TerminalShowcase.module.css'
import type { TableState } from './types'

interface TerminalTableProps {
  table: TableState;
}

export function TerminalTable({ table }: TerminalTableProps) {
  return (
    <div className={styles.tableBlock}>
      <table className={styles.tableInner}>
        <thead>
          <tr>
            {table.columns.map((col) => (
              <th key={col}>{col}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row, ri) => (
            <tr
              key={ri}
              className={table.cursorRow === ri ? styles.tableRowActive : ''}
            >
              {row.map((cell, ci) => (
                <td key={ci}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
