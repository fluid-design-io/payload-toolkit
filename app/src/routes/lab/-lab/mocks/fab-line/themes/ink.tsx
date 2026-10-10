import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { CircleGeometry, Matrix4 } from 'three'
import type { InstancedMesh } from 'three'

import type { Footprint, Mode, StageProps, ThemeVariant, Tokens } from '../core/contract'
import { FONT, fillMat, lineMat, segs } from '../core/three'
import { Screen, grainUrl, sheetOf, textTexture, useHideOnCloseUp, useTextures } from './grade'
import type { Grade } from './grade'
import { Lights } from './shared'

/**
 * A service manual's general-arrangement figure: one black ink and one red
 * spot colour on paper, near-axonometric lens, cast shadows drawn as hatching
 * from each station's footprint and height, a halftone contact shadow, and
 * numbered balloons. Dark prints white ink on black film.
 */
const light: Tokens = {
  bg: '#F4F1E8', surface: '#FAF8F2', fg: '#161616', muted: '#5A5750', edge: '#1A1A1A', dim: '#B9B4A8', accent: '#C8102E', floor: '#F4F1E8', floorEdge: '#CFC9BB',
  flat: true, rough: 1, shadow: 0, s: 0, l: 22,
  board: '#FAF8F2', boardEdge: '#1A1A1A', silk: '#1A1A1A', trace: '#B9B4A8', lit: '#C8102E', body: '#FAF8F2', bodyEdge: '#1A1A1A', ink: '#161616', pin: '#6E6A61', sub: '#E9E5DA', ghost: '#EFECE3',
  gold: '#8C8576', die: '#2A2A2A', led: '#C8102E', ledBusy: '#FF4A5E', ledOff: '#D8D3C6', spark: '#C8102E',
  claude: '#FAF8F2', claudeEdge: '#1A1A1A', claudeInk: '#C8102E', claudeCable: '#6E6A61',
  codex: '#1A1A1A', codexInk: '#FAF8F2', codexCable: '#6E6A61',
}
const dark: Tokens = {
  bg: '#121211', surface: '#171716', fg: '#EDEAE2', muted: '#9C978C', edge: '#E8E5DC', dim: '#4A4741', accent: '#FF5A47', floor: '#121211', floorEdge: '#34322E',
  flat: true, rough: 1, shadow: 0, s: 0, l: 78,
  board: '#171716', boardEdge: '#E8E5DC', silk: '#E8E5DC', trace: '#4A4741', lit: '#FF5A47', body: '#171716', bodyEdge: '#E8E5DC', ink: '#EDEAE2', pin: '#8F8A80', sub: '#22211F', ghost: '#1B1B19',
  gold: '#A39D90', die: '#050505', led: '#FF5A47', ledBusy: '#FF9C90', ledOff: '#33302C', spark: '#FFB3A8',
  claude: '#171716', claudeEdge: '#E8E5DC', claudeInk: '#FF5A47', claudeCable: '#8F8A80',
  codex: '#E8E5DC', codexInk: '#121211', codexCable: '#8F8A80',
}

const grades: Partial<Record<Mode, Grade>> = {}
const gradeOf = (mode: Mode): Grade =>
  (grades[mode] ??= {
    exact: true,
    layers: [{ backgroundImage: `url(${grainUrl(160, 23)})`, backgroundSize: '160px', mixBlendMode: mode === 'light' ? 'multiply' : 'screen', opacity: mode === 'light' ? '0.1' : '0.05', filter: mode === 'light' ? 'none' : 'invert(1)' }],
  })

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
  const geo = useMemo(() => new CircleGeometry(1, 6).rotateX(-Math.PI / 2), [])
  useEffect(() => () => geo.dispose(), [geo])
  useLayoutEffect(() => {
    const m = new Matrix4()
    dots.forEach(([x, z, r], i) => ref.current?.setMatrixAt(i, m.makeScale(r, 1, r).setPosition(x, 0.003, z)))
    if (ref.current) ref.current.instanceMatrix.needsUpdate = true
  }, [dots])
  return <instancedMesh key={dots.length} ref={ref} args={[geo, fillMat(color, true), dots.length]} frustumCulled={false} />
}

const PART: Record<string, string> = { cabinet: 'PARTS CABINET', table: 'PICK TABLE', transport: 'TRANSFER', board: 'APP BOARD ASSY' }

function Stage({ c, mode, power, cam, line }: StageProps) {
  const sheet = useMemo(() => sheetOf(line), [line])
  const labels = useHideOnCloseUp(cam)
  const stops = line.stops

  const art = useMemo(() => {
    const ink: number[] = [], faint: number[] = []
    for (const stop of stops) {
      const b = stop.box
      if (b.h < LOW) continue
      const poly = shadowOf(b)
      hatch(poly, HATCH[0], 0.22, 0.004, ink)
      if (b.h > 2.6) hatch(poly, HATCH[1], 0.3, 0.0045, ink)
    }
    const frame = (x0: number, z0: number, x1: number, z1: number, list: number[]) => list.push(x0, 0.006, z0, x1, 0.006, z0, x1, 0.006, z0, x1, 0.006, z1, x1, 0.006, z1, x0, 0.006, z1, x0, 0.006, z1, x0, 0.006, z0)
    frame(sheet.x0, sheet.z0, sheet.x1, sheet.z1, ink)
    frame(sheet.x0 + 0.22, sheet.z0 + 0.22, sheet.x1 - 0.22, sheet.z1 - 0.22, faint)
    return { ink: segs(ink), faint: segs(faint) }
  }, [stops, sheet])
  useEffect(() => () => { art.ink.dispose(); art.faint.dispose() }, [art])

  const dots = useMemo(() => {
    const out: Dot[] = []
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
          if (r > 0.014) out.push([x, z, r])
        }
    }
    return out
  }, [stops])

  const balloons = useMemo(
    () =>
      stops.map((stop, i) => {
        const b = stop.box
        const cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2
        const table = stop.id === 'table'
        const top: [number, number, number] = stop.id === 'board' ? [b.x0 + (b.x1 - b.x0) * 0.25, b.h, b.z0 + 0.6] : table ? [b.x0 + 0.9, b.h, b.z1 - 0.5] : [cx, b.h, cz]
        const at: [number, number, number] = table ? [b.x0 - 4.2, b.h + 1.4, b.z1 + 0.6] : [top[0] - 0.9, top[1] + (stop.id === 'board' ? 4.2 : 2.4), top[2] - 0.8]
        return { top, at, n: i + 1, text: PART[stop.id] ?? stop.label.toUpperCase() }
      }),
    [stops],
  )
  const leaders = useMemo(() => {
    const l: number[] = []
    for (const b of balloons) {
      l.push(...b.top, b.at[0] + 0.3, b.at[1] - 0.25, b.at[2])
      l.push(b.top[0] - 0.06, b.top[1], b.top[2], b.top[0] + 0.06, b.top[1], b.top[2])
    }
    return segs(l)
  }, [balloons])
  useEffect(() => () => leaders.dispose(), [leaders])
  const tex = useTextures(
    () => [
      ...balloons.map((b) =>
        textTexture(768, 128, (ctx) => {
          ctx.fillStyle = c.surface
          ctx.beginPath()
          ctx.arc(64, 64, 50, 0, Math.PI * 2)
          ctx.fill()
          ctx.strokeStyle = c.edge
          ctx.lineWidth = 5
          ctx.stroke()
          ctx.fillStyle = c.fg
          ctx.font = `700 56px ${FONT}`
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          ctx.fillText(String(b.n), 64, 68)
          ctx.textAlign = 'left'
          ctx.font = `600 42px ${FONT}`
          ctx.fillText(b.text, 136, 54)
          ctx.fillStyle = c.muted
          ctx.font = `400 28px ${FONT}`
          ctx.fillText(`SEE FIG. ${b.n + 1}`, 136, 98)
        }),
      ),
      textTexture(1536, 96, (ctx) => {
        ctx.fillStyle = c.fg
        ctx.font = `700 46px ${FONT}`
        ctx.textBaseline = 'middle'
        ctx.fillText('FIG. 1', 8, 50)
        ctx.font = `400 40px ${FONT}`
        ctx.fillText('General arrangement, fab line. Hatching shows cast shadow.', 190, 50)
      }),
    ],
    [balloons, c],
  )
  const caption = tex[tex.length - 1]
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
          <sprite key={i} position={[b.at[0] + 2.35, b.at[1], b.at[2]]} scale={[5.4, 0.9, 1]}>
            <spriteMaterial map={tex[i]} transparent depthWrite={false} toneMapped={false} />
          </sprite>
        ))}
        <mesh position={[sheet.x0 + 0.6 + 4.5, 0.008, sheet.z1 - 0.75]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[9, 0.5625]} />
          <meshBasicMaterial map={caption} transparent depthWrite={false} toneMapped={false} />
        </mesh>
      </group>
    </>
  )
}

export const ink: ThemeVariant = {
  id: 'ink',
  label: 'Manual ink',
  scene: 'INT. SERVICE MANUAL, P. 12',
  lens: { fov: 8, el: 33, frame: 1.0 },
  tokens: { light, dark },
  Stage,
}
