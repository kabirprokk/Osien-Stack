import { createSignal, type Accessor } from "solid-js"
import type { BoxRenderable } from "@opentui/core"

/**
 * Tracks the size a subtree actually got, so the UI can drop columns and window
 * rows on a short or narrow terminal instead of wrapping or overflowing. Uses
 * only the documented `RenderableOptions.onSizeChange` hook - no host internals
 * and no polling.
 */
export function createMeasuredBox(initialWidth = 0, initialHeight = 0): {
  columns: Accessor<number>
  rows: Accessor<number>
  /** Call from a `ref` and from `onSizeChange`. */
  report: (element: BoxRenderable | undefined) => void
} {
  const [columns, setColumns] = createSignal(initialWidth)
  const [rows, setRows] = createSignal(initialHeight)
  return {
    columns,
    rows,
    report: (element) => {
      if (!element) return
      const nextColumns = Math.max(0, Math.floor(element.width))
      const nextRows = Math.max(0, Math.floor(element.height))
      setColumns((current) => (current === nextColumns ? current : nextColumns))
      setRows((current) => (current === nextRows ? current : nextRows))
    },
  }
}

/** `width` is only meaningful after layout, so fall back until it is known. */
export function safeColumns(columns: Accessor<number>, fallback = 80): number {
  const value = columns()
  return value > 0 ? value : fallback
}

/**
 * Usable row count of a pane. OpenTUI boxes have no border here, so the measured
 * height is the row budget; the fallback is used before the first layout pass.
 */
export function safeRows(rows: Accessor<number>, fallback = 20): number {
  const value = rows()
  return value > 0 ? value : fallback
}