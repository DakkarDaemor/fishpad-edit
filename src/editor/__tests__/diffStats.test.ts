import { describe, expect, it } from 'vitest'
import { Text } from '@codemirror/state'
import { Chunk } from '@codemirror/merge'
import { lineDelta } from '../diffStats'

const delta = (a: string, b: string) => {
  const ta = Text.of(a.split('\n'))
  const tb = Text.of(b.split('\n'))
  return lineDelta(Chunk.build(ta, tb), ta, tb)
}

describe('lineDelta', () => {
  it('testi uguali', () => expect(delta('a\nb', 'a\nb')).toEqual({ removed: 0, added: 0 }))
  it('riga cambiata: una tolta e una aggiunta', () => expect(delta('a\nb\nc', 'a\nB\nc')).toEqual({ removed: 1, added: 1 }))
  it('righe aggiunte', () => expect(delta('a\nb\nc', 'a\nx\ny\nb\nc')).toEqual({ removed: 0, added: 2 }))
  it('righe tolte', () => expect(delta('a\nb\nc\nd', 'a\nd')).toEqual({ removed: 2, added: 0 }))
  it("modifica sull'ultima riga senza a capo", () => expect(delta('a\nb', 'a\nc')).toEqual({ removed: 1, added: 1 }))
})
