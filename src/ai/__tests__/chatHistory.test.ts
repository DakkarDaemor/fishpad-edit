import { describe, expect, it } from 'vitest'
import { MAX_CHATS, summarize, upsert, type ChatSummary } from '../chatHistory'

describe('summarize', () => {
  it('titolo dalla prima domanda, modelli e file senza ripetizioni', () => {
    const s = summarize(
      {
        id: 'c1',
        entries: [
          { role: 'user', content: "  C'è un\nbug?  ", context: 'app.ts, righe 3–5' },
          { role: 'assistant', content: 'sì', provider: 'Groq', model: 'llama', time: 1 },
          { role: 'user', content: 'e qui?', context: 'app.ts' },
          { role: 'assistant', content: 'no', provider: 'Groq', model: 'llama', time: 2 },
          { role: 'user', content: 'altro', context: 'style.css, riga 2' },
          { role: 'assistant', content: 'ok', provider: 'Anthropic', model: 'claude-opus-5-5', time: 3 },
        ],
      },
      100,
    )
    expect(s).toEqual({ id: 'c1', title: "C'è un bug?", updated: 100, models: ['Groq · llama', 'Anthropic · claude-opus-5-5'], files: ['app.ts', 'style.css'] })
  })

  it('accorcia i titoli lunghi', () => {
    expect(summarize({ id: 'c', entries: [{ role: 'user', content: 'x'.repeat(200) }] }).title).toHaveLength(80)
  })
})

describe('upsert', () => {
  const s = (id: string): ChatSummary => ({ id, title: id, updated: 0, models: [], files: [] })

  it("porta in cima la chat aggiornata senza duplicarla", () => {
    expect(upsert([s('a'), s('b')], s('b')).index.map((c) => c.id)).toEqual(['b', 'a'])
  })

  it('oltre il limite toglie le più vecchie', () => {
    const index = Array.from({ length: MAX_CHATS }, (_, i) => s(`c${i}`))
    const r = upsert(index, s('new'))
    expect(r.index).toHaveLength(MAX_CHATS)
    expect(r.drop).toEqual([`c${MAX_CHATS - 1}`])
  })
})
