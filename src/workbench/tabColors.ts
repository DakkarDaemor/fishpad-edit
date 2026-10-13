/** Colori assegnabili a un documento: valgono per tutte le sue tab, in ogni pannello. */
export const TAB_COLORS = [
  { id: 'red', label: 'Rosso' },
  { id: 'orange', label: 'Arancione' },
  { id: 'yellow', label: 'Giallo' },
  { id: 'green', label: 'Verde' },
  { id: 'blue', label: 'Blu' },
  { id: 'purple', label: 'Viola' },
] as const

export type TabColor = (typeof TAB_COLORS)[number]['id']

/** Variabile CSS del colore (definita per tema chiaro e scuro in styles.css). */
export const tabColorVar = (c: TabColor) => `var(--tab-${c})`
