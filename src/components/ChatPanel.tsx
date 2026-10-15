import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createClient, usableProviders, type ChatMessage } from '../ai/providers'
import { buildSystemPrompt, contextLabel, type TabContext } from '../ai/context'
import { chatBlocks } from '../ai/markdown'
import type { AiSettings } from '../store'
import { useSideResize } from './sideResize'

interface Props {
  ai: AiSettings
  onModel: (model: NonNullable<AiSettings['model']>) => void
  /** contesto attuale, ricalcolato a ogni render: solo per l'etichetta */
  label: string | null
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

interface Entry extends ChatMessage {
  /** per le domande: su cosa è stata fatta */
  context?: string
}

const SEP = '\u0000'

/** Chat a destra: ogni domanda porta con sé la tab attiva (e la selezione) in quel momento. */
export function ChatPanel({ ai, onModel, label, getContext, onInsert, onCompare, onOpenSettings, onClose, width, onResize, overlay, tabs, hidden }: Props) {
  const [entries, setEntries] = useState<Entry[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState<AbortController | null>(null)
  const [error, setError] = useState<string | null>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const resize = useSideResize(width, onResize)

  const usable = usableProviders(ai.providers)
  const options = usable.flatMap((p) => p.models.map((m) => ({ provider: p, model: m })))
  const chosen = options.find((o) => o.provider.id === ai.model?.providerId && o.model === ai.model?.model) ?? options[0]

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight })
  }, [entries, busy])

  async function send() {
    const question = input.trim()
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
    const history = [...entries, { role: 'user' as const, content: question, context: contextLabel(ctx) }]
    setEntries(history)
    setInput('')
    setError(null)
    const ac = new AbortController()
    setBusy(ac)
    try {
      const messages = history.map(({ role, content }) => ({ role, content }))
      const reply = await createClient(chosen.provider).chat(chosen.model, built.system, messages, ac.signal)
      setEntries((e) => [...e, { role: 'assistant', content: reply }])
    } catch (err) {
      // la domanda torna nel campo, così si può riprovare o cambiare modello
      setEntries((e) => e.slice(0, -1))
      setInput(question)
      if (!ac.signal.aborted) setError((err as Error).message)
    } finally {
      setBusy(null)
    }
  }

  return (
    <>
      {!overlay && !hidden && <div className="gutter preview-gutter" {...resize} />}
      <aside className={`preview chat${overlay ? ' overlay' : ''}`} style={overlay ? undefined : { width }} hidden={hidden || overlay?.hidden}>
        <header className="panel-bar">
          {overlay && <button onClick={overlay.onHide} title="Torna all'editor (la chat resta aperta)">‹ Editor</button>}
          {tabs ?? <span className="panel-title">Chat</span>}
          <div className="spacer" />
          <button onClick={() => setEntries([])} disabled={!entries.length || !!busy} title="Ricomincia da capo">
            Nuova chat
          </button>
          <button className="panel-close" onClick={onClose} title="Chiudi la chat">×</button>
        </header>

        {options.length === 0 ? (
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
                    {e.content}
                  </div>
                ) : (
                  <Answer key={i} text={e.content} onInsert={onInsert} onCompare={onCompare} />
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
              <textarea
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

/** Risposta del modello: Markdown reso innocuo, con i pulsanti sui blocchi di codice. */
function Answer({ text, onInsert, onCompare }: { text: string; onInsert: (code: string) => void; onCompare: (code: string) => void }) {
  const blocks = useMemo(() => chatBlocks(text), [text])
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
    </div>
  )
}

