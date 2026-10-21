/// <reference types="node" />
import vm from 'node:vm'
import { version } from 'react'
import { describe, expect, it } from 'vitest'
import { REACT_MODULES, reactVendorScript } from '../react-vendor'

// Il registro punta a file interni dei pacchetti React (cjs/*.production.js): se un aggiornamento
// li rinomina o aggiunge dipendenze, l'anteprima si romperebbe solo a runtime.
describe('reactVendorScript', () => {
  async function load() {
    const ctx = vm.createContext({ setTimeout, clearTimeout })
    vm.runInContext(await reactVendorScript(), ctx)
    return (src: string): unknown => vm.runInContext(src, ctx)
  }

  it('carica tutti i moduli importabili, con la stessa versione di React dell\'app', async () => {
    const run = await load()
    for (const name of REACT_MODULES) expect(run(`typeof require(${JSON.stringify(name)})`)).toBe('object')
    expect(run(`require('react').version`)).toBe(version)
    expect(run(`typeof require('react/jsx-runtime').jsx`)).toBe('function')
    expect(run(`require('react') === require('react')`)).toBe(true)
  })

  it('segna quando il codice utente chiama createRoot', async () => {
    const run = await load()
    expect(run('__fishpad.rendered')).toBe(false)
    run(`try { require('react-dom/client').createRoot(null) } catch {}`)
    expect(run('__fishpad.rendered')).toBe(true)
  })

  it('i pacchetti caricati da esm.sh hanno la precedenza, anche per React', async () => {
    const run = await load()
    expect(() => run(`require('lodash')`)).toThrow(/"lodash" non disponibile/)
    run(`__fishpad.npm = { lodash: { __esModule: true, id: 'lodash' }, react: { __esModule: true, id: 'esm-react' } }`)
    expect(run(`require('lodash').id + ' ' + require('react').id`)).toBe('lodash esm-react')
  })
})
