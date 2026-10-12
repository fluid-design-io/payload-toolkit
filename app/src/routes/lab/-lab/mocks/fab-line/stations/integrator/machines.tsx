import { useFrame } from '@react-three/fiber'
import { useLayoutEffect, useRef } from 'react'
import { Vector3 } from 'three'
import type { Group } from 'three'

import { keepAnimating } from '../../../../kit/busy'
import type { IntegratorProps } from '../../core/contract'
import { useSimEvents } from '../../core/scene'
import { useDisposable } from '../../core/three'
import { Glows } from '../../fx/glow'
import { isDark } from '../../fx/heat'
import { Smoke } from '../../fx/smoke'
import { Drone } from './drone'
import { Hexapod } from './hexapod'
import { Marks } from './marks'
import type { Log } from './marks'
import type { Report } from './report'
import { backlog, machineOf, surfaceOf, workTime } from './script'

/** Seconds the last marks glow after a job: beads and etch cool as exp(-age / 1.5). */
const COOL = 4.5

/**
 * The agent's own machine: Claude's solder drone, Codex's laser hexapod, or
 * nothing without an agent. The marks they leave stay on the chips after
 * the agent changes; the glows and smoke are shared by machine and marks.
 */
export function Machines(props: IntegratorProps) {
  const { agent, sim, board, c } = props
  const logRef = useRef<Log>(new Map())
  const fx = useDisposable(() => ({ glows: new Glows(400), smoke: new Smoke(64, c.muted, 0.22) }), [])
  useLayoutEffect(() => {
    fx.glows.setGlow(isDark(c))
    fx.smoke.setColor(c.muted)
  }, [fx, c])
  const surface = surfaceOf(board)
  const frame = useRef<Group>(null)
  const reportRef = useRef<Report>({ phase: 'parked', moving: false, at: new Vector3(), beads: 0, strokes: 0, next: 0, w: new Vector3() })
  const doneAt = useRef(-Infinity)
  useSimEvents(sim, (e) => {
    if (e.kind === 'work') {
      const m = machineOf(sim.agent)
      const job = sim.work.job
      if (!m) return
      const dur = job?.part === e.part ? job.dur : workTime(sim.agent, e.part)
      const t = job?.part === e.part ? job.t : 0
      logRef.current.set(e.part, { machine: m, start: sim.time - t * dur, dur })
    } else if (e.kind === 'done') doneAt.current = sim.time
    else if (e.kind === 'toss' || e.kind === 'seat') logRef.current.delete(e.part)
  })
  useFrame(({ gl, camera, size }, dt) => {
    backlog.waiting = sim.work.queue.length
    fx.smoke.step(Math.min(dt, 0.05))
    fx.glows.end()
    fx.glows.begin()
    const report = reportRef.current
    if ((machineOf(sim.agent) && report.moving) || fx.smoke.busy || sim.time - doneAt.current < COOL) keepAnimating()
    if (sim.time < report.next || !frame.current) return
    report.next = sim.time + 0.2
    const w = frame.current.localToWorld(report.w.copy(report.at)).project(camera)
    gl.domElement.dataset.integrator = JSON.stringify({ machine: machineOf(agent), phase: report.phase, beads: report.beads, strokes: report.strokes, px: [Math.round(((w.x + 1) / 2) * size.width), Math.round(((1 - w.y) / 2) * size.height)] })
  })
  const m = machineOf(agent)
  const shared = { ...props, surface, glows: fx.glows, smoke: fx.smoke, reportRef }
  return (
    <group ref={frame}>
      <Marks sim={sim} logRef={logRef} c={c} glows={fx.glows} reportRef={reportRef} />
      {m === 'drone' && <Drone {...shared} />}
      {m === 'hexapod' && <Hexapod {...shared} />}
      <primitive object={fx.smoke.object} />
      <primitive object={fx.glows.object} />
    </group>
  )
}
