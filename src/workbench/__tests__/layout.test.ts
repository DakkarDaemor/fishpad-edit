import { describe, expect, it } from 'vitest'
import { dockPane, isValidLayout, leaf, moveDivider, paneIds, paneLocation, removePane, rotatePair, splitPane, swapPanes, type Layout } from '../layout'

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

describe('swapPanes e dockPane', () => {
  // row[a, column[b, c]]
  const base = splitPane(splitPane(leaf('a'), 'a', 'b', 'row'), 'b', 'c', 'column')

  it('scambia due pannelli in rami diversi lasciando forma e dimensioni', () => {
    const l = swapPanes(base, 'a', 'c')
    expect(paneIds(l)).toEqual(['c', 'b', 'a'])
    expect(l.kind === 'split' && l.sizes).toEqual([0.5, 0.5])
  })

  it('sposta un pannello a sinistra di un altro', () => {
    expect(paneIds(dockPane(base, 'c', 'a', 'left'))).toEqual(['c', 'a', 'b'])
  })

  it('sposta un pannello sopra un altro, compattando da dove viene', () => {
    const l = dockPane(base, 'a', 'c', 'top')
    expect(l).toMatchObject({ kind: 'split', dir: 'column' })
    expect(paneIds(l)).toEqual(['b', 'a', 'c'])
    expect(isValidLayout(l, new Set(['a', 'b', 'c']))).toBe(true)
  })

  it('su se stesso non cambia nulla', () => {
    expect(dockPane(base, 'a', 'a', 'right')).toBe(base)
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

describe('rotatePair', () => {
  const row3: Layout = { kind: 'split', dir: 'row', sizes: [0.5, 0.25, 0.25], children: [leaf('a'), leaf('b'), leaf('c')] }

  it('ruota solo la coppia, gli altri pannelli restano dove sono', () => {
    expect(rotatePair(row3, [], 2)).toEqual({
      kind: 'split',
      dir: 'row',
      sizes: [0.5, 0.5],
      children: [leaf('a'), { kind: 'split', dir: 'column', sizes: [0.5, 0.5], children: [leaf('b'), leaf('c')] }],
    })
    expect(rotatePair(row3, [], 1)).toMatchObject({ dir: 'row', sizes: [0.75, 0.25], children: [{ dir: 'column', children: [leaf('a'), leaf('b')] }, leaf('c')] })
  })

  it('ruotare di nuovo la stessa coppia torna indietro', () => {
    const once = rotatePair(row3, [], 2)
    expect(rotatePair(once, [1], 1)).toEqual(row3)
  })

  it('con due soli pannelli ruota la divisione', () => {
    expect(rotatePair(splitPane(leaf('a'), 'a', 'b', 'row'), [], 1)).toMatchObject({ kind: 'split', dir: 'column', sizes: [0.5, 0.5] })
  })

  it('indice fuori dalla divisione: niente', () => {
    expect(rotatePair(row3, [], 0)).toBe(row3)
    expect(rotatePair(leaf('a'), [], 1)).toEqual(leaf('a'))
  })
})

describe('paneLocation', () => {
  const l = splitPane(splitPane(leaf('a'), 'a', 'b', 'row'), 'b', 'c', 'column')
  it('trova la divisione che contiene il pannello e la sua posizione', () => {
    expect(paneLocation(l, 'a')).toEqual({ path: [], index: 0 })
    expect(paneLocation(l, 'c')).toEqual({ path: [1], index: 1 })
    expect(paneLocation(leaf('a'), 'a')).toBeNull()
  })
})
