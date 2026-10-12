/**
 * The world: one pick per slot (see `slots.ts`) and per mod tool, and the
 * installed mods, kept per browser in IndexedDB. Each slot lists built-in
 * variants first; every enabled mod appends its own, namespaced
 * `<mod>.<variant>`. A mod is saved as the same JSON source a share link
 * carries and re-activates on load: data recipes at once, code once its hash
 * is trusted.
 */
import { del, get, set as put } from 'idb-keyval'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { PersistStorage, StorageValue } from 'zustand/middleware'

import { adopt, hashOf } from '../mods/adopt'
import { parseBundle, recipes, serialize } from '../mods/data'
import type { Bundle } from '../mods/data'
import { BUILTIN, SLOT_KEYS, SLOTS } from './slots'
import type { Contribution, Lists, Picks } from './slots'

export type ModStatus = 'ready' | 'loading' | 'untrusted' | 'off' | 'error'
export type Mod = { bundle: Bundle; enabled: boolean; trust: string | null; status: ModStatus; error: string | null; adds: Contribution }
type SavedMod = { source: string; enabled: boolean; trust: string | null }
/** A removed mod and the ids that stood after it at the time, nearest first. */
export type Removed = { mod: Mod; next: string[] }
/** What IndexedDB holds. Everything else is rebuilt on load. */
export type Saved = { picks: Picks; mods: SavedMod[] }
export type World = {
  /** False until storage has been read, so nothing renders a world the browser is about to replace. */
  hydrated: boolean
  picks: Picks
  mods: Mod[]
  lists: Lists
}

function listsOf(mods: Mod[]): Lists {
  const out = { ...BUILTIN } as Record<string, readonly unknown[]>
  for (const m of mods) {
    if (!m.enabled || m.status === 'error') continue
    for (const k of SLOT_KEYS) if (m.adds[k]?.length) out[k] = [...out[k], ...m.adds[k]!]
  }
  return out as Lists
}

/** A mod tool's namespaced id. */
const TOOL = /^[a-z0-9-]+\.[a-z0-9-]+$/
/**
 * Reads what storage held, keeping whatever parses. Storage is a boundary: an old or hand-edited value must not break the
 * scene. Worlds saved before follow and the tools' variants were picks keep them; fields the world no longer has (the old
 * toolbar placement) are dropped here and left out of the next write.
 */
function revive(raw: unknown): Pick<World, 'picks' | 'mods'> {
  const s = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const record = (v: unknown) => (v && typeof v === 'object' ? (v as Record<string, unknown>) : {})
  const picks: Record<string, string> = {}
  for (const [k, id] of Object.entries({ ...record(s.tools), ...record(s.picks), follow: record(s.picks).follow ?? s.follow }))
    if (typeof id === 'string' && id && (Object.hasOwn(SLOTS, k) || TOOL.test(k))) picks[k] = id
  const mods: Mod[] = []
  for (const m of Array.isArray(s.mods) ? (s.mods as Partial<SavedMod>[]) : []) {
    try {
      const bundle = parseBundle(String(m.source))
      mods.push({ bundle, enabled: m.enabled !== false, trust: typeof m.trust === 'string' ? m.trust : null, status: 'loading', error: null, adds: {} })
    } catch {}
  }
  return { picks, mods }
}

const LEGACY_MODS = 'fab-line:mods:v1'
const WRITE_DELAY = 100
/**
 * idb-keyval's default database. Values are stored as structured clones, so
 * there is no JSON step. After a failed read nothing is written, so a storage
 * hiccup cannot save the defaults over the world it failed to read. Every
 * state change asks for a save, so saves within WRITE_DELAY collapse into one
 * write of the latest world, flushed early when the page hides so a quick
 * close keeps the last change.
 */
function idbStorage(): PersistStorage<Saved> {
  let unread = false
  let legacy = false
  let pending: { name: string; value: StorageValue<Saved> } | null = null
  let timer: ReturnType<typeof setTimeout> | undefined
  let listening = false
  async function flush() {
    clearTimeout(timer)
    const next = pending
    pending = null
    if (!next || unread) return
    try {
      await put(next.name, next.value)
      if (legacy) localStorage.removeItem(LEGACY_MODS)
      legacy = false
    } catch {}
  }
  return {
    async getItem(name) {
      let saved
      try {
        saved = await get(name)
      } catch (e) {
        unread = true
        throw e
      }
      if (saved) return saved
      try {
        const mods = localStorage.getItem(LEGACY_MODS)
        if (!mods) return null
        legacy = true
        return { state: { picks: {}, mods: JSON.parse(mods) }, version: 1 }
      } catch {
        return null
      }
    },
    setItem(name, value) {
      if (unread) return
      if (!listening) {
        listening = true
        addEventListener('pagehide', flush)
        document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && flush())
      }
      if (!pending) timer = setTimeout(flush, WRITE_DELAY)
      pending = { name, value }
    },
    async removeItem(name) {
      clearTimeout(timer)
      pending = null
      try {
        await del(name)
      } catch {}
    },
  }
}

/** One world store over `storage`. The app uses IndexedDB; tests pass a fake. */
export function createWorld(storage: PersistStorage<Saved> = idbStorage()) {
  const store = create<World>()(
    persist((): World => ({ hydrated: false, picks: {}, mods: [], lists: BUILTIN }), {
      name: 'fab-line:world',
      version: 1,
      storage,
      partialize: (s): Saved => ({
        picks: s.picks,
        mods: s.mods.map((m) => ({ source: serialize(m.bundle), enabled: m.enabled, trust: m.trust })),
      }),
      merge: (saved, current) => {
        const world = revive(saved)
        return { ...current, ...world, lists: listsOf(world.mods) }
      },
      // Runs after a read and after a failed one (private mode, blocked storage), so the scene always gets to render.
      onRehydrateStorage: () => () => {
        void Promise.resolve().then(() => {
          store.setState({ hydrated: true })
          for (const m of store.getState().mods) void activate(m.bundle.id)
        })
      },
    }),
  )

  const setMods = (mods: Mod[]) => store.setState({ mods, lists: listsOf(mods) })
  const find = (id: string) => store.getState().mods.find((m) => m.bundle.id === id)
  const update = (id: string, patch: Partial<Mod>) => setMods(store.getState().mods.map((m) => (m.bundle.id === id ? { ...m, ...patch } : m)))

  // An activation that a newer one (a toggle, a reinstall, a trust) has overtaken writes nothing and runs no code.
  const runs = new Map<string, number>()
  async function activate(id: string) {
    const m = find(id)
    if (!m) return
    const run = (runs.get(id) ?? 0) + 1
    runs.set(id, run)
    const live = () => runs.get(id) === run
    const { bundle } = m
    const onError = (error: string) => update(id, { status: 'error', error })
    let adds: Contribution
    try {
      adds = adopt(bundle.id, recipes(bundle), onError, { inline: true })
    } catch (e) {
      return update(id, { status: 'error', error: (e as Error).message })
    }
    if (!m.enabled) return update(id, { status: 'off', error: null, adds })
    if (!bundle.code) return update(id, { status: 'ready', error: null, adds })
    try {
      const trusted = m.trust === (await hashOf(bundle.code))
      if (!live()) return
      if (!trusted) return update(id, { status: 'untrusted', error: null, adds })
      update(id, { status: 'loading', error: null, adds })
      const { runCode } = await import('../mods/code')
      if (!live()) return
      const code = adopt(bundle.id, await runCode(bundle.code), onError)
      if (!live()) return
      const both: Contribution = { ...adds }
      for (const k of SLOT_KEYS) if (code[k]) both[k] = [...(adds[k] ?? []), ...code[k]!] as never
      update(id, { status: 'ready', adds: both })
    } catch (e) {
      if (live()) update(id, { status: 'error', error: (e as Error).message })
    }
  }

  return Object.assign(store, {
    /** Picks `id` for a slot, or for a mod tool by its namespaced id. */
    setPick: (key: string, id: string) => store.setState((s) => ({ picks: { ...s.picks, [key]: id } })),
    /** Every slot and tool back to its first variant. Mods stay. */
    reset: () => store.setState({ picks: {} }),
    /**
     * Installs or replaces a mod by id. Its code runs only when `trustCode` is
     * set, and the trust is pinned to this exact source: an edited mod asks again.
     */
    async install(bundle: Bundle, trustCode: boolean): Promise<Mod | undefined> {
      // Without a hash there is nothing to pin trust to; activation then fails with hashOf's message.
      const trust = bundle.code && trustCode ? await hashOf(bundle.code).catch(() => null) : null
      const fresh: Mod = { bundle, enabled: true, trust, status: 'loading', error: null, adds: {} }
      setMods([...store.getState().mods.filter((m) => m.bundle.id !== bundle.id), fresh])
      await activate(bundle.id)
      return find(bundle.id)
    },
    /** Removes mods by id in one write and returns what `restore` needs to undo it. */
    remove(ids: readonly string[]): Removed[] {
      const mods = store.getState().mods
      const removed = mods.flatMap((mod, at) => (ids.includes(mod.bundle.id) ? [{ mod, next: mods.slice(at + 1).map((m) => m.bundle.id) }] : []))
      if (removed.length) setMods(mods.filter((m) => !ids.includes(m.bundle.id)))
      return removed
    },
    /**
     * Puts removed mods back where they stood, as they were: bundle, switch, trust and what they had loaded, so nothing
     * runs again. Each goes before the first mod still here that stood after it, so undos of separate removals land in
     * install order whichever comes first. A mod installed again since keeps its new copy.
     */
    restore(removed: readonly Removed[]) {
      const mods = [...store.getState().mods]
      const back = removed.filter((r) => !mods.some((m) => m.bundle.id === r.mod.bundle.id))
      for (const r of back) {
        const at = mods.findIndex((m) => r.next.includes(m.bundle.id))
        mods.splice(at === -1 ? mods.length : at, 0, r.mod)
      }
      setMods(mods)
      // An activation that settled while the mod was away wrote nothing, so one still loading starts over.
      for (const r of back) if (r.mod.status === 'loading') void activate(r.mod.bundle.id)
    },
    setEnabled(id: string, enabled: boolean) {
      update(id, { enabled })
      void activate(id)
    },
    async trust(id: string) {
      const code = find(id)?.bundle.code
      if (!code) return
      update(id, { trust: await hashOf(code) })
      await activate(id)
    },
  })
}

export const useWorld = createWorld()
