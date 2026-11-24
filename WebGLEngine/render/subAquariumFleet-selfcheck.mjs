// WebGLEngine/render/subAquariumFleet-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node render/subAquariumFleet-selfcheck.mjs      (about 40 s: section 4 flies 6 couriers in 2 seas for 300 tank-seconds, twice)
//
// THE COURIERS KEEP CLEAR OF EACH OTHER (nextRounds nav-fleet-avoidance, 2026-11-17): brain/subTankNav.mjs's fleet pieces and render/subAquariumSim.mjs's wiring.
//   1 THE PIECES   fleetObstacles (a full-depth column of FLEET_R per other sub, stamped with the plan's time), fleetAt (a sub straight along its velocity, a scene obstacle as the scene
//                  moves it), subTouch (hulls within 2 x HULL_HALF on the plane AND within SUB_CONTACT_DZ in depth).
//   2 THE NAVIGATOR a sub parked on the straight line to the goal: with avoidFleet the plan routes round it (a different heading from the plan without), contacts are counted either
//                  way (the same eyes), and with no others given nothing changes.
//   3 THE TANK     setFleet (true by default; returns what it was), every courier is given every OTHER sub each tick (never itself), and the switch reaches the plan.
//   4 DESCRIPTIVE  six couriers in seas 1 and 2 for 300 tank-seconds, avoidance off and on: on, fewer sub contacts (measured 2026-11-17 on seas 1-4: 22 -> 6) at a cost in arrivals
//                  (61 -> 46). A DESCRIPTION of the tank, not a registered test; the row holds only the direction of the contacts and that both runs did real work.
// NOT CHECKED, said plainly: how it looks on the page; wanderers (subs with no navigator) do not avoid anything, so a contact with one is the courier's to avoid alone.
// SABOTAGE LOG (2026-11-17; 9 mutants, each alone, restored byte-identical): F1 the fleet never in the plan (2 red), F2 the fleet always in the plan, switch ignored (2), F3 depth
//   ignored in a contact (1), F4 a column twice the radius (1), F5 a sub frozen where it was (1), F6 a lasting contact counted every tick (1), F7 a courier given itself (2),
//   F8 off by default (2), F9 the velocity's y sign flipped (1).
// THE MEASUREMENT IN SECTION 4 IS THIN: on seas 1 and 2 the contacts are 4 off against 2 on (arrivals 32 against 25); on seas 1 to 4 (measured once while building) 22 against 6
//   (arrivals 61 against 46). The row holds the direction only.
"use strict";
import * as TN from "../brain/subTankNav.mjs";
import * as N from "../brain/subFieldNav.mjs";
import * as S from "../physics/mechanics/subModel6dof.mjs";
import * as A from "./subAquariumSim.mjs";
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const sec = (t) => console.log("\n" + t);
const near = (a, b, t = 1e-9) => Math.abs(a - b) <= t;
const J = JSON.stringify;
console.log("subAquariumFleet-selfcheck -- the couriers treat the other subs as traffic\n");

sec("1. THE PIECES");
{
    const ob = TN.fleetObstacles([{ id: "b", x: 100, y: 50, vx: 2, vy: -1, depth: 20 }], 7);
    ok("!! one full-depth column per other sub: type sub, its id, position and velocity, radius FLEET_R = HULL_HALF (two hulls touch at 2 x HULL_HALF), keel Infinity, stamped t0 = the plan's time", ob.length === 1 && J(ob[0]) === J({ type: "sub", id: "b", x: 100, y: 50, vx: 2, vy: -1, r: N.HULL_HALF, keel: Infinity, t0: 7 }) && TN.FLEET_R === N.HULL_HALF && TN.fleetObstacles(null, 0).length === 0);
    ok("!! fleetAt moves a sub straight along its velocity from t0 (10 s later: +20, -10) and a scene obstacle as the scene does", J(TN.fleetAt(ob[0], 17)) === J([120, 40]) && (() => { const sc = TN.tankScene(1), o = sc.obstacles.find((q) => q.type === "ship"); return J(TN.fleetAt(o, 33)) === J(TN.sceneAt(o, 33)); })());
    const q = [{ id: "b", x: 100, y: 50, depth: 20 }];
    ok("!! subTouch is three-dimensional: 7.9 m apart on the plane and 1.9 m in depth touch; 8.1 m apart, or 2.1 m in depth, do not", TN.subTouch(107.9, 50, 21.9, q) && !TN.subTouch(108.1, 50, 20, q) && !TN.subTouch(100, 50, 22.1, q) && TN.SUB_CONTACT_DZ === 2 && !TN.subTouch(100, 50, 20, []));
}

sec("2. THE NAVIGATOR");
{
    const sc = TN.tankScene(1), mk = () => TN.createNavigator({ ...sc, obstacles: [] }, { arm: "any+predict", seed: 3 }), m = S.createSubModel(Object.freeze({ ...S.EXPLORER, seabed: 1000 }));
    const st = S.createState({ pos: [60, 150, -25], speed: 3, heading: 0, pitch: 0, bank: 0, gamma: 0, w: [0, 0, 0], model: m });
    const a = mk(), b = mk(), c = mk(); a.step(st, 0, 1 / 30); const goal = a.snapshot().goal;
    // park a sub halfway along the straight line to the goal, at the courier's depth
    const mid = { id: "p", x: (60 + goal.x) / 2, y: (150 + goal.y) / 2, vx: 0, vy: 0, depth: 25 }, tOff = b.step(st, 0, 1 / 30, [mid], false), tOn = c.step(st, 0, 1 / 30, [mid], true), tNone = mk().step(st, 0, 1 / 30);
    ok("!! with the other sub avoided the plan's heading differs from the plan that does not avoid it; avoidFleet false and no others at all give the same plan", Math.abs(tOn.heading - tOff.heading) > 1e-3 && near(tOff.heading, tNone.heading) && near(tOff.heading, a.step(st, 0, 1 / 30).heading), `${tOff.heading.toFixed(3)} vs ${tOn.heading.toFixed(3)}`);
    const d = mk(), e = mk(), touching = [{ id: "t", x: 63, y: 150, vx: 0, vy: 0, depth: 25 }];
    d.step(st, 0, 1 / 30, touching, false); e.step(st, 0, 1 / 30, touching, true);
    ok("!! a contact is counted with the same eyes whether or not the fleet is avoided (subHits 1, subContact true in both); with no others nothing is counted", d.snapshot().subHits === 1 && e.snapshot().subHits === 1 && d.snapshot().subContact && mk().snapshot().subHits === 0);
    for (let i = 1; i <= 40; i++) d.step(st, i / 30, 1 / 30, touching, false);
    ok("  a contact that lasts is ONE contact (subHits stays 1 over 40 ticks of touching)", d.snapshot().subHits === 1);
}

const entry = (id) => ({ id, name: "Sub " + id, hue: 100, pilot: "autopilot", from: "x", local: false, weights: null });
sec("3. THE TANK");
{
    const t = A.createTank(); t.sync([entry("c0"), entry("c1"), entry("w0")]); t.setScene(1);
    ok("!! setFleet: on by default, returns what it was, and the getter follows", t.fleet === true && t.setFleet(false) === true && t.fleet === false && t.setFleet(true) === false && t.fleet === true);
    t.setNav("c0", "any+predict"); t.setNav("c1", "any+predict");
    const seen = new Map(), real = new Map();
    for (const q of t.subs.values()) if (q.nav) { const n0 = q.nav; real.set(q.id, n0); q.nav = { ...n0, arm: n0.arm, step: (s, clk, dt, fleet, avoid) => { seen.set(q.id, { ids: (fleet || []).map((f) => f.id).sort(), avoid }); return n0.step(s, clk, dt, fleet, avoid); }, snapshot: () => n0.snapshot() }; }
    t.step(1 / 30); const s0 = J([...seen.entries()]); t.setFleet(false); t.step(1 / 30); const s1 = J([...seen.entries()]);
    ok("!! each courier is given every OTHER sub (the wanderer too), never itself, with the switch: on, then off", s0 === J([["c0", { ids: ["c1", "w0"], avoid: true }], ["c1", { ids: ["c0", "w0"], avoid: true }]]) && s1 === J([["c0", { ids: ["c1", "w0"], avoid: false }], ["c1", { ids: ["c0", "w0"], avoid: false }]]), s0);
    const sub = [...t.subs.values()][0], a = S.attitude(sub.state); let fl = null; const n0 = real.get("c1"); [...t.subs.values()][1].nav = { ...n0, step: (s, clk, dt, fleet, avoid) => { fl = fleet; return n0.step(s, clk, dt, fleet, avoid); }, snapshot: () => n0.snapshot() };
    t.step(1 / 30); const mine = fl.find((f) => f.id === "c0");
    ok("  the other sub is given as it was at the START of the tick: position, depth and velocity from its heading and speed ((cos h, -sin h) x speed)", !!mine && Math.abs(Math.hypot(mine.vx, mine.vy) - a.speed) < 0.2 && mine.depth > 0);
}

sec("4. DESCRIPTIVE (not a registered test)");
{
    const run = (on) => { let sub = 0, arr = 0, travel = 0; for (const sea of [1, 2]) { const t = A.createTank(); t.sync(Array.from({ length: 6 }, (_, i) => entry("c" + i))); t.setScene(sea); t.setFleet(on); for (let i = 0; i < 6; i++) t.setNav("c" + i, "any+predict"); for (let k = 0; k < 300 * 30; k++) t.step(1 / 30); for (const q of t.snapshot()) { sub += q.nav.subHits; arr += q.nav.arrivals; travel += q.nav.travel; } } return { sub, arr, travel: Math.round(travel) }; };
    const off = run(false), on = run(true);
    ok("!! six couriers in seas 1 and 2 for 300 tank-seconds: with avoidance on, fewer contacts between subs than with it off; both runs sailed (over 5,000 m and 10 arrivals each). The arrival cost is printed, not held", on.sub < off.sub && off.travel > 5000 && on.travel > 5000 && off.arr >= 10 && on.arr >= 10, `off ${J(off)}; on ${J(on)}`);
}

console.log(fails ? `\n${fails} FAIL` : "\nall checks pass");
process.exitCode = fails ? 1 : 0;
