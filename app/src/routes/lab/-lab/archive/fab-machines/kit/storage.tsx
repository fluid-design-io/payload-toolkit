import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { JSX } from 'react'
import { useFrame } from '@react-three/fiber'
import { Color, Euler, Matrix4, Quaternion, Shape, ShapeGeometry, Sphere, TorusGeometry, Vector3 } from 'three'
import type { Group, InstancedMesh } from 'three'

import type { Database } from '../../../../../workspace/-workspace/workspace.types'
import { BRAND, BY, PORT, machine } from '../sim'
import type { Sim } from '../sim'
import { FONT, Flat, Hairline, MONO, Solid, fillMat, hover, lineMat, segmentWriter, textTexture, useSegments, useTexture } from './hairline'
import type { Look, Tip } from './hairline'

type Props = { sim: Sim; c: Look; tip: Tip; deploy: (id: Database) => void; labels: boolean }

const SHEETS = 26
const BEADS = 10
const LEDS = 8
const FACE = 0.605
const OFFSET = new Vector3(-0.76, 0.5, 0)
const M4 = new Matrix4()
const Q4 = new Quaternion()
const E4 = new Euler()
const P4 = new Vector3()
const ONE = new Vector3(1, 1, 1)
const NONE = new Vector3(0, 0, 0)
const END = new Vector3()
const CORNERS = [-1, 1].flatMap((x) => [-1, 1].flatMap((y) => [-1, 1].map((z) => new Vector3(x * 0.5, y * 0.0175, z * 0.37))))
const WORLD = CORNERS.map(() => new Vector3())
const BOX_EDGES = [0, 1, 2, 3, 4, 5, 6, 7, 0, 2, 1, 3, 4, 6, 5, 7, 0, 4, 1, 5, 2, 6, 3, 7]
/** Moving instances are never raycast against a cached sphere: three.js keeps the first one it computes. */
const SCENE_SPHERE = new Sphere(new Vector3(2, 2, 0), 40)

function cabinet() {
  const h = new Hairline().box(1.5, 3.2, 1.2, 0, 1.6, 0).box(1.56, 0.12, 1.26, 0, 3.26, 0)
  for (let k = 0; k < 4; k++) h.box(1.2, 0.14, 0.02, 0, 0.45 + k * 0.24, 0.61)
  return h.poly([[-0.72, 2.0, FACE], [0.72, 2.0, FACE], [0.72, 2.8, FACE], [-0.72, 2.8, FACE]], true).build()
}
function reel() {
  const h = new Hairline().geo(new TorusGeometry(0.3, 0.014, 4, 40), 0, 0, 0, undefined, 40, false)
  for (let k = 0; k < 3; k++) {
    const a = (k * Math.PI * 2) / 3 + Math.PI / 2
    h.seg(Math.cos(a) * 0.09, Math.sin(a) * 0.09, 0.005, Math.cos(a) * 0.29, Math.sin(a) * 0.29, 0.005)
  }
  return h.build()
}
const hubs = () => new Hairline().circle(-0.36, 2.4, FACE + 0.007, 0.09, 24, false, 'z').circle(0.36, 2.4, FACE + 0.007, 0.09, 24, false, 'z').build()
const port = () => new Hairline().box(0.3, 0.16, 0.3, PORT.x - 0.1, BY + 0.08, PORT.z).build()
const stacker = () => new Hairline().box(1.5, 0.3, 1.2, 0, 0.15, 0).seg(0.55, 0.3, -0.45, 0.55, 2.2, -0.45).build()
function leafShape() {
  const s = new Shape()
  s.moveTo(0, 0)
  s.quadraticCurveTo(0.62, 0.75, 0, 1.75)
  s.quadraticCurveTo(-0.62, 0.75, 0, 0)
  return s
}
// The leaf is mirror-symmetric, so a copy turned half a revolution is its back face and the shared fill material can stay single-sided.
const leaf = () =>
  new Hairline().geo(new ShapeGeometry(leafShape()), 0, 0, 0, undefined, 20).geo(new ShapeGeometry(leafShape()), 0, 0, 0, [0, Math.PI, 0], 20).seg(0, 0, 0, 0, 1.6, 0).build()

const label = (c: Look, brand: string, model: string, writes: number) =>
  textTexture(400, 200, (ctx) => {
    ctx.fillStyle = c.fg
    ctx.font = `500 54px ${FONT}`
    ctx.fillText(brand, 18, 66)
    ctx.fillStyle = c.muted
    ctx.font = `400 32px ${FONT}`
    ctx.fillText(model, 18, 114)
    ctx.font = `500 26px ${MONO}`
    ctx.fillText(`${writes} writes`, 18, 168)
  })

function useWrites(sim: Sim, id: Database) {
  const [writes, setWrites] = useState(sim.stores[id].writes)
  useFrame(() => {
    if (sim.stores[id].writes !== writes) setWrites(sim.stores[id].writes)
  })
  return writes
}

function bind(id: Database, sim: Sim, tip: Tip, deploy: (id: Database) => void) {
  const m = machine('storage', id)
  const parked = () => sim.rig.storage !== id
  return {
    onClick: (e: { stopPropagation: () => void }) => {
      e.stopPropagation()
      if (parked()) deploy(id)
    },
    ...hover(tip, () => `${m.brand} · ${m.model}`, () => (parked() ? 'Parked · click to roll it in' : m.note)),
  }
}

function cableAt(t: number, end: Vector3, out: Vector3) {
  return out.set(PORT.x + (end.x - PORT.x) * t, PORT.y + 0.02 + (end.y - PORT.y) * t * t - Math.sin(t * Math.PI) * 0.12, PORT.z + (end.z - PORT.z) * t)
}

// The last leg of every pulse path runs PORT to the store, so it rides the sagging cable instead of a straight chord.
function walk(path: Vector3[], t: number, end: Vector3, out: Vector3) {
  const last = path.length - 1
  const at = (k: number) => (k === last ? end : path[k])
  let total = 0
  for (let k = 1; k <= last; k++) total += at(k).distanceTo(at(k - 1))
  let left = t * total
  for (let k = 1; k <= last; k++) {
    const seg = at(k).distanceTo(at(k - 1))
    const f = seg ? Math.min(1, left / seg) : 1
    if (k === last) return cableAt(f, end, out)
    if (left <= seg) return out.lerpVectors(at(k - 1), at(k), f)
    left -= seg
  }
  return out.copy(end)
}

function Postgres({ sim, c, tip, deploy, labels }: Props) {
  const group = useRef<Group>(null)
  const reels = useRef<(Group | null)[]>([])
  const leds = useRef<InstancedMesh>(null)
  const phase = useRef(0)
  const on = useMemo(() => new Color(BRAND.postgres), [])
  const off = useMemo(() => new Color(c.dim), [c.dim])
  const writes = useWrites(sim, 'postgres')
  const top = useTexture(() => label(c, 'PostgreSQL', 'tape library', writes), [c, writes])
  useLayoutEffect(() => {
    const m = leds.current!
    for (let i = 0; i < LEDS; i++) {
      m.setMatrixAt(i, M4.makeTranslation(-0.49 + i * 0.14, 1.55, 0.615))
      m.setColorAt(i, off)
    }
    m.instanceMatrix.needsUpdate = true
  }, [off])
  useFrame((_, dt) => {
    const s = sim.stores.postgres
    group.current!.position.copy(s.pos)
    const idle = sim.idle ? 1 : 0
    for (let i = 0; i < 2; i++) {
      const r = reels.current[i]
      if (r) r.rotation.z -= dt * (0.4 * idle + s.kick * 14) * (i ? 1.3 : 1)
    }
    // The fastest LED, (3 + 7) times the phase rate over 2π, stays under the 3 Hz flash limit at a full kick.
    phase.current += dt * (0.6 * idle + s.kick * 1.2)
    const m = leds.current!
    for (let i = 0; i < LEDS; i++) m.setColorAt(i, Math.sin(phase.current * (3 + i) + i * 2) > 0.6 - s.kick * 1.5 ? on : off)
    m.instanceColor!.needsUpdate = true
  })
  return (
    <group ref={group} {...bind('postgres', sim, tip, deploy)}>
      <Solid build={cabinet} fill={c.surface} edge={c.edge} />
      {[-0.36, 0.36].map((x, i) => (
        <group key={x} position={[x, 2.4, FACE]} ref={(g) => { reels.current[i] = g }}>
          <Solid build={reel} fill={c.surface} edge={c.edge} />
        </group>
      ))}
      <Solid build={hubs} fill={c.surface} edge={BRAND.postgres} />
      <instancedMesh ref={leds} args={[undefined, undefined, LEDS]} frustumCulled={false}>
        <boxGeometry args={[0.06, 0.06, 0.02]} />
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
      {labels && <Flat texture={top} size={[1.4, 0.7]} position={[0, 3.33, 0]} />}
    </group>
  )
}

function Mongo({ sim, c, tip, deploy, labels }: Props) {
  const group = useRef<Group>(null)
  const sway = useRef<Group>(null)
  const sheets = useRef<InstancedMesh>(null)
  const edges = useSegments(SHEETS * 12, c.edge)
  const leafGeo = useMemo(leaf, [])
  useEffect(() => () => { leafGeo.fill?.dispose(); leafGeo.edge.dispose() }, [leafGeo])
  const writes = useWrites(sim, 'mongodb')
  const text = useTexture(() => label(c, 'MongoDB', 'document stacker', writes), [c, writes])
  useFrame(() => {
    const s = sim.stores.mongodb
    group.current!.position.copy(s.pos)
    sway.current!.rotation.set(0, Math.sin(sim.clock * 0.8) * 0.35, Math.sin(sim.clock * 1.3) * 0.05)
    const n = Math.min(SHEETS, s.writes + 3)
    const m = sheets.current!
    const w = segmentWriter(edges)
    for (let i = 0; i < n; i++) {
      const lift = i === n - 1 ? s.kick : 0
      P4.set(Math.sin(i * 2.3) * 0.04, 0.32 + i * 0.06 + lift * 0.9, Math.cos(i * 1.7) * 0.03)
      M4.compose(P4, Q4.setFromEuler(E4.set(0, Math.sin(i * 1.1) * 0.05, lift * 0.6)), ONE)
      m.setMatrixAt(i, M4)
      for (let k = 0; k < 8; k++) WORLD[k].copy(CORNERS[k]).applyMatrix4(M4)
      for (let e = 0; e < 24; e += 2) {
        const a = WORLD[BOX_EDGES[e]], b = WORLD[BOX_EDGES[e + 1]]
        w.add(a.x, a.y, a.z, b.x, b.y, b.z)
      }
    }
    m.count = n
    m.instanceMatrix.needsUpdate = true
    w.done()
  })
  return (
    <group ref={group} {...bind('mongodb', sim, tip, deploy)}>
      <Solid build={stacker} fill={c.surface} edge={c.edge} />
      <instancedMesh ref={sheets} args={[undefined, undefined, SHEETS]} material={fillMat(c.surface)} frustumCulled={false} boundingSphere={SCENE_SPHERE}>
        <boxGeometry args={[1.0, 0.035, 0.74]} />
      </instancedMesh>
      <primitive object={edges} />
      <group ref={sway} position={[0.55, 2.2, -0.45]}>
        {leafGeo.fill && <mesh geometry={leafGeo.fill} material={fillMat(BRAND.mongodb, 0.22)} />}
        <lineSegments geometry={leafGeo.edge} material={lineMat(BRAND.mongodb)} />
      </group>
      {labels && <Flat texture={text} size={[1.4, 0.7]} position={[0, 0.01, 1.0]} />}
    </group>
  )
}

function Cable({ sim, c }: { sim: Sim; c: Look }) {
  const cable = useSegments(16, c.edge)
  const beads = useRef<InstancedMesh>(null)
  useFrame(() => {
    END.copy(sim.stores[sim.rig.storage].pos).add(OFFSET)
    const w = segmentWriter(cable)
    let px = PORT.x, py = PORT.y + 0.02, pz = PORT.z
    for (let i = 1; i <= 16; i++) {
      cableAt(i / 16, END, P4)
      w.add(px, py, pz, P4.x, P4.y, P4.z)
      px = P4.x; py = P4.y; pz = P4.z
    }
    w.done()
    const m = beads.current!
    for (let i = 0; i < BEADS; i++) {
      const pl = sim.pulses[i]
      if (pl) walk(pl.path, pl.t, END, P4)
      m.setMatrixAt(i, M4.compose(P4, Q4.identity(), pl ? ONE : NONE))
    }
    m.instanceMatrix.needsUpdate = true
  })
  return (
    <>
      <primitive object={cable} />
      <instancedMesh ref={beads} args={[undefined, undefined, BEADS]} material={fillMat(c.accent)} frustumCulled={false} boundingSphere={SCENE_SPHERE}>
        <sphereGeometry args={[0.08, 12, 8]} />
      </instancedMesh>
    </>
  )
}

export function Storage({ sim, c, tip, deploy, labels }: Props): JSX.Element {
  return (
    <>
      <Postgres sim={sim} c={c} tip={tip} deploy={deploy} labels={labels} />
      <Mongo sim={sim} c={c} tip={tip} deploy={deploy} labels={labels} />
      <Solid build={port} fill={c.surface} edge={c.edge} />
      <Cable sim={sim} c={c} />
    </>
  )
}
