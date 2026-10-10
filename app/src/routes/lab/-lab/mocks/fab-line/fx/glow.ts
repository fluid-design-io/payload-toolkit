import {
  AdditiveBlending, Color, InstancedBufferAttribute, InstancedBufferGeometry, Float32BufferAttribute, Mesh, NormalBlending, ShaderMaterial,
} from 'three'

const VERT = /* glsl */ `
attribute vec3 iPos;
attribute vec4 iColor;
attribute vec2 iSize;
varying vec2 vUv;
varying vec4 vColor;
void main() {
  vUv = position.xy;
  vColor = iColor;
  float s = iSize.x;
  vec4 mv;
  if (iSize.y > 0.5) {
    mv = modelViewMatrix * vec4(iPos + vec3(position.x * s, 0.0, position.y * s), 1.0);
  } else {
    mv = modelViewMatrix * vec4(iPos, 1.0);
    mv.xy += position.xy * s * length(modelMatrix[0].xyz);
  }
  gl_Position = projectionMatrix * mv;
}
`
const FRAG = /* glsl */ `
uniform float uCore;
uniform float uGain;
varying vec2 vUv;
varying vec4 vColor;
void main() {
  float d = length(vUv);
  if (d >= 1.0) discard;
  float falloff = (1.0 - d) * (1.0 - d);
  float core = smoothstep(0.32, 0.0, d) * uCore;
  gl_FragColor = vec4(mix(vColor.rgb, vec3(1.0), core * 0.6) * mix(1.0, uGain, core), vColor.a * min(1.0, falloff + core));
  #include <colorspace_fragment>
}
`

/**
 * HDR gain on every glow's hot core. 1 without a composer (the canvas clamps
 * anyway); the Bloom fx raises it so only glow cores cross its threshold.
 */
export const glowGain = { value: 1 }

/**
 * Soft round glows drawn as one instanced draw: billboards for an arc or a
 * laser hit, flat discs on the board for a heat tint, and smoke puffs. Fill
 * it each frame between `begin()` and `end()`. Positions are in the
 * parent's frame; sizes are radii in the same units.
 */
export class Glows {
  readonly object: Mesh
  private readonly pos: Float32Array
  private readonly color: Float32Array
  private readonly size: Float32Array
  private n = 0
  private readonly geo: InstancedBufferGeometry
  private readonly mat: ShaderMaterial

  constructor(readonly cap: number, core = 1) {
    const geo = new InstancedBufferGeometry()
    geo.setAttribute('position', new Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, -1, 0, 1, 1, 0, -1, 1, 0], 3))
    this.pos = new Float32Array(cap * 3)
    this.color = new Float32Array(cap * 4)
    this.size = new Float32Array(cap * 2)
    geo.setAttribute('iPos', new InstancedBufferAttribute(this.pos, 3))
    geo.setAttribute('iColor', new InstancedBufferAttribute(this.color, 4))
    geo.setAttribute('iSize', new InstancedBufferAttribute(this.size, 2))
    geo.instanceCount = 0
    this.geo = geo
    this.mat = new ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms: { uCore: { value: core }, uGain: glowGain }, transparent: true, depthWrite: false, toneMapped: false })
    this.object = new Mesh(geo, this.mat)
    this.object.frustumCulled = false
    this.object.renderOrder = 4
  }

  /** Additive light on dark grounds; on light grounds a glow has to paint over the paper instead. */
  setGlow(additive: boolean) {
    const b = additive ? AdditiveBlending : NormalBlending
    if (this.mat.blending !== b) { this.mat.blending = b; this.mat.needsUpdate = true }
  }

  get count() { return this.n }

  begin() { this.n = 0 }

  add(x: number, y: number, z: number, radius: number, color: Color, alpha: number, flat = false) {
    if (this.n >= this.cap || alpha <= 0.002 || radius <= 0) return
    const i = this.n++
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z
    this.color[i * 4] = color.r; this.color[i * 4 + 1] = color.g; this.color[i * 4 + 2] = color.b; this.color[i * 4 + 3] = Math.min(1, alpha)
    this.size[i * 2] = radius; this.size[i * 2 + 1] = flat ? 1 : 0
  }

  end() {
    this.geo.instanceCount = this.n
    this.object.visible = this.n > 0
    if (!this.n) return
    for (const k of ['iPos', 'iColor', 'iSize']) {
      const a = this.geo.getAttribute(k) as InstancedBufferAttribute
      a.clearUpdateRanges()
      a.addUpdateRange(0, this.n * a.itemSize)
      a.needsUpdate = true
    }
  }

  dispose() {
    this.geo.dispose()
    this.mat.dispose()
  }
}
