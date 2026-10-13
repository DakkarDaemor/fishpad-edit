import { htmlDocument, reactDocument } from './preview'
import { IFRAME_HTML, SANDBOX_TAG, buildWorkerSource, type LogLevel, type SandboxMessage } from './sandbox'
import { CompileError, runTarget, toJavaScript, type RunTarget } from './transpile'

export interface ConsoleEntry {
  id: number
  level: LogLevel | 'system'
  text: string
  /** Documento eseguito e riga nel documento, per saltare al punto dell'errore */
  docId?: string
  line?: number
}

export interface PreviewInfo {
  docId: string
  name: string
}

export interface RunnerSnapshot {
  entries: readonly ConsoleEntry[]
  /** true finché il codice al livello principale non è terminato */
  running: boolean
  /** true finché la sandbox esiste: timer e promise pendenti possono ancora scrivere in console */
  alive: boolean
  /** Documento mostrato nel pannello Anteprima (resta anche dopo Stop, finché non si chiude il pannello) */
  preview: PreviewInfo | null
}

export interface RunRequest {
  code: string
  /** Linguaggio del documento: decide se eseguire in console o in anteprima, e la traspilazione */
  lang: string | null
  docId: string
  name: string
  /** Riga del documento da cui parte `code` (1 = inizio file; > 1 quando si esegue una selezione) */
  firstLine: number
  selection: boolean
}

const MAX_ENTRIES = 2000

/**
 * Esegue il codice nella sandbox e raccoglie l'output della console:
 * - console (JS/TS): worker in un iframe nascosto (vedi sandbox.ts);
 * - anteprima (HTML/JSX/TSX): iframe visibile, montato nel contenitore dato da setPreviewHost.
 * Una sola sandbox alla volta; ogni esecuzione parte da un iframe nuovo, senza stato residuo.
 * La UI React legge gli snapshot immutabili via `subscribe`/`getSnapshot`.
 */
export class Runner {
  private entries: ConsoleEntry[] = []
  private running = false
  private preview: PreviewInfo | null = null
  private frame: HTMLIFrameElement | null = null
  private previewHost: HTMLElement | null = null
  private current: (RunRequest & { target: RunTarget; startedAt: number }) | null = null
  /** Incrementato a ogni run/stop: scarta le preparazioni arrivate dopo un'esecuzione più recente */
  private generation = 0
  private nextId = 1
  private listeners = new Set<() => void>()
  private snapshot: RunnerSnapshot = { entries: [], running: false, alive: false, preview: null }

  constructor() {
    window.addEventListener('message', this.onMessage)
  }

  subscribe = (fn: () => void) => {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }
  getSnapshot = () => this.snapshot

  private emit() {
    this.snapshot = {
      entries: this.entries,
      running: this.running,
      alive: !!this.frame || this.running,
      preview: this.preview,
    }
    this.listeners.forEach((fn) => fn())
  }

  private push(entry: Omit<ConsoleEntry, 'id'>) {
    this.entries = [...this.entries, { id: this.nextId++, ...entry }].slice(-MAX_ENTRIES)
  }

  async run(req: RunRequest) {
    const target = runTarget(req.lang)
    if (!target) return
    this.teardown()
    const gen = ++this.generation
    this.running = true
    if (target === 'preview') {
      // l'anteprima si riesegue a ogni modifica: la console mostra solo l'ultima versione
      this.entries = []
      this.preview = { docId: req.docId, name: req.name }
    } else {
      this.push({ level: 'system', text: `▶ ${req.name}${req.selection ? ' (selezione)' : ''}` })
    }
    this.emit()

    let prepared: string
    try {
      prepared = await this.prepare(req, target)
    } catch (err) {
      if (gen !== this.generation) return
      const line = err instanceof CompileError ? err.line : undefined
      this.push({
        level: 'error',
        text: `${(err as Error).name}: ${(err as Error).message}`,
        docId: line ? req.docId : undefined,
        line: line ? line + req.firstLine - 1 : undefined,
      })
      this.finish(target === 'console' ? '✗ Errore di compilazione' : null)
      return
    }
    if (gen !== this.generation) return

    const frame = document.createElement('iframe')
    if (target === 'console') {
      this.current = { ...req, code: prepared, target, startedAt: performance.now() }
      frame.sandbox.add('allow-scripts')
      frame.hidden = true
      frame.srcdoc = IFRAME_HTML
      document.body.appendChild(frame)
    } else {
      this.current = { ...req, target, startedAt: performance.now() }
      frame.sandbox.add('allow-scripts', 'allow-modals', 'allow-forms', 'allow-popups')
      frame.className = 'preview-frame'
      frame.title = `Anteprima di ${req.name}`
      frame.srcdoc = prepared
      this.previewHost?.appendChild(frame)
    }
    this.frame = frame
    this.emit()
  }

  /** Console: il JavaScript da passare al worker. Anteprima: il documento dell'iframe. */
  private async prepare(req: RunRequest, target: RunTarget): Promise<string> {
    if (target === 'console') return toJavaScript(req.code, req.lang)
    if (req.lang === 'HTML') return htmlDocument(req.code)
    return reactDocument(await toJavaScript(req.code, req.lang), req.code.split('\n').length)
  }

  /** Contenitore del pannello Anteprima: l'iframe vi viene montato appena disponibile. */
  setPreviewHost(host: HTMLElement | null) {
    this.previewHost = host
    if (host && this.frame && this.current?.target === 'preview' && !this.frame.isConnected) host.appendChild(this.frame)
  }

  stop() {
    if (!this.frame && !this.running) return
    const wasConsole = this.current?.target !== 'preview'
    this.generation++
    this.teardown()
    this.finish(wasConsole ? '■ Interrotto' : null)
  }

  /** Chiude il pannello Anteprima, fermando la pagina se è quella in esecuzione. */
  closePreview() {
    if (this.current?.target === 'preview') this.stop()
    this.preview = null
    this.emit()
  }

  clear() {
    this.entries = []
    this.emit()
  }

  private teardown() {
    this.frame?.remove()
    this.frame = null
  }

  private finish(text: string | null) {
    this.running = false
    if (text) this.push({ level: 'system', text })
    this.emit()
  }

  private onMessage = (e: MessageEvent) => {
    const frame = this.frame
    const run = this.current
    if (!frame || !run || e.source !== frame.contentWindow) return
    const data = e.data as (SandboxMessage | { kind: 'ready' }) & { tag?: string }
    if (data?.tag !== SANDBOX_TAG) return

    switch (data.kind) {
      case 'ready': {
        if (run.target !== 'console') break
        const { source, offset } = buildWorkerSource(run.code)
        frame.contentWindow!.postMessage({ source, offset, lines: run.code.split('\n').length }, '*')
        break
      }
      case 'log':
        this.push({
          level: data.level,
          text: data.text,
          docId: data.line ? run.docId : undefined,
          line: data.line ? data.line + run.firstLine - 1 : undefined,
        })
        this.emit()
        break
      case 'key': {
        // scorciatoia premuta nell'anteprima: la gestisce il listener globale dell'editor
        const { code, key, ctrlKey, metaKey, shiftKey } = data
        window.dispatchEvent(new KeyboardEvent('keydown', { code, key, ctrlKey, metaKey, shiftKey, cancelable: true }))
        break
      }
      case 'clear':
        this.entries = []
        this.emit()
        break
      case 'done': {
        if (!this.running) break
        // La sandbox resta viva (alive): timer, eventi e promise pendenti possono ancora scrivere fino a Stop
        const ms = Math.round(performance.now() - run.startedAt)
        if (run.target === 'preview') this.finish(null)
        else this.finish(data.ok ? `✓ Completato in ${ms} ms` : `✗ Terminato con errore (${ms} ms)`)
        break
      }
    }
  }
}
