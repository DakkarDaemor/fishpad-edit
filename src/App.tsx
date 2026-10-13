import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { EditorView } from '@codemirror/view'
import { redo, selectAll, toggleComment, undo } from '@codemirror/commands'
import { foldAll, unfoldAll } from '@codemirror/language'
import { gotoLine, openSearchPanel } from '@codemirror/search'
import { openReplacePanel, type EditorSettings } from './editor/setup'
import { foldLevel } from './editor/folding'
import { detectByFilename, extensionFor } from './editor/languages'
import { canFormat, formatCode } from './editor/format'
import {
  diskMtime,
  ensurePermission,
  filesFromDrop,
  hasFolderAccess,
  hasFsAccess,
  pickFiles,
  pickFolder,
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
  loadFolder,
  loadRecents,
  loadSession,
  loadSettings,
  saveFolder,
  saveSettings,
  type RecentFile,
  type Settings,
  type ThemeMode,
} from './store'
import { encode, type Encoding } from './encoding'
import { Workbench, type Doc } from './workbench/Workbench'
import { diffRange } from './workbench/textDiff'
import { MenuBar, type MenuDef } from './components/Menu'
import { SplitView } from './components/SplitView'
import { EditorPane } from './components/EditorPane'
import { StatusBar } from './components/StatusBar'
import { ConsolePanel } from './components/ConsolePanel'
import { PreviewPanel } from './components/PreviewPanel'
import { tabColorItems } from './components/tabColorMenu'
import { CommandPalette } from './components/CommandPalette'
import { menuCommands, type PaletteItem } from './components/commands'
import { HelpDialog, type HelpView } from './components/HelpDialog'
import { Runner } from './runner/Runner'
import { runTarget } from './runner/transpile'
import { folderAssets } from './runner/folderAssets'

const REPO_URL = 'https://github.com/DakkarDaemor/fishpad-edit'
const darkQuery = window.matchMedia('(prefers-color-scheme: dark)')

function toEditorSettings(s: Settings, systemDark: boolean): EditorSettings {
  return { dark: s.theme === 'dark' || (s.theme === 'system' && systemDark), fontSize: s.fontSize, wrap: s.wrap }
}

export default function App() {
  const [wb] = useState(() => new Workbench(toEditorSettings(DEFAULT_SETTINGS, darkQuery.matches)))
  const snap = useSyncExternalStore(wb.subscribe, wb.getSnapshot)
  const [runner] = useState(() => new Runner())
  const runState = useSyncExternalStore(runner.subscribe, runner.getSnapshot)
  const [consoleOpen, setConsoleOpen] = useState(false)
  const [consoleHeight, setConsoleHeight] = useState(220)
  const [previewWidth, setPreviewWidth] = useState(() => Math.round(window.innerWidth * 0.4))
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const [systemDark, setSystemDark] = useState(darkQuery.matches)
  const [recents, setRecents] = useState<RecentFile[]>([])
  const [toast, setToast] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const [palette, setPalette] = useState<'commands' | 'tabs' | null>(null)
  const [help, setHelp] = useState<HelpView | null>(null)
  /** Cartella da cui l'anteprima HTML carica CSS, script e immagini referenziati dalla pagina */
  const [previewFolder, setPreviewFolder] = useState<FileSystemDirectoryHandle | null>(null)
  const toastTimer = useRef<number | undefined>(undefined)
  /** Per documento: ultima versione su disco per cui l'utente ha scelto di tenere le sue modifiche. */
  const keptOverDisk = useRef(new Map<string, number>())
  const checkingDisk = useRef(false)

  function flash(msg: string | null) {
    if (!msg) return
    setToast(msg)
    clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(null), 2200)
  }

  // ---------- file ----------

  /** Pannello che mostra il documento: quello attivo se lo contiene, altrimenti il primo che lo ha. */
  const paneWith = (docId: string) =>
    wb.activePane.docIds.includes(docId) ? wb.activePane : [...wb.getSnapshot().panes.values()].find((p) => p.docIds.includes(docId))

  /** Porta in primo piano il documento nel suo pannello. false se non è più aperto. */
  function showDoc(docId: string) {
    const pane = paneWith(docId)
    if (pane) wb.activate(pane.id, docId)
    return !!pane
  }

  async function openFiles(files: OpenedFile[]) {
    if (!files.length) return
    // una sola tab vuota e intatta nel pannello attivo viene sostituita dal primo file aperto
    const pane = wb.activePane
    const blankId = pane.docIds.length === 1 && wb.isBlank(pane.docIds[0]) ? pane.docIds[0] : null
    for (const f of files) {
      if (f.handle) {
        const existing = await wb.findByHandle(f.handle)
        if (existing) {
          showDoc(existing.id)
          continue
        }
        setRecents(await addRecent(f.handle))
      }
      wb.addDoc(f)
    }
    if (blankId && wb.activePane.docIds.length > 1) wb.closeTab(wb.activePane.id, blankId, true)
  }

  async function openDialog() {
    try {
      await openFiles(await pickFiles())
    } catch (err) {
      flash(`Errore apertura: ${(err as Error).message}`)
    }
  }

  async function openRecent(r: RecentFile) {
    try {
      if (!(await ensurePermission(r.handle, 'read'))) return
      await openFiles([await readHandle(r.handle)])
    } catch {
      flash(`Impossibile aprire "${r.name}" (spostato o eliminato?)`)
    }
  }

  /** Testo del documento nella sua codifica; null se l'utente annulla perché la codifica non basta. */
  function encodeDoc(doc: Doc): Uint8Array<ArrayBuffer> | null {
    const text = serialize(wb.content(doc.id), doc.eol)
    const { bytes, unmappable } = encode(text, doc.encoding)
    if (!unmappable) return bytes
    const what = unmappable === 1 ? 'un carattere' : `${unmappable} caratteri`
    if (!confirm(`"${doc.name}" contiene ${what} che la codifica Windows-1252 non può rappresentare.\n\nSalvarlo in UTF-8?`)) {
      return null
    }
    wb.patchDoc(doc.id, { encoding: 'utf-8' })
    return encode(text, 'utf-8').bytes
  }

  async function save(docId = wb.activeDoc?.id, forceSaveAs = false) {
    const doc = wb.doc(docId)
    if (!doc) return
    try {
      if (doc.handle && !forceSaveAs) {
        if (!(await ensurePermission(doc.handle, 'readwrite'))) throw new Error('Permesso di scrittura negato')
        const onDisk = await diskMtime(doc.handle)
        const changedOutside = doc.mtime != null && onDisk != null && onDisk !== doc.mtime
        const overwrite = `"${doc.name}" è stato modificato su disco da un altro programma.\n\nSovrascriverlo con la versione dell'editor?`
        if (changedOutside && !confirm(overwrite)) {
          flash('Salvataggio annullato. File → Ricarica dal disco mostra la versione su disco')
          return
        }
        const data = encodeDoc(doc)
        if (!data) return
        const mtime = await writeHandle(doc.handle, data)
        wb.patchDoc(doc.id, { dirty: false, mtime })
        keptOverDisk.current.delete(doc.id)
        flash(`Salvato: ${doc.name}`)
        return
      }
      const data = encodeDoc(doc)
      if (!data) return
      const suggested = doc.name.includes('.') ? doc.name : `${doc.name}${extensionFor(doc.lang)}`
      const handle = await saveAs(suggested, data)
      if (handle === null) return // annullato
      if (handle) {
        wb.patchDoc(doc.id, { handle, name: handle.name, dirty: false, mtime: (await diskMtime(handle)) ?? undefined })
        setRecents(await addRecent(handle))
        const byName = detectByFilename(handle.name)
        if (byName && byName !== doc.lang) void wb.setLanguage(doc.id, byName, false)
        else if (byName) wb.patchDoc(doc.id, { langAuto: false })
        flash(`Salvato: ${handle.name}`)
      } else {
        wb.patchDoc(doc.id, { dirty: false })
        flash(`Scaricato: ${suggested}`)
      }
    } catch (err) {
      flash(`Errore salvataggio: ${(err as Error).message}`)
    }
  }

  /** Rilegge il file da disco (con `encoding`, o rilevando la codifica), dopo conferma se ci sono modifiche. */
  async function reload(docId = wb.activeDoc?.id, encoding?: Encoding) {
    const doc = wb.doc(docId)
    if (!doc?.handle) return
    if (doc.dirty && !confirm(`Scartare le modifiche a "${doc.name}" e ricaricarlo dal disco?`)) return
    try {
      if (!(await ensurePermission(doc.handle, 'read'))) return
      wb.replaceFromDisk(doc.id, await readHandle(doc.handle, encoding))
      keptOverDisk.current.delete(doc.id)
      flash(`Ricaricato: ${doc.name}`)
    } catch {
      flash(`Impossibile ricaricare "${doc.name}" (spostato o eliminato?)`)
    }
  }

  /**
   * Cerca i file cambiati su disco da un altro programma: quelli senza modifiche si ricaricano da soli,
   * per gli altri si chiede (una volta per ogni versione su disco). Solo per i file con permesso già concesso.
   */
  async function checkDisk() {
    if (checkingDisk.current) return
    checkingDisk.current = true
    try {
      for (const { id } of wb.allDocs) {
        const handle = wb.doc(id)?.handle
        if (!handle || wb.doc(id)?.mtime == null) continue
        if ((await handle.queryPermission({ mode: 'read' }).catch(() => 'denied')) !== 'granted') continue
        const onDisk = await diskMtime(handle).catch(() => null)
        // rilette dopo gli await: nel frattempo il documento può essere stato salvato o chiuso
        const doc = wb.doc(id)
        if (!doc?.handle || onDisk == null || onDisk === doc.mtime || onDisk === keptOverDisk.current.get(id)) continue
        if (doc.dirty) {
          keptOverDisk.current.set(id, onDisk)
          const msg = `"${doc.name}" è stato modificato da un altro programma, e qui ha modifiche non salvate.\n\nRicaricarlo dal disco perdendo le modifiche?`
          if (!confirm(msg)) continue
        }
        wb.replaceFromDisk(id, await readHandle(doc.handle))
        keptOverDisk.current.delete(id)
        flash(`Ricaricato dal disco: ${doc.name}`)
      }
    } catch (err) {
      console.warn('[checkDisk]', err)
    } finally {
      checkingDisk.current = false
    }
  }

  async function saveAll() {
    for (const d of wb.allDocs) if (d.dirty) await save(d.id)
  }

  function closeActiveTab() {
    const p = wb.activePane
    if (p.activeDocId) wb.closeTab(p.id, p.activeDocId)
  }

  // ---------- comandi sull'editor attivo ----------

  function run(cmd: (v: EditorView) => boolean) {
    const v = wb.activeView
    if (!v) return
    cmd(v)
    // i comandi che aprono un pannello (cerca, vai alla riga) hanno già spostato il focus lì
    if (!v.dom.contains(document.activeElement)) v.focus()
  }

  const selectionText = (v: EditorView) =>
    v.state.selection.ranges.filter((r) => !r.empty).map((r) => v.state.sliceDoc(r.from, r.to)).join('\n')

  async function copy(cut: boolean) {
    const v = wb.activeView
    if (!v) return
    const text = selectionText(v)
    if (!text) return
    try {
      await navigator.clipboard.writeText(text)
      if (cut) v.dispatch(v.state.replaceSelection(''), { userEvent: 'delete.cut' })
    } catch {
      flash('Appunti non disponibili: usa Ctrl+C / Ctrl+X')
    }
    v.focus()
  }

  async function paste() {
    const v = wb.activeView
    if (!v) return
    try {
      const text = await navigator.clipboard.readText()
      v.dispatch(v.state.replaceSelection(text), { userEvent: 'input.paste', scrollIntoView: true })
    } catch {
      flash('Appunti non disponibili: usa Ctrl+V')
    }
    v.focus()
  }

  /** Formatta il documento attivo con Prettier; si annulla con Ctrl+Z come una modifica normale. */
  async function formatActive() {
    const doc = wb.activeDoc
    const v = wb.activeView
    if (!doc || !v) return
    if (!doc.lang || !canFormat(doc.lang)) {
      flash(`Formattazione non disponibile per ${doc.lang ?? 'testo semplice'}`)
      return
    }
    const code = v.state.doc.toString()
    try {
      const { formatted, cursorOffset } = await formatCode(code, doc.lang, v.state.selection.main.head, doc.indent)
      // nel frattempo (primo caricamento di Prettier) il testo potrebbe essere cambiato
      if (v.state.doc.toString() !== code) return
      const changes = diffRange(code, formatted)
      if (!changes) {
        flash('Il documento è già formattato')
        return
      }
      const cursor = Math.min(Math.max(cursorOffset, 0), formatted.length)
      v.dispatch({ changes, selection: { anchor: cursor }, scrollIntoView: true, userEvent: 'input.format' })
    } catch (err) {
      // gli errori di sintassi di Prettier riportano anche il codice: basta la prima riga
      flash(`Formattazione non riuscita: ${(err as Error).message.split('\n')[0]}`)
    }
    v.focus()
  }

  // ---------- esecuzione ----------

  /**
   * JS/TS: esegue il file attivo in console, o solo la selezione se c'è.
   * HTML/JSX/TSX: apre (o ricarica) l'anteprima del file. false se il file non è eseguibile.
   */
  function runActive(): boolean {
    const doc = wb.activeDoc
    const v = wb.activeView
    const target = runTarget(doc?.lang)
    if (!doc || !v || !target) return false
    if (target === 'preview') {
      void runPreview(doc.id)
      return true
    }
    const sel = v.state.selection.main
    const code = sel.empty ? v.state.doc.toString() : v.state.sliceDoc(sel.from, sel.to)
    const firstLine = sel.empty ? 1 : v.state.doc.lineAt(sel.from).number
    setConsoleOpen(true)
    void runner.run({ code, lang: doc.lang, docId: doc.id, name: doc.name, firstLine, selection: !sel.empty })
    return true
  }

  /**
   * Esegue l'anteprima del documento, con i file locali della cartella dell'anteprima se la pagina sta lì dentro.
   * `ask`: si può chiedere il permesso di lettura (solo su azione dell'utente, non negli aggiornamenti dal vivo).
   */
  async function runPreview(docId: string, ask = true) {
    const doc = wb.doc(docId)
    if (!doc) return
    let assets = null
    const folder = previewFolder
    if (folder && (doc.lang === 'HTML' || doc.lang === 'Markdown')) {
      const granted = ask
        ? await ensurePermission(folder, 'read').catch(() => false)
        : (await folder.queryPermission({ mode: 'read' }).catch(() => 'denied')) === 'granted'
      if (granted) {
        assets = await folderAssets(folder, doc.handle, async (h) => {
          const open = await wb.findByHandle(h)
          return open ? wb.content(open.id) : undefined
        })
      }
    }
    // il documento potrebbe essere stato chiuso durante gli await
    const current = wb.doc(docId)
    if (!current) return
    void runner.run({ code: wb.content(docId), lang: current.lang, docId, name: current.name, firstLine: 1, selection: false, assets })
  }

  async function choosePreviewFolder() {
    try {
      const dir = await pickFolder()
      if (!dir) return
      setPreviewFolder(dir)
      void saveFolder(dir)
      flash(`Cartella dell'anteprima: ${dir.name}`)
    } catch (err) {
      flash(`Errore: ${(err as Error).message}`)
    }
  }

  function forgetPreviewFolder() {
    setPreviewFolder(null)
    void saveFolder(null)
  }

  function gotoDocLine(docId: string, line: number) {
    if (!showDoc(docId)) {
      flash('Il file eseguito non è più aperto')
      return
    }
    const v = wb.activeView
    if (!v) return
    const l = v.state.doc.line(Math.min(Math.max(1, line), v.state.doc.lines))
    v.dispatch({ selection: { anchor: l.from, head: l.to }, scrollIntoView: true })
    v.focus()
  }

  const setSetting = <K extends keyof Settings>(key: K, value: Settings[K]) => setSettings((s) => ({ ...s, [key]: value }))
  const toggleWrap = () => setSettings((s) => ({ ...s, wrap: !s.wrap }))
  const zoom = (delta: number) => setSettings((s) => ({ ...s, fontSize: Math.min(32, Math.max(10, s.fontSize + delta)) }))

  // Le azioni sono ricreate a ogni render: gli handler globali le leggono da qui.
  const actions = useRef({ openDialog, save, openFiles, closeActiveTab, toggleWrap, runActive, checkDisk, formatActive, runPreview })
  useEffect(() => {
    actions.current = { openDialog, save, openFiles, closeActiveTab, toggleWrap, runActive, checkDisk, formatActive, runPreview }
  })

  // ---------- inizializzazione ----------

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const [session, savedSettings, savedRecents, savedFolder] = await Promise.all([
        loadSession(),
        loadSettings(),
        loadRecents(),
        loadFolder(),
      ])
      if (cancelled) return
      setSettings(savedSettings)
      setRecents(savedRecents)
      setPreviewFolder(savedFolder)
      wb.setEditorSettings(toEditorSettings(savedSettings, darkQuery.matches))
      if (!session || !wb.restore(session)) wb.newUntitled()
      void actions.current.checkDisk()
      // File aperti dal sistema operativo ("Apri con…") nella PWA installata
      window.launchQueue?.setConsumer(async (params) => {
        const handles = params.files.filter((h): h is FileSystemFileHandle => h.kind === 'file')
        if (handles.length) await actions.current.openFiles(await Promise.all(handles.map((h) => readHandle(h))))
      })
    })()
    return () => {
      cancelled = true
    }
  }, [wb])

  // Scorciatoie globali + salvataggio immediato quando la finestra perde il focus/si chiude
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const a = actions.current
      const mod = e.ctrlKey || e.metaKey
      const code = e.code
      let handled = true
      if (mod && !e.altKey && code === 'KeyS') void a.save(undefined, e.shiftKey)
      else if (mod && !e.altKey && code === 'KeyO') void a.openDialog()
      else if ((mod || e.altKey) && !e.shiftKey && code === 'KeyN') wb.newUntitled()
      else if ((mod || e.altKey) && !e.shiftKey && code === 'KeyW') a.closeActiveTab()
      else if (e.ctrlKey && e.key === 'Tab') wb.cycleTab(e.shiftKey ? -1 : 1)
      else if (e.ctrlKey && e.key === 'PageDown') wb.cycleTab(1)
      else if (e.ctrlKey && e.key === 'PageUp') wb.cycleTab(-1)
      else if (mod && !e.altKey && e.key === '\\') void wb.split('row')
      else if (e.altKey && !mod && code === 'KeyZ') a.toggleWrap()
      else if ((mod && e.shiftKey && !e.altKey && code === 'KeyP') || e.key === 'F1') setPalette('commands')
      else if (mod && !e.shiftKey && !e.altKey && code === 'KeyP') setPalette('tabs')
      else if (e.altKey && e.shiftKey && !mod && code === 'KeyF') void a.formatActive()
      // negli altri file Ctrl+Enter resta all'editor (riga vuota sotto)
      else if (mod && !e.altKey && !e.shiftKey && e.key === 'Enter') handled = a.runActive()
      else handled = false
      if (handled) {
        e.preventDefault()
        e.stopPropagation()
      }
    }
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') void wb.persistNow()
      else void actions.current.checkDisk()
    }
    const onPageHide = () => void wb.persistNow()
    // tornando all'app dopo aver usato un altro programma
    const onFocus = () => void actions.current.checkDisk()
    window.addEventListener('keydown', onKey, true)
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pagehide', onPageHide)
    window.addEventListener('focus', onFocus)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pagehide', onPageHide)
      window.removeEventListener('focus', onFocus)
    }
  }, [wb])

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
  }, [])

  // Anteprima dal vivo: si riesegue poco dopo ogni modifica al documento mostrato
  useEffect(() => {
    let timer: number | undefined
    const off = wb.onContentChange((docId) => {
      const shown = runner.getSnapshot().preview?.docId
      // anche le modifiche ai file su disco (CSS, script…) che la pagina può caricare dalla cartella dell'anteprima
      if (!shown || (shown !== docId && !(previewFolder && wb.doc(docId)?.handle))) return
      clearTimeout(timer)
      timer = window.setTimeout(() => {
        const id = runner.getSnapshot().preview?.docId
        if (id && wb.doc(id)) void actions.current.runPreview(id, false)
      }, 500)
    })
    return () => {
      off()
      clearTimeout(timer)
    }
  }, [wb, runner, previewFolder])

  // Tema di sistema
  useEffect(() => {
    const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches)
    darkQuery.addEventListener('change', onChange)
    return () => darkQuery.removeEventListener('change', onChange)
  }, [])

  // Impostazioni → editor
  useEffect(() => {
    const es = toEditorSettings(settings, systemDark)
    document.documentElement.dataset.theme = es.dark ? 'dark' : 'light'
    wb.setEditorSettings(es)
    void saveSettings(settings)
  }, [wb, settings, systemDark])

  const activePane = snap.panes.get(snap.activePaneId)
  const active = snap.docs.get(activePane?.activeDocId ?? '')

  useEffect(() => {
    document.title = active ? `${active.dirty ? '● ' : ''}${active.name} — Fishpad Edit` : 'Fishpad Edit'
  }, [active])

  // ---------- menu ----------

  const multiPane = snap.panes.size > 1
  const anyDirty = [...snap.docs.values()].some((d) => d.dirty)
  const activeTarget = runTarget(active?.lang)
  const canRun = activeTarget !== null

  const menus: MenuDef[] = [
    {
      label: 'File',
      items: [
        { label: 'Nuovo', shortcut: 'Alt+N', action: () => wb.newUntitled() },
        { label: 'Apri…', shortcut: 'Ctrl+O', action: () => void openDialog() },
        {
          label: 'Apri recente',
          submenu: hasFsAccess
            ? [
                ...recents.map((r) => ({ label: r.name, action: () => void openRecent(r) })),
                ...(recents.length
                  ? [
                      'separator' as const,
                      {
                        label: 'Svuota lista',
                        danger: true,
                        action: async () => {
                          if (confirm('Svuotare la lista dei file recenti?')) setRecents(await clearRecents())
                        },
                      },
                    ]
                  : []),
              ]
            : [],
        },
        'separator',
        { label: 'Salva', shortcut: 'Ctrl+S', disabled: !active, action: () => void save() },
        { label: 'Salva con nome…', shortcut: 'Ctrl+Shift+S', disabled: !active, action: () => void save(undefined, true) },
        { label: 'Salva tutto', disabled: !anyDirty, action: () => void saveAll() },
        { label: 'Ricarica dal disco', disabled: !active?.handle, action: () => void reload() },
        'separator',
        { label: 'Chiudi tab', shortcut: 'Alt+W', action: closeActiveTab },
        { label: 'Chiudi pannello', disabled: !multiPane, action: () => wb.closePane() },
      ],
    },
    {
      label: 'Modifica',
      items: [
        { label: 'Annulla', shortcut: 'Ctrl+Z', action: () => run(undo) },
        { label: 'Ripeti', shortcut: 'Ctrl+Y', action: () => run(redo) },
        'separator',
        { label: 'Taglia', shortcut: 'Ctrl+X', action: () => void copy(true) },
        { label: 'Copia', shortcut: 'Ctrl+C', action: () => void copy(false) },
        { label: 'Incolla', shortcut: 'Ctrl+V', action: () => void paste() },
        { label: 'Seleziona tutto', shortcut: 'Ctrl+A', action: () => run(selectAll) },
        'separator',
        { label: 'Cerca…', shortcut: 'Ctrl+F', action: () => run(openSearchPanel) },
        { label: 'Sostituisci…', shortcut: 'Ctrl+H', action: () => run(openReplacePanel) },
        { label: 'Vai alla riga…', shortcut: 'Ctrl+Alt+G', action: () => run(gotoLine) },
        'separator',
        { label: 'Commenta / decommenta', shortcut: 'Ctrl+/', action: () => run(toggleComment) },
        { label: 'Formatta documento', shortcut: 'Shift+Alt+F', disabled: !canFormat(active?.lang), action: () => void formatActive() },
      ],
    },
    {
      label: 'Visualizza',
      items: [
        { label: 'Palette dei comandi…', shortcut: 'Ctrl+Shift+P', action: () => setPalette('commands') },
        { label: 'Vai a una tab…', shortcut: 'Ctrl+P', action: () => setPalette('tabs') },
        'separator',
        { label: 'Dividi a destra', shortcut: 'Ctrl+\\', action: () => void wb.split('row') },
        { label: 'Dividi in basso', action: () => void wb.split('column') },
        { label: 'Chiudi pannello', disabled: !multiPane, action: () => wb.closePane() },
        'separator',
        {
          label: 'Folding',
          submenu: [
            { label: 'Chiudi tutto', shortcut: 'Ctrl+K Ctrl+0', action: () => run(foldAll) },
            { label: 'Apri tutto', shortcut: 'Ctrl+K Ctrl+J', action: () => run(unfoldAll) },
            'separator',
            ...[1, 2, 3, 4, 5].map((n) => ({ label: `Chiudi livello ${n}`, shortcut: `Ctrl+K Ctrl+${n}`, action: () => run(foldLevel(n)) })),
          ],
        },
        'separator',
        {
          label: 'Tema',
          submenu: (
            [
              ['system', 'Sistema'],
              ['light', 'Chiaro'],
              ['dark', 'Scuro'],
            ] as Array<[ThemeMode, string]>
          ).map(([value, label]) => ({ label, checked: settings.theme === value, action: () => setSetting('theme', value) })),
        },
        { label: 'Ingrandisci testo', action: () => zoom(1) },
        { label: 'Riduci testo', action: () => zoom(-1) },
        { label: `Dimensione predefinita (${DEFAULT_SETTINGS.fontSize})`, action: () => setSetting('fontSize', DEFAULT_SETTINGS.fontSize) },
        'separator',
        {
          label: 'Colore tab',
          submenu: active ? tabColorItems(active.color, (c) => wb.setColor(active.id, c)) : [],
        },
        'separator',
        { label: 'A capo automatico', shortcut: 'Alt+Z', checked: settings.wrap, action: toggleWrap },
        'separator',
        { label: 'Console', checked: consoleOpen, action: () => setConsoleOpen((o) => !o) },
      ],
    },
    {
      label: 'Esegui',
      items: [
        {
          label: activeTarget === 'preview' ? 'Anteprima del file' : 'Esegui file o selezione',
          shortcut: 'Ctrl+Enter',
          disabled: !canRun,
          action: () => void runActive(),
        },
        { label: 'Stop', disabled: !runState.alive, action: () => runner.stop() },
        { label: 'Chiudi anteprima', disabled: !runState.preview, action: () => runner.closePreview() },
        ...(hasFolderAccess
          ? [
              'separator' as const,
              {
                label: previewFolder ? `Cartella dell'anteprima: ${previewFolder.name}…` : "Cartella dell'anteprima…",
                action: () => void choosePreviewFolder(),
              },
              { label: 'Scollega la cartella', disabled: !previewFolder, action: forgetPreviewFolder },
            ]
          : []),
        'separator',
        { label: 'Pulisci console', disabled: !runState.entries.length, action: () => runner.clear() },
      ],
    },
    {
      label: 'Aiuto',
      items: [
        { heading: `Fishpad Edit v${__APP_VERSION__}` },
        { label: 'Scorciatoie da tastiera', action: () => setHelp('shortcuts') },
        { label: 'Novità delle versioni', action: () => setHelp('changelog') },
        'separator',
        { label: 'Codice sorgente su GitHub', action: () => window.open(REPO_URL, '_blank', 'noopener') },
      ],
    },
  ]

  /** Ctrl+P: le tab aperte, la attiva per ultima (per passare subito a un'altra). */
  const tabItems = (): PaletteItem[] => {
    const multi = snap.panes.size > 1
    const panes = [...snap.panes.values()]
    return [...snap.docs.values()]
      .sort((a, b) => Number(a.id === active?.id) - Number(b.id === active?.id))
      .map((d) => {
        const n = panes.findIndex((p) => p.docIds.includes(d.id))
        return {
          id: d.id,
          label: `${d.dirty ? '● ' : ''}${d.name}`,
          detail: [d.handle ? '' : 'non salvato', multi && n >= 0 ? `pannello ${n + 1}` : ''].filter(Boolean).join(' · '),
          run: () => showDoc(d.id),
        }
      })
  }

  const closeOverlay = () => {
    setPalette(null)
    setHelp(null)
    wb.activeView?.focus()
  }

  return (
    <div className={`app${dragging ? ' dragging' : ''}`}>
      <header className="titlebar">
        <span className="brand">
          <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" width={16} height={16} />
          Fishpad Edit
          <span className="version">v{__APP_VERSION__}</span>
        </span>
        <MenuBar menus={menus} />
        <div className="spacer" />
        <span className="font-size" title="Dimensione del testo">{settings.fontSize}px</span>
      </header>

      <main className="workspace">
        <SplitView
          layout={snap.layout}
          onResize={(path, sizes) => wb.resize(path, sizes)}
          renderPane={(paneId) => {
            const pane = snap.panes.get(paneId)
            return pane ? (
              <EditorPane
                key={paneId}
                wb={wb}
                pane={pane}
                docs={snap.docs}
                active={multiPane && paneId === snap.activePaneId}
                multiPane={multiPane}
              />
            ) : null
          }}
        />
        <PreviewPanel
          runner={runner}
          docName={runState.preview ? snap.docs.get(runState.preview.docId)?.name : undefined}
          width={previewWidth}
          consoleOpen={consoleOpen}
          onResize={setPreviewWidth}
          onReload={() => runState.preview && runPreview(runState.preview.docId)}
          onToggleConsole={() => setConsoleOpen((o) => !o)}
        />
      </main>

      {consoleOpen && (
        <ConsolePanel
          runner={runner}
          height={consoleHeight}
          canRun={canRun}
          onResize={setConsoleHeight}
          onRun={() => void runActive()}
          onClose={() => {
            setConsoleOpen(false)
            wb.activeView?.focus()
          }}
          onGoto={gotoDocLine}
        />
      )}

      <StatusBar
        doc={active}
        status={snap.status}
        onLanguage={(lang) => active && void wb.setLanguage(active.id, lang, false)}
        onIndent={(indent) => {
          if (active) wb.setIndent(active.id, indent, false)
          wb.activeView?.focus()
        }}
        onRedetectIndent={() => flash(wb.redetectIndent())}
        onConvertIndent={(to) => flash(wb.convertIndent(to))}
        onToggleEol={() => wb.toggleEol()}
        onEncoding={(encoding) => {
          if (active && encoding !== active.encoding) wb.patchDoc(active.id, { encoding, dirty: true })
        }}
        onReopen={(encoding) => void reload(active?.id, encoding)}
      />

      {palette && (
        <CommandPalette
          key={palette}
          items={palette === 'commands' ? menuCommands(menus) : tabItems()}
          placeholder={palette === 'commands' ? 'Cerca un comando…' : 'Vai a una tab aperta…'}
          onClose={closeOverlay}
        />
      )}
      {help && <HelpDialog view={help} onView={setHelp} onClose={closeOverlay} />}

      {toast && <div className="toast" role="status">{toast}</div>}
      {dragging && <div className="drop-overlay">Rilascia per aprire</div>}
    </div>
  )
}
