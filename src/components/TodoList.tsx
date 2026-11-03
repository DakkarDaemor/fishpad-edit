import { useState, type DragEvent } from 'react'
import type { Todo } from '../store'
import { TAB_MIME, TODO_NOTE_MIME, type DraggedTab } from './EditorPane'

interface Props {
  list: Todo[]
  onAdd: (text: string) => void
  onToggle: (id: string) => void
  onRemove: (id: string) => void
  onRemoveDone: () => void
  /** apre (o mostra) la tab con la nota */
  onOpenNote: (todo: Todo) => void
  /** una tab trascinata sulla sezione: diventa una cosa da fare */
  onDropTab: (docId: string) => void
}

/** Sezione Da fare della barra laterale: voci da spuntare, ognuna con una nota facoltativa da scrivere in una tab. */
export function TodoList({ list, onAdd, onToggle, onRemove, onRemoveDone, onOpenNote, onDropTab }: Props) {
  const [collapsed, setCollapsed] = useState(false)
  const [text, setText] = useState('')
  const [dropping, setDropping] = useState(false)

  const add = () => {
    const t = text.trim()
    if (!t) return
    onAdd(t)
    setText('')
  }
  const left = list.filter((t) => !t.done).length
  // una tab che è già la nota di una cosa da fare non si accetta
  const isTabDrag = (e: DragEvent) => e.dataTransfer.types.includes(TAB_MIME) && !e.dataTransfer.types.includes(TODO_NOTE_MIME)

  return (
    <section
      className={`side-section todos-section${collapsed ? ' collapsed' : ''}${dropping ? ' dropping' : ''}`}
      onDragOver={(e) => {
        if (!isTabDrag(e)) return
        e.preventDefault()
        e.dataTransfer.dropEffect = 'copy'
        setDropping(true)
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDropping(false)
      }}
      onDrop={(e) => {
        setDropping(false)
        if (!isTabDrag(e)) return
        e.preventDefault()
        onDropTab((JSON.parse(e.dataTransfer.getData(TAB_MIME)) as DraggedTab).docId)
      }}
    >
      <header className="side-header">
        <button className="tree-toggle" onClick={() => setCollapsed((c) => !c)} aria-expanded={!collapsed} title={collapsed ? 'Mostra le cose da fare' : 'Nascondi le cose da fare'}>
          <span className="tree-twisty">{collapsed ? '▸' : '▾'}</span>
          <span className="panel-title">Da fare{list.length > 0 && ` (${left})`}</span>
        </button>
        <div className="spacer" />
        {list.some((t) => t.done) && (
          <button onClick={onRemoveDone} title="Togli le voci fatte" aria-label="Togli le voci fatte">
            ✓✕
          </button>
        )}
      </header>
      {!collapsed && (
        <input
          className="side-search"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') add()
            if (e.key === 'Escape') setText('')
          }}
          placeholder="Aggiungi e premi Invio, o trascina qui una tab"
          aria-label="Nuova cosa da fare"
        />
      )}
      <div className="side-list" hidden={collapsed}>
        {list.map((t) => (
          <label key={t.id} className={`tree-row todo${t.done ? ' done' : ''}`}>
            <input type="checkbox" checked={t.done} onChange={() => onToggle(t.id)} />
            <span className="tree-name">{t.text}</span>
            {t.link ? (
              <button className="todo-note has-note" onClick={() => onOpenNote(t)} title={t.link.kind === 'url' ? `Apri ${t.link.request.url}` : `Apri ${t.link.handle.name}`} aria-label={`Apri il collegamento di «${t.text}»`}>
                🔗
              </button>
            ) : (
              <button
                className={`todo-note${t.note ? ' has-note' : ''}`}
                onClick={() => onOpenNote(t)}
                title={t.note ? 'Apri la nota' : 'Scrivi una nota'}
                aria-label={`${t.note ? 'Apri la nota di' : 'Scrivi una nota per'} «${t.text}»`}
              >
                📝
              </button>
            )}
            <button className="todo-remove" onClick={() => onRemove(t.id)} title="Togli" aria-label={`Togli «${t.text}»`}>
              ✕
            </button>
          </label>
        ))}
      </div>
    </section>
  )
}
