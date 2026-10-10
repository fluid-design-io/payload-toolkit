import { useFrame } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { BufferGeometry, Color, Float32BufferAttribute, Group, InstancedMesh, Matrix4, Mesh, Points, Vector3 } from 'three'
import type { BufferAttribute, MeshBasicMaterial } from 'three'

import type { Guard } from '../../kit/touch'

import type { Agent, Database, PackageManager, Setup } from '../../../../workspace/-workspace/workspace.types'
import type { Lab } from '../../lab.types'
import { cpuArt, dimmArt, leafArt, probeArt, silkArt } from './art'
import type { Ids } from './art'
import { ACCENT, Hairline, Lines, damp, rectPts, reducedMotion } from './kit'
import type { Colors, Tip } from './kit'
import { BANDS, BAND_DEPTH, BOARD, BY, CPU, HEADER, PAGE, bandZ, cpuHalf, makeRoute, sampleRoute, staticRoutes } from './model'
import type { Part, Route, Sim } from './model'

type Handlers = { onClick: () => void; title: string; sub: string; tip: Tip; guard: Guard }
const useHandlers = ({ onClick, title, sub, tip, guard }: Handlers) => ({
  onClick: (e: { stopPropagation: () => void }) => { e.stopPropagation(); if (!guard.moved) onClick() },
  onPointerOver: (e: { stopPropagation: () => void; nativeEvent: PointerEvent }) => { e.stopPropagation(); tip.show(e.nativeEvent, title, sub) },
  onPointerMove: (e: { nativeEvent: PointerEvent }) => tip.move(e.nativeEvent),
  onPointerOut: () => tip.hide(),
})

function useDrop(from: number, rate = 7) {
  const g = useRef<Group>(null)
  const drop = useRef(reducedMotion ? 0 : from)
  useFrame((_, dt) => {
    drop.current += (0 - drop.current) * damp(dt, rate)
    if (g.current) g.current.position.y = drop.current
  })
  return { g, bump: (v: number) => { drop.current = reducedMotion ? 0 : v } }
}

function Statics({ build, c, position }: { build: (h: Hairline) => void; c: Colors; position?: [number, number, number] }) {
  const mesh = useMemo(() => {
    const h = new Hairline()
    build(h)
    return h.build(c.bodyEdge)
  }, [build, c.bodyEdge])
  useEffect(() => () => { mesh.geometry.dispose(); (mesh.children[0] as Mesh).geometry.dispose() }, [mesh])
  return <primitive object={mesh} position={position} />
}

export function Board({ lab, sim, c, activeBand, ids, version }: { lab: Lab; sim: Sim; c: Colors; activeBand: number; ids: (ref: string) => Ids; version: number }) {
  const seated = useMemo(() => [...sim.parts.values()].filter((p) => p.mode === 'seated' || p.mode === 'carry').map((p) => ({ p, ids: ids(p.item.ref) })), [version, sim, ids])
  const silk = useMemo(() => silkArt(lab.setup, c.silk, ACCENT, activeBand, seated), [lab.setup.target, lab.setup.name, lab.setup.framework, lab.setup.database, lab.setup.packageManager, lab.setup.agent, c.silk, activeBand, seated])
  useEffect(() => () => silk.dispose(), [silk])
  const y = BY + 0.003
  const outline = useMemo(() => {
    const l: Vector3[] = []
    l.push(...rectPts(PAGE.x0, PAGE.z0, PAGE.x1, PAGE.z1, y))
    for (let b = 1; b < BANDS.length; b++) l.push(new Vector3(PAGE.x0, y, bandZ(b)), new Vector3(PAGE.x1, y, bandZ(b)))
    for (let b = 0; b < BANDS.length; b++) l.push(new Vector3(PAGE.chipX0 - 0.15, y, bandZ(b) + 0.3), new Vector3(PAGE.chipX0 - 0.15, y, bandZ(b + 1) - 0.08))
    l.push(...rectPts(-7.7, -6.3, -2.5, -4.05, y))
    l.push(...rectPts(-7.8, -3.6, -6.55, 0.8, y))
    l.push(...rectPts(-7.7, 1.3, -4.3, 6.2, y))
    l.push(...rectPts(-3.85, 1.3, -1.25, 5.05, y))
    l.push(...rectPts(HEADER.x - 0.45, HEADER.z - 0.4, HEADER.x + 0.45, HEADER.z + 0.4, y))
    l.push(...rectPts(-1.15, -4.1, 0.35, 1.2, y))
    for (const hatch of sim.layout.hatches) {
      l.push(...rectPts(hatch.x0, hatch.z0, hatch.x1, hatch.z1, y))
      for (let x = hatch.x0 - (hatch.z1 - hatch.z0); x < hatch.x1; x += 0.22) {
        const a = Math.max(x, hatch.x0), za = hatch.z1 - (a - x)
        const b = Math.min(x + (hatch.z1 - hatch.z0), hatch.x1), zb = hatch.z1 - (b - x)
        if (b > a) l.push(new Vector3(a, y, za), new Vector3(b, y, zb))
      }
    }
    const g = new BufferGeometry()
    g.setAttribute('position', new Float32BufferAttribute(l.flatMap((p) => [p.x, p.y, p.z]), 3))
    return g
  }, [sim.layout.hatches, y])
  useEffect(() => () => outline.dispose(), [outline])
  const band = useMemo(() => {
    const g = new BufferGeometry()
    if (activeBand < 0) return g
    const pts = rectPts(PAGE.x0 + 0.02, bandZ(activeBand) + 0.02, PAGE.x1 - 0.02, bandZ(activeBand) + BAND_DEPTH - 0.02, y + 0.002)
    g.setAttribute('position', new Float32BufferAttribute(pts.flatMap((p) => [p.x, p.y, p.z]), 3))
    return g
  }, [activeBand, y])
  const slab = useMemo(
    () => (h: Hairline) => {
      h.box([BOARD.x1 - BOARD.x0, 0.16, BOARD.z1 - BOARD.z0], [(BOARD.x0 + BOARD.x1) / 2, BY - 0.08, (BOARD.z0 + BOARD.z1) / 2], c.board)
      for (const [x, z] of [[BOARD.x0 + 0.35, BOARD.z0 + 0.35], [BOARD.x1 - 0.35, BOARD.z0 + 0.35], [BOARD.x0 + 0.35, BOARD.z1 - 0.35], [BOARD.x1 - 0.35, BOARD.z1 - 0.35], [-0.4, BOARD.z0 + 0.35], [-0.4, BOARD.z1 - 0.35]])
        h.cyl(0.2, 0.2, 0.02, [x, BY + 0.005, z], c.pin, [0, 0, 0], 24, true, 80).cyl(0.1, 0.1, BY - 0.16, [x, (BY - 0.16) / 2, z], c.surface, [0, 0, 0], 12, false)
      const half = cpuHalf(lab.setup.framework)
      for (let i = 0; i < 22; i++) {
        const a = (i / 22) * Math.PI * 2
        const x = CPU.x + Math.cos(a) * (half.w + 0.35), z = CPU.z + Math.sin(a) * (half.d + 0.35)
        if (x > CPU.x + half.w - 0.2 && Math.abs(z - CPU.z) < half.d) continue
        h.box([0.18, 0.08, 0.1], [x, BY + 0.04, z], i % 3 ? '#C8A87E' : c.body)
      }
    },
    [c.board, c.pin, c.surface, c.body, lab.setup.framework],
  )
  return (
    <group>
      <Statics build={slab} c={{ ...c, bodyEdge: c.boardEdge }} />
      <lineSegments geometry={outline}>
        <lineBasicMaterial color={c.silk} transparent opacity={0.85} />
      </lineSegments>
      <lineSegments geometry={band} visible={activeBand >= 0}>
        <lineBasicMaterial color={ACCENT} />
      </lineSegments>
      <mesh position={[(BOARD.x0 + BOARD.x1) / 2, BY + 0.004, (BOARD.z0 + BOARD.z1) / 2]} rotation-x={-Math.PI / 2}>
        <planeGeometry args={[BOARD.x1 - BOARD.x0, BOARD.z1 - BOARD.z0]} />
        <meshBasicMaterial map={silk} transparent toneMapped={false} depthWrite={false} />
      </mesh>
    </group>
  )
}

/** Every copper trace in one LineSegments: static power and memory lanes, then each seated chip's route growing as it is drawn. */
export function Traces({ sim, c, framework, version }: { sim: Sim; c: Colors; framework: Setup['framework']; version: number }) {
  const lines = useMemo(() => new Lines(true), [])
  const vias = useRef<InstancedMesh>(null)
  const statics = useMemo(() => staticRoutes(framework), [framework])
  const seen = useRef({ version: -1, drawing: true, trace: '', lit: '', statics })
  const trace = useMemo(() => new Color(c.trace), [c.trace])
  const lit = useMemo(() => new Color(c.lit), [c.lit])
  useFrame(() => {
    const s = seen.current
    let drawing = false
    let vertices = 0
    for (const p of sim.parts.values()) {
      if (p.mode === 'seated' && p.route && p.drawn < 1) drawing = true
      if (p.route) vertices += p.route.pts.length * 2
    }
    if (s.version === version && !drawing && !s.drawing && s.trace === c.trace && s.lit === c.lit && s.statics === statics) return
    Object.assign(s, { version, drawing, trace: c.trace, lit: c.lit, statics })
    for (const r of statics.power) vertices += r.pts.length * 2
    for (const r of statics.memory) vertices += r.pts.length * 2
    lines.begin(vertices)
    const add = (r: Route, k: number, color: Color) => {
      for (let i = 1; i <= k; i++) {
        const a = r.pts[i - 1], b = r.pts[i]
        lines.push(a.x, a.y, a.z, color)
        lines.push(b.x, b.y, b.z, color)
      }
    }
    for (const r of statics.power) add(r, r.pts.length - 1, trace)
    for (const r of statics.memory) add(r, r.pts.length - 1, trace)
    let v = 0
    for (const p of sim.parts.values()) {
      if (!p.route || p.mode !== 'seated') continue
      const k = Math.floor(p.drawn * (p.route.pts.length - 1))
      add(p.route, k, lit)
      for (const via of p.route.vias) {
        if (!vias.current || v >= 512) break
        const at = p.route.pts.findIndex((q) => q.distanceToSquared(via) < 0.004)
        const on = p.drawn >= (at < 0 ? 1 : at / p.route.pts.length)
        vias.current.setMatrixAt(v++, viaM.makeTranslation(via.x, via.y + 0.003, via.z).scale(viaS.setScalar(on ? 1 : 0)))
      }
    }
    lines.end()
    if (vias.current) {
      vias.current.count = v
      vias.current.instanceMatrix.needsUpdate = true
    }
  })
  useEffect(() => () => lines.geo.dispose(), [lines])
  return (
    <>
      <lineSegments geometry={lines.geo} frustumCulled={false} raycast={() => null}>
        <lineBasicMaterial vertexColors />
      </lineSegments>
      <instancedMesh ref={vias} args={[undefined, undefined, 512]} frustumCulled={false} raycast={() => null}>
        <cylinderGeometry args={[0.07, 0.07, 0.006, 12]} />
        <meshBasicMaterial color={c.pin} />
      </instancedMesh>
    </>
  )
}
const viaM = new Matrix4(), viaS = new Vector3()

type Pulse = { route: Route; t: number; speed: number }
export function Pulses({ sim, c, framework, still }: { sim: Sim; c: Colors; framework: Setup['framework']; still: boolean }) {
  const N = 600, P = 160
  const data = useRef<Points>(null)
  const power = useRef<Points>(null)
  const state = useMemo(() => ({ data: [] as Pulse[], power: [] as Pulse[], dataPos: new Float32Array(N * 3), powerPos: new Float32Array(P * 3) }), [])
  const statics = useMemo(() => staticRoutes(framework), [framework])
  const seen = useRef(-1)
  const tmp = useMemo(() => new Vector3(), [])
  useFrame((_, dt) => {
    if (sim.lastSeatAt !== seen.current && sim.lastSeat?.route) {
      seen.current = sim.lastSeatAt
      for (let k = 0; k < 4; k++) state.data.push({ route: sim.lastSeat.route, t: -k * 0.12 - 0.6, speed: 1.1 })
    }
    if (!still) {
      for (const p of sim.parts.values()) {
        if (p.mode !== 'seated' || !p.route || p.drawn < 1) continue
        if (Math.random() < dt * 0.5 && state.data.length < N) state.data.push({ route: p.route, t: 0, speed: 6 / p.route.len })
      }
      for (const r of statics.memory) if (Math.random() < dt * 1.2 && state.data.length < N) state.data.push({ route: r, t: 0, speed: Math.random() < 0.5 ? 1.6 : -1.6 })
      for (const r of statics.power) if (Math.random() < dt * 1.6 && state.power.length < P) state.power.push({ route: r, t: 0, speed: 0.9 })
    }
    const run = (list: Pulse[], arr: Float32Array, cap: number, pts: Points | null) => {
      let w = 0, keep = 0
      for (const pulse of list) {
        pulse.t += pulse.speed * dt
        const t = pulse.speed < 0 ? 1 + pulse.t : pulse.t
        if (t > 1 || (t < -0.0001 && pulse.speed < 0)) continue
        list[keep++] = pulse
        if (w < cap && t >= 0) {
          sampleRoute(pulse.route, t, tmp)
          arr[w * 3] = tmp.x; arr[w * 3 + 1] = tmp.y + 0.02; arr[w * 3 + 2] = tmp.z
          w++
        }
      }
      list.length = keep
      const was = pts?.userData.drawn ?? cap
      for (let i = w; i < was; i++) arr[i * 3 + 1] = -99
      if (pts) {
        pts.userData.drawn = w
        if (w || was) (pts.geometry.getAttribute('position') as BufferAttribute).needsUpdate = true
      }
    }
    run(state.data, state.dataPos, N, data.current)
    run(state.power, state.powerPos, P, power.current)
  })
  return (
    <>
      <points ref={data} frustumCulled={false}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[state.dataPos, 3]} />
        </bufferGeometry>
        <pointsMaterial color={c.lit} size={4} sizeAttenuation={false} toneMapped={false} />
      </points>
      <points ref={power} frustumCulled={false}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[state.powerPos, 3]} />
        </bufferGeometry>
        <pointsMaterial color={c.power} size={5} sizeAttenuation={false} toneMapped={false} />
      </points>
    </>
  )
}

export function AgentFlash({ sim, agent }: { sim: Sim; agent: Agent }) {
  const geo = useMemo(() => new BufferGeometry(), [])
  const line = useRef<{ visible: boolean }>(null)
  const last = useRef<Part | null>(null)
  useFrame(() => {
    const f = sim.agentFlash
    if (line.current) line.current.visible = !!f
    if (!f?.part.slot) return
    if (last.current !== f.part) {
      last.current = f.part
      const y = BY + 0.35
      const s = f.part.slot
      const r = makeRoute([new Vector3(HEADER.x, y, HEADER.z), new Vector3(HEADER.x, y, s.z), new Vector3(s.x, y, s.z)], [])
      const pos: number[] = []
      for (let i = 1; i < r.pts.length; i++) pos.push(r.pts[i - 1].x, r.pts[i - 1].y, r.pts[i - 1].z, r.pts[i].x, r.pts[i].y, r.pts[i].z)
      geo.setAttribute('position', new Float32BufferAttribute(pos, 3))
    }
    const n = geo.getAttribute('position')?.count ?? 0
    geo.setDrawRange(0, Math.floor(n * f.t))
  })
  return (
    <lineSegments ref={line as never} geometry={geo} frustumCulled={false} visible={false}>
      <lineBasicMaterial color={agent === 'codex' ? '#F2F2F2' : '#D97757'} />
    </lineSegments>
  )
}

export function Cpu({ framework, c, onClick, tip, guard }: { framework: Setup['framework']; c: Colors; onClick: () => void; tip: Tip; guard: Guard }) {
  const { g, bump } = useDrop(3)
  const art = useMemo(() => cpuArt(framework), [framework])
  useEffect(() => () => art.dispose(), [art])
  const balls = useRef<InstancedMesh>(null)
  const half = cpuHalf(framework)
  const ballPts = useMemo(() => {
    const out: [number, number][] = []
    for (let x = -half.w + 0.1; x <= half.w - 0.1; x += 0.16)
      for (let z = -half.d + 0.1; z <= half.d - 0.1; z += 0.16)
        if (Math.abs(x) > half.w - 0.42 || Math.abs(z) > half.d - 0.42) out.push([x, z])
    return out
  }, [half.w, half.d])
  useLayoutEffect(() => {
    const m = new Matrix4()
    ballPts.forEach(([x, z], i) => balls.current?.setMatrixAt(i, m.makeTranslation(x, 0.035, z)))
    if (balls.current) balls.current.instanceMatrix.needsUpdate = true
  }, [ballPts])
  const handlers = useHandlers({ onClick: () => { bump(2.4); onClick() }, title: framework === 'next' ? 'Next.js · U1' : 'TanStack Start · U1', sub: 'Framework socket · click to swap the CPU', tip, guard })
  const lid = framework === 'next' ? { w: 2.5, d: 2.5, h: 0.2 } : { w: 2.3, d: 1.5, h: 0.08 }
  const build = useMemo(
    () => (h: Hairline) => {
      h.box([half.w * 2, 0.08, half.d * 2], [0, 0.11, 0], framework === 'next' ? c.sub : '#1C2A24')
      if (framework === 'tanstack') for (const x of [-1.55, 1.55]) h.box([0.5, 0.06, 2.2], [x, 0.18, 0], c.pin)
      h.box([lid.w, lid.h, lid.d], [0, 0.15 + lid.h / 2, 0], framework === 'next' ? '#0A0B0C' : '#202A44')
    },
    [framework, c.sub, c.pin, half.w, half.d, lid.w, lid.d, lid.h],
  )
  const socket = useMemo(() => {
    const g2 = new BufferGeometry()
    const pts = rectPts(-half.w - 0.25, -half.d - 0.25, half.w + 0.25, half.d + 0.25, 0.01)
    g2.setAttribute('position', new Float32BufferAttribute(pts.flatMap((p) => [p.x, p.y, p.z]), 3))
    return g2
  }, [half.w, half.d])
  return (
    <group position={[CPU.x, BY, CPU.z]}>
      {framework === 'tanstack' && (
        <lineSegments geometry={socket}>
          <lineBasicMaterial color={c.pin} />
        </lineSegments>
      )}
      <group ref={g} {...handlers}>
        <instancedMesh ref={balls} args={[undefined, undefined, ballPts.length]}>
          <sphereGeometry args={[0.04, 6, 5]} />
          <meshStandardMaterial color="#C9CED1" metalness={0.7} roughness={0.3} />
        </instancedMesh>
        <Statics build={build} c={{ ...c, bodyEdge: framework === 'next' ? '#3A4044' : '#7C8BD0' }} />
        <mesh position={[0, 0.15 + lid.h + 0.002, 0]} rotation-x={-Math.PI / 2}>
          <planeGeometry args={[lid.w * 0.98, lid.d * 0.98]} />
          <meshBasicMaterial map={art} toneMapped={false} />
        </mesh>
      </group>
    </group>
  )
}

export function Memory({ database, c, onClick, tip, guard }: { database: Database; c: Colors; onClick: () => void; tip: Tip; guard: Guard }) {
  const { g, bump } = useDrop(2.5)
  const art = useMemo(() => (database === 'postgres' ? dimmArt() : leafArt()), [database])
  useEffect(() => () => art.dispose(), [art])
  const handlers = useHandlers({ onClick: () => { bump(2.2); onClick() }, title: database === 'postgres' ? 'PostgreSQL · DIMM' : 'MongoDB · NAND stack', sub: 'Memory · click to swap the database', tip, guard })
  const build = useMemo(
    () => (h: Hairline) => {
      if (database === 'postgres') {
        for (const x of [-7.45, -6.95]) {
          h.box([0.05, 1.25, 3.9], [x, 0.82, -0.4], c.sub)
          for (let k = 0; k < 8; k++) h.box([0.07, 0.36, 0.38], [x + 0.06, 0.95, -0.4 - 1.62 + k * 0.46], c.body)
        }
      } else {
        for (const z of [-1.3, 0, 1.3]) for (let k = 0; k < 4; k++) h.box([0.95 - k * 0.04, 0.1, 0.95 - k * 0.04], [-7.15, 0.07 + k * 0.15, z], k % 2 ? '#14261B' : c.body)
      }
    },
    [database, c.sub, c.body],
  )
  const sockets = useMemo(() => (h: Hairline) => { for (const x of [-7.45, -6.95]) h.box([0.26, 0.22, 4.2], [x, 0.11, -0.4], c.body) }, [c.body])
  return (
    <group position={[0, BY, CPU.z]} {...handlers}>
      {database === 'postgres' && <Statics build={sockets} c={c} />}
      <group ref={g}>
        <Statics build={build} c={{ ...c, bodyEdge: database === 'postgres' ? c.bodyEdge : '#00ED64' }} />
        {database === 'postgres' ? (
          [-7.45, -6.95].map((x) => (
            <mesh key={x} position={[x + 0.1, 0.62, -0.4]} rotation-y={Math.PI / 2}>
              <planeGeometry args={[3.4, 1.17]} />
              <meshBasicMaterial map={art} toneMapped={false} />
            </mesh>
          ))
        ) : (
          [-1.3, 0, 1.3].map((z) => (
            <mesh key={z} position={[-7.15, 0.07 + 3 * 0.15 + 0.052, z]} rotation-x={-Math.PI / 2}>
              <planeGeometry args={[0.8, 0.8]} />
              <meshBasicMaterial map={art} toneMapped={false} />
            </mesh>
          ))
        )}
      </group>
    </group>
  )
}

export function Power({ pm, c, onClick, tip, guard }: { pm: PackageManager; c: Colors; onClick: () => void; tip: Tip; guard: Guard }) {
  const { g, bump } = useDrop(2.5)
  const spin = useRef<Group>(null)
  useFrame(({ clock }) => {
    if (spin.current && pm === 'bun' && !reducedMotion) spin.current.children.forEach((child, i) => { child.rotation.y = clock.elapsedTime * (i % 2 ? 0.6 : -0.6) })
  })
  const handlers = useHandlers({ onClick: () => { bump(2.2); onClick() }, title: `${pm} · power stage`, sub: 'Package manager · click to swap the regulator', tip, guard })
  const build = useMemo(
    () => (h: Hairline) => {
      if (pm === 'pnpm') {
        for (let i = 0; i < 6; i++) h.box([0.62, 0.48, 0.62], [-7.15 + i * 0.85, 0.24, -5.15], '#2A2E31').box([0.42, 0.1, 0.4], [-7.15 + i * 0.85, 0.05, -4.45], c.body)
        for (let i = 0; i < 5; i++) h.cyl(0.2, 0.2, 0.6, [-6.75 + i * 0.85, 0.3, -5.95], '#B9C0C4', [0, 0, 0], 16)
      } else if (pm === 'npm') {
        h.box([2.6, 0.12, 1.3], [-5.4, 0.06, -5.1], '#9AA3A8')
        for (let i = 0; i < 11; i++) h.box([0.05, 0.95, 1.3], [-6.6 + i * 0.24, 0.6, -5.1], '#B7BEC2')
        h.box([0.95, 1.1, 0.16], [-5.4, 0.66, -4.35], '#111111')
        for (const x of [-3.6, -2.85]) h.cyl(0.36, 0.36, 1.3, [x, 0.65, -5.1], '#CB3837', [0, 0, 0], 24)
      } else {
        h.box([0.6, 0.12, 0.6], [-3.6, 0.06, -5.1], c.body)
        for (const x of [-3.0, -2.75]) h.box([0.18, 0.12, 0.34], [x, 0.06, -5.1], '#C8A87E')
      }
    },
    [pm, c.body],
  )
  const edge = pm === 'pnpm' ? '#F9AD00' : pm === 'npm' ? '#7E1F1E' : '#F472B6'
  return (
    <group ref={g} position={[0, BY, 0]} {...handlers}>
      <Statics build={build} c={{ ...c, bodyEdge: edge }} />
      {pm === 'bun' && (
        <group ref={spin}>
          {[-6.4, -4.9].map((x) => (
            <group key={x} position={[x, 0.2, -5.1]}>
              <mesh rotation-x={Math.PI / 2}>
                <torusGeometry args={[0.5, 0.2, 10, 28]} />
                <meshStandardMaterial color="#F6DEC0" roughness={0.6} />
              </mesh>
            </group>
          ))}
        </group>
      )}
    </group>
  )
}

export function Probe({ agent, sim, c, onClick, tip, guard }: { agent: Agent; sim: Sim; c: Colors; onClick: () => void; tip: Tip; guard: Guard }) {
  const led = useRef<Mesh>(null)
  const art = useMemo(() => (agent === 'none' ? null : probeArt(agent)), [agent])
  useEffect(() => () => art?.dispose(), [art])
  const { g, bump } = useDrop(2, 6)
  useFrame(({ clock }) => {
    if (led.current) {
      const busy = !!sim.agentFlash
      const blink = busy && !reducedMotion && Math.floor(clock.elapsedTime / 0.34) % 2 === 1
      ;(led.current.material as MeshBasicMaterial).color.set(busy ? (blink ? '#1E3324' : '#7CFF9B') : '#3DDC84')
    }
  })
  const handlers = useHandlers({ onClick: () => { bump(1.6); onClick() }, title: agent === 'none' ? 'J1 debug header' : `${agent === 'claude' ? 'Claude Code' : 'Codex'} probe`, sub: 'Agent · click to clip on a different probe', tip, guard })
  const podPos: [number, number, number] = [HEADER.x + 0.4, 0.5, BOARD.z1 + 1.9]
  const header = useMemo(
    () => (h: Hairline) => {
      h.box([0.85, 0.12, 0.42], [HEADER.x, BY + 0.06, HEADER.z], c.body)
      const pts: Vector3[] = []
      for (let i = 0; i < 5; i++) for (const r of [-0.12, 0.12]) pts.push(new Vector3(HEADER.x - 0.3 + i * 0.15, BY, HEADER.z + r), new Vector3(HEADER.x - 0.3 + i * 0.15, BY + 0.3, HEADER.z + r))
      h.segs(pts)
    },
    [c.body],
  )
  const pod = useMemo(
    () => (h: Hairline) => {
      if (agent === 'claude') {
        h.box([0.95, 0.24, 0.5], [HEADER.x, BY + 0.42, HEADER.z], '#D97757')
        h.box([1.9, 0.45, 1.1], podPos, '#D97757')
        h.segs([new Vector3(HEADER.x, BY + 0.42, HEADER.z), new Vector3(HEADER.x, BY + 1.0, HEADER.z + 0.4), new Vector3(HEADER.x, BY + 1.0, HEADER.z + 0.4), new Vector3(podPos[0], podPos[1] + 0.9, podPos[2] - 0.8), new Vector3(podPos[0], podPos[1] + 0.9, podPos[2] - 0.8), new Vector3(podPos[0], podPos[1] + 0.2, podPos[2] - 0.55)])
      } else if (agent === 'codex') {
        h.box([1.0, 0.16, 0.9], [HEADER.x, BY + 0.5, HEADER.z + 0.2], '#0E0F10')
        h.box([1.0, 0.75, 0.12], [HEADER.x, BY + 0.1, BOARD.z1 + 0.08], '#0E0F10')
        h.box([1.6, 0.35, 1.0], podPos, '#0E0F10')
        h.segs([new Vector3(HEADER.x, BY + 0.58, HEADER.z + 0.6), new Vector3(HEADER.x, BY + 1.3, BOARD.z1 + 0.8), new Vector3(HEADER.x, BY + 1.3, BOARD.z1 + 0.8), new Vector3(podPos[0], podPos[1] + 0.5, podPos[2] - 0.6)])
      }
    },
    [agent],
  )
  return (
    <group {...handlers}>
      <Statics build={header} c={{ ...c, bodyEdge: c.bodyEdge }} />
      {agent !== 'none' && (
        <group ref={g}>
          <Statics build={pod} c={{ ...c, bodyEdge: agent === 'claude' ? '#8C3F25' : '#F2F2F2' }} />
          <mesh position={[podPos[0], podPos[1] + (agent === 'claude' ? 0.226 : 0.176), podPos[2]]} rotation-x={-Math.PI / 2}>
            <planeGeometry args={agent === 'claude' ? [1.85, 1.06] : [1.55, 0.96]} />
            <meshBasicMaterial map={art} toneMapped={false} />
          </mesh>
          <mesh ref={led} position={[podPos[0] + 0.75, podPos[1] + 0.26, podPos[2] + 0.4]}>
            <sphereGeometry args={[0.07, 8, 8]} />
            <meshBasicMaterial color="#3DDC84" toneMapped={false} />
          </mesh>
        </group>
      )}
      <mesh position={[HEADER.x, BY + 0.2, HEADER.z + 0.5]} visible={false}>
        <boxGeometry args={[1.4, 0.8, 2.2]} />
      </mesh>
    </group>
  )
}
