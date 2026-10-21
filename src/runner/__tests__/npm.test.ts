/// <reference types="node" />
import vm from 'node:vm'
import { version } from 'react'
import { describe, expect, it } from 'vitest'
import { npmUrls, previewModules, requiredModules } from '../npm'
import { buildWorkerSource } from '../sandbox'
import { CompileError, toJavaScript } from '../transpile'

describe('moduli npm', () => {
  it('in console import/export passano a require solo se il file li usa', async () => {
    expect(await toJavaScript('x = 1', 'JavaScript')).toBe('x = 1')
    const js = await toJavaScript("import _ from 'lodash'\nimport { add } from 'date-fns/add'\nconsole.log(_)", 'JavaScript')
    expect(js.split('\n')).toHaveLength(3)
    expect(requiredModules(js)).toEqual(['lodash', 'date-fns/add'])
  })

  it('URL esm.sh; gli import relativi sono un errore', () => {
    expect(npmUrls(['lodash@4/fp', 'https://cdn.example/x.js'])).toEqual({
      'lodash@4/fp': 'https://esm.sh/lodash@4/fp',
      'https://cdn.example/x.js': 'https://cdn.example/x.js',
    })
    expect(() => npmUrls(['./util'])).toThrow(CompileError)
  })

  it('anteprima React: build dell’app senza pacchetti npm, tutto da esm.sh con la stessa React se ci sono', async () => {
    expect(previewModules(await toJavaScript("import { useState } from 'react'\nexport default () => <b />", 'JSX'))).toBeUndefined()
    const urls = previewModules(await toJavaScript("import { motion } from 'motion/react'\nexport default () => <motion.div />", 'JSX'))!
    expect(urls['motion/react']).toBe(`https://esm.sh/motion/react?deps=react@${version},react-dom@${version}`)
    expect(urls['react/jsx-runtime']).toBe(`https://esm.sh/react@${version}/jsx-runtime`)
    expect(urls['react-dom/client']).toBe(`https://esm.sh/react-dom@${version}/client?deps=react@${version}`)
  })

  it('il worker carica i moduli prima del codice: default, named ed export funzionano', async () => {
    const js = await toJavaScript("import dflt, { b } from 'm'\nexport const c = 3\nconsole.log(dflt, b, c)", 'JavaScript')
    const mod = 'data:text/javascript,' + encodeURIComponent('export default "a"; export const b = 2')
    const { source } = buildWorkerSource(js, { m: mod })
    const messages: { kind: string; text?: string; ok?: boolean }[] = []
    const done = new Promise<void>((resolve) => {
      const ctx = vm.createContext({
        postMessage: (m: (typeof messages)[number]) => (messages.push(m), m.kind === 'done' && resolve()),
        addEventListener: () => {},
        console: {},
        performance: { now: () => 0 },
      })
      ctx.self = ctx // nel worker self è il global
      new vm.Script(source, { importModuleDynamically: vm.constants.USE_MAIN_CONTEXT_DEFAULT_LOADER }).runInContext(ctx)
    })
    await done
    expect(messages.filter((m) => m.kind === 'log').map((m) => m.text)).toEqual(['a 2 3'])
    expect(messages.at(-1)).toMatchObject({ kind: 'done', ok: true })
  })
})
