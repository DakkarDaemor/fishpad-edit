import { useEffect, useState } from 'react'
import { createClient, type AiProvider } from '../ai/providers'
import type { Settings, ThemeMode } from '../store'
import { PALETTES, type Palette } from '../editor/themes'

export type SettingsView = 'look' | 'diff' | 'ai'

interface Props {
  settings: Settings
  view: SettingsView
  onView: (view: SettingsView) => void
  onChange: (patch: Partial<Settings>) => void
  onClose: () => void
}

/** gli stessi limiti di Ingrandisci / Riduci testo */
const FONT_SIZES = Array.from({ length: 23 }, (_, i) => i + 10)

const THEMES: Array<[ThemeMode, string]> = [
  ['system', 'Sistema'],
  ['light', 'Chiaro'],
  ['dark', 'Scuro'],
  ...Object.entries(PALETTES).map(([value, p]) => [value as Palette, p.label] as [ThemeMode, string]),
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
  const setSave = (patch: Partial<Settings['save']>) => onChange({ save: { ...settings.save, ...patch } })
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
                {/* un campo numerico rifiutava i valori intermedi mentre si scrive ("1" verso "16"): sul telefono non si poteva cambiare */}
                <select value={settings.fontSize} onChange={(e) => onChange({ fontSize: Number(e.target.value) })}>
                  {FONT_SIZES.map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
              </label>
              <label className="check">
                <input type="checkbox" checked={settings.wrap} onChange={(e) => onChange({ wrap: e.target.checked })} /> A capo automatico
              </label>
              <label className="check">
                <input type="checkbox" checked={settings.typeCheck} onChange={(e) => onChange({ typeCheck: e.target.checked })} /> Controllo dei tipi (TypeScript e TSX)
              </label>
              <div className="check-row">
                <label className="check">
                  <input
                    type="checkbox"
                    checked={settings.npmTypes}
                    disabled={!settings.typeCheck}
                    aria-describedby="npm-types-note"
                    onChange={(e) => onChange({ npmTypes: e.target.checked })}
                  />{' '}
                  Tipi dei pacchetti npm (da esm.sh)
                </label>
                {/* il tabIndex fa aprire la nota anche col tocco e da tastiera, non solo al passaggio del mouse */}
                <span className="info" tabIndex={0} aria-label="Cosa viene inviato">
                  ⓘ
                  <span className="info-tip" role="tooltip" id="npm-types-note">
                    Spenta: i pacchetti importati restano senza tipi (any) e dall'editor non esce niente. Accesa: mentre scrivi, il nome di ogni
                    pacchetto importato (o l'URL dell'import) viene chiesto a esm.sh per scaricarne i tipi. Il contenuto del file non viene mai
                    inviato.
                  </span>
                </span>
              </div>
              <h3>Al salvataggio</h3>
              <label className="check">
                <input type="checkbox" checked={settings.save.trimTrailing} onChange={(e) => setSave({ trimTrailing: e.target.checked })} /> Rimuovi spazi a fine riga (non nel Markdown)
              </label>
              <label className="check">
                <input type="checkbox" checked={settings.save.finalNewline} onChange={(e) => setSave({ finalNewline: e.target.checked })} /> Termina il file con un a capo
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
