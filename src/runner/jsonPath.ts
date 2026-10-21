import type { SyntaxNode } from '@lezer/common'

const VALUES = new Set(['Object', 'Array', 'String', 'Number', 'True', 'False', 'Null'])

/**
 * Riga (da 1) del nodo indicato da `path` nel testo JSON: la chiave per le proprietà, il valore per gli
 * elementi degli array. Usa il parser di CodeMirror (caricato al primo uso). undefined se il percorso non c'è più.
 */
export async function jsonPathLine(text: string, path: readonly (string | number)[]): Promise<number | undefined> {
  const { jsonLanguage } = await import('@codemirror/lang-json')
  const kids = (node: SyntaxNode) => {
    const out: SyntaxNode[] = []
    for (let c = node.firstChild; c; c = c.nextSibling) out.push(c)
    return out
  }
  let node: SyntaxNode | undefined = kids(jsonLanguage.parser.parse(text).topNode).find((c) => VALUES.has(c.name))
  let at = node?.from
  for (const key of path) {
    if (node?.name === 'Object' && typeof key === 'string') {
      const prop = node.getChildren('Property').find((p) => {
        const name = p.getChild('PropertyName')
        try {
          return !!name && JSON.parse(text.slice(name.from, name.to)) === key
        } catch {
          return false
        }
      })
      at = prop?.from
      node = prop && kids(prop).filter((c) => VALUES.has(c.name)).pop()
    } else if (node?.name === 'Array' && typeof key === 'number') {
      node = kids(node).filter((c) => VALUES.has(c.name))[key]
      at = node?.from
    } else return undefined
    if (at === undefined) return undefined
  }
  return at === undefined ? undefined : text.slice(0, at).split('\n').length
}
