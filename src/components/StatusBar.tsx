import { indentLabel, type Indent } from '../editor/indentation'
import { languageNames } from '../editor/languages'
import { hasFsAccess } from '../fs'
import type { CursorStatus, Doc } from '../workbench/Workbench'
import { MenuButton, type MenuItem } from './Menu'

interface Props {
  doc: Doc | undefined
  status: CursorStatus
  onLanguage: (lang: string | null) => void
  onIndent: (indent: Indent) => void
  onRedetectIndent: () => void
  onConvertIndent: (to: Indent) => void
  onToggleEol: () => void
}

export function StatusBar({ doc, status, onLanguage, onIndent, onRedetectIndent, onConvertIndent, onToggleEol }: Props) {
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

  return (
    <footer className="statusbar">
      <span>
        Ln {status.line}, Col {status.col}
        {status.sel > 0 && ` (${status.sel} selezionati)`}
      </span>
      <span>{status.lines} righe</span>
      {!hasFsAccess && <span className="warn" title="Usa Chrome o Edge per salvare direttamente su disco">Modalità ridotta</span>}
      <div className="spacer" />
      {doc && (
        <>
          <select value={doc.lang ?? ''} onChange={(e) => onLanguage(e.target.value || null)} title="Linguaggio">
            <option value="">Testo semplice</option>
            {languageNames.map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
          <MenuButton
            up
            label={`${indentLabel(doc.indent)}${doc.indentAuto ? '' : ' •'}`}
            title={doc.indentAuto ? 'Indentazione (rilevata dal contenuto)' : 'Indentazione (scelta a mano)'}
            items={indentItems(doc)}
          />
          <button onClick={onToggleEol} title="Fine riga (clic per cambiare)">{doc.eol}</button>
          <span>UTF-8</span>
        </>
      )}
    </footer>
  )
}
