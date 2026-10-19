import { describe, expect, it } from 'vitest'
import { MAX_PER_DOC, MAX_TOTAL, prune, sizeLabel, versionLabel, type Version } from '../history'

const v = (docId: string, time: number): Version => ({ id: `${docId}-${time}`, docId, name: docId, time, reason: 'salvato', size: 1 })

describe('prune', () => {
  it('tiene le più recenti per documento', () => {
    const index = Array.from({ length: MAX_PER_DOC + 5 }, (_, i) => v('a', i))
    const { keep, drop } = prune([...index, v('b', 0)])
    expect(keep.filter((x) => x.docId === 'a')).toHaveLength(MAX_PER_DOC)
    expect(keep.some((x) => x.docId === 'b')).toBe(true)
    expect(drop.map((x) => x.time).sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4])
  })

  it('rispetta il limite totale, togliendo le più vecchie', () => {
    const index = Array.from({ length: MAX_TOTAL + 3 }, (_, i) => v(`d${i}`, i))
    const { keep, drop } = prune(index)
    expect(keep).toHaveLength(MAX_TOTAL)
    expect(drop.map((x) => x.time)).toEqual([2, 1, 0])
  })
})

describe('etichette', () => {
  it("di oggi mostra solo l'ora", () => {
    const now = new Date(2026, 9, 19, 15, 0).getTime()
    expect(versionLabel({ time: new Date(2026, 9, 19, 9, 5).getTime(), reason: 'salvato' }, now)).toBe('09:05 · salvato')
    expect(versionLabel({ time: new Date(2026, 9, 17, 9, 5).getTime(), reason: 'salvato' }, now)).toMatch(/^17 ott/)
  })

  it('dimensione', () => {
    expect(sizeLabel(900)).toBe('900 caratteri')
    expect(sizeLabel(4096)).toBe('4 kB')
  })
})
