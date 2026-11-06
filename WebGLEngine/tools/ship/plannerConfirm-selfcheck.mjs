// WebGLEngine/tools/ship/plannerConfirm-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/plannerConfirm-selfcheck.mjs      (about 4 s: hand fixtures of 2,000 dives and a few 100-second dives)
//
// THE GATE OF tools/ship/plannerConfirm.mjs (Round 22 of brain/NEEDS_AND_LIMITS.md, registered first).
//   1 SETS      2401-2650, 2651-2900, 2901-3150 and 3151-3400 of far and both (500 dives a block, 2,000 an arm), disjoint from every seed of Rounds 1-21; three arms; the one-point floor.
//   2 GAIN      the pooled gain, by kind and by block, the block estimates for the heterogeneity test, the share of dives on which the twin differs and the gain where it does.
//   3 LINES     the three bottom lines in all their cases (confirmed or not, above one point or not, blocks agree or not).
//   4 CHECKS    identity on every block, kinds aligned, block size; a failed check says NOT WEIGHED.
//   5 REPORT    the lines.
//   6 FLIGHT    real 100-second dives: the full twin equals the Round 11 twin, an unknown arm or block is refused.
//   7 SOURCE    the seeds appear in one place; no clock, random or file.
// NOT CHECKED, said plainly: how big the gain is (that is the experiment).
// SABOTAGE LOG (47 mutants of tools/ship/plannerConfirm.mjs, run against a copy of this gate; the harness counts a mutant that fails to load as RED): 6 went 0 red on the first pass; 4 got rows -- the unknown-block message (not a TypeError), the pooled gain reading the FULL twin (the synthetic Round 11 arm now carries other scores), the p level of the block test (C4 at 0.165, p about 0.29, agrees) and the kinds-aligned check also catching a length mismatch. One mutant did not load (a syntax error from my replacement) and is RED by the harness's rule; ONE is EQUIVALENT and said so: the one-point test's > against >= at exactly 0.01 (a float boundary). All 47 are red or said above.
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
import * as X from "./plannerConfirm.mjs";
console.log("plannerConfirm-selfcheck -- the Round 22 confirmatory run\n");
const code = fs.readFileSync(new URL("./plannerConfirm.mjs", import.meta.url), "utf8").split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n");
const rangeOf = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
const R8 = { alpha: 0.001, low: 0.38036, high: 0.68938, ramp: 20, cap: 0.88615 };

sec("1. SETS");
{
    const prior = new Set([...rangeOf(1, 20), ...rangeOf(21, 32), ...rangeOf(51, 62), ...rangeOf(71, 82), ...rangeOf(91, 102), ...rangeOf(111, 162), ...rangeOf(171, 222), ...rangeOf(241, 252), ...rangeOf(271, 294), ...rangeOf(301, 312), ...rangeOf(321, 332), ...rangeOf(341, 352), ...rangeOf(421, 432), ...rangeOf(441, 452), ...rangeOf(461, 472), ...rangeOf(481, 492), ...rangeOf(501, 508), ...rangeOf(521, 532), ...rangeOf(541, 552), ...rangeOf(561, 572), ...rangeOf(581, 592), ...rangeOf(601, 612), ...rangeOf(641, 664), ...rangeOf(681, 704), ...rangeOf(721, 744), ...rangeOf(761, 784), ...rangeOf(801, 824), ...rangeOf(841, 864), ...rangeOf(881, 928), ...rangeOf(941, 988), ...rangeOf(1001, 1048), ...rangeOf(1101, 1148), ...rangeOf(1161, 1208), ...rangeOf(1221, 1268), ...rangeOf(1281, 1328), ...rangeOf(1341, 1388), ...rangeOf(1401, 1448), ...rangeOf(1461, 1508), ...rangeOf(1521, 1568), ...rangeOf(1601, 1648), ...rangeOf(1661, 1708), ...rangeOf(1721, 1768), ...rangeOf(1801, 2100), ...rangeOf(2201, 2248), ...rangeOf(2261, 2308)]);
    const seeds = [...rangeOf(2401, 2650), ...rangeOf(2651, 2900), ...rangeOf(2901, 3150), ...rangeOf(3151, 3400)];
    ok("!! the blocks are C1 2401-2650, C2 2651-2900, C3 2901-3150, C4 3151-3400 (1,000 distinct seeds), 500 dives each of far and both, and share no seed with Rounds 1-21", J(X.SET_RANGES) === J({ C1: [2401, 2650], C2: [2651, 2900], C3: [2901, 3150], C4: [3151, 3400] }) && J(X.SET_NAMES) === J(["C1", "C2", "C3", "C4"]) && seeds.every((s) => !prior.has(s)) && new Set(seeds).size === 1000 && Object.values(X.SET_RANGES).every(([a, b]) => T.setOf(X.HARD, a, b).length === 500) && X.BLOCK_DIVES === 500 && J(X.HARD) === J(["far", "both"]));
    ok("!! the arms are TUNED-R8, TWIN-ROUND11, TWIN-FULL and the floor is 0.01", J(X.ARMS) === J(["TUNED-R8", "TWIN-ROUND11", "TWIN-FULL"]) && X.FLOOR === 0.01);
}
// synthetic: 500 dives a block (250 far, 250 both); the tuned score varies, the twin adds `gain(block, i)` on dives where it differs
const synth = (gain = () => 0, { crashed = 0 } = {}) => {
    const au = {};
    for (const [b, s] of X.SET_NAMES.entries()) {
        const mk = (twin) => ({ runs: Array.from({ length: 500 }, (_, i) => { const base = 0.6 + 0.1 * Math.sin(i + 7 * b), g = twin ? gain(b, i) : 0; return { kind: i < 250 ? "far" : "both", score: base + g, fingerprint: g !== 0 ? "W" + b + "_" + i : "T" + b + "_" + i }; }), score: 0.6, crashed: twin ? crashed : 0, stranded: 0 });
        const full = mk(true); full.runs.forEach((r, i) => { if (!r.fingerprint.startsWith("W")) r.fingerprint = "T" + b + "_" + i; });
        const tuned = mk(false);
        au[s] = { "TUNED-R8": tuned, "TWIN-FULL": full, "TWIN-ROUND11": { ...full, runs: full.runs.map((r, i) => ({ ...r, score: tuned.runs[i].score + (i % 2 ? 0.3 : 0) })) } };
    }
    return au;
};
const strong = (b, i) => (i % 5 === 0 ? 0.2 : 0), weak = (b, i) => (i % 20 === 0 ? 0.1 : 0), none = () => 0, split = (b, i) => (b < 3 && i % 5 === 0 ? 0.2 : 0);
sec("2. GAIN");
{
    const au = synth(strong), g = X.gainOver(au);
    ok("!! every fifth dive +0.2 over 2,000 dives: n 2000, the pooled mean exactly 0.04, 400 better, 1600 the same, none worse", g.n === 2000 && near(g.mean, 0.04) && g.better === 400 && g.same === 1600 && g.worse === 0);
    ok("!! the standard error is the paired one (n - 1): sqrt(var / 2000) with var = 0.2 x 0.8 x 0.2 x 0.2 x 2000 / 1999 = 0.0064", near(g.se, Math.sqrt(0.2 * 0.8 * 0.2 * 0.2 * 2000 / 1999 / 2000), 1e-9));
    ok("!! by kind: far is dives 0..249 of each block (i % 5 === 0 gives 50 of 250: +0.04), both the same; each kind has n 1000", X.gainOver(au, { kind: "far" }).n === 1000 && near(X.gainOver(au, { kind: "far" }).mean, 0.04) && near(X.gainOver(au, { kind: "both" }).mean, 0.04));
    const lop = synth((b, i) => (i < 250 && i % 5 === 0 ? 0.2 : 0));
    ok("!! a gain on far only (every fifth far dive +0.2) is +0.04 on far, 0 on both and +0.02 pooled", near(X.gainOver(lop, { kind: "far" }).mean, 0.04) && X.gainOver(lop, { kind: "both" }).mean === 0 && near(X.gainOver(lop).mean, 0.02));
    ok("!! by block: the block estimate has n 500, the name and the block's own mean; one block alone is gainOver with sets [block]", J(X.blockEstimates(au).map((b) => [b.name, b.n])) === J([["C1", 500], ["C2", 500], ["C3", 500], ["C4", 500]]) && X.blockEstimates(synth(split))[3].mean === 0 && near(X.blockEstimates(synth(split))[0].mean, 0.04));
    const d = X.differing(au);
    ok("!! the twin differs on 400 of 2,000 dives (20%), by +0.2 on average where it differs; with no gain it differs on none and the mean gain where it differs is 0", d.n === 2000 && d.differ === 400 && near(d.share, 0.2) && near(d.meanGainWhereDiffer, 0.2) && X.differing(synth(none)).differ === 0 && X.differing(synth(none)).meanGainWhereDiffer === 0);
}
sec("3. LINES");
{
    const L = (gain) => X.bottomLines(synth(gain));
    ok("!! a strong gain: CONFIRMED with its estimate, se and dive count; EXCEEDS ONE POINT; the blocks AGREE", /^THE TWIN'S GAIN IS CONFIRMED AT \+0\.0400 \(se 0\.0018; 2000 DIVES\)$/.test(L(strong)[0]) && L(strong)[1] === "THE GAIN EXCEEDS ONE POINT OF THE SCORE" && L(strong)[2] === "THE FOUR BLOCKS AGREE");
    ok("!! a weak but real gain (+0.005): CONFIRMED, but NOT SHOWN TO EXCEED ONE POINT", /CONFIRMED AT \+0\.0050/.test(L(weak)[0]) && L(weak)[1] === "THE GAIN IS NOT SHOWN TO EXCEED ONE POINT OF THE SCORE");
    ok("!! no gain: NOT CONFIRMED with the estimate printed, and not above one point; the blocks (all alike at 0) agree", /^THE TWIN'S GAIN IS NOT CONFIRMED \(\+0\.0000, se 0\.0000\)$/.test(L(none)[0]) && L(none)[1] === "THE GAIN IS NOT SHOWN TO EXCEED ONE POINT OF THE SCORE");
    ok("!! blocks that differ (the gain in three blocks, none in the fourth) DISAGREE BEYOND CHANCE while the pooled gain is still CONFIRMED", L(split)[2] === "THE FOUR BLOCKS DISAGREE BEYOND CHANCE" && /CONFIRMED AT \+0\.03/.test(L(split)[0]));
    const mild = (c4) => X.bottomLines(synth((b, i) => (i % 5 === 0 ? (b === 3 ? c4 : 0.2) : 0)))[2];
    ok("!! the blocks AGREE unless Cochran's p is below 0.05: block C4 at 0.165 against 0.2 elsewhere (p about 0.29, above 0.05 but below 0.5) agrees; at 0.12 (p well below) it does not", mild(0.165) === "THE FOUR BLOCKS AGREE" && mild(0.12) === "THE FOUR BLOCKS DISAGREE BEYOND CHANCE");
    const edge = (g) => X.bottomLines(synth((b, i) => (i % 100 === 0 ? g : 0)));
    ok("!! the one-point test is on the LOWER bound: a mean of 0.012 (se 0.0027, lower bound 0.0067) is not shown, a mean of 0.02 (se 0.0045, lower bound 0.011) exceeds", edge(1.2)[1] === "THE GAIN IS NOT SHOWN TO EXCEED ONE POINT OF THE SCORE" && edge(2.0)[1] === "THE GAIN EXCEEDS ONE POINT OF THE SCORE");
}
sec("4. CHECKS");
{
    const rows = (au) => X.checksOf(au);
    ok("!! six check rows on a clean audit: IDENTITY for each of four blocks, KINDS ALIGNED, BLOCK SIZE; all pass", J(rows(synth(strong)).map((c) => c.name)) === J(["IDENTITY C1", "IDENTITY C2", "IDENTITY C3", "IDENTITY C4", "KINDS ALIGNED", "BLOCK SIZE"]) && rows(synth(strong)).every((c) => c.ok));
    const bad = synth(strong); bad.C3["TWIN-ROUND11"].runs[17].fingerprint = "x";
    ok("!! a Round 11 dive that differs from the full twin breaks IDENTITY C3 only", J(rows(bad).filter((c) => !c.ok).map((c) => c.name)) === J(["IDENTITY C3"]));
    const k = synth(strong); k.C2["TWIN-FULL"].runs[3].kind = "both";
    ok("!! a twin dive of another kind than the tuned rule's breaks KINDS ALIGNED only", J(rows(k).filter((c) => !c.ok).map((c) => c.name)) === J(["KINDS ALIGNED"]));
    const sz = synth(strong); sz.C4["TUNED-R8"].runs.pop(); const sz2 = synth(strong); sz2.C1["TWIN-FULL"].runs.pop();
    ok("!! a block of 499 dives in the tuned arm or in the twin arm breaks BLOCK SIZE", J(rows(sz).filter((c) => !c.ok).map((c) => c.name)) === J(["KINDS ALIGNED", "BLOCK SIZE"]) && J(rows(sz2).filter((c) => !c.ok).map((c) => c.name)) === J(["KINDS ALIGNED", "BLOCK SIZE"]));
}
sec("5. REPORT");
{
    const L = X.report(synth(strong, { crashed: 2 })), txt = L.join("\n");
    ok("!! the head names the four blocks and 2000 dives per arm; the six checks pass first", /^ROUND 22: the confirmatory run, C1 2401-2650, C2 2651-2900, C3 2901-3150, C4 3151-3400 \(far and both, 2000 dives per arm/.test(L[0]) && L.slice(1, 7).every((l) => /^  PASS /.test(l)));
    ok("!! the pooled line with its lower bound (0.0364), a line per kind, a line per block", /POOLED twin minus TUNED-R8: \+0\.0400 \(se 0\.0018; better 400, worse 0, same 1600\); lower bound 0\.0364/.test(txt) && /^  far +\+0\.0400/m.test(txt) && /^  both +\+0\.0400/m.test(txt) && (txt.match(/^  C[1-4] +\+0\.0400/gm) || []).length === 4);
    ok("!! the heterogeneity line (Q, df 3, p, I-squared, random effects) and the differing line (400 of 2000, 20.0%, +0.2000), the means and counts (tuned | twin, crushed 0/8)", /blocks: Q [0-9.]+ on 3 df, p [0-9.]+; I-squared [0-9]+%; random-effects \+0\.0400/.test(txt) && /differs from the tuned rule's on 400 of 2000 \(20\.0%\), by \+0\.2000 on average where it differs; means \(tuned \| twin\) 0\.[0-9]{4} \| 0\.[0-9]{4}; crushed 0\/8, stranded 0\/0/.test(txt));
    ok("!! the three bottom lines come last, each prefixed BOTTOM LINE:", L.slice(-3).every((l) => l.startsWith("BOTTOM LINE: ")) && /CONFIRMED/.test(L[L.length - 3]) && /ONE POINT/.test(L[L.length - 2]) && /BLOCKS/.test(L[L.length - 1]));
    const bad = synth(strong); bad.C1["TWIN-ROUND11"].runs[0].fingerprint = "x"; const Lb = X.report(bad);
    ok("!! a failed check puts FAIL on its row, says the verdicts are NOT WEIGHED and puts that on a single bottom line", Lb.some((l) => /^  FAIL IDENTITY C1/.test(l)) && Lb.includes("A CHECK FAILED: the verdicts below are NOT WEIGHED.") && Lb[Lb.length - 1] === "BOTTOM LINE: NOT WEIGHED (a check failed)" && Lb.filter((l) => l.startsWith("BOTTOM LINE")).length === 1);
}
sec("6. FLIGHT");
{
    X.setFlight({ seconds: 100 });
    const ranges = { C1: [1344, 1345], C2: [1349, 1350], C3: [1351, 1352], C4: [1353, 1354] }, fly = (a, b) => X.flyBlock(a, R8, b, { ranges });
    const tw = fly("TWIN-FULL", "C2"), r11 = fly("TWIN-ROUND11", "C2"), tu = fly("TUNED-R8", "C2");
    ok("!! a block of real 100-second dives returns the dives of seeds a..b of far then both (kind-major: far, far, both, both)", J(tw.runs.map((r) => r.kind)) === J(["far", "far", "both", "both"]));
    ok("!! the full twin equals the Round 11 twin dive for dive, and differs from the tuned rule on far 1350", tw.runs.every((r, i) => r.fingerprint === r11.runs[i].fingerprint) && tw.runs[1].fingerprint !== tu.runs[1].fingerprint);
    const direct = T.evaluate(T.flyDecision(U_.tunedSeat(R8, U_.WIDE_BOUNDS)), T.setOf(X.HARD, 1349, 1350), { gauge: T.GAUGE, seconds: 100 });
    ok("!! the tuned rule is T.evaluate's tuned dive with the noisy gauge, dive for dive", tu.runs.every((r, i) => r.fingerprint === direct.runs[i].fingerprint));
    X.setFlight({});
    const thr = (f) => { try { f(); return false; } catch { return true; } };
    const msg = (f) => { try { f(); return ""; } catch (e) { return String(e.message); } };
    ok("!! an unknown block is refused with its own message naming the blocks (not a TypeError)", /unknown block "C9" \(C1, C2, C3, C4\)/.test(msg(() => X.flyBlock("TWIN-FULL", R8, "C9"))) && /unknown arm "TWIN-FAST"/.test(msg(() => X.flyBlock("TWIN-FAST", R8, "C1", { ranges }))));
    ok("!! an unknown arm and an unknown block are refused before flying; assemble keys blocks then arms", thr(() => X.flyBlock("TWIN-FAST", R8, "C1", { ranges })) && thr(() => X.flyBlock("TWIN-FULL", R8, "C9", { ranges })) && J(Object.keys(X.assemble({ A: { C1: 1, C2: 2, C3: 3, C4: 4 }, B: { C1: 5, C2: 6, C3: 7, C4: 8 } }).C3)) === J(["A", "B"]) && X.assemble({ A: { C1: 1, C2: 2, C3: 3, C4: 4 } }).C4.A === 4 && X.assemble({ A: { C1: 1, C2: 2, C3: 3, C4: 4 } }).C1.A === 1);
}
import * as U_ from "../../brain/tunedRule.mjs";
sec("7. SOURCE");
{
    ok("!! the seeds 2401, 2650, 2651, 2900, 2901, 3150, 3151 and 3400 appear once each, in SET_RANGES", ["2401", "2650", "2651", "2900", "2901", "3150", "3151", "3400"].every((s) => code.split(s).length === 2));
    ok("!! the file reads no clock, no random number and nothing from the disk", !/Date\.now|Math\.random|performance\.now|readFileSync|writeFileSync/.test(code));
}
console.log(fails ? `\n${fails} FAIL` : "\nall checks pass");
finished = true;
