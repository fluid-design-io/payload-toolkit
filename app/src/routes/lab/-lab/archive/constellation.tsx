import { Billboard, CameraControls, Line } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'

import type { CatalogItem, ItemKind, PackageManager, Agent } from '../../../workspace/-workspace/workspace.types'
import type { Lab, MockProps } from '../lab.types'

type Cluster = { id: string; label: string; hue: number; center: THREE.Vector3; radius: number; items: CatalogItem[] }
type Body = { pos: THREE.Vector3; vel: THREE.Vector3; reelAt: number; flingAt: number }
type Shared = {
  bodies: Map<string, Body>
  homes: Map<string, THREE.Vector3>
  slots: Map<string, { kind: ItemKind; index: number; count: number }>
  hovering: boolean
  lastInput: number
  anchors: Map<string, { el: HTMLElement; at: () => THREE.Vector3 | undefined }>
  moons: { pm: THREE.Vector3; agent: THREE.Vector3 }
}

const PLANET = 1.7
const BLOCK_RING_SIZE = 18
const rings: Record<ItemKind, { radius: number; tilt: THREE.Euler; speed: number }> = {
  feature: { radius: 3.0, tilt: new THREE.Euler(0.55, 0, 0.25), speed: 0.55 },
  component: { radius: 3.8, tilt: new THREE.Euler(-0.4, 0, -0.45), speed: -0.38 },
  block: { radius: 4.7, tilt: new THREE.Euler(0.18, 0, -0.12), speed: 0.2 },
}
const pms: PackageManager[] = ['pnpm', 'npm', 'bun']
const agents: Agent[] = ['none', 'claude', 'codex']
const cycle = <T,>(list: T[], value: T) => list[(list.indexOf(value) + 1) % list.length]

function hsl(hue: number, s: number, l: number) {
  return new THREE.Color().setHSL(hue / 360, s, l)
}

function seeded(seed: number) {
  let value = seed
  return () => {
    value = (value * 16807) % 2147483647
    return value / 2147483647
  }
}

function buildClusters(items: readonly CatalogItem[]): Cluster[] {
  const groups = new Map<string, CatalogItem[]>()
  for (const item of items) groups.set(item.category, [...(groups.get(item.category) ?? []), item])
  const entries = [...groups.entries()]
  return entries.map(([id, members], index) => {
    const angle = index * 2.39996 + 0.6
    const distance = 6.5 + 2.2 * Math.sqrt(index + 0.5)
    const y = Math.sin(index * 1.7) * 1.2
    const label = id === 'feature' ? 'Features' : id === 'component' ? 'Components' : members[0].label
    return {
      id,
      label: id === 'block:other' ? 'Other' : label,
      hue: members[0].hue,
      center: new THREE.Vector3(Math.cos(angle) * distance, y, Math.sin(angle) * distance),
      radius: 0.55 + Math.sqrt(members.length) * 0.5,
      items: members,
    }
  })
}

function relax(clusters: Cluster[]) {
  for (let step = 0; step < 80; step++) {
    for (const a of clusters)
      for (const b of clusters) {
        if (a === b) continue
        const gap = a.radius + b.radius + 3
        const delta = new THREE.Vector3(a.center.x - b.center.x, 0, (a.center.z - b.center.z) * 0.55)
        const distance = delta.length()
        if (distance < gap) a.center.addScaledVector(new THREE.Vector3(delta.x, 0, delta.z * 1.8).normalize(), (gap - distance) * 0.25)
      }
  }
  return clusters
}

function homesFor(clusters: Cluster[]) {
  const homes = new Map<string, THREE.Vector3>()
  for (const cluster of clusters) {
    const random = seeded(cluster.items.length * 97 + cluster.hue * 13 + 7)
    cluster.items.forEach((item, index) => {
      const n = cluster.items.length
      const phi = Math.acos(1 - (2 * (index + 0.5)) / n)
      const theta = Math.PI * (1 + Math.sqrt(5)) * index
      const r = n === 1 ? 0 : cluster.radius * (0.55 + random() * 0.45)
      homes.set(
        item.ref,
        cluster.center
          .clone()
          .add(new THREE.Vector3(Math.cos(theta) * Math.sin(phi) * r, Math.cos(phi) * r * 0.55, Math.sin(theta) * Math.sin(phi) * r)),
      )
    })
  }
  return homes
}

function orbitPoint(kind: ItemKind, index: number, count: number, time: number, out: THREE.Vector3) {
  const ring = rings[kind]
  const band = kind === 'block' ? Math.floor(index / BLOCK_RING_SIZE) : 0
  const inBand = kind === 'block' ? Math.min(BLOCK_RING_SIZE, count - band * BLOCK_RING_SIZE) : count
  const slot = kind === 'block' ? index % BLOCK_RING_SIZE : index
  const radius = ring.radius + band * 0.85
  const angle = (slot / inBand) * Math.PI * 2 + time * ring.speed * (band % 2 ? -0.8 : 1)
  out.set(Math.cos(angle) * radius, 0, Math.sin(angle) * radius).applyEuler(ring.tilt)
  return out
}

function circle(radius: number, segments = 96) {
  return Array.from({ length: segments + 1 }, (_, i) => {
    const a = (i / segments) * Math.PI * 2
    return new THREE.Vector3(Math.cos(a) * radius, 0, Math.sin(a) * radius)
  })
}

function useGlowTexture() {
  return useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 128
    const context = canvas.getContext('2d')!
    const gradient = context.createRadialGradient(64, 64, 0, 64, 64, 64)
    gradient.addColorStop(0, 'rgba(255,255,255,1)')
    gradient.addColorStop(0.18, 'rgba(255,255,255,0.55)')
    gradient.addColorStop(0.45, 'rgba(255,255,255,0.12)')
    gradient.addColorStop(1, 'rgba(255,255,255,0)')
    context.fillStyle = gradient
    context.fillRect(0, 0, 128, 128)
    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    return texture
  }, [])
}

function Star({
  item,
  shared,
  selected,
  dimmed,
  matched,
  dark,
  glow,
  onHover,
  onToggle,
}: {
  item: CatalogItem
  shared: Shared
  selected: boolean
  dimmed: boolean
  matched: boolean
  dark: boolean
  glow: THREE.Texture
  onHover: (ref: string | null) => void
  onToggle: (ref: string) => void
}) {
  const group = useRef<THREE.Group>(null)
  const sprite = useRef<THREE.Sprite>(null)
  const halo = useRef<THREE.Mesh>(null)
  const [hovered, setHovered] = useState(false)
  const color = useMemo(() => (dark ? hsl(item.hue, 0.85, 0.6) : hsl(item.hue, 0.55, 0.42)), [item.hue, dark])
  const target = useMemo(() => new THREE.Vector3(), [])
  const base = item.kind === 'feature' ? 0.26 : item.kind === 'component' ? 0.19 : 0.13

  useFrame(({ clock }, rawDelta) => {
    const body = shared.bodies.get(item.ref)
    if (!body || !group.current) return
    const delta = Math.min(rawDelta, 1 / 30)
    const time = clock.elapsedTime
    const slot = shared.slots.get(item.ref)
    const reeling = slot && time - body.reelAt > 0.28
    if (slot && reeling) orbitPoint(slot.kind, slot.index, slot.count, time, target)
    else target.copy(shared.homes.get(item.ref)!).add(new THREE.Vector3(0, Math.sin(time * 0.6 + item.hue) * 0.08, 0))
    const stiffness = slot ? 38 : 22
    const damping = slot ? 6.5 : 4.2
    body.vel.addScaledVector(target.clone().sub(body.pos), stiffness * delta)
    body.vel.multiplyScalar(Math.exp(-damping * delta))
    body.pos.addScaledVector(body.vel, delta)
    group.current.position.copy(body.pos)
    const pulse = matched ? 1.5 + Math.sin(time * 6) * 0.35 : 1
    const scale = (hovered ? 2.1 : selected ? 1.7 : 1) * pulse
    group.current.scale.lerp(new THREE.Vector3(scale, scale, scale), 1 - Math.exp(-14 * delta))
    if (sprite.current) {
      const material = sprite.current.material as THREE.SpriteMaterial
      const speed = Math.min(body.vel.length() / 8, 1)
      material.opacity = (dimmed ? 0.12 : dark ? 0.9 : 0.5) * (1 + speed * 0.6)
    }
    if (halo.current) halo.current.rotation.z += delta * (selected ? 1.4 : 0.3)
  })

  return (
    <group ref={group}>
      <mesh
        onPointerOver={(event) => {
          event.stopPropagation()
          setHovered(true)
          onHover(item.ref)
        }}
        onPointerOut={() => {
          setHovered(false)
          onHover(null)
        }}
        onClick={(event) => {
          event.stopPropagation()
          setHovered(false)
          onHover(null)
          onToggle(item.ref)
        }}
      >
        <sphereGeometry args={[0.42, 8, 8]} />
        <meshBasicMaterial visible={false} />
      </mesh>
      <mesh>
        {item.kind === 'component' ? <octahedronGeometry args={[base, 0]} /> : <icosahedronGeometry args={[base, 3]} />}
        <meshBasicMaterial color={dark ? hsl(item.hue, 0.75, 0.74) : color} transparent opacity={dimmed ? 0.25 : 1} />
      </mesh>
      <sprite ref={sprite} scale={dark ? base * 9 : base * 5.5}>
        <spriteMaterial
          map={glow}
          color={color}
          transparent
          depthWrite={false}
          blending={dark ? THREE.AdditiveBlending : THREE.NormalBlending}
        />
      </sprite>
      <Billboard>
        <mesh ref={halo}>
          <ringGeometry args={[base * 1.9, base * 1.9 + (dark ? 0.014 : 0.02), 32, 1, 0, Math.PI * (selected ? 1.6 : 2)]} />
          <meshBasicMaterial color={selected ? (dark ? '#ffffff' : '#1D2225') : color} transparent opacity={dimmed ? 0.1 : selected ? 0.95 : dark ? 0.3 : 0.55} depthWrite={false} />
        </mesh>
      </Billboard>
    </group>
  )
}

function Sockets({ clusters, selected, dark }: { clusters: Cluster[]; selected: ReadonlySet<string>; dark: boolean }) {
  const homes = useMemo(() => homesFor(clusters), [clusters])
  return (
    <>
      {clusters.flatMap((cluster) =>
        cluster.items
          .filter((item) => selected.has(item.ref))
          .map((item) => (
            <Billboard key={item.ref} position={homes.get(item.ref)!}>
              <mesh>
                <ringGeometry args={[0.16, 0.175, 24]} />
                <meshBasicMaterial color={hsl(cluster.hue, 0.5, dark ? 0.6 : 0.45)} transparent opacity={0.6} depthWrite={false} />
              </mesh>
            </Billboard>
          )),
      )}
    </>
  )
}

function ConstellationLines({ clusters, homes, dark }: { clusters: Cluster[]; homes: Map<string, THREE.Vector3>; dark: boolean }) {
  return (
    <>
      {clusters.map((cluster) => {
        if (cluster.items.length < 2) return null
        const points = cluster.items.map((item) => homes.get(item.ref)!)
        const segments: THREE.Vector3[] = []
        for (let i = 1; i < points.length; i++) {
          let nearest = 0
          for (let j = 1; j < i; j++) if (points[j].distanceTo(points[i]) < points[nearest].distanceTo(points[i])) nearest = j
          segments.push(points[nearest], points[i])
        }
        return (
          <Line
            key={cluster.id}
            points={segments}
            segments
            color={hsl(cluster.hue, 0.5, dark ? 0.6 : 0.45)}
            lineWidth={1}
            transparent
            opacity={dark ? 0.28 : 0.4}
            dashed
            dashSize={0.12}
            gapSize={0.08}
          />
        )
      })}
    </>
  )
}

const POOL = 10
const UP = new THREE.Vector3(0, 1, 0)

function Tethers({ shared, dark }: { shared: Shared; dark: boolean }) {
  const cores = useRef<(THREE.Group | null)[]>([])
  const scratch = useMemo(() => ({ a: new THREE.Vector3(), b: new THREE.Vector3(), d: new THREE.Vector3() }), [])
  const place = (index: number, from: THREE.Vector3, to: THREE.Vector3) => {
    const group = cores.current[index]
    if (!group) return
    const d = scratch.d.copy(to).sub(from)
    const length = d.length()
    group.visible = length > 0.01
    group.position.copy(from).addScaledVector(d, 0.5)
    group.quaternion.setFromUnitVectors(UP, d.normalize())
    group.scale.set(1, length, 1)
  }
  useFrame(({ clock }) => {
    const time = clock.elapsedTime
    let n = 0
    for (const [ref, body] of shared.bodies) {
      if (n >= POOL) break
      if (shared.slots.has(ref)) {
        const age = time - body.reelAt
        if (age > 1.5) continue
        const start = scratch.a.copy(body.pos).normalize().multiplyScalar(PLANET)
        if (age < 0.28) place(n++, start, scratch.b.copy(start).lerp(body.pos, age / 0.28))
        else if (age < 1.15) place(n++, start, body.pos)
        else place(n++, scratch.b.copy(start).lerp(body.pos, (age - 1.15) / 0.35), body.pos)
      } else {
        const age = time - body.flingAt
        if (age > 0.7) continue
        const home = shared.homes.get(ref)!
        place(n++, scratch.a.copy(body.pos).lerp(home, age / 0.7), body.pos)
      }
    }
    for (let i = n; i < POOL; i++) if (cores.current[i]) cores.current[i]!.visible = false
  })
  const blending = dark ? THREE.AdditiveBlending : THREE.NormalBlending
  return (
    <>
      {Array.from({ length: POOL }, (_, i) => (
        <group key={i} ref={(el) => void (cores.current[i] = el)} visible={false}>
          <mesh>
            <cylinderGeometry args={[0.03, 0.03, 1, 6, 1, true]} />
            <meshBasicMaterial color={dark ? '#d8f1ff' : '#2F6F8F'} transparent opacity={0.95} blending={blending} depthWrite={false} />
          </mesh>
          <mesh>
            <cylinderGeometry args={[0.12, 0.12, 1, 8, 1, true]} />
            <meshBasicMaterial color="#5A91AD" transparent opacity={dark ? 0.35 : 0.18} blending={blending} depthWrite={false} />
          </mesh>
        </group>
      ))}
    </>
  )
}

function useFresnel(dark: boolean, hue: number) {
  return useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: { color: { value: hsl(hue, 0.6, dark ? 0.6 : 0.5) }, strength: { value: dark ? 1.1 : 0.7 } },
        vertexShader: `varying vec3 vNormal; varying vec3 vView;
          void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); vNormal = normalize(normalMatrix * normal); vView = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
        fragmentShader: `uniform vec3 color; uniform float strength; varying vec3 vNormal; varying vec3 vView;
          void main() { float f = pow(1.0 - max(dot(vNormal, vView), 0.0), 2.6); gl_FragColor = vec4(color, f * strength); }`,
        transparent: true,
        depthWrite: false,
        blending: dark ? THREE.AdditiveBlending : THREE.NormalBlending,
      }),
    [dark, hue],
  )
}

function Planet({ lab, dark, shared }: { lab: Lab; dark: boolean; shared: Shared }) {
  const { framework, database, packageManager, agent } = lab.setup
  const hue = database === 'postgres' ? 205 : 130
  const ink = dark ? '#C9D6DC' : '#3A4448'
  const fresnel = useFresnel(dark, hue)
  const spin = useRef<THREE.Group>(null)
  const pmMoon = useRef<THREE.Group>(null)
  const agentMoon = useRef<THREE.Group>(null)
  const geodesic = useMemo(() => new THREE.EdgesGeometry(new THREE.IcosahedronGeometry(PLANET, 1)), [])
  const grid = useMemo(() => {
    const lines: THREE.Vector3[][] = []
    for (let i = 1; i < 6; i++) {
      const phi = (i / 6) * Math.PI
      lines.push(circle(Math.sin(phi) * PLANET, 64).map((p) => p.setY(Math.cos(phi) * PLANET)))
    }
    for (let i = 0; i < 6; i++) lines.push(circle(PLANET, 64).map((p) => new THREE.Vector3(p.x, p.z, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), (i / 6) * Math.PI)))
    return lines
  }, [])

  useFrame(({ clock }, delta) => {
    const t = clock.elapsedTime
    if (spin.current) spin.current.rotation.y += delta * 0.12
    shared.moons.pm.set(Math.cos(t * 0.4) * 2.5, Math.sin(t * 0.4) * 0.9, Math.sin(t * 0.4) * 2.5)
    shared.moons.agent.set(Math.cos(-t * 0.3 + 2) * 2.2, 1.5 + Math.sin(t * 0.3) * 0.3, Math.sin(-t * 0.3 + 2) * 2.2)
    pmMoon.current?.position.copy(shared.moons.pm)
    agentMoon.current?.position.copy(shared.moons.agent)
  })


  return (
    <group>
      <mesh
        onClick={(event) => {
          event.stopPropagation()
          lab.set('framework', framework === 'next' ? 'tanstack' : 'next')
        }}
      >
        <sphereGeometry args={[PLANET * 1.02, 48, 48]} />
        <primitive object={fresnel} attach="material" />
      </mesh>
      <mesh>
        <sphereGeometry args={[PLANET * 0.99, 32, 32]} />
        <meshBasicMaterial color={dark ? '#0D1418' : '#F4F7F8'} />
      </mesh>
      <group ref={spin}>
        {framework === 'next' ? (
          grid.map((points, i) => <Line key={i} points={points} color={ink} lineWidth={1} transparent opacity={0.55} />)
        ) : (
          <lineSegments geometry={geodesic} scale={1.09}>
            <lineBasicMaterial color={ink} transparent opacity={0.6} />
          </lineSegments>
        )}
      </group>
      <group rotation={[0.42, 0, 0.18]}>
        {(database === 'postgres' ? [1.75] : [1.6, 1.72, 1.84]).map((r) => (
          <Line key={r} points={circle(r * PLANET * 0.95)} color={hsl(hue, 0.55, dark ? 0.65 : 0.45)} lineWidth={database === 'postgres' ? 2 : 1} />
        ))}
      </group>
      <group ref={pmMoon}>
        <mesh onClick={(event) => (event.stopPropagation(), lab.set('packageManager', cycle(pms, packageManager)))}>
          <sphereGeometry args={[0.17, 16, 12]} />
          <meshBasicMaterial color={dark ? '#FCFCFC' : '#727C81'} wireframe />
        </mesh>
      </group>
      <group ref={agentMoon}>
        <mesh onClick={(event) => (event.stopPropagation(), lab.set('agent', cycle(agents, agent)))}>
          <octahedronGeometry args={[0.17, 0]} />
          <meshBasicMaterial color="#5A91AD" wireframe />
        </mesh>
      </group>
    </group>
  )
}

function OrbitRings({ counts, dark }: { counts: Record<ItemKind, number>; dark: boolean }) {
  const kinds = (Object.keys(rings) as ItemKind[]).flatMap((kind) => {
    const bands = kind === 'block' ? Math.ceil(counts.block / BLOCK_RING_SIZE) : counts[kind] ? 1 : 0
    return Array.from({ length: bands }, (_, band) => ({ kind, band }))
  })
  return (
    <>
      {kinds.map(({ kind, band }) => (
        <group key={`${kind}${band}`} rotation={rings[kind].tilt}>
          <Line points={circle(rings[kind].radius + band * 0.85, 128)} color={dark ? '#5A91AD' : '#5A91AD'} lineWidth={1} transparent opacity={dark ? 0.45 : 0.6} dashed dashSize={0.06} gapSize={0.06} />
        </group>
      ))}
    </>
  )
}

function Backdrop({ dark }: { dark: boolean }) {
  const points = useMemo(() => {
    const random = seeded(42)
    const array = new Float32Array(900 * 3)
    for (let i = 0; i < 900; i++) {
      const v = new THREE.Vector3(random() - 0.5, random() - 0.5, random() - 0.5).normalize().multiplyScalar(60 + random() * 40)
      array.set([v.x, v.y, v.z], i * 3)
    }
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(array, 3))
    return geometry
  }, [])
  const meridians = useMemo(() => Array.from({ length: 6 }, (_, i) => i), [])
  return (
    <>
      <points geometry={points}>
        <pointsMaterial color={dark ? '#8A9094' : '#727C81'} size={dark ? 0.18 : 0.14} sizeAttenuation transparent opacity={dark ? 0.7 : 0.35} depthWrite={false} />
      </points>
      {meridians.map((i) => (
        <group key={i} rotation={[Math.PI / 2, (i / 6) * Math.PI, 0]}>
          <Line points={circle(34, 160)} color={dark ? '#292F32' : '#C3CDD2'} lineWidth={1} transparent opacity={dark ? 0.7 : 0.9} />
        </group>
      ))}
      {[0, 10, -10].map((y) => (
        <group key={y} position={[0, y, 0]}>
          <Line points={circle(Math.sqrt(34 * 34 - y * y), 160)} color={dark ? '#292F32' : '#C3CDD2'} lineWidth={1} transparent opacity={dark ? 0.7 : 0.9} />
        </group>
      ))}
    </>
  )
}

function Drift({ controls, shared }: { controls: React.RefObject<CameraControls | null>; shared: Shared }) {
  const aspect = useThree((state) => state.size.width / state.size.height)
  useEffect(() => {
    const k = aspect < 0.8 ? 2 : 1
    controls.current?.setLookAt(0, 22 * k, 42 * k, 0, -2.5, 0, false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useFrame((_, delta) => {
    const c = controls.current
    if (!c || shared.hovering || performance.now() - shared.lastInput < 3500) return
    c.azimuthAngle += delta * 0.035
  })
  return null
}

function Scene({
  lab,
  clusters,
  shared,
  matches,
  setHovered,
}: {
  lab: Lab
  clusters: Cluster[]
  shared: Shared
  matches: ReadonlySet<string> | null
  setHovered: (ref: string | null) => void
}) {
  const dark = lab.theme === 'dark'
  const glow = useGlowTexture()
  const clock = useThree((state) => state.clock)
  const previous = useRef<ReadonlySet<string> | null>(null)

  if (previous.current !== lab.selected) {
    const before = previous.current
    for (const ref of lab.selected) {
      const body = shared.bodies.get(ref)
      if (body && before && !before.has(ref)) body.reelAt = clock.elapsedTime
    }
    if (before)
      for (const ref of before) {
        const body = shared.bodies.get(ref)
        if (!body || lab.selected.has(ref)) continue
        body.flingAt = clock.elapsedTime
        body.vel.addScaledVector(body.pos.clone().normalize(), 14).add(new THREE.Vector3(0, 6, 0))
      }
    previous.current = lab.selected
  }

  const counts: Record<ItemKind, number> = { feature: 0, component: 0, block: 0 }
  shared.slots.clear()
  for (const item of lab.catalog.items) {
    if (!lab.selected.has(item.ref)) continue
    shared.slots.set(item.ref, { kind: item.kind, index: counts[item.kind]++, count: 0 })
  }
  for (const slot of shared.slots.values()) slot.count = counts[slot.kind]

  return (
    <>
      <Backdrop dark={dark} />
      <Planet lab={lab} dark={dark} shared={shared} />
      <OrbitRings counts={counts} dark={dark} />
      <ConstellationLines clusters={clusters} homes={shared.homes} dark={dark} />
      <Sockets clusters={clusters} selected={lab.selected} dark={dark} />
      <Tethers shared={shared} dark={dark} />
      {clusters.map((cluster) =>
        cluster.items.map((item) => (
          <Star
            key={item.ref}
            item={item}
            shared={shared}
            selected={lab.selected.has(item.ref)}
            dimmed={!!matches && !matches.has(item.ref)}
            matched={!!matches && matches.has(item.ref)}
            dark={dark}
            glow={glow}
            onHover={(ref) => {
              shared.hovering = !!ref
              setHovered(ref)
              document.body.style.cursor = ref ? 'pointer' : ''
            }}
            onToggle={lab.toggle}
          />
        )),
      )}
      <Projector shared={shared} />
    </>
  )
}

function Projector({ shared }: { shared: Shared }) {
  const v = useMemo(() => new THREE.Vector3(), [])
  useFrame(({ camera, size }) => {
    for (const { el, at } of shared.anchors.values()) {
      const point = at()
      if (!point) continue
      v.copy(point).project(camera)
      el.style.visibility = v.z > 1 ? 'hidden' : 'visible'
      el.style.transform = `translate3d(${(v.x * 0.5 + 0.5) * size.width}px, ${(-v.y * 0.5 + 0.5) * size.height}px, 0)`
    }
  })
  return null
}

function HoverCard({ item, selected, dark }: { item: CatalogItem; selected: boolean; dark: boolean }) {
  const image = dark ? (item.imageDark ?? item.image) : item.image
  return (
    <div className="w-60 -translate-y-1/2 translate-x-5 overflow-hidden rounded-xl border border-border bg-surface/95 shadow-2xl backdrop-blur">
      <div className="relative aspect-[16/9] bg-background" style={{ boxShadow: `inset 0 -2px 0 hsl(${item.hue} 55% 55%)` }}>
        {image ? (
          <img src={image} alt="" className="size-full object-cover object-top" />
        ) : (
          <div className="grid size-full place-items-center font-mono text-[10px] uppercase tracking-widest text-muted">no preview</div>
        )}
      </div>
      <div className="px-3 py-2">
        <div className="text-[13px] font-medium text-foreground">{item.title}</div>
        <div className="mt-0.5 flex items-center justify-between gap-2 text-[11px] text-muted">
          <span>{item.label}</span>
          <span className="font-mono text-[10px] uppercase tracking-wider" style={{ color: `hsl(${item.hue} 55% ${dark ? 65 : 40}%)` }}>
            {selected ? 'click to fling back' : 'click to reel in'}
          </span>
        </div>
      </div>
    </div>
  )
}

function flyTo(controls: CameraControls | null, center: THREE.Vector3, distance: number, shared: Shared) {
  if (!controls) return
  shared.lastInput = performance.now() + 2500
  const target = controls.getTarget(new THREE.Vector3())
  const direction = controls.camera.position.clone().sub(target).normalize()
  direction.y = Math.max(direction.y, 0.35)
  direction.normalize()
  const eye = center.clone().addScaledVector(direction, distance)
  controls.setLookAt(eye.x, eye.y, eye.z, center.x, center.y, center.z, true)
}

const HOME = new THREE.Vector3(0, 0, 0)
const PLANET_LABEL = new THREE.Vector3(0, -PLANET - 1.5, 0)
const moonLabel =
  'pointer-events-auto block -translate-x-1/2 cursor-pointer select-none whitespace-nowrap rounded-full border border-border bg-surface/85 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-foreground backdrop-blur hover:border-accent'

export default function Constellation({ lab }: MockProps) {
  const dark = lab.theme === 'dark'
  const clusters = useMemo(() => relax(buildClusters(lab.catalog.items)), [lab.catalog.items])
  const shared = useMemo<Shared>(() => {
    const homes = homesFor(clusters)
    const bodies = new Map<string, Body>()
    for (const item of lab.catalog.items) bodies.set(item.ref, { pos: homes.get(item.ref)!.clone(), vel: new THREE.Vector3(), reelAt: -10, flingAt: -10 })
    return { homes, bodies, slots: new Map(), hovering: false, lastInput: 0, anchors: new Map(), moons: { pm: new THREE.Vector3(), agent: new THREE.Vector3() } }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clusters])
  const controls = useRef<CameraControls | null>(null)
  const [hovered, setHovered] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [copied, setCopied] = useState(false)
  const hoverItem = hovered ? lab.catalog.items.find((item) => item.ref === hovered) : undefined
  const anchor = (key: string, at: () => THREE.Vector3 | undefined) => (el: HTMLDivElement | null) => {
    if (el) shared.anchors.set(key, { el, at })
    else shared.anchors.delete(key)
  }

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return null
    return new Set(
      lab.catalog.items
        .filter((item) => `${item.title} ${item.label} ${item.name} ${item.kind} ${item.description}`.toLowerCase().includes(q))
        .map((item) => item.ref),
    )
  }, [query, lab.catalog.items])

  useEffect(() => {
    if (!matches || matches.size === 0) return
    const timer = setTimeout(() => {
      const box = new THREE.Box3()
      for (const ref of matches) box.expandByPoint(shared.homes.get(ref)!)
      const sphere = box.getBoundingSphere(new THREE.Sphere())
      flyTo(controls.current, sphere.center, Math.max(9, sphere.radius * 2.6 + 6), shared)
    }, 280)
    return () => clearTimeout(timer)
  }, [matches, shared])

  const kindCounts = { feature: 0, component: 0, block: 0 }
  for (const item of lab.catalog.items) if (lab.selected.has(item.ref)) kindCounts[item.kind]++

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(lab.command)
    } catch {}
    setCopied(true)
    setTimeout(() => setCopied(false), 1400)
  }

  const chip = 'rounded-md border border-border px-2 py-1 font-mono text-[10px] uppercase tracking-wider transition hover:border-accent'
  const backdrop = dark
    ? 'radial-gradient(ellipse at 50% 45%, #12202a 0%, #090E11 60%)'
    : 'linear-gradient(#5A91AD14 1px, transparent 1px) 0 0 / 40px 40px, linear-gradient(90deg, #5A91AD14 1px, transparent 1px) 0 0 / 40px 40px, radial-gradient(ellipse at 50% 45%, #F7FAFB 0%, #EDF1F3 70%)'

  return (
    <div className="relative h-full w-full" style={{ background: backdrop }} onPointerDown={() => (shared.lastInput = performance.now())} onWheel={() => (shared.lastInput = performance.now())}>
      <Canvas dpr={[1, 2]} camera={{ position: [0, 22, 40], fov: 32, near: 0.1, far: 300 }} onPointerMissed={() => setHovered(null)}>
        <CameraControls ref={controls} minDistance={4} maxDistance={75} smoothTime={0.6} />
        <Drift controls={controls} shared={shared} />
        <Scene lab={lab} clusters={clusters} shared={shared} matches={matches} setHovered={setHovered} />
      </Canvas>

      <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden">
        {clusters.map((cluster) => {
          const inOrbit = cluster.items.filter((item) => lab.selected.has(item.ref)).length
          const at = cluster.center.clone().add(new THREE.Vector3(0, cluster.radius * 0.6 + 0.9, 0))
          return (
            <div key={cluster.id} ref={anchor(cluster.id, () => at)} className="absolute left-0 top-0">
              <button
                type="button"
                onClick={() => flyTo(controls.current, cluster.center, cluster.radius * 5 + 12, shared)}
                className="pointer-events-auto flex -translate-x-1/2 -translate-y-1/2 cursor-pointer select-none items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium tracking-wide text-foreground/80 transition hover:bg-surface/80 hover:text-foreground"
                style={{ opacity: matches && !cluster.items.some((item) => matches.has(item.ref)) ? 0.3 : 1 }}
              >
                <span className="size-1.5 rounded-full" style={{ background: `hsl(${cluster.hue} 55% ${dark ? 62 : 48}%)` }} />
                {cluster.label}
                <span className="font-mono text-[10px] text-muted">
                  {inOrbit ? <span className="text-accent">{inOrbit}/</span> : null}
                  {cluster.items.length}
                </span>
              </button>
            </div>
          )
        })}
        <div ref={anchor('planet', () => PLANET_LABEL)} className="absolute left-0 top-0">
          <div className="-translate-x-1/2 -translate-y-1/2 select-none text-center">
            <div className="font-mono text-[11px] uppercase tracking-[0.2em] text-foreground">{lab.setup.target === 'new' ? lab.setup.name || 'new-app' : 'your app'}</div>
            <div className="whitespace-nowrap text-[10px] text-muted">
              {lab.setup.framework === 'next' ? 'Next.js' : 'TanStack Start'} · {lab.setup.database === 'postgres' ? 'PostgreSQL' : 'MongoDB'}
            </div>
          </div>
        </div>
        <div ref={anchor('pm', () => shared.moons.pm)} className="absolute left-0 top-0">
          <button type="button" className={`${moonLabel} translate-y-3`} onClick={() => lab.set('packageManager', cycle(pms, lab.setup.packageManager))}>
            ◐ {lab.setup.packageManager}
          </button>
        </div>
        <div ref={anchor('agent', () => shared.moons.agent)} className="absolute left-0 top-0">
          <button type="button" className={`${moonLabel} -translate-y-[calc(100%+12px)]`} onClick={() => lab.set('agent', cycle(agents, lab.setup.agent))}>
            ◇ {lab.setup.agent === 'none' ? 'no agent' : lab.setup.agent}
          </button>
        </div>
        {lab.selected.size <= 14
          ? lab.catalog.items
              .filter((item) => lab.selected.has(item.ref) && item.ref !== hovered)
              .map((item) => (
                <div key={item.ref} ref={anchor(`orbit:${item.ref}`, () => shared.bodies.get(item.ref)?.pos)} className="absolute left-0 top-0">
                  <span
                    className="block -translate-x-1/2 translate-y-3 whitespace-nowrap rounded px-1 font-mono text-[9px] uppercase tracking-wider"
                    style={{ color: `hsl(${item.hue} 60% ${dark ? 75 : 35}%)`, background: dark ? '#090E11aa' : '#EDF1F3cc' }}
                  >
                    {item.title}
                  </span>
                </div>
              ))
          : null}
        {hoverItem ? (
          <div ref={anchor('hover', () => shared.bodies.get(hoverItem.ref)?.pos)} className="absolute left-0 top-0 z-10">
            <HoverCard item={hoverItem} selected={lab.selected.has(hoverItem.ref)} dark={dark} />
          </div>
        ) : null}
      </div>

      <div className="pointer-events-none absolute left-4 top-[72px] z-30 flex flex-col gap-2">
        <div className="pointer-events-auto flex items-center gap-2 rounded-xl border border-border bg-surface/85 px-3 py-2 shadow-lg backdrop-blur">
          <span className="font-mono text-[10px] uppercase tracking-widest text-muted">scan</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && matches?.size) {
                const first = lab.catalog.items.find((item) => matches.has(item.ref) && !lab.selected.has(item.ref))
                if (first) lab.toggle(first.ref)
              }
              if (event.key === 'Escape') setQuery('')
            }}
            placeholder="hero, pricing, forms…"
            className="w-44 bg-transparent text-sm text-foreground outline-none placeholder:text-muted"
          />
          {matches ? <span className="font-mono text-[10px] text-muted">{matches.size} lit</span> : null}
        </div>
        <button
          type="button"
          onClick={() => {
            setQuery('')
            flyTo(controls.current, HOME, 50, shared)
          }}
          className="pointer-events-auto self-start rounded-full border border-border bg-surface/85 px-3 py-1 font-mono text-[10px] uppercase tracking-widest text-muted backdrop-blur hover:text-foreground"
        >
          ⌂ return to planet
        </button>
        {matches?.size ? <div className="font-mono text-[10px] uppercase tracking-widest text-muted">enter reels in the next match</div> : null}
      </div>

      <div className="absolute bottom-4 left-4 right-[84px] z-30 flex flex-wrap items-stretch gap-px overflow-hidden rounded-xl border border-border bg-border shadow-2xl max-sm:right-4 max-sm:bottom-[72px]">
        <div className="flex min-w-[150px] flex-col justify-center bg-surface/95 px-3 py-2 backdrop-blur">
          <div className="font-mono text-[9px] uppercase tracking-[0.25em] text-muted">in orbit</div>
          <div className="flex items-baseline gap-2">
            <span data-count className="font-mono text-2xl tabular-nums text-foreground">{String(lab.selected.size).padStart(2, '0')}</span>
            <span className="font-mono text-[10px] text-muted">
              F{kindCounts.feature} C{kindCounts.component} B{kindCounts.block}
            </span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 bg-surface/95 px-3 py-2 backdrop-blur">
          <button type="button" className={chip} onClick={() => lab.set('target', lab.setup.target === 'new' ? 'existing' : 'new')}>
            {lab.setup.target === 'new' ? 'init' : 'add'}
          </button>
          {lab.setup.target === 'new' ? (
            <input
              value={lab.setup.name}
              onChange={(event) => lab.set('name', event.target.value)}
              className="w-28 rounded-md border border-border bg-transparent px-2 py-1 font-mono text-[10px] text-foreground outline-none focus:border-accent"
            />
          ) : null}
          <button type="button" className={chip} onClick={() => lab.set('framework', lab.setup.framework === 'next' ? 'tanstack' : 'next')}>
            {lab.setup.framework}
          </button>
          <button type="button" className={chip} onClick={() => lab.set('database', lab.setup.database === 'postgres' ? 'mongodb' : 'postgres')}>
            {lab.setup.database}
          </button>
        </div>
        <div className="flex min-w-0 flex-1 items-center gap-2 bg-surface/95 px-3 py-2 backdrop-blur">
          <span className="font-mono text-xs text-accent">$</span>
          <code className="min-w-0 flex-1 truncate font-mono text-xs text-foreground" title={lab.command}>
            {lab.command}
          </code>
        </div>
        <div className="flex items-center gap-1 bg-surface/95 px-2 py-2 backdrop-blur">
          {lab.selected.size ? (
            <button type="button" onClick={lab.clear} className="rounded-md px-2 py-1.5 font-mono text-[10px] uppercase tracking-wider text-muted hover:text-foreground">
              recall all
            </button>
          ) : null}
          <button type="button" onClick={copy} className="rounded-md bg-accent px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider text-accent-foreground">
            {copied ? 'copied' : 'copy'}
          </button>
        </div>
      </div>
    </div>
  )
}
