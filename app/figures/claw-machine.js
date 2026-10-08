/**
 * Claw machine: an arcade cabinet seen from above, its glass implied, with a
 * heap of capsule toys on the floor and a three-prong claw hanging from a
 * gantry. The pointer steers the carriage over the floor on springs, clamped
 * to the cabinet. Over a capsule the claw dips toward it, the capsule takes the
 * bright stroke, and its neighbours stir, staggered outwards. At rest the claw
 * is parked over the prize chute, prongs a little open. The slider is the dip.
 *
 * Capsules are hit on their own resting tops. The claw never sinks into the lid
 * under it, and hangs in the heap's depth order, so nearer capsules cover it.
 */
const {
  Cam, clamp, facing, fit, hull, open, poly, proj, prism, put, rad, ringAt, rings, rrect, run, seg,
  spring, stepS, tdone, tset, tval, tween, unproj, disposer, flatDot, mk, place, pointer, register, solid,
} = HL;

const W = 84, BH = 22, ZT = 104, FT = 4, PARK = [19, 65], ZP = BH + 36, OPEN = [5.6, 8.5];
const NAMES = ["seo", "hero-split", "blog", "search", "pricing", "auth", "nav", "faq", "forms", "footer", "cta"];
/** [x, y, R, h]: one layer of capsules either side of the near post, uneven in height, clear of the chute. */
const CAPS = [[34, 15, 6.5, 10], [49, 15, 6.5, 12], [64, 16, 6.5, 9], [42, 29, 6.5, 13], [57, 30, 7, 16], [66, 44, 6.5, 14],
  [50, 45, 6.5, 11], [20, 32, 6.5, 11], [24, 46, 6.5, 10], [37, 58, 6.5, 12], [47, 69, 6, 9]];
const circle = (x, y, r) => rrect(x - r, y - r, x + r, y + r, r, 6);

function mount({ stage, svg, read }, value) {
  const bag = disposer();
  let dip = clamp(value, 4, 30), act = -1;

  // Fitted to the cabinet, its control ledge and the gantry on top.
  const C = Cam(45, 0.5, 1.58);
  fit(C, [[0, 0, 0], [W, W, 0], [W, 0, 0], [0, W, 0], [76, W + 8, BH - 13], [0, 0, ZT + FT + 6]], 200, 166);
  const P = proj(C), front = facing(C), g = mk("g", {}, svg);
  const path = (d, cls, parent = g) => mk("path", { d, class: cls }, parent);
  const box = (x0, y0, x1, y1, r, b, z0, z1, el = solid(g)) => (put(el, prism(P, front, ...rings(x0, y0, x1, y1, r, b), z0, z1)), el);

  // the base: a door for the prize on its front, and a ledge with a joystick and a button
  box(0, 0, W, W, 6, 1.8, 0, BH);
  const onFront = (ring) => ring.map((q) => P(q.u, W, q.v));
  path(poly(onFront(rrect(10, 4, 28, 16, 2.5, 5))), "nf");
  path(poly(onFront(rrect(12.5, 6.5, 25.5, 10, 1.5, 5))), "nf lo");
  box(36, W - 1, 76, W + 8, 3, 1, BH - 13, BH - 6);
  path(seg(P(48, W + 3.5, BH - 6), P(48, W + 3.5, BH + 1)), "nf");
  box(45.6, W + 1.1, 50.4, W + 5.9, 2.4, 0.7, BH + 0.4, BH + 4.4);
  box(59, W + 1, 65, W + 6, 2.5, 0.7, BH - 6, BH - 4.4);

  // the far post and the two far bars of the frame; the glass between them is implied
  const post = (x, y) => box(x - 3.5, y - 3.5, x + 3.5, y + 3.5, 3.5, 1, BH, ZT + FT + 1.5);
  const barX = (y) => box(7.5, y - 3, W - 7.5, y + 3, 2.5, 1, ZT, ZT + FT);
  const barY = (x) => box(x - 3, 7.5, x + 3, W - 7.5, 2.5, 1, ZT, ZT + FT);
  post(4.5, 4.5); barX(4.5); barY(4.5);

  // the prize chute in the front-left corner: a low bin with a hole down into the base
  const cu = mk("g", {}, g), co = rrect(9, W - 29, 29, W - 9, 3.5, 6), ch = rrect(11.5, W - 26.5, 26.5, W - 11.5, 1.5, 6);
  path(poly(hull(ringAt(P, co, BH).concat(ringAt(P, co, BH + 12)))), "sil", cu);
  path(poly(ringAt(P, ch, BH + 12)), "nf", cu);
  path(open(ringAt(P, run(ch, (q) => !front(q)), BH + 5)), "nf lo", cu);

  // the capsules, back to front: two halves and a seam, and a dot code on the lid
  const caps = CAPS.map(([x, y, R, h], i) => ({ i, x, y, R, h, name: NAMES[i], lift: tween(0), last: NaN }))
    .sort((a, b) => a.x + a.y - (b.x + b.y));
  for (const c of caps) {
    c.grp = mk("g", {}, g);
    c.el = solid(c.grp);
    c.seam = path("", "nf lo", c.grp);
    c.dots = Array.from({ length: (c.i % 3) + 1 }, () => flatDot(c.grp, C, 0.6, "dot off"));
  }
  caps.find((c) => c.x + c.y > 84)?.grp.before(cu); // the chute takes its place in the depth order
  const layers = [...caps.map((c) => ({ k: c.x + c.y, g: c.grp })), { k: 84, g: cu }].sort((a, b) => a.k - b.k);
  function drawCap(c, L) {
    const z0 = BH + L, z1 = z0 + c.h, zs = z0 + c.h / 2, mid = circle(c.x, c.y, c.R);
    const at = (f, k) => ringAt(P, circle(c.x, c.y, c.R * f), z0 + c.h * k);
    put(c.el, {
      sil: poly(hull([...at(0.62, 0), ...at(0.92, 0.2), ...at(1, 0.5), ...at(0.92, 0.8), ...at(0.62, 1)])),
      crease: open(ringAt(P, run(circle(c.x, c.y, c.R * 0.62 - 1), front), z1)),
    });
    c.seam.setAttribute("d", open(ringAt(P, run(mid, front), zs)));
    c.dots.forEach((d, k) => { const o = (k - (c.dots.length - 1) / 2) * 1.8; place(d, P(c.x + o, c.y, z1)); });
  }

  // the claw: cable, three prongs, and the hub they hang from
  const cg = mk("g", {}, g), cable = path("", "nf", cg), prongs = path("", "nf sil", cg), hub = solid(cg);
  function drawClaw(x, y, t, o) {
    cable.setAttribute("d", seg(P(x, y, t + 11.5), P(x, y, ZT + FT)));
    prongs.setAttribute("d", [0, 120, 240].map((a) => {
      const ca = Math.cos(rad(a + 20)), sa = Math.sin(rad(a + 20));
      return open([[3.4, 7], [o - 0.6, 5.2], [o, 3.2], [o - 1.1, 1.3], [o - 2.6, 0]].map(([r, z]) => P(x + r * ca, y + r * sa, t + z)));
    }).join(""));
    box(x - 4.2, y - 4.2, x + 4.2, y + 4.2, 4.2, 1.1, t + 7, t + 11.5, hub);
  }

  // the near side of the frame, in front of everything inside
  post(W - 4.5, 4.5); post(4.5, W - 4.5); barX(W - 4.5); barY(W - 4.5); post(W - 4.5, W - 4.5);

  // the gantry: a bridge riding the frame, cut round the carriage that runs along it
  const bF = solid(g), car = solid(g), bN = solid(g);
  function drawGantry(x, y) {
    box(x - 3, 1.5, x + 3, y - 4.5, 2, 0.8, ZT + FT, ZT + FT + 3, bF);
    box(x - 6, y - 5, x + 6, y + 5, 2.5, 1, ZT + FT - 2, ZT + FT + 5.5, car);
    box(x - 3, y + 4.5, x + 3, W - 1.5, 2, 0.8, ZT + FT, ZT + FT + 3, bN);
  }

  /** The lowest the claw may hang at (x, y): clear of the lid of any capsule under it, easing off past its rim. */
  const ride = (x, y) => Math.max(...caps.map((c) => BH + (c.h + 5) * clamp((c.R + 3 - Math.hypot(x - c.x, y - c.y)) / 4, 0, 1)));

  const sx = spring(PARK[0]), sy = spring(PARK[1]), tip = tween(ZP), op = tween(OPEN[0]);
  let drawn = "", slot = 0;
  const B = register(stage, (dt, now) => {
    const a = stepS(sx, dt), b = stepS(sy, dt);
    const t = Math.max(tval(tip, now), ride(sx.x, sy.x)), o = tval(op, now), key = [sx.x, sy.x, t, o].join();
    if (key !== drawn) { drawn = key; drawClaw(sx.x, sy.x, t, o); drawGantry(sx.x, sy.x); }
    // the claw hangs in the depth order: capsules nearer than it are painted over it
    const nx = layers.find((l) => l.k > sx.x + sy.x + 1) || null;
    if (nx !== slot) { slot = nx; nx ? nx.g.before(cg) : layers[layers.length - 1].g.after(cg); }
    let m = a || b || !tdone(tip, now) || !tdone(op, now);
    for (const c of caps) {
      const L = tval(c.lift, now);
      if (L !== c.last) { c.last = L; drawCap(c, L); }
      if (!tdone(c.lift, now)) m = true;
    }
    return m;
  });
  bag.add(B.unregister);

  /** Capsule a takes the bright stroke and the claw's dip (-1: none). Neighbours stir, staggered by distance from it. */
  function choose(a, force = false) {
    if (a === act && !force) return;
    const now = performance.now(), from = caps[a >= 0 ? a : act];
    act = a;
    caps.forEach((c, k) => {
      const d = from ? Math.hypot(c.x - from.x, c.y - from.y) : 0;
      tset(c.lift, a < 0 ? 0 : k === a ? 3.5 : 2.6 * Math.max(0, 1 - d / 50), now, (d / 14) * 45);
      c.el.sil.classList.toggle("hi", k === a);
    });
    hub.sil.classList.toggle("hi", a < 0);
    prongs.classList.toggle("hi", a < 0);
    // the claw dips once the carriage is nearly over it, and rises at once
    const wait = a < 0 ? 0 : clamp(Math.hypot(sx.t - sx.x, sy.t - sy.x) * 8, 0, 400);
    tset(tip, a < 0 ? ZP : Math.max(ZP - dip, BH + caps[a].h + 5), now, wait);
    tset(op, OPEN[a < 0 ? 0 : 1], now, 0);
    read.textContent = a < 0 ? "rest" : caps[a].name;
    B.wake();
  }

  /** The capsule whose resting top, on its own plane, holds the pointer nearest its middle. */
  function hit([px, py]) {
    let best = -1, near = 1.15;
    caps.forEach((c, k) => {
      const [u, v] = unproj(C, px, py, BH + c.h), d = Math.hypot(u - c.x, v - c.y) / c.R;
      if (d < near) { near = d; best = k; }
    });
    return best;
  }

  /** The carriage follows the pointer over the floor (or the capsule's top), clamped inside the frame. */
  function steer(p) {
    const a = p ? hit(p) : -1;
    const [u, v] = p ? unproj(C, p[0], p[1], a >= 0 ? BH + caps[a].h : BH + 12) : PARK;
    sx.t = clamp(u, 16, 66);
    sy.t = clamp(v, 14, 70);
    choose(a);
    B.wake();
  }

  choose(-1, true);
  bag.add(pointer(stage, { move: steer, leave: () => steer(null) }));
  bag.add(() => svg.replaceChildren());

  return {
    set: (v) => { dip = clamp(v, 4, 30); choose(act, true); },
    destroy: bag.dispose,
  };
}

hairline({
  name: "claw-machine",
  means: "Registries as a prize pit: steer the claw over the heap and it dips for the feature underneath.",
  rules: [1, 3, 5, 6, 8],
  range: [12, 22, 32],
  tour: [[175, 192], [238, 186], [225, 209], null],
  mount,
});
