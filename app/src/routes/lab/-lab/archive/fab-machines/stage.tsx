import { useFrame } from '@react-three/fiber'
import { Grid } from '@react-three/drei'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { InstancedMesh, Matrix4, Mesh, MeshBasicMaterial, Quaternion, Sphere, Vector3 } from 'three'

import type { Aisle } from '../../warehouse'
import { FONT, Flat, Hairline, LABEL_ORDER, MONO, Solid, atlasTexture, drawPlate, fillMat, flushQuads, quadGeometry, segmentWriter, setQuad, textTexture, tint, useSegments, useTexture } from './kit/hairline'
import type { Guard, Look, Tip } from './kit/hairline'
import { DRAWER, HANGAR, INTEGRATORS, KIT_PAD, PAD, PORT, STORAGES, STORE_HOME, STORE_PAD, TABLE, TABLE_Y, TRANSPORTS, drawerPos, machine, padOf, padPos } from './sim'
import type { Rig, Sim, SlotKey } from './sim'

const M = new Matrix4()
const Q = new Quaternion()
const P = new Vector3()
const S = new Vector3()

export function Floor({ c, rig, ready }: { c: Look; rig: Rig; ready: boolean }) {
  const dark = c.theme === 'dark'
  const sheet = useCallback(() => {
    const b = new Hairline()
    b.rect(-14.5, -11, 20, 9.6, 0.01).rect(-14.1, -10.6, 19.6, 9.2, 0.01)
    b.poly([[-12.6, 0.02, -8.8], [-12.6, 0.02, -10.6]]).poly([[-12.95, 0.02, -10.1], [-12.6, 0.02, -10.6], [-12.25, 0.02, -10.1]])
    for (let k = 0; k <= 8; k++) b.seg(-13.6 + k * 0.5, 0.02, 8.6, -13.6 + k * 0.5, 0.02, 8.6 - (k % 2 ? 0.18 : 0.34))
    b.seg(-13.6, 0.02, 8.6, -9.6, 0.02, 8.6)
    return b.build()
  }, [])
  return (
    <group>
      <Grid
        args={[160, 160]}
        cellSize={0.5}
        cellThickness={0.6}
        cellColor={c.grid}
        sectionSize={2.5}
        sectionThickness={1}
        sectionColor={c.section}
        fadeDistance={110}
        fadeStrength={1.4}
        infiniteGrid
      />
      <Solid build={sheet} fill={c.surface} edge={dark ? c.dim : c.edge} />
      {ready && <TitleBlock c={c} rig={rig} />}
    </group>
  )
}

/** The drawing's title block: the deployed rig as a revision table on the floor. */
function TitleBlock({ c, rig }: { c: Look; rig: Rig }) {
  const block = useTexture(
    () =>
      textTexture(1024, 512, (ctx) => {
        ctx.scale(0.5, 0.5)
        ctx.strokeStyle = c.edge
        ctx.lineWidth = 6
        ctx.strokeRect(8, 8, 2032, 1008)
        ctx.lineWidth = 3
        ctx.beginPath()
        for (const y of [250, 440, 630, 820]) {
          ctx.moveTo(8, y)
          ctx.lineTo(2040, y)
        }
        ctx.moveTo(560, 250)
        ctx.lineTo(560, 1016)
        ctx.stroke()
        ctx.fillStyle = c.fg
        ctx.font = `600 120px ${FONT}`
        ctx.fillText('PAYLOAD TOOLKIT', 60, 170)
        ctx.font = `500 54px ${MONO}`
        ctx.fillStyle = c.muted
        ctx.textAlign = 'right'
        ctx.fillText('FAB MACHINES · PT-006 · REV A', 1980, 160)
        ctx.textAlign = 'left'
        const rows: [string, string][] = (['integrator', 'transport', 'cell', 'storage'] as const).map((slot) => {
          const m = machine(slot, rig[slot])
          return [m.role.toUpperCase(), `${m.brand} · ${m.model}`]
        })
        rows.forEach(([k, v], i) => {
          const y = 375 + i * 190
          ctx.fillStyle = c.muted
          ctx.font = `500 56px ${MONO}`
          ctx.fillText(k, 60, y)
          ctx.fillStyle = c.fg
          ctx.font = `500 88px ${FONT}`
          ctx.fillText(v, 620, y + 8)
        })
      }),
    [c, rig],
  )
  return <Flat texture={block} size={[7.6, 3.8]} position={[-2.4, 0.02, 7.2]} />
}

const CABINET_SPHERE = new Sphere(new Vector3(DRAWER.x0 + DRAWER.gapX, DRAWER.base + DRAWER.gapY * 3, DRAWER.front - 1), 6)

export function Cabinet({ aisles, sim, active, matches, onOpen, c, tip, guard, ready, text }: {
  aisles: readonly Aisle[]; sim: Sim; active: number; matches: number[] | null; onOpen: (i: number) => void; c: Look; tip: Tip; guard: Guard; ready: boolean; text: boolean
}) {
  const mesh = useRef<InstancedMesh>(null)
  const edges = useSegments(16 * 12, c.edge)
  const hot = useSegments(12, c.accent)
  const width = DRAWER.gapX * 3 + 0.1
  const height = DRAWER.gapY * 6 + 0.1
  const shell = useCallback(() => {
    const b = new Hairline()
    const cx = DRAWER.x0 + DRAWER.gapX, cz = DRAWER.front - DRAWER.d / 2 - 0.05
    b.box(width, 0.12, DRAWER.d + 0.2, cx, DRAWER.base + height + 0.02, cz)
    b.box(width, DRAWER.base, DRAWER.d + 0.2, cx, DRAWER.base / 2, cz)
    b.box(width, height, 0.1, cx, DRAWER.base + height / 2, DRAWER.front - DRAWER.d - 0.1)
    for (const x of [DRAWER.x0 - DRAWER.gapX / 2 - 0.02, DRAWER.x0 + DRAWER.gapX * 2.5 + 0.02]) b.box(0.06, height, DRAWER.d + 0.2, x, DRAWER.base + height / 2, cz)
    return b.build()
  }, [width, height])
  useLayoutEffect(() => {
    mesh.current!.boundingSphere = CABINET_SPHERE
  }, [])
  useFrame(() => {
    const m = mesh.current
    if (!m) return
    const w = segmentWriter(edges)
    const h = segmentWriter(hot)
    for (let i = 0; i < aisles.length; i++) {
      drawerPos(i, P)
      P.z = DRAWER.front - DRAWER.d / 2 + (sim.drawers[i] ?? 0)
      m.setMatrixAt(i, M.compose(P, Q.identity(), S.set(DRAWER.w, DRAWER.h, DRAWER.d)))
      ;(i === active ? h : w).box(P.x, P.y, P.z, DRAWER.w / 2, DRAWER.h / 2, DRAWER.d / 2)
    }
    w.done()
    h.done()
    m.instanceMatrix.needsUpdate = true
  })
  const sub = (i: number) => `Aisle ${String(aisles[i].no).padStart(2, '0')} · ${aisles[i].count.toLocaleString()} parts · ${aisles[i].racks.length} registries`
  return (
    <group>
      <Solid build={shell} fill={c.surface} edge={c.edge} />
      <instancedMesh
        ref={mesh}
        args={[undefined, fillMat(c.surface), aisles.length]}
        frustumCulled={false}
        onClick={(e) => { e.stopPropagation(); if (!guard.moved && e.instanceId !== undefined) onOpen(e.instanceId) }}
        onPointerOver={(e) => { e.stopPropagation(); if (e.instanceId !== undefined) tip.show(e.nativeEvent, aisles[e.instanceId].label, sub(e.instanceId)) }}
        onPointerMove={(e) => tip.move(e.nativeEvent)}
        onPointerOut={() => tip.hide()}
      >
        <boxGeometry args={[1, 1, 1]} />
      </instancedMesh>
      <primitive object={edges} />
      <primitive object={hot} />
      {ready && <DrawerFronts aisles={aisles} sim={sim} matches={matches} c={c} text={text} />}
    </group>
  )
}

/**
 * Every drawer's label in one atlas and one quad geometry: one draw for the
 * whole cabinet face. Without `text` (phones, where type this small cannot be
 * read) a drawer shows only its aisle's hue tab.
 */
function DrawerFronts({ aisles, sim, matches, c, text }: { aisles: readonly Aisle[]; sim: Sim; matches: number[] | null; c: Look; text: boolean }) {
  const atlas = useMemo(
    () =>
      atlasTexture(
        512,
        aisles.map((aisle, i) => ({
          w: 512,
          h: 128,
          draw: (ctx: CanvasRenderingContext2D) => {
            const none = matches && !matches[i]
            ctx.fillStyle = c.surface
            ctx.fillRect(0, 0, 512, 128)
            ctx.globalAlpha = none ? 0.3 : 1
            ctx.fillStyle = tint(aisle.hue, c)
            if (!text) {
              ctx.fillRect(24, 40, 464, 48)
              return
            }
            ctx.fillRect(24, 36, 14, 56)
            ctx.fillStyle = c.fg
            ctx.font = `500 46px ${FONT}`
            ctx.fillText(aisle.label.length > 12 ? `${aisle.label.slice(0, 11)}…` : aisle.label, 58, 80)
            ctx.fillStyle = matches && matches[i] ? c.accent : c.muted
            ctx.font = `400 36px ${FONT}`
            ctx.textAlign = 'right'
            ctx.fillText(matches ? `${matches[i]}/${aisle.count}` : String(aisle.count), 492, 80)
          },
        })),
      ),
    [aisles, c, matches, text],
  )
  const quads = useMemo(() => {
    const m = new Mesh(quadGeometry(aisles.length), new MeshBasicMaterial({ map: atlas.texture, toneMapped: false }))
    m.frustumCulled = false
    m.raycast = () => {}
    return m
  }, [aisles.length, atlas])
  useEffect(
    () => () => {
      quads.geometry.dispose()
      quads.material.dispose()
      atlas.texture.dispose()
    },
    [quads, atlas],
  )
  const last = useRef<number[]>([])
  useFrame(() => {
    const g = quads.geometry
    let moved = last.current.length !== aisles.length
    for (let i = 0; i < aisles.length && !moved; i++) moved = last.current[i] !== sim.drawers[i]
    if (!moved) return
    last.current = sim.drawers.slice()
    for (let i = 0; i < aisles.length; i++) {
      drawerPos(i, P)
      setQuad(g, i, P.x, P.y, DRAWER.front + (sim.drawers[i] ?? 0) + 0.002, (DRAWER.w - 0.08) / 2, 0, 0, 0, (DRAWER.h - 0.08) / 2, 0, atlas.uv[i])
    }
    flushQuads(g, aisles.length)
  })
  return <primitive object={quads} />
}

export function Table({ c, count, label, pages, page, setPage, tip, guard, ready }: {
  c: Look; count: number; label: string; pages: number; page: number; setPage: (n: number) => void; tip: Tip; guard: Guard; ready: boolean
}) {
  const cx = (TABLE.x0 + TABLE.x1) / 2, w = TABLE.x1 - TABLE.x0
  const frame = useCallback(() => {
    const b = new Hairline()
    b.box(w, 0.12, TABLE.z1 - TABLE.z0, cx, TABLE_Y - 0.06, (TABLE.z0 + TABLE.z1) / 2)
    for (const [x, z] of [[TABLE.x0 + 0.15, TABLE.z0 + 0.15], [TABLE.x1 - 0.15, TABLE.z0 + 0.15], [TABLE.x0 + 0.15, TABLE.z1 - 0.15], [TABLE.x1 - 0.15, TABLE.z1 - 0.15]])
      b.box(0.12, TABLE_Y - 0.12, 0.12, x, (TABLE_Y - 0.12) / 2, z)
    return b.build()
  }, [cx, w])
  const pads = useCallback(() => {
    const b = new Hairline()
    for (let i = 0; i < count; i++) {
      padPos(i, P)
      b.rect(P.x - 0.52, P.z - 0.4, P.x + 0.52, P.z + 0.4, TABLE_Y + 0.004)
    }
    return b.build()
  }, [count])
  return (
    <group>
      <Solid build={frame} fill={c.surface} edge={c.edge} />
      <Solid build={pads} fill={c.surface} edge={c.dim} dashed={[0.08, 0.06]} />
      {ready && <Strip c={c} label={label} pages={pages} page={page} setPage={setPage} tip={tip} guard={guard} />}
    </group>
  )
}

/** The tray's bay strip: which bay is on the table, and the halves that page it. */
function Strip({ c, label, pages, page, setPage, tip, guard }: { c: Look; label: string; pages: number; page: number; setPage: (n: number) => void; tip: Tip; guard: Guard }) {
  const cx = (TABLE.x0 + TABLE.x1) / 2, w = TABLE.x1 - TABLE.x0
  const strip = useTexture(
    () =>
      textTexture(1024, 96, (ctx) => {
        ctx.fillStyle = c.surface
        ctx.fillRect(0, 0, 1024, 96)
        ctx.fillStyle = c.muted
        ctx.font = `500 30px ${MONO}`
        ctx.fillText(label, 110, 60)
        ctx.textAlign = 'right'
        ctx.fillStyle = c.fg
        ctx.fillText(`${page + 1} / ${pages}`, 910, 60)
        ctx.strokeStyle = pages > 1 ? c.fg : c.dim
        ctx.lineWidth = 4
        ctx.beginPath()
        ctx.moveTo(60, 28); ctx.lineTo(36, 48); ctx.lineTo(60, 68)
        ctx.moveTo(964, 28); ctx.lineTo(988, 48); ctx.lineTo(964, 68)
        ctx.stroke()
      }),
    [c, label, page, pages],
  )
  return (
    <mesh
        position={[cx, TABLE_Y + 0.005, TABLE.z1 - 0.38]}
        rotation={[-Math.PI / 2, 0, 0]}
        onClick={(e) => {
          e.stopPropagation()
          if (guard.moved || pages < 2) return
          setPage((page + (e.point.x - cx < 0 ? pages - 1 : 1)) % pages)
        }}
        onPointerOver={(e) => { e.stopPropagation(); tip.show(e.nativeEvent, 'Pick tray', pages > 1 ? 'Click left or right half to change bay' : 'One bay') }}
        onPointerMove={(e) => tip.move(e.nativeEvent)}
        onPointerOut={() => tip.hide()}
      >
        <planeGeometry args={[w - 0.3, (w - 0.3) * (96 / 1024)]} />
        <meshBasicMaterial map={strip} toneMapped={false} />
      </mesh>
  )
}

const BAYS: { slot: SlotKey; id: string }[] = [
  ...INTEGRATORS.map((id) => ({ slot: 'integrator' as const, id })),
  ...TRANSPORTS.map((id) => ({ slot: 'transport' as const, id })),
  ...STORAGES.map((id) => ({ slot: 'storage' as const, id })),
]

export function Hangar({ c, rig, ready }: { c: Look; rig: Rig; ready: boolean }) {
  const frame = useCallback(() => {
    const b = new Hairline()
    const { x0, x1, z0, z1 } = HANGAR
    const h = 2.6
    b.rect(x0, z0, x1, z1, 0.005)
    for (let k = 0; k <= 8; k++) {
      const x = x0 + ((x1 - x0) * k) / 8
      b.seg(x, 0, z0, x, h, z0)
    }
    b.seg(x0, h, z0, x1, h, z0).seg(x0, h + 0.3, z0 + 0.6, x1, h + 0.3, z0 + 0.6).seg(x0, h, z0, x0, h + 0.3, z0 + 0.6).seg(x1, h, z0, x1, h + 0.3, z0 + 0.6)
    for (const id of INTEGRATORS) b.circle(PAD[id].x, 0.01, PAD[id].z, 1.3, 48, true)
    for (const id of TRANSPORTS) b.circle(KIT_PAD[id].x, 0.01, KIT_PAD[id].z, 1.0, 40, true)
    for (const id of STORAGES) b.circle(STORE_PAD[id].x, 0.01, STORE_PAD[id].z, 1.15, 40, true)
    b.circle(STORE_HOME.x, 0.01, STORE_HOME.z, 1.15, 40, true)
    b.rect(PORT.x - 0.25, PORT.z - 0.25, PORT.x + 0.25, PORT.z + 0.25, 0.01)
    for (const id of INTEGRATORS) {
      const at = padOf('integrator', id)
      b.seg(at.x, 0.012, z1, at.x, 0.012, z1 + 0.5)
    }
    return b.build()
  }, [])
  return (
    <group>
      <Solid build={frame} fill={c.surface} edge={c.edge} />
      {ready && <HangarLabels c={c} rig={rig} />}
    </group>
  )
}

/** The hangar's title and its eight bay plates, one atlas and one draw. */
function HangarLabels({ c, rig }: { c: Look; rig: Rig }) {
  const labels = useMemo(() => {
    const cells = [
      {
        w: 1280,
        h: 128,
        draw: (ctx: CanvasRenderingContext2D) => {
          ctx.fillStyle = c.fg
          ctx.font = `500 62px ${FONT}`
          ctx.fillText('HANGAR', 0, 84)
          ctx.fillStyle = c.muted
          ctx.font = `400 44px ${FONT}`
          ctx.fillText('idle machines · click one to deploy it', 290, 84)
        },
      },
      ...BAYS.map(({ slot, id }) => {
        const m = machine(slot, id)
        const live = rig[slot] === id
        const bay = `BAY ${String(m.bay).padStart(2, '0')}`
        const status = live ? `${bay} · ${slot === 'storage' ? 'wired to the cell' : slot === 'transport' ? 'on the floor' : 'on the job'}` : `${bay} · parked`
        return { w: 640, h: 160, draw: (ctx: CanvasRenderingContext2D) => drawPlate(ctx, c, m.color, m.brand, m.model, status, live) }
      }),
    ]
    return atlasTexture(1280, cells)
  }, [c, rig])
  const quads = useMemo(() => {
    const g = quadGeometry(BAYS.length + 1)
    setQuad(g, 0, HANGAR.x0 + 3.9, 0.012, HANGAR.z1 + 0.95, 3.85, 0, 0, 0, 0, -0.385, labels.uv[0])
    BAYS.forEach(({ slot, id }, i) => {
      const at = padOf(slot, id)
      setQuad(g, i + 1, at.x, 0.012, HANGAR.z0 + 0.5, 1.3, 0, 0, 0, 0, -0.325, labels.uv[i + 1])
    })
    flushQuads(g, BAYS.length + 1)
    const m = new Mesh(g, new MeshBasicMaterial({ map: labels.texture, transparent: true, toneMapped: false, depthWrite: false }))
    m.raycast = () => {}
    m.renderOrder = LABEL_ORDER
    return m
  }, [labels])
  useEffect(
    () => () => {
      quads.geometry.dispose()
      quads.material.dispose()
      labels.texture.dispose()
    },
    [quads, labels],
  )
  return <primitive object={quads} />
}

export const matchItem = (item: { title: string; label: string; ref: string }, query: string) => {
  const q = query.trim().toLowerCase()
  return !q || item.title.toLowerCase().includes(q) || item.label.toLowerCase().includes(q) || item.ref.toLowerCase().includes(q)
}

