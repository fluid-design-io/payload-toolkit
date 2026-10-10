import { Suspense, lazy, useEffect, useMemo, useState } from 'react'
import type { ComponentType } from 'react'

import { catalog as rawCatalog } from '../../workspace/-workspace/workspace.catalog'
import { defaultSetup } from '../../workspace/-workspace/workspace.constants'
import { toCatalog, toCommand } from '../../workspace/-workspace/workspace.utils'
import type { Setup } from '../../workspace/-workspace/workspace.types'
import { setMuted, useMuted } from './kit/sound'
import { mocks } from './lab.mocks'
import type { Focus, Lab, MockProps } from './lab.types'
import { toWarehouse, viralItems } from './warehouse'

const catalogs = {
  real: toCatalog(rawCatalog),
  viral: toCatalog(viralItems(rawCatalog)),
}
const warehouses = { real: toWarehouse(catalogs.real), viral: toWarehouse(catalogs.viral) }
const order = new Map(catalogs.viral.items.map((item, index) => [item.ref, index]))
const views = new Map<string, ComponentType<MockProps>>(mocks.map((mock) => [mock.id, lazy(mock.load)]))

function useTheme(): Lab['theme'] {
  const read = (): Lab['theme'] => (document.documentElement.dataset.theme === 'mouve-dark' ? 'dark' : 'light')
  const [theme, setTheme] = useState(read)
  useEffect(() => {
    const observer = new MutationObserver(() => setTheme(read()))
    observer.observe(document.documentElement, { attributeFilter: ['data-theme'] })
    return () => observer.disconnect()
  }, [])
  return theme
}

function useLab(scale: Lab['scale']): Lab {
  const [setup, setSetup] = useState<Setup>({ ...defaultSetup, items: [] })
  const [focus, setFocus] = useState<Focus>({ category: 'all', query: '' })
  const theme = useTheme()
  return useMemo(() => {
    const selected = new Set(setup.items)
    return {
      catalog: catalogs[scale],
      warehouse: warehouses[scale],
      scale,
      setup,
      selected,
      theme,
      chrome: new URLSearchParams(location.search).get('chrome') === 'embedded' ? 'embedded' : 'full',
      focus,
      setFocus: (next) => setFocus((current) => ({ ...current, ...next })),
      command: toCommand(setup, catalogs.viral.items),
      toggle: (ref) =>
        setSetup((current) => {
          const items = current.items.includes(ref)
            ? current.items.filter((item) => item !== ref)
            : [...current.items, ref].sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0))
          return { ...current, items }
        }),
      clear: () => setSetup((current) => ({ ...current, items: [] })),
      set: (key, value) => setSetup((current) => ({ ...current, [key]: value })),
    }
  }, [setup, theme, scale, focus])
}

function toggleTheme() {
  const root = document.documentElement
  const next = root.dataset.theme === 'mouve-dark' ? 'light' : 'dark'
  root.dataset.theme = `mouve-${next}`
  try {
    localStorage.setItem('theme', next)
  } catch {}
}

const pillButton = 'shrink-0 rounded-full px-3 py-1.5 transition-colors focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent'

/**
 * A throwaway bench for 3D workspace concepts. Every mock gets the real
 * catalog and one shared Setup, so switching keeps the build. Keys 1 to 9
 * and the arrows switch mocks; the URL keeps the current one. On phones the
 * mock list is a native select; the sound toggle is shared by every mock
 * through the kit's `lab-sound` store.
 */
export function LabScreen() {
  const [scale, setScale] = useState<Lab['scale']>(() =>
    new URLSearchParams(location.search).get('scale') === 'viral' ? 'viral' : 'real',
  )
  const lab = useLab(scale)
  const muted = useMuted(lab.chrome)
  const [id, setId] = useState(() => new URLSearchParams(location.search).get('mock') ?? mocks[0].id)
  const index = Math.max(0, mocks.findIndex((mock) => mock.id === id))
  const current = mocks[index]
  const View = views.get(current.id)!

  useEffect(() => {
    const url = new URL(location.href)
    url.searchParams.set('mock', current.id)
    if (scale === 'viral') url.searchParams.set('scale', 'viral')
    else url.searchParams.delete('scale')
    history.replaceState(null, '', url)
  }, [current.id, scale])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement) return
      const digit = Number(event.key)
      if (digit >= 1 && digit <= mocks.length) setId(mocks[digit - 1].id)
      if (event.key === 'ArrowRight' && event.shiftKey) setId(mocks[(index + 1) % mocks.length].id)
      if (event.key === 'ArrowLeft' && event.shiftKey) setId(mocks[(index - 1 + mocks.length) % mocks.length].id)
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [index])

  return (
    <div className="relative h-svh w-full overflow-hidden bg-background text-foreground">
      <Suspense fallback={<div className="grid h-full place-items-center text-muted">Loading {current.title}…</div>}>
        <View key={`${current.id}-${scale}`} lab={lab} />
      </Suspense>
      <nav
        aria-label="Lab"
        className="pointer-events-auto absolute inset-x-0 top-3 z-50 mx-auto flex w-fit max-w-[calc(100%-24px)] items-center gap-1 overflow-x-auto rounded-full border border-border bg-surface/85 p-1 text-xs shadow-lg backdrop-blur"
        style={{ marginTop: 'env(safe-area-inset-top)' }}
      >
        <label className="flex shrink-0 items-center gap-1.5 pl-2 sm:hidden">
          <span className="sr-only">Mock</span>
          <select
            value={current.id}
            onChange={(e) => setId(e.target.value)}
            className="max-w-[46vw] rounded-full bg-transparent py-1.5 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-accent"
            data-mock-select
          >
            {mocks.map((mock, position) => (
              <option key={mock.id} value={mock.id}>
                {position + 1} {mock.title}
              </option>
            ))}
          </select>
        </label>
        <div className="hidden items-center gap-1 sm:flex">
          {mocks.map((mock, position) => (
            <button
              key={mock.id}
              type="button"
              title={mock.pitch}
              aria-current={mock.id === current.id ? 'page' : undefined}
              onClick={() => setId(mock.id)}
              className={`${pillButton} ${mock.id === current.id ? 'bg-accent text-accent-foreground' : 'text-muted hover:bg-default'}`}
            >
              <span className="mr-1 opacity-60">{position + 1}</span>
              {mock.title}
            </button>
          ))}
        </div>
        <button
          type="button"
          title="Swap in about 2,400 synthetic items to test organization at scale"
          aria-pressed={scale === 'viral'}
          onClick={() => setScale(scale === 'real' ? 'viral' : 'real')}
          className={`${pillButton} tabular-nums ${scale === 'viral' ? 'bg-warning text-warning-foreground' : 'text-muted hover:bg-default'}`}
        >
          {lab.catalog.items.length.toLocaleString()}
          <span className="max-sm:sr-only"> items</span>
        </button>
        <button
          type="button"
          onClick={() => setMuted(!muted)}
          aria-pressed={!muted}
          aria-label={muted ? 'Sound off' : 'Sound on'}
          title={muted ? 'Sound is off. Turn it on.' : 'Sound is on. Mute.'}
          data-sound-toggle={muted ? 'off' : 'on'}
          className={`${pillButton} min-w-10 text-center ${muted ? 'text-muted line-through decoration-2 hover:bg-default' : 'text-foreground hover:bg-default'}`}
        >
          ♪
        </button>
        <button type="button" onClick={toggleTheme} aria-label={lab.theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'} className={`${pillButton} min-w-10 text-center text-muted hover:bg-default`}>
          {lab.theme === 'dark' ? '☀' : '☾'}
        </button>
      </nav>
    </div>
  )
}
