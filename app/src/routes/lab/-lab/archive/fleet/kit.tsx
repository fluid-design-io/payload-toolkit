import { Edges } from '@react-three/drei'
import { useEffect, useMemo, useRef } from 'react'
import type { ReactNode } from 'react'
import { BufferAttribute, BufferGeometry, CanvasTexture, LineBasicMaterial, LineSegments, SRGBColorSpace } from 'three'

import type { Lab } from '../../lab.types'

export const ACCENT = '#5A91AD'
export const BRAND = {
  npm: '#CB3837',
  pnpm: '#F2A900',
  bun: '#E0A458',
  claude: '#D97757',
  codex: '#2EC4E6',
  tanstack: '#1FA39B',
  postgres: '#336791',
  mongo: '#00A35C',
  leaf: '#00C25A',
  spark: '#FFB347',
  bead: '#E8A15A',
}

export type Colors = ReturnType<typeof palette>
export function palette(theme: Lab['theme']) {
  return theme === 'dark'
    ? { theme, bg: '#090E11', surface: '#161D21', fg: '#FCFCFC', muted: '#8A9094', edge: '#5C676C', dim: '#2C363C', board: '#10171B', l: 40, s: 34, warm: '#3A2219', pg: '#2E3740', mongo: '#0F2A1C', glass: '#1B2A30' }
    : { theme, bg: '#EDF1F3', surface: '#FFFFFF', fg: '#1D2225', muted: '#727C81', edge: '#9AA4A9', dim: '#C9D0D4', board: '#F7FAFB', l: 66, s: 46, warm: '#FCEDE6', pg: '#D9DFE4', mongo: '#E4F5EA', glass: '#F3F8FA' }
}
export const tint = (hue: number, c: Colors, l = c.l) => `hsl(${hue}, ${c.s}%, ${l}%)`
export const FONT = '"Timeless Grotesk", ui-sans-serif, system-ui, sans-serif'

export function textTexture(width: number, height: number, draw: (ctx: CanvasRenderingContext2D) => void) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  draw(canvas.getContext('2d')!)
  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  texture.anisotropy = 8
  return texture
}

export function plateTexture(c: Colors, color: string, title: string, sub: string, status: string, live: boolean) {
  return textTexture(640, 200, (ctx) => {
    ctx.strokeStyle = live ? color : c.edge
    ctx.lineWidth = live ? 4 : 2
    ctx.setLineDash(live ? [] : [10, 8])
    ctx.beginPath()
    ctx.roundRect(4, 4, 632, 192, 24)
    ctx.stroke()
    ctx.setLineDash([])
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.arc(44, 58, 12, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = c.fg
    ctx.font = `500 46px ${FONT}`
    ctx.fillText(title, 72, 74)
    ctx.fillStyle = c.muted
    ctx.font = `400 32px ${FONT}`
    ctx.fillText(sub, 30, 128)
    ctx.fillStyle = live ? color : c.muted
    ctx.font = `500 26px ${FONT}`
    ctx.fillText(status.toUpperCase(), 30, 172)
  })
}

export function Box({ size, color, edge, position, rotation, opacity = 1, children }: {
  size: [number, number, number]
  color: string
  edge: string
  position?: [number, number, number]
  rotation?: [number, number, number]
  opacity?: number
  children?: ReactNode
}) {
  return (
    <mesh position={position} rotation={rotation}>
      <boxGeometry args={size} />
      <meshStandardMaterial color={color} roughness={1} transparent={opacity < 1} opacity={opacity} />
      <Edges color={edge} />
      {children}
    </mesh>
  )
}

export function Flat({ texture, size, position, rotation = [-Math.PI / 2, 0, 0], opacity = 1 }: {
  texture: CanvasTexture
  size: [number, number]
  position: [number, number, number]
  rotation?: [number, number, number]
  opacity?: number
}) {
  return (
    <mesh position={position} rotation={rotation}>
      <planeGeometry args={size} />
      <meshBasicMaterial map={texture} transparent opacity={opacity} toneMapped={false} depthWrite={false} />
    </mesh>
  )
}

/** A pool of 1px line segments rewritten every frame; WebGL lines are the hairline. */
export function useSegments(max: number, color: string, opacity = 1) {
  const line = useMemo(() => {
    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new BufferAttribute(new Float32Array(max * 6), 3))
    geometry.setDrawRange(0, 0)
    const material = new LineBasicMaterial({ color, transparent: true, opacity, toneMapped: false, depthWrite: false })
    const segments = new LineSegments(geometry, material)
    segments.frustumCulled = false
    return segments
  }, [max])
  useEffect(() => {
    const material = line.material as LineBasicMaterial
    material.color.set(color)
    material.opacity = opacity
  }, [line, color, opacity])
  return line
}
export function segmentWriter(line: LineSegments) {
  const attr = line.geometry.getAttribute('position') as BufferAttribute
  const arr = attr.array as Float32Array
  let n = 0
  const max = arr.length / 6
  return {
    add(ax: number, ay: number, az: number, bx: number, by: number, bz: number) {
      if (n >= max) return
      arr.set([ax, ay, az, bx, by, bz], n * 6)
      n++
    },
    done() {
      line.geometry.setDrawRange(0, n * 2)
      attr.needsUpdate = true
    },
  }
}
export function staticSegments(points: number[], color: string, opacity = 1) {
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(points), 3))
  const segments = new LineSegments(geometry, new LineBasicMaterial({ color, transparent: opacity < 1, opacity, toneMapped: false }))
  return segments
}
export function circle(out: number[], x: number, y: number, z: number, r: number, n = 48, dash = false) {
  for (let i = 0; i < n; i++) {
    if (dash && i % 2) continue
    const a = (i / n) * Math.PI * 2, b = ((i + 1) / n) * Math.PI * 2
    out.push(x + Math.cos(a) * r, y, z + Math.sin(a) * r, x + Math.cos(b) * r, y, z + Math.sin(b) * r)
  }
  return out
}

export type Tip = { show: (e: PointerEvent, title: string, sub: string) => void; move: (e: PointerEvent) => void; hide: () => void }
export function useTip() {
  const ref = useRef<HTMLDivElement>(null)
  const api = useMemo<Tip>(() => {
    const move = (e: PointerEvent) => {
      const el = ref.current
      if (el) el.style.transform = `translate(${e.clientX + 14}px, ${e.clientY + 14}px)`
    }
    return {
      show: (e, title, sub) => {
        const el = ref.current
        if (!el) return
        el.children[0].textContent = title
        el.children[1].textContent = sub
        el.style.opacity = '1'
        document.body.style.cursor = 'pointer'
        move(e)
      },
      move,
      hide: () => {
        if (ref.current) ref.current.style.opacity = '0'
        document.body.style.cursor = ''
      },
    }
  }, [])
  return [ref, api] as const
}
export const hover = (tip: Tip, title: () => string, sub: () => string) => ({
  onPointerOver: (e: { stopPropagation: () => void; nativeEvent: PointerEvent }) => {
    e.stopPropagation()
    tip.show(e.nativeEvent, title(), sub())
  },
  onPointerMove: (e: { nativeEvent: PointerEvent }) => tip.move(e.nativeEvent),
  onPointerOut: () => tip.hide(),
})
