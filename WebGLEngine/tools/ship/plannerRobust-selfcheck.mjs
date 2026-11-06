// WebGLEngine/tools/ship/plannerRobust-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/plannerRobust-selfcheck.mjs      (about 30 s: hand fixtures and a few 100-200-second dives)
//
// THE GATE OF tools/ship/plannerRobust.mjs (Round 31 of brain/NEEDS_AND_LIMITS.md, registered first).
//   1 SETS      the four conditions (REF 7001-7150, DMG 7201-7350, NOISE 7401-7550, STN5 7601-7750; 150 seeds of each of far and both = 300 dives an arm), disjoint from every seed of Rounds 1-30; three arms; the 24 jobs.
//   2 GENERATOR the own scenario generator: at 3 stations and scale 1 it is needsTask.scenario; the damage scale raises the damage of the damaged kinds before the depths are drawn, capped at 0.8; the station count; refusals.
//   3 SHIFT     the L12 arms move `low` down by 0.12 and nothing else.
//   4 VERDICTS  per condition: the rule gain (KEEPS / LOSES / HURTS) and the twin gain (KEEPS / LOSES), the hull counts.
//   5 LINES     the four bottom lines in all their cases.
//   6 CHECKS    generator, damage scale, sizes, kinds aligned; a failed check says NOT WEIGHED.
//   7 REPORT    the lines.
//   8 FLIGHT    real short dives: an arm is the pilot it names on the constants it names; a condition's gauge noise and damage reach the flight; unknown arm or condition refused.
//   9 SOURCE    the seeds appear in one place; no clock, random or file.
// NOT CHECKED, said plainly: whether the constants hold up (that is the experiment).
// SABOTAGE LOG (54 mutants of tools/ship/plannerRobust.mjs, run against a copy of this gate, each applied alone): 49 went red by name on the first pass. 3 went 0 red and got rows (all then red): the twin gain's 2 se threshold (the rule gain's had fixtures at 1.5 and 2.5 se, the twin's did not), a chunk flown at the reference noise instead of its condition's (the row now compares NOISE far with the sd 0.3 and the sd 0.1 flights of its seeds), and the hull line ignoring stranded dives (a stranded-only fixture). 2 are EQUIVALENT: the GENERATOR and DAMAGE SCALE checks forced true -- both recompute the live generator and are true today, so only a broken generator could turn them red, which the generator rows of section 2 guard directly. The others: the conditions' seeds, scale, noise and count, the shift's size and sign and scope, the cap and the sizes, the scale applied after the cap or without it, the station count ignored, the three refusals, the set's count and scale ignored, the arms' pilots, the noise and seconds ignored, the unknown arm and condition refusals, the rule and twin operands, HURTS dropped, 1 se readings, readings pooled over all conditions, the hull from the wrong arm, the Round 8 arm counted in the rule's hull, crushed summed over the first arm only, the comparison with the Round 8 hull on the twin or with >=, the bottom lines' none, lose and hurt texts, the checks forced true or not aligned, the head's round, the early return on a failed check and assemble.
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
import * as X from "./plannerRobust.mjs";
console.log("plannerRobust-selfcheck -- the Round 31 robustness test\n");
const code = fs.readFileSync(new URL("./plannerRobust.mjs", import.meta.url), "utf8").split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n");
const rangeOf = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
const R8 = { alpha: 0.001, low: 0.38036, high: 0.68938, ramp: 20, cap: 0.88615 };

sec("1. SETS");
{
    const prior = new Set([...rangeOf(1, 1100), ...rangeOf(1101, 1208), ...rangeOf(1221, 1328), ...rangeOf(1341, 1448), ...rangeOf(1461, 1568), ...rangeOf(1601, 1768), ...rangeOf(1801, 2100), ...rangeOf(2201, 2308), ...rangeOf(2401, 3400), ...rangeOf(3501, 3850), ...rangeOf(3901, 4096), ...rangeOf(4201, 4348), ...rangeOf(4401, 4700), ...rangeOf(4801, 5100), ...rangeOf(5201, 5300), ...rangeOf(5401, 5700), ...rangeOf(5801, 6200), ...rangeOf(6301, 6500), ...rangeOf(6601, 6900)]);
    const all = X.COND_NAMES.flatMap((c) => rangeOf(...X.CONDITIONS[c].seeds));
    ok("!! four conditions REF 7001-7150, DMG 7201-7350, NOISE 7401-7550, STN5 7601-7750 (600 distinct seeds, 150 of each kind per condition = 300 dives an arm), sharing no seed with Rounds 1-30", J(X.COND_NAMES) === J(["REF", "DMG", "NOISE", "STN5"]) && J(X.COND_NAMES.map((c) => X.CONDITIONS[c].seeds)) === J([[7001, 7150], [7201, 7350], [7401, 7550], [7601, 7750]]) && new Set(all).size === 600 && all.every((s) => !prior.has(s)) && X.DIVES === 300);
    ok("!! the conditions: REF is the shipped task (3 stations, damage scale 1, sd 0.1); DMG scale 1.6; NOISE sd 0.3; STN5 five stations -- each differs from REF in exactly one thing", (() => { const c = X.CONDITIONS, r = c.REF; return r.count === 3 && r.damageScale === 1 && r.sd === 0.1 && c.DMG.damageScale === 1.6 && c.DMG.count === 3 && c.DMG.sd === 0.1 && c.NOISE.sd === 0.3 && c.NOISE.count === 3 && c.NOISE.damageScale === 1 && c.STN5.count === 5 && c.STN5.damageScale === 1 && c.STN5.sd === 0.1; })());
    ok("!! three arms TUNED-R8, TUNED-L12, TWIN-L12; 24 jobs (arm x condition x kind); the shift is 0.12 and the damage cap 0.8", J(X.ARMS) === J(["TUNED-R8", "TUNED-L12", "TWIN-L12"]) && X.JOBS.length === 24 && X.SHIFT === 0.12 && X.DAMAGE_CAP === 0.8 && J(X.JOBS.filter(([a, c]) => a === "TWIN-L12" && c === "STN5")) === J([["TWIN-L12", "STN5", "far"], ["TWIN-L12", "STN5", "both"]]));
}
sec("2. GENERATOR");
{
    const sample = [[1, "far"], [2, "both"], [271, "far"], [3, "deep"], [6, "deep"], [5, "plain"]], thr = (f) => { try { f(); return ""; } catch (e) { return String(e.message); } };
    ok("!! at 3 stations and scale 1 the generator IS needsTask.scenario (six samples, all four kinds' draws)", sample.every(([s, k]) => J(X.scenarioX(s, k, 3, 1)) === J(T.scenario(s, k))) && J(X.scenarioX(9, "both")) === J(T.scenario(9, "both")));
    const a = X.scenarioX(2, "both", 3, 1), b = X.scenarioX(2, "both", 3, 1.6);
    ok("!! scale 1.6 multiplies the damage of a damaged dive (0.2368 -> 0.3790) and the draws after it are the same, so the station angles and radii are unchanged while the depths follow the new collapse depth", near(b.damage0, a.damage0 * 1.6) && b.stations.every((s, i) => near(s.x, a.stations[i].x) && near(s.y, a.stations[i].y)) && near(b.frac0, a.frac0) && near(b.depth0, a.depth0));
    ok("!! the damage is capped at 0.8 (a scale of 10 gives 0.8) and the undamaged kinds stay undamaged at any scale", near(X.scenarioX(2, "both", 3, 10).damage0, 0.8) && X.scenarioX(3, "far", 3, 5).damage0 === 0 && X.scenarioX(5, "plain", 3, 5).damage0 === 0);
    ok("!! the station count is the argument: 5 stations give five, the first three of which are the three-station scenario's stations at the same damage (same draws in the same order)", X.scenarioX(2, "far", 5, 1).stations.length === 5 && X.scenarioX(2, "far", 5, 1).stations.slice(0, 3).every((s, i) => J(s) === J(X.scenarioX(2, "far", 3, 1).stations[i])));
    ok("!! bad arguments are refused with this generator's own message: an unknown kind, a station count of 0 or 2.5, a damage scale of 0 or -1", /plannerRobust\.scenarioX: unknown kind "x"/.test(thr(() => X.scenarioX(1, "x"))) && /station count must be a positive integer, got 0/.test(thr(() => X.scenarioX(1, "far", 0))) && /got 2\.5/.test(thr(() => X.scenarioX(1, "far", 2.5))) && /damage scale must be positive, got 0/.test(thr(() => X.scenarioX(1, "far", 3, 0))) && /got -1/.test(thr(() => X.scenarioX(1, "far", 3, -1))));
    const set = X.setOfCondition("DMG", "both");
    ok("!! a condition's set is 150 scenarios of one kind for its seeds, with the condition's count and damage scale (DMG: seeds 7201-7350, damage scaled); an unknown condition is refused", set.length === 150 && set[0].seed === 7201 && set[149].seed === 7350 && set.every((s) => s.kind === "both") && J(set[0]) === J(X.scenarioX(7201, "both", 3, 1.6)) && X.setOfCondition("STN5", "far")[0].stations.length === 5 && /unknown condition "ZZ"/.test(thr(() => X.setOfCondition("ZZ", "far"))));
}
sec("3. SHIFT");
{
    const p = X.paramsOf("TUNED-L12", R8), q = X.paramsOf("TWIN-L12", R8), r = X.paramsOf("TUNED-R8", R8);
    ok("!! the L12 arms move low down by exactly 0.12 and change nothing else; TUNED-R8 keeps the Round 8 constants; the Round 8 object is not changed", near(p.low, 0.26036) && near(q.low, 0.26036) && p.high === R8.high && p.alpha === R8.alpha && p.ramp === R8.ramp && p.cap === R8.cap && r.low === R8.low && R8.low === 0.38036);
}
// synthetic: 300 dives a condition per arm (150 far, 150 both)
const mkArm = (cond, off, hull = {}) => ({ score: 0.7, crashed: hull.c || 0, stranded: hull.s || 0, runs: Array.from({ length: 300 }, (_, i) => { const base = 0.6 + 0.1 * Math.sin(i + 3 * cond.length), g = off ? off(i) : 0; return { kind: i < 150 ? "far" : "both", score: base + g, fingerprint: `${cond}_${i}_${g}` }; }) });
const every = (k, v) => (i) => (i % k === 0 ? v : 0);
/** spec[cond] = { rule: off, twin: off, hr8, hl12, ht } */
const synth = (spec = {}) => Object.fromEntries(X.COND_NAMES.map((c) => { const s = spec[c] || {}; return [c, { "TUNED-R8": mkArm(c, null, s.hr8), "TUNED-L12": mkArm(c, s.rule, s.hl12), "TWIN-L12": mkArm(c, s.twinTot, s.ht) }]; }));
// twin gain is twin minus TUNED-L12: give TWIN-L12 the rule's offset plus the twin's own
const synth2 = (spec = {}) => { const au = synth(spec); for (const c of X.COND_NAMES) { const s = spec[c] || {}; au[c]["TWIN-L12"] = mkArm(c, (i) => (s.rule ? s.rule(i) : 0) + (s.twin ? s.twin(i) : 0), s.ht); } return au; };
sec("4. VERDICTS");
{
    const au = synth2({ REF: { rule: every(5, 0.1), twin: every(5, 0.1) }, DMG: { rule: every(5, -0.1), twin: every(4, 0.1) }, NOISE: { rule: (i) => (i % 2 ? 0.02 : -0.02) }, STN5: {} });
    const c = (n) => X.conditionOf(au, n);
    ok("!! the rule gain: a steady gain KEEPS (REF +0.02), a steady loss HURTS (DMG), a wobble around nothing LOSES (NOISE), no change LOSES (STN5)", c("REF").ruleVerdict === "KEEPS" && near(c("REF").rule.mean, 0.02) && c("DMG").ruleVerdict === "HURTS" && c("NOISE").ruleVerdict === "LOSES" && c("STN5").ruleVerdict === "LOSES");
    ok("!! the twin gain is TWIN-L12 minus TUNED-L12 within the condition: REF +0.02 KEEPS, DMG +0.025 KEEPS, NOISE and STN5 LOSE", c("REF").twinVerdict === "KEEPS" && near(c("REF").twin.mean, 0.02) && c("DMG").twinVerdict === "KEEPS" && near(c("DMG").twin.mean, 0.025) && c("NOISE").twinVerdict === "LOSES" && c("STN5").twinVerdict === "LOSES");
    ok("!! each reading is pooled over ITS condition only (n 300), not over all four", c("REF").rule.n === 300 && c("DMG").rule.n === 300 && c("REF").rule.better === 60 && c("DMG").rule.worse === 60);
    const hu = synth2({ DMG: { hl12: { c: 3, s: 1 }, hr8: { c: 1 }, ht: { c: 2 } } }), h = X.conditionOf(hu, "DMG").hull;
    ok("!! the hull counts are the arm's own crushed and stranded in that condition", h["TUNED-R8"].crushed === 1 && h["TUNED-L12"].crushed === 3 && h["TUNED-L12"].stranded === 1 && h["TWIN-L12"].crushed === 2 && X.conditionOf(hu, "REF").hull["TUNED-L12"].crushed === 0);
    const wob = (i, a) => (i % 2 ? a : -a), amp = 0.03, se = amp * 1.0013 / Math.sqrt(300), g = (k) => synth2({ REF: { rule: (i) => wob(i, amp) + k * se } });
    { const gt = (k) => synth2({ REF: { twin: (i) => wob(i, amp) + k * se } });
      ok("!! the twin gain's threshold is 2 se too: +1.5 se LOSES, +2.5 se KEEPS (the twin gain has no HURTS: a negative one LOSES)", X.conditionOf(gt(1.5), "REF").twinVerdict === "LOSES" && X.conditionOf(gt(2.5), "REF").twinVerdict === "KEEPS" && X.conditionOf(gt(-2.5), "REF").twinVerdict === "LOSES"); }
    ok("!! the threshold is 2 se on both sides: +1.5 se LOSES, +2.5 se KEEPS, -1.5 se LOSES, -2.5 se HURTS", X.conditionOf(g(1.5), "REF").ruleVerdict === "LOSES" && X.conditionOf(g(2.5), "REF").ruleVerdict === "KEEPS" && X.conditionOf(g(-1.5), "REF").ruleVerdict === "LOSES" && X.conditionOf(g(-2.5), "REF").ruleVerdict === "HURTS", `${(X.conditionOf(g(1.5), "REF").rule.mean / X.conditionOf(g(1.5), "REF").rule.se).toFixed(2)}`);
}
sec("5. LINES");
{
    const L = (spec) => X.bottomLines(synth2(spec)), K = { rule: every(5, 0.1), twin: every(5, 0.1) };
    ok("!! all four conditions keep: line 1 names 4 of 4 with the names in order, line 2 the same, the hull unharmed, never more crushing", J(L({ REF: K, DMG: K, NOISE: K, STN5: K })) === J(["THE -0.12 CONSTANTS KEEP THEIR GAIN IN 4 OF 4 CONDITIONS (REF, DMG, NOISE, STN5)", "THE TWIN KEEPS ITS GAIN ON THEM IN 4 OF 4 CONDITIONS (REF, DMG, NOISE, STN5)", "THE HULL IS UNHARMED AT -0.12 IN EVERY CONDITION", "-0.12 NEVER CRUSHES MORE THAN THE ROUND 8 CONSTANTS"]));
    const mixed = L({ REF: K, DMG: { rule: every(5, -0.1), twin: K.twin }, NOISE: {}, STN5: K });
    ok("!! a condition where the rule HURTS is named as hurt, one where it merely LOSES as lost, the keepers in order; the twin line counts its own keepers", mixed[0] === "THE -0.12 CONSTANTS KEEP THEIR GAIN IN 2 OF 4 CONDITIONS (REF, STN5); THEY HURT IN (DMG); THEY LOSE IT IN (NOISE)" && mixed[1] === "THE TWIN KEEPS ITS GAIN ON THEM IN 3 OF 4 CONDITIONS (REF, DMG, STN5)");
    ok("!! none keeps: the list is 'none' and the line still reads", L({})[0] === "THE -0.12 CONSTANTS KEEP THEIR GAIN IN 0 OF 4 CONDITIONS (none); THEY LOSE IT IN (REF, DMG, NOISE, STN5)" && L({})[1] === "THE TWIN KEEPS ITS GAIN ON THEM IN 0 OF 4 CONDITIONS (none)");
    const hp = L({ DMG: { hl12: { c: 2 }, ht: { s: 1 } }, NOISE: { ht: { c: 1 } } });
    ok("!! the hull line counts the TUNED-L12 and TWIN-L12 arms only, names the conditions where they paid in order, and adds crushed and stranded over them (DMG 2 + 0 crushed, 0 + 1 stranded; NOISE 1 crushed)", hp[2] === "THE HULL PAYS AT -0.12 IN DMG, NOISE: 3 CRUSHED, 1 STRANDED" && L({ REF: { hr8: { c: 5 } } })[2] === "THE HULL IS UNHARMED AT -0.12 IN EVERY CONDITION");
    ok("!! a stranded dive alone makes the hull pay (TWIN-L12, NOISE: 0 crushed, 1 stranded)", L({ NOISE: { ht: { s: 1 } } })[2] === "THE HULL PAYS AT -0.12 IN NOISE: 0 CRUSHED, 1 STRANDED" && L({ STN5: { hl12: { s: 2 } } })[2] === "THE HULL PAYS AT -0.12 IN STN5: 0 CRUSHED, 2 STRANDED");
    ok("!! line 4 compares the rule's own hull cost with the Round 8 rule's: more crushed or stranded than R8 names the condition (DMG 2 against 1); equal or fewer does not (NOISE 1 against 3)", L({ DMG: { hl12: { c: 2 }, hr8: { c: 1 } }, NOISE: { hl12: { c: 1 }, hr8: { c: 3 } } })[3] === "-0.12 CRUSHES MORE THAN THE ROUND 8 CONSTANTS IN DMG" && L({ STN5: { hl12: { s: 2 }, hr8: {} }, REF: { hl12: { c: 1 }, hr8: { c: 1 } } })[3] === "-0.12 CRUSHES MORE THAN THE ROUND 8 CONSTANTS IN STN5");
}
sec("6. CHECKS");
{
    const names = (au) => X.checksOf(au).filter((c) => !c.ok).map((c) => c.name), good = () => synth2({ REF: { rule: every(5, 0.1) } });
    ok("!! four check rows on a clean audit: GENERATOR, DAMAGE SCALE, SIZES, KINDS ALIGNED; all pass", J(X.checksOf(good()).map((c) => c.name)) === J(["GENERATOR", "DAMAGE SCALE", "SIZES", "KINDS ALIGNED"]) && names(good()).length === 0);
    const sz = good(); sz.DMG["TWIN-L12"].runs.pop();
    ok("!! an arm of 299 dives in a condition breaks SIZES (and the alignment of that arm)", names(sz).includes("SIZES"));
    const k = good(); k.NOISE["TUNED-L12"].runs[5].kind = "both";
    ok("!! a dive of another kind than TUNED-R8's within a condition breaks KINDS ALIGNED only", J(names(k)) === J(["KINDS ALIGNED"]));
}
sec("7. REPORT");
{
    const au = synth2({ REF: { rule: every(5, 0.1), twin: every(5, 0.1) }, DMG: { hl12: { c: 2 }, hr8: { c: 1 } } }), L = X.report(au), txt = L.join("\n");
    ok("!! the head names the four conditions with their seeds and 300 dives per arm; the four checks pass first", /^ROUND 31: .*REF 7001-7150, DMG 7201-7350, NOISE 7401-7550, STN5 7601-7750 \(far and both, 300 dives per arm and condition; read once\)$/.test(L[0]) && L.slice(1, 5).every((l) => /^  PASS /.test(l)));
    ok("!! one block per condition with its stations, damage scale and gauge sd, the rule gain with verdict and counts, the twin gain, and the crushed/stranded of the three arms", /REF \(3 stations, damage x1, gauge sd 0\.1\): means R8 /.test(txt) && /DMG \(3 stations, damage x1\.6, gauge sd 0\.1\)/.test(txt) && /NOISE \(3 stations, damage x1, gauge sd 0\.3\)/.test(txt) && /STN5 \(5 stations, damage x1, gauge sd 0\.1\)/.test(txt) && /rule gain \(L12 minus R8\) \+0\.0200 \(se [0-9.]+; better 60, worse 0, same 240\)  KEEPS/.test(txt) && /twin gain \(twin L12 minus L12\) \+0\.0200/.test(txt) && /crushed\/stranded: TUNED-R8 1\/0, TUNED-L12 2\/0, TWIN-L12 0\/0/.test(txt));
    ok("!! the four bottom lines come last, each prefixed BOTTOM LINE:", L.slice(-4).every((l) => l.startsWith("BOTTOM LINE: ")) && /KEEP THEIR GAIN/.test(L[L.length - 4]) && /THE TWIN KEEPS/.test(L[L.length - 3]) && /HULL/.test(L[L.length - 2]) && /CRUSHES/.test(L[L.length - 1]));
    const bad = synth2({}); bad.REF["TUNED-R8"].runs.pop(); const Lb = X.report(bad);
    ok("!! a failed check puts FAIL on its row, says the verdicts are NOT WEIGHED and puts that on a single bottom line", Lb.some((l) => /^  FAIL SIZES/.test(l)) && Lb.includes("A CHECK FAILED: the verdicts below are NOT WEIGHED.") && Lb[Lb.length - 1] === "BOTTOM LINE: NOT WEIGHED (a check failed)" && Lb.filter((l) => l.startsWith("BOTTOM LINE")).length === 1);
}
sec("8. FLIGHT");
{
    X.setFlight({ seconds: 100 });
    const rng = (c) => X.CONDITIONS[c].seeds, fly = (a, c) => X.flyArm(a, R8, T.setOf(["far"], 1344, 1345), X.CONDITIONS[c].sd);
    const tu = fly("TUNED-R8", "REF"), direct = T.evaluate(T.flyDecision(U.tunedSeat(R8, U.WIDE_BOUNDS)), T.setOf(["far"], 1344, 1345), { gauge: T.GAUGE, seconds: 100 });
    ok("!! TUNED-R8 at the reference noise is T.evaluate's tuned dive with the noisy gauge, dive for dive; the gauge noise of the condition reaches the flight (sd 0.3 changes a dive)", tu.runs.every((r, i) => r.fingerprint === direct.runs[i].fingerprint) && fly("TUNED-R8", "NOISE").runs.some((r, i) => r.fingerprint !== tu.runs[i].fingerprint));
    X.setFlight({ seconds: 200 });
    const t2 = T.setOf(["far", "both"], 1344, 1346), at200 = (arm) => X.flyArm(arm, R8, t2, 0.1), l12 = at200("TUNED-L12"), r8 = at200("TUNED-R8");
    const shifted = T.evaluate(T.flyDecision(U.tunedSeat({ ...R8, low: R8.low - 0.12 }, U.WIDE_BOUNDS)), t2, { gauge: T.GAUGE, seconds: 200 });
    ok("!! TUNED-L12 is the rule with low - 0.12 handed to the seat, dive for dive, and differs from TUNED-R8 (200-second dives reach the trip point)", l12.runs.every((r, i) => r.fingerprint === shifted.runs[i].fingerprint) && l12.runs.some((r, i) => r.fingerprint !== r8.runs[i].fingerprint));
    const tw = at200("TWIN-L12"), twDirect = T.evaluate(T.flyDecision(Q.perturbedSeat({ ...R8, low: R8.low - 0.12 }, {}, { seconds: 200 })), t2, { gauge: T.GAUGE, seconds: 200 });
    ok("!! TWIN-L12 is the perturbed twin on low - 0.12 planning the flight's seconds, dive for dive, and is another pilot than the bare rule on at least one dive", tw.runs.every((r, i) => r.fingerprint === twDirect.runs[i].fingerprint) && tw.runs.some((r, i) => r.fingerprint !== l12.runs[i].fingerprint));
    X.setFlight({ seconds: 100 });
    const ch = X.flyChunk("TUNED-R8", R8, "REF", "far"), chD = X.flyChunk("TUNED-R8", R8, "DMG", "far");
    ok("!! a chunk is one kind of one condition: 150 dives of the condition's seeds in order (REF far 7001-7150), and DMG flies other dives than REF (the damage reaches the flight: a far dive is undamaged by kind, so the seeds differ)", ch.runs.length === 150 && ch.runs.every((r) => r.kind === "far") && chD.runs.length === 150 && ch.runs[0].fingerprint !== chD.runs[0].fingerprint);
    { const nz = X.flyChunk("TUNED-R8", R8, "NOISE", "far"), set = X.setOfCondition("NOISE", "far"), at3 = X.flyArm("TUNED-R8", R8, set, 0.3), at1 = X.flyArm("TUNED-R8", R8, set, 0.1);
      ok("!! a chunk flies its condition's own gauge noise: NOISE far equals the sd 0.3 flight of its seeds dive for dive and differs from the sd 0.1 flight", nz.runs.length === 150 && nz.runs.every((r, i) => r.fingerprint === at3.runs[i].fingerprint) && nz.runs.some((r, i) => r.fingerprint !== at1.runs[i].fingerprint)); }
    const dmgBoth = X.flyChunk("TUNED-R8", R8, "DMG", "both"), refBoth = X.flyChunk("TUNED-R8", R8, "REF", "both");
    ok("!! the merged halves of a condition are the condition: far then both, 300 dives, kind-major", (() => { const m = X.mergeKinds([ch, refBoth]); return m.runs.length === 300 && m.runs[0].kind === "far" && m.runs[299].kind === "both" && dmgBoth.runs.length === 150; })());
    X.setFlight({});
    const msg = (f) => { try { f(); return ""; } catch (e) { return String(e.message); } };
    ok("!! an unknown arm and an unknown condition are each refused with this library's message before flying", /plannerRobust\.flyArm: unknown arm "TWIN-R8"/.test(msg(() => X.flyArm("TWIN-R8", R8, [], 0.1))) && /plannerRobust\.flyChunk: unknown condition "ZZ" \(REF, DMG, NOISE, STN5\)/.test(msg(() => X.flyChunk("TUNED-R8", R8, "ZZ", "far"))));
    ok("!! assemble keys conditions then arms", J(Object.keys(X.assemble({ A: { REF: 1, DMG: 2, NOISE: 3, STN5: 4 }, B: { REF: 5, DMG: 6, NOISE: 7, STN5: 8 } }).NOISE)) === J(["A", "B"]) && X.assemble({ A: { REF: 1, DMG: 2, NOISE: 3, STN5: 4 } }).STN5.A === 4);
}
sec("9. SOURCE");
{
    ok("!! the seeds 7001, 7150, 7201, 7350, 7401, 7550, 7601 and 7750 appear once each, in CONDITIONS", ["7001", "7150", "7201", "7350", "7401", "7550", "7601", "7750"].every((s) => code.split(s).length === 2));
    ok("!! the file reads no clock, no random number and nothing from the disk", !/Date\.now|Math\.random|performance\.now|readFileSync|writeFileSync/.test(code));
}
console.log(fails ? `\n${fails} FAIL` : "\nall checks pass");
finished = true;
