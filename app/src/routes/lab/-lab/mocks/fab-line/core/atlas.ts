import { CanvasTexture, DataTexture, LinearFilter, LinearMipmapLinearFilter, RGBAFormat, SRGBColorSpace, UnsignedByteType, Vector2 } from 'three'
import type { WebGLRenderer } from 'three'

/**
 * Which atlas cell holds which print, least recently used first. A key in `pinned` is on screen, so its cell is
 * never handed to another key; `take` returns null only when every cell is pinned.
 */
export class CellLru {
  private cells = new Map<string, number>()
  private free: number[]
  constructor(readonly capacity: number) {
    this.free = Array.from({ length: capacity }, (_, i) => capacity - 1 - i)
  }

  take(key: string, pinned: ReadonlySet<string>): { cell: number; fresh: boolean } | null {
    const hit = this.cells.get(key)
    if (hit !== undefined) {
      this.cells.delete(key)
      this.cells.set(key, hit)
      return { cell: hit, fresh: false }
    }
    let cell = this.free.pop()
    if (cell === undefined) {
      for (const [old, at] of this.cells) {
        if (pinned.has(old)) continue
        this.cells.delete(old)
        cell = at
        break
      }
    }
    if (cell === undefined) return null
    this.cells.set(key, cell)
    return { cell, fresh: true }
  }

  has(key: string) {
    return this.cells.has(key)
  }
}

/** Cell size in texels and the atlas width; prints keep their lid's aspect and are squeezed into the cell. */
export const CELL = { w: 256, h: 128, cols: 8 }

/** Rows for `cells` prints: a power of two, so the atlas has a full mip chain, capped at `maxRows`. */
export const rowsFor = (cells: number, maxRows: number) => Math.min(maxRows, 2 ** Math.ceil(Math.log2(Math.max(1, Math.ceil(cells / CELL.cols)))))

/** Texture rect of `cell` in an atlas of `rows` rows, inset half a texel against bleed: `[u0, v0, u1, v1]`, v0 at the print's top. */
export function cellRect(cell: number, rows: number): [number, number, number, number] {
  const W = CELL.w * CELL.cols, H = CELL.h * rows
  const x = (cell % CELL.cols) * CELL.w, y = Math.floor(cell / CELL.cols) * CELL.h
  return [(x + 0.5) / W, (y + 0.5) / H, (x + CELL.w - 0.5) / W, (y + CELL.h - 0.5) / H]
}

/** Paints one print into the cell's canvas: logical size `w` × `h` (the lid's aspect), already scaled to the cell. */
export type Painter = (ctx: CanvasRenderingContext2D, w: number, h: number) => void
type Job = { key: string; w: number; h: number; paint: Painter }

/**
 * Lid prints for one batch in one GPU texture. A print is painted once into a scratch canvas and copied into its
 * cell with a sub-image upload, a few per frame, so a page of new parts never uploads a whole texture at once.
 */
export class MarkingAtlas {
  readonly rows: number
  readonly texture: DataTexture
  private lru: CellLru
  private jobs = new Map<number, Job>()
  private painted = new Map<number, string>()
  private scratch: CanvasTexture
  private ctx: CanvasRenderingContext2D
  private at = new Vector2()

  constructor(cells: number, maxRows: number) {
    this.rows = rowsFor(cells, maxRows)
    this.lru = new CellLru(this.rows * CELL.cols)
    const texture = new DataTexture(null, CELL.w * CELL.cols, CELL.h * this.rows, RGBAFormat, UnsignedByteType)
    texture.source.dataReady = false
    texture.colorSpace = SRGBColorSpace
    texture.generateMipmaps = true
    texture.minFilter = LinearMipmapLinearFilter
    texture.magFilter = LinearFilter
    texture.anisotropy = 8
    texture.needsUpdate = true
    this.texture = texture
    const canvas = document.createElement('canvas')
    canvas.width = CELL.w
    canvas.height = CELL.h
    this.ctx = canvas.getContext('2d')!
    this.scratch = new CanvasTexture(canvas)
  }

  get capacity() {
    return this.lru.capacity
  }

  /** The cell for a print, queued for painting when it is new. Null when every cell holds a print on screen. */
  claim(key: string, w: number, h: number, paint: Painter, pinned: ReadonlySet<string>) {
    const got = this.lru.take(key, pinned)
    if (!got) return null
    if (got.fresh) {
      this.painted.delete(got.cell)
      this.jobs.set(got.cell, { key, w, h, paint })
    }
    return got.cell
  }

  /** True while prints wait to be painted. */
  get pending() {
    return this.jobs.size > 0
  }

  ready(cell: number) {
    return this.painted.has(cell)
  }

  /** Paints queued prints until `budget` ms have passed, at least one. Returns how many it painted. */
  flush(gl: WebGLRenderer, budget: number) {
    if (!this.jobs.size) return 0
    // Allocate the full mip chain before the first copy; a copy that allocated it would size it from its own flag.
    gl.initTexture(this.texture)
    const start = performance.now()
    let n = 0
    for (const [cell, job] of this.jobs) {
      this.jobs.delete(cell)
      const ctx = this.ctx
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.clearRect(0, 0, CELL.w, CELL.h)
      ctx.setTransform(CELL.w / job.w, 0, 0, CELL.h / job.h, 0, 0)
      job.paint(ctx, job.w, job.h)
      this.at.set((cell % CELL.cols) * CELL.w, Math.floor(cell / CELL.cols) * CELL.h)
      const last = !this.jobs.size || performance.now() - start >= budget
      // Mips are rebuilt once per flush, after its last copy, rather than after every cell.
      this.texture.generateMipmaps = last
      gl.copyTextureToTexture(this.scratch, this.texture, null, this.at)
      this.texture.generateMipmaps = true
      this.painted.set(cell, job.key)
      n++
      if (last) break
    }
    return n
  }

  dispose() {
    this.texture.dispose()
    this.scratch.dispose()
  }
}
