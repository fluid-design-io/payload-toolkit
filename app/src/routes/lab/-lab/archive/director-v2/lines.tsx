import { useEffect, useMemo } from 'react'
import type { DependencyList } from 'react'
import { BufferAttribute, BufferGeometry, CanvasTexture, Color, LineBasicMaterial, LineDashedMaterial, LineSegments, Matrix4, SRGBColorSpace, Vector3 } from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

import type { Look } from './look'

export type V3 = [number, number, number]
export const FONT = '"Timeless Grotesk", ui-sans-serif, system-ui, sans-serif'

const corner = new Vector3()

/**
 * Collects hairline segments into one geometry. Every static outline in the
 * scene goes through a Pen so a world draws its lines in one or two calls.
 */
export class Pen {
  pts: number[] = []
  seg(ax: number, ay: number, az: number, bx: number, by: number, bz: number) {
    this.pts.push(ax, ay, az, bx, by, bz)
    return this
  }
  line(points: readonly V3[], close = false) {
    for (let i = 1; i < points.length; i++) this.seg(...points[i - 1], ...points[i])
    if (close && points.length > 2) this.seg(...points[points.length - 1], ...points[0])
    return this
  }
  rect(cx: number, y: number, cz: number, w: number, d: number) {
    const x0 = cx - w / 2, x1 = cx + w / 2, z0 = cz - d / 2, z1 = cz + d / 2
    return this.line([[x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1]], true)
  }
  box(cx: number, cy: number, cz: number, w: number, h: number, d: number, m?: Matrix4) {
    const c: number[][] = []
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
      corner.set(cx + (sx * w) / 2, cy + (sy * h) / 2, cz + (sz * d) / 2)
      if (m) corner.applyMatrix4(m)
      c.push([corner.x, corner.y, corner.z])
    }
    const e = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]]
    for (const [a, b] of e) this.seg(c[a][0], c[a][1], c[a][2], c[b][0], c[b][1], c[b][2])
    return this
  }
  circle(cx: number, cy: number, cz: number, r: number, axis: 'x' | 'y' | 'z' = 'y', n = 36, m?: Matrix4, dash = false) {
    const at = (k: number) => {
      const a = (k / n) * Math.PI * 2
      const u = Math.cos(a) * r, v = Math.sin(a) * r
      if (axis === 'y') corner.set(cx + u, cy, cz + v)
      else if (axis === 'z') corner.set(cx + u, cy + v, cz)
      else corner.set(cx, cy + u, cz + v)
      if (m) corner.applyMatrix4(m)
      return [corner.x, corner.y, corner.z]
    }
    for (let k = 0; k < n; k++) {
      if (dash && k % 2) continue
      const a = at(k), b = at(k + 1)
      this.seg(a[0], a[1], a[2], b[0], b[1], b[2])
    }
    return this
  }
  geometry() {
    const g = new BufferGeometry()
    g.setAttribute('position', new BufferAttribute(new Float32Array(this.pts), 3))
    return g
  }
}

export function useLines(build: (pen: Pen) => void, deps: DependencyList) {
  const geometry = useMemo(() => {
    const pen = new Pen()
    build(pen)
    return pen.geometry()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
  useEffect(() => () => geometry.dispose(), [geometry])
  return geometry
}

/** Static hairlines, optionally dashed and optionally reflected in the floor. */
export function Lines({ geometry, color, opacity = 1, dashed, mirror = 0, depthTest = true, renderOrder }: {
  geometry: BufferGeometry; color: string; opacity?: number; dashed?: [number, number]; mirror?: number; depthTest?: boolean; renderOrder?: number
}) {
  const material = useMemo(() => {
    const m = dashed
      ? new LineDashedMaterial({ color, dashSize: dashed[0], gapSize: dashed[1] })
      : new LineBasicMaterial({ color })
    m.transparent = opacity < 1
    m.opacity = opacity
    m.depthTest = depthTest
    m.toneMapped = false
    return m
  }, [color, opacity, dashed, depthTest])
  const ghost = useMemo(() => {
    const m = material.clone()
    m.transparent = true
    m.opacity = opacity * mirror
    m.depthWrite = false
    return m
  }, [material, opacity, mirror])
  useEffect(() => () => { material.dispose(); ghost.dispose() }, [material, ghost])
  const onUpdate = dashed ? (l: LineSegments) => l.computeLineDistances() : undefined
  return (
    <>
      <lineSegments geometry={geometry} material={material} onUpdate={onUpdate} renderOrder={renderOrder} />
      {mirror > 0 && <lineSegments geometry={geometry} material={ghost} scale={[1, -1, 1]} onUpdate={onUpdate} />}
    </>
  )
}

export type Writer = {
  line: LineSegments
  begin: () => void
  seg: (ax: number, ay: number, az: number, bx: number, by: number, bz: number, color?: Color) => void
  box: (m: Matrix4, w: number, h: number, d: number, color?: Color) => void
  circle: (cx: number, cy: number, cz: number, r: number, axis: 'x' | 'y' | 'z', m: Matrix4 | undefined, color?: Color, n?: number) => void
  rect: (cx: number, y: number, cz: number, w: number, d: number, color?: Color) => void
  done: () => void
}

/** Corner pairs of a box whose corner k sits at (±w, ±h, ±d) by bits 4, 2, 1 of k. */
const ATTRS = ['position', 'color'] as const
const BOX_EDGES = [0, 1, 2, 3, 4, 5, 6, 7, 0, 2, 1, 3, 4, 6, 5, 7, 0, 4, 1, 5, 2, 6, 3, 7]

/** A pool of hairline segments rewritten every frame, each with its own color. Allocation-free per frame. */
export function useWriter(max: number, base: string): Writer {
  const writer = useMemo<Writer>(() => {
    const geometry = new BufferGeometry()
    const pos = new Float32Array(max * 6)
    const col = new Float32Array(max * 6)
    geometry.setAttribute('position', new BufferAttribute(pos, 3))
    geometry.setAttribute('color', new BufferAttribute(col, 3))
    geometry.setDrawRange(0, 0)
    const line = new LineSegments(geometry, new LineBasicMaterial({ vertexColors: true, toneMapped: false }))
    line.frustumCulled = false
    const fallback = new Color(base)
    let n = 0
    const seg = (ax: number, ay: number, az: number, bx: number, by: number, bz: number, color = fallback) => {
      if (n >= max) return
      const i = n * 6
      pos[i] = ax; pos[i + 1] = ay; pos[i + 2] = az; pos[i + 3] = bx; pos[i + 4] = by; pos[i + 5] = bz
      col[i] = col[i + 3] = color.r; col[i + 1] = col[i + 4] = color.g; col[i + 2] = col[i + 5] = color.b
      n++
    }
    const corners = new Float32Array(24)
    const c = new Vector3()
    return {
      line,
      begin: () => { n = 0 },
      seg,
      box: (m, w, h, d, color) => {
        for (let k = 0; k < 8; k++) {
          c.set(((k & 4 ? 1 : -1) * w) / 2, ((k & 2 ? 1 : -1) * h) / 2, ((k & 1 ? 1 : -1) * d) / 2).applyMatrix4(m)
          corners[k * 3] = c.x; corners[k * 3 + 1] = c.y; corners[k * 3 + 2] = c.z
        }
        for (let e = 0; e < 24; e += 2) {
          const a = BOX_EDGES[e] * 3, b = BOX_EDGES[e + 1] * 3
          seg(corners[a], corners[a + 1], corners[a + 2], corners[b], corners[b + 1], corners[b + 2], color)
        }
      },
      circle: (cx, cy, cz, r, axis, m, color, count = 28) => {
        let px = 0, py = 0, pz = 0
        for (let k = 0; k <= count; k++) {
          const a = (k / count) * Math.PI * 2
          const u = Math.cos(a) * r, v = Math.sin(a) * r
          if (axis === 'y') c.set(cx + u, cy, cz + v)
          else if (axis === 'z') c.set(cx + u, cy + v, cz)
          else c.set(cx, cy + u, cz + v)
          if (m) c.applyMatrix4(m)
          if (k) seg(px, py, pz, c.x, c.y, c.z, color)
          px = c.x; py = c.y; pz = c.z
        }
      },
      rect: (cx, y, cz, w, d, color) => {
        const x0 = cx - w / 2, x1 = cx + w / 2, z0 = cz - d / 2, z1 = cz + d / 2
        seg(x0, y, z0, x1, y, z0, color); seg(x1, y, z0, x1, y, z1, color); seg(x1, y, z1, x0, y, z1, color); seg(x0, y, z1, x0, y, z0, color)
      },
      done: () => {
        geometry.setDrawRange(0, n * 2)
        if (!n) return
        for (const name of ATTRS) {
          const attr = geometry.getAttribute(name) as BufferAttribute
          attr.addUpdateRange(0, n * 6)
          attr.needsUpdate = true
        }
      },
    }
  }, [max, base])
  useEffect(() => () => { writer.line.geometry.dispose(); (writer.line.material as LineBasicMaterial).dispose() }, [writer])
  return writer
}

export function Dynamic({ writer, mirror = 0 }: { writer: Writer; mirror?: number }) {
  const ghost = useMemo(() => {
    const m = new LineBasicMaterial({ vertexColors: true, transparent: true, opacity: mirror, depthWrite: false, toneMapped: false })
    return m
  }, [mirror])
  useEffect(() => () => ghost.dispose(), [ghost])
  return (
    <>
      <primitive object={writer.line} />
      {mirror > 0 && <lineSegments geometry={writer.line.geometry} material={ghost} scale={[1, -1, 1]} frustumCulled={false} />}
    </>
  )
}

/** Merges solid geometries into one so a machine's fills draw in one call. */
export function useFills(build: () => BufferGeometry[], deps: DependencyList) {
  const geometry = useMemo(() => {
    const parts = build()
    const merged = mergeGeometries(parts, false)!
    for (const g of parts) g.dispose()
    return merged
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
  useEffect(() => () => geometry.dispose(), [geometry])
  return geometry
}

export function Surf({ c, color, attach, transparent, opacity }: { c: Look; color: string; attach?: string; transparent?: boolean; opacity?: number }) {
  return c.flat ? (
    <meshBasicMaterial attach={attach} color={color} transparent={transparent} opacity={opacity} toneMapped={false} />
  ) : (
    <meshStandardMaterial attach={attach} color={color} roughness={c.rough} transparent={transparent} opacity={opacity} />
  )
}

export function Fill({ geometry, c, color, position }: { geometry: BufferGeometry; c: Look; color: string; position?: V3 }) {
  return (
    <mesh geometry={geometry} position={position}>
      <Surf c={c} color={color} />
    </mesh>
  )
}

export function textTexture(width: number, height: number, draw: (ctx: CanvasRenderingContext2D) => void) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')!
  ctx.textBaseline = 'alphabetic'
  draw(ctx)
  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  texture.anisotropy = 8
  return texture
}

/** One in-world label style: tracked caps, weight 500, centered unless `align`. */
export function label(text: string, opts: { fg: string; bg?: string; stroke?: string; w?: number; h?: number; size?: number; weight?: number; align?: CanvasTextAlign; track?: number }) {
  const w = opts.w ?? 512, h = opts.h ?? 96
  return textTexture(w, h, (ctx) => {
    if (opts.bg) {
      ctx.fillStyle = opts.bg
      ctx.fillRect(0, 0, w, h)
    }
    if (opts.stroke) {
      ctx.strokeStyle = opts.stroke
      ctx.lineWidth = 3
      ctx.strokeRect(2, 2, w - 4, h - 4)
    }
    ctx.fillStyle = opts.fg
    ctx.font = `${opts.weight ?? 500} ${opts.size ?? 40}px ${FONT}`
    ctx.letterSpacing = `${opts.track ?? 2}px`
    ctx.textAlign = opts.align ?? 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(text, opts.align === 'left' ? 16 : opts.align === 'right' ? w - 16 : w / 2, h / 2 + 2)
  })
}

export function Tag({ text, position, c, scale = 1, flat = false, color, opacity = 1, align, track }: {
  text: string; position: V3; c: Look; scale?: number; flat?: boolean; color?: string; opacity?: number; align?: CanvasTextAlign; track?: number
}) {
  const map = useMemo(() => label(text, { fg: color ?? c.fg, size: 40, w: 640, h: 96, align, track }), [text, c, color, align, track])
  useEffect(() => () => map.dispose(), [map])
  const w = 4.2 * scale, h = w * (96 / 640)
  if (flat)
    return (
      <mesh position={position} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[w, h]} />
        <meshBasicMaterial map={map} transparent opacity={opacity} toneMapped={false} depthWrite={false} />
      </mesh>
    )
  return (
    <sprite position={position} scale={[w, h, 1]}>
      <spriteMaterial map={map} transparent opacity={opacity} toneMapped={false} depthWrite={false} />
    </sprite>
  )
}
