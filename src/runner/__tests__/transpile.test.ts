import { describe, expect, it } from 'vitest'
import { CompileError, runTarget, toJavaScript } from '../transpile'

describe('toJavaScript', () => {
  it('lascia invariato il JavaScript', async () => {
    const code = 'const a = 1\nconsole.log(a)'
    expect(await toJavaScript(code, 'JavaScript')).toBe(code)
  })

  it('toglie i tipi conservando i numeri di riga', async () => {
    const code = 'interface P { x: number }\nconst p: P = { x: 1 }\nconst v = await Promise.resolve<number>(2)\nnull!.boom'
    const js = await toJavaScript(code, 'TypeScript')
    const lines = js.split('\n')
    expect(lines).toHaveLength(4)
    expect(lines[1]).toBe('const p = { x: 1 }')
    expect(lines[2]).toBe('const v = await Promise.resolve(2)')
    expect(lines[3]).toContain('.boom')
  })

  it('supporta enum', async () => {
    const js = await toJavaScript('enum C { R, G }\nconsole.log(C.G)', 'TypeScript')
    expect(new Function(js.replace('console.log', 'return '))()).toBe(1)
  })

  it('riporta gli errori di sintassi con la riga', async () => {
    const err = await toJavaScript('const a = 1\nconst b: = 2', 'TypeScript').catch((e: unknown) => e)
    expect(err).toBeInstanceOf(CompileError)
    expect((err as CompileError).line).toBe(2)
    expect((err as CompileError).message).not.toMatch(/\(\d+:\d+\)$/)
  })
})

describe('JSX/TSX', () => {
  it('porta JSX e import a require conservando le righe', async () => {
    const code = [
      'import { useState } from "react"',
      '',
      'type P = { n: number }',
      'export default function App({ n }: P) {',
      '  const [c] = useState(n)',
      '  return <b>{c}</b>',
      '}',
    ].join('\n')
    const js = await toJavaScript(code, 'TSX')
    const lines = js.split('\n')
    expect(lines).toHaveLength(7)
    expect(lines[0]).toContain('require("react/jsx-runtime")')
    expect(lines[0]).toContain("require('react')")
    expect(lines[5]).toContain('_jsxruntime.jsx')
    expect(js).toContain('exports.default = App')
  })
})

describe('runTarget', () => {
  it('JS e TS in console, HTML/JSX/TSX in anteprima', () => {
    expect(runTarget('JavaScript')).toBe('console')
    expect(runTarget('TypeScript')).toBe('console')
    expect(runTarget('JSX')).toBe('preview')
    expect(runTarget('TSX')).toBe('preview')
    expect(runTarget('HTML')).toBe('preview')
    expect(runTarget('JSON')).toBe('preview')
    expect(runTarget('Python')).toBeNull()
    expect(runTarget(null)).toBeNull()
  })
})
