import { afterEach, describe, expect, it, vi } from 'vitest'
import { blockedAsMixedContent, fetchUrl, formatHeaders, languageFor, parseHeaders, parseUrl, tabNameFor } from './remote'

describe('parseHeaders', () => {
  it('legge "Nome: valore" uno per riga, saltando righe vuote e commenti', () => {
    expect(parseHeaders('Authorization: Bearer a:b\n\n# commento\r\nAccept:application/json ')).toEqual([
      ['Authorization', 'Bearer a:b'],
      ['Accept', 'application/json'],
    ])
  })

  it('segnala la riga sbagliata', () => {
    expect(() => parseHeaders('Accept: x\nsenza due punti')).toThrow('riga 2')
    expect(() => parseHeaders(': valore')).toThrow('riga 1')
    expect(() => parseHeaders('Nome con spazi: x')).toThrow('riga 1')
  })

  it('formatHeaders è l\'inverso', () => {
    const h: Array<[string, string]> = [['A', '1'], ['B', 'x: y']]
    expect(parseHeaders(formatHeaders(h))).toEqual(h)
    expect(formatHeaders(undefined)).toBe('')
  })
})

describe('parseUrl', () => {
  it('aggiunge https, o http per localhost', () => {
    expect(parseUrl(' api.example.com/v1 ').href).toBe('https://api.example.com/v1')
    expect(parseUrl('localhost:3000/api').href).toBe('http://localhost:3000/api')
    expect(parseUrl('127.0.0.1:8080').href).toBe('http://127.0.0.1:8080/')
    expect(parseUrl('http://example.com').protocol).toBe('http:')
  })

  it('rifiuta URL vuoti, non validi o non http', () => {
    expect(() => parseUrl('  ')).toThrow()
    expect(() => parseUrl('http://')).toThrow('non valido')
    expect(() => parseUrl('ftp://example.com')).toThrow('http')
  })
})

describe('blockedAsMixedContent', () => {
  it('blocca http da una pagina https, tranne localhost', () => {
    expect(blockedAsMixedContent(new URL('http://example.com'), 'https:')).toBe(true)
    expect(blockedAsMixedContent(new URL('http://localhost:3000'), 'https:')).toBe(false)
    expect(blockedAsMixedContent(new URL('http://127.0.0.1'), 'https:')).toBe(false)
    expect(blockedAsMixedContent(new URL('http://example.com'), 'http:')).toBe(false)
    expect(blockedAsMixedContent(new URL('https://example.com'), 'https:')).toBe(false)
  })
})

describe('languageFor', () => {
  const url = new URL('https://x.test/api/items')
  it('usa il Content-Type', () => {
    expect(languageFor('application/json; charset=utf-8', url)).toBe('JSON')
    expect(languageFor('application/problem+json', url)).toBe('JSON')
    expect(languageFor('text/html', url)).toBe('HTML')
    expect(languageFor('application/atom+xml', url)).toBe('XML')
    expect(languageFor('text/javascript', url)).toBe('JavaScript')
    expect(languageFor('application/yaml', url)).toBe('YAML')
  })

  it('altrimenti il nome nel percorso, poi lascia decidere al contenuto', () => {
    expect(languageFor('text/plain', new URL('https://x.test/data/config.json'))).toBe('JSON')
    expect(languageFor('', url)).toBeUndefined()
  })
})

describe('tabNameFor', () => {
  it("ultimo pezzo del percorso con l'host, o solo l'host", () => {
    expect(tabNameFor(new URL('https://api.github.com/users/octocat?x=1'))).toBe('octocat (api.github.com)')
    expect(tabNameFor(new URL('http://localhost:3000/'))).toBe('localhost:3000')
    expect(tabNameFor(new URL('https://x.test/a%20b/'))).toBe('a b (x.test)')
  })
})

describe('fetchUrl', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('restituisce testo ed esito, anche per le risposte di errore', async () => {
    const fetchMock = vi.fn(async () => new Response('{"a":1}', { status: 404, statusText: 'Not Found', headers: { 'content-type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)
    const got = await fetchUrl({ url: 'https://x.test/a', headers: [['X-Key', 'k']] }, 'https:')
    expect(got.text).toBe('{"a":1}')
    expect(got.response).toMatchObject({ status: 404, statusText: 'Not Found', contentType: 'application/json' })
    expect(fetchMock.mock.calls[0]).toMatchObject([new URL('https://x.test/a'), { headers: [['X-Key', 'k']], cache: 'no-store' }])
  })

  it('spiega gli errori di rete (CORS, server spento)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))))
    await expect(fetchUrl({ url: 'https://x.test/a' }, 'https:')).rejects.toThrow('CORS')
    await expect(fetchUrl({ url: 'http://localhost:3000' }, 'https:')).rejects.toThrow('rete locale')
  })

  it('non prova nemmeno gli URL http da una pagina https', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    await expect(fetchUrl({ url: 'http://example.com' }, 'https:')).rejects.toThrow('https://example.com')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
