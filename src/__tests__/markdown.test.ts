import { describe, expect, it } from 'vitest'
import { loadMarked } from '../markdown'

const html = async (md: string) => ((await (await loadMarked()).parse(md)) as string).replace(/\n/g, '')

describe('grassetto permissivo', () => {
  it('anche con la punteggiatura prima della chiusura, in titoli ed elenchi', async () => {
    expect(await html('## **Titolo:**sotto')).toBe('<h2><strong>Titolo:</strong>sotto</h2>')
    expect(await html('- **Voce:**testo')).toBe('<ul><li><strong>Voce:</strong>testo</li></ul>')
    expect(await html('1) **(vedi)**qui')).toBe('<ol><li><strong>(vedi)</strong>qui</li></ol>')
  })
  it('lascia com’erano i casi normali, il codice e gli asterischi con escape', async () => {
    expect(await html('**a** e ***b*** e **c *d* e**')).toBe(
      '<p><strong>a</strong> e <em><strong>b</strong></em> e <strong>c <em>d</em> e</strong></p>',
    )
    expect(await html('`**x:**y` \\**z:**w')).not.toContain('<strong>')
    expect(await html('** spazi **')).toBe('<p>** spazi **</p>')
  })
})
