import {
  BoxGeometry, BufferAttribute, BufferGeometry, CircleGeometry, Color, DoubleSide, EdgesGeometry, Group, InstancedMesh, LineSegments, Matrix4, Mesh,
  MeshBasicMaterial, MeshStandardMaterial, SphereGeometry, Vector3,
} from 'three'
import type { Material, Object3D } from 'three'

import { play } from '../../../../../../kit/sound'
import type { SocketKind, SwapBox, SwapClock, SwapRig, SwapVariant, Tokens } from '../../../../core/contract'
import { kick } from '../../../../core/jolt'
import { box, cyl, fillMat, lineMat, mergeEdges, mergeFills } from '../../../../core/three'
import type { Piece } from '../../../../core/three'
import { isDark, ramp } from '../../../../fx/heat'
import { Particles, SPARK } from '../../../../fx/particles'
import { crossed, easeBack, easeIn, easeInOut, easeOut, every, rest, span, wobble } from './kit'

/** The old part's act fills [0, ARRIVE]; the new part's act fills [ARRIVE, 1]. */
const ARRIVE = 0.5
/** Height above the socket that reads as out of frame at the board stop. */
const GONE = 14
const COIL_TURNS = 4
const COIL_SEGS = COIL_TURNS * 22
const MALLET = 4.2
const HEAD = 1

const parab = (p: number) => 4 * p * (1 - p)
const lerp = (a: number, b: number, k: number) => a + (b - a) * k

/** An act's window of the swap; `k` is local progress, `beat` fires a one-shot at a local fraction. */
type Phase = { clock: SwapClock; a: number; b: number; k: number }
const beat = (ph: Phase, at: number) => crossed(ph.clock, ph.a + (ph.b - ph.a) * at)

const mute = (o: Object3D) => o.traverse((x) => { x.raycast = () => {}; x.frustumCulled = false })

function solid(pieces: Piece[]) {
  const fill = new Mesh(mergeFills(pieces))
  fill.add(new LineSegments(mergeEdges(pieces)))
  for (const p of pieces) p.geo.dispose()
  return fill
}

function edgeArray(pieces: Piece[]) {
  const g = mergeEdges(pieces)
  const a = Float32Array.from(g.getAttribute('position').array)
  g.dispose()
  return a
}

/** Every prop the arcade owns, built once per socket and hidden between swaps. */
function build() {
  const root = new Group()

  const hubPieces: Piece[] = [
    { geo: cyl(0.42, 0.42, 0.34, 20), at: [0, 0.17, 0], threshold: 30 },
    { geo: cyl(0.16, 0.26, 0.3, 16), at: [0, 0.49, 0], threshold: 30 },
  ]
  const prongPieces: Piece[] = [
    { geo: box(0.11, 1.06, 0.13), at: [0.375, -0.375, 0], rot: [0, 0, Math.PI / 4] },
    { geo: box(0.11, 0.8, 0.13), at: [0.75, -1.15, 0] },
    { geo: box(0.34, 0.1, 0.13), at: [0.63, -1.52, 0] },
  ]
  const hubE = edgeArray(hubPieces)
  const prongE = edgeArray(prongPieces)
  const hub = new Mesh(mergeFills(hubPieces))
  const prongs = new InstancedMesh(mergeFills(prongPieces), undefined, 3)
  for (const p of [...hubPieces, ...prongPieces]) p.geo.dispose()
  const clawBuf = new Float32Array(hubE.length + 3 * prongE.length + 6)
  clawBuf.set(hubE)
  const clawLineGeo = new BufferGeometry()
  clawLineGeo.setAttribute('position', new BufferAttribute(clawBuf, 3))
  const clawLines = new LineSegments(clawLineGeo)
  const claw = new Group()
  claw.add(hub, prongs, clawLines)

  const unit = new BoxGeometry(1, 1, 1)
  const plate = new Mesh(unit)
  plate.add(new LineSegments(new EdgesGeometry(unit)))
  const coilBuf = new Float32Array(COIL_SEGS * 6)
  const coilGeo = new BufferGeometry()
  coilGeo.setAttribute('position', new BufferAttribute(coilBuf, 3))
  const coil = new LineSegments(coilGeo)
  const shelf = new Group()
  shelf.add(plate, coil)

  const halfOf = (turn: number) => {
    const m = new Mesh(new SphereGeometry(1, 24, 14, 0, Math.PI).rotateY(turn))
    const grid = new SphereGeometry(1.04, 12, 7, 0, Math.PI).rotateY(turn)
    m.add(new LineSegments(new EdgesGeometry(grid, 1)))
    grid.dispose()
    return m
  }
  const capF = halfOf(0)
  const capB = halfOf(Math.PI)
  const capsule = new Group()
  capsule.add(capF, capB)

  const mallet = new Group()
  mallet.add(solid([
    { geo: box(0.16, 0.16, MALLET), at: [0, 0, MALLET / 2] },
    { geo: cyl(0.6, 0.6, HEAD, 24), at: [0, 0, MALLET], threshold: 30 },
    { geo: cyl(0.64, 0.64, 0.1, 24), at: [0, 0.32, MALLET], threshold: 30 },
    { geo: cyl(0.64, 0.64, 0.1, 24), at: [0, -0.32, MALLET], threshold: 30 },
  ]))

  const disc = new CircleGeometry(1, 40).rotateX(-Math.PI / 2)
  const hole = new Mesh(disc)
  hole.add(new LineSegments(new EdgesGeometry(disc)))
  hole.renderOrder = 1

  const sparks = new Particles(140, SPARK)
  root.add(claw, shelf, capsule, mallet, hole, sparks.object)
  mute(root)
  const props = [claw, shelf, capsule, mallet, hole]
  for (const p of props) p.visible = false
  sparks.object.visible = false

  return {
    root, props, claw, hub, prongs, clawLines, clawBuf, hubE, prongE, shelf, plate, coil, coilBuf, capsule, capF, capB, mallet, hole, sparks,
    own: [] as Material[],
    look: { hot: new Color(), warm: new Color(), cold: new Color() },
    leave: { clock: null as unknown as SwapClock, a: 0, b: ARRIVE, k: 0 } satisfies Phase,
    enter: { clock: null as unknown as SwapClock, a: ARRIVE, b: 1, k: 0 } satisfies Phase,
  }
}
type Kit = ReturnType<typeof build>

const edgeOf = (o: Object3D) => o.children[0] as LineSegments

function paint(kit: Kit, c: Tokens) {
  for (const m of kit.own) m.dispose()
  const metal = fillMat(c.pin, c.flat, c.rough, { metal: 0.6 })
  kit.hub.material = metal
  kit.prongs.material = metal
  kit.clawLines.material = lineMat(c.bodyEdge)
  kit.plate.material = fillMat(c.body, c.flat, c.rough)
  edgeOf(kit.plate).material = lineMat(c.bodyEdge)
  kit.coil.material = lineMat(c.accent)
  const shell = (color: string) => c.flat
    ? new MeshBasicMaterial({ color, side: DoubleSide })
    : new MeshStandardMaterial({ color, roughness: 0.35, metalness: 0, side: DoubleSide })
  const front = shell(c.accent), back = shell(c.pin)
  kit.capF.material = front
  kit.capB.material = back
  edgeOf(kit.capF).material = lineMat(c.bodyEdge)
  edgeOf(kit.capB).material = lineMat(c.bodyEdge)
  const mallet = kit.mallet.children[0] as Mesh
  mallet.material = fillMat(c.accent, c.flat, c.rough)
  edgeOf(mallet).material = lineMat(c.bodyEdge)
  const pit = new MeshBasicMaterial({ color: isDark(c) ? c.floor : c.ink, transparent: true, opacity: 0.3, depthWrite: false })
  kit.hole.material = pit
  edgeOf(kit.hole).material = lineMat(c.edge)
  kit.own = [front, back, pit]
  kit.sparks.setGlow(isDark(c))
  kit.look = ramp(c.spark, c.accent, c.dim)
}

function dispose(kit: Kit) {
  kit.root.traverse((o) => { if (o instanceof Mesh || o instanceof LineSegments) o.geometry.dispose() })
  for (const m of kit.own) m.dispose()
  kit.sparks.dispose()
}

const M = new Matrix4(), MA = new Matrix4(), MB = new Matrix4(), V = new Vector3()

/** Writes the three prongs at `open` (0 shut, 1 splayed) and the cable up to `cableTop` in the claw's frame. */
function poseClaw(kit: Kit, open: number, cableTop: number) {
  const { clawBuf: buf, prongE: src } = kit
  for (let i = 0; i < 3; i++) {
    MA.makeRotationY(-Math.PI / 2 + (i * 2 * Math.PI) / 3)
    MB.makeTranslation(0.3, 0, 0)
    M.multiplyMatrices(MA, MB)
    MB.makeRotationZ(0.6 * open)
    M.multiply(MB)
    kit.prongs.setMatrixAt(i, M)
    const off = kit.hubE.length + i * src.length
    for (let j = 0; j < src.length; j += 3) {
      V.set(src[j], src[j + 1], src[j + 2]).applyMatrix4(M)
      buf[off + j] = V.x; buf[off + j + 1] = V.y; buf[off + j + 2] = V.z
    }
  }
  const t = buf.length - 6
  buf[t] = 0; buf[t + 1] = 0.64; buf[t + 2] = 0
  buf[t + 3] = 0; buf[t + 4] = cableTop; buf[t + 5] = 0
  kit.prongs.instanceMatrix.needsUpdate = true
  kit.clawLines.geometry.getAttribute('position').needsUpdate = true
}

/** An elliptical spring along +x from `x0` to `x1`, turned by `phase` radians, so a spin reads as a screw feeding forward. */
function poseCoil(kit: Kit, x0: number, x1: number, cy: number, ry: number, rz: number, phase: number) {
  const buf = kit.coilBuf
  let px = 0, py = 0, pz = 0
  for (let i = 0; i <= COIL_SEGS; i++) {
    const t = i / COIL_SEGS
    const w = t * COIL_TURNS * Math.PI * 2 + phase
    const x = lerp(x0, x1, t), y = cy + Math.cos(w) * ry, z = Math.sin(w) * rz
    if (i > 0) {
      const o = (i - 1) * 6
      buf[o] = px; buf[o + 1] = py; buf[o + 2] = pz
      buf[o + 3] = x; buf[o + 4] = y; buf[o + 5] = z
    }
    px = x; py = y; pz = z
  }
  kit.coil.geometry.getAttribute('position').needsUpdate = true
}

function burst(kit: Kit, x: number, y: number, z: number, n: number, up = 1) {
  kit.sparks.burst(n, x, y, z, 0, up, 0, [1.6, 4], 1, [0.35, 0.8])
}

/** Claw machine: lowers, pinches, lifts, loses its grip, snatches it back and hauls the part off the top. */
function claw(ph: Phase, b: SwapBox, g: Group, kit: Kit) {
  const k = ph.k
  const s = (Math.min(b.w, b.d) + 0.06) / 1.05
  const grab = b.y + b.h * 0.55 + 1.52 * s
  const lift = 2.4 * easeInOut(span(k, 0.3, 0.46)) + GONE * 1.15 * easeIn(span(k, 0.66, 1))
  const slip = 0.85 * easeIn(span(k, 0.48, 0.53))
  const regrab = 0.85 * easeOut(span(k, 0.57, 0.63))
  const drop = k < 0.2 ? (GONE + 2) * (1 - easeOut(k / 0.2)) : 0
  const open = k < 0.2 ? 1 : k < 0.3 ? 1 - easeInOut(span(k, 0.2, 0.28))
    : k < 0.48 ? 0 : k < 0.63 ? 0.45 * Math.sin(Math.PI * span(k, 0.48, 0.63)) : 0
  const sway = 0.06 * wobble(span(k, 0.3, 0.5), 3) + 0.05 * Math.sin(span(k, 0.66, 1) * Math.PI * 3)
  const y = grab + drop + lift - regrab
  kit.claw.visible = true
  kit.claw.position.set(b.x, y, b.z)
  kit.claw.rotation.set(0, 0, sway)
  kit.claw.scale.setScalar(s)
  poseClaw(kit, open, (GONE * 2.5 - y) / s)
  if (k >= 0.3) {
    g.position.y = b.y + lift - slip
    g.position.x = b.x - sway * 2
    g.rotation.z = sway
    g.rotation.x = 0.32 * Math.sin(Math.PI * span(k, 0.48, 0.66))
  }
  g.visible = k < 0.99
  if (beat(ph, 0.2)) play('servo')
  if (beat(ph, 0.48)) play('error')
  if (beat(ph, 0.58)) play('servo')
  if (beat(ph, 0.66)) play('toss')
}

/** DIMM ejector latches: a dud pop that clunks back down, a rattle, then the part shoots off like toast. */
function eject(ph: Phase, b: SwapBox, g: Group, kit: Kit) {
  const k = ph.k
  const crouch = -0.1 * easeOut(span(k, 0, 0.12)) * (k < 0.14 ? 1 : 0) - 0.12 * (k >= 0.32 && k < 0.46 ? 1 : 0)
  const dud = 0.75 * parab(span(k, 0.14, 0.3))
  const pop = GONE * 1.2 * (1 - (1 - span(k, 0.46, 0.78)) ** 2.2)
  const rattle = k < 0.14 ? 0.025 * Math.sin(k * 260) : k >= 0.32 && k < 0.46 ? 0.05 * Math.sin(k * 340) : 0
  g.position.y = b.y + crouch + dud + pop
  g.rotation.z = rattle + 0.3 * span(k, 0.46, 0.78)
  g.rotation.x = 0.12 * span(k, 0.46, 0.78)
  g.visible = k < 0.8
  if (beat(ph, 0.14)) play('pick')
  if (beat(ph, 0.3)) { play('seat'); play('error') }
  if (beat(ph, 0.46)) { play('toss'); kick(0.15); burst(kit, b.x, b.y + 0.1, b.z, 18) }
}

/** Whac-a-mole: the part dodges the first swing, sneaks back, and the second swing pounds it into a hole. */
function whack(ph: Phase, b: SwapBox, g: Group, kit: Kit) {
  const k = ph.k
  const top0 = b.y + b.h
  const px = b.x, py = top0 + HEAD / 2, pz = b.z - MALLET
  const raised = -1.15
  const miss = Math.asin(Math.min(1, b.h / MALLET))
  const dodge = b.d + 1.7
  const out = 0.75 * parab(span(k, 0.2, 0.3)), home = 0.6 * parab(span(k, 0.46, 0.56))
  const taunt = 0.3 * Math.abs(Math.sin(2 * Math.PI * span(k, 0.34, 0.44)))
  const dz = dodge * (easeOut(span(k, 0.2, 0.3)) - easeInOut(span(k, 0.46, 0.56)))
  const squash = easeOut(span(k, 0.62, 0.66))
  const sink = -(b.h * 0.55 + 0.15) * easeIn(span(k, 0.64, 0.84))
  g.position.set(b.x, b.y + out + taunt + home + sink, b.z + dz)
  g.scale.set(1 + 0.2 * squash, 1 - 0.45 * squash, 1 + 0.2 * squash)
  g.visible = k < 0.85
  const top = Math.max(b.y, b.y + sink + b.h * (1 - 0.45 * squash))
  const a = k < 0.16 ? raised
    : k < 0.24 ? raised - 0.3 * easeOut(span(k, 0.16, 0.24))
    : k < 0.3 ? lerp(raised - 0.3, miss, easeIn(span(k, 0.24, 0.3)))
    : k < 0.36 ? miss
    : k < 0.5 ? lerp(miss, raised, easeInOut(span(k, 0.36, 0.5)))
    : k < 0.56 ? raised - 0.25 * easeOut(span(k, 0.5, 0.56))
    : k < 0.62 ? lerp(raised - 0.25, 0, easeIn(span(k, 0.56, 0.62)))
    : k < 0.86 ? Math.asin(Math.min(1, (top0 - top) / MALLET))
    : lerp(miss, raised, easeOut(span(k, 0.86, 1)))
  kit.mallet.visible = true
  kit.mallet.position.set(px, py + 10 * (1 - easeOut(span(k, 0, 0.16))) + 12 * easeIn(span(k, 0.88, 1)), pz)
  kit.mallet.rotation.set(a, 0, 0)
  if (k >= 0.6) hole(kit, b, easeBack(span(k, 0.6, 0.68)))
  if (beat(ph, 0.2)) play('chirp')
  if (beat(ph, 0.3)) { play('seat'); play('error'); kick(0.2); burst(kit, b.x, b.y, b.z, 10) }
  if (beat(ph, 0.62)) { play('seat'); play('zap'); kick(0.5); burst(kit, b.x, top0, b.z, 26, 1.4) }
}

function hole(kit: Kit, b: SwapBox, open: number) {
  kit.hole.visible = open > 0.001
  kit.hole.position.set(b.x, b.y + 0.006, b.z)
  kit.hole.scale.set((b.w + 0.35) * open, 1, (b.d + 0.35) * open)
}

/** Vending machine: a shelf drops into view, its coil feeds the part over the lip, and it clunks into the socket. */
function vend(ph: Phase, b: SwapBox, g: Group, kit: Kit) {
  const k = ph.k
  const alongX = b.w < b.d
  const a = alongX ? b.w : b.d, across = alongX ? b.d : b.w
  const start = 2 * a + 0.4, lip = -0.35 * a, back = -start - a - 0.3
  const shelfY = 2.6 + b.h + 10 * (1 - easeOut(span(k, 0, 0.16))) + 12 * easeIn(span(k, 0.6, 0.82))
  const feed = start * easeInOut(span(k, 0.18, 0.44))
  const fall = easeIn(span(k, 0.44, 0.58))
  const hop = 0.45 * parab(span(k, 0.58, 0.72)) + 0.1 * parab(span(k, 0.72, 0.8))
  const tip = 0.28 * Math.sin(Math.PI * fall)
  const along = -start + feed
  const restH = 2.6 + b.h + 10 * (1 - easeOut(span(k, 0, 0.16)))
  const y = k < 0.44 ? restH : lerp(2.6 + b.h, 0, fall) + hop
  g.position.set(b.x + (alongX ? along : 0), b.y + y, b.z + (alongX ? 0 : along))
  g.rotation.set(alongX ? 0 : tip, 0, alongX ? -tip : 0)
  g.visible = true
  kit.shelf.visible = k < 0.82
  kit.shelf.position.set(b.x, b.y + shelfY, b.z)
  kit.shelf.rotation.set(0, alongX ? 0 : -Math.PI / 2, 0)
  kit.plate.position.set((back + lip) / 2, -0.07, 0)
  kit.plate.scale.set(lip - back, 0.14, 2 * across + 0.5)
  const pitch = (lip - back) / COIL_TURNS
  poseCoil(kit, back, lip, b.h / 2, 0.55 * b.h + 0.14, across + 0.14, (-2 * Math.PI * feed) / pitch)
  if (beat(ph, 0.18)) play('drawer')
  if (beat(ph, 0.3)) play('tick')
  if (beat(ph, 0.42)) play('tick')
  if (beat(ph, 0.58)) { play('seat'); kick(0.3); burst(kit, b.x, b.y, b.z, 14, 0.6) }
  if (beat(ph, 0.72)) play('tick')
}

/** Gumball machine: a capsule drops, bounces, trembles and pops in half, leaving the part on its pins. */
function capsule(ph: Phase, b: SwapBox, g: Group, kit: Kit) {
  const k = ph.k
  const rx = b.w + 0.22, rz = b.d + 0.2, ry = Math.max(b.h / 2 + 0.35, rx)
  const land = easeIn(span(k, 0, 0.26))
  const bounce = 1.1 * parab(span(k, 0.26, 0.4)) + 0.3 * parab(span(k, 0.4, 0.48))
  const squash = 0.18 * wobble(span(k, 0.26, 0.4), 2) + 0.08 * wobble(span(k, 0.4, 0.5), 2)
  const tremble = 0.06 * Math.sin(k * 320) * span(k, 0.5, 0.62) * (k < 0.62 ? 1 : 0)
  const pop = span(k, 0.62, 0.9)
  const cy = b.y + ry * (1 - squash) + 6 * (1 - land) + bounce
  kit.capsule.visible = k < 0.9
  kit.capsule.position.set(b.x, cy, b.z)
  kit.capsule.rotation.set(0, 0, 1.2 * (1 - land) + tremble)
  for (const [half, side] of [[kit.capF, 1], [kit.capB, -1]] as const) {
    const shrink = 1 - (side > 0 ? 0.9 : 0.7) * easeIn(pop)
    half.scale.set(rx * (1 + squash * 0.5) * shrink, ry * (1 - squash) * shrink, rz * shrink)
    const lift = side > 0 ? 0.35 * parab(pop) - 0.7 * ry * easeIn(pop) : 1.6 * parab(pop) + 1.2 * pop
    half.position.set(0, lift, side * (rz + 1.6) * easeOut(pop))
    half.rotation.set(side * 1.9 * easeOut(pop), 0, 0)
  }
  g.visible = k >= 0.62
  g.position.y = b.y + 0.35 * (1 - easeBack(span(k, 0.62, 0.78)))
  if (beat(ph, 0.26)) { play('seat'); kick(0.2) }
  if (beat(ph, 0.4)) play('tick')
  if (beat(ph, 0.62)) { play('toss'); play('chirp'); burst(kit, b.x, b.y + ry, b.z, 30, 1.2) }
  if (beat(ph, 0.78)) play('seat')
}

/** The mole's way up: the new stage springs out of the hole, hangs, drops and wobbles. A bun spins on the way. */
function popUp(ph: Phase, b: SwapBox, g: Group, kit: Kit, from: SwapBox) {
  const k = ph.k
  const m = easeInOut(span(k, 0, 0.1))
  V.set(lerp(from.x, b.x, m), b.y, lerp(from.z, b.z, m))
  const hw = lerp(from.w, b.w, m), hd = lerp(from.d, b.d, m)
  kit.hole.visible = k < 0.62
  kit.hole.position.set(V.x, V.y + 0.006, V.z)
  const shut = 1 - easeIn(span(k, 0.5, 0.62))
  kit.hole.scale.set((hw + 0.35) * shut, 1, (hd + 0.35) * shut)
  const rise = easeOut(span(k, 0.04, 0.3)), fall = easeIn(span(k, 0.3, 0.46))
  const y = k < 0.3 ? lerp(-(b.h + 0.1), 1.6, rise) : 1.6 * (1 - fall)
  const stretch = k < 0.3 ? 0.25 * (1 - rise) : 0
  const squash = 0.22 * wobble(span(k, 0.46, 0.72), 3)
  g.visible = k >= 0.04
  g.position.y = b.y + y
  g.scale.set(1 - stretch * 0.4 + squash * 0.5, 1 + stretch - squash, 1 - stretch * 0.4 + squash * 0.5)
  g.rotation.y = ph.clock.to === 'bun' ? 4 * Math.PI * easeOut(span(k, 0.04, 0.6)) : 0
  if (beat(ph, 0.04)) play('chirp')
  if (beat(ph, 0.46)) { play('seat'); kick(0.25); burst(kit, b.x, b.y, b.z, 12, 0.6) }
}

type Act = (ph: Phase, b: SwapBox, g: Group, kit: Kit, from: SwapBox) => void
const LEAVE: Record<SocketKind, Act> = { cpu: claw, memory: eject, power: whack }
const enterFor = (kind: SocketKind, to: string): Act => (kind === 'power' ? popUp : to === 'mongodb' ? capsule : vend)

const floor = () => 0

/** One frame of the rig; true while sparks outlive the swap and need frames. */
function frame(kit: Kit, kind: SocketKind, clock: SwapClock, old: Group, next: Group, dt: number) {
  for (const p of kit.props) p.visible = false
  if (clock.active && clock.fromBox) {
    rest(old, clock.fromBox)
    rest(next, clock.toBox)
    old.visible = true
    next.visible = false
    kit.leave.clock = kit.enter.clock = clock
    kit.leave.k = span(clock.u, 0, ARRIVE)
    kit.enter.k = span(clock.u, ARRIVE, 1)
    if (kit.leave.k < 1) LEAVE[kind](kit.leave, clock.fromBox, old, kit, clock.fromBox)
    else old.visible = false
    if (clock.u >= ARRIVE) enterFor(kind, clock.to)(kit.enter, clock.toBox, next, kit, clock.fromBox)
  }
  const sparks = kit.sparks
  if (sparks.busy) sparks.step(Math.min(dt, 0.05), floor, kit.look)
  sparks.object.visible = sparks.busy
  return sparks.busy && !clock.active
}

function rig(c: Tokens, kind: SocketKind): SwapRig {
  const kit = build()
  kit.root.name = `arcade.${kind}`
  paint(kit, c)
  return { root: kit.root, frame: (clock, old, next, dt) => frame(kit, kind, clock, old, next, dt), dispose: () => dispose(kit) }
}

/** Claw machines, ejector latches and whac-a-mole carry the old part off; vending coils, gumball capsules and a mole hole bring the new one. */
export const arcade: SwapVariant = { id: 'arcade', label: 'Arcade', acts: every({ duration: 2.8, arrive: ARRIVE, rig }) }
