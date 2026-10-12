import { BufferGeometry, Float32BufferAttribute } from 'three'

import { MONO, textTexture } from '../../../core/three'

/** A rectangle of the board-local floor plan that a canvas covers. */
export type Frame = { x0: number; x1: number; z0: number; z1: number }
export type Painter = ReturnType<typeof painter>

/** Drawing helpers in board-local units on a canvas that covers `f`. */
export function painter(ctx: CanvasRenderingContext2D, f: Frame, width: number) {
  const PX = width / (f.x1 - f.x0)
  const px = (x: number, z: number) => [(x - f.x0) * PX, (z - f.z0) * PX] as const
  return {
    ctx,
    PX,
    px,
    text(s: string, x: number, z: number, size: number, weight = 500, font = MONO, align: CanvasTextAlign = 'left') {
      const [a, b] = px(x, z)
      ctx.font = `${weight} ${size * PX}px ${font}`
      ctx.textAlign = align
      ctx.fillText(s, a, b)
    },
    box(x: number, z: number, w: number, d: number, r = 0.08) {
      const [a, b] = px(x, z)
      ctx.beginPath()
      ctx.roundRect(a, b, w * PX, d * PX, r * PX)
      ctx.stroke()
    },
    bar(x: number, z: number, w: number, h = 0.07) {
      const [a, b] = px(x, z)
      ctx.fillRect(a, b, w * PX, h * PX)
    },
    ring(x: number, z: number, r: number) {
      const [a, b] = px(x, z)
      ctx.beginPath()
      ctx.arc(a, b, r * PX, 0, Math.PI * 2)
      ctx.stroke()
    },
  }
}

/** A canvas texture covering `f`, `width` pixels wide. */
export function frameTexture(f: Frame, width: number, draw: (p: Painter) => void) {
  const height = Math.round((width * (f.z1 - f.z0)) / (f.x1 - f.x0))
  return textTexture(width, height, (ctx) => {
    ctx.clearRect(0, 0, width, height)
    draw(painter(ctx, f, width))
  })
}

/** A faint wireframe of what page band `b` usually holds, drawn from (X, z) over about 9.4 units. */
export function pageHints(p: Painter, b: number, X: number, z: number) {
  const { box, bar, ring } = p
  if (b === 0) {
    bar(X, z + 0.05, 3.4, 0.16); bar(X, z + 0.32, 2.6, 0.16); bar(X, z + 0.6, 2.2); box(X, z + 0.78, 0.9, 0.22, 0.11); box(X + 1.05, z + 0.78, 0.9, 0.22, 0.11); box(X + 4.6, z, 4.6, 1.0)
  } else if (b === 1) for (let i = 0; i < 7; i++) box(X + i * 1.32, z + 0.3, 1.0, 0.4)
  else if (b === 2) for (let i = 0; i < 3; i++) {
    ring(X + i * 3.1 + 0.2, z + 0.2, 0.16)
    bar(X + i * 3.1, z + 0.5, 2.2, 0.09); bar(X + i * 3.1, z + 0.68, 2.6); bar(X + i * 3.1, z + 0.82, 2.0)
  } else if (b === 3) {
    for (let i = 0; i < 6; i++) bar(X, z + i * 0.16, i % 3 === 2 ? 2.8 : 4.0)
    box(X + 4.7, z, 4.5, 1.0)
  } else if (b === 4) for (let i = 0; i < 3; i++) {
    box(X + i * 3.1, z, 2.8, 1.0)
    bar(X + i * 3.1 + 0.2, z + 0.25, 2.2); bar(X + i * 3.1 + 0.2, z + 0.42, 1.8)
    ring(X + i * 3.1 + 0.4, z + 0.75, 0.12)
  } else if (b === 5) for (let i = 0; i < 3; i++) {
    box(X + i * 3.1, z - 0.05, 2.8, 1.08)
    bar(X + i * 3.1 + 0.2, z + 0.15, 1.0, 0.16); for (let k = 0; k < 3; k++) bar(X + i * 3.1 + 0.2, z + 0.45 + k * 0.14, 2.0)
  } else if (b === 6) {
    bar(X + 2.4, z + 0.12, 4.4, 0.16); bar(X + 3.0, z + 0.42, 3.2); box(X + 3.3, z + 0.65, 1.1, 0.26, 0.13); box(X + 4.6, z + 0.65, 1.1, 0.26, 0.13)
  } else for (let i = 0; i < 4; i++) {
    bar(X + i * 2.35, z + 0.05, 1.0, 0.1); for (let k = 0; k < 4; k++) bar(X + i * 2.35, z + 0.3 + k * 0.17, 1.5)
  }
}

/** A hatched rectangle as line-segment pairs at height `y`: an existing app's owned area. */
export function hatchSegs(h: { x0: number; x1: number; z0: number; z1: number }, y: number) {
  const l = [h.x0, y, h.z0, h.x1, y, h.z0, h.x1, y, h.z0, h.x1, y, h.z1, h.x1, y, h.z1, h.x0, y, h.z1, h.x0, y, h.z1, h.x0, y, h.z0]
  for (let x = h.x0 - (h.z1 - h.z0); x < h.x1; x += 0.22) {
    const a = Math.max(x, h.x0), za = h.z1 - (a - x)
    const b = Math.min(x + (h.z1 - h.z0), h.x1), zb = h.z1 - (b - x)
    if (b > a) l.push(a, y, za, b, y, zb)
  }
  return l
}

/** Flat quads at their own heights, each sampling the part of one atlas texture (covering `f`) that lies under it. */
export function atlasQuads(f: Frame, quads: readonly (Frame & { y: number })[]) {
  const pos: number[] = [], uv: number[] = [], idx: number[] = []
  const u = (x: number) => (x - f.x0) / (f.x1 - f.x0)
  const v = (z: number) => 1 - (z - f.z0) / (f.z1 - f.z0)
  for (const q of quads) {
    const n = pos.length / 3
    for (const [x, z] of [[q.x0, q.z0], [q.x1, q.z0], [q.x1, q.z1], [q.x0, q.z1]]) {
      pos.push(x, q.y, z)
      uv.push(u(x), v(z))
    }
    idx.push(n, n + 2, n + 1, n, n + 3, n + 2)
  }
  const g = new BufferGeometry()
  g.setAttribute('position', new Float32BufferAttribute(pos, 3))
  g.setAttribute('uv', new Float32BufferAttribute(uv, 2))
  g.setIndex(idx)
  return g
}
