import { describe, expect, it } from 'vitest'
import { deviceNotices, type Env } from './notices'

const base: Env = { fsAccess: false, workspace: true, iOS: false, android: false, standalone: false, touch: false }
const ids = (env: Partial<Env>) => deviceNotices({ ...base, ...env }).map((n) => n.id)

describe('deviceNotices', () => {
  it('nessun avviso su desktop con Chrome o Edge', () => {
    expect(ids({ fsAccess: true, workspace: false })).toEqual([])
  })

  it('Safari su iPhone: file nell\'app, schermata Home, niente tastiera fisica', () => {
    expect(ids({ iOS: true, touch: true })).toEqual(['workspace', 'ios-home-screen', 'touch'])
  })

  it("iPhone con l'app sulla schermata Home: niente avviso sulla cancellazione dei dati", () => {
    expect(ids({ iOS: true, touch: true, standalone: true })).toEqual(['workspace', 'touch'])
  })

  it("Android: invito a installare l'app finché non è installata", () => {
    expect(ids({ android: true, touch: true })).toEqual(['workspace', 'android-install', 'touch'])
    expect(ids({ android: true, touch: true, standalone: true })).toEqual(['workspace', 'touch'])
  })

  it('senza spazio dell\'app (navigazione privata) si salva solo scaricando', () => {
    expect(ids({ workspace: false })).toEqual(['download-only'])
  })
})
