import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import { Matrix4, Vector3 } from 'three'
import type { InstancedMesh } from 'three'

import type { LineLayout, Power, Tokens } from '../core/contract'
import { FONT, textTexture } from '../core/three'
import { FootShadows } from './grade'

export type LightPreset = { amb: number; sun: number; hemi: number; color: string; sunColor: string; ground: string }

/** Ambient, sun and hemisphere lights that dim with `power` during a theme swap. */
export function Lights({ preset, power }: { preset: LightPreset; power: Power }) {
  const amb = useRef<{ intensity: number }>(null)
  const sun = useRef<{ intensity: number }>(null)
  const hemi = useRef<{ intensity: number }>(null)
  useFrame(() => {
    const p = power.current
    if (amb.current) amb.current.intensity = preset.amb * p
    if (sun.current) sun.current.intensity = preset.sun * p
    if (hemi.current) hemi.current.intensity = preset.hemi * p
  })
  return (
    <>
      <ambientLight ref={amb as never} color={preset.color} />
      <directionalLight ref={sun as never} position={[8, 16, 10]} color={preset.sunColor} />
      <hemisphereLight ref={hemi as never} args={[preset.color, preset.ground]} />
    </>
  )
}

/** A soft baked shadow under each station. drei's ContactShadows rendered nothing on this line, even capturing 120 frames. */
export function LineShadow({ c, line }: { c: Tokens; line: LineLayout }) {
  return <FootShadows line={line} color="#000000" strength={c.shadow} />
}

export function label(text: string, opts: { fg: string; bg?: string; stroke?: string; w?: number; h?: number; size?: number; weight?: number; align?: CanvasTextAlign }) {
  const w = opts.w ?? 512, h = opts.h ?? 96
  return textTexture(w, h, (ctx) => {
    if (opts.bg) {
      ctx.fillStyle = opts.bg
      ctx.fillRect(0, 0, w, h)
    }
    if (opts.stroke) {
      ctx.strokeStyle = opts.stroke
      ctx.lineWidth = 3
      ctx.strokeRect(2, 2, w - 4, h - 4)
    }
    ctx.fillStyle = opts.fg
    ctx.font = `${opts.weight ?? 500} ${opts.size ?? 40}px ${FONT}`
    ctx.textAlign = opts.align ?? 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(text, opts.align === 'left' ? 16 : w / 2, h / 2 + 2)
  })
}

export type Transition = { t: number; from: Tokens; to: Tokens; active: boolean }

const TILE = 1
/** Floor tiles flip over from the board outward while a theme swaps. */
export function TileFlip({ tr, line }: { tr: { current: Transition }; line: LineLayout }) {
  const area = useMemo(() => {
    const x0 = Math.floor(line.extent.x0 - 1.5), x1 = Math.ceil(line.extent.x1 + 3)
    const board = line.stops[line.stops.length - 1].span
    return { x0, x1, z0: -8.5, z1: 8.5, nx: x1 - x0, nz: 17, cx: (board.x0 + board.x1) / 2, cz: line.rail.z }
  }, [line])
  const count = area.nx * area.nz
  const ref = useRef<InstancedMesh>(null)
  const dummy = useMemo(() => ({ m: new Matrix4(), p: new Vector3() }), [])
  const faces = useRef<string | null>(null)
  const tex = (look: Tokens) =>
    textTexture(64, 64, (ctx) => {
      ctx.fillStyle = look.floor
      ctx.fillRect(0, 0, 64, 64)
      ctx.strokeStyle = look.edge
      ctx.lineWidth = 2
      ctx.strokeRect(1, 1, 62, 62)
    })
  useFrame(() => {
    const m = ref.current
    if (!m) return
    const { t, from, to, active } = tr.current
    m.visible = active && t > 0.12 && t < 0.98
    if (!m.visible) return
    const key = `${count}|${from.floor}${from.edge}${to.floor}${to.edge}`
    if (faces.current !== key) {
      const mats = m.material as unknown as { map: { dispose: () => void } | null; color: { set: (c: string) => void }; needsUpdate: boolean }[]
      mats[2].map?.dispose()
      mats[3].map?.dispose()
      mats[2].map = tex(from)
      mats[3].map = tex(to)
      for (const k of [0, 1, 4, 5]) mats[k].color.set(to.dim)
      mats.forEach((mat) => { mat.needsUpdate = true })
      faces.current = key
    }
    let i = 0
    const maxD = Math.hypot(area.x0 - area.cx, area.z1 - area.cz)
    for (let a = 0; a < area.nx; a++)
      for (let b = 0; b < area.nz; b++) {
        const x = area.x0 + (a + 0.5) * TILE, z = area.z0 + (b + 0.5) * TILE
        const d = Math.hypot(x - area.cx, z - area.cz) / maxD
        const local = Math.min(1, Math.max(0, (t - 0.15 - d * 0.45) / 0.3))
        const e = local < 0.5 ? 2 * local * local : 1 - Math.pow(-2 * local + 2, 2) / 2
        dummy.m.makeRotationX(e * Math.PI).setPosition(dummy.p.set(x, 0.03 + Math.sin(e * Math.PI) * 0.9, z))
        m.setMatrixAt(i++, dummy.m)
      }
    m.instanceMatrix.needsUpdate = true
  })
  return (
    <instancedMesh key={count} ref={ref} args={[undefined, undefined, count]} visible={false} frustumCulled={false}>
      <boxGeometry args={[TILE * 0.96, 0.04, TILE * 0.96]} />
      <meshBasicMaterial attach="material-0" />
      <meshBasicMaterial attach="material-1" />
      <meshBasicMaterial attach="material-2" toneMapped={false} />
      <meshBasicMaterial attach="material-3" toneMapped={false} />
      <meshBasicMaterial attach="material-4" />
      <meshBasicMaterial attach="material-5" />
    </instancedMesh>
  )
}
