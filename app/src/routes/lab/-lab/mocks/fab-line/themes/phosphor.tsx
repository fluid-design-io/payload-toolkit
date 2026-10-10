import { Grid } from '@react-three/drei'
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { CircleGeometry, Matrix4, PlaneGeometry } from 'three'
import type { InstancedMesh } from 'three'

import type { StageProps, ThemeVariant, Tokens } from '../core/contract'
import { MONO, fillMat, lineMat, segs } from '../core/three'
import { Screen, rgbOf, sheetOf, textTexture, useHideOnCloseUp, useTextures } from './grade'
import type { Grade } from './grade'
import { Lights } from './shared'

/**
 * A monochrome terminal. Dark is the P1 green phosphor tube: the canvas
 * filter folds every color to phosphor luminance and blooms it, CSS layers
 * add the scanlines and the tube's vignette. Light is the same session on a
 * line printer: greenbar fanfold paper, sprocket margins, a two-colour ribbon.
 */
const P1 = '#33FF66'

const dark: Tokens = {
  bg: 'radial-gradient(120% 100% at 50% 45%, #07140B 0%, #020603 80%)', surface: '#04100A', fg: '#8DFFAA', muted: '#2C9C4E', edge: P1, dim: '#0F4A24', accent: '#D4FFE0', floor: '#030A06', floorEdge: '#0C3A1C',
  flat: true, rough: 1, shadow: 0, s: 30, l: 45,
  board: '#03130A', boardEdge: P1, silk: '#2BD957', trace: '#13652E', lit: '#D4FFE0', body: '#020805', bodyEdge: P1, ink: '#8DFFAA', pin: '#1F9E45', sub: '#06200F', ghost: '#05170C',
  gold: '#7DE89A', die: '#010402', led: '#8DFFAA', ledBusy: '#E8FFEE', ledOff: '#0A2A14', spark: '#F2FFF5',
  claude: '#9DFFB4', claudeEdge: '#1F9E45', claudeInk: '#021006', claudeCable: '#1C7438',
  codex: '#0B3A1B', codexInk: '#9DFFB4', codexCable: '#145A2B',
}
const light: Tokens = {
  bg: '#F3F5EE', surface: '#F7F8F3', fg: '#1E2A23', muted: '#5D6B62', edge: '#25332B', dim: '#B8C4BA', accent: '#C8372D', floor: '#F3F5EE', floorEdge: '#C9D6CA',
  flat: true, rough: 1, shadow: 0, s: 35, l: 52,
  board: '#F7F8F3', boardEdge: '#25332B', silk: '#25332B', trace: '#B8C4BA', lit: '#C8372D', body: '#F7F8F3', bodyEdge: '#25332B', ink: '#1E2A23', pin: '#6F7D74', sub: '#E5ECE3', ghost: '#ECF1EA',
  gold: '#7E8C82', die: '#25332B', led: '#C8372D', ledBusy: '#F06A5E', ledOff: '#D5DDD4', spark: '#C8372D',
  claude: '#F7F8F3', claudeEdge: '#C8372D', claudeInk: '#C8372D', claudeCable: '#6F7D74',
  codex: '#25332B', codexInk: '#F7F8F3', codexCable: '#6F7D74',
}

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
  const geo = useMemo(() => ({ band: new PlaneGeometry(1, 1).rotateX(-Math.PI / 2), hole: new CircleGeometry(0.11, 14).rotateX(-Math.PI / 2) }), [])
  useEffect(() => () => { geo.band.dispose(); geo.hole.dispose() }, [geo])
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
  const lines = useMemo(() => {
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
  useEffect(() => () => lines.dispose(), [lines])
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

const STATUS: Record<string, string> = { cabinet: 'MOUNTED', table: 'READY', transport: 'RUNNING', board: 'ONLINE' }

function Stage({ c, mode, power, cam, line }: StageProps) {
  const sheet = useMemo(() => sheetOf(line), [line])
  const dk = mode === 'dark'
  const labels = useHideOnCloseUp(cam)
  const stops = line.stops
  const prints = useTextures(
    () =>
      stops.map((stop, i) =>
        textTexture(1024, 128, (ctx) => {
          ctx.font = `600 50px ${MONO}`
          ctx.textBaseline = 'middle'
          const name = `${String(i + 1).padStart(2, '0')} ${stop.label.toUpperCase().replace(/ /g, '_')}`
          const status = STATUS[stop.id] ?? 'OK'
          const dots = '.'.repeat(Math.max(2, 26 - name.length - status.length))
          ctx.fillStyle = c.fg
          ctx.fillText(`${dk ? '>' : '*'} ${name} ${dots} `, 8, 66)
          const w = ctx.measureText(`${dk ? '>' : '*'} ${name} ${dots} `).width
          ctx.fillStyle = c.accent
          ctx.fillText(status, 8 + w, 66)
          if (dk && i === stops.length - 1) ctx.fillRect(8 + w + ctx.measureText(status).width + 16, 36, 28, 56)
        }),
      ),
    [stops, c, dk],
  )
  const ticks = useMemo(() => {
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
  useEffect(() => () => ticks?.dispose(), [ticks])
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
          const b = stop.box
          const h = 0.85, w = h * 8
          const side = stop.id === 'cabinet'
          return (
            <mesh
              key={stop.id}
              position={side ? [b.x0 - 0.9, 0.012, (b.z0 + b.z1) / 2 + 1.4] : [b.x0 + w / 2, 0.012, b.z1 + 1.0]}
              rotation={side ? [-Math.PI / 2, 0, Math.PI / 2] : [-Math.PI / 2, 0, 0]}
            >
              <planeGeometry args={[w, h]} />
              <meshBasicMaterial map={prints[i]} transparent depthWrite={false} toneMapped={false} />
            </mesh>
          )
        })}
      </group>
    </>
  )
}

export const phosphor: ThemeVariant = {
  id: 'phosphor',
  label: 'Phosphor',
  scene: 'INT. TERMINAL ROOM',
  lens: { fov: 13, el: 34, frame: 1.0 },
  tokens: { light, dark },
  Stage,
}

