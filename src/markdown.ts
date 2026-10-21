import type { Marked, MarkedExtension } from 'marked'

/**
 * Grassetto anche dove la regola di CommonMark lo esclude: `**Voce:**testo` (punteggiatura prima della chiusura e
 * lettera subito dopo) resterebbe con gli asterischi, e nei titoli ed elenchi scritti a mano o dai modelli è frequente.
 * Solo su una riga e senza altri asterischi dentro: i casi annidati restano alla regola normale.
 */
export const looseStrong: MarkedExtension = {
  extensions: [
    {
      name: 'looseStrong',
      level: 'inline',
      // non dopo una barra: \** è un asterisco con escape
      start: (src) => src.search(/(?<!\\)\*\*/),
      tokenizer(src) {
        const m = /^\*\*(?![\s*])([^*\n]*?[^\s*])\*\*(?!\*)/.exec(src)
        if (m) return { type: 'strong', raw: m[0], text: m[1], tokens: this.lexer.inlineTokens(m[1]) }
      },
    },
  ],
}

let shared: Promise<Marked> | undefined

/** Parser GFM per anteprima e Novità, caricato al primo uso. */
export const loadMarked = () =>
  (shared ??= import('marked').then(({ Marked }) => new Marked({ gfm: true }, looseStrong)))
