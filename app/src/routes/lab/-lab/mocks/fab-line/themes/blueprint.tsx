import { useFrame } from '@react-three/fiber'
import { Grid } from '@react-three/drei'
import { useEffect, useMemo, useRef } from 'react'
import { Matrix4 } from 'three'
import type { Group, InstancedMesh } from 'three'

import type { StageProps, ThemeVariant, Tokens } from '../core/contract'
import { FONT, fillMat, lineMat, segs, textTexture } from '../core/three'
import { LineShadow, Lights, label } from './shared'

type V3 = [number, number, number]

const shared = { gold: '#D8B865', die: '#0C1014', led: '#3DDC84', ledBusy: '#7CFF9B', ledOff: '#1E3324', claude: '#D97757', claudeEdge: '#8C3F25', claudeInk: '#FFF4EC', claudeCable: '#BDB6AC', codexCable: '#2A2E31' }

const light: Tokens = {
  ...shared, flat: true, rough: 1, shadow: 0, s: 50, l: 80,
  bg: '#F2F6F9', surface: '#F2F6F9', fg: '#18375A', muted: '#5C7A99', edge: '#2F65A0', dim: '#A9C2DC', accent: '#E0482B', floor: '#F2F6F9', floorEdge: '#A9C2DC',
  board: '#EDF3F8', boardEdge: '#2F65A0', silk: '#2F65A0', trace: '#A9C2DC', lit: '#E0482B', body: '#F2F6F9', bodyEdge: '#2F65A0', ink: '#18375A', pin: '#7E9FC2', sub: '#E3ECF4', ghost: '#E6EEF5',
  spark: '#E0482B', codex: '#18375A', codexInk: '#F2F6F9',
}
const dark: Tokens = {
  ...shared, flat: true, rough: 1, shadow: 0, s: 40, l: 40,
  bg: '#0C2440', surface: '#0C2440', fg: '#EAF2FA', muted: '#8FB0D0', edge: '#CFE0F2', dim: '#3B5D84', accent: '#FF8A5B', floor: '#0C2440', floorEdge: '#3B5D84',
  board: '#0E2A4A', boardEdge: '#CFE0F2', silk: '#CFE0F2', trace: '#3B5D84', lit: '#FF8A5B', body: '#0C2440', bodyEdge: '#CFE0F2', ink: '#EAF2FA', pin: '#8FB0D0', sub: '#143759', ghost: '#10304F',
  spark: '#FF8A5B', codex: '#EAF2FA', codexInk: '#0C2440',
}
const GRID = { light: { cell: '#D3E0EC', section: '#B4C9DE' }, dark: { cell: '#1B3A5E', section: '#2C527D' } }
const LIGHTS = { amb: 2, sun: 0, hemi: 0, color: '#FFFFFF', sunColor: '#FFFFFF', ground: '#3A3328' }

/** Dimension lines, callout leaders and the sheet border, all sized from the line's stations. */
function Annotations({ c, cam, line }: Pick<StageProps, 'c' | 'cam' | 'line'>) {
  const group = useRef<Group>(null)
  useFrame(() => {
    if (group.current) group.current.visible = !cam.closeUp
  })
  const data = useMemo(() => {
    const ink: number[] = []
    const faint: number[] = []
    const labels: { text: string; at: V3; letter?: string }[] = []
    const seg = (list: number[], a: V3, b: V3) => list.push(...a, ...b)
    const dim = (a: V3, b: V3, off: V3, text: string) => {
      const A: V3 = [a[0] + off[0], a[1] + off[1], a[2] + off[2]]
      const B: V3 = [b[0] + off[0], b[1] + off[1], b[2] + off[2]]
      seg(ink, A, B)
      const o = (p: V3, k: number): V3 => [p[0] + Math.sign(off[0]) * k, p[1] + Math.sign(off[1]) * k, p[2] + Math.sign(off[2]) * k]
      seg(faint, o(a, 0.25), o(A, 0.25))
      seg(faint, o(b, 0.25), o(B, 0.25))
      const tick = (p: V3) => {
        if (A[1] !== B[1]) seg(ink, [p[0] - 0.16, p[1] - 0.16, p[2]], [p[0] + 0.16, p[1] + 0.16, p[2]])
        else seg(ink, [p[0] - 0.16, p[1], p[2] + 0.16], [p[0] + 0.16, p[1], p[2] - 0.16])
      }
      tick(A)
      tick(B)
      labels.push({ text, at: [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2 + 0.38, (A[2] + B[2]) / 2] })
    }
    const dots: V3[] = []
    const callout = (at: V3, to: V3, letter: string, text: string) => {
      seg(ink, at, [to[0], to[1] - 0.2, to[2]])
      labels.push({ text, at: [to[0] + 1.35, to[1], to[2]], letter })
      dots.push(at)
    }
    const m = (v: number) => `${v.toFixed(2)} m`
    let letter = 65
    for (const stop of line.stops) {
      const b = stop.box
      const cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2
      const L = String.fromCharCode(letter++)
      if (stop.id === 'cabinet') {
        dim([b.x0, 0, b.z0 + 1.0], [b.x0, b.h, b.z0 + 1.0], [-1.1, 0, 0], m(b.h))
        callout([cx, b.h - 0.07, cz], [cx + 1.3, b.h + 2.1, cz - 0.6], L, stop.label.toUpperCase())
      } else if (stop.id === 'table') {
        callout([b.x1 - 0.5, b.h, b.z1 - 0.3], [b.x1 + 0.4, b.h + 2.0, b.z1 + 1.4], L, stop.label.toUpperCase())
      } else if (stop.id === 'transport') {
        dim([b.x0, 0, b.z1], [b.x1, 0, b.z1], [0, 0, 1.5], `${m(b.x1 - b.x0)} ${stop.label.toUpperCase()}`)
        callout([cx, b.h, cz], [cx + 0.6, b.h + 2.5, cz + 0.9], L, stop.label.toUpperCase())
      } else {
        dim([b.x0, 0, b.z1], [b.x1, 0, b.z1], [0, 0, 1.3], m(b.x1 - b.x0))
        dim([b.x1, 0, b.z0], [b.x1, 0, b.z1], [1.5, 0, 0], m(b.z1 - b.z0))
        callout([line.rail.x0 + 2.6, 0.5, line.rail.z], [line.rail.x0 + 3.4, 7.6, line.rail.z - 1.2], L, 'RAIL ARM')
        callout([b.x1 - 0.6, 0.5, b.z0 + 0.5], [b.x1 - 0.2, 3.8, b.z0 - 0.6], String.fromCharCode(letter++), 'APP BOARD')
      }
    }
    dim([line.rail.x0, 0, line.rail.z], [line.rail.x1, 0, line.rail.z], [0, 0, -1.4], `${m(line.rail.x1 - line.rail.x0)} LINEAR RAIL`)
    const x0 = line.extent.x0 - 1.7, x1 = line.extent.x1 + 2.0
    const sheet: V3[] = [[x0, 0.01, -9.2], [x1, 0.01, -9.2], [x1, 0.01, 9.4], [x0, 0.01, 9.4]]
    for (let i = 0; i < 4; i++) seg(faint, sheet[i], sheet[(i + 1) % 4])
    const inner: V3[] = [[x0 + 0.4, 0.01, -8.8], [x1 - 0.4, 0.01, -8.8], [x1 - 0.4, 0.01, 9.0], [x0 + 0.4, 0.01, 9.0]]
    for (let i = 0; i < 4; i++) seg(faint, inner[i], inner[(i + 1) % 4])
    const nx = x0 + 1.5
    seg(ink, [nx, 0.02, -6.6], [nx, 0.02, -8.4]); seg(ink, [nx, 0.02, -8.4], [nx - 0.35, 0.02, -7.9]); seg(ink, [nx, 0.02, -8.4], [nx + 0.35, 0.02, -7.9])
    for (let k = 0; k < 40; k++) {
      const a = (k / 40) * Math.PI * 2, b = ((k + 1) / 40) * Math.PI * 2
      seg(faint, [nx + Math.cos(a) * 1.1, 0.02, -7.5 + Math.sin(a) * 1.1], [nx + Math.cos(b) * 1.1, 0.02, -7.5 + Math.sin(b) * 1.1])
    }
    const sx = x0 + 0.85
    for (let k = 0; k < 33; k++) seg(ink, [sx, 0.05, -5 + k * 0.5], [sx - (k % 2 ? 0.18 : 0.34), 0.05, -5 + k * 0.5])
    seg(ink, [sx, 0.05, -5], [sx, 0.05, 11])
    seg(ink, [sx - 0.4, 0.05, -5], [sx - 0.4, 0.05, 11])
    return { ink: segs(ink), faint: segs(faint), labels, dots, north: [nx, 0.02, -9.1] as V3 }
  }, [line])
  useEffect(() => () => { data.ink.dispose(); data.faint.dispose() }, [data])
  const maps = useMemo(
    () =>
      data.labels.map((l) =>
        l.letter !== undefined
          ? textTexture(720, 120, (ctx) => {
              ctx.strokeStyle = c.edge
              ctx.lineWidth = 4
              ctx.beginPath()
              ctx.arc(60, 60, 44, 0, Math.PI * 2)
              ctx.stroke()
              ctx.fillStyle = c.edge
              ctx.font = `600 50px ${FONT}`
              ctx.textAlign = 'center'
              ctx.textBaseline = 'middle'
              ctx.fillText(l.letter ?? '', 60, 63)
              ctx.textAlign = 'left'
              ctx.fillStyle = c.fg
              ctx.font = `500 40px ${FONT}`
              ctx.fillText(l.text, 126, 64)
            })
          : label(l.text, { fg: c.edge, size: 40, w: 640, h: 96 }),
      ),
    [data, c],
  )
  useEffect(() => () => maps.forEach((m) => m.dispose()), [maps])
  const north = useMemo(() => label('N', { fg: c.edge, size: 64, w: 128, h: 128, weight: 600 }), [c])
  useEffect(() => () => north.dispose(), [north])
  const dots = useRef<InstancedMesh>(null)
  useEffect(() => {
    const m = new Matrix4()
    data.dots.forEach((d, i) => dots.current?.setMatrixAt(i, m.makeTranslation(...d)))
    if (dots.current) dots.current.instanceMatrix.needsUpdate = true
  }, [data])
  return (
    <group ref={group}>
      <lineSegments geometry={data.ink} material={lineMat(c.edge)} />
      <lineSegments geometry={data.faint} material={lineMat(c.dim)} />
      <instancedMesh key={data.dots.length} ref={dots} args={[undefined, undefined, data.dots.length]} material={fillMat(c.edge, true)}>
        <sphereGeometry args={[0.07, 8, 8]} />
      </instancedMesh>
      {data.labels.map((l, i) => (
        <sprite key={i} position={l.at} scale={l.letter ? [3.3, 0.55, 1] : [2.3, 0.345, 1]}>
          <spriteMaterial map={maps[i]} transparent toneMapped={false} depthWrite={false} />
        </sprite>
      ))}
      <mesh position={data.north} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[0.7, 0.7]} />
        <meshBasicMaterial map={north} transparent toneMapped={false} depthWrite={false} />
      </mesh>
    </group>
  )
}

function Stage({ c, mode, power, cam, line }: StageProps) {
  const grid = GRID[mode]
  return (
    <>
      <Lights preset={LIGHTS} power={power} />
      <Grid
        args={[140, 140]}
        cellSize={0.5}
        cellThickness={0.6}
        cellColor={grid.cell}
        sectionSize={2.5}
        sectionThickness={1}
        sectionColor={grid.section}
        fadeDistance={110}
        fadeStrength={1.5}
        infiniteGrid
      />
      <Annotations c={c} cam={cam} line={line} />
      <LineShadow c={c} line={line} />
    </>
  )
}

export const blueprint: ThemeVariant = {
  id: 'blueprint',
  label: 'Blueprint',
  scene: 'INT. DRAFTING TABLE',
  lens: { fov: 12, el: 36, frame: 1.0 },
  tokens: { light, dark },
  Stage,
}
