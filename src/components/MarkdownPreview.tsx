import { useEffect, useRef, useState } from 'react'
import type { AssetResolver } from '../runner/assets'
import type { PreviewAssets } from '../runner/folderAssets'
import { rewriteHtml } from '../runner/assets'
import { markdownDocument, markdownHtml } from '../runner/preview'
import type { Workbench } from '../workbench/Workbench'

const TAG = 'fishpad-md'

// Gira nell'iframe:
// - aggiorna solo i blocchi cambiati, senza ricaricare la pagina: scroll e immagini restano dove sono;
// - dà ai titoli gli id di GitHub, così funzionano gli indici con i link #;
// - riporta lo scroll (per ritrovarlo tornando alla tab) e passa all'editor le scorciatoie con Ctrl.
const RECEIVER = `<base target="_blank"><script>
const slug = (t) => t.trim().toLowerCase().replace(/[^\\p{L}\\p{N}\\s_-]/gu, '').replace(/\\s/g, '-');
function update(html) {
  const next = document.createElement('body');
  next.innerHTML = html;
  const used = new Map();
  for (const h of next.querySelectorAll('h1, h2, h3, h4, h5, h6')) {
    const base = slug(h.textContent);
    const n = used.get(base) ?? 0;
    used.set(base, n + 1);
    h.id = n ? base + '-' + n : base;
  }
  const body = document.body;
  const fresh = [...next.childNodes];
  fresh.forEach((node, i) => {
    const old = body.childNodes[i];
    if (!old) body.appendChild(node);
    else if (!old.isEqualNode(node)) body.replaceChild(node, old);
  });
  while (body.childNodes.length > fresh.length) body.lastChild.remove();
}
addEventListener('message', (e) => {
  if (e.source !== parent || e.data?.tag !== '${TAG}') return;
  update(e.data.html);
  if (e.data.scroll != null) scrollTo(0, e.data.scroll);
});
let pending = false;
addEventListener('scroll', () => {
  if (pending) return;
  pending = true;
  requestAnimationFrame(() => { pending = false; parent.postMessage({ tag: '${TAG}', scroll: scrollY }, '*'); });
});
addEventListener('click', (e) => {
  const href = e.target.closest?.('a[href]')?.getAttribute('href');
  if (!href) return;
  if (href.startsWith('#')) {
    e.preventDefault();
    document.getElementById(decodeURIComponent(href.slice(1)))?.scrollIntoView();
  } else if (!/^([a-z][a-z\\d+.-]*:|\\/\\/)/i.test(href) && /\\.(md|markdown)([?#]|$)/i.test(href)) {
    // link relativo a un altro file Markdown: lo apre l'editor
    e.preventDefault();
    parent.postMessage({ tag: '${TAG}', open: href }, '*');
  }
});
addEventListener('keydown', (e) => {
  if (!(e.ctrlKey || e.metaKey) || e.altKey || e.code === 'KeyC' || e.code === 'KeyA') return;
  e.preventDefault();
  parent.postMessage({ tag: '${TAG}', key: { code: e.code, key: e.key, ctrlKey: e.ctrlKey, metaKey: e.metaKey, shiftKey: e.shiftKey } }, '*');
}, true);
parent.postMessage({ tag: '${TAG}', ready: true }, '*');
</script>`

/** Scroll di ogni anteprima (pannello + documento), per ritrovarlo tornando alla tab. */
const scrolls = new Map<string, number>()

/** Ogni file si legge una volta per anteprima, non a ogni battuta. */
function cached(resolve: AssetResolver): AssetResolver {
  const seen = new Map<string, ReturnType<AssetResolver>>()
  return (path) => {
    const key = path.join('/')
    if (!seen.has(key)) seen.set(key, resolve(path))
    return seen.get(key)!
  }
}

interface Props {
  wb: Workbench
  paneId: string
  docId: string
  /** file della cartella aperta per immagini e link relativi (null se la pagina non sta in una cartella) */
  assets?: (docId: string) => Promise<PreviewAssets | null>
  onOpenLink?: (docId: string, href: string) => void
}

/** Anteprima Markdown al posto del testo in una tab: si aggiorna mentre si scrive, senza lampeggiare. */
export function MarkdownPreview({ wb, paneId, docId, assets, onOpenLink }: Props) {
  const frame = useRef<HTMLIFrameElement>(null)
  // la pagina vuota si crea una volta sola: il contenuto arriva con postMessage
  const [shell, setShell] = useState<string | null>(null)
  const [ready, setReady] = useState(false)
  const key = `${paneId}\u0000${docId}`

  useEffect(() => {
    void markdownDocument('', RECEIVER).then(setShell)
  }, [])

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.source !== frame.current?.contentWindow || e.data?.tag !== TAG) return
      if (e.data.ready) setReady(true)
      else if (typeof e.data.scroll === 'number') scrolls.set(key, e.data.scroll)
      else if (typeof e.data.open === 'string') {
        wb.focusPane(paneId)
        onOpenLink?.(docId, e.data.open)
      }
      else if (e.data.key) {
        // la scorciatoia vale per il pannello dell'anteprima, anche se era attivo un altro
        wb.focusPane(paneId)
        window.dispatchEvent(new KeyboardEvent('keydown', { ...e.data.key, cancelable: true }))
      }
    }
    // un clic nell'iframe non arriva alla pagina: si vede dal focus che passa all'iframe
    const onBlur = () => setTimeout(() => document.activeElement === frame.current && wb.focusPane(paneId))
    window.addEventListener('message', onMessage)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('message', onMessage)
      window.removeEventListener('blur', onBlur)
    }
  }, [wb, paneId, docId, key, onOpenLink])

  useEffect(() => {
    if (!ready) return
    let timer: number | undefined
    let gen = 0
    let first = true
    // shortcut: immagini e altri file cambiati su disco si vedono riaprendo l'anteprima
    const files = assets?.(docId)
      .then((a) => a && { ...a, resolve: cached(a.resolve) })
      .catch(() => null)
    const render = async () => {
      const mine = ++gen
      let html = await markdownHtml(wb.content(docId))
      const a = await files
      if (a) html = await rewriteHtml(html, a.baseDir, a.resolve)
      if (mine !== gen) return
      frame.current?.contentWindow?.postMessage({ tag: TAG, html, scroll: first ? (scrolls.get(key) ?? 0) : null }, '*')
      first = false
    }
    void render()
    const off = wb.onContentChange((id) => {
      if (id !== docId) return
      clearTimeout(timer)
      timer = window.setTimeout(() => void render(), 120)
    })
    return () => {
      off()
      clearTimeout(timer)
      gen++
    }
  }, [wb, docId, key, assets, ready])

  return shell ? (
    <iframe
      ref={frame}
      className="md-preview"
      title="Anteprima Markdown"
      // i link esterni si aprono come normali pagine del browser, non nella sandbox
      sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox"
      srcDoc={shell}
    />
  ) : null
}
