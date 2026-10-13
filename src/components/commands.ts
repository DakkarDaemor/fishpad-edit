import type { MenuDef, MenuItem } from './Menu'

export interface PaletteItem {
  id: string
  label: string
  /** testo secondario a destra (percorso nel menu, pannello…) */
  detail?: string
  shortcut?: string
  run: () => void
}

/** Le voci dei menu come comandi della palette (le disabilitate restano fuori). */
export function menuCommands(menus: MenuDef[]): PaletteItem[] {
  const out: PaletteItem[] = []
  const walk = (items: MenuItem[], path: string[]) => {
    for (const item of items) {
      if (item === 'separator' || 'heading' in item || item.disabled) continue
      if (item.submenu) walk(item.submenu, [...path, item.label])
      else if (item.action) {
        const label = item.checked === undefined ? item.label : `${item.label}${item.checked ? ' ✓' : ''}`
        out.push({ id: [...path, item.label].join(' › '), label, detail: path.join(' › '), shortcut: item.shortcut, run: item.action })
      }
    }
  }
  for (const m of menus) walk(m.items, [m.label])
  return out
}

/**
 * Punteggio della ricerca approssimata: le lettere di `query` devono comparire in ordine in `text`.
 * Valgono di più le lettere consecutive e quelle a inizio parola. null se non corrisponde.
 */
export function fuzzyScore(query: string, text: string): number | null {
  const q = query.toLowerCase().replace(/\s+/g, '')
  if (!q) return 0
  const t = text.toLowerCase()
  const wordStart = (i: number) => i === 0 || /[\s›./_-]/.test(t[i - 1])
  let score = 0
  let prev = -1
  for (const ch of q) {
    // preferenze: subito dopo la lettera precedente, poi a inizio parola, poi la prima occorrenza
    let at = t[prev + 1] === ch ? prev + 1 : -1
    if (at < 0) {
      for (let i = t.indexOf(ch, prev + 1); i >= 0; i = t.indexOf(ch, i + 1)) {
        if (wordStart(i)) {
          at = i
          break
        }
      }
    }
    if (at < 0) at = t.indexOf(ch, prev + 1)
    if (at < 0) return null
    score += 1
    if (at === prev + 1 && prev >= 0) score += 3
    if (wordStart(at)) score += 2
    prev = at
  }
  // a parità di lettere, meglio i testi corti
  return score - t.length * 0.01
}

/** Voci che corrispondono alla ricerca, le migliori per prime (a parità, nell'ordine originale). */
export function filterItems(items: PaletteItem[], query: string): PaletteItem[] {
  if (!query.trim()) return items
  return items
    .map((item, i) => ({ item, i, score: fuzzyScore(query, `${item.label} ${item.detail ?? ''}`) }))
    .filter((x): x is { item: PaletteItem; i: number; score: number } => x.score !== null)
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .map((x) => x.item)
}
