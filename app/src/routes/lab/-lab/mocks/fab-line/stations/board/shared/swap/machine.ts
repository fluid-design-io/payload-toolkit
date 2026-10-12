import type { SwapAct, SwapBox, SwapClock } from '../../../../core/contract'

type Timing = Pick<SwapAct, 'duration' | 'arrive'>

/** A swap chained after a click that came too late to retarget runs this much faster. */
const CHAIN = 1.6

/**
 * One socket's swap: which part leaves, which arrives, how far along, and at most one queued target.
 * `ask` takes the new setup value; `step` advances time. Both return what changed so the socket can
 * re-render its parts. A swap that begins waits, unposed, until the socket has rendered its parts and
 * calls `settle`, so a rig never poses a group still holding the previous part.
 */
export class SwapMachine implements SwapClock {
  u = 1
  prev = 1
  dur: number
  from: string | null = null
  fromBox: SwapBox | null = null
  toBox: SwapBox
  queued: string | null = null
  private t = 0
  private running = false
  private fresh = false

  constructor(
    private act: Timing,
    public to: string,
    private readonly box: (value: string) => SwapBox,
  ) {
    this.toBox = box(to)
    this.dur = act.duration
  }

  /** Switches act between swaps or during one; a running swap keeps its length. */
  use(act: Timing) {
    this.act = act
  }

  get active() {
    return this.running && !this.fresh
  }

  /** After a render: true once for a swap that just began, so the socket resets its groups. */
  settle() {
    const fresh = this.fresh
    this.fresh = false
    return fresh
  }

  ask(value: string): 'start' | 'retarget' | 'queue' | 'none' {
    if (!this.running) {
      if (value === this.to) return 'none'
      this.begin(this.to, value, 1)
      return 'start'
    }
    if (this.u < this.act.arrive) {
      if (value === this.to) return 'none'
      this.to = value
      this.toBox = this.box(value)
      return 'retarget'
    }
    this.queued = value === this.to ? null : value
    return 'queue'
  }

  step(dt: number): 'idle' | 'run' | 'chain' | 'end' {
    if (!this.running) return 'idle'
    if (this.fresh) return 'run'
    this.prev = this.u
    this.t += Math.min(dt, 0.05)
    this.u = Math.min(1, this.t / this.dur)
    if (this.u < 1) return 'run'
    const queued = this.queued
    if (queued !== null && queued !== this.to) {
      this.begin(this.to, queued, CHAIN)
      return 'chain'
    }
    this.running = false
    this.from = null
    this.fromBox = null
    this.queued = null
    return 'end'
  }

  private begin(from: string, to: string, speed: number) {
    this.running = true
    this.fresh = true
    this.from = from
    this.fromBox = this.box(from)
    this.to = to
    this.toBox = this.box(to)
    this.queued = null
    this.t = 0
    this.u = 0
    this.prev = 0
    this.dur = this.act.duration / speed
  }
}
