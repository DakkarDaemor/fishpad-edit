import { describe, expect, it } from 'vitest'
import { commonLanguages, languageNames, otherLanguages } from '../languages'

describe('elenco dei linguaggi', () => {
  it('i più usati esistono tutti e insieme agli altri li coprono tutti, una volta sola', () => {
    for (const n of commonLanguages) expect(languageNames).toContain(n)
    expect([...commonLanguages, ...otherLanguages].sort()).toEqual([...languageNames].sort())
  })
})
