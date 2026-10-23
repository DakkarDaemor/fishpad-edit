import { beforeEach, describe, expect, it, vi } from 'vitest'

const db = new Map<string, unknown>()
vi.mock('idb-keyval', () => ({
  get: async (k: string) => db.get(k),
  set: async (k: string, v: unknown) => void db.set(k, v),
  del: async (k: string) => void db.delete(k),
}))

const { addRecentFolder, loadFolders, saveFolders } = await import('../store')

const dir = (name: string) => ({ name, kind: 'directory', isSameEntry: async (o: { name: string }) => o.name === name }) as unknown as FileSystemDirectoryHandle

describe('cartelle', () => {
  beforeEach(() => db.clear())

  it('riprende la cartella singola di prima della 14.0 e poi salva la lista', async () => {
    const old = dir('vecchia')
    db.set('previewFolder', old)
    expect(await loadFolders()).toEqual([old])
    await saveFolders([old, dir('nuova')])
    expect(db.has('previewFolder')).toBe(false)
    expect((await loadFolders()).map((d) => d.name)).toEqual(['vecchia', 'nuova'])
  })

  it('le recenti mettono in cima la cartella riaperta, senza doppioni', async () => {
    await addRecentFolder(dir('a'))
    await addRecentFolder(dir('b'))
    expect((await addRecentFolder(dir('a'))).map((d) => d.name)).toEqual(['a', 'b'])
  })
})
