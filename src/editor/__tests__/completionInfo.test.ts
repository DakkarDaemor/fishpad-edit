import { Direction, type EditorView } from '@codemirror/view'
import { describe, expect, it } from 'vitest'
import { infoBesideList } from '../setup'

const rect = (left: number, top: number, right: number, bottom: number) => ({ left, top, right, bottom })
const view = { textDirection: Direction.LTR } as EditorView
const option = rect(10, 120, 310, 140)
const info = rect(0, 0, 300, 80)

describe('posizione della spiegazione di un suggerimento', () => {
  it('accanto alla lista quando c’è spazio', () => {
    const p = infoBesideList(view, rect(10, 100, 310, 300), option, info, rect(0, 0, 1000, 800))
    expect(p.class).toBe('cm-completionInfo-right')
  })

  it('schermo stretto: sotto la lista intera, non sotto la voce', () => {
    const p = infoBesideList(view, rect(10, 100, 310, 300), option, info, rect(0, 0, 360, 800))
    expect(p).toEqual({ style: 'top: 200px; max-width: 320px', class: 'cm-completionInfo-right-narrow' })
  })

  it('schermo stretto senza spazio sotto: sopra la lista', () => {
    const p = infoBesideList(view, rect(10, 500, 310, 700), rect(10, 520, 310, 540), info, rect(0, 0, 360, 720))
    expect(p.style.startsWith('bottom: 200px')).toBe(true)
  })
})
