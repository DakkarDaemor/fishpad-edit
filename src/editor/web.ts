import type { Extension } from '@codemirror/state'
import { keymap } from '@codemirror/view'

/** Sintassi Emmet per i linguaggi di @codemirror/language-data (e JSX/TSX). */
const EMMET_SYNTAX: Record<string, string> = {
  HTML: 'html',
  XML: 'xml',
  Vue: 'vue',
  JSX: 'jsx',
  TSX: 'tsx',
  Pug: 'pug',
  CSS: 'css',
  SCSS: 'scss',
  Sass: 'sass',
  LESS: 'less',
  Stylus: 'stylus',
}

/** Linguaggi in cui mostrare i quadratini dei colori CSS. */
const COLOR_LANGS = new Set(['CSS', 'SCSS', 'Sass', 'LESS', 'Stylus', 'HTML', 'Vue'])

/**
 * Strumenti per lo sviluppo web legati al linguaggio, caricati solo quando servono:
 * - Emmet: abbreviazioni espanse con Tab (in JSX/TSX iniziano con `<`), Ctrl+E per forzarle;
 * - quadratini dei colori CSS con selettore;
 * - controllo della sintassi JSON, con gli errori nel margine.
 */
export async function webExtensions(lang: string | null): Promise<Extension> {
  if (!lang) return []
  const exts: Extension[] = []
  const syntax = EMMET_SYNTAX[lang]
  if (syntax) {
    const { abbreviationTracker, expandAbbreviation, EmmetKnownSyntax } = await import('@emmetio/codemirror6-plugin')
    exts.push(
      abbreviationTracker({ syntax: syntax as (typeof EmmetKnownSyntax)[keyof typeof EmmetKnownSyntax] }),
      keymap.of([{ key: 'Mod-e', run: expandAbbreviation }]),
    )
  }
  if (COLOR_LANGS.has(lang)) exts.push((await import('./colors')).colorSwatches)
  if (lang === 'JSON') {
    const [{ jsonParseLinter }, { linter, lintGutter }] = await Promise.all([import('@codemirror/lang-json'), import('@codemirror/lint')])
    exts.push(linter(jsonParseLinter(), { delay: 300 }), lintGutter())
  }
  return exts
}
