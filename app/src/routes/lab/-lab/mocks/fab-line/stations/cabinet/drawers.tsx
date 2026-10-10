import { useFrame } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { BufferGeometry, Float32BufferAttribute, Matrix4, Quaternion, Sphere, Vector3 } from 'three'
import type { InstancedMesh, LineSegments as ThreeLineSegments, Mesh } from 'three'

import type { CabinetProps, CabinetVariant, Tokens } from '../../core/contract'
import { Body } from '../../core/scene'
import { FONT, box, fillMat, lineMat, mergeEdges, textTexture, tint } from '../../core/three'
import type { Piece } from '../../core/three'

/** Three columns of drawers behind the pick table, one per aisle. */
const CABINET = { x0: -13.5, cols: 3, rows: 6, w: 2.0, h: 0.5, d: 2.0, gapX: 2.1, gapY: 0.6, base: 0.75, front: -2.5 }

/** Sliding drawers must not be raycast against the sphere three.js caches on the first hit, so the mesh gets one that covers every drawer fully open. */
const DRAWER_SPHERE = new Sphere(new Vector3(CABINET.x0 + CABINET.gapX, CABINET.base + (CABINET.rows * CABINET.gapY) / 2, CABINET.front - CABINET.d / 2 + 0.4), 7)

function drawer(cat: number, out: Vector3) {
  const col = cat % CABINET.cols, row = Math.floor(cat / CABINET.cols)
  return out.set(CABINET.x0 + col * CABINET.gapX, CABINET.base + (CABINET.rows - 1 - row) * CABINET.gapY + CABINET.h / 2, CABINET.front + 0.1)
}

/** The carcass: top, plinth, back and sides as one fill and one hairline draw. */
function Frame({ c }: { c: Tokens }) {
  const pieces = useMemo((): Piece[] => {
    const width = CABINET.gapX * CABINET.cols + 0.1
    const height = CABINET.gapY * CABINET.rows + 0.1
    const cx = CABINET.x0 + CABINET.gapX, cz = CABINET.front - CABINET.d / 2 - 0.05
    return [
      { geo: box(width, 0.12, CABINET.d + 0.2), at: [cx, CABINET.base + height + 0.02, cz] },
      { geo: box(width, CABINET.base, CABINET.d + 0.2), at: [cx, CABINET.base / 2, cz] },
      { geo: box(width, height, 0.1), at: [cx, CABINET.base + height / 2, CABINET.front - CABINET.d - 0.1] },
      { geo: box(0.1, height, CABINET.d + 0.2), at: [CABINET.x0 - CABINET.gapX / 2 - 0.05, CABINET.base + height / 2, cz] },
      { geo: box(0.1, height, CABINET.d + 0.2), at: [CABINET.x0 + CABINET.gapX * 2.5 + 0.05, CABINET.base + height / 2, cz] },
    ]
  }, [])
  return <Body id="cabinet" c={c} fill={c.surface} edge={c.edge} pieces={pieces} />
}

function Drawers({ aisles, active, matches, onOpen, c, tip, guard }: CabinetProps) {
  const n = aisles.length
  const bodies = useRef<InstancedMesh>(null)
  const edges = useRef<ThreeLineSegments>(null)
  const labels = useRef<Mesh>(null)
  const offsets = useRef<Float32Array>(new Float32Array(0))
  if (offsets.current.length !== n) offsets.current = new Float32Array(n)
  const cols = CABINET.cols, rows = Math.ceil(n / cols)
  const atlas = useMemo(
    () =>
      textTexture(cols * 512, Math.max(1, rows) * 128, (ctx) => {
        aisles.forEach((aisle, i) => {
          const ox = (i % cols) * 512, oy = Math.floor(i / cols) * 128
          const none = matches && !matches[i]
          ctx.save()
          ctx.translate(ox, oy)
          ctx.fillStyle = c.surface
          ctx.fillRect(0, 0, 512, 128)
          ctx.globalAlpha = none ? 0.3 : 1
          ctx.fillStyle = tint(aisle.hue, c.s, c.l)
          ctx.fillRect(26, 38, 12, 52)
          ctx.fillStyle = c.fg
          ctx.font = `500 44px ${FONT}`
          ctx.textBaseline = 'middle'
          ctx.fillText(aisle.label.length > 13 ? `${aisle.label.slice(0, 12)}…` : aisle.label, 58, 66)
          ctx.fillStyle = matches && matches[i] ? c.accent : c.muted
          ctx.font = `400 34px ${FONT}`
          ctx.textAlign = 'right'
          ctx.fillText(matches ? `${matches[i]}/${aisle.count}` : String(aisle.count), 486, 66)
          ctx.restore()
        })
      }),
    [aisles, c, matches, cols, rows],
  )
  useEffect(() => () => atlas.dispose(), [atlas])
  const geo = useMemo(() => {
    const edge = mergeEdges([{ geo: box(CABINET.w, CABINET.h, CABINET.d) }])
    const base = edge.getAttribute('position').array as Float32Array
    const edgePos = new Float32Array(base.length * n)
    const labelPos = new Float32Array(n * 4 * 3), uv = new Float32Array(n * 4 * 2), idx: number[] = []
    for (let i = 0; i < n; i++) {
      const u0 = (i % cols) / cols, u1 = u0 + 1 / cols
      const v1 = 1 - Math.floor(i / cols) / rows, v0 = v1 - 1 / rows
      uv.set([u0, v0, u1, v0, u1, v1, u0, v1], i * 8)
      idx.push(i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3)
    }
    const lg = new BufferGeometry()
    lg.setAttribute('position', new Float32BufferAttribute(labelPos, 3))
    lg.setAttribute('uv', new Float32BufferAttribute(uv, 2))
    lg.setIndex(idx)
    const eg = new BufferGeometry()
    eg.setAttribute('position', new Float32BufferAttribute(edgePos, 3))
    return { base, edges: eg, labels: lg }
  }, [n, cols, rows])
  useEffect(() => () => { geo.edges.dispose(); geo.labels.dispose() }, [geo])
  useLayoutEffect(() => {
    if (bodies.current) bodies.current.boundingSphere = DRAWER_SPHERE
  }, [n])
  const dirty = useRef(true)
  const prevActive = useRef(-1)
  const m = useMemo(() => ({ mat: new Matrix4(), q: new Quaternion(), p: new Vector3(), s: new Vector3(1, 1, 1) }), [])
  useFrame((_, dt) => {
    const bm = bodies.current, em = edges.current, lm = labels.current
    if (!bm || !em || !lm) return
    if (prevActive.current !== active) { prevActive.current = active; dirty.current = true }
    const off = offsets.current
    let moving = false
    for (let i = 0; i < n; i++) {
      const want = i === active ? 0.75 : 0
      const next = off[i] + (want - off[i]) * (1 - Math.exp(-dt * 10))
      if (Math.abs(next - off[i]) > 1e-4) moving = true
      off[i] = next
    }
    if (!moving && !dirty.current) return
    dirty.current = moving
    const ep = em.geometry.getAttribute('position') as Float32BufferAttribute
    const lp = lm.geometry.getAttribute('position') as Float32BufferAttribute
    const per = geo.base.length
    for (let i = 0; i < n; i++) {
      const col = i % cols, row = Math.floor(i / cols)
      const x = CABINET.x0 + col * CABINET.gapX, y = CABINET.base + (CABINET.rows - 1 - row) * CABINET.gapY + CABINET.h / 2, z = CABINET.front - CABINET.d / 2 + off[i]
      bm.setMatrixAt(i, m.mat.compose(m.p.set(x, y, z), m.q, m.s))
      for (let k = 0; k < per; k += 3) {
        ep.array[i * per + k] = geo.base[k] + x
        ep.array[i * per + k + 1] = geo.base[k + 1] + y
        ep.array[i * per + k + 2] = geo.base[k + 2] + z
      }
      const fz = z + CABINET.d / 2 + 0.004, hw = CABINET.w / 2, hh = CABINET.h / 2
      lp.array.set([x - hw, y - hh, fz, x + hw, y - hh, fz, x + hw, y + hh, fz, x - hw, y + hh, fz], i * 12)
    }
    bm.instanceMatrix.needsUpdate = true
    ep.needsUpdate = true
    lp.needsUpdate = true
    em.geometry.computeBoundingSphere()
    lm.geometry.computeBoundingSphere()
  })
  const at = (e: { instanceId?: number }) => (e.instanceId !== undefined && e.instanceId < n ? e.instanceId : -1)
  return (
    <group>
      <instancedMesh
        ref={bodies}
        key={n}
        args={[undefined, undefined, n]}
        material={fillMat(c.surface, c.flat, c.rough)}
        frustumCulled={false}
        onClick={(e) => { e.stopPropagation(); const i = at(e); if (i >= 0 && !guard.moved) onOpen(i) }}
        onPointerOver={(e) => { e.stopPropagation(); const i = at(e); if (i < 0) return; const a = aisles[i]; tip.show(e.nativeEvent, a.label, `Aisle ${String(a.no).padStart(2, '0')} · ${a.count} parts · ${a.racks.length} registries · click to open`) }}
        onPointerMove={(e) => tip.move(e.nativeEvent)}
        onPointerOut={() => tip.hide()}
      >
        <boxGeometry args={[CABINET.w, CABINET.h, CABINET.d]} />
      </instancedMesh>
      <lineSegments ref={edges} geometry={geo.edges} material={lineMat(c.edge)} frustumCulled={false} />
      <mesh ref={labels} geometry={geo.labels} frustumCulled={false}>
        <meshBasicMaterial map={atlas} toneMapped={false} />
      </mesh>
      <ActiveDrawer offsets={offsets} active={active} c={c} />
      <Frame c={c} />
    </group>
  )
}

/** The open drawer's hairline in the accent, redrawn each frame on top of the shared edges. */
function ActiveDrawer({ offsets, active, c }: { offsets: { current: Float32Array }; active: number; c: Tokens }) {
  const ref = useRef<ThreeLineSegments>(null)
  const geo = useMemo(() => mergeEdges([{ geo: box(CABINET.w + 0.01, CABINET.h + 0.01, CABINET.d + 0.01) }]), [])
  useFrame(() => {
    const l = ref.current
    if (!l) return
    l.visible = active >= 0
    if (!l.visible) return
    const col = active % CABINET.cols, row = Math.floor(active / CABINET.cols)
    l.position.set(CABINET.x0 + col * CABINET.gapX, CABINET.base + (CABINET.rows - 1 - row) * CABINET.gapY + CABINET.h / 2, CABINET.front - CABINET.d / 2 + (offsets.current[active] ?? 0))
  })
  return <lineSegments ref={ref} geometry={geo} material={lineMat(c.accent)} frustumCulled={false} />
}

export const drawers: CabinetVariant = {
  id: 'drawers',
  label: 'Drawers',
  footprint: { x0: -14.6, x1: -8.2, z0: -4.65, z1: -2.45, h: 4.57 },
  frame: [[-14.9, 0, -4.7], [-14.9, 4.6, -2.4], [-7.9, 4.6, -2.4], [-7.9, 0, -1.6]],
  el: 22,
  drawer,
  Component: Drawers,
}
