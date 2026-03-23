'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import type { Scene, Step, ContentBlock, SpinnerState, TableState, DropdownState, ToastState } from './types'

interface ScreenplayState {
  contentBlocks: ContentBlock[];
  inputText: string;
  cursorVisible: boolean;
  sceneTitle: string | undefined;
  dropdown: DropdownState | null;
  toast: ToastState | null;
  showQR: boolean;
  isPlaying: boolean;
}

export function useScreenplay(
  screenplay: Scene[],
  options: { autoPlay?: boolean; loop?: boolean } = {}
) {
  const { autoPlay = true, loop = true } = options

  const [state, setState] = useState<ScreenplayState>({
    contentBlocks: [],
    inputText: '',
    cursorVisible: true,
    sceneTitle: undefined,
    dropdown: null,
    toast: null,
    showQR: false,
    isPlaying: false,
  })

  const pausedRef = useRef(false)
  const cancelledRef = useRef(false)
  const stateRef = useRef(state)
  stateRef.current = state

  const sleep = useCallback((ms: number) => {
    return new Promise<void>((resolve) => {
      const check = () => {
        if (cancelledRef.current) { resolve(); return }
        if (pausedRef.current) { setTimeout(check, 50); return }
        resolve()
      }
      setTimeout(check, ms)
    })
  }, [])

  const pause = useCallback(() => { pausedRef.current = true }, [])
  const resume = useCallback(() => { pausedRef.current = false }, [])

  useEffect(() => {
    if (!autoPlay) return
    cancelledRef.current = false

    const run = async () => {
      setState(s => ({ ...s, isPlaying: true }))

      const playOnce = async () => {
        for (const scene of screenplay) {
          if (cancelledRef.current) return

          // Set scene title
          setState(s => ({ ...s, sceneTitle: scene.title }))

          // Track spinners across the scene
          let spinners: SpinnerState[] = []
          // Track current table state
          let currentTable: TableState | null = null

          for (const step of scene.steps) {
            if (cancelledRef.current) return

            const delay = ('delay' in step && step.delay) ? step.delay : 0
            if (delay > 0) await sleep(delay)

            switch (step.type) {
              case 'type': {
                const speed = step.speed ?? 1
                const baseDelay = speed === 2 ? 25 : 50 // fast vs normal
                const text = step.text
                for (let i = 0; i <= text.length; i++) {
                  if (cancelledRef.current) return
                  const partial = text.slice(0, i)
                  setState(s => ({ ...s, inputText: partial }))
                  await sleep(baseDelay + Math.random() * 30)
                }
                break
              }

              case 'execute': {
                // Commit input as a command block
                setState(s => {
                  const cmd = s.inputText
                  return {
                    ...s,
                    contentBlocks: [...s.contentBlocks, { type: 'command', text: cmd }],
                    inputText: '',
                  }
                })
                break
              }

              case 'output': {
                setState(s => ({
                  ...s,
                  contentBlocks: [...s.contentBlocks, { type: 'output', lines: step.lines }],
                }))
                break
              }

              case 'clear': {
                setState(s => ({
                  ...s,
                  contentBlocks: [],
                  inputText: '',
                  showQR: false,
                }))
                // Reset spinners and table
                spinners = []
                currentTable = null
                break
              }

              case 'tab': {
                // Tab triggers completion — just a signal, dropdown shows on next step
                break
              }

              case 'dropdown': {
                setState(s => ({
                  ...s,
                  dropdown: { items: step.items, selected: step.selected, visible: true },
                }))
                break
              }

              case 'dropdown-navigate': {
                setState(s => {
                  if (!s.dropdown) return s
                  const dir = step.direction === 'down' ? 1 : -1
                  const next = Math.max(0, Math.min(s.dropdown.items.length - 1, s.dropdown.selected + dir))
                  return { ...s, dropdown: { ...s.dropdown, selected: next } }
                })
                break
              }

              case 'dropdown-select': {
                setState(s => {
                  if (!s.dropdown) return s
                  const selected = s.dropdown.items[s.dropdown.selected]
                  return {
                    ...s,
                    inputText: selected,
                    dropdown: null,
                  }
                })
                break
              }

              case 'qr': {
                setState(s => ({
                  ...s,
                  showQR: true,
                  contentBlocks: [...s.contentBlocks, { type: 'qr' }],
                }))
                break
              }

              case 'qr-dismiss': {
                setState(s => ({
                  ...s,
                  showQR: false,
                  contentBlocks: s.contentBlocks.filter(b => b.type !== 'qr'),
                }))
                break
              }

              case 'spinner-start': {
                const newSpinner: SpinnerState = {
                  step: step.step,
                  total: step.total,
                  label: step.label,
                  status: 'running',
                }
                spinners = [...spinners.filter(sp => sp.step !== step.step), newSpinner]
                setState(s => {
                  // Update or add spinner block
                  const blocks = s.contentBlocks.filter(b => b.type !== 'spinner')
                  return {
                    ...s,
                    contentBlocks: [...blocks, { type: 'spinner', spinners: [...spinners] }],
                  }
                })
                break
              }

              case 'spinner-complete': {
                spinners = spinners.map(sp =>
                  sp.step === step.step
                    ? { ...sp, status: 'complete' as const, detail: step.detail }
                    : sp
                )
                setState(s => {
                  const blocks = s.contentBlocks.filter(b => b.type !== 'spinner')
                  return {
                    ...s,
                    contentBlocks: [...blocks, { type: 'spinner', spinners: [...spinners] }],
                  }
                })
                break
              }

              case 'spinner-error': {
                spinners = spinners.map(sp =>
                  sp.step === step.step
                    ? { ...sp, status: 'error' as const, error: step.error }
                    : sp
                )
                setState(s => {
                  const blocks = s.contentBlocks.filter(b => b.type !== 'spinner')
                  return {
                    ...s,
                    contentBlocks: [...blocks, { type: 'spinner', spinners: [...spinners] }],
                  }
                })
                break
              }

              case 'table': {
                const newTable: TableState = { columns: step.columns, rows: step.rows, cursorRow: null }
                currentTable = newTable
                setState(s => ({
                  ...s,
                  contentBlocks: [...s.contentBlocks, { type: 'table', table: newTable }],
                }))
                break
              }

              case 'table-cursor': {
                if (currentTable !== null) {
                  const updatedTable: TableState = { ...currentTable, cursorRow: step.row }
                  currentTable = updatedTable
                  setState(s => ({
                    ...s,
                    contentBlocks: s.contentBlocks.map(b =>
                      b.type === 'table' ? { ...b, table: updatedTable } : b
                    ),
                  }))
                }
                break
              }

              case 'toast': {
                setState(s => ({
                  ...s,
                  toast: { message: step.message, variant: step.variant, visible: true },
                }))
                break
              }

              case 'toast-dismiss': {
                setState(s => ({ ...s, toast: null }))
                break
              }

              case 'tree': {
                setState(s => ({
                  ...s,
                  contentBlocks: [...s.contentBlocks, { type: 'tree', items: step.items }],
                }))
                break
              }

              case 'pause': {
                await sleep(step.duration)
                break
              }

              case 'transition': {
                // Fade out, clear, continue
                await sleep(500)
                setState(s => ({
                  ...s,
                  contentBlocks: [],
                  inputText: '',
                  showQR: false,
                  dropdown: null,
                  toast: null,
                }))
                spinners = []
                currentTable = null
                await sleep(300)
                break
              }
            }
          }
        }
      }

      do {
        await playOnce()
        if (loop && !cancelledRef.current) {
          // Reset state before looping
          setState(s => ({
            ...s,
            contentBlocks: [],
            inputText: '',
            showQR: false,
            dropdown: null,
            toast: null,
            sceneTitle: undefined,
          }))
          await sleep(500)
        }
      } while (loop && !cancelledRef.current)

      setState(s => ({ ...s, isPlaying: false }))
    }

    run()

    return () => {
      cancelledRef.current = true
    }
  }, [autoPlay, loop, screenplay, sleep])

  return { ...state, pause, resume }
}
