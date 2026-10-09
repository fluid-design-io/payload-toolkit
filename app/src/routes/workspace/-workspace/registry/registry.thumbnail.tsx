import { RiBox3Line, RiPuzzle2Line } from '@remixicon/react'
import type { RemixiconComponentType } from '@remixicon/react'
import { useState, type ComponentType } from 'react'
import type { ItemKind, RegistryItem } from '../workspace.types'
import { useWorkspaceTheme } from '../workspace.theme'
import { blockGroup } from '../workspace.utils'

const line = 'h-1.5 rounded-full bg-foreground/10'
const box = 'rounded-md bg-foreground/10'

function Hero() {
  return (
    <span className="flex size-full flex-col items-center justify-center gap-2 px-8">
      <span className="h-2.5 w-3/4 rounded-full bg-foreground/15" />
      <span className={`${line} w-1/2`} />
      <span className="mt-1 flex gap-1.5">
        <span className="h-3 w-10 rounded-full bg-foreground/20" />
        <span className="h-3 w-10 rounded-full bg-foreground/10" />
      </span>
    </span>
  )
}

function Pricing() {
  return (
    <span className="grid size-full grid-cols-3 items-center gap-2 px-5">
      {[10, 15, 10].map((tone, index) => (
        <span
          key={index}
          className={`flex h-3/4 flex-col gap-1.5 rounded-md p-2 ${tone === 15 ? 'bg-foreground/15' : 'bg-foreground/10'}`}
        >
          <span className="h-2 w-2/3 rounded-full bg-foreground/15" />
          <span className="h-1 w-full rounded-full bg-foreground/10" />
          <span className="h-1 w-4/5 rounded-full bg-foreground/10" />
          <span className="mt-auto h-2 w-full rounded-full bg-foreground/20" />
        </span>
      ))}
    </span>
  )
}

function Faq() {
  return (
    <span className="flex size-full flex-col justify-center gap-2 px-8">
      {['w-3/4', 'w-2/3', 'w-4/5', 'w-1/2'].map((width) => (
        <span key={width} className="flex items-center justify-between gap-3">
          <span className={`${line} ${width}`} />
          <span className="size-1.5 rounded-full bg-foreground/20" />
        </span>
      ))}
    </span>
  )
}

function Testimonials() {
  return (
    <span className="grid size-full grid-cols-2 items-center gap-2 px-5">
      {[0, 1].map((index) => (
        <span key={index} className="flex flex-col gap-1.5 rounded-md bg-foreground/10 p-2.5">
          <span className="h-1 w-full rounded-full bg-foreground/15" />
          <span className="h-1 w-4/5 rounded-full bg-foreground/15" />
          <span className="mt-1 flex items-center gap-1.5">
            <span className="size-3 rounded-full bg-foreground/20" />
            <span className="h-1 w-1/2 rounded-full bg-foreground/15" />
          </span>
        </span>
      ))}
    </span>
  )
}

function Logo() {
  return (
    <span className="flex size-full flex-col items-center justify-center gap-3 px-6">
      <span className={`${line} w-1/3`} />
      <span className="grid w-full grid-cols-4 gap-2">
        {[0, 1, 2, 3, 4, 5, 6, 7].map((index) => (
          <span key={index} className={`${box} h-3`} />
        ))}
      </span>
    </span>
  )
}

function Stats() {
  return (
    <span className="grid size-full grid-cols-3 items-center gap-3 px-6">
      {[0, 1, 2].map((index) => (
        <span key={index} className="flex flex-col items-center gap-1.5">
          <span className="h-4 w-3/4 rounded-sm bg-foreground/15" />
          <span className="h-1 w-1/2 rounded-full bg-foreground/10" />
        </span>
      ))}
    </span>
  )
}

function Content() {
  return (
    <span className="grid size-full grid-cols-2 items-center gap-3 px-5">
      <span className={`${box} h-3/5`} />
      <span className="flex flex-col gap-1.5">
        <span className="h-2 w-4/5 rounded-full bg-foreground/15" />
        <span className={`${line} w-full`} />
        <span className={`${line} w-11/12`} />
        <span className={`${line} w-2/3`} />
      </span>
    </span>
  )
}

function Generic() {
  return (
    <span className="flex size-full flex-col justify-center gap-2 px-6">
      <span className="h-2 w-1/2 rounded-full bg-foreground/15" />
      <span className={`${line} w-3/4`} />
      <span className="mt-1 grid grid-cols-3 gap-2">
        <span className={`${box} h-6`} />
        <span className={`${box} h-6`} />
        <span className={`${box} h-6`} />
      </span>
    </span>
  )
}

/** Wireframes keyed by block group; every other group draws `Generic`. */
const wireframes: Partial<Record<string, ComponentType>> = {
  hero: Hero,
  pricing: Pricing,
  faq: Faq,
  testimonials: Testimonials,
  logo: Logo,
  stats: Stats,
  content: Content,
}

const kindIcons: Record<Exclude<ItemKind, 'block'>, RemixiconComponentType> = {
  feature: RiPuzzle2Line,
  component: RiBox3Line,
}

/**
 * A supplied image or cached preview screenshot, with a placeholder on failure.
 * Otherwise blocks draw a wireframe
 * of their group and features and components an icon, all decorative.
 */
export function RegistryThumbnail({ item }: { item: RegistryItem }) {
  const theme = useWorkspaceTheme()
  const [failedImages, setFailedImages] = useState<readonly string[]>([])
  const candidates = theme === 'dark' ? [item.imageDark, item.image] : [item.image, item.imageDark]
  const image = candidates.find((url) => url && !failedImages.includes(url))
  if (image)
    return (
      <img
        src={image}
        alt=""
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={() => setFailedImages((urls) => [...urls, image])}
        className="size-full object-cover"
      />
    )

  if (item.kind !== 'block') {
    const KindIcon = kindIcons[item.kind]
    return (
      <span aria-hidden="true" className="grid size-full place-items-center bg-accent-soft">
        <KindIcon size={32} className="text-accent-soft-foreground" />
      </span>
    )
  }

  const Wireframe = wireframes[blockGroup(item.name)] ?? Generic
  return (
    <span aria-hidden="true" className="block size-full">
      <Wireframe />
    </span>
  )
}
