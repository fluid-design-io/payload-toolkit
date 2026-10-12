import { useFrame } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ReactNode, RefObject } from 'react'
import { Matrix4, TorusGeometry } from 'three'
import type { Group, InstancedMesh } from 'three'

import type { Database, PackageManager, Setup } from '@/routes/workspace/-workspace/workspace.types'
import { keepAnimating } from '../../../../../kit/busy'
import type { Guard, SocketKind, SwapAct, SwapBox, SwapClock, SwapVariant, Tip, Tokens, V3 } from '../../../core/contract'
import { Body, pickable } from '../../../core/scene'
import { box, cyl, fillMat, lineMat, mergeEdges, mergeFills, rect, reducedMotion, segs, useDisposable } from '../../../core/three'
import type { Piece } from '../../../core/three'
import { cpuArt, dimmArt, inkOf, leafArt } from './art'
import { BY, cpuHalf } from './dims'
import { actFor } from './swap'
import { rest } from './swap/kit'
import { SwapMachine } from './swap/machine'

type Socket = { c: Tokens; swap: SwapVariant; onClick: () => void; tip: Tip; guard: Guard }

const ids = new WeakMap<object, number>()
let lastId = 0
/** A stable number per object, so a rig can be keyed on the act and the tokens it was built from. */
const idOf = (o: object) => ids.get(o) ?? (ids.set(o, ++lastId), lastId)

/**
 * A socket's swappable part. Holds the leaving part in `old` and the arriving one in `next`, each
 * pivoting on its box's bottom centre, and lets the style's act for this socket pose both while the swap runs.
 */
function Swap({ kind, swap, value, boxOf, c, part, base }: {
  kind: SocketKind; swap: SwapVariant; value: string; boxOf: (v: string) => SwapBox; c: Tokens; part: (v: string) => ReactNode; base?: (from: string | null, to: string) => ReactNode
}) {
  const old = useRef<Group>(null)
  const next = useRef<Group>(null)
  const act = actFor(swap, kind)
  const [m] = useState(() => new SwapMachine(act, value, boxOf))
  useLayoutEffect(() => m.use(act), [m, act])
  const [roles, setRoles] = useState<{ from: string | null; to: string }>({ from: null, to: value })
  useLayoutEffect(() => {
    const did = m.ask(value)
    if (did === 'start' || did === 'retarget') setRoles({ from: m.from, to: m.to })
    keepAnimating()
  }, [m, value])
  useLayoutEffect(() => {
    if (!m.settle()) {
      if (!m.from) rest(next.current, m.toBox)
      return
    }
    rest(old.current, m.fromBox)
    if (old.current) old.current.visible = true
    if (next.current) next.current.visible = false
  }, [m, roles])
  useFrame((_, dt) => {
    const did = m.step(dt)
    if (did === 'idle') return
    keepAnimating()
    if (did === 'chain') setRoles({ from: m.from, to: m.to })
    if (did === 'end') {
      if (old.current) old.current.visible = false
      rest(next.current, m.toBox)
      if (next.current) next.current.visible = true
      setRoles({ from: null, to: m.to })
    }
  })
  const at = (v: string): V3 => { const b = boxOf(v); return [-b.x, -b.y, -b.z] }
  return (
    <>
      {base?.(roles.from, roles.to)}
      <group ref={old}>
        {roles.from && <group key={roles.from} position={at(roles.from)}>{part(roles.from)}</group>}
      </group>
      <group ref={next}>
        <group key={roles.to} position={at(roles.to)}>{part(roles.to)}</group>
      </group>
      {roles.from && <Pad a={boxOf(roles.from)} b={boxOf(roles.to)} />}
      <Rig key={`${idOf(act)}.${idOf(c)}`} act={act} kind={kind} c={c} clock={m} oldRef={old} nextRef={next} />
    </>
  )
}

/** Builds the act's rig for this socket and these tokens, runs it every frame and disposes it when either changes. */
function Rig({ act, kind, c, clock, oldRef, nextRef }: {
  act: SwapAct; kind: SocketKind; c: Tokens; clock: SwapClock; oldRef: RefObject<Group | null>; nextRef: RefObject<Group | null>
}) {
  const [rig] = useState(() => act.rig(c, kind))
  useEffect(() => () => rig.dispose?.(), [rig])
  useFrame((_, dt) => {
    if (oldRef.current && nextRef.current && rig.frame(clock, oldRef.current, nextRef.current, dt)) keepAnimating()
  })
  return rig.root ? <primitive object={rig.root} /> : null
}

/** A part's hairlines catch the pointer about this far past its faces. */
const REACH = 0.6

/** An undrawn box over both parts' footprints while a swap runs, so the socket stays clickable while it is empty. */
function Pad({ a, b }: { a: SwapBox; b: SwapBox }) {
  const x0 = Math.min(a.x - a.w, b.x - b.w) - REACH, x1 = Math.max(a.x + a.w, b.x + b.w) + REACH
  const z0 = Math.min(a.z - a.d, b.z - b.d) - REACH, z1 = Math.max(a.z + a.d, b.z + b.d) + REACH
  const h = Math.max(a.h, b.h)
  return (
    <mesh position={[(x0 + x1) / 2, Math.min(a.y, b.y) + h / 2, (z0 + z1) / 2]} scale={[x1 - x0, h, z1 - z0]}>
      <boxGeometry />
      <meshBasicMaterial visible={false} />
    </mesh>
  )
}

const cpuBox = (v: string): SwapBox => {
  const half = cpuHalf(v as Setup['framework'])
  return { x: 0, y: 0, z: 0, w: half.w, d: half.d, h: v === 'next' ? 0.35 : 0.23 }
}

function CpuPart({ framework, c }: { framework: Setup['framework']; c: Tokens }) {
  const art = useDisposable(() => cpuArt(framework, inkOf(c)), [framework, c])
  const balls = useRef<InstancedMesh>(null)
  const half = cpuHalf(framework)
  const ballPts: [number, number][] = []
  for (let x = -half.w + 0.1; x <= half.w - 0.1; x += 0.16)
    for (let z = -half.d + 0.1; z <= half.d - 0.1; z += 0.16)
      if (Math.abs(x) > half.w - 0.42 || Math.abs(z) > half.d - 0.42) ballPts.push([x, z])
  useLayoutEffect(() => {
    const m = new Matrix4()
    ballPts.forEach(([x, z], i) => balls.current?.setMatrixAt(i, m.makeTranslation(x, 0.035, z)))
    if (balls.current) balls.current.instanceMatrix.needsUpdate = true
  }, [ballPts])
  const lid = framework === 'next' ? { w: 2.5, d: 2.5, h: 0.2 } : { w: 2.3, d: 1.5, h: 0.08 }
  const substrate: Piece[] = [{ geo: box(half.w * 2, 0.08, half.d * 2), at: [0, 0.11, 0] }]
  if (framework === 'tanstack') substrate.push({ geo: box(0.5, 0.06, 2.2), at: [-1.55, 0.18, 0] }, { geo: box(0.5, 0.06, 2.2), at: [1.55, 0.18, 0] })
  return (
    <>
      <instancedMesh ref={balls} args={[undefined, undefined, ballPts.length]} material={fillMat(c.pin, c.flat, 0.3, { metal: 0.7 })}>
        <sphereGeometry args={[0.04, 8, 6]} />
      </instancedMesh>
      <Body id={`sub-${framework}`} c={c} fill={c.sub} edge={c.bodyEdge} pieces={substrate} />
      <Body id={`lid-${framework}`} c={c} fill={c.body} edge={c.bodyEdge} metal={0.3} pieces={[{ geo: box(lid.w, lid.h, lid.d), at: [0, 0.15 + lid.h / 2, 0] }]} />
      <mesh position={[0, 0.15 + lid.h + 0.002, 0]} rotation-x={-Math.PI / 2}>
        <planeGeometry args={[lid.w * 0.98, lid.d * 0.98]} />
        <meshBasicMaterial map={art} toneMapped={false} />
      </mesh>
    </>
  )
}

/** The TanStack package's socket frame; it stays on the board while its CPU swaps. */
function CpuFrame({ c }: { c: Tokens }) {
  const half = cpuHalf('tanstack')
  const frame = useDisposable(() => segs(rect(-half.w - 0.25, -half.d - 0.25, half.w + 0.25, half.d + 0.25, 0.01)), [])
  return <lineSegments geometry={frame} material={lineMat(c.pin)} />
}

/** The framework CPU, centred on `at` (its socket surface point). */
export function Cpu({ framework, at, c, swap, onClick, tip, guard }: Socket & { framework: Setup['framework']; at: V3 }) {
  const h = pickable(tip, guard, framework === 'next' ? 'Next.js · CPU0' : 'TanStack Start · CPU0', 'Framework socket · click to swap the CPU', onClick)
  return (
    <group position={at} {...h}>
      <Swap
        kind="cpu" swap={swap} value={framework} boxOf={cpuBox} c={c}
        part={(v) => <CpuPart framework={v as Setup['framework']} c={c} />}
        base={(from, to) => (from === 'tanstack' || to === 'tanstack') && <CpuFrame c={c} />}
      />
    </group>
  )
}

const memoryBox = (v: string): SwapBox => (v === 'postgres' ? { x: -7.2, y: 0, z: -0.4, w: 0.32, d: 1.95, h: 1.45 } : { x: -7.15, y: 0, z: 0, w: 0.48, d: 1.78, h: 0.6 })

const DIMMS = [-7.45, -6.95]

/** Both DIMMs as one body, each with its label. */
function DimmPart({ c }: { c: Tokens }) {
  const art = useDisposable(() => dimmArt(inkOf(c)), [c])
  const dimms: Piece[] = []
  for (const x of DIMMS) {
    dimms.push({ geo: box(0.05, 1.25, 3.9), at: [x, 0.82, -0.4] })
    for (let k = 0; k < 8; k++) dimms.push({ geo: box(0.07, 0.36, 0.38), at: [x + 0.06, 0.95, -2.02 + k * 0.46] })
  }
  return (
    <Body id="dimms" c={c} fill={c.sub} edge={c.bodyEdge} pieces={dimms}>
      {DIMMS.map((x) => (
        <mesh key={x} position={[x + 0.1, 0.62, -0.4]} rotation-y={Math.PI / 2}>
          <planeGeometry args={[3.4, 1.17]} />
          <meshBasicMaterial map={art} toneMapped={false} />
        </mesh>
      ))}
    </Body>
  )
}

function NandPart({ c }: { c: Tokens }) {
  const art = useDisposable(() => leafArt(inkOf(c)), [c])
  const stacks: Piece[] = []
  for (const z of [-1.3, 0, 1.3]) for (let k = 0; k < 4; k++) stacks.push({ geo: box(0.95 - k * 0.04, 0.1, 0.95 - k * 0.04), at: [0, 0.07 + k * 0.15, z] })
  return (
    <group position={[-7.15, 0, 0]}>
      <Body id="nand" c={c} fill={c.body} edge={c.bodyEdge} pieces={stacks} />
      {[-1.3, 0, 1.3].map((z) => (
        <mesh key={z} position={[0, 0.07 + 3 * 0.15 + 0.052, z]} rotation-x={-Math.PI / 2}>
          <planeGeometry args={[0.8, 0.8]} />
          <meshBasicMaterial map={art} toneMapped={false} />
        </mesh>
      ))}
    </group>
  )
}

/** Memory at the PCB's spot (x about -7.2, z -1.4); `offset` moves it. The DIMM slots stay while either side of a swap is Postgres. */
export function Memory({ database, offset = [0, 0, 0], c, swap, onClick, tip, guard }: Socket & { database: Database; offset?: V3 }) {
  const h = pickable(tip, guard, database === 'postgres' ? 'PostgreSQL · DIMM' : 'MongoDB · NAND stack', 'Memory · click to swap the database', onClick)
  return (
    <group position={[offset[0], BY + offset[1], -1.4 + offset[2]]} {...h}>
      <Swap
        kind="memory" swap={swap} value={database} boxOf={memoryBox} c={c}
        part={(v) => (v === 'postgres' ? <DimmPart c={c} /> : <NandPart c={c} />)}
        base={(from, to) => (from === 'postgres' || to === 'postgres') && (
          <Body id="sockets" c={c} fill={c.body} edge={c.bodyEdge} pieces={[-7.45, -6.95].map((x): Piece => ({ geo: box(0.26, 0.22, 4.2), at: [x, 0.11, -0.4] }))} />
        )}
      />
    </group>
  )
}

const powerBox = (v: string): SwapBox =>
  v === 'pnpm' ? { x: -5.03, y: 0, z: -5.2, w: 2.44, d: 0.95, h: 0.6 }
  : v === 'npm' ? { x: -4.6, y: 0, z: -5.0, w: 2.1, d: 0.75, h: 1.3 }
  : { x: -4.88, y: 0, z: -5.1, w: 2.22, d: 0.7, h: 0.4 }

function Toroids({ c }: { c: Tokens }) {
  const spin = useRef<Group>(null)
  useFrame(({ clock }) => {
    if (spin.current && !reducedMotion) spin.current.children.forEach((child, i) => { child.rotation.y = clock.elapsedTime * (i % 2 ? 0.6 : -0.6) })
  })
  // One toroid's body, merged once and drawn twice with Body's materials, since each spins on its own.
  const toroid = useDisposable(() => {
    const ring: Piece[] = [{ geo: new TorusGeometry(0.5, 0.2, 10, 28), rot: [Math.PI / 2, 0, 0], threshold: 40 }]
    const merged = { fill: mergeFills(ring), edges: mergeEdges(ring) }
    ring[0].geo.dispose()
    return merged
  }, [])
  return (
    <group ref={spin}>
      {[-6.4, -4.9].map((x) => (
        <group key={x} position={[x, 0.2, -5.1]}>
          <mesh geometry={toroid.fill} material={fillMat(c.sub, c.flat, c.rough, { transparent: false, opacity: 1 })} />
          <lineSegments geometry={toroid.edges} material={lineMat(c.bodyEdge)} />
        </group>
      ))}
    </group>
  )
}

function PowerPart({ pm, c }: { pm: PackageManager; c: Tokens }) {
  const dark: Piece[] = [], metal: Piece[] = []
  if (pm === 'pnpm') {
    for (let i = 0; i < 6; i++) dark.push({ geo: box(0.62, 0.48, 0.62), at: [-7.15 + i * 0.85, 0.24, -5.15] }, { geo: box(0.42, 0.1, 0.4), at: [-7.15 + i * 0.85, 0.05, -4.45] })
    for (let i = 0; i < 5; i++) metal.push({ geo: cyl(0.2, 0.2, 0.6, 20), at: [-6.75 + i * 0.85, 0.3, -5.95], threshold: 30 })
  } else if (pm === 'npm') {
    metal.push({ geo: box(2.6, 0.12, 1.3), at: [-5.4, 0.06, -5.1] })
    for (let i = 0; i < 11; i++) metal.push({ geo: box(0.05, 0.95, 1.3), at: [-6.6 + i * 0.24, 0.6, -5.1] })
    dark.push({ geo: box(0.95, 1.1, 0.16), at: [-5.4, 0.66, -4.35] })
    for (const x of [-3.6, -2.85]) dark.push({ geo: cyl(0.36, 0.36, 1.3, 28), at: [x, 0.65, -5.1], threshold: 30 })
  } else {
    dark.push({ geo: box(0.6, 0.12, 0.6), at: [-3.6, 0.06, -5.1] })
    for (const x of [-3.0, -2.75]) metal.push({ geo: box(0.18, 0.12, 0.34), at: [x, 0.06, -5.1] })
  }
  return (
    <>
      <Body id={`pw-dark-${pm}`} c={c} fill={c.body} edge={c.bodyEdge} pieces={dark} />
      {metal.length > 0 && <Body id={`pw-metal-${pm}`} c={c} fill={c.pin} edge={c.bodyEdge} metal={0.5} pieces={metal} />}
      {pm === 'bun' && <Toroids c={c} />}
    </>
  )
}

/** The package manager's power stage at the PCB's spot (x -7.2 to -2.5, z about -5.1); `offset` moves it. */
export function Power({ pm, offset = [0, 0, 0], c, swap, onClick, tip, guard }: Socket & { pm: PackageManager; offset?: V3 }) {
  const h = pickable(tip, guard, `${pm} · power stage`, 'Package manager · click to swap the regulator', onClick)
  return (
    <group position={[offset[0], offset[1] + BY, offset[2]]} {...h}>
      <Swap kind="power" swap={swap} value={pm} boxOf={powerBox} c={c} part={(v) => <PowerPart pm={v as PackageManager} c={c} />} />
    </group>
  )
}

