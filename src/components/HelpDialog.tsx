import { useEffect, useState } from 'react'
import { SHORTCUTS } from '../shortcuts'

export type HelpView = 'shortcuts' | 'changelog'

interface Props {
  view: HelpView
  onView: (view: HelpView) => void
  onClose: () => void
}

/** Il CHANGELOG fa parte della build (import ?raw, caricato alla prima apertura): si legge anche offline. */
async function changelogHtml() {
  const [{ default: md }, { marked }] = await Promise.all([import('../../CHANGELOG.md?raw'), import('marked')])
  return marked.parse(md.replace(/^# .*\r?\n/, ''), { gfm: true })
}

/** Finestra di aiuto: scorciatoie da tastiera e novità delle versioni. */
export function HelpDialog({ view, onView, onClose }: Props) {
  const [changelog, setChangelog] = useState<string | null>(null)

  useEffect(() => {
    if (view === 'changelog' && changelog === null) void changelogHtml().then(setChangelog)
  }, [view, changelog])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="palette-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="help" role="dialog" aria-label="Aiuto">
        <header className="panel-bar">
          <button className={view === 'shortcuts' ? 'current' : undefined} onClick={() => onView('shortcuts')}>
            Scorciatoie
          </button>
          <button className={view === 'changelog' ? 'current' : undefined} onClick={() => onView('changelog')}>
            Novità
          </button>
          <div className="spacer" />
          <span className="version">Fishpad Edit v{__APP_VERSION__}</span>
          <button className="panel-close" onClick={onClose} title="Chiudi (Esc)" autoFocus>
            ×
          </button>
        </header>
        <div className="help-body">
          {view === 'shortcuts' ? (
            <table>
              <tbody>
                {SHORTCUTS.map(([action, keys]) => (
                  <tr key={action}>
                    <td>{action}</td>
                    <td>
                      <kbd>{keys}</kbd>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : changelog === null ? (
            <p>Caricamento…</p>
          ) : (
            // contenuto della build, non dell'utente
            <div className="changelog" dangerouslySetInnerHTML={{ __html: changelog }} />
          )}
        </div>
      </div>
    </div>
  )
}
