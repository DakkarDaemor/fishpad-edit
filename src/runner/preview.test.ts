import { describe, expect, it } from 'vitest'
import { htmlDocument, reactDocument } from './preview'
import { buildWorkerSource } from './sandbox'

describe('htmlDocument', () => {
  it('inserisce il bridge dopo il doctype senza aggiungere righe', () => {
    const html = '<!DOCTYPE html>\n<html>\n<body><script>boom()</script></body>\n</html>'
    const doc = htmlDocument(html)
    expect(doc.startsWith('<!DOCTYPE html><script src="data:text/javascript')).toBe(true)
    expect(doc.split('\n')).toHaveLength(html.split('\n').length)
    expect(doc.split('\n')[2]).toBe('<body><script>boom()</script></body>')
  })

  it('senza doctype mette il bridge in testa', () => {
    expect(htmlDocument('<p>ciao</p>')).toMatch(/^<script src="data:[^"]*"><\/script><p>ciao<\/p>$/)
  })
})

describe('allineamento delle righe', () => {
  it('worker: OFFSET indica la riga prima del codice utente', () => {
    const { source, offset } = buildWorkerSource('first()\nsecond()')
    const lines = source.split('\n')
    expect(lines[offset]).toBe('first()')
    expect(lines[offset + 1]).toBe('second()')
    expect(source).toContain(`OFFSET = ${offset},`)
  })

  it('react: OFFSET indica la riga prima del codice utente', async () => {
    const doc = await reactDocument('first()\nsecond()', 2)
    const lines = doc.split('\n')
    const offset = Number(/OFFSET%20%3D%20(\d+)/.exec(doc)![1])
    expect(lines[offset]).toBe('first()')
    expect(lines[offset + 1]).toBe('second()')
  })

  it('react: niente </script> che chiuda in anticipo gli script inline', async () => {
    const doc = await reactDocument('console.log("</script>")', 1)
    expect(doc).toContain(String.raw`console.log("<\/script>")`)
    expect(doc).not.toContain('console.log("</script>")')
  })
})
