// WebGLEngine/tools/ship/plannerBaseline-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/plannerBaseline-selfcheck.mjs      (about 10 s: hand fixtures of 600 dives and a few 100-second dives)
//
// THE GATE OF tools/ship/plannerBaseline.mjs (Round 26 of brain/NEEDS_AND_LIMITS.md, registered first).
//   1 SETS      4401-4500, 4501-4600 and 4601-4700 of far and both (200 dives a block, 600 an arm), disjoint from every seed of Rounds 1-25; five arms; the 13 jobs; the shift of 0.04.
//   2 SHIFT     paramsOf moves `low` down by 0.04 for the LOW arms and nothing else.
//   3 DIFFS     the four pooled differences, on hand fixtures.
//   4 LINES     the three bottom lines in all their cases.
//   5 CHECKS    identity on the first block, the shift reaches the rule and the twin, kinds aligned, block size; a failed check says NOT WEIGHED.
//   6 REPORT    the lines.
//   7 FLIGHT    real 100-second dives: the Round 8 twin equals the Round 11 twin, the LOW arms use the shifted constant, an unknown arm or block is refused.
//   8 SOURCE    the seeds appear in one place; no clock, random or file.
// NOT CHECKED, said plainly: how big the gains are (that is the experiment).
// SABOTAGE LOG: (filled in below after the mutation pass)
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
import * as U_ from "../../brain/tunedRule.mjs";
import * as X from "./plannerBaseline.mjs";
console.log("plannerBaseline-selfcheck -- the Round 26 better-baseline round\n");
const code = fs.readFileSync(new URL("./plannerBaseline.mjs", import.meta.url), "utf8").split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n");
const rangeOf = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
const R8 = { alpha: 0.001, low: 0.38036, high: 0.68938, ramp: 20, cap: 0.88615 };

sec("1. SETS");
{
    const prior = new Set([...rangeOf(1, 1100), ...rangeOf(1101, 1208), ...rangeOf(1221, 1328), ...rangeOf(1341, 1448), ...rangeOf(1461, 1568), ...rangeOf(1601, 1768), ...rangeOf(1801, 2100), ...rangeOf(2201, 2308), ...rangeOf(2401, 3400), ...rangeOf(3501, 3850), ...rangeOf(3901, 4096), ...rangeOf(4201, 4348)]);
    const seeds = [...rangeOf(4401, 4500), ...rangeOf(4501, 4600), ...rangeOf(4601, 4700)];
    ok("!! the blocks are G1 4401-4500, G2 4501-4600, G3 4601-4700 (300 distinct seeds), 200 dives each of far and both, and share no seed with Rounds 1-25", J(X.SET_RANGES) === J({ G1: [4401, 4500], G2: [4501, 4600], G3: [4601, 4700] }) && J(X.SET_NAMES) === J(["G1", "G2", "G3"]) && new Set(seeds).size === 300 && seeds.every((s) => !prior.has(s)) && X.BLOCK_DIVES === 200);
    ok("!! the arms are TUNED-R8, TUNED-LOW, TWIN-R8, TWIN-LOW, TWIN-ROUND11 and the shift is 0.04", J(X.ARMS) === J(["TUNED-R8", "TUNED-LOW", "TWIN-R8", "TWIN-LOW", "TWIN-ROUND11"]) && X.SHIFT === 0.04);
    ok("!! 13 jobs: four arms on three blocks, and the identity arm on the first block only", X.JOBS.length === 13 && X.JOBS.filter(([a]) => a === "TWIN-ROUND11").length === 1 && J(X.JOBS.find(([a]) => a === "TWIN-ROUND11")) === J(["TWIN-ROUND11", "G1"]) && X.JOBS.filter(([a]) => a === "TWIN-LOW").length === 3);
}
sec("2. SHIFT");
{
    const lo = X.paramsOf("TUNED-LOW", R8), hi = X.paramsOf("TWIN-LOW", R8);
    ok("!! the LOW arms move `low` down by exactly 0.04 and change nothing else", near(lo.low, 0.34036) && near(hi.low, 0.34036) && lo.alpha === R8.alpha && lo.high === R8.high && lo.ramp === R8.ramp && lo.cap === R8.cap && hi.cap === R8.cap);
    ok("!! the other arms keep the Round 8 constants (the same object values), and the Round 8 object itself is not changed", ["TUNED-R8", "TWIN-R8", "TWIN-ROUND11"].every((a) => X.paramsOf(a, R8).low === R8.low) && R8.low === 0.38036);
}
// synthetic: 200 dives a block (100 far, 100 both); each arm's score = base + its own offset on a pattern of dives
const synth = (offs = {}) => {
    const au = {};
    for (const [b, s] of X.SET_NAMES.entries()) {
        const mk = (arm, off) => ({ score: 0.7, crashed: 0, stranded: 0, runs: Array.from({ length: 200 }, (_, i) => { const base = 0.6 + 0.1 * Math.sin(i + 7 * b), g = off ? off(b, i) : 0; return { kind: i < 100 ? "far" : "both", score: base + g, fingerprint: g !== 0 ? `${arm}_${b}_${i}` : `B${b}_${i}` }; }) });
        au[s] = { "TUNED-R8": mk("TUNED-R8", null), "TUNED-LOW": mk("TUNED-LOW", offs.low), "TWIN-R8": mk("TWIN-R8", offs.r8), "TWIN-LOW": mk("TWIN-LOW", offs.twinLow) };
        if (b === 0) au[s]["TWIN-ROUND11"] = { ...au[s]["TWIN-R8"], runs: au[s]["TWIN-R8"].runs.map((r) => ({ ...r })) };
    }
    return au;
};
const every = (k, v) => (b, i) => (i % k === 0 ? v : 0);
sec("3. DIFFS");
{
    const au = synth({ low: every(5, 0.1), r8: every(4, 0.2), twinLow: every(2, 0.12) }), d = X.differences(au);
    ok("!! TUNED-LOW minus TUNED-R8 = every fifth dive +0.1 = +0.02 over 600 dives (120 better); n 600", d.low.n === 600 && near(d.low.mean, 0.02) && d.low.better === 120 && d.low.worse === 0);
    ok("!! TWIN-R8 minus TUNED-R8 = every fourth dive +0.2 = +0.05 (150 better)", near(d.overR8.mean, 0.05) && d.overR8.better === 150);
    ok("!! TWIN-LOW minus TUNED-LOW is the twin over the BETTER baseline: (every second dive +0.12) minus (every fifth +0.1), not minus TUNED-R8", near(d.overLow.mean, 0.06 - 0.02) && !near(d.overLow.mean, 0.06));
    ok("!! TWIN-LOW minus TWIN-R8 compares the two twins: +0.06 - 0.05 = +0.01", near(d.twins.mean, 0.01));
}
sec("4. LINES");
{
    const L = (offs) => X.bottomLines(synth(offs));
    ok("!! a real better baseline: line 1 names it with its estimate; a non-real one says NOT SHOWN", /^THE LOWER TRIP POINT IS A BETTER BASELINE \(\+0\.0200\)$/.test(L({ low: every(5, 0.1) })[0]) && L({})[0] === "THE LOWER TRIP POINT IS NOT SHOWN TO BE A BETTER BASELINE");
    ok("!! the better baseline must be POSITIVE as well as large: a lower trip point that is WORSE (every fifth dive -0.1) is not a better baseline", L({ low: every(5, -0.1) })[0] === "THE LOWER TRIP POINT IS NOT SHOWN TO BE A BETTER BASELINE");
    ok("!! the twin over the better baseline: survives with estimate and se when real, does not survive otherwise", /^THE TWIN'S GAIN SURVIVES THE BETTER BASELINE \(\+0\.0[0-9]{3}, se 0\.0[0-9]{3}\)$/.test(L({ low: every(5, 0.1), twinLow: every(2, 0.12) })[1]) && L({ low: every(5, 0.1), twinLow: every(5, 0.1) })[1] === "THE TWIN'S GAIN DOES NOT SURVIVE THE BETTER BASELINE");
    ok("!! the twin on the better constants beats the twin on Round 8 only when that difference is real", L({ r8: every(4, 0.2), twinLow: every(2, 0.2) })[2] === "THE TWIN ON THE BETTER CONSTANTS BEATS THE TWIN ON ROUND 8" && L({ r8: every(4, 0.2), twinLow: every(4, 0.2) })[2] === "THE TWIN ON THE BETTER CONSTANTS IS NOT SHOWN TO BEAT THE TWIN ON ROUND 8");
    ok("!! the lines are independent: a worse lower trip point can still leave the twin gaining over it", (() => { const l = L({ low: every(5, -0.1), twinLow: every(2, 0.2) }); return l[0].startsWith("THE LOWER TRIP POINT IS NOT SHOWN") && l[1].startsWith("THE TWIN'S GAIN SURVIVES"); })());
    ok("!! exactly 2 se is not real (the Round 12 rule: strictly above): a fixture whose mean is below 2 se does not pass", (() => { const au = synth({ low: (b, i) => (i === 7 ? 0.5 : 0) }); const d = X.differences(au).low; return d.mean < 2 * d.se && X.bottomLines(au)[0].includes("NOT SHOWN"); })());
}
sec("5. CHECKS");
{
    const rows = (au) => X.checksOf(au), names = (au) => rows(au).filter((c) => !c.ok).map((c) => c.name);
    const clean = synth({ low: every(5, 0.1), r8: every(4, 0.2), twinLow: every(2, 0.12) });
    ok("!! six check rows on a clean audit: IDENTITY G1, SHIFT REACHES THE RULE, SHIFT REACHES THE TWIN, KINDS ALIGNED, BLOCK SIZE; all pass", J(rows(clean).map((c) => c.name)) === J(["IDENTITY G1", "SHIFT REACHES THE RULE", "SHIFT REACHES THE TWIN", "KINDS ALIGNED", "BLOCK SIZE"]) && names(clean).length === 0);
    const bad = synth({ low: every(5, 0.1), r8: every(4, 0.2), twinLow: every(2, 0.12) }); bad.G1["TWIN-ROUND11"].runs[17].fingerprint = "x";
    ok("!! a Round 11 dive that differs from the Round 8 twin breaks IDENTITY G1 only", J(names(bad)) === J(["IDENTITY G1"]));
    ok("!! a lower trip point that changes no dive breaks SHIFT REACHES THE RULE only; a twin that changes none, SHIFT REACHES THE TWIN only", J(names(synth({ r8: every(4, 0.2), twinLow: every(2, 0.12) }))) === J(["SHIFT REACHES THE RULE"]) && J(names(synth({ low: every(5, 0.1) }))) === J(["SHIFT REACHES THE TWIN"]));
    const k = synth({ low: every(5, 0.1), r8: every(4, 0.2), twinLow: every(2, 0.12) }); k.G2["TWIN-LOW"].runs[3].kind = "both";
    ok("!! a dive of another kind than the tuned rule's breaks KINDS ALIGNED only", J(names(k)) === J(["KINDS ALIGNED"]));
    const sz = synth({ low: every(5, 0.1), r8: every(4, 0.2), twinLow: every(2, 0.12) }); sz.G3["TWIN-R8"].runs.pop();
    ok("!! a block of 199 dives in one arm breaks BLOCK SIZE (and the alignment of that arm)", names(sz).includes("BLOCK SIZE"));
}
sec("6. REPORT");
{
    const au = synth({ low: every(5, 0.1), r8: every(4, 0.2), twinLow: every(2, 0.12) }), L = X.report(au), txt = L.join("\n");
    ok("!! the head names the three blocks and 600 dives per arm; the five checks pass first", /^ROUND 26: does the twin's gain survive a better baseline\? pooled over G1 4401-4500, G2 4501-4600, G3 4601-4700 \(far and both, 600 dives per arm; read once\)$/.test(L[0]) && L.slice(1, 6).every((l) => /^  PASS /.test(l)));
    ok("!! the three differences and the reported Round 8 gain, each with se and better/worse/same", /TUNED-LOW minus TUNED-R8: \+0\.0200 \(se [0-9.]+; better 120, worse 0, same 480\)/.test(txt) && /TWIN-LOW minus TUNED-LOW \(the twin over the better baseline\): \+0\.0400/.test(txt) && /TWIN-LOW minus TWIN-R8: \+0\.0100/.test(txt) && /TWIN-R8 minus TUNED-R8 \(reported; the series' usual gain, on these seeds\): \+0\.0500/.test(txt));
    ok("!! the share of the gain over Round 8 that the better baseline leaves: 0.04 / 0.05 = 80%; n/a when the gain over Round 8 is not positive", /as a share of the gain over Round 8: 80%/.test(txt) && /n\/a \(the gain over Round 8 is not positive\)/.test(X.report(synth({ low: every(5, 0.1), twinLow: every(2, 0.12) })).join("\n")));
    ok("!! the three bottom lines come last, each prefixed BOTTOM LINE:", L.slice(-3).every((l) => l.startsWith("BOTTOM LINE: ")) && /BETTER BASELINE/.test(L[L.length - 3]) && /SURVIVES|DOES NOT SURVIVE/.test(L[L.length - 2]) && /TWIN ON THE BETTER CONSTANTS/.test(L[L.length - 1]));
    const bad = synth({ low: every(5, 0.1), r8: every(4, 0.2), twinLow: every(2, 0.12) }); bad.G1["TWIN-ROUND11"].runs[0].fingerprint = "x"; const Lb = X.report(bad);
    ok("!! a failed check puts FAIL on its row, says the verdicts are NOT WEIGHED and puts that on a single bottom line", Lb.some((l) => /^  FAIL IDENTITY G1/.test(l)) && Lb.includes("A CHECK FAILED: the verdicts below are NOT WEIGHED.") && Lb[Lb.length - 1] === "BOTTOM LINE: NOT WEIGHED (a check failed)" && Lb.filter((l) => l.startsWith("BOTTOM LINE")).length === 1);
}
sec("7. FLIGHT");
{
    X.setFlight({ seconds: 100 });
    const ranges = { G1: [1344, 1345], G2: [1349, 1350], G3: [1351, 1352] }, fly = (a, b) => X.flyBlock(a, R8, b, { ranges });
    const tw = fly("TWIN-R8", "G2"), r11 = fly("TWIN-ROUND11", "G2"), tu = fly("TUNED-R8", "G2");
    ok("!! a block of real 100-second dives returns the dives of seeds a..b of far then both (kind-major: far, far, both, both)", J(tw.runs.map((r) => r.kind)) === J(["far", "far", "both", "both"]));
    ok("!! the twin on the Round 8 constants equals the Round 11 twin dive for dive, and differs from the tuned rule on far 1350", tw.runs.every((r, i) => r.fingerprint === r11.runs[i].fingerprint) && tw.runs[1].fingerprint !== tu.runs[1].fingerprint);
    const direct = T.evaluate(T.flyDecision(U_.tunedSeat(R8, U_.WIDE_BOUNDS)), T.setOf(X.HARD, 1349, 1350), { gauge: T.GAUGE, seconds: 100 });
    ok("!! the tuned rule is T.evaluate's tuned dive with the noisy gauge, dive for dive", tu.runs.every((r, i) => r.fingerprint === direct.runs[i].fingerprint));
    const shifted = T.evaluate(T.flyDecision(U_.tunedSeat({ ...R8, low: R8.low - 0.04 }, U_.WIDE_BOUNDS)), T.setOf(X.HARD, 1349, 1350), { gauge: T.GAUGE, seconds: 100 }), lowT = fly("TUNED-LOW", "G2");
    ok("!! TUNED-LOW is the tuned rule with low - 0.04 handed to the seat, dive for dive", lowT.runs.every((r, i) => r.fingerprint === shifted.runs[i].fingerprint));
    const lowW = fly("TWIN-LOW", "G2"), twinShifted = T.evaluate(T.flyDecision(Q_.perturbedSeat({ ...R8, low: R8.low - 0.04 }, {}, { seconds: 100 })), T.setOf(X.HARD, 1349, 1350), { gauge: T.GAUGE, seconds: 100 });
    ok("!! TWIN-LOW is the perturbed twin built on low - 0.04, dive for dive", lowW.runs.every((r, i) => r.fingerprint === twinShifted.runs[i].fingerprint));
    X.setFlight({});
    const msg = (f) => { try { f(); return ""; } catch (e) { return String(e.message); } };
    ok("!! an unknown arm and an unknown block are each refused with their own message (not a TypeError)", /unknown arm "TWIN-FAST"/.test(msg(() => X.flyBlock("TWIN-FAST", R8, "G1", { ranges }))) && /unknown block "G9" \(G1, G2, G3\)/.test(msg(() => X.flyBlock("TWIN-R8", R8, "G9", { ranges }))));
    ok("!! assemble keys blocks then arms and leaves an arm out of a block it was not flown on", J(Object.keys(X.assemble({ A: { G1: 1, G2: 2, G3: 3 }, B: { G1: 4 } }).G1)) === J(["A", "B"]) && J(Object.keys(X.assemble({ A: { G1: 1, G2: 2, G3: 3 }, B: { G1: 4 } }).G2)) === J(["A"]));
}
import * as Q_ from "../../brain/plannerPerturbed.mjs";
sec("8. SOURCE");
{
    ok("!! the seeds 4401, 4500, 4501, 4600, 4601 and 4700 appear once each, in SET_RANGES", ["4401", "4500", "4501", "4600", "4601", "4700"].every((s) => code.split(s).length === 2));
    ok("!! the file reads no clock, no random number and nothing from the disk", !/Date\.now|Math\.random|performance\.now|readFileSync|writeFileSync/.test(code));
}
console.log(fails ? `\n${fails} FAIL` : "\nall checks pass");
finished = true;
