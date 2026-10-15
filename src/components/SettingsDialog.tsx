import { useEffect, useState } from 'react'
import { createClient, type AiProvider } from '../ai/providers'
import type { Settings, ThemeMode } from '../store'

export type SettingsView = 'look' | 'diff' | 'ai'

interface Props {
  settings: Settings
  view: SettingsView
  onView: (view: SettingsView) => void
  onChange: (patch: Partial<Settings>) => void
  onClose: () => void
}

const THEMES: Array<[ThemeMode, string]> = [
  ['system', 'Sistema'],
  ['light', 'Chiaro'],
  ['dark', 'Scuro'],
]

/** Impostazioni: aspetto dell'editor, confronto e chiavi dei provider AI. */
export function SettingsDialog({ settings, view, onView, onChange, onClose }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const diff = settings.diff
  const setDiff = (patch: Partial<Settings['diff']>) => onChange({ diff: { ...diff, ...patch } })
  const setProvider = (id: string, patch: Partial<AiProvider>) =>
    onChange({ ai: { ...settings.ai, providers: settings.ai.providers.map((p) => (p.id === id ? { ...p, ...patch } : p)) } })

  const tab = (v: SettingsView, label: string) => (
    <button className={view === v ? 'current' : undefined} onClick={() => onView(v)}>
      {label}
    </button>
  )

  return (
    <div className="palette-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="help settings" role="dialog" aria-label="Impostazioni">
        <header className="panel-bar">
          {tab('look', 'Aspetto')}
          {tab('diff', 'Confronto')}
          {tab('ai', 'AI')}
          <div className="spacer" />
          <button className="panel-close" onClick={onClose} title="Chiudi (Esc)" autoFocus>
            ×
          </button>
        </header>
        <div className="help-body form">
          {view === 'look' && (
            <>
              <label>
                Tema
                <select value={settings.theme} onChange={(e) => onChange({ theme: e.target.value as ThemeMode })}>
                  {THEMES.map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </label>
              <label>
                Dimensione del testo (px)
                <input
                  type="number"
                  min={10}
                  max={32}
                  value={settings.fontSize}
                  onChange={(e) => {
                    const n = Number(e.target.value)
                    if (n >= 10 && n <= 32) onChange({ fontSize: n })
                  }}
                />
              </label>
              <label className="check">
                <input type="checkbox" checked={settings.wrap} onChange={(e) => onChange({ wrap: e.target.checked })} /> A capo automatico
              </label>
            </>
          )}

          {view === 'diff' && (
            <>
              <label>
                Vista
                <select
                  value={diff.unified === undefined ? 'auto' : diff.unified ? 'unified' : 'side'}
                  onChange={(e) => setDiff({ unified: e.target.value === 'auto' ? undefined : e.target.value === 'unified' })}
                >
                  <option value="auto">Automatica (unificata sul telefono, affiancata altrove)</option>
                  <option value="side">Affiancata</option>
                  <option value="unified">Unificata</option>
                </select>
              </label>
              <label className="check">
                <input type="checkbox" checked={diff.collapse} onChange={(e) => setDiff({ collapse: e.target.checked })} /> Solo modifiche (piega le righe uguali)
              </label>
              <label className="check">
                <input type="checkbox" checked={diff.normalize} onChange={(e) => setDiff({ normalize: e.target.checked })} /> Ignora formattazione (Prettier)
              </label>
            </>
          )}

          {view === 'ai' && (
            <>
              <p className="settings-note">
                Le chiavi restano in questo browser, salvate in chiaro: chi usa questo profilo del browser può leggerle. Le richieste partono
                da qui direttamente verso il provider. Il codice eseguito in anteprima e in console non può vederle.
              </p>
              {settings.ai.providers.map((p) => (
                <ProviderItem key={p.id} provider={p} onChange={(patch) => setProvider(p.id, patch)} />
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function ProviderItem({ provider, onChange }: { provider: AiProvider; onChange: (patch: Partial<AiProvider>) => void }) {
  const [catalog, setCatalog] = useState<string[]>([])
  const [draft, setDraft] = useState('')
  const [status, setStatus] = useState('')
  const query = draft.trim().toLowerCase()
  const matches = catalog.filter((m) => m.toLowerCase().includes(query) && !provider.models.includes(m))

  const addModel = (m: string) => {
    if (m && !provider.models.includes(m)) onChange({ models: [...provider.models, m] })
  }

  // fa anche da verifica della chiave
  async function loadCatalog() {
    setStatus('Caricamento…')
    try {
      const ids = await createClient(provider).listModels()
      setCatalog(ids)
      setStatus(`${ids.length} modelli disponibili: filtra scrivendo nel campo, clic per aggiungere.`)
    } catch (err) {
      setStatus(`Errore: ${(err as Error).message}`)
    }
  }

  return (
    <details className="provider">
      <summary>
        <span>{provider.name}</span>
        <span className="provider-state">
          {provider.apiKey.trim() ? `${provider.models.length} ${provider.models.length === 1 ? 'modello' : 'modelli'}` : 'nessuna chiave'}
        </span>
      </summary>
      <div className="provider-body">
        <label>
          Endpoint
          <input value={provider.baseUrl} spellCheck={false} onChange={(e) => onChange({ baseUrl: e.target.value })} />
        </label>
        <label>
          Chiave API
          <input
            type="password"
            autoComplete="off"
            spellCheck={false}
            value={provider.apiKey}
            onChange={(e) => onChange({ apiKey: e.target.value })}
          />
        </label>
        {provider.models.length > 0 && (
          <ul className="model-chips">
            {provider.models.map((m) => (
              <li key={m}>
                {m}
                <button aria-label={`Rimuovi ${m}`} onClick={() => onChange({ models: provider.models.filter((x) => x !== m) })}>
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
        <form
          className="provider-add"
          onSubmit={(e) => {
            e.preventDefault()
            addModel(draft.trim())
            setDraft('')
          }}
        >
          <input
            placeholder={catalog.length ? 'Cerca, es. :free' : 'id del modello'}
            aria-label="Aggiungi modello"
            spellCheck={false}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
          <button type="submit">Aggiungi</button>
        </form>
        <div>
          <button onClick={() => void loadCatalog()} disabled={!provider.apiKey.trim() && provider.id !== 'openrouter'}>
            Carica l'elenco dei modelli
          </button>
        </div>
        {status && <small className="settings-note">{status}</small>}
        {catalog.length > 0 && (
          <ul className="model-catalog">
            {matches.map((m) => (
              <li key={m}>
                <button onClick={() => addModel(m)}>{m}</button>
              </li>
            ))}
            {!matches.length && <li className="settings-note">Nessun modello corrispondente</li>}
          </ul>
        )}
      </div>
    </details>
  )
}
