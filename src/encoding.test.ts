import { describe, expect, it } from 'vitest'
import { decode, encode } from './encoding'

const bytes = (...b: number[]) => new Uint8Array(b)

describe('decode', () => {
  it('riconosce UTF-8 valido', () => {
    expect(decode(new TextEncoder().encode('perché è così'))).toEqual({ text: 'perché è così', encoding: 'utf-8' })
  })

  it('rimuove il BOM UTF-8', () => {
    expect(decode(bytes(0xef, 0xbb, 0xbf, 0x61))).toEqual({ text: 'a', encoding: 'utf-8' })
  })

  it('ripiega su Windows-1252 se il file non è UTF-8 valido', () => {
    // "città €" in Windows-1252
    expect(decode(bytes(0x63, 0x69, 0x74, 0x74, 0xe0, 0x20, 0x80))).toEqual({ text: 'città €', encoding: 'windows-1252' })
  })

  it('rispetta la codifica forzata', () => {
    expect(decode(new TextEncoder().encode('è'), 'windows-1252').text).toBe('Ã¨')
  })
})

describe('encode', () => {
  it('Windows-1252: andata e ritorno di tutti i 256 byte come TextDecoder', () => {
    const all = Uint8Array.from({ length: 256 }, (_, i) => i)
    const text = new TextDecoder('windows-1252').decode(all)
    expect(encode(text, 'windows-1252')).toEqual({ bytes: all, unmappable: 0 })
  })

  it('Windows-1252: conta e sostituisce i caratteri non rappresentabili', () => {
    const { bytes: out, unmappable } = encode('a→😀b', 'windows-1252')
    expect([...out]).toEqual([0x61, 0x3f, 0x3f, 0x62])
    expect(unmappable).toBe(2)
  })

  it('UTF-8 senza BOM', () => {
    expect([...encode('è', 'utf-8').bytes]).toEqual([0xc3, 0xa8])
  })
})
