import { describe, expect, it } from 'vitest'
import { MAX_CONTEXT_CHARS, buildSystemPrompt, contextLabel } from '../context'

describe('buildSystemPrompt', () => {
  it('include nome, linguaggio e contenuto', () => {
    const r = buildSystemPrompt({ name: 'a.ts', lang: 'TypeScript', content: 'const a = 1' })
    expect('system' in r && r.system).toContain('"a.ts" (TypeScript)')
    expect('system' in r && r.system).toContain('```typescript\nconst a = 1\n```')
  })

  it('il recinto è più lungo dei backtick nel file', () => {
    const r = buildSystemPrompt({ name: 'r.md', lang: 'Markdown', content: '````\nx\n````' })
    expect('system' in r && r.system).toContain('`````markdown\n````\nx\n````\n`````')
  })

  it('aggiunge la selezione', () => {
    const r = buildSystemPrompt({ name: 'a.js', lang: null, content: 'a\nb', selection: { text: 'b', fromLine: 2, toLine: 2 } })
    expect('system' in r && r.system).toContain('righe 2-2')
  })

  it('file troppo lungo: solo la selezione, o un errore', () => {
    const content = 'x'.repeat(MAX_CONTEXT_CHARS + 1)
    expect(buildSystemPrompt({ name: 'big.txt', lang: null, content })).toHaveProperty('error')
    const r = buildSystemPrompt({ name: 'big.txt', lang: null, content, selection: { text: 'sel', fromLine: 1, toLine: 1 } })
    expect('system' in r && r.system).toContain('sel')
    expect('system' in r && r.system.length).toBeLessThan(1000)
  })
})

describe('contextLabel', () => {
  it('nome e righe selezionate', () => {
    expect(contextLabel({ name: 'a', lang: null, content: '' })).toBe('a')
    expect(contextLabel({ name: 'a', lang: null, content: '', selection: { text: 'x', fromLine: 3, toLine: 5 } })).toBe('a, righe 3–5')
  })
})
