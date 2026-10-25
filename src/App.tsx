import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import type { EditorView } from '@codemirror/view'
import { redo, selectAll, toggleComment, undo } from '@codemirror/commands'
import { foldAll, unfoldAll } from '@codemirror/language'
import { EditorSelection } from '@codemirror/state'
import { gotoLine, openSearchPanel } from '@codemirror/search'
import { openReplacePanel, type EditorSettings } from './editor/setup'
import { foldLevel } from './editor/folding'
import { PALETTES, type Palette } from './editor/themes'
import { detectByFilename, extensionFor } from './editor/languages'
import { canFormat, formatCode } from './editor/format'
import * as tx from './editor/transforms'
import { DEFAULT_INDENT, indentString } from './editor/indentation'
import {
  detectEol,
  diskMtime,
  ensurePermission,
  exportFile,
  fileInFolder,
  filesFromDrop,
  hasFolderAccess,
  hasFsAccess,
  permissionState,
  pickFiles,
  pickFolder,
  pickUploads,
  readFile,
  readHandle,
  saveAs,
  serialize,
  writeHandle,
  type OpenedFile,
} from './fs'
import { WORKSPACE_LABEL, hasWorkspace, importFiles, parseWorkspacePath, workspaceRoot, writeInWorkspace } from './workspace'
import { sharedUrl, takeShared, type Shared } from './share'
import { detectEnv, deviceNotices, type Notice } from './notices'
import {
  DEFAULT_SETTINGS,
  addRecent,
  addRecentFolder,
  clearRecentFolders,
  clearRecents,
  loadFolders,
  loadRecentFolders,
  loadRecents,
  loadSeenNotices,
  loadSession,
  loadSettings,
  saveFolders,
  saveSeenNotices,
  saveSettings,
  type Bookmark,
  type DiffPrefs,
  type RecentFile,
  type Settings,
} from './store'
import { fetchUrl, fileBaseName, languageFor, tabNameFor, type UrlRequest } from './remote'
import { renameEntry, type TreeEntry } from './explorer'
import { bookmarkFor, findDuplicate, useBookmarks } from './bookmarks'
import { encode, type Encoding } from './encoding'
import { Workbench, type Doc } from './workbench/Workbench'
import type { Indent } from './editor/indentation'
import { diffRange } from './workbench/textDiff'
import { MenuBar, MobileMenu, type MenuDef, type MenuItem } from './components/Menu'
import { COARSE_QUERY, COMPACT_QUERY, useMediaQuery, useVisualViewport } from './components/touch'
import { KeyBar } from './components/KeyBar'
import { NoticeDialog } from './components/NoticeDialog'
import { UpdateBanner } from './components/UpdateBanner'
import { SplitView } from './components/SplitView'
import { EditorPane } from './components/EditorPane'
import { StatusBar } from './components/StatusBar'
import { ConsolePanel } from './components/ConsolePanel'
import { PreviewPanel } from './components/PreviewPanel'
import { tabColorItems } from './components/tabColorMenu'
import { CommandPalette } from './components/CommandPalette'
import { DiffDialog, type DiffSide } from './components/DiffDialog'
import { ChatPanel } from './components/ChatPanel'
import { SettingsDialog, type SettingsView } from './components/SettingsDialog'
import { contextLabel, type TabContext } from './ai/context'
import { addVersion, listVersions, readVersion, sizeLabel, versionLabel } from './history'
import { menuCommands, type PaletteItem } from './components/commands'
import { HelpDialog, type HelpView } from './components/HelpDialog'
import { Sidebar } from './components/Sidebar'
import { BookmarkList } from './components/BookmarkList'
import { FileTree, NoFolder } from './components/FileTree'
import { UrlDialog, type UrlDialogResult } from './components/UrlDialog'
import { Runner } from './runner/Runner'
import { runTarget } from './runner/transpile'
import { folderAssets } from './runner/folderAssets'

const REPO_URL = 'https://github.com/DakkarDaemor/fishpad-edit'
const darkQuery = window.matchMedia('(prefers-color-scheme: dark)')
/** Oltre questa dimensione una risposta JSON non viene formattata (Prettier diventa lento). */
const MAX_FORMAT_CHARS = 2_000_000

/** Confronto aperto: la tab (modificabile) contro un altro testo */
interface DiffState {
  docId: string
  lang: string | null
  indent: Indent
  mine: DiffSide
  other: DiffSide
}

type UrlDialogState = { mode: 'open' } | { mode: 'edit'; bookmark: Extract<Bookmark, { kind: 'url' }> }

/** chiave React stabile per ogni cartella aperta: chiudendone una, gli alberi delle altre restano come sono */
const folderKeys = new WeakMap<FileSystemDirectoryHandle, number>()
let nextFolderKey = 0
const folderKey = (dir: FileSystemDirectoryHandle) => {
  if (!folderKeys.has(dir)) folderKeys.set(dir, nextFolderKey++)
  return folderKeys.get(dir)!
}

function toEditorSettings(s: Pick<Settings, 'theme' | 'fontSize' | 'wrap' | 'typeCheck'>, systemDark: boolean): EditorSettings {
  const palette = s.theme in PALETTES ? (s.theme as Palette) : null
  const dark = palette ? PALETTES[palette].dark : s.theme === 'dark' || (s.theme === 'system' && systemDark)
  return { dark, palette, fontSize: s.fontSize, wrap: s.wrap, typeCheck: s.typeCheck }
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
  const [palette, setPalette] = useState<'commands' | 'tabs' | 'compare' | 'history' | null>(null)
  /** versioni della cronologia locale mostrate nella palette */
  const [historyItems, setHistoryItems] = useState<{ docName: string; items: PaletteItem[] } | null>(null)
  const [diff, setDiff] = useState<DiffState | null>(null)
  const [settingsView, setSettingsView] = useState<SettingsView | null>(null)
  const [chatOpen, setChatOpen] = useState(false)
  /** con anteprima e chat aperte insieme, quale si vede nella colonna destra */
  const [rightTab, setRightTab] = useState<'preview' | 'chat'>('preview')
  /** sale a ogni "Chiedi all'AI": la chat mette il cursore nel campo */
  const [chatFocus, setChatFocus] = useState(0)
  const [help, setHelp] = useState<HelpView | null>(null)
  /** Cartelle dell'esplora file; l'anteprima HTML carica da quella della pagina CSS, script e immagini referenziati */
  const [folders, setFoldersState] = useState<FileSystemDirectoryHandle[]>([])
  const [recentFolders, setRecentFolders] = useState<FileSystemDirectoryHandle[]>([])
  /** spazio dell'app (telefono senza accesso al disco): una sola cartella, quella */
  const workspaceDir = hasWorkspace ? (folders[0] ?? null) : null
  /** percorso nella cartella del file della tab attiva (calcolato in modo asincrono), per evidenziarlo nell'albero */
  const [resolved, setResolved] = useState<{ folder: FileSystemDirectoryHandle; handle: FileSystemFileHandle; path: string | null } | null>(null)
  const [sidebarWidth, setSidebarWidth] = useState(250)
  const bookmarks = useBookmarks()
  const [urlDialog, setUrlDialog] = useState<UrlDialogState | null>(null)
  /** schermo del telefono: un pannello alla volta, barra laterale a cassetto, anteprima sopra l'editor */
  const compact = useMediaQuery(COMPACT_QUERY)
  // PWA installata con la barra del titolo nascosta: con un solo pannello le sue tab salgono nella barra dell'app
  const wco = useMediaQuery('(display-mode: window-controls-overlay)')
  const [titleTabs, setTitleTabs] = useState<HTMLElement | null>(null)
  /** dispositivo touch: tastiera virtuale, niente hover né tasto destro */
  const touch = useMediaQuery(COARSE_QUERY)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [previewHidden, setPreviewHidden] = useState(false)
  /** sale quando l'app scrive nello spazio dell'app: l'esplora file si rilegge */
  const [treeVersion, setTreeVersion] = useState(0)
  const [editorFocused, setEditorFocused] = useState(false)
  /** limiti noti di questo dispositivo, e quelli mostrati ora nella finestra */
  const [allNotices, setAllNotices] = useState<Notice[]>([])
  const [notices, setNotices] = useState<Notice[] | null>(null)
  /** URL con una richiesta in corso (lo stato serve al render, il ref alle funzioni asincrone) */
  const [fetching, setFetching] = useState<ReadonlySet<string>>(new Set())
  const busyUrls = useRef(new Set<string>())
  const toastTimer = useRef<number | undefined>(undefined)
  /** Per documento: ultima versione su disco per cui l'utente ha scelto di tenere le sue modifiche. */
  const keptOverDisk = useRef(new Map<string, number>())
  const checkingDisk = useRef(false)
  /** finché le impostazioni salvate non sono state lette, quelle predefinite non vanno scritte sopra */
  const settingsLoaded = useRef(false)

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

  /** Esegue `add`: se il pannello attivo aveva solo una tab vuota e intatta, viene sostituita da ciò che si è aperto. */
  async function replacingBlank(add: () => Promise<void>) {
    const pane = wb.activePane
    const blankId = pane.docIds.length === 1 && wb.isBlank(pane.docIds[0]) ? pane.docIds[0] : null
    await add()
    if (blankId && wb.activePane.docIds.length > 1) wb.closeTab(wb.activePane.id, blankId, true)
  }

  async function openFiles(files: OpenedFile[]) {
    if (!files.length) return
    await replacingBlank(async () => {
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
    })
  }

  async function openDialog() {
    try {
      await openFiles(await pickFiles())
    } catch (err) {
      flash(`Errore apertura: ${(err as Error).message}`)
    }
  }

  /** Apre un file di cui si ha l'handle (recenti, preferiti, esplora file), chiedendo il permesso se serve. */
  async function openHandle(handle: FileSystemFileHandle) {
    // sul telefono il cassetto copre l'editor: scelto il file, si chiude
    setDrawerOpen(false)
    try {
      if (!(await ensurePermission(handle, 'read'))) return
      await openFiles([await readHandle(handle)])
    } catch {
      flash(`Impossibile aprire "${handle.name}" (spostato o eliminato?)`)
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

  /** Spazi a fine riga e a capo finale, secondo le Impostazioni; la modifica resta nella tab e Ctrl+Z la annulla. */
  function cleanForSave(doc: Doc) {
    wb.setText(doc.id, tx.cleanForSave(wb.content(doc.id), settings.save, doc.lang))
  }

  /** Nome proposto salvando o esportando: quello del file, o dall'URL, con l'estensione del linguaggio se manca. */
  function suggestedName(doc: Doc) {
    const base = doc.request ? fileBaseName(new URL(doc.request.url)) : doc.name
    return base.includes('.') ? base : `${base}${extensionFor(doc.lang)}`
  }

  /** Salva con nome nello spazio dell'app; il nome può contenere cartelle ("note/oggi.md"). null se annullato. */
  async function saveToWorkspace(root: FileSystemDirectoryHandle, suggested: string, data: Uint8Array<ArrayBuffer>) {
    const input = prompt(`Salva in «${WORKSPACE_LABEL}» con il nome (anche dentro una cartella, come note/${suggested}):`, suggested)
    if (input === null) return null
    const overwrite = (name: string) => confirm(`"${name}" esiste già. Sostituirlo?`)
    const handle = await writeInWorkspace(root, parseWorkspacePath(input), data, overwrite)
    if (handle) setTreeVersion((v) => v + 1)
    return handle
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
        cleanForSave(doc)
        const data = encodeDoc(doc)
        if (!data) return
        const mtime = await writeHandle(doc.handle, data)
        wb.patchDoc(doc.id, { dirty: false, mtime })
        keptOverDisk.current.delete(doc.id)
        void addVersion(doc, wb.content(doc.id), 'salvato')
        flash(`Salvato: ${doc.name}`)
        return
      }
      cleanForSave(doc)
      const data = encodeDoc(doc)
      if (!data) return
      const suggested = suggestedName(doc)
      // senza accesso al disco, i file si salvano nello spazio dell'app (l'esplora file ne mostra la radice)
      const handle = workspaceDir ? await saveToWorkspace(workspaceDir, suggested, data) : await saveAs(suggested, data)
      if (handle === null) return // annullato
      if (handle) {
        // una tab URL salvata su disco diventa quel file
        const mtime = (await diskMtime(handle)) ?? undefined
        wb.patchDoc(doc.id, { handle, name: handle.name, dirty: false, mtime, request: undefined, response: undefined })
        setRecents(await addRecent(handle))
        const byName = detectByFilename(handle.name)
        if (byName && byName !== doc.lang) void wb.setLanguage(doc.id, byName, false)
        else if (byName) wb.patchDoc(doc.id, { langAuto: false })
        void addVersion(wb.doc(doc.id) ?? doc, wb.content(doc.id), 'salvato')
        flash(`Salvato: ${handle.name}`)
      } else {
        wb.patchDoc(doc.id, { dirty: false })
        flash(`Scaricato: ${suggested}`)
      }
    } catch (err) {
      flash(`Errore salvataggio: ${(err as Error).message}`)
    }
  }

  /** Una copia della tab fuori dall'app: col foglio Condividi sui dispositivi touch, altrimenti un download. */
  async function exportDoc(docId = wb.activeDoc?.id) {
    const doc = wb.doc(docId)
    const data = doc && encodeDoc(doc)
    if (!doc || !data) return
    try {
      await exportFile(suggestedName(doc), data)
    } catch (err) {
      flash(`Errore esportazione: ${(err as Error).message}`)
    }
  }

  /** Copia nello spazio dell'app dei file del dispositivo e li apre: da lì si salvano con Ctrl+S. */
  async function importToWorkspace() {
    if (!workspaceDir) return
    const files = await pickUploads()
    if (!files.length) return
    const handles = await importFiles(workspaceDir, files, (f, err) => flash(`Impossibile importare "${f.name}": ${err.message}`))
    setTreeVersion((v) => v + 1)
    try {
      await openFiles(await Promise.all(handles.map((h) => readHandle(h))))
    } catch (err) {
      flash(`Errore apertura: ${(err as Error).message}`)
    }
  }

  /** Rilegge il file da disco (con `encoding`, o rilevando la codifica), dopo conferma se ci sono modifiche. */
  async function reload(docId = wb.activeDoc?.id, encoding?: Encoding) {
    const doc = wb.doc(docId)
    if (!doc?.handle) return
    if (doc.dirty && !confirm(`Scartare le modifiche a "${doc.name}" e ricaricarlo dal disco?`)) return
    try {
      if (!(await ensurePermission(doc.handle, 'read'))) return
      const disk = await readHandle(doc.handle, encoding)
      void addVersion(doc, wb.content(doc.id), 'prima di ricaricare')
      wb.replaceFromDisk(doc.id, disk)
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
        if ((await permissionState(handle, 'read')) !== 'granted') continue
        const onDisk = await diskMtime(handle).catch(() => null)
        // rilette dopo gli await: nel frattempo il documento può essere stato salvato o chiuso
        const doc = wb.doc(id)
        if (!doc?.handle || onDisk == null || onDisk === doc.mtime || onDisk === keptOverDisk.current.get(id)) continue
        if (doc.dirty) {
          keptOverDisk.current.set(id, onDisk)
          const msg = `"${doc.name}" è stato modificato da un altro programma, e qui ha modifiche non salvate.\n\nRicaricarlo dal disco perdendo le modifiche?`
          if (!confirm(msg)) continue
        }
        const disk = await readHandle(doc.handle)
        void addVersion(doc, wb.content(id), 'prima di ricaricare')
        wb.replaceFromDisk(id, disk)
        keptOverDisk.current.delete(id)
        flash(`Ricaricato dal disco: ${doc.name}`)
      }
    } catch (err) {
      console.warn('[checkDisk]', err)
    } finally {
      checkingDisk.current = false
    }
  }

  // ---------- tab collegate a un URL ----------

  function setBusy(url: string, on: boolean) {
    if (on) busyUrls.current.add(url)
    else busyUrls.current.delete(url)
    setFetching(new Set(busyUrls.current))
  }

  /** Scarica l'URL; il JSON viene formattato con Prettier, che (a differenza di JSON.parse) non arrotonda i numeri grandi. */
  async function download(request: UrlRequest) {
    const got = await fetchUrl(request)
    const lang = languageFor(got.response.contentType, new URL(request.url))
    let text = got.text
    if (lang === 'JSON' && text.length <= MAX_FORMAT_CHARS) {
      text = await formatCode(text, 'JSON', 0, DEFAULT_INDENT).then((r) => r.formatted, () => text)
    }
    return { ...got, text, lang }
  }

  /** Apre l'URL in una tab; se è già aperto, la mostra e ripete la richiesta (con gli header indicati). */
  async function openUrl(request: UrlRequest, name?: string) {
    const existing = wb.findByUrl(request.url)
    if (existing) {
      showDoc(existing.id)
      wb.patchDoc(existing.id, { request })
      await refreshUrl(existing.id)
      return
    }
    if (busyUrls.current.has(request.url)) return
    const url = new URL(request.url)
    setBusy(request.url, true)
    flash(`GET ${url.host}…`)
    try {
      const got = await download(request)
      await replacingBlank(async () => {
        wb.addDoc({
          name: name || tabNameFor(url),
          content: got.text,
          eol: detectEol(got.text),
          lang: got.lang,
          langAuto: got.lang === undefined,
          request,
          response: got.response,
        })
      })
      const { status, statusText } = got.response
      if (status >= 400) flash(`HTTP ${status} ${statusText}`.trim())
      else setToast(null) // toglie "GET host…"
    } catch (err) {
      flash((err as Error).message)
    } finally {
      setBusy(request.url, false)
    }
  }

  /** Ripete la richiesta della tab URL, dopo conferma se ci sono modifiche. */
  async function refreshUrl(docId = wb.activeDoc?.id) {
    const doc = wb.doc(docId)
    if (!doc?.request || busyUrls.current.has(doc.request.url)) return
    if (doc.dirty && !confirm(`Scartare le modifiche a "${doc.name}" e ripetere la richiesta?`)) return
    const { url } = doc.request
    setBusy(url, true)
    try {
      const got = await download(doc.request)
      // nel frattempo la tab può essere stata chiusa o salvata su disco
      if (wb.doc(doc.id)?.request?.url !== url) return
      void addVersion(doc, wb.content(doc.id), 'prima di ricaricare')
      wb.replaceFromDisk(doc.id, { content: got.text, eol: detectEol(got.text), encoding: 'utf-8' })
      wb.patchDoc(doc.id, { response: got.response })
      const { status, statusText, ms } = got.response
      flash(status >= 400 ? `HTTP ${status} ${statusText}`.trim() : `Aggiornato: ${doc.name} (${ms} ms)`)
    } catch (err) {
      flash((err as Error).message)
    } finally {
      setBusy(url, false)
    }
  }

  /** Testo, URL o file condivisi da un'altra app ("Condividi → Fishpad"). */
  async function openShared(shared: Shared) {
    const url = sharedUrl(shared)
    if (shared.files.length) await openFiles(await Promise.all(shared.files.map((f) => readFile(f))))
    else if (url) await openUrl({ url })
    else if (shared.text) {
      const text = shared.text
      await replacingBlank(async () => {
        wb.addDoc({ name: shared.title?.trim() || 'Testo condiviso', content: text, eol: detectEol(text) })
      })
    }
  }

  // ---------- preferiti ----------

  async function addBookmark(b: Bookmark) {
    const dup = await findDuplicate(bookmarks.list, b)
    if (dup) {
      flash(`Già nei preferiti: ${dup.name}`)
      return
    }
    bookmarks.add(b)
    flash(`Aggiunto ai preferiti: ${b.name}`)
  }

  function bookmarkDoc(docId = wb.activeDoc?.id) {
    const doc = wb.doc(docId)
    const b = doc && bookmarkFor(doc)
    if (b) void addBookmark(b)
    else flash('Salva prima il file su disco')
  }

  function openBookmark(b: Bookmark) {
    setDrawerOpen(false)
    if (b.kind === 'url') void openUrl(b.request, b.name)
    else void openHandle(b.handle)
  }

  function editBookmark(b: Bookmark) {
    if (b.kind === 'url') {
      setUrlDialog({ mode: 'edit', bookmark: b })
      return
    }
    const name = prompt('Nome del preferito:', b.name)?.trim()
    if (name) bookmarks.update(b.id, { name })
  }

  function submitUrlDialog(state: UrlDialogState, { request, name, bookmark }: UrlDialogResult) {
    setUrlDialog(null)
    const finalName = name || tabNameFor(new URL(request.url))
    if (state.mode === 'edit') {
      bookmarks.update(state.bookmark.id, { name: finalName, request })
      return
    }
    void openUrl(request, name || undefined)
    if (bookmark) void addBookmark({ id: crypto.randomUUID(), name: finalName, kind: 'url', request })
  }

  // ---------- cartella (esplora file) ----------

  function setFolders(list: FileSystemDirectoryHandle[]) {
    setFoldersState(list)
    void saveFolders(list)
  }

  /** Aggiunge una cartella all'esplora file (scelta ora, o una recente); se è già aperta non la ripete. */
  async function openFolder(recent?: FileSystemDirectoryHandle) {
    try {
      const dir = recent ?? (await pickFolder())
      if (!dir) return
      // da una recente: il permesso si chiede ora, col clic dell'utente (dopo non si potrebbe)
      if (recent) await ensurePermission(dir, 'readwrite').catch(() => false)
      setRecentFolders(await addRecentFolder(dir))
      setSettings((s) => ({ ...s, sidebar: true }))
      for (const d of folders) if (await d.isSameEntry(dir).catch(() => false)) return
      setFolders([...folders, dir])
    } catch (err) {
      flash(`Errore: ${(err as Error).message}`)
    }
  }

  const closeFolder = (dir: FileSystemDirectoryHandle) => setFolders(folders.filter((d) => d !== dir))

  /** Cartella aperta che contiene il file, se c'è. */
  async function folderOf(handle: FileSystemFileHandle) {
    for (const d of folders) if (await d.resolve(handle).catch(() => null)) return d
    return null
  }

  /**
   * Rinomina un file o una cartella dell'esplora file. Le tab dei file coinvolti (il file stesso, o quelli
   * dentro la cartella) passano al nuovo percorso, così Ctrl+S continua a salvare nel posto giusto.
   */
  async function renameInFolder(parent: FileSystemDirectoryHandle, entry: TreeEntry, newName: string) {
    const affected: Array<{ id: string; rel: string[] }> = []
    for (const d of wb.allDocs) {
      if (!d.handle) continue
      let rel: string[] | null
      if (entry.handle.kind === 'file') rel = (await entry.handle.isSameEntry(d.handle).catch(() => false)) ? [] : null
      else rel = await entry.handle.resolve(d.handle).catch(() => null)
      if (rel) affected.push({ id: d.id, rel })
    }
    const renamed = await renameEntry(parent, entry.handle, newName)
    for (const { id, rel } of affected) {
      const handle = renamed.kind === 'file' ? renamed : await fileInFolder(renamed, rel)
      const doc = wb.doc(id)
      if (!handle || !doc) continue
      const mtime = (await diskMtime(handle).catch(() => null)) ?? doc.mtime
      wb.patchDoc(id, { handle, name: handle.name, mtime })
      const byName = detectByFilename(handle.name)
      if (renamed.kind === 'file' && byName && byName !== doc.lang) void wb.setLanguage(id, byName, false)
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

  /** Applica `fn` a ogni selezione o, se non c'è, a tutto il documento; Ctrl+Z la annulla. */
  function transform(fn: (text: string) => string) {
    const v = wb.activeView
    if (!v) return
    const { state } = v
    try {
      const spec = state.selection.ranges.some((r) => !r.empty)
        ? state.changeByRange((r) => {
            if (r.empty) return { range: r }
            const insert = fn(state.sliceDoc(r.from, r.to))
            return { changes: { from: r.from, to: r.to, insert }, range: EditorSelection.range(r.from, r.from + insert.length) }
          })
        : { changes: diffRange(state.doc.toString(), fn(state.doc.toString())) ?? [] }
      v.dispatch({ ...spec, scrollIntoView: true, userEvent: 'input.transform' })
    } catch (err) {
      flash(`Trasformazione non riuscita: ${(err as Error).message}`)
    }
    v.focus()
  }

  // ---------- confronto ----------

  /** Apre il confronto tra la tab attiva (o `docId`) e un altro testo. */
  function openDiff(other: DiffSide, docId = wb.activeDoc?.id) {
    const doc = wb.doc(docId)
    if (!doc) return
    if (!showDoc(doc.id)) return
    setDiff({ docId: doc.id, lang: doc.lang, indent: doc.indent, mine: { title: doc.name, text: wb.content(doc.id) }, other })
  }

  /** Confronta con la versione su disco, o con la risposta attuale dell'URL. */
  async function compareWithSource() {
    const doc = wb.activeDoc
    try {
      if (doc?.handle) {
        if (!(await ensurePermission(doc.handle, 'read'))) return
        openDiff({ title: `${doc.name} (su disco)`, text: (await readHandle(doc.handle)).content }, doc.id)
      } else if (doc?.request) {
        const got = await download(doc.request)
        openDiff({ title: `${doc.name} (risposta attuale)`, text: got.text }, doc.id)
      }
    } catch (err) {
      flash(`Impossibile leggere la versione da confrontare: ${(err as Error).message}`)
    }
  }

  async function compareWithClipboard() {
    try {
      openDiff({ title: 'Appunti', text: await navigator.clipboard.readText() })
    } catch {
      flash('Appunti non disponibili')
    }
  }

  async function compareWithFile() {
    try {
      const [f] = await pickFiles()
      if (f) openDiff({ title: f.name, text: f.content })
    } catch (err) {
      flash(`Errore apertura: ${(err as Error).message}`)
    }
  }

  /** Alla chiusura le modifiche fatte nel confronto passano alla tab (annullabili con Ctrl+Z). */
  function closeDiff(text: string) {
    const d = diff
    setDiff(null)
    if (!d || text === d.mine.text) return
    if (!wb.doc(d.docId) || wb.content(d.docId) !== d.mine.text) {
      flash('La tab è cambiata durante il confronto: modifiche del confronto non applicate')
      return
    }
    wb.setText(d.docId, text)
    flash('Modifiche del confronto applicate alla tab (Ctrl+Z per annullare)')
  }

  // ---------- cronologia locale ----------

  /** Versioni salvate del documento nella palette: scelta una, si apre nel confronto con la tab. */
  async function openHistory(docId = wb.activeDoc?.id) {
    const doc = wb.doc(docId)
    if (!doc) return
    const versions = await listVersions(doc)
    if (!versions.length) {
      flash(`Nessuna versione salvata di "${doc.name}"`)
      return
    }
    const items = versions.map((v) => ({
      id: v.id,
      label: versionLabel(v),
      detail: [v.name !== doc.name ? v.name : '', sizeLabel(v.size)].filter(Boolean).join(' · '),
      run: async () => {
        const text = await readVersion(v)
        if (text === null) flash('Versione non più disponibile')
        else openDiff({ title: `${v.name} (${versionLabel(v)})`, text }, doc.id)
      },
    }))
    setHistoryItems({ docName: doc.name, items })
    setPalette('history')
  }

  // ---------- chat ----------

  /** La tab attiva e la sua selezione, da mandare con la domanda. */
  function tabContext(withContent = true): TabContext | null {
    const doc = wb.activeDoc
    const v = wb.activeView
    if (!doc || !v) return null
    const s = v.state
    const r = s.selection.main
    return {
      name: doc.name,
      lang: doc.lang,
      content: withContent ? s.doc.toString() : '',
      selection: r.empty ? undefined : { text: withContent ? s.sliceDoc(r.from, r.to) : '', fromLine: s.doc.lineAt(r.from).number, toLine: s.doc.lineAt(r.to).number },
    }
  }

  /** Mostra la chat (aprendola se serve); se è già in vista, la chiude. */
  function toggleChat() {
    const visible = chatOpen && (rightTab === 'chat' || !runner.getSnapshot().preview) && !(compact && previewHidden)
    if (visible) {
      setChatOpen(false)
      wb.activeView?.focus()
      return
    }
    setChatOpen(true)
    setRightTab('chat')
    setPreviewHidden(false)
  }

  /** Apre la chat con il cursore nel campo della domanda: riguarda la selezione, se c'è. */
  function askAi() {
    setChatOpen(true)
    setRightTab('chat')
    setPreviewHidden(false)
    setChatFocus((n) => n + 1)
  }

  /** Codice della chat al cursore, o al posto della selezione (annullabile con Ctrl+Z). */
  function insertCode(code: string) {
    const v = wb.activeView
    if (!v) return
    v.dispatch(v.state.replaceSelection(code), { userEvent: 'input.paste', scrollIntoView: true })
    // sul telefono la chat copre l'editor
    setPreviewHidden(true)
    v.focus()
  }

  /** Confronta la tab con la proposta della chat: se c'è una selezione, la proposta prende il suo posto. */
  function compareCode(code: string) {
    const doc = wb.activeDoc
    const v = wb.activeView
    if (!doc || !v) return
    const r = v.state.selection.main
    const text = r.empty ? code : v.state.sliceDoc(0, r.from) + code + v.state.sliceDoc(r.to)
    openDiff({ title: r.empty ? 'Proposta della chat' : 'Tab con la proposta della chat al posto della selezione', text }, doc.id)
  }

  // ---------- esecuzione ----------

  /**
   * JS/TS: esegue il file attivo in console, o solo la selezione se c'è.
   * HTML/JSX/TSX/Markdown/JSON: apre (o ricarica) l'anteprima del file. false se il file non è eseguibile.
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
   * Esegue l'anteprima del documento, con i file locali della cartella aperta se la pagina sta lì dentro.
   * `ask`: si può chiedere il permesso di lettura (solo su azione dell'utente, non negli aggiornamenti dal vivo).
   */
  async function runPreview(docId: string, ask = true) {
    const doc = wb.doc(docId)
    if (!doc) return
    let assets = null
    if (folders.length && (doc.lang === 'HTML' || doc.lang === 'Markdown')) {
      // la cartella che contiene la pagina; per una tab non salvata, la prima aperta
      const folder = (doc.handle && (await folderOf(doc.handle))) || folders[0]
      const granted = ask
        ? await ensurePermission(folder, 'read').catch(() => false)
        : (await permissionState(folder, 'read')) === 'granted'
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
    // aperta dall'utente (non un aggiornamento dal vivo): sul telefono torna in primo piano
    if (ask) {
      setPreviewHidden(false)
      setRightTab('preview')
    }
    void runner.run({ code: wb.content(docId), lang: current.lang, docId, name: current.name, firstLine: 1, selection: false, assets })
  }

  /** Dal nome del file in Anteprima o Console alla sua tab (sul telefono l'anteprima copre l'editor). */
  function showFromPanel(docId: string) {
    setPreviewHidden(true)
    showDoc(docId)
    wb.activeView?.focus()
  }

  function gotoDocLine(docId: string, line: number) {
    // sul telefono l'anteprima copre l'editor
    setPreviewHidden(true)
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

  const setDiffPrefs = useCallback((patch: Partial<DiffPrefs>) => setSettings((s) => ({ ...s, diff: { ...s.diff, ...patch } })), [])
  const toggleWrap = () => setSettings((s) => ({ ...s, wrap: !s.wrap }))
  // sul telefono la barra laterale è un cassetto che si apre all'occorrenza, e non resta aperta tra una sessione e l'altra
  const toggleSidebar = () => (compact ? setDrawerOpen((o) => !o) : setSettings((s) => ({ ...s, sidebar: !s.sidebar })))
  const zoom = (delta: number) => setSettings((s) => ({ ...s, fontSize: Math.min(32, Math.max(10, s.fontSize + delta)) }))

  // Le azioni sono ricreate a ogni render: gli handler globali le leggono da qui.
  const all = { openDialog, save, openFiles, openShared, closeActiveTab, toggleWrap, toggleSidebar, runActive, checkDisk, formatActive, runPreview, refreshUrl, toggleChat, askAi, gotoDocLine }
  const actions = useRef(all)
  useEffect(() => {
    actions.current = all
  })
  // clic su una chiave nell'albero JSON dell'anteprima
  useEffect(() => runner.onGoto((docId, line) => actions.current.gotoDocLine(docId, line)), [runner])

  // ---------- inizializzazione ----------

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const [session, savedSettings, savedRecents, savedFolders, savedRecentFolders, seenNotices] = await Promise.all([
        loadSession(),
        loadSettings(),
        loadRecents(),
        loadFolders(),
        loadRecentFolders(),
        loadSeenNotices(),
      ])
      if (cancelled) return
      // senza accesso alle cartelle del disco l'esplora file mostra sempre lo spazio dell'app
      const appDir = hasWorkspace ? await workspaceRoot() : null
      if (cancelled) return
      settingsLoaded.current = true
      setSettings(savedSettings)
      setRecents(savedRecents)
      setFoldersState(hasWorkspace ? (appDir ? [appDir] : []) : savedFolders)
      setRecentFolders(savedRecentFolders)
      // alla prima apertura (o quando ne compare uno nuovo) si mostrano i limiti del dispositivo non ancora visti
      const found = deviceNotices(detectEnv(hasFsAccess, !!appDir))
      setAllNotices(found)
      const unseen = found.filter((n) => !seenNotices.includes(n.id))
      if (unseen.length) setNotices(unseen)
      wb.setEditorSettings(toEditorSettings(savedSettings, darkQuery.matches))
      if (!session || !wb.restore(session)) wb.newUntitled()
      void actions.current.checkDisk()
      // "Condividi → Fishpad" da un'altra app: il service worker ha riaperto l'app con i dati
      void takeShared()
        .then((shared) => shared && actions.current.openShared(shared))
        .catch((err) => console.warn('[share]', err))
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
      else if ((mod || e.altKey) && e.shiftKey && code === 'KeyT') void wb.reopenClosed()
      else if (e.ctrlKey && e.key === 'Tab') wb.cycleTab(e.shiftKey ? -1 : 1)
      else if (e.ctrlKey && e.key === 'PageDown') wb.cycleTab(1)
      else if (e.ctrlKey && e.key === 'PageUp') wb.cycleTab(-1)
      else if (mod && !e.altKey && e.key === '\\') void wb.split('row')
      else if (e.altKey && !mod && code === 'KeyZ') a.toggleWrap()
      else if ((mod && e.shiftKey && !e.altKey && code === 'KeyP') || e.key === 'F1') setPalette('commands')
      else if (mod && !e.shiftKey && !e.altKey && code === 'KeyP') setPalette('tabs')
      else if (e.altKey && e.shiftKey && !mod && code === 'KeyF') void a.formatActive()
      else if (mod && !e.shiftKey && !e.altKey && code === 'KeyB') a.toggleSidebar()
      else if (mod && !e.shiftKey && !e.altKey && code === 'Comma') setSettingsView('look')
      else if (mod && e.altKey && !e.shiftKey && code === 'KeyI') a.toggleChat()
      else if (mod && e.altKey && e.shiftKey && code === 'KeyI') a.askAi()
      // F5 ripete la richiesta di una tab URL; altrove resta al browser
      else if (e.key === 'F5' && !mod && !e.altKey && !e.shiftKey && wb.activeDoc?.request) void a.refreshUrl()
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
      // anche le modifiche ai file su disco (CSS, script…) che la pagina può caricare dalla cartella aperta
      if (!shown || (shown !== docId && !(folders.length && wb.doc(docId)?.handle))) return
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
  }, [wb, runner, folders.length])

  // Cronologia locale: il testo alla chiusura di una tab, e ogni 5 minuti quello delle tab cambiate
  useEffect(() => {
    const changed = new Set<string>()
    const offClose = wb.onDocClosed((doc, content) => void addVersion(doc, content, 'alla chiusura'))
    const offChange = wb.onContentChange((id) => changed.add(id))
    const timer = window.setInterval(() => {
      for (const id of changed) {
        const doc = wb.doc(id)
        if (doc) void addVersion(doc, wb.content(id), 'automatica')
      }
      changed.clear()
    }, 5 * 60_000)
    return () => {
      offClose()
      offChange()
      clearInterval(timer)
    }
  }, [wb])

  // Chiusa la tab del documento in anteprima, si chiude anche l'anteprima
  const previewDocId = runState.preview?.docId
  useEffect(() => {
    if (previewDocId && !snap.docs.has(previewDocId)) runner.closePreview()
  }, [runner, previewDocId, snap.docs])

  // Dispositivi touch: l'app sta sopra la tastiera virtuale, e mostrare una tab non apre la tastiera
  useVisualViewport(touch)
  useEffect(() => wb.setAutoFocus(!touch), [wb, touch])

  // Editor col focus: sui dispositivi touch compare la barra dei tasti aggiuntivi
  useEffect(() => {
    if (!touch) return
    let frame = 0
    // durante focusout activeElement non è ancora quello nuovo: si guarda al frame successivo
    const update = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => setEditorFocused(!!document.activeElement?.closest('.cm-content')))
    }
    document.addEventListener('focusin', update)
    document.addEventListener('focusout', update)
    return () => {
      cancelAnimationFrame(frame)
      document.removeEventListener('focusin', update)
      document.removeEventListener('focusout', update)
    }
  }, [touch])

  // Tema di sistema
  useEffect(() => {
    const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches)
    darkQuery.addEventListener('change', onChange)
    return () => darkQuery.removeEventListener('change', onChange)
  }, [])

  // Impostazioni → editor
  const { theme, fontSize, wrap, typeCheck } = settings
  const editorSettings = useMemo(() => toEditorSettings({ theme, fontSize, wrap, typeCheck }, systemDark), [theme, fontSize, wrap, typeCheck, systemDark])
  useEffect(() => {
    document.documentElement.dataset.theme = editorSettings.dark ? 'dark' : 'light'
    if (editorSettings.palette) document.documentElement.dataset.palette = editorSettings.palette
    else delete document.documentElement.dataset.palette
    wb.setEditorSettings(editorSettings)
    if (settingsLoaded.current) void saveSettings(settings)
  }, [wb, settings, editorSettings])

  const activePane = snap.panes.get(snap.activePaneId)
  const active = snap.docs.get(activePane?.activeDocId ?? '')

  useEffect(() => {
    document.title = active ? `${active.dirty ? '● ' : ''}${active.name} — Fishpad Edit` : 'Fishpad Edit'
  }, [active])

  // File della tab attiva nell'albero dell'esplora file
  const activeHandle = active?.handle
  useEffect(() => {
    if (!activeHandle) return
    let cancelled = false
    ;(async () => {
      for (const folder of folders) {
        const path = await folder.resolve(activeHandle).catch(() => null)
        if (cancelled) return
        if (path) return setResolved({ folder, handle: activeHandle, path: path.join('/') })
      }
      setResolved(null)
    })()
    return () => {
      cancelled = true
    }
  }, [folders, activeHandle])
  const activePath = (dir: FileSystemDirectoryHandle) => (resolved && resolved.folder === dir && resolved.handle === activeHandle ? resolved.path : null)

  // ---------- menu ----------

  const multiPane = snap.panes.size > 1
  const anyDirty = [...snap.docs.values()].some((d) => d.dirty)
  const activeTarget = runTarget(active?.lang)
  const canRun = activeTarget !== null

  /** colonna destra: la chat si vede se è aperta e, con l'anteprima aperta, se è la scheda scelta */
  const chatShown = chatOpen && (!runState.preview || rightTab === 'chat')
  const rightTabs =
    runState.preview && chatOpen ? (
      <span className="right-tabs">
        <button className={chatShown ? undefined : 'current'} onClick={() => setRightTab('preview')}>Anteprima</button>
        <button className={chatShown ? 'current' : undefined} onClick={() => setRightTab('chat')}>Chat</button>
      </span>
    ) : undefined
  const chatContext = chatOpen ? tabContext(false) : null
  const chatLabel = chatContext && contextLabel(chatContext)

  const menus: MenuDef[] = [
    {
      label: 'File',
      items: [
        { label: 'Nuovo', shortcut: 'Alt+N', action: () => wb.newUntitled() },
        { label: 'Apri…', shortcut: 'Ctrl+O', action: () => void openDialog() },
        { label: 'Apri URL…', action: () => setUrlDialog({ mode: 'open' }) },
        ...(hasFolderAccess
          ? [
              { label: 'Apri cartella…', action: () => void openFolder() },
              {
                label: 'Cartelle recenti',
                submenu: [
                  ...recentFolders.map((d) => ({ label: d.name, action: () => void openFolder(d) })),
                  ...(recentFolders.length
                    ? [
                        'separator' as const,
                        {
                          label: 'Svuota lista',
                          danger: true,
                          action: async () => {
                            if (confirm('Svuotare la lista delle cartelle recenti?')) setRecentFolders(await clearRecentFolders())
                          },
                        },
                      ]
                    : []),
                ],
              },
            ]
          : []),
        ...(workspaceDir ? [{ label: `Importa in «${WORKSPACE_LABEL}»…`, action: () => void importToWorkspace() }] : []),
        {
          label: 'Apri recente',
          submenu: hasFsAccess
            ? [
                ...recents.map((r) => ({ label: r.name, action: () => void openHandle(r.handle) })),
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
        { label: 'Cronologia locale…', disabled: !active, action: () => void openHistory() },
        'separator',
        { label: 'Salva', shortcut: 'Ctrl+S', disabled: !active, action: () => void save() },
        { label: 'Salva con nome…', shortcut: 'Ctrl+Shift+S', disabled: !active, action: () => void save(undefined, true) },
        { label: 'Salva tutto', disabled: !anyDirty, action: () => void saveAll() },
        // con l'accesso al disco ci pensa Salva con nome
        ...(hasFsAccess ? [] : [{ label: 'Esporta / condividi…', disabled: !active, action: () => void exportDoc() }]),
        active?.request
          ? { label: "Ricarica dall'URL", shortcut: 'F5', action: () => void refreshUrl() }
          : { label: 'Ricarica dal disco', disabled: !active?.handle, action: () => void reload() },
        'separator',
        { label: 'Chiudi tab', shortcut: 'Alt+W', action: closeActiveTab },
        { label: 'Riapri tab chiusa', shortcut: 'Alt+Shift+T', disabled: !snap.closedCount, action: () => void wb.reopenClosed() },
        { label: 'Chiudi pannello', disabled: !multiPane, action: () => wb.closePane() },
        ...(hasFolderAccess
          ? [{ label: folders.length > 1 ? 'Chiudi cartelle' : 'Chiudi cartella', disabled: !folders.length, action: () => setFolders([]) }]
          : []),
        'separator',
        { label: 'Impostazioni…', shortcut: 'Ctrl+,', action: () => setSettingsView('look') },
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
        {
          label: 'Trasforma',
          submenu: [
            { label: 'Ordina righe (A → Z)', disabled: !active, action: () => transform((t) => tx.sortLines(t)) },
            { label: 'Ordina righe (Z → A)', disabled: !active, action: () => transform((t) => tx.sortLines(t, true)) },
            { label: 'Inverti righe', disabled: !active, action: () => transform(tx.reverseLines) },
            { label: 'Rimuovi righe duplicate', disabled: !active, action: () => transform(tx.uniqueLines) },
            { label: 'Rimuovi spazi a fine riga', disabled: !active, action: () => transform(tx.trimTrailing) },
            'separator',
            { label: 'MAIUSCOLO', disabled: !active, action: () => transform((t) => t.toLocaleUpperCase()) },
            { label: 'minuscolo', disabled: !active, action: () => transform((t) => t.toLocaleLowerCase()) },
            'separator',
            { label: 'Codifica Base64', disabled: !active, action: () => transform(tx.base64Encode) },
            { label: 'Decodifica Base64', disabled: !active, action: () => transform(tx.base64Decode) },
            { label: 'Codifica URL', disabled: !active, action: () => transform(tx.urlEncode) },
            { label: 'Decodifica URL', disabled: !active, action: () => transform(tx.urlDecode) },
            'separator',
            { label: 'JSON: ordina chiavi', disabled: !active, action: () => transform((t) => tx.jsonSortKeys(t, indentString(active?.indent ?? DEFAULT_INDENT))) },
            { label: 'JSON: minifica', disabled: !active, action: () => transform(tx.jsonMinify) },
          ],
        },
        'separator',
        {
          label: 'Confronta',
          submenu: [
            active?.request
              ? { label: "Con la risposta attuale dell'URL", action: () => void compareWithSource() }
              : { label: 'Con la versione su disco', disabled: !active?.handle, action: () => void compareWithSource() },
            { label: "Con un'altra tab…", disabled: snap.docs.size < 2, action: () => setPalette('compare') },
            { label: 'Con gli appunti', disabled: !active, action: () => void compareWithClipboard() },
            { label: 'Con un file…', disabled: !active, action: () => void compareWithFile() },
          ],
        },
      ],
    },
    {
      label: 'Visualizza',
      items: [
        { label: 'Palette dei comandi…', shortcut: 'Ctrl+Shift+P', action: () => setPalette('commands') },
        { label: 'Vai a una tab…', shortcut: 'Ctrl+P', action: () => setPalette('tabs') },
        { label: 'Barra laterale', shortcut: 'Ctrl+B', checked: compact ? drawerOpen : settings.sidebar, action: toggleSidebar },
        'separator',
        // sullo schermo del telefono si vede un pannello alla volta
        { label: 'Dividi a destra', shortcut: 'Ctrl+\\', disabled: compact, action: () => void wb.split('row') },
        { label: 'Dividi in basso', disabled: compact, action: () => void wb.split('column') },
        { label: 'Ruota pannello (rispetto al precedente)', disabled: compact || !multiPane, action: () => wb.rotate() },
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
        // tema e dimensione predefinita stanno in Impostazioni → Aspetto
        { label: 'Ingrandisci testo', action: () => zoom(1) },
        { label: 'Riduci testo', action: () => zoom(-1) },
        'separator',
        {
          label: 'Colore tab',
          submenu: active ? tabColorItems(active.color, (c) => wb.setColor(active.id, c)) : [],
        },
        'separator',
        { label: 'A capo automatico', shortcut: 'Alt+Z', checked: settings.wrap, action: toggleWrap },
        'separator',
        { label: 'Console', checked: consoleOpen, action: () => setConsoleOpen((o) => !o) },
        { label: 'Chat AI', shortcut: 'Ctrl+Alt+I', checked: chatOpen, action: toggleChat },
        { label: "Chiedi all'AI sulla selezione", shortcut: 'Ctrl+Shift+Alt+I', disabled: !active, action: askAi },
      ],
    },
    {
      label: 'Preferiti',
      items: [
        { label: 'Aggiungi la tab ai preferiti', disabled: !active?.handle && !active?.request, action: () => bookmarkDoc() },
        { label: 'Apri URL…', action: () => setUrlDialog({ mode: 'open' }) },
        ...(bookmarks.list.length
          ? ['separator' as const, ...bookmarks.list.map((b) => ({ label: b.name, action: () => openBookmark(b) }))]
          : []),
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
        'separator',
        { label: 'Pulisci console', disabled: !runState.entries.length, action: () => runner.clear() },
      ],
    },
    {
      label: 'Aiuto',
      items: [
        { heading: `Fishpad Edit v${__APP_VERSION__}` },
        { label: 'Scorciatoie da tastiera', action: () => setHelp('shortcuts') },
        { label: 'Limiti su questo dispositivo', disabled: !allNotices.length, action: () => setNotices(allNotices) },
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
          detail: [d.handle ? '' : d.request ? new URL(d.request.url).host : 'non salvato', multi && n >= 0 ? `pannello ${n + 1}` : ''].filter(Boolean).join(' · '),
          run: () => showDoc(d.id),
        }
      })
  }

  /** Le altre tab, per confrontarle con quella attiva. */
  const compareItems = (): PaletteItem[] =>
    [...snap.docs.values()]
      .filter((d) => d.id !== active?.id)
      .map((d) => ({ id: d.id, label: d.name, run: () => openDiff({ title: d.name, text: wb.content(d.id) }) }))

  /** Voci del menu col tasto destro di una tab che dipendono dall'app. */
  const tabMenuExtra = (doc: Doc): MenuItem[] => [
    { label: 'Cronologia locale…', action: () => void openHistory(doc.id) },
    ...(active && doc.id !== active.id
      ? [{ label: `Confronta con «${active.name}»`, action: () => openDiff({ title: doc.name, text: wb.content(doc.id) }, active.id) }]
      : []),
    ...(doc.request ? [{ label: "Ricarica dall'URL", action: () => void refreshUrl(doc.id) }] : []),
    { label: 'Aggiungi ai preferiti', disabled: !doc.handle && !doc.request, action: () => bookmarkDoc(doc.id) },
    'separator',
  ]

  /** Passa al pannello successivo (sul telefono se ne vede uno alla volta). */
  function nextPane() {
    const ids = [...snap.panes.keys()]
    wb.focusPane(ids[(ids.indexOf(snap.activePaneId) + 1) % ids.length])
  }

  function renderPane(paneId: string) {
    const pane = snap.panes.get(paneId)
    return pane ? (
      <EditorPane
        key={paneId}
        wb={wb}
        pane={pane}
        docs={snap.docs}
        active={multiPane && paneId === snap.activePaneId}
        multiPane={multiPane}
        tabMenuExtra={tabMenuExtra}
        compact={compact ? { onNextPane: multiPane ? nextPane : undefined } : undefined}
        marks={{ preview: runState.preview?.docId, console: runState.source?.docId }}
        tabHost={titleTabs}
      />
    ) : null
  }

  async function closeNotices() {
    const shown = notices ?? []
    setNotices(null)
    const seen = await loadSeenNotices()
    await saveSeenNotices([...new Set([...seen, ...shown.map((n) => n.id)])])
  }

  const closeOverlay = () => {
    setSettingsView(null)
    setUrlDialog(null)
    setPalette(null)
    setHelp(null)
    wb.activeView?.focus()
  }

  return (
    <div className={`app${dragging ? ' dragging' : ''}`}>
      <header className="titlebar">
        {compact && <MobileMenu menus={menus} />}
        <span className="brand">
          <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" width={16} height={16} />
          {compact ? 'Fishpad' : 'Fishpad Edit'}
          {!compact && <span className="version">v{__APP_VERSION__}</span>}
        </span>
        {!compact && <MenuBar menus={menus} />}
        {wco && !compact && !multiPane && <div className="title-tabs" ref={setTitleTabs} />}
        <div className="spacer" />
        {compact ? (
          <>
            {(runState.preview || chatOpen) && previewHidden && (
              <button className="title-action" onClick={() => setPreviewHidden(false)} title={chatShown ? 'Mostra la chat' : "Mostra l'anteprima"}>
                {chatShown ? 'Chat' : 'Anteprima'}
              </button>
            )}
            {canRun && (
              <button className="title-action" onClick={() => void runActive()} title={activeTarget === 'preview' ? 'Anteprima del file' : 'Esegui file o selezione'} aria-label="Esegui">
                ▶
              </button>
            )}
            <button className="title-action" onClick={toggleSidebar} title="Preferiti ed esplora file" aria-label="Preferiti ed esplora file" aria-expanded={drawerOpen}>
              <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
                <rect x="1.5" y="2.5" width="13" height="11" rx="1" fill="none" stroke="currentColor" />
                <line x1="6" y1="2.5" x2="6" y2="13.5" stroke="currentColor" />
              </svg>
            </button>
          </>
        ) : (
          <span className="font-size" title="Dimensione del testo">{settings.fontSize}px</span>
        )}
      </header>

      <main className="workspace">
        {(compact ? drawerOpen : settings.sidebar) && (
          <Sidebar width={sidebarWidth} onResize={setSidebarWidth} drawer={compact ? { onClose: () => setDrawerOpen(false) } : undefined}>
            <BookmarkList
              list={bookmarks.list}
              canAdd={!!(active?.handle || active?.request)}
              onAdd={() => bookmarkDoc()}
              onOpenUrl={() => setUrlDialog({ mode: 'open' })}
              onOpen={openBookmark}
              onEdit={editBookmark}
              onRemove={bookmarks.remove}
              onMove={bookmarks.move}
            />
            {folders.length ? (
              folders.map((dir) => (
                <FileTree
                  key={folderKey(dir)}
                  root={dir}
                  workspace={hasWorkspace ? { label: WORKSPACE_LABEL } : undefined}
                  version={treeVersion}
                  activePath={activePath(dir)}
                  onOpen={(h) => void openHandle(h)}
                  onBookmark={(handle) => void addBookmark({ id: crypto.randomUUID(), name: handle.name, kind: 'file', handle })}
                  onRename={renameInFolder}
                  onCloseFolder={hasWorkspace ? undefined : () => closeFolder(dir)}
                  onMessage={flash}
                />
              ))
            ) : (
              <NoFolder supported={hasFolderAccess} onOpenFolder={() => void openFolder()} recent={recentFolders} onOpenRecent={(d) => void openFolder(d)} />
            )}
          </Sidebar>
        )}
        {compact ? (
          renderPane(snap.activePaneId)
        ) : (
          <SplitView layout={snap.layout} onResize={(path, sizes) => wb.resize(path, sizes)} onRotate={(path, index) => wb.rotateAt(path, index)} renderPane={renderPane} />
        )}
        <PreviewPanel
          runner={runner}
          docName={runState.preview ? snap.docs.get(runState.preview.docId)?.name : undefined}
          docColor={runState.preview ? snap.docs.get(runState.preview.docId)?.color : undefined}
          onShowDoc={() => runState.preview && showFromPanel(runState.preview.docId)}
          width={previewWidth}
          consoleOpen={consoleOpen}
          onResize={setPreviewWidth}
          onReload={() => runState.preview && runPreview(runState.preview.docId)}
          onToggleConsole={() => setConsoleOpen((o) => !o)}
          overlay={compact ? { hidden: previewHidden, onHide: () => setPreviewHidden(true) } : undefined}
          tabs={rightTabs}
          hidden={chatShown}
        />
        {chatOpen && (
          <ChatPanel
            ai={settings.ai}
            onModel={(model) => setSettings((s) => ({ ...s, ai: { ...s.ai, model } }))}
            label={chatLabel}
            selection={!!chatContext?.selection}
            focusKey={chatFocus}
            getContext={() => tabContext()}
            onInsert={insertCode}
            onCompare={compareCode}
            onOpenSettings={() => setSettingsView('ai')}
            onClose={() => {
              setChatOpen(false)
              wb.activeView?.focus()
            }}
            width={previewWidth}
            onResize={setPreviewWidth}
            overlay={compact ? { hidden: previewHidden, onHide: () => setPreviewHidden(true) } : undefined}
            tabs={rightTabs}
            hidden={!chatShown}
          />
        )}
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
          sourceDoc={(id) => snap.docs.get(id)}
          onShowDoc={showFromPanel}
        />
      )}

      {touch && editorFocused && <KeyBar view={() => wb.activeView} canRun={canRun} onRun={() => void runActive()} />}

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
        fetching={!!active?.request && fetching.has(active.request.url)}
        onRefreshUrl={() => void refreshUrl()}
      />

      {palette && (
        <CommandPalette
          key={palette}
          items={palette === 'commands' ? menuCommands(menus) : palette === 'compare' ? compareItems() : palette === 'history' ? (historyItems?.items ?? []) : tabItems()}
          placeholder={palette === 'commands' ? 'Cerca un comando…' : palette === 'compare' ? `Confronta «${active?.name ?? ''}» con…` : palette === 'history' ? `Versioni di «${historyItems?.docName ?? ''}»: scegli quella da confrontare` : 'Vai a una tab aperta…'}
          onClose={closeOverlay}
        />
      )}
      {diff && (
        <DiffDialog
          other={diff.other}
          mine={diff.mine}
          lang={diff.lang}
          indent={diff.indent}
          settings={editorSettings}
          prefs={{ ...settings.diff, unified: settings.diff.unified ?? compact }}
          onPrefs={setDiffPrefs}
          onClose={closeDiff}
        />
      )}
      {settingsView && (
        <SettingsDialog
          settings={settings}
          view={settingsView}
          onView={setSettingsView}
          onChange={(patch) => setSettings((s) => ({ ...s, ...patch }))}
          onClose={closeOverlay}
        />
      )}
      {help && <HelpDialog view={help} onView={setHelp} onClose={closeOverlay} />}
      {notices && <NoticeDialog notices={notices} onClose={closeNotices} />}
      {urlDialog && (
        <UrlDialog
          mode={urlDialog.mode}
          initial={urlDialog.mode === 'edit' ? urlDialog.bookmark : undefined}
          onSubmit={(result) => submitUrlDialog(urlDialog, result)}
          onClose={closeOverlay}
        />
      )}

      {toast && <div className="toast" role="status">{toast}</div>}
      <UpdateBanner />
      {dragging && <div className="drop-overlay">Rilascia per aprire</div>}
    </div>
  )
}
