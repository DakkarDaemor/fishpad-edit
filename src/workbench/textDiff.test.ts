import { describe, expect, it } from 'vitest'
import { diffRange } from './textDiff'

const apply = (a: string, d: ReturnType<typeof diffRange>) => (d ? a.slice(0, d.from) + d.insert + a.slice(d.to) : a)

describe('diffRange', () => {
  it('null se i testi sono uguali', () => {
    expect(diffRange('abc', 'abc')).toBeNull()
  })

  it('limita la modifica alla parte cambiata', () => {
    expect(diffRange('uno due tre', 'uno DUE tre')).toEqual({ from: 4, to: 7, insert: 'DUE' })
  })

  it('gestisce inserimenti e cancellazioni, anche con caratteri ripetuti', () => {
    for (const [a, b] of [
      ['aaa', 'aaaa'],
      ['aaaa', 'aa'],
      ['', 'x'],
      ['x', ''],
      ['abcabc', 'abc'],
      ['ab', 'ba'],
    ]) {
      expect(apply(a, diffRange(a, b))).toBe(b)
    }
  })
})
