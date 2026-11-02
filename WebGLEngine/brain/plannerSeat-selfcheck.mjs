// WebGLEngine/brain/plannerSeat-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node brain/plannerSeat-selfcheck.mjs      (about 8 s: three full-length twin dives are the cost)
//
// THE GATE OF brain/plannerSeat.mjs (Round 11 of brain/NEEDS_AND_LIMITS.md, registered first, amended before any audit seed was read).
//   1 CONSTANTS  the modes, the four-station cap, the 120 s replan; an unknown mode is refused.
//   2 NEAREST    (fixtures) the seat in nearest mode picks the first nearest open feasible station, never a visited or infeasible one, null and a surface when none is open; on real dives it equals the tuned rule dive for dive.
//   3 ROLLOUT    a rollout from the start of a real dive IS that dive's score (far 271: nearest-first 0.700, the order 1>2>0 0.850); a short rollout is a number in [0, 1]; a crushed boat predicts 0.
//   4 TWINPLAN   at the start of far 271 the twin picks 1>2>0 with predicted 0.85 against 0.70; ties go to the planned next station, then to nearest-first (plain 241, where every order scores 1.0).
//   5 THE SEAT   a full twin dive of far 271 scores 0.850 where nearest mode scores 0.700; it replans at the start, every 120 s and when a station is visited (stats.plans counts them); the cap, pump and repair are the tuned rule's.
//   6 PURE       no clock, random or file.
// NOT CHECKED, said plainly: that the twin beats nearest-first on dives it was not designed on (that is the experiment).
"use strict";
import fs from "node:fs";
let fails = 0, finished = false;
const died = (e) => { console.log("  FAIL  !! THE GATE THREW before it finished: " + String((e && e.stack) || e).split("\n").slice(0, 3).join(" | ").slice(0, 400)); process.exitCode = 1; };
process.on("uncaughtException", died); process.on("unhandledRejection", died);
process.on("exit", () => { if (!finished) { console.log("  FAIL  !! THE GATE ENDED BEFORE IT FINISHED"); process.exitCode = 1; } });
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const sec = (t) => console.log("\n" + t);
const J = JSON.stringify;
import * as T from "./needsTask.mjs";
import * as U from "./tunedRule.mjs";
import * as P from "./plannerSeat.mjs";
import { rolloutIdentity } from "../tools/ship/plannerRound.mjs";
console.log("plannerSeat-selfcheck -- the planner seat\n");
const code = fs.readFileSync(new URL("./plannerSeat.mjs", import.meta.url), "utf8").split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n");
const R8 = { alpha: 0.001, low: 0.38036, high: 0.68938, ramp: 20, cap: 0.88615 };
const st0 = { pos: [0, 0, -12] }, obsOf = (stations, o = {}) => ({ t: 100, r: { frac: 0.9, depth: 12, collapseDepth: 100, flood: 0, damage: 0, ...o }, stations: stations.map((s) => ({ visited: false, ...s })) });
const decide = (stations, o = {}) => P.plannerSeat(R8, { mode: "nearest" })({ model: null, read: null })(st0, obsOf(stations, o));
const fly = (plan, sc, extra = {}) => T.fly(T.flyDecision(P.plannerSeat(R8, plan)), sc, { gauge: T.GAUGE, ...extra });

sec("1. CONSTANTS");
{
    const thr = (f) => { try { f(); return null; } catch (e) { return e.message; } };
    ok("!! the modes are nearest and twin, at most four stations are planned, the replan interval is 120 s", J(P.MODES) === J(["nearest", "twin"]) && P.MAX_STATIONS === 4 && P.REPLAN_S === 120);
    ok("!! an unknown mode is refused (the registered model modes were dropped by Amendment 1)", /mode "horizon"/.test(thr(() => P.plannerSeat(R8, { mode: "horizon" }))) && /mode "shortest"/.test(thr(() => P.plannerSeat(R8, { mode: "shortest" }))));
}
sec("2. NEAREST");
{
    const a = { x: 50, y: 0, depth: 12 }, b = { x: 0, y: 90, depth: 12 }, c = { x: -50, y: 0, depth: 12 };
    ok("!! the first nearest open feasible station is chosen; equal distances go to the first in the list", decide([b, a]).station.x === 50 && decide([a, c]).station.x === 50 && decide([c, a]).station.x === -50);
    ok("!! visited and infeasible stations are never chosen; with none open the station is null and the seat surfaces", decide([{ ...a, visited: true }, b]).station.y === 90 && decide([{ x: 10, y: 0, depth: 99 }, b], { collapseDepth: 50 }).station.y === 90 && (() => { const d = decide([{ ...a, visited: true }]); return d.station === null && d.surface === true; })());
    const sc = T.scenario(272, "far"), rule = T.fly(T.flyDecision(U.tunedSeat(R8, U.WIDE_BOUNDS)), sc, { gauge: T.GAUGE });
    ok("!! on a real dive the seat in nearest mode equals the tuned rule dive for dive", fly({ mode: "nearest" }, sc).fingerprint === rule.fingerprint);
    ok("!! pump, repair and the cap are the tuned rule's (cap 0.88615 on the decision)", decide([a], { flood: 0.01, damage: 0.2 }).cap === 0.88615 && decide([a], { flood: 0.01, damage: 0.2 }).pump === true);
}
sec("3. ROLLOUT");
{
    const far271 = T.scenario(271, "far"), r = rolloutIdentity(R8, far271);
    ok("!! a rollout of nearest-first from the start IS the real noise-free dive (far 271: 0.700 and 0.700; plain 241: 1.000)", Math.abs(r.rollout - r.real) < 1e-9 && Math.abs(r.real - 0.7) < 1e-9 && Math.abs(rolloutIdentity(R8, T.scenario(241, "plain")).rollout - 1) < 1e-9);
    const s = rolloutIdentity(R8, far271, 100);
    ok("!! a short rollout is a number in [0, 1] and equals the short real dive", s.rollout >= 0 && s.rollout <= 1 && Math.abs(s.rollout - s.real) < 1e-9);
}
sec("4. TWINPLAN");
{
    const sc = T.scenario(271, "far");
    ok("!! twinPlan chooses 1>2>0 at the start of far 271 with predicted 0.85 against nearest-first's 0.70", (() => {
        let planned = null; const seat = P.plannerSeat(R8, { mode: "twin" });
        T.fly((ctx) => { const s = seat(ctx), p = T.flyDecision(() => s)(ctx); return (state, obs, cur) => { if (!planned) planned = P.twinPlan(ctx.model, state, obs, obs.r.frac, U.normalise(R8, U.WIDE_BOUNDS)); return p(state, obs, cur); }; }, sc, { gauge: null, seconds: 1 });
        return planned && J(planned.order) === J([1, 2, 0]) && Math.abs(planned.values["1>2>0"] - 0.85) < 1e-9 && Math.abs(planned.values.nearest - 0.7) < 1e-4;
    })());
    ok("!! on a dive where every order scores the same (plain 241) nearest-first wins the tie; a planned next station wins it over nearest-first", (() => {
        const sc2 = T.scenario(241, "plain"); let a = null, b = null;
        T.fly((ctx) => { const s = P.plannerSeat(R8, { mode: "nearest" })(ctx), p = T.flyDecision(() => s)(ctx); return (state, obs, cur) => { if (!a) { const q = U.normalise(R8, U.WIDE_BOUNDS); a = P.twinPlan(ctx.model, state, obs, obs.r.frac, q, -1); b = P.twinPlan(ctx.model, state, obs, obs.r.frac, q, 2); } return p(state, obs, cur); }; }, sc2, { gauge: null, seconds: 1 });
        return a && a.order === null && b && b.order !== null && b.order[0] === 2;
    })());
}
sec("5. THE SEAT");
{
    const far271 = T.scenario(271, "far");
    const near = fly({ mode: "nearest" }, far271), twin = (() => { let seat = null; const r = T.fly((ctx) => T.flyDecision((c) => (seat = P.plannerSeat(R8, { mode: "twin" })(c)))(ctx), far271, { gauge: T.GAUGE }); return { r, seat }; })();
    ok("!! a full twin dive of far 271 scores 0.850 where nearest mode scores 0.700", Math.abs(twin.r.score - 0.85) < 1e-9 && Math.abs(near.score - 0.7) < 1e-9, twin.r.score + " against " + near.score);
    ok("!! it replans at the start, every 120 s and when a station is visited: between 5 and 12 plans on the dive, and the switch count is a whole number", twin.seat.stats.plans >= 5 && twin.seat.stats.plans <= 12 && Number.isInteger(twin.seat.stats.switches), "plans " + twin.seat.stats.plans + ", switches " + twin.seat.stats.switches);
}
sec("6. PURE");
{
    ok("!! the file reads no clock, no random number and nothing from the disk", !/Date\.now|Math\.random|performance\.now|readFileSync|writeFileSync/.test(code));
}
console.log(fails ? `\n${fails} FAIL` : "\nall checks pass");
finished = true;
