// WebGLEngine/brain/breachCourierTask-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time). Run: node brain/breachCourierTask-selfcheck.mjs
//
// THE GATE OF brain/breachCourierTask.mjs AND OF subStations.triageCaptain's `more` and `energyAllow` (round 7 of the submarine stations, brain/SUB_STATIONS_WIP.md section 20).
//   1  the breach per seed and the sets; 2 the crews and what each carries; 3 COMBINED on hand-made ticks: the legs station before the breach, TRIAGE's latch after it, the energy claim shut
//   4  triageCaptain's two new options are inert at their defaults (whole dives compared); 5 a run's record; 6 the paired comparison and the verdict on hand-made results
// Flies no HELD seed.
// SABOTAGED -- 16 mutants, each alone in place and restored, EVERY ONE RED BY NAME (final pass): brain/breachCourierTask.mjs B01 a leak from 0.02 | B02 a breach from 0 s | B03 the leak at once | B04 HELD from 191002 |
//   B05 COMBINED without the legs station | B06 COMBINED's energy claim open | B07 COMBINED's legs without the route | B08 ROUTE+DC without damage control | B09 TRIAGE unfrozen | B10 the leak never reaching the physics |
//   B11 survival counted as goals | B12 the interference read against FIXED | B13 the seeds unchecked; brain/subStations.mjs S01 `more` asked last | S02 energyAllow ignored | S03 `more` dropped.
// TWO WENT 0 RED ON THE FIRST PASS AND GOT ROWS: B07 (no row put COMBINED on a leg where the route and the line disagree) and B10 (the gate's only run lasted 60 s, before any breach can start; a DEV run breached at 62 s now).
// v4930 -- COND (round 10, section 7): 9 mutants, every one red by name (final pass): C1 the same episode latching | C2 latching at the first breach | C3 never latching | C4 the test judged against a target 100 m deeper |
//   C5 a recovery before the weight goes counting | C6 COND_KNOBS without the latch | C7 COND without the legs station | C8 the verdict ignoring survival | C9 HELD from 199002. C5 WENT 0 RED FIRST (every fixture began at the
//   first breach); a calm tick before it is asked now.
"use strict";
import * as T from "./breachCourierTask.mjs";
import * as SS from "./subStations.mjs";
import * as CT from "./courierTask.mjs";
import * as AS from "./autopilotSub.mjs";
import * as NT from "./needsTask.mjs";
import { FROZEN_TRIAGE } from "./stationsTask.mjs";
import * as N from "../physics/mechanics/subNeeds.mjs";
import * as S from "../physics/mechanics/subModel6dof.mjs";

let fails = 0, finished = false;
process.on("exit", () => { if (!finished) { console.log("  FAIL  !! THE GATE ENDED BEFORE IT FINISHED"); process.exitCode = 1; } });
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const sec = (t) => console.log("\n" + t);
const guarded = (name, f) => { try { f(); } catch (e) { ok(`${name} ran to the end`, false, "THREW " + String((e && e.stack) || e).split("\n").slice(0, 2).join(" | ").slice(0, 300)); } };
const throws = (f) => { try { f(); return null; } catch (e) { return String(e.message || e); } };
const J = JSON.stringify;
console.log("breachCourierTask-selfcheck -- round 7: one captain over navigation, energy and damage control\n");
const MODEL = NT.model();

sec("1. the breach and the sets");
guarded("section 1", () => {
    const bs = Array.from({ length: 500 }, (_, i) => T.breachOf(820000 + i)), span = (k) => [Math.min(...bs.map((b) => b[k])), Math.max(...bs.map((b) => b[k]))];
    const [l0, l1] = span("leak"), [a0, a1] = span("at");
    ok("the leak is inside 0.03-0.08 and the start inside 60-600 s, and they fill the ranges", l0 >= 0.03 && l1 <= 0.08 && l0 < 0.0325 && l1 > 0.0775 && a0 >= 60 && a1 <= 600 && a0 < 87 && a1 > 573, J([l0, l1, a0, a1]));
    ok("the same for a seed every time, different between seeds; a bad seed refused by name", J(T.breachOf(191001)) === J(T.breachOf(191001)) && J(T.breachOf(191001)) !== J(T.breachOf(191002)) && /breachCourierTask\.breachOf: a seed is a whole number/.test(throws(() => T.breachOf(1.5)) || ""));
    ok("the leak is 0 before its start, half of it 2.5 s in, all of it from 5 s", T.leakAt({ leak: 0.06, at: 100 }, 99) === 0 && Math.abs(T.leakAt({ leak: 0.06, at: 100 }, 102.5) - 0.03) < 1e-12 && T.leakAt({ leak: 0.06, at: 100 }, 400) === 0.06);
    ok("DEV 189001-189024 (24), HELD 191001-191096 (96); the four crews in the registered order", T.DEV_SET.length === 24 && T.DEV_SET[0] === 189001 && T.HELD_SET.length === 96 && T.HELD_SET[0] === 191001 && T.HELD_SET[95] === 191096 && J(T.CREWS) === '["FIXED","ROUTE+DC","TRIAGE","COMBINED"]');
});

const ctxOf = (frac, sn, extra = {}) => ({ read: () => ({ cls: "battery", frac, depth: 30, refills: true, refillDepth: 0.7, flood: 0, damage: 0, ...extra }), nav: { snapshot: () => sn, routeLength: () => null }, pos: () => [0, 0] });

sec("2. the crews");
guarded("section 2", () => {
    const c = ctxOf(0.9, { arrivals: 0, goal: { x: 100, y: 0 }, travel: 0 }), keys = (name) => { const cap = T.crew(name, c); return [J(Object.keys(cap.watch.con)), J(Object.keys(cap.watch.overrides))]; };
    ok("FIXED: energy and damage control; ROUTE+DC: legs, the energy station (gated), damage control; TRIAGE: energy, breach, damage control; COMBINED: legs FIRST, then TRIAGE's three",
        J(keys("FIXED")) === J(['["mission","energy"]', '["damage"]']) && J(keys("ROUTE+DC")) === J(['["mission","legs","energy"]', '["damage"]']) &&
        J(keys("TRIAGE")) === J(['["mission","energy","breach"]', '["damage"]']) && J(keys("COMBINED")) === J(['["mission","legs","energy","breach"]', '["damage"]']), J(["FIXED", "ROUTE+DC", "TRIAGE", "COMBINED"].map(keys)));
    ok("an unknown crew is refused, by name", /no crew named "ADMIRAL"/.test(throws(() => T.crew("ADMIRAL", c)) || ""));
});

sec("3. COMBINED on hand-made ticks");
guarded("section 3", () => {
    const tg = { depth: 30, heading: 0, speed: 2 }, deep = () => { const s = S.createState({ depth: 30, speed: 2, model: MODEL }); return s; };
    // at 0.20 of charge, under the energy rule (0.30 at depth): FIXED goes up; COMBINED shuts the energy claim and the legs station decides (a 100 m leg needs 0.20 at the prior: 0.001 x 100 x 1.5 + 0.05 -- not under it, so it goes on)
    const fx = T.crew("FIXED", ctxOf(0.2, { arrivals: 0, goal: { x: 100, y: 0 }, travel: 0 })), cb = T.crew("COMBINED", ctxOf(0.2, { arrivals: 0, goal: { x: 100, y: 0 }, travel: 0 }));
    fx(deep(), tg, [0, 0, 0]); cb(deep(), tg, [0, 0, 0]);
    ok("BEFORE THE BREACH the legs station decides: at 0.20, FIXED's energy station goes up; COMBINED's is shut and the legs station (need 0.20) lets the mission fly", fx.log.con === "energy" && cb.log.con === "mission", J([fx.log.con, cb.log.con]));
    const cbLow = T.crew("COMBINED", ctxOf(0.1, { arrivals: 0, goal: { x: 300, y: 0 }, travel: 0 })); cbLow(deep(), tg, [0, 0, 0]);
    ok("...and when the next leg needs more (a 300 m leg needs 0.50 at 0.10) it is the LEGS station that goes up", cbLow.log.con === "legs", cbLow.log.con);
    // the breach: a boat 10 m under its target and sinking makes damage control act; from then on the latch claims the surface
    const routed = { ...ctxOf(0.3, { arrivals: 0, goal: { x: 100, y: 0 }, travel: 0 }), nav: { snapshot: () => ({ arrivals: 0, goal: { x: 100, y: 0 }, travel: 0 }), routeLength: () => 300 } }, cbR = T.crew("COMBINED", routed); cbR(deep(), tg, [0, 0, 0]);
    ok("COMBINED's legs station reads the PLANNED route: a 100 m leg (need 0.20) whose route is 300 m (need 0.50) sends it up at 0.30", cbR.log.con === "legs", cbR.log.con);
    const cb2 = T.crew("COMBINED", ctxOf(0.9, { arrivals: 0, goal: { x: 100, y: 0 }, travel: 0 })), sink = S.createState({ depth: 40, speed: 2, model: MODEL }); sink.vel[2] = -0.5;
    cb2(sink, tg, [0, 0, 0]); const calm = S.createState({ depth: 30, speed: 2, model: MODEL }); cb2(calm, tg, [0, 0, 0]);
    ok("AFTER THE BREACH TRIAGE's latch has the boat: on a calm tick with a full charge COMBINED claims the surface as 'breach', over the legs station", cb2.log.con === "breach" && cb2.log.flown.surface === true, J([cb2.log.con, cb2.log.flown]));
});

sec("4. triageCaptain's new options are inert at their defaults");
guarded("section 4", () => {
    const dive = (opts) => { let s = S.createState({ depth: 25, speed: 2, model: MODEL }), needs = N.initialNeeds("battery", { crushDepth: 60 }); needs.energy = N.CLASSES.battery.capacityJ * 0.28;
        const read = () => N.readings(MODEL, needs, s), cap = SS.triageCaptain({ pilot: AS.pilot(), model: MODEL, read, knobs: FROZEN_TRIAGE, ...opts }), out = [];
        for (let i = 0; i < Math.round(150 / S.DT); i++) { const c = cap(s, { depth: 25, heading: 0.3, speed: 2 }, [0, 0, 0]); out.push(J(c)); const r = N.stepNeeds(MODEL, s, needs, c, S.DT, [0, 0, 0], 0.06 * Math.min(1, Math.max(0, (i * S.DT - 5) / 5)), cap.aux); s = r.state; needs = r.needs; if (r.status !== "submerged") break; }
        return out; };
    const a = dive({}), b = dive({ more: [], energyAllow: null });
    ok("the frozen TRIAGE with `more: []` and `energyAllow: null` is v4929's, every command of a 150 s breached dive", J(a) === J(b) && a.length > 1000, `${a.length} ticks`);
    const c = dive({ energyAllow: () => false });
    ok("...and gating its energy claim shut changes the dive (the gate reaches the captain)", J(c) !== J(a));
});

sec("5. a run");
guarded("section 5", () => {
    const early = T.run(189008, "FIXED", { seconds: 160 }), dry = T.breachOf(189008);
    ok("THE LEAK REACHES THE BOAT: DEV 189008 is breached at 62 s by 7.4 %, more than the drop weight; within 160 s FIXED's damage control has dropped the weight", dry.at < 63 && dry.leak > 0.07 && early.released === true, J({ released: early.released, at: dry.at.toFixed(1) }));
    const r = T.run(189001, "COMBINED", { seconds: 60 }), r2 = T.run(189001, "COMBINED", { seconds: 60 });
    ok("a run's record has the registered fields and is the same every time; the battery is round 4's and the breach the seed's", J(Object.keys(r)) === '["seed","crew","c0","leak","at","survived","status","lostAt","goals","emptyS","surfacedAfterBreachS","released"]' && J(r) === J(r2) &&
        r.c0 === CT.chargeOf(189001) && r.leak === T.breachOf(189001).leak && r.at === T.breachOf(189001).at);
});

sec("6. the comparison and the verdict");
guarded("section 6", () => {
    const rec = (seed, survived, goals) => ({ seed, survived, goals });
    const mk = (rows) => rows.map(([s, g], i) => rec(i, !!s, g));
    const F = mk([[0, 1], [0, 1], [0, 1], [0, 1], [0, 1], [1, 1]]), C = mk([[1, 1], [1, 1], [1, 1], [1, 1], [1, 1], [1, 1]]), R = mk([[1, 3], [1, 3], [1, 3], [1, 3], [1, 3], [1, 1]]), Tr = mk([[1, 1], [1, 1], [1, 1], [1, 1], [1, 1], [1, 1]]);
    const v = T.verdict({ FIXED: F, "ROUTE+DC": R, TRIAGE: Tr, COMBINED: C });
    ok("five more survive (p 1/32): COMBINED BEATS FIXED ON SURVIVAL; level on goals: no difference; five fewer goals than ROUTE+DC (p 1/32): INTERFERES, losing ROUTE's goals", v.v1Survival === "COMBINED BEATS FIXED ON SURVIVAL" && v.v1Goals === "NO DIFFERENCE SHOWN ON GOALS" && v.v2 === "COMBINED INTERFERES: it loses ROUTE's goals", J(v));
    const v2 = T.verdict({ FIXED: F, "ROUTE+DC": C, TRIAGE: Tr, COMBINED: C });
    ok("level with both parents: COMBINED COMBINES", v2.v2 === "COMBINED COMBINES");
    const lost = mk([[0, 1], [0, 1], [0, 1], [0, 1], [0, 1], [1, 1]]), v3 = T.verdict({ FIXED: F, "ROUTE+DC": lost, TRIAGE: Tr, COMBINED: lost });
    ok("five fewer survivors than TRIAGE: INTERFERES, losing TRIAGE's survival", v3.v2 === "COMBINED INTERFERES: it loses TRIAGE's survival", v3.v2);
    ok("runs on different seeds are refused, by name", /not flown on the same seeds/.test(throws(() => T.compare(C, F.slice(1), "goals")) || ""));
});

sec("7. COND (round 10): the conditional latch");
guarded("section 7", () => {
    const tg = { depth: 30, heading: 0, speed: 2 }, at = (depth, vz, released) => { const st = S.createState({ depth, speed: 2, model: MODEL }); st.vel[2] = vz; st.tank = { ...(st.tank || {}), released }; return st; };
    const cond = () => T.crew("COND", ctxOf(0.9, { arrivals: 0, goal: { x: 100, y: 0 }, travel: 0 }));
    const a = cond(); a(at(40, -0.5, false), tg, [0, 0, 0]);                       // the first breach: damage control acts
    a(at(38, -0.3, true), tg, [0, 0, 0]); a(at(37, -0.2, true), tg, [0, 0, 0]);    // the SAME sinking, the weight now gone
    ok("THE SAME EPISODE DOES NOT LATCH: after the first breach and the drop, a boat still sinking from it keeps the mission (no 'breach' con)", a.log.con !== "breach", a.log.con);
    a(at(30, 0.1, true), tg, [0, 0, 0]);                                           // recovered: near the target, not sinking
    a(at(31, 0.0, true), tg, [0, 0, 0]);
    ok("...nor does a boat that has recovered (near its target, not sinking)", a.log.con !== "breach", a.log.con);
    a(at(40, -0.5, true), tg, [0, 0, 0]); a(at(30, 0.1, true), tg, [0, 0, 0]);     // a NEW sinking past the target, then a calm tick
    ok("A NEW SINKING AFTER RECOVERY LATCHES: from then on the captain claims the surface as 'breach', even on a calm tick", a.log.con === "breach" && a.log.flown.surface === true, J([a.log.con, a.log.flown]));
    const e = cond(); e(at(30, 0.0, false), tg, [0, 0, 0]); e(at(40, -0.5, false), tg, [0, 0, 0]); e(at(38, -0.3, true), tg, [0, 0, 0]); e(at(30, 0.1, true), tg, [0, 0, 0]);
    ok("a calm boat BEFORE the breach has not 'recovered' from anything: its first breach, after calm ticks, does not latch", e.log.con !== "breach", e.log.con);
    const c = T.crew("COMBINED", ctxOf(0.9, { arrivals: 0, goal: { x: 100, y: 0 }, travel: 0 })); c(at(40, -0.5, false), tg, [0, 0, 0]); c(at(30, 0.1, true), tg, [0, 0, 0]);
    ok("...where COMBINED latches at the first breach", c.log.con === "breach");
    ok("COND carries COMBINED's stations; COND_KNOBS is FROZEN_TRIAGE with the latch conditional; round 10's sets are 198001-198024 and 199001-199096",
        J(Object.keys(cond().watch.con)) === '["mission","legs","energy","breach"]' && T.COND_KNOBS.latchOnSecond === true && T.COND_KNOBS.earlyDropBelow === Infinity && Object.isFrozen(T.COND_KNOBS) && T.R10_DEV_SET[0] === 198001 && T.R10_HELD_SET.length === 96 && T.R10_HELD_SET[0] === 199001);
    const rec = (seed, survived, goals) => ({ seed, survived, goals }), mk = (rows) => rows.map(([sv, g], i) => rec(i, !!sv, g));
    const C = mk([[1, 3], [1, 3], [1, 3], [1, 3], [1, 3], [1, 1]]), K = mk([[1, 1], [1, 1], [1, 1], [1, 1], [1, 1], [1, 1]]), R = mk([[1, 3], [1, 3], [1, 3], [1, 3], [1, 3], [1, 1]]), Tr = K;
    const v = T.condVerdict({ COND: C, COMBINED: K, "ROUTE+DC": R, TRIAGE: Tr });
    ok("five runs with more goals (p 1/32) and survival level: COND BEATS COMBINED, keeping ROUTE's goals and TRIAGE's survival", v.verdict === "COND BEATS COMBINED" && v.keepsRouteGoals && v.keepsTriageSurvival, J(v));
    const C2 = mk([[0, 3], [0, 3], [0, 3], [0, 3], [0, 3], [1, 1]]), v2 = T.condVerdict({ COND: C2, COMBINED: K, "ROUTE+DC": R, TRIAGE: Tr });
    ok("...but with five fewer survivors it WINS GOALS AND LOSES SURVIVAL, and does not keep TRIAGE's", v2.verdict === "COND WINS GOALS BUT LOSES SURVIVAL" && !v2.keepsTriageSurvival, J(v2));
    ok("level goals: COND DOES NOT BEAT COMBINED", T.condVerdict({ COND: K, COMBINED: K, "ROUTE+DC": R, TRIAGE: Tr }).verdict === "COND DOES NOT BEAT COMBINED");
});

sec("8. the constants");
guarded("section 8", () => { ok("SURFACE_BAND is 3 m (the band that counts as on the surface after the breach), and signTest is courierTask's own (P(X >= 5 | 5) = 1/32)", T.SURFACE_BAND === 3 && T.signTest === CT.signTest && Math.abs(T.signTest(5, 0) - 1 / 32) < 1e-15); });

finished = true;
console.log(fails ? `\nbreachCourierTask-selfcheck: ${fails} FAILED` : "\nbreachCourierTask-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
