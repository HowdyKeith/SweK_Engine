// WebGLEngine/brain/courierTask-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time). Run: node brain/courierTask-selfcheck.mjs
//
// THE GATE OF brain/courierTask.mjs (round 4 of the submarine stations, brain/SUB_STATIONS_WIP.md section 14): the battery and the sets, a leg's need, the LEGS station on a hand-driven navigator, the crews, a run, the verdict.
// Flies no HELD seed (its runs are DEV seeds, 60 s long).
// SABOTAGED -- 23 mutants of brain/courierTask.mjs, each alone in place and restored, EVERY ONE RED BY NAME ON THE FIRST PASS: L01 the prior until 100 m | L02 no margin | L03 a cap of 1 | L04 an emergency at 0.05 | L05 the prior always |
//   L06 charging counted as spent | L07 a decision every tick | L08 no first-tick decision | L09 no emergency | L10 never letting go | L11 charging to the need, not the need + 0.2 | L12 the distance to the start, not the goal |
//   L13 the legs station below energy | C01 LEGS without the gated energy station | C02 LEGS with the energy claim open | C03 FIXED as NAV | C04 a battery to 0.5 | C05 HELD from 177002 | C06 a 600 s run | V01 a two-sided test |
//   V02 ties as LEGS's | V03 p 0.1 | V04 the seeds unchecked. THREE ROWS OF MINE WERE MUDDLED and were rewritten before the mutants ran (one said the opposite of what it tested, one asked a question, one checked almost nothing).
// ROUND 5 (ROUTE, section 3b): 6 more mutants, every one red by name: R01 the ROUTE crew built without the route | R02 the route asked at the start, not the boat | R03 the route used even when null | R04 the route for LEGS too |
//   R05 round 5's HELD from 183002 | R06 a navigator with no routeLength throwing. R01 WENT 0 RED FIRST (the crew row checked only the stations' names); a row now flies one tick of each crew on a leg where the route matters.
"use strict";
import * as T from "./courierTask.mjs";
import * as SS from "./subStations.mjs";
import * as S from "../physics/mechanics/subModel6dof.mjs";

let fails = 0, finished = false;
process.on("exit", () => { if (!finished) { console.log("  FAIL  !! THE GATE ENDED BEFORE IT FINISHED"); process.exitCode = 1; } });
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const sec = (t) => console.log("\n" + t);
const guarded = (name, f) => { try { f(); } catch (e) { ok(`${name} ran to the end`, false, "THREW " + String((e && e.stack) || e).split("\n").slice(0, 2).join(" | ").slice(0, 300)); } };
const throws = (f) => { try { f(); return null; } catch (e) { return String(e.message || e); } };
const J = JSON.stringify;
const near = (a, b, e = 1e-12) => Math.abs(a - b) < e;
console.log("courierTask-selfcheck -- round 4: a courier with a battery, charging between legs\n");

sec("1. the battery, the sets and the constants");
guarded("section 1", () => {
    const cs = Array.from({ length: 500 }, (_, i) => T.chargeOf(810000 + i));
    ok("the battery is inside 0.15-0.45 and fills it", cs.every((c) => c >= 0.15 && c <= 0.45) && Math.min(...cs) < 0.165 && Math.max(...cs) > 0.435, `${Math.min(...cs).toFixed(3)}..${Math.max(...cs).toFixed(3)}`);
    ok("the same for a seed every time; a bad seed refused by name", T.chargeOf(177001) === T.chargeOf(177001) && T.chargeOf(177001) !== T.chargeOf(177002) && /courierTask\.chargeOf: a seed is a whole number/.test(throws(() => T.chargeOf(0.5)) || ""));
    ok("DEV 175001-175024 (24), HELD 177001-177096 (96)", T.DEV_SET.length === 24 && T.DEV_SET[0] === 175001 && T.DEV_SET[23] === 175024 && T.HELD_SET.length === 96 && T.HELD_SET[0] === 177001 && T.HELD_SET[95] === 177096);
    ok("the registered constants: 1,200 s; the start (20, 150) at 20 m; LEGS's prior 0.001/m before 50 m, margin 1.5, + 0.05, to need + 0.2 capped at 0.95, emergency 0.10; all frozen",
        T.SECONDS === 1200 && J(T.START) === '{"x":20,"y":150,"depth":20,"speed":2}' && J(T.LEGS) === '{"priorPerM":0.001,"priorUntilM":50,"margin":1.5,"plus":0.05,"over":0.2,"cap":0.95,"emergency":0.1}' && Object.isFrozen(T.LEGS) && Object.isFrozen(T.START) && T.ARM === "any+predict");
});

sec("2. a leg's need");
guarded("section 2", () => {
    ok("before 50 m of travel the prior: 0.001 x 200 m x 1.5 + 0.05 = 0.35 (whatever was spent)", near(T.legNeed(0.3, 49, 200), 0.35));
    ok("from 50 m on, what was spent per metre: 0.2 over 400 m = 0.0005; x 200 m x 1.5 + 0.05 = 0.2", near(T.legNeed(0.2, 400, 200), 0.2) && near(T.legNeed(0.05, 50, 100), 0.001 * 100 * 1.5 + 0.05));
    ok("a goal already reached (0 m) needs only the 0.05", near(T.legNeed(0.2, 400, 0), 0.05));
});

sec("3. the LEGS station, on a hand-driven navigator");
guarded("section 3", () => {
    const nav = { sn: { arrivals: 0, goal: { x: 200, y: 0 }, travel: 0 }, snapshot() { return { ...this.sn }; } }; let frac = 0.1;
    const read = () => ({ frac, depth: 20, refills: true, refillDepth: 0.7, flood: 0, damage: 0 }), st = S.createState({ depth: 20, speed: 2, model: S.createSubModel(S.EXPLORER) });
    const L = T.legsStation({ read, nav, pos: () => [0, 0] }), tg = { depth: 20, heading: 0.3, speed: 2 }, ask = () => L.propose({ state: st, target: tg });
    const p0 = ask();
    ok("THE FIRST TICK IS A DECISION: 0.10 under the 200 m leg's need (0.35), so it charges THERE, to 0.55, claiming the surface at the energy priority", p0.claim && p0.claim.surface === true && near(L.state.chargeTo, 0.55) && L.state.decisions === 1 && L.priority === SS.PRIORITY.energy && /to 55%/.test(p0.reason), J([p0.claim, L.state]));
    frac = 0.4; const p1 = ask(); frac = 0.56; const p2 = ask();
    ok("it keeps charging under the line (0.40) and lets go at it (0.56): no claim", p1.claim !== null && p2.claim === null && L.state.chargeTo === null);
    frac = 0.3; const p3 = ask();
    ok("MID-LEG (no new arrival) a charge under the leg's need but over 0.10 is NOT a reason to go up", p3.claim === null && L.state.decisions === 1, J(L.state));
    frac = 0.09; const p4 = ask();
    ok("under 0.10 mid-leg is an EMERGENCY: it charges to 0.10 + the need + 0.2", p4.claim !== null && L.state.emergencies === 1 && near(L.state.chargeTo, Math.min(0.95, 0.1 + T.legNeed(L.state.spent, 0, 200) + 0.2)), J(L.state));
    ok("it counts what was SPENT -- every fall of the reading -- and not what was charged: 0.10 -> 0.40 -> 0.56 (charging) -> 0.30 -> 0.09 is 0.26 + 0.21 = 0.47", near(L.state.spent, 0.47, 1e-9), String(L.state.spent));
    // a new arrival with plenty of charge: no charge; with too little: charge
    frac = 0.95; ask(); nav.sn = { arrivals: 1, goal: { x: 100, y: 0 }, travel: 500 }; frac = 0.8; const p5 = ask();
    ok("at a new arrival with enough for the next leg it goes on (0.80 against a need well under it)", p5.claim === null && L.state.decisions === 2, J(L.state));
    const L2 = T.legsStation({ read, nav: { snapshot: () => ({ arrivals: 3, goal: { x: 300, y: 400 }, travel: 1000 }) }, pos: () => [0, 0] }); frac = 0.2; const p6 = L2.propose({ state: st, target: tg });
    ok("a leg's need is LEARNT from what was spent: a boat that has spent nothing over 1,000 m needs only the 0.05 for a 500 m leg, and goes on at 0.20", p6.claim === null && L2.state.decisions === 1, J(L2.state));
    const L3 = T.legsStation({ read, nav: { snapshot: () => ({ arrivals: 3, goal: { x: 300, y: 400 }, travel: 10 }) }, pos: () => [0, 0] }); frac = 0.2; const p7 = L3.propose({ state: st, target: tg });
    ok("...while one with under 50 m of travel uses the prior: 0.001 x 500 m x 1.5 + 0.05 = 0.80, so at 0.20 it charges, to 0.95 (the cap)", p7.claim !== null && near(L3.state.chargeTo, 0.95), J(L3.state));
});

sec("3b. ROUTE (round 5): the planned route's length in place of the straight line");
guarded("section 3b", () => {
    const st = S.createState({ depth: 20, speed: 2, model: S.createSubModel(S.EXPLORER) }), tg = { depth: 20, heading: 0, speed: 2 };
    const reading = (frac) => () => ({ frac, depth: 20, refills: true, refillDepth: 0.7, flood: 0, damage: 0 });
    const seen = []; const nav = (route) => ({ snapshot: () => ({ arrivals: 0, goal: { x: 200, y: 0 }, travel: 0 }), routeLength: (x, y) => { seen.push([x, y]); return route; } });
    // straight 200 m -> need 0.001 x 200 x 1.5 + 0.05 = 0.35; a planned 300 m -> 0.50. At 0.40: LEGS goes on, ROUTE charges (to 0.70)
    const legs = T.legsStation({ read: reading(0.4), nav: nav(300), pos: () => [0, 0] }), route = T.legsStation({ read: reading(0.4), nav: nav(300), pos: () => [7, 9], route: true });
    const pl = legs.propose({ state: st, target: tg }), pr = route.propose({ state: st, target: tg });
    ok("at 0.40 with a 200 m straight leg whose PLANNED route is 300 m: LEGS goes on (need 0.35), ROUTE charges (need 0.50, to 0.70), asking the navigator at the boat's own position", pl.claim === null && pr.claim !== null && near(route.state.chargeTo, 0.7) && J(seen) === "[[7,9]]", J([route.state, seen]));
    const none = T.legsStation({ read: reading(0.4), nav: nav(null), pos: () => [0, 0], route: true }); const pn = none.propose({ state: st, target: tg });
    ok("with no plan (routeLength null) ROUTE falls back to the straight line: it goes on as LEGS does", pn.claim === null && none.state.chargeTo === null);
    const plain = T.legsStation({ read: reading(0.4), nav: { snapshot: () => ({ arrivals: 0, goal: { x: 200, y: 0 }, travel: 0 }) }, pos: () => [0, 0], route: true });
    ok("a navigator with no routeLength at all is the straight line too (no throw)", plain.propose({ state: st, target: tg }).claim === null);
    const c2 = { read: reading(0.4), nav: nav(300), pos: () => [0, 0] }, rc = T.crew("ROUTE", c2), lc = T.crew("LEGS", c2); rc(st, tg, [0, 0, 0]); lc(st, tg, [0, 0, 0]);
    ok("AS CREWS, on that leg: ROUTE's captain gives the legs station the con (it charges), LEGS's flies the mission", rc.log.con === "legs" && lc.log.con === "mission", J([rc.log.con, lc.log.con]));
    const ctx = { read: reading(0.2), nav: { snapshot: () => ({ arrivals: 0, goal: { x: 0, y: 0 }, travel: 0 }), routeLength: () => null }, pos: () => [0, 0] };
    ok("the ROUTE crew carries the legs station (route on) and the energy station gated shut, like LEGS; round 5's sets are 181001-181024 (DEV) and 183001-183096 (HELD)", J(Object.keys(T.crew("ROUTE", ctx).watch.con)) === '["mission","legs","energy"]' &&
        T.R5_DEV_SET.length === 24 && T.R5_DEV_SET[0] === 181001 && T.R5_HELD_SET.length === 96 && T.R5_HELD_SET[0] === 183001 && T.R5_HELD_SET[95] === 183096 && J(T.CREWS) === '["NAV","FIXED","LEGS","ROUTE"]');
});

sec("4. the crews and a run");
guarded("section 4", () => {
    const ctx = { read: () => ({ frac: 0.2, depth: 20, refills: true, refillDepth: 0.7, flood: 0, damage: 0 }), nav: { snapshot: () => ({ arrivals: 0, goal: { x: 0, y: 0 }, travel: 0 }) }, pos: () => [0, 0] };
    const n = T.crew("NAV", ctx), f = T.crew("FIXED", ctx), l = T.crew("LEGS", ctx);
    ok("NAV carries no station, FIXED the energy station, LEGS the legs station and the energy station gated shut; an unknown crew is refused, by name", J(Object.keys(n.watch.con)) === '["mission"]' && J(Object.keys(f.watch.con)) === '["mission","energy"]' && J(Object.keys(l.watch.con)) === '["mission","legs","energy"]' && /no crew named "ADMIRAL"/.test(throws(() => T.crew("ADMIRAL", ctx)) || ""));
    const st = S.createState({ depth: 20, speed: 2, model: S.createSubModel(S.EXPLORER) }); l(st, { depth: 20, heading: 0, speed: 2 }, [0, 0, 0]); f(st, { depth: 20, heading: 0, speed: 2 }, [0, 0, 0]);
    ok("at 0.20 of charge at 20 m (under the energy rule's 0.30) FIXED goes up; LEGS, whose first-tick need here is 0.05 (a goal 0 m away), holds the energy claim back and flies the mission", f.log.con === "energy" && l.log.con === "mission", J([f.log.con, l.log.con]));
    const a = T.run(175001, "FIXED", { seconds: 60 }), b = T.run(175001, "FIXED", { seconds: 60 });
    ok("a run's record has the registered fields and is the same every time", J(Object.keys(a)) === '["seed","crew","c0","goals","status","lost","emptyS","chargingS","hits","finalFrac"]' && J(a) === J(b) && a.c0 === T.chargeOf(175001));
});

sec("5. the verdict");
guarded("section 5", () => {
    ok("the sign test: P(X >= 5 | 5) = 1/32; none = 1", near(T.signTest(5, 0), 1 / 32) && T.signTest(0, 0) === 1);
    const r = (seed, goals) => ({ seed, goals });
    const L = [4, 4, 4, 4, 4, 3].map((g, i) => r(i, g)), F = [3, 3, 3, 3, 3, 3].map((g, i) => r(i, g)), v = T.verdict(L, F);
    ok("five runs more and one level (p 1/32): LEGS BEATS FIXED, with the means and the counts", v.verdict === "LEGS BEATS FIXED" && v.legsMore === 5 && v.fixedMore === 0 && near(v.legs, 23 / 6) && v.fixed === 3, J(v));
    const v4 = T.verdict([4, 4, 4, 4, 3, 3].map((g, i) => r(i, g)), F);
    ok("four of four (p 1/16) is NO DIFFERENCE SHOWN", v4.verdict === "NO DIFFERENCE SHOWN");
    ok("the other way round is FIXED BEATS LEGS", T.verdict(F, L).verdict === "FIXED BEATS LEGS");
    ok("runs on different seeds are refused, by name", /not flown on the same seeds/.test(throws(() => T.verdict(L, F.slice(1))) || ""));
});

finished = true;
console.log(fails ? `\ncourierTask-selfcheck: ${fails} FAILED` : "\ncourierTask-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
