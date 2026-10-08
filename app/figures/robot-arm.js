/**
 * Robot arm: a desk arm, an anglepoise with a gripper for a shade, bolted to
 * one end of a low plate, the host app, which has four empty sockets of four
 * shapes. Where the pointer lands on the plate is where the arm reaches: yaw,
 * reach and wrist height are springs, and two-link IK turns them into shoulder
 * and elbow, so the links can never part or fold through each other. The
 * socket nearest that point, picked from the pointer and never from the arm,
 * takes the bright rim, its neighbours the medium one, and the block in the
 * gripper takes that socket's shape on the 700ms curve. Once the arm is over
 * the socket it lowers the block in, drawn only above the plate's top, and
 * lifts it straight out again before it swings anywhere else. At rest the arm
 * is curled up, head cocked, the block held to its chest and bright. The
 * slider is the reach.
 *
 * Paint order is fixed: the yaw is clamped to the half-turn that faces the
 * viewer, so the far link, hubs, near link and head never change depth, and
 * the two fingers swap geometry, not nodes, when the head turns.
 */
const {
  Cam, circ, clamp, facing, fit, flatDot, hull, open, place, poly, prism, proj, put, rad, rrect, run,
  solid, spring, stepS, tdone, tset, tval, tween, unproj, disposer, mk, pointer, register,
} = HL;

const BX = -28, BY = 21, PT = 6, ZS = 26, L1 = 46, L2 = 42, OH = 5, HANG = 21, X0 = -44, X1 = 44, Y0 = -37, Y1 = 37;
const AMIN = rad(-76), AMAX = rad(-8), RMIN = 24, CLEAR = PT + HANG + 1, SEAT = PT + HANG - 5.5;
const S = 2.25;
const SHAPES = { forms: [6.5, 6.5, 2.2], seo: [6.5, 6.5, 6.5], blog: [10, 4, 1.6], auth: [4, 8, 4] };
const REST = { a: rad(-36), r: 30, z: ZS + 30, p: rad(-30), seat: false };

/** Yaw and reach that put the block's centre, which hangs OH to the side of the arm's plane, over (x, y). */
function aimAt(x, y) {
  const dx = x - BX, dy = y - BY, r = Math.sqrt(Math.max(dx * dx + dy * dy - OH * OH, 1));
  return [Math.atan2(dy, dx) - Math.atan2(OH, r), r];
}

const SOCKETS = [["forms", -66, 50], ["blog", -42, 66], ["seo", -34, 40], ["auth", -16, 62]].map(([name, a, r]) => {
  const x = BX + r * Math.cos(rad(a)), y = BY + r * Math.sin(rad(a));
  return { name, x, y, f: aimAt(x, y)[0], sh: SHAPES[name] };
});

function mount({ stage, svg, read }, value) {
  const bag = disposer();
  let reach = clamp(value, 48, 88), over = null, pick = -2, key = "", want = REST;

  // Fitted to the plate, the curled arm's elbow, and the hovering head at the plate's edge at both ends of the yaw.
  const C = Cam(45, 0.5, S), ext = [];
  for (const a of [AMIN, AMAX]) ext.push([clamp(BX + 86 * Math.cos(a), X0, X1), clamp(BY + 86 * Math.sin(a), Y0, Y1), 44]);
  fit(C, [[X0, Y0, 0], [X1, Y1, 0], [X0, Y1, 0], [X1, Y0, 0], [BX - 10, BY + 6, 80], ...ext], 200, 166);
  const P = proj(C), front = facing(C);
  const g = mk("g", {}, svg);

  // the plate, and its sockets: a rim on the top, and a seam on the floor along the walls that face the eye
  const pr = rrect(X0, Y0, X1, Y1, 14, 12), pi = rrect(X0 + 2, Y0 + 2, X1 - 2, Y1 - 2, 12, 12);
  put(solid(g), prism(P, front, pr, pi, 0, PT));
  const socks = SOCKETS.map((s) => {
    const [hu, hv, r] = s.sh, ring = rrect(-hu - 1.6, -hv - 1.6, hu + 1.6, hv + 1.6, r + 1.6, 6);
    const c = Math.cos(s.f), n = Math.sin(s.f), at = (rg, z) => rg.map((q) => P(s.x + q.u * c - q.v * n, s.y + q.u * n + q.v * c, z));
    mk("path", { d: open(at(run(ring, (q) => q.nu * (c + n) + q.nv * (c - n) < -0.6), PT - 2.6)), class: "nf lo" }, g);
    return { ...s, rim: mk("path", { d: poly(at(ring, PT)), class: "nf lo" }, g) };
  });

  // the round foot, bolted down, and the turret the shoulder sits on
  const Q = (u, v, z) => P(BX + u, BY + v, z);
  put(solid(g), prism(Q, front, circ(14, 28), circ(12.4, 28), PT, PT + 4));
  [60, 180, 300].forEach((a) => place(flatDot(g, C, 0.9, "dot off"), Q(11 * Math.cos(rad(a)), 11 * Math.sin(rad(a)), PT + 4)));
  put(solid(g), prism(Q, front, circ(7.5, 24), circ(6.1, 24), PT + 4, ZS - 3));

  // the arm, far to near: upper link, shoulder and elbow hubs, forearm, wrist, far finger, block, palm, near finger
  const arm = {};
  ["up", "sh", "el", "fo", "wr", "f0", "blk", "palm", "f1"].forEach((k) => { arm[k] = solid(g); });

  /** A link or a hub: two discs of radius w round A and B in the arm's plane, t thick, centred o off it. */
  function bar(el, F, A, B, w, o, t) {
    const disc = (c, R, oo) => Array.from({ length: 16 }, (_, k) => F(c[0] + R * Math.cos(k * Math.PI / 8), c[1] + R * Math.sin(k * Math.PI / 8), oo));
    const face = (R, oo) => disc(A, R, oo).concat(disc(B, R, oo));
    put(el, { sil: poly(hull(face(w, o - t / 2).concat(face(w, o + t / 2)))), crease: poly(hull(face(w - 1.1, o + t / 2))) });
  }
  /** A rounded solid in the head's frame: footprint (u, v), standing from w0 to w1 along the head's axis. */
  function box(el, F, H, ring, inner, w0, w1, vis) {
    const at = (rg, w) => rg.map((q) => F(...H(q.u, w), OH + q.v));
    put(el, { sil: poly(hull(at(ring, w0).concat(at(ring, w1)))), crease: open(at(run(inner, vis), w1)) });
  }

  const sp = { a: spring(REST.a), r: spring(REST.r), z: spring(REST.z), p: spring(REST.p) };
  const sh = SHAPES.forms.map((v) => tween(v));

  function draw(now) {
    const ca = Math.cos(sp.a.x), sa = Math.sin(sp.a.x);
    const F = (s, z, o) => P(BX + s * ca - o * sa, BY + s * sa + o * ca, z);
    // two-link IK in the arm's plane, elbow up, the wrist's distance clamped inside both links' reach
    const dz = sp.z.x - ZS, at = Math.atan2(dz, sp.r.x), D = clamp(Math.hypot(sp.r.x, dz), 30, 0.97 * (L1 + L2));
    const th = at + Math.acos((L1 * L1 + D * D - L2 * L2) / (2 * L1 * D));
    const S0 = [0, ZS], E = [L1 * Math.cos(th), ZS + L1 * Math.sin(th)], W = [D * Math.cos(at), ZS + D * Math.sin(at)];
    const cp = Math.cos(sp.p.x), spp = Math.sin(sp.p.x), H = (u, w) => [W[0] + u * cp - w * spp, W[1] + u * spp + w * cp];
    const [hu, hv, hr] = sh.map((t) => tval(t, now)), fu = hu + 1.5;
    // the block is drawn only above the plate's top: below it, the socket hides it
    const w0 = Math.max(-HANG, (PT - W[1] + hu * Math.abs(spp)) / cp);
    const dh = (ca + sa) * 0.707, nh = (ca - sa) * 0.707, fv = 0.866 * cp * dh + 0.5 * spp;
    const vis = (q) => 0.866 * (q.nu * cp * dh + q.nv * nh) + 0.5 * q.nu * spp > 0;
    bar(arm.up, F, S0, E, 4, -5, 5);
    bar(arm.sh, F, S0, S0, 6.5, 0, 13);
    bar(arm.el, F, E, E, 5, 0, 13);
    bar(arm.fo, F, E, W, 3.4, 5, 5);
    bar(arm.wr, F, W, W, 4.5, OH, 12);
    const side = fv >= 0 ? 1 : -1;
    bar(arm.f0, F, H(-side * fu, -6), H(-side * fu, -13), 1.3, OH, 4);
    box(arm.blk, F, H, rrect(-hu, -hv, hu, hv, hr, 6), rrect(-hu + 1, -hv + 1, hu - 1, hv - 1, hr - 1, 6), w0, -10, vis);
    box(arm.palm, F, H, rrect(-fu - 1.6, -3.5, fu + 1.6, 3.5, 2.2, 4), rrect(-fu - 0.6, -2.5, fu + 0.6, 2.5, 1.2, 4), -7.5, -3.5, vis);
    bar(arm.f1, F, H(side * fu, -6), H(side * fu, -13), 1.3, OH, 4);
  }

  /** Drives the springs toward `want`: down into a socket once over it, and up out of one before swinging away. */
  function steer() {
    const ex = want.r * Math.cos(want.a) - sp.r.x * Math.cos(sp.a.x), ey = want.r * Math.sin(want.a) - sp.r.x * Math.sin(sp.a.x);
    const err = Math.hypot(ex, ey), low = sp.z.x < CLEAR - 1;
    if (low && err > 4) { sp.z.t = CLEAR + 2; return; }
    sp.a.t = want.a; sp.r.t = want.r; sp.p.t = want.p;
    sp.z.t = !want.seat ? want.z : err < 2 ? SEAT : low ? sp.z.t : want.z;
  }

  const B = register(stage, (dt, now) => {
    let moving = false;
    steer();
    for (const k in sp) if (stepS(sp[k], dt)) moving = true;
    steer();
    for (const k in sp) if (Math.abs(sp[k].t - sp[k].x) > 0.01) moving = true;
    if (sh.some((t) => !tdone(t, now))) moving = true;
    const k = [sp.a.x, sp.r.x, sp.z.x, sp.p.x, ...sh.map((t) => tval(t, now))].map((v) => v.toFixed(3)).join();
    if (k !== key) { key = k; draw(now); }
    return moving;
  });
  bag.add(B.unregister);

  /** Retargets the springs from the pointer's point on the plate; the socket within 22 of it is chosen. */
  function aim() {
    let best = -1, near = 22;
    if (over) socks.forEach((s, i) => { const d = Math.hypot(s.x - over[0], s.y - over[1]); if (d < near) { near = d; best = i; } });
    if (!over) want = REST;
    else {
      const s = socks[best], [a, r] = aimAt(s ? s.x : clamp(over[0], X0, X1), s ? s.y : clamp(over[1], Y0, Y1));
      want = { a: clamp(a, AMIN, AMAX), r: clamp(r, RMIN, reach), z: CLEAR + (s ? 4 : 10), p: 0, seat: !!s && r <= reach };
    }
    socks.forEach((s, i) => {
      const d = over ? Math.hypot(s.x - over[0], s.y - over[1]) : Infinity;
      s.rim.setAttribute("class", i === best ? "nf hi" : d < 48 ? "nf" : "nf lo");
    });
    if (best !== pick) {
      pick = best;
      const now = performance.now(), to = best >= 0 ? socks[best].sh : SHAPES.forms;
      sh.forEach((t, i) => tset(t, to[i], now, 0));
      arm.blk.sil.classList.toggle("hi", best < 0);
      read.textContent = best >= 0 ? socks[best].name : "rest";
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
    set: (v) => { reach = clamp(v, 48, 88); aim(); },
    destroy: bag.dispose,
  };
}

hairline({
  name: "robot-arm",
  means: "The agent hand-off: a desk arm carries a feature block and reaches for the socket under the pointer.",
  rules: [1, 3, 5, 6, 8],
  range: [50, 68, 86],
  tour: [[270, 203], [210, 208], [244, 233], null],
  mount,
});
