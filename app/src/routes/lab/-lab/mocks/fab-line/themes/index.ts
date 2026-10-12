import type { ThemeVariant } from '../core/contract'
import { blueprint } from './blueprint.data'
import { clay } from './clay.data'
import { cleanroom } from './cleanroom.data'
import { ink } from './ink.data'
import { phosphor } from './phosphor.data'
import { riso } from './riso.data'

/** Theme tokens plus the world each one stages. The first entry is the default. */
export const THEMES: readonly ThemeVariant[] = [blueprint, cleanroom, riso, phosphor, ink, clay]
export { TileFlip } from './shared'
export type { Transition } from './shared'
