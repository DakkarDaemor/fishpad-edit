/**
 * Limiti noti del dispositivo o del browser in uso, mostrati alla prima apertura
 * (solo quelli non ancora visti) e da Aiuto → Limiti su questo dispositivo.
 */

export interface Notice {
  id: string
  title: string
  text: string
}

export interface Env {
  /** File System Access API: si salva direttamente sui file del disco */
  fsAccess: boolean
  /** spazio dell'app (OPFS) disponibile al posto delle cartelle del disco */
  workspace: boolean
  iOS: boolean
  android: boolean
  /** PWA installata (o aggiunta alla schermata Home) */
  standalone: boolean
  touch: boolean
}

export const isIOS = () =>
  /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

export function detectEnv(fsAccess: boolean, workspace: boolean): Env {
  return {
    fsAccess,
    workspace,
    iOS: isIOS(),
    android: /Android/i.test(navigator.userAgent),
    standalone: matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true,
    touch: matchMedia('(pointer: coarse)').matches,
  }
}

export function deviceNotices(env: Env): Notice[] {
  const out: Notice[] = []
  if (!env.fsAccess && env.workspace) {
    out.push({
      id: 'workspace',
      title: "I file restano nell'app",
      text:
        "Questo browser non permette di salvare direttamente sui file del dispositivo. Salva li mette in «File dell'app» " +
        '(nella barra laterale), dove restano tra una sessione e l\'altra. Per modificare un file del dispositivo importalo; ' +
        "per usarlo altrove scegli Esporta / condividi. Cancellando i dati del sito o disinstallando l'app quei file si perdono.",
    })
  }
  if (!env.fsAccess && !env.workspace) {
    out.push({
      id: 'download-only',
      title: 'Si salva solo scaricando',
      text:
        'Questo browser (o la navigazione privata) non permette di salvare i file: si aprono con un upload e Salva li scarica. ' +
        'Su desktop, Chrome o Edge salvano direttamente sul file.',
    })
  }
  if (env.iOS && env.workspace && !env.standalone) {
    out.push({
      id: 'ios-home-screen',
      title: 'Aggiungi Fishpad alla schermata Home',
      text:
        "Safari può cancellare i dati dei siti non aperti da qualche settimana, compresi i File dell'app. Aggiunta alla " +
        'schermata Home (Condividi → Aggiungi alla schermata Home) l\'app conserva i dati e si apre a schermo intero. ' +
        'Esporta comunque i file importanti.',
    })
  }
  if (env.android && !env.standalone) {
    out.push({
      id: 'android-install',
      title: "Installa l'app",
      text:
        "Dal menu del browser, Installa app (o Aggiungi a schermata Home): Fishpad si apre a schermo intero, funziona offline " +
        'e compare in Condividi, così altre app possono aprirci file, testi e link.',
    })
  }
  if (env.touch) {
    out.push({
      id: 'touch',
      title: 'Senza tastiera fisica',
      text:
        'Le scorciatoie con Ctrl e Alt servono solo con una tastiera collegata. Tutti i comandi sono nel menu ☰ (o nella barra dei menu); ' +
        'tenendo premuto su una tab, un file o un preferito si apre il menu del tasto destro, e mentre scrivi sopra la tastiera ' +
        'compaiono Tab, Esc, le frecce e i simboli del codice.',
    })
  }
  return out
}
