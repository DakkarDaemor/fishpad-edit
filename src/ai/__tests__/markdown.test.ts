import { describe, expect, it } from 'vitest'
import { chatBlocks } from '../markdown'

const html = (text: string) =>
  chatBlocks(text)
    .map((b) => (b.kind === 'html' ? b.html : ''))
    .join('')

describe('chatBlocks', () => {
  it('separa i blocchi di codice dal testo', () => {
    const blocks = chatBlocks('Ecco:\n\n```ts\nconst a = 1\n```\n\nFatto.')
    expect(blocks.map((b) => b.kind)).toEqual(['html', 'code', 'html'])
    expect(blocks[1]).toEqual({ kind: 'code', lang: 'ts', code: 'const a = 1' })
  })

  it("l'HTML scritto dal modello resta testo", () => {
    expect(html('<img src=x onerror="alert(1)">')).not.toContain('<img')
    expect(html('ciao <script>alert(1)</script>')).not.toContain('<script')
  })

  it('niente link javascript: e niente immagini esterne', () => {
    expect(html('[clic](javascript:alert(1))')).not.toContain('<a')
    expect(html('![x](https://evil.test/p.png)')).not.toContain('<img')
    expect(html('[doc](https://example.com)')).toContain('<a href="https://example.com" target="_blank" rel="noopener noreferrer">doc</a>')
  })

  it('i link a riferimento funzionano anche dopo un blocco di codice', () => {
    expect(html('```\nx\n```\n\nVedi [qui][1].\n\n[1]: https://example.com')).toContain('href="https://example.com"')
  })
})
