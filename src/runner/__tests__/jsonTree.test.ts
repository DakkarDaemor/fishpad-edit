// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { jsonPathLine } from '../jsonPath'
import { jsonDocument } from '../preview'
import { CompileError } from '../transpile'

/** Monta la pagina nel documento di test ed esegue lo script dell'albero. */
function mount(text: string) {
  const html = jsonDocument(text)
  const data = /<script type="application\/json" id="data">([\s\S]*?)<\/script>/.exec(html)![1]
  const script = /<script>([\s\S]*?)<\/script><\/body>/.exec(html)![1]
  document.body.innerHTML = ''
  const holder = document.createElement('script')
  holder.type = 'application/json'
  holder.id = 'data'
  holder.textContent = data
  document.body.append(holder)
  new Function(script)()
  // la radice dell'albero, dopo lo script dei dati
  return document.body.lastElementChild as HTMLElement
}

describe('jsonDocument', () => {
  // V8 dà la posizione solo per alcuni errori (non per un token inatteso): qui manca la virgola
  it('JSON non valido: CompileError con la riga', () => {
    let err: unknown
    try {
      jsonDocument('{\n  "a": 1\n  "b": 2\n}')
    } catch (e) {
      err = e
    }
    expect(err).toBeInstanceOf(CompileError)
    expect((err as CompileError).line).toBe(3)
  })

  it('una stringa con </script> non chiude lo script dei dati', () => {
    const html = jsonDocument('{"x": "</script><b>"}')
    expect(html).not.toContain('</script><b>')
    const body = mount('{"x": "</script><b>"}')
    expect(body.querySelector('.str')!.textContent).toBe('"</script><b>"')
  })

  it('albero: primi livelli aperti, numeri grandi come nel file, figli creati solo all’apertura', () => {
    const body = mount('{"id": 12345678901234567890, "a": {"b": {"c": {"d": true}}}, "list": [], "n": null}')
    expect(body.querySelector('.num')!.textContent).toBe('12345678901234567890')
    expect(body.querySelector(':scope > summary .meta')!.textContent).toBe('{4 chiavi}')
    expect([...body.querySelectorAll('.leaf .meta')].map((e) => e.textContent)).toContain('[]')
    // livello 0 e 1 aperti, il 2 ("b") chiuso: "c" non esiste ancora
    const closed = [...body.querySelectorAll('details')].find((d) => !d.open)!
    expect(closed.querySelector('summary .k')!.textContent).toBe('"b"')
    expect(body.textContent).not.toContain('"c"')
    closed.open = true
    closed.dispatchEvent(new Event('toggle'))
    expect(body.textContent).toContain('"c"')
  })

  it('array lunghi: 500 elementi alla volta', () => {
    const body = mount(JSON.stringify([Array.from({ length: 1200 }, (_, i) => i)]))
    const inner = body.querySelector('details')!
    expect(inner.querySelectorAll(':scope > .leaf')).toHaveLength(500)
    ;(inner.querySelector(':scope > .more') as HTMLButtonElement).click()
    expect(inner.querySelectorAll(':scope > .leaf')).toHaveLength(1000)
  })
})

describe('chiavi cliccabili', () => {
  it('il clic su una chiave manda il percorso, con gli indici degli array come numeri', () => {
    const sent: unknown[] = []
    ;(self as unknown as { __fishpadBridge: object }).__fishpadBridge = { send: (m: unknown) => sent.push(m) }
    const body = mount('{"utenti": [{"nome": "a"}]}')
    ;(body.querySelector('.i') as HTMLElement).click()
    expect(sent).toEqual([{ kind: 'goto', path: ['utenti', 0] }])
    // il clic sulla chiave non apre né chiude il nodo
    expect((body.querySelector('.i')!.closest('details') as HTMLDetailsElement).open).toBe(false)
  })
})

describe('jsonPathLine', () => {
  const text = '{\n  "a": 1,\n  "lista": [\n    10,\n    { "b": true }\n  ],\n  "x\\"y": null\n}'
  it('riga della chiave o dell’elemento', async () => {
    expect(await jsonPathLine(text, [])).toBe(1)
    expect(await jsonPathLine(text, ['a'])).toBe(2)
    expect(await jsonPathLine(text, ['lista', 1])).toBe(5)
    expect(await jsonPathLine(text, ['lista', 1, 'b'])).toBe(5)
    expect(await jsonPathLine(text, ['x"y'])).toBe(7)
  })
  it('undefined se il percorso non esiste più', async () => {
    expect(await jsonPathLine(text, ['nessuno'])).toBeUndefined()
    expect(await jsonPathLine(text, ['lista', 9])).toBeUndefined()
    expect(await jsonPathLine(text, ['a', 'b'])).toBeUndefined()
  })
})
