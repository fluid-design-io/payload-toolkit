import { Vector3 } from 'three'

import type { Footprint, Site } from '../../../core/contract'
import { smoothstep } from '../../../core/three'
import { Track, rounded } from '../track'

/**
 * The pneumatic course: one glass tube that leaves the send breech, shoots up
 * a riser tower, hangs over a crest, plunges along the back of the campus,
 * corkscrews round the far end, races back along the front, loops the loop
 * and dives into the receiver by the arm. Points are parts' bottom centres in the
 * transport's frame; capsule centres ride `OFF` above them.
 */
export const START = new Vector3(-6.8, 0.88, -1.2)
export const END = new Vector3(-1.0, 0.88, -1.2)
export const OFF = 0.32
/** The breech: the first stretch, crept at `SPEED` while the pressure builds. */
export const BREECH = 1.4
/** The sim's speed: the slowest a capsule ever goes, in m/s. */
export const SPEED = 0.9

export const TOP = 8.4
const LOW = 2.2
export const RISER = -4.3
const DIVE = -2.6
const SCREW = { len: 8, turns: 2.5, r: 1.15 }
/** The loop's entry, its radius and how far it drifts toward the board to clear itself. */
const LOOP = { x: 0, y: 2.6, r: 2.0, shift: 1.7 }
/** Corner radii: the riser's foot is tight, everything else sweeps. */
const R = { foot: 0.9, bend: 1.4 }

/** Metres per second: the blast up the riser, the hang over the crest, and gravity (a little friction) after it. */
const BLAST = 16
const CREST = 5
const G = 9.8 * 0.9

/** A post from the floor up to `top`, the tube's underside. */
export type Post = { x: number; z: number; top: number }
export type Course = { pts: Vector3[]; posts: Post[]; rate: (s: number) => number }

const up = new Vector3(0, 1, 0)

/** A corkscrew round the straight axis `a` to `b`, its radius easing in and out so it joins the straights tangent to them. */
function corkscrew(a: Vector3, b: Vector3) {
  const d = new Vector3().subVectors(b, a)
  const side = new Vector3().crossVectors(d, up).normalize()
  const n = Math.round(SCREW.turns * 48)
  const out: Vector3[] = []
  for (let i = 1; i < n; i++) {
    const t = i / n
    const th = t * SCREW.turns * Math.PI * 2
    const w = SCREW.r * smoothstep(t / 0.18) * smoothstep((1 - t) / 0.18)
    out.push(a.clone().addScaledVector(d, t).addScaledVector(up, -Math.cos(th) * w).addScaledVector(side, Math.sin(th) * w))
  }
  return out
}

/** A vertical loop entered heading `dir`, drifting `LOOP.shift` along `side` so the tube clears itself at the bottom. */
function loop(at: Vector3, dir: Vector3, side: Vector3) {
  const n = 120
  const out: Vector3[] = []
  for (let i = 1; i < n; i++) {
    const th = (i / n) * Math.PI * 2
    out.push(at.clone().addScaledVector(dir, LOOP.r * Math.sin(th)).addScaledVector(up, LOOP.r * (1 - Math.cos(th))).addScaledVector(side, LOOP.shift * smoothstep(i / n)))
  }
  return out
}

const inside = (f: Footprint, x: number, z: number, pad: number) => x > f.x0 - pad && x < f.x1 + pad && z > f.z0 - pad && z < f.z1 + pad

/**
 * The tube's route round the campus in `site`. The back lane clears the
 * rail and the arm's elbow; the corkscrew stays past the board's end and the
 * rail; the front lane clears the board's front row, and the loop stands in
 * front of the arm's bay, short of the board, where it faces the camera.
 */
export function courseOf(site: Site, own: Footprint): Course {
  const back = Math.min(site.board.z0, site.rail.z) - 1.5
  const front = Math.max(site.pick.z1, site.board.z1) + 1.3
  const far = Math.max(site.board.x1, site.rail.x1) + 2
  const { y, z } = START
  const deck = LOW + 1
  const screwIn = new Vector3(far, deck, back + 2.2)
  const screwOut = screwIn.clone().setZ(screwIn.z + SCREW.len)
  const loopIn = new Vector3(LOOP.x, LOOP.y, front)
  const loopOut = loopIn.clone().setZ(front - LOOP.shift)
  const run = Math.max(6, (far - 4.5) / 4)
  // The breech runs straight into a tight foot, so the riser leaves right after it.
  const foot = rounded([[START.x, y, z], [RISER, y, z], [RISER, y + 2 * R.foot, z]], R.foot)
  const climb = rounded([
    [RISER, y + 2 * R.foot, z], [RISER, TOP, z], [RISER, TOP, back], [RISER + 1.2, TOP, back], [4.5, LOW, back],
    [4.5 + run, LOW, back], [4.5 + run * 1.8, LOW + 3, back], [4.5 + run * 2.6, LOW + 0.3, back], [far, deck, back], screwIn.toArray(),
  ], R.bend)
  const sweep = rounded([screwOut.toArray(), [far, 5.2, front], [LOOP.x + 9, 5.2, front], [LOOP.x + 4, LOOP.y, front], loopIn.toArray()], R.bend)
  const home = rounded([loopOut.toArray(), [DIVE, LOOP.y, loopOut.z], [DIVE, y, z], [END.x, y, z]], R.bend)
  const pts = [...foot, ...climb, ...corkscrew(screwIn, screwOut), ...sweep, ...loop(loopIn, new Vector3(-1, 0, 0), new Vector3(0, 0, -1)), ...home]
    .filter((p, i, all) => !i || p.distanceToSquared(all[i - 1]) > 1e-6)
  const track = new Track(pts)
  return { pts, posts: postsOf(track, site, own, [new Vector3(RISER, TOP, (z + back) / 2 - 0.5), screwIn, screwOut, loopIn, loopOut]), rate: rateOf(track) }
}

/**
 * Posts every few metres under the level stretches, clear of every station
 * and the arm's reach; the crest, the corkscrew and the loop stand on posts
 * of their own.
 */
function postsOf(track: Track, site: Site, own: Footprint, ends: Vector3[]): Post[] {
  const arm: Footprint = { x0: site.rail.x0 - 2, x1: site.rail.x1 + 0.6, z0: site.rail.z - 0.6, z1: END.z + 1.2, h: 0 }
  const clear = (x: number, z: number) => ![site.pick, site.board, own, arm].some((f) => inside(f, x, z, 0.5))
  const out: Post[] = ends.map((p) => ({ x: p.x, z: p.z, top: p.y + OFF - 0.7 }))
  const p = new Vector3(), t = new Vector3()
  for (let s = 6; s < track.len - 6; s += 4.2) {
    track.point(s, p)
    track.tangent(s, t)
    if (Math.abs(t.y) > 0.35 || p.y < 1.6 || !clear(p.x, p.z) || ends.some((e) => Math.hypot(e.x - p.x, e.z - p.z) < 3.4)) continue
    out.push({ x: p.x, z: p.z, top: p.y + OFF - 0.7 })
  }
  return out
}

/**
 * How many times `SPEED` a capsule goes at `s`: the breech creeps, the riser
 * blasts, the crest hangs, and from there on height buys speed, so it
 * crawls over the loop's top and screams into the dive.
 */
function rateOf(track: Track) {
  const p = new Vector3()
  let rise = track.len
  for (let s = 0; s < track.len; s += 0.1) if (track.point(s, p).y > TOP - 1) {
    rise = s
    break
  }
  return (s: number) => {
    if (s < BREECH) return 1
    const h = track.point(s, p).y
    const climbing = s < rise
    const blast = BLAST * smoothstep((s - BREECH) / 0.5) * (climbing ? 1 : 1 - smoothstep((s - rise) / 1.5))
    const fall = climbing ? 0 : Math.sqrt(CREST * CREST + 2 * G * Math.max(0, TOP - h))
    return Math.max(SPEED, blast, fall) / SPEED
  }
}
