// WebGLEngine/brain/stationSeat-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node brain/stationSeat-selfcheck.mjs      (about 10 s)
//
// THE GATE OF brain/stationSeat.mjs: the station-only policy and the price of the station-and-price round, registered in brain/STATION_AND_PRICE_WIP.md before they were written. Nothing is trained here.
//   1  CONSTANTS   the masked outputs (0, 4, 5, 6), the station outputs (1, 2, 3), the price (free 0.92, lambda 0.5), all frozen.
//   2  THE MASK    maskedStepper zeroes exactly outputs 0, 4, 5, 6 of any stepper and nothing else, returns a new array, leaves the stepper's own output alone.
//   3  THE POLICY  the plain net's shape (84 hidden units, 2,443 weights, hand weights with the readout at ZERO), kind 'station', the masked list on it; a width of three gives 94 weights; mutate works; the withheld option reaches the seat.
//   4  THE DECODE  with EVERY readout pushed to +1 the seat's surfacing, cap, pump and repair are still the tuned rule's on a grid of 64 observations (the rule's seat built by brain/tunedRule.mjs at the survey seat's constants), and its station is the rule's when the three residuals are equal; a residual on o1, o2 or o3 alone moves the choice to the station it names (and a plain-net seat given the same readouts surfaces early: the comparison can tell them apart); a fourth station gets no residual.
//   5  THE START   the untrained station policy IS rule-low06 dive for dive (scores and fingerprints) on eight dives of the four kinds, with and without the noisy gauge.
//   6  THE PRICE   pricedScore at its edges (nothing up to 0.92, 0.5 x (s - 0.92) / 0.08 above, 0.5 from 1 up, 0.5 for a strain that is not a number, a crushed boat's 0 less the full 0.5); pricedPolicy on real dives (the priced mean worked by hand from the dives' own strains, rawScore the unpriced mean, the crushed and stranded counts and runs kept, the policy's other fields kept, an empty set 0); strainCounts.
// NOT CHECKED, said plainly: that a trained station policy does anything useful (that is the experiment).
//
// SABOTAGE LOG (2026-11-07), 50 mutants of brain/stationSeat.mjs -- 40 mechanical (every comparison, sign, arithmetic operator, constant +-1 and boolean of every code line, one at a time) and 10 by hand (the masked stepper writing into the inner stepper's array, withheld ignored, the seat not masked, the kind unchanged, the price on the wrong side or ignoring the free margin, the priced policy forgetting the raw score,
// the priced mean over the wrong count, the priced policy keeping the unpriced kind, strain counts non-strict), each applied to an isolated tree and this gate run; the file restored (sha256 identical before and after). 47 red; 3 went 0 red at first: the clamp's two ties (v < lo and v > hi give the bound either way: EQUIVALENT) and the masked stepper writing in place -- the first row's stub handed back a FRESH array every time,
// so an in-place write could not be seen; the stub now hands back ONE array and the row checks it afterwards (red). 2 equivalents remain, argued.
"use strict";
import fs from "node:fs";
import * as S from "../physics/mechanics/subModel6dof.mjs";
import * as T from "./needsTask.mjs";
import * as U from "./tunedRule.mjs";
import * as SV from "./surveySeat.mjs";
import * as CS from "./circuitSeat.mjs";
import * as ST from "./stationSeat.mjs";

let fails = 0, finished = false;
const died = (e) => { console.log("  FAIL  !! THE GATE THREW before it finished, which is a failure of whatever it was asking: " + String((e && e.stack) || e).split("\n").slice(0, 3).join(" | ").slice(0, 400)); process.exit(1); };
process.on("uncaughtException", died); process.on("unhandledRejection", died);
process.on("exit", () => { if (!finished) { console.log("  FAIL  !! THE GATE ENDED BEFORE IT FINISHED"); process.exitCode = 1; } });
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const sec = (t) => console.log("\n" + t);
const near = (a, b, tol) => Math.abs(a - b) <= tol, J = JSON.stringify;
console.log("stationSeat-selfcheck -- the station-only policy and the price\n");

const M = T.model();
const stateAt = (x, y, depth) => { const s = S.createState({ depth, speed: 2, heading: 0, model: M }); s.pos[0] = x; s.pos[1] = y; return { ...s, tank: S.initialTank(M) }; };
const q = (x, y, depth, visited = false) => ({ x, y, depth, visited });
const obsOf = (o = {}) => ({ t: 0, stations: [q(50, 0, 20)], ...o, r: { frac: 0.8, depth: 20, flood: 0, damage: 0, collapseDepth: 60, ...(o.r || {}) } });
const ctxOf = () => ({ model: M, read: () => { throw new Error("the seat must not read the true state"); } });

sec("1. THE CONSTANTS");
ok("!! the masked outputs are o0 (surfacing), o4 (cap), o5 (pump), o6 (repair); the station outputs o1 .. o3", J(ST.MASKED) === J([0, 4, 5, 6]) && J(ST.STATION_OUTPUTS) === J([1, 2, 3]) && Object.isFrozen(ST.MASKED) && Object.isFrozen(ST.STATION_OUTPUTS) && ST.MASKED.length + ST.STATION_OUTPUTS.length === CS.OUTPUTS);
ok("!! the price is free up to 0.92 and 0.5 at the crush, frozen", ST.PRICE.free === 0.92 && ST.PRICE.lambda === 0.5 && Object.isFrozen(ST.PRICE));

sec("2. THE MASK");
{
    const shared = Float64Array.from([0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7]), inner = { step: () => shared }, mk = ST.maskedStepper(inner), y = mk.step(new Float64Array(21)), raw = shared;   // the inner stepper hands back ONE array every time
    ok("!! the masked stepper reads 0 on o0, o4, o5, o6 and the net's own values on o1, o2, o3: [0, 0.2, 0.3, 0.4, 0, 0, 0]", J([...y]) === J([0, 0.2, 0.3, 0.4, 0, 0, 0]) && y instanceof Float64Array && y.length === 7);
    ok("!! it returns a NEW array each step and leaves the stepper's own output alone (the inner array still reads 0.1 .. 0.7)", mk.step() !== mk.step() && J([...raw]) === J([0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7]));
}

sec("3. THE POLICY");
{
    const pol = ST.createStationPolicy(), plain = CS.createPlainPolicy(84, "p"), w0 = pol.handWeights();
    ok("!! the shape is the plain net's: kind 'station', 84 hidden units, 2,443 weights, no recurrence, the hand weights equal the plain net's and the readout (W2 and b2) is ZERO; the masked list is on it; the default name is 'station'", pol.kind === "station" && pol.hidden === 84 && pol.WEIGHT_COUNT === 2443 && pol.persist === false && J([...w0]) === J([...plain.handWeights()]) && [...w0.slice(pol.offsets.W2)].every((v) => v === 0) && J(pol.masked) === J([0, 4, 5, 6]) && pol.name === "station" && ST.createStationPolicy(84, "x").name === "x");
    const small = ST.createStationPolicy(3, "s");
    ok("!! a width of three gives 94 weights and its own offsets; mutate (inherited) changes 1 to 4 numbers and leaves its argument alone", small.WEIGHT_COUNT === 94 && small.hidden === 3 && (() => { const a = small.handWeights(), r = (() => { let s = 5; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; })(); const m = small.mutate(a, 0.3, r), d = [...m].filter((v, i) => v !== a[i]).length; return d >= 1 && d <= 4 && J([...a]) === J([...small.handWeights()]); })());
    const w = new Float32Array(94); w[0] = 1; w[66] = 1;   // hidden 0 reads the charge, o0 reads hidden 0 -- o0 is MASKED here
    const sn = small.seatFor(w)(ctxOf()), sw = ST.createStationPolicy(3, "s", { withheld: true }).seatFor(w)(ctxOf()); sn(stateAt(0, 0, 20), obsOf({ r: { frac: 0.5 } })); sw(stateAt(0, 0, 20), obsOf({ r: { frac: 0.5 } }));
    const w1 = new Float32Array(94); w1[0] = 1; w1[66 + 3] = 1;   // o1 reads hidden 0
    const s1 = small.seatFor(w1)(ctxOf()), s1w = ST.createStationPolicy(3, "s", { withheld: true }).seatFor(w1)(ctxOf()); s1(stateAt(0, 0, 20), obsOf({ r: { frac: 0.5 } })); s1w(stateAt(0, 0, 20), obsOf({ r: { frac: 0.5 } }));
    ok("!! the seat is the masked one: o0 wired to the charge reads 0 (masked); o1 wired to the charge reads 0.5; the WITHHELD option blinds the charge feature (o1 reads 0)", sn.outputs[0] === 0 && near(s1.outputs[1], 0.5, 1e-6) && s1w.outputs[1] === 0 && s1.steps === 1);
}

sec("4. THE DECODE");
{
    const pol = ST.createStationPolicy(3, "s"), plainPol = CS.createPlainPolicy(3, "p"), rule = U.tunedSeat(SV.SURVEY_CONSTANTS, U.WIDE_BOUNDS)(ctxOf());
    const ones = () => { const w = new Float32Array(94); for (let o = 0; o < 7; o++) w[pol.offsets.B2 + o] = 1; return w; };
    const A = q(50, 0, 20), B = q(100, 0, 20), C = q(150, 0, 20);
    let bad = [], n = 0;
    for (const depth of [1, 10, 25, 45]) for (const frac of [0.12, 0.3, 0.45, 0.8]) for (const flood of [0, 0.02]) for (const damage of [0, 0.3]) {
        const st = stateAt(0, 0, depth), obs = obsOf({ t: 100, r: { frac, depth, flood, damage }, stations: [A, B, C] }), seat = pol.seatFor(ones())(ctxOf()), ruleSeat = U.tunedSeat(SV.SURVEY_CONSTANTS, U.WIDE_BOUNDS)(ctxOf());
        const a = seat(st, obs), b = ruleSeat(st, obs); n++;
        if (a.surface !== b.surface || a.cap !== b.cap || a.pump !== b.pump || a.repair !== b.repair || a.station !== b.station) bad.push(`${depth}/${frac}/${flood}/${damage}`);
    }
    ok(`!! with EVERY readout pushed to +1 the station-only seat decides surfacing, cap, pump, repair AND (the three residuals being equal) the station exactly as the tuned rule does, on all ${n} observations of the grid`, n === 64 && bad.length === 0, bad.slice(0, 4).join(", "));
    const probe = { st: stateAt(0, 0, 20), obs: obsOf({ r: { frac: 0.45, depth: 20 }, stations: [B, A, C] }) };   // the rule picks A (index 1, the nearest); a residual on o1 (station 0 = B) of +1 makes B win (-0.5 + 1 > -0.25)
    const wOf = (o, v) => { const w = new Float32Array(94); w[pol.offsets.B2 + o] = v; return w; };
    const pick = (p, o, v) => p.seatFor(wOf(o, v))(ctxOf())(probe.st, probe.obs);
    ok("!! a residual on o1 alone moves the choice to station 0 (B), on o2 alone to station 1 (stays A), on o3 alone to station 2 (C: -0.75 + 1 = 0.25 beats -0.25); no residual leaves the rule's choice A", pick(pol, 1, 1).station === B && pick(pol, 2, 1).station === A && pick(pol, 3, 1).station === C && pick(pol, 0, 0).station === A);
    ok("!! the MASK is what keeps surfacing, cap, pump and repair the rule's: a readout of +1 on o0 makes the plain net surface early at 20 m with a charge of 0.35 (the rule stays down) and on o4 raises its cap, while the station-only seat does neither; o5 and o6 likewise", (() => { const lo = { st: probe.st, obs: obsOf({ r: { frac: 0.35, depth: 20 }, stations: [B, A, C] }) }; return rule(lo.st, lo.obs).surface === false && plainPol.seatFor(wOf(0, 1))(ctxOf())(lo.st, lo.obs).surface === true && pol.seatFor(wOf(0, 1))(ctxOf())(lo.st, lo.obs).surface === false; })() && pick(plainPol, 4, 1).cap > pick(pol, 4, 1).cap && near(pick(pol, 4, 1).cap, rule(probe.st, probe.obs).cap, 1e-12) && pick(plainPol, 5, 1).pump === true && pick(pol, 5, 1).pump === false && (() => { const sf = stateAt(0, 0, 1), ob = obsOf({ r: { frac: 0.8, depth: 1, damage: 0 }, stations: [A] }); return plainPol.seatFor(wOf(6, 1))(ctxOf())(sf, ob).repair === true && pol.seatFor(wOf(6, 1))(ctxOf())(sf, ob).repair === false; })());
    const D4 = q(60, 0, 20), far = [q(300, 0, 20), q(400, 0, 20), q(500, 0, 20), D4];
    const w4 = new Float32Array(94); for (let o = 1; o <= 3; o++) w4[pol.offsets.B2 + o] = 1;
    ok("!! a FOURTH station gets no residual: with +1 on o1 .. o3 the three far stations (300, 400, 500 m) gain a point and the fourth (60 m) does not, yet the 60 m station is still the best (-0.3 against -0.5)", pol.seatFor(w4)(ctxOf())(stateAt(0, 0, 20), obsOf({ stations: far })).station === D4);
}

sec("5. THE START");
{
    const pol = ST.createStationPolicy(), pilot = pol.pilotFor(pol.handWeights()), rule = T.flyDecision(U.tunedSeat(SV.SURVEY_CONSTANTS, U.WIDE_BOUNDS)), bad = []; let n = 0;
    for (const kind of ["plain", "deep", "far", "both"]) for (const seed of [501, 502]) for (const gauge of [null, T.GAUGE]) { if (gauge === null && seed === 502) continue; const c = T.scenario(seed, kind), a = T.fly(pilot, c, { gauge }), b = T.fly(rule, c, { gauge }); n++; if (a.fingerprint !== b.fingerprint || a.score !== b.score) bad.push(`${kind}${seed}${gauge ? "+gauge" : ""}`); }
    ok(`!! the untrained station policy IS rule-low06: scores and fingerprints equal on ${n} dives of the four kinds, with and without the noisy gauge`, n === 12 && bad.length === 0, bad.join(", "));
}

sec("6. THE PRICE");
{
    const p = (maxStrain, score = 0.8) => ST.pricedScore({ score, maxStrain });
    ok("!! nothing is charged up to a strain of 0.92 (0, 0.5, 0.92 itself); above it the charge is 0.5 x (s - 0.92) / 0.08: 0.96 pays 0.25, 0.94 pays 0.125", p(0) === 0.8 && p(0.5) === 0.8 && p(0.92) === 0.8 && near(p(0.96), 0.8 - 0.25, 1e-12) && near(p(0.94), 0.8 - 0.125, 1e-12));
    ok("!! the charge is 0.5 from a strain of 1 up and no more (1.0, 1.2, 5); a crushed boat (score 0, strain 1) is priced at -0.5; a score is subtracted from, not replaced", near(p(1), 0.3, 1e-12) && near(p(1.2), 0.3, 1e-12) && near(p(5), 0.3, 1e-12) && near(ST.pricedScore({ score: 0, maxStrain: 1.05 }), -0.5, 1e-12) && near(p(0.96, 0.4), 0.15, 1e-12));
    ok("!! a strain that is not a number (NaN, undefined, null as a missing field, Infinity) pays the whole 0.5", [NaN, undefined, Infinity, -Infinity].every((v) => near(p(v), 0.3, 1e-12)) && near(ST.pricedScore({ score: 0.8 }), 0.3, 1e-12));
    // real dives with the plain champion of the committed training file: its strains reach above 0.92, so the price bites
    const recs = fs.readFileSync(new URL("./decisionCircuitTraining.jsonl", import.meta.url), "utf8").trim().split("\n").map(JSON.parse), champ = recs.find((r) => r.spec === "plain:2"), base = ST.createStationPolicy(84, "x"), full = CS.createPlainPolicy(84, "full");
    const priced = ST.pricedPolicy(full), pilot = full.pilotFor(Float32Array.from(champ.weights)), set = T.setOf(["far", "both"], 21, 24), e = T.evaluate(pilot, set, { gauge: T.GAUGE }), pe = priced.evaluate(pilot, set, { gauge: T.GAUGE });
    const want = e.runs.reduce((s, r) => s + r.score - 0.5 * Math.min(1, Math.max(0, (r.maxStrain - 0.92) / 0.08)), 0) / e.runs.length;
    ok("!! pricedPolicy on eight real dives: the priced mean is the dives' scores less the charge on their own strains, worked here by hand; rawScore is the unpriced mean; the runs, the crushed and the stranded counts are the evaluation's own", near(pe.score, want, 1e-12) && pe.rawScore === e.score && J(pe.runs) === J(e.runs) && pe.crashed === e.crashed && pe.stranded === e.stranded && pe.score < pe.rawScore, `priced ${pe.score.toFixed(4)} raw ${pe.rawScore.toFixed(4)} (strains ${e.runs.map((r) => r.maxStrain.toFixed(3)).join(" ")})`);
    ok("!! the priced policy keeps everything else of the policy (weight count, hand weights, mutate, seatFor, name) and says so: kind 'plain-priced' and the price on it; the seam is `evaluate`; a priced STATION policy is 'station-priced'", priced.WEIGHT_COUNT === full.WEIGHT_COUNT && J([...priced.handWeights()]) === J([...full.handWeights()]) && priced.mutate === full.mutate && priced.seatFor === full.seatFor && priced.name === "full" && priced.kind === "plain-priced" && priced.priced === ST.PRICE && typeof priced.evaluate === "function" && ST.pricedPolicy(base).kind === "station-priced");
    ok("!! an empty set is 0, not NaN", ST.pricedPolicy(full).evaluate(pilot, [], { gauge: T.GAUGE }).score === 0);
    ok("!! strainCounts counts the dives ABOVE each threshold (strict): the default thresholds are 0.92 and 0.95; a dive exactly at a threshold is not above it", J(ST.strainCounts([{ maxStrain: 0.92 }, { maxStrain: 0.93 }, { maxStrain: 0.95 }, { maxStrain: 0.96 }, { maxStrain: 0.5 }])) === J({ 0.92: 3, 0.95: 1 }) && J(ST.strainCounts([{ maxStrain: 0.6 }, { maxStrain: 0.7 }], [0.65])) === J({ 0.65: 1 }) && J(ST.strainCounts([])) === J({ 0.92: 0, 0.95: 0 }));
}

console.log(fails ? `\n${fails} FAIL` : "\nall checks pass");
finished = true;
process.exit(fails ? 1 : 0);
