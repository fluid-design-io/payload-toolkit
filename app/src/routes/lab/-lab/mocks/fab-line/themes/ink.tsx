import { useLayoutEffect, useRef } from 'react'
import { CircleGeometry, Matrix4 } from 'three'
import type { InstancedMesh } from 'three'

import type { Footprint, StageProps } from '../core/contract'
import { FONT, fillMat, lineMat, rect, segs, useDisposable } from '../core/three'
import { Screen, grainUrl, perMode, sheetOf, textTexture, useHideOnCloseUp } from './grade'
import { Lights, MarkTag, markTexture } from './shared'

/**
 * A service manual's general-arrangement figure: one black ink and one red
 * spot colour on paper, near-axonometric lens, cast shadows drawn as hatching
 * from each station's footprint and height, a halftone contact shadow, and
 * numbered balloons. Dark prints white ink on black film.
 */
const gradeOf = perMode((mode) => ({
  exact: true,
  layers: [{ backgroundImage: `url(${grainUrl(160, 23)})`, backgroundSize: '160px', mixBlendMode: mode === 'light' ? 'multiply' : 'screen', opacity: mode === 'light' ? '0.1' : '0.05', filter: mode === 'light' ? 'none' : 'invert(1)' }],
}))

type P2 = [number, number]
/** Shadow length per metre of height, falling toward the viewer and right. */
const SUN: P2 = [0.8, 0.62]

function hull(pts: P2[]): P2[] {
  const p = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1])
  const cross = (o: P2, a: P2, b: P2) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
  const lower: P2[] = [], upper: P2[] = []
  for (const q of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop()
    lower.push(q)
  }
  for (const q of [...p].reverse()) {
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop()
    upper.push(q)
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1))
}

/** Parallel hatch lines at `angle`, `gap` apart, clipped to a convex polygon. */
function hatch(poly: P2[], angle: number, gap: number, y: number, out: number[]) {
  const n: P2 = [-Math.sin(angle), Math.cos(angle)]
  const proj = poly.map((q) => q[0] * n[0] + q[1] * n[1])
  const lo = Math.min(...proj), hi = Math.max(...proj)
  for (let o = Math.ceil(lo / gap) * gap; o < hi; o += gap) {
    const hits: P2[] = []
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length]
      const fa = proj[i] - o, fb = proj[(i + 1) % poly.length] - o
      if ((fa < 0) !== (fb < 0)) {
        const t = fa / (fa - fb)
        hits.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t])
      }
    }
    if (hits.length >= 2) out.push(hits[0][0], y, hits[0][1], hits[1][0], y, hits[1][1])
  }
}

/** Stations lower than this cast a halftone shadow; taller ones are hatched. */
const LOW = 1.2
/** World angles that land at 45 and -45 degrees on screen under the default iso camera (x reads 23 px/m, z 18 px/m). */
const HATCH = [(28 * Math.PI) / 180, (83 * Math.PI) / 180]
const inside = (poly: P2[], x: number, z: number) => poly.every((a, i) => {
  const b = poly[(i + 1) % poly.length]
  return (b[0] - a[0]) * (z - a[1]) - (b[1] - a[1]) * (x - a[0]) >= 0
})

const shadowOf = (b: Footprint) => {
  const base: P2[] = [[b.x0, b.z0], [b.x1, b.z0], [b.x1, b.z1], [b.x0, b.z1]]
  return hull(base.concat(base.map(([x, z]) => [x + SUN[0] * b.h, z + SUN[1] * b.h] as P2)))
}

type Dot = [number, number, number]
function Dots({ dots, color }: { dots: Dot[]; color: string }) {
  const ref = useRef<InstancedMesh>(null)
  const geo = useDisposable(() => new CircleGeometry(1, 6).rotateX(-Math.PI / 2), [])
  useLayoutEffect(() => {
    const m = new Matrix4()
    dots.forEach(([x, z, r], i) => ref.current?.setMatrixAt(i, m.makeScale(r, 1, r).setPosition(x, 0.003, z)))
    if (ref.current) ref.current.instanceMatrix.needsUpdate = true
  }, [dots])
  return <instancedMesh key={dots.length} ref={ref} args={[geo, fillMat(color, true), dots.length]} frustumCulled={false} />
}

const PART: Record<string, string> = { cabinet: 'PARTS CABINET', table: 'PICK TABLE', transport: 'TRANSFER', board: 'APP BOARD ASSY' }

export function Stage({ c, mode, power, cam, line }: StageProps) {
  const sheet = sheetOf(line)
  const labels = useHideOnCloseUp(cam)
  const stops = line.stops

  const art = useDisposable(() => {
    const ink: number[] = [], faint: number[] = []
    for (const stop of stops) {
      const b = stop.box
      if (b.h < LOW) continue
      const poly = shadowOf(b)
      hatch(poly, HATCH[0], 0.22, 0.004, ink)
      if (b.h > 2.6) hatch(poly, HATCH[1], 0.3, 0.0045, ink)
    }
    ink.push(...rect(sheet.x0, sheet.z0, sheet.x1, sheet.z1, 0.006))
    faint.push(...rect(sheet.x0 + 0.22, sheet.z0 + 0.22, sheet.x1 - 0.22, sheet.z1 - 0.22, 0.006))
    return { ink: segs(ink), faint: segs(faint) }
  }, [stops, sheet])

  const dots: Dot[] = []
  const step = 0.22
  for (const stop of stops) {
    const b = stop.box
    if (b.h >= LOW) continue
    const poly = shadowOf({ ...b, h: Math.max(b.h, 1.1) })
    const reach = Math.hypot(SUN[0], SUN[1]) * 1.1
    for (let x = b.x0; x <= b.x1 + reach; x += step)
      for (let z = b.z0; z <= b.z1 + reach; z += step) {
        const dx = Math.max(b.x0 - x, 0, x - b.x1), dz = Math.max(b.z0 - z, 0, z - b.z1)
        const d = Math.hypot(dx, dz)
        if (d === 0 || !inside(poly, x, z)) continue
        const r = step * 0.46 * Math.max(0, 1 - d / reach)
        if (r > 0.014) dots.push([x, z, r])
      }
  }

  const balloons = stops.flatMap((stop) => stop.callouts).map((l, i) => ({ top: l.at, at: l.tag, n: i + 1, text: PART[l.id] ?? l.text.toUpperCase() }))
  const leaders = useDisposable(() => {
    const l: number[] = []
    for (const b of balloons) {
      l.push(...b.top, ...b.at)
      l.push(b.top[0] - 0.06, b.top[1], b.top[2], b.top[0] + 0.06, b.top[1], b.top[2])
    }
    return segs(l)
  }, [balloons])
  const tags = useDisposable(() => balloons.map((b) => markTexture(String(b.n), b.text, { ring: c.edge, fill: c.surface, mark: c.fg, name: c.fg })), [balloons, c])
  const caption = useDisposable(
    () =>
      textTexture(640, 96, (ctx) => {
        ctx.fillStyle = c.fg
        ctx.font = `700 46px ${FONT}`
        ctx.textBaseline = 'middle'
        ctx.fillText('FIG. 1', 8, 50)
        ctx.font = `400 40px ${FONT}`
        ctx.fillText('General arrangement', 190, 50)
      }),
    [c],
  )
  return (
    <>
      <Screen grade={gradeOf(mode)} />
      <Lights preset={{ amb: 2, sun: 0, hemi: 0, color: '#FFFFFF', sunColor: '#FFFFFF', ground: '#000000' }} power={power} />
      <Dots dots={dots} color={c.edge} />
      <lineSegments geometry={art.ink} material={lineMat(c.edge)} />
      <lineSegments geometry={art.faint} material={lineMat(c.muted)} />
      <group ref={labels}>
        <lineSegments geometry={leaders} material={lineMat(c.edge)} />
        {balloons.map((b, i) => (
          <MarkTag key={i} map={tags[i]} at={b.at} h={0.6} />
        ))}
        <mesh position={[sheet.x0 + 0.6 + 1.5, 0.008, sheet.z1 - 0.7]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[3, 0.45]} />
          <meshBasicMaterial map={caption} transparent depthWrite={false} toneMapped={false} />
        </mesh>
      </group>
    </>
  )
}
