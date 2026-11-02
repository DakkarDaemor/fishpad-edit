import { useEffect, useRef, useState } from 'react'
import { loadTodos, saveTodos, type Todo } from '../store'

/** Sezione Da fare della barra laterale: voci da spuntare, salvate in IndexedDB. */
export function TodoList() {
  const [list, setList] = useState<Todo[]>([])
  const loaded = useRef(false)
  const [collapsed, setCollapsed] = useState(false)
  const [text, setText] = useState('')

  useEffect(() => {
    void loadTodos().then((saved) => {
      loaded.current = true
      setList(saved)
    })
  }, [])

  useEffect(() => {
    if (loaded.current) void saveTodos(list)
  }, [list])

  const add = () => {
    const t = text.trim()
    if (!t) return
    setList((l) => [...l, { id: crypto.randomUUID(), text: t, done: false }])
    setText('')
  }
  const left = list.filter((t) => !t.done).length

  return (
    <section className={`side-section todos-section${collapsed ? ' collapsed' : ''}`}>
      <header className="side-header">
        <button className="tree-toggle" onClick={() => setCollapsed((c) => !c)} aria-expanded={!collapsed} title={collapsed ? 'Mostra le cose da fare' : 'Nascondi le cose da fare'}>
          <span className="tree-twisty">{collapsed ? '▸' : '▾'}</span>
          <span className="panel-title">Da fare{list.length > 0 && ` (${left})`}</span>
        </button>
        <div className="spacer" />
        {list.some((t) => t.done) && (
          <button onClick={() => setList((l) => l.filter((t) => !t.done))} title="Togli le voci fatte" aria-label="Togli le voci fatte">
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
          placeholder="Aggiungi e premi Invio"
          aria-label="Nuova cosa da fare"
        />
      )}
      <div className="side-list" hidden={collapsed}>
        {list.map((t) => (
          <label key={t.id} className={`tree-row todo${t.done ? ' done' : ''}`}>
            <input type="checkbox" checked={t.done} onChange={() => setList((l) => l.map((x) => (x.id === t.id ? { ...x, done: !x.done } : x)))} />
            <span className="tree-name">{t.text}</span>
            <button className="todo-remove" onClick={() => setList((l) => l.filter((x) => x.id !== t.id))} title="Togli" aria-label={`Togli «${t.text}»`}>
              ✕
            </button>
          </label>
        ))}
      </div>
    </section>
  )
}
