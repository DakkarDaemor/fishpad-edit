import { useEffect } from 'react'
import type { Notice } from '../notices'

interface Props {
  notices: Notice[]
  onClose: () => void
}

/** Limiti noti del dispositivo: alla prima apertura, o da Aiuto. */
export function NoticeDialog({ notices, onClose }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="palette-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="help notices" role="dialog" aria-labelledby="notices-title">
        <header className="panel-bar">
          <span className="panel-title" id="notices-title">Su questo dispositivo</span>
          <div className="spacer" />
          <button className="panel-close" onClick={onClose} title="Chiudi (Esc)">×</button>
        </header>
        <div className="help-body">
          {notices.map((n) => (
            <section key={n.id}>
              <h3>{n.title}</h3>
              <p>{n.text}</p>
            </section>
          ))}
          <div className="form-actions">
            <button className="primary" onClick={onClose} autoFocus>Ho capito</button>
          </div>
        </div>
      </div>
    </div>
  )
}
