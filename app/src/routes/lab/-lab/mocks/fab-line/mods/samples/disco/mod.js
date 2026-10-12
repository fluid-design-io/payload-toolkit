// A code mod: the default export receives the host and returns variants by slot.
// It must use host.React / host.THREE / host.fiber, never its own copies.
//
// A row of mirror balls over the whole line, one per SPACING units of its
// extent, each sweeping BEAMS spotlights across its own stretch. The row is
// measured from `sim.line` (extent, and the height and depth of everything
// the overview frames), so it grows with long transports and the Tower layout
// and eases along when World settings change the line. A seat or a finish
// flares the nearest ball and swings its beams onto the chip for a beat, at
// full frame rate until the beat fades (`keepAnimating`).
// Balls, beams and floor spots are three instanced meshes: three draw calls
// however long the line is, and nothing is allocated per frame.
export default function disco(host) {
  const { React, THREE, fiber, html, core, keepAnimating } = host
  const { useMemo, useRef, useEffect } = React
  const COLORS = ['#FF3CAC', '#2BD2FF', '#FFF23C', '#7CFF6B'].map((c) => new THREE.Color(c))
  const SPACING = 10
  const MAX = 16
  const BEAMS = 3
  const CLEAR = 2.3
  const SPREAD = 0.13
  const DOWN = new THREE.Vector3(0, -1, 0)

  function measure(line, out) {
    out.x0 = line.extent.x0
    out.x1 = line.extent.x1
    out.z0 = Infinity
    out.z1 = -Infinity
    out.top = 0
    for (const p of line.all) {
      if (p.z < out.z0) out.z0 = p.z
      if (p.z > out.z1) out.z1 = p.z
      if (p.y > out.top) out.top = p.y
    }
  }

  function Disco({ sim }) {
    const light = useRef(null)
    const rig = useMemo(() => {
      const glow = (side) => new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, side })
      const balls = new THREE.InstancedMesh(
        new THREE.IcosahedronGeometry(0.85, 2),
        new THREE.MeshStandardMaterial({ color: '#E8ECF2', emissive: '#5A6270', metalness: 0.35, roughness: 0.25, flatShading: true }),
        MAX,
      )
      const cones = new THREE.InstancedMesh(new THREE.ConeGeometry(1, 1, 24, 1, true).translate(0, -0.5, 0), glow(THREE.DoubleSide), MAX * BEAMS)
      const spots = new THREE.InstancedMesh(new THREE.CircleGeometry(1, 24).rotateX(-Math.PI / 2), glow(THREE.FrontSide), MAX * BEAMS)
      const black = new THREE.Color(0)
      for (let k = 0; k < MAX * BEAMS; k++) {
        cones.setColorAt(k, black)
        spots.setColorAt(k, black)
      }
      for (const m of [balls, cones, spots]) {
        m.frustumCulled = false
        m.count = 0
      }
      return {
        balls,
        cones,
        spots,
        line: null,
        want: { x0: 0, x1: 0, z0: 0, z1: 0, top: 0 },
        box: null,
        n: 0,
        cell: 1,
        flare: new Float32Array(MAX),
        focus: new Float32Array(MAX),
        target: Array.from({ length: MAX }, () => new THREE.Vector3()),
        m: new THREE.Matrix4(),
        q: new THREE.Quaternion(),
        e: new THREE.Euler(),
        s: new THREE.Vector3(),
        ball: new THREE.Vector3(),
        aim: new THREE.Vector3(),
        dir: new THREE.Vector3(),
        c: new THREE.Color(),
      }
    }, [])
    useEffect(
      () => () => {
        for (const m of [rig.balls, rig.cones, rig.spots]) {
          m.geometry.dispose()
          m.material.dispose()
          m.dispose()
        }
      },
      [rig],
    )
    core.useSimEvents(sim, (e) => {
      if ((e.kind !== 'seat' && e.kind !== 'done') || !rig.box) return
      const i = Math.min(rig.n - 1, Math.max(0, Math.floor((e.part.pos.x - rig.box.x0) / rig.cell)))
      rig.flare[i] = 1
      rig.focus[i] = 1
      rig.target[i].copy(e.part.pos)
    })
    fiber.useFrame((state, dt) => {
      const t = core.reducedMotion ? 0 : state.clock.elapsedTime
      const want = rig.want
      if (sim.line !== rig.line) {
        rig.line = sim.line
        measure(sim.line, want)
        rig.box ??= { ...want }
      }
      // The line slides to a new layout over a moment; the row follows instead of jumping.
      const box = rig.box
      const ease = 1 - Math.exp(-dt * 6)
      box.x0 += (want.x0 - box.x0) * ease
      box.x1 += (want.x1 - box.x1) * ease
      box.z0 += (want.z0 - box.z0) * ease
      box.z1 += (want.z1 - box.z1) * ease
      box.top += (want.top - box.top) * ease
      const w = box.x1 - box.x0
      const n = Math.min(MAX, Math.max(1, Math.round(w / SPACING)))
      const cell = w / n
      const height = box.top + CLEAR
      const cz = (box.z0 + box.z1) / 2
      const hz = (box.z1 - box.z0) / 2
      rig.n = n
      rig.cell = cell
      for (let i = 0; i < n; i++) {
        rig.flare[i] = Math.max(0, rig.flare[i] - dt * 2.5)
        rig.focus[i] = Math.max(0, rig.focus[i] - dt * 0.8)
        if (rig.focus[i] > 0) keepAnimating()
        const focus = rig.focus[i] * rig.focus[i] * (3 - 2 * rig.focus[i])
        rig.ball.set(box.x0 + (i + 0.5) * cell, height, cz)
        rig.e.set(0, t * 0.7 + i, 0)
        rig.balls.setMatrixAt(i, rig.m.compose(rig.ball, rig.q.setFromEuler(rig.e), rig.s.set(1, 1, 1)))
        for (let j = 0; j < BEAMS; j++) {
          const k = i * BEAMS + j
          const phase = (j * 2 * Math.PI) / BEAMS + i * 1.7
          rig.aim.set(rig.ball.x + Math.sin(t * 0.8 + phase) * cell * 0.42, 0.03, cz + Math.cos(t * 1.04 + phase) * hz * 0.6)
          if (focus > 0) rig.aim.lerp(rig.target[i], focus)
          const len = rig.dir.subVectors(rig.aim, rig.ball).length()
          rig.q.setFromUnitVectors(DOWN, rig.dir.divideScalar(len))
          const r = len * SPREAD
          rig.cones.setMatrixAt(k, rig.m.compose(rig.ball, rig.q, rig.s.set(r, len, r)))
          rig.spots.setMatrixAt(k, rig.m.compose(rig.aim, rig.q.identity(), rig.s.set(r * 0.7, 1, r * 0.7)))
          // Additive blending, so scaling the color is the beam's opacity.
          const color = COLORS[(i + j) % COLORS.length]
          rig.cones.setColorAt(k, rig.c.copy(color).multiplyScalar(0.06 + rig.flare[i] * 0.24))
          rig.spots.setColorAt(k, rig.c.copy(color).multiplyScalar(0.35 + rig.flare[i] * 0.5))
        }
      }
      rig.balls.count = n
      rig.cones.count = n * BEAMS
      rig.spots.count = n * BEAMS
      rig.balls.instanceMatrix.needsUpdate = true
      rig.cones.instanceMatrix.needsUpdate = true
      rig.cones.instanceColor.needsUpdate = true
      rig.spots.instanceMatrix.needsUpdate = true
      rig.spots.instanceColor.needsUpdate = true
      if (light.current) {
        light.current.position.set((box.x0 + box.x1) / 2, height, cz)
        light.current.distance = Math.max(30, w)
      }
    })
    return html`
      <group>
        <primitive object=${rig.balls} />
        <primitive object=${rig.cones} />
        <primitive object=${rig.spots} />
        <pointLight ref=${light} intensity=${30} distance=${30} color="#FFFFFF" />
      </group>
    `
  }

  return { fx: [{ id: 'ball', label: 'Disco', Component: Disco }] }
}
