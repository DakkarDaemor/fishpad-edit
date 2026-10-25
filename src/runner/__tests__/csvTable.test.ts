// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { csvDocument, parseCsv } from '../preview'

describe('parseCsv', () => {
  it('virgolette, "" e a capo dentro un campo', () => {
    expect(parseCsv('a,b\r\n"x, y","di ""lui""\nriga 2"\n')).toEqual([
      ['a', 'b'],
      ['x, y', 'di "lui"\nriga 2'],
    ])
  })

  it('separatore dalla prima riga: ; e tab', () => {
    expect(parseCsv('a;b;c,d\n1;2;3,4')).toEqual([['a', 'b', 'c,d'], ['1', '2', '3,4']])
    expect(parseCsv('a\tb\n1\t2')).toEqual([['a', 'b'], ['1', '2']])
  })

  it('campi vuoti e ultima riga senza a capo', () => {
    expect(parseCsv('a,,\n,1')).toEqual([['a', '', ''], ['', '1']])
  })
})

describe('csvDocument', () => {
  it('tabella con intestazione e righe di lunghezza diversa', () => {
    const html = csvDocument('n,v\n1,</script>\n2')
    const data = /<script type="application\/json" id="data">([\s\S]*?)<\/script>/.exec(html)![1]
    const script = /<script>([\s\S]*?)<\/script><\/body>/.exec(html)![1]
    document.body.innerHTML = ''
    const holder = document.createElement('script')
    holder.type = 'application/json'
    holder.id = 'data'
    holder.textContent = data
    document.body.append(holder)
    new Function(script)()
    expect([...document.querySelectorAll('thead th')].map((th) => th.textContent)).toEqual(['', 'n', 'v'])
    const cells = [...document.querySelectorAll('tbody tr')].map((tr) => [...tr.children].map((td) => td.textContent))
    expect(cells).toEqual([
      ['1', '1', '</script>'],
      ['2', '2', ''],
    ])
    expect(document.querySelector('.meta')!.textContent).toBe('2 righe, 2 colonne')
  })
})
