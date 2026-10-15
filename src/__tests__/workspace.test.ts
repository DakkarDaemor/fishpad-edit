import { describe, expect, it } from 'vitest'
import { parseWorkspacePath } from '../workspace'

describe('parseWorkspacePath', () => {
  it('divide il percorso in cartelle e nome del file', () => {
    expect(parseWorkspacePath('note/2026/oggi.md')).toEqual(['note', '2026', 'oggi.md'])
  })

  it('ignora barre iniziali, finali e doppie e gli spazi attorno ai segmenti', () => {
    expect(parseWorkspacePath(' /note// oggi.md / ')).toEqual(['note', 'oggi.md'])
  })

  it('rifiuta un nome vuoto', () => {
    expect(() => parseWorkspacePath(' / ')).toThrow('Il nome è vuoto')
  })

  it('rifiuta i segmenti non validi indicando quale', () => {
    expect(() => parseWorkspacePath('note/a:b.txt')).toThrow('"a:b.txt"')
    expect(() => parseWorkspacePath('../segreto.txt')).toThrow('".."')
  })
})
