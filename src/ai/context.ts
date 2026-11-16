/** La tab attiva al momento della domanda. */
export interface TabContext {
  name: string
  lang: string | null
  content: string
  /** selezione non vuota, con le righe (da 1) in cui cade */
  selection?: { text: string; fromLine: number; toLine: number }
  /** le tab in primo piano negli altri pannelli, nell'ordine in cui stanno a schermo */
  others?: OtherTab[]
}

export interface OtherTab {
  name: string
  lang: string | null
  content: string
}

/** Oltre questa lunghezza (circa 50.000 token) il file non si manda: i free tier non reggerebbero. */
export const MAX_CONTEXT_CHARS = 200_000

const fence = (text: string, lang: string | null) => {
  // un recinto più lungo di ogni sequenza di ` nel testo, così il codice non lo può chiudere
  const longest = Math.max(2, ...(text.match(/`+/g) ?? []).map((s) => s.length))
  const ticks = '`'.repeat(longest + 1)
  return `${ticks}${(lang ?? '').toLowerCase()}\n${text}\n${ticks}`
}

/**
 * Prompt di sistema con la tab attiva. Un file troppo lungo non viene troncato di nascosto:
 * se c'è una selezione si manda solo quella, altrimenti si restituisce un errore da mostrare.
 */
export function buildSystemPrompt(tab: TabContext): { system: string } | { error: string } {
  const intro =
    "Sei l'assistente di Fishpad Edit, un editor di testo e codice. Rispondi nella lingua dell'utente, in modo conciso. " +
    'Quando proponi codice da inserire nel file, mettilo in un unico blocco ``` con il linguaggio, senza parti omesse.'
  const kind = tab.lang ? `${tab.lang}` : 'testo semplice'
  const sel = tab.selection

  if (tab.content.length > MAX_CONTEXT_CHARS) {
    if (!sel || sel.text.length > MAX_CONTEXT_CHARS) {
      return { error: `"${tab.name}" è troppo lungo da mandare intero: seleziona la parte su cui vuoi fare domande.` }
    }
    return {
      system: `${intro}\n\nL'utente sta lavorando su "${tab.name}" (${kind}), troppo lungo per mandarlo intero. Questa è la parte selezionata, righe ${sel.fromLine}-${sel.toLine}:\n\n${fence(sel.text, tab.lang)}`,
    }
  }

  let system = `${intro}\n\nL'utente sta lavorando su "${tab.name}" (${kind}). Contenuto attuale:\n\n${fence(tab.content, tab.lang)}`
  if (sel) {
    system += `\n\nL'utente ha selezionato le righe ${sel.fromLine}-${sel.toLine}; se la domanda non dice altro, riguarda questa parte:\n\n${fence(sel.text, tab.lang)}`
  }
  const { included } = splitOthers(tab)
  if (included.length) {
    system += `\n\nIn altri pannelli l'utente ha aperti anche questi file. La domanda riguarda "${tab.name}" se non dice altro.`
    for (const o of included) system += `\n\n"${o.name}" (${o.lang ?? 'testo semplice'}):\n\n${fence(o.content, o.lang)}`
  }
  return { system }
}

/** Le tab degli altri pannelli che stanno nel limite dopo quella attiva (in ordine), e quelle lasciate fuori. */
export function splitOthers(tab: TabContext) {
  // con un file troppo lungo la tab attiva manda solo la selezione
  let used = tab.content.length > MAX_CONTEXT_CHARS ? (tab.selection?.text.length ?? 0) : tab.content.length
  const included: OtherTab[] = []
  const excluded: OtherTab[] = []
  for (const o of tab.others ?? []) {
    if (used + o.content.length > MAX_CONTEXT_CHARS) {
      excluded.push(o)
    } else {
      included.push(o)
      used += o.content.length
    }
  }
  return { included, excluded }
}

/** Descrizione breve del contesto, mostrata sopra la chat. */
export function contextLabel(tab: TabContext) {
  const sel = tab.selection
  let label = !sel ? tab.name : sel.fromLine === sel.toLine ? `${tab.name}, riga ${sel.fromLine}` : `${tab.name}, righe ${sel.fromLine}–${sel.toLine}`
  const { included, excluded } = splitOthers(tab)
  if (included.length) label += ` + ${included.map((o) => o.name).join(', ')}`
  if (excluded.length) label += ` (troppo lunghi, esclusi: ${excluded.map((o) => o.name).join(', ')})`
  return label
}
