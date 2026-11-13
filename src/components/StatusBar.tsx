import { indentLabel, type Indent } from '../editor/indentation'
import { ENCODING_LABELS, type Encoding } from '../encoding'
import { hasFsAccess } from '../fs'
import { hasWorkspace } from '../workspace'
import type { CursorStatus, Doc } from '../workbench/Workbench'
import { MenuButton, type MenuItem } from './Menu'
import { COMPACT_QUERY, useMediaQuery } from './touch'

interface Props {
  doc: Doc | undefined
  status: CursorStatus
  /** apre la scelta del linguaggio */
  onLanguage: () => void
  onIndent: (indent: Indent) => void
  onRedetectIndent: () => void
  onConvertIndent: (to: Indent) => void
  onToggleEol: () => void
  /** codifica con cui salvare il file */
  onEncoding: (encoding: Encoding) => void
  /** rilegge il file da disco con la codifica indicata */
  onReopen: (encoding: Encoding) => void
  /** è in corso la richiesta della tab URL attiva */
  fetching: boolean
  /** rifà la richiesta della tab URL attiva */
  onRefreshUrl: () => void
}

const ENCODINGS = Object.keys(ENCODING_LABELS) as Encoding[]

export function StatusBar(props: Props) {
  const { doc, status, onLanguage, onIndent, onRedetectIndent, onConvertIndent, onToggleEol, onEncoding, onReopen, fetching, onRefreshUrl } = props
  // sul telefono la barra sta su una riga: "12:5" invece di "Ln 12, Col 5", "Sp: 2" invece di "Spazi: 2"
  const compact = useMediaQuery(COMPACT_QUERY)
  const indentItems = (d: Doc): MenuItem[] => [
    { heading: 'Usa per questo file' },
    ...[false, true].flatMap((tabs) =>
      [2, 4, 8].map((size) => ({
        label: indentLabel({ tabs, size }),
        checked: d.indent.tabs === tabs && d.indent.size === size,
        action: () => onIndent({ tabs, size }),
      })),
    ),
    { label: 'Rileva dal contenuto', action: onRedetectIndent },
    'separator',
    { heading: 'Converti il file in' },
    { label: `Tab (larghezza ${d.indent.size})`, action: () => onConvertIndent({ tabs: true, size: d.indent.size }) },
    ...[2, 4].map((size) => ({ label: `Spazi: ${size}`, action: () => onConvertIndent({ tabs: false, size }) })),
  ]

  const encodingItems = (d: Doc): MenuItem[] => [
    { heading: 'Salva con codifica' },
    ...ENCODINGS.map((e) => ({ label: ENCODING_LABELS[e], checked: d.encoding === e, action: () => onEncoding(e) })),
    ...(d.handle
      ? [
          'separator' as const,
          { heading: 'Riapri con codifica' },
          ...ENCODINGS.map((e) => ({ label: ENCODING_LABELS[e], action: () => onReopen(e) })),
        ]
      : []),
  ]

  return (
    <footer className="statusbar">
      <span title={compact ? 'Riga:colonna' : undefined}>
        {compact ? `${status.line}:${status.col}` : `Ln ${status.line}, Col ${status.col}`}
        {status.sel > 0 && (compact ? ` (${status.sel} sel.)` : ` (${status.sel} selezionati)`)}
      </span>
      <span className="status-lines">{status.lines} righe</span>
      {doc?.request && (
        <button
          className={!fetching && (doc.response?.status ?? 0) >= 400 ? 'warn' : undefined}
          onClick={onRefreshUrl}
          disabled={fetching}
          title={`GET ${doc.request.url}\nClic (o F5) per ripetere la richiesta`}
        >
          {fetching
            ? 'GET in corso…'
            : doc.response
              ? // con HTTP/2 lo statusText è vuoto
                `GET ${[doc.response.status, doc.response.statusText].filter(Boolean).join(' ')} · ${doc.response.ms} ms ↻`
              : 'GET ↻'}
        </button>
      )}
      {/* con lo spazio dell'app i file si salvano lì; senza, solo con un download */}
      {!hasFsAccess && !hasWorkspace && (
        <span className="warn" title="Questo browser non permette di salvare i file: si scaricano. Su desktop usa Chrome o Edge">Modalità ridotta</span>
      )}
      <div className="spacer" />
      {doc && (
        <>
          <button className="status-lang" onClick={onLanguage} title="Linguaggio: clic per cambiarlo">
            {doc.lang ?? 'Testo semplice'}
          </button>
          <MenuButton
            up
            label={`${compact ? indentLabel(doc.indent).replace('Spazi', 'Sp') : indentLabel(doc.indent)}${doc.indentAuto ? '' : ' •'}`}
            title={doc.indentAuto ? 'Indentazione (rilevata dal contenuto)' : 'Indentazione (scelta a mano)'}
            items={indentItems(doc)}
          />
          <button onClick={onToggleEol} title="Fine riga (clic per cambiare)">{doc.eol}</button>
          <MenuButton up label={ENCODING_LABELS[doc.encoding]} title="Codifica del file" items={encodingItems(doc)} />
        </>
      )}
    </footer>
  )
}
