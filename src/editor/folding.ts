import type { EditorState, StateEffect } from '@codemirror/state'
import type { EditorView } from '@codemirror/view'
import {
  ensureSyntaxTree,
  foldEffect,
  foldable,
  foldedRanges,
  foldService,
} from '@codemirror/language'

function indentWidth(text: string, tabSize: number): number {
  let w = 0
  for (const ch of text) {
    if (ch === ' ') w++
    else if (ch === '\t') w += tabSize - (w % tabSize)
    else break
  }
  return w
}

/**
 * Folding basato sull'indentazione, per linguaggi senza parser Lezer
 * (testo semplice, log, linguaggi legacy). Una riga è richiudibile se le
 * righe successive non vuote sono più indentate.
 */
export const indentationFolding = foldService.of((state, lineStart, lineEnd) => {
  const line = state.doc.lineAt(lineStart)
  if (!line.text.trim()) return null
  const tabSize = state.tabSize
  const base = indentWidth(line.text, tabSize)
  let last = line.number
  for (let n = line.number + 1; n <= state.doc.lines; n++) {
    const next = state.doc.line(n)
    if (!next.text.trim()) continue
    if (indentWidth(next.text, tabSize) > base) last = n
    else break
  }
  if (last === line.number) return null
  return { from: lineEnd, to: state.doc.line(last).to }
})

interface Range {
  from: number
  to: number
}

/** Tutte le regioni richiudibili del documento, con la loro profondità di annidamento (1 = più esterna). */
function collectFoldRegions(state: EditorState): Array<Range & { depth: number }> {
  ensureSyntaxTree(state, state.doc.length, 500)
  const regions: Array<Range & { depth: number }> = []
  const stack: number[] = [] // estremi "to" delle regioni aperte
  for (let n = 1; n <= state.doc.lines; n++) {
    const line = state.doc.line(n)
    const r = foldable(state, line.from, line.to)
    if (!r) continue
    while (stack.length && stack[stack.length - 1] <= r.from) stack.pop()
    regions.push({ ...r, depth: stack.length + 1 })
    stack.push(r.to)
  }
  return regions
}

/** Chiude tutte le regioni al livello indicato (come "Fold Level N" di VS Code). */
export function foldLevel(level: number) {
  return (view: EditorView): boolean => {
    const already = foldedRanges(view.state)
    const effects: StateEffect<unknown>[] = []
    for (const r of collectFoldRegions(view.state)) {
      if (r.depth !== level) continue
      let isFolded = false
      already.between(r.from, r.from, (from, to) => {
        if (from === r.from && to === r.to) isFolded = true
      })
      if (!isFolded) effects.push(foldEffect.of({ from: r.from, to: r.to }))
    }
    if (effects.length) view.dispatch({ effects })
    return true
  }
}

/** Intervalli chiusi, per salvarli nella sessione. */
export function serializeFolds(state: EditorState): Array<[number, number]> {
  const out: Array<[number, number]> = []
  foldedRanges(state).between(0, state.doc.length, (from, to) => {
    out.push([from, to])
  })
  return out
}

export function restoreFoldEffects(state: EditorState, folds: Array<[number, number]>) {
  const len = state.doc.length
  return folds
    .filter(([from, to]) => from >= 0 && to <= len && from < to)
    .map(([from, to]) => foldEffect.of({ from, to }))
}
