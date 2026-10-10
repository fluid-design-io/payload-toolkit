import { useFrame } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { Matrix4, TorusGeometry } from 'three'
import type { Group, InstancedMesh } from 'three'

import type { Database, PackageManager, Setup } from '@/routes/workspace/-workspace/workspace.types'
import type { Guard, Tip, Tokens, V3 } from '../../../core/contract'
import { Body, pickable, useDrop } from '../../../core/scene'
import { box, cyl, fillMat, lineMat, rect, reducedMotion, segs } from '../../../core/three'
import type { Piece } from '../../../core/three'
import { cpuArt, dimmArt, inkOf, leafArt } from './art'
import { BY, cpuHalf } from './dims'


type Socket = { c: Tokens; onClick: () => void; tip: Tip; guard: Guard }

/** The framework CPU, centred on `at` (its socket surface point). */
export function Cpu({ framework, at, c, onClick, tip, guard }: Socket & { framework: Setup['framework']; at: V3 }) {
  const [g, drop] = useDrop(3)
  const art = useMemo(() => cpuArt(framework, inkOf(c)), [framework, c])
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
  const lid = framework === 'next' ? { w: 2.5, d: 2.5, h: 0.2 } : { w: 2.3, d: 1.5, h: 0.08 }
  const h = pickable(tip, guard, framework === 'next' ? 'Next.js · CPU0' : 'TanStack Start · CPU0', 'Framework socket · click to swap the CPU', () => { drop.current = 2.4; onClick() })
  const substrate: Piece[] = [{ geo: box(half.w * 2, 0.08, half.d * 2), at: [0, 0.11, 0] }]
  if (framework === 'tanstack') substrate.push({ geo: box(0.5, 0.06, 2.2), at: [-1.55, 0.18, 0] }, { geo: box(0.5, 0.06, 2.2), at: [1.55, 0.18, 0] })
  const socket = useMemo(() => segs(rect(-half.w - 0.25, -half.d - 0.25, half.w + 0.25, half.d + 0.25, 0.01)), [half.w, half.d])
  return (
    <group position={at}>
      {framework === 'tanstack' && <lineSegments geometry={socket} material={lineMat(c.pin)} />}
      <group ref={g} {...h}>
        <instancedMesh ref={balls} args={[undefined, undefined, ballPts.length]} material={fillMat(c.pin, c.flat, 0.3, { metal: 0.7 })}>
          <sphereGeometry args={[0.04, 8, 6]} />
        </instancedMesh>
        <Body id={`sub-${framework}`} c={c} fill={c.sub} edge={c.bodyEdge} pieces={substrate} />
        <Body id={`lid-${framework}`} c={c} fill={c.body} edge={c.bodyEdge} metal={0.3} pieces={[{ geo: box(lid.w, lid.h, lid.d), at: [0, 0.15 + lid.h / 2, 0] }]} />
        <mesh position={[0, 0.15 + lid.h + 0.002, 0]} rotation-x={-Math.PI / 2}>
          <planeGeometry args={[lid.w * 0.98, lid.d * 0.98]} />
          <meshBasicMaterial map={art} toneMapped={false} />
        </mesh>
      </group>
    </group>
  )
}

/** Memory at the PCB's spot (x about -7.2, z -1.4); `offset` moves it. `useDrop` owns the inner group's y, so the surface height sits on the outer one. */
export function Memory({ database, offset = [0, 0, 0], c, onClick, tip, guard }: Socket & { database: Database; offset?: V3 }) {
  const [g, drop] = useDrop(2.5)
  const art = useMemo(() => (database === 'postgres' ? dimmArt(inkOf(c)) : leafArt(inkOf(c))), [database, c])
  useEffect(() => () => art.dispose(), [art])
  const h = pickable(tip, guard, database === 'postgres' ? 'PostgreSQL · DIMM' : 'MongoDB · NAND stack', 'Memory · click to swap the database', () => { drop.current = 2.2; onClick() })
  const z0 = -1.4
  if (database === 'postgres') {
    const dimm: Piece[] = [{ geo: box(0.05, 1.25, 3.9), at: [0, 0.82, 0] }]
    for (let k = 0; k < 8; k++) dimm.push({ geo: box(0.07, 0.36, 0.38), at: [0.06, 0.95, -1.62 + k * 0.46] })
    return (
      <group position={[offset[0], BY + offset[1], z0 + offset[2]]} {...h}>
        <Body id="sockets" c={c} fill={c.body} edge={c.bodyEdge} pieces={[-7.45, -6.95].map((x): Piece => ({ geo: box(0.26, 0.22, 4.2), at: [x, 0.11, -0.4] }))} />
        <group ref={g}>
          {[-7.45, -6.95].map((x) => (
            <Body key={x} id="dimm" c={c} fill={c.sub} edge={c.bodyEdge} position={[x, 0, -0.4]} pieces={dimm}>
              <mesh position={[0.1, 0.62, 0]} rotation-y={Math.PI / 2}>
                <planeGeometry args={[3.4, 1.17]} />
                <meshBasicMaterial map={art} toneMapped={false} />
              </mesh>
            </Body>
          ))}
        </group>
      </group>
    )
  }
  const stacks: Piece[] = []
  for (const z of [-1.3, 0, 1.3]) for (let k = 0; k < 4; k++) stacks.push({ geo: box(0.95 - k * 0.04, 0.1, 0.95 - k * 0.04), at: [0, 0.07 + k * 0.15, z] })
  return (
    <group position={[offset[0] - 7.15, offset[1] + BY, offset[2] + z0]} {...h}>
      <group ref={g}>
        <Body id="nand" c={c} fill={c.body} edge={c.bodyEdge} pieces={stacks} />
        {[-1.3, 0, 1.3].map((z) => (
          <mesh key={z} position={[0, 0.07 + 3 * 0.15 + 0.052, z]} rotation-x={-Math.PI / 2}>
            <planeGeometry args={[0.8, 0.8]} />
            <meshBasicMaterial map={art} toneMapped={false} />
          </mesh>
        ))}
      </group>
    </group>
  )
}

/** The package manager's power stage at the PCB's spot (x -7.2 to -2.5, z about -5.1); `offset` moves it. */
export function Power({ pm, offset = [0, 0, 0], c, onClick, tip, guard }: Socket & { pm: PackageManager; offset?: V3 }) {
  const [g, drop] = useDrop(2.5)
  const spin = useRef<Group>(null)
  useFrame(({ clock }) => {
    if (spin.current && pm === 'bun' && !reducedMotion) spin.current.children.forEach((child, i) => { child.rotation.y = clock.elapsedTime * (i % 2 ? 0.6 : -0.6) })
  })
  const h = pickable(tip, guard, `${pm} · power stage`, 'Package manager · click to swap the regulator', () => { drop.current = 2.2; onClick() })
  const pieces = useMemo(() => {
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
    return { dark, metal }
  }, [pm])
  return (
    <group position={[offset[0], offset[1] + BY, offset[2]]} {...h}>
      <group ref={g}>
        <Body id={`pw-dark-${pm}`} c={c} fill={c.body} edge={c.bodyEdge} pieces={pieces.dark} />
        {pieces.metal.length > 0 && <Body id={`pw-metal-${pm}`} c={c} fill={c.pin} edge={c.bodyEdge} metal={0.5} pieces={pieces.metal} />}
        {pm === 'bun' && (
          <group ref={spin}>
            {[-6.4, -4.9].map((x) => (
              <Body key={x} id="toroid" c={c} fill={c.sub} edge={c.bodyEdge} position={[x, 0.2, -5.1]} pieces={[{ geo: new TorusGeometry(0.5, 0.2, 10, 28), rot: [Math.PI / 2, 0, 0], threshold: 40 }]} />
            ))}
          </group>
        )}
      </group>
    </group>
  )
}
