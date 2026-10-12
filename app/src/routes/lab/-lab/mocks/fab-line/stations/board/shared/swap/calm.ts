import { play } from '../../../../../../kit/sound'
import type { SocketKind, SwapAct } from '../../../../core/contract'
import { crossed, easeIn, easeOut, rest, span } from './kit'

const ARRIVE = 0.5
/** Which way each part leaves: up out of the CPU and memory sockets, back along the bench for the power stage. */
const AWAY: Record<SocketKind, readonly [number, number, number]> = { cpu: [0, 1.2, 0], memory: [0, 1.2, 0], power: [-2, 0, 0] }

/** Every style under reduced motion: the old part eases a short way out, the new one eases in from there. No props, no shake. */
export const calm: SwapAct = {
  duration: 0.55,
  arrive: ARRIVE,
  rig: (_c, kind) => {
    const [x, y, z] = AWAY[kind]
    return {
      frame(clock, old, next) {
        if (!clock.active) return
        const out = easeIn(span(clock.u, 0, 0.45)), back = 1 - easeOut(span(clock.u, ARRIVE, 1))
        rest(old, clock.fromBox)
        old.position.set(old.position.x + x * out, old.position.y + y * out, old.position.z + z * out)
        old.visible = clock.u < 0.45
        rest(next, clock.toBox)
        next.position.set(next.position.x + x * back, next.position.y + y * back, next.position.z + z * back)
        next.visible = clock.u >= ARRIVE
        if (crossed(clock, 0.9)) play('seat')
      },
    }
  },
}
