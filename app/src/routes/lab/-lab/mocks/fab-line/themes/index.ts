import type { ThemeVariant } from '../core/contract'
import { blueprint } from './blueprint'
import { clay } from './clay'
import { cleanroom } from './cleanroom'
import { ink } from './ink'
import { phosphor } from './phosphor'
import { riso } from './riso'

/** Theme tokens plus the world each one stages. The first entry is the default. */
export const THEMES: readonly ThemeVariant[] = [blueprint, cleanroom, riso, phosphor, ink, clay]
export { TileFlip } from './shared'
export type { Transition } from './shared'
