/** Albero dei pannelli: foglie = pannelli editor, nodi = divisioni in righe o colonne. */

/** `row` = pannelli affiancati (colonne), `column` = pannelli impilati (righe). */
export type SplitDir = 'row' | 'column'

export type Layout =
  | { kind: 'pane'; paneId: string }
  | { kind: 'split'; dir: SplitDir; children: Layout[]; /** frazioni, somma 1 */ sizes: number[] }

export const leaf = (paneId: string): Layout => ({ kind: 'pane', paneId })

export function paneIds(node: Layout): string[] {
  return node.kind === 'pane' ? [node.paneId] : node.children.flatMap(paneIds)
}

const isLeaf = (node: Layout, paneId: string) => node.kind === 'pane' && node.paneId === paneId

/** Divide `target` affiancandogli (row) o mettendogli sotto (column) il nuovo pannello. */
export function splitPane(node: Layout, target: string, newPaneId: string, dir: SplitDir): Layout {
  if (node.kind === 'pane') {
    if (node.paneId !== target) return node
    return { kind: 'split', dir, children: [node, leaf(newPaneId)], sizes: [0.5, 0.5] }
  }
  const idx = node.children.findIndex((c) => isLeaf(c, target))
  if (idx >= 0 && node.dir === dir) {
    // stessa direzione: il nuovo pannello diventa un fratello e si prende metà dello spazio del target
    const children = [...node.children]
    children.splice(idx + 1, 0, leaf(newPaneId))
    const sizes = [...node.sizes]
    sizes.splice(idx, 1, sizes[idx] / 2, sizes[idx] / 2)
    return { ...node, children, sizes }
  }
  return { ...node, children: node.children.map((c) => splitPane(c, target, newPaneId, dir)) }
}

/** Rimuove un pannello, compattando le divisioni rimaste con un solo figlio. `null` se non resta nulla. */
export function removePane(node: Layout, paneId: string): Layout | null {
  if (node.kind === 'pane') return node.paneId === paneId ? null : node
  const children: Layout[] = []
  const sizes: number[] = []
  node.children.forEach((child, i) => {
    const next = removePane(child, paneId)
    if (!next) return
    // un figlio con la stessa direzione si fonde nel padre
    if (next.kind === 'split' && next.dir === node.dir) {
      children.push(...next.children)
      sizes.push(...next.sizes.map((s) => s * node.sizes[i]))
    } else {
      children.push(next)
      sizes.push(node.sizes[i])
    }
  })
  if (children.length === 0) return null
  if (children.length === 1) return children[0]
  const total = sizes.reduce((a, b) => a + b, 0)
  return { ...node, children, sizes: sizes.map((s) => s / total) }
}

/** Fonde nel nodo i figli divisi nella sua stessa direzione (A | (B | C) diventa A | B | C), mantenendo le proporzioni. */
function absorb(node: Extract<Layout, { kind: 'split' }>): Layout {
  const children: Layout[] = []
  const sizes: number[] = []
  node.children.forEach((c, i) => {
    if (c.kind === 'split' && c.dir === node.dir) {
      children.push(...c.children)
      sizes.push(...c.sizes.map((s) => s * node.sizes[i]))
    } else {
      children.push(c)
      sizes.push(node.sizes[i])
    }
  })
  return { ...node, children, sizes }
}

const flip = (dir: SplitDir): SplitDir => (dir === 'row' ? 'column' : 'row')

/**
 * Ruota la coppia di figli `index - 1` e `index` della divisione al percorso indicato: da affiancati a impilati
 * o viceversa, lasciando dov'erano gli altri figli. Se la divisione ha solo quei due, ruota lei stessa.
 */
export function rotatePair(node: Layout, path: number[], index: number): Layout {
  if (node.kind === 'pane') return node
  if (path.length > 0) {
    const [head, ...rest] = path
    // ruotata, la divisione interna può avere la stessa direzione di questa: lì va fusa
    return absorb({ ...node, children: node.children.map((c, i) => (i === head ? rotatePair(c, rest, index) : c)) })
  }
  if (index < 1 || index >= node.children.length) return node
  if (node.children.length === 2) return absorb({ ...node, dir: flip(node.dir) })
  const [a, b] = node.sizes.slice(index - 1, index + 1)
  const pair = absorb({ kind: 'split', dir: flip(node.dir), children: node.children.slice(index - 1, index + 1), sizes: [a / (a + b), b / (a + b)] })
  const children = [...node.children]
  const sizes = [...node.sizes]
  children.splice(index - 1, 2, pair)
  sizes.splice(index - 1, 2, a + b)
  return { ...node, children, sizes }
}

/** Dove sta il pannello: percorso della divisione che lo contiene e sua posizione lì dentro. null se è l'unico. */
export function paneLocation(node: Layout, paneId: string, path: number[] = []): { path: number[]; index: number } | null {
  if (node.kind === 'pane') return null
  for (let i = 0; i < node.children.length; i++) {
    if (isLeaf(node.children[i], paneId)) return { path, index: i }
    const found = paneLocation(node.children[i], paneId, [...path, i])
    if (found) return found
  }
  return null
}

/** Sostituisce le dimensioni del nodo split indicato dal percorso (indici dei figli a partire dalla radice). */
export function setSizes(node: Layout, path: number[], sizes: number[]): Layout {
  if (node.kind === 'pane') return node
  if (path.length === 0) return { ...node, sizes }
  const [head, ...rest] = path
  return { ...node, children: node.children.map((c, i) => (i === head ? setSizes(c, rest, sizes) : c)) }
}

/** Sposta il confine tra i figli `index` e `index + 1` di `delta` (frazione), rispettando una dimensione minima. */
export function moveDivider(sizes: number[], index: number, delta: number, min = 0.08): number[] {
  const next = [...sizes]
  const pair = next[index] + next[index + 1]
  const a = Math.min(Math.max(next[index] + delta, min), pair - min)
  next[index] = a
  next[index + 1] = pair - a
  return next
}

/** Verifica che il layout contenga esattamente i pannelli indicati (per sessioni salvate). */
export function isValidLayout(node: unknown, expected: Set<string>): node is Layout {
  const seen = new Set<string>()
  const check = (n: unknown): boolean => {
    if (!n || typeof n !== 'object') return false
    const l = n as Layout
    if (l.kind === 'pane') {
      if (typeof l.paneId !== 'string' || seen.has(l.paneId)) return false
      seen.add(l.paneId)
      return true
    }
    return (
      l.kind === 'split' &&
      (l.dir === 'row' || l.dir === 'column') &&
      Array.isArray(l.children) &&
      Array.isArray(l.sizes) &&
      l.children.length === l.sizes.length &&
      l.children.length >= 2 &&
      l.children.every(check)
    )
  }
  return check(node) && seen.size === expected.size && [...expected].every((id) => seen.has(id))
}
