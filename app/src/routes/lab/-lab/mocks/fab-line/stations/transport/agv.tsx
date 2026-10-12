import { useFrame } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { BoxGeometry, Color, DynamicDrawUsage, InstancedMesh, Matrix4, SphereGeometry, Vector3 } from 'three'

import { keepAnimating } from '../../../../kit/busy'
import { play } from '../../../../kit/sound'
import type { Tokens, TransportProps } from '../../core/contract'
import { kick } from '../../core/jolt'
import { Body } from '../../core/scene'
import { clamp, damp, fillMat, lineMat, patch, reducedMotion, useDisposable } from '../../core/three'
import { Batch, Fleet, hidden, tintMat } from './fleet'
import type { FleetEvents, FleetSpec } from './fleet'
import { pose, yawOf } from './kit'
import { DECK, DRIVE, GAP, depot } from './agv/route'
import type { Plan } from './agv/route'
import { ROBOT, art as artOf, lamps, structure } from './agv/scenery'

/**
 * AGV shuttles on a long errand round the campus (see `agv/route.ts`). Each
 * part rides a little floor robot whose deck stays level and square while
 * the chassis pitches up the helix, dives under hard braking and rocks over
 * speed bumps; its pennant streams back on the sprints and its lamps go
 * brake red, charge amber or cruise green. Bumps and the lift's landing
 * jolt the scene lightly.
 */
const SPACING = 1.05
/** Robots in the fleet: enough for a long convoy, fewer than the depot holds so the idle queue leaves its far rows clear. */
const N = Math.min(16, Math.floor(depot.len / SPACING) + 1)

const streakMat = (c: Tokens) => fillMat(c.edge, true, 1, { transparent: true, opacity: 0.55 })
const events: FleetEvents = { depart: () => play('servo'), arrive: () => play('page') }

function gpuOf(c: Tokens) {
  const tints = { flat: tintMat(true), lit: tintMat(false) }
  const fill = fillMat(c.surface, c.flat, c.rough), edge = lineMat(c.edge)
  const robots = {
    chassis: new Batch(ROBOT.chassis(), N, fill, edge),
    deck: new Batch(ROBOT.deck(), N, fillMat(c.dim, c.flat, c.rough), null),
    lamps: new Batch(ROBOT.lamps(), N, c.flat ? tints.flat : tints.lit, null),
    flag: new Batch(ROBOT.flag(), N, fillMat(c.claude, c.flat, c.rough), null),
    pad: new Batch(ROBOT.pad(), N + 1, fillMat(c.dim, c.flat, c.rough), null),
  }
  const white = new Color(1, 1, 1)
  for (let i = 0; i < N; i++) robots.lamps.color(i, white)
  const streaks = new InstancedMesh(new BoxGeometry(1, 0.01, 0.01).translate(-0.5, 0, 0), streakMat(c), N * 2)
  streaks.instanceMatrix.setUsage(DynamicDrawUsage)
  streaks.frustumCulled = false
  const signals = new InstancedMesh(new SphereGeometry(0.075, 14, 10), c.flat ? tints.flat : tints.lit, 4)
  signals.frustumCulled = false
  for (let i = 0; i < 4; i++) signals.setColorAt(i, white)
  const batches = Object.values(robots)
  return {
    ...robots,
    streaks,
    signals,
    skin(t: Tokens) {
      const f = fillMat(t.surface, t.flat, t.rough), e = lineMat(t.edge), tint = t.flat ? tints.flat : tints.lit
      robots.chassis.skin(f, e)
      robots.deck.skin(fillMat(t.dim, t.flat, t.rough))
      robots.pad.skin(fillMat(t.dim, t.flat, t.rough))
      robots.lamps.skin(tint)
      robots.flag.skin(fillMat(t.claude, t.flat, t.rough))
      streaks.material = streakMat(t)
      signals.material = tint
    },
    /** Stands the traffic light's and the charger's lamps where the route puts them. */
    post(bulbs: Vector3[]) {
      for (let i = 0; i < 4; i++) signals.setMatrixAt(i, local.makeTranslation(bulbs[i].x, bulbs[i].y, bulbs[i].z))
      signals.instanceMatrix.needsUpdate = true
    },
    /** Uploads this frame's poses and colours; the streak draw and its upload are skipped while no robot sprints. */
    commit(streaking: boolean) {
      for (const b of batches) b.commit()
      patch(streaks, { visible: streaking })
      if (streaking) streaks.instanceMatrix.needsUpdate = true
      if (signals.instanceColor) signals.instanceColor.needsUpdate = true
    },
    dispose() {
      for (const b of batches) b.dispose()
      streaks.geometry.dispose()
      streaks.dispose()
      signals.geometry.dispose()
      signals.dispose()
      tints.flat.dispose()
      tints.lit.dispose()
    },
  }
}

/** Per-robot motion the frame loop integrates: heading, speed, acceleration, the body's lean and the pennant's swing. */
function crewOf() {
  const f = () => new Float32Array(N)
  const spec: FleetSpec = { n: N, length: 1, speed: DRIVE.min, gap: GAP, back: depot.len, spacing: SPACING, vmax: 3.4, accel: 6, dwell: 0.3 }
  return {
    spec, fleet: new Fleet(spec),
    yaw: f(), v: f(), a: f(), lean: f(), leanV: f(), flag: f(), flagV: f(),
    prev: new Float32Array(N * 3), seen: new Uint8Array(N), s: f().fill(-1),
    green: -10, kicked: -10,
  }
}

const at = new Vector3(), ahead = new Vector3(), behind = new Vector3(), tan = new Vector3(), other = new Vector3()
const m = new Matrix4(), local = new Matrix4(), out = new Matrix4()

export function Agv({ sim, line, c }: TransportProps<Plan>) {
  const plan = line.path.data
  const art = useDisposable(() => artOf(plan), [plan])
  const [gpu] = useState(() => gpuOf(c))
  useEffect(() => () => gpu.dispose(), [gpu])
  useLayoutEffect(() => gpu.skin(c), [gpu, c])
  useLayoutEffect(() => gpu.post(lamps(plan)), [gpu, plan])
  // The fleet and its per-robot motion live only in the frame loop.
  const crewRef = useRef<ReturnType<typeof crewOf> | null>(null)
  const tone = { go: new Color(c.led), stop: new Color(c.claude), amber: new Color(c.gold), off: new Color(c.ledOff), dim: new Color(c.dim) }

  useFrame(({ clock }, delta) => {
    const path = line.path
    if (!path) return
    if (!crewRef.current) crewRef.current = crewOf()
    const crew = crewRef.current
    const dt = Math.min(delta, 0.1), spring = Math.min(dt, 0.04), now = clock.elapsedTime
    crew.spec.length = path.length
    crew.fleet.step(sim.carried, dt, events)
    let charging = false, padTop = false, streaking = false
    const cars = crew.fleet.carriers
    for (let i = 0; i < cars.length; i++) {
      const car = cars[i]
      let pitch = 0, s = -1, lifting = false
      if (car.state === 'back') {
        depot.point(car.b, at)
        crew.yaw[i] = yawOf(depot.tangent(car.b, tan))
      } else {
        const u = car.state === 'hold' ? path.length : car.u
        s = path.along(u)
        path.at(u, at)
        tan.subVectors(path.at(Math.min(path.length, u + 0.08), ahead), path.at(Math.max(0, u - 0.08), behind))
        const h = Math.hypot(tan.x, tan.z)
        if (h > 0.03) crew.yaw[i] = yawOf(tan)
        lifting = !!plan && s > plan.lift.s0 - 0.2 && s < plan.lift.s1 + 0.2
        if (!lifting && h > 0.03) pitch = clamp(Math.atan2(tan.y, h), -0.5, 0.5)
        at.y -= DECK
        if (car.state === 'ride' && car.b < crew.spec.back) at.lerp(depot.point(car.b, other), Math.min(1, (crew.spec.back - car.b) / SPACING))
      }
      const was = crew.s[i]
      if (plan && car.state === 'ride' && was >= 0) {
        for (const b of plan.bumps) {
          if (was >= b.s || s < b.s) continue
          crew.leanV[i] += 3
          crew.flagV[i] -= 6
          play('tick')
          if (now - crew.kicked > 0.3) {
            kick(0.035 + 0.035 * Math.min(1, crew.v[i] / DRIVE.top), 18)
            crew.kicked = now
          }
        }
        if (was < plan.lift.s1 && s >= plan.lift.s1) {
          kick(0.09, 8)
          play('drawer')
        }
        if (was < plan.light.s && s >= plan.light.s) crew.green = now + 1.1
      }
      crew.s[i] = s
      const charge = !!plan && s > plan.charger.s0 && s < plan.charger.s1
      if (charge) charging = true

      const k = i * 3
      if (crew.seen[i] && dt > 0) {
        const v0 = crew.v[i]
        const v = Math.min(14, Math.hypot(at.x - crew.prev[k], at.y - crew.prev[k + 1], at.z - crew.prev[k + 2]) / dt)
        crew.v[i] += (v - v0) * damp(dt, 14)
        crew.a[i] += ((crew.v[i] - v0) / dt - crew.a[i]) * damp(dt, 10)
      }
      crew.seen[i] = 1
      crew.prev[k] = at.x
      crew.prev[k + 1] = at.y
      crew.prev[k + 2] = at.z
      if (!reducedMotion) {
        const dive = clamp(crew.a[i] * 0.011, -0.15, 0.09)
        crew.leanV[i] += ((dive - crew.lean[i]) * 160 - crew.leanV[i] * 14) * spring
        crew.lean[i] += crew.leanV[i] * spring
        const wind = Math.min(0.75, crew.v[i] * 0.075)
        crew.flagV[i] += ((wind - crew.flag[i]) * 70 - crew.flagV[i] * 5 + crew.a[i] * 0.8) * spring
        crew.flag[i] += crew.flagV[i] * spring
      }

      pose(m, at, crew.yaw[i], pitch + crew.lean[i])
      gpu.chassis.set(i, m)
      gpu.lamps.set(i, m)
      gpu.flag.set(i, out.multiplyMatrices(m, local.makeRotationZ(crew.flag[i]).setPosition(ROBOT.flagFoot)))
      gpu.deck.set(i, pose(local, at))
      const lamp = car.state === 'back' ? (car.docked ? tone.off : tone.go) : crew.a[i] < -4 ? tone.stop : lifting || charge ? tone.amber : tone.go
      gpu.lamps.color(i, lamp)

      const run = reducedMotion ? 0 : clamp((crew.v[i] - 4.8) / 4, 0, 1)
      if (run >= 0.02) streaking = true
      for (let s = 0; s < 2; s++) {
        if (run < 0.02) gpu.streaks.setMatrixAt(i * 2 + s, hidden)
        else gpu.streaks.setMatrixAt(i * 2 + s, out.multiplyMatrices(m, local.makeScale(run * 1.6, 1, 1).setPosition(-0.46, 0.2, s ? 0.34 : -0.34)))
      }

      if (s >= plan.lift.s0 - 0.5 && s <= plan.lift.s1 + 0.6) {
        const y = clamp(at.y, plan.lift.bottom, plan.lift.top)
        if (y > plan.lift.top - 0.05) padTop = true
        gpu.pad.set(i, local.makeTranslation(plan.lift.x, y, plan.lift.z))
      } else gpu.pad.set(i, hidden)
    }
    gpu.pad.set(N, !padTop ? local.makeTranslation(plan.lift.x, plan.lift.top, plan.lift.z) : hidden)

    const green = now < crew.green, amber = !green && now < crew.green + 0.5
    gpu.signals.setColorAt(0, green || amber ? tone.dim : tone.stop)
    gpu.signals.setColorAt(1, amber ? tone.amber : tone.dim)
    gpu.signals.setColorAt(2, green ? tone.go : tone.dim)
    gpu.signals.setColorAt(3, charging ? tone.amber : tone.dim)
    gpu.commit(streaking)
    let moving = crew.fleet.moving || amber || green
    for (let i = 0; i < cars.length && !moving; i++) moving = crew.v[i] > 0.05 || Math.abs(crew.leanV[i]) > 1e-2 || Math.abs(crew.flagV[i]) > 1e-2
    if (moving) keepAnimating()
  })

  const id = `agv-${plan.len.toFixed(4)}`
  return (
    <group>
      <Body id={id} c={c} fill={c.surface} edge={c.edge} pieces={structure(plan)} />
      <mesh geometry={art.hazards} material={fillMat(c.claude, c.flat, c.rough)} />
      <lineSegments geometry={art.paint} material={lineMat(c.edge, 0.6)} />
      <primitive object={gpu.chassis.mesh} />
      <primitive object={gpu.chassis.lines!} />
      <primitive object={gpu.deck.mesh} />
      <primitive object={gpu.lamps.mesh} />
      <primitive object={gpu.flag.mesh} />
      <primitive object={gpu.pad.mesh} />
      <primitive object={gpu.streaks} />
      <primitive object={gpu.signals} />
    </group>
  )
}

