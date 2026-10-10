import { Billboard, Shadow, Edges, Html, Line, Outlines, useTexture } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { BallCollider, CuboidCollider, Physics, RigidBody } from '@react-three/rapier'
import type { RapierRigidBody } from '@react-three/rapier'
import { Suspense, memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { MutableRefObject, ReactNode } from 'react'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

import type { CatalogItem } from '../../../workspace/-workspace/workspace.types'
import type { Lab, MockProps } from '../lab.types'

const R = 0.36
const RT = 0.38
const P = 3.2
const TOP = 7.2
const REST = 5.3
const CHUTE = new THREE.Vector3(-2.25, 0, 2.25)
const DOOR = new THREE.Vector3(-2.25, -2.35, 3.9)
const TRAY = { cols: 8, rows: 3, gap: 1.12, x0: -3.9, z0: 5.7, y: -2.54 }
const BOUNDS = new THREE.Box3(new THREE.Vector3(-4.9, -3.3, -3.8), new THREE.Vector3(4.9, 7.8, 8.1))

type Palette = { bg: string; surface: string; line: string; lo: string; hi: string; hole: string }
const PALETTES: Record<Lab['theme'], Palette> = {
  light: { bg: '#EDF1F3', surface: '#FFFFFF', line: '#87939A', lo: '#C9D1D5', hi: '#5A91AD', hole: '#D5DCE0' },
  dark: { bg: '#090E11', surface: '#12171A', line: '#6E7A80', lo: '#2E363B', hi: '#7DB3CF', hole: '#030506' },
}

type Mats = (hue: number) => { top: THREE.Material; bottom: THREE.Material }
type Spawn = { position: [number, number, number]; velocity: [number, number, number]; rotation: [number, number, number] }
type Phase = 'reach' | 'descend' | 'close' | 'lift' | 'carry' | 'drop'
type Job = { ref: string; phase: Phase; t: number; target: THREE.Vector3; fall: number; speed: number }
type Throw = { ref: string; from: THREE.Vector3; to: THREE.Vector3; at: number }

const cap = new THREE.SphereGeometry(1, 28, 10, 0, Math.PI * 2, 0, Math.PI / 2)
const cup = new THREE.SphereGeometry(1, 28, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2)
const ball = mergeGeometries([cap, cup], true)

const hash = (n: number) => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453
  return s - Math.floor(s)
}
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))
const damp = (from: number, to: number, k: number, dt: number) => from + (to - from) * (1 - Math.exp(-k * dt))
const inChute = (x: number, z: number) => x < -1.2 && z > 1.2

const cells = (() => {
  const out: [number, number][] = []
  for (let zi = 0; zi < 7; zi++)
    for (let xi = 0; xi < 7; xi++) {
      const x = -2.6 + xi * 0.866
      const z = -2.6 + zi * 0.866
      if (!inChute(x, z)) out.push([x, z])
    }
  return out
})()

function heapSpawn(index: number): Spawn {
  const [x, z] = cells[index % cells.length]
  const layer = Math.floor(index / cells.length)
  return {
    position: [x + (hash(index) - 0.5) * 0.3, 1 + layer * 1.05 + hash(index + 9) * 0.4, z + (hash(index + 3) - 0.5) * 0.3],
    velocity: [0, 0, 0],
    rotation: [hash(index + 1) * 6, hash(index + 2) * 6, hash(index + 4) * 6],
  }
}

function slot(index: number) {
  const per = TRAY.cols * TRAY.rows
  const layer = Math.floor(index / per)
  const k = index % per
  return new THREE.Vector3(TRAY.x0 + (k % TRAY.cols) * TRAY.gap + layer * 0.2, TRAY.y + layer * 0.55, TRAY.z0 + Math.floor(k / TRAY.cols) * TRAY.gap + layer * 0.2)
}

export default function ClawMachine({ lab }: MockProps) {
  const colors = PALETTES[lab.theme]
  const labRef = useRef(lab)
  labRef.current = lab
  const queue = useRef<string[]>([])
  const handled = useRef(false)
  const aimKeys = useRef<THREE.Vector2 | null>(null)
  const [throws, setThrows] = useState<Throw[]>([])
  const [toast, setToast] = useState<string | null>(null)

  const fetchItem = useCallback((ref: string) => {
    if (labRef.current.selected.has(ref) || queue.current.includes(ref)) return
    queue.current.push(ref)
  }, [])

  const throwBack = useCallback((ref: string, from: THREE.Vector3) => {
    const x = (hash(performance.now()) - 0.5) * 4.4
    const z = -1.6 + hash(performance.now() + 7) * 2.6
    setThrows((list) => [...list, { ref, from: from.clone(), to: new THREE.Vector3(x, 6.2, z), at: performance.now() }])
    labRef.current.toggle(ref)
  }, [])

  const slotsRef = useRef(new Map<string, THREE.Vector3>())

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return
      const step = { ArrowLeft: [-0.45, 0], ArrowRight: [0.45, 0], ArrowUp: [0, -0.45], ArrowDown: [0, 0.45] }[event.key]
      if (step && !event.shiftKey) {
        event.preventDefault()
        aimKeys.current = (aimKeys.current ?? new THREE.Vector2(0, 0)).add(new THREE.Vector2(step[0], step[1]))
        aimKeys.current.set(clamp(aimKeys.current.x, -P + 0.45, P - 0.45), clamp(aimKeys.current.y, -P + 0.45, P - 0.45))
      }
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="relative h-full w-full select-none" style={{ background: colors.bg }}>
      <style>{CSS}</style>
      <div
        className="absolute inset-0"
        onClick={() => {
          if (handled.current) handled.current = false
          else window.dispatchEvent(new CustomEvent('claw:drop'))
        }}
      >
        <Canvas orthographic dpr={[1, 2]} camera={{ position: [11, 19, 22], zoom: 40, near: 0.1, far: 200 }}>
          <color attach="background" args={[colors.bg]} />
          <ambientLight intensity={lab.theme === 'dark' ? 1.1 : 1.7} />
          <directionalLight position={[-4, 12, 9]} intensity={lab.theme === 'dark' ? 1.3 : 1.5} />
          <Fit />
          <Physics gravity={[0, -20, 0]} numSolverIterations={2} timeStep={1 / 60}>
            <Machine
              lab={lab}
              colors={colors}
              queue={queue}
              aimKeys={aimKeys}
              throws={throws}
              setThrows={setThrows}
              onThrow={(ref, from) => {
                handled.current = true
                throwBack(ref, from)
              }}
              slots={slotsRef}
              onArrive={(item) => setToast(item.title)}
            />
          </Physics>
          <Shadow position={[0, -3.22, 0]} rotation={[-Math.PI / 2, 0, 0]} scale={[11, 11, 1]} opacity={lab.theme === 'dark' ? 0.7 : 0.22} color={lab.theme === 'dark' ? '#000000' : '#30424b'} colorStop={0.35} />
          <Shadow position={[0.1, -3.22, 6.4]} rotation={[-Math.PI / 2, 0, 0]} scale={[11, 4.4, 1]} opacity={lab.theme === 'dark' ? 0.6 : 0.16} color={lab.theme === 'dark' ? '#000000' : '#30424b'} colorStop={0.4} />
        </Canvas>
      </div>
      <Search lab={lab} onPick={(item) => (lab.selected.has(item.ref) ? throwBack(item.ref, slotsRef.current.get(item.ref) ?? DOOR) : fetchItem(item.ref))} queue={queue} />
      <Ticket lab={lab} toast={toast} />
    </div>
  )
}

function Fit() {
  const { camera, size } = useThree()
  useLayoutEffect(() => {
    const cam = camera as THREE.OrthographicCamera
    const target = new THREE.Vector3(0, 1.6, 2.2)
    const dir = new THREE.Vector3(11, 19, 22).normalize()
    cam.position.copy(target).addScaledVector(dir, 40)
    cam.lookAt(target)
    cam.updateMatrixWorld()
    const view = new THREE.Box3()
    const v = new THREE.Vector3()
    for (let i = 0; i < 8; i++) {
      v.set(i & 1 ? BOUNDS.max.x : BOUNDS.min.x, i & 2 ? BOUNDS.max.y : BOUNDS.min.y, i & 4 ? BOUNDS.max.z : BOUNDS.min.z)
      view.expandByPoint(v.applyMatrix4(cam.matrixWorldInverse))
    }
    const top = 76
    const bottom = size.width < 700 ? 150 : 16
    const w = size.width - 32
    const h = size.height - top - bottom
    cam.zoom = Math.min(w / (view.max.x - view.min.x), h / (view.max.y - view.min.y))
    const cx = (view.max.x + view.min.x) / 2
    const cy = (view.max.y + view.min.y) / 2 + (bottom - top) / 2 / cam.zoom
    const right = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0)
    const up = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 1)
    cam.position.addScaledVector(right, cx).addScaledVector(up, cy)
    cam.updateProjectionMatrix()
    cam.updateMatrixWorld()
  }, [camera, size])
  return null
}

type MachineProps = {
  lab: Lab
  colors: Palette
  queue: MutableRefObject<string[]>
  aimKeys: MutableRefObject<THREE.Vector2 | null>
  throws: Throw[]
  setThrows: (fn: (list: Throw[]) => Throw[]) => void
  onThrow: (ref: string, from: THREE.Vector3) => void
  slots: MutableRefObject<Map<string, THREE.Vector3>>
  onArrive: (item: CatalogItem) => void
}

function Machine({ lab, colors, queue, aimKeys, throws, setThrows, onThrow, slots, onArrive }: MachineProps) {
  const { camera, pointer, raycaster } = useThree()
  const items = lab.catalog.items
  const byRef = useMemo(() => new Map(items.map((item) => [item.ref, item])), [items])
  const bodies = useRef(new Map<string, RapierRigidBody>())
  const spawns = useRef(new Map<string, Spawn>())
  const arrivals = useRef(new Map<string, number>())
  const job = useRef<Job | null>(null)
  const labRef = useRef(lab)
  labRef.current = lab
  const [held, setHeld] = useState<string | null>(null)
  const [hovered, setHovered] = useState<string | null>(null)
  const hoveredRef = useRef<string | null>(null)

  const mats = useMemo<Mats>(() => {
    const cache = new Map<number, { top: THREE.Material; bottom: THREE.Material }>()
    const dark = colors.bg === PALETTES.dark.bg
    return (hue) => {
      let m = cache.get(hue)
      if (!m) {
        m = {
          top: new THREE.MeshStandardMaterial({ color: new THREE.Color(`hsl(${hue}, ${dark ? 42 : 52}%, ${dark ? 52 : 63}%)`), roughness: 0.35, side: THREE.DoubleSide }),
          bottom: new THREE.MeshStandardMaterial({ color: new THREE.Color(`hsl(${hue}, ${dark ? 16 : 30}%, ${dark ? 38 : 94}%)`), roughness: 0.3, side: THREE.DoubleSide }),
        }
        cache.set(hue, m)
      }
      return m
    }
  }, [colors.bg])

  const register = useCallback((ref: string, body: RapierRigidBody | null) => {
    if (body) bodies.current.set(ref, body)
    else bodies.current.delete(ref)
  }, [])

  const spawnFor = useCallback(
    (ref: string, index: number) => {
      const s = spawns.current.get(ref) ?? heapSpawn(index)
      spawns.current.delete(ref)
      return s
    },
    [],
  )

  const throwing = new Set(throws.map((t) => t.ref))
  const pit = items.filter((item) => !lab.selected.has(item.ref) && held !== item.ref && !throwing.has(item.ref))
  const tray = items.filter((item) => lab.selected.has(item.ref))

  const carriage = useRef<THREE.Group>(null)
  const bridge = useRef<THREE.Group>(null)
  const cable = useRef<THREE.Mesh>(null)
  const hub = useRef<THREE.Group>(null)
  const prongs = useRef<(THREE.Group | null)[]>([])
  const carried = useRef<THREE.Group>(null)
  const label = useRef<THREE.Group>(null)
  const stick = useRef<THREE.Group>(null)
  const button = useRef<THREE.Mesh>(null)
  const sim = useRef({ x: -2.25, z: 2.25, vx: 0, vz: 0, y: REST, open: 0.35, aim: new THREE.Vector2(0, 0), px: 9, py: 9, press: 0 })
  const plane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.9), [])
  const hit = useMemo(() => new THREE.Vector3(), [])
  const aimRaw = useRef(new THREE.Vector3(99, 0, 99))

  const nearest = (x: number, z: number, within: number) => {
    let best: string | null = null
    let score = -Infinity
    for (const [ref, body] of bodies.current) {
      if (!body.isValid()) continue
      const p = body.translation()
      const d = Math.hypot(p.x - x, p.z - z)
      if (d > within) continue
      const s = within === Infinity ? -d : p.y - d * 0.8
      if (s > score) {
        score = s
        best = ref
      }
    }
    return best
  }

  useEffect(() => {
    const drop = () => {
      const s = sim.current
      if (Math.abs(aimRaw.current.x) > P + 0.8 || Math.abs(aimRaw.current.z) > P + 0.8) return
      const settled = Math.hypot(s.x - s.aim.x, s.z - s.aim.y) < 0.5
      const ref = (!job.current && settled && hoveredRef.current) || nearest(s.aim.x, s.aim.y, Infinity)
      if (ref && job.current?.ref !== ref && !queue.current.includes(ref)) queue.current.push(ref)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.code !== 'Space' || event.target instanceof HTMLInputElement) return
      event.preventDefault()
      const s = sim.current
      const ref = (!job.current && hoveredRef.current) || nearest(s.aim.x, s.aim.y, Infinity)
      if (ref && job.current?.ref !== ref && !queue.current.includes(ref)) queue.current.push(ref)
    }
    addEventListener('claw:drop', drop)
    addEventListener('keydown', onKey)
    return () => {
      removeEventListener('claw:drop', drop)
      removeEventListener('keydown', onKey)
    }
  }, [queue])

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.1)
    const s = sim.current
    if (pointer.x !== s.px || pointer.y !== s.py) {
      s.px = pointer.x
      s.py = pointer.y
      raycaster.setFromCamera(pointer, camera)
      if (raycaster.ray.intersectPlane(plane, hit)) {
        aimRaw.current.copy(hit)
        s.aim.set(clamp(hit.x, -P + 0.45, P - 0.45), clamp(hit.z, -P + 0.45, P - 0.45))
        aimKeys.current = null
      }
    }
    if (aimKeys.current) {
      s.aim.copy(aimKeys.current)
      aimRaw.current.set(s.aim.x, 0, s.aim.y)
    }

    if (!job.current) {
      while (queue.current.length) {
        const ref = queue.current.shift()!
        const body = bodies.current.get(ref)
        if (!body || labRef.current.selected.has(ref)) continue
        const p = body.translation()
        body.wakeUp()
        job.current = { ref, phase: 'reach', t: 0, target: new THREE.Vector3(p.x, p.y, p.z), fall: 0, speed: 0 }
        break
      }
    }

    let gx = s.aim.x
    let gz = s.aim.y
    let gy = REST
    let open = 0.35
    let focus: string | null = null
    const j = job.current
    if (j) {
      j.t += dt
      focus = j.ref
      const body = bodies.current.get(j.ref)
      if (body && (j.phase === 'reach' || j.phase === 'descend')) {
        const p = body.translation()
        j.target.set(p.x, p.y, p.z)
      }
      const dist = (x: number, z: number) => Math.hypot(s.x - x, s.z - z)
      if (j.phase === 'reach') {
        gx = j.target.x
        gz = j.target.z
        open = 0.95
        if (dist(gx, gz) < 0.08 && Math.hypot(s.vx, s.vz) < 0.6) j.phase = 'descend'
      } else if (j.phase === 'descend') {
        gx = j.target.x
        gz = j.target.z
        gy = j.target.y + 0.52
        open = 0.95
        if (s.y - gy < 0.03) {
          j.phase = 'close'
          j.t = 0
        }
      } else if (j.phase === 'close') {
        gx = j.target.x
        gz = j.target.z
        gy = j.target.y + 0.52
        open = THREE.MathUtils.lerp(0.95, -0.1, Math.min(1, j.t / 0.3))
        if (j.t > 0.34) {
          j.phase = 'lift'
          setHeld(j.ref)
        }
      } else if (j.phase === 'lift') {
        gx = j.target.x
        gz = j.target.z
        gy = REST + 0.2
        open = -0.1
        if (s.y > REST + 0.1) j.phase = 'carry'
      } else if (j.phase === 'carry') {
        gx = CHUTE.x
        gz = CHUTE.z
        gy = REST + 0.2
        open = -0.1
        if (dist(gx, gz) < 0.12) {
          j.phase = 'drop'
          j.t = 0
          s.press = 1
        }
      } else if (j.phase === 'drop') {
        gx = CHUTE.x
        gz = CHUTE.z
        gy = REST + 0.2
        open = 0.95
        if (j.t > 0.12) {
          j.speed += 34 * dt
          j.fall += j.speed * dt
        }
        if (carried.current) carried.current.position.y = -0.52 - j.fall
        if (s.y - 0.52 - j.fall < -0.6) {
          const item = byRef.get(j.ref)!
          arrivals.current.set(j.ref, performance.now())
          labRef.current.toggle(j.ref)
          setHeld(null)
          job.current = null
          onArrive(item)
        }
      }
    } else {
      focus = nearest(s.x, s.z, 0.55)
      if (focus) gy = REST - 0.6
    }

    if (focus !== hoveredRef.current) {
      hoveredRef.current = focus
      setHovered(focus)
    }

    const k = j && (j.phase === 'carry' || j.phase === 'reach') ? 30 : 46
    const c = j ? 10 : 8.5
    for (let n = Math.ceil(dt * 120), h = dt / n, i = 0; i < n; i++) {
      s.vx += ((gx - s.x) * k - s.vx * c) * h
      s.vz += ((gz - s.z) * k - s.vz * c) * h
      s.x += s.vx * h
      s.z += s.vz * h
    }
    const dy = gy - s.y
    const speed = j && j.phase !== 'reach' ? 5.5 : 3
    s.y += Math.sign(dy) * Math.min(Math.abs(dy), Math.max(speed * dt * Math.min(1, Math.abs(dy) * 3), Math.abs(dy) * (1 - Math.exp(-6 * dt))))
    s.open = damp(s.open, open, 14, dt)
    s.press = damp(s.press, 0, 5, dt)

    if (bridge.current) bridge.current.position.x = s.x
    if (carriage.current) carriage.current.position.set(s.x, TOP - 0.42, s.z)
    if (cable.current) {
      const len = TOP - 0.55 - s.y
      cable.current.scale.y = Math.max(0.01, len)
      cable.current.position.y = -0.13 - len / 2
    }
    if (hub.current) {
      hub.current.position.set(s.x, s.y, s.z)
      hub.current.rotation.set(clamp(s.vz * 0.06, -0.25, 0.25), 0, clamp(-s.vx * 0.06, -0.25, 0.25))
    }
    for (const prong of prongs.current) if (prong) prong.rotation.z = s.open
    if (stick.current) stick.current.rotation.set(clamp(s.vz * 0.12, -0.5, 0.5), 0, clamp(-s.vx * 0.12, -0.5, 0.5))
    if (button.current) button.current.position.y = 0.06 - s.press * 0.07
    if (label.current) {
      const ref = hoveredRef.current
      const body = ref ? bodies.current.get(ref) : undefined
      if (j && j.phase !== 'reach' && j.phase !== 'descend') label.current.position.set(s.x, s.y - 0.52 - j.fall + 0.75, s.z)
      else if (body) {
        const p = body.translation()
        label.current.position.set(p.x, p.y + 0.75, p.z)
      }
    }
  })

  const hoveredItem = hovered ? byRef.get(hovered) : undefined
  const heldItem = held ? byRef.get(held) : undefined

  return (
    <>
      <Cabinet colors={colors} stick={stick} button={button} />
      <group ref={bridge}>
        <mesh position={[0, TOP - 0.12, 0]}>
          <boxGeometry args={[0.22, 0.18, P * 2 + 0.2]} />
          <meshBasicMaterial color={colors.surface} />
          <Edges color={colors.line} />
        </mesh>
      </group>
      <group ref={carriage}>
        <mesh>
          <boxGeometry args={[0.55, 0.26, 0.55]} />
          <meshBasicMaterial color={colors.surface} />
          <Edges color={colors.hi} />
        </mesh>
        <mesh ref={cable}>
          <cylinderGeometry args={[0.03, 0.03, 1, 8]} />
          <meshBasicMaterial color={colors.line} />
        </mesh>
      </group>
      <group ref={hub}>
        <mesh position={[0, 0.12, 0]}>
          <cylinderGeometry args={[0.26, 0.3, 0.36, 24]} />
          <meshStandardMaterial color={colors.surface} roughness={0.5} />
          <Outlines angle={0} thickness={hovered ? 0.045 : 0.03} color={colors.hi} />
        </mesh>
        {[0, 1, 2].map((k) => (
          <group key={k} rotation={[0, (k * Math.PI * 2) / 3, 0]}>
            <group
              ref={(g) => {
                prongs.current[k] = g
              }}
              position={[0.16, -0.02, 0]}
            >
              <Line
                points={[
                  [0, 0, 0],
                  [0.26, -0.2, 0],
                  [0.36, -0.56, 0],
                  [0.16, -0.9, 0],
                ]}
                color={colors.hi}
                lineWidth={hovered ? 4 : 3}
              />
            </group>
          </group>
        ))}
        <group ref={carried} position={[0, -0.52, 0]}>
          {heldItem && <Ball item={heldItem} mats={mats} colors={colors} hot />}
        </group>
      </group>
      <group ref={label}>
        {hoveredItem && !lab.selected.has(hoveredItem.ref) && (
          <Html center zIndexRange={[20, 0]} style={{ pointerEvents: 'none' }}>
            <div className="claw-pop whitespace-nowrap rounded-full border border-border bg-surface/95 px-3 py-1 text-xs shadow-md">
              <span className="mr-1.5 inline-block size-2 rounded-full align-middle" style={{ background: `hsl(${hoveredItem.hue} 50% 60%)` }} />
              <span className="font-medium text-foreground">{hoveredItem.title}</span>
              <span className="ml-1.5 text-muted">{hoveredItem.label}</span>
            </div>
          </Html>
        )}
      </group>

      <CuboidCollider args={[P + 1, 0.5, P + 1]} position={[0, -0.5, 0]} />
      <CuboidCollider args={[0.2, 5, P + 1]} position={[-P - 0.2, 4, 0]} />
      <CuboidCollider args={[0.2, 5, P + 1]} position={[P + 0.2, 4, 0]} />
      <CuboidCollider args={[P + 1, 5, 0.2]} position={[0, 4, -P - 0.2]} />
      <CuboidCollider args={[P + 1, 5, 0.2]} position={[0, 4, P + 0.2]} />
      <CuboidCollider args={[P + 1, 0.2, P + 1]} position={[0, TOP + 0.2, 0]} />
      <CuboidCollider args={[0.95, 0.6, 0.95]} position={[CHUTE.x, 0.6, CHUTE.z]} />

      {pit.map((item) => (
        <PitCapsule
          key={item.ref}
          item={item}
          index={items.indexOf(item)}
          hot={hovered === item.ref}
          mats={mats}
          colors={colors}
          register={register}
          spawnFor={spawnFor}
        />
      ))}

      {throws.map((t) => {
        const item = byRef.get(t.ref)!
        return (
          <Flight
            key={`${t.ref}-${t.at}`}
            flight={t}
            item={item}
            mats={mats}
            colors={colors}
            onLand={() => {
              spawns.current.set(t.ref, { position: [t.to.x, t.to.y, t.to.z], velocity: [0, -4, 0], rotation: [1, 2, 0.5] })
              setThrows((list) => list.filter((x) => x !== t))
            }}
          />
        )
      })}

      <TrayBox colors={colors} />
      {tray.map((item, index) => (
        <Prize
          key={item.ref}
          item={item}
          index={index}
          mats={mats}
          colors={colors}
          arrivals={arrivals}
          slots={slots}
          onThrow={onThrow}
        />
      ))}
    </>
  )
}

type CapsuleProps = {
  item: CatalogItem
  index: number
  hot: boolean
  mats: Mats
  colors: Palette
  register: (ref: string, body: RapierRigidBody | null) => void
  spawnFor: (ref: string, index: number) => Spawn
}

const PitCapsule = memo(function PitCapsule({ item, index, hot, mats, colors, register, spawnFor }: CapsuleProps) {
  const [spawn] = useState(() => spawnFor(item.ref, index))
  const body = useRef<RapierRigidBody>(null)
  useEffect(() => {
    register(item.ref, body.current)
    return () => register(item.ref, null)
  }, [item.ref, register])
  return (
    <RigidBody
      ref={body}
      colliders={false}
      position={spawn.position}
      rotation={spawn.rotation}
      linearVelocity={spawn.velocity}
      linearDamping={0.3}
      angularDamping={0.9}
    >
      <BallCollider args={[R]} friction={0.8} restitution={0.15} />
      <Ball item={item} mats={mats} colors={colors} hot={hot} />
    </RigidBody>
  )
})

function Ball({ item, mats, colors, hot, radius = R }: { item: CatalogItem; mats: Mats; colors: Palette; hot?: boolean; radius?: number }) {
  const m = mats(item.hue)
  return (
    <group scale={radius}>
      <mesh geometry={ball} material={[m.top, m.bottom]}>
        <Outlines angle={0} thickness={hot ? 0.12 : 0.045} color={hot ? colors.hi : colors.line} />
      </mesh>
    </group>
  )
}

function Flight({ flight, item, mats, colors, onLand }: { flight: Throw; item: CatalogItem; mats: Mats; colors: Palette; onLand: () => void }) {
  const ref = useRef<THREE.Group>(null)
  const done = useRef(false)
  useFrame(() => {
    const t = Math.min(1, (performance.now() - flight.at) / 750)
    if (ref.current) {
      ref.current.position.lerpVectors(flight.from, flight.to, t)
      ref.current.position.y += Math.sin(t * Math.PI) * 4.5
      ref.current.rotation.set(t * 9, t * 4, 0)
    }
    if (t >= 1 && !done.current) {
      done.current = true
      onLand()
    }
  })
  return (
    <group ref={ref} position={flight.from}>
      <Ball item={item} mats={mats} colors={colors} hot />
    </group>
  )
}

function Prize({
  item,
  index,
  mats,
  colors,
  arrivals,
  slots,
  onThrow,
}: {
  item: CatalogItem
  index: number
  mats: Mats
  colors: Palette
  arrivals: MutableRefObject<Map<string, number>>
  slots: MutableRefObject<Map<string, THREE.Vector3>>
  onThrow: (ref: string, from: THREE.Vector3) => void
}) {
  const [born] = useState(() => {
    const at = arrivals.current.get(item.ref)
    arrivals.current.delete(item.ref)
    return at ?? null
  })
  const [hover, setHover] = useState(false)
  const [reveal, setReveal] = useState(false)
  const group = useRef<THREE.Group>(null)
  const lid = useRef<THREE.Group>(null)
  const card = useRef<THREE.Group>(null)
  const ring = useRef<THREE.Mesh>(null)
  const flash = useRef<THREE.PointLight>(null)
  const st = useRef({ open: born ? 0 : 1, rise: born ? 0 : 1, popped: !born })
  const target = slot(index)
  slots.current.set(item.ref, target)

  useEffect(() => () => void slots.current.delete(item.ref), [item.ref, slots])

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.1)
    const g = group.current
    if (!g) return
    const s = st.current
    const age = born ? (performance.now() - born) / 1000 : 99
    if (age < 0.8) {
      const t = age / 0.8
      g.position.lerpVectors(DOOR, target, t)
      g.position.y = THREE.MathUtils.lerp(DOOR.y, target.y, t) + Math.abs(Math.sin(t * Math.PI * 2.2)) * (1 - t) * 1.6
      g.rotation.set(t * 8, 0, t * 3)
    } else {
      g.position.x = damp(g.position.x, target.x, 10, dt)
      g.position.y = damp(g.position.y, target.y, 10, dt)
      g.position.z = damp(g.position.z, target.z, 10, dt)
      g.rotation.x = damp(g.rotation.x, 0, 14, dt)
      g.rotation.z = damp(g.rotation.z, 0, 14, dt)
      if (!s.popped && age > 0.95) {
        s.popped = true
        setReveal(true)
        setTimeout(() => setReveal(false), 4200)
      }
    }
    if (s.popped) {
      s.open = damp(s.open, 1, 9, dt)
      s.rise = damp(s.rise, 1, 6, dt)
    }
    if (lid.current) lid.current.rotation.z = -s.open * 2.15 - (hover ? 0.15 : 0)
    if (card.current) {
      card.current.position.y = -0.1 + s.rise * 0.5 + (hover ? 0.12 : 0)
      card.current.scale.setScalar(Math.max(0.01, s.rise))
    }
    const burst = born ? age - 0.95 : 9
    if (ring.current) {
      const t = clamp(burst / 0.7, 0, 1)
      ring.current.visible = burst > 0 && burst < 0.7
      ring.current.scale.setScalar(0.3 + t * 2.4)
      ;(ring.current.material as THREE.MeshBasicMaterial).opacity = 1 - t
    }
    if (flash.current) flash.current.intensity = burst > 0 && burst < 0.6 ? (1 - burst / 0.6) * 18 : 0
  })

  const m = mats(item.hue)
  return (
    <group ref={group} position={born ? DOOR : target}>
      <group
        onPointerOver={(e) => {
          e.stopPropagation()
          setHover(true)
          document.body.style.cursor = 'pointer'
        }}
        onPointerOut={() => {
          setHover(false)
          document.body.style.cursor = ''
        }}
        onClick={(e) => {
          e.stopPropagation()
          document.body.style.cursor = ''
          onThrow(item.ref, group.current?.position ?? target)
        }}
      >
        <group scale={RT}>
          <mesh geometry={cup} material={m.bottom}>
            <Outlines angle={0} thickness={hover ? 0.12 : 0.05} color={hover ? colors.hi : colors.line} />
          </mesh>
          <group ref={lid} position={[1, 0, 0]}>
            <mesh geometry={cap} material={m.top} position={[-1, 0, 0]}>
              <Outlines angle={0} thickness={hover ? 0.12 : 0.05} color={hover ? colors.hi : colors.line} />
            </mesh>
          </group>
        </group>
        <group ref={card} position={[0, 0.3, 0]}>
          <Billboard>
            <Suspense fallback={<CardFace item={item} colors={colors} />}>
              {item.image ? <CardImage src={shot(item, colors)!} colors={colors} /> : <CardFace item={item} colors={colors} />}
            </Suspense>
          </Billboard>
        </group>
      </group>
      <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.05, 0]} visible={false}>
        <ringGeometry args={[0.42, 0.46, 48]} />
        <meshBasicMaterial color={`hsl(${item.hue}, 70%, 65%)`} transparent depthWrite={false} />
      </mesh>
      <pointLight ref={flash} position={[0, 0.8, 0.4]} intensity={0} distance={4} color={`hsl(${item.hue}, 80%, 70%)`} />
      {(hover || reveal) && (
        <Html center position={[0, reveal ? 1.55 : 1.05, 0]} zIndexRange={[30, 0]} style={{ pointerEvents: 'none' }}>
          {reveal ? <Reveal item={item} src={shot(item, colors)} /> : <Tag item={item} />}
        </Html>
      )}
    </group>
  )
}

const shot = (item: CatalogItem, colors: Palette) => (colors.bg === PALETTES.dark.bg && item.imageDark) || item.image

function CardImage({ src, colors }: { src: string; colors: Palette }) {
  const texture = useTexture(src)
  const map = useMemo(() => {
    const t = texture.clone()
    t.colorSpace = THREE.SRGBColorSpace
    const img = t.image as { width: number; height: number }
    const want = 0.62
    const has = img.height / img.width
    if (has > want) {
      t.repeat.set(1, want / has)
      t.offset.set(0, 1 - want / has)
    }
    t.needsUpdate = true
    return t
  }, [texture])
  return (
    <group>
      <mesh position={[0, 0, -0.002]}>
        <planeGeometry args={[1.04, 1.04 * 0.62 + 0.1]} />
        <meshBasicMaterial color={colors.surface} />
        <Edges color={colors.line} />
      </mesh>
      <mesh>
        <planeGeometry args={[0.94, 0.94 * 0.62]} />
        <meshBasicMaterial map={map} toneMapped={false} />
      </mesh>
    </group>
  )
}

function CardFace({ item, colors }: { item: CatalogItem; colors: Palette }) {
  return (
    <group>
      <mesh position={[0, 0, -0.002]}>
        <planeGeometry args={[1.04, 1.04 * 0.62 + 0.1]} />
        <meshBasicMaterial color={colors.surface} />
        <Edges color={colors.line} />
      </mesh>
      <mesh>
        <planeGeometry args={[0.94, 0.94 * 0.62]} />
        <meshBasicMaterial color={`hsl(${item.hue}, 45%, ${colors.bg === PALETTES.dark.bg ? 30 : 85}%)`} />
      </mesh>
      <Line points={[[-0.2, 0.06, 0.001], [0.12, 0.06, 0.001]]} color={colors.line} lineWidth={1.5} />
      <Line points={[[-0.2, -0.02, 0.001], [0.2, -0.02, 0.001]]} color={colors.line} lineWidth={1.5} />
      <Line points={[[-0.2, -0.09, 0.001], [0.04, -0.09, 0.001]]} color={colors.line} lineWidth={1.5} />
    </group>
  )
}

function Tag({ item }: { item: CatalogItem }) {
  return (
    <div className="claw-pop whitespace-nowrap rounded-full border border-border bg-surface/95 px-3 py-1 text-xs shadow-md">
      <span className="font-medium text-foreground">{item.title}</span>
      <span className="ml-1.5 text-muted">click to throw back</span>
    </div>
  )
}

function Reveal({ item, src }: { item: CatalogItem; src?: string }) {
  return (
    <div className="relative grid place-items-center">
      <div className="claw-burst absolute size-72 rounded-full" style={{ ['--h' as string]: item.hue }} />
      <div className="claw-reveal relative w-60 overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl">
        {src ? (
          <img src={src} alt="" className="h-32 w-full border-b border-border object-cover object-top" />
        ) : (
          <div className="grid h-20 place-items-center border-b border-border text-2xl" style={{ background: `hsl(${item.hue} 50% 60% / 0.25)` }}>
            ✦
          </div>
        )}
        <div className="px-3 py-2">
          <div className="text-[10px] uppercase tracking-[0.14em] text-accent">New prize · {item.label}</div>
          <div className="truncate text-sm font-medium text-foreground">{item.title}</div>
        </div>
      </div>
    </div>
  )
}

function TrayBox({ colors }: { colors: Palette }) {
  const w = TRAY.cols * TRAY.gap + 0.5
  const d = TRAY.rows * TRAY.gap + 0.5
  const cx = TRAY.x0 + ((TRAY.cols - 1) * TRAY.gap) / 2
  const cz = TRAY.z0 + ((TRAY.rows - 1) * TRAY.gap) / 2
  const y = TRAY.y - RT
  return (
    <group position={[cx, y, cz]}>
      <Box size={[w, 0.12, d]} at={[0, -0.06, 0]} colors={colors} />
      <Box size={[w, 0.32, 0.1]} at={[0, 0.1, -d / 2]} colors={colors} />
      <Box size={[w, 0.32, 0.1]} at={[0, 0.1, d / 2]} colors={colors} />
      <Box size={[0.1, 0.32, d]} at={[-w / 2, 0.1, 0]} colors={colors} />
      <Box size={[0.1, 0.32, d]} at={[w / 2, 0.1, 0]} colors={colors} />
      <Html position={[w / 2 - 0.2, 0.3, d / 2 + 0.05]} zIndexRange={[5, 0]} style={{ pointerEvents: 'none' }}>
        <div className="-translate-x-full whitespace-nowrap text-[10px] uppercase tracking-[0.18em] text-muted">build tray</div>
      </Html>
    </group>
  )
}

function Box({ size, at, colors, fill }: { size: [number, number, number]; at: [number, number, number]; colors: Palette; fill?: string }) {
  return (
    <mesh position={at}>
      <boxGeometry args={size} />
      <meshBasicMaterial color={fill ?? colors.surface} />
      <Edges color={colors.line} />
    </mesh>
  )
}

function Cabinet({ colors, stick, button }: { colors: Palette; stick: MutableRefObject<THREE.Group | null>; button: MutableRefObject<THREE.Mesh | null> }) {
  const H = TOP + 0.35
  const corners: [number, number][] = [
    [-P - 0.2, -P - 0.2],
    [P + 0.2, -P - 0.2],
    [-P - 0.2, P + 0.2],
    [P + 0.2, P + 0.2],
  ]
  const face = (pts: [number, number][], z: number, color = colors.line): ReactNode => (
    <Line points={[...pts, pts[0]].map(([x, y]) => [x, y, z] as [number, number, number])} color={color} lineWidth={1} />
  )
  return (
    <group>
      <Box size={[P * 2 + 0.8, 3.2, P * 2 + 0.8]} at={[0, -1.6, 0]} colors={colors} />
      <mesh position={[CHUTE.x, 0.02, CHUTE.z]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[1.5, 1.5]} />
        <meshBasicMaterial color={colors.hole} />
      </mesh>
      <Box size={[1.9, 1.2, 0.08]} at={[CHUTE.x, 0.6, CHUTE.z - 0.95]} colors={colors} />
      <Box size={[1.9, 1.2, 0.08]} at={[CHUTE.x, 0.6, CHUTE.z + 0.95]} colors={colors} />
      <Box size={[0.08, 1.2, 1.9]} at={[CHUTE.x - 0.95, 0.6, CHUTE.z]} colors={colors} />
      <Box size={[0.08, 1.2, 1.9]} at={[CHUTE.x + 0.95, 0.6, CHUTE.z]} colors={colors} />
      <group position={[0, 0, P + 0.41]}>
        {face(
          [
            [-3.05, -2.85],
            [-1.45, -2.85],
            [-1.45, -1.7],
            [-3.05, -1.7],
          ],
          0,
        )}
        <mesh position={[DOOR.x, -2.3, 0.001]}>
          <planeGeometry args={[1.3, 0.75]} />
          <meshBasicMaterial color={colors.hole} />
        </mesh>
        {face(
          [
            [1.1, -2.2],
            [1.5, -2.2],
            [1.5, -1.6],
            [1.1, -1.6],
          ],
          0,
        )}
        <Line points={[[1.3, -2.1, 0], [1.3, -1.7, 0]]} color={colors.line} lineWidth={1} />
        {face(
          [
            [2.0, -2.4],
            [3.0, -2.4],
            [3.0, -1.95],
            [2.0, -1.95],
          ],
          0,
          colors.hi,
        )}
      </group>
      <Box size={[3.2, 0.4, 1]} at={[1.45, -0.75, P + 0.9]} colors={colors} />
      <group position={[0.65, -0.55, P + 0.9]}>
        <group ref={stick}>
          <mesh position={[0, 0.3, 0]}>
            <cylinderGeometry args={[0.035, 0.035, 0.6, 8]} />
            <meshBasicMaterial color={colors.line} />
          </mesh>
          <mesh position={[0, 0.66, 0]}>
            <sphereGeometry args={[0.15, 20, 14]} />
            <meshStandardMaterial color={colors.hi} roughness={0.4} />
            <Outlines angle={0} thickness={0.016} color={colors.line} />
          </mesh>
        </group>
        <mesh position={[0, 0.02, 0]}>
          <cylinderGeometry args={[0.24, 0.26, 0.05, 24]} />
          <meshBasicMaterial color={colors.surface} />
          <Edges color={colors.line} threshold={40} />
        </mesh>
      </group>
      <group position={[2.2, -0.55, P + 0.9]}>
        <mesh ref={button} position={[0, 0.06, 0]}>
          <cylinderGeometry args={[0.24, 0.24, 0.14, 28]} />
          <meshStandardMaterial color="#e2685b" roughness={0.4} />
          <Outlines angle={0} thickness={0.016} color={colors.line} />
        </mesh>
      </group>
      {corners.map(([x, z]) => (
        <mesh key={`${x}${z}`} position={[x, H / 2, z]}>
          <cylinderGeometry args={[0.13, 0.13, H, 16]} />
          <meshBasicMaterial color={colors.surface} />
          <Outlines angle={0} thickness={0.016} color={colors.line} />
        </mesh>
      ))}
      <Box size={[P * 2 + 0.4, 0.3, 0.3]} at={[0, TOP, -P - 0.2]} colors={colors} />
      <Box size={[P * 2 + 0.4, 0.3, 0.3]} at={[0, TOP, P + 0.2]} colors={colors} />
      <Box size={[0.3, 0.3, P * 2 + 0.4]} at={[-P - 0.2, TOP, 0]} colors={colors} />
      <Box size={[0.3, 0.3, P * 2 + 0.4]} at={[P + 0.2, TOP, 0]} colors={colors} />
      <Box size={[P * 2 + 0.4, 0.9, 0.16]} at={[0, TOP + 0.6, -P - 0.28]} colors={colors} />
      <Html position={[0, TOP + 0.6, -P - 0.19]} center transform scale={0.5} zIndexRange={[4, 0]} style={{ pointerEvents: 'none' }}>
        <div className="whitespace-nowrap text-[22px] font-medium uppercase tracking-[0.4em] text-foreground/80">prize builder</div>
      </Html>
      <Line points={[[-P + 0.6, 6.4, P + 0.2], [-P + 1.6, 5.2, P + 0.2]]} color={colors.lo} lineWidth={1} />
      <Line points={[[-P + 0.6, 5.8, P + 0.2], [-P + 1.1, 5.2, P + 0.2]]} color={colors.lo} lineWidth={1} />
      <Line points={[[P + 0.2, 6.4, -P + 0.6], [P + 0.2, 5.0, -P + 1.8]]} color={colors.lo} lineWidth={1} />
    </group>
  )
}

function Search({ lab, onPick, queue }: { lab: Lab; onPick: (item: CatalogItem) => void; queue: MutableRefObject<string[]> }) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    return lab.catalog.items.filter((item) => `${item.title} ${item.label} ${item.name}`.toLowerCase().includes(q)).slice(0, 7)
  }, [query, lab.catalog.items])
  const pick = (item: CatalogItem) => {
    onPick(item)
    setQuery('')
    setOpen(false)
  }
  return (
    <div className="absolute left-4 top-[72px] z-10 w-[min(320px,calc(100%-32px))]">
      <div className="rounded-2xl border border-border bg-surface/90 p-1.5 shadow-sm backdrop-blur">
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setOpen(true)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && matches[0]) pick(matches[0])
            if (e.key === 'Escape') setOpen(false)
          }}
          placeholder="Ask the claw for… (hero, pricing, forms)"
          className="w-full rounded-xl bg-transparent px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted"
        />
        {open && matches.length > 0 && (
          <ul className="mt-1 border-t border-border pt-1">
            {matches.map((item) => {
              const inTray = lab.selected.has(item.ref)
              return (
                <li key={item.ref}>
                  <button type="button" onClick={() => pick(item)} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm hover:bg-default">
                    <span className="size-2.5 shrink-0 rounded-full" style={{ background: `hsl(${item.hue} 50% 60%)` }} />
                    <span className="truncate text-foreground">{item.title}</span>
                    <span className="ml-auto shrink-0 text-xs text-muted">{inTray ? 'throw back' : queue.current.includes(item.ref) ? 'queued' : item.label}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
      <p className="mt-2 px-1 text-[11px] leading-relaxed text-muted">
        Move to steer the claw · click or Space to drop · arrows nudge · click a prize to throw it back
      </p>
    </div>
  )
}

function Ticket({ lab, toast }: { lab: Lab; toast: string | null }) {
  const [copied, setCopied] = useState(false)
  const count = lab.selected.size
  return (
    <div className="absolute bottom-4 left-4 right-4 z-10 sm:left-auto sm:right-20 sm:w-[440px]">
      <div className="rounded-2xl border border-border bg-surface px-4 pb-3 pt-3 shadow-lg">
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-muted">
          <span className={`size-1.5 rounded-full ${count ? 'bg-accent' : 'bg-border'}`} />
          ticket printer
          <span className="ml-auto tabular-nums text-foreground">
            {count} {count === 1 ? 'prize' : 'prizes'}
          </span>
        </div>
        <div className="mt-2 h-1.5 rounded-full bg-foreground/85" />
        <div className="relative -mt-0.5 mx-2 overflow-hidden">
          <div key={lab.command} className="claw-ticket claw-zig border-x border-border bg-background px-3 pb-5 pt-3">
            <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.16em] text-muted">
              <span>admit one build</span>
              <span className="truncate pl-2 normal-case tracking-normal">{toast ? `last: ${toast}` : 'no prizes yet'}</span>
            </div>
            <div className="mt-1.5 border-t border-dashed border-border pt-2 font-mono text-[12px] leading-relaxed text-foreground [overflow-wrap:anywhere]">
              <span className="text-accent">$ </span>
              {lab.command}
            </div>
            <div className="mt-2 flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard.writeText(lab.command)
                  setCopied(true)
                  setTimeout(() => setCopied(false), 1400)
                }}
                className="rounded-full bg-accent px-3 py-1 text-xs font-medium text-accent-foreground"
              >
                {copied ? 'Copied' : 'Copy command'}
              </button>
              {count > 0 && (
                <button type="button" onClick={lab.clear} className="rounded-full px-3 py-1 text-xs text-muted hover:text-foreground">
                  Empty tray
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

const CSS = `
@keyframes claw-pop { from { transform: scale(.6); opacity: 0 } to { transform: scale(1); opacity: 1 } }
.claw-pop { animation: claw-pop .22s cubic-bezier(.2,1.6,.4,1) both }
@keyframes claw-reveal { 0% { transform: translateY(30px) scale(.2) rotate(-8deg); opacity: 0 } 60% { transform: translateY(-4px) scale(1.06) rotate(2deg); opacity: 1 } 85% { transform: scale(1) rotate(0) } 100% { transform: scale(1); opacity: 1 } }
.claw-reveal { animation: claw-reveal .55s cubic-bezier(.2,1.2,.4,1) both, claw-out .35s ease-in 3.85s forwards }
@keyframes claw-out { to { transform: translateY(40px) scale(.3); opacity: 0 } }
@keyframes claw-burst { 0% { transform: scale(.1) rotate(0); opacity: 0 } 20% { opacity: 1 } 100% { transform: scale(1.2) rotate(40deg); opacity: 0 } }
.claw-burst { background: repeating-conic-gradient(from 0deg, hsl(var(--h) 80% 65% / .55) 0 6deg, transparent 6deg 22deg); -webkit-mask: radial-gradient(circle, transparent 18%, #000 30%, transparent 70%); mask: radial-gradient(circle, transparent 18%, #000 30%, transparent 70%); animation: claw-burst 1.1s ease-out both }
@keyframes claw-ticket { from { transform: translateY(-100%) } to { transform: translateY(0) } }
.claw-ticket { animation: claw-ticket .5s cubic-bezier(.3,1.3,.5,1) both }
.claw-zig { -webkit-mask: conic-gradient(from -45deg at bottom, #0000, #000 1deg 89deg, #0000 90deg) 50% / 12px 100%; mask: conic-gradient(from -45deg at bottom, #0000, #000 1deg 89deg, #0000 90deg) 50% / 12px 100% }
`
