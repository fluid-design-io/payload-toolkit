import { useEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Vector3 } from 'three'

export type Label = {
  key: string
  /** World anchor. */
  x: number
  y: number
  z: number
  title: string
  sub?: string
  /** Higher wins a collision. */
  weight: number
  /** 'code' renders mono small caps (pick codes); 'name' renders a title with optional sub; 'count' renders a pill. */
  kind: 'code' | 'name' | 'count'
  /** Optional category hue for a 3px swatch before the title. */
  hue?: number
  accent?: boolean
}


type Node = {
  el: HTMLDivElement
  leader: HTMLDivElement
  sig: string
  w: number
  h: number
  /** Placed box and anchor this frame. */
  x: number
  y: number
  ax: number
  ay: number
  slot: number
  /** Frame numbers it was last in the source and last placed. */
  seen: number
  placed: number
  /** What the DOM currently holds, so unchanged values are never rewritten. */
  dom: { x: number; y: number; leader: string; on: boolean }
  goneAt: number
}

type Candidate = { label: Label; node: Node; ax: number; ay: number; rank: number }

const MAX = 64
const MARGIN = 32
const GAP = 8
const INSET = 7
const SPACE = 4
const SETTLE = 3
const STICK = 0.5
const LEADER = Math.SQRT2 * GAP
const FADE = 200
const ANGLES = [-45, -135, 45]

const BOX = 'absolute left-0 top-0 flex items-center gap-1.5 whitespace-nowrap border opacity-0 transition-opacity duration-150 ease-out will-change-transform'
const KIND = {
  code: 'rounded-md bg-surface/85 px-1.5 py-px font-mono text-[10px] leading-[14px] tracking-[0.08em] uppercase',
  name: 'rounded-md bg-surface/85 px-2 py-1 text-[11px] leading-[14px]',
  count: 'rounded-full bg-surface/85 px-2 py-px text-[11px] leading-[16px] tabular-nums',
}
/** Phones get a size up so labels stay readable at 390 px. */
const KIND_LARGE = {
  code: 'rounded-md bg-surface/90 px-1.5 py-0.5 font-mono text-[12px] leading-[16px] tracking-[0.06em] uppercase',
  name: 'rounded-md bg-surface/90 px-2 py-1 text-[13px] leading-[16px]',
  count: 'rounded-full bg-surface/90 px-2.5 py-0.5 text-[13px] leading-[18px] tabular-nums',
}
const LINE = 'absolute left-0 top-0 h-px origin-[0_50%] before:absolute before:-left-px before:-top-px before:size-[3px] before:rounded-full before:bg-inherit opacity-0 transition-opacity duration-150 ease-out will-change-transform'

const signature = (l: Label, large: boolean) => `${l.kind}|${l.title}|${l.sub ?? ''}|${l.hue ?? ''}|${l.accent ? 1 : 0}|${large ? 1 : 0}`

function span(className: string, text: string) {
  const s = document.createElement('span')
  s.className = className
  s.textContent = text
  return s
}

function fill(n: Node, l: Label, large: boolean) {
  const tone = l.accent ? 'border-accent/50 text-accent' : 'border-border text-foreground'
  n.el.className = `${BOX} ${(large ? KIND_LARGE : KIND)[l.kind]} ${tone}`
  n.leader.className = `${LINE} ${l.accent ? 'bg-accent' : 'bg-muted/70'}`
  n.leader.style.width = `${LEADER}px`
  n.el.replaceChildren()
  if (l.hue !== undefined) {
    const swatch = span('h-2.5 w-[3px] shrink-0 rounded-full', '')
    swatch.style.background = `hsl(${l.hue} 55% 55%)`
    n.el.append(swatch)
  }
  if (l.kind === 'name') {
    const text = document.createElement('span')
    text.className = 'flex flex-col'
    text.append(span('max-w-[180px] truncate font-medium', l.title))
    if (l.sub) text.append(span(`max-w-[180px] truncate ${large ? 'text-[11px] leading-[14px]' : 'text-[10px] leading-[13px]'} text-foreground/70`, l.sub))
    n.el.append(text)
  } else if (l.kind === 'count') {
    n.el.append(span('font-medium', l.title))
    if (l.sub) n.el.append(span('text-foreground/70', l.sub))
  } else n.el.append(span('max-w-[140px] truncate', l.title))
  n.sig = signature(l, large)
}

/**
 * Crisp DOM labels over a Canvas. Mount inside the Canvas; it projects
 * `source()` every frame, lays labels out greedily by weight and writes
 * transforms straight to nodes it keeps in `host`, so React never re-renders.
 */
export function LabelLayer({ source, host, large = false }: { source: () => readonly Label[]; host: { current: HTMLElement | null }; large?: boolean }): null {
  const root = useRef<HTMLDivElement | null>(null)
  const nodes = useRef(new Map<string, Node>())
  const rects = useRef(new Float32Array(MAX * 4))
  const v = useRef(new Vector3())
  const tick = useRef(0)

  useEffect(() => {
    const map = nodes.current
    return () => {
      root.current?.remove()
      root.current = null
      map.clear()
    }
  }, [])

  useFrame(({ camera, size }) => {
    if (!root.current) {
      if (!host.current) return
      root.current = document.createElement('div')
      root.current.className = 'absolute inset-0'
      host.current.append(root.current)
    }
    const t0 = performance.now()
    const frame = ++tick.current
    const map = nodes.current
    const p = v.current
    const W = size.width
    const H = size.height
    camera.updateMatrixWorld()

    const list: Candidate[] = []
    const filled: Node[] = []
    for (const label of source()) {
      p.set(label.x, label.y, label.z).project(camera)
      let node = map.get(label.key)
      if (!node) {
        const el = document.createElement('div')
        const leader = document.createElement('div')
        root.current.append(leader, el)
        node = { el, leader, sig: '', w: 0, h: 0, x: 0, y: 0, ax: 0, ay: 0, slot: 0, seen: 0, placed: 0, dom: { x: NaN, y: NaN, leader: '', on: false }, goneAt: 0 }
        map.set(label.key, node)
      }
      if (node.sig !== signature(label, large)) {
        fill(node, label, large)
        filled.push(node)
      }
      node.seen = frame
      node.goneAt = 0
      if (p.z < -1 || p.z > 1) continue
      const ax = Math.round((p.x + 1) * 0.5 * W)
      const ay = Math.round((1 - p.y) * 0.5 * H)
      if (ax < -MARGIN || ax > W + MARGIN || ay < -MARGIN || ay > H + MARGIN) continue
      list.push({ label, node, ax, ay, rank: label.weight + (node.placed === frame - 1 ? STICK : 0) })
    }
    for (const n of filled) {
      n.w = n.el.offsetWidth
      n.h = n.el.offsetHeight
    }
    list.sort((a, b) => b.rank - a.rank)

    const r = rects.current
    let placed = 0
    const fits = (x: number, y: number, w: number, h: number, pad: number) => {
      if (x < 0 || y < 0 || x + w > W || y + h > H) return false
      const x0 = x - pad
      const y0 = y - pad
      const x1 = x + w + pad
      const y1 = y + h + pad
      for (let i = 0; i < placed * 4; i += 4) if (x0 < r[i + 2] && x1 > r[i] && y0 < r[i + 3] && y1 > r[i + 1]) return false
      return true
    }
    const at = (slot: number, ax: number, ay: number, w: number, h: number) =>
      slot === 0 ? [ax + GAP - INSET, ay - GAP - h] : slot === 1 ? [ax - GAP - w + INSET, ay - GAP - h] : [ax + GAP - INSET, ay + GAP]

    for (const c of list) {
      const n = c.node
      let slot = -1
      let x = 0
      let y = 0
      if (placed < MAX) {
        const pad = SPACE + (n.placed === frame - 1 ? 0 : SETTLE)
        for (let k = 0; k < 3 && slot < 0; k++) {
          const s = (n.slot + k) % 3
          const [cx, cy] = at(s, c.ax, c.ay, n.w, n.h)
          if (fits(cx, cy, n.w, n.h, pad)) {
            slot = s
            x = cx
            y = cy
          }
        }
      }
      if (slot < 0) continue
      const i = placed++ * 4
      r[i] = x
      r[i + 1] = y
      r[i + 2] = x + n.w
      r[i + 3] = y + n.h
      n.slot = slot
      n.placed = frame
      n.x = x
      n.y = y
      n.ax = c.ax
      n.ay = c.ay
    }

    for (const [key, n] of map) {
      const d = n.dom
      if (n.placed === frame) {
        if (d.x !== n.x || d.y !== n.y) {
          n.el.style.transform = `translate3d(${n.x}px,${n.y}px,0)`
          d.x = n.x
          d.y = n.y
        }
        const leader = `translate3d(${n.ax}px,${n.ay}px,0) rotate(${ANGLES[n.slot]}deg)`
        if (d.leader !== leader) {
          n.leader.style.transform = leader
          d.leader = leader
        }
        if (!d.on) {
          n.el.style.opacity = '1'
          n.leader.style.opacity = '1'
          d.on = true
        }
        continue
      }
      if (d.on) {
        n.el.style.opacity = '0'
        n.leader.style.opacity = '0'
        d.on = false
      }
      if (n.seen === frame) continue
      if (!n.goneAt) n.goneAt = t0
      else if (t0 - n.goneAt > FADE) {
        n.el.remove()
        n.leader.remove()
        map.delete(key)
      }
    }

  })

  return null
}
