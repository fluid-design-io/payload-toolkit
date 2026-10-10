import { useEffect, useMemo, useRef } from 'react'
import type { JSX } from 'react'
import { useFrame } from '@react-three/fiber'
import { BufferAttribute, BufferGeometry, Color } from 'three'
import type { Group } from 'three'

import type { Lab } from '../../../lab.types'
import { BOARD, BRAND, BY, CELL, CPU, CPU_HALF, MEM, MEM_HALF, SLOTS, machine, tracePath } from '../sim'
import type { Sim } from '../sim'
import { FONT, Flat, Hairline, MONO, Solid, hover, textTexture, useTexture } from './hairline'
import type { Guard, Look, Tip } from './hairline'

type Fw = Lab['setup']['framework']
type Db = Lab['setup']['database']
type Built = ReturnType<Hairline['build']>

const RINGS = [1.9, 2.8, 3.65]
const PIN_Y = BY + 0.01
const DISC = CPU_HALF.tanstack.w - 0.05
const MEM_A = Math.atan2(MEM.tanstack.z - CELL.z, MEM.tanstack.x - CELL.x)
/** Yaw that turns the module's +z face toward the board centre on the round cell. */
const MEM_YAW: Record<Fw, number> = { next: 0, tanstack: Math.atan2(-Math.cos(MEM_A), -Math.sin(MEM_A)) }
const SILK_A = (Math.PI * 3) / 4
const SILK: Record<Fw, { at: [number, number, number]; rot: [number, number, number] }> = {
  next: { at: [CELL.x - BOARD.w / 2 + 1.2, BY + 0.004, CELL.z + BOARD.d / 2 - 0.12], rot: [-Math.PI / 2, 0, 0] },
  tanstack: { at: [CELL.x + Math.cos(SILK_A) * 4.1, BY + 0.004, CELL.z + Math.sin(SILK_A) * 4.1], rot: [-Math.PI / 2, 0, Math.PI / 2 - SILK_A] },
}

/** Solid memoizes on the build function, so each variant needs one stable reference. */
const per = (f: (fw: Fw) => Built): Record<Fw, () => Built> => ({ next: () => f('next'), tanstack: () => f('tanstack') })

const SLAB = per((fw) => {
  const h = new Hairline()
  if (fw === 'next') {
    h.box(BOARD.w, BY, BOARD.d, CELL.x, BY / 2, CELL.z)
    const { x, z } = CPU.next
    const { w, d } = CPU_HALF.next
    for (let k = 0; k < 9; k++) {
      const px = x - 1 + k * 0.25
      for (const s of [-1, 1]) h.seg(px, PIN_Y, z + s * (d + 0.03), px, PIN_Y, z + s * (d + 0.18))
    }
    for (let k = 0; k < 7; k++) {
      const pz = z - 0.75 + k * 0.25
      for (const s of [-1, 1]) h.seg(x + s * (w + 0.03), PIN_Y, pz, x + s * (w + 0.18), PIN_Y, pz)
    }
  } else {
    h.cyl(BOARD.r, BOARD.r, BY, CELL.x, BY / 2, CELL.z, 128)
    for (let k = 0; k < 28; k++) {
      const a = (k / 28) * Math.PI * 2
      const cs = Math.cos(a), sn = Math.sin(a)
      h.seg(CELL.x + cs * (DISC + 0.03), PIN_Y, CELL.z + sn * (DISC + 0.03), CELL.x + cs * (DISC + 0.17), PIN_Y, CELL.z + sn * (DISC + 0.17))
    }
  }
  return h.build()
})

const MARKS = per((fw) => {
  const h = new Hairline()
  for (const s of SLOTS[fw]) {
    const cs = Math.cos(s.yaw), sn = Math.sin(s.yaw)
    const at = (lx: number, lz: number) => [s.x + lx * cs + lz * sn, BY + 0.01, s.z - lx * sn + lz * cs] as const
    h.poly([at(-0.48, -0.36), at(0.48, -0.36), at(0.48, 0.36), at(-0.48, 0.36)], true)
  }
  if (fw === 'next')
    for (const sx of [-1, 1])
      for (const sz of [-1, 1]) h.circle(CELL.x + sx * (BOARD.w / 2 - 0.12), BY + 0.008, CELL.z + sz * (BOARD.d / 2 - 0.12), 0.08, 20)
  else for (const r of RINGS) h.circle(CELL.x, BY + 0.008, CELL.z, r, 120, true)
  return h.build()
})

const CHIP = per((fw) =>
  fw === 'next'
    ? new Hairline().box(CPU_HALF.next.w * 2, 0.28, CPU_HALF.next.d * 2, 0, 0.14, 0).build()
    : new Hairline().cyl(DISC, DISC, 0.28, 0, 0.14, 0, 64).circle(0, 0.281, 0, DISC - 0.06, 64).build(),
)

const SOCKET = () => {
  const h = new Hairline().box(MEM_HALF.w * 2, 0.12, 0.3, 0, 0.06, 0)
  for (const s of [-1, 1]) h.box(0.1, 0.26, 0.34, s * (MEM_HALF.w - 0.05), 0.13, 0)
  for (let k = 0; k < 38; k++) {
    const x = -0.74 + k * 0.04
    h.seg(x, 0.002, 0.2, x, 0.002, MEM_HALF.d - 0.08)
  }
  return h.build()
}

const MODULE: Record<Db, () => Built> = {
  postgres: () => {
    const h = new Hairline().box(1.5, 0.9, 0.05, 0, 0.5, 0)
    for (let k = 0; k < 29; k++) {
      const x = -0.7 + k * 0.05
      h.seg(x, 0.13, 0.027, x, 0.2, 0.027)
    }
    return h.build()
  },
  mongodb: () => {
    const h = new Hairline()
    for (let k = 0; k < 3; k++) h.box(1.3 - k * 0.08, 0.1, 0.8 - k * 0.08, 0, 0.17 + k * 0.13, 0)
    return h.build()
  },
}

function cpuArt(framework: Fw) {
  if (framework === 'next')
    return textTexture(512, 512, (ctx) => {
      ctx.fillStyle = '#0A0B0C'
      ctx.fillRect(0, 0, 512, 512)
      ctx.strokeStyle = 'rgba(255,255,255,0.06)'
      ctx.lineWidth = 1
      for (let i = 0; i < 512; i += 16) {
        ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 512); ctx.stroke()
        ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(512, i); ctx.stroke()
      }
      ctx.strokeStyle = 'rgba(255,255,255,0.22)'
      ctx.lineWidth = 2
      ctx.strokeRect(28, 28, 456, 456)
      ctx.fillStyle = '#FFFFFF'
      ctx.beginPath()
      ctx.moveTo(52, 70); ctx.lineTo(70, 40); ctx.lineTo(88, 70); ctx.closePath()
      ctx.fill()
      const cx = 256, cy = 236, r = 124
      ctx.strokeStyle = '#FFFFFF'
      ctx.lineWidth = 6
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke()
      ctx.lineWidth = 16
      ctx.lineCap = 'butt'
      ctx.beginPath(); ctx.moveTo(cx - 48, cy + 62); ctx.lineTo(cx - 48, cy - 62); ctx.lineTo(cx + 58, cy + 92); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(cx + 48, cy - 62); ctx.lineTo(cx + 48, cy + 20); ctx.stroke()
      ctx.fillStyle = '#FFFFFF'
      ctx.font = `600 30px ${MONO}`
      ctx.fillText('NEXT.JS 16', 52, 420)
      ctx.fillStyle = 'rgba(255,255,255,0.55)'
      ctx.font = `500 20px ${MONO}`
      ctx.fillText('APP ROUTER · RSC · CPU0', 52, 452)
      ctx.fillText('BGA-1700', 380, 70)
    })
  return textTexture(640, 416, (ctx) => {
    const g = ctx.createLinearGradient(0, 0, 640, 416)
    g.addColorStop(0, '#1B2B3A')
    g.addColorStop(0.5, '#2A2147')
    g.addColorStop(1, '#173A3A')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, 640, 416)
    ctx.strokeStyle = 'rgba(255,255,255,0.08)'
    for (let i = 0; i < 640; i += 12) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 416); ctx.stroke() }
    for (let i = 0; i < 416; i += 12) { ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(640, i); ctx.stroke() }
    ctx.strokeStyle = '#FFD27A'
    ctx.lineWidth = 4
    ctx.beginPath(); ctx.arc(470, 120, 44, 0, Math.PI * 2); ctx.stroke()
    ctx.strokeStyle = '#E9F3F7'
    ctx.lineWidth = 5
    ctx.beginPath(); ctx.ellipse(300, 300, 190, 46, 0, Math.PI, Math.PI * 2); ctx.stroke()
    for (let w = 0; w < 3; w++) {
      ctx.beginPath()
      for (let x = 80; x <= 560; x += 4) ctx.lineTo(x, 330 + w * 22 + Math.sin(x / 18 + w) * 5)
      ctx.globalAlpha = 0.7 - w * 0.2
      ctx.stroke()
    }
    ctx.globalAlpha = 1
    ctx.lineWidth = 7
    ctx.beginPath(); ctx.moveTo(300, 262); ctx.quadraticCurveTo(280, 170, 320, 96); ctx.stroke()
    ctx.lineWidth = 4
    for (const [dx, dy] of [[-90, 20], [-70, -30], [80, 10], [70, -36], [0, -60]]) {
      ctx.beginPath(); ctx.moveTo(320, 96); ctx.quadraticCurveTo(320 + dx * 0.5, 96 + dy - 30, 320 + dx, 96 + dy + 30); ctx.stroke()
    }
    ctx.fillStyle = '#E9F3F7'
    ctx.font = `600 30px ${MONO}`
    ctx.fillText('TANSTACK START', 40, 56)
    ctx.fillStyle = 'rgba(233,243,247,0.6)'
    ctx.font = `500 20px ${MONO}`
    ctx.fillText('SSR · SERVER FN · CPU0', 40, 86)
    ctx.fillText('LGA-1200', 40, 392)
  })
}

const labelArt = (c: Look, db: Db) =>
  textTexture(512, 192, (ctx) => {
    ctx.fillStyle = BRAND[db]
    ctx.beginPath()
    ctx.arc(44, 78, 15, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = c.fg
    ctx.font = `500 44px ${FONT}`
    ctx.fillText(`MEM · ${machine('storage', db).brand}`, 76, 94)
    ctx.fillStyle = c.muted
    ctx.font = `500 24px ${MONO}`
    ctx.fillText(db === 'postgres' ? 'DIMM-0 · DDR5' : 'NAND ×3 · BSON', 30, 150)
  })

const silkArt = (c: Look, fw: Fw, db: Db) =>
  textTexture(1440, 128, (ctx) => {
    ctx.fillStyle = c.muted
    ctx.font = `500 44px ${MONO}`
    ctx.fillText(`PAYLOAD/APP · REV 4 · ${fw === 'next' ? 'SQUARE CELL' : 'ROUND CELL'}`, 8, 52)
    ctx.fillText(`CPU0 ${machine('cell', fw).brand} · MEM ${machine('storage', db).brand}`, 8, 112)
  })

function traceLine(cell: Fw) {
  const pos: number[] = []
  const ranges: [number, number][] = []
  SLOTS[cell].forEach((_, k) => {
    const p = tracePath(cell, k)
    const a = pos.length / 3
    for (let i = 1; i < p.length; i++) pos.push(p[i - 1].x, p[i - 1].y, p[i - 1].z, p[i].x, p[i].y, p[i].z)
    ranges.push([a, pos.length / 3])
  })
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3))
  geometry.setAttribute('color', new BufferAttribute(new Float32Array(pos.length), 3))
  return { geometry, ranges }
}

function place(g: Group, show: number) {
  g.visible = show > 0.01
  g.position.set(CELL.x, (show - 1) * 1.6, CELL.z)
  g.scale.setScalar(0.75 + 0.25 * show)
}

function Board({ cell, sim, c }: { cell: Fw; sim: Sim; c: Look }) {
  const group = useRef<Group>(null)
  const trace = useMemo(() => traceLine(cell), [cell])
  useEffect(() => () => trace.geometry.dispose(), [trace])
  const paint = useMemo(
    () => ({ lit: new Color(c.accent), idle: new Color(c.dim), state: new Int8Array(trace.ranges.length).fill(-1) }),
    [c.accent, c.dim, trace],
  )
  useFrame(() => {
    place(group.current!, sim.show[cell])
    const n = trace.ranges.length
    const attr = trace.geometry.getAttribute('color') as BufferAttribute
    let dirty = false
    for (let k = 0; k < n; k++) {
      let on = 0
      if (sim.rig.cell === cell)
        for (let i = k; i < sim.slots.length; i += n)
          if (sim.slots[i]?.mode === 'board') {
            on = 1
            break
          }
      if (paint.state[k] === on) continue
      paint.state[k] = on
      dirty = true
      const col = on ? paint.lit : paint.idle
      for (let v = trace.ranges[k][0]; v < trace.ranges[k][1]; v++) attr.setXYZ(v, col.r, col.g, col.b)
    }
    if (dirty) attr.needsUpdate = true
  })
  return (
    <group ref={group}>
      <group position={[-CELL.x, 0, -CELL.z]}>
        <Solid build={SLAB[cell]} fill={c.board} edge={c.edge} />
        <Solid build={MARKS[cell]} fill={c.board} edge={c.dim} />
        <lineSegments geometry={trace.geometry} frustumCulled={false}>
          <lineBasicMaterial vertexColors toneMapped={false} />
        </lineSegments>
      </group>
    </group>
  )
}

/**
 * Both boards plus one set of chips. The chips ride whichever board the lab
 * selects, so a swap sinks a bare board and raises the new one carrying them.
 */
export function Cell({ sim, lab, c, tip, guard, onSwap, labels }: {
  sim: Sim
  lab: Lab
  c: Look
  tip: Tip
  guard: Guard
  onSwap: (key: 'framework' | 'database') => void
  labels: boolean
}): JSX.Element {
  const fw = lab.setup.framework
  const db = lab.setup.database
  const follow = useRef<Group>(null)
  const cpu = useRef<Group>(null)
  const mem = useRef<Group>(null)
  const bump = useRef({ fw, db, cpu: 0, mem: 0 })
  const art = useTexture(() => cpuArt(fw), [fw])
  const label = useTexture(() => labelArt(c, db), [c.fg, c.muted, db])
  const silk = useTexture(() => silkArt(c, fw, db), [c.muted, fw, db])
  useFrame((_, dt) => {
    place(follow.current!, sim.show[fw])
    const b = bump.current
    if (b.fw !== fw) {
      b.fw = fw
      b.cpu = 1.2
    }
    if (b.db !== db) {
      b.db = db
      b.mem = 1.2
    }
    const k = Math.exp(-dt * 7)
    b.cpu *= k
    b.mem *= k
    cpu.current!.position.y = b.cpu
    cpu.current!.rotation.y = b.cpu * 0.4
    mem.current!.position.y = b.mem
  })
  const swap = (key: 'framework' | 'database') => (e: { stopPropagation: () => void }) => {
    e.stopPropagation()
    if (!guard.moved) onSwap(key)
  }
  const cpuTip = hover(tip, () => (fw === 'next' ? 'Next.js · CPU0' : 'TanStack Start · CPU0'), () => 'Framework socket · click to swap the CPU')
  const memTip = hover(tip, () => (db === 'postgres' ? 'PostgreSQL · DIMM' : 'MongoDB · NAND stack'), () => 'Memory · click to swap the database')
  return (
    <>
      <Board cell="next" sim={sim} c={c} />
      <Board cell="tanstack" sim={sim} c={c} />
      <group ref={follow}>
        <group position={[-CELL.x, 0, -CELL.z]}>
          <group position={CPU[fw]}>
            <group ref={cpu}>
              <Solid build={CHIP[fw]} fill={c.chip} edge={fw === 'next' ? c.edge : BRAND.tanstack} />
              <Flat texture={art} size={fw === 'next' ? [1.84, 1.84] : [1.78, 1.16]} position={[0, 0.283, 0]} />
              {/* Invisible hit volumes: grouped handlers would also raycast the hairlines, whose pick threshold is a whole world unit. */}
              <mesh key={fw} visible={false} position={[0, 0.14, 0]} onClick={swap('framework')} {...cpuTip}>
                {fw === 'next' ? <boxGeometry args={[CPU_HALF.next.w * 2, 0.28, CPU_HALF.next.d * 2]} /> : <cylinderGeometry args={[DISC, DISC, 0.28, 32]} />}
              </mesh>
            </group>
          </group>
          <group position={MEM[fw]} rotation={[0, MEM_YAW[fw], 0]}>
            <Solid build={SOCKET} fill={c.surface} edge={c.edge} />
            <group ref={mem}>
              <Solid build={MODULE[db]} fill={c.chip} edge={c.edge} />
              {labels &&
                (db === 'postgres' ? (
                  <Flat texture={label} size={[1.2, 0.45]} position={[0, 0.6, 0.028]} rotation={[0, 0, 0]} />
                ) : (
                  <Flat texture={label} size={[0.96, 0.36]} position={[0, 0.482, 0]} />
                ))}
            </group>
            <mesh key={db} visible={false} position={[0, db === 'postgres' ? 0.5 : 0.25, 0]} onClick={swap('database')} {...memTip}>
              <boxGeometry args={db === 'postgres' ? [MEM_HALF.w * 2, 1, 0.4] : [MEM_HALF.w * 2, 0.5, 0.9]} />
            </mesh>
          </group>
          {labels && <Flat texture={silk} size={[1.8, 0.16]} position={SILK[fw].at} rotation={SILK[fw].rot} />}
        </group>
      </group>
    </>
  )
}
