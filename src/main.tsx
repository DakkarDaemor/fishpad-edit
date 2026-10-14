import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import App from './App.tsx'
import { isIOS } from './notices'
import './styles.css'

registerSW({ immediate: true })

// Safari su iPhone e iPad ingrandisce la pagina quando si tocca un campo con testo sotto i 16px (l'editor compreso).
// Con maximum-scale non lo fa più, e lo zoom a due dita resta possibile.
if (isIOS()) {
  const viewport = document.querySelector<HTMLMetaElement>('meta[name="viewport"]')
  if (viewport) viewport.content += ', maximum-scale=1'
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
