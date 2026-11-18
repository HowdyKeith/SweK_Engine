// WebGLEngine/brain/subNavRoute-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node brain/subNavRoute-selfcheck.mjs      (under a minute; it flies seeds 501 to 503 of hard-stream, in no set, never DEV or HELD86)
//
// THE GATE OF brain/subNavRoute.mjs and of the options it adds to brain/subNavPlus.mjs's flyPlus (NAV_PLUS ITEM 2 PART 2, registered first):
//   1 THE STREAM      its profile (the peak on the centre line, cos^2 across, zero at the half-width and beyond, along theta); the scenario: hard-current's start, waypoint, islands and weight
//                     error, its uniform current dropped, the stream drawn in the registered order and ranges; speedScale 0 is still water.
//   2 THE PLAN        buildRouteField's geometry is buildHardField's to the cell; with no current it is buildHardField's field bit for bit; the ladder rule is buildLadderField's.
//   3 THE AIM POINTS  segmentTime's closed form; with no current the time-aware aim points are buildAim's bit for bit (40 fields); in a stream the aim refuses a shortcut whose time is worse.
//   4 THE ARMS        the reference has no plan option; the route arm's plan knows the stream; both feel the stream at the vessel's position; in still water the two fly the same flight to the
//                     digit; flyPlus with currentAt equal to the scenario's own current is the flight it was; the route arm's plan differs from the reference's in a stream.
// SABOTAGE LOG (each broken, run, restored; red = failing rows):
//   T1 the profile cos, not cos^2 1 | T2 the distance measured along the stream, not across it 1 | T3 the point's x and y drawn in the wrong order 1 | T4 hard-current's uniform current kept 1
//   T5 the time-aware aim takes every clear shortcut 1 | T6 its one-cell tolerance dropped 2 | T7 the route arm without the time-aware aim 1 | T8 the route plan built in still water 1
//   T9 (in brain/subNavPlus.mjs) flyPlus ignores currentAt 1 (the row was added before the pass, for this) | T10 flyPlus ignores aimOf 1 (likewise)
//   T11 flyPlus's t = 0 plan ignores planField: 0 red at first -- THE ROUTE ARM WOULD HAVE FLOWN THE SHARED PLAN and every row still passed (they built the plan by hand); the row "the
//   route arm FLIES its plan" added; then 1
//   PART 3's chain (section 5): C1 chains differ only beyond 1e-3 m 1 | C2 the point count ignored 1 | C3 the no-progress stop removed 1 | C5 the route chain's plan built in still water 1
//   C4 the route chain walked on buildAim's points, not the time-aware ones: 0 red at first (no row held planChains to the time-aware points); the row added; then 1
//   E4 planChains' reference field on another ladder than the flight's 2 (the field-tie row, PART 3 AMENDMENT 1)
//   C6 the stop at the waypoint removed: 0 red, AN EQUIVALENT MUTANT -- the next step finds the waypoint's own cell aiming at the waypoint, and the no-progress stop ends the chain there
"use strict";
import * as R from "./subNavRoute.mjs";
import * as N from "./subFieldNav.mjs";
import * as H from "./subHardNav.mjs";
import * as P from "./subNavPlus.mjs";
import * as ST from "./subTask.mjs";
import * as AP from "./autopilotSub.mjs";
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const sec = (t) => console.log("\n" + t);
const thr = (f) => { try { f(); return ""; } catch (e) { return String(e.message); } };
const pilot = (s, t, c) => AP.decide(s, t, c), close = (a, b, e = 1e-12) => Math.abs(a - b) <= e;
const sameField = (a, b) => ["dist", "fx", "fz", "blocked"].every((k) => a[k].length === b[k].length && a[k].every((v, i) => Object.is(v, b[k][i])));
console.log("subNavRoute-selfcheck -- a plan that knows the stream\n");

sec("1. THE STREAM");
{
    const st = { theta: Math.PI / 2, px: 100, py: 0, halfWidth: 30, speed: 2 };   // a stream running along +y through x = 100
    const c0 = R.streamAt(st, 100, 50), c15 = R.streamAt(st, 115, -20), c30 = R.streamAt(st, 130, 0), c40 = R.streamAt(st, 60, 0);
    ok("!! the peak on the centre line runs along theta; cos^2 across it (half the peak at a quarter... at d = 15 of 30: 2 cos^2(pi/4) = 1); zero at the half-width and beyond", close(c0[0], 0, 1e-12) && close(c0[1], 2) && close(Math.hypot(c15[0], c15[1]), 1) && c30[0] === 0 && c30[1] === 0 && c40[1] === 0 && c0[2] === 0, JSON.stringify([c0, c15].map((v) => v.map((x) => +x.toFixed(4)))));
    const sc = R.streamScenario(507), base = H.hardScenario(507, "hard-current");
    ok("!! the scenario is hard-current's start, waypoint, islands, icebergs and weight error for the seed; its uniform current is dropped (current null)", JSON.stringify(sc.start) === JSON.stringify(base.start) && JSON.stringify(sc.goal) === JSON.stringify(base.goal) && JSON.stringify(sc.obstacles) === JSON.stringify(base.obstacles) && sc.weightError === base.weightError && sc.current === null && sc.kind === "hard-stream");
    const ss = Array.from({ length: 200 }, (_, i) => R.streamScenario(1000 + i).stream), inR = (v, lo, hi) => v >= lo && v < hi;
    ok("!! the stream's draws are in their registered ranges (theta 0 to 2 pi, P x 120 to 280, y -60 to 60, half-width 25 to 45, peak 1.2 to 2.2) and spread across them", ss.every((s) => inR(s.theta, 0, 2 * Math.PI) && inR(s.px, 120, 280) && inR(s.py, -60, 60) && inR(s.halfWidth, 25, 45) && inR(s.speed, 1.2, 2.2)) && Math.max(...ss.map((s) => s.speed)) > 2.1 && Math.min(...ss.map((s) => s.speed)) < 1.3);
    const r = ((a) => () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; })((507 * 7919 + 90001) >>> 0);
    const want = [r() * 2 * Math.PI, 120 + 160 * r(), -60 + 120 * r(), 25 + 20 * r(), 1.2 + r()], got = sc.stream;
    ok("!! drawn from mulberry(seed x 7919 + 90001) in the registered order: theta, the point's x then y, the half-width, the peak", [got.theta, got.px, got.py, got.halfWidth, got.speed].every((v, i) => close(v, want[i], 1e-9)));
    ok("  the same seed gives the same scenario; speedScale 0 is still water everywhere", JSON.stringify(R.streamScenario(507)) === JSON.stringify(sc) && R.streamScenario(507, { speedScale: 0 }).stream.speed === 0 && R.streamAt(R.streamScenario(507, { speedScale: 0 }).stream, sc.stream.px, sc.stream.py).every((v) => v === 0));
    ok("  an unknown set is refused by name", /unknown set "held9"/.test(thr(() => R.streamSetOf("held9"))) && R.ROUTE_SETS.held86[0] === 9301 && R.ROUTE_SETS.held86.length === 200);
}

sec("2. THE PLAN");
{
    const sc = R.streamScenario(501), shapes = H.planShapes(sc, 0), at = (x, y) => R.streamAt(sc.stream, x, y);
    const hf = H.buildHardField(shapes, sc.goal, { margin: 12 }), rf = R.buildRouteField(shapes, sc.goal, { margin: 12, currentAt: at }), r0 = R.buildRouteField(shapes, sc.goal, { margin: 12 });
    ok("!! the route field's geometry is buildHardField's to the cell (blocked, the goal cell, the margin); with no current it is buildHardField's field bit for bit", rf.blocked.every((v, i) => v === hf.blocked[i]) && JSON.stringify(rf.goalCell) === JSON.stringify(hf.goalCell) && rf.margin === 12 && sameField(r0, hf));
    ok("!! in the stream its dist differs from the still-water plan's", rf.dist.some((v, i) => v !== hf.dist[i]));
    const lf = H.buildLadderField(shapes, sc.goal, sc.start), rl = R.buildRouteLadder(shapes, sc.goal, sc.start);
    ok("  the ladder rule is buildLadderField's (with no current, the same field at the same margin)", rl.margin === lf.margin && sameField(rl, lf));
}

sec("3. THE AIM POINTS");
{
    ok("!! segmentTime: still water is the length; 40 m straight against a uniform 1.5 m/s current at 3 m/s is 40 x 3 / 1.5 still-water metres (to the quantum); across a current reaching 3 m/s, Infinity", close(R.segmentTime(0, 0, 30, 40, null), 50, 1e-9) && close(R.segmentTime(0, 0, 40, 0, () => [-1.5, 0]), 80, 0.02) && R.segmentTime(0, 0, 0, 40, () => [3, 0]) === Infinity);
    let n = 0, bad = 0;
    for (const kind of ["hard-current", "hard-current-gap", "hard-islands", "hard-gaps"]) for (let s = 1; s <= 10; s++) {
        const sc = P.plusScenario(s, kind), f = R.buildRouteLadder(H.planShapes(sc, 0), sc.goal, sc.start), a0 = N.buildAim(f, sc.goal), a1 = R.buildTimedAim(f, sc.goal); n++;
        if (!a1.ax.every((v, i) => Object.is(v, a0.ax[i]) && Object.is(a1.ay[i], a0.ay[i]))) bad++;
    }
    ok("!! with no current the time-aware aim points are buildAim's bit for bit (40 fields: seeds 1 to 10 of four kinds)", n === 40 && bad === 0, `${bad} of ${n} differ`);
    // an open field 40 x 20 cells, the goal at the far +x end, a 2.5 m/s stream against the vessel in the band 40 <= y <= 60: a shortcut from below the band to a point above it must not be taken through the band when it is slower
    const grid = { w: 40, h: 20, cell: 5, x0: 0, y0: 0 }, blocked = new Uint8Array(800), goal = { x: 197, y: 92 };
    const band = (x, y) => (y >= 40 && y <= 60 ? [-2.5, 0] : [0, 0]);
    const f = { ...grid, margin: 0, blocked, goalCell: { gx: 39, gy: 18 } }, r = (await import("./flowfieldDirectional.mjs")).solveDirectional(grid, blocked, [f.goalCell], { currentAt: band, V: 3 });
    const fs = { ...f, dist: r.dist, fx: r.fx, fz: r.fz, currentAt: band, V: 3 }, still = { ...f, ...(await import("./flowfieldDirectional.mjs")).solveDirectional(grid, blocked, [f.goalCell]) };
    const aT = R.buildTimedAim(fs, goal), aS = N.buildAim(still, goal), i = 1 * 40 + 2;   // the cell (2, 1), low and far from the goal
    const cxy = (a) => [a.ax[i], a.ay[i]], tAim = cxy(aT), sAim = cxy(aS);
    ok("!! in an adverse band the time-aware aim does not take the still-water shortcut straight through it: the still-water aim from (2, 1) is the waypoint; the time-aware aim is not, and its segment runs faster than the straight run would", sAim[0] === goal.x && sAim[1] === goal.y && !(tAim[0] === goal.x && tAim[1] === goal.y) && R.segmentTime(12.5, 7.5, tAim[0], tAim[1], band) < R.segmentTime(12.5, 7.5, goal.x, goal.y, band), `time-aware aim ${tAim.map((v) => v.toFixed(1))}`);
}

sec("4. THE ARMS");
{
    const sc = R.streamScenario(502), oRef = R.routeOptions(sc, "any+crab"), oRt = R.routeOptions(sc, "any+crab+route");
    ok("!! the reference has no plan option and no aim option; the route arm has both; both feel the stream at the vessel's position", !oRef.planField && !oRef.aimOf && typeof oRt.planField === "function" && typeof oRt.aimOf === "function" && JSON.stringify(oRef.currentAt(sc.stream.px, sc.stream.py, 0)) === JSON.stringify(R.streamAt(sc.stream, sc.stream.px, sc.stream.py)) && JSON.stringify(oRt.currentAt(sc.stream.px, sc.stream.py, 9)) === JSON.stringify(R.streamAt(sc.stream, sc.stream.px, sc.stream.py)));
    ok("  an unknown arm is refused by name", /unknown arm "any"/.test(thr(() => R.routeOptions(sc, "any"))));
    const st = R.streamScenario(503, { speedScale: 0 }), a = R.flyRoute(pilot, st, "any+crab"), b = R.flyRoute(pilot, st, "any+crab+route");
    ok("!! in still water the two arms fly the same flight to the digit", a.status === b.status && a.ticks === b.ticks && a.path === b.path && a.minClearance === b.minClearance && a.arm === "any+crab" && b.arm === "any+crab+route", `${a.status} ${a.ticks}`);
    const hc = P.plusScenario(7302, "hard-current"), old = P.flyPlus(pilot, hc, "any+crab"), viaOpt = P.flyPlus(pilot, hc, "any+crab", { currentAt: (x, y, t) => ST.currentAt(hc.current, t) });
    ok("!! flyPlus with currentAt equal to the scenario's own current is the flight it was (status, ticks, path)", old.status === viaOpt.status && old.ticks === viaOpt.ticks && old.path === viaOpt.path);
    const still = R.flyRoute(pilot, R.streamScenario(502, { speedScale: 0 }), "any+crab"), felt = R.flyRoute(pilot, sc, "any+crab");
    ok("!! the vessel feels the stream: the reference's flight in seed 502's stream differs from the same scenario in still water", felt.ticks !== still.ticks || felt.path !== still.path, `${felt.ticks} against ${still.ticks} ticks`);
    let calls = 0; const spy = (f, g) => { calls++; return N.aimOf(f, g); }, nan = (f) => ({ ax: new Float64Array(f.w * f.h).fill(NaN), ay: new Float64Array(f.w * f.h).fill(NaN) });
    const dflt = P.flyPlus(pilot, sc, "any+crab", { currentAt: oRef.currentAt }), spied = P.flyPlus(pilot, sc, "any+crab", { currentAt: oRef.currentAt, aimOf: spy }), noAim = P.flyPlus(pilot, sc, "any+crab", { currentAt: oRef.currentAt, aimOf: nan });
    ok("!! flyPlus consults aimOf every tick of an any-arm flight (aimOf = subFieldNav.aimOf is the default flight); an aimOf with no aim points falls back to the cell flow, a different flight", calls === dflt.ticks && spied.ticks === dflt.ticks && spied.path === dflt.path && (noAim.ticks !== dflt.ticks || noAim.path !== dflt.path), `${calls} calls, ${dflt.ticks} ticks`);
    const s1 = R.streamScenario(501), f1 = R.flyRoute(pilot, s1, "any+crab"), f2 = R.flyRoute(pilot, s1, "any+crab+route");
    ok("!! the route arm FLIES its plan: in seed 501's stream (in no set) the two arms' flights differ", f1.ticks !== f2.ticks || f1.path !== f2.path, `${f1.ticks} against ${f2.ticks} ticks`);
    const shapes = H.planShapes(sc, 0), p0 = H.buildLadderField(shapes, sc.goal, sc.start), p1 = oRt.planField(shapes, sc.goal, sc.start, { ladder: H.MARGIN_LADDER, edgeExtra: 0 });
    ok("!! the route arm's plan knows the stream: its dist differs from the reference's plan in this stream", p1.dist.some((v, i) => v !== p0.dist[i]));
}

sec("5. THE CHAIN (ITEM 2 PART 3)");
{
    const D = await import("./flowfieldDirectional.mjs"), grid = { w: 40, h: 20, cell: 5, x0: 0, y0: 0 }, blocked = new Uint8Array(800), goal = { x: 197, y: 52 };
    const f = { ...grid, margin: 0, blocked, goalCell: { gx: 39, gy: 10 }, ...D.solveDirectional(grid, blocked, [{ gx: 39, gy: 10 }]) }, ch = R.aimChain(f, N.buildAim(f, goal), 12.5, 52.5, goal);
    ok("!! on an open field the chain from a far cell is the start and then the waypoint", ch.length === 2 && ch[1][0] === goal.x && ch[1][1] === goal.y, JSON.stringify(ch));
    const nan = { ax: new Float64Array(800).fill(NaN), ay: new Float64Array(800).fill(NaN) }, bounce = { ax: new Float64Array(800), ay: new Float64Array(800) };
    for (let i = 0; i < 800; i++) { const gx = i % 40; bounce.ax[i] = gx < 20 ? 152.5 : 12.5; bounce.ay[i] = 52.5; }
    ok("!! the chain stops at a cell with no aim point, at no progress, and after CHAIN_STEPS (400) points", R.aimChain(f, nan, 12.5, 52.5, goal).length === 1 && R.aimChain(f, bounce, 12.5, 52.5, goal).length === R.CHAIN_STEPS + 1 && R.aimChain(f, { ax: Float64Array.from({ length: 800 }, () => 12.5), ay: Float64Array.from({ length: 800 }, () => 52.5) }, 12.5, 52.5, goal).length === 1);
    const A = [[0, 0], [10, 0], [20, 5]];
    ok("!! two chains differ iff a different count or a point more than 1e-6 m away (2e-6 differs, 5e-7 does not)", !R.chainsDiffer(A, A.map((p) => [...p])) && R.chainsDiffer(A, A.slice(0, 2)) && R.chainsDiffer(A, [[0, 0], [10, 2e-6], [20, 5]]) && !R.chainsDiffer(A, [[0, 0], [10, 5e-7], [20, 5]]));
    const still = [501, 502, 503, 504, 505].every((s) => !R.planChains(R.streamScenario(s, { speedScale: 0 })).inS), some = [501, 502, 503, 504, 505, 506, 507, 508, 509, 510].filter((s) => R.planChains(R.streamScenario(s)).inS);
    ok("!! in still water no scenario is in S (seeds 501 to 505); in the stream some are (seeds 501 to 510, in no set)", still && some.length > 0, `in S: ${some.join(" ")}`);
    // the route chain walks the TIME-AWARE aim points of the route field: find a seed (in no set) where those differ from buildAim's on the same field, and hold planChains to it
    let held = null;
    for (let sd = 501; sd <= 600 && !held; sd++) {
        const sc = R.streamScenario(sd), sh = H.planShapes(sc, 0), f1 = R.buildRouteLadder(sh, sc.goal, sc.start, { currentAt: (x, y) => R.streamAt(sc.stream, x, y) });
        const timed = R.aimChain(f1, R.timedAimOf(f1, sc.goal), sc.start.x, sc.start.y, sc.goal), plain = R.aimChain(f1, N.buildAim(f1, sc.goal), sc.start.x, sc.start.y, sc.goal);
        if (R.chainsDiffer(timed, plain)) held = { sd, same: !R.chainsDiffer(R.planChains(sc).route, timed) };
    }
    ok("!! the route's chain is walked on the time-aware aim points (a seed in 501 to 600 where they differ from buildAim's on the route field: planChains follows the time-aware ones)", !!held && held.same, held ? `seed ${held.sd}` : "no such seed");
    // S's fields are the flight's own t = 0 plans: capture each arm's t = 0 field inside flyPlus (seeds in no set) and compare with planChains' fields
    const sameF = (a, b) => a.margin === b.margin && ["dist", "fx", "fz", "blocked"].every((k) => a[k].every((v, i) => Object.is(v, b[k][i])));
    const tied = [1001, 1002, 1003].every((sd) => {
        const sc = R.streamScenario(sd), pc = R.planChains(sc), got = [];
        for (const [k, arm] of R.ROUTE_ARMS.entries()) { const o = R.routeOptions(sc, arm), pf = o.planField || H.buildLadderField; P.flyPlus(pilot, sc, "any+crab", { ...o, seconds: 0.1, planField: (...a) => { const f = pf(...a); if (!got[k]) got[k] = f; return f; } }); }
        return got.length === 2 && sameF(got[0], pc.fields[0]) && sameF(got[1], pc.fields[1]);
    });
    ok("!! S is computed on the flight's own t = 0 plans: the field each arm builds inside flyPlus equals planChains' field for that arm (seeds 1001 to 1003)", tied);
    const st = { theta: 0, px: 100, py: 0, halfWidth: 30 };
    ok("  inBand: within the half-width of the centre line, not at it", R.inBand(st, 500, 29.9) && !R.inBand(st, 0, 30) && !R.inBand(st, 0, -31));
    ok("  the sets of Part 3: DEV 901 to 930, HELD87 9501 to 9700", R.ROUTE_SETS.dev3[0] === 901 && R.ROUTE_SETS.dev3.length === 30 && R.ROUTE_SETS.held87[0] === 9501 && R.ROUTE_SETS.held87.length === 200);
}

console.log(fails ? `\n${fails} FAIL` : "\nall checks pass");
process.exitCode = fails ? 1 : 0;
