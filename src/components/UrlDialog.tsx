import { useEffect, useState, type FormEvent } from 'react'
import { formatHeaders, parseHeaders, parseUrl, type UrlRequest } from '../remote'

export interface UrlDialogResult {
  request: UrlRequest
  /** nome scelto (vuoto = automatico) */
  name: string
  /** solo in apertura: aggiungere anche ai preferiti */
  bookmark: boolean
}

interface Props {
  /** `open`: apre l'URL in una tab; `edit`: modifica un preferito */
  mode: 'open' | 'edit'
  initial?: { name: string; request: UrlRequest }
  onSubmit: (result: UrlDialogResult) => void
  onClose: () => void
}

/** Finestra per aprire un URL (richiesta GET, con header facoltativi) o modificare un preferito. */
export function UrlDialog({ mode, initial, onSubmit, onClose }: Props) {
  const [url, setUrl] = useState(initial?.request.url ?? '')
  const [headers, setHeaders] = useState(formatHeaders(initial?.request.headers))
  const [name, setName] = useState(initial?.name ?? '')
  const [bookmark, setBookmark] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const submit = (e: FormEvent) => {
    e.preventDefault()
    try {
      const parsed = parseHeaders(headers)
      const request: UrlRequest = { url: parseUrl(url).href, ...(parsed.length ? { headers: parsed } : {}) }
      onSubmit({ request, name: name.trim(), bookmark: mode === 'edit' || bookmark })
    } catch (err) {
      setError((err as Error).message)
    }
  }

  const showName = mode === 'edit' || bookmark
  return (
    <div className="palette-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="help url-dialog" role="dialog" aria-label={mode === 'open' ? 'Apri URL' : 'Modifica preferito'} onSubmit={submit}>
        <header className="panel-bar">
          <span className="panel-title">{mode === 'open' ? 'Apri URL' : 'Modifica preferito'}</span>
          <div className="spacer" />
          <button type="button" className="panel-close" onClick={onClose} title="Chiudi (Esc)">×</button>
        </header>
        <div className="help-body form">
          <label>
            URL (richiesta GET)
            <input
              autoFocus
              value={url}
              placeholder="https://api.example.com/items"
              spellCheck={false}
              onChange={(e) => {
                setUrl(e.target.value)
                setError(null)
              }}
            />
          </label>
          <label>
            Header, uno per riga
            <textarea
              rows={3}
              value={headers}
              placeholder="Authorization: Bearer …"
              spellCheck={false}
              onChange={(e) => {
                setHeaders(e.target.value)
                setError(null)
              }}
            />
            <small>Vengono salvati in chiaro nel browser insieme alla tab e ai preferiti.</small>
          </label>
          {mode === 'open' && (
            <label className="check">
              <input type="checkbox" checked={bookmark} onChange={(e) => setBookmark(e.target.checked)} />
              Aggiungi ai preferiti
            </label>
          )}
          {showName && (
            <label>
              Nome
              <input value={name} placeholder="automatico, dall'URL" onChange={(e) => setName(e.target.value)} />
            </label>
          )}
          {error && <p className="form-error" role="alert">{error}</p>}
          <div className="form-actions">
            <button type="button" onClick={onClose}>Annulla</button>
            <button type="submit" className="primary">{mode === 'open' ? 'Apri' : 'Salva'}</button>
          </div>
        </div>
      </form>
    </div>
  )
}
