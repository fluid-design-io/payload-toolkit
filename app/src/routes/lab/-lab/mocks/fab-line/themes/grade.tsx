import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import type { CSSProperties } from 'react'
import { Color, NoToneMapping } from 'three'
import type { Group, Texture } from 'three'

import type { LineLayout } from '../core/contract'
import { textTexture } from '../core/three'

/**
 * What a theme does to the finished frame, without an EffectComposer (the fx
 * slot may own one): an SVG filter on the canvas element, CSS layers stacked
 * over it, an opaque paper clear for filters that unmix inks, and exact flat
 * colors (no ACES) so token values print as written.
 */
export type Grade = {
  filter?: string
  layers?: CSSProperties[]
  paper?: string
  exact?: boolean
}

let seq = 0
export function Screen({ grade }: { grade: Grade }) {
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  const invalidate = useThree((s) => s.invalidate)
  useEffect(() => {
    const canvas = gl.domElement
    const host = canvas.parentElement
    if (!host) return
    const added: Element[] = []
    const prev = { filter: canvas.style.filter, background: scene.background, tone: gl.toneMapping }
    if (grade.filter) {
      const id = `fab-grade-${++seq}`
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
      svg.setAttribute('width', '0')
      svg.setAttribute('height', '0')
      svg.setAttribute('aria-hidden', 'true')
      svg.style.position = 'absolute'
      svg.innerHTML = `<defs><filter id="${id}" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">${grade.filter}</filter></defs>`
      host.appendChild(svg)
      added.push(svg)
      canvas.style.filter = `url(#${id})`
    }
    for (const layer of grade.layers ?? []) {
      const div = document.createElement('div')
      Object.assign(div.style, { position: 'absolute', inset: '0', pointerEvents: 'none' }, layer)
      div.dataset.grade = ''
      host.appendChild(div)
      added.push(div)
    }
    if (grade.paper) scene.background = new Color(grade.paper)
    if (grade.exact) gl.toneMapping = NoToneMapping
    invalidate()
    return () => {
      canvas.style.filter = prev.filter
      scene.background = prev.background
      gl.toneMapping = prev.tone
      added.forEach((el) => el.remove())
      invalidate()
    }
  }, [gl, scene, invalidate, grade])
  return null
}

/** A tiling grain texture as a data URL, for CSS layers. Seeded so every load prints the same paper. */
export function grainUrl(size = 192, seed = 7) {
  if (typeof document === 'undefined') return ''
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')!
  const img = ctx.createImageData(size, size)
  let s = seed
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647)
  for (let i = 0; i < size * size; i++) {
    const v = 255 - Math.floor(Math.pow(rnd(), 6) * 255)
    img.data.set([v, v, v, 255], i * 4)
  }
  ctx.putImageData(img, 0, 0)
  return canvas.toDataURL('image/png')
}

/** The printed sheet every flat theme lays under the line. */
export function sheetOf(line: LineLayout) {
  const x0 = line.extent.x0 - 1.7, x1 = line.extent.x1 + 2.0
  return { x0, x1, z0: -9.2, z1: 9.4, cx: (x0 + x1) / 2, cz: 0.1, w: x1 - x0, d: 18.6 }
}

/** A group hidden while the camera is pushed in on a part. */
export function useHideOnCloseUp(cam: { closeUp: boolean }) {
  const ref = useRef<Group>(null)
  useFrame(() => {
    if (ref.current) ref.current.visible = !cam.closeUp
  })
  return ref
}

/** Canvas textures made from `deps`, disposed when they change or unmount. */
export function useTextures<T extends Texture[]>(make: () => T, deps: unknown[]) {
  const list = useMemo(make, deps)
  useEffect(() => () => list.forEach((t) => t.dispose()), [list])
  return list
}

export const hexOf = (rgb: readonly number[]) => `#${rgb.map((v) => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, '0')).join('')}`
export const rgbOf = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
/** `t` of the way from `a` to `b`. */
export const mix = (a: string, b: string, t: number) => {
  const A = rgbOf(a), B = rgbOf(b)
  return hexOf(A.map((v, i) => v + (B[i] - v) * t))
}

export { textTexture }

/**
 * A soft shadow pooled under each station's footprint, leaning toward +x +z,
 * baked into one canvas texture per size so it follows the layout without a
 * depth pass. `strength` is the darkest opacity under the body.
 */
export function FootShadows({ line, color, strength, lean = [0.25, 0.35], pad = 0.9 }: { line: LineLayout; color: string; strength: number; lean?: [number, number]; pad?: number }) {
  const blobs = useMemo(
    () =>
      line.stops.map((stop) => {
        const b = stop.box
        const w = b.x1 - b.x0 + pad * 2, d = b.z1 - b.z0 + pad * 2
        const tex = textTexture(256, Math.max(32, Math.round((256 * d) / w)), (ctx) => {
          const W = ctx.canvas.width, H = ctx.canvas.height
          const px = (pad / w) * W, pz = (pad / d) * H
          ctx.filter = `blur(${Math.round(Math.min(px, pz) * 0.55)}px)`
          ctx.fillStyle = color
          ctx.beginPath()
          ctx.roundRect(px * 0.75, pz * 0.75, W - px * 1.5, H - pz * 1.5, Math.min(px, pz))
          ctx.fill()
        })
        const h = Math.min(b.h, 3)
        return { tex, w, d, x: (b.x0 + b.x1) / 2 + lean[0] * h, z: (b.z0 + b.z1) / 2 + lean[1] * h, id: stop.id }
      }),
    [line, color, pad, lean[0], lean[1]],
  )
  useEffect(() => () => blobs.forEach((b) => b.tex.dispose()), [blobs])
  if (strength <= 0) return null
  return (
    <>
      {blobs.map((b) => (
        <mesh key={b.id} position={[b.x, 0.003, b.z]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={-1}>
          <planeGeometry args={[b.w, b.d]} />
          <meshBasicMaterial map={b.tex} transparent opacity={strength} depthWrite={false} toneMapped={false} />
        </mesh>
      ))}
    </>
  )
}
