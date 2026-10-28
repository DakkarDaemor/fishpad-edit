import { EditorState, type Extension } from '@codemirror/state'
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
 * - controllo della sintassi JSON e PHP e dei tipi TypeScript/TSX, con gli errori nel margine;
 * - in TypeScript/TSX, suggerimenti del compilatore e tipo sotto il mouse.
 */
export async function webExtensions(lang: string | null): Promise<Extension> {
  if (!lang) return []
  const exts: Extension[] = []
  const syntax = EMMET_SYNTAX[lang]
  if (syntax) {
    const { abbreviationTracker, expandAbbreviation, EmmetKnownSyntax } = await import('@emmetio/codemirror6-plugin')
    exts.push(
      abbreviationTracker({
        syntax: syntax as (typeof EmmetKnownSyntax)[keyof typeof EmmetKnownSyntax],
        // in JSX i tag vuoti vanno chiusi (`<br />`): di default Emmet scrive `<br>`, che non compila
        config: { jsx: { options: { 'output.selfClosingStyle': 'xhtml' } }, tsx: { options: { 'output.selfClosingStyle': 'xhtml' } } },
      }),
      keymap.of([{ key: 'Mod-e', run: expandAbbreviation }]),
    )
  }
  if (COLOR_LANGS.has(lang)) exts.push((await import('./colors')).colorSwatches)
  if (lang === 'Markdown') exts.push((await import('./markdownEdit')).markdownKeymap)
  if (lang === 'JSON') {
    const [{ jsonParseLinter }, { linter, lintGutter }] = await Promise.all([import('@codemirror/lang-json'), import('@codemirror/lint')])
    exts.push(linter(jsonParseLinter(), { delay: 300 }), lintGutter())
  }
  if (lang === 'PHP') {
    const [{ phpLintSource }, { linter, lintGutter }] = await Promise.all([import('./phpLint'), import('@codemirror/lint')])
    exts.push(linter(phpLintSource, { delay: 500 }), lintGutter())
  }
  if (lang === 'TypeScript' || lang === 'TSX') {
    const [{ typeLintSource, typeCheckChanged, typeCompletionSource, typeHover }, { linter, lintGutter }] = await Promise.all([
      import('./typeLint'),
      import('@codemirror/lint'),
    ])
    // una sola istanza: CodeMirror riconosce i risultati di una sorgente confrontandola per identità
    const complete = typeCompletionSource(lang)
    exts.push(
      linter(typeLintSource(lang), { delay: 500, needsRefresh: typeCheckChanged }),
      lintGutter(),
      typeHover(lang),
      EditorState.languageData.of(() => [{ autocomplete: complete }]),
    )
  }
  return exts
}
