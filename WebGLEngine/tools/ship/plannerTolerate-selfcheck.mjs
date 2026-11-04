// WebGLEngine/tools/ship/plannerTolerate-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/plannerTolerate-selfcheck.mjs      (about 30 s: hand fixtures and a few short dives)
//
// THE GATE OF tools/ship/plannerTolerate.mjs (Round 32 of brain/NEEDS_AND_LIMITS.md, registered first).
//   1 SETS      five conditions, selection REF 8001-8300, DMG 8401-8700, N20 8801-9100, N30 9201-9500, STN5 9601-9900 (600 dives a shift and condition) and confirmation REF 10001-10150, DMG 10201-10350, N20 10401-10550,
//               N30 10601-10750, STN5 10801-10950 (300 dives an arm and condition), disjoint from every seed of Rounds 1-31; each condition differs from REF in one thing; the 7 shifts; the 35 + 30 jobs.
//   2 SHIFT     the arm names, the shifts, the parameters (low moves, nothing else); refusals; the set of a condition and stage.
//   3 CHOICE    the selection table (gain, hull allowance, eligibility, value) and the winner: the highest worst-condition gain among the eligible shifts; ties to the smaller shift; L0 wins unless a shift is strictly positive.
//   4 VERDICTS  per condition on the confirmation: the rule gain, the twin gain, the hull.
//   5 LINES     the four bottom lines in all their cases.
//   6 CHECKS    generator, sizes, kinds aligned, shifts distinct; a failed check says NOT WEIGHED.
//   7 REPORT    the table and the lines.
//   8 FLIGHT    real short dives: a selection arm is the rule at its shift with its condition's noise, the confirmation arms are the pilots they name on the winner's constants; refusals.
//   9 SOURCE    the seeds appear in one place; no clock, random or file.
// NOT CHECKED, said plainly: which shift is robust (that is the experiment).
// SABOTAGE LOG (76 mutants of tools/ship/plannerTolerate.mjs, run against a copy of this gate, each applied alone): 74 went red by name on the first pass. 1 went 0 red and got a row (then red): the confirmation flight ignoring its condition's gauge noise (the gate's confirmation flights ran at the reference noise; a row now compares N30's confirmation flight with the sd 0.3 and sd 0.1 flights of its seeds). 1 is EQUIVALENT: the GENERATOR check forced true -- it recomputes the live generator and is true today, so only a broken generator could turn it red, which plannerRobust's gate guards directly. The mutants covered the ten seed ranges, the damage scale, both noise levels, the station count, the shifts, the allowance (3, 2, 4, strict, one-sided, ignoring L0 or stranded dives), the name and shift parsing and its refusals, the shift's sign and scope, the set of a condition and stage, the table (gain, value as mean or max, eligibility), the winner (lowest, ties, ineligible allowed, missing cell allowed), the arms' constants and pilots, the verdicts' operands and thresholds, HURTS, the pooling, the hull test (winner only, twin only, strict, stranded dropped), the four bottom lines' texts, the checks forced true or not aligned, the early return on a failed check, the head's round, the winner marker and assemble.
"use strict";
import fs from "node:fs";
let fails = 0, finished = false;
const died = (e) => { console.log("  FAIL  !! THE GATE THREW before it finished: " + String((e && e.stack) || e).split("\n").slice(0, 3).join(" | ").slice(0, 400)); process.exitCode = 1; };
process.on("uncaughtException", died); process.on("unhandledRejection", died);
process.on("exit", () => { if (!finished) { console.log("  FAIL  !! THE GATE ENDED BEFORE IT FINISHED"); process.exitCode = 1; } });
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const sec = (t) => console.log("\n" + t);
const J = JSON.stringify, near = (a, b, t = 1e-9) => Math.abs(a - b) < t;
import * as T from "../../brain/needsTask.mjs";
import * as U from "../../brain/tunedRule.mjs";
import * as Q from "../../brain/plannerPerturbed.mjs";
import * as X from "./plannerTolerate.mjs";
console.log("plannerTolerate-selfcheck -- the Round 32 robust choice\n");
const code = fs.readFileSync(new URL("./plannerTolerate.mjs", import.meta.url), "utf8").split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n");
const rangeOf = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
const R8 = { alpha: 0.001, low: 0.38036, high: 0.68938, ramp: 20, cap: 0.88615 };

sec("1. SETS");
{
    const prior = new Set([...rangeOf(1, 1100), ...rangeOf(1101, 1208), ...rangeOf(1221, 1328), ...rangeOf(1341, 1448), ...rangeOf(1461, 1568), ...rangeOf(1601, 1768), ...rangeOf(1801, 2100), ...rangeOf(2201, 2308), ...rangeOf(2401, 3400), ...rangeOf(3501, 3850), ...rangeOf(3901, 4096), ...rangeOf(4201, 4348), ...rangeOf(4401, 4700), ...rangeOf(4801, 5100), ...rangeOf(5201, 5300), ...rangeOf(5401, 5700), ...rangeOf(5801, 6200), ...rangeOf(6301, 6500), ...rangeOf(6601, 6900), ...rangeOf(7001, 7750), ...rangeOf(8001, 9900), ...rangeOf(10001, 10950)]);
    const sel = X.COND_NAMES.flatMap((c) => rangeOf(...X.CONDITIONS[c].sel)), conf = X.COND_NAMES.flatMap((c) => rangeOf(...X.CONDITIONS[c].conf)), all = [...sel, ...conf];
    ok("!! five conditions REF DMG N20 N30 STN5; selection seeds 12001-12400, 12401-12800, 12801-13200, 13201-13600, 13601-14000 (2000) and confirmation seeds 14001-14150, 14201-14350, 14401-14550, 14601-14750, 14801-14950 (750), all distinct and sharing none with Rounds 1-32", J(X.COND_NAMES) === J(["REF", "DMG", "N20", "N30", "STN5"]) && J(X.COND_NAMES.map((c) => X.CONDITIONS[c].sel)) === J([[12001, 12400], [12401, 12800], [12801, 13200], [13201, 13600], [13601, 14000]]) && J(X.COND_NAMES.map((c) => X.CONDITIONS[c].conf)) === J([[14001, 14150], [14201, 14350], [14401, 14550], [14601, 14750], [14801, 14950]]) && new Set(all).size === 2750 && all.every((s) => !prior.has(s)) && X.SEL_DIVES === 800 && X.CONF_DIVES === 300);
    const c = X.CONDITIONS, r = c.REF;
    ok("!! REF is the shipped task (3 stations, damage scale 1, sd 0.1) and each other condition differs in exactly one thing: DMG scale 1.6, N20 sd 0.2, N30 sd 0.3, STN5 five stations", r.count === 3 && r.damageScale === 1 && r.sd === 0.1 && c.DMG.damageScale === 1.6 && c.DMG.count === 3 && c.DMG.sd === 0.1 && c.N20.sd === 0.2 && c.N20.count === 3 && c.N20.damageScale === 1 && c.N30.sd === 0.3 && c.N30.count === 3 && c.N30.damageScale === 1 && c.STN5.count === 5 && c.STN5.damageScale === 1 && c.STN5.sd === 0.1);
    ok("!! seven shifts 0, -0.02 ... -0.12, named L0, L-0.02 ... L-0.12; the old allowance constant is 3; 35 selection jobs and 30 confirmation jobs", J(X.SHIFTS) === J([0, -0.02, -0.04, -0.06, -0.08, -0.1, -0.12]) && J(X.GRID) === J(["L0", "L-0.02", "L-0.04", "L-0.06", "L-0.08", "L-0.10", "L-0.12"]) && X.OLD_ALLOW === 3 && X.SEL_JOBS.length === 35 && X.CONF_JOBS.length === 30 && J(X.CONF_ARMS) === J(["TUNED-R8", "TUNED-WIN", "TWIN-WIN"]));
}
sec("2. SHIFT");
{
    const thr = (f) => { try { f(); return ""; } catch (e) { return String(e.message); } };
    ok("!! shiftOf is the inverse of nameOf for all seven arms; a name outside the grid (L-0.03, L-0.14, TUNED-R8, '', a prototype name) is refused with this library's message", X.SHIFTS.every((s) => X.shiftOf(X.nameOf(s)) === s) && /plannerTolerate\.shiftOf: "L-0\.03" is not a grid arm/.test(thr(() => X.shiftOf("L-0.03"))) && thr(() => X.shiftOf("L-0.14")) && thr(() => X.shiftOf("TUNED-R8")) && thr(() => X.shiftOf("")) && thr(() => X.shiftOf("constructor")));
    const p = X.paramsOf("L-0.12", R8), z = X.paramsOf("L0", R8);
    ok("!! L-0.12 moves low down by 0.12 and changes nothing else; L0 is the Round 8 constants; the Round 8 object is not changed", near(p.low, 0.26036) && p.high === R8.high && p.alpha === R8.alpha && p.ramp === R8.ramp && p.cap === R8.cap && z.low === R8.low && R8.low === 0.38036);
    const s = X.setFor("DMG", "sel", ["both"]);
    ok("!! a condition's set: selection DMG both is 400 scenarios of seeds 12401-12800 at the DMG damage scale; far and both is 800, kind-major; the confirmation stage has its own seeds; an unknown condition or stage is refused", s.length === 400 && s[0].seed === 12401 && s[399].seed === 12800 && J(s[0]) === J((await_scenario)(12401, "both", 3, 1.6)) && X.setFor("N30", "sel").length === 800 && X.setFor("N30", "sel")[0].kind === "far" && X.setFor("N30", "sel")[799].kind === "both" && X.setFor("N30", "conf")[0].seed === 14601 && X.setFor("N30", "conf").length === 300 && X.setFor("STN5", "conf", ["far"])[0].stations.length === 5 && /unknown condition "ZZ"/.test(thr(() => X.setFor("ZZ", "sel"))) && /unknown stage "x"/.test(thr(() => X.setFor("REF", "x"))));
}
import { scenarioX as await_scenario } from "./plannerRobust.mjs";
// synthetic selection: sel[name][cond] = { score, crashed, stranded, runs (800) }
const mkSel = (f) => Object.fromEntries(X.GRID.map((n) => [n, Object.fromEntries(X.COND_NAMES.map((c) => { const v = f(n, c) || {}; return [c, { score: 0.8 + (v.gain || 0), crashed: v.bad || 0, stranded: v.str || 0, runs: Array.from({ length: 800 }, (_, i) => ({ kind: i < 400 ? "far" : "both", score: 0.8, fingerprint: `${n}_${c}_${i}` })) }]; }))]));
const gainTab = (g) => (n, c) => ({ gain: (g[n] || {})[c] ?? (g[n] || {}).all ?? 0 });
sec("3. CHOICE");
{
    const w = (g, hull = {}) => X.winnerOf(mkSel((n, c) => ({ gain: (g[n] || {})[c] ?? (g[n] || {}).all ?? 0, bad: (hull[n] || {})[c] || 0 })));
    ok("!! the highest WORST-condition gain wins: L-0.04 gains 0.01 everywhere, L-0.02 0.005, L-0.12 gains 0.05 in four conditions and loses 0.01 in N30 -> L-0.04", w({ "L-0.04": { all: 0.01 }, "L-0.02": { all: 0.005 }, "L-0.12": { REF: 0.05, DMG: 0.05, N20: 0.05, STN5: 0.05, N30: -0.01 } }) === "L-0.04");
    ok("!! the value is the minimum, not the mean: a shift with a huge mean and a bad worst case loses to a modest steady one (L-0.10: +0.08 x4, -0.001; L-0.06: +0.002 everywhere)", w({ "L-0.10": { REF: 0.08, DMG: 0.08, N20: 0.08, STN5: 0.08, N30: -0.001 }, "L-0.06": { all: 0.002 } }) === "L-0.06");
    ok("!! L0 wins when no shift has a strictly positive worst case (every shift loses somewhere, or ties at 0)", w({ "L-0.04": { REF: 0.02, N30: -0.0001 }, "L-0.08": { all: 0 } }) === "L0" && w({}) === "L0");
    ok("!! the hull test is b - b0 <= 2 sqrt(b + b0) per condition: a shift with 4 crushed dives against L0's 0 in N30 is eligible, 5 is not; the best-scoring shift is passed over when ineligible", w({ "L-0.12": { all: 0.05 }, "L-0.04": { all: 0.01 } }, { "L-0.12": { N30: 4 } }) === "L-0.12" && w({ "L-0.12": { all: 0.05 }, "L-0.04": { all: 0.01 } }, { "L-0.12": { N30: 5 } }) === "L-0.04");
    ok("!! the allowance is relative to L0's own count: when L0 crushes 5 in DMG, 13 is allowed (8 <= 2 sqrt 18) and 14 is not (9 > 2 sqrt 19); stranded dives count with crushed ones", w({ "L-0.06": { all: 0.02 } }, { L0: { DMG: 5 }, "L-0.06": { DMG: 13 } }) === "L-0.06" && w({ "L-0.06": { all: 0.02 } }, { L0: { DMG: 5 }, "L-0.06": { DMG: 14 } }) === "L0" && X.winnerOf(mkSel((n, c) => (n === "L-0.06" ? { gain: 0.02, bad: c === "REF" ? 3 : 0, str: c === "REF" ? 3 : 0 } : {}))) === "L0");
    ok("!! an exact tie in value goes to the smaller absolute shift: L-0.04 and L-0.08 both +0.01 -> L-0.04", w({ "L-0.04": { all: 0.01 }, "L-0.08": { all: 0.01 } }) === "L-0.04" && w({ "L-0.08": { all: 0.01 }, "L-0.04": { all: 0.01 } }) === "L-0.04");
    const t = X.tableOf(mkSel((n, c) => ({ gain: n === "L-0.04" ? (c === "N30" ? -0.003 : 0.01) : 0, bad: n === "L-0.04" && c === "DMG" ? 2 : 0 }))), row = t.find((r) => r.name === "L-0.04");
    ok("!! the table row: per-condition score, gain over L0, crushed+stranded and whether the allowance holds; the value is the worst gain (-0.003), eligible when every condition holds", near(row.per.REF.gain, 0.01) && near(row.per.N30.gain, -0.003) && row.per.DMG.bad === 2 && row.per.DMG.ok === true && near(row.value, -0.003) && row.eligible === true && t.length === 7 && t[0].name === "L0" && t[0].value === 0 && t[0].eligible === true);
    const part = mkSel(() => ({})); delete part["L-0.08"].N20;
    ok("!! a selection with a cell missing is refused with its own message, naming the cell, not a TypeError", /must hold every grid arm in every condition \(L-0\.08 N20 is missing\)/.test((() => { try { X.winnerOf(part); return ""; } catch (e) { return e.message; } })()));
}
// synthetic confirmation: 300 dives a condition per arm
const mkArm = (cond, off, h = {}) => ({ score: 0.7, crashed: h.c || 0, stranded: h.s || 0, runs: Array.from({ length: 300 }, (_, i) => { const base = 0.6 + 0.1 * Math.sin(i + 3 * cond.length), g = off ? off(i) : 0; return { kind: i < 150 ? "far" : "both", score: base + g, fingerprint: `${cond}_${i}_${g}` }; }) });
const every = (k, v) => (i) => (i % k === 0 ? v : 0), wob = (i, a) => (i % 2 ? a : -a);
const synth = (spec = {}) => Object.fromEntries(X.COND_NAMES.map((c) => { const s = spec[c] || {}; return [c, { "TUNED-R8": mkArm(c, null, s.hr8), "TUNED-WIN": mkArm(c, s.rule, s.hw), "TWIN-WIN": mkArm(c, (i) => (s.rule ? s.rule(i) : 0) + (s.twin ? s.twin(i) : 0), s.ht) }]; }));
sec("4. VERDICTS");
{
    const au = synth({ REF: { rule: every(5, 0.1), twin: every(5, 0.1) }, DMG: { rule: every(5, -0.1), twin: every(4, 0.1) }, N20: { rule: (i) => wob(i, 0.02) }, N30: {}, STN5: { twin: every(2, 0.05) } }), c = (n) => X.conditionOf(au, n);
    ok("!! the rule gain (winner minus R8): a steady gain KEEPS (+0.02), a steady loss HURTS, a wobble LOSES, no change LOSES", c("REF").ruleVerdict === "KEEPS" && near(c("REF").rule.mean, 0.02) && c("DMG").ruleVerdict === "HURTS" && c("N20").ruleVerdict === "LOSES" && c("N30").ruleVerdict === "LOSES");
    ok("!! the twin gain is TWIN-WIN minus TUNED-WIN within the condition: REF +0.02 KEEPS, DMG +0.025 KEEPS, STN5 +0.025 KEEPS, N20 and N30 LOSE", c("REF").twinVerdict === "KEEPS" && near(c("REF").twin.mean, 0.02) && near(c("DMG").twin.mean, 0.025) && c("DMG").twinVerdict === "KEEPS" && c("STN5").twinVerdict === "KEEPS" && c("N20").twinVerdict === "LOSES" && c("N30").twinVerdict === "LOSES");
    ok("!! each reading is pooled over ITS condition only (n 300, REF better 60, DMG worse 60)", c("REF").rule.n === 300 && c("REF").rule.better === 60 && c("DMG").rule.worse === 60);
    const amp = 0.03, se = amp * 1.0013 / Math.sqrt(300), g = (k) => synth({ REF: { rule: (i) => wob(i, amp) + k * se, twin: (i) => wob(i, amp) + k * se } });
    ok("!! the threshold is 2 se on both sides, rule and twin: +1.5 se LOSES, +2.5 se KEEPS, -1.5 se LOSES, -2.5 se HURTS (the twin gain: a negative one LOSES)", X.conditionOf(g(1.5), "REF").ruleVerdict === "LOSES" && X.conditionOf(g(2.5), "REF").ruleVerdict === "KEEPS" && X.conditionOf(g(-1.5), "REF").ruleVerdict === "LOSES" && X.conditionOf(g(-2.5), "REF").ruleVerdict === "HURTS");
    const gt = (k) => synth({ REF: { twin: (i) => wob(i, amp) + k * se } });
    ok("!! the twin's own threshold: +1.5 se of twin over winner LOSES, +2.5 se KEEPS", X.conditionOf(gt(1.5), "REF").twinVerdict === "LOSES" && X.conditionOf(gt(2.5), "REF").twinVerdict === "KEEPS");
    const h = (hr8, hw, ht) => X.conditionOf(synth({ DMG: { hr8: { c: hr8 }, hw: { c: hw }, ht: { s: ht } } }), "DMG");
    ok("!! the hull counts crushed plus stranded per arm; hullOk iff the winner's and the twin's counts each pass the Poisson test against R8's (R8 2: winner 8 and twin 8 ok; winner 9 breaks; twin 9 breaks)", h(2, 8, 8).hull["TUNED-WIN"] === 8 && h(2, 8, 8).hull["TWIN-WIN"] === 8 && h(2, 8, 8).hullOk === true && h(2, 9, 8).hullOk === false && h(2, 8, 9).hullOk === false && h(2, 0, 0).hullOk === true);
}
{
    const pairs = [[30, 26, true], [38, 26, true], [4, 0, true], [5, 0, false], [38, 0, false], [20, 30, true], [0, 0, true], [13, 5, true], [14, 5, false]];
    ok("!! the hull test on the registered pairs (bad, L0's): 30 vs 26 ok, 38 vs 26 ok, 4 vs 0 ok, 5 vs 0 not, 38 vs 0 not, fewer than L0 ok, 0 vs 0 ok, 13 vs 5 ok, 14 vs 5 not", pairs.every(([b, b0, e]) => X.hullOk(b, b0) === e));
    ok("!! Round 32's allowance is kept only to be reported: 30 vs 26 fails it (b <= b0 + 3 is false), 29 vs 26 passes, 38 vs 26 fails", X.oldHullOk(29, 26) === true && X.oldHullOk(30, 26) === false && X.oldHullOk(38, 26) === false);
    const ds = (n, c) => (n === "L-0.04" ? { gain: 0.01, bad: c === "DMG" ? 30 : 0 } : n === "L0" ? { bad: c === "DMG" ? 26 : 0 } : {}), sl = mkSel(ds);
    ok("!! the two policies on one table: with 30 against 26 in DMG the Poisson test passes L-0.04 and Round 32's allowance does not, so the new winner is L-0.04 and the old one L0; the table row carries both flags", X.winnerOf(sl) === "L-0.04" && X.winnerOldOf(sl) === "L0" && X.tableOf(sl).find((r) => r.name === "L-0.04").per.DMG.ok === true && X.tableOf(sl).find((r) => r.name === "L-0.04").per.DMG.okOld === false && X.tableOf(sl)[0].eligibleOld === true);
    ok("!! winnerOldOf takes the highest worst-case among the old-eligible shifts and L0 when none: L-0.02 (+0.005, clean) beats an ineligible +0.05", X.winnerOldOf(mkSel((n, c) => (n === "L-0.02" ? { gain: 0.005 } : n === "L-0.10" ? { gain: 0.05, bad: c === "N30" ? 9 : 0 } : {}))) === "L-0.02");
}
sec("5. LINES");
{
    const K = { rule: every(5, 0.1), twin: every(5, 0.1) }, L = (spec, w = "L-0.04", sel = mkSel(gainTab({ [w]: { all: 0.01 } }))) => X.bottomLines(synth(spec), w, sel);
    ok("!! a shift won: line 1 names it with the worst-condition gain on selection (+0.0100); all five keep; the twin keeps in all five; the hull is no worse", J(L({ REF: K, DMG: K, N20: K, N30: K, STN5: K })) === J(["THE ROBUST CHOICE IS LOW -0.04 (WORST-CONDITION GAIN +0.0100 ON SELECTION)", "THE CHOICE KEEPS ITS GAIN IN 5 OF 5 CONDITIONS (REF, DMG, N20, N30, STN5)", "THE TWIN KEEPS ITS GAIN ON IT IN 5 OF 5 CONDITIONS (REF, DMG, N20, N30, STN5)", "THE HULL IS NO WORSE THAN ROUND 8 IN ANY CONDITION"]));
    ok("!! L0 won: line 1 says no shift beats the Round 8 constants within the allowance", L({}, "L0", mkSel(() => ({})))[0] === "NO SHIFT BEATS THE ROUND 8 CONSTANTS IN EVERY CONDITION WITHIN THE HULL ALLOWANCE");
    const mixed = L({ REF: K, DMG: { rule: every(5, -0.1), twin: K.twin }, N20: {}, N30: K, STN5: K });
    ok("!! a condition where the choice HURTS is named as hurt, one where it merely LOSES as lost, the keepers in order; the twin line counts its own keepers", mixed[1] === "THE CHOICE KEEPS ITS GAIN IN 3 OF 5 CONDITIONS (REF, N30, STN5); IT HURTS IN (DMG); IT LOSES IT IN (N20)" && mixed[2] === "THE TWIN KEEPS ITS GAIN ON IT IN 4 OF 5 CONDITIONS (REF, DMG, N30, STN5)");
    ok("!! none keeps: the list is 'none'", L({})[1] === "THE CHOICE KEEPS ITS GAIN IN 0 OF 5 CONDITIONS (none); IT LOSES IT IN (REF, DMG, N20, N30, STN5)" && L({})[2] === "THE TWIN KEEPS ITS GAIN ON IT IN 0 OF 5 CONDITIONS (none)");
    ok("!! the hull line names the conditions where the winner OR the twin broke the Poisson test against R8, in order, and is clean otherwise", L({ N30: { hr8: { c: 0 }, hw: { c: 5 } }, DMG: { hr8: { c: 1 }, ht: { s: 8 } } })[3] === "THE HULL PAYS MORE THAN ROUND 8 IN DMG, N30" && L({ N30: { hr8: { c: 0 }, hw: { c: 4 } } })[3] === "THE HULL IS NO WORSE THAN ROUND 8 IN ANY CONDITION");
    const sel = mkSel(gainTab({ "L-0.06": { REF: 0.03, DMG: 0.02, N20: 0.015, N30: 0.012, STN5: 0.04 } }));
    ok("!! the worst-condition gain printed is the winner's own selection value (+0.0120), signed", X.bottomLines(synth({}), "L-0.06", sel)[0] === "THE ROBUST CHOICE IS LOW -0.06 (WORST-CONDITION GAIN +0.0120 ON SELECTION)");
}
sec("6. CHECKS");
{
    const names = (s, a) => X.checksOf(s, a).filter((c) => !c.ok).map((c) => c.name), good = () => synth({ REF: { rule: every(5, 0.1) } });
    ok("!! four check rows on a clean audit: GENERATOR, SIZES, KINDS ALIGNED, SHIFTS DISTINCT; all pass", J(X.checksOf(mkSel(() => ({})), good()).map((c) => c.name)) === J(["GENERATOR", "SIZES", "KINDS ALIGNED", "SHIFTS DISTINCT"]) && names(mkSel(() => ({})), good()).length === 0);
    const s1 = mkSel(() => ({})); s1["L-0.04"].N30.runs.pop(); const a1 = good(); a1.DMG["TWIN-WIN"].runs.pop();
    ok("!! a selection cell of 599 dives, or a confirmation arm of 299, breaks SIZES", names(s1, good()).includes("SIZES") && names(mkSel(() => ({})), a1).includes("SIZES"));
    const s2 = mkSel(() => ({})); s2["L-0.06"].STN5.runs[3].kind = "both"; const a2 = good(); a2.N20["TUNED-WIN"].runs[3].kind = "both";
    ok("!! a dive of another kind than L0's (selection) or than TUNED-R8's (confirmation) within a condition breaks KINDS ALIGNED", names(s2, good()).includes("KINDS ALIGNED") && names(mkSel(() => ({})), a2).includes("KINDS ALIGNED"));
    const s3 = mkSel(() => ({})); s3["L-0.08"].REF.runs = s3["L-0.10"].REF.runs.map((r) => ({ ...r }));
    ok("!! two shifts with identical REF dives break SHIFTS DISTINCT only", J(names(s3, good())) === J(["SHIFTS DISTINCT"]));
}
sec("7. REPORT");
{
    const sel = mkSel(gainTab({ "L-0.04": { all: 0.01 }, "L-0.12": { N30: -0.02, all: 0.02 } })), au = synth({ REF: { rule: every(5, 0.1), twin: every(5, 0.1) }, N30: { hr8: { c: 0 }, hw: { c: 4 } } }), L = X.report(sel, au, "L-0.04"), txt = L.join("\n");
    ok("!! the head names the five conditions with selection and confirmation seeds; the four checks pass first", /^ROUND 33: .*REF 12001-12400, DMG 12401-12800, N20 12801-13200, N30 13201-13600, STN5 13601-14000 \(800 dives per shift and condition\); confirmation REF 14001-14150, DMG 14201-14350, N20 14401-14550, N30 14601-14750, STN5 14801-14950 \(300 dives per arm and condition; read once\)$/.test(L[0]) && L.slice(1, 5).every((l) => /^  PASS /.test(l)));
    ok("!! the selection table has a row per shift with the gain and crushed+stranded of each condition, the value and eligibility, the winner marked; a shift breaking the allowance is NO", X.GRID.every((n) => txt.includes("  " + n.padEnd(8) + "  ")) && /L-0\.04 +.*\+0\.0100 \(0\).* +\+0\.0100 +yes  <- WINNER/.test(txt) && /L-0\.12 .*-0\.0200 \(0\).* -0\.0200 +yes/.test(txt) && /L0 .* \+0\.0000 \(0\)/.test(txt));
    ok("!! one block per condition: the three means, the rule gain with verdict and counts, the twin gain, crushed+stranded of R8, winner and twin", /REF: means R8 /.test(txt) && /rule gain \(winner minus R8\) \+0\.0200 \(se [0-9.]+; better 60, worse 0, same 240\)  KEEPS/.test(txt) && /twin gain \(twin minus winner\) \+0\.0200/.test(txt) && /crushed\+stranded: R8 0, winner 4, twin 0/.test(txt));
    ok("!! the report says which shift Round 32's allowance would have picked on the same table (REPORTED, NOT THE VERDICT)", (() => { const sl = mkSel((n, c) => (n === "L-0.04" ? { gain: 0.01, bad: c === "DMG" ? 30 : 0 } : n === "L0" ? { bad: c === "DMG" ? 26 : 0 } : {})); return /REPORTED, NOT THE VERDICT: Round 32's allowance \(L0 \+ 3\) on this same fresh table would pick L0; the Poisson test picks L-0\.04/.test(X.report(sl, au, "L-0.04").join("\n")); })());
    ok("!! the four bottom lines come last, each prefixed BOTTOM LINE:", L.slice(-4).every((l) => l.startsWith("BOTTOM LINE: ")) && /ROBUST CHOICE|NO SHIFT/.test(L[L.length - 4]) && /KEEPS ITS GAIN/.test(L[L.length - 3]) && /THE TWIN/.test(L[L.length - 2]) && /HULL/.test(L[L.length - 1]));
    const bad = synth({}); bad.REF["TUNED-R8"].runs.pop(); const Lb = X.report(mkSel(() => ({})), bad, "L0");
    ok("!! a failed check puts FAIL on its row, says the verdicts are NOT WEIGHED and puts that on a single bottom line, with no table", Lb.some((l) => /^  FAIL SIZES/.test(l)) && Lb.includes("A CHECK FAILED: the verdicts below are NOT WEIGHED.") && Lb[Lb.length - 1] === "BOTTOM LINE: NOT WEIGHED (a check failed)" && Lb.filter((l) => l.startsWith("BOTTOM LINE")).length === 1 && !Lb.some((l) => /selection table/.test(l)));
}
sec("8. FLIGHT");
{
    X.setFlight({ seconds: 200 });
    const rng = [1344, 1346], kinds = ["far", "both"], t3 = T.setOf(kinds, 1344, 1346);
    const a = X.flySelection("L-0.12", R8, "N30", { kinds, range: rng }), direct = T.evaluate(T.flyDecision(U.tunedSeat({ ...R8, low: R8.low - 0.12 }, U.WIDE_BOUNDS)), Array.from({ length: 2 }, (_, k) => []).concat([]).length ? X.setFor("N30", "sel", kinds, rng) : [], { gauge: { sd: 0.3, hz: T.GAUGE.hz }, seconds: 200 });
    const z = X.flySelection("L0", R8, "N30", { kinds, range: rng }), n1 = X.flySelection("L-0.12", R8, "REF", { kinds, range: rng });
    ok("!! a selection arm is the bare rule at its shift on its condition's set with the condition's gauge noise (L-0.12, N30, seeds 1344-1346 far and both at 200 s), dive for dive; it differs from L0 and from the same shift at the reference noise", a.runs.length === 6 && a.runs.every((r, i) => r.fingerprint === direct.runs[i].fingerprint) && a.runs.some((r, i) => r.fingerprint !== z.runs[i].fingerprint) && a.runs.some((r, i) => r.fingerprint !== n1.runs[i].fingerprint));
    const cf = (arm, w) => X.flyConfirm(arm, w, R8, "REF", "far", { range: rng }), set = X.setFor("REF", "conf", ["far"], rng);
    const bare = (p) => T.evaluate(T.flyDecision(U.tunedSeat(p, U.WIDE_BOUNDS)), set, { gauge: T.GAUGE, seconds: 200 });
    ok("!! TUNED-R8 is the rule on the Round 8 constants whatever the winner; TUNED-WIN the rule on the winner's; they differ", cf("TUNED-R8", "L-0.12").runs.every((r, i) => r.fingerprint === bare(R8).runs[i].fingerprint) && cf("TUNED-WIN", "L-0.12").runs.every((r, i) => r.fingerprint === bare({ ...R8, low: R8.low - 0.12 }).runs[i].fingerprint) && cf("TUNED-WIN", "L-0.12").runs.some((r, i) => r.fingerprint !== cf("TUNED-R8", "L-0.12").runs[i].fingerprint));
    const tw = T.evaluate(T.flyDecision(Q.perturbedSeat({ ...R8, low: R8.low - 0.12 }, {}, { seconds: 200 })), set, { gauge: T.GAUGE, seconds: 200 });
    ok("!! TWIN-WIN is the perturbed twin on the winner's constants planning the flight's seconds, dive for dive; the winner L0 gives the twin on the Round 8 constants", cf("TWIN-WIN", "L-0.12").runs.every((r, i) => r.fingerprint === tw.runs[i].fingerprint) && cf("TWIN-WIN", "L0").runs.every((r, i) => r.fingerprint === T.evaluate(T.flyDecision(Q.perturbedSeat(R8, {}, { seconds: 200 })), set, { gauge: T.GAUGE, seconds: 200 }).runs[i].fingerprint));
    { const cfN = X.flyConfirm("TUNED-R8", "L0", R8, "N30", "far", { range: rng }), setN = X.setFor("N30", "conf", ["far"], rng), d3 = T.evaluate(T.flyDecision(U.tunedSeat(R8, U.WIDE_BOUNDS)), setN, { gauge: { sd: 0.3, hz: T.GAUGE.hz }, seconds: 200 }), d1 = T.evaluate(T.flyDecision(U.tunedSeat(R8, U.WIDE_BOUNDS)), setN, { gauge: { sd: 0.1, hz: T.GAUGE.hz }, seconds: 200 });
      ok("!! a confirmation flight carries its condition's gauge noise: N30 equals the sd 0.3 flight of its seeds dive for dive and differs from the sd 0.1 flight", cfN.runs.every((r, i) => r.fingerprint === d3.runs[i].fingerprint) && cfN.runs.some((r, i) => r.fingerprint !== d1.runs[i].fingerprint)); }
    X.setFlight({});
    const msg = (f) => { try { f(); return ""; } catch (e) { return String(e.message); } };
    ok("!! an unknown confirmation arm is refused with this library's message before flying; an unknown shift is refused at the selection flight", /plannerTolerate\.flyConfirm: unknown arm "TWIN-R8"/.test(msg(() => X.flyConfirm("TWIN-R8", "L0", R8, "REF", "far"))) && /is not a grid arm/.test(msg(() => X.flySelection("L-0.03", R8, "REF"))) && /unknown condition "ZZ"/.test(msg(() => X.flySelection("L0", R8, "ZZ"))));
    ok("!! assemble keys conditions then arms", J(Object.keys(X.assemble({ A: { REF: 1, DMG: 2, N20: 3, N30: 4, STN5: 5 }, B: { REF: 5, DMG: 6, N20: 7, N30: 8, STN5: 9 } }).N30)) === J(["A", "B"]) && X.assemble({ A: { REF: 1, DMG: 2, N20: 3, N30: 4, STN5: 5 } }).STN5.A === 5);
}
sec("9. SOURCE");
{
    ok("!! the ten selection and confirmation range ends 12001, 12400, 12401, 12800, 12801, 13200, 13201, 13600, 13601, 14000 and 14001, 14150, 14201, 14350, 14401, 14550, 14601, 14750, 14801, 14950 appear once each", ["12001", "12400", "12401", "12800", "12801", "13200", "13201", "13600", "13601", "14000", "14001", "14150", "14201", "14350", "14401", "14550", "14601", "14750", "14801", "14950"].every((s) => code.split(s).length === 2));
    ok("!! the file reads no clock, no random number and nothing from the disk", !/Date\.now|Math\.random|performance\.now|readFileSync|writeFileSync/.test(code));
}
console.log(fails ? `\n${fails} FAIL` : "\nall checks pass");
finished = true;
