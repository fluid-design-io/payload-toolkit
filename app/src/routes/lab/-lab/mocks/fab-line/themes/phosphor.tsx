import { Grid } from '@react-three/drei'
import { useLayoutEffect, useRef } from 'react'
import { CircleGeometry, Matrix4, PlaneGeometry } from 'three'
import type { InstancedMesh } from 'three'

import type { StageProps, Tokens } from '../core/contract'
import { MONO, fillMat, lineMat, segs, useDisposable } from '../core/three'
import { Screen, rgbOf, sheetOf, textTexture, useHideOnCloseUp } from './grade'
import type { Grade } from './grade'
import { Lights, printPose } from './shared'
import { P1 } from './phosphor.data'

/**
 * A monochrome terminal. Dark is the P1 green phosphor tube: the canvas
 * filter folds every color to phosphor luminance and blooms it, CSS layers
 * add the scanlines and the tube's vignette. Light is the same session on a
 * line printer: greenbar fanfold paper, sprocket margins, a two-colour ribbon.
 */
/** Every color folds to phosphor luminance, then one blurred halo adds back on top (a second, wider halo halved the frame rate in SwiftShader). */
function tubeFilter() {
  const p = rgbOf(P1)
  const lp = 0.2126 * p[0] + 0.7152 * p[1] + 0.0722 * p[2]
  const row = (c: number) => [0.2126, 0.7152, 0.0722].map((w) => ((p[c] * w) / lp).toFixed(4)).concat(['0', '0']).join(' ')
  return `<feColorMatrix in="SourceGraphic" type="matrix" values="${row(0)}  ${row(1)}  ${row(2)}  0 0 0 1 0" result="mono"/>
    <feGaussianBlur in="mono" stdDeviation="3.2" result="halo"/>
    <feComposite in="mono" in2="halo" operator="arithmetic" k2="1" k3="1.25"/>`
}
const TUBE: Grade = {
  exact: true,
  filter: tubeFilter(),
  layers: [
    { backgroundImage: 'repeating-linear-gradient(to bottom, rgba(0,0,0,0.34) 0px, rgba(0,0,0,0.34) 1px, transparent 1px, transparent 3px)' },
    { background: 'radial-gradient(130% 115% at 50% 50%, transparent 58%, rgba(0,0,0,0.62) 100%)' },
    { background: 'linear-gradient(165deg, rgba(160,255,190,0.06) 0%, transparent 32%)' },
  ],
}
const PAPER: Grade = { exact: true }

const BAND = 0.9

/** Fanfold paper under the line: greenbar bands across the feed, sprocket margins, page perforations. */
function Fanfold({ sheet, c }: { sheet: ReturnType<typeof sheetOf>; c: Tokens }) {
  const bands = useRef<InstancedMesh>(null)
  const holes = useRef<InstancedMesh>(null)
  const geo = useDisposable(() => ({ band: new PlaneGeometry(1, 1).rotateX(-Math.PI / 2), hole: new CircleGeometry(0.11, 14).rotateX(-Math.PI / 2) }), [])
  const inner = { z0: sheet.z0 + 0.95, z1: sheet.z1 - 0.95 }
  const nb = Math.floor(sheet.w / (BAND * 2))
  const nh = Math.floor(sheet.w / 0.5)
  useLayoutEffect(() => {
    const m = new Matrix4()
    for (let i = 0; i < nb; i++) bands.current?.setMatrixAt(i, m.makeScale(BAND, 1, inner.z1 - inner.z0).setPosition(sheet.x0 + BAND * (2 * i + 1.5), 0.003, (inner.z0 + inner.z1) / 2))
    for (let i = 0; i < nh; i++) {
      holes.current?.setMatrixAt(i * 2, m.makeTranslation(sheet.x0 + 0.25 + i * 0.5, 0.004, sheet.z0 + 0.42))
      holes.current?.setMatrixAt(i * 2 + 1, m.makeTranslation(sheet.x0 + 0.25 + i * 0.5, 0.004, sheet.z1 - 0.42))
    }
    if (bands.current) bands.current.instanceMatrix.needsUpdate = true
    if (holes.current) holes.current.instanceMatrix.needsUpdate = true
  }, [sheet, nb, nh, inner.z0, inner.z1])
  const lines = useDisposable(() => {
    const l: number[] = []
    const y = 0.006
    const dash = (x0: number, z0: number, x1: number, z1: number, on: number, off: number) => {
      const len = Math.hypot(x1 - x0, z1 - z0), dx = (x1 - x0) / len, dz = (z1 - z0) / len
      for (let t = 0; t < len; t += on + off) l.push(x0 + dx * t, y, z0 + dz * t, x0 + dx * Math.min(len, t + on), y, z0 + dz * Math.min(len, t + on))
    }
    dash(sheet.x0, inner.z0 - 0.12, sheet.x1, inner.z0 - 0.12, 0.08, 0.08)
    dash(sheet.x0, inner.z1 + 0.12, sheet.x1, inner.z1 + 0.12, 0.08, 0.08)
    for (let x = sheet.x0 + 11; x < sheet.x1 - 1; x += 11) dash(x, sheet.z0, x, sheet.z1, 0.12, 0.1)
    l.push(sheet.x0, y, sheet.z0, sheet.x1, y, sheet.z0, sheet.x0, y, sheet.z1, sheet.x1, y, sheet.z1)
    return segs(l)
  }, [sheet, inner.z0, inner.z1])
  return (
    <>
      <mesh position={[sheet.cx, -0.002, sheet.cz]} rotation={[-Math.PI / 2, 0, 0]} material={fillMat(c.surface, true)}>
        <planeGeometry args={[sheet.w, sheet.d]} />
      </mesh>
      <instancedMesh key={`b${nb}`} ref={bands} args={[geo.band, fillMat('#DDEFDC', true), nb]} frustumCulled={false} />
      <instancedMesh key={`h${nh}`} ref={holes} args={[geo.hole, fillMat('#D9DDD3', true), nh * 2]} frustumCulled={false} />
      <lineSegments geometry={lines} material={lineMat(c.dim)} />
    </>
  )
}

/** Station prints: one 50px mono line on a 768 by 96 texture. */
const TAG = { w: 768, h: 96 }

export function Stage({ c, mode, power, cam, line }: StageProps) {
  const sheet = sheetOf(line)
  const dk = mode === 'dark'
  const labels = useHideOnCloseUp(cam)
  const stops = line.stops
  const prints = useDisposable(
    () =>
      stops.map((stop, i) =>
        textTexture(TAG.w, TAG.h, (ctx) => {
          ctx.font = `600 50px ${MONO}`
          ctx.textBaseline = 'middle'
          const text = `${dk ? '>' : '*'} ${String(i + 1).padStart(2, '0')} ${stop.label.toUpperCase().replace(/ /g, '_')}`
          ctx.fillStyle = c.fg
          ctx.fillText(text, 8, 50)
          if (dk && i === stops.length - 1) ctx.fillRect(8 + ctx.measureText(text).width + 16, 22, 28, 56)
        }),
      ),
    [stops, c, dk],
  )
  const ticks = useDisposable(() => {
    if (!dk) return null
    const l: number[] = []
    for (const stop of stops) {
      const b = stop.box
      const y = 0.01, k = 0.45
      for (const [x, z, sx, sz] of [[b.x0, b.z0, 1, 1], [b.x1, b.z0, -1, 1], [b.x1, b.z1, -1, -1], [b.x0, b.z1, 1, -1]] as const) {
        const X = x - sx * 0.25, Z = z - sz * 0.25
        l.push(X, y, Z, X + sx * k, y, Z, X, y, Z, X, y, Z + sz * k)
      }
    }
    return segs(l)
  }, [stops, dk])
  return (
    <>
      <Screen grade={dk ? TUBE : PAPER} />
      <Lights preset={{ amb: 2, sun: 0, hemi: 0, color: '#FFFFFF', sunColor: '#FFFFFF', ground: '#000000' }} power={power} />
      {dk ? (
        <>
          <Grid args={[140, 140]} cellSize={1} cellThickness={0.5} cellColor="#0A2E16" sectionSize={5} sectionThickness={0.9} sectionColor="#12512A" fadeDistance={95} fadeStrength={1.6} infiniteGrid />
          {ticks && <lineSegments geometry={ticks} material={lineMat(c.muted)} />}
        </>
      ) : (
        <Fanfold sheet={sheet} c={c} />
      )}
      <group ref={labels}>
        {stops.map((stop, i) => {
          const h = 0.42, w = (h * TAG.w) / TAG.h
          return (
            <mesh key={stop.id} {...printPose(stop, w)}>
              <planeGeometry args={[w, h]} />
              <meshBasicMaterial map={prints[i]} transparent depthWrite={false} toneMapped={false} />
            </mesh>
          )
        })}
      </group>
    </>
  )
}

