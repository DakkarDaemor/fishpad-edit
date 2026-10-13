import { describe, expect, it } from 'vitest'
import { isValidLayout, leaf, moveDivider, paneIds, removePane, splitPane, type Layout } from './layout'

describe('splitPane', () => {
  it('trasforma una foglia in una divisione a metà', () => {
    expect(splitPane(leaf('a'), 'a', 'b', 'row')).toEqual({
      kind: 'split',
      dir: 'row',
      children: [leaf('a'), leaf('b')],
      sizes: [0.5, 0.5],
    })
  })

  it('nella stessa direzione aggiunge un fratello dividendo lo spazio del target', () => {
    const l = splitPane(splitPane(leaf('a'), 'a', 'b', 'row'), 'a', 'c', 'row')
    expect(paneIds(l)).toEqual(['a', 'c', 'b'])
    expect(l.kind === 'split' && l.sizes).toEqual([0.25, 0.25, 0.5])
  })

  it('in direzione diversa annida una nuova divisione', () => {
    const l = splitPane(splitPane(leaf('a'), 'a', 'b', 'row'), 'b', 'c', 'column')
    expect(l.kind === 'split' && l.children[1]).toMatchObject({ kind: 'split', dir: 'column' })
    expect(paneIds(l)).toEqual(['a', 'b', 'c'])
  })
})

describe('removePane', () => {
  it('compatta la divisione rimasta con un solo figlio', () => {
    expect(removePane(splitPane(leaf('a'), 'a', 'b', 'row'), 'b')).toEqual(leaf('a'))
  })

  it("restituisce null quando sparisce l'ultimo pannello", () => {
    expect(removePane(leaf('a'), 'a')).toBeNull()
  })

  it('fonde nel padre un figlio con la stessa direzione e rinormalizza le dimensioni', () => {
    // row[a, column[b, row[c, d]]] → rimuovendo b resta row[a, c, d]
    let l: Layout = splitPane(leaf('a'), 'a', 'b', 'row')
    l = splitPane(l, 'b', 'c', 'column')
    l = splitPane(l, 'c', 'd', 'row')
    const r = removePane(l, 'b')!
    expect(r).toMatchObject({ kind: 'split', dir: 'row' })
    expect(paneIds(r)).toEqual(['a', 'c', 'd'])
    expect(r.kind === 'split' && r.sizes.reduce((x, y) => x + y)).toBeCloseTo(1)
  })
})

describe('moveDivider', () => {
  it('sposta il confine rispettando il minimo', () => {
    expect(moveDivider([0.5, 0.5], 0, 0.1)).toEqual([0.6, 0.4])
    expect(moveDivider([0.5, 0.5], 0, 0.9, 0.1)).toEqual([0.9, 0.09999999999999998])
  })
})

describe('isValidLayout', () => {
  it('accetta solo layout con esattamente i pannelli attesi', () => {
    const l = splitPane(leaf('a'), 'a', 'b', 'row')
    expect(isValidLayout(l, new Set(['a', 'b']))).toBe(true)
    expect(isValidLayout(l, new Set(['a']))).toBe(false)
    expect(isValidLayout({ kind: 'split', dir: 'row', children: [leaf('a')], sizes: [1] }, new Set(['a']))).toBe(false)
  })
})
