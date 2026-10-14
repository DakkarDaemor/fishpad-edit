import { describe, expect, it, vi } from 'vitest'
import { compareEntries, invalidName, joinPath, parentPath, renameEntry } from './explorer'

const entry = (name: string, kind: 'file' | 'directory') => ({ name, handle: { kind } })

describe('compareEntries', () => {
  it('prima le cartelle, poi i file, in ordine naturale', () => {
    const list = [entry('b.txt', 'file'), entry('file10', 'file'), entry('src', 'directory'), entry('file2', 'file'), entry('Assets', 'directory')]
    expect(list.sort(compareEntries).map((e) => e.name)).toEqual(['Assets', 'src', 'b.txt', 'file2', 'file10'])
  })
})

describe('percorsi', () => {
  it('joinPath e parentPath', () => {
    expect(joinPath('', 'a')).toBe('a')
    expect(joinPath('a/b', 'c')).toBe('a/b/c')
    expect(parentPath('a/b/c')).toBe('a/b')
    expect(parentPath('a')).toBe('')
  })
})

describe('invalidName', () => {
  it('accetta i nomi normali', () => {
    expect(invalidName('index.html')).toBeNull()
    expect(invalidName('.env')).toBeNull()
    expect(invalidName('nuova cartella')).toBeNull()
  })

  it('rifiuta vuoti, . e .., caratteri vietati su Windows e punti o spazi finali', () => {
    for (const name of ['', '  ', '.', '..', 'a/b', 'a\\b', 'a:b', 'a?', 'a*', 'x.', 'x ']) expect(invalidName(name)).not.toBeNull()
  })
})

/** Cartella finta con i soli metodi usati da renameEntry. */
function fakeDir(names: string[]) {
  const dir = {
    names: new Set(names),
    async *keys() {
      yield* dir.names
    },
    getFileHandle: vi.fn(async (name: string) => {
      dir.names.add(name)
      return fakeFile(name, dir)
    }),
    removeEntry: vi.fn(async (name: string) => void dir.names.delete(name)),
  }
  return dir
}

function fakeFile(name: string, written: { names: Set<string> }, move?: (n: string) => Promise<void>) {
  return {
    kind: 'file' as const,
    name,
    move,
    getFile: async () => new Blob(['contenuto']),
    createWritable: async () => ({ write: vi.fn(), close: vi.fn() }),
    written,
  }
}

const asDir = (d: ReturnType<typeof fakeDir>) => d as unknown as FileSystemDirectoryHandle
const asFile = (f: ReturnType<typeof fakeFile>) => f as unknown as FileSystemFileHandle

describe('renameEntry', () => {
  it('usa move() se disponibile', async () => {
    const dir = fakeDir(['a.txt'])
    const move = vi.fn(async () => {})
    const file = fakeFile('a.txt', dir, move)
    expect(await renameEntry(asDir(dir), asFile(file), 'b.txt')).toBe(file)
    expect(move).toHaveBeenCalledWith('b.txt')
  })

  it('senza move() copia il file ed elimina l\'originale', async () => {
    const dir = fakeDir(['a.txt'])
    const renamed = await renameEntry(asDir(dir), asFile(fakeFile('a.txt', dir)), 'b.txt')
    expect(renamed.name).toBe('b.txt')
    expect([...dir.names]).toEqual(['b.txt'])
  })

  it('rifiuta un nome già usato (senza distinguere maiuscole)', async () => {
    const dir = fakeDir(['a.txt', 'B.txt'])
    await expect(renameEntry(asDir(dir), asFile(fakeFile('a.txt', dir)), 'b.txt')).rejects.toThrow('esiste già')
  })

  it('senza move() non cambia solo le maiuscole: la copia cancellerebbe il file su Windows', async () => {
    const dir = fakeDir(['a.txt'])
    await expect(renameEntry(asDir(dir), asFile(fakeFile('a.txt', dir)), 'A.txt')).rejects.toThrow()
    expect(dir.removeEntry).not.toHaveBeenCalled()
  })
})
