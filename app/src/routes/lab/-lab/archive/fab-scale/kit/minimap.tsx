import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'

export type MiniCabinet = { index: number; label: string; hue: number; count: number; selected: number; matches: number | null; x0: number; x1: number }
/** The camera as the minimap shows it. The frame loop writes it and calls `draw` after the camera moves. */
export type MiniView = { x: number; z: number; az: number; level: 'overview' | 'cabinet' | 'drawer'; cabinet: number; draw?: () => void }

type Box = { x: number; y: number; w: number; h: number }

const W = 240
const MAX_H = 112
const PAD = 6
const WEDGE = 15

export function Minimap({
  cabinets,
  wall,
  line,
  view,
  active,
  onPick,
  className = '',
}: {
  cabinets: readonly MiniCabinet[]
  wall: { z0: number; z1: number }
  line: { x0: number; x1: number; z0: number; z1: number }
  /** Read each animation frame; never a React re-render per frame. */
  view: { current: MiniView }
  active: number
  onPick: (cabinet: number) => void
  className?: string
}) {
  const [hover, setHover] = useState<number | null>(null)
  const camera = useRef<SVGGElement>(null)
  const frame = useRef<SVGGElement>(null)
  const buttons = useRef<(SVGGElement | null)[]>([])

  const minX = Math.min(line.x0, ...cabinets.map((c) => c.x0))
  const maxX = Math.max(line.x1, ...cabinets.map((c) => c.x1))
  const minZ = Math.min(wall.z0, line.z0)
  const maxZ = Math.max(wall.z1, line.z1)
  const scale = Math.min((W - PAD * 2) / (maxX - minX), (MAX_H - PAD * 2) / (maxZ - minZ))
  const H = Math.round((maxZ - minZ) * scale + PAD * 2)
  const ox = (W - (maxX - minX) * scale) / 2
  const oy = (H - (maxZ - minZ) * scale) / 2
  const px = (x: number) => ox + (x - minX) * scale
  const pz = (z: number) => oy + (z - minZ) * scale
  const snap = (x0: number, z0: number, x1: number, z1: number): Box => {
    const x = Math.round(px(x0)) + 0.5
    const y = Math.round(pz(z0)) + 0.5
    return { x, y, w: Math.max(2, Math.round(px(x1)) - 0.5 - x), h: Math.round(pz(z1)) - 0.5 - y }
  }
  const boxes = cabinets.map((c) => snap(c.x0, wall.z0, c.x1, wall.z1))
  const lineBox = snap(line.x0, line.z0, line.x1, line.z1)

  const geometry = useRef({ px, pz, boxes, H })
  geometry.current = { px, pz, boxes, H }

  useEffect(() => {
    let last = ''
    const draw = () => {
      const v = view.current
      const g = geometry.current
      const x = Math.min(W - 3, Math.max(3, g.px(v.x)))
      const y = Math.min(g.H - 3, Math.max(3, g.pz(v.z)))
      const deg = (Math.atan2(Math.cos(v.az), Math.sin(v.az)) * 180) / Math.PI
      const box = v.level === 'overview' ? undefined : g.boxes[v.cabinet]
      const key = `${x.toFixed(1)} ${y.toFixed(1)} ${deg.toFixed(0)} ${box ? v.cabinet : -1}`
      if (key === last) return
      last = key
      camera.current?.setAttribute('transform', `translate(${x.toFixed(2)} ${y.toFixed(2)}) rotate(${deg.toFixed(1)})`)
      const f = frame.current
      if (!f) return
      if (!box) {
        f.setAttribute('display', 'none')
        return
      }
      f.setAttribute('display', 'inline')
      f.setAttribute('transform', `translate(${box.x - 2} ${box.y - 4})`)
      for (const rect of f.children) {
        rect.setAttribute('width', String(box.w + 4))
        rect.setAttribute('height', String(box.h + 8))
      }
    }
    view.current.draw = draw
    draw()
    return () => {
      view.current.draw = undefined
    }
  }, [view])

  const shown = cabinets[hover ?? active] as MiniCabinet | undefined
  const searching = cabinets.some((c) => c.matches !== null)
  const hits = cabinets.reduce((sum, c) => sum + (c.matches ?? 0), 0)
  const picked = cabinets.reduce((sum, c) => sum + c.selected, 0)

  const step = (event: KeyboardEvent, index: number) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      onPick(index)
      return
    }
    const delta = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0
    if (!delta) return
    event.preventDefault()
    buttons.current[(index + delta + cabinets.length) % cabinets.length]?.focus()
  }

  const r = WEDGE
  const half = Math.PI / 6
  const wedge = `M0 0L${(r * Math.cos(half)).toFixed(2)} ${(-r * Math.sin(half)).toFixed(2)}A${r} ${r} 0 0 1 ${(r * Math.cos(half)).toFixed(2)} ${(r * Math.sin(half)).toFixed(2)}Z`

  return (
    <div className={`w-fit rounded-xl border border-border bg-surface/90 p-1.5 text-foreground shadow-lg backdrop-blur ${className}`}>
      <div style={{ width: W }} className={`${row} text-[10px] tracking-[0.05em] text-foreground/70 uppercase`}>
        <span>Storage wall · {cabinets.length} cabinets</span>
        {searching ? <span className="text-accent">{hits} hits</span> : <span>{picked} picked</span>}
      </div>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="block overflow-visible" role="group" aria-label="Storage wall minimap">
        <g shapeRendering="crispEdges">
          <rect {...rectProps(lineBox)} fill="none" stroke="currentColor" strokeOpacity={0.35} />
          <text x={lineBox.x - 5} y={lineBox.y + lineBox.h} textAnchor="end" className="fill-foreground/70" fontSize={10} letterSpacing="0.08em">
            LINE
          </text>
          {cabinets.map((c, i) => {
            const box = boxes[i]
            const heat = c.count ? (c.selected / c.count) * 0.45 : 0
            const dim = c.matches === 0
            const hit = c.matches !== null && c.matches > 0
            const isActive = i === active
            const isHover = i === hover
            const bar = c.matches !== null && c.count ? Math.round((box.w - 1) * Math.min(1, c.matches / c.count)) : 0
            return (
              <g
                key={c.index}
                ref={(el) => {
                  buttons.current[i] = el
                }}
                tabIndex={0}
                role="button"
                aria-label={`${c.label}, ${c.count} items${c.selected ? `, ${c.selected} selected` : ''}${c.matches !== null ? `, ${c.matches} matches` : ''}`}
                aria-pressed={isActive}
                className="group cursor-pointer outline-none"
                opacity={dim && !isActive ? 0.25 : 1}
                onPointerEnter={() => setHover(i)}
                onPointerLeave={() => setHover((h) => (h === i ? null : h))}
                onFocus={() => setHover(i)}
                onBlur={() => setHover((h) => (h === i ? null : h))}
                onClick={() => onPick(c.index)}
                onKeyDown={(event) => step(event, c.index)}
              >
                <rect x={box.x - 1.5} y={box.y - 1.5} width={box.w + 3} height={box.h + 3} fill="transparent" stroke="none" />
                <rect
                  {...rectProps(box)}
                  fill={heat ? `hsl(${c.hue} 70% 52% / ${heat.toFixed(3)})` : 'transparent'}
                  stroke="currentColor"
                  strokeOpacity={isHover ? 0.9 : 0.5}
                  className={hit && !isActive ? 'stroke-accent' : undefined}
                  style={hit && !isActive ? { strokeOpacity: 1 } : undefined}
                />
                {bar > 0 && <rect x={box.x + 0.5} y={box.y + box.h - 2.5} width={bar} height={2} className="fill-accent" />}
                {isActive && <rect x={box.x - 0.25} y={box.y - 0.25} width={box.w + 0.5} height={box.h + 0.5} fill="none" stroke="currentColor" strokeWidth={1.5} shapeRendering="geometricPrecision" />}
                <rect
                  x={box.x - 2}
                  y={box.y - 2}
                  width={box.w + 4}
                  height={box.h + 4}
                  fill="none"
                  className="pointer-events-none stroke-accent opacity-0 group-focus-visible:opacity-100"
                />
              </g>
            )
          })}
          <g ref={frame} display="none" fill="none" className="pointer-events-none">
            <rect className="stroke-surface" strokeWidth={3} />
            <rect className="stroke-accent" strokeDasharray="3 2" />
          </g>
        </g>
        <g ref={camera} className="pointer-events-none" transform={`translate(-99 -99)`}>
          <path d={wedge} className="fill-accent stroke-accent" fillOpacity={0.2} strokeOpacity={0.9} strokeWidth={1} strokeLinejoin="round" />
          <circle r={2.75} className="fill-foreground" />
          <circle r={2.75} fill="none" className="stroke-surface" strokeWidth={1} />
        </g>
      </svg>
      {shown && (
        <div style={{ width: W }} className={`${row} text-[11px]`}>
          <span className="truncate font-medium">{shown.label}</span>
          <span className="shrink-0 text-[10px] text-foreground/70">
            {shown.matches !== null ? (
              <>
                <span className="text-accent">{shown.matches}</span> of {shown.count} match
              </>
            ) : (
              <>
                <span className="text-foreground">{shown.selected}</span> of {shown.count} picked
              </>
            )}
          </span>
        </div>
      )}
    </div>
  )
}

const row = 'flex h-5 items-center justify-between gap-3 px-1 leading-none tabular-nums'
const rectProps = (box: Box) => ({ x: box.x, y: box.y, width: box.w, height: box.h })
