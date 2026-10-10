import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AdditiveBlending, BoxGeometry, Color, CylinderGeometry, DoubleSide, Group, InstancedMesh, Material, Mesh, MeshBasicMaterial, Object3D, PlaneGeometry, Points,
  RepeatWrapping, ShaderMaterial, Sprite, SpriteMaterial, Vector3,
} from 'three'
import type { BufferAttribute, Camera } from 'three'

import { agents, databases, frameworks } from '../../../../workspace/-workspace/workspace.constants'
import type { Lab } from '../../lab.types'
import { Dynamic, FONT, Fill, Lines, Tag, label, textTexture, useFills, useLines, useWriter } from './lines'
import type { V3 } from './lines'
import type { Look, WorldId } from './look'
import { BASE, BELT, BOARD, REDUCED } from './sim'
import type { Sim } from './sim'

export type Power = { current: number }
export type Transition = { t: number; from: Look; to: Look; active: boolean }
export type Revision = { ref: string; title: string; time: string }

const dummy = new Object3D()
const Y = 0.012
/** Lamp hum: a small brightness step at most every 0.4 s, never a flicker above 3 Hz. */
const hum = (time: number, i: number) => {
  const x = Math.sin(Math.floor(time / 0.4 + i * 0.37) * 78.233 + i) * 43758.5453
  return 0.97 + 0.03 * (x - Math.floor(x))
}

export function WorldStage({ world, c, sim, power, lab, log, covers }: { world: WorldId; c: Look; sim: Sim; power: Power; lab: Lab; log: readonly Revision[]; covers: { current: readonly Cover[] } }) {
  return (
    <>
      <Lights world={world} c={c} power={power} />
      <fog attach="fog" args={[c.fog, 60, 160]} />
      {world === 'blueprint' && <Blueprint c={c} lab={lab} log={log} covers={covers} />}
      {world === 'night' && <NightShift c={c} power={power} sim={sim} />}
      {world === 'cleanroom' && <Cleanroom c={c} sim={sim} />}
    </>
  )
}

function Lights({ world, c, power }: { world: WorldId; c: Look; power: Power }) {
  const amb = useRef<{ intensity: number }>(null)
  const sun = useRef<{ intensity: number }>(null)
  const hemi = useRef<{ intensity: number }>(null)
  const dark = c.dark
  const preset = {
    blueprint: { amb: 2, sun: 0, hemi: 0, color: '#FFFFFF', sunColor: '#FFFFFF' },
    night: { amb: dark ? 0.1 : 0.75, sun: dark ? 0.04 : 0.5, hemi: dark ? 0.16 : 0.45, color: dark ? '#6B7C8F' : '#E4ECF4', sunColor: '#C8D4E0' },
    cleanroom: { amb: dark ? 0.7 : 1.5, sun: dark ? 0.5 : 1.1, hemi: 0.5, color: '#FFE9A6', sunColor: '#FFF1C4' },
  }[world]
  useFrame(() => {
    const p = power.current
    if (amb.current) amb.current.intensity = preset.amb * p
    if (sun.current) sun.current.intensity = preset.sun * p
    if (hemi.current) hemi.current.intensity = preset.hemi * p
  })
  return (
    <>
      <ambientLight ref={amb as never} color={preset.color} />
      <directionalLight ref={sun as never} position={[8, 16, 10]} color={preset.sunColor} />
      <hemisphereLight ref={hemi as never} args={[preset.color, '#3A3328']} />
    </>
  )
}

type Note =
  | { kind: 'dim'; a: V3; b: V3; off: V3; text: string }
  | { kind: 'callout'; at: V3; to: V3; letter: string; text: string }

/** A screen rectangle in canvas pixels that a DOM panel covers. */
export type Cover = { x0: number; y0: number; x1: number; y1: number }

type Shape = {
  /** Points the hairlines run between: dims use A..B with ticks and extension lines, callouts run at..end. */
  ax: number; ay: number; az: number; bx: number; by: number; bz: number
  tx: number; ty: number; tz: number
  ox: number; oy: number; oz: number
  label: Vector3
  w: number
  h: number
  /** Where the ink starts and ends across the sprite, as fractions of its width; the rest is transparent. */
  ink: [number, number]
}
const corner = new Vector3()
const side = new Vector3()
let measure: CanvasRenderingContext2D | null = null
function inkWidth(text: string, size: number, track: number) {
  measure ??= document.createElement('canvas').getContext('2d')!
  measure.font = `500 ${size}px ${FONT}`
  measure.letterSpacing = `${track}px`
  return measure.measureText(text).width
}

function shapeOf(n: Note): Shape {
  if (n.kind === 'callout') {
    return {
      ax: n.at[0], ay: n.at[1], az: n.at[2], bx: n.to[0], by: n.to[1] - 0.2, bz: n.to[2], tx: 0, ty: 0, tz: 0, ox: 0, oy: 0, oz: 0,
      label: new Vector3(n.to[0] + 1.3, n.to[1], n.to[2]), w: 3.3, h: 3.3 * (120 / 760),
      ink: [16 / 760, (126 + inkWidth(n.text, 38, 4)) / 760],
    }
  }
  const A = new Vector3(n.a[0] + n.off[0], n.a[1] + n.off[1], n.a[2] + n.off[2])
  const B = new Vector3(n.b[0] + n.off[0], n.b[1] + n.off[1], n.b[2] + n.off[2])
  const u = B.clone().sub(A).normalize()
  const t = new Vector3(u.y ? 0.18 : -u.z * 0.18, u.y ? 0.18 : 0, u.x * 0.18).addScaledVector(u, 0.16)
  return {
    ax: A.x, ay: A.y, az: A.z, bx: B.x, by: B.y, bz: B.z, tx: t.x, ty: t.y, tz: t.z,
    ox: Math.sign(n.off[0]) * 0.25, oy: Math.sign(n.off[1]) * 0.25, oz: Math.sign(n.off[2]) * 0.25,
    label: new Vector3((A.x + B.x) / 2, (A.y + B.y) / 2 + 0.34, (A.z + B.z) / 2), w: 2.9, h: 2.9 * (96 / 640),
    ink: [0.5 - inkWidth(n.text, 34, 3) / 1280, 0.5 + inkWidth(n.text, 34, 3) / 1280],
  }
}

/** True when the label's ink is inside the canvas and clear of every panel. */
function clear(s: Shape, camera: Camera, size: { width: number; height: number }, covers: readonly Cover[]) {
  corner.copy(s.label).project(camera)
  if (corner.z >= 1) return false
  const cx = ((corner.x + 1) / 2) * size.width, cy = ((1 - corner.y) / 2) * size.height
  side.setFromMatrixColumn(camera.matrixWorld, 0).multiplyScalar(s.w / 2).add(s.label).project(camera)
  const hw = Math.abs(((side.x + 1) / 2) * size.width - cx), hh = (hw * s.h) / s.w
  const x0 = cx - hw + s.ink[0] * 2 * hw, x1 = cx - hw + s.ink[1] * 2 * hw, y0 = cy - hh, y1 = cy + hh
  if (x0 < 4 || y0 < 4 || x1 > size.width - 4 || y1 > size.height - 4) return false
  for (const r of covers) if (x1 > r.x0 && x0 < r.x1 && y1 > r.y0 && y0 < r.y1) return false
  return true
}

/**
 * Dimension lines and lettered callouts that draw themselves on when their
 * label is in frame and clear of the DOM panels, in sheet order, and wipe off
 * when the camera leaves or a panel covers them.
 */
function Annotations({ notes, c, covers }: { notes: readonly Note[]; c: Look; covers: { current: readonly Cover[] } }) {
  const writer = useWriter(notes.length * 16, c.edge)
  const sprites = useRef<(Sprite | null)[]>([])
  const reveal = useMemo(() => new Float32Array(notes.length), [notes.length])
  const since = useMemo(() => new Float32Array(notes.length), [notes.length])
  const shapes = useMemo(() => notes.map(shapeOf), [notes])
  const edge = useMemo(() => new Color(c.edge), [c.edge])
  const dim = useMemo(() => new Color(c.dim), [c.dim])
  const maps = useMemo(
    () =>
      notes.map((n) =>
        n.kind === 'dim'
          ? label(n.text, { fg: c.edge, size: 34, w: 640, h: 96, track: 3 })
          : textTexture(760, 120, (ctx) => {
              ctx.strokeStyle = c.edge
              ctx.lineWidth = 4
              ctx.beginPath()
              ctx.arc(60, 60, 44, 0, Math.PI * 2)
              ctx.stroke()
              ctx.fillStyle = c.edge
              ctx.font = `600 50px ${FONT}`
              ctx.textAlign = 'center'
              ctx.textBaseline = 'middle'
              ctx.fillText(n.letter, 60, 63)
              ctx.textAlign = 'left'
              ctx.fillStyle = c.fg
              ctx.font = `500 38px ${FONT}`
              ctx.letterSpacing = '4px'
              ctx.fillText(n.text, 126, 64)
            }),
      ),
    [notes, c],
  )
  useEffect(() => () => maps.forEach((m) => m.dispose()), [maps])
  useFrame(({ camera, size }, dt) => {
    writer.begin()
    for (let i = 0; i < shapes.length; i++) {
      const n = notes[i], s = shapes[i]
      const on = clear(s, camera, size, covers.current)
      since[i] = on ? since[i] + dt : 0
      const target = on && since[i] > i * 0.09 ? 1 : 0
      reveal[i] = REDUCED ? target : reveal[i] + (target - reveal[i]) * (1 - Math.exp(-dt * (target ? 4.5 : 9)))
      const v = reveal[i] < 0.005 ? 0 : reveal[i]
      const sprite = sprites.current[i]
      if (sprite) (sprite.material as SpriteMaterial).opacity = v
      if (v === 0) continue
      if (n.kind === 'dim') {
        const mx = (s.ax + s.bx) / 2, my = (s.ay + s.by) / 2, mz = (s.az + s.bz) / 2
        writer.seg(mx + (s.ax - mx) * v, my + (s.ay - my) * v, mz + (s.az - mz) * v, mx + (s.bx - mx) * v, my + (s.by - my) * v, mz + (s.bz - mz) * v, edge)
        if (v > 0.85) {
          writer.seg(s.ax - s.tx, s.ay - s.ty, s.az - s.tz, s.ax + s.tx, s.ay + s.ty, s.az + s.tz, edge)
          writer.seg(s.bx - s.tx, s.by - s.ty, s.bz - s.tz, s.bx + s.tx, s.by + s.ty, s.bz + s.tz, edge)
          const ext = (v - 0.85) / 0.15
          writer.seg(n.a[0], n.a[1], n.a[2], n.a[0] + (s.ax + s.ox - n.a[0]) * ext, n.a[1] + (s.ay + s.oy - n.a[1]) * ext, n.a[2] + (s.az + s.oz - n.a[2]) * ext, dim)
          writer.seg(n.b[0], n.b[1], n.b[2], n.b[0] + (s.bx + s.ox - n.b[0]) * ext, n.b[1] + (s.by + s.oy - n.b[1]) * ext, n.b[2] + (s.bz + s.oz - n.b[2]) * ext, dim)
        }
      } else {
        writer.seg(s.ax, s.ay, s.az, s.ax + (s.bx - s.ax) * v, s.ay + (s.by - s.ay) * v, s.az + (s.bz - s.az) * v, edge)
        writer.circle(s.ax, s.ay, s.az, 0.07 * v, 'y', undefined, edge, 10)
      }
    }
    writer.done()
  })
  return (
    <>
      <Dynamic writer={writer} />
      {shapes.map((s, i) => (
        <sprite key={i} ref={(sp) => { sprites.current[i] = sp }} position={s.label} scale={[s.w, s.h, 1]}>
          <spriteMaterial map={maps[i]} transparent opacity={0} toneMapped={false} depthWrite={false} />
        </sprite>
      ))}
    </>
  )
}

function paperTexture(c: Look) {
  const t = textTexture(512, 512, (ctx) => {
    ctx.fillStyle = c.floor
    ctx.fillRect(0, 0, 512, 512)
    ctx.fillStyle = c.dark ? 'rgba(255,255,255,0.045)' : 'rgba(60,40,10,0.05)'
    for (let k = 0; k < 2600; k++) ctx.fillRect(Math.random() * 512, Math.random() * 512, 1.5, 1.5)
    ctx.fillStyle = c.dark ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.35)'
    for (let k = 0; k < 900; k++) ctx.fillRect(Math.random() * 512, Math.random() * 512, 2, 1)
    ctx.strokeStyle = c.floorEdge
    ctx.lineWidth = 1
    for (let k = 1; k < 5; k++) {
      const p = (k * 512) / 5
      ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, 512); ctx.moveTo(0, p); ctx.lineTo(512, p); ctx.stroke()
    }
    ctx.strokeStyle = c.dim
    ctx.lineWidth = 2
    ctx.strokeRect(0, 0, 512, 512)
  })
  t.wrapS = t.wrapT = RepeatWrapping
  t.repeat.set(96, 96)
  t.anisotropy = 16
  return t
}

function TitleBlock({ c, lab, log }: { c: Look; lab: Lab; log: readonly Revision[] }) {
  const key = `${log.map((r) => r.ref).join('|')}${lab.setup.framework}${lab.setup.database}${lab.setup.agent}`
  const map = useMemo(
    () =>
      textTexture(1200, 600, (ctx) => {
        const rows: [string, string, string, string][] = [
          ['A', `BASE · ${frameworks.find((f) => f.value === lab.setup.framework)!.label.toUpperCase()} + ${databases.find((d) => d.value === lab.setup.database)!.label.toUpperCase()}`, 'TOOLKIT', ''],
          ...log.map((r, i): [string, string, string, string] => [String.fromCharCode(66 + (i % 25)), `+ ${r.title.toUpperCase()}`, lab.setup.agent === 'none' ? 'YOU' : agents.find((a) => a.value === lab.setup.agent)!.label.split(' ')[0].toUpperCase(), r.time]),
        ]
        const shown = rows.length > 7 ? [rows[0], ['…', `${rows.length - 7} EARLIER REVISIONS`, '', ''] as [string, string, string, string], ...rows.slice(-5)] : rows
        const rev = rows[rows.length - 1][0]
        ctx.strokeStyle = c.edge
        ctx.fillStyle = c.edge
        ctx.lineWidth = 4
        ctx.strokeRect(4, 4, 1192, 592)
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.moveTo(4, 116); ctx.lineTo(1196, 116)
        ctx.moveTo(4, 470); ctx.lineTo(1196, 470)
        ctx.moveTo(760, 4); ctx.lineTo(760, 116)
        for (const x of [300, 600, 900]) { ctx.moveTo(x, 470); ctx.lineTo(x, 596) }
        ctx.stroke()
        ctx.letterSpacing = '6px'
        ctx.font = `600 54px ${FONT}`
        ctx.fillText('PAYLOAD TOOLKIT', 30, 76)
        ctx.font = `500 30px ${FONT}`
        ctx.letterSpacing = '4px'
        ctx.globalAlpha = 0.7
        ctx.fillText('ASSEMBLY CELL A · REVISION TABLE', 784, 50)
        ctx.globalAlpha = 1
        ctx.fillText(`${lab.setup.target === 'new' ? 'NEW PROJECT' : 'EXISTING PROJECT'} · ${lab.setup.packageManager.toUpperCase()}`, 784, 92)
        ctx.font = `500 22px ${FONT}`
        ctx.globalAlpha = 0.6
        const cols = [34, 130, 800, 1000]
        ;['REV', 'DESCRIPTION', 'BY', 'TIME'].forEach((h, i) => ctx.fillText(h, cols[i], 150))
        ctx.globalAlpha = 1
        ctx.letterSpacing = '1px'
        shown.forEach((r, i) => {
          const y = 196 + i * 40
          ctx.font = `${i === shown.length - 1 && log.length ? 600 : 500} 27px ${FONT}`
          ctx.fillStyle = i === shown.length - 1 && log.length ? c.accent : c.edge
          r.forEach((cell, k) => ctx.fillText(cell.length > 40 && k === 1 ? `${cell.slice(0, 39)}…` : cell, cols[k], y))
        })
        ctx.fillStyle = c.edge
        ctx.letterSpacing = '3px'
        const foot = [['DWG NO.', `PT-004 · REV ${rev}`], ['SCALE', '1 : 50'], ['SHEET', '1 OF 1'], ['DATE', new Date().toISOString().slice(0, 10)]]
        foot.forEach(([k, v], i) => {
          const x = 30 + i * 300
          ctx.globalAlpha = 0.6
          ctx.font = `500 20px ${FONT}`
          ctx.fillText(k, x, 506)
          ctx.globalAlpha = 1
          ctx.font = `500 30px ${FONT}`
          ctx.fillText(v, x, 556)
        })
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [c, key],
  )
  useEffect(() => () => map.dispose(), [map])
  return (
    <mesh position={[-2.0, Y + 0.004, 7.05]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[8.6, 4.3]} />
      <meshBasicMaterial map={map} transparent toneMapped={false} depthWrite={false} />
    </mesh>
  )
}

function Blueprint({ c, lab, log, covers }: { c: Look; lab: Lab; log: readonly Revision[]; covers: { current: readonly Cover[] } }) {
  const paper = useMemo(() => paperTexture(c), [c])
  useEffect(() => () => paper.dispose(), [paper])
  const sheet: V3[] = [[-14.5, Y, -7.5], [18.5, Y, -7.5], [18.5, Y, 9.4], [-14.5, Y, 9.4]]
  const solid = useLines((pen) => {
    pen.line(sheet, true)
    pen.line(sheet.map(([x, y, z]) => [x + Math.sign(2 - x) * 0.4, y, z + Math.sign(0.9 - z) * 0.4]), true)
    pen.line([[-12.6, Y, -4.7], [-12.6, Y, -6.5], [-12.95, Y, -6.0], [-12.6, Y, -6.5], [-12.25, Y, -6.0]])
    pen.circle(-12.6, Y, -5.6, 1.1, 'y', 40)
    for (let k = 0; k <= 32; k++) pen.seg(-15.1, Y, -8 + k * 0.5, -15.1 - (k % 2 ? 0.18 : 0.34), Y, -8 + k * 0.5)
    pen.seg(-15.1, Y, -8, -15.1, Y, 8)
    for (let k = 0; k < 4; k++) pen.seg(-14.5 + 0.4, Y, 9.4 - 0.4 - k * 0.5, -14.5 + 0.4 + 3.2, Y, 9.4 - 0.4 - k * 0.5)
  }, [])
  const dashed = useLines((pen) => {
    const pts: V3[] = []
    for (let k = 0; k <= 48; k++) {
      const a = -0.95 + (k / 48) * 2.1
      pts.push([BASE.x + Math.cos(a) * 7.6, Y + 0.01, BASE.z + Math.sin(a) * 7.6])
    }
    pen.line(pts)
  }, [])
  const north = useMemo(() => label('N', { fg: c.edge, size: 64, w: 128, h: 128, weight: 600, track: 0 }), [c])
  const legend = useMemo(() => label('PT-004 · DO NOT SCALE DRAWING', { fg: c.dim, size: 26, w: 512, h: 64, align: 'right', track: 3 }), [c])
  useEffect(() => () => { north.dispose(); legend.dispose() }, [north, legend])
  const integrator = lab.setup.agent === 'claude' ? 'CLAUDE DRONE' : lab.setup.agent === 'codex' ? 'CODEX HEXAPOD' : null
  const notes = useMemo<Note[]>(() => [
    { kind: 'callout', at: [-5.2, 4.6, -2], to: [-4.2, 6.4, -2.6], letter: 'A', text: 'PICK CABINET' },
    { kind: 'callout', at: [-0.6, 0.9, 1.6], to: [-0.2, 3.4, 2.6], letter: 'B', text: 'CONVEYOR' },
    { kind: 'callout', at: [BASE.x, 1.9, BASE.z], to: [1.4, 7.4, -3.4], letter: 'C', text: 'PICK & PLACE ARM' },
    { kind: 'callout', at: [13.2, 0.5, -3.2], to: [13.4, 3.6, -3.6], letter: 'D', text: 'APP BOARD' },
    ...(integrator ? [{ kind: 'callout', at: [9.6, 3.2, -0.3], to: [7.2, 6.2, -2.4], letter: 'E', text: integrator } as Note] : []),
    { kind: 'dim', a: [BELT.start - 0.5, 0, 2.3], b: [BELT.end + 0.5, 0, 2.3], off: [0, 0, 1.6], text: '6.40 m CONVEYOR' },
    { kind: 'dim', a: [BOARD.x0, 0, BOARD.z1], b: [BOARD.x1, 0, BOARD.z1], off: [0, 0, 1.3], text: '8.75 m' },
    { kind: 'dim', a: [BOARD.x1, 0, BOARD.z0], b: [BOARD.x1, 0, BOARD.z1], off: [1.4, 0, 0], text: '6.90 m' },
    { kind: 'dim', a: [-10.7, 0, -3.1], b: [-10.7, 4.5, -3.1], off: [-1.2, 0, 0], text: '4.50 m' },
  ], [integrator])
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.004, 0]}>
        <planeGeometry args={[240, 240]} />
        <meshBasicMaterial map={paper} toneMapped={false} />
      </mesh>
      <Lines geometry={solid} color={c.dim} />
      <Lines geometry={dashed} color={c.accent} dashed={[0.25, 0.18]} />
      <Tag text="R 7.60 SAFETY" position={[BASE.x + 6.4, Y + 0.02, BASE.z + 5.9]} c={c} scale={0.55} flat color={c.accent} track={3} />
      <mesh position={[-12.6, Y + 0.01, -7.2]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[0.7, 0.7]} />
        <meshBasicMaterial map={north} transparent toneMapped={false} depthWrite={false} />
      </mesh>
      <mesh position={[14.2, Y + 0.01, 8.7]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[4.6, 4.6 * (64 / 512)]} />
        <meshBasicMaterial map={legend} transparent toneMapped={false} depthWrite={false} />
      </mesh>
      <TitleBlock c={c} lab={lab} log={log} />
      <Annotations notes={notes} c={c} covers={covers} />
    </group>
  )
}

const beamVertex = /* glsl */ `
varying float vY;
varying vec3 vN;
varying vec3 vV;
void main() {
  vY = uv.y;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vN = normalize(normalMatrix * normal);
  vV = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}`
const beamFragment = /* glsl */ `
uniform vec3 color;
uniform float strength;
varying float vY;
varying vec3 vN;
varying vec3 vV;
void main() {
  float rim = pow(abs(dot(vN, vV)), 1.6);
  float a = pow(vY, 1.7) * rim * strength;
  gl_FragColor = vec4(color * a, a);
}`

const LAMPS: V3[] = [[-7.2, 13, 1.4], [-1, 13, 1.6], [4.5, 14, -0.4], [9.8, 13, -0.3], [13.2, 13, 2.4]]

function NightShift({ c, power, sim }: { c: Look; power: Power; sim: Sim }) {
  const dark = c.dark
  const beam = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: beamVertex,
        fragmentShader: beamFragment,
        uniforms: { color: { value: new Color('#FFA347') }, strength: { value: dark ? 0.42 : 0.26 } },
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        side: DoubleSide,
      }),
    [dark],
  )
  useEffect(() => () => beam.dispose(), [beam])
  const beams = useFills(() => LAMPS.map((at) => new CylinderGeometry(0.7, 3.6, at[1] - 0.5, 32, 1, true).translate(at[0], at[1] / 2 - 0.2, at[2])), [])
  const fixtures = useFills(() => LAMPS.map((at) => new CylinderGeometry(0.18, 0.75, 0.5, 20, 1, true).translate(at[0], at[1] - 0.2, at[2])), [])
  const bulbs = useFills(() => LAMPS.map((at) => new CylinderGeometry(0.66, 0.66, 0.04, 20).translate(at[0], at[1] - 0.46, at[2])), [])
  const pools = useFills(() => LAMPS.map((at) => new PlaneGeometry(10, 10).rotateX(-Math.PI / 2).translate(at[0], 0.015, at[2])), [])
  const pool = useMemo(
    () =>
      textTexture(256, 256, (ctx) => {
        const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128)
        g.addColorStop(0, 'rgba(255,170,80,0.8)')
        g.addColorStop(0.4, 'rgba(255,150,60,0.26)')
        g.addColorStop(1, 'rgba(255,140,50,0)')
        ctx.fillStyle = g
        ctx.fillRect(0, 0, 256, 256)
      }),
    [],
  )
  useEffect(() => () => pool.dispose(), [pool])
  const lights = useRef<({ intensity: number } | null)[]>([])
  const poolMat = useRef<MeshBasicMaterial>(null)
  const dust = useRef<Points>(null)
  const beacon = useRef<Group>(null)
  const beaconLight = useRef<{ intensity: number }>(null)
  const motes = useMemo(() => {
    const n = 320
    const pos = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) {
      const lamp = LAMPS[i % LAMPS.length]
      const y = Math.random() * 9
      const r = (1 - y / 10) * 3 * Math.sqrt(Math.random())
      const a = Math.random() * Math.PI * 2
      pos.set([lamp[0] + Math.cos(a) * r, y, lamp[2] + Math.sin(a) * r], i * 3)
    }
    return pos
  }, [])
  useFrame(({ clock }) => {
    const p = power.current
    beam.uniforms.strength.value = (dark ? 0.42 : 0.26) * p
    for (let i = 0; i < lights.current.length; i++) {
      const l = lights.current[i]
      if (l) l.intensity = (dark ? 60 : 26) * p * (REDUCED ? 1 : hum(clock.elapsedTime, i))
    }
    if (poolMat.current) poolMat.current.opacity = p * (dark ? 0.9 : 0.62)
    const pts = dust.current
    if (pts) {
      if (!REDUCED) {
        const attr = pts.geometry.getAttribute('position') as BufferAttribute
        const arr = attr.array as Float32Array
        for (let i = 0; i < arr.length; i += 3) {
          arr[i + 1] += 0.004 * Math.sin(clock.elapsedTime + i)
          arr[i] += 0.003 * Math.cos(clock.elapsedTime * 0.7 + i)
        }
        attr.needsUpdate = true
      }
      ;(pts.material as Material).opacity = p * (dark ? 0.7 : 0.3)
    }
    const turn = REDUCED ? 0.5 : Math.abs(Math.sin(clock.elapsedTime * 5))
    const b = beacon.current
    if (b) {
      const on = sim.arm.busy
      if (!REDUCED) b.rotation.y = clock.elapsedTime * 5
      b.scale.setScalar(Math.max(0.001, on))
      for (const child of b.children) ((child as Mesh).material as MeshBasicMaterial).opacity = on * (0.12 + 0.3 * turn)
    }
    if (beaconLight.current) beaconLight.current.intensity = sim.arm.busy * p * (dark ? 24 : 8) * (0.4 + 0.6 * turn)
  })
  const racks = useLines((pen) => {
    const z = -12, depth = 2.2
    const box = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) => pen.box((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, x1 - x0, y1 - y0, z1 - z0)
    for (let x = -26; x <= 30; x += 3.2) {
      pen.seg(x, 0, z, x, 9, z); pen.seg(x, 0, z - depth, x, 9, z - depth)
      for (let k = 0; k < 6; k++) pen.seg(x, (k * 9) / 6, z, x, ((k + 1) * 9) / 6, z - depth)
      if (x + 3.2 > 30) continue
      for (const y of [0.2, 3, 6]) {
        pen.seg(x, y, z, x + 3.2, y, z); pen.seg(x, y, z - depth, x + 3.2, y, z - depth)
        const h = ((x * 7 + y * 13) % 5) / 5
        if (h > 0.25) box(x + 0.3, y + 0.15, z - 0.2, x + 2.9, y + 0.15 + 1.2 + h, z - depth + 0.2)
      }
    }
    for (let x = -24; x <= 30; x += 6) pen.seg(x, 16, -20, x, 16, 12)
    for (const zz of [-20, -6, 12]) pen.seg(-24, 16, zz, 30, 16, zz)
    for (const at of LAMPS) pen.seg(at[0], at[1], at[2], at[0], at[1] + 6, at[2])
    pen.line([[20, 0, -6], [20, 7, -6], [20, 7, 2], [20, 0, 2]])
    for (let k = 0; k < 12; k++) pen.seg(20, 0.5 + k * 0.55, -5.8, 20, 0.5 + k * 0.55, 1.8)
    for (let k = -8; k <= 8; k++) pen.seg(BASE.x + k * 0.45 - 1.2, 0.012, BASE.z + 2.4, BASE.x + k * 0.45 + 1.2, 0.012, BASE.z)
  }, [])
  const lanes = useLines((pen) => {
    pen.rect(1.8, 0.01, 0.3, 27.6, 9.8)
    pen.rect(1.8, 0.01, 0.3, 28.8, 11)
  }, [])
  const exit = useMemo(() => label('EXIT', { fg: '#0E1A12', bg: '#3BE07A', size: 60, w: 256, h: 112, weight: 700, track: 6 }), [])
  const dock = useMemo(() => label('DOCK 03 · OUTBOUND', { fg: dark ? '#FFC24A' : '#5A4310', size: 42, w: 768, h: 96, track: 5 }), [dark])
  useEffect(() => () => { exit.dispose(); dock.dispose() }, [exit, dock])
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} renderOrder={-1}>
        <planeGeometry args={[220, 220]} />
        <meshBasicMaterial color={c.floor} depthWrite={false} toneMapped={false} />
      </mesh>
      <mesh geometry={pools}>
        <meshBasicMaterial ref={poolMat} map={pool} transparent blending={AdditiveBlending} depthWrite={false} toneMapped={false} />
      </mesh>
      <Lines geometry={lanes} color={dark ? '#C9A227' : '#9A7A10'} dashed={[0.6, 0.4]} />
      <Lines geometry={racks} color={dark ? '#2B353C' : '#77838A'} mirror={c.mirror * 0.6} />
      <Fill geometry={fixtures} c={c} color={c.surface} />
      <mesh geometry={bulbs}>
        <meshBasicMaterial color="#FFC37A" toneMapped={false} />
      </mesh>
      <mesh geometry={beams} material={beam} />
      {LAMPS.map((at, i) => (
        <pointLight key={i} ref={(l) => { lights.current[i] = l }} position={[at[0], at[1] - 1, at[2]]} color="#FFA54A" distance={18} decay={1.4} />
      ))}
      <points ref={dust}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[motes, 3]} />
        </bufferGeometry>
        <pointsMaterial color="#FFD39A" size={2} sizeAttenuation={false} transparent blending={AdditiveBlending} depthWrite={false} toneMapped={false} />
      </points>
      <mesh position={[-13.8, 6.4, -8.6]}>
        <planeGeometry args={[1.6, 0.7]} />
        <meshBasicMaterial map={exit} toneMapped={false} />
      </mesh>
      <mesh position={[19.95, 7.6, -2]} rotation={[0, -Math.PI / 2, 0]}>
        <planeGeometry args={[6, 0.75]} />
        <meshBasicMaterial map={dock} transparent toneMapped={false} />
      </mesh>
      <group position={[BASE.x + 0.78, 0.52, BASE.z + 0.42]}>
        <mesh>
          <sphereGeometry args={[0.1, 10, 8]} />
          <meshBasicMaterial color="#FFB454" toneMapped={false} />
        </mesh>
        <group ref={beacon}>
          {[0, 1].map((k) => (
            <mesh key={k} rotation={[0, (k * Math.PI) / 2, 0]}>
              <planeGeometry args={[1.5, 0.22]} />
              <meshBasicMaterial color="#FFB454" transparent opacity={0} blending={AdditiveBlending} depthWrite={false} side={DoubleSide} toneMapped={false} />
            </mesh>
          ))}
        </group>
        <pointLight ref={beaconLight as never} color="#FFB454" distance={9} decay={1.6} />
      </group>
    </group>
  )
}

function Cleanroom({ c, sim }: { c: Look; sim: Sim }) {
  const dark = c.dark
  const W = { x0: -13, x1: 17.4, z0: -6.4, z1: 7.2, back: 7.5, front: 1.1 }
  const glass = dark ? '#FFD86B' : '#F2D45C'
  const floor = useMemo(() => {
    const t = textTexture(512, 512, (ctx) => {
      ctx.fillStyle = c.floor
      ctx.fillRect(0, 0, 512, 512)
      ctx.strokeStyle = c.floorEdge
      ctx.lineWidth = 1
      for (let k = 1; k < 4; k++) {
        const p = (k * 512) / 4
        ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, 512); ctx.moveTo(0, p); ctx.lineTo(512, p); ctx.stroke()
      }
      ctx.strokeStyle = c.edge
      ctx.lineWidth = 2
      ctx.strokeRect(0, 0, 512, 512)
    })
    t.wrapS = t.wrapT = RepeatWrapping
    t.repeat.set((W.x1 - W.x0) / 1.2, (W.z1 - W.z0) / 1.2)
    t.anisotropy = 16
    return t
  }, [c, W.x0, W.x1, W.z0, W.z1])
  useEffect(() => () => floor.dispose(), [floor])
  const sign = useMemo(() => label('ISO 5 · CLASS 100 · GOWN UP', { fg: c.fg, bg: dark ? '#2E2817' : '#FFF6CF', stroke: c.edge, size: 32, w: 768, h: 96, track: 5 }), [c, dark])
  const shower = useMemo(() => label('AIR SHOWER', { fg: c.fg, size: 34, w: 512, h: 80, track: 5 }), [c])
  useEffect(() => () => { sign.dispose(); shower.dispose() }, [sign, shower])
  const [tick, setTick] = useState(0)
  useEffect(() => {
    if (REDUCED) return
    const id = setInterval(() => setTick((n) => n + 1), 700)
    return () => clearInterval(id)
  }, [])
  const counter = useMemo(
    () =>
      textTexture(512, 160, (ctx) => {
        ctx.fillStyle = '#0B0E0C'
        ctx.fillRect(0, 0, 512, 160)
        ctx.fillStyle = '#69F0A0'
        ctx.font = `500 28px ${FONT}`
        ctx.letterSpacing = '3px'
        ctx.fillText('PARTICLES ≥0.5µm / ft³', 24, 52)
        ctx.font = `600 64px ${FONT}`
        ctx.fillText(String(Math.floor(3 + Math.abs(Math.sin(tick * 1.7)) * 9 + sim.air * 40)).padStart(3, '0'), 24, 130)
      }),
    [tick, sim],
  )
  useEffect(() => () => counter.dispose(), [counter])
  const streaks = useRef<InstancedMesh>(null)
  const lamp = useRef<Mesh>(null)
  const green = useMemo(() => new Color('#3BE07A'), [])
  const amber = useMemo(() => new Color('#F2B544'), [])
  useFrame(({ clock }) => {
    const m = streaks.current
    const on = sim.air > 0
    if (m) {
      m.visible = on
      if (on) {
        for (let i = 0; i < 24; i++) {
          const t = (clock.elapsedTime * 3 + i * 0.137) % 1
          const side = i % 2 ? 1 : -1
          dummy.position.set(-3.2 + ((i * 0.37) % 0.7), 0.95 + ((i * 0.53) % 1.4), BELT.z + side * (0.95 - t * 0.8))
          dummy.rotation.set(0, 0, 0)
          dummy.scale.setScalar(Math.max(0.001, 1 - t))
          dummy.updateMatrix()
          m.setMatrixAt(i, dummy.matrix)
        }
        m.instanceMatrix.needsUpdate = true
      }
    }
    if (lamp.current) (lamp.current.material as MeshBasicMaterial).color.copy(on ? green : amber)
  })
  const walls = [
    { from: [W.x0, 0, W.z0] as V3, to: [W.x1, 0, W.z0] as V3, h: W.back },
    { from: [W.x0, 0, W.z0] as V3, to: [W.x0, 0, W.z1] as V3, h: W.back },
    { from: [W.x1, 0, W.z0] as V3, to: [W.x1, 0, W.z1] as V3, h: W.front },
    { from: [W.x0, 0, W.z1] as V3, to: [W.x1, 0, W.z1] as V3, h: W.front },
  ]
  const frames = useLines((pen) => {
    for (const w of walls) {
      const len = Math.hypot(w.to[0] - w.from[0], w.to[2] - w.from[2])
      const n = Math.ceil(len / 2.5)
      for (let k = 0; k <= n; k++) {
        const t = k / n
        const x = w.from[0] + (w.to[0] - w.from[0]) * t, z = w.from[2] + (w.to[2] - w.from[2]) * t
        pen.seg(x, 0, z, x, w.h, z)
      }
      pen.seg(w.from[0], w.h, w.from[2], w.to[0], w.h, w.to[2])
      pen.seg(w.from[0], 0.3, w.from[2], w.to[0], 0.3, w.to[2])
    }
    for (let k = 0; k < 13; k++) pen.seg(W.x0 + k * 2.53, W.back, W.z0, W.x0 + k * 2.53, W.back, W.z0 + 2.4)
    for (const z of [-1.05, 1.05]) {
      pen.box(-3.15, 1.5, BELT.z + z, 0.9, 3.0, 0.32)
      for (let k = 0; k < 6; k++) pen.circle(-3.15, 0.6 + k * 0.38, BELT.z + z - Math.sign(z) * 0.17, 0.07, 'z', 12)
    }
    pen.box(-3.15, 3.18, BELT.z, 0.9, 0.36, 2.42)
    pen.rect(-12.2, 0.012, 2, 1.4, 4)
  }, [])
  const pillars = useFills(() => [
    ...[-1.05, 1.05].map((z) => new BoxGeometry(0.9, 3.0, 0.32).translate(-3.15, 1.5, BELT.z + z)),
    new BoxGeometry(0.9, 0.36, 2.42).translate(-3.15, 3.18, BELT.z),
  ], [])
  const bars = useFills(() => Array.from({ length: 6 }, (_, k) => new BoxGeometry(3.6, 0.18, 0.1).translate(W.x0 + 2.5 + k * 5, W.back - 0.4, W.z0 + 0.05)), [])
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[2.2, -0.004, 0.4]} renderOrder={-1}>
        <planeGeometry args={[W.x1 - W.x0, W.z1 - W.z0]} />
        <meshBasicMaterial map={floor} depthWrite={false} toneMapped={false} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[2.2, -0.02, 0.4]}>
        <planeGeometry args={[240, 240]} />
        <meshBasicMaterial color={c.fog} toneMapped={false} />
      </mesh>
      {walls.map((w, i) => (
        <mesh key={i} position={[(w.from[0] + w.to[0]) / 2, w.h / 2, (w.from[2] + w.to[2]) / 2]} rotation={[0, Math.atan2(-(w.to[2] - w.from[2]), w.to[0] - w.from[0]), 0]}>
          <planeGeometry args={[Math.hypot(w.to[0] - w.from[0], w.to[2] - w.from[2]), w.h]} />
          <meshBasicMaterial color={glass} transparent opacity={dark ? 0.06 : 0.12} side={DoubleSide} depthWrite={false} />
        </mesh>
      ))}
      <Lines geometry={frames} color={c.edge} mirror={c.mirror} />
      <mesh geometry={bars}>
        <meshBasicMaterial color={dark ? '#FFD86B' : '#FFE38A'} toneMapped={false} />
      </mesh>
      <mesh position={[-4, 4.2, W.z0 + 0.06]}>
        <planeGeometry args={[6.4, 0.8]} />
        <meshBasicMaterial map={sign} toneMapped={false} />
      </mesh>
      <mesh position={[8, 4.4, W.z0 + 0.06]}>
        <planeGeometry args={[3.2, 1.0]} />
        <meshBasicMaterial map={counter} toneMapped={false} />
      </mesh>
      <Fill geometry={pillars} c={c} color={c.surface} />
      <sprite position={[-3.15, 3.75, BELT.z]} scale={[2.4, 0.38, 1]}>
        <spriteMaterial map={shower} transparent toneMapped={false} depthWrite={false} />
      </sprite>
      <mesh ref={lamp} position={[-3.15, 3.42, BELT.z]}>
        <sphereGeometry args={[0.07, 10, 8]} />
        <meshBasicMaterial color={amber} toneMapped={false} />
      </mesh>
      <instancedMesh ref={streaks} args={[undefined, undefined, 24]} visible={false} frustumCulled={false}>
        <boxGeometry args={[0.02, 0.02, 0.35]} />
        <meshBasicMaterial color={c.accent} toneMapped={false} />
      </instancedMesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[-12.2, 0.01, 2]}>
        <planeGeometry args={[1.4, 4]} />
        <meshBasicMaterial color={dark ? '#24405A' : '#DCEAF2'} />
      </mesh>
    </group>
  )
}

const TILE = { x0: -14, x1: 18, z0: -7, z1: 8, size: 1 }

/** The floor flips tile by tile from the old world to the new one during a world change. */
export function TileFlip({ tr }: { tr: { current: Transition } }) {
  const nx = (TILE.x1 - TILE.x0) / TILE.size, nz = (TILE.z1 - TILE.z0) / TILE.size
  const count = nx * nz
  const ref = useRef<InstancedMesh>(null)
  const faces = useRef<{ key: string } | null>(null)
  const geometry = useMemo(() => {
    const g = new BoxGeometry(TILE.size, 0.04, TILE.size)
    g.clearGroups()
    g.addGroup(12, 6, 0)
    g.addGroup(18, 6, 1)
    return g
  }, [])
  useEffect(() => () => geometry.dispose(), [geometry])
  useEffect(() => () => {
    for (const m of (ref.current?.material ?? []) as MeshBasicMaterial[]) m.map?.dispose()
  }, [])
  const tex = (look: Look) =>
    textTexture(64, 64, (ctx) => {
      ctx.fillStyle = look.floor
      ctx.fillRect(0, 0, 64, 64)
      ctx.strokeStyle = look.edge
      ctx.lineWidth = 2
      ctx.strokeRect(1, 1, 62, 62)
    })
  useFrame(() => {
    const m = ref.current
    if (!m) return
    const { t, from, to, active } = tr.current
    m.visible = active && t > 0.08 && t < 0.96
    if (!m.visible) return
    const key = `${from.world}${from.floor}${to.world}${to.floor}`
    if (faces.current?.key !== key) {
      const mats = m.material as MeshBasicMaterial[]
      mats[0].map?.dispose()
      mats[1].map?.dispose()
      mats[0].map = tex(from)
      mats[1].map = tex(to)
      mats[0].needsUpdate = true
      mats[1].needsUpdate = true
      faces.current = { key }
    }
    let i = 0
    const maxD = Math.hypot(TILE.x0 - BASE.x, TILE.z1 - BASE.z)
    for (let a = 0; a < nx; a++)
      for (let b = 0; b < nz; b++) {
        const x = TILE.x0 + (a + 0.5) * TILE.size, z = TILE.z0 + (b + 0.5) * TILE.size
        const d = Math.hypot(x - BASE.x, z - BASE.z) / maxD
        const local = Math.min(1, Math.max(0, (t - 0.1 - d * 0.5) / 0.3))
        const e = local < 0.5 ? 2 * local * local : 1 - Math.pow(-2 * local + 2, 2) / 2
        dummy.position.set(x, 0.03 + Math.sin(e * Math.PI) * 0.9, z)
        dummy.rotation.set(e * Math.PI, 0, 0)
        dummy.scale.setScalar(0.96)
        dummy.updateMatrix()
        m.setMatrixAt(i++, dummy.matrix)
      }
    m.instanceMatrix.needsUpdate = true
  })
  return (
    <instancedMesh ref={ref} args={[geometry, undefined, count]} visible={false} frustumCulled={false}>
      <meshBasicMaterial attach="material-0" toneMapped={false} />
      <meshBasicMaterial attach="material-1" toneMapped={false} />
    </instancedMesh>
  )
}
