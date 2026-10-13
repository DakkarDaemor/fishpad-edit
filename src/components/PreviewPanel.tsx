import { useCallback, useRef, useSyncExternalStore, type PointerEvent as ReactPointerEvent } from 'react'
import type { Runner } from '../runner/Runner'

interface Props {
  runner: Runner
  width: number
  consoleOpen: boolean
  onResize: (width: number) => void
  onReload: () => void
  onToggleConsole: () => void
}

/** Pannello a destra con la pagina HTML o il componente React del documento in anteprima. */
export function PreviewPanel({ runner, width, consoleOpen, onResize, onReload, onToggleConsole }: Props) {
  const { preview, alive, entries } = useSyncExternalStore(runner.subscribe, runner.getSnapshot)
  const errors = entries.filter((e) => e.level === 'error').length
  const host = useCallback((el: HTMLDivElement | null) => runner.setPreviewHost(el), [runner])

  const drag = useRef<{ x: number; w: number } | null>(null)
  const onDown = (e: ReactPointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { x: e.clientX, w: width }
  }
  const onMove = (e: ReactPointerEvent) => {
    if (!drag.current) return
    const max = window.innerWidth - 240
    onResize(Math.round(Math.min(max, Math.max(200, drag.current.w + drag.current.x - e.clientX))))
  }

  if (!preview) return null
  return (
    <>
      <div className="gutter preview-gutter" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={() => (drag.current = null)} />
      <aside className="preview" style={{ width }}>
        <header className="panel-bar">
          <span className="panel-title">Anteprima</span>
          <span className="preview-name" title={preview.name}>{preview.name}</span>
          <div className="spacer" />
          <button onClick={onReload} title="Ricarica (Ctrl+Enter)">↻ Ricarica</button>
          <button onClick={() => runner.stop()} disabled={!alive} title="Ferma la pagina (si riavvia alla prossima modifica)">■ Stop</button>
          <button
            className={errors ? 'has-errors' : undefined}
            onClick={onToggleConsole}
            title={consoleOpen ? 'Chiudi la console' : 'Apri la console'}
          >
            Console{errors ? ` (${errors} ${errors === 1 ? 'errore' : 'errori'})` : entries.length ? ` (${entries.length})` : ''}
          </button>
          <button className="panel-close" onClick={() => runner.closePreview()} title="Chiudi l'anteprima">×</button>
        </header>
        <div className="preview-body">
          {/* l'iframe lo monta Runner: React non deve gestire i figli di questo div */}
          <div className="preview-host" ref={host} />
          {!alive && <div className="preview-empty">Anteprima fermata. Ricarica per eseguirla di nuovo.</div>}
        </div>
      </aside>
    </>
  )
}
