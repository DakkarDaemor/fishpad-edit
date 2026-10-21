import { loadMarked } from '../markdown'
import { reactVendorScript } from './react-vendor'
import { bridgeSource, linesBefore } from './sandbox'

/**
 * Documenti (srcdoc) del pannello Anteprima. Il codice gira nell'iframe stesso, con il bridge
 * della console caricato per primo. Le righe degli errori restano quelle del file:
 * - HTML: il bridge è uno script `data:` su una sola riga, quindi non aggiunge righe;
 * - JSX/TSX: il codice utente parte da una riga nota del documento generato.
 */

// Uno script data: non aggiunge righe al documento
const dataScript = (src: string) => `<script src="data:text/javascript;charset=utf-8,${encodeURIComponent(src)}"></script>`

// Dentro uno <script> inline la sequenza </script chiuderebbe il tag
const inlineSafe = (src: string) => src.replace(/<\/(script)/gi, '<\\/$1')

const lineCount = (s: string) => s.split('\n').length

/** Pagina HTML così com'è, con il bridge inserito subito dopo il doctype (prima resterebbe in quirks mode). */
export function htmlDocument(html: string): string {
  const bridge =
    bridgeSource({ offset: 0, lines: lineCount(html), target: 'parent', frames: 'srcdoc' }) +
    "\naddEventListener('load', () => __fishpadBridge.send({ kind: 'done', ok: true }));"
  const doctype = /^\s*<!doctype[^>]*>/i.exec(html)
  const at = doctype ? doctype[0].length : 0
  return html.slice(0, at) + dataScript(bridge) + html.slice(at)
}

const MARKDOWN_STYLE = `
:root { color-scheme: light dark; }
body { margin: 0 auto; padding: 24px 32px; max-width: 860px; font: 15px/1.6 system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; }
h1, h2 { padding-bottom: 0.3em; border-bottom: 1px solid #8884; }
a { color: #0969da; }
code, pre { font-family: ui-monospace, 'Cascadia Code', Consolas, monospace; font-size: 0.9em; background: #8882; border-radius: 4px; }
code { padding: 0.15em 0.35em; }
pre { padding: 12px 16px; overflow: auto; }
pre code { padding: 0; background: none; }
blockquote { margin: 0; padding: 0 1em; color: #888; border-left: 4px solid #8886; }
table { border-collapse: collapse; }
th, td { padding: 6px 12px; border: 1px solid #8886; }
img { max-width: 100%; }
@media (prefers-color-scheme: dark) { a { color: #58a6ff; } }
`

/** Pagina HTML con il Markdown convertito (GitHub Flavored Markdown). `marked` viene caricato al primo uso. */
export async function markdownDocument(md: string): Promise<string> {
  const body = await (await loadMarked()).parse(md)
  return `<!doctype html><html><head><meta charset="utf-8"><style>${MARKDOWN_STYLE}</style></head><body>${body}</body></html>`
}

/**
 * Pagina per un componente React. `js` è il codice già traspilato (import → require).
 * Se il codice non chiama createRoot, viene montato in #root l'export default o, in mancanza,
 * una funzione `App` definita nel file.
 */
export async function reactDocument(js: string, userLines: number): Promise<string> {
  const vendor = inlineSafe(await reactVendorScript())
  const head = (offset: number) => `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<style>body { margin: 16px; font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; }</style>
${dataScript(bridgeSource({ offset, lines: userLines, target: 'parent', frames: 'srcdoc' }))}
<script>${vendor}</script>
</head><body><div id="root"></div>
<script>
(async (exports) => {
`
  const offset = linesBefore(head(0))
  return `${head(offset)}${inlineSafe(js)}
;return exports.default ?? (typeof App === 'function' ? App : undefined);
})({}).then((Component) => {
  if (typeof Component === 'function' && !__fishpad.rendered) {
    require('react-dom/client').createRoot(document.getElementById('root')).render(require('react/jsx-runtime').jsx(Component, {}));
  }
  __fishpadBridge.send({ kind: 'done', ok: true });
}, (e) => {
  __fishpadBridge.report(e);
  __fishpadBridge.send({ kind: 'done', ok: false });
});
</script></body></html>`
}
