import { describe, expect, it } from 'vitest'
import {
  base64Decode,
  base64Encode,
  cleanForSave,
  dateToTimestamp,
  jsonMinify,
  jsonSortKeys,
  reverseLines,
  sortLines,
  timestampToDate,
  uniqueLines,
  urlDecode,
  urlEncode,
} from '../transforms'

describe('righe', () => {
  it('ordina con i numeri in ordine naturale e tiene l’a capo finale', () => {
    expect(sortLines('b10\na2\nb2\n')).toBe('a2\nb2\nb10\n')
    expect(sortLines('a\nc\nb', true)).toBe('c\nb\na')
  })
  it('toglie i duplicati tenendo la prima', () => {
    expect(uniqueLines('x\ny\nx\nz\ny')).toBe('x\ny\nz')
  })
  it('inverte', () => {
    expect(reverseLines('1\n2\n3\n')).toBe('3\n2\n1\n')
  })
})

describe('codifiche', () => {
  it('Base64 in UTF-8, andata e ritorno', () => {
    expect(base64Encode('città €')).toBe('Y2l0dMOgIOKCrA==')
    expect(base64Decode('Y2l0dMOgIOKCrA')).toBe('città €')
    expect(() => base64Decode('%%%')).toThrow()
  })
  it('URL', () => {
    expect(urlEncode('a b&c=è')).toBe('a%20b%26c%3D%C3%A8')
    expect(urlDecode('a+b%26c')).toBe('a b&c')
  })
})

describe('JSON', () => {
  it('ordina le chiavi a ogni livello senza arrotondare i numeri grandi', () => {
    expect(jsonSortKeys('{"b":1,"a":{"d":[{"z":1,"y":2}],"c":12345678901234567890}}', '  ')).toBe(
      '{\n  "a": {\n    "c": 12345678901234567890,\n    "d": [\n      {\n        "y": 2,\n        "z": 1\n      }\n    ]\n  },\n  "b": 1\n}',
    )
  })
  it('minifica senza toccare le stringhe', () => {
    expect(jsonMinify('{\n  "a b": "x  y",\n  "n": 12345678901234567890\n}')).toBe('{"a b":"x  y","n":12345678901234567890}')
    expect(() => jsonMinify('{a:1}')).toThrow()
  })
})

describe('pulizia al salvataggio', () => {
  const both = { trimTrailing: true, finalNewline: true }
  it('toglie gli spazi finali e aggiunge l’a capo', () => {
    expect(cleanForSave('a  \n\tb\t', both, 'JavaScript')).toBe('a\n\tb\n')
  })
  it('nel Markdown lascia gli spazi finali (vanno a capo)', () => {
    expect(cleanForSave('riga  \naltra', both, 'Markdown')).toBe('riga  \naltra\n')
  })
  it('non tocca un file vuoto né le opzioni spente', () => {
    expect(cleanForSave('', both, null)).toBe('')
    expect(cleanForSave('a  ', { trimTrailing: false, finalNewline: false }, null)).toBe('a  ')
  })
})

describe('timestamp Unix', () => {
  const s = Date.UTC(2026, 10, 17, 13, 5, 9) / 1000
  it('data con fuso → secondi, con i millisecondi → millisecondi, testo intorno intatto', () => {
    expect(dateToTimestamp('at 2026-11-17T13:05:09Z ok')).toBe(`at ${s} ok`)
    expect(dateToTimestamp('2026-11-17 14:05:09+0100')).toBe(String(s))
    expect(dateToTimestamp('2026-11-17T13:05:09.250Z')).toBe(String(s * 1000 + 250))
  })
  it('senza ora né fuso è la mezzanotte locale', () => {
    expect(dateToTimestamp('2026-11-17')).toBe(String(new Date(2026, 10, 17).getTime() / 1000))
  })
  it('secondi e millisecondi → data locale ISO, e ritorno', () => {
    const d = timestampToDate(`${s}, ${s * 1000 + 250}`)
    expect(d).toMatch(/^2026-11-17T\d{2}:05:09[+-]\d{2}:\d{2}, 2026-11-17T\d{2}:05:09\.250[+-]\d{2}:\d{2}$/)
    expect(dateToTimestamp(d)).toBe(`${s}, ${s * 1000 + 250}`)
  })
  it('senza niente da convertire è un errore', () => {
    expect(() => timestampToDate('12345')).toThrow()
    expect(() => dateToTimestamp('ieri')).toThrow()
  })
})
