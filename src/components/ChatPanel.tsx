import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createClient, usableProviders } from '../ai/providers'
import { deleteChat, listChats, loadChat, saveChat, type ChatEntry, type ChatSummary } from '../ai/chatHistory'
import { buildSystemPrompt, contextLabel, type TabContext } from '../ai/context'
import { chatBlocks } from '../ai/markdown'
import type { AiSettings } from '../store'
import { useSideResize } from './sideResize'

interface Props {
  ai: AiSettings
  onModel: (model: NonNullable<AiSettings['model']>) => void
  /** contesto attuale, ricalcolato a ogni render: solo per l'etichetta */
  label: string | null
  /** c'è una selezione: compaiono le domande pronte */
  selection: boolean
  /** cambia quando si chiede di scrivere una domanda: il cursore va nel campo */
  focusKey: number
  /** la tab attiva al momento dell'invio */
  getContext: () => TabContext | null
  onInsert: (code: string) => void
  onCompare: (code: string) => void
  onOpenSettings: () => void
  onClose: () => void
  width: number
  onResize: (width: number) => void
  /** schermo del telefono: la chat copre l'editor */
  overlay?: { hidden: boolean; onHide: () => void }
  tabs?: ReactNode
  /** dietro l'anteprima: nascosta ma non smontata, così la conversazione resta */
  hidden?: boolean
}

const SEP = '\u0000'
/** domande pronte sulla selezione */
const QUICK: Array<[string, string]> = [
  ['Spiega', 'Spiega cosa fa questa parte.'],
  ['Migliora', 'Migliora questa parte: proponi la versione rivista e spiega in breve cosa hai cambiato.'],
  ['Trova errori', 'Trova errori e problemi in questa parte. Se ce ne sono, proponi la versione corretta.'],
]
/** fuori dal componente: si chiama solo all'arrivo di una risposta, non durante il render */
const now = () => Date.now()

/** Chat a destra: ogni domanda porta con sé la tab attiva (e la selezione) in quel momento. */
export function ChatPanel({ ai, onModel, label, selection, focusKey, getContext, onInsert, onCompare, onOpenSettings, onClose, width, onResize, overlay, tabs, hidden }: Props) {
  const [entries, setEntries] = useState<ChatEntry[]>([])
  /** la conversazione si salva a ogni risposta con questo id */
  const [chatId, setChatId] = useState<string>(() => crypto.randomUUID())
  /** lista delle chat salvate, mostrata al posto della conversazione (null = nascosta) */
  const [past, setPast] = useState<ChatSummary[] | null>(null)
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState<AbortController | null>(null)
  const [error, setError] = useState<string | null>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const resize = useSideResize(width, onResize)

  const usable = usableProviders(ai.providers)
  const options = usable.flatMap((p) => p.models.map((m) => ({ provider: p, model: m })))
  const chosen = options.find((o) => o.provider.id === ai.model?.providerId && o.model === ai.model?.model) ?? options[0]

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight })
  }, [entries, busy])

  useEffect(() => {
    if (focusKey) inputRef.current?.focus()
  }, [focusKey])

  async function send(text = input) {
    const question = text.trim()
    if (!question || busy || !chosen) return
    const ctx = getContext()
    if (!ctx) {
      setError('Nessuna tab aperta')
      return
    }
    const built = buildSystemPrompt(ctx)
    if ('error' in built) {
      setError(built.error)
      return
    }
    const history = [...entries, { role: 'user' as const, content: question, context: contextLabel(ctx), quote: ctx.selection?.text }]
    setEntries(history)
    setInput('')
    setError(null)
    const ac = new AbortController()
    setBusy(ac)
    try {
      const messages = history.map(({ role, content }) => ({ role, content }))
      const reply = await createClient(chosen.provider).chat(chosen.model, built.system, messages, ac.signal)
      const next = [...history, { role: 'assistant' as const, content: reply, provider: chosen.provider.name, model: chosen.model, time: now() }]
      setEntries(next)
      void saveChat({ id: chatId, entries: next })
    } catch (err) {
      // la domanda torna nel campo, così si può riprovare o cambiare modello
      setEntries((e) => e.slice(0, -1))
      if (text === input) setInput(question)
      if (!ac.signal.aborted) setError((err as Error).message)
    } finally {
      setBusy(null)
    }
  }

  function newChat() {
    setEntries([])
    setChatId(crypto.randomUUID())
    setError(null)
    setPast(null)
  }

  async function openChat(id: string) {
    const chat = await loadChat(id)
    if (!chat) {
      setError('Chat non più disponibile')
      return
    }
    setEntries(chat.entries)
    setChatId(chat.id)
    setError(null)
    setPast(null)
  }

  async function removeChat(id: string) {
    await deleteChat(id)
    if (id === chatId) newChat()
    setPast(await listChats())
  }

  return (
    <>
      {!overlay && !hidden && <div className="gutter preview-gutter" {...resize} />}
      <aside className={`preview chat${overlay ? ' overlay' : ''}`} style={overlay ? undefined : { width }} hidden={hidden || overlay?.hidden}>
        <header className="panel-bar">
          {overlay && <button onClick={overlay.onHide} title="Torna all'editor (la chat resta aperta)">‹ Editor</button>}
          {tabs ?? <span className="panel-title">Chat</span>}
          <div className="spacer" />
          <button
            className={past ? 'current' : undefined}
            onClick={async () => setPast(past ? null : await listChats())}
            disabled={!!busy}
            title="Le chat salvate in questo browser"
          >
            Chat precedenti
          </button>
          <button onClick={newChat} disabled={(!entries.length && !past) || !!busy} title="Ricomincia da capo (la chat attuale resta tra le precedenti)">
            Nuova chat
          </button>
          <button className="panel-close" onClick={onClose} title="Chiudi la chat">×</button>
        </header>

        {past ? (
          <div className="chat-list">
            {!past.length && <p className="chat-hint">Nessuna chat salvata. Le chat si salvano da sole a ogni risposta.</p>}
            {past.map((c) => (
              <div key={c.id} className={`chat-past${c.id === chatId ? ' current' : ''}`}>
                <button className="chat-past-open" onClick={() => void openChat(c.id)} title="Riprendi questa chat">
                  <span className="chat-past-title">{c.title}</span>
                  <span className="chat-context">
                    {new Date(c.updated).toLocaleString('it-IT', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    {c.files.length > 0 && ` · ${c.files.join(', ')}`}
                  </span>
                  {c.models.length > 0 && <span className="chat-context">{c.models.join(', ')}</span>}
                </button>
                <button className="chat-past-delete" onClick={() => void removeChat(c.id)} aria-label={`Elimina la chat "${c.title}"`} title="Elimina">
                  ×
                </button>
              </div>
            ))}
          </div>
        ) : options.length === 0 ? (
          <div className="chat-empty">
            <p>Per usare la chat serve la chiave di almeno un provider, con un modello scelto.</p>
            <p>OpenRouter, Groq e Google Gemini hanno un piano gratuito.</p>
            <button className="primary" onClick={onOpenSettings}>Impostazioni → AI</button>
          </div>
        ) : (
          <>
            <div className="chat-list" ref={listRef}>
              {!entries.length && <p className="chat-hint">Chiedi qualcosa sulla tab attiva. Se selezioni una parte del testo, la domanda riguarda quella.</p>}
              {entries.map((e, i) =>
                e.role === 'user' ? (
                  <div key={i} className="chat-msg user">
                    {e.context && <div className="chat-context">{e.context}</div>}
                    {e.quote && <Quote text={e.quote} />}
                    {e.content}
                  </div>
                ) : (
                  <Answer key={i} entry={e} onInsert={onInsert} onCompare={onCompare} />
                ),
              )}
              {busy && <div className="chat-msg busy">Sto scrivendo…</div>}
            </div>
            {error && <div className="chat-error">{error}</div>}
            <div className="chat-input">
              <div className="chat-bar">
                <span className="chat-context" title="La domanda manda il contenuto di questa tab">
                  {label ? `Contesto: ${label}` : 'Nessuna tab'}
                </span>
                <select
                  aria-label="Modello"
                  value={chosen ? `${chosen.provider.id}${SEP}${chosen.model}` : ''}
                  onChange={(e) => {
                    const [providerId, model] = e.target.value.split(SEP)
                    onModel({ providerId, model })
                  }}
                >
                  {usable.map((p) => (
                    <optgroup key={p.id} label={p.name}>
                      {p.models.map((m) => (
                        <option key={m} value={`${p.id}${SEP}${m}`}>{m}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>
              {selection && !busy && (
                <div className="chat-quick">
                  {QUICK.map(([label, question]) => (
                    <button key={label} onClick={() => void send(question)} title={question}>{label}</button>
                  ))}
                </div>
              )}
              <textarea
                ref={inputRef}
                value={input}
                rows={3}
                placeholder="Invio per mandare, Shift+Invio per andare a capo"
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault()
                    void send()
                  }
                }}
              />
              {busy ? (
                <button onClick={() => busy.abort()}>■ Ferma</button>
              ) : (
                <button className="primary" onClick={() => void send()} disabled={!input.trim()}>Invia</button>
              )}
            </div>
          </>
        )}
      </aside>
    </>
  )
}

const QUOTE_LINES = 3

/** Il testo selezionato al momento della domanda: le prime righe, il resto a richiesta. */
function Quote({ text }: { text: string }) {
  const [open, setOpen] = useState(false)
  const lines = text.split('\n')
  const long = lines.length > QUOTE_LINES
  return (
    <div className="chat-quote">
      <pre>{open || !long ? text : lines.slice(0, QUOTE_LINES).join('\n') + '\n…'}</pre>
      {long && <button onClick={() => setOpen(!open)}>{open ? 'Mostra meno' : `Mostra tutto (${lines.length} righe)`}</button>}
    </div>
  )
}

/** Risposta del modello: Markdown reso innocuo, con i pulsanti sui blocchi di codice. */
function Answer({ entry, onInsert, onCompare }: { entry: ChatEntry; onInsert: (code: string) => void; onCompare: (code: string) => void }) {
  const blocks = useMemo(() => chatBlocks(entry.content), [entry.content])
  return (
    <div className="chat-msg assistant">
      {blocks.map((b, i) =>
        b.kind === 'html' ? (
          <div key={i} className="chat-md" dangerouslySetInnerHTML={{ __html: b.html }} />
        ) : (
          <div key={i} className="chat-code">
            <div className="chat-code-bar">
              <span>{b.lang}</span>
              <div className="spacer" />
              <button onClick={() => void navigator.clipboard.writeText(b.code).catch(() => {})} title="Copia negli appunti">Copia</button>
              <button onClick={() => onInsert(b.code)} title="Inserisci al cursore, o al posto della selezione">Inserisci</button>
              <button onClick={() => onCompare(b.code)} title="Confronta con la tab e scegli quali blocchi prendere">Confronta</button>
            </div>
            <pre>
              <code>{b.code}</code>
            </pre>
          </div>
        ),
      )}
      {entry.model && (
        <div className="chat-meta">
          {entry.provider} · {entry.model}
          {entry.time && ` · ${new Date(entry.time).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}`}
        </div>
      )}
    </div>
  )
}

