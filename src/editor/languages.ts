import { LanguageDescription, StreamLanguage, type LanguageSupport } from '@codemirror/language'
import { languages } from '@codemirror/language-data'

export const languageNames: string[] = languages
  .map((l) => l.name)
  .sort((a, b) => a.localeCompare(b, 'it', { sensitivity: 'base' }))

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
