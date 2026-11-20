// WebGLEngine/brain/learnedCourier-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time). Run: node brain/learnedCourier-selfcheck.mjs
//
// THE GATE OF brain/learnedCourier.mjs (round 11 of the submarine stations, brain/SUB_STATIONS_WIP.md section 27) and of breachCourierTask.run's `make`.
//   1  the ten features and the constants as registered; 2 the two units on hand-made ticks; 3 ALL-ZERO WEIGHTS ARE THE HELM AND DAMAGE CONTROL, flown through round 7's own loop; 4 the ES, pinned on a stub; 5 the frozen file
// Flies no TRAIN, SELECTION or HELD seed of round 11 (its runs are round 7's DEV seeds).
// SABOTAGED -- 12 mutants of brain/learnedCourier.mjs and breachCourierTask.mjs, each alone in place and restored, EVERY ONE RED BY NAME (final pass): M01 the need by the straight line always | M02 the need not less the charge |
//   M03 a 10 s goal window | M04 a goal never noted | M05 charging counted as spent | M06 breached never latched | M07 DROP from the SURFACE weights | M08 the fitness without survival | M09 the seed 9010 |
//   M10 the choice by training fitness | M11 HELD from 205002 | M12 `make` ignored. M05 WENT 0 RED FIRST (no row had the battery rise); a fall then a charge is asked now.
// 2026-11-20 -- ROUND 15 (section 6): 9 mutants of learnedCourier.mjs, every one red by name (final pass): P01 the price at 2 a boat | P02 the time left from 600 s | P03 a lost boat free | P04 a kept boat +2 | P05 round 11's
//   fitness | P06 ES15 at 9009 | P07 24 generations | P08 HELD on round 11's | P09 no lostAt accepted. P05 WENT 0 RED FIRST (the row's 60 s run kept its boat, where the value IS the goals); a lost run (DEV 189001) is asked now.
//   AND A ROW OF MINE CLAIMED TOO MUCH: it said the stub ES's best climbs. A (mu, lambda) ES keeps no parents, and on this stub the best falls after generation 0; the claim is gone and the comment says why.
"use strict";
import fs from "node:fs";
import * as L from "./learnedCourier.mjs";
import * as BC from "./breachCourierTask.mjs";
import * as SS from "./subStations.mjs";
import * as AS from "./autopilotSub.mjs";
import * as NT from "./needsTask.mjs";
import * as S from "../physics/mechanics/subModel6dof.mjs";

let fails = 0, finished = false;
process.on("exit", () => { if (!finished) { console.log("  FAIL  !! THE GATE ENDED BEFORE IT FINISHED"); process.exitCode = 1; } });
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const sec = (t) => console.log("\n" + t);
const guarded = (name, f) => { try { f(); } catch (e) { ok(`${name} ran to the end`, false, "THREW " + String((e && e.stack) || e).split("\n").slice(0, 2).join(" | ").slice(0, 300)); } };
const throws = (f) => { try { f(); return null; } catch (e) { return String(e.message || e); } };
const J = JSON.stringify;
console.log("learnedCourier-selfcheck -- round 11: a learned captain on the breached courier\n");
const MODEL = NT.model(), FP = "-15.573321,-16.865171,-18.192908,-19.890771";   // the ES fingerprint, read off the stub at the registered seed
const ctxOf = ({ frac = 0.4, depth = 30, sn = { arrivals: 0, goal: { x: 100, y: 0 }, travel: 0 }, route = null } = {}) => ({ read: () => ({ cls: "battery", frac, depth, refills: true, refillDepth: 0.7, flood: 0, damage: 0 }), nav: { snapshot: () => sn, routeLength: () => route }, pos: () => [0, 0], model: MODEL });

sec("1. the features and the constants");
guarded("section 1", () => {
    const st = S.createState({ depth: 30, speed: 2, model: MODEL }); st.vel[2] = -0.2; st.tank = { ...(st.tank || {}), air: 3, airMax: 6, released: false };
    const c = L.learnedCourierCaptain(ctxOf({ frac: 0.4, depth: 30, route: 300 }), new Array(20).fill(0)); c(st, { depth: 20, heading: 0, speed: 2 });
    // need: prior 0.001 x 300 m (the route) x 1.5 + 0.05 = 0.50; less the charge 0.4 = 0.10
    ok("the ten features: charge 0.4, depth/60 0.5, vz -0.2, (depth - mission)/10 1, breached 0, air 3/6, dropped 0, the next leg's need by its PLANNED route less the charge (0.50 - 0.4), no goal just reached, a constant 1",
        J(c.features.map((v) => +v.toFixed(6))) === J([0.4, 0.5, -0.2, 1, 0, 0.5, 0, 0.1, 0, 1]), J(c.features));
    ok("the registered constants: 10 features, 20 weights; ES mu 4, lambda 8, sigma 0.5 halving every 7, 20 generations, seed 9009; TRAIN 201001-201016, SELECTION 201501-201516, HELD 205001-205096",
        L.NF === 10 && L.NW === 20 && J(L.ES) === '{"mu":4,"lambda":8,"sigma0":0.5,"halveEvery":7,"generations":20,"seed":9009}' && L.TRAIN_SET.length === 16 && L.TRAIN_SET[0] === 201001 && L.SELECTION_SET.length === 16 && L.SELECTION_SET[0] === 201501 &&
        L.HELD_SET.length === 96 && L.HELD_SET[0] === 205001 && L.HELD_SET[95] === 205096 && L.FEATURES.length === 10 && Object.isFrozen(L.ES));
    // a goal reached: the arrivals move, and for 5 s the feature reads 1
    let sn = { arrivals: 0, goal: { x: 100, y: 0 }, travel: 0 }; const ctx = { ...ctxOf(), nav: { snapshot: () => sn, routeLength: () => null } }, g = L.learnedCourierCaptain(ctx, new Array(20).fill(0)), mission = { depth: 30, heading: 0, speed: 2 }, s0 = S.createState({ depth: 30, speed: 2, model: MODEL });
    g(s0, mission); sn = { ...sn, arrivals: 1 }; g(s0, mission); const just = g.features[8];
    for (let i = 0; i < 160; i++) g(s0, mission); const after = g.features[8];
    ok("A GOAL JUST REACHED reads 1 when the arrivals move and for 5 s after, then 0 (161 ticks of 1/30 s later)", just === 1 && after === 0, J([just, after]));
    { let frac = 0.5; const sn2 = { arrivals: 0, goal: { x: 100, y: 0 }, travel: 100 }, cx = { ...ctxOf(), read: () => ({ cls: "battery", frac, depth: 30, refills: true, refillDepth: 0.7, flood: 0, damage: 0 }), nav: { snapshot: () => sn2, routeLength: () => null } };
      const k = L.learnedCourierCaptain(cx, new Array(20).fill(0)); k(s0, mission); frac = 0.4; k(s0, mission); frac = 0.6; k(s0, mission);
      // spent counts the FALL only (0.1, not the 0.2 charged back): need 0.1 / 100 m x 100 m x 1.5 + 0.05 = 0.20; less the charge 0.6 = -0.40
      ok("the need counts only what was SPENT: a fall of 0.1 then a charge of 0.2 prices a 100 m leg at 0.20 (the feature reads 0.20 - 0.6 = -0.40)", Math.abs(k.features[7] - (-0.4)) < 1e-9, String(k.features[7])); }
    ok("without a planned route the need falls back to the straight line (100 m: 0.20 - 0.4 = -0.20)", (() => { const h = L.learnedCourierCaptain(ctxOf({ route: null }), new Array(20).fill(0)); h(s0, mission); return Math.abs(h.features[7] - (-0.2)) < 1e-9; })());
});

guarded("section 1b", () => { ok("GOAL_WINDOW is the registered 5 s", L.GOAL_WINDOW === 5); });

sec("2. the two units on hand-made ticks");
guarded("section 2", () => {
    const st = S.createState({ depth: 30, speed: 2, model: MODEL }), mission = { depth: 30, heading: 0, speed: 2 }, th = (surf, drop) => { const t = new Array(20).fill(0); t[9] = surf; t[19] = drop; return t; };
    const a = L.learnedCourierCaptain(ctxOf(), th(1, -1)), ca = a(st, mission);
    ok("SURFACE that fires claims the surface at the energy priority ('learned'); DROP that does not, drops nothing", a.log.con === "learned" && a.log.flown.surface === true && ca.release === undefined && J(a.fired) === '{"surface":1,"drop":0}');
    const b = L.learnedCourierCaptain(ctxOf(), th(-1, 1)), cb = b(st, mission), gone = S.createState({ depth: 30, speed: 2, model: MODEL }); gone.tank = { ...(gone.tank || {}), released: true }; const cg = b(gone, mission);
    ok("DROP that fires releases the weight while it is aboard, and asks nothing once it has gone", cb.release === 1 && cg.release === undefined && b.fired.drop === 1);
    ok("a theta of the wrong length or with a NaN, or no context, is refused by name", /theta must be 20 finite numbers/.test(throws(() => L.learnedCourierCaptain(ctxOf(), [1])) || "") && /theta must be 20/.test(throws(() => L.learnedCourierCaptain(ctxOf(), new Array(20).fill(NaN))) || "") &&
        /a context \{ read, nav, pos \} is needed/.test(throws(() => L.learnedCourierCaptain({}, new Array(20).fill(0))) || ""));
    const latch = new Array(20).fill(0); latch[4] = 1; latch[9] = -0.5; const c = L.learnedCourierCaptain(ctxOf({ frac: 0.9 }), latch), sink = S.createState({ depth: 45, speed: 2, model: MODEL }); sink.vel[2] = -0.5;
    c(sink, mission); c(st, mission);
    ok("BREACHED latches: once damage control has acted, a SURFACE unit reading only 'breached' fires on a later calm tick", c.log.con === "learned" && c.features[4] === 1, J([c.log.con, c.features[4]]));
});

sec("3. all-zero weights are the helm and damage control, through round 7's own loop");
guarded("section 3", () => {
    // neither unit fires at zeros: the captain is the helm and damage control -- the same crew built by hand, flown through the same loop with `make`, on round 7's DEV seed 189008 (breached at 62 s)
    const z = L.runLearned(189008, new Array(20).fill(0), { seconds: 200 }), plain = BC.run(189008, "X", { seconds: 200, make: (ctx) => SS.captain({ helm: SS.helmOf(AS.pilot(), { model: ctx.model }), stations: [SS.damageStation()] }) });
    const strip = (r) => { const { crew, ...rest } = r; return rest; };
    ok("the whole run's record is the hand-built crew's (the goals, the status, the weight, the surface seconds), and it goes through round 7's loop", J(strip(z)) === J(strip(plain)) && z.crew === "LEARNED", J([strip(z), strip(plain)]).slice(0, 300));
    const up = new Array(20).fill(0); up[9] = 1; const u = L.runLearned(189008, up, { seconds: 200 });
    ok("...and a captain that is NOT all zeros flies its own run (surface always: a different record)", J(strip(u)) !== J(strip(z)));
    const f = L.fitness(new Array(20).fill(0), [189008], { seconds: 200 });
    ok("the fitness is goals + 2 x survived + 0.001 x the seconds lived (1,200 s for a run kept; the time of the loss for one lost)", Math.abs(f - (z.goals + (z.survived ? 2 + 0.001 * 1200 : 0.001 * (z.lostAt || 0)))) < 1e-9, String(f));
});

sec("4. the ES, pinned on a stub");
await (async () => {
    try {
        const target = Array.from({ length: 20 }, (_, i) => (i % 3) - 1), fit = async (th) => -th.reduce((a, w, i) => a + (w - target[i]) ** 2, 0);
        const a = await L.train({ seeds: [], es: { ...L.ES, generations: 14 }, fit }), b = await L.train({ seeds: [], es: { ...L.ES, generations: 14 }, fit });
        // NOT asserted: that the best climbs. A (mu, lambda) ES does not keep its parents, and on this 20-weight stub with lambda 8 the best FALLS after generation 0 and wanders (-11.7, -15.9, ... -17.2): a property of the
        //   registered method, said here rather than hidden by a stub picked to climb. The fingerprint row below pins the method exactly.
        ok("deterministic for its seed; mu parents, best first; sigma halves at generation 7", J(a.parents) === J(b.parents) && a.parents.length === 4 && a.parents.every((p, i) => i === 0 || p.fit <= a.parents[i - 1].fit) && a.history[6].sigma === 0.5 && a.history[7].sigma === 0.25);
        const fp = (await L.train({ seeds: [], es: { ...L.ES, generations: 3 }, fit })).parents.map((p) => p.fit.toFixed(6)).join(",");
        ok("THE ES AS REGISTERED, pinned: three generations on the stub from seed 9009", fp === FP, fp);
        const ch = await L.select([{ theta: target, fit: 0 }, { theta: new Array(20).fill(0), fit: 5 }], { seeds: [], fit });
        ok("the choice is the parent best on SELECTION, whatever its training fitness", J(ch.theta) === J(target));
    } catch (e) { ok("section 4 ran to the end", false, "THREW " + String(e && e.message)); }
})();

sec("5. the frozen file");
guarded("section 5", () => {
    const f = new URL("./learnedCourier.json", import.meta.url);
    if (!fs.existsSync(f)) { console.log("  NOT YET  brain/learnedCourier.json is written by the training (tools/ship/trainLearnedCourier.mjs --write) and committed before HELD is flown"); return; }
    const j = JSON.parse(fs.readFileSync(f, "utf8"));
    ok("the frozen captain is 20 finite weights, the registered ES and sets, its fitness and 20 generations of history", j.theta.length === 20 && j.theta.every(Number.isFinite) && J(j.es) === J(L.ES) && j.train === 16 && j.selection === 16 && j.history.length === 20 && Number.isFinite(j.selFit));
});

sec("6. ROUND 15 (section 31): the mission's price on a boat");
await (async () => {
    try {
        ok("THE PRICE AS REGISTERED: 2.42 goals per 1,200 s (COND on round 10's HELD runs), frozen", L.PRICE.goals === 2.42 && L.PRICE.seconds === 1200 && L.PRICE.rate === 2.42 / 1200 && Object.isFrozen(L.PRICE));
        const mv = L.missionValue;
        ok("the mission value: a kept boat is its goals; a boat lost at 600 s with 1 goal is 1 - 1.21; one lost at 1,200 s costs nothing more; one lost at 0 s costs the whole 2.42",
            mv({ goals: 3, survived: true, lostAt: null }) === 3 && Math.abs(mv({ goals: 1, survived: false, lostAt: 600 }) - (1 - 1.21)) < 1e-12 && mv({ goals: 2, survived: false, lostAt: 1200 }) === 2 && Math.abs(mv({ goals: 0, survived: false, lostAt: 0 }) + 2.42) < 1e-12);
        ok("a record that is not a run, or a lost run with no time, is refused by name", /^learnedCourier\.missionValue: a run record/.test(throws(() => mv({ goals: 1 })) || "") && /^learnedCourier\.missionValue: a lost run needs its lostAt/.test(throws(() => mv({ goals: 1, survived: false, lostAt: null })) || ""));
        const th = Array.from({ length: 20 }, (_, i) => ((i * 7) % 5 - 2) / 4), seed = BC.DEV_SET[0], r = L.runLearned(seed, th, { seconds: 60 });
        ok("round 15's fitness is the mission value of the learned captain's runs, summed (a DEV seed of round 7, 60 s)", L.fitnessPriced(th, [seed, seed], { seconds: 60 }) === 2 * mv(r), J({ goals: r.goals, survived: r.survived }));
        const z = new Array(20).fill(0), lost = L.runLearned(189001, z);
        ok("...and on a LOST run it is the price, not the goals: DEV 189001 with all-zero weights is lost at 781 s with 0 goals, worth 0 - 2.42 x 419 / 1,200", !lost.survived && lost.goals === 0 && Math.abs(L.fitnessPriced(z, [189001]) - mv(lost)) < 1e-12 && L.fitnessPriced(z, [189001]) < -0.8, J({ lostAt: lost.lostAt, value: mv(lost) }));
        ok("round 15's ES is round 11's with ONLY the seed changed, to 9015", J({ ...L.ES15, seed: 9009 }) === J(L.ES) && L.ES15.seed === 9015 && Object.isFrozen(L.ES15));
        const target = Array.from({ length: 20 }, (_, i) => (i % 3) - 1), fit = async (t) => -t.reduce((a, w, i) => a + (w - target[i]) ** 2, 0);
        const fp15 = (await L.train({ seeds: [], es: { ...L.ES15, generations: 3 }, fit })).parents.map((p) => p.fit.toFixed(6)).join(",");
        ok("...and it draws other children than round 11's (the stub's fingerprint at 9015 is not 9009's)", fp15 !== FP, fp15);
        ok("round 15's sets: TRAIN 210001-210016, SELECTION 210501-210516, HELD 211001-211096, disjoint from round 11's", L.R15_TRAIN_SET.length === 16 && L.R15_TRAIN_SET[0] === 210001 && L.R15_SELECTION_SET[15] === 210516 && L.R15_HELD_SET.length === 96 && L.R15_HELD_SET[0] === 211001 && !L.R15_HELD_SET.some((x) => L.HELD_SET.includes(x)));
        const f = new URL("./learnedCourierPriced.json", import.meta.url);
        if (!fs.existsSync(f)) { console.log("  NOT YET  brain/learnedCourierPriced.json is written by the training (tools/ship/trainLearnedCourier.mjs --round 15 --write) and committed before HELD is flown"); return; }
        const j = JSON.parse(fs.readFileSync(f, "utf8"));
        ok("the frozen PRICED captain is 20 finite weights, round 15's ES, price and sets, its fitness and 20 generations of history", j.round === 15 && j.theta.length === 20 && j.theta.every(Number.isFinite) && J(j.es) === J(L.ES15) && J(j.price) === J(L.PRICE) && j.train === 16 && j.selection === 16 && j.history.length === 20 && Number.isFinite(j.selFit));
    } catch (e) { ok("section 6 ran to the end", false, "THREW " + String(e && e.message)); }
})();

finished = true;
console.log(fails ? `\nlearnedCourier-selfcheck: ${fails} FAILED` : "\nlearnedCourier-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
