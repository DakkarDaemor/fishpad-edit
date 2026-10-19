import type { CSSProperties } from 'react'
import { tabColorVar, type TabColor } from '../workbench/tabColors'

interface Props {
  name: string
  color?: TabColor
  /** assente se la tab non è più aperta: il nome resta, ma non porta da nessuna parte */
  onShow?: () => void
}

/** Nome del file nell'intestazione di Anteprima e Console: porta alla sua tab, con lo stesso colore. */
export function DocLink({ name, color, onShow }: Props) {
  const style = color ? ({ '--tab-color': tabColorVar(color) } as CSSProperties) : undefined
  if (!onShow) {
    return <span className="doc-link closed" title={`${name} (tab chiusa)`} style={style}>{name}</span>
  }
  return (
    <button className={`doc-link${color ? ' colored' : ''}`} style={style} onClick={onShow} title={`Vai alla tab di ${name}`}>
      {name}
    </button>
  )
}
