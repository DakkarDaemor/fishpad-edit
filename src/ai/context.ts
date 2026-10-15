/** La tab attiva al momento della domanda. */
export interface TabContext {
  name: string
  lang: string | null
  content: string
  /** selezione non vuota, con le righe (da 1) in cui cade */
  selection?: { text: string; fromLine: number; toLine: number }
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
  return { system }
}

/** Descrizione breve del contesto, mostrata sopra la chat. */
export function contextLabel(tab: TabContext) {
  const sel = tab.selection
  if (!sel) return tab.name
  return sel.fromLine === sel.toLine ? `${tab.name}, riga ${sel.fromLine}` : `${tab.name}, righe ${sel.fromLine}–${sel.toLine}`
}
