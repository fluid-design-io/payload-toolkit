import { useFrame } from '@react-three/fiber'
import { useLayoutEffect, useRef, useState } from 'react'
import { Matrix4, Vector3 } from 'three'
import type { InstancedMesh } from 'three'

import { keepAnimating } from '../../../../kit/busy'
import { play } from '../../../../kit/sound'
import type { SoundName } from '../../../../kit/sound'
import type { Path, Sim, Tokens, TransportProps } from '../../core/contract'
import { kick } from '../../core/jolt'
import { Body } from '../../core/scene'
import { fillMat, lineMat, reducedMotion } from '../../core/three'
import { Batch } from './fleet'
import type { Carrier, FleetSpec } from './fleet'
import { pitchOf, pose, useFleet, yawOf } from './kit'
import { carPieces, structure } from './monorail/build'
import { RIDE } from './monorail/course'
import type { Course, Cue } from './monorail/course'
import { Track, locate } from './track'
import { GAP } from './monorail.data'

const DOG = 0.36

const back = new Track([[RIDE.end, RIDE.y - RIDE.cup, RIDE.z], [RIDE.start, RIDE.y - RIDE.cup, RIDE.z]])
const SPEC: Omit<FleetSpec, 'length'> = { n: 7, speed: RIDE.lift, gap: GAP, back: back.len, spacing: 0.8, vmax: 3.2, accel: 4, dwell: 0.45 }

/** What a car does when it passes a cue: a sound, and a jolt scaled by its speed. */
const CUES: Record<Cue, { sound: SoundName; jolt?: (v: number) => number; hz?: number }> = {
  chain: { sound: 'servo' },
  crest: { sound: 'toss' },
  bottom: { sound: 'drawer', jolt: (v) => Math.min(0.95, v / 13), hz: 8 },
  land: { sound: 'pick', jolt: () => 0.22, hz: 15 },
  brake: { sound: 'zap', jolt: (v) => Math.min(0.5, v / 18), hz: 19 },
}

const m = new Matrix4()
const rail = new Vector3()
const up = new Vector3()
const tan = new Vector3()
const right = new Vector3()
const cup = new Vector3()
const other = new Vector3()
const dogAt = new Vector3()
const LEVEL = new Vector3(0, 1, 0)
const WEST = new Vector3(-1, 0, 0)

/** The car's rail point and banked frame at `s` along the part's path. */
function frameAt(course: Course, s: number) {
  const [i, f] = locate(course.cum, s)
  rail.lerpVectors(course.rail[i], course.rail[i + 1], f)
  tan.lerpVectors(course.tan[i], course.tan[i + 1], f).normalize()
  up.lerpVectors(course.up[i], course.up[i + 1], f)
  right.crossVectors(tan, up).normalize()
  up.crossVectors(right, tan).normalize()
}

/** The fleet of cars for one course; remounted when the course changes, so its spec never goes stale. */
function Cars({ sim, course, path, c }: { sim: Sim; course: Course; path: Path; c: Tokens }) {
  const [spec] = useState<FleetSpec>(() => ({ ...SPEC, length: path.length }))
  const [layers] = useState(() => {
    const p = carPieces()
    return {
      chassis: new Batch(p.chassis, SPEC.n, fillMat(c.accent, c.flat, c.rough), lineMat(c.edge)),
      cup: new Batch(p.cup, SPEC.n, fillMat(c.surface, c.flat, c.rough), lineMat(c.edge)),
    }
  })
  useLayoutEffect(() => {
    layers.chassis.skin(fillMat(c.accent, c.flat, c.rough), lineMat(c.edge))
    layers.cup.skin(fillMat(c.surface, c.flat, c.rough), lineMat(c.edge))
  }, [layers, c])

  const seen = useRef(new Float32Array(SPEC.n).fill(-1))
  const clack = useRef(new Float32Array(SPEC.n))
  const fleet = useFleet(sim, spec, layers, (car: Carrier, i) => {
    let s = -1
    if (car.state === 'back') {
      back.point(car.b, rail)
      clack.current[i] = 0
      tan.copy(WEST)
      up.copy(LEVEL)
      right.crossVectors(tan, up)
    } else {
      s = path.along(car.state === 'hold' ? path.length : car.u)
      frameAt(course, s)
      if (car.state === 'ride' && car.b < spec.back) {
        back.point(car.b, other)
        rail.lerp(other, Math.min(1, (spec.back - car.b) / spec.spacing))
      }
    }
    m.makeBasis(tan, up, right).setPosition(rail)
    layers.chassis.set(i, m)
    cup.copy(rail).addScaledVector(up, RIDE.cup)
    layers.cup.set(i, pose(m, cup, yawOf(tan)))

    const was = seen.current[i]
    seen.current[i] = s
    if (car.state !== 'ride' || was < 0 || s <= was) return
    for (const b of course.beats) {
      if (b.s <= was || b.s > s) continue
      const cue = CUES[b.cue]
      play(cue.sound)
      if (cue.jolt) kick(cue.jolt(b.v), cue.hz)
    }
    const [k] = locate(course.cum, s)
    if (course.kind[k] === 'lift' && s - clack.current[i] > 0.45) {
      clack.current[i] = s
      play('tick')
    }
  }, {})
  useFrame(() => {
    if (fleet.moving) keepAnimating()
  })
  return (
    <>
      <primitive object={layers.chassis.mesh} />
      <primitive object={layers.chassis.lines!} />
      <primitive object={layers.cup.mesh} />
      <primitive object={layers.cup.lines!} />
    </>
  )
}

export function Monorail({ sim, line, c }: TransportProps<Course>) {
  const course = line.path.data
  const built = structure(course)
  const id = `monorail-${course.len.toFixed(3)}`
  const lift = new Track(built.lift)
  const dogs = Math.floor(lift.len / DOG)

  const chain = useRef<InstancedMesh>(null)
  const laid = useRef('')
  useFrame(({ clock }) => {
    const mesh = chain.current
    if (!mesh || (reducedMotion && laid.current === id)) return
    laid.current = id
    const offset = reducedMotion ? 0 : (clock.elapsedTime * RIDE.lift) % DOG
    for (let i = 0; i < dogs; i++) {
      const d = i * DOG + offset
      lift.point(d, dogAt)
      lift.tangent(d, tan)
      dogAt.addScaledVector(LEVEL, -0.05)
      mesh.setMatrixAt(i, pose(m, dogAt, yawOf(tan), pitchOf(tan)))
    }
    mesh.instanceMatrix.needsUpdate = true
  })

  return (
    <group>
      <Body id={id} c={c} fill={c.surface} edge={c.edge} pieces={built.frame} />
      <Body id={`${id}-rails`} c={c} fill={c.pin} edge={c.edge} pieces={built.rails} />
      <Body id={`${id}-accent`} c={c} fill={c.accent} edge={c.edge} pieces={built.accent} />
      <instancedMesh key={`${id}-chain`} ref={chain} args={[undefined, undefined, dogs]} material={fillMat(c.accent, true)} frustumCulled={false}>
        <boxGeometry args={[0.1, 0.05, 0.16]} />
      </instancedMesh>
      <Cars key={`${id}-cars`} sim={sim} course={course} path={line.path} c={c} />
    </group>
  )
}

