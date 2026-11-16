// WebGLEngine/tools/ship/gaugeFaults-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/gaugeFaults-selfcheck.mjs      (a few seconds: hand fixtures and short dives on the gate's own two seeds)
//
// THE GATE OF tools/ship/gaugeFaults.mjs AND OF needsTask.gaugeOf's `fault` (Round 34 of brain/NEEDS_AND_LIMITS.md, registered before either existed).
//   1 REGISTRATION  the seeds (43001-43150, far and both, 300 dives), the noise, the margin, the four faults, the four arms and the 32 jobs, as section 2-4 fixed them.
//   2 GAUGE         no fault: the pre-Round-34 formula bit for bit; bias, drift and the stuck half-minute each do what they say on a noiseless gauge; the noise stream stays REF's.
//   3 VERDICTS      the margin, KEEPS / HURTS / LOSES, the hull test, the filter and the lead per fault, every bottom line in its cases.
//   4 CHECKS        each of the five checks fails on a fixture that breaks it, and a failed check says NOT WEIGHED.
//   5 FLIGHT        real short dives on 43901-43902: the arms are the pilots they name, the conditions reach the pilot; refusals.
//   6 SOURCE        the seeds in one place; no clock, random or file in the library.
//   7 RESULT        the committed run's checks, bottom lines, hull counts and the figures the RESULT note states, re-derived.
// NOT CHECKED, said plainly: what the faults do on the registered dives (that is the experiment).
// SABOTAGE LOG (27 mutants of tools/ship/gaugeFaults.mjs and needsTask.gaugeOf's fault branch, each applied alone and restored byte-identical, sha-256 checked):
//   the faults (BIAS 0.11, DRIFT over 700 s, DROP from 31 s, the stuck test strict, no noise draw while stuck, the bias added after the clip, the drift per tick), the arms
//   (R8-RAW at alpha 0.5, its bound top 0.9, L06 on the Round 8 constants), the verdicts (margin 0.01, KEEPS at 1 se, the filter difference reversed, the liability line
//   inverted, the hull test at 1 sd, the seat's hull line from R8), the checks (ALIGNED always true, the bite on BIAS only, the report ignoring a failed check), the
//   registration (kinds far and deep, seeds ending 43149, REF's gauge carrying fault null) and the no-fault branch removed: 23 red by name at once (1 to 3 rows each).
//   *** 4 WENT 0 RED AT FIRST ***: the first reading allowed to stick (equivalent under the registered faults, where no window starts at 0 s: a row with a fault stuck
//   from 0 s added), the seat in the `events` profile (90 s dives do not tell the profiles apart: a source row added), the seat's lead taken over L06 and the hull taken
//   against R8's REF (the fixtures had L06 equal to R8 and every REF hull at 0: both fixtures given a difference). Then 1 red each.
// SECTION 7 (the result rows, sabotaged in the committed run files and the note, each restored byte-identical): Z1 one SEAT BIAS crush removed, Z2 an R8 BIAS score +0.05,
//   Z3 a SEAT DROP score -0.05, Z4 R8-RAW's REF strandings 24, Z5 the RESULT without the lower-trip-point reading, Z6 it calling the BIAS cost held -> 1 red each;
//   Z7 R8's DRIFT dives given REF's fingerprints -> 1 red (the checks row) -- *** my first Z7 went 0 red because it was malformed *** (it made the fingerprints differ
//   MORE, which the bite check cannot object to); redone as written here.
"use strict";
import fs from "node:fs";
let fails = 0, finished = false;
const died = (e) => { console.log("  FAIL  !! THE GATE THREW before it finished: " + String((e && e.stack) || e).split("\n").slice(0, 3).join(" | ").slice(0, 400)); process.exitCode = 1; };
process.on("uncaughtException", died); process.on("unhandledRejection", died);
process.on("exit", () => { if (!finished) { console.log("  FAIL  !! THE GATE ENDED BEFORE IT FINISHED"); process.exitCode = 1; } });
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const sec = (t) => console.log("\n" + t);
const J = JSON.stringify, near = (a, b, t = 1e-12) => Math.abs(a - b) < t;
const throws = (f, re) => { try { f(); return false; } catch (e) { return re.test(String(e.message)); } };
import * as T from "../../brain/needsTask.mjs";
import * as U from "../../brain/tunedRule.mjs";
import * as SS from "../../brain/surveySeat.mjs";
import * as X from "./gaugeFaults.mjs";
const t0 = Date.now();
console.log("gaugeFaults-selfcheck -- Round 34, gauge faults\n");

sec("1. REGISTRATION");
ok("!! the seeds 43001-43150, kinds far and both, 300 dives an arm and condition; the gate's seeds 43901-43902 outside them", J(X.SEEDS) === J([43001, 43150]) && J(X.KINDS) === J(["far", "both"]) && X.DIVES === 300 && X.DIVES === (X.SEEDS[1] - X.SEEDS[0] + 1) * X.KINDS.length && J(X.GATE_SEEDS) === J([43901, 43902]) && X.GATE_SEEDS[0] > X.SEEDS[1]);
ok("!! the noise sd 0.10 at the series' 1 Hz; the margin max(0.02, 2 se)", X.SD === 0.1 && T.GAUGE.hz === 1 && X.MARGIN === 0.02 && X.SE_FACTOR === 2);
ok("!! the faults: REF none, BIAS +0.10, DRIFT 0.15 over 600 s, DROP the second half of every minute", J(X.COND_NAMES) === J(["REF", "BIAS", "DRIFT", "DROP"]) && X.FAULTS.REF === null && J(X.FAULTS.BIAS) === J({ bias: 0.1 }) &&
    J(X.FAULTS.DRIFT) === J({ driftPerS: 0.15 / 600 }) && near(X.FAULTS.DRIFT.driftPerS * 600, 0.15) && J(X.FAULTS.DROP) === J({ dropEveryS: 60, dropFromS: 30 }) && J(X.FAULT_NAMES) === J(["BIAS", "DRIFT", "DROP"]));
ok("!! the arms R8, R8-RAW, L06, SEAT and the 32 jobs (arm x condition x kind)", J(X.ARMS) === J(["R8", "R8-RAW", "L06", "SEAT"]) && X.JOBS.length === 32 && new Set(X.JOBS.map((j) => j.join())).size === 32);
ok("!! R8-RAW is R8 with alpha 1 and nothing else; its bounds widen alpha's top to 1 and nothing else; normalise keeps alpha 1 there (and would clamp it to 0.02 under WIDE_BOUNDS)",
    J({ ...X.RAW_CONSTANTS, alpha: SS.SURVEY_R8.alpha }) === J(SS.SURVEY_R8) && X.RAW_CONSTANTS.alpha === 1 && J({ ...X.RAW_BOUNDS, alpha: U.WIDE_BOUNDS.alpha }) === J(U.WIDE_BOUNDS) &&
    J(X.RAW_BOUNDS.alpha) === J([U.WIDE_BOUNDS.alpha[0], 1]) && U.normalise(X.RAW_CONSTANTS, X.RAW_BOUNDS).alpha === 1 && U.normalise(X.RAW_CONSTANTS, U.WIDE_BOUNDS).alpha === 0.02);
ok("!! the conditions' gauges: REF the plain noise (no fault key), each fault its own object on the same noise", J(X.gaugeOfCond("REF")) === J({ sd: 0.1, hz: 1 }) && X.FAULT_NAMES.every((c) => X.gaugeOfCond(c).fault === X.FAULTS[c] && X.gaugeOfCond(c).sd === 0.1) && throws(() => X.gaugeOfCond("NOISE"), /unknown condition/));

sec("2. GAUGE");
{
    const scs = [T.scenario(43901, "far"), T.scenario(43902, "both"), T.scenario(7, "deep")];
    let same = true;
    for (const sc of scs) for (const sd of [0.1, 0.3]) { const a = T.gaugeOf(sc, { sd, hz: 1 }), b = X.oldGaugeOf(sc, { sd, hz: 1 }); for (let i = 0; i < 6000; i++) { const f = 0.9 - i / 8000; if (!Object.is(a(i, f), b(i, f))) same = false; } }
    ok("!! NO FAULT: gaugeOf returns the pre-Round-34 formula bit for bit (three scenarios, sd 0.1 and 0.3, 6000 ticks of a falling charge), and fault null is the same", same &&
        (() => { const a = T.gaugeOf(scs[0], { sd: 0.1, hz: 1, fault: null }), b = X.oldGaugeOf(scs[0], { sd: 0.1, hz: 1 }); for (let i = 0; i < 3000; i++) if (!Object.is(a(i, 0.5), b(i, 0.5))) return false; return true; })());
    const sc = scs[0], at = (fault, frac) => { const g = T.gaugeOf(sc, { sd: 0, hz: 1, fault }), out = []; for (let i = 0; i < 18001; i++) out.push(g(i, typeof frac === "function" ? frac(i) : frac)); return out; };
    const b = at(X.FAULTS.BIAS, 0.5), b9 = at(X.FAULTS.BIAS, 0.95);
    ok("!! BIAS on a noiseless gauge: 0.5 reads 0.6 at every tick, 0.95 clips to 1", b.every((v) => near(v, 0.6)) && b9.every((v) => v === 1));
    const d = at(X.FAULTS.DRIFT, 0.5);
    ok("!! DRIFT on a noiseless gauge: 0.5 reads 0.5 at t 0, 0.575 at t 300 s, 0.65 at t 600 s, held between refreshes", near(d[0], 0.5) && near(d[9000], 0.575, 1e-9) && near(d[18000], 0.65, 1e-9) && d[9001] === d[9000] && d[9029] === d[9000] && d[9030] > d[9000]);
    const falling = (i) => 0.9 - i / 30000, p = at(X.FAULTS.DROP, falling);
    ok("!! DROP on a noiseless gauge: refreshed through t 29 s, stuck at that reading through t 59 s, refreshed at t 60 s, stuck again from 90 s",
        near(p[870], falling(870)) && p[900] === p[870] && p[1790] === p[870] && near(p[1800], falling(1800)) && p[1800] !== p[870] && near(p[2670], falling(2670)) && p[2700] === p[2670]);
    const z = at({ dropEveryS: 60, dropFromS: 0 }, falling);
    ok("  a gauge stuck from the first second still takes its first reading (the charge), then holds it", z[0] === 0.9 && z[1800] === 0.9 && z[17999] === 0.9);
    const n0 = T.gaugeOf(sc, { sd: 0.1, hz: 1 }), n1 = T.gaugeOf(sc, { sd: 0.1, hz: 1, fault: X.FAULTS.DROP }), r0 = [], r1 = [];
    for (let i = 0; i < 3600; i++) { r0.push(n0(i, 0.5)); r1.push(n1(i, 0.5)); }
    ok("!! the noise stream stays REF's: a stuck gauge reads REF's noisy value again at every refresh outside the stuck half-minutes (t 0-29 s and 60-89 s)", [0, 450, 870, 1800, 2400, 2670].every((i) => r0[i] === r1[i]) && r1[1200] === r1[870] && r0[1200] !== r0[870]);
    const nb = T.gaugeOf(sc, { sd: 0.1, hz: 1, fault: X.FAULTS.BIAS }), rb = [];
    for (let i = 0; i < 300; i++) rb.push(nb(i, 0.5));
    ok("  BIAS on the noisy gauge: every reading is REF's plus 0.10 where neither clips", rb.every((v, i) => (r0[i] <= 0 || r0[i] + 0.1 >= 1 ? true : near(v, r0[i] + 0.1, 1e-12))));
}

sec("3. VERDICTS");
{
    const run = (score, extra = {}) => ({ score, kind: "far", damage0: 0, fingerprint: "f" + score, crushed: false, stranded: false, ...extra });
    const resOf = (scores) => ({ runs: scores.map((s) => run(s)), crashed: 0, stranded: 0, score: scores.reduce((a, b) => a + b, 0) / scores.length });
    ok("!! the margin: +0.03 at se 0.01 beats; +0.019 at se 0.001 does not (under 0.02); +0.05 at se 0.03 does not (under 2 se)", X.beats({ mean: 0.03, se: 0.01 }) && !X.beats({ mean: 0.019, se: 0.001 }) && !X.beats({ mean: 0.05, se: 0.03 }) && X.beats({ mean: 0.0601, se: 0.03 }));
    ok("!! KEEPS / HURTS / LOSES at 2 se, both signs", X.keepsOf({ mean: 0.011, se: 0.005 }) === "KEEPS" && X.keepsOf({ mean: 0.009, se: 0.005 }) === "LOSES" && X.keepsOf({ mean: -0.011, se: 0.005 }) === "HURTS" && X.keepsOf({ mean: -0.009, se: 0.005 }) === "LOSES");
    const dd = X.diffOf(resOf([0.5, 0.6, 0.7]), resOf([0.4, 0.6, 0.8]));
    ok("  the pooled paired difference: mean, se, better and worse", near(dd.mean, 0) && near(dd.se, Math.sqrt(0.02 / 2 / 3)) && dd.better === 1 && dd.worse === 1 && throws(() => X.diffOf(resOf([1]), resOf([1, 2])), /different numbers/));
    const base = (o = {}) => Object.fromEntries(X.ARMS.map((a) => [a, Object.fromEntries(X.COND_NAMES.map((c) => [c, { ...resOf([0.5, 0.6, 0.7, 0.8]), ...((o[a] || {})[c] || {}) }]))]));
    const all = X.bottomLines(base());
    ok("!! all null: NOT A LIABILITY, THE SEAT'S HULL HOLDS, and the seat LOSES its lead under each fault", J(all) === J(["THE FILTER IS NOT A LIABILITY UNDER ANY FAULT", "THE SEAT'S HULL HOLDS UNDER ALL THREE FAULTS",
        "THE SEAT LOSES ITS LEAD OVER THE ROUND 8 RULE UNDER BIAS", "THE SEAT LOSES ITS LEAD OVER THE ROUND 8 RULE UNDER DRIFT", "THE SEAT LOSES ITS LEAD OVER THE ROUND 8 RULE UNDER DROP"]));
    const up = (k) => resOf([0.5, 0.6, 0.7, 0.8].map((v, i) => v + k + i * 0.001));
    const liab = X.bottomLines(base({ "R8-RAW": { BIAS: up(0.1), DROP: up(0.1) } }));
    ok("!! the filter is a liability under the faults where R8-RAW beats R8 by the margin, and only there", liab[0] === "THE FILTER IS A LIABILITY UNDER BIAS, DROP" && X.faultOf(base({ "R8-RAW": { DRIFT: up(0.015) } }), "DRIFT").liability === false);
    const lead = X.bottomLines(base({ SEAT: { BIAS: up(0.05), DROP: up(-0.05) }, L06: { BIAS: up(0.05), DROP: up(-0.05) } }));
    ok("!! the seat KEEPS under BIAS (it leads by 0.05), HURTS under DROP (it trails), LOSES under DRIFT (a tie)", lead[2] === "THE SEAT KEEPS ITS LEAD OVER THE ROUND 8 RULE UNDER BIAS" && lead[3] === "THE SEAT LOSES ITS LEAD OVER THE ROUND 8 RULE UNDER DRIFT" && lead[4] === "THE SEAT HURTS ITS LEAD OVER THE ROUND 8 RULE UNDER DROP");
    const hull = X.bottomLines(base({ SEAT: { REF: { crashed: 0, stranded: 0 }, BIAS: { crashed: 3, stranded: 2 }, DRIFT: { crashed: 4, stranded: 0 } } }));
    ok("!! the seat's hull against its own REF by Round 33's test: 5 against 0 pays more, 4 against 0 holds", hull[1] === "THE SEAT'S HULL PAYS MORE UNDER BIAS" && X.hullOk === X.hullOk && X.faultOf(base({ SEAT: { DRIFT: { crashed: 4, stranded: 0 } } }), "DRIFT").hull.SEAT.ok === true);
    const own = X.faultOf(base({ SEAT: { REF: { crashed: 3, stranded: 2 }, BIAS: { crashed: 3, stranded: 2 } } }), "BIAS").hull.SEAT;
    ok("!! each arm's hull is tested against its OWN REF dives: the seat at 5 under BIAS and 5 under REF holds, though R8 has none under REF", own.bad === 5 && own.ref === 5 && own.ok === true);
    const h2 = X.faultOf(base({ R8: { REF: { crashed: 26, stranded: 0 }, DROP: { crashed: 30, stranded: 8 } } }), "DROP").hull.R8;
    ok("  an arm's hull row: its count, its own REF count, the test (38 against 26 holds, 2 sqrt(64) = 16)", h2.bad === 38 && h2.ref === 26 && h2.ok === true);
}

sec("4. CHECKS");
{
    const mk = (n, fp = "x") => ({ runs: Array.from({ length: n }, (_, i) => ({ score: 0.5, kind: i < n / 2 ? "far" : "both", damage0: i, fingerprint: fp + i })), crashed: 0, stranded: 0, score: 0.5 });
    const good = () => Object.fromEntries(X.ARMS.map((a) => [a, Object.fromEntries(X.COND_NAMES.map((c) => [c, mk(4, c === "REF" ? "r" : "f")]))]));
    const names = (res) => X.checksOf(res, { dives: 4 }).filter((c) => !c.ok).map((c) => c.name);
    ok("!! a well-formed fixture passes all five checks", names(good()).length === 0 && X.checksOf(good(), { dives: 4 }).length === 5);
    const short = good(); short.L06.DRIFT = mk(3);
    const swap = good(); swap.SEAT.BIAS.runs = [...swap.SEAT.BIAS.runs].reverse();
    const still = good(); still.R8.DROP = mk(4, "r");
    ok("!! each break fails its check by name: a short arm SIZES, a reordered arm ALIGNED, a fault that changed nothing THE FAULTS REACH THE PILOT",
        names(short).includes("SIZES") && names(swap).includes("ALIGNED") && J(names(still)) === J(["THE FAULTS REACH THE PILOT"]));
    const rep = X.report(still, { dives: 4 });
    ok("!! a failed check is the report's first verdict line and the bottom line is NOT WEIGHED", rep.includes("A CHECK FAILED: the verdicts below are NOT WEIGHED.") && rep[rep.length - 1] === "BOTTOM LINE: NOT WEIGHED (a check failed)" && !rep.some((l) => /LIABILITY/.test(l)));
    const full = X.report(good(), { dives: 4 });
    ok("  a passing report carries the means, the fault costs, L06 minus R8, a block per fault and the bottom lines", full.some((l) => /^means/.test(l)) && full.some((l) => /^fault cost/.test(l)) && full.some((l) => /^L06 minus R8/.test(l)) &&
        X.FAULT_NAMES.every((c) => full.some((l) => l.startsWith(c + ": the filter"))) && full.filter((l) => l.startsWith("BOTTOM LINE:")).length === 5);
}

sec("5. FLIGHT (short dives on the gate's seeds)");
{
    const o = { range: X.GATE_SEEDS, seconds: 90, overrides: { seconds: 90 } }, g = (c) => X.gaugeOfCond(c), set = X.setOfKind("far", X.GATE_SEEDS);
    const r8 = X.flyJob("R8", "REF", "far", o), raw = X.flyJob("R8-RAW", "REF", "far", o), seat = X.flyJob("SEAT", "BIAS", "both", o);
    const fps = (r) => r.runs.map((x) => x.fingerprint).join("|");
    ok("!! R8 is the tuned rule on the Round 8 constants; R8-RAW is the same rule with alpha 1, and differs from R8", fps(r8) === fps(T.evaluate(T.flyDecision(U.tunedSeat(SS.SURVEY_R8, U.WIDE_BOUNDS)), set, { gauge: g("REF"), seconds: 90 })) &&
        fps(raw) === fps(T.evaluate(T.flyDecision(U.tunedSeat({ ...SS.SURVEY_R8, alpha: 1 }, X.RAW_BOUNDS)), set, { gauge: g("REF"), seconds: 90 })) && fps(raw) !== fps(r8));
    const l06 = X.flyJob("L06", "DRIFT", "far", o);
    ok("!! L06 is the rule on SURVEY_CONSTANTS; SEAT is the shipped survey pilot", fps(l06) === fps(T.evaluate(T.flyDecision(U.tunedSeat(SS.SURVEY_CONSTANTS, U.WIDE_BOUNDS)), set, { gauge: g("DRIFT"), seconds: 90 })) &&
        fps(seat) === fps(T.evaluate(SS.surveyPilot({ overrides: { seconds: 90 } }), X.setOfKind("both", X.GATE_SEEDS), { gauge: g("BIAS"), seconds: 90 })));
    const rb = X.flyJob("R8", "BIAS", "far", o);
    ok("!! a fault reaches the pilot: R8 under BIAS flies differently from R8 under REF on the same dives", fps(rb) !== fps(r8) && rb.runs.length === 2 && rb.runs.every((x, i) => x.kind === r8.runs[i].kind));
    ok("  refusals: an unknown arm, kind or condition", throws(() => X.pilotOf("R9"), /unknown arm/) && throws(() => X.flyJob("R8", "REF", "deep", o), /unknown kind/) && throws(() => X.flyJob("R8", "HEAT", "far", o), /unknown condition/));
}

sec("6. SOURCE");
{
    const code = fs.readFileSync(new URL("./gaugeFaults.mjs", import.meta.url), "utf8").split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n");
    ok("!! the registered seeds appear once in the library's code, the gate's once", (code.match(/43001/g) || []).length === 1 && (code.match(/43150/g) || []).length === 1 && (code.match(/43901/g) || []).length === 1);
    ok("!! no clock, no random, no file in the library", !/Date\.now|Math\.random|new Date|from "node:fs"|readFileSync|writeFileSync/.test(code));
    ok("!! the SEAT arm is the shipped pilot in its default (standard) profile: no profile is passed", /if \(arm === "SEAT"\) return SS\.surveyPilot\(\{ overrides \}\);/.test(code) && SS.planOf().replanS === undefined);
    const nt = fs.readFileSync(new URL("../../brain/needsTask.mjs", import.meta.url), "utf8");
    ok("  needsTask's no-fault branch is the old line, character for character", nt.includes("if (!fault) return (i, frac) => { if (held === null || i % every === 0) held = clamp(frac + sd * gaussOf(rng), 0, 1); return held; };"));
}

sec("7. THE RESULT, RE-DERIVED FROM THE COMMITTED RUN (brain/rig-results/gauge-faults/, read once)");
{
    const dir = new URL("../../brain/rig-results/gauge-faults/", import.meta.url), file = (a, c, k) => JSON.parse(fs.readFileSync(new URL(`${a}__${c}__${k}.json`, dir), "utf8"));
    const res = Object.fromEntries(X.ARMS.map((a) => [a, Object.fromEntries(X.COND_NAMES.map((c) => [c, X.mergeKinds(X.KINDS.map((k) => file(a, c, k)))]))]));
    const rep = X.report(res), lines = X.bottomLines(res);
    ok("!! the five checks pass on the committed run", X.checksOf(res).every((c) => c.ok) && !rep.includes("A CHECK FAILED: the verdicts below are NOT WEIGHED."));
    ok("!! *** the bottom lines: NOT A LIABILITY UNDER ANY FAULT; THE SEAT'S HULL PAYS MORE UNDER BIAS; the seat KEEPS its lead under BIAS, DRIFT and DROP ***", J(lines) === J(["THE FILTER IS NOT A LIABILITY UNDER ANY FAULT", "THE SEAT'S HULL PAYS MORE UNDER BIAS",
        "THE SEAT KEEPS ITS LEAD OVER THE ROUND 8 RULE UNDER BIAS", "THE SEAT KEEPS ITS LEAD OVER THE ROUND 8 RULE UNDER DRIFT", "THE SEAT KEEPS ITS LEAD OVER THE ROUND 8 RULE UNDER DROP"]));
    const c = (a, k) => [res[a][k].crashed, res[a][k].stranded].join("/");
    ok("!! the hull counts: R8 0/0 everywhere; SEAT 7 and L06 8 crushed under BIAS, every one a `both` dive; R8-RAW 56/25 under REF", X.COND_NAMES.every((k) => c("R8", k) === "0/0") && c("SEAT", "BIAS") === "7/0" && c("L06", "BIAS") === "8/0" && c("R8-RAW", "REF") === "56/25" &&
        res.SEAT.BIAS.runs.filter((r) => r.crushed).every((r) => r.kind === "both") && res.L06.BIAS.runs.filter((r) => r.crushed).every((r) => r.kind === "both"));
    const d = (a, k) => X.diffOf(res[a][k], res[a].REF).mean;
    ok("!! the means and the signs the RESULT states: R8 0.7900 at REF; an optimistic gauge RAISES R8 (+0.0218 BIAS, +0.0347 DRIFT); the seat leads R8 by +0.0292, +0.0355, +0.0263",
        near(res.R8.REF.score, 0.7900, 5e-5) && near(d("R8", "BIAS"), 0.0218, 5e-5) && near(d("R8", "DRIFT"), 0.0347, 5e-5) && near(X.faultOf(res, "BIAS").lead.mean, 0.0292, 5e-5) && near(X.faultOf(res, "DRIFT").lead.mean, 0.0355, 5e-5) && near(X.faultOf(res, "DROP").lead.mean, 0.0263, 5e-5));
    const nl = fs.readFileSync(new URL("../../brain/NEEDS_AND_LIMITS.md", import.meta.url), "utf8"), i = nl.indexOf("## Round 34, RESULT"), r34 = i > 0 ? nl.slice(i) : "";
    ok("  the RESULT note says the bottom lines, that the optimistic gauge acts as a lower trip point, and that the RAW control is weaker than the verdict sounds", i > 0 && /THE SEAT'S HULL PAYS MORE UNDER BIAS/.test(r34) && /acts as a lower trip point/.test(r34) && /weaker than the verdict sounds/.test(r34) && /\*\*no: it is a GAIN, \+0\.022\.\*\*/.test(r34));
}

finished = true;
console.log(`\n${fails ? "FAIL -- " + fails + " check(s)" : "ALL GREEN"} (${Date.now() - t0} ms)\nnot checked here: what the faults do on the registered dives (that is the experiment).`);
process.exitCode = fails ? 1 : 0;
