import type { Tokens } from '../../core/contract'
import { Body } from '../../core/scene'
import { cyl, lineMat, ring, segs, useDisposable } from '../../core/three'
import { contrastOn } from '../../fx/heat'
import { TOP } from './pad.data'
import type { PadSpot } from './pad.data'

type Handlers = Record<string, unknown>

/** The landing pad (drone) or the dock plate (hexapod), with the brand's mark painted on it. */
export function Pad({ pad, c, kind, handlers }: { pad: PadSpot; c: Tokens; kind: 'drone' | 'hexapod'; handlers: Handlers }) {
  const hex = kind === 'hexapod'
  const plate = () => {
    const lines: number[] = []
    if (hex) {
      for (const r of [0.98, 0.78]) {
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2 + Math.PI / 6, b = ((i + 1) / 6) * Math.PI * 2 + Math.PI / 6
          lines.push(pad.x + Math.cos(a) * r, TOP + 0.004, pad.z + Math.sin(a) * r, pad.x + Math.cos(b) * r, TOP + 0.004, pad.z + Math.sin(b) * r)
        }
      }
    } else {
      ring(pad.x, TOP + 0.004, pad.z, 0.74, 40, lines)
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2
        lines.push(pad.x + Math.cos(a) * 0.8, TOP + 0.004, pad.z + Math.sin(a) * 0.8, pad.x + Math.cos(a) * 0.9, TOP + 0.004, pad.z + Math.sin(a) * 0.9)
      }
    }
    return { pieces: [{ geo: cyl(1.02, 1.06, TOP, hex ? 6 : 40), at: [pad.x, TOP / 2, pad.z] as [number, number, number], rot: [0, hex ? Math.PI / 6 : 0, 0] as [number, number, number] }], lines }
  }
  const mark = useDisposable(() => {
    const lines: number[] = []
    if (hex) {
      const y = TOP + 0.006, s = 0.26
      lines.push(pad.x - s * 1.2, y, pad.z - s, pad.x - s * 0.2, y, pad.z, pad.x - s * 0.2, y, pad.z, pad.x - s * 1.2, y, pad.z + s)
      lines.push(pad.x + s * 0.1, y, pad.z + s, pad.x + s * 1.2, y, pad.z + s)
    } else {
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 + Math.PI / 8
        const r = i % 2 ? 0.34 : 0.48
        lines.push(pad.x + Math.cos(a) * 0.08, TOP + 0.006, pad.z + Math.sin(a) * 0.08, pad.x + Math.cos(a) * r, TOP + 0.006, pad.z + Math.sin(a) * r)
      }
    }
    return segs(lines)
  }, [pad.x, pad.z, hex])
  return (
    <group {...handlers}>
      <Body id={`pad-${kind}-${pad.x}-${pad.z}`} {...plate()} fill={c.surface} edge={c.edge} c={c} />
      <lineSegments geometry={mark} material={lineMat(hex ? contrastOn(c.surface, c.codex, c.codexInk) : c.claude)} />
    </group>
  )
}
