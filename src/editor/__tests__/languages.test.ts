import { describe, expect, it } from 'vitest'
import { commonLanguages, languageChoices, languageNames, otherLanguages, pushRecentLanguage } from '../languages'

describe('elenco dei linguaggi', () => {
  it('i più usati esistono tutti e insieme agli altri li coprono tutti, una volta sola', () => {
    for (const n of commonLanguages) expect(languageNames).toContain(n)
    expect([...commonLanguages, ...otherLanguages].sort()).toEqual([...languageNames].sort())
  })
})

describe('scelta del linguaggio', () => {
  it('mette prima gli ultimi scelti, poi testo semplice e i più usati, poi gli altri, senza doppioni', () => {
    const list = languageChoices(['Rust', 'JSON', 'Inesistente'])
    expect(list.slice(0, 4)).toEqual(['Rust', 'JSON', '', 'JavaScript'])
    expect(list).not.toContain('Inesistente')
    expect(new Set(list).size).toBe(list.length)
    expect(list.length).toBe(languageNames.length + 1)
  })
  it('tiene gli ultimi 5, il più recente in testa', () => {
    expect(pushRecentLanguage(['a', 'b', 'c', 'd', 'e'], 'c')).toEqual(['c', 'a', 'b', 'd', 'e'])
    expect(pushRecentLanguage(['a', 'b', 'c', 'd', 'e'], 'f')).toEqual(['f', 'a', 'b', 'c', 'd'])
  })
})
