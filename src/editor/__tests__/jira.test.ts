import { describe, expect, it } from 'vitest'
import { jiraToMd, mdToJira } from '../jira'

describe('Markdown → Jira', () => {
  it('converte lo stile in linea', () => {
    expect(mdToJira('**b** *i* _i_ ~~s~~ `a*b*`')).toBe('*b* _i_ _i_ -s- {{a*b*}}')
    expect(mdToJira('[sito](https://x.it/a_b_c) ![](img.png) <https://y.it>')).toBe('[sito|https://x.it/a_b_c] !img.png! [https://y.it]')
  })
  it('converte titoli, citazioni, righe e codice senza toccarne il contenuto', () => {
    expect(mdToJira('# T\n### S ##\n> q\n---\n```js\nconst a = **b**\n```')).toBe(
      'h1. T\nh3. S\nbq. q\n----\n{code:js}\nconst a = **b**\n{code}',
    )
  })
  it('converte gli elenchi annidati e misti', () => {
    expect(mdToJira('- a\n  - b\n    1. c\n- d\n\n1. e')).toBe('* a\n** b\n**# c\n* d\n\n# e')
  })
  it('converte le tabelle', () => {
    expect(mdToJira('| A | B |\n| --- | :-: |\n| 1 | **2** |')).toBe('||A||B||\n|1|*2*|')
  })
  it('tiene le caselle delle task list', () => {
    expect(mdToJira('- [x] fatto\n- [ ] da fare')).toBe('* ☑ fatto\n* ☐ da fare')
  })
  it('converte avvisi e citazioni di più righe', () => {
    expect(mdToJira('> [!WARNING]\n> attento\n\n> uno\n> - due')).toBe('{warning}\nattento\n{warning}\n\n{quote}\nuno\n* due\n{quote}')
  })
  it('passa HTML semplice e note, ed escapa { e [ del testo', () => {
    expect(mdToJira('a<br>b <ins>u</ins> x<sup>2</sup> H<sub>2</sub>O <cite>c</cite>')).toBe('a\\\\b +u+ x^2^ H~2~O ??c??')
    expect(mdToJira('vedi[^1] {x} [y] \\*no\\*\n[^1]: nota')).toBe('vedi^1^ \\{x} \\[y] \\*no\\*\n^1^ nota')
  })
})

describe('Jira → Markdown', () => {
  it('converte lo stile in linea', () => {
    expect(jiraToMd('*b* _i_ -s- {{a*b*}} well-known')).toBe('**b** _i_ ~~s~~ `a*b*` well-known')
    expect(jiraToMd('[sito|https://x.it/a-b-c] !img.png|thumbnail! [https://y.it]')).toBe(
      '[sito](https://x.it/a-b-c) ![](img.png) <https://y.it>',
    )
  })
  it('converte titoli, citazioni, righe e codice', () => {
    expect(jiraToMd('h2. T\nbq. q\n----\n{code:title=a.js|language=js}\n*x*\n{code}\n{noformat}\nn{noformat}')).toBe(
      '## T\n> q\n---\n```js\n*x*\n```\n```\nn\n```',
    )
    expect(jiraToMd('{quote}\nuno\n*due*\n{quote}')).toBe('> uno\n> **due**')
  })
  it('converte elenchi e tabelle', () => {
    expect(jiraToMd('* a\n*# b\n*#* c\n# d')).toBe('- a\n  1. b\n     - c\n1. d')
    expect(jiraToMd('||A||B||\n|1|[t|u]|')).toBe('| A | B |\n| --- | --- |\n| 1 | [t](u) |')
    expect(jiraToMd('|1|2|\n|3|4|')).toBe('|  |  |\n| --- | --- |\n| 1 | 2 |\n| 3 | 4 |')
  })
  it('usa la cosa più vicina per quello che il Markdown non ha', () => {
    expect(jiraToMd('+u+ x^2^ H~2~O ??c?? {color:red}rosso{color} [~mario] [^doc.pdf] a\\\\b')).toBe(
      '<ins>u</ins> x<sup>2</sup> H<sub>2</sub>O <cite>c</cite> rosso @mario doc.pdf a<br>b',
    )
    expect(jiraToMd('{note}\nattento\n{note}\n{panel:title=Titolo|bgColor=#eee}\n* a\n{panel}')).toBe(
      '> [!IMPORTANT]\n> attento\n> **Titolo**\n> - a',
    )
  })
  it('andata e ritorno tiene il testo', () => {
    const md = '# T\n\n- **a** e `b`\n  - [c](https://c.it)\n\n```py\nx = 1\n```\n\n> [!TIP]\n> <ins>u</ins> x<sup>2</sup>'
    expect(jiraToMd(mdToJira(md))).toBe(md)
  })
})
