// Tier 3: a layout and a transport. Async, because rapier loads its WASM first.
export default async function tower(host) {
  const { React, THREE, fiber, core } = host
  const { useMemo, useRef } = React
  const h = React.createElement

  // Pachinko, in its own frame: a standing board along +x, parts enter top left, leave bottom right.
  const W = 3.8, TOP = 5.7, EXIT = { x: W - 0.35, y: 0.95 }, BALL = 0.14
  const pegs = []
  for (let row = 0, y = TOP - 0.75; y > 1.9; row++, y -= 0.42)
    for (let x = 0.32 + (row % 2) * 0.21; x < W - 0.25; x += 0.42) pegs.push([x, y])
  const slope = { x0: 0.05, y0: 1.75, x1: W - 0.05, y1: 0.78 }

  const R = await host.rapier()
  function drop(x0) {
    const world = new R.World({ x: 0, y: -9.81, z: 0 })
    const fixed = (desc) => world.createCollider(desc.setRestitution(0.45).setFriction(0.1))
    for (const [x, y] of pegs) fixed(R.ColliderDesc.ball(0.06).setTranslation(x, y, 0))
    fixed(R.ColliderDesc.cuboid(0.05, TOP, 0.5).setTranslation(-0.05, TOP / 2, 0))
    fixed(R.ColliderDesc.cuboid(0.05, TOP, 0.5).setTranslation(W + 0.05, TOP / 2, 0))
    const len = Math.hypot(slope.x1 - slope.x0, slope.y1 - slope.y0), ang = Math.atan2(slope.y1 - slope.y0, slope.x1 - slope.x0)
    fixed(R.ColliderDesc.cuboid(len / 2, 0.05, 0.5).setTranslation((slope.x0 + slope.x1) / 2, (slope.y0 + slope.y1) / 2 - 0.05, 0).setRotation({ x: 0, y: 0, z: Math.sin(ang / 2), w: Math.cos(ang / 2) }))
    const body = world.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(x0, TOP - 0.2, 0).setLinvel(0.6, 0, 0).enabledTranslations(true, true, false))
    world.createCollider(R.ColliderDesc.ball(BALL).setRestitution(0.5).setDensity(1), body)
    const pts = [new THREE.Vector3(0.35, TOP, 0)]
    for (let i = 0; i < 60 * 9; i++) {
      world.step()
      const p = body.translation()
      const last = pts[pts.length - 1]
      if (Math.hypot(p.x - last.x, p.y - last.y) > 0.08) pts.push(new THREE.Vector3(p.x, p.y - BALL, 0))
      if (p.x > EXIT.x - 0.5 && p.y < 1.3) break
    }
    world.free()
    pts.push(new THREE.Vector3(EXIT.x, EXIT.y, 0))
    let length = 0
    for (let i = 1; i < pts.length; i++) length += pts[i].distanceTo(pts[i - 1])
    return { pts, length }
  }
  // The most entertaining of a few deterministic drops: the longest one that still arrives.
  const run = [0.3, 0.42, 0.55, 0.68].map(drop).reduce((a, b) => (b.length > a.length && b.length < 40 ? b : a))

  function Pachinko({ c }) {
    const pieces = useMemo(() => {
      const len = Math.hypot(slope.x1 - slope.x0, slope.y1 - slope.y0)
      const ang = Math.atan2(slope.y1 - slope.y0, slope.x1 - slope.x0)
      return [
        { geo: core.box(W + 0.3, TOP + 0.3, 0.08), at: [W / 2, (TOP + 0.3) / 2, -0.32] },
        { geo: core.box(0.12, TOP + 0.3, 0.7), at: [-0.06, (TOP + 0.3) / 2, 0] },
        { geo: core.box(0.12, TOP + 0.3, 0.7), at: [W + 0.06, (TOP + 0.3) / 2, 0] },
        { geo: core.box(W + 0.3, 0.12, 0.7), at: [W / 2, TOP + 0.36, 0] },
        { geo: core.box(len, 0.1, 0.7), at: [(slope.x0 + slope.x1) / 2, (slope.y0 + slope.y1) / 2 - 0.05, 0], rot: [0, 0, ang] },
        { geo: core.box(0.9, 0.9, 0.9), at: [W + 0.2, 0.45, 0] },
      ]
    }, [])
    const inst = useRef(null)
    const geo = useMemo(() => new THREE.CylinderGeometry(0.05, 0.05, 0.6, 10).rotateX(Math.PI / 2), [])
    React.useLayoutEffect(() => {
      const m = new THREE.Matrix4()
      pegs.forEach(([x, y], i) => inst.current.setMatrixAt(i, m.makeTranslation(x, y, 0)))
      inst.current.instanceMatrix.needsUpdate = true
    }, [])
    return h('group', null,
      h(core.Body, { id: 'pachinko', c, fill: c.surface, edge: c.edge, pieces }),
      h('instancedMesh', { ref: inst, args: [geo, core.fillMat(c.gold, c.flat, 0.4, { metal: 0.6 }), pegs.length] }),
    )
  }

  const pachinko = {
    id: 'pachinko',
    label: 'Pachinko',
    kind: 'path',
    footprint: { x0: -0.3, x1: W + 0.7, z0: -0.5, z1: 0.5, h: TOP + 0.4 },
    frame: { pts: [[-0.5, 0, -1], [W + 0.8, 0, 1.2], [-0.5, TOP + 0.6, 0], [W + 0.8, TOP + 0.6, 0]] },
    length: run.length,
    speed: 3.2,
    gap: 1.1,
    at: (u, out) => out.set(0.35 + (u / run.length) * (EXIT.x - 0.35), TOP + (u / run.length) * (EXIT.y - TOP), 0),
    load: { dur: 0.6, h: 1.2 },
    wrap: () => ({ pts: run.pts.map((p) => p.clone()) }),
    Component: Pachinko,
  }

  // Tower: the line's placement with the pick frame (cabinet and table) lifted onto a mezzanine. The host frames the
  // lifted stations from the placement, so the camera stops and the overview follow the lift.
  const LIFT = 4.3
  const towerLayout = {
    id: 'tower',
    label: 'Tower',
    place(rig) {
      const at = core.placeLine(rig)
      return { ...at, pick: { ...at.pick, y: LIFT } }
    },
    Scenery({ c, sim }) {
      const g = useRef(null)
      const { cabinet, table } = sim.rig
      const x0 = Math.min(cabinet.footprint.x0, table.footprint.x0) - 0.4, x1 = Math.max(cabinet.footprint.x1, table.footprint.x1) + 0.4
      const z0 = Math.min(cabinet.footprint.z0, table.footprint.z0) - 0.4, z1 = Math.max(cabinet.footprint.z1, table.footprint.z1) + 0.6
      const pieces = useMemo(() => {
        const out = [{ geo: core.box(x1 - x0, 0.22, z1 - z0), at: [(x0 + x1) / 2, LIFT - 0.11, (z0 + z1) / 2] }]
        for (const x of [x0 + 0.2, (x0 + x1) / 2, x1 - 0.2]) for (const z of [z0 + 0.2, z1 - 0.2]) out.push({ geo: core.box(0.24, LIFT - 0.22, 0.24), at: [x, (LIFT - 0.22) / 2, z] })
        out.push({ geo: core.box(x1 - x0, 0.06, 0.06), at: [(x0 + x1) / 2, LIFT + 1.05, z1 - 0.05] })
        for (let x = x0 + 0.1; x < x1; x += 1.2) out.push({ geo: core.box(0.05, 1.05, 0.05), at: [x, LIFT + 0.52, z1 - 0.05] })
        for (let k = 0; k < 14; k++) out.push({ geo: core.box(0.9, 0.08, 0.32), at: [x0 - 0.5, (k + 0.5) * (LIFT / 14), z1 - 0.4 - k * 0.32] })
        return out
      }, [x0, x1, z0, z1])
      fiber.useFrame(() => {
        const at = sim.at.pick
        g.current?.position.set(at.x, at.y - LIFT, at.z)
      })
      return h('group', { ref: g }, h(core.Body, { id: `mezzanine-${x0}-${x1}-${z0}-${z1}`, c, fill: c.surface, edge: c.edge, pieces }))
    },
  }

  return { layout: [towerLayout], transport: [pachinko] }
}
