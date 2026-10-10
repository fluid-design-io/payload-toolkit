import { useFrame } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import {
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  Color,
  DoubleSide,
  Euler,
  Float32BufferAttribute,
  InstancedMesh,
  LineBasicMaterial,
  LineSegments,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  PointLight,
  Quaternion,
  Vector3,
} from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

import { APPLY, BELT, boxEdges, damp, type Energy, FONT, type Look, MONO, textTexture } from './contract'
import type { Sim } from './sim'

const W = { x0: -13, x1: 17.4, z0: -6.4, z1: 7.2, back: 7.5, low: 1.1 }
const ROW_X = [-9.4, -4.2, 0.6, 5.4, 11.2]
const SHOWER = { x: -3.15, h: 3, off: 1.05, w: 0.9, d: 0.32 }
const TECH = { x: -12.2, z: 2.6 }
const HEAD_PIVOT = new Vector3(0, 1.48, 0)
const UP = new Vector3(0, 1, 0)
const ONE = new Vector3(1, 1, 1)

const nearestRow = (x: number) => ROW_X.reduce((best, rx, i) => (Math.abs(rx - x) < Math.abs(ROW_X[best] - x) ? i : best), 0)

const STRIPS = Array.from({ length: 12 }, (_, i) => {
  const x = -10 + (i % 6) * 5.08
  const s = i < 6 ? { x, y: 7.12, z: W.z0 + 0.2, w: 3.6, h: 0.08, d: 0.2 } : { x, y: 6.35, z: 0.6, w: 3.6, h: 0.06, d: 0.3 }
  return { ...s, row: nearestRow(x) }
})

const NOZZLE_Y = Array.from({ length: 6 }, (_, k) => 0.6 + k * 0.38)

function segs(points: number[]) {
  const g = new BufferGeometry()
  g.setAttribute('position', new Float32BufferAttribute(points, 3))
  g.computeBoundingSphere()
  return g
}

function roundRect(w: number, d: number, r: number, steps = 4) {
  const rr = Math.min(r, w / 2, d / 2)
  const hx = w / 2 - rr, hz = d / 2 - rr
  const corners: [number, number, number][] = [[hx, hz, 0], [-hx, hz, Math.PI / 2], [-hx, -hz, Math.PI], [hx, -hz, Math.PI * 1.5]]
  const pts: [number, number][] = []
  for (const [cx, cz, a0] of corners)
    for (let s = 0; s <= steps; s++) {
      const a = a0 + (s / steps) * (Math.PI / 2)
      pts.push([cx + Math.cos(a) * rr, cz + Math.sin(a) * rr])
    }
  return pts
}

function loop(out: number[], pts: Vector3[], closed = true) {
  const n = closed ? pts.length : pts.length - 1
  for (let k = 0; k < n; k++) {
    const p = pts[k], q = pts[(k + 1) % pts.length]
    out.push(p.x, p.y, p.z, q.x, q.y, q.z)
  }
}

function seg(out: number[], a: Vector3, b: Vector3) {
  out.push(a.x, a.y, a.z, b.x, b.y, b.z)
}

const CORNER_MIDS = [2, 7, 12, 17]

function pod(out: number[], m: Matrix4, len: number, w0: number, d0: number, w1: number, d1: number, r: number, rings = 2) {
  const loops: Vector3[][] = []
  for (let i = 0; i < rings; i++) {
    const t = i / (rings - 1)
    const w = w0 + (w1 - w0) * t, d = d0 + (d1 - d0) * t
    const ring = roundRect(w, d, r).map(([x, z]) => new Vector3(x, len * t, z).applyMatrix4(m))
    loops.push(ring)
    loop(out, ring)
  }
  for (const k of CORNER_MIDS) for (let i = 0; i < rings - 1; i++) seg(out, loops[i][k], loops[i + 1][k])
}

const at = (x: number, y: number, z: number) => new Matrix4().makeTranslation(x, y, z)

function limb(out: number[], a: Vector3, b: Vector3, w0: number, w1: number, r: number) {
  const dir = b.clone().sub(a)
  const m = new Matrix4().compose(a, new Quaternion().setFromUnitVectors(UP, dir.clone().normalize()), ONE)
  pod(out, m, dir.length(), w0, w0, w1, w1, r)
}

function technician() {
  const out: number[] = []
  for (const s of [-1, 1]) {
    pod(out, at(0.04, 0, s * 0.11), 0.12, 0.3, 0.14, 0.27, 0.13, 0.05)
    pod(out, at(0, 0.12, s * 0.11), 0.3, 0.17, 0.16, 0.18, 0.17, 0.06)
    pod(out, at(0, 0.42, s * 0.11), 0.46, 0.19, 0.18, 0.22, 0.21, 0.07)
  }
  pod(out, at(0, 0.86, 0), 0.54, 0.25, 0.42, 0.29, 0.46, 0.1, 3)
  pod(out, at(0, 1.4, 0), 0.1, 0.29, 0.46, 0.24, 0.27, 0.1)
  seg(out, new Vector3(0.132, 0.9, 0), new Vector3(0.148, 1.38, 0))
  loop(out, roundRect(0.07, 0.05, 0.008).map(([z, y]) => new Vector3(0.147, 1.28 + y, -0.1 + z)))

  const arms: [Vector3, Vector3, Vector3][] = [
    [new Vector3(0, 1.36, 0.25), new Vector3(0.05, 1.08, 0.28), new Vector3(0.29, 1.1, 0.13)],
    [new Vector3(0, 1.36, -0.25), new Vector3(0.05, 1.09, -0.28), new Vector3(0.25, 1.17, -0.1)],
  ]
  for (const [shoulder, elbow, hand] of arms) {
    limb(out, shoulder, elbow, 0.12, 0.105, 0.045)
    limb(out, elbow, hand, 0.1, 0.085, 0.04)
    limb(out, hand, hand.clone().add(hand.clone().sub(elbow).normalize().multiplyScalar(0.09)), 0.08, 0.065, 0.03)
  }

  const board = new Matrix4().compose(new Vector3(0.36, 1.14, 0.02), new Quaternion().setFromEuler(new Euler(0, 0, 0.6)), ONE)
  const onBoard = (x: number, y: number, z: number) => new Vector3(x, y, z).applyMatrix4(board)
  const face = roundRect(0.31, 0.23, 0.015).map(([x, z]) => onBoard(x, 0, z))
  const back = roundRect(0.31, 0.23, 0.015).map(([x, z]) => onBoard(x, -0.012, z))
  loop(out, face)
  loop(out, back)
  for (const k of CORNER_MIDS) seg(out, face[k], back[k])
  loop(out, roundRect(0.045, 0.1, 0.01).map(([x, z]) => onBoard(0.135 + x, 0.008, z)))
  ;[0.16, 0.11, 0.14, 0.08].forEach((len, j) => {
    const x = 0.075 - j * 0.05
    seg(out, onBoard(x, 0.002, -0.085), onBoard(x, 0.002, -0.085 + len))
    loop(out, roundRect(0.022, 0.022, 0.003).map(([a, b]) => onBoard(x + a, 0.002, 0.08 + b)))
  })
  seg(out, new Vector3(0.3, 1.18, -0.08), onBoard(0.0, 0.003, -0.04))

  const headStart = out.length
  pod(out, at(0, 1.5, 0), 0.25, 0.24, 0.23, 0.2, 0.19, 0.09, 3)
  loop(out, [new Vector3(0.1, 1.75, 0), new Vector3(0.04, 1.772, 0), new Vector3(-0.04, 1.772, 0), new Vector3(-0.1, 1.75, 0)], false)
  const visor = roundRect(0.17, 0.1, 0.03).map(([z, y]) => new Vector3(0.122 - z * z * 1.3, 1.62 + y, z))
  loop(out, visor)
  seg(out, new Vector3(0.12, 1.645, -0.05), new Vector3(0.121, 1.6, -0.02))
  seg(out, new Vector3(0.12, 1.65, -0.025), new Vector3(0.121, 1.625, -0.012))
  loop(out, roundRect(0.1, 0.04, 0.015).map(([z, y]) => new Vector3(0.118 - z * z * 1.3, 1.545 + y, z)))
  return { points: out, head: [headStart / 3, out.length / 3] as const }
}

function wall(out: number[], a: [number, number], b: [number, number], h: number, step: number, rails: number[]) {
  const n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / step)
  for (let k = 0; k <= n; k++) {
    const x = a[0] + ((b[0] - a[0]) * k) / n, z = a[1] + ((b[1] - a[1]) * k) / n
    out.push(x, 0, z, x, h, z)
  }
  for (const y of rails) out.push(a[0], y, a[1], b[0], y, b[1])
  return n
}

function roomLines() {
  const out: number[] = []
  const tall = [0, 0.3, 2.7, W.back]
  const low = [0, 0.3, W.low]
  const nb = wall(out, [W.x0, W.z0], [W.x1, W.z0], W.back, 2.5, tall)
  const nl = wall(out, [W.x0, W.z0], [W.x0, W.z1], W.back, 2.5, tall)
  wall(out, [W.x1, W.z0], [W.x1, W.z1], W.low, 2.5, low)
  wall(out, [W.x0, W.z1], [W.x1, W.z1], W.low, 2.5, low)

  const soffit = 2.4
  for (let k = 0; k <= nb; k++) {
    const x = W.x0 + ((W.x1 - W.x0) * k) / nb
    out.push(x, W.back, W.z0, x, W.back, W.z0 + soffit)
  }
  out.push(W.x0, W.back, W.z0 + soffit, W.x1, W.back, W.z0 + soffit)
  for (let k = 0; k <= nl; k++) {
    const z = W.z0 + ((W.z1 - W.z0) * k) / nl
    out.push(W.x0, W.back, z, W.x0 + soffit, W.back, z)
  }
  out.push(W.x0 + soffit, W.back, W.z0, W.x0 + soffit, W.back, W.z1)

  for (const s of STRIPS) {
    boxEdges(out, s.x, s.y, s.z, s.w * 1.01, s.h * 1.3, s.d * 1.05)
    if (s.z > 0) for (const dx of [-1.5, 1.5]) out.push(s.x + dx, s.y + s.h / 2, s.z, s.x + dx, W.back, s.z)
  }
  out.push(W.x0, W.back, 0.6, W.x1, W.back, 0.6)

  for (const gx of [-9.2, -0.4, 7.2, 13.4]) {
    const z = W.z0 + 0.02
    out.push(gx - 0.7, 0.35, z, gx + 0.7, 0.35, z, gx - 0.7, 0.85, z, gx + 0.7, 0.85, z, gx - 0.7, 0.35, z, gx - 0.7, 0.85, z, gx + 0.7, 0.35, z, gx + 0.7, 0.85, z)
    for (let k = 1; k < 6; k++) out.push(gx - 0.62, 0.35 + k * 0.083, z, gx + 0.62, 0.35 + k * 0.083, z)
  }

  const z = W.z0 + 0.03
  out.push(8.6 - 1.5, 4.0, z, 8.6 + 1.5, 4.0, z, 8.6 - 1.5, 5.2, z, 8.6 + 1.5, 5.2, z, 8.6 - 1.5, 4.0, z, 8.6 - 1.5, 5.2, z, 8.6 + 1.5, 4.0, z, 8.6 + 1.5, 5.2, z)
  out.push(8.6 - 1.2, 5.2, z, 8.6 - 1.2, W.back, z, 8.6 + 1.2, 5.2, z, 8.6 + 1.2, W.back, z)

  const mat = { x0: TECH.x - 0.65, x1: TECH.x + 0.65, z0: TECH.z - 1.2, z1: TECH.z + 1.2, y: 0.006 }
  out.push(mat.x0, mat.y, mat.z0, mat.x1, mat.y, mat.z0, mat.x0, mat.y, mat.z1, mat.x1, mat.y, mat.z1, mat.x0, mat.y, mat.z0, mat.x0, mat.y, mat.z1, mat.x1, mat.y, mat.z0, mat.x1, mat.y, mat.z1)
  for (let zz = mat.z0 + 0.3; zz < mat.z1 - 0.01; zz += 0.3) out.push(mat.x0 + 0.08, mat.y, zz, mat.x1 - 0.08, mat.y, zz)

  for (const side of [-1, 1]) {
    const pz = BELT.z + side * SHOWER.off
    boxEdges(out, SHOWER.x, SHOWER.h / 2, pz, SHOWER.w, SHOWER.h, SHOWER.d)
    const fz = pz - side * (SHOWER.d / 2 + 0.004)
    for (const ny of NOZZLE_Y) {
      const ring = Array.from({ length: 12 }, (_, k) => {
        const a = (k / 12) * Math.PI * 2
        return new Vector3(SHOWER.x + Math.cos(a) * 0.07, ny + Math.sin(a) * 0.07, fz)
      })
      loop(out, ring)
      loop(out, ring.map((p) => new Vector3(SHOWER.x + (p.x - SHOWER.x) * 0.45, ny + (p.y - ny) * 0.45, fz)))
    }
    out.push(SHOWER.x - SHOWER.w / 2 + 0.06, 0.32, fz, SHOWER.x + SHOWER.w / 2 - 0.06, 0.32, fz)
  }
  const lintelD = SHOWER.off * 2 + SHOWER.d
  boxEdges(out, SHOWER.x, SHOWER.h + 0.18, BELT.z, SHOWER.w, 0.36, lintelD)
  for (let k = 1; k < 8; k++) {
    const lz = BELT.z - lintelD / 2 + (lintelD * k) / 8
    out.push(SHOWER.x - SHOWER.w / 2, SHOWER.h - 0.002, lz, SHOWER.x + SHOWER.w / 2, SHOWER.h - 0.002, lz)
  }
  return out
}

function gridLines() {
  const out: number[] = []
  const y = 0.002
  for (let x = W.x0; x <= W.x1 + 1e-6; x += 0.6) out.push(x, y, W.z0, x, y, W.z1)
  for (let z = W.z0; z <= W.z1 + 1e-6; z += 0.6) out.push(W.x0, y, z, W.x1, y, z)
  out.push(W.x1, y, W.z0, W.x1, y, W.z1, W.x0, y, W.z1, W.x1, y, W.z1)
  return out
}

function showerShell() {
  const parts = [-1, 1].map((side) => new BoxGeometry(SHOWER.w, SHOWER.h, SHOWER.d).translate(SHOWER.x, SHOWER.h / 2, BELT.z + side * SHOWER.off))
  parts.push(new BoxGeometry(SHOWER.w, 0.36, SHOWER.off * 2 + SHOWER.d).translate(SHOWER.x, SHOWER.h + 0.18, BELT.z))
  const merged = mergeGeometries(parts)
  for (const p of parts) p.dispose()
  return merged
}

function drawCounter(value: number) {
  const n = Math.max(0, Math.round(value))
  const purge = n > 20
  return textTexture(512, 200, (ctx) => {
    ctx.fillStyle = '#07090A'
    ctx.fillRect(0, 0, 512, 200)
    ctx.strokeStyle = '#1D2B22'
    ctx.lineWidth = 3
    ctx.strokeRect(1.5, 1.5, 509, 197)
    ctx.fillStyle = '#3E9E66'
    ctx.font = `500 22px ${MONO}`
    ctx.fillText('PARTICLES ≥0.5µm / ft³', 24, 40)
    ctx.fillStyle = purge ? '#B6FFD2' : '#6CF5A6'
    ctx.font = `600 96px ${MONO}`
    ctx.fillText(String(n).padStart(3, '0'), 22, 142)
    ctx.textAlign = 'right'
    ctx.fillStyle = '#3E9E66'
    ctx.font = `500 20px ${MONO}`
    ctx.fillText('ISO 5', 488, 82)
    ctx.fillText('LIMIT 100', 488, 108)
    ctx.fillStyle = purge ? '#B6FFD2' : '#6CF5A6'
    ctx.fillText(purge ? '● PURGE' : '● NOMINAL', 488, 140)
    ctx.textAlign = 'left'
    for (let k = 0; k < 32; k++) {
      ctx.fillStyle = k / 32 < Math.min(1, n / 100) ? '#6CF5A6' : '#16241B'
      ctx.fillRect(24 + k * 14.5, 166, 10, 14)
    }
  })
}

export function Cleanroom({ look, energy, sim }: { look: Look; energy: Energy; sim: Sim }) {
  const geo = useMemo(() => {
    const tech = technician()
    const techGeo = segs(tech.points)
    const pos = techGeo.getAttribute('position')
    return {
      room: segs(roomLines()),
      grid: segs(gridLines()),
      shell: showerShell(),
      tech: techGeo,
      headRange: tech.head,
      headBase: (pos.array as Float32Array).slice(tech.head[0] * 3, tech.head[1] * 3),
      strip: new BoxGeometry(1, 1, 1),
      streak: new BoxGeometry(0.02, 0.02, 0.35),
    }
  }, [])
  useEffect(
    () => () => {
      for (const g of [geo.room, geo.grid, geo.shell, geo.tech, geo.strip, geo.streak]) g.dispose()
    },
    [geo],
  )

  const mats = useMemo(
    () => ({
      floor: new MeshStandardMaterial({ color: look.floor, roughness: 0.92, metalness: 0 }),
      grid: new LineBasicMaterial({ color: look.floorEdge }),
      edge: new LineBasicMaterial({ color: look.edge }),
      glass: new MeshBasicMaterial({ color: look.lamp, transparent: true, opacity: look.dark ? 0.06 : 0.1, side: DoubleSide, depthWrite: false }),
      shell: new MeshStandardMaterial({ color: look.surface, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 }),
      strip: new MeshBasicMaterial({ color: '#ffffff', toneMapped: false }),
      streak: new MeshBasicMaterial({ color: look.accent, toneMapped: false }),
      lamp: new Color(look.lamp),
      dim: new Color(look.dim),
    }),
    [look],
  )
  useEffect(
    () => () => {
      for (const m of [mats.floor, mats.grid, mats.edge, mats.glass, mats.shell, mats.strip, mats.streak]) m.dispose()
    },
    [mats],
  )

  const sign = useMemo(
    () =>
      textTexture(1024, 128, (ctx) => {
        ctx.fillStyle = look.surface
        ctx.fillRect(0, 0, 1024, 128)
        ctx.strokeStyle = look.edge
        ctx.lineWidth = 3
        ctx.strokeRect(6, 6, 1012, 116)
        ctx.fillStyle = look.fg
        ctx.font = `500 54px ${FONT}`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText('ISO 5  ·  CLASS 100  ·  GOWN UP', 512, 66)
      }),
    [look],
  )
  const plate = useMemo(
    () =>
      textTexture(512, 96, (ctx) => {
        ctx.fillStyle = look.surface
        ctx.fillRect(0, 0, 512, 96)
        ctx.strokeStyle = look.edge
        ctx.lineWidth = 3
        ctx.strokeRect(4, 4, 504, 88)
        ctx.fillStyle = look.fg
        ctx.font = `600 40px ${FONT}`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText('AIR SHOWER', 256, 50)
      }),
    [look],
  )
  useEffect(() => () => sign.dispose(), [sign])
  useEffect(() => () => plate.dispose(), [plate])

  const firstCounter = useMemo(() => drawCounter(4), [])
  const counter = useRef<MeshBasicMaterial>(null)
  const st = useRef({ next: 0.5, peak: 0, last: 0, tex: null as CanvasTexture | null, applied: 0, e: new Float32Array(12).fill(-1) })
  useEffect(() => {
    const s = st.current
    s.tex = firstCounter
    return () => {
      s.tex?.dispose()
      firstCounter.dispose()
      s.tex = null
    }
  }, [firstCounter])

  const strips = useRef<InstancedMesh>(null)
  const streaks = useRef<InstancedMesh>(null)
  const tech = useRef<LineSegments>(null)
  const label = useRef<Mesh>(null)
  const bulb = useRef<PointLight>(null)
  const dummy = useMemo(() => new Object3D(), [])
  const tmp = useMemo(() => new Color(), [])

  useLayoutEffect(() => {
    const m = strips.current
    if (!m) return
    STRIPS.forEach((s, i) => {
      dummy.position.set(s.x, s.y, s.z)
      dummy.rotation.set(0, 0, 0)
      dummy.scale.set(s.w, s.h, s.d)
      dummy.updateMatrix()
      m.setMatrixAt(i, dummy.matrix)
      m.setColorAt(i, mats.dim)
    })
    m.instanceMatrix.needsUpdate = true
    if (m.instanceColor) m.instanceColor.needsUpdate = true
    st.current.e.fill(-1)
  }, [dummy, mats])

  useFrame(({ camera }) => {
    const t = sim.time
    const idle = sim.idleTime
    const s = st.current
    const dt = Math.max(0, Math.min(0.1, t - s.last))
    s.last = t
    const a = Math.max(0, sim.air)

    const m = strips.current
    if (m && m.instanceColor) {
      let dirty = false
      for (let i = 0; i < STRIPS.length; i++) {
        const e = Math.min(1, Math.max(0, (energy.rows[STRIPS[i].row] ?? 1) * energy.all))
        if (Math.abs(e - s.e[i]) < 0.002) continue
        s.e[i] = e
        m.setColorAt(i, tmp.lerpColors(mats.dim, mats.lamp, e))
        dirty = true
      }
      if (dirty) m.instanceColor.needsUpdate = true
    }

    const sh = streaks.current
    if (sh) {
      sh.visible = a > 0
      if (a > 0) {
        const k = Math.min(1, a * 3 + 0.25)
        for (let i = 0; i < 24; i++) {
          const side = i < 12 ? -1 : 1
          const ny = NOZZLE_Y[i % 6]
          const u = (t * 2.4 + ((i * 0.618) % 1)) % 1
          const len = k * (1 - u * 0.8)
          dummy.position.set(
            SHOWER.x + (((i * 0.37) % 1) - 0.5) * 0.5,
            ny + (1.15 - ny) * u * 0.35,
            BELT.z + side * (SHOWER.off - SHOWER.d / 2 - 0.175 * len - u * 0.6),
          )
          dummy.rotation.set(0, 0, 0)
          dummy.scale.set(1, 1, Math.max(0.01, len))
          dummy.updateMatrix()
          sh.setMatrixAt(i, dummy.matrix)
        }
        sh.instanceMatrix.needsUpdate = true
      }
    }

    s.peak = Math.max(s.peak * (1 - damp(dt, 1.2)), a)
    if (s.peak < 0.01) s.peak = 0
    const mat = counter.current
    if (mat && idle >= s.next) {
      s.next = idle + 0.5
      const tex = drawCounter(3 + (Math.sin(idle * 1.3) + 1) * 2 + Math.sin(idle * 3.7) * 0.8 + s.peak * 40)
      mat.map = tex
      mat.needsUpdate = true
      if (s.tex && s.tex !== firstCounter) s.tex.dispose()
      s.tex = tex
    }

    if (label.current) label.current.quaternion.copy(camera.quaternion)
    if (bulb.current) bulb.current.intensity = (look.dark ? 28 : 10) * energy.all

    const fig = tech.current
    if (fig) {
      fig.rotation.z = Math.sin(idle * 0.45) * 0.03
      const yaw = sim.airLook * 0.32
      if (Math.abs(yaw - s.applied) > 1e-4 || (yaw === 0 && s.applied !== 0)) {
        s.applied = yaw
        const pos = geo.tech.getAttribute('position')
        const arr = pos.array as Float32Array
        const c = Math.cos(yaw), sn = Math.sin(yaw)
        const base = geo.headBase
        const o = geo.headRange[0] * 3
        for (let j = 0; j < base.length; j += 3) {
          const x = base[j] - HEAD_PIVOT.x, z = base[j + 2] - HEAD_PIVOT.z
          arr[o + j] = HEAD_PIVOT.x + x * c + z * sn
          arr[o + j + 2] = HEAD_PIVOT.z - x * sn + z * c
        }
        pos.needsUpdate = true
      }
    }
  }, APPLY)

  const cx = (W.x0 + W.x1) / 2, cz = (W.z0 + W.z1) / 2
  const sx = W.x1 - W.x0, sz = W.z1 - W.z0

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[cx, -0.005, cz]} material={mats.floor}>
        <planeGeometry args={[sx, sz]} />
      </mesh>
      <lineSegments geometry={geo.grid} material={mats.grid} />

      <mesh position={[cx, W.back / 2, W.z0]} material={mats.glass}>
        <planeGeometry args={[sx, W.back]} />
      </mesh>
      <mesh position={[W.x0, W.back / 2, cz]} rotation={[0, Math.PI / 2, 0]} material={mats.glass}>
        <planeGeometry args={[sz, W.back]} />
      </mesh>
      <mesh position={[W.x1, W.low / 2, cz]} rotation={[0, Math.PI / 2, 0]} material={mats.glass}>
        <planeGeometry args={[sz, W.low]} />
      </mesh>
      <mesh position={[cx, W.low / 2, W.z1]} material={mats.glass}>
        <planeGeometry args={[sx, W.low]} />
      </mesh>
      <lineSegments geometry={geo.room} material={mats.edge} />

      <instancedMesh ref={strips} args={[geo.strip, mats.strip, STRIPS.length]} frustumCulled={false} />
      <pointLight ref={bulb} position={[1, 6, 1]} color={look.lamp} intensity={0} decay={2} />

      <mesh position={[-3.6, 4.6, W.z0 + 0.05]}>
        <planeGeometry args={[6.4, 0.8]} />
        <meshBasicMaterial map={sign} toneMapped={false} />
      </mesh>
      <mesh position={[8.6, 4.6, W.z0 + 0.05]}>
        <planeGeometry args={[2.8, 1.094]} />
        <meshBasicMaterial ref={counter} map={firstCounter} toneMapped={false} />
      </mesh>

      <mesh geometry={geo.shell} material={mats.shell} />
      <mesh ref={label} position={[SHOWER.x, SHOWER.h + 0.72, BELT.z]}>
        <planeGeometry args={[2.0, 0.375]} />
        <meshBasicMaterial map={plate} toneMapped={false} />
      </mesh>
      <instancedMesh ref={streaks} args={[geo.streak, mats.streak, 24]} frustumCulled={false} visible={false} />

      <lineSegments ref={tech} geometry={geo.tech} material={mats.edge} position={[TECH.x, 0, TECH.z]} />
    </group>
  )
}
