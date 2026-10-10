import { useFrame } from '@react-three/fiber'
import { Line } from '@react-three/drei'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Vector3 } from 'three'
import type { Mesh, MeshBasicMaterial } from 'three'

import type { Agent } from '@/routes/workspace/-workspace/workspace.types'
import type { IntegratorProps, IntegratorVariant, Part, Sim, Tokens } from '../../core/contract'
import { makeRoute } from '../../core/route'
import { Body, TraceLine, pickable, useDrop } from '../../core/scene'
import { FONT, MONO, box, lineMat, segs, textTexture } from '../../core/three'

type V3 = [number, number, number]

/** The pod and clip card art. */
function probeArt(agent: Agent, k: Tokens) {
  return textTexture(512, 320, (ctx) => {
    if (agent === 'claude') {
      ctx.fillStyle = k.claude
      ctx.fillRect(0, 0, 512, 320)
      ctx.strokeStyle = k.claudeInk
      ctx.lineWidth = 12
      ctx.lineCap = 'round'
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2
        ctx.beginPath()
        ctx.moveTo(130 + Math.cos(a) * 18, 160 + Math.sin(a) * 18)
        ctx.lineTo(130 + Math.cos(a) * (i % 2 ? 60 : 78), 160 + Math.sin(a) * (i % 2 ? 60 : 78))
        ctx.stroke()
      }
      ctx.fillStyle = k.claudeInk
      ctx.font = `700 46px ${FONT}`
      ctx.fillText('Claude', 236, 150)
      ctx.font = `500 30px ${MONO}`
      ctx.fillText('JTAG · debug', 236, 198)
    } else {
      ctx.fillStyle = k.codex
      ctx.fillRect(0, 0, 512, 320)
      ctx.strokeStyle = k.codexInk
      ctx.lineWidth = 10
      ctx.beginPath(); ctx.moveTo(70, 110); ctx.lineTo(120, 160); ctx.lineTo(70, 210); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(140, 214); ctx.lineTo(210, 214); ctx.stroke()
      ctx.fillStyle = k.codexInk
      ctx.font = `700 46px ${FONT}`
      ctx.fillText('Codex', 250, 150)
      ctx.font = `500 30px ${MONO}`
      ctx.fillText('ISP flasher', 250, 198)
    }
  })
}

/** A debug probe clipped to the board's J1 header; it blinks while it flashes a seated chip. */
function Probe({ agent, sim, board, c, onCycle, tip, guard }: IntegratorProps) {
  const [hx, by, hz] = board.dock
  const HEADER = { x: hx, z: hz }
  const BY = by
  const edge = hz + 0.75
  const led = useRef<Mesh>(null)
  const art = useMemo(() => (agent === 'none' ? null : probeArt(agent, c)), [agent, c])
  useEffect(() => () => art?.dispose(), [art])
  const [pod, drop] = useDrop(2, 6)
  useFrame(({ clock }) => {
    if (led.current) {
      const busy = !!sim.work.job
      const m = led.current.material as MeshBasicMaterial
      m.color.set(busy ? (Math.sin(clock.elapsedTime * 15) > 0 ? c.ledBusy : c.ledOff) : c.led)
    }
  })
  const h = pickable(tip, guard, agent === 'none' ? 'J1 debug header' : `${agent === 'claude' ? 'Claude Code' : 'Codex'} probe`, 'Agent · click to clip on a different probe', () => { drop.current = 1.6; onCycle() })
  const pins = useMemo(() => {
    const l: number[] = []
    for (let i = 0; i < 5; i++) for (const r of [-0.12, 0.12]) l.push(HEADER.x - 0.3 + i * 0.15, BY, HEADER.z + r, HEADER.x - 0.3 + i * 0.15, BY + 0.3, HEADER.z + r)
    return segs(l)
  }, [HEADER.x, HEADER.z, BY])
  const podPos: V3 = [HEADER.x + 0.4, 0.5, edge + 1.9]
  const clip: V3 = [HEADER.x, BY + 0.42, HEADER.z]
  const claude = agent === 'claude'
  return (
    <group {...h}>
      <Body id="header" c={c} fill={c.body} edge={c.bodyEdge} pieces={[{ geo: box(0.85, 0.12, 0.42), at: [HEADER.x, BY + 0.06, HEADER.z] }]} />
      <lineSegments geometry={pins} material={lineMat(c.gold)} />
      {agent !== 'none' && (
        <group ref={pod}>
          {claude ? (
            <>
              <Body id="clip-c" c={c} fill={c.claude} edge={c.claudeEdge} pieces={[{ geo: box(0.95, 0.24, 0.5), at: clip }]} />
              <Line points={[clip, [clip[0], clip[1] + 0.6, clip[2] + 0.4], [podPos[0], podPos[1] + 0.9, podPos[2] - 0.8], [podPos[0], podPos[1] + 0.2, podPos[2] - 0.55]]} color={c.claudeCable} lineWidth={7} />
              <Body id="pod-c" c={c} fill={c.claude} edge={c.claudeEdge} pieces={[{ geo: box(1.9, 0.45, 1.1), at: podPos }]} />
            </>
          ) : (
            <>
              <Body id="clip-x" c={c} fill={c.codex} edge={c.codexInk} pieces={[{ geo: box(1.0, 0.16, 0.9), at: [HEADER.x, BY + 0.5, HEADER.z + 0.2] }, { geo: box(1.0, 0.75, 0.12), at: [HEADER.x, BY + 0.1, edge + 0.08] }, { geo: box(1.0, 0.12, 0.9), at: [HEADER.x, BY - 0.24, HEADER.z + 0.2] }]} />
              <Line points={[[HEADER.x, BY + 0.58, HEADER.z + 0.6], [HEADER.x, BY + 1.3, edge + 0.8], [podPos[0], podPos[1] + 0.5, podPos[2] - 0.6]]} color={c.codexCable} lineWidth={4} />
              <Body id="pod-x" c={c} fill={c.codex} edge={c.codexInk} pieces={[{ geo: box(1.6, 0.35, 1.0), at: podPos }]} />
            </>
          )}
          <mesh position={[podPos[0], podPos[1] + (claude ? 0.226 : 0.176), podPos[2]]} rotation-x={-Math.PI / 2}>
            <planeGeometry args={claude ? [1.85, 1.06] : [1.55, 0.96]} />
            <meshBasicMaterial map={art} toneMapped={false} />
          </mesh>
          <mesh ref={led} position={[podPos[0] + 0.75, podPos[1] + 0.26, podPos[2] + 0.4]}>
            <sphereGeometry args={[0.07, 10, 10]} />
            <meshBasicMaterial color={c.led} toneMapped={false} />
          </mesh>
        </group>
      )}
      <mesh position={[HEADER.x, BY + 0.2, HEADER.z + 0.5]} visible={false}>
        <boxGeometry args={[1.4, 0.8, 2.2]} />
      </mesh>
    </group>
  )
}
/** The flash itself: a trace that runs from the header to the chip being worked. */
function Flash({ sim, agent, c, dock }: { sim: Sim; agent: Agent; c: Tokens; dock: V3 }) {
  const [part, setPart] = useState<Part | null>(null)
  useFrame(() => {
    const p = sim.work.job?.part ?? null
    if (p !== part) setPart(p)
  })
  const route = useMemo(() => {
    if (!part?.slot) return null
    const y = dock[1] + 0.35
    const s = part.slot
    return makeRoute([new Vector3(dock[0], y, dock[2]), new Vector3(dock[0], y, s.z), new Vector3(s.x, y, s.z)], 'manhattan', [])
  }, [part, dock])
  if (!route) return null
  return <TraceLine route={route} color={agent === 'codex' ? c.codexInk : c.claude} width={2.4} progress={() => sim.work.job?.t ?? 0} />
}

function ProbeStation(props: IntegratorProps) {
  return (
    <>
      <Probe key={props.agent} {...props} />
      <Flash sim={props.sim} agent={props.agent} c={props.c} dock={props.board.dock} />
    </>
  )
}

export const probe: IntegratorVariant = {
  id: 'probe',
  label: 'Debug probe',
  workTime: (agent) => (agent === 'none' ? 0 : 1.1),
  Component: ProbeStation,
}
