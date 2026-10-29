import ts from 'typescript'
import type { TypeLang } from './typeLint'

/**
 * Controllo dei tipi di TypeScript e TSX, eseguito nel worker di typecheck.worker.ts.
 * File system virtuale con:
 * - librerie standard (ESNext + DOM) e tipi di React dai pacchetti dell'app, caricati al primo uso: funzionano offline;
 * - tipi dei pacchetti npm presi da esm.sh (header X-TypeScript-Types), seguendo i loro import, solo se
 *   l'impostazione lo consente (vedi allowNpmTypes); i pacchetti senza tipi (o con la rete assente) diventano `any`.
 */

export interface TypeDiagnostic {
  from: number
  to: number
  severity: 'error' | 'warning' | 'info'
  message: string
}

const LIB_DIR = '/node_modules/typescript/lib/'
const LIBS = import.meta.glob<string>('/node_modules/typescript/lib/lib.*.d.ts', { query: '?raw', import: 'default' })
const REACT_TYPES = import.meta.glob<string>(
  [
    '/node_modules/@types/react/*.d.ts',
    '/node_modules/@types/react/package.json',
    '/node_modules/@types/react-dom/*.d.ts',
    '/node_modules/@types/react-dom/package.json',
    '/node_modules/csstype/index.d.ts',
    '/node_modules/csstype/package.json',
  ],
  { query: '?raw', import: 'default' },
)

const ESM = 'https://esm.sh/'

const OPTIONS: ts.CompilerOptions = {
  target: ts.ScriptTarget.ESNext,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  // ogni file è un modulo: `await` al livello principale, come nella console, e nessun conflitto con i nomi globali
  moduleDetection: ts.ModuleDetectionKind.Force,
  jsx: ts.JsxEmit.ReactJSX,
  strict: true,
  esModuleInterop: true,
  allowImportingTsExtensions: true,
  skipLibCheck: true,
  noEmit: true,
  // niente ricerca di @types nella cartella: i tipi arrivano solo dagli import
  types: [],
}

/** Contenuto dei file .d.ts, per percorso (librerie, React) o URL (esm.sh). */
const files = new Map<string, string>()
/** Pacchetto importato dal codice → URL dei suoi tipi su esm.sh (null: senza tipi) */
const packageTypes = new Map<string, Promise<string | null>>()
const remote = new Set<string>()
let libsLoaded: Promise<void> | undefined
let reactLoaded: Promise<void> | undefined
/** spenta: nessuna richiesta a esm.sh, i pacchetti non ancora caricati restano `any` */
let npmTypes = false

export const allowNpmTypes = (on: boolean) => void (npmTypes = on)

const isUrl = (s: string) => /^https?:\/\//.test(s)
const isRelative = (s: string) => /^\.{0,2}\//.test(s)
/** React, react-dom e i loro sottopercorsi: tipi locali, della versione usata dall'anteprima */
const isReact = (s: string) => /^react(-dom)?(\/|$)/.test(s)
// i tipi di React chiesti da un pacchetto su esm.sh diventano quelli locali: una sola copia di React
const localReact = (url: string) => url.replace(/^https:\/\/esm\.sh\/(?:.*\/)?@types\/(react|react-dom)@[^/]+\//, '/node_modules/@types/$1/')

function loadLibs() {
  // le librerie si richiamano con /// <reference lib="…" />: si caricano tutte quelle raggiunte da quella di default
  const load = async (name: string): Promise<void> => {
    const path = LIB_DIR + name
    if (files.has(path) || !LIBS[path]) return
    files.set(path, '')
    const text = await LIBS[path]()
    files.set(path, text)
    await Promise.all(ts.preProcessFile(text, true, true).libReferenceDirectives.map((r) => load(`lib.${r.fileName.toLowerCase()}.d.ts`)))
  }
  libsLoaded ??= load(ts.getDefaultLibFileName(OPTIONS))
  return libsLoaded
}

function loadReact() {
  reactLoaded ??= Promise.all(Object.entries(REACT_TYPES).map(async ([path, load]) => void files.set(path, await load()))).then(() => {})
  return reactLoaded
}

/**
 * Scarica un .d.ts e, in parallelo, quelli che importa. Un file già visto non si aspetta di nuovo
 * (i .d.ts si importano anche a vicenda): lo aspetta chi l'ha incontrato per primo.
 * Gli errori di rete lasciano il file mancante.
 */
async function loadRemote(url: string): Promise<void> {
  if (remote.has(url)) return
  remote.add(url)
  try {
    const res = await fetch(url)
    if (!res.ok) return
    const text = await res.text()
    files.set(url, text)
    const info = ts.preProcessFile(text, true, true)
    const deps = [...info.importedFiles, ...info.referencedFiles]
      .map((f) => f.fileName)
      .filter((n) => isUrl(n) || isRelative(n))
      .map((n) => localReact(new URL(n, url).href))
      .filter(isUrl)
    await Promise.all(deps.map(loadRemote))
  } catch {
    // rete assente o file non valido: il pacchetto resta con i tipi che si sono potuti caricare
  }
}

function loadPackage(spec: string): Promise<string | null> {
  let p = packageTypes.get(spec)
  if (!p) {
    p = (async () => {
      const from = isUrl(spec) ? spec : ESM + spec
      const res = await fetch(from, { method: 'HEAD' })
      const types = res.ok ? res.headers.get('X-TypeScript-Types') : null
      if (!types) return null
      const url = new URL(types, from).href
      await loadRemote(url)
      return files.has(url) ? url : null
    })().catch(() => null)
    packageTypes.set(spec, p)
  }
  return p
}

const dtsExtension = (path: string) =>
  path.endsWith('.d.mts') ? ts.Extension.Dmts : path.endsWith('.d.cts') ? ts.Extension.Dcts : path.endsWith('.d.ts') ? ts.Extension.Dts : undefined

const SEVERITY = { [ts.DiagnosticCategory.Error]: 'error', [ts.DiagnosticCategory.Warning]: 'warning' } as const

/** Pacchetto importato → URL dei tipi già caricati; pacchetti senza tipi, dichiarati come `any` */
const typed = new Map<string, string>()
const untyped = new Set<string>()
/** File che cambiano (il codice delle tab, /untyped.d.ts), con la versione per il language service */
const texts = new Map<string, string>()
const versions = new Map<string, number>()
let roots: string[] = []

const read = (f: string) => texts.get(f) ?? files.get(f)

function setText(file: string, text: string) {
  if (texts.get(file) === text) return
  texts.set(file, text)
  versions.set(file, (versions.get(file) ?? 0) + 1)
}

const fsHost: ts.ModuleResolutionHost = {
  fileExists: (f) => read(f) !== undefined,
  readFile: read,
  directoryExists: (d) => [...files.keys()].some((f) => f.startsWith(d.endsWith('/') ? d : d + '/')),
  realpath: (f) => f,
}

function resolve(spec: string, containing: string): ts.ResolvedModuleFull | undefined {
  let target: string | undefined
  if (isUrl(containing) && isRelative(spec)) target = new URL(spec, containing).href
  else if (typed.has(spec)) target = typed.get(spec)
  else if (isUrl(spec)) target = spec
  if (target === undefined) return ts.resolveModuleName(spec, containing, OPTIONS, fsHost).resolvedModule
  target = localReact(target)
  const extension = dtsExtension(target)
  return files.has(target) && extension ? { resolvedFileName: target, extension, isExternalLibraryImport: true } : undefined
}

const service = ts.createLanguageService(
  {
    ...fsHost,
    getCompilationSettings: () => OPTIONS,
    getScriptFileNames: () => roots,
    getScriptVersion: (f) => String(versions.get(f) ?? 0),
    getScriptSnapshot: (f) => {
      const text = read(f)
      return text === undefined ? undefined : ts.ScriptSnapshot.fromString(text)
    },
    getCurrentDirectory: () => '/',
    getDefaultLibFileName: (o) => LIB_DIR + ts.getDefaultLibFileName(o),
    getDirectories: () => [],
    useCaseSensitiveFileNames: () => true,
    resolveModuleNameLiterals: (literals, containing) => literals.map((l) => ({ resolvedModule: resolve(l.text, containing) })),
  },
  ts.createDocumentRegistry(true, '/'),
)

/**
 * Carica librerie e tipi dei pacchetti importati da `code`, poi mette il codice nel file principale.
 * Dopo l'ultimo await tutto è sincrono: una richiesta arrivata nel frattempo non cambia il file a metà.
 */
async function prepare(code: string, lang: TypeLang): Promise<string> {
  const specs = ts.preProcessFile(code, true, true).importedFiles.map((f) => f.fileName).filter((s) => !isRelative(s))
  await loadLibs()
  if (lang === 'TSX' || specs.some(isReact)) await loadReact()
  const found = await Promise.all(
    specs.filter((s) => !isReact(s)).map(async (s) => [s, npmTypes ? await loadPackage(s) : (typed.get(s) ?? null)] as const),
  )
  for (const [s, url] of found) {
    if (url) {
      typed.set(s, url)
      untyped.delete(s)
    } else untyped.add(s)
  }
  const main = lang === 'TSX' ? '/main.tsx' : '/main.ts'
  setText(main, code)
  roots = [main]
  if (untyped.size) {
    setText('/untyped.d.ts', [...untyped].map((s) => `declare module ${JSON.stringify(s)};`).join('\n'))
    roots.push('/untyped.d.ts')
  }
  return main
}

/** Diagnostica di TypeScript sul codice (posizioni relative al testo passato). */
export async function checkTypes(code: string, lang: TypeLang): Promise<TypeDiagnostic[]> {
  const main = await prepare(code, lang)
  return [...service.getSyntacticDiagnostics(main), ...service.getSemanticDiagnostics(main)].map((d) => {
    const from = d.start ?? 0
    return {
      from,
      to: from + (d.length ?? 0),
      severity: SEVERITY[d.category as keyof typeof SEVERITY] ?? 'info',
      message: ts.flattenDiagnosticMessageText(d.messageText, '\n'),
    }
  })
}

export interface TypeCompletion {
  label: string
  type?: string
  boost: number
  apply?: string
}

// Tipi di CodeMirror (icone): gli stessi dei suggerimenti locali di JavaScript, così i doppioni si fondono
const KINDS: Record<string, string> = {
  keyword: 'keyword',
  module: 'namespace',
  'external module name': 'namespace',
  class: 'class',
  'local class': 'class',
  interface: 'interface',
  type: 'type',
  'type parameter': 'type',
  'primitive type': 'type',
  alias: 'type',
  enum: 'enum',
  'enum member': 'enum',
  var: 'variable',
  'local var': 'variable',
  let: 'variable',
  const: 'variable',
  parameter: 'variable',
  function: 'function',
  'local function': 'function',
  method: 'method',
  constructor: 'method',
  getter: 'property',
  setter: 'property',
  property: 'property',
  'JSX attribute': 'property',
  string: 'text',
}

/** Ordine di TypeScript ("10" locali … "18"; "z…" deprecati) come boost di CodeMirror: prima i più vicini, deprecati in fondo. */
const sortBoost = (sortText: string) => (sortText.startsWith('z') ? -99 : -(parseInt(sortText, 10) || 0))

/** Suggerimenti alla posizione `pos` (membri dopo il punto, nomi in scope, globali). */
export async function completions(code: string, lang: TypeLang, pos: number): Promise<TypeCompletion[] | null> {
  const main = await prepare(code, lang)
  const info = service.getCompletionsAtPosition(main, pos, { includeCompletionsWithInsertText: true })
  if (!info) return null
  return (
    info.entries
      // shortcut: le voci che sostituiscono anche il testo prima della parola (es. `.["a-b"]`) non sono gestite
      .filter((e) => !e.replacementSpan && !e.isSnippet)
      .map((e) => ({ label: e.name, type: KINDS[e.kind], boost: sortBoost(e.sortText), apply: e.insertText }))
  )
}

export interface TypeInfo {
  /** firma o tipo, come nel tooltip di VS Code */
  detail: string
  doc: string
  from?: number
  to?: number
}

/** Firma e documentazione di un suggerimento. */
export async function completionDetail(code: string, lang: TypeLang, pos: number, name: string): Promise<TypeInfo | null> {
  const main = await prepare(code, lang)
  const d = service.getCompletionEntryDetails(main, pos, name, undefined, undefined, undefined, undefined)
  return d ? { detail: ts.displayPartsToString(d.displayParts), doc: ts.displayPartsToString(d.documentation) } : null
}

/** Tipo e documentazione del nome alla posizione `pos`, con il suo intervallo. */
export async function quickInfo(code: string, lang: TypeLang, pos: number): Promise<TypeInfo | null> {
  const main = await prepare(code, lang)
  const q = service.getQuickInfoAtPosition(main, pos)
  if (!q?.displayParts?.length) return null
  return {
    detail: ts.displayPartsToString(q.displayParts),
    doc: ts.displayPartsToString(q.documentation),
    from: q.textSpan.start,
    to: q.textSpan.start + q.textSpan.length,
  }
}
