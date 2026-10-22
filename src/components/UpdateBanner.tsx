import { useRegisterSW } from 'virtual:pwa-register/react'

const HOUR = 60 * 60_000

/**
 * Avviso di nuova versione: l'app non si ricarica da sola (si perderebbe quello che si sta facendo), lo fa l'utente.
 * Il controllo parte all'avvio, ogni ora e quando l'app torna in primo piano: sul telefono un'app ripresa
 * dalle recenti non si riavvia, e senza questo non vedrebbe mai gli aggiornamenti.
 */
export function UpdateBanner() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, reg) {
      if (!reg) return
      const check = () => navigator.onLine && void reg.update().catch(() => {})
      setInterval(check, HOUR)
      document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && check())
    },
  })
  if (!needRefresh) return null
  return (
    <div className="toast update-banner" role="status">
      <span>Nuova versione disponibile</span>
      <button className="primary" onClick={() => void updateServiceWorker(true)}>
        Ricarica
      </button>
      <button onClick={() => setNeedRefresh(false)} aria-label="Più tardi" title="Più tardi">
        ×
      </button>
    </div>
  )
}
