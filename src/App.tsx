import { useEffect, useRef, useState } from 'react'
import type { EditorState, TransactionSpec } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { foldAll, foldEffect, unfoldAll, unfoldEffect } from '@codemirror/language'
import { openSearchPanel } from '@codemirror/search'
import {
  createEditorState,
  languageEffects,
  setUpdateHandler,
  settingsEffects,
  type EditorSettings,
} from './editor/setup'
import { foldLevel, serializeFolds } from './editor/folding'
import {
  DEFAULT_INDENT,
  convertIndentChanges,
  detectIndent,
  indentCompartment,
  indentExtension,
  indentLabel,
  type Indent,
} from './editor/indentation'
import { detectByContent, detectByFilename, extensionFor, languageNames } from './editor/languages'
import {
  ensurePermission,
  filesFromDrop,
  hasFsAccess,
  pickFiles,
  readHandle,
  saveAs,
  serialize,
  writeHandle,
  type OpenedFile,
} from './fs'
import {
  DEFAULT_SETTINGS,
  addRecent,
  clearRecents,
  loadRecents,
  loadSession,
  loadSettings,
  saveSession,
  saveSettings,
  type Eol,
  type RecentFile,
  type Settings,
  type ThemeMode,
} from './store'

interface Tab {
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
}

interface NewTabInput {
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
}

const darkQuery = window.matchMedia('(prefers-color-scheme: dark)')
const isBlank = (t: Tab, st?: EditorState) => !t.handle && !t.dirty && (!st || st.doc.length === 0)

export default function App() {
  const [tabs, setTabsState] = useState<Tab[]>([])
  const [activeId, setActiveIdState] = useState<string | null>(null)
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const [systemDark, setSystemDark] = useState(darkQuery.matches)
  const [status, setStatus] = useState({ line: 1, col: 1, sel: 0, lines: 1 })
  const [recents, setRecents] = useState<RecentFile[]>([])
  const [toast, setToast] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)

  const hostRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const states = useRef(new Map<string, EditorState>())
  const scrolls = useRef(new Map<string, number>())
  const tabsRef = useRef<Tab[]>([])
  const activeRef = useRef<string | null>(null)
  const settingsRef = useRef(settings)
  const systemDarkRef = useRef(systemDark)
  const timers = useRef<{ persist?: number; detect?: number; toast?: number }>({})
  const menus = useRef<HTMLDetailsElement[]>([])

  // ---------- helpers di stato (ref + state sincronizzati: le azioni leggono sempre il valore più recente) ----------

  function updateTabs(fn: (t: Tab[]) => Tab[]) {
    tabsRef.current = fn(tabsRef.current)
    setTabsState(tabsRef.current)
  }
  function patchTab(id: string, patch: Partial<Tab>) {
    updateTabs((ts) => ts.map((t) => (t.id === id ? { ...t, ...patch } : t)))
  }
  const findTab = (id: string | null) => tabsRef.current.find((t) => t.id === id)

  function editorSettings(): EditorSettings {
    const s = settingsRef.current
    const dark = s.theme === 'dark' || (s.theme === 'system' && systemDarkRef.current)
    return { dark, fontSize: s.fontSize, wrap: s.wrap }
  }

  function flash(msg: string) {
    setToast(msg)
    clearTimeout(timers.current.toast)
    timers.current.toast = window.setTimeout(() => setToast(null), 2200)
  }

  function closeMenus() {
    menus.current.forEach((m) => m && (m.open = false))
  }

  // ---------- persistenza sessione ----------

  async function persistNow() {
    clearTimeout(timers.current.persist)
    const snapshot = tabsRef.current.flatMap((t) => {
      const st = states.current.get(t.id)
      if (!st) return []
      return [{ ...t, content: st.doc.toString(), cursor: st.selection.main.head, folds: serializeFolds(st) }]
    })
    await saveSession({ tabs: snapshot, activeId: activeRef.current })
  }
  function schedulePersist() {
    clearTimeout(timers.current.persist)
    timers.current.persist = window.setTimeout(persistNow, 600)
  }

  // ---------- editor ----------

  function dispatchTo(id: string, spec: TransactionSpec) {
    const view = viewRef.current
    if (view && activeRef.current === id) view.dispatch(spec)
    else {
      const st = states.current.get(id)
      if (st) states.current.set(id, st.update(spec).state)
    }
  }

  async function setLanguage(id: string, lang: string | null, auto: boolean) {
    patchTab(id, { lang, langAuto: auto })
    const effects = await languageEffects(lang)
    if (states.current.has(id)) dispatchTo(id, { effects })
    schedulePersist()
  }

  function updateStatus(st: EditorState) {
    const head = st.selection.main.head
    const line = st.doc.lineAt(head)
    const sel = st.selection.ranges.reduce((n, r) => n + (r.to - r.from), 0)
    setStatus({ line: line.number, col: head - line.from + 1, sel, lines: st.doc.lines })
  }

  function activate(id: string) {
    const view = viewRef.current
    const st = states.current.get(id)
    if (!view || !st) return
    const prev = activeRef.current
    if (prev && prev !== id && states.current.has(prev)) scrolls.current.set(prev, view.scrollDOM.scrollTop)
    activeRef.current = id
    setActiveIdState(id)
    view.setState(st)
    view.dispatch({ effects: settingsEffects(editorSettings()) })
    const top = scrolls.current.get(id)
    if (top != null) requestAnimationFrame(() => (view.scrollDOM.scrollTop = top))
    else view.dispatch({ effects: EditorView.scrollIntoView(view.state.selection.main.head, { y: 'center' }) })
    updateStatus(view.state)
    view.focus()
    schedulePersist()
  }

  function addTab(input: NewTabInput, activateIt = true): Tab {
    const id = input.id ?? crypto.randomUUID()
    const byName = input.handle ? detectByFilename(input.name) : null
    const lang = input.lang !== undefined ? input.lang : (byName ?? detectByContent(input.content))
    const langAuto = input.langAuto ?? !byName
    const detected = input.indent ? null : detectIndent(input.content)
    const indent = input.indent ?? detected ?? DEFAULT_INDENT
    const indentAuto = input.indentAuto ?? true
    states.current.set(
      id,
      createEditorState({ content: input.content, settings: editorSettings(), cursor: input.cursor, folds: input.folds, indent }),
    )
    const tab: Tab = {
      id,
      name: input.name,
      lang,
      langAuto,
      indent,
      indentAuto,
      dirty: input.dirty ?? false,
      eol: input.eol,
      handle: input.handle,
    }
    updateTabs((ts) => [...ts, tab])
    if (lang) void setLanguage(id, lang, langAuto)
    if (activateIt) activate(id)
    schedulePersist()
    return tab
  }

  function newTab() {
    const used = new Set(tabsRef.current.map((t) => t.name))
    let n = 1
    while (used.has(`Senza titolo ${n}`)) n++
    addTab({ name: `Senza titolo ${n}`, content: '', eol: 'LF', lang: null, langAuto: true })
  }

  function closeTab(id: string, force = false) {
    const tab = findTab(id)
    if (!tab) return
    if (!force && tab.dirty && !confirm(`"${tab.name}" ha modifiche non salvate. Chiudere comunque?`)) return
    const idx = tabsRef.current.findIndex((t) => t.id === id)
    updateTabs((ts) => ts.filter((t) => t.id !== id))
    states.current.delete(id)
    scrolls.current.delete(id)
    if (activeRef.current === id) {
      const rest = tabsRef.current
      if (rest.length) activate(rest[Math.min(idx, rest.length - 1)].id)
      else {
        activeRef.current = null
        newTab()
      }
    }
    schedulePersist()
  }

  function cycleTab(delta: number) {
    const ts = tabsRef.current
    const i = ts.findIndex((t) => t.id === activeRef.current)
    if (ts.length > 1) activate(ts[(i + delta + ts.length) % ts.length].id)
  }

  // ---------- file ----------

  async function findTabByHandle(handle: FileSystemFileHandle) {
    for (const t of tabsRef.current) {
      if (t.handle && (await t.handle.isSameEntry(handle).catch(() => false))) return t
    }
    return undefined
  }

  async function openFiles(files: OpenedFile[]) {
    if (!files.length) return
    const only = tabsRef.current.length === 1 ? tabsRef.current[0] : undefined
    const blankId = only && isBlank(only, states.current.get(only.id)) ? only.id : null
    for (const f of files) {
      if (f.handle) {
        const existing = await findTabByHandle(f.handle)
        if (existing) {
          activate(existing.id)
          continue
        }
        setRecents(await addRecent(f.handle))
      }
      addTab(f)
    }
    if (blankId && tabsRef.current.length > 1) closeTab(blankId, true)
  }

  async function openDialog() {
    try {
      await openFiles(await pickFiles())
    } catch (err) {
      flash(`Errore apertura: ${(err as Error).message}`)
    }
  }

  async function openRecent(r: RecentFile) {
    closeMenus()
    try {
      if (!(await ensurePermission(r.handle, 'read'))) return
      await openFiles([await readHandle(r.handle)])
    } catch {
      flash(`Impossibile aprire "${r.name}" (spostato o eliminato?)`)
    }
  }

  async function save(id = activeRef.current, forceSaveAs = false) {
    const tab = findTab(id)
    const st = id ? states.current.get(id) : undefined
    if (!tab || !st || !id) return
    const data = serialize(st.doc.toString(), tab.eol)
    try {
      if (tab.handle && !forceSaveAs) {
        await writeHandle(tab.handle, data)
        patchTab(id, { dirty: false })
        flash(`Salvato: ${tab.name}`)
      } else {
        const suggested = tab.name.includes('.') ? tab.name : `${tab.name}${extensionFor(tab.lang)}`
        const handle = await saveAs(suggested, data)
        if (handle === null) return // annullato
        if (handle) {
          patchTab(id, { handle, name: handle.name, dirty: false })
          setRecents(await addRecent(handle))
          const byName = detectByFilename(handle.name)
          if (byName && byName !== tab.lang) void setLanguage(id, byName, false)
          else if (byName) patchTab(id, { langAuto: false })
          flash(`Salvato: ${handle.name}`)
        } else {
          patchTab(id, { dirty: false })
          flash(`Scaricato: ${suggested}`)
        }
      }
      schedulePersist()
    } catch (err) {
      flash(`Errore salvataggio: ${(err as Error).message}`)
    }
  }

  function setIndent(id: string, indent: Indent, auto: boolean) {
    patchTab(id, { indent, indentAuto: auto })
    dispatchTo(id, { effects: indentCompartment.reconfigure(indentExtension(indent)) })
    schedulePersist()
  }

  function chooseIndent(indent: Indent) {
    closeMenus()
    const id = activeRef.current
    if (id) setIndent(id, indent, false)
    viewRef.current?.focus()
  }

  function redetectIndent() {
    closeMenus()
    const id = activeRef.current
    const st = id ? states.current.get(id) : undefined
    if (!id || !st) return
    const found = detectIndent(st.doc.toString())
    setIndent(id, found ?? DEFAULT_INDENT, true)
    flash(found ? `Rilevato: ${indentLabel(found)}` : 'Nessuna indentazione rilevata, uso il default')
  }

  /** Riscrive l'indentazione del file nello stile scelto (annullabile con Ctrl+Z). */
  function convertIndent(to: Indent) {
    closeMenus()
    const id = activeRef.current
    const tab = findTab(id)
    const view = viewRef.current
    if (!id || !tab || !view) return
    const changes = convertIndentChanges(view.state, tab.indent, to)
    setIndent(id, to, false)
    if (changes.length) view.dispatch({ changes, userEvent: 'input.indent' })
    flash(changes.length ? `Convertite ${changes.length} righe in ${indentLabel(to)}` : 'Niente da convertire')
    view.focus()
  }

  function toggleEol() {
    const id = activeRef.current
    const tab = findTab(id)
    if (!tab || !id) return
    patchTab(id, { eol: tab.eol === 'LF' ? 'CRLF' : 'LF', dirty: true })
    schedulePersist()
  }

  function runOnView(cmd: (v: EditorView) => boolean) {
    closeMenus()
    const v = viewRef.current
    if (v) {
      cmd(v)
      v.focus()
    }
  }

  // Le azioni sono ricreate a ogni render ma leggono solo ref: gli handler globali passano da qui.
  const actions = useRef({ newTab, openDialog, save, closeTab, cycleTab, openFiles })
  actions.current = { newTab, openDialog, save, closeTab, cycleTab, openFiles }

  // ---------- inizializzazione ----------

  useEffect(() => {
    const view = new EditorView({ parent: hostRef.current! })
    const stateMap = states.current
    viewRef.current = view
    let cancelled = false

    setUpdateHandler((u) => {
      const id = activeRef.current
      if (!id) return
      states.current.set(id, u.state)
      if (u.docChanged) {
        const tab = findTab(id)
        if (tab && !tab.dirty) patchTab(id, { dirty: true })
        if (tab?.langAuto || tab?.indentAuto) {
          clearTimeout(timers.current.detect)
          timers.current.detect = window.setTimeout(() => {
            const t = findTab(id)
            const st = states.current.get(id)
            if (!t || !st) return
            const text = st.doc.toString()
            // Finché il linguaggio è automatico può anche "salire" di livello (es. JavaScript → TSX mentre scrivi)
            if (t.langAuto) {
              const lang = detectByContent(text)
              if (lang && lang !== t.lang) void setLanguage(id, lang, true)
            }
            if (t.indentAuto) {
              const found = detectIndent(text)
              if (found && (found.tabs !== t.indent.tabs || found.size !== t.indent.size)) setIndent(id, found, true)
            }
          }, 500)
        }
        schedulePersist()
      } else if (u.transactions.some((tr) => tr.effects.some((e) => e.is(foldEffect) || e.is(unfoldEffect)))) {
        schedulePersist()
      }
      if (u.docChanged || u.selectionSet) updateStatus(u.state)
    })

    ;(async () => {
      const [session, savedSettings, savedRecents] = await Promise.all([loadSession(), loadSettings(), loadRecents()])
      if (cancelled) return
      settingsRef.current = savedSettings
      setSettings(savedSettings)
      setRecents(savedRecents)
      if (session?.tabs.length) {
        for (const t of session.tabs) addTab(t, false)
        const target = session.tabs.some((t) => t.id === session.activeId) ? session.activeId! : session.tabs[0].id
        activate(target)
      } else {
        newTab()
      }
      // File aperti dal sistema operativo ("Apri con…") nella PWA installata
      window.launchQueue?.setConsumer(async (params) => {
        const handles = params.files.filter((h): h is FileSystemFileHandle => h.kind === 'file')
        if (handles.length) await actions.current.openFiles(await Promise.all(handles.map(readHandle)))
      })
    })()

    return () => {
      cancelled = true
      view.destroy()
      viewRef.current = null
      stateMap.clear()
      tabsRef.current = []
      activeRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Scorciatoie globali + salvataggio immediato quando la finestra perde il focus/si chiude
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const a = actions.current
      const mod = e.ctrlKey || e.metaKey
      const code = e.code
      let handled = true
      if (mod && !e.altKey && code === 'KeyS') void a.save(undefined, e.shiftKey)
      else if (mod && !e.altKey && code === 'KeyO') void a.openDialog()
      else if ((mod || e.altKey) && !e.shiftKey && code === 'KeyN') a.newTab()
      else if ((mod || e.altKey) && !e.shiftKey && code === 'KeyW') {
        if (activeRef.current) a.closeTab(activeRef.current)
      } else if (e.ctrlKey && e.key === 'Tab') a.cycleTab(e.shiftKey ? -1 : 1)
      else if (e.ctrlKey && e.key === 'PageDown') a.cycleTab(1)
      else if (e.ctrlKey && e.key === 'PageUp') a.cycleTab(-1)
      else handled = false
      if (handled) {
        e.preventDefault()
        e.stopPropagation()
      }
    }
    const flush = () => document.visibilityState === 'hidden' && void persistNow()
    const onPageHide = () => void persistNow()
    window.addEventListener('keydown', onKey, true)
    document.addEventListener('visibilitychange', flush)
    window.addEventListener('pagehide', onPageHide)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      document.removeEventListener('visibilitychange', flush)
      window.removeEventListener('pagehide', onPageHide)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Drag & drop di file sulla finestra (intercettato prima che CodeMirror lo inserisca come testo)
  useEffect(() => {
    const hasFiles = (e: DragEvent) => !!e.dataTransfer && [...e.dataTransfer.types].includes('Files')
    const onOver = (e: DragEvent) => {
      if (!hasFiles(e)) return
      e.preventDefault()
      e.stopPropagation()
      setDragging(true)
    }
    const onLeave = (e: DragEvent) => {
      if (!e.relatedTarget) setDragging(false)
    }
    const onDrop = async (e: DragEvent) => {
      if (!hasFiles(e)) return
      e.preventDefault()
      e.stopPropagation()
      setDragging(false)
      try {
        await actions.current.openFiles(await filesFromDrop(e.dataTransfer!))
      } catch (err) {
        flash(`Errore apertura: ${(err as Error).message}`)
      }
    }
    window.addEventListener('dragover', onOver, true)
    window.addEventListener('dragleave', onLeave, true)
    window.addEventListener('drop', onDrop, true)
    return () => {
      window.removeEventListener('dragover', onOver, true)
      window.removeEventListener('dragleave', onLeave, true)
      window.removeEventListener('drop', onDrop, true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Tema di sistema
  useEffect(() => {
    const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches)
    darkQuery.addEventListener('change', onChange)
    return () => darkQuery.removeEventListener('change', onChange)
  }, [])

  // Impostazioni → editor attivo (le altre tab si allineano quando vengono attivate)
  useEffect(() => {
    settingsRef.current = settings
    systemDarkRef.current = systemDark
    const es = editorSettings()
    document.documentElement.dataset.theme = es.dark ? 'dark' : 'light'
    viewRef.current?.dispatch({ effects: settingsEffects(es) })
    void saveSettings(settings)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings, systemDark])

  const active = tabs.find((t) => t.id === activeId)

  useEffect(() => {
    document.title = active ? `${active.dirty ? '● ' : ''}${active.name} — Fishpad Edit` : 'Fishpad Edit'
  }, [active])

  const setSetting = <K extends keyof Settings>(key: K, value: Settings[K]) =>
    setSettings((s) => ({ ...s, [key]: value }))

  const menuRef = (i: number) => (el: HTMLDetailsElement | null) => {
    if (el) menus.current[i] = el
  }

  return (
    <div className={`app${dragging ? ' dragging' : ''}`}>
      <header className="toolbar">
        <span className="brand">
          <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" width={18} height={18} />
          Fishpad Edit
        </span>
        <button onClick={() => newTab()} title="Nuovo (Ctrl+N / Alt+N)">Nuovo</button>
        <button onClick={() => void openDialog()} title="Apri (Ctrl+O)">Apri</button>
        <button onClick={() => void save()} title="Salva (Ctrl+S)">Salva</button>
        <button onClick={() => void save(undefined, true)} title="Salva con nome (Ctrl+Shift+S)">Salva come…</button>

        <details className="menu" ref={menuRef(0)}>
          <summary>Recenti</summary>
          <div className="menu-panel">
            {!hasFsAccess && <p className="menu-empty">Non disponibile in questo browser</p>}
            {hasFsAccess && recents.length === 0 && <p className="menu-empty">Nessun file recente</p>}
            {recents.map((r) => (
              <button key={r.openedAt + r.name} onClick={() => void openRecent(r)}>
                {r.name}
              </button>
            ))}
            {recents.length > 0 && (
              <button
                className="danger"
                onClick={async () => {
                  closeMenus()
                  if (confirm('Svuotare la lista dei file recenti?')) setRecents(await clearRecents())
                }}
              >
                Svuota lista
              </button>
            )}
          </div>
        </details>

        <details className="menu" ref={menuRef(1)}>
          <summary>Folding</summary>
          <div className="menu-panel">
            <button onClick={() => runOnView(foldAll)}>Chiudi tutto <kbd>Ctrl+K Ctrl+0</kbd></button>
            <button onClick={() => runOnView(unfoldAll)}>Apri tutto <kbd>Ctrl+K Ctrl+J</kbd></button>
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} onClick={() => runOnView(foldLevel(n))}>
                Chiudi livello {n} <kbd>Ctrl+K Ctrl+{n}</kbd>
              </button>
            ))}
          </div>
        </details>

        <button onClick={() => runOnView(openSearchPanel)} title="Cerca e sostituisci (Ctrl+F)">Cerca</button>

        <div className="spacer" />

        <label className="inline">
          Tema
          <select value={settings.theme} onChange={(e) => setSetting('theme', e.target.value as ThemeMode)}>
            <option value="system">Sistema</option>
            <option value="light">Chiaro</option>
            <option value="dark">Scuro</option>
          </select>
        </label>
        <div className="inline" title="Dimensione font">
          <button onClick={() => setSetting('fontSize', Math.max(10, settings.fontSize - 1))}>A−</button>
          <span className="font-size">{settings.fontSize}</span>
          <button onClick={() => setSetting('fontSize', Math.min(32, settings.fontSize + 1))}>A+</button>
        </div>
        <label className="inline">
          <input type="checkbox" checked={settings.wrap} onChange={(e) => setSetting('wrap', e.target.checked)} />
          A capo
        </label>
      </header>

      <nav className="tabs" onDoubleClick={(e) => e.target === e.currentTarget && newTab()}>
        {tabs.map((t) => (
          <div
            key={t.id}
            className={`tab${t.id === activeId ? ' active' : ''}`}
            title={t.handle ? t.name : `${t.name} (non salvato su disco)`}
            onClick={() => activate(t.id)}
            onAuxClick={(e) => e.button === 1 && closeTab(t.id)}
          >
            <span className="tab-name">{t.name}</span>
            <button
              className={`tab-close${t.dirty ? ' dirty' : ''}`}
              aria-label={`Chiudi ${t.name}`}
              onClick={(e) => {
                e.stopPropagation()
                closeTab(t.id)
              }}
            >
              <span className="dot">●</span>
              <span className="x">×</span>
            </button>
          </div>
        ))}
        <button className="tab-new" onClick={() => newTab()} aria-label="Nuova tab">+</button>
      </nav>

      <main className="editor" ref={hostRef} />

      <footer className="statusbar">
        <span>
          Ln {status.line}, Col {status.col}
          {status.sel > 0 && ` (${status.sel} selezionati)`}
        </span>
        <span>{status.lines} righe</span>
        {!hasFsAccess && <span className="warn" title="Usa Chrome o Edge per salvare direttamente su disco">Modalità ridotta</span>}
        <div className="spacer" />
        {active && (
          <>
            <select
              value={active.lang ?? ''}
              onChange={(e) => void setLanguage(active.id, e.target.value || null, false)}
              title="Linguaggio"
            >
              <option value="">Testo semplice</option>
              {languageNames.map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
            <details className="menu menu-up" ref={menuRef(2)}>
              <summary title={active.indentAuto ? 'Indentazione (rilevata dal contenuto)' : 'Indentazione (scelta a mano)'}>{indentLabel(active.indent)}{active.indentAuto ? '' : ' •'}</summary>
              <div className="menu-panel">
                <p className="menu-title">Usa per questo file</p>
                {[false, true].map((tabs) =>
                  [2, 4, 8].map((size) => (
                    <button key={`${tabs}${size}`} onClick={() => chooseIndent({ tabs, size })}>
                      {indentLabel({ tabs, size })}
                      {active.indent.tabs === tabs && active.indent.size === size && <kbd>✓</kbd>}
                    </button>
                  )),
                )}
                <button onClick={redetectIndent}>Rileva dal contenuto</button>
                <p className="menu-title">Converti il file in</p>
                <button onClick={() => convertIndent({ tabs: true, size: active.indent.size })}>Tab (larghezza {active.indent.size})</button>
                {[2, 4].map((size) => (
                  <button key={size} onClick={() => convertIndent({ tabs: false, size })}>Spazi: {size}</button>
                ))}
              </div>
            </details>
            <button onClick={toggleEol} title="Fine riga (clic per cambiare)">{active.eol}</button>
            <span>UTF-8</span>
          </>
        )}
      </footer>

      {toast && <div className="toast" role="status">{toast}</div>}
      {dragging && <div className="drop-overlay">Rilascia per aprire</div>}
    </div>
  )
}
