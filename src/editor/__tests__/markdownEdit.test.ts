// @vitest-environment happy-dom
import { EditorSelection, EditorState } from '@codemirror/state'
import { EditorView, type Command } from '@codemirror/view'
import { describe, expect, it } from 'vitest'
import { insertLink, toggleCode, toggleHeading, toggleInline, toggleLines } from '../markdownEdit'

/** Esegue il comando su `doc`, dove [ e ] segnano la selezione (| il cursore); restituisce il testo con la selezione nuova. */
function apply(cmd: Command, doc: string) {
  const from = doc.search(/[[|]/)
  const plain = doc.replace(/[[\]|]/g, '')
  const to = doc.includes('|') ? from : doc.indexOf(']') - 1
  const view = new EditorView({ state: EditorState.create({ doc: plain, selection: EditorSelection.range(from, to) }), parent: document.body })
  cmd(view)
  const { from: f, to: t } = view.state.selection.main
  const out = view.state.doc.toString()
  view.destroy()
  return f === t ? out.slice(0, f) + '|' + out.slice(f) : out.slice(0, f) + '[' + out.slice(f, t) + ']' + out.slice(t)
}

describe('formattazione in linea', () => {
  const bold = toggleInline('**')
  const italic = toggleInline('*')
  it('mette e toglie il grassetto sulla selezione', () => {
    expect(apply(bold, 'un [testo] qui')).toBe('un **[testo]** qui')
    expect(apply(bold, 'un **[testo]** qui')).toBe('un [testo] qui')
    expect(apply(bold, 'un [**testo**] qui')).toBe('un [testo] qui')
  })
  it('senza selezione prende la parola, o mette i segni vuoti', () => {
    expect(apply(bold, 'un te|sto')).toBe('un **[testo]**')
    expect(apply(bold, 'fine |')).toBe('fine **|**')
  })
  it('non scambia il grassetto per un corsivo', () => {
    expect(apply(italic, '**[testo]**')).toBe('***[testo]***')
    expect(apply(italic, '***[testo]***')).toBe('**[testo]**')
    expect(apply(bold, '***[testo]***')).toBe('*[testo]*')
  })
})

describe('righe', () => {
  it('titoli: mette, cambia livello, toglie', () => {
    expect(apply(toggleHeading(2), 'Tito|lo')).toBe('## Tito|lo')
    expect(apply(toggleHeading(1), '## Tito|lo')).toBe('# Tito|lo')
    expect(apply(toggleHeading(1), '# Tito|lo')).toBe('Tito|lo')
  })
  it('elenchi: numera, cambia tipo, toglie, tiene il rientro', () => {
    expect(apply(toggleLines('ordered'), '[a\nb]')).toBe('1. [a\n2. b]')
    expect(apply(toggleLines('bullet'), '1. [a\n2. b]')).toBe('- [a\n- b]')
    expect(apply(toggleLines('bullet'), '- [a\n- b]')).toBe('[a\nb]')
    expect(apply(toggleLines('task'), '  - vo|ce')).toBe('  - [ ] vo|ce')
  })
})

describe('codice e link', () => {
  it('codice in linea su una riga, blocco su più righe', () => {
    expect(apply(toggleCode, 'usa [npm] qui')).toBe('usa `[npm]` qui')
    expect(apply(toggleCode, '[a\nb]')).toBe('```\n[a\nb]\n```')
    expect(apply(toggleCode, '```\n[a\nb]\n```')).toBe('[a\nb]')
  })
  it('link: seleziona l\'indirizzo da scrivere, o usa l\'URL selezionato', () => {
    expect(apply(insertLink, 'vedi [qui]')).toBe('vedi [qui]([https://])')
    expect(apply(insertLink, '[https://a.it]')).toBe('[|](https://a.it)')
  })
})
