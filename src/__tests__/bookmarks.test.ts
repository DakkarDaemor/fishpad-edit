import { describe, expect, it } from 'vitest'
import { findDuplicate, matches, moveItem } from '../bookmarks'
import type { Bookmark } from '../store'

describe('moveItem', () => {
  const list = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
  const ids = (l: Array<{ id: string }>) => l.map((x) => x.id).join('')

  it('sposta su e giù restando dentro la lista', () => {
    expect(ids(moveItem(list, 'b', -1))).toBe('bac')
    expect(ids(moveItem(list, 'b', 1))).toBe('acb')
    expect(moveItem(list, 'a', -1)).toBe(list)
    expect(moveItem(list, 'c', 5)).toBe(list)
    expect(moveItem(list, 'x', 1)).toBe(list)
  })
})

describe('findDuplicate', () => {
  const url = (id: string, u: string, headers?: Array<[string, string]>): Bookmark => ({ id, name: id, kind: 'url', request: { url: u, headers } })

  it('riconosce lo stesso URL, anche con nome o header diversi', async () => {
    const list = [url('a', 'https://x.test/a'), url('b', 'https://x.test/b')]
    expect((await findDuplicate(list, url('n', 'https://x.test/b', [['A', '1']])))?.id).toBe('b')
    expect(await findDuplicate(list, url('n', 'https://x.test/c'))).toBeUndefined()
  })
})

describe('matches', () => {
  const api: Bookmark = { id: 'a', name: 'Utenti', kind: 'url', request: { url: 'https://api.test/users' } }
  const file = { id: 'f', name: 'Note', kind: 'file', handle: { name: 'appunti.md' } } as Bookmark

  it('cerca in nome, URL e nome del file, senza distinguere maiuscole', () => {
    expect(matches(api, 'utenti')).toBe(true)
    expect(matches(api, ' API.TEST ')).toBe(true)
    expect(matches(file, 'appunti')).toBe(true)
    expect(matches(file, 'users')).toBe(false)
    expect(matches(file, '')).toBe(true)
  })
})
