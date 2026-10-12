import type { SwapVariant } from '../../../../core/contract'
import { every, rest } from './kit'

/** The calm baseline: the old part vanishes and the new one drops in and settles. */
export const drop: SwapVariant = {
  id: 'drop',
  label: 'Drop',
  acts: every({
    duration: 0.6,
    arrive: 0,
    rig: () => ({
      frame(clock, old, next) {
        if (!clock.active) return
        old.visible = false
        rest(next, clock.toBox)
        next.position.y += 2.4 * (1 - clock.u) ** 3
        next.visible = true
      },
    }),
  }),
}
