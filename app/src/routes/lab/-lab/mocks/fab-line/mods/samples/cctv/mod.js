// CCTV: a view tool for the camera toolbar. Security cameras stand on poles around the campus and the feed plays through
// a grainy green monitor. Its variants: Auto cycle cuts between the cameras every few seconds, Follow part cuts to the
// camera nearest a part on its way to the board, and CAM 01..06 hold one camera.
// It uses host.React / host.THREE / host.fiber, never its own copies.
export default function cctv(host) {
  const { React, THREE, fiber, html, core } = host
  const { useEffect, useRef, useState } = React
  const calm = core.reducedMotion
  // Reduced motion: long holds, no sweeping heads, no blinking.
  const DWELL = calm ? 10 : 4
  // Follow part re-checks which camera is nearest this often, so it never cuts faster than this.
  const HOLD = calm ? 6 : 1.5

  // `at` is the mount from the station's anchor (its centre on the floor), `fov` the lens. `track` turns the head toward
  // the arm or a moving part; the rest sweep slowly. The roof camera hangs from the ceiling, so it has no pole.
  const CAMS = [
    { name: 'LOADING DOCK', stop: 'cabinet', at: [-9, 7, 11], fov: 52, sweep: 1.6 },
    { name: 'PICK FLOOR', stop: 'table', at: [7, 8, -9], fov: 50, sweep: 1.4 },
    { name: 'CONVEYOR', stop: 'transport', at: [-3, 7.5, 13], fov: 54, track: 'part', sweep: 2.4 },
    { name: 'ARM BAY', stop: 'board', at: [-11, 6.5, 9], fov: 46, track: 'arm' },
    { name: 'BOARD ROOM', stop: 'board', at: [10, 10, 10], fov: 50, sweep: 1.2 },
    { name: 'ROOF', stop: null, at: [0, 0, 3], fov: 64, roof: true },
  ]

  // Mounts follow the layout: rebuilt whenever the line changes (a new transport, a wider board, the Tower).
  let built = { line: null, cams: [] }
  function mounts(line) {
    if (built.line === line) return built.cams
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity
    for (const p of line.all) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); z0 = Math.min(z0, p.z); z1 = Math.max(z1, p.z) }
    const cams = []
    CAMS.forEach((def, n) => {
      const anchor = new THREE.Vector3()
      if (def.roof) anchor.set((x0 + x1) / 2, 0, (z0 + z1) / 2)
      else {
        const stop = line.stops.find((s) => s.id === def.stop)
        if (!stop || !stop.pts.length) return
        let y = Infinity, z = 0
        for (const p of stop.pts) { y = Math.min(y, p.y); z += p.z / stop.pts.length }
        anchor.set((stop.span.x0 + stop.span.x1) / 2, y, z)
      }
      const mount = anchor.clone().add(new THREE.Vector3(...def.at))
      if (def.roof) mount.y = Math.max(14, (x1 - x0) * 0.55)
      cams.push({ ...def, n, anchor, mount, look: anchor.clone() })
    })
    built = { line, cams }
    return cams
  }

  /** Where the line's action is: the part in the gripper, else one riding the transport, else one in flight. */
  function actionAt(sim) {
    if (sim.arm.holding) return sim.arm.holding.pos
    if (sim.carried.length) return sim.carried[0].pos
    const p = sim.latest
    return p && p.visible && p.mode !== 'home' && p.mode !== 'seated' ? p.pos : null
  }

  // Heads move like a pan motor: constant speed, a hard stop at each end of a sweep, no easing anywhere.
  const SLEW = 7
  const TRAVEL = 4
  const PAUSE = 1.2
  /** -1..1 along a sweep: a pause at each end, a constant-speed pan between. */
  function pan(t) {
    const c = ((t % (2 * (TRAVEL + PAUSE))) + 2 * (TRAVEL + PAUSE)) % (2 * (TRAVEL + PAUSE))
    if (c < PAUSE) return -1
    if (c < PAUSE + TRAVEL) return -1 + (2 * (c - PAUSE)) / TRAVEL
    if (c < 2 * PAUSE + TRAVEL) return 1
    return 1 - (2 * (c - 2 * PAUSE - TRAVEL)) / TRAVEL
  }
  const goal = new THREE.Vector3()
  /**
   * Turns `cam.look` toward where its head wants to face at a fixed speed. Sweeps share the page clock and the step
   * is timed by it too, so the props and the feed agree however many times a frame this runs.
   */
  function aim(cam, sim) {
    const now = performance.now() / 1000
    const action = actionAt(sim)
    if (cam.track === 'arm') goal.copy(sim.arm.pos)
    else if (cam.track === 'part' && action && action.distanceTo(cam.anchor) < 14) goal.copy(action)
    else goal.copy(cam.anchor).setX(cam.anchor.x + (calm || !cam.sweep ? 0 : pan(now + cam.n * 1.7) * cam.sweep))
    const dt = cam.aimed === undefined ? Infinity : Math.min(0.1, now - cam.aimed)
    cam.aimed = now
    const gap = cam.look.distanceTo(goal)
    if (gap <= SLEW * dt) cam.look.copy(goal)
    else cam.look.addScaledVector(goal.sub(cam.look), (SLEW * dt) / gap)
    return cam.look
  }

  /** What the monitor shows, shared by the shot and the overlay. */
  const feed = { cam: null, next: 0, last: Infinity, variant: null }

  function nearest(cams, p) {
    let best = cams[0], d = Infinity
    for (const c of cams) {
      const m = Math.hypot(c.anchor.x - p.x, c.anchor.z - p.z) + (c.roof ? 6 : 0)
      if (m < d) { d = m; best = c }
    }
    return best
  }
  /** The camera the variant wants now, and how long until it asks again. */
  function choose(variant, cams, sim) {
    if (variant === 'follow') return [nearest(cams, actionAt(sim) ?? (cams.includes(feed.cam) ? feed.cam.anchor : sim.arm.pos)), HOLD]
    if (variant && variant.startsWith('cam-')) return [cams.find((c) => c.n === Number(variant.slice(4)) - 1) ?? cams[0], Infinity]
    return [cams[(cams.indexOf(feed.cam) + 1) % cams.length], DWELL]
  }

  const screen = (top, bottom) =>
    'data:image/svg+xml;utf8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 44 32"><rect width="44" height="32" rx="3" fill="#0E1A12"/><rect x="2" y="2" width="40" height="28" rx="2" fill="#1F3B27"/><path d="M2 22 L14 14 L24 19 L34 11 L42 15 V30 H2 Z" fill="#2F5A3B"/><circle cx="7" cy="7" r="2" fill="#FF3B30"/><text x="40" y="9" text-anchor="end" font-family="monospace" font-size="6" fill="#D9FFD9">${top}</text><text x="4" y="27" font-family="monospace" font-size="5" fill="#D9FFD9">${bottom}</text></svg>`)
  const VARIANTS = [
    { id: 'auto', label: 'Auto cycle', description: `Cuts to the next camera every ${DWELL} s`, thumbnail: screen('AUTO', 'CH 1-6') },
    { id: 'follow', label: 'Follow part', description: 'Cuts to the camera nearest the action', thumbnail: screen('TRK', 'FOLLOW') },
    ...CAMS.map((c, n) => ({ id: `cam-${n + 1}`, label: `CAM ${String(n + 1).padStart(2, '0')}`, description: c.name[0] + c.name.slice(1).toLowerCase(), thumbnail: screen(`CAM ${n + 1}`, c.name.split(' ')[0]) })),
  ]

  const dir = new THREE.Vector3()
  const view = {
    id: 'cctv',
    kind: 'view',
    label: 'CCTV',
    description: 'Security cameras around the campus',
    variants: VARIANTS,
    // A wall-mounted camera with its REC light, on a 24 x 24 grid.
    icon: 'M2 5H16V11H2Z M4 7V9H14V7Z M16 6.5H21V9.5H16Z M2 13H4V21H2Z M4 16H9V18H4Z M7 11H9V16H7Z M19 15a2 2 0 1 1 0 4a2 2 0 1 1 0 -4Z',
    shot({ sim, t, aspect, variant }, out) {
      const cams = mounts(sim.line)
      // A smaller t than last frame means the view was picked again (or with another variant): start over.
      if (t < feed.last || variant !== feed.variant || !cams.includes(feed.cam)) {
        feed.next = 0
        feed.cam = null
      }
      feed.last = t
      feed.variant = variant
      if (t >= feed.next) {
        const [next, wait] = choose(variant, cams, sim)
        feed.cam = next
        feed.next = t + wait
      }
      const cam = feed.cam
      aim(cam, sim)
      dir.copy(cam.look).sub(cam.mount).normalize()
      // The eye sits just in front of the lens, so the camera's own housing never fills the picture.
      out.pos.copy(cam.mount).addScaledVector(dir, 0.45)
      out.look.copy(cam.look)
      out.fov = aspect < 1 ? Math.min(80, cam.fov * 1.45) : cam.fov
      // Always a hard cut: the director's easing would round off the motor's stops.
      return true
    },
    Overlay,
    Scenery,
  }

  const NOISE = `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='180' height='180'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='1 0 0 0 0 1 0 0 0 0 1 0 0 0 0 0 0 0 0 1'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>")`
  const CSS = `
    @keyframes fabcctv-grain { 0% { transform: translate(0, 0) } 25% { transform: translate(-40px, 25px) } 50% { transform: translate(30px, -35px) } 75% { transform: translate(-20px, -15px) } 100% { transform: translate(0, 0) } }
    @keyframes fabcctv-roll { from { transform: translateY(-30%) } to { transform: translateY(130%) } }
    @keyframes fabcctv-blink { 0%, 49% { opacity: 1 } 50%, 100% { opacity: 0.15 } }
  `
  const pad = (n) => String(n).padStart(2, '0')
  const stamp = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  const text = { color: '#D9FFD9', textShadow: '0 0 6px rgba(0, 0, 0, 0.9), 0 0 2px rgba(0, 0, 0, 0.9)' }
  const fill = { position: 'absolute', inset: 0 }

  const MODES = { auto: 'AUTO', follow: 'FOLLOW' }
  function Overlay({ top, variant }) {
    const [, setTick] = useState(0)
    useEffect(() => {
      const id = setInterval(() => setTick((n) => n + 1), calm ? 1000 : 200)
      return () => clearInterval(id)
    }, [])
    const cam = feed.cam
    const label = cam ? `CAM ${pad(cam.n + 1)}` : 'CAM --'
    return html`
      <div aria-hidden="true" data-cctv=${label} style=${{ ...fill, pointerEvents: 'none', overflow: 'hidden', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
        <style>${CSS}</style>
        <div style=${{ ...fill, backdropFilter: 'grayscale(1) sepia(0.4) hue-rotate(58deg) saturate(1.8) contrast(1.35) brightness(0.86)', WebkitBackdropFilter: 'grayscale(1) sepia(0.4) hue-rotate(58deg) saturate(1.8) contrast(1.35) brightness(0.86)' }} />
        <div style=${{ position: 'absolute', inset: '-60px', backgroundImage: NOISE, mixBlendMode: 'overlay', opacity: 0.28, animation: calm ? 'none' : 'fabcctv-grain 0.6s steps(4) infinite' }} />
        <div style=${{ ...fill, background: 'repeating-linear-gradient(to bottom, rgba(0, 0, 0, 0.22) 0px, rgba(0, 0, 0, 0.22) 1px, transparent 1px, transparent 3px)' }} />
        ${!calm && html`<div style=${{ position: 'absolute', left: 0, right: 0, height: '18%', background: 'linear-gradient(to bottom, transparent, rgba(220, 255, 220, 0.07), transparent)', animation: 'fabcctv-roll 7s linear infinite' }} />`}
        <div style=${{ ...fill, background: 'radial-gradient(ellipse at center, transparent 48%, rgba(0, 0, 0, 0.62) 100%)' }} />
        <div style=${{ ...text, position: 'absolute', top: top + 10, left: 16, display: 'flex', flexDirection: 'column', gap: 2, fontSize: 12, letterSpacing: '0.18em' }}>
          <span style=${{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14 }}>
            <span style=${{ width: 10, height: 10, borderRadius: 999, background: '#FF3B30', boxShadow: '0 0 8px #FF3B30', animation: calm ? 'none' : 'fabcctv-blink 1s steps(1) infinite' }} />
            REC
          </span>
          <span style=${{ opacity: 0.8 }}>SEC-NET · ${MODES[variant] ?? 'FIXED'}</span>
        </div>
        <div style=${{ ...text, position: 'absolute', top: top + 10, right: 16, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2, fontSize: 12, letterSpacing: '0.18em' }}>
          <span style=${{ fontSize: 18, letterSpacing: '0.12em' }}>${label}</span>
          <span>${cam ? cam.name : 'NO SIGNAL'}</span>
          <span style=${{ opacity: 0.8, fontVariantNumeric: 'tabular-nums' }}>${stamp(new Date())}</span>
        </div>
      </div>
    `
  }

  const o = new THREE.Object3D()
  const tip = new THREE.Vector3()
  function Scenery({ c, sim, line, live }) {
    const poles = useRef(null)
    const heads = useRef(null)
    const leds = useRef(null)
    const [geo] = useState(() => ({
      pole: new THREE.CylinderGeometry(0.05, 0.07, 1, 8).translate(0, 0.5, 0),
      head: new THREE.BoxGeometry(0.24, 0.22, 0.6).translate(0, 0, 0.12),
      led: new THREE.SphereGeometry(0.045, 8, 6),
      red: new THREE.MeshBasicMaterial({ color: '#FF3B30', toneMapped: false }),
    }))
    useEffect(() => () => Object.values(geo).forEach((g) => g.dispose()), [geo])
    fiber.useFrame(() => {
      if (!poles.current || !heads.current || !leds.current) return
      const cams = mounts(line)
      cams.forEach((cam, k) => {
        const hidden = live && cam === feed.cam
        o.position.set(cam.mount.x, 0, cam.mount.z)
        o.rotation.set(0, 0, 0)
        o.scale.set(1, cam.roof || hidden ? 0 : Math.max(0, cam.mount.y - 0.12), 1)
        o.updateMatrix()
        poles.current.setMatrixAt(k, o.matrix)
        o.position.copy(cam.mount)
        o.scale.setScalar(hidden ? 0 : 1)
        o.lookAt(aim(cam, sim))
        o.updateMatrix()
        heads.current.setMatrixAt(k, o.matrix)
        tip.set(0, 0.13, -0.12).applyMatrix4(o.matrix)
        o.position.copy(tip)
        o.rotation.set(0, 0, 0)
        o.updateMatrix()
        leds.current.setMatrixAt(k, o.matrix)
      })
      for (const m of [poles.current, heads.current, leds.current]) {
        m.count = cams.length
        m.instanceMatrix.needsUpdate = true
      }
      leds.current.visible = calm || Math.floor(performance.now() / 500) % 2 === 0
    })
    return html`
      <group>
        <instancedMesh ref=${poles} args=${[geo.pole, core.fillMat(c.muted, c.flat, c.rough), CAMS.length]} frustumCulled=${false} />
        <instancedMesh ref=${heads} args=${[geo.head, core.fillMat(c.fg, c.flat, c.rough), CAMS.length]} frustumCulled=${false} />
        <instancedMesh ref=${leds} args=${[geo.led, geo.red, CAMS.length]} frustumCulled=${false} />
      </group>
    `
  }

  return { tools: [view] }
}
