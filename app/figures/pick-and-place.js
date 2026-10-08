/**
 * Pick-and-place: a SCARA arm on a boxy base at the far corner of a circuit
 * board. Two flat links swing on vertical pivots and a quill slides through
 * the tip, holding one chip. The pointer's point on the board sets where the
 * tip goes: yaw and reach are springs, and two-link IK, elbow always on the
 * same side, turns them into the links. The footprint nearest that point,
 * picked from the pointer and never from the arm, takes the bright pads; the
 * chip takes its shape on the 700ms curve, and once the tip has arrived the
 * quill plunges and seats it. At rest the arm is folded over the feeder, the
 * held chip bright. The slider is the reach.
 *
 * Paint order is honest by height: base, feeder and board, then the lower
 * link, the chip and the quill under the upper link, the upper link, its caps
 * and the quill's top. A part strictly above another never sits behind it.
 * Nothing is drawn below the board's top, so a seated chip sits on its pads.
 */
const {
  Cam, circ, clamp, facing, fit, open, poly, prism, proj, put, rad, ringAt, rings, rrect,
  solid, spring, stepS, tdone, tset, tval, tween, unproj, disposer, mk, pointer, register,
} = HL;

const X0 = -44, X1 = 44, Y0 = -34, Y1 = 34, PT = 4, TZ = 5;
const SX = -60, SY = -50, ZL = 30, T = 6, L1 = 60, L2 = 56, QL = 40;
const ZH = PT + 16, AMIN = rad(-8), AMAX = rad(100), RMIN = 34;
/** A chip: half length, half width, corner, height, legs along u, legs along v. */
const SHAPES = { forms: [6, 6, 1.2, 3.2, 2, 2], seo: [12, 3, 1, 6, 0, 0], auth: [4.4, 2, 0.8, 2.6, 0, 0], blog: [6, 6, 6, 7, 0, 0] };
const FEED = [4, -49], SPARE = [[23, -49], [42, -49]];
const REST = { a: Math.atan2(FEED[1] - SY, FEED[0] - SX), r: Math.hypot(FEED[0] - SX, FEED[1] - SY) };

const at = (x, y, ring) => ring.map((q) => ({ ...q, u: q.u + x, v: q.v + y }));
const qfp = [];
for (let k = 0; k < 4; k++) {
  const t = -3.9 + 2.6 * k;
  qfp.push(rrect(6.6, t - 0.7, 9.4, t + 0.7, 0.5, 2), rrect(-9.4, t - 0.7, -6.6, t + 0.7, 0.5, 2),
    rrect(t - 0.7, 6.6, t + 0.7, 9.4, 0.5, 2), rrect(t - 0.7, -9.4, t + 0.7, -6.6, 0.5, 2));
}
/** The footprints, in the board's own units: where each sits, its silkscreen and its pads. */
const FEET = [
  { name: "forms", x: -10, y: 6, silk: [rrect(-6.8, -6.8, 6.8, 6.8, 1.4, 3)], pads: qfp },
  { name: "seo", x: 24, y: -14, silk: [rrect(-13.5, -4, 13.5, 4, 1.5, 3)], pads: [0, 1, 2, 3, 4, 5].map((k) => at(-10 + 4 * k, 0, circ(1.3, 10))) },
  { name: "auth", x: -30, y: 22, silk: [], pads: [rrect(-6.8, -2.3, -3, 2.3, 0.8, 3), rrect(3, -2.3, 6.8, 2.3, 0.8, 3)] },
  { name: "blog", x: 16, y: 20, silk: [circ(8.4, 32)], pads: [rrect(-4.6, -1.3, -2, 1.3, 0.6, 2), rrect(2, -1.3, 4.6, 1.3, 0.6, 2)] },
];
const TRACES = [
  [[-1.4, 3.9], [6, 3.9], [10, -0.1], [10, -10], [14, -14]],
  [[-11.3, 15.4], [-11.3, 18], [-15.3, 22], [-23.2, 22]],
  [[-1.4, 1.3], [4, 1.3], [8, 5.3], [8, 16], [11.4, 19.4]],
  [[20.6, 20], [30, 20], [36, 26], [36, 34]],
  [[-37, 22], [-40, 22], [-40, 10], [-36, 6], [-19.4, 6]],
];

/** A flat link round A and B, radii ra and rb, as a ring of samples with outward normals. */
function linkRing(A, B, ra, rb) {
  const dir = Math.atan2(B[1] - A[1], B[0] - A[0]), al = Math.acos(clamp((ra - rb) / Math.hypot(B[0] - A[0], B[1] - A[1]), -1, 1)), out = [];
  const arc = (c, R, t0, t1) => { for (let k = 0; k <= 10; k++) { const t = t0 + (t1 - t0) * k / 10; out.push({ u: c[0] + R * Math.cos(t), v: c[1] + R * Math.sin(t), nu: Math.cos(t), nv: Math.sin(t) }); } };
  arc(B, rb, dir - al, dir + al);
  arc(A, ra, dir + al, dir + 2 * Math.PI - al);
  return out;
}

function mount({ stage, svg, read }, value) {
  const bag = disposer();
  let reach = clamp(value, 80, 112), over = null, pick = -2, key = "", goal = { ...REST, seat: false };

  // Fitted to the board, the feeder and the base, with the arm's elbow at its widest and the quill raised.
  const C = Cam(45, 0.5, 2.05);
  fit(C, [[X0, Y0, 0], [X1, Y1, 0], [X0, Y1, 0], [54, -60, 0], [SX - 12, SY - 12, ZL + T], [-112, -4, ZL + 2 * T], [FEED[0], FEED[1], 66]], 200, 166);
  const P = proj(C), front = facing(C);
  const g = mk("g", {}, svg), Q = (x, y) => (u, v, z) => P(x + u, y + v, z);

  // the base, the feeder with its two spares, then the board with its holes, traces and footprints
  put(solid(g), prism(P, front, ...rings(SX - 11, SY - 11, SX + 11, SY + 11, 5, 1.6), 0, ZL));
  put(solid(g), prism(P, front, ...rings(-8, -60, 54, -38, 4, 1.4), 0, TZ));
  mk("path", { d: [FEED, ...SPARE].map(([x, y]) => poly(ringAt(Q(x, y), rrect(-8.8, -8.8, 8.8, 8.8, 2, 3), TZ))).join(""), class: "nf lo" }, g);
  const spares = SPARE.map(() => ({ body: solid(g), legs: mk("path", { class: "nf" }, g) }));
  put(solid(g), prism(P, front, ...rings(X0, Y0, X1, Y1, 5, 1.6), 0, PT));
  const holes = [[X0 + 5, Y0 + 5], [X1 - 5, Y0 + 5], [X0 + 5, Y1 - 5], [X1 - 5, Y1 - 5]];
  mk("path", { d: holes.map(([x, y]) => poly(ringAt(Q(x, y), circ(2, 12), PT))).join(""), class: "nf lo" }, g);
  mk("path", { d: TRACES.map((t) => open(t.map(([x, y]) => P(x, y, PT)))).join(""), class: "nf lo" }, g);
  const feet = FEET.map((f) => {
    const F = Q(f.x, f.y);
    const silk = mk("path", { d: f.silk.map((r) => poly(ringAt(F, r, PT))).join(""), class: "nf lo" }, g);
    return { ...f, silk, el: mk("path", { d: f.pads.map((r) => poly(ringAt(F, r, PT))).join(""), class: "nf" }, g) };
  });

  // the arm, low to high: lower link, the chip and the quill beneath the upper link, upper link, caps, quill top
  const arm = { l1: solid(g), motor: mk("path", { class: "nf lo" }, g), chip: solid(g), legs: mk("path", { class: "nf" }, g) };
  ["noz", "qlo", "l2", "cap", "boss", "qhi"].forEach((k) => { arm[k] = solid(g); });

  /** A chip of shape s at (x, y), its base at zb: a rounded solid, and gull-wing legs on the sides that face the eye. */
  function chip(el, legs, x, y, zb, s) {
    const [hu, hv, r, h, lu, lv] = s, F = Q(x, y);
    put(el, prism(F, front, ...rings(-hu, -hv, hu, hv, r, Math.min(1, hv * 0.4)), zb, zb + h));
    let d = "";
    for (const [nu, nv, L] of [[1, 0, lv], [-1, 0, lv], [0, 1, lu], [0, -1, lu]]) {
      if (L < 0.3 || !front({ nu, nv })) continue;
      const n = clamp(Math.round(((nu ? hv : hu) * 2 - 2) / 2.6), 1, 6);
      for (let k = 0; k < n; k++) {
        const t = (k - (n - 1) / 2) * 2.6, w = (o, z) => (nu ? F(nu * (hu + o), t, z) : F(t, nv * (hv + o), z));
        d += open([w(0, zb + 1.3), w(L * 0.4, zb + 1.3), w(L * 0.7, zb), w(L, zb)]);
      }
    }
    legs.setAttribute("d", d);
  }
  const cyl = (el, x, y, R, z0, z1) => put(el, prism(Q(x, y), front, ...rings(-R, -R, R, R, R, Math.min(1, R * 0.35)), z0, z1));
  SPARE.forEach(([x, y], i) => chip(spares[i].body, spares[i].legs, x, y, TZ, SHAPES.forms));

  const sp = { a: spring(REST.a), r: spring(REST.r) }, zt = tween(ZH), sh = SHAPES.forms.map((v) => tween(v));

  function draw(now) {
    const a = sp.a.x, r = sp.r.x, be = Math.acos(clamp((L1 * L1 + r * r - L2 * L2) / (2 * L1 * r), -1, 1));
    const S0 = [SX, SY], E = [SX + L1 * Math.cos(a + be), SY + L1 * Math.sin(a + be)], W = [SX + r * Math.cos(a), SY + r * Math.sin(a)];
    const s = sh.map((t) => tval(t, now)), zb = tval(zt, now), zn = zb + s[3];
    put(arm.l1, prism(P, front, linkRing(S0, E, 10, 7.5), linkRing(S0, E, 8.4, 5.9), ZL, ZL + T));
    arm.motor.setAttribute("d", poly(ringAt(Q(SX, SY), circ(5.5, 16), ZL + T)));
    chip(arm.chip, arm.legs, W[0], W[1], zb, s);
    cyl(arm.noz, W[0], W[1], 1.3, zn, zn + 3);
    cyl(arm.qlo, W[0], W[1], 2.4, zn + 3, ZL + T);
    put(arm.l2, prism(P, front, linkRing(E, W, 7.5, 6), linkRing(E, W, 5.9, 4.4), ZL + T, ZL + 2 * T));
    cyl(arm.cap, E[0], E[1], 5.5, ZL + 2 * T, ZL + 2 * T + 2.5);
    cyl(arm.boss, W[0], W[1], 4.4, ZL + 2 * T, ZL + 2 * T + 4);
    cyl(arm.qhi, W[0], W[1], 2.4, ZL + 2 * T + 4, zn + 3 + QL);
  }

  const B = register(stage, (dt, now) => {
    let moving = false;
    // the arm swings only with the quill up, and plunges only once the tip is there
    if (tval(zt, now) > PT + 7) { sp.a.t = goal.a; sp.r.t = goal.r; }
    if (sp.a.t !== goal.a || sp.r.t !== goal.r) moving = true;
    for (const k in sp) if (stepS(sp[k], dt)) moving = true;
    const there = sp.a.t === goal.a && Math.hypot((sp.a.x - goal.a) * goal.r, sp.r.x - goal.r) < 2.5;
    tset(zt, goal.seat && there ? PT : ZH, now, 0);
    if (!tdone(zt, now) || sh.some((t) => !tdone(t, now))) moving = true;
    const k = [sp.a.x, sp.r.x, tval(zt, now), ...sh.map((t) => tval(t, now))].map((v) => v.toFixed(3)).join();
    if (k !== key) { key = k; draw(now); }
    return moving;
  });
  bag.add(B.unregister);

  /** Picks the footprint within 26 of the pointer's point on the board, and sets the tip's goal from it. */
  function aim() {
    let best = -1, near = 26;
    if (over) feet.forEach((f, i) => { const d = Math.hypot(f.x - over[0], f.y - over[1]); if (d < near) { near = d; best = i; } });
    // the tip keeps to the board and the feeder: a pointer beyond them is held at their edge
    const [tx, ty] = best >= 0 ? [feet[best].x, feet[best].y] : over ? [clamp(over[0], X0, 50), clamp(over[1], -54, Y1)] : FEED, D = Math.hypot(tx - SX, ty - SY);
    goal = over ? { a: clamp(Math.atan2(ty - SY, tx - SX), AMIN, AMAX), r: clamp(D, RMIN, reach), seat: best >= 0 && D <= reach } : { ...REST, seat: false };
    // the chosen footprint's pads and silkscreen take the bright stroke, so it still shows round a seated chip
    feet.forEach((f, i) => { f.el.setAttribute("class", i === best ? "nf hi" : "nf"); f.silk.setAttribute("class", i === best ? "nf hi" : "nf lo"); });
    if (best !== pick) {
      pick = best;
      const now = performance.now(), to = best >= 0 ? SHAPES[feet[best].name] : SHAPES.forms;
      sh.forEach((t, i) => tset(t, to[i], now, 0));
      arm.chip.sil.classList.toggle("hi", best < 0);
      read.textContent = best >= 0 ? feet[best].name : "rest";
    }
    B.wake();
  }

  aim();
  bag.add(pointer(stage, {
    move: (p) => { over = unproj(C, p[0], p[1], PT); aim(); },
    leave: () => { over = null; aim(); },
  }));
  bag.add(() => svg.replaceChildren());

  return {
    set: (v) => { reach = clamp(v, 80, 112); aim(); },
    destroy: bag.dispose,
  };
}

hairline({
  name: "pick-and-place",
  means: "Pick and place: the arm swings a feature chip over the board and seats it on the footprint under the pointer.",
  rules: [1, 3, 5, 6, 8],
  range: [80, 104, 112],
  tour: [[172, 208], [251, 218], [190, 237], null],
  mount,
});
