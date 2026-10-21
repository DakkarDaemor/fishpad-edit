/**
 * React per l'anteprima JSX/TSX: le build CommonJS di produzione della stessa versione usata
 * dall'app, servite dall'app stessa, quindi funziona anche offline.
 * L'iframe ha origine opaca e non può caricare script dall'app: il codice viene inserito inline,
 * con un piccolo `require` (sucrase traduce gli import del codice utente in chiamate a require).
 */

// I file cjs non sono tra gli `exports` dei pacchetti: si importano per percorso.
const SOURCES: Record<string, () => Promise<{ default: string }>> = {
  react: () => import('../../node_modules/react/cjs/react.production.js?raw'),
  'react/jsx-runtime': () => import('../../node_modules/react/cjs/react-jsx-runtime.production.js?raw'),
  'react-dom': () => import('../../node_modules/react-dom/cjs/react-dom.production.js?raw'),
  'react-dom/client': () => import('../../node_modules/react-dom/cjs/react-dom-client.production.js?raw'),
  scheduler: () => import('../../node_modules/scheduler/cjs/scheduler.production.js?raw'),
}

/** Moduli importabili dal codice utente (scheduler serve solo a react-dom). */
export const REACT_MODULES = ['react', 'react/jsx-runtime', 'react-dom', 'react-dom/client']

let cached: Promise<string> | undefined

/**
 * Script che definisce `require` con i moduli React. Espone `__fishpad.rendered`, che diventa
 * true quando il codice utente chiama createRoot: in quel caso il componente di default non
 * viene montato automaticamente.
 */
export function reactVendorScript(): Promise<string> {
  cached ??= (async () => {
    const entries = await Promise.all(
      Object.entries(SOURCES).map(async ([name, load]) => {
        const src = (await load()).default
        return `${JSON.stringify(name)}: function (module, exports, require) {\n${src}\n}`
      }),
    )
    return `var process = { env: { NODE_ENV: 'production' } };
var __fishpad = { rendered: false, npm: null };
var require = (function () {
  var defs = {
${entries.join(',\n')}
  };
  var cache = {};
  return function require(name) {
    if (cache[name]) return cache[name].exports;
    // pacchetti caricati da esm.sh (vedi npm.ts): quando ci sono, anche React arriva da lì
    var npm = __fishpad.npm && __fishpad.npm[name];
    if (!npm && !defs[name]) throw new Error('Modulo "' + name + '" non disponibile nell\\'anteprima');
    var module = (cache[name] = { exports: npm || {} });
    if (!npm) defs[name](module, module.exports, require);
    if (name === 'react-dom/client') {
      var createRoot = module.exports.createRoot;
      module.exports.createRoot = function () { __fishpad.rendered = true; return createRoot.apply(this, arguments); };
    }
    return module.exports;
  };
})();`
  })()
  cached.catch(() => (cached = undefined))
  return cached
}
