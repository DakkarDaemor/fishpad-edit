import { describe, expect, it } from 'vitest'
import { sharedUrl } from './share'

describe('sharedUrl', () => {
  it('usa il campo url', () => {
    expect(sharedUrl({ url: 'https://example.com/api' })).toBe('https://example.com/api')
  })

  it("prende l'URL dal testo, dove lo mettono molte app", () => {
    expect(sharedUrl({ text: '  https://example.com/data.json\n' })).toBe('https://example.com/data.json')
  })

  it('preferisce il campo url al testo', () => {
    expect(sharedUrl({ url: 'https://a.example', text: 'https://b.example' })).toBe('https://a.example')
  })

  it('ignora testo che non è solo un URL, e gli indirizzi non http', () => {
    expect(sharedUrl({ text: 'guarda https://example.com' })).toBeNull()
    expect(sharedUrl({ text: 'ftp://example.com/file' })).toBeNull()
    expect(sharedUrl({})).toBeNull()
  })
})
