import { loadMarked } from '../markdown'
import { reactVendorScript } from './react-vendor'
import { bridgeSource, linesBefore } from './sandbox'
import { CompileError } from './transpile'

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

/** Markdown convertito in HTML (GitHub Flavored Markdown). `marked` viene caricato al primo uso. */
export const markdownHtml = async (md: string) => (await loadMarked()).parse(md)

/** Pagina HTML con il Markdown convertito; `head` si aggiunge dopo lo stile. */
export async function markdownDocument(md: string, head = ''): Promise<string> {
  return `<!doctype html><html><head><meta charset="utf-8"><style>${MARKDOWN_STYLE}</style>${head}</head><body>${await markdownHtml(md)}</body></html>`
}

const JSON_STYLE = `
:root { color-scheme: light dark; --key: #0451a5; --str: #a31515; --num: #098658; --lit: #0000ff; --muted: #888; }
@media (prefers-color-scheme: dark) { :root { --key: #9cdcfe; --str: #ce9178; --num: #b5cea8; --lit: #569cd6; } }
body { margin: 0; padding: 12px 16px; font: 13px/1.6 ui-monospace, 'Cascadia Code', Consolas, monospace; }
details > :not(summary), .more { margin-left: 1.25em; }
summary { cursor: pointer; }
.leaf { padding-left: 1.25em; overflow-wrap: anywhere; }
.k { color: var(--key); }
.i { color: var(--muted); }
.k, .i { cursor: pointer; }
.k:hover, .i:hover { text-decoration: underline; }
.str { color: var(--str); }
.num { color: var(--num); }
.lit { color: var(--lit); }
.meta { color: var(--muted); }
.more { font: inherit; margin-top: 2px; }
`

// Gira nell'iframe: costruisce i figli di un nodo solo quando lo si apre, così anche i file grandi restano leggeri.
// I numeri tengono il testo del file (source nel reviver), quindi quelli grandi non vengono arrotondati.
// Un clic sulla chiave manda il percorso all'editor, che va alla riga (vedi jsonPath.ts); la freccia apre e chiude.
const JSON_TREE = `
const Num = class { constructor(s) { this.s = s; } };
const data = JSON.parse(document.getElementById('data').textContent, (k, v, ctx) => typeof v === 'number' ? new Num(ctx?.source ?? String(v)) : v);
const PAGE = 500;
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const isBranch = (v) => v !== null && typeof v === 'object' && !(v instanceof Num);
function label(parent, path, isIndex) {
  if (!path.length) return;
  const key = path[path.length - 1];
  const k = el('span', isIndex ? 'i' : 'k', isIndex ? String(key) : JSON.stringify(key));
  k.title = 'Vai alla riga nel file';
  k.onclick = (e) => { e.preventDefault(); self.__fishpadBridge?.send({ kind: 'goto', path }); };
  parent.append(k, ': ');
}
function leaf(v) {
  if (v instanceof Num) return el('span', 'num', v.s);
  if (typeof v === 'string') return el('span', 'str', JSON.stringify(v));
  return el('span', 'lit', String(v));
}
function node(v, path, isIndex) {
  if (!isBranch(v)) { const d = el('div', 'leaf'); label(d, path, isIndex); d.append(leaf(v)); return d; }
  const arr = Array.isArray(v);
  const entries = arr ? v.map((x, i) => [i, x]) : Object.entries(v);
  const n = entries.length;
  const meta = arr ? '[' + n + (n === 1 ? ' elemento' : ' elementi') + ']' : '{' + n + (n === 1 ? ' chiave' : ' chiavi') + '}';
  if (!n) { const d = el('div', 'leaf'); label(d, path, isIndex); d.append(el('span', 'meta', arr ? '[]' : '{}')); return d; }
  const det = el('details');
  const sum = el('summary');
  label(sum, path, isIndex);
  sum.append(el('span', 'meta', meta));
  det.append(sum);
  let shown = 0;
  const more = () => {
    const end = Math.min(n, shown + PAGE);
    const frag = document.createDocumentFragment();
    for (; shown < end; shown++) frag.append(node(entries[shown][1], [...path, entries[shown][0]], arr));
    det.querySelector(':scope > .more')?.remove();
    det.append(frag);
    if (shown < n) {
      const b = el('button', 'more', 'Mostra altri ' + Math.min(PAGE, n - shown) + ' (di ' + (n - shown) + ')');
      b.onclick = more;
      det.append(b);
    }
  };
  det.addEventListener('toggle', () => { if (det.open && !shown) more(); });
  if (path.length < 2) { more(); det.open = true; }
  return det;
}
document.body.append(node(data, [], false));
`

/** Riga dell'errore nel messaggio di JSON.parse: "line N" (Firefox, Chrome recenti) o "position N". */
function jsonErrorLine(message: string, text: string): number | undefined {
  const line = /line (\d+)/.exec(message)
  if (line) return +line[1]
  const pos = /position (\d+)/.exec(message)
  return pos ? text.slice(0, +pos[1]).split('\n').length : undefined
}

/** Pagina con il JSON come albero da aprire e chiudere. Se il JSON non è valido lancia CompileError con la riga. */
export function jsonDocument(text: string): string {
  try {
    JSON.parse(text)
  } catch (err) {
    const message = (err as Error).message
    throw new CompileError(message, jsonErrorLine(message, text))
  }
  // fuori dalle stringhe `<` non può esserci: \u003c dentro le stringhe è lo stesso carattere e non chiude lo <script>
  const data = text.replace(/</g, '\\u003c')
  return `<!doctype html><html><head><meta charset="utf-8"><style>${JSON_STYLE}</style></head><body>
<script type="application/json" id="data">${data}</script>
<script>${JSON_TREE}</script></body></html>`
}

/** Separatore del CSV, dalla prima riga: tab, `;` (Excel in italiano) o `,`. */
function csvSeparator(text: string): string {
  const first = text.slice(0, text.search(/\r?\n|$/))
  const count = (c: string) => first.split(c).length
  return [',', ';', '\t'].reduce((best, c) => (count(c) > count(best) ? c : best))
}

/** Righe del CSV (RFC 4180): campi tra virgolette con `""`, separatori e a capo dentro. */
export function parseCsv(text: string, sep = csvSeparator(text)): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c !== '"') cell += c
      else if (text[i + 1] === '"') cell += text[i++]
      else quoted = false
    } else if (c === '"' && cell === '') quoted = true
    else if (c === sep) {
      row.push(cell)
      cell = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else cell += c
  }
  if (cell || row.length) rows.push([...row, cell])
  return rows
}

const CSV_STYLE = `
:root { color-scheme: light dark; --muted: #888; --line: #8884; --head: Canvas; }
body { margin: 0; font: 13px/1.5 system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; }
table { border-collapse: collapse; }
th, td { padding: 4px 10px; border: 1px solid var(--line); white-space: pre-wrap; vertical-align: top; }
thead th { position: sticky; top: 0; background: var(--head); box-shadow: 0 1px 0 var(--line); }
td.n { color: var(--muted); text-align: right; user-select: none; }
.meta { padding: 8px 10px; color: var(--muted); }
.more { margin: 8px 10px; font: inherit; }
`

// Gira nell'iframe: la prima riga fa da intestazione, le altre si aggiungono 500 alla volta.
const CSV_TABLE = `
const rows = JSON.parse(document.getElementById('data').textContent);
const PAGE = 500;
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const cols = rows.reduce((m, r) => Math.max(m, r.length), 0);
const line = (tag, r, n) => { const tr = el('tr'); tr.append(el(tag, 'n', n)); for (let c = 0; c < cols; c++) tr.append(el(tag, null, r[c] ?? '')); return tr; };
const [head = [], ...body] = rows;
document.body.append(el('div', 'meta', body.length + (body.length === 1 ? ' riga' : ' righe') + ', ' + cols + (cols === 1 ? ' colonna' : ' colonne')));
const table = el('table'), thead = el('thead'), tbody = el('tbody');
thead.append(line('th', head, ''));
table.append(thead, tbody);
document.body.append(table);
let shown = 0;
const more = () => {
  const end = Math.min(body.length, shown + PAGE);
  const frag = document.createDocumentFragment();
  for (; shown < end; shown++) frag.append(line('td', body[shown], shown + 1));
  tbody.append(frag);
  document.querySelector('.more')?.remove();
  if (shown < body.length) {
    const b = el('button', 'more', 'Mostra altre ' + Math.min(PAGE, body.length - shown) + ' (di ' + (body.length - shown) + ')');
    b.onclick = more;
    document.body.append(b);
  }
};
more();
`

/** Pagina con il CSV come tabella. */
export function csvDocument(text: string): string {
  // < nelle stringhe JSON è lo stesso carattere e non chiude lo <script>
  const data = JSON.stringify(parseCsv(text)).replace(/</g, '\\u003c')
  return `<!doctype html><html><head><meta charset="utf-8"><style>${CSV_STYLE}</style></head><body>
<script type="application/json" id="data">${data}</script>
<script>${CSV_TABLE}</script></body></html>`
}

/**
 * Pagina per un componente React. `js` è il codice già traspilato (import → require).
 * Se il codice non chiama createRoot, viene montato in #root l'export default o, in mancanza,
 * una funzione `App` definita nel file. Con `npm` (vedi npm.ts) i pacchetti si caricano prima del codice.
 */
export async function reactDocument(js: string, userLines: number, npm?: Record<string, string>): Promise<string> {
  const load = npm ? `__fishpad.npm = await __fishpadBridge.npm(${inlineSafe(JSON.stringify(npm))});` : ''
  const vendor = inlineSafe(await reactVendorScript())
  const head = (offset: number) => `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<style>body { margin: 16px; font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; }</style>
${dataScript(bridgeSource({ offset, lines: userLines, target: 'parent', frames: 'srcdoc' }))}
<script>${vendor}</script>
</head><body><div id="root"></div>
<script>
(async (exports) => {${load}
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
