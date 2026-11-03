import { useEffect, useMemo, useRef, useState } from 'react'
import { loadTodos, saveTodos, type Bookmark, type Todo } from './store'

/** Lista delle cose da fare, salvata in IndexedDB a ogni modifica. */
export function useTodos() {
  const [list, setList] = useState<Todo[]>([])
  const [loaded, setLoaded] = useState(false)
  const saving = useRef(false)

  useEffect(() => {
    void loadTodos().then((saved) => {
      saving.current = true
      setList(saved)
      setLoaded(true)
    })
  }, [])

  useEffect(() => {
    if (saving.current) void saveTodos(list)
  }, [list])

  // non cambiano tra un render e l'altro: si possono usare negli effetti
  const actions = useMemo(() => {
    const patch = (id: string, p: Partial<Todo>) => setList((l) => l.map((t) => (t.id === id ? { ...t, ...p } : t)))
    return {
      add: (text: string, note?: string, link?: Bookmark): Todo => {
        const todo: Todo = { id: crypto.randomUUID(), text, done: false, ...(note && { note }), ...(link && { link }) }
        setList((l) => [...l, todo])
        return todo
      },
      toggle: (id: string) => setList((l) => l.map((t) => (t.id === id ? { ...t, done: !t.done } : t))),
      setNote: (id: string, note: string) => patch(id, { note }),
      remove: (id: string) => setList((l) => l.filter((t) => t.id !== id)),
      removeDone: () => setList((l) => l.filter((t) => !t.done)),
    }
  }, [])

  /** `loaded`: finché è false la lista è vuota perché non ancora letta, non perché lo sia davvero */
  return { list, loaded, ...actions }
}

/** Nome della tab con la nota della cosa da fare. */
const NOTE_PREFIX = '📝 '
export const todoTabName = (text: string) => `${NOTE_PREFIX}${text}`
/** Nome della tab staccata dalla sua cosa da fare: senza 📝. */
export const plainTabName = (name: string) => (name.startsWith(NOTE_PREFIX) ? name.slice(NOTE_PREFIX.length) : name)
