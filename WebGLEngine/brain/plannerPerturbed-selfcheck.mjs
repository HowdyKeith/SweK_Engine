// WebGLEngine/brain/plannerPerturbed-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node brain/plannerPerturbed-selfcheck.mjs      (about 15 s: a few 300-second twin dives are the cost)
//
// THE GATE OF brain/plannerPerturbed.mjs (Round 13 of brain/NEEDS_AND_LIMITS.md, registered first): the Round 11 twin with a wrong planning model.
//   1 ERRORS     the four keys, zero by default; an unknown key, a non-finite value and a fraction at or under -1 are refused.
//   2 MODEL      drag 0 hands back the same model object; drag scales both areas and nothing else.
//   3 ROLLOUT    with no error the rollout IS Round 11's rollout; each error moves the predicted score of a real start in the direction the table below records (drag, drain, charge: seed 2 far 0.100 -> 0.850 at drag -0.5; seed 2 both 0.699 -> 0.249 at drain +1; seed 1 far 0.250 -> 0.550 at charge -0.99).
//   4 TWINPLAN   the start-energy error changes the plan's predicted values (start -0.5: every order 0.55 at seed 1 far) and nothing else does at zero; a zero error equals plannerSeat.twinPlan.
//   5 THE SEAT   with no error the seat equals plannerSeat's twin dive for dive; a heavy error changes dives (seeds 2-3 far); the seat counts plans.
//   6 PURE       no clock, random or file.
// NOT CHECKED, said plainly: that a wrong model costs the twin its gain (that is the experiment).
// SABOTAGE LOG (27 mutants of brain/plannerPerturbed.mjs, run against a copy of this gate): 7 went 0 red on the first pass. Four got rows -- the nearest-first rollout and the order rollouts both using the error (a drag error must change both values at seed 3 far), the tie bonus (plain 241: nearest-first wins a tie, a planned next station wins it over nearest-first), the 120 s replan (plan and tick counts equal plannerSeat's twin on seed 3 far, at least 3 plans). Three are EQUIVALENT and said so: the energy clamp after the scaled step (stepNeeds clamps the next step; 24 starts x 4 errors, up to charge +50 and drain +50, gave identical rollouts), the start-energy clamp (the same), and the four-station cap (every scenario of this task has exactly three stations, so the cap never binds here). The 'rollout skips the scaling when both errors are zero' mutant is equivalent too (scaling by 1 is the identity). All 27 are red or said above.
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
import * as N from "../physics/mechanics/subNeeds.mjs";
import * as P from "./plannerSeat.mjs";
import * as Q from "./plannerPerturbed.mjs";
import { startOf } from "../tools/ship/plannerRound.mjs";
console.log("plannerPerturbed-selfcheck -- the twin with a wrong model of the boat\n");
const code = fs.readFileSync(new URL("./plannerPerturbed.mjs", import.meta.url), "utf8").split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n");
const R8 = { alpha: 0.001, low: 0.38036, high: 0.68938, ramp: 20, cap: 0.88615 }, q = U.normalise(R8, U.WIDE_BOUNDS);
const set = T.setOf(["far", "both"], 1, 6), fix = set.map((sc) => ({ sc, ...startOf(sc), stations: sc.stations.map((s) => ({ x: s.x, y: s.y, depth: s.depth, visited: false })) }));
const roll = (i, e, f = Q.rollout, secs = 300) => { const x = fix[i]; return f === Q.rollout ? Q.rollout(x.model, x.st, x.nd, x.stations, 0, null, q, Q.errOf(e), secs) : P.rollout(x.model, x.st, x.nd, x.stations, 0, null, q, secs); };
const r3 = (x) => Math.round(x * 1000) / 1000;

sec("1. ERRORS");
{
    ok("!! the four keys are drag, drain, charge, start, in that order, and NO_ERROR is zero on each", J(Q.KEYS) === J(["drag", "drain", "charge", "start"]) && Q.KEYS.every((k) => Q.NO_ERROR[k] === 0));
    ok("!! errOf() is all zeros; a partial error keeps the rest zero and keeps the value given", J(Q.errOf()) === J({ drag: 0, drain: 0, charge: 0, start: 0 }) && J(Q.errOf({ drain: 0.2 })) === J({ drag: 0, drain: 0.2, charge: 0, start: 0 }) && Q.errOf({ start: -0.5 }).start === -0.5);
    const thr = (e) => { try { Q.errOf(e); return false; } catch { return true; } };
    ok("!! an unknown key (a typo must not read as exact), NaN, Infinity and a fraction at or under -1 are refused; -0.99 is allowed", thr({ dragg: 0.1 }) && thr({ drag: NaN }) && thr({ charge: Infinity }) && thr({ start: -1 }) && thr({ drain: -2 }) && !thr({ charge: -0.99 }));
}
sec("2. MODEL");
{
    const m = T.model(), same = Q.modelOf(m, Q.errOf()), big = Q.modelOf(m, Q.errOf({ drag: 0.5 }));
    ok("!! no drag error hands back the very same model", same === m);
    ok("!! drag +0.5 multiplies the frontal and side areas by 1.5 and leaves every other field alone", Math.abs(big.frontalArea - m.frontalArea * 1.5) < 1e-12 && Math.abs(big.sideArea - m.sideArea * 1.5) < 1e-12 && big.mass === m.mass && big.spec === m.spec && big.inertia === m.inertia && big.weight === m.weight && big.vmass === m.vmass && m.sideArea === 6.72);
}
sec("3. ROLLOUT");
{
    const ids = [0, 1, 4, 7, 9, 11].map((i) => roll(i, {}) === roll(i, {}, P.rollout));
    ok("!! with no error the rollout is Round 11's rollout on six starts (seeds 1, 2 and 5 far, 2, 4 and 6 both)", ids.every(Boolean), ids.join(","));
    ok("!! drag -0.5 lifts seed 2 far from 0.100 to 0.850 (the twin thinks it is faster); drag +0.5 does not change it", r3(roll(1, {})) === 0.1 && r3(roll(1, { drag: -0.5 })) === 0.85 && r3(roll(1, { drag: 0.5 })) === 0.1);
    ok("!! drain +1 drops seed 2 both from 0.699 to 0.249 (the twin runs out); drain -0.5 lifts it to 0.398; charge has nothing to do with it (0.699 at charge +1)", r3(roll(7, {})) === 0.699 && r3(roll(7, { drain: 1 })) === 0.249 && r3(roll(7, { drain: -0.5 })) === 0.398 && r3(roll(7, { charge: 1 })) === 0.699);
    ok("!! charge -0.99 lifts seed 1 far from 0.250 to 0.550 and charge +1 to 0.400; drain -0.5 leaves it at 0.250 (the loss and the gain are scaled apart)", r3(roll(0, {})) === 0.25 && r3(roll(0, { charge: -0.99 })) === 0.55 && r3(roll(0, { charge: 1 })) === 0.4 && r3(roll(0, { drain: -0.5 })) === 0.25);
    ok("!! a dead battery stops at zero and a full one at capacity: drain +50 on seed 3 far is a number in [0, 1], charge +50 as well", [roll(2, { drain: 50 }), roll(2, { charge: 50 })].every((v) => v >= 0 && v <= 1));
}
sec("4. TWINPLAN");
{
    const plan = (i, e, ema = fix[i].sc.frac0) => { const x = fix[i]; return Q.twinPlan(x.model, x.st, { t: 0, stations: x.stations, r: N.readings(x.model, x.nd, x.st) }, ema, q, Q.errOf(e), -1, 300); };
    const base = plan(0, {}), low = plan(0, { start: -0.5 }), high = plan(0, { start: 0.5 }), ref = P.twinPlan(fix[0].model, fix[0].st, { t: 0, stations: fix[0].stations, r: N.readings(fix[0].model, fix[0].nd, fix[0].st) }, fix[0].sc.frac0, q, -1, 300);
    ok("!! with no error the plan is plannerSeat.twinPlan's (order and every value)", J(base) === J(ref));
    ok("!! start -0.5 (half the energy) makes every order 0.55 at seed 1 far, where the exact plan has 0.85 for the best; start +0.5 reads other values", Math.max(...Object.values(low.values).map(r3)) === 0.55 && Math.min(...Object.values(low.values).map(r3)) === 0.55, J(Object.values(low.values).map(r3)));
    ok("!! at seed 5 far the exact plan is the order [0,1,2], start +0.5 changes it to [1,2,0] and start -0.5 to nearest-first (null)", J(plan(4, {}).order) === "[0,1,2]" && J(plan(4, { start: 0.5 }).order) === "[1,2,0]" && plan(4, { start: -0.5 }).order === null);
    const dragged = plan(2, { drag: -0.5 }), exact2 = plan(2, {});
    ok("!! a drag error changes the value of nearest-first AND of the orders at seed 3 far (the nearest rollout and every order rollout both use the error)", dragged.values.nearest !== exact2.values.nearest && Object.keys(exact2.values).filter((k) => k !== "nearest").some((k) => dragged.values[k] !== exact2.values[k]) && Object.keys(exact2.values).filter((k) => k !== "nearest").filter((k) => dragged.values[k] !== exact2.values[k]).length >= 3);
    const plain = T.scenario(241, "plain"), px = startOf(plain), pst = plain.stations.map((s) => ({ x: s.x, y: s.y, depth: s.depth, visited: false })), pobs = { t: 0, stations: pst, r: N.readings(px.model, px.nd, px.st) };
    const tie = (prefer) => Q.twinPlan(px.model, px.st, pobs, plain.frac0, q, Q.errOf({}), prefer, 600);
    ok("!! when every order ties (plain 241) the plan keeps nearest-first, and a planned next station wins the tie: prefer 2 gives an order that starts with 2", tie(-1).order === null && Object.values(tie(-1).values).every((v) => Math.abs(v - 1) < 1e-5) && tie(2).order && tie(2).order[0] === 2);
    ok("!! the start energy is clamped to the battery: ema 0.9 with start +5 still plans (a finite number)", Object.values(plan(0, { start: 5 }, 0.9).values).every(Number.isFinite));
}
sec("5. THE SEAT");
{
    const three = T.setOf(["far"], 2, 3), fly = (err) => { const seats = []; const r = T.evaluate(T.flyDecision((c) => { const sx = Q.perturbedSeat(R8, err, { seconds: 300 })(c); seats.push(sx); return sx; }), three, { gauge: T.GAUGE, seconds: 300 }); return { r, seat: seats[seats.length - 1] }; };
    const a = fly({}), b = fly({ drag: -0.5, drain: 1, start: -0.5 });
    const refSeats = [], ref = T.evaluate(T.flyDecision((c) => { const sx = P.plannerSeat(R8, { mode: "twin", seconds: 300 })(c); refSeats.push(sx); return sx; }), three, { gauge: T.GAUGE, seconds: 300 });
    ok("!! with no error the seat equals plannerSeat's twin dive for dive (fingerprint and score) on seeds 2-3 far", a.r.runs.every((r, i) => r.fingerprint === ref.runs[i].fingerprint && r.score === ref.runs[i].score));
    ok("!! a heavy error (drag -0.5, drain +1, start -0.5) changes both dives (seeds 2 and 3 far)", a.r.runs.filter((r, i) => r.fingerprint !== b.r.runs[i].fingerprint).length >= 2, a.r.runs.map((r) => r.score.toFixed(2)).join(" ") + " | " + b.r.runs.map((r) => r.score.toFixed(2)).join(" "));
    const ref_ = refSeats[1], mine_ = a.seat;
    ok("!! the seat counts plans and ticks as plannerSeat's twin does (the same plan count on seed 3 far, at least 3 over 300 s: the start, the 120 s and 240 s replans)", mine_.stats.plans === ref_.stats.plans && mine_.stats.plans >= 3 && mine_.stats.ticks === ref_.stats.ticks && ref_.stats.ticks > 100, `${mine_.stats.plans} plans, ${mine_.stats.ticks} ticks`);
    {   // Round 24: the maxStations option (default 4, the shipped cap)
        const sc = T.scenario(241, "plain"), sc5 = { ...sc, stations: [...sc.stations, { x: 30, y: 20, depth: 15, unreachable: false }, { x: 400, y: 400, depth: 15, unreachable: false }] };
        const planWith = (maxStations) => { let plan = null; T.fly((ctx) => { const s = P.plannerSeat(R8, { mode: "nearest" })(ctx), p = T.flyDecision(() => s)(ctx); return (state, obs, cur) => { if (!plan) plan = maxStations === undefined ? Q.twinPlan(ctx.model, state, obs, obs.r.frac, q, Q.errOf({}), -1, 60) : Q.twinPlan(ctx.model, state, obs, obs.r.frac, q, Q.errOf({}), -1, 60, [0], maxStations); return p(state, obs, cur); }; }, sc5, { gauge: null, seconds: 1 }); return plan; };
        const keysOf = (pl) => Object.keys(pl.values).filter((k) => k !== "nearest"), p4 = planWith(), p2 = planWith(2), p3 = planWith(3), p5 = planWith(5);
        ok("!! !! maxStations n enumerates the orders of the n nearest open stations: 2 -> 2 orders, 3 -> 6, 5 -> 120 (all five stations in every position), and the default is 4 -> 24", keysOf(p2).length === 2 && keysOf(p3).length === 6 && keysOf(p4).length === 24 && keysOf(p5).length === 120);
        const ids = (pl) => new Set(keysOf(pl).flatMap((k) => k.split(">"))), sub = (a, b) => [...a].every((x) => b.has(x));
        ok("!! the default plan is the explicit maxStations 4 plan (order and every value); the stations tried are nested by distance: the 2 nearest are among the 3 nearest, among the 4, among the 5 (sizes 2, 3, 4, 5)", J(p4) === J(planWith(4)) && ids(p2).size === 2 && ids(p3).size === 3 && ids(p4).size === 4 && ids(p5).size === 5 && sub(ids(p2), ids(p3)) && sub(ids(p3), ids(p4)) && sub(ids(p4), ids(p5)));
        const cost = (maxStations) => { const seats = []; T.evaluate(T.flyDecision((c) => { const sx = Q.perturbedSeat(R8, {}, maxStations === undefined ? { seconds: 60 } : { seconds: 60, maxStations })(c); seats.push(sx); return sx; }), [sc5], { gauge: null, seconds: 60 }); return seats[0].stats.rolloutSeconds; };
        ok("!! the seat passes the option to the planner: scheduled rollout seconds rise with the number of orders tried (cap 2: 3 values a plan, cap 4: 25, cap 5: 121; the plan times differ between caps, so the ratios are bounds, cap 2 under a fifth of cap 4 and cap 5 three to five times it), and an unset cap costs what cap 4 does", cost(2) < cost(3) && cost(3) < cost(4) && cost(4) < cost(5) && cost(2) / cost(4) < 0.2 && cost(5) / cost(4) > 3 && cost(5) / cost(4) < 5 && cost() === cost(4), `${cost(2)} ${cost(4)} ${cost(5)}`);
    }
    ok("!! an unknown error key is refused at construction (not at the first tick)", (() => { try { Q.perturbedSeat(R8, { speed: 0.1 }); return false; } catch { return true; } })());
}
sec("6. PURE");
{
    ok("!! the file reads no clock, no random number and nothing from the disk", !/Date\.now|Math\.random|performance\.now|readFileSync|writeFileSync/.test(code));
}
console.log(fails ? `\n${fails} FAIL` : "\nall checks pass");
finished = true;
