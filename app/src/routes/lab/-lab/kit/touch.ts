/**
 * Pointer gestures for a scene container, mouse and touch alike: a tap stays
 * a tap under a movement threshold, one finger or the left button orbits, two
 * fingers pinch and pan, the wheel zooms, a long press asks for details and a
 * double tap or double click resets. `guard.moved` tells mesh click handlers
 * to ignore the click that ends a drag. A trackpad pinch arrives as a
 * ctrl-wheel (Chrome, Firefox) or as Safari's gesture events; both default to
 * zooming the page, so the container cancels them natively (React's wheel
 * listener is passive) and only the scene zooms.
 */
import { useLayoutEffect, useRef, useState } from 'react'
import type { CSSProperties, PointerEvent as ReactPointerEvent, WheelEvent as ReactWheelEvent } from 'react'

export type Guard = { moved: boolean }
export type Gestures = {
  /** One finger or a mouse drag; `e` tells the buttons and modifiers apart. */
  onOrbit?: (dx: number, dy: number, e: PointerEvent) => void
  onPan?: (dx: number, dy: number) => void
  /** `factor` > 1 zooms in. `x`, `y` are the gesture centre in client pixels. */
  onZoom?: (factor: number, x: number, y: number) => void
  onTap?: (x: number, y: number, e: PointerEvent) => void
  onLongPress?: (x: number, y: number, e: PointerEvent) => void
  onReset?: () => void
  /** Any press or wheel, before the gesture is classified. */
  onInteract?: () => void
}

/** Event handlers flag the guard; nothing reads it during render. */
const flag = (guard: Guard, moved: boolean) => {
  guard.moved = moved
}

const LONG_PRESS_MS = 480
const DOUBLE_TAP_MS = 320

type P = { x: number; y: number }

export function useSceneGestures(g: Gestures) {
  const [guard] = useState<Guard>(() => ({ moved: false }))
  const gestures = useRef(g)
  useLayoutEffect(() => {
    gestures.current = g
  })
  const pointer = useRef({
    pointers: new Map<number, P>(),
    start: { x: 0, y: 0 },
    moved: false,
    timer: 0,
    pinch: 0,
    mid: { x: 0, y: 0 },
    lastTap: { x: 0, y: 0, t: -1e9 },
    /** Safari's pinch scale so far, 0 outside a gesture. */
    scale: 0,
  })
  const dist = () => {
    const [a, b] = [...pointer.current.pointers.values()]
    return Math.hypot(a.x - b.x, a.y - b.y)
  }
  const mid = () => {
    const [a, b] = [...pointer.current.pointers.values()]
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
  }
  const cancelPress = () => {
    const state = pointer.current
    if (state.timer) clearTimeout(state.timer)
    state.timer = 0
  }
  const onPointerDown = (e: ReactPointerEvent) => {
    const state = pointer.current
    gestures.current.onInteract?.()
    state.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (state.pointers.size === 1) {
      state.start = { x: e.clientX, y: e.clientY }
      state.moved = false
      flag(guard, false)
      cancelPress()
      if (gestures.current.onLongPress) {
        const native = e.nativeEvent
        state.timer = window.setTimeout(() => {
          state.timer = 0
          if (state.moved || state.pointers.size !== 1) return
          flag(guard, true)
          gestures.current.onLongPress?.(native.clientX, native.clientY, native)
        }, LONG_PRESS_MS)
      }
    } else {
      cancelPress()
      state.moved = true
      flag(guard, true)
      if (state.pointers.size === 2) {
        state.pinch = dist()
        state.mid = mid()
      }
    }
  }
  const onPointerMove = (e: ReactPointerEvent) => {
    const state = pointer.current
    const p = state.pointers.get(e.pointerId)
    if (!p) return
    const prev = { ...p }
    p.x = e.clientX
    p.y = e.clientY
    if (state.pointers.size === 2) {
      const d = dist()
      const m = mid()
      if (state.pinch > 0 && d > 0) gestures.current.onZoom?.(d / state.pinch, m.x, m.y)
      gestures.current.onPan?.(m.x - state.mid.x, m.y - state.mid.y)
      state.pinch = d
      state.mid = m
      return
    }
    if (state.pointers.size !== 1) return
    if (e.pointerType === 'mouse' && e.buttons === 0) return
    const threshold = e.pointerType === 'mouse' ? 4 : 10
    if (!state.moved && Math.hypot(e.clientX - state.start.x, e.clientY - state.start.y) < threshold) return
    if (!state.moved) {
      state.moved = true
      flag(guard, true)
      cancelPress()
    }
    const dx = e.clientX - prev.x, dy = e.clientY - prev.y
    const pan = e.pointerType === 'mouse' && (e.buttons === 4 || e.shiftKey)
    if (pan) gestures.current.onPan?.(dx, dy)
    else gestures.current.onOrbit?.(dx, dy, e.nativeEvent)
  }
  const onPointerUp = (e: ReactPointerEvent) => {
    const state = pointer.current
    const had = state.pointers.delete(e.pointerId)
    if (!had) return
    const press = state.timer !== 0
    cancelPress()
    if (state.pointers.size || state.moved || !press) return
    if (e.pointerType !== 'mouse') {
      const t = e.timeStamp
      const l = state.lastTap
      if (t - l.t < DOUBLE_TAP_MS && Math.hypot(e.clientX - l.x, e.clientY - l.y) < 28) {
        state.lastTap.t = -1e9
        gestures.current.onReset?.()
        return
      }
      state.lastTap = { x: e.clientX, y: e.clientY, t }
    }
    gestures.current.onTap?.(e.clientX, e.clientY, e.nativeEvent)
  }
  const onPointerCancel = (e: ReactPointerEvent) => {
    const state = pointer.current
    state.pointers.delete(e.pointerId)
    cancelPress()
  }
  const onWheel = (e: ReactWheelEvent) => {
    if (e.ctrlKey && pointer.current.scale) return
    gestures.current.onInteract?.()
    gestures.current.onZoom?.(Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0012)), e.clientX, e.clientY)
  }
  const onDoubleClick = () => gestures.current.onReset?.()
  const ref = (el: HTMLElement | null) => {
    if (!el) return
    const state = pointer.current
    const cancel = (e: Event) => e.preventDefault()
    const start = (e: Event) => {
      e.preventDefault()
      state.scale = 1
      gestures.current.onInteract?.()
    }
    const change = (e: Event) => {
      e.preventDefault()
      const { scale, clientX, clientY } = e as Event & { scale: number; clientX: number; clientY: number }
      if (state.scale && scale > 0) gestures.current.onZoom?.(scale / state.scale, clientX, clientY)
      state.scale = scale
    }
    const end = (e: Event) => {
      e.preventDefault()
      state.scale = 0
    }
    el.addEventListener('wheel', cancel, { passive: false })
    el.addEventListener('gesturestart', start)
    el.addEventListener('gesturechange', change)
    el.addEventListener('gestureend', end)
    return () => {
      el.removeEventListener('wheel', cancel)
      el.removeEventListener('gesturestart', start)
      el.removeEventListener('gesturechange', change)
      el.removeEventListener('gestureend', end)
    }
  }
  const style: CSSProperties = { touchAction: 'none' }
  return { guard, props: { ref, onPointerDown, onPointerMove, onPointerUp, onPointerCancel, onWheel, onDoubleClick, style } }
}
