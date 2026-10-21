import type { CompletionContext, CompletionResult } from '@codemirror/autocomplete'
import type { Diagnostic } from '@codemirror/lint'
import { Facet } from '@codemirror/state'
import { hoverTooltip, type EditorView, type ViewUpdate } from '@codemirror/view'
import type { TypeCompletion, TypeDiagnostic, TypeInfo } from './typecheck'
import type { TypeReply } from './typecheck.worker'

/**
 * TypeScript/TSX nell'editor: errori di tipo (linter), suggerimenti e tipo sotto il mouse. Il compilatore
 * gira in un worker (vedi typecheck.ts), creato alla prima richiesta: l'editor non si blocca.
 */

export type TypeLang = 'TypeScript' | 'TSX'
type Base = { id: number; code: string; lang: TypeLang }
export type TypeRequest =
  | (Base & { kind: 'check' })
  | (Base & { kind: 'complete'; pos: number })
  | (Base & { kind: 'detail'; pos: number; name: string })
  | (Base & { kind: 'hover'; pos: number })

/** Impostazione "Controllo dei tipi", messa nello state da setup.ts: spenta, niente errori, suggerimenti né tooltip. */
export const typeCheckEnabled = Facet.define<boolean, boolean>({ combine: (v) => v.at(-1) ?? true })

/** Riesegue il linter quando l'impostazione cambia (accesa: ricontrolla; spenta: toglie gli errori). */
export const typeCheckChanged = (u: ViewUpdate) => u.startState.facet(typeCheckEnabled) !== u.state.facet(typeCheckEnabled)

let worker: Worker | null = null
let nextId = 0
const pending = new Map<number, (reply: TypeReply) => void>()

function getWorker() {
  if (worker) return worker
  worker = new Worker(new URL('./typecheck.worker.ts', import.meta.url), { type: 'module' })
  worker.onmessage = (e: MessageEvent<TypeReply>) => {
    pending.get(e.data.id)?.(e.data)
    pending.delete(e.data.id)
  }
  // worker non avviato (per esempio offline senza il chunk in cache): niente aiuti sui tipi, il resto funziona
  worker.onerror = () => {
    pending.forEach((done, id) => done({ id, error: 'worker' }))
    pending.clear()
    worker = null
  }
  return worker
}

type Request = TypeRequest extends infer R ? (R extends TypeRequest ? Omit<R, 'id'> : never) : never

async function ask<T>(req: Request): Promise<T | undefined> {
  const id = nextId++
  const reply = await new Promise<TypeReply>((resolve) => {
    pending.set(id, resolve)
    getWorker().postMessage({ ...req, id })
  })
  return reply.result as T | undefined
}

export const typeLintSource = (lang: TypeLang) => async (view: EditorView): Promise<Diagnostic[]> => {
  if (!view.state.facet(typeCheckEnabled)) return []
  const diags = await ask<TypeDiagnostic[]>({ kind: 'check', code: view.state.doc.toString(), lang })
  const max = view.state.doc.length
  return (diags ?? []).map((d) => ({ ...d, from: Math.min(d.from, max), to: Math.min(d.to, max), source: 'TypeScript' }))
}

function infoDom({ detail, doc }: TypeInfo) {
  const dom = document.createElement('div')
  dom.className = 'cm-type-info'
  const code = dom.appendChild(document.createElement('code'))
  code.textContent = detail
  if (doc) dom.appendChild(document.createElement('p')).textContent = doc
  return dom
}

/** Suggerimenti di TypeScript, uniti a quelli del linguaggio (parole chiave, snippet); i doppioni si fondono. */
export const typeCompletionSource = (lang: TypeLang) => async (ctx: CompletionContext): Promise<CompletionResult | null> => {
  if (!ctx.state.facet(typeCheckEnabled)) return null
  const word = ctx.matchBefore(/[\w$]*/)!
  const afterDot = /\.$/.test(ctx.state.sliceDoc(word.from - 1, word.from))
  if (!ctx.explicit && word.from === word.to && !afterDot) return null
  const items = await ask<TypeCompletion[] | null>({ kind: 'complete', code: ctx.state.doc.toString(), lang, pos: ctx.pos })
  if (!items || ctx.aborted) return null
  const view = ctx.view
  return {
    from: word.from,
    validFor: /^[\w$]*$/,
    options: items.map((it) => ({
      ...it,
      // firma e documentazione si chiedono solo per la voce evidenziata, sul testo di quel momento
      info: view
        ? async () => {
            const d = await ask<TypeInfo | null>({ kind: 'detail', code: view.state.doc.toString(), lang, pos: view.state.selection.main.head, name: it.label })
            return d ? infoDom(d) : null
          }
        : undefined,
    })),
  }
}

/** Tipo e documentazione del nome sotto il mouse. */
export const typeHover = (lang: TypeLang) =>
  hoverTooltip(async (view, pos) => {
    if (!view.state.facet(typeCheckEnabled)) return null
    const q = await ask<TypeInfo | null>({ kind: 'hover', code: view.state.doc.toString(), lang, pos })
    if (!q) return null
    return { pos: q.from ?? pos, end: q.to, above: true, create: () => ({ dom: infoDom(q) }) }
  })
