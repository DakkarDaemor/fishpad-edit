import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_PROVIDERS, createClient, mergeProviders, usableProviders, type AiProvider } from '../providers'

const groq: AiProvider = { ...DEFAULT_PROVIDERS.find((p) => p.id === 'groq')!, apiKey: ' k ', models: ['m'] }

afterEach(() => vi.unstubAllGlobals())

describe('client compatibile OpenAI', () => {
  it('manda il prompt di sistema come primo messaggio e legge la risposta', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] })))
    vi.stubGlobal('fetch', fetch)
    const text = await createClient(groq).chat('m', 'sys', [{ role: 'user', content: 'ciao' }])
    expect(text).toBe('ok')
    const [url, init] = fetch.mock.calls[0]
    expect(url).toBe('https://api.groq.com/openai/v1/chat/completions')
    expect(init.headers.Authorization).toBe('Bearer k')
    expect(JSON.parse(init.body).messages).toEqual([
      { role: 'system', content: 'sys' },
      { role: 'user', content: 'ciao' },
    ])
  })

  it("riporta il messaggio d'errore del provider", async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { message: 'Invalid API Key' } }), { status: 401 })))
    await expect(createClient(groq).chat('m', 's', [])).rejects.toThrow('Invalid API Key')
  })

  it('elenca i modelli in ordine', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [{ id: 'b' }, { id: 'a' }] }))))
    expect(await createClient(groq).listModels()).toEqual(['a', 'b'])
  })
})

describe('mergeProviders', () => {
  it('tiene chiavi e modelli salvati e aggiunge i provider nuovi', () => {
    const merged = mergeProviders([{ ...groq, apiKey: 'x', models: ['y'] }])
    expect(merged.map((p) => p.id)).toEqual(DEFAULT_PROVIDERS.map((p) => p.id))
    expect(merged.find((p) => p.id === 'groq')).toMatchObject({ apiKey: 'x', models: ['y'] })
  })

  it('usableProviders: servono chiave e modelli', () => {
    expect(usableProviders(mergeProviders([{ ...groq, apiKey: 'x', models: ['y'] }])).map((p) => p.id)).toEqual(['groq'])
  })
})
