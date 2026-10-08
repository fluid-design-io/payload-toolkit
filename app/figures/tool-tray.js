/**
 * Tool tray: a fitted case with a combination wrench, a screwdriver and a
 * ratchet, each seated in a foam cut-out of its own outline. The tool under
 * the pointer lifts clear of its pocket and shows the cut it came from; its
 * neighbours stir a little, staggered outwards from it. At rest the ratchet
 * sits half out, as if just put back. The slider is the lift.
 *
 * Seated tools are drawn only above the foam (T), so the foam hides what is
 * sunk; the hit test reads each tool's resting top, never its lifted pose.
 */
const {
  Cam, clamp, facing, fillet, fit, hull, open, poly, proj, put, rad, ringAt, rings, rrect, run,
  solid, tdone, tset, tval, tween, unproj, disposer, mk, pointer, prism, register,
} = HL;

const X0 = -58, X1 = 58, Y0 = -62, Y1 = 62, H = 14, T = 10, WT = 3, WR = 9, GAP = 1.4, DEEP = 2.6;

/** A closed outline from [u, v, r] corners: rounded where r > 0, kept where r is 0. */
const shape = (pts) => fillet(pts.map((p) => [p[0], p[1]]), pts.map((p) => p[2])).filter(
  (p, i, a) => Math.hypot(p[0] - a[(i + a.length - 1) % a.length][0], p[1] - a[(i + a.length - 1) % a.length][1]) > 0.01);
const arc = (cu, cv, R, a0, a1, n) => Array.from({ length: n + 1 }, (_, k) => {
  const a = rad(a0 + (a1 - a0) * k / n);
  return [cu + R * Math.cos(a), cv + R * Math.sin(a), 0];
});
const mirror = (half) => half.concat(half.slice().reverse().map(([u, v, r]) => [-u, v, r]));

/** Samples of an outline with outward normals, as rrect gives them, pushed out by `out`. */
function samp(pts, out = 0) {
  const n = pts.length;
  let A = 0;
  pts.forEach((p, i) => { const q = pts[(i + 1) % n]; A += p[0] * q[1] - q[0] * p[1]; });
  return pts.map((p, i) => {
    const a = pts[(i + n - 1) % n], b = pts[(i + 1) % n], s = A > 0 ? 1 : -1;
    const nu = s * (b[1] - a[1]), nv = -s * (b[0] - a[0]), l = Math.hypot(nu, nv) || 1;
    return { u: p[0] + nu / l * out, v: p[1] + nv / l * out, nu: nu / l, nv: nv / l };
  });
}

/** Each cyclic run of samples that pass keep. */
function runs(ring, keep) {
  const n = ring.length, s = Math.max(0, ring.findIndex((q) => !keep(q))), out = [];
  let cur = [];
  for (let i = 1; i <= n; i++) {
    const q = ring[(s + i) % n];
    if (keep(q)) cur.push(q);
    else if (cur.length) { out.push(cur); cur = []; }
  }
  if (cur.length) out.push(cur);
  return out;
}

/** The combination wrench: an open end canted 15° at the far end, a box end at the near one. */
const JAW = [[9.5, 3, 4], [10.5, -3, 4], [8.6, -9.5, 1.6], [4, -9.5, 0.8], [4, -1, 2.6],
  [-4, -1, 2.6], [-4, -9.5, 0.8], [-8.6, -9.5, 1.6], [-10.5, -3, 4], [-9.5, 3, 4]];
const cant = ([u, v, r]) => { const c = Math.cos(rad(15)), s = Math.sin(rad(15)); return [u * c - v * s, u * s + v * c - 40, r]; };
const WRENCH = shape([[4.2, -27, 3], ...JAW.map(cant), [-4.2, -27, 3], ...arc(0, 40, 9, 242.3, -62.3, 20)]);
const DRIVER = shape(mirror([[7.5, -48, 5], [7.5, -11, 1.5], [4.5, -11, 1], [4.5, -5, 1], [1.7, -5, 0.8],
  [1.7, 40, 0.5], [2.4, 40.6, 0.5], [2.4, 47, 0.8]]).reverse());
const RATCHET = shape([[5.2, -46, 3.5], [5.2, -8, 1], [3.6, -8, 1], ...arc(0, 33, 11, -70.9, 250.9, 28),
  [-3.6, -8, 1], [-5.2, -8, 1], [-5.2, -46, 3.5]]);

/** Parts in paint order, far to near and low to high: a plate (pts) or a rounded solid (box). */
const TOOLS = [
  { name: "wrench", x: -34, w: 11, top: 11, rest: 0, outline: WRENCH,
    parts: [{ pts: WRENCH, z0: 8, z1: 11 }],
    marks: (Q, z) => [poly(ringAt(Q, rrect(-4.8, 35.2, 4.8, 44.8, 4.8, 6), z + 11)),
      poly(ringAt(Q, rrect(-1.5, -25, 1.5, 28, 1.5, 4), z + 11))] },
  { name: "screwdriver", x: 0, w: 8, top: 16, rest: 0, outline: DRIVER,
    parts: [{ box: [-7.5, -48, 7.5, -11, 5, 1.3], z0: 4, z1: 16 }, { box: [-4.5, -11.4, 4.5, -5, 2.4, 0.8], z0: 6, z1: 14 },
      { box: [-1.7, -5.4, 1.7, 41, 1.6, 0.6], z0: 8.3, z1: 11.7 }, { box: [-2.4, 40.4, 2.4, 47, 0.8, 0.5], z0: 9.4, z1: 10.9 }],
    marks: (Q, z) => ["", [-3.4, 0, 3.4].map((u) => open([Q(u, -43, z + 16), Q(u, -17, z + 16)])).join("")] },
  { name: "ratchet", x: 34, w: 11, top: 13, rest: 7, outline: RATCHET,
    parts: [{ box: [-5.2, -46, 5.2, -8, 3.6, 1], z0: 6, z1: 13 }, { box: [-3.6, -8.4, 3.6, 23.4, 3.4, 0.8], z0: 7, z1: 12 },
      { ring: [rrect(-11, 22, 11, 44, 11, 14), rrect(-9.8, 23.2, 9.8, 42.8, 9.8, 14)], z0: 6, z1: 13.4 },
      { box: [-2.6, 24, 2.6, 30.6, 1.8, 0.6], z0: 13.4, z1: 15.2 }],
    marks: (Q, z) => ["", poly(ringAt(Q, rrect(-3, 34, 3, 40, 3, 4), z + 13.4))] },
];

function mount({ stage, svg, read }, value) {
  const bag = disposer();
  let lift = clamp(value, 12, 32), act = -1;

  // Fitted to the tray and to each tool at the slider's full lift.
  const C = Cam(45, 0.5, 1.75);
  fit(C, [[X0, Y0, 0], [X1, Y1, 0], [X0, Y1, 0], [X1, Y0, 0], [X0, Y0, H], [-45, -50, 43], [-7.5, -48, 48], [39, -46, 45]], 200, 166);
  const P = proj(C), front = facing(C);
  const outer = rrect(X0, Y0, X1, Y1, WR, 6), inner = rrect(X0 + WT, Y0 + WT, X1 - WT, Y1 - WT, WR - WT, 6);
  const LR = (pts) => (pts[0][0] <= pts[pts.length - 1][0] ? pts : pts.slice().reverse());
  const g = mk("g", {}, svg);

  // far half of the case: body, rim, and the seam where the foam meets the far walls
  mk("path", { d: poly(hull(ringAt(P, outer, 0).concat(ringAt(P, outer, H)))), class: "sil" }, g);
  mk("path", { d: poly(ringAt(P, inner, H)), class: "nf" }, g);
  mk("path", { d: open(ringAt(P, run(inner, (q) => !front(q)), T)), class: "nf lo" }, g);

  // the cut-outs: each tool's outline, eased out by GAP, with the floor seam along the walls that face the eye
  for (const t of TOOLS) {
    const Q = (u, v, z) => P(u + t.x, v, z), cut = samp(t.outline, GAP);
    mk("path", { d: poly(ringAt(Q, cut, T)), class: "nf lo" }, g);
    mk("path", { d: runs(cut, (q) => q.nu + q.nv < -0.6).map((r) => open(ringAt(Q, r, T - DEEP))).join(""), class: "nf lo" }, g);
  }

  const tools = TOOLS.map((t) => {
    const grp = mk("g", {}, g);
    const els = t.parts.map((p) => (p.pts ? { back: mk("path", { class: "lo" }, grp), face: mk("path", { class: "sil" }, grp) } : solid(grp)));
    const mid = mk("path", { class: "nf" }, grp), dim = mk("path", { class: "nf lo" }, grp);
    return { ...t, els, mid, dim, z: tween(t.rest), last: null };
  });

  // near half of the case: one opaque wall from the rim down, its edges, and a finger pull
  const iF = LR(ringAt(P, run(inner, front), H)), oT = LR(ringAt(P, run(outer, front), H)), oB = LR(ringAt(P, run(outer, front), 0));
  const onFront = (ring) => ring.map((q) => P(q.u, Y1, q.v));
  mk("path", { d: poly([...iF, oT[oT.length - 1], ...oB.slice().reverse(), oT[0]]), class: "fo" }, g);
  mk("path", { d: open(oT), class: "nf lo" }, g);
  mk("path", { d: open(iF), class: "nf" }, g);
  mk("path", { d: open([oT[0], ...oB, oT[oT.length - 1]]), class: "nf sil" }, g);
  mk("path", { d: poly(onFront(rrect(-12, 4.5, 12, 10, 2.7, 5))), class: "nf" }, g);
  mk("path", { d: poly(onFront(rrect(-10.4, 6, 10.4, 8.5, 1.2, 5))), class: "nf lo" }, g);

  /** Tool t lifted by z. Below the foam nothing is drawn: the foam hides it. */
  function draw(t, z) {
    const Q = (u, v, w) => P(u + t.x, v, w);
    t.parts.forEach((p, k) => {
      const z0 = Math.max(p.z0 + z, T), z1 = p.z1 + z, el = t.els[k];
      if (p.pts) {
        el.back.setAttribute("d", poly(p.pts.map(([u, v]) => Q(u, v, z0))));
        el.face.setAttribute("d", poly(p.pts.map(([u, v]) => Q(u, v, z1))));
      } else put(el, prism(Q, front, ...(p.ring || rings(...p.box)), z0, z1));
    });
    const [m, d] = t.marks(Q, z);
    t.mid.setAttribute("d", m);
    t.dim.setAttribute("d", d);
  }

  const B = register(stage, (_dt, now) => {
    let moving = false;
    for (const t of tools) {
      const z = tval(t.z, now);
      if (z !== t.last) { draw(t, z); t.last = z; }
      if (!tdone(t.z, now)) moving = true;
    }
    return moving;
  });
  bag.add(B.unregister);

  /** Lifts tool a (-1 seats them all). The stagger spreads from the tool lifted, or the one let go. */
  function choose(a, force = false) {
    if (a === act && !force) return;
    const now = performance.now(), from = a >= 0 ? a : Math.max(act, 0);
    act = a;
    tools.forEach((t, i) => {
      const d = Math.abs(i - from), to = a < 0 ? t.rest : i === a ? lift : lift * 0.16 / d;
      tset(t.z, to, now, d * 45);
      const hi = a < 0 ? t.rest > 0 : i === a;
      t.els.forEach((el) => (el.face || el.sil).classList.toggle("hi", hi));
    });
    read.textContent = a < 0 ? "rest" : tools[a].name;
    B.wake();
  }

  /** The tool whose resting top, on its own plane, holds the pointer nearest its axis. */
  function hit([sx, sy]) {
    let best = -1, near = Infinity;
    TOOLS.forEach((t, i) => {
      const [u, v] = unproj(C, sx, sy, t.top + t.rest), d = Math.abs(u - t.x);
      if (d < t.w + 6 && v > -54 && v < 52 && d < near) { best = i; near = d; }
    });
    return best;
  }

  choose(-1, true);
  bag.add(pointer(stage, { move: (p) => choose(hit(p)), leave: () => choose(-1) }));
  bag.add(() => svg.replaceChildren());

  return {
    set: (v) => { lift = clamp(v, 12, 32); choose(act, true); },
    destroy: bag.dispose,
  };
}

hairline({
  name: "tool-tray",
  means: "A fitted tool tray: point at the wrench, screwdriver or ratchet and it lifts clear of its foam cut-out.",
  rules: [1, 2, 5, 6, 9],
  range: [12, 22, 32],
  tour: [[158, 153], [237, 148], [242, 182], null],
  mount,
});
