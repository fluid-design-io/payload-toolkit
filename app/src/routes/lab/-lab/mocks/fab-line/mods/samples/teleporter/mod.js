// A code mod that adds a socket swap style. A style is a table of acts by socket kind (cpu, memory,
// power); `swap.every` puts one act on all three. Each act's `rig` builds its props once per socket
// and theme, and its `frame` poses the leaving part (`old`) and the arriving one (`next`) from `clock.u`.
export default function teleporter({ THREE, swap }) {
  const { every, crossed, span, easeIn, easeOut, rest, kick, play } = swap
  const ARRIVE = 0.5

  function rig(c, kind) {
    const haze = (color) =>
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, toneMapped: false })
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 32, 1, true).translate(0, 0.5, 0), haze(c.lit))
    const pad = new THREE.Mesh(new THREE.RingGeometry(0.75, 1, 40).rotateX(-Math.PI / 2), haze(c.spark))
    const root = new THREE.Group()
    root.name = `teleporter.${kind}`
    root.add(beam, pad)
    root.traverse((o) => (o.raycast = () => {}))

    // k = 0 is the part at rest; k = 1 is a thin column of light above its socket.
    function squeeze(part, box, k) {
      rest(part, box)
      part.scale.set(1 - 0.97 * k, 1 + 1.5 * k, 1 - 0.97 * k)
      part.position.y += 1.2 * k
    }

    return {
      root,
      frame(clock, old, next) {
        root.visible = clock.active
        if (!clock.active) return
        const u = clock.u
        const box = u < ARRIVE ? clock.fromBox : clock.toBox
        const r = 1.1 * Math.max(box.w, box.d)
        const light = span(u, 0, 0.12) * (1 - span(u, 0.85, 1))
        beam.position.set(box.x, box.y, box.z)
        beam.scale.set(r, 4, r)
        beam.material.opacity = 0.16 * light
        pad.position.set(box.x, box.y + 0.02, box.z)
        pad.scale.set(r, 1, r)
        pad.material.opacity = 0.7 * light

        squeeze(old, clock.fromBox, easeIn(span(u, 0.1, 0.45)))
        old.visible = u < 0.45
        squeeze(next, clock.toBox, 1 - easeOut(span(u, ARRIVE, 0.85)))
        next.visible = u >= ARRIVE

        if (crossed(clock, 0.08)) play('zap')
        if (crossed(clock, ARRIVE)) play('chirp')
        if (crossed(clock, 0.85)) {
          play('seat')
          kick(0.12)
        }
      },
      dispose() {
        for (const m of [beam, pad]) {
          m.geometry.dispose()
          m.material.dispose()
        }
      },
    }
  }

  return { swap: [{ id: 'teleporter', label: 'Teleporter', acts: every({ duration: 1.4, arrive: ARRIVE, rig }) }] }
}
