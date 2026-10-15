import { describe, expect, it } from 'vitest'
import { mimeFor, resolvePath, rewriteHtml, type AssetResolver } from '../assets'

describe('resolvePath', () => {
  it('risolve percorsi relativi alla cartella della pagina', () => {
    expect(resolvePath(['site'], 'css/style.css')).toEqual(['site', 'css', 'style.css'])
    expect(resolvePath(['site'], './a.js?v=2#x')).toEqual(['site', 'a.js'])
    expect(resolvePath(['site', 'sub'], '../img/logo%20big.png')).toEqual(['site', 'img', 'logo big.png'])
  })

  it('i percorsi che iniziano con / partono dalla radice della cartella', () => {
    expect(resolvePath(['site', 'sub'], '/main.css')).toEqual(['main.css'])
  })

  it('ignora URL assoluti, ancore e percorsi fuori dalla cartella', () => {
    for (const ref of ['https://x.org/a.css', '//cdn/a.js', 'data:text/css,', '#top', '', '../fuori.css']) {
      expect(resolvePath([], ref)).toBeNull()
    }
  })
})

describe('rewriteHtml', () => {
  const files: Record<string, string> = {
    'style.css': 'body { background: url(img/bg.png) }',
    'img/bg.png': 'PNG',
    'app.js': 'console.log(1)',
  }
  const resolve: AssetResolver = async (path) => {
    const key = path.join('/')
    return key in files ? { text: files[key], mime: mimeFor(key) } : null
  }
  const decode = (url: string) => atob(url.replace(/^data:[^;]+;base64,/, ''))

  it('sostituisce CSS, script e immagini con URL data:, lasciando il resto com\'è', async () => {
    const html = '<link rel="stylesheet" href="style.css">\n<script src=app.js></script>\n<a href="style.css">x</a>\n<img src="manca.png">'
    const out = await rewriteHtml(html, [], resolve)
    const lines = out.split('\n')
    expect(lines).toHaveLength(4)
    const css = decode(/href="([^"]+)"/.exec(lines[0])![1])
    expect(decode(/url\("([^"]+)"\)/.exec(css)![1])).toBe('PNG')
    expect(decode(/src="([^"]+)"/.exec(lines[1])![1])).toBe('console.log(1)')
    expect(lines[2]).toBe('<a href="style.css">x</a>')
    expect(lines[3]).toBe('<img src="manca.png">')
  })

  it('non tocca i <link> che non sono fogli di stile o icone', async () => {
    const html = '<link rel="preconnect" href="style.css">'
    expect(await rewriteHtml(html, [], resolve)).toBe(html)
  })

  it('conserva gli a capo dentro i tag', async () => {
    const html = '<script\n  src="app.js"></script>'
    expect((await rewriteHtml(html, [], resolve)).split('\n')).toHaveLength(2)
  })
})
