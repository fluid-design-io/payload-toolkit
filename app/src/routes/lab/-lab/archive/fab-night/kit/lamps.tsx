import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import {
  AdditiveBlending,
  BufferGeometry,
  CircleGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  Float32BufferAttribute,
  InstancedBufferAttribute,
  InstancedMesh,
  LineBasicMaterial,
  LineSegments,
  Matrix4,
  MeshBasicMaterial,
  PlaneGeometry,
  PointLight,
  Points,
  Quaternion,
  ShaderMaterial,
  SphereGeometry,
  Vector3,
} from 'three'

import { APPLY, LAMP_ROWS, textTexture } from './contract'
import type { Energy, Look } from './contract'
import type { Sim } from './sim'

export const LAMP_ROWS_X = [-9.4, -4.2, 0.6, 5.4, 11.2]
const LAMP_Z = [-2.6, 3.4]
export const MIRROR_SKIP = 1
const LAMP_Y = 13
const LENS_Y = LAMP_Y - 0.44
const ROD_TOP = 19
const BEAM_TOP = LENS_Y - 0.02
const BEAM_LEN = BEAM_TOP - 0.04
const LAMPS = LAMP_ROWS_X.map((x, row) => ({ x, z: LAMP_Z[row % 2], row }))
const LIT_ROWS = [1, 2, 3]

function lampColor(look: Look) {
  const c = new Color(look.lamp)
  return look.dark ? c : c.offsetHSL(-0.015, -0.12, 0.03)
}

const glowVertex = /* glsl */ `
attribute float aEnergy;
varying float vY;
varying float vE;
varying vec3 vN;
varying vec3 vV;
varying vec2 vUv;
void main() {
  vUv = uv;
  vY = uv.y;
  vE = aEnergy;
  vec4 mv = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
  vN = normalize(normalMatrix * mat3(instanceMatrix) * normal);
  vV = isOrthographic ? vec3(0.0, 0.0, 1.0) : normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}`

const beamFragment = /* glsl */ `
uniform vec3 uColor;
uniform float uStrength;
varying float vY;
varying float vE;
varying vec3 vN;
varying vec3 vV;
void main() {
  float rim = pow(abs(dot(normalize(vN), normalize(vV))), 1.6);
  float a = pow(vY, 1.7) * rim * uStrength * vE;
  gl_FragColor = vec4(uColor, a);
  #include <colorspace_fragment>
}`

const poolFragment = /* glsl */ `
uniform vec3 uColor;
uniform float uStrength;
uniform sampler2D uMap;
varying float vE;
varying vec2 vUv;
void main() {
  float a = texture2D(uMap, vUv).a * uStrength * vE;
  gl_FragColor = vec4(uColor, a);
  #include <colorspace_fragment>
}`

const additive = { transparent: true, depthWrite: false, blending: AdditiveBlending, toneMapped: false } as const

function ring(out: number[], x: number, y: number, z: number, r: number, n = 24) {
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2, b = ((k + 1) / n) * Math.PI * 2
    out.push(x + Math.cos(a) * r, y, z + Math.sin(a) * r, x + Math.cos(b) * r, y, z + Math.sin(b) * r)
  }
}

export function Lamps({ look, energy }: { look: Look; energy: Energy }) {
  const kit = useMemo(() => {
    const n = LAMPS.length
    const m = new Matrix4()

    const shadeGeometry = new CylinderGeometry(0.18, 0.75, 0.5, 20, 1, true)
    const shadeMaterial = new MeshBasicMaterial({ side: DoubleSide })
    const shades = new InstancedMesh(shadeGeometry, shadeMaterial, n)

    const lensGeometry = new CircleGeometry(0.68, 24).rotateX(Math.PI / 2)
    const lensMaterial = new MeshBasicMaterial({ toneMapped: false })
    const lenses = new InstancedMesh(lensGeometry, lensMaterial, n)

    const beamGeometry = new CylinderGeometry(0.66, 3.6, BEAM_LEN, 32, 1, true)
    const beamEnergy = new InstancedBufferAttribute(new Float32Array(n), 1)
    beamGeometry.setAttribute('aEnergy', beamEnergy)
    const beamMaterial = new ShaderMaterial({
      vertexShader: glowVertex,
      fragmentShader: beamFragment,
      uniforms: { uColor: { value: new Color() }, uStrength: { value: 0.26 } },
      side: DoubleSide,
      ...additive,
    })
    const beams = new InstancedMesh(beamGeometry, beamMaterial, n)

    const poolTexture = textTexture(256, 256, (ctx) => {
      const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128)
      g.addColorStop(0, 'rgba(255,255,255,0.9)')
      g.addColorStop(0.3, 'rgba(255,255,255,0.5)')
      g.addColorStop(0.62, 'rgba(255,255,255,0.14)')
      g.addColorStop(1, 'rgba(255,255,255,0)')
      ctx.fillStyle = g
      ctx.fillRect(0, 0, 256, 256)
    })
    const poolGeometry = new PlaneGeometry(6.5, 6.5).rotateX(-Math.PI / 2)
    const poolEnergy = new InstancedBufferAttribute(new Float32Array(n), 1)
    poolGeometry.setAttribute('aEnergy', poolEnergy)
    const poolMaterial = new ShaderMaterial({
      vertexShader: glowVertex,
      fragmentShader: poolFragment,
      uniforms: { uColor: { value: new Color() }, uStrength: { value: 0.9 }, uMap: { value: poolTexture } },
      ...additive,
    })
    const pools = new InstancedMesh(poolGeometry, poolMaterial, n)

    const lines: number[] = []
    LAMPS.forEach(({ x, z }, i) => {
      shades.setMatrixAt(i, m.makeTranslation(x, LAMP_Y - 0.19, z))
      lenses.setMatrixAt(i, m.makeTranslation(x, LENS_Y, z))
      beams.setMatrixAt(i, m.makeTranslation(x, BEAM_TOP - BEAM_LEN / 2, z))
      pools.setMatrixAt(i, m.makeTranslation(x, 0.02, z))
      lines.push(x, LAMP_Y + 0.06, z, x, ROD_TOP, z)
      ring(lines, x, LAMP_Y + 0.06, z, 0.18, 12)
      ring(lines, x, LAMP_Y - 0.44, z, 0.75)
      for (let k = 0; k < 4; k++) {
        const a = (k / 4) * Math.PI * 2 + Math.PI / 4
        lines.push(x + Math.cos(a) * 0.18, LAMP_Y + 0.06, z + Math.sin(a) * 0.18, x + Math.cos(a) * 0.75, LAMP_Y - 0.44, z + Math.sin(a) * 0.75)
      }
    })
    for (const x of LAMP_ROWS_X) lines.push(x, ROD_TOP - 1.4, LAMP_Z[0] - 0.6, x, ROD_TOP - 1.4, LAMP_Z[1] + 0.6)
    const lineGeometry = new BufferGeometry()
    lineGeometry.setAttribute('position', new Float32BufferAttribute(lines, 3))
    const lineMaterial = new LineBasicMaterial({ transparent: true })
    const hairlines = new LineSegments(lineGeometry, lineMaterial)

    for (const mesh of [shades, lenses, beams, pools]) mesh.frustumCulled = false
    lenses.setColorAt(0, new Color())
    beams.renderOrder = 2
    pools.renderOrder = 1

    const lights = LIT_ROWS.map((row) => {
      const light = new PointLight(0xffffff, 0, 22, 1.4)
      light.position.set(LAMP_ROWS_X[row], 11, (LAMP_Z[0] + LAMP_Z[1]) / 2)
      return light
    })

    return {
      shades, lenses, beams, pools, hairlines, lights,
      shadeMaterial, lensMaterial, beamMaterial, poolMaterial, lineMaterial,
      beamEnergy, poolEnergy, poolTexture, lineGeometry,
      color: new Color(), tmp: new Color(), m,
      geometries: [shadeGeometry, lensGeometry, beamGeometry, poolGeometry, lineGeometry],
    }
  }, [])

  useEffect(() => {
    const c = lampColor(look)
    kit.color.copy(c)
    kit.shadeMaterial.color.set(look.surface)
    kit.lineMaterial.color.set(look.edge)
    kit.lineMaterial.opacity = look.dark ? 0.9 : 0.75
    kit.beamMaterial.uniforms.uColor.value.copy(c)
    kit.beamMaterial.uniforms.uStrength.value = look.dark ? 0.26 : 0.12
    kit.poolMaterial.uniforms.uColor.value.copy(c)
    kit.poolMaterial.uniforms.uStrength.value = look.dark ? 0.6 : 0.3
    for (const light of kit.lights) light.color.copy(c)
  }, [kit, look])

  useEffect(() => () => {
    for (const g of kit.geometries) g.dispose()
    kit.shadeMaterial.dispose()
    kit.lensMaterial.dispose()
    kit.beamMaterial.dispose()
    kit.poolMaterial.dispose()
    kit.lineMaterial.dispose()
    kit.poolTexture.dispose()
    for (const light of kit.lights) light.dispose()
    kit.shades.dispose()
    kit.lenses.dispose()
    kit.beams.dispose()
    kit.pools.dispose()
  }, [kit])

  useFrame(() => {
    const beam = kit.beamEnergy.array as Float32Array
    const pool = kit.poolEnergy.array as Float32Array
    for (let i = 0; i < LAMPS.length; i++) {
      const { x, z, row } = LAMPS[i]
      const b = (energy.rows[row] ?? 0) * energy.all
      beam[i] = b
      pool[i] = b
      const on = b > 0.004
      kit.lenses.setMatrixAt(i, on ? kit.m.makeTranslation(x, LENS_Y, z) : kit.m.makeScale(0, 0, 0))
      kit.lenses.setColorAt(i, kit.tmp.copy(kit.color).multiplyScalar(0.25 + 1.15 * b))
    }
    kit.beamEnergy.needsUpdate = true
    kit.poolEnergy.needsUpdate = true
    kit.lenses.instanceMatrix.needsUpdate = true
    if (kit.lenses.instanceColor) kit.lenses.instanceColor.needsUpdate = true
    const peak = look.dark ? 42 : 18
    for (let k = 0; k < LIT_ROWS.length; k++) kit.lights[k].intensity = peak * (energy.rows[LIT_ROWS[k]] ?? 0) * energy.all
  }, APPLY)

  useEffect(() => {
    for (const o of [kit.shades, kit.lenses, kit.pools, kit.beams]) o.layers.set(MIRROR_SKIP)
  }, [kit])

  return (
    <group>
      <primitive object={kit.hairlines} />
      <primitive object={kit.shades} />
      <primitive object={kit.lenses} />
      <primitive object={kit.pools} />
      <primitive object={kit.beams} />
      {kit.lights.map((light, k) => (
        <primitive key={k} object={light} />
      ))}
    </group>
  )
}

const BEACONS = 8

const wedgeVertex = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
}`

const wedgeFragment = /* glsl */ `
uniform vec3 uColor;
uniform float uStrength;
varying vec2 vUv;
void main() {
  float along = pow(1.0 - vUv.x, 1.6) * smoothstep(0.0, 0.08, vUv.x);
  float across = 1.0 - vUv.y * vUv.y;
  gl_FragColor = vec4(uColor, along * across * uStrength);
  #include <colorspace_fragment>
}`

function wedgeGeometry() {
  const pos: number[] = []
  const uv: number[] = []
  const reach = 3.4, spread = 0.24, droop = 0.2, steps = 8
  for (const side of [0, Math.PI]) {
    for (let k = 0; k < steps; k++) {
      const s0 = -1 + (2 * k) / steps, s1 = -1 + (2 * (k + 1)) / steps
      const a0 = side + s0 * spread, a1 = side + s1 * spread
      pos.push(0, 0, 0, Math.cos(a0) * reach, -reach * droop, Math.sin(a0) * reach, Math.cos(a1) * reach, -reach * droop, Math.sin(a1) * reach)
      uv.push(0, 0, 1, Math.abs(s0), 1, Math.abs(s1))
    }
  }
  const g = new BufferGeometry()
  g.setAttribute('position', new Float32BufferAttribute(pos, 3))
  g.setAttribute('uv', new Float32BufferAttribute(uv, 2))
  return g
}

export function Beacons({ look, energy, anchors, sim }: { look: Look; energy: Energy; anchors: { current: Vector3[] }; sim: Sim }) {
  const kit = useMemo(() => {
    const domeGeometry = new SphereGeometry(0.15, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2)
    const domeMaterial = new MeshBasicMaterial({ toneMapped: false })
    const domes = new InstancedMesh(domeGeometry, domeMaterial, BEACONS)
    const sweepGeometry = wedgeGeometry()
    const sweepMaterial = new ShaderMaterial({
      vertexShader: wedgeVertex,
      fragmentShader: wedgeFragment,
      uniforms: { uColor: { value: new Color() }, uStrength: { value: 1 } },
      side: DoubleSide,
      ...additive,
    })
    const sweeps = new InstancedMesh(sweepGeometry, sweepMaterial, BEACONS)
    const hidden = new Matrix4().makeScale(0, 0, 0)
    for (let i = 0; i < BEACONS; i++) {
      domes.setMatrixAt(i, hidden)
      sweeps.setMatrixAt(i, hidden)
    }
    domes.frustumCulled = false
    sweeps.frustumCulled = false
    sweeps.renderOrder = 2
    return {
      domes, sweeps, domeMaterial, sweepMaterial, domeGeometry, sweepGeometry, hidden,
      color: new Color(), m: new Matrix4(), q: new Quaternion(), up: new Vector3(0, 1, 0), one: new Vector3(1, 1, 1), at: new Vector3(),
    }
  }, [])

  useEffect(() => {
    kit.color.copy(lampColor(look))
    kit.sweepMaterial.uniforms.uColor.value.copy(kit.color)
  }, [kit, look])

  useEffect(() => () => {
    kit.domeGeometry.dispose()
    kit.sweepGeometry.dispose()
    kit.domeMaterial.dispose()
    kit.sweepMaterial.dispose()
    kit.domes.dispose()
    kit.sweeps.dispose()
  }, [kit])

  useFrame(() => {
    const list = anchors.current ?? []
    const n = Math.min(list.length, BEACONS)
    const k = energy.machines * energy.all
    kit.domeMaterial.color.copy(kit.color).multiplyScalar(0.2 + 0.9 * k)
    kit.sweepMaterial.uniforms.uStrength.value = k * (look.dark ? 0.75 : 0.4)
    const t = sim.idleTime
    for (let i = 0; i < BEACONS; i++) {
      const p = list[i]
      if (i >= n || !p) {
        kit.domes.setMatrixAt(i, kit.hidden)
        kit.sweeps.setMatrixAt(i, kit.hidden)
        continue
      }
      kit.at.copy(p)
      kit.q.setFromAxisAngle(kit.up, t * 2 + i * 2.1)
      kit.domes.setMatrixAt(i, kit.m.compose(kit.at, kit.q, kit.one))
      kit.at.y += 0.07
      kit.sweeps.setMatrixAt(i, kit.m.compose(kit.at, kit.q, kit.one))
    }
    kit.domes.instanceMatrix.needsUpdate = true
    kit.sweeps.instanceMatrix.needsUpdate = true
  }, APPLY)

  return (
    <group>
      <primitive object={kit.domes} />
      <primitive object={kit.sweeps} />
    </group>
  )
}

const MOTES = 400

const dustVertex = /* glsl */ `
attribute float aSeed;
attribute float aRow;
uniform float uTime;
uniform float uRows[${LAMP_ROWS}];
uniform float uSize;
varying float vA;
void main() {
  vec3 p = position;
  float t = uTime * 0.22 + aSeed * 40.0;
  p.x += sin(t * 0.9 + aSeed * 11.0) * 0.35;
  p.z += cos(t * 0.7 + aSeed * 7.0) * 0.35;
  p.y += sin(t * 0.5 + aSeed * 3.0) * 0.45;
  float e = uRows[int(aRow + 0.5)];
  vA = e * (0.55 + 0.45 * sin(uTime * (0.6 + aSeed) + aSeed * 30.0)) * mix(0.45, 1.0, clamp(p.y / 12.0, 0.0, 1.0));
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  gl_PointSize = uSize * (0.6 + 0.8 * aSeed);
}`

const dustFragment = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
varying float vA;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.05, d) * vA * uOpacity;
  gl_FragColor = vec4(uColor, a);
  #include <colorspace_fragment>
}`

export function Dust({ look, energy, sim }: { look: Look; energy: Energy; sim: Sim }) {
  const kit = useMemo(() => {
    const pos = new Float32Array(MOTES * 3)
    const seed = new Float32Array(MOTES)
    const row = new Float32Array(MOTES)
    for (let i = 0; i < MOTES; i++) {
      const lamp = LAMPS[i % LAMPS.length]
      const y = 0.4 + Math.random() * (BEAM_TOP - 1.2)
      const radius = 0.66 + (3.6 - 0.66) * (1 - y / BEAM_TOP)
      const r = radius * 0.85 * Math.sqrt(Math.random())
      const a = Math.random() * Math.PI * 2
      pos.set([lamp.x + Math.cos(a) * r, y, lamp.z + Math.sin(a) * r], i * 3)
      seed[i] = Math.random()
      row[i] = lamp.row
    }
    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new Float32BufferAttribute(pos, 3))
    geometry.setAttribute('aSeed', new Float32BufferAttribute(seed, 1))
    geometry.setAttribute('aRow', new Float32BufferAttribute(row, 1))
    const material = new ShaderMaterial({
      vertexShader: dustVertex,
      fragmentShader: dustFragment,
      uniforms: {
        uTime: { value: 0 },
        uRows: { value: new Float32Array(LAMP_ROWS) },
        uSize: { value: 2 },
        uColor: { value: new Color() },
        uOpacity: { value: 0.8 },
      },
      ...additive,
    })
    const points = new Points(geometry, material)
    points.frustumCulled = false
    points.renderOrder = 3
    return { points, geometry, material }
  }, [])

  useEffect(() => {
    kit.material.uniforms.uColor.value.copy(lampColor(look)).lerp(new Color('#ffffff'), 0.35)
    kit.material.uniforms.uOpacity.value = look.dark ? 0.8 : 0.4
  }, [kit, look])

  useEffect(() => () => {
    kit.geometry.dispose()
    kit.material.dispose()
  }, [kit])

  useFrame(({ viewport }) => {
    const u = kit.material.uniforms
    const rows = u.uRows.value as Float32Array
    for (let r = 0; r < LAMP_ROWS; r++) rows[r] = (energy.rows[r] ?? 0) * energy.all
    u.uTime.value = sim.idleTime
    u.uSize.value = 2.2 * viewport.dpr
  }, APPLY)

  useEffect(() => kit.points.layers.set(MIRROR_SKIP), [kit])
  return <primitive object={kit.points} />
}
