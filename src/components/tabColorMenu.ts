import { TAB_COLORS, tabColorVar, type TabColor } from '../workbench/tabColors'
import type { MenuItem } from './Menu'

/** Voci per scegliere il colore di un documento (menu Visualizza e menu contestuale della tab). */
export function tabColorItems(current: TabColor | undefined, pick: (c: TabColor | null) => void): MenuItem[] {
  return [
    ...TAB_COLORS.map((c) => ({ label: c.label, swatch: tabColorVar(c.id), checked: current === c.id, action: () => pick(c.id) })),
    'separator',
    { label: 'Nessun colore', checked: !current, action: () => pick(null) },
  ]
}
