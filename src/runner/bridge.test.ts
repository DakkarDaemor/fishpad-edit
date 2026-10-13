/// <reference types="node" />
import vm from 'node:vm'
import { describe, expect, it } from 'vitest'
import { bridgeSource, type BridgeOptions } from './sandbox'

interface Message {
  kind: string
  level?: string
  text?: string
  line?: number
}

/**
 * Esegue il bridge in un contesto vm che simula il worker. Valori ed errori vanno creati
 * dentro il contesto (con run), altrimenti gli `instanceof` del bridge non li riconoscono.
 */
function sandbox(opts: Partial<BridgeOptions> = {}, globals: object = {}) {
  const messages: Message[] = []
  const listeners: Record<string, (e: unknown) => void> = {}
  const ctx = vm.createContext({
    postMessage: (m: Message) => messages.push(m),
    self: { addEventListener: (type: string, fn: (e: unknown) => void) => (listeners[type] = fn) },
    console: {},
    performance: { now: () => 0 },
    ...globals,
  })
  vm.runInContext(bridgeSource({ offset: 0, lines: 1000, target: 'worker', frames: 'blob', ...opts }), ctx)
  const run = (src: string): unknown => vm.runInContext(src, ctx)
  const logs = () => messages.filter((m) => m.kind === 'log')
  return { run, logs, listeners }
}

describe('formattazione dei valori', () => {
  it('stringhe senza virgolette al primo livello, tra virgolette dentro gli oggetti', () => {
    const s = sandbox()
    s.run(`console.log('testo', 42, { s: 'x', a: [1, null, undefined], n: -0 })`)
    expect(s.logs()[0].text).toBe('testo 42 { s: "x", a: [ 1, null, undefined ], n: -0 }')
  })

  it('riferimenti circolari, Map e Set', () => {
    const s = sandbox()
    s.run(`const o = { nome: 'o' }; o.io = o; console.log(o, new Map([['k', new Set([1, 2])]]))`)
    expect(s.logs()[0].text).toBe('{ nome: "o", io: [Circolare] } Map(1) { "k" => Set(2) { 1, 2 } }')
  })

  it('va a capo con indentazione quando non sta su una riga', () => {
    const s = sandbox()
    s.run(`console.log({ primo: 'a'.repeat(30), secondo: 'b'.repeat(30), terzo: { x: 1 } })`)
    expect(s.logs()[0].text).toBe(`{\n  primo: "${'a'.repeat(30)}",\n  secondo: "${'b'.repeat(30)}",\n  terzo: { x: 1 }\n}`)
  })

  it('tronca le collezioni lunghe e gli oggetti troppo annidati', () => {
    const s = sandbox()
    s.run(`console.log(Array.from({ length: 150 }, (_, i) => i).length, { a: { b: { c: { d: { e: 1 } } } } })`)
    s.run(`console.log(Array.from({ length: 150 }, (_, i) => i))`)
    expect(s.logs()[0].text).toBe('150 { a: { b: { c: { d: [Object] } } } }')
    expect(s.logs()[1].text).toMatch(/98,\n {2}99,\n {2}… altri 50\n\]$/)
  })
})

describe('errori', () => {
  // Codice utente alle righe 11-15 dello script: tutto il resto è bridge o wrapper
  const opts = { offset: 10, lines: 5 }

  it('riscrive lo stack di Chrome con le righe del file e scarta i frame interni', () => {
    const s = sandbox(opts)
    s.run(`
      const e = new TypeError('boom')
      e.stack = [
        'TypeError: boom',
        '    at interna (blob:null/abc-123:13:5)',
        '    at blob:null/abc-123:15:1',
        '    at wrapper (blob:null/abc-123:3:1)',
        '    at async blob:null/abc-123:16:1',
      ].join('\\n')
      self.__fishpadBridge.report(e)
    `)
    expect(s.logs()[0]).toMatchObject({
      level: 'error',
      text: 'Uncaught TypeError: boom\n    at interna (riga 3)\n    at riga 5',
      line: 3,
    })
  })

  it('riconosce anche il formato di Firefox', () => {
    const s = sandbox(opts)
    s.run(`
      const e = new Error('ff')
      e.stack = 'interna@blob:null/abc-123:12:7\\n@blob:null/abc-123:14:1\\n'
      self.__fishpadBridge.report(e)
    `)
    expect(s.logs()[0]).toMatchObject({ text: 'Uncaught Error: ff\n    at interna (riga 2)\n    at riga 4', line: 2 })
  })

  it("nell'anteprima considera solo i frame del srcdoc, non quelli di React o del bridge", () => {
    const s = sandbox({ ...opts, frames: 'srcdoc' })
    s.run(`
      const e = new Error('render')
      e.stack = 'Error: render\\n    at App (about:srcdoc:12:9)\\n    at renderWithHooks (blob:null/x:12:1)\\n    at about:srcdoc:2:1'
      self.__fishpadBridge.report(e)
    `)
    expect(s.logs()[0]).toMatchObject({ text: 'Uncaught Error: render\n    at App (riga 2)', line: 2 })
  })

  it('senza stack utile usa la riga dell\'evento error; i valori non Error sono mostrati come in Chrome', () => {
    const s = sandbox(opts)
    s.listeners.error({ preventDefault() {}, error: 'qualcosa', message: 'Uncaught qualcosa', lineno: 14 })
    s.listeners.error({ preventDefault() {}, error: undefined, message: 'Script error.', lineno: 0 })
    expect(s.logs()[0]).toMatchObject({ text: 'Uncaught qualcosa', line: 4 })
    expect(s.logs()[1]).toMatchObject({ text: 'Uncaught Script error.', line: undefined })
  })
})

describe('console', () => {
  it('group indenta anche le righe successive di un valore su più righe', () => {
    const s = sandbox()
    s.run(`
      console.group('gruppo')
      console.log({ primo: 'a'.repeat(40), secondo: 'b'.repeat(40) })
      console.groupEnd()
      console.log('fuori')
    `)
    const [title, inner, out] = s.logs().map((m) => m.text!)
    expect(title).toBe('gruppo')
    expect(inner.split('\n').every((l) => l.startsWith('  '))).toBe(true)
    expect(out).toBe('fuori')
  })

  it('count, assert e livelli', () => {
    const s = sandbox()
    s.run(`console.count(); console.count(); console.count('x'); console.assert(true, 'no'); console.assert(false, 'sì'); console.warn('w')`)
    expect(s.logs().map((m) => [m.level, m.text])).toEqual([
      ['log', 'default: 1'],
      ['log', 'default: 2'],
      ['log', 'x: 1'],
      ['error', 'Assertion failed: sì'],
      ['warn', 'w'],
    ])
  })
})

describe("scorciatoie nell'anteprima", () => {
  const keydown = (init: object) => {
    let prevented = false
    return { event: { ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, key: '', ...init, preventDefault: () => (prevented = true) }, prevented: () => prevented }
  }

  it("gira Ctrl+S all'editor e blocca il salvataggio pagina del browser", () => {
    const sent: Message[] = []
    const s = sandbox({ target: 'parent' }, { document: {}, parent: { postMessage: (m: Message) => sent.push(m) } })
    const k = keydown({ ctrlKey: true, shiftKey: true, code: 'KeyS', key: 'S' })
    s.listeners.keydown(k.event)
    expect(k.prevented()).toBe(true)
    expect(sent.at(-1)).toMatchObject({ kind: 'key', code: 'KeyS', ctrlKey: true, shiftKey: true })
  })

  it('lascia passare i tasti normali', () => {
    const s = sandbox({ target: 'parent' }, { document: {}, parent: { postMessage: () => {} } })
    const k = keydown({ code: 'KeyS', key: 's' })
    s.listeners.keydown(k.event)
    expect(k.prevented()).toBe(false)
  })

  it('nel worker non registra listener da tastiera', () => {
    expect(sandbox().listeners.keydown).toBeUndefined()
  })
})
