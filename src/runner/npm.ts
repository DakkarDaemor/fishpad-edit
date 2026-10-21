import { version as REACT_VERSION } from 'react'
import { REACT_MODULES } from './react-vendor'
import { CompileError } from './transpile'

/**
 * Pacchetti npm nel playground: gli import diventano require (sucrase), i moduli richiesti vengono
 * caricati da esm.sh con import() prima del codice (vedi `npm` nel bridge di sandbox.ts) e
 * require li restituisce già pronti.
 */

const ESM = 'https://esm.sh/'

/** Moduli chiesti dal codice traspilato, nell'ordine in cui compaiono. */
export function requiredModules(js: string): string[] {
  return [...new Set(Array.from(js.matchAll(/\brequire\((['"])([^'"]+)\1\)/g), (m) => m[2]))]
}

/**
 * URL esm.sh di ogni modulo. Con `react`, React arriva da esm.sh nella versione dell'app e gli altri
 * pacchetti dipendono da quella (deps): una sola copia di React, altrimenti gli hook si rompono.
 */
export function npmUrls(names: readonly string[], react = false): Record<string, string> {
  const deps = `react@${REACT_VERSION},react-dom@${REACT_VERSION}`
  return Object.fromEntries(
    names.map((name) => {
      if (/^https?:\/\//.test(name)) return [name, name]
      if (/^[./]/.test(name)) throw new CompileError(`Import "${name}": si possono importare solo pacchetti npm (da esm.sh) o URL completi`)
      if (!react) return [name, ESM + name]
      const own = /^(react|react-dom)(\/.*)?$/.exec(name)
      if (own) return [name, `${ESM}${own[1]}@${REACT_VERSION}${own[2] ?? ''}${own[1] === 'react-dom' ? `?deps=react@${REACT_VERSION}` : ''}`]
      return [name, `${ESM}${name}${name.includes('?') ? '&' : '?'}deps=${deps}`]
    }),
  )
}

/**
 * Anteprima React: con soli moduli React bastano le build dell'app (offline), quindi undefined;
 * con altri pacchetti tutto arriva da esm.sh, compresi i moduli React usati per montare il componente.
 */
export function previewModules(js: string): Record<string, string> | undefined {
  const names = requiredModules(js)
  if (names.every((n) => REACT_MODULES.includes(n))) return undefined
  return npmUrls([...new Set([...names, 'react', 'react/jsx-runtime', 'react-dom/client'])], true)
}
