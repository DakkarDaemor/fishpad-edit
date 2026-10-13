/**
 * Sorgenti della sandbox in cui gira il codice dell'utente.
 *
 * Il codice gira in un Web Worker creato dentro un iframe `sandbox="allow-scripts"`:
 * - l'iframe ha origine opaca, quindi niente accesso a IndexedDB, sessione e file dell'editor;
 * - il worker ha un thread suo, quindi un loop infinito non blocca l'interfaccia;
 * - rimuovere l'iframe termina anche il worker (Stop).
 */

export type LogLevel = 'log' | 'info' | 'warn' | 'error'

/** Messaggi che arrivano dalla sandbox. `line` è relativa al codice eseguito (1 = prima riga). */
export type SandboxMessage =
  | { kind: 'log'; level: LogLevel; text: string; line?: number }
  | { kind: 'clear' }
  | { kind: 'done'; ok: boolean }
  | { kind: 'key'; code: string; key: string; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean }

export const SANDBOX_TAG = 'fishpad-run'

// Bridge della console: gira prima del codice utente, sostituisce console e riporta gli errori.
// Usa OFFSET (righe prima del codice), LINES (righe del codice), FRAME_URL (regex degli URL dello
// script utente negli stack) e send(), definiti sulla prima riga da bridgeSource().
const BRIDGE = String.raw`
const FRAME_RE = new RegExp('^(.*?)(?:' + FRAME_URL + '):(\\d+):(\\d+)\\)?$');
const userLine = (n) => (n > OFFSET && n <= OFFSET + LINES ? n - OFFSET : undefined);

function key(k) {
  return /^[A-Za-z_$][\w$]*$/.test(k) ? k : JSON.stringify(k);
}

function inspect(v, depth = 0, seen = new Set()) {
  if (typeof v === 'string') return depth ? JSON.stringify(v) : v;
  if (typeof v === 'function') {
    const cls = /^class[\s{]/.test(Function.prototype.toString.call(v));
    return '[' + (cls ? 'class' : 'Function') + ' ' + (v.name || '(anonima)') + ']';
  }
  if (typeof v === 'bigint') return v + 'n';
  if (typeof v === 'symbol') return v.toString();
  if (v === null || typeof v !== 'object') return Object.is(v, -0) ? '-0' : String(v);
  if (seen.has(v)) return '[Circolare]';
  if (v instanceof Error) return depth ? '[' + v.name + ': ' + v.message + ']' : describeError(v).text;
  if (v instanceof Date) return isNaN(v) ? 'Invalid Date' : v.toISOString();
  if (v instanceof RegExp) return String(v);
  if (v instanceof Promise) return 'Promise {…}';
  if (v instanceof WeakMap || v instanceof WeakSet) return v.constructor.name + ' {…}';
  const ctor = Object.getPrototypeOf(v)?.constructor?.name;
  if (depth > 3) return Array.isArray(v) ? '[Array]' : '[' + (ctor || 'Object') + ']';

  seen.add(v);
  try {
    const sub = (x) => inspect(x, depth + 1, seen);
    const MAX = 100;
    let prefix = '', open = '{', close = '}', items = [], total = 0;
    if (Array.isArray(v) || ArrayBuffer.isView(v)) {
      if (!Array.isArray(v)) prefix = ctor + '(' + v.length + ') ';
      open = '['; close = ']'; total = v.length;
      for (let i = 0; i < Math.min(total, MAX); i++) items.push(i in v ? sub(v[i]) : '<vuoto>');
    } else if (v instanceof Map) {
      prefix = 'Map(' + v.size + ') '; total = v.size;
      for (const [k, x] of v) { if (items.length >= MAX) break; items.push(sub(k) + ' => ' + sub(x)); }
    } else if (v instanceof Set) {
      prefix = 'Set(' + v.size + ') '; total = v.size;
      for (const x of v) { if (items.length >= MAX) break; items.push(sub(x)); }
    } else {
      if (ctor && ctor !== 'Object') prefix = ctor + ' ';
      if (!ctor) prefix = '[Object: null prototype] ';
      const keys = Object.keys(v);
      total = keys.length;
      for (const k of keys.slice(0, MAX)) {
        let x;
        try { x = sub(v[k]); } catch (e) { x = '[errore: ' + (e && e.message) + ']'; }
        items.push(key(k) + ': ' + x);
      }
    }
    if (total > items.length) items.push('… altri ' + (total - items.length));
    if (!items.length) return prefix + open + close;
    const inline = prefix + open + ' ' + items.join(', ') + ' ' + close;
    if (inline.length <= 72 && !inline.includes('\n')) return inline;
    return prefix + open + '\n' + items.map((s) => '  ' + s.replace(/\n/g, '\n  ')).join(',\n') + '\n' + close;
  } finally {
    seen.delete(v);
  }
}

// Riscrive lo stack: tiene solo i frame del codice utente, con la riga nel file.
function describeError(err) {
  let line;
  const frames = [];
  for (const raw of String(err.stack || '').split('\n')) {
    const m = FRAME_RE.exec(raw.trim());
    if (!m) continue;
    const n = userLine(+m[2]);
    if (n === undefined) continue;
    line ??= n;
    const fn = m[1].replace(/^at\s+/, '').replace(/[\s(@]+$/, '');
    // solo la riga: dopo la traspilazione (JSX, TS) le colonne non corrispondono più al file
    const pos = 'riga ' + n;
    frames.push('    at ' + (fn ? fn + ' (' + pos + ')' : pos));
  }
  const head = err.name + (err.message ? ': ' + err.message : '');
  return { text: [head, ...frames].join('\n'), line };
}

function report(err, lineno) {
  if (err instanceof Error) {
    const d = describeError(err);
    send({ kind: 'log', level: 'error', text: 'Uncaught ' + d.text, line: d.line ?? userLine(lineno) });
  } else {
    send({ kind: 'log', level: 'error', text: 'Uncaught ' + inspect(err), line: userLine(lineno) });
  }
}

let indent = '';
const counts = new Map(), timers = new Map();
const out = (level, args) =>
  send({ kind: 'log', level, text: indent + args.map((a) => inspect(a)).join(' ').replace(/\n/g, '\n' + indent) });

Object.assign(console, {
  log: (...a) => out('log', a),
  debug: (...a) => out('log', a),
  info: (...a) => out('info', a),
  warn: (...a) => out('warn', a),
  error: (...a) => out('error', a),
  dir: (v) => out('log', [v]),
  table: (v) => out('log', [v]),
  trace: (...a) => out('log', ['Trace:', ...a]),
  assert: (cond, ...a) => { if (!cond) out('error', ['Assertion failed' + (a.length ? ':' : ''), ...a]); },
  clear: () => send({ kind: 'clear' }),
  group: (...a) => { if (a.length) out('log', a); indent += '  '; },
  groupCollapsed: (...a) => { if (a.length) out('log', a); indent += '  '; },
  groupEnd: () => { indent = indent.slice(2); },
  count: (l = 'default') => { counts.set(l, (counts.get(l) || 0) + 1); out('log', [l + ': ' + counts.get(l)]); },
  countReset: (l = 'default') => counts.delete(l),
  time: (l = 'default') => timers.set(l, performance.now()),
  timeLog: (l = 'default', ...a) => timers.has(l) && out('log', [l + ': ' + (performance.now() - timers.get(l)).toFixed(2) + ' ms', ...a]),
  timeEnd: (l = 'default') => { console.timeLog(l); timers.delete(l); },
});

self.addEventListener('error', (e) => { e.preventDefault(); report(e.error ?? e.message, e.lineno); });
self.addEventListener('unhandledrejection', (e) => { e.preventDefault(); report(e.reason); });
// Nell'anteprima il focus può stare nella pagina: le scorciatoie dell'editor (Ctrl+S, …) vanno
// girate all'editor, altrimenti il browser salva la pagina, apre una finestra o chiude la tab.
if (typeof document !== 'undefined') {
  const SHORTCUTS = ['KeyS', 'KeyO', 'KeyN', 'KeyW', 'Enter'];
  self.addEventListener('keydown', (e) => {
    if (!(e.ctrlKey || e.metaKey) || e.altKey || !SHORTCUTS.includes(e.code)) return;
    e.preventDefault();
    send({ kind: 'key', code: e.code, key: e.key, ctrlKey: e.ctrlKey, metaKey: e.metaKey, shiftKey: e.shiftKey });
  }, true);
}
self.__fishpadBridge = { send, report };
})();
`

export interface BridgeOptions {
  /** Righe dello script prima del codice utente */
  offset: number
  /** Righe del codice utente */
  lines: number
  /** worker: postMessage del worker; parent: messaggi alla finestra dell'editor */
  target: 'worker' | 'parent'
  /** Dove sta il codice utente negli stack: in uno script blob/data (worker) o inline nel srcdoc (anteprima) */
  frames: 'blob' | 'srcdoc'
}

const FRAME_URLS = { blob: String.raw`(?:blob|data):[^\s()]*?`, srcdoc: 'about:srcdoc' }

/**
 * Sorgente del bridge, chiuso in una IIFE per non collidere con i nomi del codice utente: espone solo
 * `__fishpadBridge` ({ send, report }). La configurazione sta sulla prima riga, così il numero di righe
 * non dipende dai valori.
 */
export function bridgeSource({ offset, lines, target, frames }: BridgeOptions): string {
  const post = target === 'worker' ? 'postMessage(m)' : "parent.postMessage(m, '*')"
  return (
    `(() => { const OFFSET = ${offset}, LINES = ${lines}, FRAME_URL = ${JSON.stringify(FRAME_URLS[frames])}, ` +
    `send = (msg) => { const m = { tag: '${SANDBOX_TAG}', ...msg }; ${post}; };` +
    BRIDGE
  )
}

/** Numero di righe prima del codice utente, dato il testo che lo precede. */
export const linesBefore = (head: string) => head.split('\n').length - 1

/**
 * Script completo del worker: bridge + codice utente in una funzione async
 * (così `await` funziona al livello principale e si sa quando l'esecuzione è finita).
 */
export function buildWorkerSource(code: string): { source: string; offset: number } {
  const head = (offset: number) =>
    bridgeSource({ offset, lines: code.split('\n').length, target: 'worker', frames: 'blob' }) + '\n;(async () => {\n'
  const offset = linesBefore(head(0))
  const source =
    head(offset) +
    code +
    `\n})().then(() => __fishpadBridge.send({ kind: 'done', ok: true }), (e) => {\n` +
    `  __fishpadBridge.report(e);\n  __fishpadBridge.send({ kind: 'done', ok: false });\n});\n`
  return { source, offset }
}

/**
 * Documento dell'iframe: riceve lo script dal genitore, avvia il worker e inoltra i suoi messaggi.
 * Gli errori di sintassi impediscono al worker di partire e arrivano solo qui, come evento `error`.
 */
export const IFRAME_HTML = `<!doctype html><meta charset="utf-8"><script>
addEventListener('message', (e) => {
  if (e.source !== parent) return;
  const { source, offset, lines } = e.data;
  let worker;
  try {
    worker = new Worker(URL.createObjectURL(new Blob([source], { type: 'text/javascript' })));
  } catch {
    worker = new Worker('data:text/javascript;charset=utf-8,' + encodeURIComponent(source));
  }
  worker.onmessage = (m) => parent.postMessage(m.data, '*');
  worker.onerror = (err) => {
    err.preventDefault();
    const n = err.lineno - offset;
    const tag = '${SANDBOX_TAG}';
    const text = /^Uncaught /.test(err.message || '') ? err.message : 'Uncaught ' + (err.message || 'errore sconosciuto');
    parent.postMessage({ tag, kind: 'log', level: 'error', text, line: n > 0 ? Math.min(n, lines) : undefined }, '*');
    parent.postMessage({ tag, kind: 'done', ok: false }, '*');
  };
});
parent.postMessage({ tag: '${SANDBOX_TAG}', kind: 'ready' }, '*');
</script>`
