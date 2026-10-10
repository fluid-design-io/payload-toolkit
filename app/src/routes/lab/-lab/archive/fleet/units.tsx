import { useFrame } from '@react-three/fiber'
import { Edges } from '@react-three/drei'
import { useMemo, useRef } from 'react'
import { BackSide, Group, Mesh, MeshBasicMaterial, Points, Vector3 } from 'three'
import type { BufferAttribute } from 'three'

import { BRAND, Box, hover, segmentWriter, useSegments } from './kit'
import type { Colors, Tip } from './kit'
import { BY, machine, onBoard } from './sim'
import type { IntegratorId, Part, Sim, SlotKey } from './sim'

type Props = { sim: Sim; c: Colors; tip: Tip; deploy: (slot: SlotKey, id: string) => void }
const X = new Vector3(1, 0, 0)
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))

function unitEvents(id: IntegratorId, { sim, tip, deploy }: Props) {
  const m = machine('integrator', id)
  return {
    onClick: (e: { stopPropagation: () => void }) => {
      e.stopPropagation()
      if (sim.rig.integrator !== id) deploy('integrator', id)
    },
    ...hover(tip, () => `${m.brand} · ${m.model}`, () => (sim.units[id].state === 'parked' ? 'Parked · click to launch it' : m.note)),
  }
}

function partPoint(p: Part, f: number, out: Vector3) {
  const [sx, sy, sz] = p.size
  const hx = sx / 2 - 0.07, hz = sz / 2 - 0.07
  const loop = [[-hx, -hz], [hx, -hz], [hx, hz], [-hx, hz], [-hx, -hz]]
  const per = [2 * hx, 2 * hz, 2 * hx, 2 * hz]
  let left = clamp(f, 0, 1) * (per[0] + per[1] + per[2] + per[3])
  let k = 0
  while (k < 3 && left > per[k]) left -= per[k++]
  const t = Math.min(1, left / per[k])
  const x = loop[k][0] + (loop[k + 1][0] - loop[k][0]) * t
  const z = loop[k][1] + (loop[k + 1][1] - loop[k][1]) * t
  const cs = Math.cos(p.rot), sn = Math.sin(p.rot)
  return out.set(p.pos.x + x * cs + z * sn, p.pos.y + sy / 2 + 0.006, p.pos.z - x * sn + z * cs)
}

const AGV = 0.42
const H0 = 1.9
const L1 = 5.0
const L2 = 5.0

export function ArmUnit(props: Props) {
  const { sim, c } = props
  const u = sim.units.arm
  const root = useRef<Group>(null)
  const cart = useRef<Group>(null)
  const turret = useRef<Group>(null)
  const shoulder = useRef<Group>(null)
  const elbow = useRef<Group>(null)
  const wrist = useRef<Group>(null)
  const fingers = useRef<(Group | null)[]>([])
  const wheels = useRef<(Mesh | null)[]>([])
  const last = useMemo(() => ({ base: u.base.clone(), heading: 0, grip: 0 }), [u])
  useFrame((_, dt) => {
    root.current!.position.set(u.base.x, 0, u.base.z)
    const dx0 = u.base.x - last.base.x, dz0 = u.base.z - last.base.z
    const moved = Math.hypot(dx0, dz0)
    if (moved > 1e-4) last.heading += (Math.atan2(-dz0, dx0) - last.heading) * (1 - Math.exp(-dt * 10))
    last.base.copy(u.base)
    cart.current!.rotation.y = last.heading
    wheels.current.forEach((w) => w && (w.rotation.y += moved / 0.14))
    const w = u.pos
    const dx = w.x - u.base.x, dz = w.z - u.base.z
    const yaw = Math.atan2(-dz, dx)
    const r = Math.max(Math.hypot(dx, dz), 0.001)
    const h = w.y - AGV - H0
    const d = clamp(Math.hypot(r, h), Math.abs(L1 - L2) + 0.05, L1 + L2 - 0.01)
    const phi = Math.atan2(h, r)
    const a = Math.acos(clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1))
    const t1 = phi + a
    const t2 = Math.atan2(h - L1 * Math.sin(t1), r - L1 * Math.cos(t1))
    turret.current!.rotation.y = yaw
    shoulder.current!.rotation.z = t1
    elbow.current!.rotation.z = t2 - t1
    wrist.current!.rotation.z = -t2 + Math.sin(sim.time * 1.7) * 0.05
    const fidget = u.state === 'parked' || (!u.steps.length && u.state === 'active') ? 0.5 + Math.sin(sim.time * 2.3) * 0.5 : 0
    last.grip += ((u.holding ? 1 : 0) - last.grip) * (1 - Math.exp(-dt * 9))
    const open = 0.34 - last.grip * 0.1 - fidget * 0.08
    fingers.current.forEach((f, i) => f && (f.position.z = (i ? 1 : -1) * open))
  })
  const joint = (radius: number, length: number) => (
    <mesh rotation={[Math.PI / 2, 0, 0]}>
      <cylinderGeometry args={[radius, radius, length, 24]} />
      <meshStandardMaterial color={c.surface} roughness={1} />
      <Edges color={c.edge} threshold={20} />
    </mesh>
  )
  return (
    <group ref={root} {...unitEvents('arm', props)}>
      <group ref={cart}>
        <Box size={[1.6, 0.26, 1.3]} position={[0, 0.27, 0]} color={c.surface} edge={c.edge} />
        {[[-0.55, -0.66], [0.55, -0.66], [-0.55, 0.66], [0.55, 0.66]].map(([x, z], i) => (
          <mesh key={i} ref={(m) => { wheels.current[i] = m }} position={[x, 0.14, z]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.14, 0.14, 0.1, 8]} />
            <meshStandardMaterial color={c.surface} roughness={1} />
            <Edges color={c.edge} />
          </mesh>
        ))}
      </group>
      <mesh position={[0, AGV + 0.12, 0]}>
        <cylinderGeometry args={[0.62, 0.7, 0.24, 32]} />
        <meshStandardMaterial color={c.surface} roughness={1} />
        <Edges color={c.edge} threshold={20} />
      </mesh>
      <group ref={turret} position={[0, AGV, 0]}>
        <mesh position={[0, (H0 + 0.24) / 2, 0]}>
          <cylinderGeometry args={[0.3, 0.4, H0 - 0.24, 24]} />
          <meshStandardMaterial color={c.surface} roughness={1} />
          <Edges color={c.edge} threshold={20} />
        </mesh>
        <group ref={shoulder} position={[0, H0, 0]}>
          {joint(0.36, 0.8)}
          <Box size={[L1, 0.24, 0.24]} position={[L1 / 2, 0, 0.26]} color={c.surface} edge={c.edge} />
          <Box size={[L1, 0.24, 0.24]} position={[L1 / 2, 0, -0.26]} color={c.surface} edge={c.edge} />
          <group ref={elbow} position={[L1, 0, 0]}>
            {joint(0.3, 0.84)}
            <Box size={[L2, 0.28, 0.28]} position={[L2 / 2, 0, 0]} color={c.surface} edge={c.edge} />
            <group ref={wrist} position={[L2, 0, 0]}>
              {joint(0.2, 0.5)}
              <Box size={[0.44, 0.26, 0.8]} position={[0, -0.3, 0]} color={c.surface} edge={c.edge} />
              {[0, 1].map((i) => (
                <group key={i} ref={(g) => { fingers.current[i] = g }}>
                  <Box size={[0.3, 0.34, 0.05]} position={[0, -0.58, 0]} color={c.surface} edge={c.edge} />
                </group>
              ))}
            </group>
          </group>
        </group>
      </group>
    </group>
  )
}

export function DroneUnit(props: Props) {
  const { sim, c } = props
  const u = sim.units.drone
  const group = useRef<Group>(null)
  const tilt = useRef<Group>(null)
  const rotors = useRef<(Group | null)[]>([])
  const ripple = useRef<Mesh>(null)
  const glow = useRef<Mesh>(null)
  const lamp = useRef<Mesh>(null)
  const points = useRef<Points>(null)
  const tether = useSegments(2, BRAND.claude)
  const N = 140
  const state = useMemo(() => ({ pos: new Float32Array(N * 3).fill(1e5), vel: new Float32Array(N * 3), life: new Float32Array(N), next: 0, last: u.pos.clone(), vx: 0, vz: 0, spin: 2 }), [u])
  const weld = useMemo(() => new Vector3(), [])
  useFrame((_, dt) => {
    const g = group.current!
    g.position.copy(u.pos)
    const flying = u.state !== 'parked'
    if (flying) g.position.y += Math.sin(sim.time * 6.5) * 0.035
    const vx = (u.pos.x - state.last.x) / Math.max(dt, 1e-3), vz = (u.pos.z - state.last.z) / Math.max(dt, 1e-3)
    state.last.copy(u.pos)
    state.vx += (vx - state.vx) * (1 - Math.exp(-dt * 5))
    state.vz += (vz - state.vz) * (1 - Math.exp(-dt * 5))
    tilt.current!.rotation.set(clamp(state.vz * 0.05, -0.35, 0.35), 0, clamp(-state.vx * 0.05, -0.35, 0.35) + Math.sin(sim.time * 1.7) * 0.04)
    state.spin += ((flying ? 36 : 1.5) - state.spin) * (1 - Math.exp(-dt * 2))
    rotors.current.forEach((r, i) => r && (r.rotation.y += dt * state.spin * (i % 2 ? 1 : -1)))
    ;(lamp.current!.material as MeshBasicMaterial).opacity = 0.5 + Math.sin(sim.time * (flying ? 4 : 1.4)) * 0.4
    const rp = ripple.current!
    const k = (sim.time % 1.4) / 1.4
    rp.visible = flying
    rp.position.set(u.pos.x, Math.max(0.02, u.pos.y - 0.9 - k * 0.6), u.pos.z)
    rp.scale.setScalar(0.5 + k * 1.8)
    ;(rp.material as MeshBasicMaterial).opacity = (1 - k) * 0.45
    const w = segmentWriter(tether)
    if (u.holding) w.add(u.pos.x, u.pos.y - 0.18, u.pos.z, u.holding.pos.x, u.holding.pos.y + u.holding.size[1] / 2, u.holding.pos.z)
    w.done()
    const work = u.work
    const welding = !!work && work.part.phase === 'seated'
    glow.current!.visible = welding
    if (welding) {
      const p = work.part
      const k4 = Math.min(3, Math.floor(p.finish * 4))
      const [a, b] = [[-1, -1], [1, -1], [1, 1], [-1, 1]][k4]
      const x = a * (p.size[0] / 2 + 0.035), z = b * (p.size[2] / 2 + 0.035)
      const cs = Math.cos(p.rot), sn = Math.sin(p.rot)
      weld.set(p.pos.x + x * cs + z * sn, p.pos.y - p.size[1] / 2 + 0.04, p.pos.z - x * sn + z * cs)
      glow.current!.position.copy(weld)
      glow.current!.scale.setScalar(0.5 + Math.random() * 0.9)
      for (let n = 0; n < 5; n++) {
        const i = state.next++ % N
        state.pos.set([weld.x, weld.y, weld.z], i * 3)
        const ang = Math.random() * Math.PI * 2, s = 0.8 + Math.random() * 2.6
        state.vel.set([Math.cos(ang) * s, 1.4 + Math.random() * 3.2, Math.sin(ang) * s], i * 3)
        state.life[i] = 0.3 + Math.random() * 0.4
      }
    }
    for (let i = 0; i < N; i++) {
      if (state.life[i] <= 0) {
        state.pos[i * 3] = state.pos[i * 3 + 1] = state.pos[i * 3 + 2] = 1e5
        continue
      }
      state.life[i] -= dt
      state.vel[i * 3 + 1] -= 14 * dt
      state.pos[i * 3] += state.vel[i * 3] * dt
      state.pos[i * 3 + 1] = Math.max(BY + 0.02, state.pos[i * 3 + 1] + state.vel[i * 3 + 1] * dt)
      state.pos[i * 3 + 2] += state.vel[i * 3 + 2] * dt
    }
    ;(points.current!.geometry.getAttribute('position') as BufferAttribute).needsUpdate = true
  })
  const orange = BRAND.claude
  return (
    <>
      <group ref={group} {...unitEvents('drone', props)}>
        <group ref={tilt} scale={1.45}>
          <mesh scale={[1, 0.56, 1]}>
            <sphereGeometry args={[0.46, 28, 18]} />
            <meshStandardMaterial color={c.warm} roughness={0.9} />
          </mesh>
          <mesh scale={[1.06, 0.6, 1.06]}>
            <sphereGeometry args={[0.46, 28, 18]} />
            <meshBasicMaterial color={orange} side={BackSide} />
          </mesh>
          <mesh ref={lamp} position={[0, 0.27, 0]}>
            <sphereGeometry args={[0.07, 12, 10]} />
            <meshBasicMaterial color={orange} transparent toneMapped={false} />
          </mesh>
          {[[0.3, 0.06, 0.32], [0.38, 0.06, 0.18]].map(([x, y, z], i) => (
            <mesh key={i} position={[x * (i ? 1 : 0.62) + (i ? 0 : 0.08), y, z * (i ? 0.5 : 1.15)]}>
              <sphereGeometry args={[0.045, 10, 8]} />
              <meshBasicMaterial color={c.theme === 'dark' ? '#FCEDE6' : '#3A2219'} />
            </mesh>
          ))}
          {[[-0.64, -0.64], [0.64, -0.64], [-0.64, 0.64], [0.64, 0.64]].map(([x, z], i) => (
            <group key={i}>
              <mesh position={[x / 2, 0.02, z / 2]} rotation={[0, Math.atan2(-z, x), 0]}>
                <boxGeometry args={[0.6, 0.05, 0.07]} />
                <meshStandardMaterial color={c.warm} roughness={1} />
                <Edges color={orange} />
              </mesh>
              <mesh position={[x, 0.06, z]} rotation={[Math.PI / 2, 0, 0]}>
                <torusGeometry args={[0.32, 0.028, 8, 36]} />
                <meshStandardMaterial color={c.warm} roughness={1} />
                <Edges color={orange} threshold={40} />
              </mesh>
              <group ref={(r) => { rotors.current[i] = r }} position={[x, 0.08, z]}>
                <mesh>
                  <boxGeometry args={[0.52, 0.01, 0.05]} />
                  <meshBasicMaterial color={orange} />
                </mesh>
                <mesh rotation={[0, Math.PI / 2, 0]}>
                  <boxGeometry args={[0.52, 0.01, 0.05]} />
                  <meshBasicMaterial color={orange} />
                </mesh>
              </group>
            </group>
          ))}
          {[-0.22, 0.22].map((z) => (
            <mesh key={z} position={[0, -0.3, z]}>
              <boxGeometry args={[0.7, 0.03, 0.04]} />
              <meshBasicMaterial color={orange} />
            </mesh>
          ))}
        </group>
      </group>
      <primitive object={tether} />
      <mesh ref={ripple} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.5, 0.53, 48]} />
        <meshBasicMaterial color={orange} transparent depthWrite={false} toneMapped={false} />
      </mesh>
      <mesh ref={glow} visible={false}>
        <sphereGeometry args={[0.1, 12, 10]} />
        <meshBasicMaterial color="#FFE2A8" toneMapped={false} />
      </mesh>
      <points ref={points} frustumCulled={false}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[state.pos, 3]} />
        </bufferGeometry>
        <pointsMaterial color={BRAND.spark} size={3.5} sizeAttenuation={false} toneMapped={false} />
      </points>
    </>
  )
}

const F1 = 1.05
const F2 = 1.75
export function WalkerUnit(props: Props) {
  const { sim, c } = props
  const u = sim.units.walker
  const body = useRef<Group>(null)
  const turret = useRef<Group>(null)
  const jaws = useRef<(Mesh | null)[]>([])
  const femurs = useRef<(Group | null)[]>([])
  const tibias = useRef<(Group | null)[]>([])
  const hit = useRef<Mesh>(null)
  const laser = useSegments(4, BRAND.codex)
  const legs = useMemo(
    () => Array.from({ length: 6 }, (_, k) => ({ a: (k / 6) * Math.PI * 2 + Math.PI / 6, foot: new Vector3(), from: new Vector3(), to: new Vector3(), t: 1, init: false })),
    [],
  )
  const st = useMemo(() => ({ last: u.pos.clone(), heading: 0, vx: 0, vz: 0, grip: 0 }), [u])
  const hip = useMemo(() => new Vector3(), [])
  const ideal = useMemo(() => new Vector3(), [])
  const knee = useMemo(() => new Vector3(), [])
  const d = useMemo(() => new Vector3(), [])
  const tgt = useMemo(() => new Vector3(), [])
  useFrame((_, dt) => {
    const b = body.current!
    b.position.copy(u.pos)
    const vx = (u.pos.x - st.last.x) / Math.max(dt, 1e-3), vz = (u.pos.z - st.last.z) / Math.max(dt, 1e-3)
    st.last.copy(u.pos)
    st.vx += (vx - st.vx) * (1 - Math.exp(-dt * 8))
    st.vz += (vz - st.vz) * (1 - Math.exp(-dt * 8))
    if (Math.hypot(st.vx, st.vz) > 0.4) {
      const want = Math.atan2(-st.vz, st.vx)
      let diff = want - st.heading
      diff = Math.atan2(Math.sin(diff), Math.cos(diff))
      st.heading += diff * (1 - Math.exp(-dt * 6))
    }
    b.rotation.y = st.heading
    const scanning = !u.work && !u.holding && !u.steps.length
    turret.current!.rotation.y = scanning ? Math.sin(sim.time * 0.9) * 0.9 : 0
    st.grip += ((u.holding ? 1 : 0) - st.grip) * (1 - Math.exp(-dt * 14))
    jaws.current.forEach((j, i) => j && (j.position.z = (i ? 1 : -1) * (0.3 - st.grip * 0.1)))

    const cs = Math.cos(st.heading), sn = Math.sin(st.heading)
    const stepping = [0, 1].map((g) => legs.some((l, k) => k % 2 === g && l.t < 1))
    for (const g of [0, 1]) {
      if (stepping[0] || stepping[1]) break
      const group = legs.filter((_, k) => k % 2 === g)
      const far = group.some((l) => {
        ideal.set(u.pos.x + (Math.cos(l.a) * cs + Math.sin(l.a) * sn) * 1.65 + st.vx * 0.16, 0, u.pos.z + (-Math.cos(l.a) * sn + Math.sin(l.a) * cs) * 1.65 + st.vz * 0.16)
        return Math.hypot(ideal.x - l.foot.x, ideal.z - l.foot.z) > 0.42
      })
      if (far) {
        for (const l of group) {
          ideal.set(u.pos.x + (Math.cos(l.a) * cs + Math.sin(l.a) * sn) * 1.65 + st.vx * 0.2, 0, u.pos.z + (-Math.cos(l.a) * sn + Math.sin(l.a) * cs) * 1.65 + st.vz * 0.2)
          ideal.y = onBoard(sim.rig.cell, ideal.x, ideal.z) ? BY : 0
          l.from.copy(l.foot)
          l.to.copy(ideal)
          l.t = 0
        }
        break
      }
    }
    legs.forEach((l, k) => {
      if (!l.init) {
        l.foot.set(u.pos.x + (Math.cos(l.a) * cs + Math.sin(l.a) * sn) * 1.65, 0, u.pos.z + (-Math.cos(l.a) * sn + Math.sin(l.a) * cs) * 1.65)
        l.init = true
      }
      if (l.t < 1) {
        l.t = Math.min(1, l.t + dt / 0.14)
        const s = l.t * l.t * (3 - 2 * l.t)
        l.foot.lerpVectors(l.from, l.to, s)
        l.foot.y += Math.sin(l.t * Math.PI) * 0.34
      }
      hip.set(u.pos.x + (Math.cos(l.a) * cs + Math.sin(l.a) * sn) * 0.58, u.pos.y - 0.04, u.pos.z + (-Math.cos(l.a) * sn + Math.sin(l.a) * cs) * 0.58)
      d.copy(l.foot).sub(hip)
      const r = Math.max(Math.hypot(d.x, d.z), 1e-3)
      const D = clamp(d.length(), 0.2, F1 + F2 - 0.01)
      const phi = Math.atan2(d.y, r)
      const a = Math.acos(clamp((F1 * F1 + D * D - F2 * F2) / (2 * F1 * D), -1, 1))
      const t1 = phi + a
      knee.set(hip.x + (d.x / r) * F1 * Math.cos(t1), hip.y + F1 * Math.sin(t1), hip.z + (d.z / r) * F1 * Math.cos(t1))
      const fem = femurs.current[k], tib = tibias.current[k]
      if (fem) {
        fem.position.copy(hip)
        fem.quaternion.setFromUnitVectors(X, d.copy(knee).sub(hip).normalize())
      }
      if (tib) {
        tib.position.copy(knee)
        tib.quaternion.setFromUnitVectors(X, d.copy(l.foot).sub(knee).normalize())
      }
    })

    const w = segmentWriter(laser)
    const work = u.work
    hit.current!.visible = false
    if (work && work.part.phase === 'seated') {
      partPoint(work.part, work.part.finish, tgt)
      w.add(u.pos.x, u.pos.y - 0.16, u.pos.z, tgt.x, tgt.y, tgt.z)
      hit.current!.visible = true
      hit.current!.position.copy(tgt)
      hit.current!.scale.setScalar(0.7 + Math.random() * 0.6)
    } else if (scanning && u.state === 'active') {
      const ang = st.heading + Math.sin(sim.time * 0.9) * 0.9
      tgt.set(u.pos.x + Math.cos(ang) * 2.6, 0.01, u.pos.z - Math.sin(ang) * 2.6)
      w.add(u.pos.x, u.pos.y + 0.3, u.pos.z, tgt.x, tgt.y, tgt.z)
    }
    w.done()
  })
  const cyan = BRAND.codex
  return (
    <>
      <group ref={body} {...unitEvents('walker', props)}>
        <mesh>
          <cylinderGeometry args={[0.66, 0.56, 0.24, 6]} />
          <meshStandardMaterial color={c.surface} roughness={1} />
          <Edges color={c.fg} />
        </mesh>
        <mesh position={[0, 0.17, 0]}>
          <cylinderGeometry args={[0.4, 0.5, 0.1, 6]} />
          <meshStandardMaterial color={c.surface} roughness={1} />
          <Edges color={cyan} />
        </mesh>
        <group ref={turret} position={[0, 0.3, 0]}>
          <Box size={[0.42, 0.16, 0.26]} color={c.surface} edge={c.fg} />
          <mesh position={[0.28, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.04, 0.05, 0.16, 10]} />
            <meshBasicMaterial color={cyan} />
          </mesh>
        </group>
        {[0, 1].map((i) => (
          <mesh key={i} ref={(m) => { jaws.current[i] = m }} position={[0, -0.24, 0]}>
            <boxGeometry args={[0.36, 0.22, 0.04]} />
            <meshStandardMaterial color={c.surface} roughness={1} />
            <Edges color={cyan} />
          </mesh>
        ))}
      </group>
      {legs.map((_, k) => (
        <group key={k}>
          <group ref={(g) => { femurs.current[k] = g }}>
            <mesh position={[F1 / 2, 0, 0]}>
              <boxGeometry args={[F1, 0.08, 0.08]} />
              <meshStandardMaterial color={c.surface} roughness={1} />
              <Edges color={c.fg} />
            </mesh>
          </group>
          <group ref={(g) => { tibias.current[k] = g }}>
            <mesh position={[F2 / 2, 0, 0]}>
              <boxGeometry args={[F2, 0.05, 0.05]} />
              <meshStandardMaterial color={c.surface} roughness={1} />
              <Edges color={c.fg} />
            </mesh>
            <mesh position={[F2, 0, 0]}>
              <sphereGeometry args={[0.05, 8, 6]} />
              <meshBasicMaterial color={cyan} />
            </mesh>
          </group>
        </group>
      ))}
      <primitive object={laser} />
      <mesh ref={hit} visible={false}>
        <sphereGeometry args={[0.07, 10, 8]} />
        <meshBasicMaterial color="#D9FBFF" toneMapped={false} />
      </mesh>
    </>
  )
}

