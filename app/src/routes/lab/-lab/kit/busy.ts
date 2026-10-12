/**
 * What keeps a demand frame loop at full rate. Anything that moves calls
 * `keepAnimating()` while it moves, from its frame loop or an event handler,
 * and `keepAnimating(seconds)` holds full rate for a stretch from now.
 * `FrameGovernor` reads the demand once per animation frame: it renders at
 * full rate while an ask is waiting for its render or a stretch is still
 * running, and at its idle rate otherwise. Each render clears the asks made
 * before it, and whatever still moves asks again during that render. Nothing
 * registers, so nothing can outlive the code that asks: a part that settles
 * or unmounts stops asking. One scene is mounted at a time, so the demand is
 * module-level.
 */
export function createDemand(now: () => number) {
  let asked = false
  let until = -Infinity
  return {
    keep(seconds = 0) {
      if (seconds > 0) until = Math.max(until, now() + seconds * 1000)
      else asked = true
    },
    /** True when the next frame should render at full rate. */
    wanted: () => asked || now() < until,
    /** A render starts: the asks before it are answered. */
    rendered() {
      asked = false
    },
  }
}

const demand = createDemand(() => performance.now())

export const keepAnimating = demand.keep
export const animationWanted = demand.wanted
export const frameRendered = demand.rendered
