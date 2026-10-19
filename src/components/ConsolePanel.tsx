import { useLayoutEffect, useRef, useSyncExternalStore, type PointerEvent as ReactPointerEvent } from 'react'
import type { Runner } from '../runner/Runner'
import type { TabColor } from '../workbench/tabColors'
import { DocLink } from './DocLink'

interface Props {
  runner: Runner
  height: number
  canRun: boolean
  onResize: (height: number) => void
  onRun: () => void
  onClose: () => void
  onGoto: (docId: string, line: number) => void
  /** tab del file che ha prodotto l'output (undefined se chiusa) */
  sourceDoc: (docId: string) => { name: string; color?: TabColor } | undefined
  onShowDoc: (docId: string) => void
}

/** Pannello in basso con l'output dell'ultima esecuzione. */
export function ConsolePanel({ runner, height, canRun, onResize, onRun, onClose, onGoto, sourceDoc, onShowDoc }: Props) {
  const { entries, running, alive, source } = useSyncExternalStore(runner.subscribe, runner.getSnapshot)
  const open = source ? sourceDoc(source.docId) : undefined
  const bodyRef = useRef<HTMLDivElement>(null)
  const stick = useRef(true)

  // Scorre in fondo ai nuovi messaggi, a meno che l'utente non stia leggendo più in alto
  useLayoutEffect(() => {
    const el = bodyRef.current
    if (el && stick.current) el.scrollTop = el.scrollHeight
  }, [entries])

  const drag = useRef<{ y: number; h: number } | null>(null)
  const onDown = (e: ReactPointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { y: e.clientY, h: height }
  }
  const onMove = (e: ReactPointerEvent) => {
    if (!drag.current) return
    const max = window.innerHeight - 160
    onResize(Math.round(Math.min(max, Math.max(80, drag.current.h + drag.current.y - e.clientY))))
  }

  return (
    <section className="console" style={{ height }}>
      <div className="gutter console-gutter" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={() => (drag.current = null)} />
      <header className="panel-bar">
        <span className="panel-title">Console</span>
        {source && <DocLink name={open?.name ?? source.name} color={open?.color} onShow={open ? () => onShowDoc(source.docId) : undefined} />}
        {running && <span className="console-running">in esecuzione…</span>}
        <div className="spacer" />
        <button onClick={onRun} disabled={!canRun} title="Esegui il file o la selezione (Ctrl+Enter)">▶ Esegui</button>
        <button onClick={() => runner.stop()} disabled={!alive} title="Ferma l'esecuzione, compresi timer e promise pendenti">■ Stop</button>
        <button onClick={() => runner.clear()} disabled={!entries.length} title="Pulisci la console">Pulisci</button>
        <button className="panel-close" onClick={onClose} title="Chiudi la console">×</button>
      </header>
      <div
        className="console-body"
        ref={bodyRef}
        onScroll={(e) => {
          const el = e.currentTarget
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24
        }}
      >
        {entries.length === 0 && (
          <div className="console-empty">Premi Ctrl+Enter in un file JavaScript o TypeScript per eseguirlo; con del testo selezionato esegue solo la selezione. HTML, JSX e TSX si aprono nell'anteprima.</div>
        )}
        {entries.map((e) => (
          <div key={e.id} className={`console-line ${e.level}`}>
            <span className="console-text">{e.text}</span>
            {e.docId && e.line && (
              <button className="console-goto" onClick={() => onGoto(e.docId!, e.line!)} title="Vai alla riga">
                riga {e.line}
              </button>
            )}
          </div>
        ))}
      </div>
    </section>
  )
}
