import { describe, expect, it } from 'vitest'
import { filterItems, fuzzyScore, menuCommands, type PaletteItem } from './commands'

const noop = () => {}

describe('menuCommands', () => {
  it('appiattisce menu e sottomenu, saltando voci disabilitate, titoli e separatori', () => {
    const items = menuCommands([
      {
        label: 'File',
        items: [
          { label: 'Salva', shortcut: 'Ctrl+S', action: noop },
          { label: 'Salva tutto', disabled: true, action: noop },
          'separator',
          { heading: 'Titolo' },
          { label: 'Tema', submenu: [{ label: 'Scuro', checked: true, action: noop }] },
        ],
      },
    ])
    expect(items.map((i) => [i.label, i.detail, i.shortcut])).toEqual([
      ['Salva', 'File', 'Ctrl+S'],
      ['Scuro ✓', 'File › Tema', undefined],
    ])
  })
})

describe('fuzzyScore', () => {
  it('richiede le lettere in ordine', () => {
    expect(fuzzyScore('sv', 'Salva')).not.toBeNull()
    expect(fuzzyScore('vs', 'Salva')).toBeNull()
  })

  it('preferisce lettere consecutive e inizi di parola', () => {
    expect(fuzzyScore('sal', 'Salva')!).toBeGreaterThan(fuzzyScore('sal', 'Sostituisci al volo')!)
    expect(fuzzyScore('dd', 'Dividi a destra')!).toBeGreaterThan(fuzzyScore('dd', 'Addio')!)
  })
})

describe('filterItems', () => {
  const item = (label: string): PaletteItem => ({ id: label, label, run: noop })
  it('ordina per pertinenza e senza ricerca restituisce tutto', () => {
    const items = [item('Chiudi tab'), item('Formatta documento'), item('Riduci testo')]
    expect(filterItems(items, '')).toEqual(items)
    expect(filterItems(items, 'form').map((i) => i.label)).toEqual(['Formatta documento'])
  })
})
