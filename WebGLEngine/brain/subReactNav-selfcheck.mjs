// WebGLEngine/brain/subReactNav-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node brain/subReactNav-selfcheck.mjs      (about 10 s: arithmetic on hand-built ships and a dozen real flights)
//
// THE GATE OF brain/subReactNav.mjs (FOLLOW-UP 6 of brain/SUB_FIELD_NAV_WIP.md, registered before the module):
//   1  THE CONSTANTS    the behaviours, the arms, the registered numbers (30 m, 25 s, 0.07 rad/s, 1.05 rad, 0.5 m/s squared, 3 s), the sets
//   2  THE VESSEL       vesselVel is the plan's convention (vx = speed cos h, vy = -speed sin h)
//   3  THE CONFLICT     conflictBetween by hand: head-on, parallel and far, the strict boundary at r + half-hull + clear, the look window, the first second counted
//   4  THE SHIPS        stepShip: react-none holds; react-turn rotates CLOCKWISE by TURN_RATE * dt only on a conflict, keeps its speed, stops at MAX_TURN and holds the course; react-stop slows by STOP_ACCEL * dt to zero on a conflict at the NOMINAL velocity and speeds back up to it, never past; the position advances by the new velocity
//   5  THE ESTIMATE     estimateVel: the nominal velocity for the first EST_S seconds, then the finite difference over EST_S, exactly for constant velocity and as a mean for an accelerating ship
//   7  THE EDGES    the four edges of the region, no route and the clearance at the start, on hand-made scenarios, each against flyHard
//   6  THE FLIGHTS      react-none IS subHardNav.flyHard (every field of the record, two arms, three seeds); the estimated arm equals the nominal arm when no ship reacts; reacting behaviours change flights; the record carries behaviour and the type of what a collided flight struck; unknown arm and behaviour are refused; a flight is deterministic
//
// SABOTAGE LOG (serial mutation pass of brain/subReactNav.mjs, one mutant per code line and operator, at most four of each operator on a line, run one at a time in two worktrees): 120 mutants; 99 red on the first pass; 21 survived. THE GATE WAS THEN EXTENDED (section 7: the region's four edges, no route, the clearance at the start, each against flyHard) AND THE 21 RE-RUN: 5 red (L88-o30 and L88-o40, the no-route test; L91-o121, the clearance at the start; L107-o50 and L107-o51, an edge test that could never fire), 16 survive and are EQUIVALENT, declared:
//   L24-o120 (the model's seabed at 1001 m, which no flight reaches), L47-o30 (a turn already at MAX_TURN turns by min(rate, 0) = 0), L72-o120 and L94-o120 (the replan interval and the first tick it can fire, which are the same at a 90-tick interval), L75-o120 and L75-o121 (`now` and `tick` before the first tick sets them), L88-o90 (the no-route flag of an arm with no field: no arm here is without one), L105-o30, L106-o30, L106-o31 and L107-o30, L107-o31, L107-o3b0, L107-o3b1 (< -> <= at an exact float tie of a clearance with 0 or of the vessel's position with an edge),
//   L106-o121 and L106-o122 (which obstacle a collision is booked against: the depth argument of the search and its 0 -> 1 m bound change the answer only for a flight that strikes a ship while another obstacle in the list stands within a metre or passes over the vessel's keel, which none of the flights here does; the type of what is struck is graded on seeds 1 and 2 for both).
//   NOT CHECKED, said plainly: the generator takes at most four mutants of an operator on a line, so the long lines of this file (the flight loop's) are SAMPLED and not exhausted; and nothing here grades whether the reaction rules are the right ones, only that they are the registered ones.
"use strict";
import * as R from "./subReactNav.mjs";
import * as H from "./subHardNav.mjs";
import * as S from "../physics/mechanics/subModel6dof.mjs";
import * as AP from "./autopilotSub.mjs";
let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const near = (a, b, e = 1e-9) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= e;
const thr = (f) => { try { f(); return ""; } catch (e) { return String(e.message); } };
const J = JSON.stringify;
const pilot = (s, t, c) => AP.decide(s, t, c);
console.log("subReactNav-selfcheck -- reacting traffic\n");

console.log("1. THE CONSTANTS");
{
    ok("!! the behaviours are react-none, react-turn, react-stop; the arms any+replan, any+predict+edge+yield (the nominal belief, FOLLOW-UP 5's designated arm) and est+predict+edge+yield (designated here); frozen",
        J(R.BEHAVIOURS) === '["react-none","react-turn","react-stop"]' && J(R.REACT_ARMS) === '["any+replan","any+predict+edge+yield","est+predict+edge+yield"]' && R.DESIGNATED === "est+predict+edge+yield" && R.NOMINAL_ARM === "any+predict+edge+yield" && Object.isFrozen(R.BEHAVIOURS) && Object.isFrozen(R.REACT_ARMS));
    ok("!! the registered numbers: the ship's clearance 30 m and look 25 s, the turn rate 0.07 rad/s to 1.05 rad, the stop acceleration 0.5 m/s squared, the estimate window 3 s", R.SHIP_CLEAR === 30 && R.SHIP_LOOK_S === 25 && R.TURN_RATE === 0.07 && R.MAX_TURN === 1.05 && R.STOP_ACCEL === 0.5 && R.EST_S === 3);
    ok("!! the sets: DEV is subHardNav's seeds 1 to 30 and HELD6 is seeds 601 to 660 (60 of them), frozen", J(R.SETS.dev) === J(H.HARD_SETS.dev) && R.SETS.dev.length === 30 && R.HELD6.length === 60 && R.HELD6[0] === 601 && R.HELD6[59] === 660 && R.SETS.held6 === R.HELD6 && Object.isFrozen(R.HELD6) && Object.isFrozen(R.SETS));
}
console.log("\n2. THE VESSEL");
{
    const model = S.createSubModel(Object.freeze({ ...S.EXPLORER, seabed: 1000 }));
    const st = (heading, speed) => S.createState({ pos: [0, 0, -20], speed, heading, pitch: 0, bank: 0, gamma: 0, w: [0, 0, 0], model });
    const a = R.vesselVel(st(0, 3)), b = R.vesselVel(st(Math.PI / 2, 3)), c = R.vesselVel(st(Math.PI / 6, 2));
    ok("!! vesselVel is the plan's convention: heading 0 at 3 m/s is (3, 0); heading pi/2 is (0, -3) (a right turn swings the nose toward -y); heading pi/6 at 2 m/s is (1.732, -1)",
        near(a[0], 3) && near(a[1], 0) && near(b[0], 0, 1e-9) && near(b[1], -3) && near(c[0], Math.sqrt(3)) && near(c[1], -1), J([a, b, c]));
}
console.log("\n3. THE CONFLICT");
{
    const C = (o = {}) => R.conflictBetween(o.sx ?? 100, o.sy ?? 0, o.svx ?? -2, o.svy ?? 0, o.r ?? 10, o.vx ?? 0, o.vy ?? 0, o.wx ?? 2, o.wy ?? 0, o.opts);
    ok("!! a head-on pair closing at 4 m/s from 100 m is a conflict within the 25 s look, and a pair moving apart is not", C() === true && C({ sx: 100, svx: 2, wx: -2 }) === false);
    ok("!! a parallel pair 80 m apart across is no conflict and one 10 m across is", C({ sx: 20, sy: 80, svx: 2, wx: 2 }) === false && C({ sx: 20, sy: 10, svx: 2, wx: 2 }) === true && C({ sx: 100, sy: 10, svx: 2, wx: 2 }) === false);
    // r + half-hull + clear = 10 + 4 + 30 = 44 m: the boundary is strict
    ok("!! the boundary is r + half-hull + clear = 44 m and strict: a static pair exactly 44 m apart is no conflict, 43.999 is", C({ sx: 44, svx: 0, wx: 0 }) === false && C({ sx: 43.999, svx: 0, wx: 0 }) === true && C({ sx: 60, svx: 0, wx: 0, opts: { clear: 47 } }) === true && C({ sx: 60, svx: 0, wx: 0, opts: { clear: 46 } }) === false && C({ sx: 60, svx: 0, wx: 0, opts: { clear: 45 } }) === false);
    ok("!! the look window is `look` seconds: a pair that meets at second 26 is no conflict in a 25 s look and is in a 30 s one; the first second counts (a pair already inside is a conflict with a look of 0)",
        C({ sx: 144, svx: 0, wx: 4 - 0.0, opts: { look: 25 } }) === false && C({ sx: 144, svx: 0, wx: 4, opts: { look: 30 } }) === true && C({ sx: 30, svx: 0, wx: 0, opts: { look: 0 } }) === true && C({ sx: 144, svx: 0, wx: 4, opts: { look: 25 } }) === false);
    ok("!! the vessel's position and the ship's are both used (a ship at (100, 0) and a vessel at (100, 5) are in conflict at once, and moving the vessel's start moves the answer)", C({ sx: 100, sy: 0, svx: 0, svy: 0, vx: 100, vy: 5, wx: 0, wy: 0 }) === true && C({ sx: 100, sy: 0, svx: 0, svy: 0, vx: 0, vy: 0, wx: 0, wy: 0 }) === false);
}
console.log("\n4. THE SHIPS");
{
    const base = (o = {}) => ({ x: 100, y: 0, vx: -2, vy: 0, nvx: -2, nvy: 0, turned: 0, ...o }), vessel = { x: 0, y: 0, vx: 2, vy: 0 }, far = { x: 0, y: 500, vx: 0, vy: 0 };
    const none = R.stepShip(base(), "react-none", 10, vessel, 0.5);
    ok("!! react-none never changes the velocity and advances the position by it (x 100 -> 99 in 0.5 s at -2 m/s, whatever the vessel does)", J([none.vx, none.vy, none.x, none.y, none.turned]) === "[-2,0,99,0,0]" && R.stepShip(base(), "react-none", 10, far, 0.5).vx === -2);
    const dt = 1 / 30, t1 = R.stepShip(base(), "react-turn", 10, vessel, dt), th = R.TURN_RATE * dt;
    ok("!! react-turn on a conflict rotates the velocity CLOCKWISE by TURN_RATE * dt (a ship moving -x turns toward +y: its vy rises), keeps its speed, counts the turn and moves by the new velocity",
        near(t1.vx, -2 * Math.cos(th)) && near(t1.vy, 2 * Math.sin(th)) && near(Math.hypot(t1.vx, t1.vy), 2) && near(t1.turned, th) && near(t1.x, 100 + t1.vx * dt) && near(t1.y, t1.vy * dt), J(t1));
    const e1 = R.stepShip(base({ vx: 2, vy: 0, nvx: 2 }), "react-turn", 10, { x: 200, y: 0, vx: -2, vy: 0 }, 0.5);
    ok("!! the turn is clockwise whichever way the ship heads (a ship moving +x turns toward -y: its vy falls)", e1.vy < 0 && e1.vx > 0 && near(Math.hypot(e1.vx, e1.vy), 2));
    ok("!! react-turn with no conflict holds its velocity and its turn count", J(R.stepShip(base(), "react-turn", 10, far, dt)) === J({ x: 100 - 2 * dt, y: 0, vx: -2, vy: 0, nvx: -2, nvy: 0, turned: 0 }));
    const ahead = (q) => { const m = Math.hypot(q.vx, q.vy), dx = q.vx / m, dy = q.vy / m; return { x: q.x + dx * 100, y: q.y + dy * 100, vx: -dx * 2, vy: -dy * 2 }; };   // a vessel always coming straight at the ship along the ship's own heading
    let sh = base(); for (let i = 0; i < 600; i++) sh = R.stepShip(sh, "react-turn", 10, ahead(sh), dt);
    const held = R.stepShip(sh, "react-turn", 10, ahead(sh), dt);
    ok("!! the turn stops at MAX_TURN exactly (1.05 rad after enough conflict ticks), the speed is kept, the course is the nominal one turned clockwise by 1.05 rad, and the ship then HOLDS that course on a conflict as on none",
        sh.turned === R.MAX_TURN && near(Math.hypot(sh.vx, sh.vy), 2, 1e-9) && near(Math.atan2(sh.vy, sh.vx), Math.PI - R.MAX_TURN, 1e-9) && held.vx === sh.vx && held.vy === sh.vy && held.turned === R.MAX_TURN, `turned ${sh.turned}`);
    const nearMax = R.stepShip(base({ turned: R.MAX_TURN - 0.001 }), "react-turn", 10, vessel, 0.5);
    ok("!! a turn that would pass MAX_TURN is cut to it (0.001 rad left, a 0.035 rad step: turned ends at MAX_TURN, not 1.084)", nearMax.turned === R.MAX_TURN);
    const s1 = R.stepShip(base(), "react-stop", 10, vessel, 0.5);
    ok("!! react-stop on a conflict at the NOMINAL velocity slows by STOP_ACCEL * dt (2 -> 1.75 m/s in 0.5 s), keeping the direction, and moves by the new velocity", near(s1.vx, -1.75) && s1.vy === 0 && near(s1.x, 100 - 1.75 * 0.5) && s1.nvx === -2);
    let sp = base(); for (let i = 0; i < 20; i++) sp = R.stepShip(sp, "react-stop", 10, { x: sp.x - 60, y: sp.y, vx: 2, vy: 0 }, 0.5);
    ok("!! it stops at zero and does not reverse (never a negative speed), and a stopped ship waits while the conflict at its nominal velocity stands", sp.vx === 0 && sp.vy === 0 && R.stepShip(sp, "react-stop", 10, { x: sp.x - 60, y: sp.y, vx: 2, vy: 0 }, 0.5).vx === 0);
    let go = base({ vx: 0, vy: 0 }); for (let i = 0; i < 20; i++) go = R.stepShip(go, "react-stop", 10, far, 0.5);
    ok("!! with no conflict it speeds back up by STOP_ACCEL * dt to the nominal velocity and not past it (0 -> -2 m/s in 4 s, then constant)", near(R.stepShip(base({ vx: 0 }), "react-stop", 10, far, 0.5).vx, -0.25) && go.vx === -2 && go.vy === 0);
    ok("!! react-stop's test uses the NOMINAL velocity (a ship stopped at 0 m/s with the vessel closing on the line it would sail still waits, one the vessel will pass behind resumes)", R.stepShip(base({ vx: 0 }), "react-stop", 10, { x: 20, y: 0, vx: 2, vy: 0 }, 0.5).vx === 0 && R.stepShip(base({ vx: 0 }), "react-stop", 10, { x: 20, y: 300, vx: 2, vy: 0 }, 0.5).vx < 0);
    ok("!! an unknown behaviour is refused naming the choices", /unknown behaviour "react-flee"/.test(thr(() => R.stepShip(base(), "react-flee", 10, vessel, 0.5))) && /react-none, react-turn, react-stop/.test(thr(() => R.stepShip(base(), "x", 10, vessel, 0.5))));
    ok("!! shipStart takes a scenario ship: its position, its velocity as both the velocity and the nominal one, no turn", J(R.shipStart({ x: 5, y: 6, vx: 1, vy: -2 })) === J({ x: 5, y: 6, vx: 1, vy: -2, nvx: 1, nvy: -2, turned: 0 }));
}
console.log("\n5. THE ESTIMATE");
{
    const dt = 1 / 30, n = Math.round(R.EST_S / dt), hist = Array.from({ length: 200 }, (_, i) => [10 + 1.5 * i * dt, 5 - 0.5 * i * dt]);
    ok("!! before EST_S seconds have been seen the estimate is the nominal velocity (tick 89 of a 90-tick window), and from tick 90 on it is the displacement over the window divided by EST_S", J(R.estimateVel(hist, n - 1, dt, [9, 8])) === "[9,8]" && J(R.estimateVel(hist, 0, dt, [9, 8])) === "[9,8]" && R.estimateVel(hist, n, dt, [9, 8])[0] !== 9);
    const v = R.estimateVel(hist, 150, dt, [9, 8]);
    ok("!! for a constant velocity the finite difference is that velocity (1.5, -0.5) to 1e-9 at every tick from 90 on", near(v[0], 1.5) && near(v[1], -0.5) && [90, 100, 199].every((i) => near(R.estimateVel(hist, i, dt, [0, 0])[0], 1.5) && near(R.estimateVel(hist, i, dt, [0, 0])[1], -0.5)));
    const acc = Array.from({ length: 200 }, (_, i) => [0.5 * 1 * (i * dt) ** 2, 0]), va = R.estimateVel(acc, 150, dt, [0, 0]);
    ok("!! for a ship that accelerates (1 m/s squared) it is the MEAN velocity over the window, one and a half seconds behind the true one: at 5 s the true speed is 5 and the estimate 3.5", near(va[0], 5 - 1.5, 1e-9) && va[1] === 0, J(va));
    ok("!! the window is the tick count of EST_S seconds, whatever the tick (a 0.1 s tick uses 30 ticks)", near(R.estimateVel(Array.from({ length: 100 }, (_, i) => [2 * i * 0.1, 0]), 50, 0.1, [0, 0])[0], 2) && J(R.estimateVel(Array.from({ length: 100 }, (_, i) => [2 * i * 0.1, 0]), 29, 0.1, [7, 7])) === "[7,7]");
}
console.log("\n6. THE FLIGHTS");
{
    const fields = ["arm", "kind", "seed", "gap", "shipSpeed", "currentMean", "blocked", "status", "reached", "t", "path", "chord", "minClearance", "ticks", "margin", "marginLast", "noRoute", "replans"];
    let allSame = true, why = "";
    for (const seed of [1, 2, 3]) for (const arm of ["any+replan", "any+predict+edge+yield"]) {
        const sc = H.hardScenario(seed, "hard-traffic"), a = H.flyHard(pilot, sc, arm, { seconds: 90 }), b = R.flyReact(pilot, sc, arm, "react-none", { seconds: 90 });
        for (const f of fields) if (J(a[f]) !== J(b[f])) { allSame = false; why += ` ${seed}/${arm}/${f}`; }
    }
    ok("!! react-none IS subHardNav.flyHard: every field of the record (the status, the time, the path, the clearance, the ticks, the margins, the replans) is identical on three seeds and two arms, 90 s each", allSame, why);
    const full1 = H.flyHard(pilot, H.hardScenario(1, "hard-traffic"), "any+predict+edge+yield"), full2 = R.flyReact(pilot, H.hardScenario(1, "hard-traffic"), "any+predict+edge+yield", "react-none");
    ok("!! ...including a whole 260 s flight that ends in a collision (seed 1: collided, with an iceberg, after 1805 ticks)", full1.status === "collided" && full2.status === "collided" && full1.ticks === full2.ticks && full2.ticks === 1805 && full2.hit === "berg" && J(full1.minClearance) === J(full2.minClearance));
    const sc1 = H.hardScenario(1, "hard-traffic"), e = R.flyReact(pilot, sc1, R.DESIGNATED, "react-none"), n = R.flyReact(pilot, sc1, R.NOMINAL_ARM, "react-none");
    ok("!! the estimated-belief arm equals the nominal-belief arm when no ship reacts (a constant velocity estimated is the constant velocity): the same status, ticks and path on seeds 1 to 4, to 1e-6 on the path", [1, 2, 3, 4].every((seed) => { const s = H.hardScenario(seed, "hard-traffic"), x = R.flyReact(pilot, s, R.DESIGNATED, "react-none", { seconds: 120 }), y = R.flyReact(pilot, s, R.NOMINAL_ARM, "react-none", { seconds: 120 }); return x.status === y.status && x.ticks === y.ticks && near(x.path, y.path, 1e-6); }) && e.arm === R.DESIGNATED && n.arm === R.NOMINAL_ARM);
    const t1 = R.flyReact(pilot, sc1, R.DESIGNATED, "react-turn"), p1 = R.flyReact(pilot, sc1, R.DESIGNATED, "react-stop"), t2 = R.flyReact(pilot, H.hardScenario(2, "hard-traffic"), R.DESIGNATED, "react-turn"), p2 = R.flyReact(pilot, H.hardScenario(2, "hard-traffic"), R.DESIGNATED, "react-stop");
    ok("!! a reacting ship changes the flight: on seed 1 the estimated arm collides with an iceberg when no ship reacts and REACHES the waypoint when ships turn (140.8 s), and collides with a ship when they stop; on seed 2 it reaches (217.8 s) with none, collides with a ship when they turn and leaves the region when they stop",
        e.status === "collided" && t1.status === "reached" && near(t1.t, 140.77, 0.1) && p1.status === "collided" && p1.hit === "ship" && R.flyReact(pilot, H.hardScenario(2, "hard-traffic"), R.DESIGNATED, "react-none").status === "reached" && t2.status === "collided" && t2.hit === "ship" && p2.status === "left" && p2.hit === null, J([e.status, t1.status, p1.status, t2.status, p2.status]));
    ok("!! the record carries the behaviour and the arm asked for, and `hit` is the type of what a collided flight struck (an iceberg, a ship) and null for a flight that did not collide", t1.behaviour === "react-turn" && p1.behaviour === "react-stop" && e.behaviour === "react-none" && t1.arm === R.DESIGNATED && e.hit === "berg" && p1.hit === "ship" && t1.hit === null && p2.hit === null);
    ok("!! a flight is deterministic (the same scenario, arm and behaviour twice gives the same record) and does not touch the scenario", J(R.flyReact(pilot, sc1, R.DESIGNATED, "react-turn")) === J(t1) && J(sc1) === J(H.hardScenario(1, "hard-traffic")));
    ok("!! an unknown arm or behaviour is refused naming the choices (the other kinds' arms are not here)", /unknown arm "any"/.test(thr(() => R.flyReact(pilot, sc1, "any", "react-none"))) && /any\+replan, any\+predict\+edge\+yield, est\+predict\+edge\+yield/.test(thr(() => R.flyReact(pilot, sc1, "x", "react-none"))) && /unknown behaviour "react-flee"/.test(thr(() => R.flyReact(pilot, sc1, R.DESIGNATED, "react-flee"))));
    const rp = R.flyReact(pilot, sc1, "any+replan", "react-turn", { seconds: 30 });
    ok("!! any+replan replans every 3 s (30 s of flight: 9 rebuilds) in a reacting world, and the first plan is the same for every arm (the margin the first plan was built at)", rp.replans === 9 && rp.margin === R.flyReact(pilot, sc1, R.DESIGNATED, "react-turn", { seconds: 30 }).margin && rp.margin === H.flyHard(pilot, sc1, "any+replan", { seconds: 30 }).margin);
}

console.log("\n7. THE EDGES OF THE FLIGHT (hand-made scenarios: the region's four edges, no route, and the clearance at the start)");
{
    const base = H.hardScenario(1, "hard-traffic"), mk = (o) => ({ ...base, ...o, start: { ...base.start, ...(o.start || {}) }, goal: { ...base.goal, ...(o.goal || {}) } });
    const run = (sc, arm = "any+replan", b = "react-none", seconds = 30) => R.flyReact(pilot, sc, arm, b, { seconds });
    const east = run(mk({ obstacles: [], start: { x: 435, y: 0, heading: 0, speed: 3 }, goal: { x: 380, y: 0 } })), west = run(mk({ obstacles: [], start: { x: -35, y: 0, heading: Math.PI, speed: 3 }, goal: { x: 380, y: 0 } }));
    const south = run(mk({ obstacles: [], start: { x: 100, y: -135, heading: Math.PI / 2, speed: 3 }, goal: { x: 380, y: 0 } })), north = run(mk({ obstacles: [], start: { x: 100, y: 135, heading: -Math.PI / 2, speed: 3 }, goal: { x: 380, y: 0 } }));
    ok("!! a vessel that crosses the region's east edge, its west edge, its y = -140 edge or its y = 140 edge is `left` (four flights, each ended within a few seconds of the start), and one flying inside it for 30 s is not", [east, west, south, north].every((r) => r.status === "left" && r.ticks < 400) && run(mk({ obstacles: [], start: { x: 100, y: 0, heading: 0, speed: 3 }, goal: { x: 380, y: 0 } })).status !== "left", J([east, west, south, north].map((r) => [r.status, r.ticks])));
    ok("!! ...and each of those flights is the flight subHardNav.flyHard flies (the same status, ticks and path)", [["east", { x: 435, y: 0, heading: 0, speed: 3 }], ["west", { x: -35, y: 0, heading: Math.PI, speed: 3 }], ["south", { x: 100, y: -135, heading: Math.PI / 2, speed: 3 }], ["north", { x: 100, y: 135, heading: -Math.PI / 2, speed: 3 }]].every(([nm, st]) => { const sc = mk({ obstacles: [], start: st, goal: { x: 380, y: 0 } }), a = H.flyHard(pilot, sc, "any+replan", { seconds: 30 }), b = R.flyReact(pilot, sc, "any+replan", "react-none", { seconds: 30 }); return a.status === b.status && a.ticks === b.ticks && J(a.path) === J(b.path); }));
    const wall = { type: "island", group: 1, x: base.start.x, y: base.start.y, r: 300, keel: Infinity, vx: 0, vy: 0 }, nr = run(mk({ obstacles: [wall] }), "any+replan", "react-none", 5), nrH = H.flyHard(pilot, mk({ obstacles: [wall] }), "any+replan", { seconds: 5 });
    ok("!! a plan with no way from the vessel's cell says so: noRoute is true when the start is inside an island 300 m wide (as flyHard says) and false in an open sea", nr.noRoute === true && nrH.noRoute === true && run(mk({ obstacles: [] }), "any+replan", "react-none", 5).noRoute === false);
    const ship = { type: "ship", group: 2000, x: base.start.x - 40, y: base.start.y, r: 8, keel: 60, vx: -3, vy: 0 }, sc2 = mk({ obstacles: [ship] });
    const m1 = run(sc2, "any+replan", "react-none", 4), m2 = H.flyHard(pilot, sc2, "any+replan", { seconds: 4 }), m3 = run(sc2, "any+replan", "react-turn", 4);
    ok("!! the minimum clearance includes the START: a ship 40 m behind the vessel and moving away at 3 m/s gives the clearance at t = 0 (40 - 8 - 4 = 28 m), exactly as flyHard does, in every behaviour", near(m1.minClearance, 28, 1e-9) && J(m1.minClearance) === J(m2.minClearance) && near(m3.minClearance, 28, 1e-9), J([m1.minClearance, m2.minClearance, m3.minClearance]));
}
console.log(`\nsubReactNav-selfcheck: ${fails === 0 ? "all passed" : fails + " FAILED"}`);
process.exit(fails === 0 ? 0 : 1);
