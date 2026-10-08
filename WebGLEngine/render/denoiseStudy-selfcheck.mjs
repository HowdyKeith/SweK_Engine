// WebGLEngine/render/denoiseStudy-selfcheck.mjs -- the denoiser arc, round 2
//
// Run: node render/denoiseStudy-selfcheck.mjs
//
// GATES render/denoiseStudy.mjs -- the pre-registered study as one pipeline (tools/denoiseStudy.mjs is its CLI) -- on its MINIATURE only (scenes seeded
// outside every split, 16 x 16, four training steps). Its exports, each named here: SEEDS, RESULTS, RESULTS_R2,
// RESULTS_R3, RESULTS_R4, RESULTS_R5, RESULTS_R6, ROUND1, ROUND2, ROUND3, ROUND4, ROUND5, ROUND6, MINI, shuffledTargets, stopBeforeTests, renderSplit,
// runStudy. What it holds is the PLUMBING: that every stage runs, in order, on every
// split, and hands verdict() what the pre-registration says -- not any number the miniature produces, which is
// meaningless at this size and is not looked at beyond its shape.
//
// Section 3 (the re-run, pre-registration section 13): control C0 stops the run BEFORE a test scene is rendered.
//
// ---- SABOTAGES, WITH THEIR RESULTS ---------------------------------------------------------------------------
//   R1  the test scenes rendered with the rest, before C0                        2 RED
//   R2  a C0 failure ignored: the run carries on to the tests                    2 RED
//   R3  ROUND2 pointed at round 1's spent test splits                            1 RED
//   R4  the comparison networks trained with the PRIMARY head                    1 RED
//   R5  ROUND3 pointed at the re-run's spent test splits                         1 RED
//   R6  a failed C6 does not stop the run                                        1 RED
//   R9  renderSplit takes the split's family, not each seed's                    3 RED (the miniature threw and crashed the gate until its run was caught)
//   R10 the other-training networks trained on the primary training set          1 RED
//   R11 ROUND5 without its other-training comparison                             1 RED
//   R12 ROUND6 without the mask                                                  1 RED
"use strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const imp = (p) => import(pathToFileURL(path.join(ENG, p)).href);
const { SEEDS, RESULTS, RESULTS_R2, RESULTS_R3, RESULTS_R4, RESULTS_R5, RESULTS_R6, ROUND1, ROUND2, ROUND3, ROUND4, ROUND5, ROUND6, MINI, shuffledTargets, stopBeforeTests,
        renderSplit, runStudy } = await imp("render/denoiseStudy.mjs");
const { SPLITS, SPLITS_R2, SPLITS_R3, SPLITS_R4, SPLITS_R5, SPLITS_R6, isDatasetSeed, renderImages } = await imp("render/denoiseScenes.mjs");
const { trainFit, historyFit } = await imp("render/denoiseStats.mjs");

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const t0 = Date.now();

console.log("1. THE RUNNER'S CONSTANTS, AND ITS REFUSAL");
{
    ok("  seeds 1, 2 and 3; results to render/denoise-results.json", SEEDS.join() === "1,2,3" && RESULTS === "render/denoise-results.json");
    const mini = Object.values(MINI.splits).flatMap((s) => s.seeds);
    ok("!! the miniature's every scene is seeded OUTSIDE the dataset", mini.length > 0 && mini.every((s) => !isDatasetSeed(s)), mini.join(" "));
    let threw = null; try { runStudy({ splits: SPLITS, image: 4, sppIn: 1, sppRef: 1, train: { steps: 1, batch: 1, crop: 4 } }); } catch (e) { threw = e.message; }
    ok("!! the study on the REAL splits without harvest is refused at its first scene -- the runner cannot look early either", /seed 1000 is a dataset seed/.test(threw || ""), threw);
    const set = [0, 1, 2, 3].map((i) => ({ x: i, ref: "r" + i }));
    const D = shuffledTargets(set);
    ok("  C2's targets are a derangement: every image gets ANOTHER image's reference, and only that changes",
        D.every((im, i) => im.ref !== set[i].ref && im.x === set[i].x) && new Set(D.map((im) => im.ref)).size === 4, D.map((im) => im.ref).join(" "));
    ok("  renderSplit builds the 9-channel input beside each render", (() => { const r = renderSplit(MINI.splits.val, { harvest: false, image: 6, sppIn: 1, sppRef: 2, ref2: false });
        return r.length === 1 && r[0].x.length === 6 * 6 * 9 && r[0].ref.length === 6 * 6 * 3; })());
}

console.log("\n2. THE MINIATURE, END TO END");
{
    const out = runStudy({ ...MINI, c0: false });
    const T = out.tables;
    ok("!! every stage ran in order: train rendered, filter tuned, networks trained, C0, tests rendered, shuffled networks trained, measured, secondary",
        ["train rendered", "filter tuned", "networks trained", "C0", "tests rendered", "shuffled networks trained", "measured", "secondary"].every((k, i, a) => out.timings[k] >= (i ? out.timings[a[i - 1]] : 0)),
        Object.entries(out.timings).map(([k, v]) => `${k} ${v} ms`).join(", "));
    ok("  each test set is measured four ways: noisy, filter, one network per seed, and the floor from the SECOND reference",
        ["T1", "T2"].every((n) => T[n].noisy.length === 2 && T[n].filter.length === 2 && T[n].net.length === 3 && T[n].net.every((s) => s.length === 2) &&
            T[n].floor.every((f) => f > 0 && Number.isFinite(f))), "a floor of exactly 0 would mean the reference was compared with itself");
    ok("!! C4 and C5 are computed, not assumed: one seed trained twice gave one network, and 3 render seeds x 8 scenes are 24 distinct",
        out.determinism === true && out.seedsDistinct === true && out.verdict.controls.C4 === true && out.verdict.controls.C5 === true);
    ok("  the verdict is render/denoiseStats.mjs's, with C2 measured on H1's set -- and a 2-image set cannot pass C1, so it is NOT REPORTED, as it must be",
        out.verdict.run === "not reported" && typeof out.verdict.controls.C2.meanD === "number" && /C1 on H1/.test(out.verdict.reasons.join()));
    ok("  the filter was tuned (a setting from the grid) and the secondaries ran at 1 sample without feeding the verdict",
        typeof out.filter.sS === "number" && Object.keys(out.secondary).join() === "T1@1spp,T2@1spp" && out.secondary["T1@1spp"].net.length === 3);
}

console.log("\n3. *** THE RE-RUN: C0 STOPS THE RUN BEFORE A TEST SCENE EXISTS ***");
{
    ok("  ROUND1 is the harvest section 12 recorded: round 1's splits, He init, no C0, results to render/denoise-results.json",
        ROUND1.splits === SPLITS && ROUND1.init === "he" && ROUND1.c0 === false && ROUND1.results === RESULTS);
    ok("!! ROUND2 is section 13's: the NEW test splits, the zero-last init, C0 on, results to their own file",
        ROUND2.splits === SPLITS_R2 && ROUND2.init === "zero-last" && ROUND2.c0 === true && RESULTS_R2 === "render/denoise-results-r2.json" &&
        ![...SPLITS.T1.seeds, ...SPLITS.T2.seeds].some((s) => [...ROUND2.splits.T1.seeds, ...ROUND2.splits.T2.seeds].includes(s)));
    // the miniature's training scenes, with the REAL re-run test splits behind them and harvest OFF: rendering a test
    // scene would throw, so returning at all proves the stop came first. Zero training steps leave the zero-last network
    // exactly the identity -- a train-fit ratio of 1, which C0 refuses.
    const probe = { ...MINI, splits: { ...MINI.splits, T1: SPLITS_R2.T1, T2: SPLITS_R2.T2 }, train: { ...MINI.train, steps: 0 } };
    let out = null, threw = null; try { out = runStudy({ ...probe, c0: true }); } catch (e) { threw = e.message; }
    ok("!! *** an untrained network fails C0, and the run returns WITHOUT rendering a test scene -- the real test seeds are behind it and harvest is off ***",
        !threw && out.verdict.run === "not reported" && /^C0: /.test(out.verdict.reasons[0]) && out.tables === null && !("tests rendered" in out.timings) &&
        out.trainFit.ratios.every((r) => r === 1), threw || `${out.verdict.reasons[0]}`);
    let threw2 = null; try { runStudy({ ...probe, c0: false }); } catch (e) { threw2 = e.message; }
    ok("  ...and the same call without C0 does go on to the tests -- refused at the first re-run test seed, which is what the row above relies on",
        /seed 5000 is a dataset seed/.test(threw2 || ""), threw2);
    ok("  the training-fit ratios are recorded beside the verdict, one per seed", out && out.trainFit.ratios.length === SEEDS.length && out.verdict.controls.C0 === out.trainFit);
}

console.log("\n4. THE KERNEL-PREDICTING ROUND (pre-registration section 15)");
{
    ok("!! ROUND3 is section 15's: its own new test splits, the kernel head, zero-last, C0 on, the residual network as the secondary comparison, results to their own file",
        ROUND3.splits === SPLITS_R3 && ROUND3.head === "kernel" && ROUND3.init === "zero-last" && ROUND3.c0 === true && ROUND3.compareHeads.join() === "residual" &&
        RESULTS_R3 === "render/denoise-results-r3.json" &&
        ![...SPLITS.T1.seeds, ...SPLITS.T2.seeds, ...SPLITS_R2.T1.seeds, ...SPLITS_R2.T2.seeds].some((s) => [...ROUND3.splits.T1.seeds, ...ROUND3.splits.T2.seeds].includes(s)));
    // 8 x 8 and two steps: what these rows hold does not depend on the size, and the gate stays inside the sweep budget
    const out = runStudy({ ...MINI, image: 8, train: { steps: 2, batch: 1, crop: 8 }, secondarySpp: [], c0: false, head: ROUND3.head, compareHeads: ROUND3.compareHeads });
    const S1 = out.secondary["T1@residual"], S2 = out.secondary["T2@residual"];
    ok("!! the whole pipeline runs on the kernel head, and the residual networks are trained and measured beside it, on the same test images, outside the verdict",
        out.config.head === "kernel" && out.verdict.controls.C4 === true && S1 && S2 && S1.net.length === 3 && S1.net.every((a) => a.length === 2) && S2.net.length === 3 &&
        !out.verdict.hypotheses.H1.d.some((v) => !Number.isFinite(v)));
    ok("  the comparison networks ARE a different head: their errors are not the primary's", S1 && S1.net.some((a, i) => a.some((v, j) => v !== out.tables.T1.net[i][j])));
    const probe = { ...MINI, splits: { ...MINI.splits, T1: SPLITS_R3.T1, T2: SPLITS_R3.T2 }, train: { ...MINI.train, steps: 0 }, head: "kernel" };
    let stopped = null, threw = null; try { stopped = runStudy({ ...probe, c0: true }); } catch (e) { threw = e.message; }
    ok("!! C0 guards this round's test scenes too: an untrained kernel head (the box blur) fails it and the run returns before seed 7000 is rendered",
        !threw && stopped.tables === null && stopped.verdict.run === "not reported" && /^C0: /.test(stopped.verdict.reasons[0]), threw || stopped.verdict.reasons[0]);
}

console.log("\n5. THE TEMPORAL ROUND'S CONFIGURATION AND ITS STOP (pre-registration section 17; the pipeline runs are render/denoiseTemporal-selfcheck.mjs's)");
{
    const spent = [SPLITS, SPLITS_R2, SPLITS_R3].flatMap((S) => [...S.T1.seeds, ...S.T2.seeds]);
    ok("!! ROUND4 is section 17's: its own new test splits, sequences, the kernel head, zero-last, C0 on, the no-history comparison, results to their own file",
        ROUND4.splits === SPLITS_R4 && ROUND4.temporal === true && ROUND4.head === "kernel" && ROUND4.init === "zero-last" && ROUND4.c0 === true &&
        ROUND4.compareNoHistory === true && RESULTS_R4 === "render/denoise-results-r4.json" && ![...SPLITS_R4.T1.seeds, ...SPLITS_R4.T2.seeds].some((s) => spent.includes(s)));
    const stop = stopBeforeTests(trainFit([[0.2]], [1]), historyFit([1, 1], [1, 1]), true), go = stopBeforeTests(trainFit([[0.2]], [1]), historyFit([0.2], [1]), true);
    ok("!! a failed C6 alone stops the run before its tests, and a passing C0 and C6 let it go on", !!stop && stop.run === "not reported" && /^C6: /.test(stop.reasons[0]) && go === null);
}

console.log("\n6. THE THIRD-FAMILY ROUND (pre-registration section 19)");
{
    ok("!! ROUND5 is section 19's: the mixed A+B training, H2 on family C, round 3's single-frame kernel network, zero-last, C0 on, round 3's family-A training as the comparison, results to their own file",
        ROUND5.splits === SPLITS_R5 && ROUND5.splits.T2.family === "C" && ROUND5.head === "kernel" && ROUND5.temporal === false && ROUND5.init === "zero-last" &&
        ROUND5.c0 === true && ROUND5.compareTrainSplit === SPLITS.train && RESULTS_R5 === "render/denoise-results-r5.json");
    // a miniature that mixes families, seeded outside every split, 8 x 8
    const mix = { train: { family: "A+B", families: ["A", "B", "A"], seeds: [910010, 910011, 910012] }, val: { family: "A", seeds: [920010] },
                  T1: { family: "A+B", families: ["A", "B"], seeds: [930010, 930011] }, T2: { family: "C", seeds: [940010, 940011] } };
    let same = false, threw = null;
    try { const r = renderSplit(mix.T1, { harvest: false, image: 4, sppIn: 2, sppRef: 2, ref2: false });
          same = ["A", "B"].every((f, i) => { const I = renderImages(f, mix.T1.seeds[i], { w: 4, h: 4, sppIn: 2, sppRef: 2 }); return I.input.every((v, j) => v === r[i].input[j]); }); }
    catch (e) { threw = e.message; }
    ok("!! a mixed split renders each scene as ITS OWN family -- bit for bit what renderImages draws for that family and seed", same, threw);
    let out = null, runErr = null;
    try { out = runStudy({ splits: mix, image: 8, sppIn: 4, sppRef: 16, train: { steps: 2, batch: 1, crop: 8 }, secondarySpp: [], c0: false, head: "kernel",
                           compareTrainSplit: { family: "A", seeds: [910020, 910021] } }); } catch (e) { runErr = e.message; }
    const O1 = out?.secondary["T1@otherTraining"], O2 = out?.secondary["T2@otherTraining"];
    ok("!! the comparison: the filter and three networks trained on ANOTHER split, measured on the same test images, recorded beside the verdict",
        O1 && O2 && O1.filter.length === 2 && O1.net.length === 3 && O2.net.every((a) => a.length === 2) && typeof out.secondary.filterOtherTraining.sS === "number" &&
        out.config.compareTrain.first === 910020 && [...O1.filter, ...O1.net.flat(), ...O2.net.flat()].every((v) => Number.isFinite(v) && v > 0), runErr);
    ok("  ...and they are other networks: their errors are not the primary's", O1 && O1.net.some((a, i) => a.some((v, j) => v !== out.tables.T1.net[i][j])));
}

console.log("\n7. THE EMITTER-MASK ROUND'S CONFIGURATION (pre-registration section 21; the masked pipeline runs are render/denoiseMask-selfcheck.mjs's)");
{
    ok("!! ROUND6 is section 21's: round 5's design on new test splits, with the emitter mask on, the no-mask comparison, results to their own file",
        ROUND6.splits === SPLITS_R6 && ROUND6.emitterMask === true && ROUND6.compareNoMask === true && ROUND6.head === "kernel" && ROUND6.temporal === false &&
        ROUND6.init === "zero-last" && ROUND6.c0 === true && RESULTS_R6 === "render/denoise-results-r6.json" && SPLITS_R6.train === SPLITS_R5.train);
}

console.log(`\n${fails ? "FAIL -- " + fails + " check(s)" : "ALL GREEN"} (${Date.now() - t0} ms)` +
    "\nnot closed here: the study itself. `node tools/denoiseStudy.mjs --harvest-r6` is the emitter-mask round's one command, and " +
    "no gate runs it.");
process.exit(fails ? 1 : 0);
