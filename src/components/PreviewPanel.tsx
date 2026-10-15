import { useCallback, useSyncExternalStore, type ReactNode } from 'react'
import type { Runner } from '../runner/Runner'
import { useSideResize } from './sideResize'

interface Props {
  runner: Runner
  /** nome attuale del documento (cambia con Salva con nome); se chiuso resta quello dell'avvio */
  docName?: string
  width: number
  consoleOpen: boolean
  onResize: (width: number) => void
  onReload: () => void
  onToggleConsole: () => void
  /** schermo del telefono: l'anteprima copre l'editor, e si nasconde senza chiuderla */
  overlay?: { hidden: boolean; onHide: () => void }
  /** al posto del titolo, le schede Anteprima | Chat quando sono aperte entrambe */
  tabs?: ReactNode
  /** dietro la chat: nascosta ma non smontata */
  hidden?: boolean
}

/** Pannello a destra con la pagina HTML o il componente React del documento in anteprima. */
export function PreviewPanel({ runner, docName, width, consoleOpen, onResize, onReload, onToggleConsole, overlay, tabs, hidden }: Props) {
  const { preview, alive, entries } = useSyncExternalStore(runner.subscribe, runner.getSnapshot)
  const errors = entries.filter((e) => e.level === 'error').length
  const host = useCallback((el: HTMLDivElement | null) => runner.setPreviewHost(el), [runner])

  const resize = useSideResize(width, onResize)

  if (!preview) return null
  const name = docName ?? preview.name
  return (
    <>
      {!overlay && !hidden && <div className="gutter preview-gutter" {...resize} />}
      {/* nascosta e non smontata: l'iframe della pagina resta vivo */}
      <aside className={`preview${overlay ? ' overlay' : ''}`} style={overlay ? undefined : { width }} hidden={hidden || overlay?.hidden}>
        <header className="panel-bar">
          {overlay && (
            <button onClick={overlay.onHide} title="Torna all'editor (l'anteprima resta aperta)">‹ Editor</button>
          )}
          {tabs ?? <span className="panel-title">Anteprima</span>}
          <span className="preview-name" title={name}>{name}</span>
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
