/**
 * What a mod's variant passes on its way into the world: one check of the id, label and thumbnail every variant carries
 * (data recipes when a bundle parses, code mods when they are adopted), and guards around everything it can throw from.
 * A component mounts behind an error boundary, a function runs behind try/catch and falls back to the slot default's.
 * The first throw trips the mod: its guards stop calling it and the store marks it `error`, which drops its variants.
 */
import { Component, createElement } from 'react'
import type { ComponentType, ReactNode } from 'react'
import { Object3D, Vector3 } from 'three'

import type { Shot, SocketKind, SwapAct, SwapRig, ViewTool } from '../core/contract'
import { rest } from '../stations/board/shared/swap/kit'

export function fail(msg: string): never {
  throw new Error(msg)
}
const ID = /^[a-z0-9][a-z0-9-]{0,31}$/
export const str = (v: unknown, what: string) => (typeof v === 'string' && v.length ? v : fail(`${what} must be a non-empty string.`))
/** Ids name URL values, card keys and `<mod>.<variant>` namespaces, so they keep to lowercase letters, digits and dashes. */
export const id = (v: unknown, what: string) => (ID.test(str(v, what)) ? (v as string) : fail(`${what} must be lowercase letters, digits and dashes.`))
export const label = (v: unknown, what: string) => str(v, what).slice(0, 24)
/**
 * An image URL. `inline` admits only data:image URLs: data mods travel in share links, so a remote thumbnail would tell
 * whoever wrote the link when a viewer opens the sheet. Code mods are already trusted with the page.
 */
function image(v: unknown, what: string, inline: boolean): string | undefined {
  if (v === undefined) return undefined
  if (!inline) return str(v, what)
  let url: URL | undefined
  try {
    url = new URL(str(v, what))
  } catch {}
  return url && url.protocol === 'data:' && url.pathname.startsWith('image/') ? (v as string) : fail(`${what} must be a data:image URL.`)
}
/** The fields every variant shares. */
export const head = (v: Record<string, unknown>, what: string, inline: boolean) => ({
  id: id(v.id, `${what}.id`),
  label: label(v.label, `${what}.label`),
  thumbnail: image(v.thumbnail, `${what}.thumbnail`, inline),
})

/** One mod's activation. `fail` reports the first throw after the current call returns, since a function may throw mid-render. */
export type Trip = { failed: boolean; fail: (e: unknown) => void }
export function tripOf(onError: (message: string) => void): Trip {
  const trip: Trip = {
    failed: false,
    fail(e) {
      if (trip.failed) return
      trip.failed = true
      queueMicrotask(() => onError(String((e as Error)?.message ?? e)))
    },
  }
  return trip
}

class Boundary extends Component<{ trip: Trip; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidCatch(error: unknown) {
    this.props.trip.fail(error)
  }
  render() {
    return this.state.failed ? null : this.props.children
  }
}

/**
 * How a variant's field crosses the boundary. A `component` renders behind an error boundary; a `fn` that throws
 * returns what the slot default's returns. `?` marks a field a variant may leave out (or set to null).
 */
export type Field = 'component' | 'component?' | 'fn' | 'fn?'
type Fn = (...args: unknown[]) => unknown

export function guard(v: Record<string, unknown>, fields: Record<string, Field | undefined>, fallback: Record<string, unknown> | undefined, trip: Trip, what: string) {
  const out = { ...v }
  for (const [key, field] of Object.entries(fields)) {
    const value = v[key]
    const component = field!.startsWith('component')
    if (value == null && field!.endsWith('?')) continue
    // A memo or forwardRef component is an object.
    const ok = typeof value === 'function' || (component && typeof value === 'object' && value !== null && '$$typeof' in value)
    if (!ok) fail(`${what}.${key} must be a ${component ? 'component' : 'function'}.`)
    if (component) {
      const Guarded = (props: object) => createElement(Boundary, { trip, children: createElement(value as ComponentType<object>, props) })
      Guarded.displayName = `Mod(${what}.${key})`
      // A recipe or a code mod may reuse a built-in's lazy component, which still loads before it shows.
      out[key] = Object.assign(Guarded, { preload: (value as { preload?: () => Promise<unknown> }).preload })
    } else {
      const own = value as Fn
      const backup = fallback?.[key] as Fn | undefined
      out[key] = (...args: unknown[]) => {
        if (!trip.failed) {
          try {
            return own(...args)
          } catch (e) {
            trip.fail(e)
          }
        }
        return backup?.(...args)
      }
    }
  }
  return out
}

const SOCKETS: readonly SocketKind[] = ['cpu', 'memory', 'power']
/**
 * A swap style needs an act for every socket. Its rigs return objects of their own functions, so they are guarded here:
 * after a throw the running swap lands the new part at rest until the sockets switch to the default style.
 */
export function guardSwap(v: Record<string, unknown>, what: string, trip: Trip) {
  const acts = (v.acts && typeof v.acts === 'object' ? v.acts : {}) as Record<string, Partial<SwapAct> | undefined>
  const out = {} as Record<SocketKind, SwapAct>
  for (const kind of SOCKETS) {
    const { duration, arrive, rig } = acts[kind] ?? {}
    if (typeof rig !== 'function' || typeof duration !== 'number' || !(duration > 0 && duration <= 10) || typeof arrive !== 'number' || !(arrive >= 0 && arrive <= 1))
      fail(`${what} needs acts.${kind} with a rig function, a duration in seconds (up to 10) and arrive between 0 and 1.`)
    out[kind] = { duration: duration!, arrive: arrive!, rig: guardRig(rig!, trip) }
  }
  return { ...v, acts: out }
}

function guardRig(make: SwapAct['rig'], trip: Trip): SwapAct['rig'] {
  return (c, kind) => {
    let rig: SwapRig | null = null
    try {
      rig = make(c, kind)
      if (!rig || typeof rig.frame !== 'function') fail('A swap rig must return { frame }.')
      if (rig!.root !== undefined && !(rig!.root instanceof Object3D)) fail('A swap rig\'s root must be a three.js object from host.THREE.')
    } catch (e) {
      rig = null
      trip.fail(e)
    }
    const built = rig
    return {
      root: built?.root,
      frame(clock, old, next, dt) {
        if (built && !trip.failed) {
          try {
            return built.frame(clock, old, next, dt)
          } catch (e) {
            trip.fail(e)
          }
        }
        if (built?.root) built.root.visible = false
        if (!clock.active) return
        old.visible = false
        rest(next, clock.toBox)
        next.visible = true
      },
      dispose() {
        try {
          built?.dispose?.()
        } catch {}
      },
    }
  }
}

const PATH = /^[MmLlHhVvCcSsQqTtAaZz0-9eE.,\s+-]+$/
/** A tool is a `view` with a `shot` function or a `toggle`. Its icon is path data and its variants carry ids and labels. */
export function guardTool(v: Record<string, unknown>, what: string, trip: Trip) {
  if (v.kind !== 'view' && v.kind !== 'toggle') fail(`${what} needs kind 'view' or 'toggle'.`)
  if (v.kind === 'view' && typeof v.shot !== 'function') fail(`${what} is a view and needs a shot(ctx, out) function.`)
  if (v.icon !== undefined && (typeof v.icon !== 'string' || !PATH.test(v.icon))) fail(`${what}.icon must be SVG path data on a 24 × 24 grid.`)
  if (v.description !== undefined && typeof v.description !== 'string') fail(`${what}.description must be a string.`)
  let variants: unknown = v.variants
  if (variants !== undefined) {
    if (!Array.isArray(variants)) fail(`${what}.variants must be a list.`)
    variants = (variants as Record<string, unknown>[]).map((x, i) => {
      const at = `${what}.variants[${i}]`
      if (!x || typeof x !== 'object') fail(`${at} must be an object.`)
      if (x.description !== undefined && typeof x.description !== 'string') fail(`${at}.description must be a string.`)
      return { ...head(x, at, false), description: x.description as string | undefined }
    })
    const list = variants as { id: string }[]
    if (new Set(list.map((x) => x.id)).size !== list.length) fail(`${what}.variants need distinct ids.`)
  }
  return { ...v, variants, ...(v.kind === 'view' && { shot: guardShot(v.shot as ViewTool['shot'], trip) }) }
}

const scratch: Shot = { pos: new Vector3(), look: new Vector3(), fov: 50 }
/**
 * Runs a view's shot on a scratch pose and copies it out only when it is usable: finite, the eye off its look point and a
 * fov in 1..150. Anything else trips the mod, and the camera holds the last good pose until the toolbar drops the view.
 */
function guardShot(shot: ViewTool['shot'], trip: Trip): ViewTool['shot'] {
  return (ctx, out) => {
    if (trip.failed) return false
    try {
      scratch.pos.copy(out.pos)
      scratch.look.copy(out.look)
      scratch.fov = out.fov
      const cut = shot(ctx, scratch)
      const { pos, look, fov } = scratch
      if (![pos.x, pos.y, pos.z, look.x, look.y, look.z].every(Number.isFinite) || pos.distanceToSquared(look) < 1e-6 || !(fov >= 1 && fov <= 150))
        fail('A view\'s shot must write a finite pos and look point apart from each other, and a fov between 1 and 150 degrees.')
      out.pos.copy(pos)
      out.look.copy(look)
      out.fov = fov
      return cut === true
    } catch (e) {
      trip.fail(e)
      return false
    }
  }
}
