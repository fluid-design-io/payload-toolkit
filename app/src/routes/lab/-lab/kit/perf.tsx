/**
 * Frame budget helpers. `FrameGovernor` switches the Canvas to demand
 * rendering and asks for frames at full rate while anything keeps animating
 * (`keepAnimating` in `./busy`) or the pointer is active, else at 20 Hz (4 Hz
 * under reduced motion); it also adapts the pixel ratio from the frame times of
 * hot frames only. `PerfProbe` writes draw calls, triangles, frame count, fps
 * and dpr onto the canvas element's dataset for harnesses.
 */
import { addEffect, useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'

import { animationWanted, frameRendered, keepAnimating } from './busy'
import { coarsePointer, prefersReducedMotion } from './env'

/** Pixel ratio bounds for a Canvas: phones cap at 1.5 for battery, desktops at 2. */
export const dprRange = (): [number, number] => [1, coarsePointer() ? 1.5 : 2]

/** Seconds of full rate after input, and after mounting. */
const WAKE = 0.7
const BOOT = 3

export function FrameGovernor() {
  const { invalidate, setFrameloop, setDpr, gl } = useThree()
  const hot = useRef(false)
  const stats = useRef({ n: 0, t: 0, cooldown: 0, dpr: 0, range: dprRange() })
  useEffect(() => {
    const [min, max] = stats.current.range
    const start = Math.min(max, Math.max(min, devicePixelRatio || 1))
    stats.current.dpr = start
    setDpr(start)
    setFrameloop('demand')
    const rate = prefersReducedMotion() ? 4 : 20
    // Display frames arrive a hair early or late, so an exact `>= 1000 / rate` check skips one now and then; half a
    // 120 Hz frame of slack lands every idle render on the same frame count (every 3rd at 60 Hz, every 6th at 120 Hz).
    const due = 1000 / rate - 4
    let raf = 0
    let last = 0
    keepAnimating(BOOT)
    const wake = () => keepAnimating(WAKE)
    // A global effect runs before every root's frame callbacks, whatever order they mounted in.
    const offRendered = addEffect(frameRendered)
    const events = ['pointermove', 'pointerdown', 'pointerup', 'wheel', 'keydown', 'touchstart', 'touchmove', 'focusin'] as const
    for (const type of events) window.addEventListener(type, wake, { capture: true, passive: true })
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick)
      const on = animationWanted()
      hot.current = on
      if (on || now - last >= due) {
        last = now
        invalidate()
      }
    }
    raf = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(raf)
      offRendered()
      for (const type of events) window.removeEventListener(type, wake, { capture: true })
      setFrameloop('always')
    }
  }, [invalidate, setFrameloop, setDpr, gl])
  useFrame((_, dt) => {
    const s = stats.current
    s.cooldown = Math.max(0, s.cooldown - dt)
    // The tick's invalidate starts R3F's loop a frame late and the loop stops after one render, so on its own a hot
    // scene renders every other frame; asking again from inside the loop keeps it rendering every frame.
    if (hot.current) invalidate()
    if (!hot.current || dt > 0.25) return
    s.n++
    s.t += dt
    if (s.t < 1) return
    const fps = s.n / s.t
    s.n = 0
    s.t = 0
    if (s.cooldown > 0) return
    const [min, max] = s.range
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
