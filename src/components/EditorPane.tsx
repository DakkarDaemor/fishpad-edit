import { useCallback, useEffect, useRef, useState, type CSSProperties, type DragEvent } from 'react'
import { createPortal } from 'react-dom'
import type { DockSide } from '../workbench/layout'
import { tabColorVar } from '../workbench/tabColors'
import type { Doc, Pane, Workbench } from '../workbench/Workbench'
import { ContextMenu, type MenuItem } from './Menu'
import { tabColorItems } from './tabColorMenu'
import { COARSE_QUERY, longPress, useMediaQuery } from './touch'
import { MarkdownPreview } from './MarkdownPreview'
import { MARKDOWN_ACTIONS, runMarkdownAction } from '../editor/markdownEdit'
import type { PreviewAssets } from '../runner/folderAssets'

const TAB_MIME = 'application/x-fishpad-tab'

interface Props {
  wb: Workbench
  pane: Pane
  docs: ReadonlyMap<string, Doc>
  active: boolean
  multiPane: boolean
  /** voci aggiunte dall'app al menu col tasto destro della tab (preferiti, ricarica…) */
  tabMenuExtra: (doc: Doc) => MenuItem[]
  /** schermo del telefono: un pannello alla volta, senza dividere; con più pannelli, passa al successivo */
  compact?: { onNextPane?: () => void }
  /** documenti mostrati nell'anteprima e autori dell'output in console: le loro tab hanno un segno */
  marks: { preview?: string; console?: string }
  /** se c'è, la barra delle tab sta lì (nella barra del titolo) invece che sopra l'editor */
  tabHost?: HTMLElement | null
  /** file locali per le anteprime Markdown nelle tab */
  mdAssets?: (docId: string) => Promise<PreviewAssets | null>
  /** link a un altro file Markdown, relativo al documento */
  mdOpenLink?: (docId: string, href: string) => void
}

interface DraggedTab {
  docId: string
  fromPaneId: string
}

const isTabDrag = (e: DragEvent) => e.dataTransfer.types.includes(TAB_MIME)

const PANE_MIME = 'application/x-fishpad-pane'
type PaneDrop = DockSide | 'center'
/** pannello che si sta trascinando: durante dragover i dati del trascinamento non si possono leggere */
let draggedPane: string | null = null

/** Zona del pannello sotto il puntatore: vicino a un bordo (un quarto) quel lato, altrimenti il centro. */
function dropZone(e: DragEvent): PaneDrop {
  const r = e.currentTarget.getBoundingClientRect()
  const x = (e.clientX - r.left) / r.width
  const y = (e.clientY - r.top) / r.height
  const sides: [PaneDrop, number][] = [['left', x], ['right', 1 - x], ['top', y], ['bottom', 1 - y]]
  const [side, dist] = sides.reduce((a, b) => (b[1] < a[1] ? b : a))
  return dist < 0.25 ? side : 'center'
}
const copyDrag = (e: DragEvent) => e.ctrlKey || e.metaKey

/** Un pannello: barra delle tab + EditorView di CodeMirror (gestita dal Workbench). */
function tabTitle(d: Doc) {
  if (d.handle) return d.name
  if (d.request) return `${d.name}\nGET ${d.request.url}`
  return `${d.name} (non salvato su disco)`
}

const EYE = (
  <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
    <path d="M1 8s2.5-5 7-5 7 5 7 5-2.5 5-7 5-7-5-7-5z" fill="none" stroke="currentColor" />
    <circle cx="8" cy="8" r="2" fill="currentColor" />
  </svg>
)

export function EditorPane({ wb, pane, docs, active, multiPane, tabMenuExtra, compact, marks, tabHost, mdAssets, mdOpenLink }: Props) {
  const hostRef = useRef<HTMLDivElement>(null)
  const tabsRef = useRef<HTMLElement>(null)
  const [dropTarget, setDropTarget] = useState(false)
  const [paneDrop, setPaneDrop] = useState<PaneDrop | null>(null)
  const [tabMenu, setTabMenu] = useState<{ x: number; y: number; docId: string } | null>(null)
  const closeTabMenu = useCallback(() => setTabMenu(null), [])
  const menuDoc = tabMenu ? docs.get(tabMenu.docId) : undefined
  // col dito il trascinamento delle tab si confonderebbe con lo scorrimento della barra
  const touch = useMediaQuery(COARSE_QUERY)

  useEffect(() => wb.attachView(pane.id, hostRef.current!), [wb, pane.id])

  const activeDoc = pane.activeDocId ? docs.get(pane.activeDocId) : undefined
  const markdown = activeDoc?.lang === 'Markdown'
  const previewing = markdown && !!pane.previews?.includes(activeDoc.id)
  // tornando al testo il cursore riprende dov'era: solo ora l'editor è di nuovo visibile e può avere il focus
  const wasPreviewing = useRef(previewing)
  useEffect(() => {
    if (wasPreviewing.current && !previewing && wb.getSnapshot().activePaneId === pane.id) wb.viewOf(pane.id)?.focus()
    wasPreviewing.current = previewing
  }, [wb, pane.id, previewing])

  // con molte tab la barra scorre: la tab mostrata resta in vista
  useEffect(() => {
    tabsRef.current?.querySelector('.tab.current')?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [pane.activeDocId])

  const onDrop = (e: DragEvent) => {
    if (draggedPane) {
      e.preventDefault()
      e.stopPropagation()
      setPaneDrop(null)
      wb.movePane(draggedPane, pane.id, dropZone(e))
      return
    }
    if (!isTabDrag(e)) return
    // rilasciata su una tab: va prima di quella; altrove (barra o editor): in fondo
    const beforeDocId = (e.target as Element).closest<HTMLElement>('.tab')?.dataset.docId ?? null
    e.preventDefault()
    e.stopPropagation()
    setDropTarget(false)
    const { docId, fromPaneId } = JSON.parse(e.dataTransfer.getData(TAB_MIME)) as DraggedTab
    // con Ctrl la tab resta anche nel pannello di partenza: due viste dello stesso file
    if (copyDrag(e) && fromPaneId !== pane.id) void wb.copyTab(docId, fromPaneId, pane.id, beforeDocId)
    else void wb.moveTab(docId, fromPaneId, pane.id, beforeDocId)
  }
  const onDragOver = (e: DragEvent) => {
    if (draggedPane) {
      if (draggedPane === pane.id) return
      e.preventDefault()
      e.stopPropagation()
      e.dataTransfer.dropEffect = 'move'
      setPaneDrop(dropZone(e))
      return
    }
    if (!isTabDrag(e)) return
    e.preventDefault()
    e.stopPropagation() // altrimenti CodeMirror mostra il cursore di inserimento testo
    e.dataTransfer.dropEffect = copyDrag(e) ? 'copy' : 'move'
    setDropTarget(true)
  }

  const tabs = (
    <nav className="tabs" ref={tabsRef} onDoubleClick={(e) => e.target === e.currentTarget && wb.newUntitled(pane.id)}>
      {pane.docIds.map((id) => {
        const d = docs.get(id)
        if (!d) return null
        const isPreview = d.lang === 'Markdown' && !!pane.previews?.includes(id)
        return (
          <div
            key={id}
            data-doc-id={id}
            className={`tab${id === pane.activeDocId ? ' current' : ''}${d.color ? ' colored' : ''}${isPreview ? ' preview-tab' : ''}`}
            style={d.color ? ({ '--tab-color': tabColorVar(d.color) } as CSSProperties) : undefined}
            title={touch ? tabTitle(d) : `${tabTitle(d)}\nTrascina in un altro pannello per spostarla, con Ctrl per aprirla anche lì`}
            draggable={!touch}
            onDragStart={(e) => {
              e.dataTransfer.setData(TAB_MIME, JSON.stringify({ docId: id, fromPaneId: pane.id } satisfies DraggedTab))
              e.dataTransfer.effectAllowed = 'copyMove'
            }}
            onClick={() => wb.activate(pane.id, id)}
            onAuxClick={(e) => e.button === 1 && wb.closeTab(pane.id, id)}
            onContextMenu={(e) => {
              e.preventDefault()
              setTabMenu({ x: e.clientX, y: e.clientY, docId: id })
            }}
            {...longPress((x, y) => setTabMenu({ x, y, docId: id }))}
          >
            {isPreview && (
              <span className="tab-eye" title="Anteprima: Ctrl+Enter o il menu della tab per tornare al testo" aria-label="anteprima di">
                {EYE}
              </span>
            )}
            <span className="tab-name">{d.name}</span>
            {!isPreview && marks.preview === id && (
              <span className="tab-mark" title="Mostrato nell'anteprima" aria-label="in anteprima">
                {EYE}
              </span>
            )}
            {marks.console === id && marks.preview !== id && (
              <span className="tab-mark console-mark" title="L'output in console viene da questo file" aria-label="in console">
                &gt;_
              </span>
            )}
            <button
              className={`tab-close${d.dirty ? ' dirty' : ''}`}
              aria-label={`Chiudi ${d.name}`}
              onClick={(e) => {
                e.stopPropagation()
                wb.closeTab(pane.id, id)
              }}
            >
              <span className="dot">●</span>
              <span className="x">×</span>
            </button>
          </div>
        )
      })}
      <button className="tab-new" onClick={() => wb.newUntitled(pane.id)} aria-label="Nuova tab" title="Nuova tab">+</button>
      <div className="spacer" />
      <div className="pane-actions">
        {compact ? (
          compact.onNextPane && (
            <button onClick={compact.onNextPane} title="Passa al pannello successivo" aria-label="Pannello successivo">⇄</button>
          )
        ) : (
          <>
            {multiPane && !touch && (
              <span
                className="pane-grip"
                draggable
                role="button"
                aria-label="Sposta pannello"
                title="Trascina su un altro pannello: al centro si scambiano, su un bordo il pannello si sposta lì"
                onDragStart={(e) => {
                  draggedPane = pane.id
                  e.dataTransfer.setData(PANE_MIME, pane.id)
                  e.dataTransfer.effectAllowed = 'move'
                }}
                onDragEnd={() => (draggedPane = null)}
              >
                <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="currentColor">
                  <circle cx="6" cy="4" r="1.2" /><circle cx="10" cy="4" r="1.2" />
                  <circle cx="6" cy="8" r="1.2" /><circle cx="10" cy="8" r="1.2" />
                  <circle cx="6" cy="12" r="1.2" /><circle cx="10" cy="12" r="1.2" />
                </svg>
              </span>
            )}
            <button
              onClick={() => void wb.split('row', pane.id)}
              title="Dividi a destra (Ctrl+\): apre lo stesso file in un nuovo pannello accanto, con scroll e cursore propri"
              aria-label="Dividi a destra"
            >
              <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
                <rect x="1.5" y="2.5" width="13" height="11" rx="1" fill="none" stroke="currentColor" />
                <line x1="8" y1="2.5" x2="8" y2="13.5" stroke="currentColor" />
              </svg>
            </button>
            <button
              onClick={() => void wb.split('column', pane.id)}
              title="Dividi in basso: apre lo stesso file in un nuovo pannello sotto, con scroll e cursore propri"
              aria-label="Dividi in basso"
            >
              <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
                <rect x="1.5" y="2.5" width="13" height="11" rx="1" fill="none" stroke="currentColor" />
                <line x1="1.5" y1="8" x2="14.5" y2="8" stroke="currentColor" />
              </svg>
            </button>
            {multiPane && (
              <button
                onClick={() => wb.rotate(pane.id)}
                title="Ruota rispetto al pannello precedente: da affiancati a impilati e viceversa"
                aria-label="Ruota pannello"
              >
                <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor">
                  <path d="M13 6.5A5.5 5.5 0 0 0 3.2 4.5" />
                  <path d="M3 9.5a5.5 5.5 0 0 0 9.8 2" />
                  <path d="M3 1.8v3h3" />
                  <path d="M13 14.2v-3h-3" />
                </svg>
              </button>
            )}
          </>
        )}
        {multiPane && (
          <button onClick={() => wb.closePane(pane.id)} title="Chiudi pannello" aria-label="Chiudi pannello">
            ×
          </button>
        )}
      </div>
    </nav>
  )

  return (
    <section
      className={`pane${active ? ' active' : ''}${dropTarget ? ' drop-target' : ''}`}
      onMouseDownCapture={() => wb.focusPane(pane.id)}
      onDragOverCapture={onDragOver}
      onDragLeave={(e) => {
        if (e.currentTarget.contains(e.relatedTarget as Node)) return
        setDropTarget(false)
        setPaneDrop(null)
      }}
      onDropCapture={onDrop}
    >
      {tabHost ? createPortal(tabs, tabHost) : tabs}
      {markdown && !previewing && (
        <div className="md-bar" role="toolbar" aria-label="Formattazione Markdown">
          {MARKDOWN_ACTIONS.map((a) => (
            <button
              key={a.id}
              className={`md-${a.id}`}
              title={a.shortcut ? `${a.label} (${a.shortcut})` : a.label}
              aria-label={a.label}
              // il clic non toglie il focus all'editor: la selezione resta
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                const view = wb.viewOf(pane.id)
                if (view) runMarkdownAction(view, a)
              }}
            >
              {a.icon}
            </button>
          ))}
          <div className="spacer" />
          <button aria-label="Anteprima" onMouseDown={(e) => e.preventDefault()} onClick={() => wb.togglePreview(pane.id, activeDoc!.id)} title="Mostra l'anteprima in questa tab (Ctrl+Enter); per averla accanto al testo, dividi il pannello">
            {EYE}
            {/* sul telefono la scritta farebbe uscire la barra dallo schermo */}
            {!compact && ' Anteprima'}
          </button>
        </div>
      )}
      {previewing && (
        <div className="md-bar">
          <span className="md-bar-label">{EYE} Anteprima</span>
          <div className="spacer" />
          <button onClick={() => wb.setPreview(pane.id, activeDoc!.id, false)} title="Mostra il testo in questa tab (Ctrl+Enter)">✎ Modifica</button>
        </div>
      )}
      <div className="editor" ref={hostRef} hidden={previewing} />
      {previewing && <MarkdownPreview wb={wb} paneId={pane.id} docId={activeDoc!.id} assets={mdAssets} onOpenLink={mdOpenLink} />}
      {paneDrop && <div className={`pane-drop pane-drop-${paneDrop}`} aria-hidden="true" />}
      {tabMenu && menuDoc && (
        <ContextMenu
          x={tabMenu.x}
          y={tabMenu.y}
          onClose={closeTabMenu}
          items={[
            ...(compact
              ? []
              : [
                  { label: 'Apri a destra', action: () => void wb.split('row', pane.id, menuDoc.id) },
                  { label: 'Apri in basso', action: () => void wb.split('column', pane.id, menuDoc.id) },
                  'separator' as const,
                ]),
            ...(menuDoc.lang === 'Markdown'
              ? [
                  pane.previews?.includes(menuDoc.id)
                    ? { label: 'Mostra il testo', action: () => wb.setPreview(pane.id, menuDoc.id, false) }
                    : { label: 'Mostra come anteprima', action: () => wb.setPreview(pane.id, menuDoc.id, true) },
                  'separator' as const,
                ]
              : []),
            ...tabMenuExtra(menuDoc),
            { heading: 'Colore' },
            ...tabColorItems(menuDoc.color, (c) => wb.setColor(menuDoc.id, c)),
            'separator',
            { label: 'Chiudi tab', action: () => wb.closeTab(pane.id, menuDoc.id) },
          ]}
        />
      )}
    </section>
  )
}
