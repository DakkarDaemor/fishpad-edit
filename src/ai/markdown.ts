import { Marked } from 'marked'
import { looseStrong } from '../markdown'

export type ChatBlock = { kind: 'html'; html: string } | { kind: 'code'; lang: string; code: string }

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/**
 * Markdown delle risposte, reso innocuo: la pagina dell'app vede le chiavi API, quindi l'HTML scritto dal modello
 * (o copiato da un file preso dal web) si mostra come testo, i link valgono solo se http(s)/mailto e le immagini
 * non vengono caricate (potrebbero mandare dati a un server esterno).
 */
const md = new Marked({ gfm: true }, looseStrong)
md.use({
  renderer: {
    html: ({ text }) => escapeHtml(text),
    link({ href, tokens }) {
      const inner = this.parser.parseInline(tokens)
      return /^(https?:|mailto:)/i.test(href) ? `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${inner}</a>` : inner
    },
    image: ({ text }) => escapeHtml(text),
  },
})

/** Divide la risposta in parti: i blocchi di codice a parte (per i pulsanti Copia / Inserisci / Confronta), il resto in HTML. */
export function chatBlocks(text: string): ChatBlock[] {
  const out: ChatBlock[] = []
  let pending: ReturnType<typeof md.lexer> = Object.assign([], { links: {} })
  const flush = () => {
    if (!pending.length) return
    out.push({ kind: 'html', html: md.parser(pending) })
    pending = Object.assign([], { links: pending.links })
  }
  const tokens = md.lexer(text)
  pending.links = tokens.links
  for (const t of tokens) {
    if (t.type === 'code') {
      flush()
      out.push({ kind: 'code', lang: t.lang ?? '', code: t.text })
    } else {
      pending.push(t)
    }
  }
  flush()
  return out
}
