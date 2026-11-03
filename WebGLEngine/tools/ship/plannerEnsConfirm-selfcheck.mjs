// WebGLEngine/tools/ship/plannerEnsConfirm-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/plannerEnsConfirm-selfcheck.mjs      (about 15 s: hand fixtures of 600 dives and a few 100-second dives)
//
// THE GATE OF tools/ship/plannerEnsConfirm.mjs (Round 27 of brain/NEEDS_AND_LIMITS.md, registered first).
//   1 SETS      4801-4900, 4901-5000 and 5001-5100 of far and both (200 dives a block, 600 an arm), disjoint from every seed of Rounds 1-26; five arms, the primary one named; the 13 jobs.
//   2 DIFFS     the four pooled differences, on hand fixtures; the fixed-effect combination of two estimates.
//   3 LINES     the two bottom lines in all their cases (replicates or not, exceeds or not).
//   4 CHECKS    identity on the first block, each ensemble differs from the twin, kinds aligned, block size; a failed check says NOT WEIGHED.
//   5 REPORT    the lines, with and without Round 23's prior.
//   6 FLIGHT    real 100-second dives: the twin equals the Round 11 twin, the ensembles are the perturbed seat with their offsets and report a cost, an unknown arm or block is refused.
//   7 SOURCE    the seeds appear in one place; no clock, random or file.
// NOT CHECKED, said plainly: how big the ensemble effect is (that is the experiment).
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
import * as Q_ from "../../brain/plannerPerturbed.mjs";
import * as X from "./plannerEnsConfirm.mjs";
console.log("plannerEnsConfirm-selfcheck -- the Round 27 ensemble replication\n");
const code = fs.readFileSync(new URL("./plannerEnsConfirm.mjs", import.meta.url), "utf8").split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n");
const rangeOf = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
const R8 = { alpha: 0.001, low: 0.38036, high: 0.68938, ramp: 20, cap: 0.88615 };

sec("1. SETS");
{
    const prior = new Set([...rangeOf(1, 1100), ...rangeOf(1101, 1208), ...rangeOf(1221, 1328), ...rangeOf(1341, 1448), ...rangeOf(1461, 1568), ...rangeOf(1601, 1768), ...rangeOf(1801, 2100), ...rangeOf(2201, 2308), ...rangeOf(2401, 3400), ...rangeOf(3501, 3850), ...rangeOf(3901, 4096), ...rangeOf(4201, 4348), ...rangeOf(4401, 4700)]);
    const seeds = [...rangeOf(4801, 4900), ...rangeOf(4901, 5000), ...rangeOf(5001, 5100)];
    ok("!! the blocks are F1 4801-4900, F2 4901-5000, F3 5001-5100 (300 distinct seeds), 200 dives each of far and both, and share no seed with Rounds 1-26", J(X.SET_RANGES) === J({ F1: [4801, 4900], F2: [4901, 5000], F3: [5001, 5100] }) && J(X.SET_NAMES) === J(["F1", "F2", "F3"]) && new Set(seeds).size === 300 && seeds.every((s) => !prior.has(s)) && X.BLOCK_DIVES === 200);
    ok("!! the arms are TUNED-R8, TWIN-FULL, ENS-0.05, ENS-0.10, TWIN-ROUND11 and the primary is ENS-0.05", J(X.ARMS) === J(["TUNED-R8", "TWIN-FULL", "ENS-0.05", "ENS-0.10", "TWIN-ROUND11"]) && X.PRIMARY === "ENS-0.05");
    ok("!! 13 jobs: four arms on three blocks, and the identity arm on the first block only", X.JOBS.length === 13 && J(X.JOBS.filter(([a]) => a === "TWIN-ROUND11")) === J([["TWIN-ROUND11", "F1"]]) && X.JOBS.filter(([a]) => a === "ENS-0.05").length === 3);
}
// synthetic: 200 dives a block (100 far, 100 both); each arm's score = base + its own offset on a pattern of dives
const synth = (offs = {}, cost = {}) => {
    const au = {};
    for (const [b, s] of X.SET_NAMES.entries()) {
        const mk = (arm, off) => ({ score: 0.7, crashed: 0, stranded: 0, cost: cost[arm], runs: Array.from({ length: 200 }, (_, i) => { const base = 0.6 + 0.1 * Math.sin(i + 7 * b), g = off ? off(b, i) : 0; return { kind: i < 100 ? "far" : "both", score: base + g, fingerprint: g !== 0 ? `${arm}_${b}_${i}` : `B${b}_${i}` }; }) });
        au[s] = { "TUNED-R8": mk("TUNED-R8", null), "TWIN-FULL": mk("TWIN-FULL", offs.twin), "ENS-0.05": mk("ENS-0.05", offs.e5), "ENS-0.10": mk("ENS-0.10", offs.e10) };
        if (b === 0) au[s]["TWIN-ROUND11"] = { ...au[s]["TWIN-FULL"], runs: au[s]["TWIN-FULL"].runs.map((r) => ({ ...r })) };
    }
    return au;
};
const every = (k, v) => (b, i) => (i % k === 0 ? v : 0);
sec("2. DIFFS");
{
    const au = synth({ twin: every(4, 0.2), e5: every(2, 0.12), e10: every(5, 0.2) }), d = X.differences(au);
    ok("!! ENS-0.05 minus TWIN-FULL = (every second dive +0.12) minus (every fourth +0.2) = 0.06 - 0.05 = +0.01; n 600", d.ens.n === 600 && near(d.ens.mean, 0.01));
    ok("!! ENS-0.05 minus TUNED-R8 is the ensemble over the tuned rule (+0.06), not over the twin", near(d.ensOverTuned.mean, 0.06));
    ok("!! ENS-0.10 minus TWIN-FULL = every fifth dive +0.2 (0.04) minus 0.05 = -0.01; TWIN-FULL minus TUNED-R8 = +0.05", near(d.ens10.mean, -0.01) && near(d.twin.mean, 0.05));
    const c = X.combine({ mean: 0.0057, se: 0.0016 }, { mean: 0.0020, se: 0.0016 });
    ok("!! the fixed-effect combination of two equal-precision estimates is their mean with se / sqrt 2; unequal precision weights by 1/se^2", near(c.mean, 0.00385) && near(c.se, 0.0016 / Math.SQRT2, 1e-12) && near(X.combine({ mean: 1, se: 1 }, { mean: 0, se: 0.5 }).mean, 0.2, 1e-12));
}
sec("3. LINES");
{
    const L = (offs) => X.bottomLines(synth(offs));
    ok("!! a real effect: REPLICATES with the estimate and se; the second line gives the ensemble gain over the tuned rule and says it EXCEEDS the twin's", /^THE ENSEMBLE EFFECT REPLICATES \(ENS-0\.05: \+0\.0[0-9]{3}, se 0\.0[0-9]{3}\)$/.test(L({ twin: every(5, 0.1), e5: every(2, 0.12) })[0]) && /^THE ENSEMBLE GAIN OVER THE TUNED RULE IS \+0\.0600 \(se [0-9.]+\), IT EXCEEDS THE POINT-ESTIMATE TWIN'S$/.test(L({ twin: every(5, 0.1), e5: every(2, 0.12) })[1]));
    ok("!! no effect: DOES NOT REPLICATE with the estimate printed; positive but not real still DOES NOT REPLICATE yet EXCEEDS", L({ twin: every(2, 0.1), e5: every(2, 0.1) })[0].startsWith("THE ENSEMBLE EFFECT DOES NOT REPLICATE (ENS-0.05: +0.0000") && (() => { const l = L({ twin: (b, i) => (i === 3 ? 0.3 : 0), e5: (b, i) => (i === 3 ? 0.3 : i === 9 ? 0.05 : 0) }); return l[0].startsWith("THE ENSEMBLE EFFECT DOES NOT REPLICATE") && l[1].endsWith("IT EXCEEDS THE POINT-ESTIMATE TWIN'S"); })());
    ok("!! a worse ensemble: DOES NOT REPLICATE and DOES NOT EXCEED", (() => { const l = L({ twin: every(2, 0.1), e5: every(4, 0.1) }); return l[0].startsWith("THE ENSEMBLE EFFECT DOES NOT REPLICATE (ENS-0.05: -0.0") && l[1].endsWith("IT DOES NOT EXCEED THE POINT-ESTIMATE TWIN'S"); })());
    ok("!! the primary is ENS-0.05, not ENS-0.10: a real effect in ENS-0.10 alone does not make the line REPLICATE", L({ twin: every(5, 0.1), e10: every(2, 0.12) })[0].startsWith("THE ENSEMBLE EFFECT DOES NOT REPLICATE"));
    ok("!! exactly 2 se is not real: a fixture whose mean is below 2 se does not pass", (() => { const au = synth({ e5: (b, i) => (i === 7 ? 0.5 : 0) }); const d = X.differences(au).ens; return d.mean < 2 * d.se && X.bottomLines(au)[0].includes("DOES NOT"); })());
}
sec("4. CHECKS");
{
    const names = (au) => X.checksOf(au).filter((c) => !c.ok).map((c) => c.name), good = () => synth({ twin: every(4, 0.2), e5: every(2, 0.12), e10: every(5, 0.2) });
    ok("!! five check rows on a clean audit: IDENTITY F1, ENSEMBLE DIFFERS 0.05, ENSEMBLE DIFFERS 0.10, KINDS ALIGNED, BLOCK SIZE; all pass", J(X.checksOf(good()).map((c) => c.name)) === J(["IDENTITY F1", "ENSEMBLE DIFFERS 0.05", "ENSEMBLE DIFFERS 0.10", "KINDS ALIGNED", "BLOCK SIZE"]) && names(good()).length === 0);
    const bad = good(); bad.F1["TWIN-ROUND11"].runs[17].fingerprint = "x";
    ok("!! a Round 11 dive that differs from the twin breaks IDENTITY F1 only", J(names(bad)) === J(["IDENTITY F1"]));
    ok("!! an ensemble that changes no dive breaks its own row only", J(names(synth({ e10: every(5, 0.2) }))) === J(["ENSEMBLE DIFFERS 0.05"]) && J(names(synth({ e5: every(2, 0.12) }))) === J(["ENSEMBLE DIFFERS 0.10"]));
    const k = good(); k.F2["ENS-0.10"].runs[3].kind = "both";
    ok("!! a dive of another kind than the tuned rule's breaks KINDS ALIGNED only", J(names(k)) === J(["KINDS ALIGNED"]));
    const sz = good(); sz.F3["TWIN-FULL"].runs.pop();
    ok("!! a block of 199 dives in one arm breaks BLOCK SIZE", names(sz).includes("BLOCK SIZE"));
}
sec("5. REPORT");
{
    const au = synth({ twin: every(4, 0.2), e5: every(2, 0.12), e10: every(5, 0.2) }, { "TWIN-FULL": 8000, "ENS-0.05": 24000, "ENS-0.10": 24500 }), L = X.report(au, { mean: 0.0057, se: 0.0016 }), txt = L.join("\n");
    ok("!! the head names the three blocks and 600 dives per arm; the five checks pass first", /^ROUND 27: does the small start-energy ensemble replicate\? pooled over F1 4801-4900, F2 4901-5000, F3 5001-5100 \(far and both, 600 dives per arm; read once\)$/.test(L[0]) && L.slice(1, 6).every((l) => /^  PASS /.test(l)));
    ok("!! the primary and the reported differences, each with se and better/worse/same", /ENS-0\.05 minus TWIN-FULL \(primary\): \+0\.0100 \(se [0-9.]+; better [0-9]+, worse [0-9]+, same [0-9]+\)/.test(txt) && /ENS-0\.05 minus TUNED-R8: \+0\.0600/.test(txt) && /ENS-0\.10 minus TWIN-FULL \(reported\): -0\.0100/.test(txt) && /TWIN-FULL minus TUNED-R8 \(reported; the twin's usual gain, on these seeds\): \+0\.0500/.test(txt));
    ok("!! with Round 23's prior the pooled line is there and combined (the fixed-effect estimate lies between the two); without it the line is absent", /pooled over Round 23 and this round \(reported, fixed-effect\): ENS-0\.05 minus TWIN-FULL \+0\.0[0-9]{3} \(se 0\.00[0-9]{2}; Round 23 \+0\.0057, se 0\.0016\)/.test(txt) && !/pooled over Round 23/.test(X.report(au).join("\n")));
    ok("!! the means and the scheduled rollout seconds per dive (8000, 24000, 24500) are reported", /scheduled rollout seconds per dive: twin 8000, ENS-0\.05 24000, ENS-0\.10 24500/.test(txt));
    ok("!! the two bottom lines come last, each prefixed BOTTOM LINE:", L.slice(-2).every((l) => l.startsWith("BOTTOM LINE: ")) && /REPLICATES|DOES NOT REPLICATE/.test(L[L.length - 2]) && /OVER THE TUNED RULE/.test(L[L.length - 1]));
    const bad = synth({ twin: every(4, 0.2), e5: every(2, 0.12), e10: every(5, 0.2) }); bad.F1["TWIN-ROUND11"].runs[0].fingerprint = "x"; const Lb = X.report(bad);
    ok("!! a failed check puts FAIL on its row, says the verdicts are NOT WEIGHED and puts that on a single bottom line", Lb.some((l) => /^  FAIL IDENTITY F1/.test(l)) && Lb.includes("A CHECK FAILED: the verdicts below are NOT WEIGHED.") && Lb[Lb.length - 1] === "BOTTOM LINE: NOT WEIGHED (a check failed)" && Lb.filter((l) => l.startsWith("BOTTOM LINE")).length === 1);
}
sec("6. FLIGHT");
{
    X.setFlight({ seconds: 100 });
    const ranges = { F1: [1344, 1345], F2: [1349, 1350], F3: [1351, 1352] }, fly = (a, b) => X.flyBlock(a, R8, b, { ranges });
    const tw = fly("TWIN-FULL", "F2"), r11 = fly("TWIN-ROUND11", "F2"), tu = fly("TUNED-R8", "F2");
    ok("!! a block of real 100-second dives returns the dives of seeds a..b of far then both (kind-major: far, far, both, both)", J(tw.runs.map((r) => r.kind)) === J(["far", "far", "both", "both"]));
    ok("!! the twin equals the Round 11 twin dive for dive, and differs from the tuned rule on far 1350", tw.runs.every((r, i) => r.fingerprint === r11.runs[i].fingerprint) && tw.runs[1].fingerprint !== tu.runs[1].fingerprint);
    const direct5 = T.evaluate(T.flyDecision(Q_.perturbedSeat(R8, {}, { ensemble: [-0.05, 0, 0.05], seconds: 100 })), T.setOf(X.HARD, 1349, 1350), { gauge: T.GAUGE, seconds: 100 }), e5 = fly("ENS-0.05", "F2");
    ok("!! ENS-0.05 is the perturbed twin with the offsets -0.05, 0 and +0.05, dive for dive", e5.runs.every((r, i) => r.fingerprint === direct5.runs[i].fingerprint));
    const direct10 = T.evaluate(T.flyDecision(Q_.perturbedSeat(R8, {}, { ensemble: [-0.1, 0, 0.1], seconds: 100 })), T.setOf(X.HARD, 1349, 1350), { gauge: T.GAUGE, seconds: 100 }), e10 = fly("ENS-0.10", "F2");
    ok("!! ENS-0.10 is the perturbed twin with the offsets -0.1, 0 and +0.1, dive for dive", e10.runs.every((r, i) => r.fingerprint === direct10.runs[i].fingerprint));
    ok("!! an ensemble arm reports its cost (scheduled rollout seconds per dive), three times the twin's for the three offsets, and the tuned rule reports none", e5.cost > 0 && near(e5.cost / tw.cost, 3, 0.05) && tu.cost === undefined, `${tw.cost} ${e5.cost}`);
    X.setFlight({});
    const msg = (f) => { try { f(); return ""; } catch (e) { return String(e.message); } };
    ok("!! an unknown arm and an unknown block are each refused with their own message (not a TypeError)", /unknown arm "ENS-0.99"/.test(msg(() => X.flyBlock("ENS-0.99", R8, "F1", { ranges }))) && /unknown block "F9" \(F1, F2, F3\)/.test(msg(() => X.flyBlock("TWIN-FULL", R8, "F9", { ranges }))));
    ok("!! assemble keys blocks then arms and leaves an arm out of a block it was not flown on", J(Object.keys(X.assemble({ A: { F1: 1, F2: 2, F3: 3 }, B: { F1: 4 } }).F1)) === J(["A", "B"]) && J(Object.keys(X.assemble({ A: { F1: 1, F2: 2, F3: 3 }, B: { F1: 4 } }).F2)) === J(["A"]));
}
sec("7. SOURCE");
{
    ok("!! the seeds 4801, 4900, 4901, 5000, 5001 and 5100 appear once each, in SET_RANGES", ["4801", "4900", "4901", "5000", "5001", "5100"].every((s) => code.split(s).length === 2));
    ok("!! the file reads no clock, no random number and nothing from the disk", !/Date\.now|Math\.random|performance\.now|readFileSync|writeFileSync/.test(code));
}
console.log(fails ? `\n${fails} FAIL` : "\nall checks pass");
finished = true;
