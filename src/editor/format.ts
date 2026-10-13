import type { Plugin } from 'prettier'
import type { Indent } from './indentation'

type PluginName = 'babel' | 'estree' | 'typescript' | 'postcss' | 'html' | 'markdown' | 'yaml'

// Import statici nelle funzioni: Vite crea un chunk per plugin, scaricato solo quando serve
const PLUGINS: Record<PluginName, () => Promise<Plugin>> = {
  babel: () => import('prettier/plugins/babel'),
  estree: () => import('prettier/plugins/estree') as Promise<Plugin>,
  typescript: () => import('prettier/plugins/typescript'),
  postcss: () => import('prettier/plugins/postcss'),
  html: () => import('prettier/plugins/html'),
  markdown: () => import('prettier/plugins/markdown'),
  yaml: () => import('prettier/plugins/yaml'),
}

const JS: PluginName[] = ['babel', 'estree']
const TS: PluginName[] = ['typescript', 'estree']
// l'HTML può contenere <style> e <script>: servono anche i loro plugin
const MARKUP: PluginName[] = ['html', 'postcss', 'babel', 'estree']

/** Parser Prettier e plugin per ogni linguaggio (nomi di @codemirror/language-data). */
const FORMATTERS: Record<string, { parser: string; plugins: PluginName[] }> = {
  JavaScript: { parser: 'babel', plugins: JS },
  JSX: { parser: 'babel', plugins: JS },
  TypeScript: { parser: 'typescript', plugins: TS },
  TSX: { parser: 'typescript', plugins: TS },
  JSON: { parser: 'json', plugins: JS },
  CSS: { parser: 'css', plugins: ['postcss'] },
  SCSS: { parser: 'scss', plugins: ['postcss'] },
  LESS: { parser: 'less', plugins: ['postcss'] },
  HTML: { parser: 'html', plugins: MARKUP },
  Vue: { parser: 'vue', plugins: MARKUP },
  Markdown: { parser: 'markdown', plugins: ['markdown'] },
  YAML: { parser: 'yaml', plugins: ['yaml'] },
}

export const canFormat = (lang: string | null | undefined) => !!lang && lang in FORMATTERS

/** Formatta con Prettier (caricato al primo uso), rispettando l'indentazione del file. */
export async function formatCode(code: string, lang: string, cursor: number, indent: Indent) {
  const f = FORMATTERS[lang]
  if (!f) throw new Error(`Formattazione non disponibile per ${lang}`)
  const [prettier, ...plugins] = await Promise.all([import('prettier/standalone'), ...f.plugins.map((p) => PLUGINS[p]())])
  return prettier.formatWithCursor(code, {
    parser: f.parser,
    plugins,
    cursorOffset: cursor,
    useTabs: indent.tabs,
    tabWidth: indent.size,
  })
}
