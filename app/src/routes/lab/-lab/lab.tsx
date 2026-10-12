import { Button, ToggleButton, Tooltip } from '@heroui/react'
import { RiMoonLine, RiSunLine, RiVolumeMuteLine, RiVolumeUpLine } from '@remixicon/react'
import { Suspense, lazy, useEffect, useState } from 'react'

import { catalog as rawCatalog } from '../../workspace/-workspace/workspace.catalog'
import { defaultSetup } from '../../workspace/-workspace/workspace.constants'
import { toggleTheme, useWorkspaceTheme } from '../../workspace/-workspace/workspace.theme'
import { toCatalog, toCommand } from '../../workspace/-workspace/workspace.utils'
import type { Catalog, Setup } from '../../workspace/-workspace/workspace.types'
import { setMuted, useMuted } from './kit/sound'
import type { Focus, Lab } from './lab.types'
import { toWarehouse, viralItems } from './warehouse'

const FabLine = lazy(() => import('./mocks/fab-line'))

function toScale(catalog: Catalog) {
  return {
    catalog,
    warehouse: toWarehouse(catalog),
    order: new Map(catalog.items.map((item, index) => [item.ref, index])),
  }
}

const real = toScale(toCatalog(rawCatalog))
let viral: ReturnType<typeof toScale> | undefined

/** The viral catalog is about 2,400 items, so it is built the first time something asks for it. */
function scaleOf(scale: Lab['scale']) {
  if (scale === 'real') return real
  viral ??= toScale(toCatalog(viralItems(rawCatalog)))
  return viral
}

/**
 * The viral catalog starts with the real items in their order and adds only
 * synthetic refs, so refs that are all real command and sort the same against
 * the real catalog and never build the viral one.
 */
const scaleFor = (refs: readonly string[]) => scaleOf(refs.every((ref) => real.order.has(ref)) ? 'real' : 'viral')

function useLab(scale: Lab['scale']): Lab {
  const [setup, setSetup] = useState<Setup>({ ...defaultSetup, items: [] })
  const [focus, setFocus] = useState<Focus>({ category: 'all', query: '' })
  const theme = useWorkspaceTheme()
  const { catalog, warehouse } = scaleOf(scale)
  return {
    catalog,
    warehouse,
    scale,
    setup,
    selected: new Set(setup.items),
    theme,
    chrome: new URLSearchParams(location.search).get('chrome') === 'embedded' ? 'embedded' : 'full',
    focus,
    setFocus: (next) => setFocus((current) => ({ ...current, ...next })),
    command: toCommand(setup, scaleFor(setup.items).catalog.items),
    toggle: (ref) =>
      setSetup((current) => {
        if (current.items.includes(ref)) return { ...current, items: current.items.filter((item) => item !== ref) }
        const items = [...current.items, ref]
        const { order } = scaleFor(items)
        return { ...current, items: items.sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0)) }
      }),
    clear: () => setSetup((current) => ({ ...current, items: [] })),
    set: (key, value) => setSetup((current) => ({ ...current, [key]: value })),
  }
}

/**
 * A throwaway bench for the fab line, the 3D scene the workspace's factory
 * view embeds. It gets the catalog and one Setup, which the item-count toggle
 * keeps while it remounts the scene at the other scale; the URL keeps the
 * scale. The sound toggle reaches the scene through the kit's `lab-sound`
 * store.
 */
export function LabScreen() {
  const [scale, setScale] = useState<Lab['scale']>(() =>
    new URLSearchParams(location.search).get('scale') === 'viral' ? 'viral' : 'real',
  )
  const lab = useLab(scale)
  const muted = useMuted()

  useEffect(() => {
    const url = new URL(location.href)
    if (scale === 'viral') url.searchParams.set('scale', 'viral')
    else url.searchParams.delete('scale')
    history.replaceState(null, '', url)
  }, [scale])

  return (
    <div className="relative h-svh w-full overflow-hidden bg-background text-foreground">
      <Suspense fallback={<div className="grid h-full place-items-center text-muted">Loading Fab line…</div>}>
        <FabLine key={scale} lab={lab} />
      </Suspense>
      <nav
        aria-label="Lab"
        className="pointer-events-auto absolute inset-x-0 top-3 z-50 mx-auto flex w-fit max-w-[calc(100%-24px)] items-center gap-1 overflow-x-auto rounded-full border border-border bg-surface/85 p-1 shadow-overlay backdrop-blur"
        style={{ marginTop: 'env(safe-area-inset-top)' }}
        data-scene-chrome
      >
        <Tooltip delay={400} closeDelay={0}>
          <ToggleButton
            size="sm"
            variant="ghost"
            isSelected={scale === 'viral'}
            onChange={(on) => setScale(on ? 'viral' : 'real')}
            className="shrink-0 tabular-nums"
          >
            {lab.catalog.items.length.toLocaleString()}
            <span className="max-sm:sr-only"> items</span>
          </ToggleButton>
          <Tooltip.Content placement="bottom">{scale === 'viral' ? 'Back to the real catalog' : 'Swap in about 2,400 synthetic items to test organization at scale'}</Tooltip.Content>
        </Tooltip>
        <Tooltip delay={400} closeDelay={0}>
          <ToggleButton
            size="sm"
            variant="ghost"
            isIconOnly
            isSelected={!muted}
            onChange={(on) => setMuted(!on)}
            aria-label={muted ? 'Sound off' : 'Sound on'}
            className="shrink-0"
            data-sound-toggle={muted ? 'off' : 'on'}
          >
            {muted ? <RiVolumeMuteLine aria-hidden /> : <RiVolumeUpLine aria-hidden />}
          </ToggleButton>
          <Tooltip.Content placement="bottom">{muted ? 'Turn sound on' : 'Mute'}</Tooltip.Content>
        </Tooltip>
        <Tooltip delay={400} closeDelay={0}>
          <Button size="sm" variant="ghost" isIconOnly onPress={toggleTheme} aria-label={lab.theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'} className="shrink-0">
            {lab.theme === 'dark' ? <RiSunLine aria-hidden /> : <RiMoonLine aria-hidden />}
          </Button>
          <Tooltip.Content placement="bottom">{lab.theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}</Tooltip.Content>
        </Tooltip>
      </nav>
    </div>
  )
}
