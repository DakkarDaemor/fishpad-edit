import type { Transform } from 'sucrase'

/** console: output testuale (worker); preview: pagina visibile nel pannello Anteprima. */
export type RunTarget = 'console' | 'preview'

// Nomi dei linguaggi di @codemirror/language-data
const TARGETS: Record<string, RunTarget> = {
  JavaScript: 'console',
  TypeScript: 'console',
  JSX: 'preview',
  TSX: 'preview',
  HTML: 'preview',
  Markdown: 'preview',
}

/** Dove va eseguito un documento di questo linguaggio, o null se non è eseguibile. */
export const runTarget = (lang: string | null | undefined): RunTarget | null => TARGETS[lang ?? ''] ?? null

export const isRunnable = (lang: string | null | undefined) => runTarget(lang) !== null

/** true per i linguaggi che girano con React nell'anteprima. */
export const usesReact = (lang: string | null | undefined) => lang === 'JSX' || lang === 'TSX'

const TRANSFORMS: Record<string, Transform[]> = {
  TypeScript: ['typescript'],
  // `imports` porta import/export a require/exports: i moduli disponibili sono quelli di react-vendor.ts
  JSX: ['jsx', 'imports'],
  TSX: ['typescript', 'jsx', 'imports'],
}

/** Errore di compilazione, con la riga relativa al codice passato. */
export class CompileError extends Error {
  readonly line?: number

  constructor(message: string, line?: number) {
    super(message)
    this.name = 'SyntaxError'
    this.line = line
  }
}

/**
 * Porta il codice a JavaScript eseguibile.
 * sucrase toglie solo i tipi (nessun controllo) e conserva i numeri di riga, quindi le righe
 * degli errori a runtime restano quelle del file. Viene caricato al primo uso.
 */
export async function toJavaScript(code: string, lang: string | null): Promise<string> {
  const transforms = TRANSFORMS[lang ?? '']
  if (!transforms) return code
  const { transform } = await import('sucrase')
  try {
    return transform(code, { transforms, disableESTransforms: true, jsxRuntime: 'automatic', production: true }).code
  } catch (err) {
    const e = err as Error & { loc?: { line: number } }
    throw new CompileError(e.message.replace(/\s*\(\d+:\d+\)$/, ''), e.loc?.line)
  }
}
