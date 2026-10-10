import { useEffect, useMemo, useRef } from 'react'
import type { JSX } from 'react'
import { useFrame } from '@react-three/fiber'
import { BoxGeometry, Color, Euler, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial, PlaneGeometry, Quaternion, Sphere, TorusGeometry, Vector3 } from 'three'
import type { Group } from 'three'

import { BRAND, DOCK, INTAKE, KIT_PAD, SILO_EMIT, SILO, SILO_TOP, TABLE_Y, TUBE, machine } from '../sim'
import type { Sim, TransportId } from '../sim'
import { FONT, Flat, Hairline, MONO, Solid, fillMat, hover, segmentWriter, textTexture, tint, useSegments, useTexture } from './hairline'
import type { Look, Tip } from './hairline'

type Props = { sim: Sim; c: Look }
/** Moving instances are never raycast against a cached sphere: three.js keeps the first one it computes. */
const SCENE_SPHERE = new Sphere(new Vector3(2, 2, 0), 40)
type Built = ReturnType<Hairline['build']>

const R = Math.PI / 2
const BELT_X0 = DOCK.x + 0.4
const BELT_L = INTAKE.x - 0.4 - BELT_X0
const SLATS = 30
const TILE_CAP = 56
const RINGS = 30
const PUFFS = 6
const WHITE = '#FFFFFF'
const END = TUBE.getPointAt(1)
const LABEL_W = INTAKE.x - DOCK.x + 1.6
const CORNERS = [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const

const M = new Matrix4()
const Q = new Quaternion()
const E = new Euler()
const P = new Vector3()
const S = new Vector3()
const A = new Vector3()
const B = new Vector3()
const col = new Color()

const RING_AT = Array.from({ length: RINGS }, (_, i) => {
  const u = i / (RINGS - 1)
  return { p: TUBE.getPointAt(u), q: new Quaternion().setFromUnitVectors(new Vector3(0, 0, 1), TUBE.getTangentAt(u)) }
})

function pedestals() {
  const h = new Hairline()
  const legH = TABLE_Y - 0.06
  for (const p of [DOCK, INTAKE]) {
    h.box(1.1, 0.06, 1.1, p.x, TABLE_Y - 0.03, p.z)
    for (const [sx, sz] of CORNERS) h.box(0.06, legH, 0.06, p.x + sx * 0.45, legH / 2, p.z + sz * 0.45)
  }
  return h.build()
}
function beltBody() {
  const h = new Hairline().box(BELT_L, 0.2, 1.0, BELT_L / 2, TABLE_Y - 0.12, 0)
  for (const x of [0, BELT_L]) h.cyl(0.13, 0.13, 1.04, x, TABLE_Y - 0.14, 0, 20, [R, 0, 0])
  const legH = TABLE_Y - 0.22
  for (const x of [0.35, BELT_L / 2, BELT_L - 0.35]) for (const z of [-0.38, 0.38]) h.box(0.07, legH, 0.07, x, legH / 2, z)
  return h.build()
}
function siloFrame() {
  const h = new Hairline()
  for (const y of [0.02, 0.9, 1.8, 2.7, 3.6]) h.circle(0, y, 0, 1.05, 40)
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2
    const x = Math.cos(a), z = Math.sin(a)
    h.seg(x * 1.05, 0, z * 1.05, x * 1.05, 3.6, z * 1.05).seg(x * 1.05, 3.6, z * 1.05, x * 0.14, SILO_TOP.y, z * 0.14)
  }
  return h.circle(0, SILO_TOP.y, 0, 0.14, 16).build()
}
function siloTrim() {
  return new Hairline().circle(0, 3.6, 0, 1.08, 40).circle(0, SILO_EMIT.y, 0, 0.18, 16).build()
}
function rails() {
  const pts = TUBE.getSpacedPoints(80)
  const h = new Hairline()
  for (const dy of [0.34, -0.34]) h.poly(pts.map((p) => [p.x, p.y + dy, p.z] as const))
  return h.build()
}

const KIT: Record<TransportId, () => Built> = {
  belt: () => {
    const h = new Hairline().box(1.8, 0.22, 0.6, 0, 0.35, 0)
    for (const x of [-0.9, 0.9]) h.cyl(0.12, 0.12, 0.62, x, 0.35, 0, 16, [R, 0, 0])
    for (const x of [-0.6, 0, 0.6]) h.box(0.3, 0.06, 0.24, x, 0.49, 0)
    for (const [sx, sz] of CORNERS) h.box(0.05, 0.24, 0.05, sx * 0.7, 0.12, sz * 0.22)
    return h.build()
  },
  silo: () => {
    const h = new Hairline().cyl(0.5, 0.5, 1.1, 0, 0.75, 0, 8).cyl(0, 0.5, 0.3, 0, 1.45, 0, 8)
    for (const [sx, sz] of CORNERS) h.box(0.06, 0.2, 0.06, sx * 0.3, 0.1, sz * 0.3)
    // Eight-segment circles land on the cylinder's own vertices, so the bands read as seams.
    return h.circle(0, 0.6, 0, 0.505, 8).circle(0, 0.95, 0, 0.505, 8).build()
  },
  tube: () =>
    new Hairline()
      .box(2.1, 0.08, 0.5, 0, 0.04, 0)
      .torus(0.85, 0.16, 0, 0.25, 0, undefined, 6, 36, Math.PI)
      .torus(0.2, 0.025, -0.85, 0.2, 0, [R, 0, 0], 6, 20)
      .torus(0.2, 0.025, 0.85, 0.2, 0, [R, 0, 0], 6, 20)
      .build(),
}

function useInstanced(make: () => InstancedMesh, deps: unknown[]) {
  const mesh = useMemo(() => {
    const m = make()
    m.frustumCulled = false
    m.boundingSphere = SCENE_SPHERE
    return m
  }, deps)
  useEffect(
    () => () => {
      mesh.geometry.dispose()
      mesh.dispose()
    },
    [mesh],
  )
  return mesh
}

function Pedestals({ c, labels }: { c: Look; labels: boolean }) {
  const text = useTexture(() => textTexture(2048, 88, (ctx) => {
    ctx.fillStyle = c.muted
    ctx.font = `500 52px ${MONO}`
    ctx.textAlign = 'center'
    for (const [text, p] of [['DOCK', DOCK], ['INTAKE', INTAKE]] as const) ctx.fillText(text, ((p.x - DOCK.x + 0.8) / LABEL_W) * 2048, 62)
  }), [c.muted])
  return (
    <>
      <Solid build={pedestals} fill={c.surface} edge={c.edge} />
      {labels && <Flat texture={text} size={[LABEL_W, 0.3]} position={[(DOCK.x + INTAKE.x) / 2, 0.01, DOCK.z + 0.85]} />}
    </>
  )
}

function Belt({ sim, c }: Props) {
  const group = useRef<Group>(null)
  const slats = useInstanced(() => new InstancedMesh(new BoxGeometry(0.03, 0.012, 0.96), fillMat(c.edge), SLATS), [c.edge])
  useFrame(() => {
    const s = sim.show.belt
    const g = group.current!
    g.visible = s > 0.01
    if (!g.visible) return
    g.scale.set(Math.max(0.001, s), 1, 1)
    const gap = BELT_L / SLATS
    const off = sim.beltPhase % gap
    for (let i = 0; i < SLATS; i++) slats.setMatrixAt(i, M.makeTranslation(i * gap + off, TABLE_Y - 0.008, 0))
    slats.instanceMatrix.needsUpdate = true
  })
  return (
    <group ref={group} position={[BELT_X0, 0, DOCK.z]}>
      <Solid build={beltBody} fill={c.surface} edge={c.edge} />
      <primitive object={slats} />
      <mesh position={[BELT_L / 2, TABLE_Y - 0.06, 0.505]} material={fillMat(BRAND.npm)}>
        <boxGeometry args={[BELT_L, 0.04, 0.01]} />
      </mesh>
    </group>
  )
}

function Silo({ sim, c, labels }: Props & { labels: boolean }) {
  const group = useRef<Group>(null)
  const beams = useSegments(400, BRAND.pnpm, 0.75)
  const tiles = useInstanced(() => {
    const m = new InstancedMesh(new BoxGeometry(0.46, 0.05, 0.34), fillMat(WHITE), TILE_CAP)
    m.count = 0
    return m
  }, [])
  const plate = useMemo(() => ({ tex: textTexture(640, 200, () => {}), n: -1 }), [c])
  useEffect(() => () => plate.tex.dispose(), [plate])
  useFrame(() => {
    const s = sim.show.silo
    const g = group.current!
    g.visible = s > 0.01
    g.scale.set(1, Math.max(0.001, s), 1)
    const n = sim.store.length
    if (plate.n !== n) {
      plate.n = n
      const ctx = (plate.tex.image as HTMLCanvasElement).getContext('2d')!
      ctx.clearRect(0, 0, 640, 200)
      ctx.fillStyle = BRAND.pnpm
      ctx.fillRect(14, 30, 6, 60)
      ctx.fillStyle = c.fg
      ctx.font = `500 48px ${FONT}`
      ctx.fillText('pnpm store', 40, 76)
      ctx.fillStyle = c.muted
      ctx.font = `400 34px ${FONT}`
      ctx.fillText(`${n} package${n === 1 ? '' : 's'} · one copy each`, 40, 130)
      ctx.font = `400 28px ${MONO}`
      ctx.fillText('slots get hard links', 40, 176)
      plate.tex.needsUpdate = true
      const shown = Math.min(n, TILE_CAP)
      for (let i = 0; i < shown; i++) {
        const a = i * 0.95
        M.compose(P.set(Math.cos(a) * 0.42, 0.16 + i * 0.062, Math.sin(a) * 0.42), Q.setFromEuler(E.set(0, -a, 0)), S.set(1, 1, 1))
        tiles.setMatrixAt(i, M)
        tiles.setColorAt(i, col.set(tint(sim.parts.get(sim.store[n - shown + i])!.item.hue, c)))
      }
      tiles.count = shown
      tiles.instanceMatrix.needsUpdate = true
      if (tiles.instanceColor) tiles.instanceColor.needsUpdate = true
    }
    const w = segmentWriter(beams)
    for (const p of sim.live) {
      if (!p.ghost || p.mode === 'home' || p.mode === 'toss') continue
      const k = p.stage === 'beam' ? Math.min(1, p.run * 1.6) : 1
      A.copy(p.pos).sub(SILO_EMIT).multiplyScalar(k).add(SILO_EMIT)
      w.add(SILO_EMIT.x, SILO_EMIT.y, SILO_EMIT.z, A.x, A.y, A.z)
    }
    w.done()
  })
  return (
    <>
      <group ref={group} position={[SILO.x, 0, SILO.z]}>
        <Solid build={siloFrame} fill={c.surface} edge={c.edge} />
        <Solid build={siloTrim} fill={c.surface} edge={BRAND.pnpm} />
        <primitive object={tiles} />
        <mesh position={[0, 1.8, 0]} material={fillMat(c.glass, 0.35)}>
          <cylinderGeometry args={[1.05, 1.05, 3.6, 40, 1, true]} />
        </mesh>
        {labels && <Flat texture={plate.tex} size={[2.6, 0.81]} position={[0, 0.01, 1.75]} />}
      </group>
      <primitive object={beams} />
    </>
  )
}

function Tube({ sim, c }: Props) {
  const railGroup = useRef<Group>(null)
  const last = useRef<{ s: number; m: InstancedMesh | null }>({ s: -1, m: null })
  const streak = useSegments(60, BRAND.bun, 1)
  const rings = useInstanced(() => {
    const m = new InstancedMesh(new TorusGeometry(0.36, 0.02, 6, 28), fillMat(WHITE), RINGS)
    for (let i = 0; i < RINGS; i++) m.setColorAt(i, col.set(i === 0 || i === RINGS - 1 ? BRAND.bun : c.edge))
    return m
  }, [c.edge])
  const puffs = useMemo(() => {
    const geo = new TorusGeometry(0.4, 0.015, 6, 32)
    return Array.from({ length: PUFFS }, () => {
      const m = new Mesh(geo, new MeshBasicMaterial({ color: BRAND.bun, transparent: true, toneMapped: false, depthWrite: false }))
      m.position.set(END.x, END.y - 0.2, END.z)
      m.rotation.x = R
      m.visible = false
      return m
    })
  }, [])
  useEffect(() => () => {
    puffs[0].geometry.dispose()
    for (const m of puffs) m.material.dispose()
  }, [puffs])
  const word = useTexture(() => textTexture(420, 140, (ctx) => {
    ctx.fillStyle = BRAND.bun
    ctx.font = `italic 600 92px ${FONT}`
    ctx.fillText('whoosh', 10, 100)
  }), [])
  const whoosh = useMemo(() => {
    const m = new Mesh(new PlaneGeometry(1.8, 0.6), new MeshBasicMaterial({ map: word, transparent: true, toneMapped: false, depthWrite: false }))
    m.visible = false
    return m
  }, [word])
  useEffect(() => () => {
    whoosh.geometry.dispose()
    whoosh.material.dispose()
  }, [whoosh])
  useFrame(() => {
    const s = sim.show.tube
    rings.visible = s > 0.01
    if (s !== last.current.s || rings !== last.current.m) {
      last.current = { s, m: rings }
      for (let i = 0; i < RINGS; i++) {
        const k = Math.min(1, Math.max(0, s * (RINGS + 4) - i))
        rings.setMatrixAt(i, M.compose(RING_AT[i].p, RING_AT[i].q, S.setScalar(Math.max(0.001, k))))
      }
      rings.instanceMatrix.needsUpdate = true
    }
    railGroup.current!.visible = s > 0.6
    const w = segmentWriter(streak)
    for (const p of sim.queue) {
      if (p.stage !== 'tube') continue
      const u = Math.min(1, p.run * p.run)
      for (let k = 0; k < 6; k++) {
        TUBE.getPointAt(Math.max(0, u - 0.03 * (k + 1)), A)
        TUBE.getPointAt(Math.max(0, u - 0.03 * k), B)
        w.add(A.x, A.y, A.z, B.x, B.y, B.z)
      }
    }
    w.done()
    for (let i = 0; i < PUFFS; i++) {
      const t = sim.puffs[i]
      const m = puffs[i]
      m.visible = t !== undefined
      if (t === undefined) continue
      m.scale.setScalar(0.4 + t * 2.4)
      m.material.opacity = 1 - t
    }
    const newest = sim.puffs.length ? Math.min(...sim.puffs) : 1
    whoosh.visible = newest < 1 && s > 0.5
    whoosh.material.opacity = 1 - newest
    whoosh.position.set(END.x + 0.6, 3.0 + newest * 0.6, END.z + 0.6)
  })
  return (
    <>
      <primitive object={rings} />
      <group ref={railGroup}>
        <Solid build={rails} fill={c.surface} edge={c.edge} />
      </group>
      <primitive object={streak} />
      {puffs.map((m, i) => <primitive key={i} object={m} />)}
      <primitive object={whoosh} />
    </>
  )
}

export function Transports({ sim, c, labels }: Props & { labels: boolean }): JSX.Element {
  return (
    <group>
      <Pedestals c={c} labels={labels} />
      <Belt sim={sim} c={c} />
      <Silo sim={sim} c={c} labels={labels} />
      <Tube sim={sim} c={c} />
    </group>
  )
}

export function TransportKit({ id, sim, c, tip, deploy }: Props & { id: TransportId; tip: Tip; deploy: (id: TransportId) => void }): JSX.Element {
  const lift = useRef<Group>(null)
  const full = useRef<Group>(null)
  const dim = useRef<Group>(null)
  const hot = useRef(false)
  const pad = KIT_PAD[id]
  const m = machine('transport', id)
  const h = hover(tip, () => `${m.brand} · ${m.model}`, () => (sim.rig.transport === id ? 'Deployed on the floor' : 'Click to install this transport'))
  useFrame((_, dt) => {
    const s = sim.show[id]
    const g = lift.current!
    const want = (hot.current ? 0.35 : 0) + Math.sin(sim.clock * 1.4 + pad.x) * 0.04
    g.position.y += (want - g.position.y) * (1 - Math.exp(-dt * 8))
    g.scale.setScalar(1 - 0.1 * s)
    full.current!.visible = s <= 0.5
    dim.current!.visible = s > 0.5
  })
  return (
    <group position={[pad.x, 0, pad.z]}>
      <group
        ref={lift}
        onClick={(e) => {
          e.stopPropagation()
          if (sim.rig.transport !== id) deploy(id)
        }}
        onPointerOver={(e) => {
          hot.current = true
          h.onPointerOver(e)
        }}
        onPointerMove={h.onPointerMove}
        onPointerOut={() => {
          hot.current = false
          h.onPointerOut()
        }}
      >
        <group ref={full}>
          <Solid build={KIT[id]} fill={c.surface} edge={c.edge} />
        </group>
        <group ref={dim} visible={false}>
          <Solid build={KIT[id]} fill={c.surface} edge={c.edge} opacity={0.25} />
        </group>
      </group>
    </group>
  )
}
