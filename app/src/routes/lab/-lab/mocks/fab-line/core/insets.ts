/**
 * The page's chrome over the scene, measured. The host marks what floats over the scene (/lab's bar, the workspace's
 * toolbar and Install bar) and the scene marks its own (the camera-stop strip, /lab's search and call sheet) with
 * `data-scene-chrome`; the entry measures them against its root, and the camera, the strip and the inspector all
 * derive their room from the result.
 */
import { useLayoutEffect, useState } from 'react'
import type { RefObject } from 'react'

/** Pixels of the scene the chrome covers in from each edge. */
export type Insets = { top: number; right: number; bottom: number; left: number }
/** A box in page pixels. */
export type Box = { x0: number; y0: number; x1: number; y1: number }

export const NO_INSETS: Insets = { top: 0, right: 0, bottom: 0, left: 0 }
const SIDES = ['top', 'right', 'bottom', 'left'] as const
/** The canvas fade under the header: the workspace masks this much of the scene below its toolbar. */
export const FADE = 48
/** Room a framed shot keeps from the chrome beside it. */
const GAP = 16

/**
 * How far chrome reaches into `scene` from each edge. Each piece counts against the one edge where it hides the least
 * of the scene, so a header is top, a column at the side is left and a corner panel is the edge it runs along. With
 * `band`, only chrome over that column counts, as for a toolbar that rests above whatever sits under it.
 */
export function insetsOf(scene: Box, chrome: readonly Box[], band?: { x0: number; x1: number }): Insets {
  const out = { ...NO_INSETS }
  const w = scene.x1 - scene.x0, h = scene.y1 - scene.y0
  for (const c of chrome) {
    const x0 = Math.max(c.x0, scene.x0), x1 = Math.min(c.x1, scene.x1), y0 = Math.max(c.y0, scene.y0), y1 = Math.min(c.y1, scene.y1)
    if (x1 <= x0 || y1 <= y0 || (band && (x1 <= band.x0 || x0 >= band.x1))) continue
    const reach: Insets = { top: y1 - scene.y0, right: scene.x1 - x0, bottom: scene.y1 - y0, left: x1 - scene.x0 }
    const hidden = (s: keyof Insets) => reach[s] * (s === 'top' || s === 'bottom' ? w : h)
    const side = SIDES.reduce((a, b) => (hidden(b) < hidden(a) ? b : a))
    out[side] = Math.max(out[side], reach[side])
  }
  return out
}

/** The room a framed shot keeps: clear of the chrome, and below the header's canvas fade. */
export const frameInsets = (chrome: Insets): Insets => ({ top: chrome.top + FADE, right: chrome.right + GAP, bottom: chrome.bottom + GAP, left: chrome.left + GAP })

/** An element's box from its layout, ignoring transforms, so chrome sliding out of the way (under an open sheet) keeps its place. */
function layoutBox(el: HTMLElement): Box {
  let x = 0, y = 0
  for (let e: HTMLElement | null = el; e; e = e.offsetParent as HTMLElement | null) {
    x += e.offsetLeft
    y += e.offsetTop
  }
  return { x0: x, y0: y, x1: x + el.offsetWidth, y1: y + el.offsetHeight }
}

/** What the scene measures: the chrome's insets, and how high the strip rests above the chrome under it. */
export type Room = { chrome: Insets; rest: number }
const same = (a: Room, b: Room) => a.rest === b.rest && SIDES.every((s) => a.chrome[s] === b.chrome[s])
const pieces = () => [...document.querySelectorAll<HTMLElement>('[data-scene-chrome]')].filter((c) => c.offsetWidth && c.offsetHeight)

/** The chrome over `root`. `strip` is the scene's own toolbar column, which rests its left gutter above the chrome under it. */
function measure(root: HTMLElement, strip: HTMLElement | null): Room {
  const scene = layoutBox(root)
  const chrome = pieces()
  const boxes = chrome.map(layoutBox)
  const own = strip && layoutBox(strip)
  const under = own ? insetsOf(scene, boxes.filter((_, i) => chrome[i] !== strip), own).bottom : 0
  return { chrome: insetsOf(scene, boxes), rest: Math.round(under + (own ? own.x0 - scene.x0 : 16)) }
}

/** Measures the chrome over `root` after every commit, on resize and whenever the root or a piece of chrome changes size. */
export function useRoom(root: RefObject<HTMLElement | null>, strip: RefObject<HTMLElement | null>): Room {
  const [room, setRoom] = useState<Room>({ chrome: NO_INSETS, rest: 16 })
  const settle = () => {
    if (!root.current) return
    const next = measure(root.current, strip.current)
    setRoom((prev) => (same(prev, next) ? prev : next))
  }
  useLayoutEffect(settle)
  useLayoutEffect(() => {
    const observer = new ResizeObserver(() => {
      settle()
      for (const c of pieces()) observer.observe(c)
    })
    if (root.current) observer.observe(root.current)
    for (const c of pieces()) observer.observe(c)
    addEventListener('resize', settle)
    return () => {
      observer.disconnect()
      removeEventListener('resize', settle)
    }
  }, [])
  return room
}
