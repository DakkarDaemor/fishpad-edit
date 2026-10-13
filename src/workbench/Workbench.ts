import { Annotation, Transaction, type ChangeSet, type EditorState, type TransactionSpec } from '@codemirror/state'
import { EditorView, type ViewUpdate } from '@codemirror/view'
import { foldEffect, unfoldEffect } from '@codemirror/language'
import { createEditorState, languageEffects, setUpdateHandler, settingsEffects, type EditorSettings } from '../editor/setup'
import { serializeFolds } from '../editor/folding'
import {
  DEFAULT_INDENT,
  convertIndentChanges,
  detectIndent,
  indentCompartment,
  indentExtension,
  indentLabel,
  type Indent,
} from '../editor/indentation'
import { detectByContent, detectByFilename } from '../editor/languages'
import type { TabColor } from './tabColors'
import { saveSession, type Eol, type Session } from '../store'
import { isValidLayout, leaf, paneIds, removePane, setSizes, splitPane, type Layout, type SplitDir } from './layout'

export interface Doc {
  id: string
  name: string
  lang: string | null
  /** true finché il linguaggio non è stato scelto a mano né dedotto dal nome file */
  langAuto: boolean
  indent: Indent
  /** true finché l'indentazione non è stata scelta a mano: viene rilevata dal contenuto */
  indentAuto: boolean
  dirty: boolean
  eol: Eol
  handle?: FileSystemFileHandle
  color?: TabColor
}

export interface Pane {
  id: string
  docIds: string[]
  activeDocId: string | null
}

export interface CursorStatus {
  line: number
  col: number
  sel: number
  lines: number
}

export interface Snapshot {
  docs: ReadonlyMap<string, Doc>
  panes: ReadonlyMap<string, Pane>
  layout: Layout
  activePaneId: string
  status: CursorStatus
}

export interface NewDocInput {
  id?: string
  name: string
  content: string
  eol: Eol
  handle?: FileSystemFileHandle
  lang?: string | null
  langAuto?: boolean
  indent?: Indent
  indentAuto?: boolean
  dirty?: boolean
  cursor?: number
  folds?: Array<[number, number]>
  color?: TabColor
}

/** Segna le modifiche replicate da un altro pannello sullo stesso documento (da non replicare di nuovo). */
const syncAnnotation = Annotation.define<boolean>()
const instanceKey = (paneId: string, docId: string) => `${paneId}\u0000${docId}`
const newId = () => crypto.randomUUID()

/**
 * Modello dell'editor: documenti, pannelli (ognuno con le sue tab e la sua EditorView) e layout.
 * Uno stesso documento può essere aperto in più pannelli: ogni pannello ha il proprio EditorState
 * (cursore, folding, cronologia undo) e le modifiche al testo vengono replicate sugli altri.
 * La UI React legge gli snapshot immutabili via `subscribe`/`getSnapshot`.
 */
export class Workbench {
  private docs = new Map<string, Doc>()
  private panes = new Map<string, Pane>()
  private layout: Layout
  private activePaneId: string
  private status: CursorStatus = { line: 1, col: 1, sel: 0, lines: 1 }

  private states = new Map<string, EditorState>()
  private scrolls = new Map<string, number>()
  private views = new Map<string, EditorView>()
  private viewPanes = new Map<EditorView, string>()

  private settings: EditorSettings
  private listeners = new Set<() => void>()
  private contentListeners = new Set<(docId: string) => void>()
  private snapshot!: Snapshot
  private persistTimer?: number
  private detectTimers = new Map<string, number>()

  constructor(settings: EditorSettings) {
    this.settings = settings
    const paneId = newId()
    this.panes.set(paneId, { id: paneId, docIds: [], activeDocId: null })
    this.layout = leaf(paneId)
    this.activePaneId = paneId
    this.emit()
  }

  // ---------- osservabile per React ----------

  subscribe = (fn: () => void) => {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }
  getSnapshot = () => this.snapshot

  /** Notifica ogni modifica al testo di un documento (una volta sola anche se è aperto in più pannelli). */
  onContentChange(fn: (docId: string) => void) {
    this.contentListeners.add(fn)
    return () => void this.contentListeners.delete(fn)
  }

  private emit() {
    this.snapshot = {
      docs: new Map(this.docs),
      panes: new Map(this.panes),
      layout: this.layout,
      activePaneId: this.activePaneId,
      status: this.status,
    }
    this.listeners.forEach((fn) => fn())
  }

  // ---------- accesso ----------

  doc(id: string | null | undefined) {
    return id ? this.docs.get(id) : undefined
  }
  get activePane() {
    return this.panes.get(this.activePaneId)!
  }
  get activeDoc() {
    return this.doc(this.activePane.activeDocId)
  }
  get activeView() {
    return this.views.get(this.activePaneId)
  }
  get paneCount() {
    return this.panes.size
  }
  get allDocs() {
    return [...this.docs.values()]
  }

  /** Pannelli in cui il documento è aperto. */
  private panesWith(docId: string) {
    return [...this.panes.values()].filter((p) => p.docIds.includes(docId))
  }

  /** Uno stato qualsiasi del documento: il testo è identico in tutti i pannelli. */
  private anyState(docId: string) {
    for (const p of this.panesWith(docId)) {
      const st = this.states.get(instanceKey(p.id, docId))
      if (st) return st
    }
    return undefined
  }

  content(docId: string) {
    return this.anyState(docId)?.doc.toString() ?? ''
  }

  isBlank(docId: string) {
    const d = this.docs.get(docId)
    return !!d && !d.handle && !d.dirty && (this.anyState(docId)?.doc.length ?? 0) === 0
  }

  async findByHandle(handle: FileSystemFileHandle) {
    for (const d of this.docs.values()) {
      if (d.handle && (await d.handle.isSameEntry(handle).catch(() => false))) return d
    }
    return undefined
  }

  // ---------- documenti ----------

  patchDoc(id: string, patch: Partial<Doc>) {
    const d = this.docs.get(id)
    if (!d) return
    this.docs.set(id, { ...d, ...patch })
    this.emit()
    this.schedulePersist()
  }

  /** Applica effetti (non modifiche al testo) a tutte le istanze del documento. */
  private dispatchToDoc(docId: string, spec: TransactionSpec) {
    for (const p of this.panesWith(docId)) this.dispatchInstance(p.id, docId, spec)
  }

  private dispatchInstance(paneId: string, docId: string, spec: TransactionSpec) {
    const view = this.views.get(paneId)
    if (view && this.panes.get(paneId)?.activeDocId === docId) {
      view.dispatch(spec)
      return
    }
    const k = instanceKey(paneId, docId)
    const st = this.states.get(k)
    if (st) this.states.set(k, st.update(spec).state)
  }

  async setLanguage(docId: string, lang: string | null, auto: boolean) {
    this.patchDoc(docId, { lang, langAuto: auto })
    const effects = await languageEffects(lang)
    if (this.docs.has(docId)) this.dispatchToDoc(docId, { effects })
  }

  setIndent(docId: string, indent: Indent, auto: boolean) {
    this.patchDoc(docId, { indent, indentAuto: auto })
    this.dispatchToDoc(docId, { effects: indentCompartment.reconfigure(indentExtension(indent)) })
  }

  /** Rileva di nuovo l'indentazione del documento attivo; restituisce un messaggio per l'utente. */
  redetectIndent(): string | null {
    const d = this.activeDoc
    if (!d) return null
    const found = detectIndent(this.content(d.id))
    this.setIndent(d.id, found ?? DEFAULT_INDENT, true)
    return found ? `Rilevato: ${indentLabel(found)}` : 'Nessuna indentazione rilevata, uso il default'
  }

  /** Riscrive l'indentazione del documento attivo (annullabile con Ctrl+Z). */
  convertIndent(to: Indent): string | null {
    const d = this.activeDoc
    const view = this.activeView
    if (!d || !view) return null
    const changes = convertIndentChanges(view.state, d.indent, to)
    this.setIndent(d.id, to, false)
    if (changes.length) view.dispatch({ changes, userEvent: 'input.indent' })
    view.focus()
    return changes.length ? `Convertite ${changes.length} righe in ${indentLabel(to)}` : 'Niente da convertire'
  }

  setColor(docId: string, color: TabColor | null) {
    this.patchDoc(docId, { color: color ?? undefined })
  }

  toggleEol() {
    const d = this.activeDoc
    if (d) this.patchDoc(d.id, { eol: d.eol === 'LF' ? 'CRLF' : 'LF', dirty: true })
  }

  /** Crea un documento e lo apre nel pannello indicato (default: quello attivo). */
  addDoc(input: NewDocInput, paneId = this.activePaneId, activate = true): Doc {
    const id = input.id ?? newId()
    const byName = input.handle ? detectByFilename(input.name) : null
    const lang = input.lang !== undefined ? input.lang : (byName ?? detectByContent(input.content))
    const detected = input.indent ? null : detectIndent(input.content)
    const doc: Doc = {
      id,
      name: input.name,
      lang,
      langAuto: input.langAuto ?? !byName,
      indent: input.indent ?? detected ?? DEFAULT_INDENT,
      indentAuto: input.indentAuto ?? true,
      dirty: input.dirty ?? false,
      eol: input.eol,
      handle: input.handle,
      color: input.color,
    }
    this.docs.set(id, doc)
    this.createInstance(paneId, doc, input.content, input.cursor, input.folds)
    if (lang) void this.setLanguage(id, lang, doc.langAuto)
    if (activate) this.activate(paneId, id)
    else this.emit()
    this.schedulePersist()
    return doc
  }

  newUntitled(paneId = this.activePaneId) {
    const used = new Set([...this.docs.values()].map((d) => d.name))
    let n = 1
    while (used.has(`Senza titolo ${n}`)) n++
    return this.addDoc({ name: `Senza titolo ${n}`, content: '', eol: 'LF', lang: null, langAuto: true }, paneId)
  }

  private createInstance(paneId: string, doc: Doc, content: string, cursor?: number, folds?: Array<[number, number]>) {
    const pane = this.panes.get(paneId)!
    this.states.set(
      instanceKey(paneId, doc.id),
      createEditorState({ content, settings: this.settings, cursor, folds, indent: doc.indent }),
    )
    if (!pane.docIds.includes(doc.id)) this.panes.set(paneId, { ...pane, docIds: [...pane.docIds, doc.id] })
  }

  /** Apre in un pannello un documento già aperto altrove (stessa posizione del cursore). */
  private async cloneInstance(docId: string, paneId: string, fromPaneId: string) {
    const doc = this.docs.get(docId)!
    const source = this.states.get(instanceKey(fromPaneId, docId))
    this.createInstance(paneId, doc, source?.doc.toString() ?? this.content(docId), source?.selection.main.head)
    if (doc.lang) this.dispatchInstance(paneId, docId, { effects: await languageEffects(doc.lang) })
  }

  // ---------- pannelli e tab ----------

  /** Mostra il documento nel pannello e rende attivo il pannello. */
  activate(paneId: string, docId: string) {
    const pane = this.panes.get(paneId)
    if (!pane || !pane.docIds.includes(docId)) return
    const view = this.views.get(paneId)
    if (view && pane.activeDocId && pane.activeDocId !== docId) {
      this.scrolls.set(instanceKey(paneId, pane.activeDocId), view.scrollDOM.scrollTop)
    }
    this.panes.set(paneId, { ...pane, activeDocId: docId })
    this.activePaneId = paneId
    this.showInView(paneId, true)
    this.refreshStatus()
    this.emit()
    this.schedulePersist()
  }

  focusPane(paneId: string) {
    if (paneId === this.activePaneId || !this.panes.has(paneId)) return
    this.activePaneId = paneId
    this.refreshStatus()
    this.emit()
  }

  cycleTab(delta: number) {
    const p = this.activePane
    const i = p.docIds.indexOf(p.activeDocId ?? '')
    if (p.docIds.length > 1) this.activate(p.id, p.docIds[(i + delta + p.docIds.length) % p.docIds.length])
  }

  /**
   * Chiude il documento nel pannello. Se non è aperto altrove e ha modifiche, chiede conferma.
   * Un pannello che resta vuoto si chiude (se non è l'unico). Restituisce false se annullato.
   */
  closeTab(paneId: string, docId: string, force = false): boolean {
    const pane = this.panes.get(paneId)
    const doc = this.docs.get(docId)
    if (!pane || !doc || !pane.docIds.includes(docId)) return true
    const lastInstance = this.panesWith(docId).length === 1
    if (!force && lastInstance && doc.dirty && !confirm(`"${doc.name}" ha modifiche non salvate. Chiudere comunque?`)) {
      return false
    }
    const idx = pane.docIds.indexOf(docId)
    const docIds = pane.docIds.filter((id) => id !== docId)
    const k = instanceKey(paneId, docId)
    this.states.delete(k)
    this.scrolls.delete(k)
    if (lastInstance) {
      this.docs.delete(docId)
      clearTimeout(this.detectTimers.get(docId))
    }
    const wasActive = pane.activeDocId === docId
    this.panes.set(paneId, { ...pane, docIds, activeDocId: wasActive ? null : pane.activeDocId })

    if (docIds.length === 0) {
      if (this.panes.size > 1) this.removePaneNow(paneId)
      else this.newUntitled(paneId)
    } else if (wasActive) {
      this.activate(paneId, docIds[Math.min(idx, docIds.length - 1)])
    }
    this.emit()
    this.schedulePersist()
    return true
  }

  /** Divide il pannello attivo aprendo lo stesso documento nel nuovo pannello. */
  async split(dir: SplitDir) {
    const from = this.activePane
    const id = newId()
    this.panes.set(id, { id, docIds: [], activeDocId: null })
    this.layout = splitPane(this.layout, from.id, id, dir)
    if (from.activeDocId) {
      await this.cloneInstance(from.activeDocId, id, from.id)
      this.activate(id, from.activeDocId)
    } else {
      this.newUntitled(id)
    }
  }

  /** Chiude un pannello con tutte le sue tab (chiede conferma per quelle con modifiche). */
  closePane(paneId = this.activePaneId) {
    if (this.panes.size <= 1) return
    const pane = this.panes.get(paneId)
    if (!pane) return
    for (const docId of [...pane.docIds]) {
      if (!this.closeTab(paneId, docId)) return
    }
  }

  private removePaneNow(paneId: string) {
    const ids = paneIds(this.layout)
    const pos = ids.indexOf(paneId)
    this.layout = removePane(this.layout, paneId) ?? this.layout
    this.panes.delete(paneId)
    if (this.activePaneId === paneId) {
      const rest = paneIds(this.layout)
      const next = this.panes.get(rest[Math.min(Math.max(pos - 1, 0), rest.length - 1)])!
      this.activePaneId = next.id
      if (next.activeDocId) this.activate(next.id, next.activeDocId)
    }
  }

  /** Sposta una tab in un altro pannello (prima di `beforeDocId`, o in fondo). */
  async moveTab(docId: string, fromPaneId: string, toPaneId: string, beforeDocId?: string | null) {
    const from = this.panes.get(fromPaneId)
    const to = this.panes.get(toPaneId)
    if (!from || !to || !from.docIds.includes(docId)) return
    if (fromPaneId === toPaneId) {
      // riordino nello stesso pannello
      const docIds = from.docIds.filter((id) => id !== docId)
      const at = beforeDocId ? docIds.indexOf(beforeDocId) : -1
      docIds.splice(at < 0 ? docIds.length : at, 0, docId)
      this.panes.set(fromPaneId, { ...from, docIds })
      this.emit()
      this.schedulePersist()
      return
    }
    if (!to.docIds.includes(docId)) {
      const src = instanceKey(fromPaneId, docId)
      const dst = instanceKey(toPaneId, docId)
      // l'istanza (con cronologia e folding) passa al nuovo pannello
      const view = this.views.get(fromPaneId)
      if (view && from.activeDocId === docId) this.scrolls.set(dst, view.scrollDOM.scrollTop)
      this.states.set(dst, this.states.get(src)!)
      const docIds = [...to.docIds]
      const at = beforeDocId ? docIds.indexOf(beforeDocId) : -1
      docIds.splice(at < 0 ? docIds.length : at, 0, docId)
      this.panes.set(toPaneId, { ...to, docIds })
    }
    this.closeTab(fromPaneId, docId, true)
    this.activate(toPaneId, docId)
  }

  resize(path: number[], sizes: number[]) {
    this.layout = setSizes(this.layout, path, sizes)
    this.emit()
    this.schedulePersist()
  }

  // ---------- viste CodeMirror ----------

  /** Collega una EditorView al pannello; restituisce la funzione di scollegamento. */
  attachView(paneId: string, host: HTMLElement) {
    // registrato qui e non nel costruttore: con StrictMode React può istanziare il modello due volte
    setUpdateHandler((u) => this.onViewUpdate(u))
    const view = new EditorView({ parent: host })
    this.views.set(paneId, view)
    this.viewPanes.set(view, paneId)
    const onFocus = () => this.focusPane(paneId)
    view.contentDOM.addEventListener('focus', onFocus)
    this.showInView(paneId, paneId === this.activePaneId)
    return () => {
      const pane = this.panes.get(paneId)
      if (pane?.activeDocId) this.scrolls.set(instanceKey(paneId, pane.activeDocId), view.scrollDOM.scrollTop)
      view.contentDOM.removeEventListener('focus', onFocus)
      this.views.delete(paneId)
      this.viewPanes.delete(view)
      view.destroy()
    }
  }

  private showInView(paneId: string, focus: boolean) {
    const view = this.views.get(paneId)
    const docId = this.panes.get(paneId)?.activeDocId
    const k = docId ? instanceKey(paneId, docId) : null
    const st = k ? this.states.get(k) : undefined
    if (!view || !st || !k) return
    if (view.state === st) {
      if (focus) view.focus()
      return
    }
    view.setState(st)
    view.dispatch({ effects: settingsEffects(this.settings) })
    const top = this.scrolls.get(k)
    if (top != null) requestAnimationFrame(() => (view.scrollDOM.scrollTop = top))
    else view.dispatch({ effects: EditorView.scrollIntoView(view.state.selection.main.head, { y: 'center' }) })
    if (focus) view.focus()
  }

  setEditorSettings(settings: EditorSettings) {
    this.settings = settings
    // le istanze non visibili si allineano quando vengono mostrate
    for (const view of this.views.values()) view.dispatch({ effects: settingsEffects(settings) })
  }

  private refreshStatus() {
    const docId = this.activePane.activeDocId
    const st = docId ? this.states.get(instanceKey(this.activePaneId, docId)) : undefined
    if (!st) return
    const head = st.selection.main.head
    const line = st.doc.lineAt(head)
    const sel = st.selection.ranges.reduce((n, r) => n + (r.to - r.from), 0)
    this.status = { line: line.number, col: head - line.from + 1, sel, lines: st.doc.lines }
  }

  private onViewUpdate(u: ViewUpdate) {
    const paneId = this.viewPanes.get(u.view)
    const docId = paneId ? this.panes.get(paneId)?.activeDocId : null
    if (!paneId || !docId) return
    this.states.set(instanceKey(paneId, docId), u.state)
    let changed = false

    if (u.docChanged) {
      let local = false
      for (const tr of u.transactions) {
        if (!tr.docChanged || tr.annotation(syncAnnotation)) continue
        local = true
        this.mirror(paneId, docId, tr.changes)
      }
      if (local) {
        const doc = this.docs.get(docId)
        if (doc && !doc.dirty) {
          this.docs.set(docId, { ...doc, dirty: true })
          changed = true
        }
        if (doc && (doc.langAuto || doc.indentAuto)) this.scheduleDetect(docId)
        this.schedulePersist()
        this.contentListeners.forEach((fn) => fn(docId))
      }
    } else if (u.transactions.some((tr) => tr.effects.some((e) => e.is(foldEffect) || e.is(unfoldEffect)))) {
      this.schedulePersist()
    }

    if (paneId === this.activePaneId && (u.docChanged || u.selectionSet)) {
      this.refreshStatus()
      changed = true
    }
    if (changed) this.emit()
  }

  /** Replica le modifiche al testo sulle istanze dello stesso documento negli altri pannelli. */
  private mirror(sourcePaneId: string, docId: string, changes: ChangeSet) {
    const spec: TransactionSpec = {
      changes,
      annotations: [syncAnnotation.of(true), Transaction.addToHistory.of(false)],
    }
    for (const p of this.panesWith(docId)) {
      if (p.id !== sourcePaneId) this.dispatchInstance(p.id, docId, spec)
    }
  }

  private scheduleDetect(docId: string) {
    clearTimeout(this.detectTimers.get(docId))
    this.detectTimers.set(
      docId,
      window.setTimeout(() => {
        const d = this.docs.get(docId)
        if (!d) return
        const text = this.content(docId)
        // Finché il linguaggio è automatico può anche "salire" di livello (es. JavaScript → TSX mentre scrivi)
        if (d.langAuto) {
          const lang = detectByContent(text)
          if (lang && lang !== d.lang) void this.setLanguage(docId, lang, true)
        }
        if (d.indentAuto) {
          const found = detectIndent(text)
          if (found && (found.tabs !== d.indent.tabs || found.size !== d.indent.size)) this.setIndent(docId, found, true)
        }
      }, 500),
    )
  }

  // ---------- sessione ----------

  /** Ripristina una sessione salvata; false se non contiene nulla di utilizzabile. */
  restore(session: Session): boolean {
    const docsById = new Map(session.docs.map((d) => [d.id, d]))
    const panes = session.panes
      .map((p) => ({ ...p, tabs: p.tabs.filter((t) => docsById.has(t.docId)) }))
      .filter((p) => p.tabs.length > 0)
    if (!panes.length) return false

    this.panes.clear()
    let layout: Layout | null = session.layout
    if (!isValidLayout(layout, new Set(panes.map((p) => p.id)))) {
      // layout incoerente: tutti i documenti in un solo pannello
      const all = panes.flatMap((p) => p.tabs).filter((t, i, a) => a.findIndex((x) => x.docId === t.docId) === i)
      panes.splice(0, panes.length, { id: newId(), tabs: all, activeDocId: panes[0].activeDocId })
      layout = leaf(panes[0].id)
    }
    for (const p of panes) this.panes.set(p.id, { id: p.id, docIds: [], activeDocId: null })
    this.layout = layout

    for (const p of panes) {
      for (const t of p.tabs) {
        const saved = docsById.get(t.docId)!
        if (this.docs.has(saved.id)) {
          this.createInstance(p.id, this.docs.get(saved.id)!, saved.content, t.cursor, t.folds)
          if (saved.lang) void languageEffects(saved.lang).then((effects) => this.dispatchInstance(p.id, saved.id, { effects }))
        } else {
          this.addDoc({ ...saved, cursor: t.cursor, folds: t.folds }, p.id, false)
        }
      }
      const active = p.tabs.some((t) => t.docId === p.activeDocId) ? p.activeDocId! : p.tabs[0].docId
      this.panes.set(p.id, { ...this.panes.get(p.id)!, activeDocId: active })
      this.showInView(p.id, false)
    }
    this.activePaneId = this.panes.has(session.activePaneId) ? session.activePaneId : panes[0].id
    const ap = this.activePane
    if (ap.activeDocId) this.activate(ap.id, ap.activeDocId)
    return true
  }

  private serialize(): Session {
    return {
      version: 2,
      docs: [...this.docs.values()].map((d) => ({ ...d, content: this.content(d.id) })),
      panes: [...this.panes.values()].map((p) => ({
        id: p.id,
        activeDocId: p.activeDocId,
        tabs: p.docIds.flatMap((docId) => {
          const st = this.states.get(instanceKey(p.id, docId))
          return st ? [{ docId, cursor: st.selection.main.head, folds: serializeFolds(st) }] : []
        }),
      })),
      layout: this.layout,
      activePaneId: this.activePaneId,
    }
  }

  async persistNow() {
    clearTimeout(this.persistTimer)
    await saveSession(this.serialize())
  }

  private schedulePersist() {
    clearTimeout(this.persistTimer)
    this.persistTimer = window.setTimeout(() => void this.persistNow(), 600)
  }
}
