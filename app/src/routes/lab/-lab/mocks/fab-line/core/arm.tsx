import { useFrame } from '@react-three/fiber'
import { useMemo, useRef, useState } from 'react'
import type { Group } from 'three'

import type { Sim, Tokens } from './contract'
import { ARM, railNow } from './line'
import { Body } from './scene'
import { box, clamp, cyl } from './three'
import type { Piece } from './three'

/** The linear rail under the arm, rebuilt when the layout changes its length and slid while the line reflows. */
export function Rail({ sim, c }: { sim: Sim; c: Tokens }) {
  const ref = useRef<Group>(null)
  const rl = sim.line.rail.x1 - sim.line.rail.x0
  const pieces = useMemo((): Piece[] => {
    const out: Piece[] = [
      { geo: box(rl, 0.22, ARM.w), at: [0, 0.11, 0] },
      { geo: box(rl, 0.06, 0.1), at: [0, 0.25, -ARM.w / 2 + 0.05] },
      { geo: box(rl, 0.06, 0.1), at: [0, 0.25, ARM.w / 2 - 0.05] },
    ]
    const n = Math.max(2, Math.round(rl / 3.13))
    for (let k = 0; k <= n; k++) out.push({ geo: box(0.3, 0.1, ARM.w + 0.5), at: [-rl / 2 + (k * rl) / n, 0.03, 0] })
    return out
  }, [rl])
  useFrame(() => {
    const r = railNow(sim)
    if (ref.current) ref.current.position.set((r.x0 + r.x1) / 2, 0, r.z)
  })
  return (
    <group ref={ref}>
      <Body id={`rail-${rl.toFixed(3)}`} c={c} fill={c.surface} edge={c.edge} pieces={pieces} />
    </group>
  )
}

/** A two-link arm on a linear rail behind the board. Each link is one rigid body. */
export function Arm({ sim, c }: { sim: Sim; c: Tokens }) {
  const carriage = useRef<Group>(null)
  const turret = useRef<Group>(null)
  const shoulder = useRef<Group>(null)
  const elbow = useRef<Group>(null)
  const wrist = useRef<Group>(null)
  const fingers = useRef<(Group | null)[]>([])
  const [busy, setBusy] = useState(false)
  const { h0, l1, l2 } = ARM
  useFrame(() => {
    const w = sim.arm.pos
    const bx = sim.arm.baseX
    carriage.current!.position.x = bx
    const dx = w.x - bx, dz = w.z - sim.line.rail.z
    const yaw = Math.atan2(-dz, dx)
    const r = Math.max(Math.hypot(dx, dz), 0.001)
    const h = w.y - h0
    const d = clamp(Math.hypot(r, h), Math.abs(l1 - l2) + 0.05, l1 + l2 - 0.01)
    const phi = Math.atan2(h, r)
    const a = Math.acos(clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1))
    const t1 = phi + a
    const t2 = Math.atan2(h - l1 * Math.sin(t1), r - l1 * Math.cos(t1))
    turret.current!.rotation.y = yaw
    shoulder.current!.rotation.z = t1
    elbow.current!.rotation.z = t2 - t1
    wrist.current!.rotation.z = -t2
    const open = 0.36 - sim.arm.grip * 0.1
    fingers.current.forEach((f, i) => f && (f.position.z = (i ? 1 : -1) * open))
    const holding = !!sim.arm.holding
    if (holding !== busy) setBusy(holding)
  })
  const hi = busy ? c.accent : c.edge
  return (
    <group ref={carriage} position={[sim.arm.baseX, 0, sim.line.rail.z]}>
      <Body id="carriage" c={c} fill={c.surface} edge={c.edge} pieces={[{ geo: box(1.5, 0.3, ARM.w + 0.4), at: [0, 0.37, 0] }, { geo: cyl(ARM.base, ARM.base + 0.08, 0.3, 36), at: [0, 0.67, 0], threshold: 20 }]} />
      <group ref={turret} position={[0, 0.82, 0]}>
        <Body id="turret" c={c} fill={c.surface} edge={c.edge} pieces={[{ geo: cyl(0.36, 0.48, h0 - 0.82, 28), at: [0, (h0 - 0.82) / 2, 0], threshold: 20 }]} />
        <group ref={shoulder} position={[0, h0 - 0.82, 0]}>
          <Body id="upper" c={c} fill={c.surface} edge={c.edge} pieces={[{ geo: cyl(0.42, 0.42, 0.9, 28), rot: [Math.PI / 2, 0, 0], threshold: 20 }, { geo: box(l1, 0.3, 0.3), at: [l1 / 2, 0, 0.3] }, { geo: box(l1, 0.3, 0.3), at: [l1 / 2, 0, -0.3] }]} />
          <group ref={elbow} position={[l1, 0, 0]}>
            <Body id="fore" c={c} fill={c.surface} edge={c.edge} pieces={[{ geo: cyl(0.36, 0.36, 0.95, 28), rot: [Math.PI / 2, 0, 0], threshold: 20 }, { geo: box(l2, 0.34, 0.34), at: [l2 / 2, 0, 0] }]} />
            <group ref={wrist} position={[l2, 0, 0]}>
              <Body id="wrist" c={c} fill={c.surface} edge={c.edge} pieces={[{ geo: cyl(0.24, 0.24, 0.6, 20), rot: [Math.PI / 2, 0, 0], threshold: 20 }]} />
              <Body id={`grip-${busy}`} c={c} fill={c.surface} edge={hi} pieces={[{ geo: box(0.5, 0.3, 0.86), at: [0, -0.32, 0] }]} />
              {[0, 1].map((i) => (
                <group key={i} ref={(g) => { fingers.current[i] = g }}>
                  <Body id={`finger-${busy}`} c={c} fill={c.surface} edge={hi} pieces={[{ geo: box(0.36, 0.38, 0.06), at: [0, -0.62, 0] }]} />
                </group>
              ))}
            </group>
          </group>
        </group>
      </group>
    </group>
  )
}
