import { afterEach, describe, expect, it, vi } from 'vitest'
import { CHROME_PROVIDER, DEFAULT_PROVIDERS, cleanKey, createClient, mergeProviders, usableProviders, type AiProvider } from '../providers'

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

describe('client Chrome', () => {
  it('passa sistema e cronologia come prompt iniziali e manda l\'ultima domanda', async () => {
    const session = { prompt: vi.fn().mockResolvedValue('ok'), destroy: vi.fn() }
    const create = vi.fn().mockResolvedValue(session)
    vi.stubGlobal('LanguageModel', { availability: async () => 'available', create })
    const messages = [
      { role: 'user' as const, content: 'a' },
      { role: 'assistant' as const, content: 'b' },
      { role: 'user' as const, content: 'c' },
    ]
    expect(await createClient(CHROME_PROVIDER).chat('gemini-nano', 'sys', messages)).toBe('ok')
    expect(create.mock.calls[0][0].initialPrompts).toEqual([{ role: 'system', content: 'sys' }, ...messages.slice(0, 2)])
    expect(session.prompt).toHaveBeenCalledWith('c', { signal: undefined })
    expect(session.destroy).toHaveBeenCalled()
  })

  it('testo troppo lungo: messaggio comprensibile', async () => {
    const err = Object.assign(new Error('quota'), { name: 'QuotaExceededError' })
    vi.stubGlobal('LanguageModel', { availability: async () => 'available', create: vi.fn().mockRejectedValue(err) })
    await expect(createClient(CHROME_PROVIDER).chat('gemini-nano', 's', [{ role: 'user', content: 'x' }])).rejects.toThrow('troppo lungo')
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

describe('cleanKey', () => {
  it('toglie spazi, "Bearer " e virgolette incollati con la chiave', () => {
    expect(cleanKey('  sk-or-v1-abc \n')).toBe('sk-or-v1-abc')
    expect(cleanKey('Bearer sk-or-v1-abc')).toBe('sk-or-v1-abc')
    expect(cleanKey('"sk-or-v1-abc"')).toBe('sk-or-v1-abc')
    expect(cleanKey("'sk-or-v1-abc'")).toBe('sk-or-v1-abc')
  })
})
