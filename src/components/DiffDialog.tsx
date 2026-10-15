import { useEffect, useRef, useState } from 'react'
import { EditorState, type Extension } from '@codemirror/state'
import { EditorView, drawSelection, highlightSpecialChars, keymap, lineNumbers } from '@codemirror/view'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { defaultHighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { MergeView, getChunks, getOriginalDoc, goToNextChunk, goToPreviousChunk, mergeViewSiblings, unifiedMergeView } from '@codemirror/merge'
import { fontExtension, themeExtension, wrapExtension, type EditorSettings } from '../editor/setup'
import { loadLanguage } from '../editor/languages'
import { canFormat, formatCode } from '../editor/format'
import type { Indent } from '../editor/indentation'
import { lineDelta } from '../editor/diffStats'
import type { DiffPrefs } from '../store'

export interface DiffSide {
  title: string
  text: string
}

interface Props {
  /** il testo con cui si confronta (a sinistra, o le righe tolte nella vista unificata): solo lettura */
  other: DiffSide
  /** la tab: modificabile, e le frecce vi portano i blocchi dell'altro testo */
  mine: DiffSide
  lang: string | null
  indent: Indent
  settings: EditorSettings
  /** scelte ricordate tra un confronto e l'altro (`unified` già risolto) */
  prefs: DiffPrefs & { unified: boolean }
  onPrefs: (patch: Partial<DiffPrefs>) => void
  /** riceve il testo finale della tab */
  onClose: (text: string) => void
}

const phrases = EditorState.phrases.of({
  '$ unchanged lines': '$ righe uguali',
  'Revert this chunk': 'Usa questo blocco',
  Accept: 'Tieni',
  Reject: 'Usa l’altro',
})

function extensions(settings: EditorSettings, lang: Extension, readOnly: boolean): Extension[] {
  return [
    phrases,
    lineNumbers(),
    highlightSpecialChars(),
    drawSelection(),
    history(),
    keymap.of([...defaultKeymap, ...historyKeymap]),
    syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
    themeExtension(settings.dark),
    fontExtension(settings.fontSize),
    wrapExtension(settings.wrap),
    lang,
    EditorState.readOnly.of(readOnly),
  ]
}

/**
 * Confronto tra la tab e un altro testo: affiancato (MergeView) o unificato, con le parti uguali piegate.
 * "Ignora formattazione" passa entrambi i testi da Prettier, così re-indentazioni e a capo non contano
 * (in quel caso è in sola lettura: il testo formattato non è quello della tab).
 */
/** Differenze, righe tolte e aggiunte; null finché il confronto non è pronto. */
function summarize(view: EditorView) {
  const found = getChunks(view.state)
  if (!found) return null
  const a = mergeViewSiblings(view)?.a.state.doc ?? getOriginalDoc(view.state)
  return { chunks: found.chunks.length, ...lineDelta(found.chunks, a, view.state.doc) }
}

export function DiffDialog({ other, mine, lang, indent, settings, prefs, onPrefs, onClose }: Props) {
  const hostRef = useRef<HTMLDivElement>(null)
  const mineText = useRef(mine.text)
  const editable = useRef<EditorView | null>(null)
  const { unified, collapse } = prefs
  // senza Prettier per questo linguaggio la scelta ricordata non vale
  const normalize = prefs.normalize && canFormat(lang)
  const [summary, setSummary] = useState<ReturnType<typeof summarize>>(null)
  const count = summary?.chunks ?? null
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    let destroy = () => {}
    void (async () => {
      const langExt = lang ? ((await loadLanguage(lang))?.support ?? []) : []
      let a = other.text
      let b = mineText.current
      if (normalize && lang) {
        try {
          ;[a, b] = await Promise.all([a, b].map(async (t) => (await formatCode(t, lang, 0, indent)).formatted))
        } catch (err) {
          if (cancelled) return
          setError(`Prettier non riesce a formattare: ${(err as Error).message.split('\n')[0]}`)
          onPrefs({ normalize: false })
          return
        }
      }
      if (cancelled || !hostRef.current) return
      setError(null)
      const collapseUnchanged = collapse ? { margin: 3, minSize: 4 } : undefined
      const track = EditorView.updateListener.of((u) => {
        if (u.docChanged && !normalize) mineText.current = u.state.doc.toString()
        setSummary(summarize(u.view))
      })
      if (unified) {
        const view = new EditorView({
          parent: hostRef.current,
          doc: b,
          extensions: [
            extensions(settings, langExt, normalize),
            unifiedMergeView({ original: a, collapseUnchanged, mergeControls: !normalize, allowInlineDiffs: true }),
            track,
          ],
        })
        editable.current = view
        destroy = () => view.destroy()
      } else {
        const mv = new MergeView({
          parent: hostRef.current,
          a: { doc: a, extensions: extensions(settings, langExt, true) },
          b: { doc: b, extensions: [extensions(settings, langExt, normalize), track] },
          revertControls: normalize ? undefined : 'a-to-b',
          collapseUnchanged,
        })
        editable.current = mv.b
        destroy = () => mv.destroy()
      }
      // le differenze sono calcolate in modo asincrono: si contano al frame successivo
      requestAnimationFrame(() => editable.current && setSummary(summarize(editable.current)))
    })()
    return () => {
      cancelled = true
      editable.current = null
      destroy()
    }
  }, [other.text, lang, indent, settings, unified, collapse, normalize, onPrefs])

  const step = (next: boolean) => {
    const v = editable.current
    if (!v) return
    ;(next ? goToNextChunk : goToPreviousChunk)(v)
    v.focus()
  }
  const close = () => onClose(mineText.current)
  const actions = useRef({ step, close })
  useEffect(() => {
    actions.current = { step, close }
  })

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') actions.current.close()
      else if (e.key === 'F7') actions.current.step(!e.shiftKey)
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="palette-backdrop diff-backdrop" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="diff" role="dialog" aria-label="Confronto">
        <header className="panel-bar">
          <span className="panel-title">Confronto</span>
          <span className="diff-count">{count === null ? '' : count === 0 ? 'nessuna differenza' : count === 1 ? '1 differenza' : `${count} differenze`}</span>
          {!!count && (
            <span className="diff-delta" title="Righe aggiunte / tolte nella tab rispetto all'altro testo">
              <ins>+{summary!.added}</ins> <del>−{summary!.removed}</del>
            </span>
          )}
          <button onClick={() => step(false)} disabled={!count} title="Differenza precedente (Shift+F7)" aria-label="Differenza precedente">↑</button>
          <button onClick={() => step(true)} disabled={!count} title="Differenza successiva (F7)" aria-label="Differenza successiva">↓</button>
          <div className="spacer" />
          <button className={unified ? undefined : 'current'} onClick={() => onPrefs({ unified: false })}>Affiancato</button>
          <button className={unified ? 'current' : undefined} onClick={() => onPrefs({ unified: true })}>Unificato</button>
          <label className="diff-option" title="Piega le righe uguali lasciando 3 righe di contesto">
            <input type="checkbox" checked={collapse} onChange={(e) => onPrefs({ collapse: e.target.checked })} /> Solo modifiche
          </label>
          <label
            className="diff-option"
            title={canFormat(lang) ? 'Formatta entrambi i testi con Prettier prima di confrontarli (sola lettura)' : `Prettier non supporta ${lang ?? 'il testo semplice'}`}
          >
            <input type="checkbox" checked={normalize} disabled={!canFormat(lang)} onChange={(e) => onPrefs({ normalize: e.target.checked })} /> Ignora formattazione
          </label>
          <button className="panel-close" onClick={close} title="Chiudi (Esc): le modifiche fatte a destra passano alla tab" autoFocus>
            ×
          </button>
        </header>
        <div className="diff-titles">
          {unified ? (
            <span>
              <del>{other.title}</del> → <ins>{mine.title}</ins>
            </span>
          ) : (
            <>
              <span>{other.title}</span>
              <span>{mine.title}</span>
            </>
          )}
        </div>
        {error && <div className="diff-error">{error}</div>}
        <div className="diff-body" ref={hostRef} />
      </div>
    </div>
  )
}
