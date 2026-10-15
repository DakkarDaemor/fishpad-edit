import type { Text } from '@codemirror/state'
import type { Chunk } from '@codemirror/merge'

/** Righe tolte (da `a`) e aggiunte (in `b`): una riga cambiata conta come una tolta e una aggiunta, come in git. */
export function lineDelta(chunks: readonly Chunk[], a: Text, b: Text) {
  const lines = (doc: Text, from: number, to: number, end: number) =>
    from === to ? 0 : doc.lineAt(end).number - doc.lineAt(from).number + 1
  let removed = 0
  let added = 0
  for (const c of chunks) {
    removed += lines(a, c.fromA, c.toA, c.endA)
    added += lines(b, c.fromB, c.toB, c.endB)
  }
  return { removed, added }
}
