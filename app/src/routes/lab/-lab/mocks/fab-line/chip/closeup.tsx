import { Html, Line } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { RefObject } from 'react'
import { Color, DoubleSide, LineBasicMaterial, MeshBasicMaterial, MeshStandardMaterial, Object3D, PlaneGeometry, ShaderMaterial, Vector3 } from 'three'
import type { Group, InstancedMesh, Mesh, Texture } from 'three'

import type { Lab } from '@/routes/lab/-lab/lab.types'
import { announce } from '@/routes/lab/-lab/kit/a11y'
import { play } from '@/routes/lab/-lab/kit/sound'
import type { ChipCam, Part, Tokens } from '../core/contract'
import { chipTop, PKG_NAME } from '../core/spec'
import { lineMat, reducedMotion } from '../core/three'
import { circuitArt, dieArt, fingerAt, hatch, inkOn, PLATE, plateArt, plateToDie, variantWord } from './art'
import { climb, createDepth, DEEPEST, goStage, heading, nudge, PINCH, reveal, settle, STAGES, WHEEL } from './depth'
import { along, floorplan } from './floorplan'
import { gutsOf } from './guts'
import { chipMat, lidOf } from './package'
import { buildPieces, cavityOf, piecesOf } from './pieces'
import type { Layer } from './pieces'

type V3 = [number, number, number]
const ease = (t: number) => t * t * (3 - 2 * t)
const lerp = (a: number, b: number, t: number) => a + (b - a) * t

const DIE_VERT = /* glsl */ `varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`
/** The die's top metal wiping into its circuit layer from the top edge, with a lit etch front. */
const DIE_FRAG = /* glsl */ `uniform sampler2D a; uniform sampler2D b; uniform float t; uniform float hasA; uniform float hasB; uniform float opacity;
uniform vec3 edge; uniform vec3 base;
varying vec2 vUv;
void main() {
  vec3 A = hasA > 0.5 ? texture2D(a, vUv).rgb : base;
  vec3 B = hasB > 0.5 ? texture2D(b, vUv).rgb : A;
  float w = (1.0 - vUv.y) * 0.82 + vUv.x * 0.18;
  float f = t * 1.24 - 0.1;
  vec3 col = mix(A, B, 1.0 - smoothstep(f - 0.025, f, w));
  col += edge * exp(-pow((w - f) / 0.012, 2.0)) * step(0.002, t) * step(t, 0.998) * 1.5;
  gl_FragColor = vec4(col, opacity);
  #include <colorspace_fragment>
}`

/** Bond wires from the die's edge out to the lead fingers, as arcs of three segments each. */
function bondWires(spec: Part['spec'], cav: ReturnType<typeof cavityOf>) {
  const pts: V3[] = []
  const y0 = cav.y + 0.018
  const sides = spec.pkg === 'soic' || spec.pkg === 'dip' ? [0, 1] : [0, 1, 2, 3]
  const reach = { x: Math.min(spec.w / 2 - 0.03, cav.w * 0.5 + 0.22), z: Math.min(spec.d / 2 - 0.03, cav.d * 0.5 + 0.18) }
  for (const s of sides) {
    const n = s < 2 ? Math.max(3, Math.round(cav.w / 0.07)) : Math.max(3, Math.round(cav.d / 0.07))
    for (let i = 0; i < n; i++) {
      const k = (i + 0.5) / n - 0.5
      const sign = s % 2 ? 1 : -1
      const a: V3 = s < 2 ? [cav.x + k * cav.w * 0.9, y0, sign * cav.d * 0.46] : [cav.x + sign * cav.w * 0.46, y0, k * cav.d * 0.9]
      const b: V3 = s < 2 ? [cav.x + k * cav.w * 1.25, cav.y, sign * reach.z] : [cav.x + sign * reach.x, cav.y, k * cav.d * 1.25]
      const at = (t: number, lift: number): V3 => [lerp(a[0], b[0], t), lerp(a[1], b[1], t) + lift, lerp(a[2], b[2], t)]
      const h = Math.min(cav.w, cav.d) * 0.2
      const m1 = at(0.25, h), m2 = at(0.6, h * 0.8)
      pts.push(a, m1, m1, m2, m2, b)
    }
  }
  return pts
}

/** A label pinned to a 3D point with a short leader, shown on the section stage. */
function Callout({ at, title, sub, show, reach = 56, flip = false }: { at: V3; title: string; sub: string; show: boolean; reach?: number; flip?: boolean }) {
  return (
    <Html position={at} zIndexRange={[12, 0]} style={{ pointerEvents: 'none' }}>
      <div className="relative transition-opacity duration-300" style={{ opacity: show ? 1 : 0 }}>
        <span className="absolute -left-[3px] -top-[3px] size-[7px] rounded-full bg-accent" />
        <span className="absolute top-0 h-px bg-accent" style={{ width: reach, left: flip ? -reach : 0 }} />
        <div className="absolute top-0 -translate-y-1/2 whitespace-nowrap rounded-md border border-border bg-surface/90 px-1.5 py-0.5 font-mono text-[10px] leading-tight text-foreground shadow-sm backdrop-blur" style={flip ? { right: reach } : { left: reach }}>
          <div className="tracking-[0.14em]">{title}</div>
          {!flip && <div className="text-muted">{sub}</div>}
        </div>
      </div>
    </Html>
  )
}

/** The die's printed top over the span x0..x1 of the cavity, so each half of a cut die keeps its half of the print. */
function DieTop({ tex, cav, x0, x1, opacity }: { tex: Texture; cav: ReturnType<typeof cavityOf>; x0: number; x1: number; opacity?: { opacity: number } }) {
  const map = useMemo(() => {
    const t = tex.clone()
    t.repeat.set((x1 - x0) / cav.w, 1)
    t.offset.set((x0 - (cav.x - cav.w / 2)) / cav.w, 0)
    t.needsUpdate = true
    return t
  }, [tex, cav, x0, x1])
  const mat = useMemo(() => new MeshBasicMaterial({ map, transparent: true, toneMapped: false }), [map])
  useEffect(() => () => { map.dispose(); mat.dispose() }, [map, mat])
  useFrame(() => { if (opacity) mat.opacity = opacity.opacity })
  return (
    <mesh position={[(x0 + x1) / 2, cav.y + 0.019, 0]} rotation-x={-Math.PI / 2} material={mat}>
      <planeGeometry args={[x1 - x0, cav.d]} />
    </mesh>
  )
}

/** The depth ladder: where the close-up is, how to go deeper, and a button per stage. */
function Gauge({ stage, onGo, phone }: { stage: number; onGo: (i: number) => void; phone: boolean }) {
  const stop = (e: { stopPropagation: () => void }) => e.stopPropagation()
  return (
    <div
      role="group"
      aria-label="Close-up depth"
      onPointerDown={stop}
      onPointerUp={stop}
      onClick={stop}
      onDoubleClick={stop}
      className={`w-max select-none whitespace-nowrap rounded-xl border border-border bg-surface/90 p-2 font-mono text-[10px] text-foreground shadow-lg backdrop-blur ${phone ? '-translate-x-1/2 -translate-y-full' : '-translate-x-full -translate-y-1/2'}`}
      data-depth={STAGES[stage].id}
    >
      <div className="flex items-center justify-between gap-3 px-1 pb-1.5 tracking-[0.18em] text-muted">
        <span>DEPTH</span>
        <span className="tabular-nums">{String(stage + 1).padStart(2, '0')}/{String(STAGES.length).padStart(2, '0')}</span>
      </div>
      <div className={phone ? 'flex gap-1' : 'flex flex-col gap-0.5'}>
        {STAGES.map((s, i) => (
          <button
            key={s.id}
            type="button"
            aria-current={i === stage ? 'step' : undefined}
            onClick={() => onGo(i)}
            className={`flex items-center gap-2 rounded-md px-1.5 py-1 text-left tracking-[0.1em] focus-visible:outline-2 focus-visible:outline-accent ${i === stage ? 'bg-accent text-accent-foreground' : i < stage ? 'text-foreground' : 'text-muted hover:text-foreground'}`}
          >
            <span className="tabular-nums opacity-70">{i + 1}</span>
            {!phone && <span>{s.label.toUpperCase()}</span>}
          </button>
        ))}
      </div>
      {!phone && <div className="mt-1.5 border-t border-border px-1 pt-1.5 leading-snug text-muted">scroll · pinch · + −<br />esc climbs out</div>}
    </div>
  )
}

/**
 * The close-up of one seated chip, mounted while it is focused. Depth (see
 * depth.ts) peels it in stages: the cap lifts off the die and its bond wires;
 * the package parts along x = 0 and its layers separate under labels; the
 * die rises onto an inspection plate with the block's screenshot as its top
 * metal; that metal etches away into the item's circuit, with pulses riding
 * its signal path. Scroll, pinch and +/− drive depth while the camera is on
 * the chip; Escape climbs a stage before it lets the close-up go.
 */
export function CloseUp({ p, lab, c, cam, top, body, code }: {
  p: Part; lab: Lab; c: Tokens; cam: ChipCam; top: Texture | null; body: RefObject<Group | null>; code: string
}) {
  const { camera, gl, size } = useThree()
  const spec = p.spec
  const r = Math.max(spec.fw, spec.fd)
  const cav = useMemo(() => cavityOf(spec), [spec])
  const lid = lidOf(spec)
  const tip = chipTop(spec)
  const depth = useRef(createDepth()).current
  const [stage, setStage] = useState(0)
  const shown = useRef(0)
  const [here, setHere] = useState(false)
  const [deep, setDeep] = useState(false)
  const bodyColor = spec.pkg === 'passive' && spec.c <= 0.5 ? c.pin : c.body

  const model = useMemo(() => {
    const list = piecesOf(spec, true)
    const colors = { body: bodyColor, pin: c.pin, die: c.die }
    const layer = (l: Layer) => buildPieces(list, colors, (q) => q.layer === l, -1)
    const base = list.find((q) => q.layer === 'body')!
    const paddle = list.find((q) => q.layer === 'paddle')!
    return {
      lead: layer('lead'), body: layer('body'), paddle: layer('paddle'), die: layer('die'),
      pos: buildPieces(list, colors, (q) => q.layer !== 'cap', 1),
      cap: buildPieces(list, colors, (q) => q.layer === 'cap'),
      cut: { y: base.at[1], h: base.size[1], d: base.size[2] },
      paddleY: paddle.at[1],
    }
  }, [spec, bodyColor, c.pin, c.die])
  const mats = useMemo(() => {
    const fill = () => (c.flat ? new MeshBasicMaterial({ vertexColors: true, transparent: true }) : new MeshStandardMaterial({ vertexColors: true, roughness: 0.75, metalness: 0.18, transparent: true }))
    const tex = hatch(c.edge).clone()
    tex.repeat.set(model.cut.d / 0.05, model.cut.h / 0.05)
    tex.needsUpdate = true
    return {
      pos: fill(), cap: fill(), posEdge: new LineBasicMaterial({ color: c.bodyEdge, transparent: true }), capEdge: new LineBasicMaterial({ color: c.bodyEdge, transparent: true }),
      print: new MeshBasicMaterial({ map: top, transparent: true, toneMapped: false }),
      hatch: new MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false }),
    }
  }, [c.flat, c.bodyEdge, c.edge, model, top])
  useEffect(() => () => {
    for (const g of Object.values(model)) if (g && typeof g === 'object' && 'fill' in g) { g.fill?.dispose(); g.edges?.dispose() }
  }, [model])
  useEffect(() => () => { mats.hatch.map?.dispose(); Object.values(mats).forEach((m) => m.dispose()) }, [mats])
  const wires = useMemo(() => bondWires(spec, cav), [spec, cav])

  const guts = useMemo(() => gutsOf(p.item, lab.setup), [p.item, lab.setup.framework, lab.setup.database])
  const plan = useMemo(() => floorplan(guts), [guts])
  const image = lab.theme === 'dark' ? (p.item.imageDark ?? p.item.image) : p.item.image
  const [dieTex, setDieTex] = useState<Texture | null>(null)
  useEffect(() => {
    let live = true
    void dieArt(image, p.item.hue, p.item.title, c).then((t) => live && setDieTex(t))
    return () => { live = false }
  }, [image, p.item.hue, p.item.title, c])
  const sheets = useMemo(() => (deep ? { circuit: circuitArt(guts, plan, c), plate: plateArt(p.item, guts, plan, spec, code, c) } : null), [deep, guts, plan, c, p.item, spec, code])
  useEffect(() => () => { sheets?.circuit.dispose(); sheets?.plate.dispose() }, [sheets])
  const dieMat = useMemo(() => new ShaderMaterial({
    uniforms: { a: { value: null }, b: { value: null }, t: { value: 0 }, hasA: { value: 0 }, hasB: { value: 0 }, opacity: { value: 0 }, edge: { value: new Color(c.lit) }, base: { value: new Color(c.die) } },
    vertexShader: DIE_VERT, fragmentShader: DIE_FRAG, transparent: true,
  }), [c.lit, c.die])
  useEffect(() => () => dieMat.dispose(), [dieMat])
  useEffect(() => {
    const u = dieMat.uniforms
    u.a.value = dieTex; u.hasA.value = dieTex ? 1 : 0
    u.b.value = sheets?.circuit ?? null; u.hasB.value = sheets ? 1 : 0
  }, [dieMat, dieTex, sheets])
  const plateMat = useMemo(() => new MeshBasicMaterial({ transparent: true, toneMapped: false, opacity: 0 }), [])
  useEffect(() => { plateMat.map = sheets?.plate ?? null; plateMat.needsUpdate = true }, [plateMat, sheets])
  useEffect(() => () => plateMat.dispose(), [plateMat])

  /** Plate-local points: canvas units measured from the die window's centre, y up off the sheet. */
  const at = (u: number, v: number, y = 0): V3 => [u - PLATE.cx, y, v - PLATE.cy]
  const plateWires = useMemo(() => {
    const pts: V3[] = []
    for (const pad of plan.pads) {
      const [ax, ay] = plateToDie(pad)
      const [bx, by] = fingerAt(pad)
      const h = 0.018
      pts.push(at(ax, ay, 0.004), at(lerp(ax, bx, 0.3), lerp(ay, by, 0.3), h), at(lerp(ax, bx, 0.3), lerp(ay, by, 0.3), h), at(bx, by, 0.004))
    }
    return pts
  }, [plan])
  const pulses = useMemo(() => {
    const list: { w: number; phase: number }[] = []
    plan.wires.forEach((w, i) => {
      const n = Math.min(3, 1 + Math.floor(w.len * 2.2))
      for (let k = 0; k < n && list.length < 64; k++) list.push({ w: i, phase: k / n + i * 0.137 })
    })
    return list
  }, [plan])
  const pulseGeo = useMemo(() => new PlaneGeometry(1, 1).rotateX(-Math.PI / 2), [])
  useEffect(() => () => pulseGeo.dispose(), [pulseGeo])

  const root = useRef<Group>(null)
  const cap = useRef<Group>(null)
  const pos = useRef<Group>(null)
  const layers = { lead: useRef<Group>(null), body: useRef<Group>(null), paddle: useRef<Group>(null), die: useRef<Group>(null) }
  const bond = useRef<Group>(null)
  const plate = useRef<Group>(null)
  const dieMesh = useRef<Mesh>(null)
  const bondPlate = useRef<Group>(null)
  const pulseMesh = useRef<InstancedMesh>(null)
  const wrote = useRef(cam.decap)
  const yaw = useRef(0)
  const scratch = useMemo(() => ({ v: new Vector3(), dummy: new Object3D(), uv: [0, 0] as [number, number] }), [])

  const near = () => {
    if (cam.focusRef !== p.item.ref || p.mode !== 'seated') return false
    scratch.v.copy(p.pos).setY(p.pos.y + tip * p.scale)
    return camera.position.distanceTo(scratch.v) < r * p.scale * 12
  }
  const nearRef = useRef(near)
  nearRef.current = near

  useEffect(() => {
    const scene = gl.domElement.closest('[role=application]') ?? gl.domElement.parentElement
    const inside = (e: Event) => !!scene && e.target instanceof Node && scene.contains(e.target)
    const onWheel = (e: WheelEvent) => {
      if (!inside(e) || !nearRef.current()) return
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY) && !e.ctrlKey) return
      e.preventDefault()
      e.stopPropagation()
      const px = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1)
      nudge(depth, e.ctrlKey ? -px * 0.01 * PINCH : -px * WHEEL)
    }
    const touches = new Map<number, { x: number; y: number }>()
    let span = 0
    const gap = () => {
      const [a, b] = [...touches.values()]
      return Math.hypot(a.x - b.x, a.y - b.y)
    }
    const onDown = (e: PointerEvent) => {
      if (e.pointerType === 'mouse' || !inside(e)) return
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY })
      span = touches.size === 2 ? gap() : 0
    }
    const onMove = (e: PointerEvent) => {
      const t = touches.get(e.pointerId)
      if (!t) return
      t.x = e.clientX
      t.y = e.clientY
      if (touches.size !== 2 || !nearRef.current()) return
      e.stopPropagation()
      const g = gap()
      if (span > 0 && g > 0) nudge(depth, Math.log(g / span) * PINCH)
      span = g
    }
    const onUp = (e: PointerEvent) => {
      touches.delete(e.pointerId)
      span = 0
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return
      if (cam.focusRef !== p.item.ref || p.mode !== 'seated') return
      const at = heading(depth)
      let used = false
      if (e.key === 'Escape') used = climb(depth)
      else if (e.key === '+' || e.key === '=') { goStage(depth, at + 1); used = true }
      else if ((e.key === '-' || e.key === '_') && at > 0) { goStage(depth, at - 1); used = true }
      if (!used) return
      e.preventDefault()
      e.stopPropagation()
    }
    const opts = { capture: true, passive: false } as const
    addEventListener('wheel', onWheel, opts)
    addEventListener('pointerdown', onDown, true)
    addEventListener('pointermove', onMove, true)
    addEventListener('pointerup', onUp, true)
    addEventListener('pointercancel', onUp, true)
    addEventListener('keydown', onKey, true)
    return () => {
      removeEventListener('wheel', onWheel, opts)
      removeEventListener('pointerdown', onDown, true)
      removeEventListener('pointermove', onMove, true)
      removeEventListener('pointerup', onUp, true)
      removeEventListener('pointercancel', onUp, true)
      removeEventListener('keydown', onKey, true)
    }
  }, [gl, depth, cam, p])

  useEffect(() => {
    announce(`${p.item.title} close-up. Scroll, pinch or press plus to peel it open, Escape climbs back out.`)
  }, [p.item.title])
  useEffect(() => {
    if (!stage) return
    const s = STAGES[stage]
    announce(`${p.item.title}: ${s.label}. ${s.cue}.`)
  }, [stage, p.item.title])

  useFrame(({ clock }, dt) => {
    if (cam.decap !== wrote.current) {
      goStage(depth, cam.decap ? 3 : 0)
      wrote.current = cam.decap
    }
    settle(depth, Math.min(dt, 0.1), reducedMotion)
    const head = heading(depth)
    if (head !== shown.current) {
      shown.current = head
      setStage(head)
      play('tick')
    }
    const isNear = near()
    if (isNear !== here) setHere(isNear)
    if (head >= 2 && !deep) setDeep(true)
    if (STAGES[head].top !== cam.decap) cam.decap = wrote.current = STAGES[head].top

    const d = depth.value
    const open = d > 0.002
    if (body.current) body.current.visible = !open
    if (root.current) root.current.visible = open
    if (!open) return
    const lidT = reveal(d, 1), sec = reveal(d, 2), rise = reveal(d, 3), etch = reveal(d, 4)
    if (cap.current) {
      cap.current.visible = sec < 0.999
      cap.current.position.set(-0.12 * r * lidT, (0.45 * lidT + 0.9 * sec) * r, -0.08 * r * lidT)
      cap.current.rotation.set(0.16 * lidT, 0, 0.3 * lidT + 0.3 * sec)
      mats.cap.opacity = mats.capEdge.opacity = mats.print.opacity = 1 - sec
    }
    if (pos.current) {
      pos.current.visible = sec < 0.999
      pos.current.position.x = sec * r * 0.9
      mats.pos.opacity = mats.posEdge.opacity = 1 - sec
    }
    const g = 0.26 * r * sec * (1 - ease(rise))
    layers.body.current?.position.setY(g)
    layers.paddle.current?.position.setY(g * 2.1)
    if (layers.die.current) {
      layers.die.current.position.setY(g * 3.2)
      layers.die.current.visible = rise < 0.25
    }
    mats.hatch.opacity = sec * 0.9
    if (bond.current) bond.current.visible = lidT > 0.25 && sec < 0.04

    const P = plate.current
    if (P) {
      P.visible = rise > 0.001
      if (P.visible) {
        const e = ease(rise)
        const end = 2 * Math.min(0.62 * r * 0.66, 0.62 * r * (size.width / Math.max(1, size.height)) * 0.76)
        P.scale.setScalar(lerp(cav.w / PLATE.die, end, e))
        P.position.set(lerp(cav.x, 0, e), lerp(cav.y + 0.02 + g * 3.2, tip + 0.2 * r, e), 0)
        const m = camera.matrixWorld.elements
        if (Math.hypot(m[4], m[6]) > 1e-3) yaw.current = Math.atan2(-m[4], -m[6]) - p.spin
        P.rotation.y = lerp(0, yaw.current, e)
        plateMat.opacity = Math.min(1, Math.max(0, (rise - 0.3) / 0.5))
        dieMat.uniforms.opacity.value = Math.min(1, rise * 5)
        dieMat.uniforms.t.value = etch
        if (bondPlate.current) bondPlate.current.visible = rise > 0.7
        const pm = pulseMesh.current
        if (pm) {
          pm.visible = etch > 0.92
          if (pm.visible) {
            const time = reducedMotion ? 0 : clock.elapsedTime
            pulses.forEach((q, i) => {
              const w = plan.wires[q.w]
              along(w, reducedMotion ? 0.5 : (q.phase + (time * 0.32) / Math.max(0.2, w.len)) % 1, scratch.uv)
              scratch.dummy.position.set((scratch.uv[0] - 0.5) * PLATE.die, 0.006, (scratch.uv[1] - 0.5) * PLATE.die)
              scratch.dummy.scale.setScalar(0.015)
              scratch.dummy.updateMatrix()
              pm.setMatrixAt(i, scratch.dummy.matrix)
            })
            pm.instanceMatrix.needsUpdate = true
          }
        }
      }
    }
  })

  const fill = chipMat(c.flat, false)
  const edge = lineMat(c.bodyEdge)
  const ghostOf = (geo: { fill: import('three').BufferGeometry | null; edges: import('three').BufferGeometry | null }) => (
    <>
      {geo.fill && <mesh geometry={geo.fill} material={fill} />}
      {geo.edges && <lineSegments geometry={geo.edges} material={edge} />}
    </>
  )
  const sectionShown = stage === 2
  const word = variantWord(p.item)
  const phone = size.width < 640
  return (
    <>
      <group ref={root} visible={false}>
        <group ref={layers.lead}>
          {ghostOf(model.lead)}
          <Callout at={[-0.06, 0.02, -(spec.d / 2 + Math.max(0.02, spec.lead * 0.6))]} title="LEAD FRAME" sub={`Cu alloy · ${PKG_NAME[spec.pkg]}`} flip={phone} show={sectionShown} reach={40} />
        </group>
        <group ref={layers.body}>
          {ghostOf(model.body)}
          <mesh position={[0.0015, model.cut.y, 0]} rotation-y={Math.PI / 2} material={mats.hatch}>
            <planeGeometry args={[model.cut.d, model.cut.h]} />
          </mesh>
          <Callout at={[0.002, model.cut.y, -model.cut.d * 0.44]} title="MOLD" sub="epoxy compound · cut face" flip={phone} show={sectionShown} reach={72} />
        </group>
        <group ref={layers.paddle}>
          {ghostOf(model.paddle)}
          <Callout at={[cav.x + 0.004, model.paddleY, -cav.d * 0.6]} title="PADDLE" sub="die attach · Ag epoxy" flip={phone} show={sectionShown} reach={96} />
        </group>
        <group ref={layers.die}>
          {ghostOf(model.die)}
          <Callout at={[cav.x + 0.004, cav.y + 0.012, -cav.d * 0.5]} title={`DIE · ${word}`} sub={`${guts.units.length} units · ${plan.pads.length} pads`} flip={phone} show={sectionShown} reach={110} />
          {dieTex && <DieTop tex={dieTex} cav={cav} x0={cav.x - cav.w / 2} x1={0.004} />}
        </group>
        <group ref={pos}>
          {model.pos.fill && <mesh geometry={model.pos.fill} material={mats.pos} />}
          {model.pos.edges && <lineSegments geometry={model.pos.edges} material={mats.posEdge} />}
          {dieTex && <DieTop tex={dieTex} cav={cav} x0={-0.004} x1={cav.x + cav.w / 2} opacity={mats.pos} />}
        </group>
        <group ref={cap}>
          {model.cap.fill && <mesh geometry={model.cap.fill} material={mats.cap} />}
          {model.cap.edges && <lineSegments geometry={model.cap.edges} material={mats.capEdge} />}
          {top && spec.pkg !== 'passive' && (
            <mesh position={[lid.x, lid.y, 0]} rotation-x={-Math.PI / 2} material={mats.print}>
              <planeGeometry args={[lid.w, lid.d]} />
            </mesh>
          )}
        </group>
        <group ref={bond} visible={false}>
          <Line points={wires} segments color={c.gold} lineWidth={1.2} />
        </group>
        <group ref={plate} visible={false}>
          <mesh position={at(0.5, 0.5)} rotation-x={-Math.PI / 2} material={plateMat}>
            <planeGeometry args={[1, 1]} />
          </mesh>
          <mesh ref={dieMesh} position={[0, 0.002, 0]} rotation-x={-Math.PI / 2} material={dieMat}>
            <planeGeometry args={[PLATE.die, PLATE.die]} />
          </mesh>
          <group ref={bondPlate} visible={false}>
            <Line points={plateWires} segments color={c.gold} lineWidth={1.4} />
          </group>
          <instancedMesh ref={pulseMesh} args={[pulseGeo, undefined, pulses.length]} frustumCulled={false} visible={false}>
            <meshBasicMaterial color={inkOn(c.die, c)} toneMapped={false} side={DoubleSide} />
          </instancedMesh>
        </group>
      </group>
      {here && <Html calculatePosition={() => (phone ? [size.width / 2, size.height - 104] : [size.width - 16, size.height / 2])} zIndexRange={[12, 0]}>
        <Gauge stage={stage} phone={phone} onGo={(i) => goStage(depth, Math.min(DEEPEST, i))} />
      </Html>}
    </>
  )
}
