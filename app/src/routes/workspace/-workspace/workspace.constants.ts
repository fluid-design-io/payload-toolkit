import type { Transition, Variants } from 'motion/react'
import type {
  Agent,
  Database,
  Framework,
  Option,
  Output,
  PackageManager,
  Setup,
  Target,
} from './workspace.types'

export const defaultSetup: Setup = {
  target: 'existing',
  name: 'my-payload-app',
  framework: 'next',
  database: 'postgres',
  packageManager: 'pnpm',
  agent: 'claude',
  items: [],
}

export const frameworks: readonly Option<Framework>[] = [
  { value: 'next', label: 'Next.js' },
  { value: 'tanstack', label: 'TanStack Start' },
]

export const databases: readonly Option<Database>[] = [
  { value: 'postgres', label: 'PostgreSQL' },
  { value: 'mongodb', label: 'MongoDB' },
]

export const packageManagers: readonly Option<PackageManager>[] = [
  { value: 'pnpm', label: 'pnpm' },
  { value: 'npm', label: 'npm' },
  { value: 'bun', label: 'Bun' },
]

export const targets: readonly Option<Target>[] = [
  { value: 'existing', label: 'Add to my project' },
  { value: 'new', label: 'New project' },
]

export const agents: readonly Option<Agent>[] = [
  { value: 'none', label: 'None' },
  { value: 'claude', label: 'Claude Code' },
  { value: 'codex', label: 'Codex' },
]

export const outputs: readonly Option<Output>[] = [
  { value: 'command', label: 'Terminal' },
  { value: 'prompt', label: 'Agent prompt' },
]

/** Block group labels where Title Case of the name prefix misleads, including `feature`, which would read like the bundled Features. */
export const blockLabels: Readonly<Record<string, string>> = {
  call: 'Call to action',
  faq: 'FAQ',
  feature: 'Feature sections',
}

/** Smaller block groups fold into one "Other" category. */
export const minBlockGroup = 3

const ease = [0.2, 0.8, 0.2, 1] as const
const stretch: Transition = { type: 'tween', ease, duration: 0.3 }
const rise: Transition = { type: 'spring', bounce: 0.3, duration: 0.55, delay: 0.22 }
const lower: Transition = { ...stretch, delay: 0.08 }
const narrow: Transition = { ...stretch, delay: 0.32 }
const settle: Transition = { type: 'spring', bounce: 0, duration: 0.3 }

/**
 * The bar and the registry detail share one morph. Opening stretches sideways,
 * then springs upward; closing lowers first, then narrows. Content waits for
 * the rise with `morphContentDelay`.
 */
export const morph: Record<'open' | 'close', Transition> = {
  open: { width: stretch, left: stretch, height: rise, top: rise, default: settle },
  close: { height: lower, top: lower, width: narrow, left: narrow, default: settle },
}
export const morphContentDelay = 0.4

/** One row of morphed content, rising in after the shape settles. */
export const riseIn: Variants = {
  hidden: { opacity: 0, y: 8 },
  shown: { opacity: 1, y: 0, transition: { type: 'spring', bounce: 0.35, duration: 0.4 } },
  gone: { opacity: 0, transition: { duration: 0 } },
}
