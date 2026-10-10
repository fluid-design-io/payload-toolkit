import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { Vector3 } from 'three'
import type { Group } from 'three'

import type { IntegratorProps, IntegratorVariant } from '../../core/contract'
import { useSimEvents } from '../../core/scene'
import { Glows } from '../../fx/glow'
import { isDark } from '../../fx/heat'
import { Smoke } from '../../fx/smoke'
import { Drone } from './drone'
import { Hexapod } from './hexapod'
import { Marks } from './marks'
import type { Log } from './marks'
import type { Report } from './report'
import { backlog, machineOf, surfaceOf, workTime } from './script'

/**
 * The agent's own machine: Claude's solder drone, Codex's laser hexapod, or
 * nothing without an agent. The marks they leave stay on the chips after
 * the agent changes; the glows and smoke are shared by machine and marks.
 */
function Machines(props: IntegratorProps) {
  const { agent, sim, board, c } = props
  const log = useMemo<Log>(() => new Map(), [])
  const fx = useMemo(() => ({ glows: new Glows(400), smoke: new Smoke(64, c.muted, 0.22) }), [])
  useEffect(() => () => { fx.glows.dispose(); fx.smoke.dispose() }, [fx])
  const surface = useMemo(() => surfaceOf(board), [board])
  const frame = useRef<Group>(null)
  const report = useMemo<Report>(() => ({ phase: 'parked', at: new Vector3(), beads: 0, strokes: 0, next: 0, w: new Vector3() }), [])
  const { gl, camera, size } = useThree()
  useSimEvents(sim, (e) => {
    if (e.kind === 'work') {
      const m = machineOf(sim.agent)
      const job = sim.work.job
      if (!m) return
      const dur = job?.part === e.part ? job.dur : workTime(sim.agent, e.part)
      const t = job?.part === e.part ? job.t : 0
      log.set(e.part, { machine: m, start: sim.time - t * dur, dur })
    } else if (e.kind === 'toss' || e.kind === 'seat') log.delete(e.part)
  })
  useFrame((_, dt) => {
    backlog.waiting = sim.work.queue.length
    const dark = isDark(c)
    fx.glows.setGlow(dark)
    fx.smoke.setColor(c.muted)
    fx.smoke.step(Math.min(dt, 0.05))
    fx.glows.end()
    fx.glows.begin()
    if (sim.time < report.next || !frame.current) return
    report.next = sim.time + 0.2
    const w = frame.current.localToWorld(report.w.copy(report.at)).project(camera)
    gl.domElement.dataset.integrator = JSON.stringify({ machine: machineOf(agent), phase: report.phase, beads: report.beads, strokes: report.strokes, px: [Math.round(((w.x + 1) / 2) * size.width), Math.round(((1 - w.y) / 2) * size.height)] })
  })
  const m = machineOf(agent)
  const shared = { ...props, surface, glows: fx.glows, smoke: fx.smoke, report }
  return (
    <group ref={frame}>
      <Marks sim={sim} log={log} c={c} glows={fx.glows} report={report} />
      {m === 'drone' && <Drone {...shared} />}
      {m === 'hexapod' && <Hexapod {...shared} />}
      <primitive object={fx.smoke.object} />
      <primitive object={fx.glows.object} />
    </group>
  )
}

export const machines: IntegratorVariant = {
  id: 'machines',
  label: 'Drone · hexapod',
  workTime,
  Component: Machines,
}
