import { useEffect, useRef, useState } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'

const HOUR = 60 * 60_000

/**
 * Versione pubblicata sul sito (null se non si sa: offline, o in sviluppo). Il service worker nuovo in attesa
 * non basta: c'è anche quando la pagina è già la versione nuova (per esempio dopo Ctrl+F5, che salta la cache).
 */
async function publishedVersion(): Promise<string | null> {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}version.json`, { cache: 'no-store' })
    return res.ok ? (((await res.json()) as { version?: string }).version ?? null) : null
  } catch {
    return null
  }
}

/**
 * Avviso di nuova versione: l'app non si ricarica da sola (si perderebbe quello che si sta facendo), lo fa l'utente.
 * Il controllo parte all'avvio, ogni ora e quando l'app torna in primo piano: sul telefono un'app ripresa
 * dalle recenti non si riavvia, e senza questo non vedrebbe mai gli aggiornamenti.
 */
export function UpdateBanner() {
  const regRef = useRef<ServiceWorkerRegistration>(undefined)
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, reg) {
      if (!reg) return
      regRef.current = reg
      const check = () => navigator.onLine && void reg.update().catch(() => {})
      setInterval(check, HOUR)
      document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && check())
    },
  })
  /** undefined = controllo in corso */
  const [latest, setLatest] = useState<string | null>()
  useEffect(() => {
    if (!needRefresh) return
    let cancelled = false
    void publishedVersion().then((v) => !cancelled && setLatest(v))
    return () => {
      cancelled = true
    }
  }, [needRefresh])

  /**
   * La libreria ricarica da sola solo se la pagina era già gestita dal service worker all'apertura
   * (non dopo Ctrl+F5 o al primo accesso): qui si ricarica appena la nuova versione è attiva, in ogni caso.
   */
  function reload() {
    const waiting = regRef.current?.waiting
    if (!waiting) return location.reload()
    waiting.addEventListener('statechange', () => waiting.state === 'activated' && location.reload())
    void updateServiceWorker(true)
  }

  // stessa versione di quella in uso: il service worker nuovo si attiverà da solo alla prossima apertura
  if (!needRefresh || latest === undefined || latest === __APP_VERSION__) return null
  return (
    <div className="toast update-banner" role="status">
      <span>{latest ? `Nuova versione ${latest} disponibile` : 'Nuova versione disponibile'}</span>
      <button className="primary" onClick={reload}>
        Ricarica
      </button>
      <button onClick={() => setNeedRefresh(false)} aria-label="Più tardi" title="Più tardi">
        ×
      </button>
    </div>
  )
}
