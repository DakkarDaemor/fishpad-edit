import { afterEach, describe, expect, it, vi } from 'vitest'
import { checkTypes, completionDetail, completions, quickInfo } from '../typecheck'

// esm.sh finto: "fake-pkg" ha i tipi (con un import relativo), "untyped-pkg" no
const REMOTE: Record<string, string> = {
  'https://esm.sh/fake-pkg@1.0.0/index.d.ts': 'export * from "./sum.d.ts";',
  'https://esm.sh/fake-pkg@1.0.0/sum.d.ts': 'export declare function sum(a: number, b: number): number;',
}

function fakeFetch(url: string, init?: RequestInit) {
  if (init?.method === 'HEAD') {
    const headers = new Headers(url === 'https://esm.sh/fake-pkg' ? { 'X-TypeScript-Types': '/fake-pkg@1.0.0/index.d.ts' } : {})
    return Promise.resolve(new Response(null, { headers }))
  }
  return Promise.resolve(REMOTE[url] ? new Response(REMOTE[url]) : new Response('', { status: 404 }))
}

afterEach(() => vi.unstubAllGlobals())

const messages = async (code: string, lang: 'TypeScript' | 'TSX' = 'TypeScript') => (await checkTypes(code, lang)).map((d) => d.message)

describe('checkTypes', () => {
  it('errori di tipo con la posizione; await al livello principale e DOM disponibili', async () => {
    const code = "const n: number = 'x'\nconst r = await fetch('/')\ndocument.title = String(r.status)"
    const diags = await checkTypes(code, 'TypeScript')
    expect(diags).toHaveLength(1)
    expect(diags[0]).toMatchObject({ severity: 'error', from: code.indexOf('n:'), to: code.indexOf('n:') + 1 })
    expect(diags[0].message).toMatch(/string.*number/)
  }, 30_000)

  it('TSX con i tipi di React', async () => {
    const ok = "import { useState } from 'react'\nexport default function App() {\n  const [n, setN] = useState(0)\n  return <button onClick={() => setN(n + 1)}>{n}</button>\n}"
    expect(await messages(ok, 'TSX')).toEqual([])
    expect((await messages("import { useState } from 'react'\nconst [s] = useState('a')\nconst x: number = s\nexport default () => <div foo={1} />", 'TSX')).length).toBe(2)
  }, 30_000)

  it('pacchetti npm: tipi da esm.sh seguendo gli import, any se mancano', async () => {
    vi.stubGlobal('fetch', vi.fn(fakeFetch))
    expect(await messages("import { sum } from 'fake-pkg'\nimport x from 'untyped-pkg'\nconst s: string = sum(1, 2)\nx.qualsiasi()")).toEqual([
      "Type 'number' is not assignable to type 'string'.",
    ])
  }, 30_000)
})

describe('suggerimenti e tipo sotto il mouse', () => {
  it('membri dopo il punto, con il tipo per l’icona', async () => {
    const code = 'const s = "ciao"\ns.'
    const items = (await completions(code, 'TypeScript', code.length))!
    expect(items.find((i) => i.label === 'toUpperCase')).toMatchObject({ type: 'method' })
    expect(items.find((i) => i.label === 'length')).toMatchObject({ type: 'property' })
    expect(items.some((i) => i.label === 'document')).toBe(false)
    // i metodi deprecati (anchor, big…) vanno in fondo
    expect(items.find((i) => i.label === 'anchor')!.boost).toBeLessThan(items.find((i) => i.label === 'toUpperCase')!.boost)
  })

  it('firma del suggerimento e tipo del nome sotto il mouse', async () => {
    const code = '/** Somma due numeri */\nfunction sum(a: number, b: number) { return a + b }\nconst tot = sum(1, 2)\ntot'
    expect((await completionDetail(code, 'TypeScript', code.length, 'sum'))!.detail).toBe('function sum(a: number, b: number): number')
    const q = (await quickInfo(code, 'TypeScript', code.indexOf('sum(1')))!
    expect(q).toMatchObject({ detail: 'function sum(a: number, b: number): number', doc: 'Somma due numeri', from: code.indexOf('sum(1') })
    expect((await quickInfo(code, 'TypeScript', code.length - 1))!.detail).toBe('const tot: number')
    expect(await quickInfo(code, 'TypeScript', code.indexOf('{'))).toBeNull()
  })
})
