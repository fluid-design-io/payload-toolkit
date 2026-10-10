import type { CatalogItem, ItemKind } from '../../../../../workspace/-workspace/workspace.types'

/**
 * A part is a card: a thin box whose +y face carries the screenshot. Lying
 * flat on the board it is an IC (block), a passive (component) or a
 * daughterboard (feature); standing in a drawer it is a filed card.
 * Size is [width x, thickness y, depth z].
 */
export const PART_SIZE: Record<ItemKind, [number, number, number]> = {
  block: [0.44, 0.04, 0.3],
  component: [0.3, 0.04, 0.3],
  feature: [0.56, 0.05, 0.56],
}

export const partSize = (item: CatalogItem) => PART_SIZE[item.kind]
