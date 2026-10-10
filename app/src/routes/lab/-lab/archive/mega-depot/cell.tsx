import { useFrame } from '@react-three/fiber'
import { Edges, Line } from '@react-three/drei'
import { useMemo, useRef, useState } from 'react'
import { BufferAttribute, BufferGeometry, Color, Group, Mesh, Points } from 'three'

import { agents, databases, frameworks } from '../../../../workspace/-workspace/workspace.constants'
import type { Lab } from '../../lab.types'
import { ACCENT, Box, FONT, textTexture } from './kit'
import type { Colors, Tip } from './kit'
import { ARM_BASE, BELT, BOARD, CHIP, CHIPS, H0, L1, L2, SLOTS, TRACES } from './sim'
import type { Sim } from './sim'

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))

function Belt({ c }: { c: Colors }) {
  const slats = useRef<(Mesh | null)[]>([])
  const len = BELT.end - BELT.start + 1.0
  const n = 22
  useFrame(({ clock }) => {
    const offset = (clock.elapsedTime * BELT.speed) % (len / n)
    slats.current.forEach((m, i) => {
      if (m) m.position.x = BELT.start - 0.5 + ((i * len) / n + offset) % len
    })
  })
  const mid = (BELT.start + BELT.end) / 2
  return (
    <group>
      <Box size={[len, 0.42, 1.3]} position={[mid, BELT.y - 0.29, BELT.z]} color={c.surface} edge={c.edge} />
      <Box size={[len + 0.1, 0.16, 0.08]} position={[mid, BELT.y, BELT.z - 0.7]} color={c.surface} edge={c.edge} />
      <Box size={[len + 0.1, 0.16, 0.08]} position={[mid, BELT.y, BELT.z + 0.7]} color={c.surface} edge={c.edge} />
      {[BELT.start - 0.5, BELT.end + 0.5].map((x) => (
        <mesh key={x} position={[x, BELT.y - 0.25, BELT.z]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.25, 0.25, 1.34, 24]} />
          <meshStandardMaterial color={c.surface} roughness={1} />
          <Edges color={c.edge} threshold={20} />
        </mesh>
      ))}
      {[[BELT.start + 0.4, 0.95], [BELT.end - 0.4, 0.95], [BELT.start + 0.4, 2.25], [BELT.end - 0.4, 2.25]].map(([x, z]) => (
        <Box key={`${x}${z}`} size={[0.12, BELT.y - 0.5, 0.12]} position={[x, (BELT.y - 0.5) / 2, z]} color={c.surface} edge={c.edge} />
      ))}
      {Array.from({ length: n }, (_, i) => (
        <mesh key={i} ref={(m) => { slats.current[i] = m }} position={[0, BELT.y - 0.07, BELT.z]}>
          <boxGeometry args={[0.02, 0.01, 1.2]} />
          <meshBasicMaterial color={c.edge} />
        </mesh>
      ))}
    </group>
  )
}

function Arm({ sim, c }: { sim: Sim; c: Colors }) {
  const turret = useRef<Group>(null)
  const shoulder = useRef<Group>(null)
  const elbow = useRef<Group>(null)
  const wrist = useRef<Group>(null)
  const fingers = useRef<(Group | null)[]>([])
  const [busy, setBusy] = useState(false)
  useFrame(() => {
    const w = sim.arm.pos
    const dx = w.x - ARM_BASE.x, dz = w.z - ARM_BASE.z
    const yaw = Math.atan2(-dz, dx)
    const r = Math.max(Math.hypot(dx, dz), 0.001)
    const h = w.y - H0
    const d = clamp(Math.hypot(r, h), Math.abs(L1 - L2) + 0.05, L1 + L2 - 0.01)
    const phi = Math.atan2(h, r)
    const a = Math.acos(clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1))
    const t1 = phi + a
    const t2 = Math.atan2(h - L1 * Math.sin(t1), r - L1 * Math.cos(t1))
    turret.current!.rotation.y = yaw
    shoulder.current!.rotation.z = t1
    elbow.current!.rotation.z = t2 - t1
    wrist.current!.rotation.z = -t2
    const open = 0.36 - sim.arm.grip * 0.1
    fingers.current.forEach((f, i) => f && (f.position.z = (i ? 1 : -1) * open))
    const holding = !!sim.arm.holding
    if (holding !== busy) setBusy(holding)
  })
  const hi = busy ? ACCENT : c.edge
  const joint = (radius: number, length: number) => (
    <mesh rotation={[Math.PI / 2, 0, 0]}>
      <cylinderGeometry args={[radius, radius, length, 28]} />
      <meshStandardMaterial color={c.surface} roughness={1} />
      <Edges color={c.edge} threshold={20} />
    </mesh>
  )
  return (
    <group position={[ARM_BASE.x, 0, ARM_BASE.z]}>
      <mesh position={[0, 0.18, 0]}>
        <cylinderGeometry args={[0.9, 1.0, 0.36, 40]} />
        <meshStandardMaterial color={c.surface} roughness={1} />
        <Edges color={c.edge} threshold={20} />
      </mesh>
      <group ref={turret}>
        <mesh position={[0, (H0 + 0.36) / 2, 0]}>
          <cylinderGeometry args={[0.38, 0.5, H0 - 0.36, 28]} />
          <meshStandardMaterial color={c.surface} roughness={1} />
          <Edges color={c.edge} threshold={20} />
        </mesh>
        <group ref={shoulder} position={[0, H0, 0]}>
          {joint(0.42, 0.9)}
          <Box size={[L1, 0.3, 0.3]} position={[L1 / 2, 0, 0.3]} color={c.surface} edge={c.edge} />
          <Box size={[L1, 0.3, 0.3]} position={[L1 / 2, 0, -0.3]} color={c.surface} edge={c.edge} />
          <group ref={elbow} position={[L1, 0, 0]}>
            {joint(0.36, 0.95)}
            <Box size={[L2, 0.34, 0.34]} position={[L2 / 2, 0, 0]} color={c.surface} edge={c.edge} />
            <group ref={wrist} position={[L2, 0, 0]}>
              {joint(0.24, 0.6)}
              <Box size={[0.5, 0.3, 0.86]} position={[0, -0.32, 0]} color={c.surface} edge={hi} />
              {[0, 1].map((i) => (
                <group key={i} ref={(g) => { fingers.current[i] = g }}>
                  <Box size={[0.36, 0.38, 0.06]} position={[0, -0.62, 0]} color={c.surface} edge={hi} />
                </group>
              ))}
            </group>
          </group>
        </group>
      </group>
    </group>
  )
}

function Board({ lab, sim, c, tip }: { lab: Lab; sim: Sim; c: Colors; tip: Tip }) {
  const traceGeo = useMemo(() => {
    const pos: number[] = []
    TRACES.forEach((path) => {
      for (let k = 1; k < path.length; k++) pos.push(path[k - 1].x, path[k - 1].y, path[k - 1].z, path[k].x, path[k].y, path[k].z)
    })
    const g = new BufferGeometry()
    g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3))
    g.setAttribute('color', new BufferAttribute(new Float32Array(pos.length), 3))
    return g
  }, [])
  const staticGeo = useMemo(() => {
    const pos: number[] = []
    const y = BOARD.y + 0.014
    for (const s of SLOTS) {
      const q = [[s.x - 0.5, s.z - 0.38], [s.x + 0.5, s.z - 0.38], [s.x + 0.5, s.z + 0.38], [s.x - 0.5, s.z + 0.38]]
      q.forEach(([x, z], k) => pos.push(x, y, z, q[(k + 1) % 4][0], y, q[(k + 1) % 4][1]))
    }
    for (const chip of [CHIPS.framework, CHIPS.database]) {
      const py = BOARD.y + 0.01
      for (let k = 0; k < 7; k++) {
        const o = -0.66 + k * 0.22
        const e = CHIP / 2
        pos.push(chip.x + o, py, chip.z - e, chip.x + o, py, chip.z - e - 0.16, chip.x + o, py, chip.z + e, chip.x + o, py, chip.z + e + 0.16)
        pos.push(chip.x - e, py, chip.z + o, chip.x - e - 0.16, py, chip.z + o, chip.x + e, py, chip.z + o, chip.x + e + 0.16, py, chip.z + o)
      }
    }
    const g = new BufferGeometry()
    g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3))
    return g
  }, [])
  const pulses = useRef<(Mesh | null)[]>([])
  const chipRefs = useRef<Record<string, Group | null>>({})
  const bump = useRef<Record<string, number>>({ framework: 0, database: 0 })
  const lit = useMemo(() => new Color(ACCENT), [])
  const dim = useMemo(() => new Color(c.dim), [c.dim])
  useFrame((_, dt) => {
    const col = traceGeo.getAttribute('color') as BufferAttribute
    let at = 0
    TRACES.forEach((path, s) => {
      const on = sim.slots[s]?.mode === 'board'
      const color = on ? lit : dim
      for (let k = 0; k < (path.length - 1) * 2; k++) color.toArray(col.array, (at++) * 3)
    })
    col.needsUpdate = true
    pulses.current.forEach((m, i) => {
      const pulse = sim.pulses[i]
      if (!m) return
      m.visible = !!pulse
      if (!pulse) return
      const path = TRACES[pulse.slot % TRACES.length]
      const total = path.slice(1).reduce((sum, p, k) => sum + p.distanceTo(path[k]), 0)
      let left = pulse.t * total
      for (let k = 1; k < path.length; k++) {
        const seg = path[k].distanceTo(path[k - 1])
        if (left <= seg || k === path.length - 1) {
          m.position.lerpVectors(path[k - 1], path[k], clamp(left / seg, 0, 1))
          break
        }
        left -= seg
      }
    })
    for (const key of ['framework', 'database'] as const) {
      bump.current[key] = Math.max(0, bump.current[key] - dt * 3)
      const g = chipRefs.current[key]
      if (g) g.position.y = Math.sin(bump.current[key] * Math.PI) * 0.6
    }
  })
  const chipTexture = useMemo(() => {
    const make = (title: string, value: string) =>
      textTexture(340, 340, (ctx) => {
        ctx.fillStyle = '#1D2225'
        ctx.fillRect(0, 0, 340, 340)
        ctx.strokeStyle = ACCENT
        ctx.lineWidth = 3
        ctx.strokeRect(18, 18, 304, 304)
        ctx.beginPath()
        ctx.arc(46, 46, 9, 0, Math.PI * 2)
        ctx.stroke()
        ctx.fillStyle = '#8A9094'
        ctx.font = `500 26px ${FONT}`
        ctx.fillText(title, 36, 140)
        ctx.fillStyle = '#FCFCFC'
        ctx.font = `500 ${value.length > 9 ? 38 : 50}px ${FONT}`
        ctx.fillText(value, 36, 200)
        ctx.fillStyle = '#8A9094'
        ctx.font = `400 20px ${FONT}`
        ctx.fillText('click to swap ↻', 36, 290)
      })
    return {
      framework: make('FRAMEWORK', frameworks.find((f) => f.value === lab.setup.framework)!.label),
      database: make('DATABASE', databases.find((d) => d.value === lab.setup.database)!.label),
    }
  }, [lab.setup.framework, lab.setup.database])
  const cycle = (key: 'framework' | 'database') => {
    bump.current[key] = 1
    if (key === 'framework') lab.set('framework', lab.setup.framework === 'next' ? 'tanstack' : 'next')
    else lab.set('database', lab.setup.database === 'postgres' ? 'mongodb' : 'postgres')
  }
  const cx = (BOARD.x0 + BOARD.x1) / 2, cz = (BOARD.z0 + BOARD.z1) / 2
  return (
    <group>
      <Box size={[BOARD.x1 - BOARD.x0, 0.12, BOARD.z1 - BOARD.z0]} position={[cx, BOARD.y - 0.06, cz]} color={c.board} edge={c.edge} />
      {[[BOARD.x0 + 0.3, BOARD.z0 + 0.3], [BOARD.x1 - 0.3, BOARD.z0 + 0.3], [BOARD.x0 + 0.3, BOARD.z1 - 0.3], [BOARD.x1 - 0.3, BOARD.z1 - 0.3]].map(([x, z]) => (
        <mesh key={`${x}${z}`} position={[x, (BOARD.y - 0.12) / 2, z]}>
          <cylinderGeometry args={[0.12, 0.12, BOARD.y - 0.12, 16]} />
          <meshStandardMaterial color={c.surface} roughness={1} />
          <Edges color={c.edge} threshold={20} />
        </mesh>
      ))}
      <lineSegments geometry={traceGeo}>
        <lineBasicMaterial vertexColors />
      </lineSegments>
      <lineSegments geometry={staticGeo}>
        <lineBasicMaterial color={c.dim} />
      </lineSegments>
      {(['framework', 'database'] as const).map((key) => (
        <group key={key} ref={(g) => { chipRefs.current[key] = g }}>
          <mesh
            position={[CHIPS[key].x, BOARD.y + 0.14, CHIPS[key].z]}
            onClick={(e) => { e.stopPropagation(); cycle(key) }}
            onPointerOver={(e) => { e.stopPropagation(); tip.show(e.nativeEvent, key === 'framework' ? 'Framework chip' : 'Database chip', 'Click to swap') }}
            onPointerMove={(e) => tip.move(e.nativeEvent)}
            onPointerOut={() => tip.hide()}
          >
            <boxGeometry args={[CHIP, 0.28, CHIP]} />
            <meshStandardMaterial attach="material-0" color="#1D2225" roughness={1} />
            <meshStandardMaterial attach="material-1" color="#1D2225" roughness={1} />
            <meshBasicMaterial attach="material-2" map={chipTexture[key]} toneMapped={false} />
            <meshStandardMaterial attach="material-3" color="#1D2225" roughness={1} />
            <meshStandardMaterial attach="material-4" color="#1D2225" roughness={1} />
            <meshStandardMaterial attach="material-5" color="#1D2225" roughness={1} />
            <Edges color={c.edge} />
          </mesh>
        </group>
      ))}
      {Array.from({ length: 8 }, (_, i) => (
        <mesh key={i} ref={(m) => { pulses.current[i] = m }} visible={false}>
          <sphereGeometry args={[0.09, 12, 12]} />
          <meshBasicMaterial color={ACCENT} toneMapped={false} />
        </mesh>
      ))}
    </group>
  )
}

function Drone({ sim, lab, c }: { sim: Sim; lab: Lab; c: Colors }) {
  const group = useRef<Group>(null)
  const rotors = useRef<(Group | null)[]>([])
  const glow = useRef<Mesh>(null)
  const points = useRef<Points>(null)
  const N = 90
  const state = useMemo(() => ({ pos: new Float32Array(N * 3).fill(-99), vel: new Float32Array(N * 3), life: new Float32Array(N), next: 0 }), [])
  useFrame((_, dt) => {
    const g = group.current!
    const d = sim.drone
    g.position.copy(d.pos)
    g.scale.setScalar(Math.max(0.001, d.show))
    g.visible = d.show > 0.01
    g.rotation.z = Math.sin(sim.time * 1.7) * 0.06
    rotors.current.forEach((r) => r && (r.rotation.y += dt * 30))
    const weld = d.welds[0]
    const welding = !!weld && d.weldT > 0
    glow.current!.visible = welding
    if (welding) {
      glow.current!.position.copy(weld).setY(weld.y + 0.06)
      glow.current!.scale.setScalar(0.6 + Math.random() * 0.8)
      for (let k = 0; k < 4; k++) {
        const i = state.next++ % N
        state.pos.set([weld.x + (Math.random() - 0.5) * 0.4, weld.y + 0.06, weld.z + (Math.random() - 0.5) * 0.3], i * 3)
        const a = Math.random() * Math.PI * 2, s = 1 + Math.random() * 2.4
        state.vel.set([Math.cos(a) * s, 1.5 + Math.random() * 3, Math.sin(a) * s], i * 3)
        state.life[i] = 0.35 + Math.random() * 0.35
      }
    }
    for (let i = 0; i < N; i++) {
      if (state.life[i] <= 0) {
        state.pos[i * 3 + 1] = -99
        continue
      }
      state.life[i] -= dt
      state.vel[i * 3 + 1] -= 14 * dt
      state.pos[i * 3] += state.vel[i * 3] * dt
      state.pos[i * 3 + 1] = Math.max(BOARD.y + 0.02, state.pos[i * 3 + 1] + state.vel[i * 3 + 1] * dt)
      state.pos[i * 3 + 2] += state.vel[i * 3 + 2] * dt
    }
    const attr = points.current!.geometry.getAttribute('position') as BufferAttribute
    attr.needsUpdate = true
  })
  const body = lab.setup.agent === 'codex' ? c.fg : '#D97757'
  const name = agents.find((a) => a.value === lab.setup.agent)?.label ?? ''
  const tag = useMemo(
    () =>
      textTexture(500, 100, (ctx) => {
        ctx.fillStyle = c.surface
        ctx.strokeStyle = c.edge
        ctx.lineWidth = 3
        ctx.beginPath()
        ctx.roundRect(4, 14, 492, 72, 36)
        ctx.fill()
        ctx.stroke()
        ctx.fillStyle = body
        ctx.beginPath()
        ctx.arc(46, 50, 10, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = c.fg
        ctx.font = `500 34px ${FONT}`
        ctx.fillText(`${name} is welding`, 70, 62)
      }),
    [c, body, name],
  )
  return (
    <>
      <group ref={group}>
        <Box size={[0.8, 0.22, 0.8]} color={c.surface} edge={body} />
        <Box size={[0.3, 0.14, 0.3]} position={[0, 0.18, 0]} color={body} edge={body} />
        {[[-0.62, -0.62], [0.62, -0.62], [-0.62, 0.62], [0.62, 0.62]].map(([x, z], i) => (
          <group key={i} position={[x, 0.12, z]}>
            <Line points={[[-x * 0.55, -0.02, -z * 0.55], [0, 0, 0]]} color={c.edge} lineWidth={1} />
            <group ref={(r) => { rotors.current[i] = r }}>
              <Line points={[[-0.34, 0.04, 0], [0.34, 0.04, 0]]} color={c.edge} lineWidth={1.4} />
              <Line points={[[0, 0.04, -0.34], [0, 0.04, 0.34]]} color={c.edge} lineWidth={1.4} />
            </group>
          </group>
        ))}
        <Line points={[[0, -0.11, 0], [0, -0.55, 0.1]]} color={body} lineWidth={1.6} />
        <sprite position={[0, 0.85, 0]} scale={[3.0, 0.6, 1]}>
          <spriteMaterial map={tag} transparent toneMapped={false} depthTest={false} />
        </sprite>
      </group>
      <mesh ref={glow} visible={false}>
        <sphereGeometry args={[0.12, 12, 12]} />
        <meshBasicMaterial color="#FFE2A8" toneMapped={false} />
      </mesh>
      <points ref={points} frustumCulled={false}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[state.pos, 3]} />
        </bufferGeometry>
        <pointsMaterial color="#FFB347" size={3.5} sizeAttenuation={false} toneMapped={false} />
      </points>
    </>
  )
}

/** The v1 cell, compacted: belt from the dock, two-link arm, app board with framework and database chips, agent drone. */
export function Cell({ lab, sim, c, tip }: { lab: Lab; sim: Sim; c: Colors; tip: Tip }) {
  const group = useRef<Group>(null)
  useFrame(() => group.current?.position.copy(sim.cell))
  const label = useMemo(
    () =>
      textTexture(512, 96, (ctx) => {
        ctx.fillStyle = c.muted
        ctx.font = `500 44px ${FONT}`
        ctx.fillText('ASSEMBLY CELL · DOCK 1', 8, 62)
      }),
    [c],
  )
  return (
    <group ref={group}>
      <mesh position={[4.6, 0.004, -0.1]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[21, 9.6]} />
        <meshBasicMaterial color={c.slab} />
      </mesh>
      <Line points={[[-5.9, 0.01, -4.9], [15.1, 0.01, -4.9], [15.1, 0.01, 4.7], [-5.9, 0.01, 4.7], [-5.9, 0.01, -4.9]]} color={c.edge} lineWidth={1} dashed dashSize={0.3} gapSize={0.2} />
      <mesh position={[0.6, 0.012, 4.15]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[6.4, 1.2]} />
        <meshBasicMaterial map={label} transparent toneMapped={false} />
      </mesh>
      <Belt c={c} />
      <Arm sim={sim} c={c} />
      <Board lab={lab} sim={sim} c={c} tip={tip} />
      <Drone sim={sim} lab={lab} c={c} />
    </group>
  )
}
