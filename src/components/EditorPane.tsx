import { useCallback, useEffect, useRef, useState, type CSSProperties, type DragEvent } from 'react'
import { createPortal } from 'react-dom'
import { tabColorVar } from '../workbench/tabColors'
import type { Doc, Pane, Workbench } from '../workbench/Workbench'
import { ContextMenu, type MenuItem } from './Menu'
import { tabColorItems } from './tabColorMenu'
import { COARSE_QUERY, longPress, useMediaQuery } from './touch'

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
}

interface DraggedTab {
  docId: string
  fromPaneId: string
}

const isTabDrag = (e: DragEvent) => e.dataTransfer.types.includes(TAB_MIME)
const copyDrag = (e: DragEvent) => e.ctrlKey || e.metaKey

/** Un pannello: barra delle tab + EditorView di CodeMirror (gestita dal Workbench). */
function tabTitle(d: Doc) {
  if (d.handle) return d.name
  if (d.request) return `${d.name}\nGET ${d.request.url}`
  return `${d.name} (non salvato su disco)`
}

export function EditorPane({ wb, pane, docs, active, multiPane, tabMenuExtra, compact, marks, tabHost }: Props) {
  const hostRef = useRef<HTMLDivElement>(null)
  const tabsRef = useRef<HTMLElement>(null)
  const [dropTarget, setDropTarget] = useState(false)
  const [tabMenu, setTabMenu] = useState<{ x: number; y: number; docId: string } | null>(null)
  const closeTabMenu = useCallback(() => setTabMenu(null), [])
  const menuDoc = tabMenu ? docs.get(tabMenu.docId) : undefined
  // col dito il trascinamento delle tab si confonderebbe con lo scorrimento della barra
  const touch = useMediaQuery(COARSE_QUERY)

  useEffect(() => wb.attachView(pane.id, hostRef.current!), [wb, pane.id])

  // con molte tab la barra scorre: la tab mostrata resta in vista
  useEffect(() => {
    tabsRef.current?.querySelector('.tab.current')?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [pane.activeDocId])

  const onDrop = (e: DragEvent) => {
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
        return (
          <div
            key={id}
            data-doc-id={id}
            className={`tab${id === pane.activeDocId ? ' current' : ''}${d.color ? ' colored' : ''}`}
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
            <span className="tab-name">{d.name}</span>
            {marks.preview === id && (
              <span className="tab-mark" title="Mostrato nell'anteprima" aria-label="in anteprima">
                <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
                  <path d="M1 8s2.5-5 7-5 7 5 7 5-2.5 5-7 5-7-5-7-5z" fill="none" stroke="currentColor" />
                  <circle cx="8" cy="8" r="2" fill="currentColor" />
                </svg>
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
      onDragLeave={(e) => !e.currentTarget.contains(e.relatedTarget as Node) && setDropTarget(false)}
      onDropCapture={onDrop}
    >
      {tabHost ? createPortal(tabs, tabHost) : tabs}
      <div className="editor" ref={hostRef} />
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
