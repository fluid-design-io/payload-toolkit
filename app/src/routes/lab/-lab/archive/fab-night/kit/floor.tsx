import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import {
  BufferGeometry,
  Color,
  DepthTexture,
  Float32BufferAttribute,
  HalfFloatType,
  LinearFilter,
  LinearMipmapLinearFilter,
  LineBasicMaterial,
  Matrix4,
  Mesh,
  OrthographicCamera,
  PerspectiveCamera,
  Plane,
  ShaderMaterial,
  UniformsLib,
  UniformsUtils,
  Vector2,
  Vector3,
  Vector4,
  WebGLRenderTarget,
} from 'three'
import type { Camera } from 'three'

import type { Energy, Look } from './contract'

const vertexShader = /* glsl */ `
uniform mat4 uTexMatrix;
uniform mat4 uVirtView;
varying vec4 vRefl;
varying vec3 vWorld;
varying vec3 vVirt;
#include <fog_pars_vertex>
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  vRefl = uTexMatrix * world;
  vVirt = (uVirtView * world).xyz;
  vec4 mvPosition = viewMatrix * world;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`

const fragmentShader = /* glsl */ `
uniform sampler2D tColor;
uniform sampler2D tDepth;
uniform mat4 uInvProj;
uniform vec3 uFloor;
uniform vec2 uTexel;
uniform float uStrength;
uniform float uBlur;
uniform float uEnergy;
uniform float uMaxLod;
uniform float uOn;
uniform float uDark;
varying vec4 vRefl;
varying vec3 vWorld;
varying vec3 vVirt;
#include <fog_pars_fragment>

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}

// Metres from this floor point to the reflected surface along the mirrored ray.
// Empty texels hold only additive glow (beams, motes), so they get a short fixed gap and still reflect.
float gap(vec2 uv) {
  float z = texture2D(tDepth, uv).x;
  if (z >= 0.99999) return 2.5;
  vec4 p = uInvProj * vec4(vec3(uv, z) * 2.0 - 1.0, 1.0);
  return length(p.xyz / p.w - vVirt);
}

void main() {
  float n = noise(vWorld.xz * 0.32) * 0.65 + noise(vWorld.xz * 1.9 + 7.3) * 0.35;
  float grain = hash(floor(vWorld.xz * 40.0));
  vec3 base = uFloor * (0.93 + 0.12 * n + 0.03 * grain);
  vec3 col = base;
  if (uOn > 0.5) {
    vec2 uv = vRefl.xy / vRefl.w;
    float r = 2.0 + 8.0 * uBlur;
    vec2 dx = vec2(uTexel.x * r, 0.0), dy = vec2(0.0, uTexel.y * r);
    float d = min(gap(uv), min(min(gap(uv + dx), gap(uv - dx)), min(gap(uv + dy), gap(uv - dy))));
    float wet = smoothstep(0.38, 0.72, n);
    float lod = uMaxLod * uBlur * (0.12 + 0.88 * smoothstep(0.0, 6.0, d)) + (1.0 - wet) * 1.4 * uBlur;
    vec4 refl = textureLod(tColor, uv, lod);
    float fade = exp(-d * 0.34) * smoothstep(0.0, 0.02, min(min(uv.x, 1.0 - uv.x), min(uv.y, 1.0 - uv.y)));
    vec3 V = normalize(cameraPosition - vWorld);
    float fres = pow(1.0 - clamp(V.y, 0.0, 1.0), 4.0);
    float k = clamp(uStrength * fade * mix(0.65, 1.0, wet) * (0.95 + 0.8 * fres), 0.0, 1.0) * uEnergy;
    col = base * (1.0 - k * clamp(refl.a, 0.0, 1.0)) + refl.rgb * k * mix(1.0, 1.35, uDark);
  }
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`

const BIAS = new Matrix4().set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1)

type Props = { look: Look; energy: Energy; size?: number; strength?: number; blur?: number }

export function ReflectiveFloor({ look, energy, size = 120, strength, blur = 0.5 }: Props) {
  const mesh = useRef<Mesh>(null)
  const kit = useMemo(() => {
    const target = new WebGLRenderTarget(1, 1, {
      type: HalfFloatType,
      minFilter: LinearMipmapLinearFilter,
      magFilter: LinearFilter,
      generateMipmaps: true,
      depthTexture: new DepthTexture(1, 1),
    })
    const material = new ShaderMaterial({
      vertexShader,
      fragmentShader,
      fog: true,
      uniforms: UniformsUtils.merge([
        UniformsLib.fog,
        {
          tColor: { value: null },
          tDepth: { value: null },
          uTexMatrix: { value: new Matrix4() },
          uVirtView: { value: new Matrix4() },
          uInvProj: { value: new Matrix4() },
          uFloor: { value: new Color() },
          uTexel: { value: new Vector2(1, 1) },
          uStrength: { value: 0.5 },
          uBlur: { value: 0.5 },
          uEnergy: { value: 1 },
          uMaxLod: { value: 0 },
          uOn: { value: 0 },
          uDark: { value: 1 },
        },
      ]),
    })
    material.uniforms.tColor.value = target.texture
    material.uniforms.tDepth.value = target.depthTexture
    return {
      target,
      material,
      persp: new PerspectiveCamera(),
      ortho: new OrthographicCamera(),
      clip: new Plane(),
      plane: new Plane().setFromNormalAndCoplanarPoint(new Vector3(0, 1, 0), new Vector3(0, 0.01, 0)),
      eye: new Vector3(),
      ahead: new Vector3(),
      up: new Vector3(),
      rot: new Matrix4(),
      inv: new Matrix4(),
      q: new Vector4(),
      c: new Vector4(),
      m4: new Vector4(),
      clear: new Color(),
    }
  }, [])

  useEffect(() => () => {
    kit.target.depthTexture?.dispose()
    kit.target.dispose()
    kit.material.dispose()
  }, [kit])

  useEffect(() => {
    const u = kit.material.uniforms
    u.uFloor.value.set(look.floor)
    u.uStrength.value = strength ?? (look.dark ? 0.55 : 0.24)
    u.uBlur.value = blur
    u.uDark.value = look.dark ? 1 : 0
  }, [kit, look, strength, blur])

  useFrame((state) => {
    const floor = mesh.current
    const { gl, scene, camera, size: view, viewport } = state
    const u = kit.material.uniforms
    u.uEnergy.value = energy.all
    if (!floor || gl.xr.isPresenting || view.width <= 0 || view.height <= 0) return
    const w = Math.max(2, Math.min(1024, Math.round(view.width * viewport.dpr * 0.4)))
    const h = Math.max(2, Math.round((w * view.height) / view.width))
    if (kit.target.width !== w || kit.target.height !== h) kit.target.setSize(w, h)
    u.uTexel.value.set(1 / w, 1 / h)
    u.uMaxLod.value = Math.log2(Math.max(w, h)) - 1

    camera.updateMatrixWorld()
    kit.eye.setFromMatrixPosition(camera.matrixWorld)
    if (kit.eye.y <= 0.02 || energy.all <= 0.001) {
      u.uOn.value = 0
      return
    }
    const virt: Camera = (camera as OrthographicCamera).isOrthographicCamera ? kit.ortho : kit.persp
    kit.rot.extractRotation(camera.matrixWorld)
    kit.ahead.set(0, 0, -1).applyMatrix4(kit.rot).add(kit.eye)
    kit.up.set(0, 1, 0).applyMatrix4(kit.rot)
    virt.position.set(kit.eye.x, -kit.eye.y, kit.eye.z)
    virt.up.set(kit.up.x, -kit.up.y, kit.up.z)
    virt.lookAt(kit.ahead.x, -kit.ahead.y, kit.ahead.z)
    virt.layers.mask = camera.layers.mask & ~2
    virt.updateMatrixWorld()
    virt.projectionMatrix.copy(camera.projectionMatrix)

    // Oblique near plane on the floor, so nothing under it reaches the mirror and every material clips alike.
    const e = virt.projectionMatrix.elements
    kit.clip.copy(kit.plane).applyMatrix4(virt.matrixWorldInverse)
    kit.c.set(kit.clip.normal.x, kit.clip.normal.y, kit.clip.normal.z, kit.clip.constant)
    kit.m4.set(e[3], e[7], e[11], e[15])
    kit.inv.copy(virt.projectionMatrix).invert()
    kit.q.set(Math.sign(kit.c.x), Math.sign(kit.c.y), 1, 1).applyMatrix4(kit.inv)
    const s = (2 * kit.m4.dot(kit.q)) / kit.c.dot(kit.q)
    e[2] = kit.c.x * s - kit.m4.x
    e[6] = kit.c.y * s - kit.m4.y
    e[10] = kit.c.z * s - kit.m4.z
    e[14] = kit.c.w * s - kit.m4.w
    virt.projectionMatrixInverse.copy(virt.projectionMatrix).invert()

    u.uTexMatrix.value.copy(BIAS).multiply(virt.projectionMatrix).multiply(virt.matrixWorldInverse)
    u.uVirtView.value.copy(virt.matrixWorldInverse)
    u.uInvProj.value.copy(virt.projectionMatrixInverse)

    const prevTarget = gl.getRenderTarget()
    const prevShadow = gl.shadowMap.autoUpdate
    const prevBackground = scene.background
    const prevAlpha = gl.getClearAlpha()
    gl.getClearColor(kit.clear)
    floor.visible = false
    scene.background = null
    gl.shadowMap.autoUpdate = false
    gl.setClearColor(0x000000, 0)
    try {
      gl.setRenderTarget(kit.target)
      gl.clear()
      gl.render(scene, virt)
    } finally {
      gl.setRenderTarget(prevTarget)
      gl.setClearColor(kit.clear, prevAlpha)
      gl.shadowMap.autoUpdate = prevShadow
      scene.background = prevBackground
      floor.visible = true
    }
    u.uOn.value = 1
  }, -1)

  return (
    <mesh ref={mesh} rotation={[-Math.PI / 2, 0, 0]} material={kit.material} renderOrder={-1}>
      <planeGeometry args={[size, size]} />
    </mesh>
  )
}

const GRID = { x0: -14, x1: 18, z0: -8, z1: 9 }
const LANE = { x0: -12.2, x1: 15.8, z0: -4.8, z1: 5.4 }

function dashed(out: number[], ax: number, az: number, bx: number, bz: number, y: number, dash: number, gap: number) {
  const len = Math.hypot(bx - ax, bz - az)
  const dx = (bx - ax) / len, dz = (bz - az) / len
  for (let t = 0; t < len; t += dash + gap) {
    const t1 = Math.min(len, t + dash)
    out.push(ax + dx * t, y, az + dz * t, ax + dx * t1, y, az + dz * t1)
  }
}

export function FloorGrid({ look }: { look: Look }) {
  const kit = useMemo(() => {
    const grid: number[] = []
    const y = 0.004
    for (let x = GRID.x0; x <= GRID.x1; x++) grid.push(x, y, GRID.z0, x, y, GRID.z1)
    for (let z = GRID.z0; z <= GRID.z1; z++) grid.push(GRID.x0, y, z, GRID.x1, y, z)
    const lane: number[] = []
    const ly = 0.006
    const { x0, x1, z0, z1 } = LANE
    lane.push(x0, ly, z0, x1, ly, z0, x1, ly, z0, x1, ly, z1, x1, ly, z1, x0, ly, z1, x0, ly, z1, x0, ly, z0)
    const o = 0.55
    dashed(lane, x0 - o, z0 - o, x1 + o, z0 - o, ly, 0.6, 0.4)
    dashed(lane, x1 + o, z0 - o, x1 + o, z1 + o, ly, 0.6, 0.4)
    dashed(lane, x1 + o, z1 + o, x0 - o, z1 + o, ly, 0.6, 0.4)
    dashed(lane, x0 - o, z1 + o, x0 - o, z0 - o, ly, 0.6, 0.4)
    const gridGeometry = new BufferGeometry()
    gridGeometry.setAttribute('position', new Float32BufferAttribute(grid, 3))
    const laneGeometry = new BufferGeometry()
    laneGeometry.setAttribute('position', new Float32BufferAttribute(lane, 3))
    return {
      gridGeometry,
      laneGeometry,
      gridMaterial: new LineBasicMaterial({ transparent: true, opacity: 0.35, depthWrite: false }),
      laneMaterial: new LineBasicMaterial({ transparent: true, depthWrite: false }),
    }
  }, [])

  useEffect(() => {
    kit.gridMaterial.color.set(look.floorEdge)
    kit.laneMaterial.color.set(look.lamp).lerp(new Color(look.floorEdge), 0.35)
    kit.laneMaterial.opacity = look.dark ? 0.85 : 0.7
  }, [kit, look])

  useEffect(() => () => {
    kit.gridGeometry.dispose()
    kit.laneGeometry.dispose()
    kit.gridMaterial.dispose()
    kit.laneMaterial.dispose()
  }, [kit])

  return (
    <group>
      <lineSegments geometry={kit.gridGeometry} material={kit.gridMaterial} />
      <lineSegments geometry={kit.laneGeometry} material={kit.laneMaterial} />
    </group>
  )
}
