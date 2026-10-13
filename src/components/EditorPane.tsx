import { useEffect, useRef, useState, type DragEvent } from 'react'
import type { Doc, Pane, Workbench } from '../workbench/Workbench'

const TAB_MIME = 'application/x-fishpad-tab'

interface Props {
  wb: Workbench
  pane: Pane
  docs: ReadonlyMap<string, Doc>
  active: boolean
  multiPane: boolean
}

interface DraggedTab {
  docId: string
  fromPaneId: string
}

const isTabDrag = (e: DragEvent) => e.dataTransfer.types.includes(TAB_MIME)

/** Un pannello: barra delle tab + EditorView di CodeMirror (gestita dal Workbench). */
export function EditorPane({ wb, pane, docs, active, multiPane }: Props) {
  const hostRef = useRef<HTMLDivElement>(null)
  const [dropTarget, setDropTarget] = useState(false)

  useEffect(() => wb.attachView(pane.id, hostRef.current!), [wb, pane.id])

  const onDrop = (e: DragEvent) => {
    if (!isTabDrag(e)) return
    // rilasciata su una tab: va prima di quella; altrove (barra o editor): in fondo
    const beforeDocId = (e.target as Element).closest<HTMLElement>('.tab')?.dataset.docId ?? null
    e.preventDefault()
    e.stopPropagation()
    setDropTarget(false)
    const { docId, fromPaneId } = JSON.parse(e.dataTransfer.getData(TAB_MIME)) as DraggedTab
    void wb.moveTab(docId, fromPaneId, pane.id, beforeDocId)
  }
  const onDragOver = (e: DragEvent) => {
    if (!isTabDrag(e)) return
    e.preventDefault()
    e.stopPropagation() // altrimenti CodeMirror mostra il cursore di inserimento testo
    e.dataTransfer.dropEffect = 'move'
    setDropTarget(true)
  }

  return (
    <section
      className={`pane${active ? ' active' : ''}${dropTarget ? ' drop-target' : ''}`}
      onMouseDownCapture={() => wb.focusPane(pane.id)}
      onDragOverCapture={onDragOver}
      onDragLeave={(e) => !e.currentTarget.contains(e.relatedTarget as Node) && setDropTarget(false)}
      onDropCapture={onDrop}
    >
      <nav className="tabs" onDoubleClick={(e) => e.target === e.currentTarget && wb.newUntitled(pane.id)}>
        {pane.docIds.map((id) => {
          const d = docs.get(id)
          if (!d) return null
          return (
            <div
              key={id}
              data-doc-id={id}
              className={`tab${id === pane.activeDocId ? ' current' : ''}`}
              title={d.handle ? d.name : `${d.name} (non salvato su disco)`}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData(TAB_MIME, JSON.stringify({ docId: id, fromPaneId: pane.id } satisfies DraggedTab))
                e.dataTransfer.effectAllowed = 'move'
              }}
              onClick={() => wb.activate(pane.id, id)}
              onAuxClick={(e) => e.button === 1 && wb.closeTab(pane.id, id)}
            >
              <span className="tab-name">{d.name}</span>
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
          <button onClick={() => void wb.split('row')} title="Dividi a destra (Ctrl+\)" aria-label="Dividi a destra">
            <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
              <rect x="1.5" y="2.5" width="13" height="11" rx="1" fill="none" stroke="currentColor" />
              <line x1="8" y1="2.5" x2="8" y2="13.5" stroke="currentColor" />
            </svg>
          </button>
          <button onClick={() => void wb.split('column')} title="Dividi in basso" aria-label="Dividi in basso">
            <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
              <rect x="1.5" y="2.5" width="13" height="11" rx="1" fill="none" stroke="currentColor" />
              <line x1="1.5" y1="8" x2="14.5" y2="8" stroke="currentColor" />
            </svg>
          </button>
          {multiPane && (
            <button onClick={() => wb.closePane(pane.id)} title="Chiudi pannello" aria-label="Chiudi pannello">
              ×
            </button>
          )}
        </div>
      </nav>
      <div className="editor" ref={hostRef} />
    </section>
  )
}
