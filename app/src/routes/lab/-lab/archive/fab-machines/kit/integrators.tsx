import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { BoxGeometry, BufferAttribute, BufferGeometry, Matrix4, Points, PointsMaterial, Quaternion, Sphere, SphereGeometry, Vector3 } from 'three'
import type { Group, InstancedMesh, LineBasicMaterial, Mesh } from 'three'

import { ARM, BRAND, BY, machine, onBoard } from '../sim'
import type { IntegratorId, Part, Sim } from '../sim'
import { Hairline, Solid, fillMat, hover, segmentWriter, useSegments } from './hairline'
import type { Look, Tip } from './hairline'

type Props = { sim: Sim; c: Look; tip: Tip; deploy: (id: IntegratorId) => void }
type Writer = ReturnType<typeof segmentWriter>

const X = new Vector3(1, 0, 0)
const ONE = new Vector3(1, 1, 1)
const M = new Matrix4()
const Q = new Quaternion()
const C = Array.from({ length: 8 }, () => new Vector3())
const BAR = [0, 1, 2, 3, 4, 5, 6, 7, 0, 2, 1, 3, 4, 6, 5, 7, 0, 4, 1, 5, 2, 6, 3, 7]
/** Moving instances are never raycast against a cached sphere: three.js keeps the first one it computes. */
const SCENE_SPHERE = new Sphere(new Vector3(2, 2, 0), 40)
/** A glow that breathes at 2.5 Hz instead of flickering per frame, under the 3 Hz flash limit. */
const breathe = (t: number) => 0.85 + Math.sin(t * Math.PI * 5) * 0.25
const CORNERS = [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))
const ease = (dt: number, k: number) => 1 - Math.exp(-dt * k)
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a))

function events(id: IntegratorId, { sim, tip, deploy }: Props) {
  const m = machine('integrator', id)
  return {
    onClick: (e: { stopPropagation: () => void }) => {
      e.stopPropagation()
      if (sim.rig.integrator !== id) deploy(id)
    },
    ...hover(tip, () => `${m.brand} · ${m.model}`, () => (sim.units[id].state === 'parked' ? 'Parked · click to launch it' : m.note)),
  }
}

/** The point `f` of the way around a part's inset top outline, in world space. */
function outlinePoint(p: Part, f: number, out: Vector3) {
  const [sx, sy, sz] = p.size
  const hx = sx / 2 - 0.07, hz = sz / 2 - 0.07
  const per = [2 * hx, 2 * hz, 2 * hx, 2 * hz]
  let left = clamp(f, 0, 1) * (per[0] + per[1] + per[2] + per[3])
  let k = 0
  while (k < 3 && left > per[k]) left -= per[k++]
  const t = Math.min(1, left / per[k])
  const [ax, az] = CORNERS[k], [bx, bz] = CORNERS[(k + 1) % 4]
  const x = (ax + (bx - ax) * t) * hx, z = (az + (bz - az) * t) * hz
  const cs = Math.cos(p.rot), sn = Math.sin(p.rot)
  return out.set(p.pos.x + x * cs + z * sn, p.pos.y + sy / 2 + 0.006, p.pos.z - x * sn + z * cs)
}

/** Twelve hairline edges of a bar of length `len` and half thickness `h` along local +x of `m`. */
function bar(w: Writer, m: Matrix4, len: number, h: number) {
  for (let i = 0; i < 8; i++) C[i].set(i & 1 ? len : 0, i & 2 ? h : -h, i & 4 ? h : -h).applyMatrix4(m)
  for (let e = 0; e < 24; e += 2) {
    const a = C[BAR[e]], b = C[BAR[e + 1]]
    w.add(a.x, a.y, a.z, b.x, b.y, b.z)
  }
}

const { agv: AGV, h0: H0, l1: L1, l2: L2 } = ARM
const SIDE: [number, number, number] = [Math.PI / 2, 0, 0]
const CART = () => new Hairline().box(1.6, 0.26, 1.3, 0, 0.27, 0).cyl(0.62, 0.7, 0.24, 0, AGV + 0.12, 0, 32).build()
const AXLE = () => {
  const h = new Hairline()
  for (const z of [-0.66, 0.66]) h.cyl(0.14, 0.14, 0.1, 0, 0, z, 8, SIDE).seg(-0.11, 0, z + Math.sign(z) * 0.052, 0.11, 0, z + Math.sign(z) * 0.052)
  return h.build()
}
const COLUMN = () => new Hairline().cyl(0.3, 0.4, H0 - 0.24, 0, (H0 + 0.24) / 2, 0, 24).cyl(0.42, 0.42, 0.06, 0, H0 * 0.55, 0, 24).build()
const UPPER = () => new Hairline().cyl(0.36, 0.36, 0.8, 0, 0, 0, 24, SIDE).box(L1, 0.24, 0.24, L1 / 2, 0, 0.26).box(L1, 0.24, 0.24, L1 / 2, 0, -0.26).build()
const FORE = () => new Hairline().cyl(0.3, 0.3, 0.84, 0, 0, 0, 24, SIDE).box(L2, 0.28, 0.28, L2 / 2, 0, 0).build()
const WRIST = () => new Hairline().cyl(0.2, 0.2, 0.5, 0, 0, 0, 16, SIDE).box(0.44, 0.26, 0.8, 0, -0.3, 0).build()
const FINGER = () => new Hairline().box(0.3, 0.34, 0.05, 0, -0.58, 0).build()

function Arm(props: Props) {
  const { sim, c } = props
  const u = sim.units.arm
  const root = useRef<Group>(null)
  const cart = useRef<Group>(null)
  const axles = useRef<(Group | null)[]>([])
  const turret = useRef<Group>(null)
  const shoulder = useRef<Group>(null)
  const elbow = useRef<Group>(null)
  const wrist = useRef<Group>(null)
  const fingers = useRef<(Group | null)[]>([])
  const st = useMemo(() => ({ base: u.base.clone(), heading: 0, roll: 0, grip: 0 }), [u])
  useFrame((_, dt) => {
    root.current!.position.set(u.base.x, 0, u.base.z)
    const mx = u.base.x - st.base.x, mz = u.base.z - st.base.z
    const moved = Math.hypot(mx, mz)
    if (moved > 1e-4) st.heading += wrap(Math.atan2(-mz, mx) - st.heading) * ease(dt, 10)
    st.base.copy(u.base)
    st.roll -= moved / 0.14
    cart.current!.rotation.y = st.heading
    for (const a of axles.current) if (a) a.rotation.z = st.roll
    const w = u.pos
    const dx = w.x - u.base.x, dz = w.z - u.base.z
    const r = Math.max(Math.hypot(dx, dz), 0.001)
    const h = w.y - AGV - H0
    const d = clamp(Math.hypot(r, h), Math.abs(L1 - L2) + 0.05, L1 + L2 - 0.01)
    const a = Math.acos(clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1))
    const t1 = Math.atan2(h, r) + a
    const t2 = Math.atan2(h - L1 * Math.sin(t1), r - L1 * Math.cos(t1))
    turret.current!.rotation.y = Math.atan2(-dz, dx)
    shoulder.current!.rotation.z = t1
    elbow.current!.rotation.z = t2 - t1
    wrist.current!.rotation.z = -t2 + Math.sin(sim.clock * 1.7) * 0.05
    const fidget = u.state === 'parked' || (u.state === 'active' && !u.steps.length) ? 0.5 + Math.sin(sim.clock * 2.3) * 0.5 : 0
    st.grip += ((u.holding ? 1 : 0) - st.grip) * ease(dt, 9)
    const open = 0.34 - st.grip * 0.1 - fidget * 0.08
    fingers.current.forEach((f, i) => f && (f.position.z = (i ? 1 : -1) * open))
  })
  const look = { fill: c.surface, edge: c.edge }
  return (
    <group ref={root} {...events('arm', props)}>
      <group ref={cart}>
        <Solid build={CART} {...look} />
        {[-0.55, 0.55].map((x, i) => (
          <group key={x} ref={(g) => { axles.current[i] = g }} position={[x, 0.14, 0]}>
            <Solid build={AXLE} {...look} />
          </group>
        ))}
      </group>
      <group ref={turret} position={[0, AGV, 0]}>
        <Solid build={COLUMN} {...look} />
        <group ref={shoulder} position={[0, H0, 0]}>
          <Solid build={UPPER} {...look} />
          <group ref={elbow} position={[L1, 0, 0]}>
            <Solid build={FORE} {...look} />
            <group ref={wrist} position={[L2, 0, 0]}>
              <Solid build={WRIST} {...look} />
              {[0, 1].map((i) => (
                <group key={i} ref={(g) => { fingers.current[i] = g }}>
                  <Solid build={FINGER} {...look} />
                </group>
              ))}
            </group>
          </group>
        </group>
      </group>
    </group>
  )
}

const ROTORS = [[-0.64, -0.64], [0.64, -0.64], [0.64, 0.64], [-0.64, 0.64]] as const
const LAT = { y: 0.46 * Math.sin(0.87) * 0.56, r: 0.46 * Math.cos(0.87) }
const DRONE = () => {
  const h = new Hairline().geo(new SphereGeometry(0.46, 24, 12).scale(1, 0.56, 1), 0, 0, 0, undefined, 60)
  h.circle(0, LAT.y, 0, LAT.r + 0.004, 32).circle(0, -LAT.y, 0, LAT.r + 0.004, 32)
  for (const [x, z] of ROTORS) {
    h.box(0.6, 0.05, 0.07, x / 2, 0.02, z / 2, [0, Math.atan2(-z, x), 0])
    h.torus(0.32, 0.028, x, 0.06, z, SIDE, 4, 32)
    h.cyl(0.05, 0.05, 0.08, x, 0.06, z, 8)
  }
  for (const z of [-0.22, 0.22]) {
    h.box(0.7, 0.03, 0.04, 0, -0.3, z)
    for (const x of [-0.18, 0.18]) h.box(0.03, 0.16, 0.03, x, -0.21, z)
  }
  return h.build()
}
const DRONE_TRIM = () => new Hairline().circle(0, 0, 0, 0.466, 48).build()
const GLOW = new SphereGeometry(0.1, 12, 8)
const SPARKS = 140

function Drone(props: Props) {
  const { sim, c } = props
  const u = sim.units.drone
  const group = useRef<Group>(null)
  const tilt = useRef<Group>(null)
  const glow = useRef<Mesh>(null)
  const blades = useSegments(32, c.edge)
  const tether = useSegments(1, c.edge)
  const ripple = useSegments(48, c.edge, 0.45)
  const st = useMemo(() => ({
    pos: new Float32Array(SPARKS * 3).fill(1e5), vel: new Float32Array(SPARKS * 3), life: new Float32Array(SPARKS), next: 0,
    last: u.pos.clone(), vx: 0, vz: 0, spin: 2, angle: [0, 0.4, 0.8, 1.2],
  }), [u])
  const sparks = useMemo(() => {
    const g = new BufferGeometry()
    g.setAttribute('position', new BufferAttribute(st.pos, 3))
    const p = new Points(g, new PointsMaterial({ color: BRAND.spark, size: 2.5, sizeAttenuation: false, toneMapped: false }))
    p.frustumCulled = false
    return p
  }, [st])
  useEffect(() => () => { sparks.geometry.dispose(); (sparks.material as PointsMaterial).dispose() }, [sparks])
  const weld = useMemo(() => new Vector3(), [])
  useFrame((_, dt) => {
    const flying = u.state !== 'parked'
    const g = group.current!
    g.position.copy(u.pos)
    if (flying) g.position.y += Math.sin(sim.clock * 6.5) * 0.035
    const step = Math.max(dt, 1e-3)
    st.vx += ((u.pos.x - st.last.x) / step - st.vx) * ease(dt, 5)
    st.vz += ((u.pos.z - st.last.z) / step - st.vz) * ease(dt, 5)
    st.last.copy(u.pos)
    tilt.current!.rotation.set(clamp(st.vz * 0.05, -0.35, 0.35), 0, clamp(-st.vx * 0.05, -0.35, 0.35) + Math.sin(sim.clock * 1.7) * 0.04)
    st.spin += ((flying ? 36 : 1.5) - st.spin) * ease(dt, 2)

    const b = segmentWriter(blades)
    for (let i = 0; i < 4; i++) {
      const x = ROTORS[i][0], z = ROTORS[i][1]
      st.angle[i] += dt * st.spin * (i % 2 ? 1 : -1)
      for (let q = 0; q < 2; q++) {
        const cs = Math.cos(st.angle[i] + q * (Math.PI / 2)), sn = Math.sin(st.angle[i] + q * (Math.PI / 2))
        for (let k = -1; k <= 1; k += 2) {
          const s = k * 0.025, e = k * 0.26
          b.add(x - cs * 0.26 - sn * s, 0.1, z - sn * 0.26 + cs * s, x + cs * 0.26 - sn * s, 0.1, z + sn * 0.26 + cs * s)
          b.add(x + cs * e + sn * 0.025, 0.1, z + sn * e - cs * 0.025, x + cs * e - sn * 0.025, 0.1, z + sn * e + cs * 0.025)
        }
      }
    }
    b.done()

    const rw = segmentWriter(ripple)
    if (flying) {
      const k = (sim.clock % 1.4) / 1.4
      const y = Math.max(0.02, u.pos.y - 0.9 - k * 0.6), r = (0.5 + k * 1.8) * 0.5
      for (let i = 0; i < 48; i++) {
        const a0 = (i / 48) * Math.PI * 2, a1 = ((i + 1) / 48) * Math.PI * 2
        rw.add(u.pos.x + Math.cos(a0) * r, y, u.pos.z + Math.sin(a0) * r, u.pos.x + Math.cos(a1) * r, y, u.pos.z + Math.sin(a1) * r)
      }
      ;(ripple.material as LineBasicMaterial).opacity = (1 - k) * 0.45
    }
    rw.done()

    const tw = segmentWriter(tether)
    if (u.holding) tw.add(u.pos.x, u.pos.y - 0.26, u.pos.z, u.holding.pos.x, u.holding.pos.y + u.holding.size[1] / 2, u.holding.pos.z)
    tw.done()

    const work = u.work
    const welding = !!work && work.part.mode === 'board'
    glow.current!.visible = welding
    if (work && welding) {
      const p = work.part
      const [a, bz] = CORNERS[Math.min(3, Math.floor(p.finish * 4))]
      const x = a * (p.size[0] / 2 + 0.035), z = bz * (p.size[2] / 2 + 0.035)
      const cs = Math.cos(p.rot), sn = Math.sin(p.rot)
      weld.set(p.pos.x + x * cs + z * sn, p.pos.y - p.size[1] / 2 + 0.04, p.pos.z - x * sn + z * cs)
      glow.current!.position.copy(weld)
      glow.current!.scale.setScalar(breathe(sim.time))
      for (let n = 0; n < 5; n++) {
        const i = st.next++ % SPARKS
        st.pos[i * 3] = weld.x
        st.pos[i * 3 + 1] = weld.y
        st.pos[i * 3 + 2] = weld.z
        const ang = Math.random() * Math.PI * 2, s = 0.8 + Math.random() * 2.6
        st.vel[i * 3] = Math.cos(ang) * s
        st.vel[i * 3 + 1] = 1.4 + Math.random() * 3.2
        st.vel[i * 3 + 2] = Math.sin(ang) * s
        st.life[i] = 0.3 + Math.random() * 0.4
      }
    }
    for (let i = 0; i < SPARKS; i++) {
      if (st.life[i] <= 0) {
        st.pos[i * 3] = st.pos[i * 3 + 1] = st.pos[i * 3 + 2] = 1e5
        continue
      }
      st.life[i] -= dt
      st.vel[i * 3 + 1] -= 14 * dt
      st.pos[i * 3] += st.vel[i * 3] * dt
      st.pos[i * 3 + 1] = Math.max(BY + 0.02, st.pos[i * 3 + 1] + st.vel[i * 3 + 1] * dt)
      st.pos[i * 3 + 2] += st.vel[i * 3 + 2] * dt
    }
    sparks.geometry.getAttribute('position').needsUpdate = true
  })
  return (
    <>
      <group ref={group} {...events('drone', props)}>
        <group ref={tilt} scale={1.45}>
          <Solid build={DRONE} fill={c.surface} edge={c.edge} />
          <Solid build={DRONE_TRIM} fill={c.surface} edge={BRAND.claude} />
          <primitive object={blades} />
        </group>
      </group>
      <primitive object={tether} />
      <primitive object={ripple} />
      <mesh ref={glow} geometry={GLOW} material={fillMat(BRAND.spark)} visible={false} frustumCulled={false} />
      <primitive object={sparks} />
    </>
  )
}

const F1 = 1.05
const F2 = 1.75
const REACH = 1.65
const HIP = 0.58
const EMIT = 0.62
const TOP = 0.3
const HEX = (r: number, y: number) => Array.from({ length: 6 }, (_, k) => [r * Math.sin((k * Math.PI) / 3), y, r * Math.cos((k * Math.PI) / 3)] as const)
const WALKER = () => new Hairline().cyl(0.66, 0.56, 0.24, 0, 0, 0, 6).cyl(0.4, 0.5, 0.1, 0, 0.17, 0, 6).build()
const WALKER_TRIM = () => new Hairline().poly(HEX(0.625, 0), true).build()
const HEAD = () => new Hairline().box(0.42, 0.16, 0.26, 0, 0, 0).cyl(0.04, 0.05, 0.4, EMIT - 0.2, 0, 0, 10, [0, 0, Math.PI / 2]).build()
const JAW = () => new Hairline().box(0.36, 0.22, 0.04, 0, -0.24, 0).build()
const FEMUR = new BoxGeometry(F1, 0.08, 0.08).translate(F1 / 2, 0, 0)
const TIBIA = new BoxGeometry(F2, 0.05, 0.05).translate(F2 / 2, 0, 0)
const HIT = new SphereGeometry(0.07, 10, 8)

/** Where a leg at body angle `a` reaches `r` out from `p` under `heading`. */
const around = (p: Vector3, a: number, heading: number, r: number, out: Vector3) => out.set(p.x + Math.cos(a - heading) * r, 0, p.z + Math.sin(a - heading) * r)

function Walker(props: Props) {
  const { sim, c } = props
  const u = sim.units.walker
  const body = useRef<Group>(null)
  const head = useRef<Group>(null)
  const jaws = useRef<(Group | null)[]>([])
  const femurs = useRef<InstancedMesh>(null)
  const tibias = useRef<InstancedMesh>(null)
  const hit = useRef<Mesh>(null)
  const edges = useSegments(6 * 2 * 12, c.edge)
  const laser = useSegments(1, BRAND.codex)
  const legs = useMemo(() => Array.from({ length: 6 }, (_, k) => ({ a: (k / 6) * Math.PI * 2 + Math.PI / 6, foot: new Vector3(), from: new Vector3(), to: new Vector3(), t: 1, init: false })), [])
  const st = useMemo(() => ({ last: u.pos.clone(), heading: 0, vx: 0, vz: 0, grip: 0, aim: 0, next: 0 }), [u])
  const v = useMemo(() => ({ hip: new Vector3(), ideal: new Vector3(), knee: new Vector3(), d: new Vector3(), tgt: new Vector3() }), [])
  useFrame((_, dt) => {
    const { hip, ideal, knee, d, tgt } = v
    const b = body.current!
    b.position.copy(u.pos)
    const step = Math.max(dt, 1e-3)
    st.vx += ((u.pos.x - st.last.x) / step - st.vx) * ease(dt, 8)
    st.vz += ((u.pos.z - st.last.z) / step - st.vz) * ease(dt, 8)
    st.last.copy(u.pos)
    if (Math.hypot(st.vx, st.vz) > 0.4) st.heading += wrap(Math.atan2(-st.vz, st.vx) - st.heading) * ease(dt, 6)
    b.rotation.y = st.heading

    const work = u.work && u.work.part.mode === 'board' ? u.work : null
    const idle = !u.work && !u.holding && !u.steps.length
    if (work) outlinePoint(work.part, work.part.finish, tgt)
    const aim = work ? wrap(Math.atan2(-(tgt.z - u.pos.z), tgt.x - u.pos.x) - st.heading) : idle ? Math.sin(sim.clock * 0.9) * 0.9 : 0
    st.aim += wrap(aim - st.aim) * ease(dt, work ? 14 : 5)
    head.current!.rotation.y = st.aim
    st.grip += ((u.holding ? 1 : 0) - st.grip) * ease(dt, 14)
    jaws.current.forEach((j, i) => j && (j.position.z = (i ? 1 : -1) * (0.3 - st.grip * 0.1)))

    let stepping = false
    for (const l of legs) if (l.t < 1) stepping = true
    for (let pass = 0; pass < 2 && !stepping; pass++) {
      const g = pass ? 1 - st.next : st.next
      let far = false
      for (let k = g; k < 6; k += 2) {
        const l = legs[k]
        around(u.pos, l.a, st.heading, REACH, ideal)
        if (Math.hypot(ideal.x + st.vx * 0.16 - l.foot.x, ideal.z + st.vz * 0.16 - l.foot.z) > 0.42) far = true
      }
      if (!far) continue
      for (let k = g; k < 6; k += 2) {
        const l = legs[k]
        around(u.pos, l.a, st.heading, REACH, l.to)
        l.to.x += st.vx * 0.2
        l.to.z += st.vz * 0.2
        l.to.y = onBoard(sim.rig.cell, l.to.x, l.to.z) ? BY : 0
        l.from.copy(l.foot)
        l.t = 0
      }
      st.next = 1 - g
      stepping = true
    }
    const ew = segmentWriter(edges)
    for (let k = 0; k < 6; k++) {
      const l = legs[k]
      if (!l.init) {
        around(u.pos, l.a, st.heading, REACH, l.foot)
        l.foot.y = onBoard(sim.rig.cell, l.foot.x, l.foot.z) ? BY : 0
        l.init = true
      }
      if (l.t < 1) {
        l.t = Math.min(1, l.t + dt / 0.14)
        l.foot.lerpVectors(l.from, l.to, l.t * l.t * (3 - 2 * l.t))
        l.foot.y += Math.sin(l.t * Math.PI) * 0.34
      }
      around(u.pos, l.a, st.heading, HIP, hip).setY(u.pos.y - 0.04)
      d.copy(l.foot).sub(hip)
      const r = Math.max(Math.hypot(d.x, d.z), 1e-3)
      const D = clamp(d.length(), 0.2, F1 + F2 - 0.01)
      const t1 = Math.atan2(d.y, r) + Math.acos(clamp((F1 * F1 + D * D - F2 * F2) / (2 * F1 * D), -1, 1))
      knee.set(hip.x + (d.x / r) * F1 * Math.cos(t1), hip.y + F1 * Math.sin(t1), hip.z + (d.z / r) * F1 * Math.cos(t1))
      M.compose(hip, Q.setFromUnitVectors(X, d.copy(knee).sub(hip).normalize()), ONE)
      femurs.current!.setMatrixAt(k, M)
      bar(ew, M, F1, 0.04)
      M.compose(knee, Q.setFromUnitVectors(X, d.copy(l.foot).sub(knee).normalize()), ONE)
      tibias.current!.setMatrixAt(k, M)
      bar(ew, M, F2, 0.025)
    }
    femurs.current!.instanceMatrix.needsUpdate = true
    tibias.current!.instanceMatrix.needsUpdate = true
    ew.done()

    const yaw = st.heading + st.aim
    const ex = u.pos.x + Math.cos(yaw) * EMIT, ey = u.pos.y + TOP, ez = u.pos.z - Math.sin(yaw) * EMIT
    const lw = segmentWriter(laser)
    hit.current!.visible = !!work
    if (work) {
      lw.add(ex, ey, ez, tgt.x, tgt.y, tgt.z)
      hit.current!.position.copy(tgt)
      hit.current!.scale.setScalar(breathe(sim.time))
    } else if (idle && u.state === 'active') lw.add(ex, ey, ez, u.pos.x + Math.cos(yaw) * 2.6, 0.01, u.pos.z - Math.sin(yaw) * 2.6)
    lw.done()
  })
  return (
    <>
      <group ref={body} {...events('walker', props)}>
        <Solid build={WALKER} fill={c.surface} edge={c.edge} />
        <Solid build={WALKER_TRIM} fill={c.surface} edge={BRAND.codex} />
        <group ref={head} position={[0, TOP, 0]}>
          <Solid build={HEAD} fill={c.surface} edge={c.edge} />
        </group>
        {[0, 1].map((i) => (
          <group key={i} ref={(g) => { jaws.current[i] = g }}>
            <Solid build={JAW} fill={c.surface} edge={c.edge} />
          </group>
        ))}
      </group>
      <instancedMesh ref={femurs} args={[FEMUR, fillMat(c.surface), 6]} frustumCulled={false} boundingSphere={SCENE_SPHERE} />
      <instancedMesh ref={tibias} args={[TIBIA, fillMat(c.surface), 6]} frustumCulled={false} boundingSphere={SCENE_SPHERE} />
      <primitive object={edges} />
      <primitive object={laser} />
      <mesh ref={hit} geometry={HIT} material={fillMat(BRAND.codex)} visible={false} frustumCulled={false} />
    </>
  )
}

export function Integrators(props: Props) {
  return (
    <>
      <Arm {...props} />
      <Drone {...props} />
      <Walker {...props} />
    </>
  )
}

const BEAD = new SphereGeometry(0.05, 10, 8)
const BEADS = 1024

export function WorkMarks({ sim }: { sim: Sim; c: Look }) {
  const beads = useRef<InstancedMesh>(null)
  const etch = useSegments(2400, BRAND.codex)
  useFrame(() => {
    const m = beads.current!
    const w = segmentWriter(etch)
    let n = 0
    for (const p of sim.live) {
      if (p.mode !== 'board' || !p.mark) continue
      const cs = Math.cos(p.rot), sn = Math.sin(p.rot)
      const sx = p.size[0], sy = p.size[1], sz = p.size[2]
      const px = p.pos.x, pz = p.pos.z
      if (p.mark === 'drone') {
        const shown = Math.floor(p.finish * 4 + 1e-4)
        for (let k = 0; k < shown && n < BEADS; k++) {
          const x = CORNERS[k][0] * (sx / 2 + 0.035), z = CORNERS[k][1] * (sz / 2 + 0.035)
          M.makeTranslation(px + x * cs + z * sn, p.pos.y - sy / 2 + 0.03, pz - x * sn + z * cs)
          m.setMatrixAt(n++, M)
        }
      } else if (p.mark === 'walker') {
        const hx = sx / 2 - 0.07, hz = sz / 2 - 0.07
        let left = p.finish * (4 * hx + 4 * hz)
        const y = p.pos.y + sy / 2 + 0.006
        for (let k = 0; k < 4 && left > 0; k++) {
          const per = k % 2 ? 2 * hz : 2 * hx
          const t = Math.min(1, left / per)
          left -= per
          const ax = CORNERS[k][0] * hx, az = CORNERS[k][1] * hz
          const bx = (CORNERS[k][0] + (CORNERS[(k + 1) % 4][0] - CORNERS[k][0]) * t) * hx, bz = (CORNERS[k][1] + (CORNERS[(k + 1) % 4][1] - CORNERS[k][1]) * t) * hz
          w.add(px + ax * cs + az * sn, y, pz - ax * sn + az * cs, px + bx * cs + bz * sn, y, pz - bx * sn + bz * cs)
        }
        if (p.finish >= 1) {
          const gx = -hx * 0.4, gz = 0, kx = -hx * 0.1, kz = -hz * 0.4, ix = hx * 0.45, iz = hz * 0.45
          w.add(px + gx * cs + gz * sn, y, pz - gx * sn + gz * cs, px + kx * cs + kz * sn, y, pz - kx * sn + kz * cs)
          w.add(px + kx * cs + kz * sn, y, pz - kx * sn + kz * cs, px + ix * cs + iz * sn, y, pz - ix * sn + iz * cs)
        }
      }
    }
    m.count = n
    m.instanceMatrix.needsUpdate = true
    w.done()
  })
  return (
    <>
      <instancedMesh ref={beads} args={[BEAD, fillMat(BRAND.bead), BEADS]} frustumCulled={false} boundingSphere={SCENE_SPHERE} />
      <primitive object={etch} />
    </>
  )
}
