import { useEffect, useLayoutEffect, useMemo } from 'react'
import { Color, ShaderMaterial, Vector3, Vector4 } from 'three'

import type { Mode, StageProps, ThemeVariant, Tokens } from '../core/contract'
import { FONT, fillMat, lineMat, segs } from '../core/three'
import { Screen, grainUrl, hexOf, rgbOf, sheetOf, textTexture, useHideOnCloseUp, useTextures } from './grade'
import type { Grade } from './grade'
import { Lights } from './shared'

/**
 * Two-ink Risograph. Stations paint in plate codes, not inks: plate A's
 * coverage rides the red channel and plate B's the green channel (light:
 * coverage = 1 - channel over white; dark: coverage = channel over black).
 * The canvas filter separates the plates, inks them, and prints plate B a
 * little off register, so every station, chip lid and screenshot comes out
 * as two inks on paper with no knowledge of this theme.
 */
const PRESS = {
  light: { paper: '#F2EDE2', a: '#0078BF', b: '#FF48B0', offset: [1.6, -1.1] },
  dark: { paper: '#191722', a: '#3FB8E8', b: '#FF4FAE', offset: [1.6, -1.1] },
} as const

/** The plate code for `ta` of ink A and `tb` of ink B. */
const plate = (mode: Mode, ta: number, tb: number) => (mode === 'light' ? hexOf([1 - ta, 1 - tb, 1]) : hexOf([ta, tb, 0]))

function tokens(mode: Mode): Tokens {
  const k = (ta: number, tb: number) => plate(mode, ta, tb)
  const dk = mode === 'dark'
  return {
    bg: PRESS[mode].paper, surface: k(0, 0), fg: k(1, 0), muted: k(0.6, 0), edge: k(1, 0), dim: k(0.3, 0), accent: k(0, 1), floor: k(0, 0), floorEdge: k(0.2, 0),
    flat: true, rough: 1, shadow: 0, s: 80, l: 55,
    board: k(0, dk ? 0.16 : 0.12), boardEdge: k(1, 0), silk: k(0.9, 0), trace: k(0.35, 0), lit: k(0, 1), body: k(0, 0), bodyEdge: k(1, 0), ink: k(1, 0), pin: k(0.55, 0), sub: k(0.12, 0), ghost: k(0, 0.07),
    gold: k(0, 0.65), die: dk ? k(0.12, 0.06) : k(1, 1), led: k(0, 1), ledBusy: k(0.35, 1), ledOff: k(0.2, 0), spark: dk ? k(0.6, 1) : k(0, 1),
    claude: k(0, 0.85), claudeEdge: k(0.6, 1), claudeInk: k(0, 0), claudeCable: k(0.35, 0),
    codex: k(1, 0.15), codexInk: k(0, 0), codexCable: k(0.5, 0),
  }
}

/** feColorMatrix rows that ink one plate. */
const rows = (r: number[][]) => r.map((x) => x.join(' ')).join('  ')
function pressFilter(mode: Mode) {
  const P = rgbOf(PRESS[mode].paper), A = rgbOf(PRESS[mode].a), B = rgbOf(PRESS[mode].b)
  const [dx, dy] = PRESS[mode].offset
  if (mode === 'light') {
    // Plate A over paper: P + (1 - R)(A - P). Plate B as a multiplier: B/P + G(1 - B/P). Overprint is A·B/P, like ink.
    const a = rows([0, 1, 2].map((c) => [P[c] - A[c], 0, 0, 0, A[c]]).concat([[0, 0, 0, 0, 1]]))
    const b = rows([0, 1, 2].map((c) => [0, 1 - B[c] / P[c], 0, 0, B[c] / P[c]]).concat([[0, 0, 0, 0, 1]]))
    return `<feColorMatrix in="SourceGraphic" type="matrix" values="${a}" result="a"/>
      <feColorMatrix in="SourceGraphic" type="matrix" values="${b}" result="b0"/>
      <feOffset in="b0" dx="${dx}" dy="${dy}" result="b1"/>
      <feFlood flood-color="#fff" result="white"/>
      <feMerge result="b"><feMergeNode in="white"/><feMergeNode in="b1"/></feMerge>
      <feComposite in="a" in2="b" operator="arithmetic" k1="1" k2="0" k3="0" k4="0"/>`
  }
  // Dark stock takes opaque inks additively: D + R(A - D) + G(B - D).
  const a = rows([0, 1, 2].map((c) => [A[c] - P[c], 0, 0, 0, P[c]]).concat([[0, 0, 0, 0, 1]]))
  const b = rows([0, 1, 2].map((c) => [0, B[c] - P[c], 0, 0, 0]).concat([[0, 0, 0, 0, 1]]))
  return `<feColorMatrix in="SourceGraphic" type="matrix" values="${a}" result="a"/>
    <feColorMatrix in="SourceGraphic" type="matrix" values="${b}" result="b0"/>
    <feOffset in="b0" dx="${dx}" dy="${dy}" result="b"/>
    <feComposite in="a" in2="b" operator="arithmetic" k1="0" k2="1" k3="1" k4="0"/>`
}

const grades: Partial<Record<Mode, Grade>> = {}
function gradeOf(mode: Mode): Grade {
  return (grades[mode] ??= {
    exact: true,
    paper: plate(mode, 0, 0),
    filter: pressFilter(mode),
    layers: [{ backgroundImage: `url(${grainUrl(192, mode === 'light' ? 7 : 11)})`, backgroundSize: '192px', mixBlendMode: mode === 'light' ? 'multiply' : 'screen', opacity: mode === 'light' ? '0.16' : '0.06', filter: mode === 'light' ? 'none' : 'invert(1)' }],
  })
}

/**
 * The halftone as one quad: a 45-degree dot screen computed per fragment from
 * world x and z, so it stays crisp at any zoom for two triangles. Dot area
 * follows a tone that darkens toward the back of the sheet and pools under the board.
 */
const DOTS_VERT = `varying vec2 vXZ;
void main() { vec4 w = modelMatrix * vec4(position, 1.0); vXZ = w.xz; gl_Position = projectionMatrix * viewMatrix * w; }`
const DOTS_FRAG = `uniform vec3 color; uniform float pitch; uniform vec4 sheet; uniform vec3 pool;
varying vec2 vXZ;
float smooth01(float a, float b, float v) { float t = clamp((v - a) / (b - a), 0.0, 1.0); return t * t * (3.0 - 2.0 * t); }
void main() {
  float edge = smooth01(sheet.x + 0.5, sheet.x + 6.0, vXZ.x) * smooth01(sheet.y - 0.5, sheet.y - 6.0, vXZ.x);
  float back = 0.4 * smooth01(-1.5, sheet.z + 0.6, vXZ.y) * edge;
  vec2 d = vXZ - pool.xy;
  float tone = min(1.0, back + 0.16 * exp(-(d.x * d.x / 40.0 + d.y * d.y / 18.0)));
  vec2 r = mat2(0.70710678, -0.70710678, 0.70710678, 0.70710678) * vXZ / pitch;
  float dist = length(fract(r) - 0.5);
  float rad = 0.6 * sqrt(tone);
  float aa = fwidth(dist);
  float a = 1.0 - smoothstep(rad - aa, rad + aa, dist);
  if (a < 0.01 || rad < 0.05) discard;
  gl_FragColor = vec4(color, a);
  #include <colorspace_fragment>
}`

function DotScreen({ sheet, pool, color }: { sheet: ReturnType<typeof sheetOf>; pool: [number, number]; color: string }) {
  const mat = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: DOTS_VERT,
        fragmentShader: DOTS_FRAG,
        transparent: true,
        depthWrite: false,
        uniforms: { color: { value: new Color() }, pitch: { value: 0.34 }, sheet: { value: new Vector4() }, pool: { value: new Vector3() } },
      }),
    [],
  )
  useEffect(() => () => mat.dispose(), [mat])
  useLayoutEffect(() => {
    mat.uniforms.color.value.set(color)
    mat.uniforms.sheet.value.set(sheet.x0, sheet.x1, sheet.z0, sheet.z1)
    mat.uniforms.pool.value.set(pool[0], pool[1], 0)
  }, [mat, color, sheet, pool[0], pool[1]])
  return (
    <mesh position={[sheet.cx, 0.004, sheet.cz]} rotation={[-Math.PI / 2, 0, 0]} material={mat}>
      <planeGeometry args={[sheet.w - 1, sheet.d - 1]} />
    </mesh>
  )
}

function Stage({ c, mode, power, cam, line }: StageProps) {
  const sheet = useMemo(() => sheetOf(line), [line])
  const over = plate(mode, 1, 1)
  const inkB = plate(mode, 0, 1)
  const inkA = plate(mode, 1, 0)
  const labels = useHideOnCloseUp(cam)

  const board = line.stops[line.stops.length - 1].box
  const pool: [number, number] = [(board.x0 + board.x1) / 2, (board.z0 + board.z1) / 2]

  const marks = useMemo(() => {
    const list: number[] = []
    const y = 0.01
    const s = (a: number, b: number, c2: number, d: number) => list.push(a, y, b, c2, y, d)
    const corners: [number, number, number, number][] = [[sheet.x0, sheet.z0, -1, -1], [sheet.x1, sheet.z0, 1, -1], [sheet.x1, sheet.z1, 1, 1], [sheet.x0, sheet.z1, -1, 1]]
    for (const [x, z, sx, sz] of corners) {
      s(x + sx * 0.25, z, x + sx * 1.25, z)
      s(x, z + sz * 0.25, x, z + sz * 1.25)
    }
    const target = (x: number, z: number) => {
      s(x - 0.55, z, x + 0.55, z)
      s(x, z - 0.55, x, z + 0.55)
      for (const r of [0.34, 0.2])
        for (let k = 0; k < 36; k++) {
          const a0 = (k / 36) * Math.PI * 2, a1 = ((k + 1) / 36) * Math.PI * 2
          s(x + Math.cos(a0) * r, z + Math.sin(a0) * r, x + Math.cos(a1) * r, z + Math.sin(a1) * r)
        }
    }
    target(sheet.cx, sheet.z0 - 0.75)
    target(sheet.cx, sheet.z1 + 0.75)
    target(sheet.x0 - 0.75, sheet.cz)
    target(sheet.x1 + 0.75, sheet.cz)
    return segs(list)
  }, [sheet])
  useEffect(() => () => marks.dispose(), [marks])

  const stops = line.stops
  const [bar, slug, ...titles] = useTextures(
    () => [
      textTexture(1024, 128, (ctx) => {
        const sw: [number, number][] = [[1, 0], [0.7, 0], [0.4, 0], [0.15, 0], [0, 1], [0, 0.7], [0, 0.4], [0, 0.15], [1, 1], [0.5, 0.5]]
        sw.forEach(([a, b], i) => {
          ctx.fillStyle = plate(mode, a, b)
          ctx.fillRect(i * 102 + 2, 2, 98, 124)
        })
      }),
      textTexture(2048, 64, (ctx) => {
        ctx.fillStyle = inkA
        ctx.font = `500 34px ${FONT}`
        ctx.textBaseline = 'middle'
        const P = PRESS[mode]
        ctx.fillText(`2-COLOUR RISO  ·  A ${P.a.slice(1)}  ·  B ${P.b.slice(1)} FLUO  ·  SHEET 1 / 1  ·  ${mode === 'light' ? 'NATURAL 90 GSM' : 'BLACK STOCK 120 GSM'}`, 8, 34)
      }),
      ...stops.map((stop, i) =>
        textTexture(1024, 160, (ctx) => {
          const y = 80
          ctx.fillStyle = over
          ctx.font = `800 104px ${FONT}`
          ctx.textBaseline = 'middle'
          ctx.fillText(String(i + 1).padStart(2, '0'), 8, y + 4)
          ctx.fillStyle = inkA
          ctx.font = `700 64px ${FONT}`
          ctx.fillText(stop.label.toUpperCase(), 160, y + 6)
          ctx.fillStyle = inkB
          ctx.fillRect(160, y + 46, 120, 8)
        }),
      ),
    ],
    [stops, mode, over, inkA, inkB],
  )
  const grade = gradeOf(mode)
  const rect = useRect(sheet)
  return (
    <>
      <Screen grade={grade} />
      <Lights preset={{ amb: 2, sun: 0, hemi: 0, color: '#FFFFFF', sunColor: '#FFFFFF', ground: '#000000' }} power={power} />
      <DotScreen sheet={sheet} pool={pool} color={inkB} />
      {stops.map((stop) => {
        const b = stop.box
        return (
          <mesh key={stop.id} position={[(b.x0 + b.x1) / 2 + 0.5, 0.006, (b.z0 + b.z1) / 2 + 0.5]} rotation={[-Math.PI / 2, 0, 0]} material={fillMat(plate(mode, 0, 0.22), true)}>
            <planeGeometry args={[b.x1 - b.x0, b.z1 - b.z0]} />
          </mesh>
        )
      })}
      <lineSegments geometry={marks} material={lineMat(over)} />
      <group ref={labels}>
        {stops.map((stop, i) => {
          const b = stop.box
          const h = 1.15, w = h * (1024 / 160)
          const side = stop.id === 'cabinet'
          return (
            <mesh
              key={stop.id}
              position={side ? [b.x0 - 1.0, 0.012, (b.z0 + b.z1) / 2 + 1.2] : [b.x0 + w / 2 - 0.1, 0.012, b.z1 + 1.1]}
              rotation={side ? [-Math.PI / 2, 0, Math.PI / 2] : [-Math.PI / 2, 0, 0]}
            >
              <planeGeometry args={[w, h]} />
              <meshBasicMaterial transparent depthWrite={false} toneMapped={false} map={titles[i]} />
            </mesh>
          )
        })}
      </group>
      <mesh position={[sheet.x0 + 0.4 + 2.5, 0.012, sheet.z1 - 0.75]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[5, 0.625]} />
        <meshBasicMaterial map={bar} toneMapped={false} />
      </mesh>
      <mesh position={[sheet.x0 + 5.8 + 6, 0.012, sheet.z1 - 0.75]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[12, 0.375]} />
        <meshBasicMaterial map={slug} transparent depthWrite={false} toneMapped={false} />
      </mesh>
      <lineSegments geometry={rect} material={lineMat(c.floorEdge)} />
    </>
  )
}

function useRect(sheet: ReturnType<typeof sheetOf>) {
  const g = useMemo(() => segs([sheet.x0, 0.008, sheet.z0, sheet.x1, 0.008, sheet.z0, sheet.x1, 0.008, sheet.z0, sheet.x1, 0.008, sheet.z1, sheet.x1, 0.008, sheet.z1, sheet.x0, 0.008, sheet.z1, sheet.x0, 0.008, sheet.z1, sheet.x0, 0.008, sheet.z0]), [sheet])
  useEffect(() => () => g.dispose(), [g])
  return g
}

export const riso: ThemeVariant = {
  id: 'riso',
  label: 'Riso print',
  scene: 'INT. PRINT SHOP',
  lens: { fov: 11, el: 38, frame: 1.0 },
  tokens: { light: tokens('light'), dark: tokens('dark') },
  Stage,
}
