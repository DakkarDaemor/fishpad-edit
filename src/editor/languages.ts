import { LanguageDescription, LanguageSupport, StreamLanguage } from '@codemirror/language'
import { languages as dataLanguages } from '@codemirror/language-data'

// language-data non ha il CSV: testo semplice, serve per riconoscerlo e aprirne l'anteprima
const csv = LanguageDescription.of({
  name: 'CSV',
  extensions: ['csv', 'tsv'],
  load: async () => new LanguageSupport(StreamLanguage.define({ token: (s) => (s.skipToEnd(), null) })),
})
const languages = [...dataLanguages, csv]

export const languageNames: string[] = languages
  .map((l) => l.name)
  .sort((a, b) => a.localeCompare(b, 'it', { sensitivity: 'base' }))

/** In cima alla scelta del linguaggio, nell'ordine; sotto, gli altri in ordine alfabetico. */
export const commonLanguages = ['JavaScript', 'TypeScript', 'HTML', 'CSS', 'JSON', 'Markdown', 'JSX', 'TSX', 'PHP', 'Python', 'SQL', 'YAML', 'XML', 'CSV', 'Shell']
export const otherLanguages = languageNames.filter((n) => !commonLanguages.includes(n))

/** Scelta del linguaggio: gli ultimi scelti, poi testo semplice ('') e i più usati, poi gli altri in ordine alfabetico. */
export function languageChoices(recent: readonly string[]) {
  const known = recent.filter((l) => l === '' || languageNames.includes(l))
  return [...new Set([...known, '', ...commonLanguages, ...otherLanguages])]
}

/** Mette `lang` in testa agli ultimi scelti, senza doppioni, al massimo 5. */
export const pushRecentLanguage = (recent: readonly string[], lang: string) => [lang, ...recent.filter((l) => l !== lang)].slice(0, 5)

export function detectByFilename(filename: string): string | null {
  return LanguageDescription.matchFilename(languages, filename)?.name ?? null
}

export { detectByContent } from './detect'

/** Estensione suggerita per "Salva con nome" di un file senza nome. */
export function extensionFor(name: string | null): string {
  const ext = name ? languages.find((l) => l.name === name)?.extensions[0] : undefined
  return ext ? `.${ext}` : '.txt'
}

const cache = new Map<string, LanguageSupport>()

export interface LoadedLanguage {
  support: LanguageSupport
  /** true = linguaggio "legacy" senza albero sintattico: il folding usa l'indentazione */
  legacy: boolean
}

export async function loadLanguage(name: string): Promise<LoadedLanguage | null> {
  const desc = languages.find((l) => l.name === name)
  if (!desc) return null
  let support = cache.get(name)
  if (!support) {
    support = await desc.load()
    cache.set(name, support)
  }
  return { support, legacy: support.language instanceof StreamLanguage }
}
