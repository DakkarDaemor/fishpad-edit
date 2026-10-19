import { Fragment, useRef, useState, type PointerEvent, type ReactNode } from 'react'
import { moveDivider, type Layout } from '../workbench/layout'
import { ContextMenu } from './Menu'

interface Props {
  layout: Layout
  renderPane: (paneId: string) => ReactNode
  onResize: (path: number[], sizes: number[]) => void
  /** affiancati ↔ impilati, dal tasto destro sul divisore: i due pannelli ai lati del divisore `index` */
  onRotate: (path: number[], index: number) => void
}

export function SplitView(props: Props) {
  return <Node node={props.layout} path={[]} renderPane={props.renderPane} onResize={props.onResize} onRotate={props.onRotate} />
}

interface NodeProps extends Omit<Props, 'layout'> {
  node: Layout
  path: number[]
}

function Node({ node, path, renderPane, onResize, onRotate }: NodeProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [menu, setMenu] = useState<{ x: number; y: number; index: number } | null>(null)
  if (node.kind === 'pane') return <>{renderPane(node.paneId)}</>

  const horizontal = node.dir === 'row'

  const startDrag = (index: number) => (e: PointerEvent<HTMLDivElement>) => {
    const container = containerRef.current
    if (!container) return
    e.preventDefault()
    const gutter = e.currentTarget
    gutter.setPointerCapture(e.pointerId)
    const rect = container.getBoundingClientRect()
    const total = horizontal ? rect.width : rect.height
    const start = horizontal ? e.clientX : e.clientY
    const startSizes = node.sizes
    const onMove = (ev: globalThis.PointerEvent) => {
      const delta = ((horizontal ? ev.clientX : ev.clientY) - start) / total
      onResize(path, moveDivider(startSizes, index, delta))
    }
    const onUp = () => {
      gutter.removeEventListener('pointermove', onMove)
      gutter.removeEventListener('pointerup', onUp)
      gutter.removeEventListener('pointercancel', onUp)
    }
    gutter.addEventListener('pointermove', onMove)
    gutter.addEventListener('pointerup', onUp)
    gutter.addEventListener('pointercancel', onUp)
  }

  return (
    <div ref={containerRef} className={`split split-${node.dir}`}>
      {node.children.map((child, i) => (
        <Fragment key={child.kind === 'pane' ? child.paneId : `split-${i}`}>
          {i > 0 && (
            <div
              className="gutter"
              role="separator"
              aria-orientation={horizontal ? 'vertical' : 'horizontal'}
              onPointerDown={startDrag(i - 1)}
              onDoubleClick={() => onResize(path, node.sizes.map(() => 1 / node.sizes.length))}
              onContextMenu={(e) => {
                e.preventDefault()
                setMenu({ x: e.clientX, y: e.clientY, index: i })
              }}
              title="Trascina per ridimensionare, doppio clic per uniformare, tasto destro per ruotare"
            />
          )}
          <div className="split-cell" style={{ flex: `${node.sizes[i]} 1 0` }}>
            <Node node={child} path={[...path, i]} renderPane={renderPane} onResize={onResize} onRotate={onRotate} />
          </div>
        </Fragment>
      ))}
      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          items={[
            { label: horizontal ? 'Ruota: impila questi due pannelli' : 'Ruota: affianca questi due pannelli', action: () => onRotate(path, menu.index) },
            { label: 'Dimensioni uguali', action: () => onResize(path, node.sizes.map(() => 1 / node.sizes.length)) },
          ]}
        />
      )}
    </div>
  )
}
