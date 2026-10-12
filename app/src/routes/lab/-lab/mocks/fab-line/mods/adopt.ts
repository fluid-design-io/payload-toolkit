/**
 * The boundary a mod's contribution crosses into the world. Every variant is checked against its slot's row in `SLOTS`,
 * its id namespaced `<mod>.<id>`, and its components and functions guarded, so a failure switches the mod off instead
 * of breaking the scene.
 */
import { SLOT_KEYS, SLOTS } from '../world/slots'
import type { Contribution, SlotKey } from '../world/slots'
import { fail, guard, head, tripOf } from './guard'

const OPEN = SLOT_KEYS.filter((k) => SLOTS[k].fields)

/** `inline` holds thumbnails to data:image URLs, as data recipes are. */
export function adopt(mod: string, raw: unknown, onError: (message: string) => void, { inline = false } = {}): Contribution {
  if (!raw || typeof raw !== 'object') fail('A mod must return an object keyed by slot.')
  const trip = tripOf(onError)
  const out: Record<string, unknown[]> = {}
  for (const [key, list] of Object.entries(raw as object)) {
    const slot = Object.hasOwn(SLOTS, key) ? SLOTS[key as SlotKey] : undefined
    if (!slot?.fields) fail(`Unknown slot "${key}". Slots: ${OPEN.join(', ')}.`)
    if (!Array.isArray(list)) fail(`"${key}" must be an array of variants.`)
    out[key] = (list as unknown[]).map((v, i) => {
      const what = `${key}[${i}]`
      if (!v || typeof v !== 'object') fail(`${what} must be an object.`)
      const own = head(v as Record<string, unknown>, what, inline)
      if (typeof (v as { footprint?: unknown }).footprint === 'object' && !Array.isArray((v as { frame?: { pts?: unknown } }).frame?.pts)) fail(`${what}.frame must be { pts: [[x, y, z], …] }.`)
      let adopted: Record<string, unknown> = { ...v, ...own, id: `${mod}.${own.id}` }
      if (slot!.adopt) adopted = slot!.adopt(adopted, what, trip)
      return guard(adopted, slot!.fields!, slot!.builtins[0] as Record<string, unknown> | undefined, trip, what)
    })
  }
  return out as Contribution
}

/** Throws without `crypto.subtle`, which browsers only give secure contexts: a phone opening the dev server over the LAN has none. */
export async function hashOf(code: string) {
  if (!crypto.subtle) throw new Error('Code mods need a secure context. Open this page over https or on localhost.')
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(code))
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}
