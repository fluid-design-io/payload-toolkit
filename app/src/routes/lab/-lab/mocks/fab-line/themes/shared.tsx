import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import { Matrix4, Vector3 } from 'three'
import type { InstancedMesh, Sprite, Texture } from 'three'

import type { LineLayout, Power, Stop, Tokens } from '../core/contract'
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

/** A stop's floor print `w` long, its left end at the stop's `print` anchor. */
export function printPose(stop: Stop, w: number) {
  const [x, z] = stop.print
  return { position: [x + w / 2, 0.012, z] as const, rotation: [-Math.PI / 2, 0, 0] as const }
}

const MARK = { h: 96, r: 38, font: 44, gap: 10 }

/**
 * A circled mark (a station's number or letter) and its one-line name, cropped
 * to the name, for `MarkTag`. The top row reads mark then name, the bottom row
 * name then mark, for a tag that would run off the right edge.
 */
export function markTexture(mark: string, name: string, look: { ring: string; fill: string; mark: string; name: string; weight?: number }) {
  const { h, r, font, gap } = MARK
  const nameFont = `${look.weight ?? 600} ${font}px ${FONT}`
  const probe = document.createElement('canvas').getContext('2d')!
  probe.font = nameFont
  const text = Math.ceil(probe.measureText(name).width)
  const w = h + gap + text + gap
  const map = textTexture(w, h * 2, (ctx) => {
    ctx.textBaseline = 'middle'
    ctx.lineJoin = 'round'
    for (const [row, cx, tx] of [[0, h / 2, h + gap], [h, w - h / 2, gap]]) {
      const y = row + h / 2
      ctx.beginPath()
      ctx.arc(cx, y, r, 0, Math.PI * 2)
      ctx.fillStyle = look.fill
      ctx.fill()
      ctx.strokeStyle = look.ring
      ctx.lineWidth = 5
      ctx.stroke()
      ctx.textAlign = 'center'
      ctx.fillStyle = look.mark
      ctx.font = `700 ${font + 4}px ${FONT}`
      ctx.fillText(mark, cx, y + 3)
      ctx.textAlign = 'left'
      ctx.font = nameFont
      ctx.lineWidth = 10
      ctx.strokeStyle = look.fill
      ctx.strokeText(name, tx, y + 3)
      ctx.fillStyle = look.name
      ctx.fillText(name, tx, y + 3)
    }
  })
  map.repeat.set(1, 0.5)
  map.offset.set(0, 0.5)
  return map
}

const eye = new Vector3()
const ndc = new Vector3()
/**
 * A `markTexture` billboard pinned at its circle, `h` world units tall but held
 * between `px` screen pixels, so it reads as the same small tag from the
 * overview to a stop. It draws over the scene so its leader ends under the
 * circle, and puts its name left of the circle when the name would leave the frame.
 */
export function MarkTag({ map, at, h, px = [18, 26] }: { map: Texture; at: readonly [number, number, number]; h: number; px?: readonly [number, number] }) {
  const ref = useRef<Sprite>(null)
  const { width, height } = map.image as HTMLCanvasElement
  const aspect = (width * 2) / height, pin = height / 4 / width
  useFrame(({ camera, size }) => {
    const s = ref.current
    if (!s) return
    const depth = -eye.setFromMatrixPosition(s.matrixWorld).applyMatrix4(camera.matrixWorldInverse).z
    const perPx = (2 * depth) / (size.height * camera.projectionMatrix.elements[5])
    const k = Math.min(Math.max(h, px[0] * perPx), px[1] * perPx)
    s.scale.set(k * aspect, k, 1)
    const right = ndc.setFromMatrixPosition(s.matrixWorld).project(camera).x + ((k * aspect * (1 - pin)) / perPx / size.width) * 2
    const flip = right > 1
    s.center.set(flip ? 1 - pin : pin, 0.5)
    s.material.map?.offset.set(0, flip ? 0 : 0.5)
  })
  return (
    <sprite ref={ref} position={[at[0], at[1], at[2]]} center={[pin, 0.5]} scale={[h * aspect, h, 1]} renderOrder={10}>
      <spriteMaterial map={map} transparent depthTest={false} depthWrite={false} toneMapped={false} />
    </sprite>
  )
}

export type Transition = { t: number; from: Tokens; to: Tokens; active: boolean }

const TILE = 1
const dummy = { m: new Matrix4(), p: new Vector3() }
/** Floor tiles flip over from the board outward while a theme swaps. */
export function TileFlip({ tr, line }: { tr: { current: Transition }; line: LineLayout }) {
  const x0 = Math.floor(line.extent.x0 - 1.5), x1 = Math.ceil(line.extent.x1 + 3)
  const board = line.stops[line.stops.length - 1].span
  const area = { x0, x1, z0: -8.5, z1: 8.5, nx: x1 - x0, nz: 17, cx: (board.x0 + board.x1) / 2, cz: line.rail.z }
  const count = area.nx * area.nz
  const ref = useRef<InstancedMesh>(null)
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
