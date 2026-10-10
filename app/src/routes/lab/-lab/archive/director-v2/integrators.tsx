import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
import { BoxGeometry, Color, Group, InstancedMesh, Mesh, MeshBasicMaterial, Object3D, Points, TorusGeometry, Vector3 } from 'three'
import type { BufferAttribute } from 'three'

import { BRAND } from './factory'
import { Dynamic, Fill, Surf, label, useFills, useWriter } from './lines'
import type { Look } from './look'
import { BOARD, REDUCED } from './sim'
import type { Part, Sim } from './sim'

const dummy = new Object3D()
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))
const ROTORS = [-0.64, -0.64, 0.64, -0.64, -0.64, 0.64, 0.64, 0.64]
const CORNERS = [-1, -1, 1, -1, 1, 1, -1, 1]
/** A steady pseudo-random value that changes at most every 0.34 s, so welding glows never flash above 3 Hz. */
const flicker = (time: number, seed: number) => {
  const x = Math.sin(Math.floor(time / 0.34) * 12.9898 + seed) * 43758.5453
  return x - Math.floor(x)
}

/** A point on the part's top perimeter at fraction `f` of the way around. */
function perimeter(p: Part, f: number, out: Vector3) {
  const [sx, sy, sz] = p.size
  const hx = sx / 2 + 0.03, hz = sz / 2 + 0.03
  const loop = [[-hx, -hz], [hx, -hz], [hx, hz], [-hx, hz], [-hx, -hz]]
  const per = [2 * hx, 2 * hz, 2 * hx, 2 * hz]
  let left = clamp(f, 0, 1) * (per[0] + per[1] + per[2] + per[3])
  let k = 0
  while (k < 3 && left > per[k]) left -= per[k++]
  const t = Math.min(1, left / per[k])
  return out.set(p.pos.x + loop[k][0] + (loop[k + 1][0] - loop[k][0]) * t, p.pos.y - sy / 2 + 0.02, p.pos.z + loop[k][1] + (loop[k + 1][1] - loop[k][1]) * t)
}

function useSparks(n: number) {
  return useMemo(() => ({ pos: new Float32Array(n * 3).fill(1e5), vel: new Float32Array(n * 3), life: new Float32Array(n), next: 0, n }), [n])
}
function emit(s: ReturnType<typeof useSparks>, at: Vector3, count: number) {
  for (let k = 0; k < count; k++) {
    const i = s.next++ % s.n
    s.pos[i * 3] = at.x; s.pos[i * 3 + 1] = at.y; s.pos[i * 3 + 2] = at.z
    const a = Math.random() * Math.PI * 2, v = 0.8 + Math.random() * 2.4
    s.vel[i * 3] = Math.cos(a) * v; s.vel[i * 3 + 1] = 1.4 + Math.random() * 3; s.vel[i * 3 + 2] = Math.sin(a) * v
    s.life[i] = 0.3 + Math.random() * 0.4
  }
}
function tick(s: ReturnType<typeof useSparks>, dt: number, floor: number) {
  for (let i = 0; i < s.n; i++) {
    if (s.life[i] <= 0) {
      s.pos[i * 3] = s.pos[i * 3 + 1] = s.pos[i * 3 + 2] = 1e5
      continue
    }
    s.life[i] -= dt
    s.vel[i * 3 + 1] -= 14 * dt
    s.pos[i * 3] += s.vel[i * 3] * dt
    s.pos[i * 3 + 1] = Math.max(floor, s.pos[i * 3 + 1] + s.vel[i * 3 + 1] * dt)
    s.pos[i * 3 + 2] += s.vel[i * 3 + 2] * dt
  }
}

function NameTag({ sim, c, name, verb, color, offset }: { sim: Sim; c: Look; name: string; verb: () => string; color: string; offset: number }) {
  const [text, setText] = useState(verb)
  const ref = useRef<Mesh>(null)
  useFrame(({ camera }) => {
    const next = verb()
    if (next !== text) setText(next)
    const s = ref.current
    if (!s) return
    s.position.set(sim.agent.pos.x, sim.agent.pos.y + offset, sim.agent.pos.z)
    s.quaternion.copy(camera.quaternion)
    const dist = camera.position.distanceTo(sim.agent.pos)
    ;(s.material as MeshBasicMaterial).opacity = clamp((dist - 8) / 6, 0, 1) * sim.agent.show
  })
  const map = useMemo(
    () => label(`${name} · ${text}`, { fg: c.fg, bg: c.surface, stroke: c.edge, size: 34, w: 768, h: 88, align: 'left', track: 1 }),
    [c, name, text],
  )
  useEffect(() => () => map.dispose(), [map])
  const dot = useMemo(() => new Color(color), [color])
  return (
    <mesh ref={ref} renderOrder={5}>
      <planeGeometry args={[2.8, 2.8 * (88 / 768)]} />
      <meshBasicMaterial map={map} transparent toneMapped={false} depthTest={false} depthWrite={false} color={dot.set('#FFFFFF')} />
    </mesh>
  )
}

/** Claude: a rounded orange drone that dives to each seated part and solders its corners. */
export function Drone({ sim, c }: { sim: Sim; c: Look }) {
  const group = useRef<Group>(null)
  const tilt = useRef<Group>(null)
  const rotors = useRef<InstancedMesh>(null)
  const glow = useRef<Mesh>(null)
  const lamp = useRef<Mesh>(null)
  const points = useRef<Points>(null)
  const sparks = useSparks(120)
  const weld = useMemo(() => new Vector3(), [])
  const vel = useMemo(() => ({ last: sim.agent.pos.clone(), vx: 0, vz: 0, spin: 0 }), [sim])
  const writer = useWriter(4 * 30 + 6, BRAND.claude)
  const orange = useMemo(() => new Color(BRAND.claude), [])
  const edge = useMemo(() => new Color(c.edge), [c.edge])
  const arms = useFills(() => {
    const out = [[-0.64, -0.64], [0.64, -0.64], [-0.64, 0.64], [0.64, 0.64]].flatMap(([x, z]) => {
      const arm = new BoxGeometry(0.6, 0.05, 0.07).rotateY(Math.atan2(-z, x)).translate(x / 2, 0.02, z / 2)
      const ring = new TorusGeometry(0.32, 0.028, 6, 28).rotateX(Math.PI / 2).translate(x, 0.06, z)
      return [arm, ring]
    })
    out.push(new BoxGeometry(0.7, 0.03, 0.04).translate(0, -0.3, -0.22), new BoxGeometry(0.7, 0.03, 0.04).translate(0, -0.3, 0.22))
    return out
  }, [])
  useFrame((_, dt) => {
    const g = group.current!
    const a = sim.agent
    g.position.copy(a.pos)
    g.scale.setScalar(Math.max(0.001, a.show) * 1.3)
    if (!REDUCED) g.position.y += Math.sin(sim.time * 6.5) * 0.03
    const vx = (a.pos.x - vel.last.x) / Math.max(dt, 1e-3), vz = (a.pos.z - vel.last.z) / Math.max(dt, 1e-3)
    vel.last.copy(a.pos)
    vel.vx += (vx - vel.vx) * (1 - Math.exp(-dt * 5))
    vel.vz += (vz - vel.vz) * (1 - Math.exp(-dt * 5))
    tilt.current!.rotation.set(clamp(vel.vz * 0.05, -0.35, 0.35), 0, clamp(-vel.vx * 0.05, -0.35, 0.35) + (REDUCED ? 0 : Math.sin(sim.time * 1.7) * 0.04))
    if (!REDUCED) vel.spin += dt * 34
    const r = rotors.current!
    for (let i = 0; i < 4; i++) {
      dummy.position.set(ROTORS[i * 2], 0.08, ROTORS[i * 2 + 1])
      dummy.rotation.set(0, vel.spin * (i % 2 ? 1 : -1) + i * 0.8, 0)
      dummy.scale.setScalar(1)
      dummy.updateMatrix()
      r.setMatrixAt(i, dummy.matrix)
    }
    r.instanceMatrix.needsUpdate = true
    ;(lamp.current!.material as MeshBasicMaterial).opacity = REDUCED ? 0.8 : 0.55 + Math.sin(sim.time * (a.job ? 5 : 1.4)) * 0.4
    g.updateMatrixWorld(true)
    writer.begin()
    writer.circle(0, 0.02, 0, 0.47, 'y', tilt.current!.matrixWorld, orange, 36)
    for (let i = 0; i < 8; i += 2) writer.circle(ROTORS[i], 0.06, ROTORS[i + 1], 0.33, 'y', tilt.current!.matrixWorld, edge, 24)
    writer.done()
    const working = !!a.job && a.near && a.work > 0
    glow.current!.visible = working
    if (working && a.job) {
      const k = Math.min(3, Math.floor(a.work * 4)) * 2
      const p = a.job.part
      weld.set(p.pos.x + (CORNERS[k] * (p.size[0] + 0.06)) / 2, BOARD.y + 0.04, p.pos.z + (CORNERS[k + 1] * (p.size[2] + 0.06)) / 2)
      glow.current!.position.copy(weld)
      glow.current!.scale.setScalar(0.7 + flicker(sim.time, 1) * 0.5)
      if (!REDUCED) emit(sparks, weld, 4)
    }
    tick(sparks, dt, BOARD.y + 0.02)
    ;(points.current!.geometry.getAttribute('position') as BufferAttribute).needsUpdate = true
  })
  return (
    <>
      <group ref={group}>
        <group ref={tilt}>
          <mesh scale={[1, 0.56, 1]}>
            <sphereGeometry args={[0.46, 24, 16]} />
            <Surf c={c} color={c.dark ? '#3A2219' : '#FCEDE6'} />
          </mesh>
          <mesh ref={lamp} position={[0, 0.27, 0]}>
            <sphereGeometry args={[0.07, 10, 8]} />
            <meshBasicMaterial color={BRAND.claude} transparent toneMapped={false} />
          </mesh>
          <Fill geometry={arms} c={c} color={c.surface} />
          <instancedMesh ref={rotors} args={[undefined, undefined, 4]}>
            <boxGeometry args={[0.52, 0.01, 0.05]} />
            <meshBasicMaterial color={BRAND.claude} toneMapped={false} />
          </instancedMesh>
        </group>
      </group>
      <Dynamic writer={writer} />
      <mesh ref={glow} visible={false}>
        <sphereGeometry args={[0.1, 10, 8]} />
        <meshBasicMaterial color="#FFE2A8" toneMapped={false} />
      </mesh>
      <points ref={points} frustumCulled={false}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[sparks.pos, 3]} />
        </bufferGeometry>
        <pointsMaterial color="#FFB347" size={3.5} sizeAttenuation={false} toneMapped={false} />
      </points>
      <NameTag sim={sim} c={c} name="Claude Code" color={BRAND.claude} offset={0.95} verb={() => (sim.agent.job ? (sim.agent.near ? 'soldering' : 'en route') : sim.agent.jobs.length ? 'queued' : 'standing by')} />
    </>
  )
}

const F1 = 0.62
const F2 = 0.9
const RADIUS = 0.95
const HIP = 0.34
const BODY_Y = 0.46

/** Codex: a precise hexapod that walks the board and laser-etches each seated part's outline. */
export function Hexapod({ sim, c }: { sim: Sim; c: Look }) {
  const body = useRef<Group>(null)
  const turret = useRef<Group>(null)
  const feet = useRef<InstancedMesh>(null)
  const hit = useRef<Mesh>(null)
  const writer = useWriter(6 * 2 + 4 + 40, c.fg)
  const cyan = useMemo(() => new Color(BRAND.codex), [])
  const fg = useMemo(() => new Color(), [])
  const legs = useMemo(
    () => Array.from({ length: 6 }, (_, k) => ({ a: (k / 6) * Math.PI * 2 + Math.PI / 6, foot: new Vector3(), from: new Vector3(), to: new Vector3(), t: 1, init: false })),
    [],
  )
  const st = useMemo(() => ({ last: sim.agent.pos.clone(), heading: 0, vx: 0, vz: 0 }), [sim])
  const hip = useMemo(() => new Vector3(), [])
  const ideal = useMemo(() => new Vector3(), [])
  const knee = useMemo(() => new Vector3(), [])
  const d = useMemo(() => new Vector3(), [])
  const tgt = useMemo(() => new Vector3(), [])
  const center = useMemo(() => new Vector3(), [])
  useFrame((_, dt) => {
    const a = sim.agent
    const b = body.current!
    center.copy(a.pos).setY(a.pos.y + BODY_Y)
    b.position.copy(center)
    b.scale.setScalar(Math.max(0.001, a.show))
    const vx = (a.pos.x - st.last.x) / Math.max(dt, 1e-3), vz = (a.pos.z - st.last.z) / Math.max(dt, 1e-3)
    st.last.copy(a.pos)
    st.vx += (vx - st.vx) * (1 - Math.exp(-dt * 8))
    st.vz += (vz - st.vz) * (1 - Math.exp(-dt * 8))
    if (Math.hypot(st.vx, st.vz) > 0.3) {
      const want = Math.atan2(-st.vz, st.vx)
      const diff = Math.atan2(Math.sin(want - st.heading), Math.cos(want - st.heading))
      st.heading += diff * (1 - Math.exp(-dt * 6))
    }
    b.rotation.y = st.heading
    const scanning = !a.job
    const sweep = REDUCED ? 0 : Math.sin(sim.time * 0.9) * 0.9
    turret.current!.rotation.y = scanning ? sweep : 0
    const cs = Math.cos(st.heading), sn = Math.sin(st.heading)
    let stepping = false
    for (const l of legs) if (l.t < 1) stepping = true
    if (!stepping) {
      for (let g = 0; g < 2; g++) {
        let far = false
        for (let k = g; k < 6; k += 2) {
          const l = legs[k]
          ideal.set(a.pos.x + (Math.cos(l.a) * cs + Math.sin(l.a) * sn) * RADIUS + st.vx * 0.12, a.pos.y, a.pos.z + (-Math.cos(l.a) * sn + Math.sin(l.a) * cs) * RADIUS + st.vz * 0.12)
          if (Math.hypot(ideal.x - l.foot.x, ideal.z - l.foot.z) > 0.26) far = true
        }
        if (far) {
          for (let k = g; k < 6; k += 2) {
            const l = legs[k]
            ideal.set(a.pos.x + (Math.cos(l.a) * cs + Math.sin(l.a) * sn) * RADIUS + st.vx * 0.16, a.pos.y, a.pos.z + (-Math.cos(l.a) * sn + Math.sin(l.a) * cs) * RADIUS + st.vz * 0.16)
            l.from.copy(l.foot)
            l.to.copy(ideal)
            l.t = 0
          }
          break
        }
      }
    }
    fg.set(c.fg)
    writer.begin()
    const f = feet.current!
    for (let k = 0; k < 6; k++) {
      const l = legs[k]
      if (!l.init) {
        l.foot.set(a.pos.x + (Math.cos(l.a) * cs + Math.sin(l.a) * sn) * RADIUS, a.pos.y, a.pos.z + (-Math.cos(l.a) * sn + Math.sin(l.a) * cs) * RADIUS)
        l.init = true
      }
      if (l.t < 1) {
        l.t = Math.min(1, l.t + dt / 0.13)
        const s = l.t * l.t * (3 - 2 * l.t)
        l.foot.lerpVectors(l.from, l.to, s)
        l.foot.y += Math.sin(l.t * Math.PI) * 0.2
      }
      hip.set(center.x + (Math.cos(l.a) * cs + Math.sin(l.a) * sn) * HIP, center.y - 0.04, center.z + (-Math.cos(l.a) * sn + Math.sin(l.a) * cs) * HIP)
      d.copy(l.foot).sub(hip)
      const r = Math.max(Math.hypot(d.x, d.z), 1e-3)
      const D = clamp(d.length(), 0.2, F1 + F2 - 0.01)
      const phi = Math.atan2(d.y, r)
      const ang = Math.acos(clamp((F1 * F1 + D * D - F2 * F2) / (2 * F1 * D), -1, 1))
      const t1 = phi + ang
      knee.set(hip.x + (d.x / r) * F1 * Math.cos(t1), hip.y + F1 * Math.sin(t1), hip.z + (d.z / r) * F1 * Math.cos(t1))
      writer.seg(hip.x, hip.y, hip.z, knee.x, knee.y, knee.z, fg)
      writer.seg(knee.x, knee.y, knee.z, l.foot.x, l.foot.y, l.foot.z, fg)
      dummy.position.copy(l.foot)
      dummy.rotation.set(0, 0, 0)
      dummy.scale.setScalar(a.show)
      dummy.updateMatrix()
      f.setMatrixAt(k, dummy.matrix)
    }
    f.instanceMatrix.needsUpdate = true
    const working = !!a.job && a.near && a.work > 0
    hit.current!.visible = working
    if (working && a.job) {
      perimeter(a.job.part, a.work, tgt)
      writer.seg(center.x, center.y + 0.22, center.z, tgt.x, tgt.y, tgt.z, cyan)
      hit.current!.position.copy(tgt)
      hit.current!.scale.setScalar(0.75 + flicker(sim.time, 2) * 0.45)
      const p = a.job.part
      const steps = Math.floor(a.work * 40)
      for (let k = 1; k <= steps; k++) {
        perimeter(p, (k - 1) / 40, d)
        perimeter(p, k / 40, knee)
        writer.seg(d.x, d.y, d.z, knee.x, knee.y, knee.z, cyan)
      }
    } else if (scanning && a.show > 0.5) {
      const ang = st.heading + sweep
      tgt.set(center.x + Math.cos(ang) * 1.8, BOARD.y + 0.01, center.z - Math.sin(ang) * 1.8)
      writer.seg(center.x, center.y + 0.22, center.z, tgt.x, tgt.y, tgt.z, cyan)
    }
    writer.done()
  })
  const edge = useMemo(() => new Color(c.fg), [c.fg])
  return (
    <>
      <group ref={body}>
        <mesh>
          <cylinderGeometry args={[0.5, 0.42, 0.18, 6]} />
          <Surf c={c} color={c.surface} />
        </mesh>
        <mesh position={[0, 0.13, 0]}>
          <cylinderGeometry args={[0.3, 0.38, 0.08, 6]} />
          <meshBasicMaterial color={BRAND.codex} toneMapped={false} />
        </mesh>
        <group ref={turret} position={[0, 0.24, 0]}>
          <mesh>
            <boxGeometry args={[0.34, 0.12, 0.2]} />
            <Surf c={c} color={c.surface} />
          </mesh>
          <mesh position={[0.22, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.03, 0.04, 0.12, 8]} />
            <meshBasicMaterial color={edge} toneMapped={false} />
          </mesh>
        </group>
      </group>
      <instancedMesh ref={feet} args={[undefined, undefined, 6]} frustumCulled={false}>
        <sphereGeometry args={[0.04, 8, 6]} />
        <meshBasicMaterial color={BRAND.codex} toneMapped={false} />
      </instancedMesh>
      <Dynamic writer={writer} />
      <mesh ref={hit} visible={false}>
        <sphereGeometry args={[0.06, 8, 8]} />
        <meshBasicMaterial color="#D9FBFF" toneMapped={false} />
      </mesh>
      <NameTag sim={sim} c={c} name="Codex" color={BRAND.codex} offset={1.15} verb={() => (sim.agent.job ? (sim.agent.near ? 'etching' : 'walking over') : sim.agent.jobs.length ? 'queued' : 'scanning')} />
    </>
  )
}

export function Integrator({ sim, c, kind }: { sim: Sim; c: Look; kind: 'none' | 'claude' | 'codex' }) {
  if (kind === 'claude') return <Drone sim={sim} c={c} />
  if (kind === 'codex') return <Hexapod sim={sim} c={c} />
  return null
}
