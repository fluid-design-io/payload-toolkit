/**
 * Frame budget helpers. `FrameGovernor` switches the Canvas to demand
 * rendering and asks for frames at full rate while `busy()` or the pointer is
 * active, else at `idleHz`; it also adapts the pixel ratio from the frame
 * times of hot frames only. `PerfProbe` writes draw calls, triangles, frame
 * count, fps and dpr onto the canvas element's dataset for harnesses.
 */
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import { Texture } from 'three'
import type { Material, Mesh, Object3D } from 'three'

import { prefersReducedMotion } from './a11y'

const coarse = () => typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches
/** Pixel ratio bounds for a Canvas: phones cap at 1.5 for battery, desktops at 2. */
export const dprRange = (): [number, number] => [1, coarse() ? 1.5 : 2]

const WAKE_MS = 700

/** `idleHz` 0 renders nothing at all while idle; the default is 30, or 4 under reduced motion. */
export function FrameGovernor({ busy, idleHz, dpr = dprRange() }: { busy: () => boolean; idleHz?: number; dpr?: [number, number] }) {
  const { invalidate, setFrameloop, setDpr, gl } = useThree()
  const hot = useRef(false)
  const stats = useRef({ n: 0, t: 0, cooldown: 0, dpr: 0 })
  useEffect(() => {
    const [min, max] = dpr
    const start = Math.min(max, Math.max(min, devicePixelRatio || 1))
    stats.current.dpr = start
    setDpr(start)
    setFrameloop('demand')
    const rate = idleHz ?? (prefersReducedMotion() ? 4 : 30)
    let raf = 0
    let last = 0
    let wakeUntil = performance.now() + 3000
    const wake = () => {
      wakeUntil = performance.now() + WAKE_MS
    }
    const events = ['pointermove', 'pointerdown', 'pointerup', 'wheel', 'keydown', 'touchstart', 'touchmove', 'focusin'] as const
    for (const type of events) window.addEventListener(type, wake, { capture: true, passive: true })
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick)
      const on = now < wakeUntil || busy()
      hot.current = on
      if (on || (rate > 0 && now - last >= 1000 / rate)) {
        last = now
        invalidate()
      }
    }
    raf = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(raf)
      for (const type of events) window.removeEventListener(type, wake, { capture: true })
      setFrameloop('always')
    }
  }, [busy, idleHz, dpr[0], dpr[1], invalidate, setFrameloop, setDpr, gl])
  useFrame((_, dt) => {
    const s = stats.current
    s.cooldown = Math.max(0, s.cooldown - dt)
    if (!hot.current || dt > 0.25) return
    s.n++
    s.t += dt
    if (s.t < 1) return
    const fps = s.n / s.t
    s.n = 0
    s.t = 0
    if (s.cooldown > 0) return
    const [min, max] = dpr
    let next = s.dpr
    if (fps < 40) next = Math.max(min, s.dpr * 0.85)
    else if (fps > 56) next = Math.min(max, s.dpr * 1.1)
    next = Math.round(next * 20) / 20
    if (next === s.dpr) return
    s.dpr = next
    s.cooldown = 2
    setDpr(next)
  })
  return null
}

export function PerfProbe() {
  const { gl } = useThree()
  const acc = useRef({ frames: 0, t: 0 })
  useFrame((_, dt) => {
    const a = acc.current
    a.frames++
    a.t += dt
    if (a.t < 0.5) return
    const d = gl.domElement.dataset
    d.calls = String(gl.info.render.calls)
    d.tris = String(gl.info.render.triangles)
    d.frame = String(gl.info.render.frame)
    d.fps = String(Math.round(a.frames / a.t))
    d.dpr = gl.getPixelRatio().toFixed(2)
    a.frames = 0
    a.t = 0
  })
  return null
}

/** Frees every geometry, material and material texture under `root`. */
export function disposeTree(root: Object3D) {
  root.traverse((o) => {
    const m = o as Partial<Mesh>
    m.geometry?.dispose()
    const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : []
    for (const mat of mats as Material[]) {
      for (const v of Object.values(mat)) if (v instanceof Texture) v.dispose()
      mat.dispose()
    }
  })
}
