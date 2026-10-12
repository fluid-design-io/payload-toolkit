import { useFrame } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { CylinderGeometry, Euler, Matrix4, MeshBasicMaterial, Quaternion, TorusGeometry, Vector3 } from 'three'
import type { Group, Mesh } from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

import { keepAnimating } from '../../../../kit/busy'
import { play } from '../../../../kit/sound'
import type { Path, Sim, Tokens, TransportProps } from '../../core/contract'
import { kick } from '../../core/jolt'
import { Body } from '../../core/scene'
import { box, cyl, fillMat, lineMat, reducedMotion, segs, useDisposable } from '../../core/three'
import type { Piece } from '../../core/three'
import { Batch, glassMat, hidden } from './fleet'
import type { Carrier, Fleet, FleetSpec } from './fleet'
import { outline, pitchOf, pose, tubeAlong, useFleet, yawOf } from './kit'
import { Track, rounded } from './track'
import { BREECH, END, OFF, RISER, SPEED, START, TOP } from './tube/course'
import type { Course } from './tube/course'
import { GAP, HOME, LENGTH, TANK, ZB } from './tube.data'

/**
 * A pneumatic tube that takes the scenic route. A part drops into an open
 * glass capsule; the lid snaps shut and a ram creeps it into the breech while
 * the gauge climbs and the capsule shudders, then the line fires it up a
 * riser tower, over a crest, down the back of the campus, through a
 * corkscrew past the board's far end, back along the front, round a loop
 * and down into the receiver, where it slams into the buffer hard enough to
 * kick the camera and its lid pops open for the arm. The route and its pace
 * live in `tube/course.ts`. Empties tip back into
 * the floor duct and queue behind the breech.
 */
const CAP = { r: 0.56, len: 1.25 }
const GLASS = 0.66
const DUCT = 0.62
const DIAL = new Vector3(-6.3, TANK.y, ZB + TANK.r + 0.06)
/** Where a capsule's nose stops in the receiver: the buffer's face. */
const NOSE = END.x + CAP.len / 2
const PISTON = { len: 0.3, travel: 0.2 }

const lift = new Vector3(0, OFF, 0)
const S = START.clone().add(lift)
const R = END.clone().add(lift)
const back = new Track(rounded([R.toArray(), [R.x, DUCT, ZB], [HOME, DUCT, ZB], S.toArray()], 0.5))
const SPEC: FleetSpec = { n: 9, length: LENGTH, speed: SPEED, gap: GAP, back: back.len, spacing: CAP.len, vmax: 11, accel: 16, dwell: 0.6 }

const at = new Vector3()
const ahead = new Vector3()
const behind = new Vector3()
const tan = new Vector3()
const ride = new Vector3()
const m = new Matrix4()
const streak = new Matrix4()
const lid = new Matrix4()
const hinge = new Matrix4()
const shift = new Matrix4().makeTranslation(0, 0, -CAP.r)
const unshift = new Matrix4().makeTranslation(0, 0, CAP.r)
const q = new Quaternion()
const yUp = new Vector3(0, 1, 0)
const scale = new Vector3()

/** Writes a riding capsule's centre into `at` and its direction into `tan`; returns its speed in m/s. */
function onPath(path: Path, u: number) {
  const du = 0.03
  path.at(Math.min(path.length, u + du), ahead)
  path.at(Math.max(0, u - du), behind)
  path.at(u, at).add(lift)
  tan.subVectors(ahead, behind)
  const span = Math.min(path.length, u + du) - Math.max(0, u - du)
  const v = span > 0 ? (tan.length() / span) * SPEED : 0
  if (tan.lengthSq() < 1e-10) tan.set(1, 0, 0)
  tan.normalize()
  return v
}

const along = (t: Vector3) => new Euler().setFromQuaternion(new Quaternion().setFromUnitVectors(yUp, t.clone().normalize()))
const v3 = (p: Vector3): [number, number, number] => [p.x, p.y, p.z]

/** Glass for the route from the breech mouth to the receiver mouth, plus the floor return duct, with their outlines. */
function glassOf(pts: readonly Vector3[]) {
  const route = new Track(pts)
  const run = new Track(route.slice(CAP.len / 2 + 0.1, route.len - CAP.len / 2 - 0.2, 0.12).samples(0.12).map((p) => p.add(lift)))
  const duct = new Track([[R.x, DUCT, ZB], [HOME + 0.6, DUCT, ZB]])
  const parts = [tubeAlong(run.samples(0.12), GLASS, false, 16), tubeAlong(duct.samples(0.2), GLASS - 0.04, false, 16)]
  const geo = mergeGeometries(parts)!
  parts.forEach((g) => g.dispose())
  return { geo, lines: segs([...outline(run, GLASS, 0.15), ...outline(duct, GLASS - 0.04)]) }
}

/** Every static piece: collars along the glass, posts, the riser's mast, the breech, the tank and gauge, the receiver and its buffer. */
function shapeOf(pts: readonly Vector3[], course: Course) {
  const route = new Track(pts)
  const p = new Vector3(), t = new Vector3()
  const pieces: Piece[] = []
  const collar = (s: number, r: number, w: number) => {
    route.point(s, p).add(lift)
    route.tangent(s, t)
    pieces.push({ geo: new CylinderGeometry(r, r, w, 22, 1, true), at: v3(p), rot: along(t).toArray().slice(0, 3) as [number, number, number], threshold: 20 })
  }
  for (const s of [0.95, 1.3, 1.65]) collar(s, GLASS + 0.14, 0.2)
  for (let s = 3.4; s < route.len - 2; s += 3.4) collar(s, GLASS + 0.06, 0.14)
  collar(route.len - CAP.len / 2 - 0.25, GLASS + 0.12, 0.24)
  for (const post of course.posts) {
    pieces.push({ geo: box(0.16, post.top, 0.16), at: [post.x, post.top / 2, post.z] }, { geo: box(0.7, 0.1, 0.7), at: [post.x, post.top - 0.05, post.z] }, { geo: box(0.5, 0.06, 0.5), at: [post.x, 0.03, post.z] })
  }
  const mast = { x: RISER, z: START.z - 0.85, h: TOP + OFF + 0.9 }
  pieces.push({ geo: box(0.2, mast.h, 0.2), at: [mast.x, mast.h / 2, mast.z] })
  for (let y = 2.4; y < mast.h - 1; y += 1.8) pieces.push({ geo: box(0.12, 0.12, 0.3), at: [mast.x, y, mast.z + 0.2] })
  pieces.push(
    { geo: box(1.6, 0.6, 1.3), at: [S.x, 0.3, S.z] },
    { geo: box(1.2, 0.6, 1.3), at: [R.x - 0.1, 0.3, R.z] },
    { geo: box(0.4, 1.6, 1.2), at: [NOSE + PISTON.len + PISTON.travel + 0.2, 0.8, R.z] },
    { geo: cyl(TANK.r, TANK.r, TANK.len, 28), at: [TANK.x, TANK.y, ZB], rot: [0, 0, Math.PI / 2], threshold: 20 },
    { geo: cyl(0.36, 0.36, 0.06, 28), at: v3(DIAL), rot: [Math.PI / 2, 0, 0], threshold: 20 },
    { geo: cyl(0.09, 0.09, TANK.y - 1.2, 10), at: [TANK.x + 0.8, (TANK.y + 1.2) / 2, S.z - 0.5], threshold: 20 },
    { geo: box(0.1, 0.1, ZB + TANK.r - S.z + 0.5), at: [TANK.x + 0.8, TANK.y, (S.z - 0.5 + ZB + TANK.r) / 2] },
  )
  for (const dx of [-0.8, 0.8]) for (const dz of [-0.4, 0.4]) pieces.push({ geo: box(0.1, TANK.y - TANK.r, 0.1), at: [TANK.x + dx, (TANK.y - TANK.r) / 2, ZB + dz] })
  for (const x of [R.x - 1.2, -3.6, -6.4]) pieces.push({ geo: cyl(DUCT + 0.08, DUCT + 0.08, 0.14, 22), at: [x, DUCT, ZB], rot: [0, 0, Math.PI / 2], threshold: 20 })
  return { pieces, id: `tube-${route.len.toFixed(3)}-${course.posts.length}` }
}

function capsulePieces() {
  const half = (start: number, r = CAP.r, len = CAP.len, open = false) => new CylinderGeometry(r, r, len, 18, 1, open, start, Math.PI).rotateZ(-Math.PI / 2)
  return {
    trough: [{ geo: half(0), threshold: 25 }] as Piece[],
    cover: [{ geo: half(Math.PI), threshold: 25 }] as Piece[],
    bands: [-1, 1].map((k) => ({ geo: half(0, CAP.r + 0.02, 0.12, true), at: [k * (CAP.len / 2 - 0.1), 0, 0] as [number, number, number] })),
    trail: [{ geo: new CylinderGeometry(CAP.r * 0.8, CAP.r * 0.3, 1, 14, 1, true) }] as Piece[],
  }
}

/** A puff of air: a ring that grows and fades where it fired. */
const PUFF = 0.45
class Puff {
  readonly mat = new MeshBasicMaterial({ transparent: true, depthWrite: false })
  private t = PUFF
  constructor(private readonly at: Vector3) {}
  fire() {
    if (!reducedMotion) this.t = 0
  }
  get live() {
    return this.t < PUFF
  }
  step(dt: number, mesh: Mesh | null) {
    if (!mesh) return
    mesh.visible = this.t < PUFF
    if (!mesh.visible) return
    this.t += dt
    const k = Math.min(1, this.t / PUFF)
    mesh.position.copy(this.at)
    mesh.scale.setScalar(1 + 1.3 * k)
    this.mat.opacity = 0.75 * (1 - k) * (1 - k)
  }
}

/**
 * The line's moving machinery: the capsules (bound to carried parts by the
 * fleet), their sprung lids and speed trails, the breech's pressure gauge,
 * the receiver's buffer and the two puffs.
 */
class Pneumatics {
  readonly spec: FleetSpec = { ...SPEC }
  readonly layers: { trough: Batch; cover: Batch; bands: Batch; trail: Batch }
  readonly ring = new TorusGeometry(GLASS + 0.12, 0.05, 6, 28)
  readonly launch = new Puff(new Vector3(START.x + BREECH + 0.2, S.y, S.z))
  readonly slam = new Puff(new Vector3(NOSE, R.y, R.z))
  private readonly lid = new Float32Array(SPEC.n)
  private readonly lidV = new Float32Array(SPEC.n)
  private readonly lastU = new Float32Array(SPEC.n)
  private pressure = 0
  private recoil = 0
  private recoilV = 0

  constructor(private readonly sim: Sim, c: Tokens) {
    const p = capsulePieces()
    this.layers = {
      trough: new Batch(p.trough, SPEC.n, glassMat(c.edge, c.flat, 0.16), lineMat(c.edge)),
      cover: new Batch(p.cover, SPEC.n, glassMat(c.edge, c.flat, 0.12), lineMat(c.edge)),
      bands: new Batch(p.bands, SPEC.n, fillMat(c.accent, c.flat, c.rough), null),
      trail: new Batch(p.trail, SPEC.n, glassMat(c.accent, c.flat, 0.22), null),
    }
    // The fleet may field fewer carriers than instances; the spares stay hidden.
    for (const layer of Object.values(this.layers)) for (let i = 0; i < SPEC.n; i++) layer.set(i, hidden)
  }

  skin(c: Tokens) {
    this.layers.trough.skin(glassMat(c.edge, c.flat, 0.16), lineMat(c.edge))
    this.layers.cover.skin(glassMat(c.edge, c.flat, 0.12), lineMat(c.edge))
    this.layers.bands.skin(fillMat(c.accent, c.flat, c.rough))
    this.layers.trail.skin(glassMat(c.accent, c.flat, 0.22))
    this.launch.mat.color.set(c.edge)
    this.slam.mat.color.set(c.spark)
  }

  /** Poses capsule `i` for this frame; the fleet has already moved it. */
  place = (cap: Carrier, i: number, dt: number) => {
    const path = this.sim.line.path
    const { spec, layers } = this
    if (path) spec.length = path.length
    let open: number
    let v = 0
    if (path && (cap.state === 'ride' || cap.state === 'coast' || cap.state === 'hold')) {
      v = onPath(path, cap.state === 'hold' ? path.length : cap.u)
      if (cap.state === 'ride' && cap.b < spec.back) at.lerp(back.point(cap.b, ride), Math.min(1, (spec.back - cap.b) / spec.spacing))
      if (cap.state === 'ride' && cap.u > 0.05 && cap.u < BREECH && !reducedMotion) {
        const k = cap.u / BREECH
        at.y += Math.sin(this.sim.time * 71 + i) * 0.03 * k
        at.z += Math.sin(this.sim.time * 53 + i * 2) * 0.02 * k
      }
      if (cap.state === 'ride' && this.lastU[i] < BREECH && cap.u >= BREECH && cap.t > 0.1) {
        this.launch.fire()
        play('toss')
      }
      pose(m, at, yawOf(tan), pitchOf(tan))
      open = cap.state === 'hold' ? (cap.t < spec.dwell * 0.6 ? 1 : 0) : cap.u < 0.05 || cap.arrived ? 1 : 0
    } else {
      back.point(cap.b, at)
      pose(m, at)
      open = cap.b > spec.back - 0.02 ? 1 : 0
    }
    this.lastU[i] = cap.state === 'ride' ? cap.u : 0
    if (cap.state === 'ride' && cap.u > BREECH && v > 4) {
      const len = Math.min(3.2, v * 0.2)
      q.setFromUnitVectors(yUp, tan)
      layers.trail.set(i, streak.compose(ride.copy(at).addScaledVector(tan, -(CAP.len + len) / 2), q, scale.set(1, len, 1)))
    } else layers.trail.set(i, hidden)
    this.spring(i, open, dt)
    layers.trough.set(i, m)
    layers.bands.set(i, m)
    hinge.makeRotationX(-this.lid[i] * 1.9)
    layers.cover.set(i, lid.copy(m).multiply(shift).multiply(hinge).multiply(unshift))
  }

  /** A capsule hit the buffer. */
  arrive = () => {
    kick(0.45, 16)
    play('drawer')
    this.slam.fire()
    if (!reducedMotion) this.recoil = 1
  }

  /** The gauge reads the deepest capsule in the breech; the buffer rings after a slam. */
  step(dt: number, needle: Group | null, piston: Mesh | null, launch: Mesh | null, slam: Mesh | null) {
    let p = 0
    for (const part of this.sim.carried) if (!part.fly && part.u > 0.02 && part.u < BREECH) p = Math.max(p, part.u / BREECH)
    this.pressure = p > this.pressure ? p : this.pressure * Math.exp(-dt * 5)
    if (needle) needle.rotation.z = 2.3 - this.pressure * 4.6 + (reducedMotion ? 0 : Math.sin(this.sim.time * 57) * 0.07 * this.pressure ** 2)
    this.recoilV += (-120 * this.recoil - 9 * this.recoilV) * dt
    this.recoil += this.recoilV * dt
    if (Math.abs(this.recoil) < 1e-3 && Math.abs(this.recoilV) < 1e-2) this.recoil = this.recoilV = 0
    if (piston) piston.position.x = NOSE + PISTON.len / 2 + Math.max(-0.1, this.recoil) * PISTON.travel
    this.launch.step(dt, launch)
    this.slam.step(dt, slam)
  }

  /** True while anything moves without the sim: capsules running home, a lid swinging, the gauge falling, the buffer ringing, a puff. */
  moving(fleet: Fleet) {
    if (fleet.moving || this.pressure > 1e-3 || this.recoil !== 0 || this.launch.live || this.slam.live) return true
    for (let i = 0; i < SPEC.n; i++) if (Math.abs(this.lidV[i]) > 1e-2) return true
    return false
  }

  /** A sprung lid pops past open and settles; it snaps under reduced motion. */
  private spring(i: number, target: number, dt: number) {
    if (reducedMotion) {
      this.lid[i] = target
      this.lidV[i] = 0
      return
    }
    this.lidV[i] += (90 * (target - this.lid[i]) - 11 * this.lidV[i]) * dt
    this.lid[i] = Math.min(1.12, Math.max(0, this.lid[i] + this.lidV[i] * dt))
  }

  /** The batches are the fleet's to dispose. */
  dispose() {
    this.ring.dispose()
    this.launch.mat.dispose()
    this.slam.mat.dispose()
  }
}

export function Tube({ sim, line, c }: TransportProps<Course>) {
  const { pts, data: course } = line.path
  const shape = shapeOf(pts, course)
  const glass = useDisposable(() => glassOf(pts), [pts])
  const [rig] = useState(() => new Pneumatics(sim, c))
  useEffect(() => () => rig.dispose(), [rig])
  useLayoutEffect(() => rig.skin(c), [rig, c])
  const fleet = useFleet(sim, rig.spec, rig.layers, rig.place, { arrive: rig.arrive })
  const needle = useRef<Group>(null)
  const piston = useRef<Mesh>(null)
  const launch = useRef<Mesh>(null)
  const slam = useRef<Mesh>(null)
  useFrame((_, delta) => {
    rig.step(Math.min(delta, 0.1), needle.current, piston.current, launch.current, slam.current)
    if (rig.moving(fleet)) keepAnimating()
  })
  const { layers } = rig
  return (
    <group>
      <Body id={shape.id} c={c} fill={c.surface} edge={c.edge} pieces={shape.pieces} />
      <mesh geometry={glass.geo} material={glassMat(c.edge, c.flat, 0.09)} renderOrder={1} />
      <lineSegments geometry={glass.lines} material={lineMat(c.edge, 0.8)} />
      <primitive object={layers.trough.mesh} />
      <primitive object={layers.trough.lines!} />
      <primitive object={layers.cover.mesh} />
      <primitive object={layers.cover.lines!} />
      <primitive object={layers.bands.mesh} />
      <primitive object={layers.trail.mesh} />
      <group ref={needle} position={[DIAL.x, DIAL.y, DIAL.z + 0.05]}>
        <mesh position={[0, 0.13, 0]} material={fillMat(c.accent, c.flat, c.rough)}>
          <boxGeometry args={[0.04, 0.3, 0.02]} />
        </mesh>
      </group>
      <mesh ref={piston} position={[NOSE + PISTON.len / 2, R.y, R.z]} rotation={[0, 0, Math.PI / 2]} material={fillMat(c.accent, c.flat, c.rough)}>
        <cylinderGeometry args={[0.34, 0.34, PISTON.len, 20]} />
      </mesh>
      <mesh ref={launch} geometry={rig.ring} material={rig.launch.mat} rotation={[0, Math.PI / 2, 0]} visible={false} />
      <mesh ref={slam} geometry={rig.ring} material={rig.slam.mat} rotation={[0, Math.PI / 2, 0]} visible={false} />
    </group>
  )
}

