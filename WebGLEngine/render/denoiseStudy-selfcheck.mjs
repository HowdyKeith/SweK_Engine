// WebGLEngine/render/denoiseStudy-selfcheck.mjs -- the denoiser arc, round 2
//
// Run: node render/denoiseStudy-selfcheck.mjs
//
// GATES render/denoiseStudy.mjs -- the pre-registered study as one pipeline (tools/denoiseStudy.mjs is its CLI) -- on its MINIATURE only (scenes seeded
// outside every split, 16 x 16, four training steps). Its exports, each named here: SEEDS, RESULTS, RESULTS_R2,
// RESULTS_R3, RESULTS_R4, RESULTS_R5, RESULTS_R6, RESULTS_R7, RESULTS_R8, RESULTS_R9, RESULTS_R10, RESULTS_R11, ROUND1, ROUND2, ROUND3, ROUND4, ROUND5, ROUND6, ROUND7, ROUND8, ROUND9, ROUND10, ROUND11, MINI, shuffledTargets, stopBeforeTests, renderSplit,
// runStudy, HARVESTS, studyOptions, RESULTS_MESH, SHIPPED_NET, ROUND_MESH, runShippedStudy (section 79), RESULTS_FSR1, ROUND_FSR1, runUpscaleStudy (section 81). What it holds is the PLUMBING: that every stage runs, in order, on every
// split, and hands verdict() what the pre-registration says -- not any number the miniature produces, which is
// meaningless at this size and is not looked at beyond its shape.
//
// Section 3 (the re-run, pre-registration section 13): control C0 stops the run BEFORE a test scene is rendered.
//
// Section 13 (pre-registration section 33): the runner, tools/denoiseStudy.mjs, hands the study every option a round
// names -- through HARVESTS and studyOptions.
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
//   R13 ROUND7 without its A+B comparison                                        1 RED
//   R14 the stop before the tests ignores the training C1                        2 RED
//   R15 the training C1 decided, but not handed to the verdict                   1 RED
//   R16 the training C1 measures the noisy input in the filter's place           1 RED
//   R17 ROUND8 without C1 on the training images                                 1 RED
//   D24 SPLITS_R8 left out of the dataset refusal (in this gate)                 1 RED
//   R18 ROUND9 tested by the sign test                                           1 RED
//   R19 ROUND9's small comparison trained on the longer schedule                 1 RED
//   R21 ROUND10's comparison training on A+B, not round 9's R                    1 RED
//   R22 ROUND10 tested by the sign test                                          1 RED
//   R10b R10 again on round 10's parallel path: the other training's networks     1 RED
//       trained on the primary set
//   R23 ROUND11's two comparison trainings swapped                               1 RED
//   R24 ROUND11 tested by the sign test                                          1 RED
//   R25 the primary networks against the PRIMARY filter, not each family's own   1 RED
//   R26 a comparison training's networks trained on the primary set              1 RED
//   R27 only the first comparison training run                                   1 RED
//   R28 a comparison training's networks measured against its own filter, not   1 RED
//       the primary one
//   R29 the runner drops compareTrainSplits -- round 11's harvest, as it ran      1 RED
//   R30 --secondary-r11 writes the harvest's own results file                    1 RED
//   R31 --secondary-r11 runs round 10                                            1 RED
//   R32 --harvest-r11 runs round 10                                              1 RED
//   R33 the runner logs the verdict again                                        1 RED
//   R34 (section 79) runShippedStudy drops its cited C2                          1 RED
//   R35 ROUND_MESH's cited C2 retyped to four places                             1 RED
//   R36 H2's network errors computed from H1's outputs                           1 RED
//   R37 ROUND_MESH without the emitter mask the shipped network was trained with 1 RED
//   R38 --harvest-mesh writing round 11's results file                           1 RED
//   R39 (section 80) ROUND_MESH judged by the sign test (count only)             3 RED -- the re-derivation among them:
//       by count H2 is 7 of 12, p 0.39, and is not supported
//   R40 the page's scope note no longer citing section 80                        1 RED
//   R41 (section 81) H1 held against C instead of D                             1 RED
//   R42 B upscaled bilinearly instead of by FSR1                                 2 RED -- the B row, and C4, whose re-run is FSR1's
//   R43 --harvest-fsr1 leaving fx/fsr out of its cache stamp                     1 RED
//   R44 (section 82) C1's eleven of twelve lowered to nine                       1 RED -- the re-derivation then reads
//       'reported', which the committed file is not
//   R45 (section 89) B upscaled by FSR1 whatever the candidate                   1 RED -- the EASU end-to-end row
//   R46 ROUND_HALFRES at 128 x 128 instead of 256                              1 RED
//   R47 --harvest-halfres not passing ROUND_HALFRES's candidate                  1 RED -- the CLI row (the run would be round 26's FSR1)
//   R48 C4's re-run hard-coded to FSR1                                          1 RED -- the EASU end-to-end row (C4 false)
//   R49 the candidate guard removed                                             1 RED -- the refusal row (upscale's own error is not the guard's)
//   R50 (section 90) C1's eleven of twelve lowered to nine                      2 RED -- section 82's re-derivation and section 90's
//   R51 the committed round 29 results' verdict edited to "reported"             1 RED -- section 90's row
//   R52 the committed round 29 results' C4 edited to false                       1 RED -- section 90's row
//   R53 section 90's row without its bilinear count (filterWins === 12)          0 RED -- redundant by construction: the same row compares
//       the verdict's reasons, which state both counts
//   R54 (section 91) B through plain EASU                                        2 RED -- end to end, and C4 (the re-run is the aware chain)
//   R55 H2's noisy frame round 29's plain bilinear upscale                       0 RED ON THE FIRST DRAFT -- a finding: the row compared the
//       verdict alone, and on two images C1's counts over either noisy frame are the same. The hypotheses' columns are now ONE
//       exported function (emitterSets), held column by column by identity, and the run held to calling it:
//   R55b the same, in emitterSets                                                1 RED
//   R56 C4's re-run the plain EASU chain                                         1 RED
//   R57 ROUND_EMITTER at 128 x 128                                               1 RED
//   R58 --harvest-emitter running round 29's study                               1 RED
//   R59 H1 held against D composited instead of D (in the run's inline sets)     1 RED -- the verdict's d differ
//   R59b the same, in emitterSets                                                1 RED
//   R60 the mask-agreement refusal removed                                       1 RED -- the source row
//   R61 D composited without its fill                                            1 RED
//   R62 the run building its sets inline, H2 over the plain bilinear noise       1 RED -- the run-calls-emitterSets clause
//   R63 (section 92) the committed round 30 results' verdict edited to "not reported"  2 RED -- the verdict row and the rule row
//   R64 C1's eleven of twelve raised to thirteen                                 7 RED -- every re-derivation (sections 80, 82, 90, 92),
//       the two training-C1 rows, and P1/P2 among the predictions
//   R65 section 92's rule with its qualification flipped                         1 RED
//   R66 the committed results' first D-composited effect edited to -20           2 RED -- the rule row and P6
//   R67 the committed results' network sha-256 edited                            1 RED
//   R68 the committed results' B at an emitter-free image moved one digit        2 RED -- the verdict row (its d) and the bit-for-bit row
//   R69 (section 96) section 95's rule sending both-supported to single-frame     1 RED -- the rule row
//   R70 the rule ignoring H2                                                     1 RED -- the rule row
//   R71 temporalUpSets' H2 comparator swapped to B1                               3 RED -- the round's config row, the verdict row, the predictions
//   R72 P2's bound widened to +3.1 (so the miss would read as a hit)              1 RED -- the predictions row
//   R73 (section 127) ROUND_MESH_C on the R-material mesh splits                  1 RED -- the ROUND_MESH_C row
//   R74 --harvest-mesh-c running section 79's splits                             1 RED -- the command row
//   R75 (section 128) the file's H2 typed as supported                           1 RED -- the re-derivation row
//   R76 the page's scope note claiming C's materials on the meshes               1 RED -- the scope row
//   R77 VC's second image's network error typed as 0.03                          2 RED -- the re-derivation row and the one-image row
//   R78 (section 131) ROUND_PAGE's C1 at 11                                         1 RED -- the ROUND_PAGE row
//   R79 runShippedStudy not handing c1Min to verdict                              1 RED -- the miniature row, once it asked which C1 judged
//       it (as first written it read only the config, which still said 5)
//   R80 --harvest-page without its C1                                            1 RED -- the command row
//   R81 (section 132) the file's H1 typed as not supported                       1 RED -- the re-derivation row
//   R82 the page's note without the furnace                                      1 RED -- the scope row
//   R83 the furnace's network error typed below its input                        3 RED -- the re-derivation row, the reading row, the predictions row
//   R84 (section 133) frameGenSets' H1 against the repeated frame                  1 RED -- the frameGenSets row
//   R85 --harvest-framegen at the default image size                             1 RED -- the command row
//   R86 (section 134) G's first image typed far below the noisy frame              2 RED -- the re-derivation row, the figures row
//   R87 the first image's field typed as no better moved                          1 RED -- the field row
//   R88 the round re-derived with the cross-fade as both comparators              3 RED -- frameGenSets' row, the re-derivation, the figures
//   LF5 (section 136) frameGenSetsLightFree's H2 against the cross-fade            1 RED -- the frameGenSetsLightFree row
//   LF6 --harvest-framegen-lf without its arrangement                            1 RED -- the command row
//   R89 (section 138) the held frame's eleventh image typed below its noisy frame  2 RED -- the re-derivation row (C1 then holds), the figures
//   R90 the second image's G' typed off its tie with G                           1 RED -- the figures row
//   R91 the display grading's first effect typed negative                        1 RED -- the figures row
//   DS1 (section 139) the display round's tables graded in linear radiance          1 RED -- the miniature's display-space row
//   DS2 the display round's verdict asking C1 of both arms                       1 RED -- the same row (its reasons name both arms)
//   DS3 toDisplay without its gamma                                              1 RED -- the transfer row
//   DS5 --harvest-framegen-display without its arrangement                       1 RED -- the command row
//   DS6 SPLITS_FRAMEGEN_DISPLAY left out of the dataset refusal                   1 RED -- the refusal row
//   V140a-g (section 140) the verdict's lost images, H1's count, H1's threshold, the linear count, C1's wording, the results'
//           commit, the C1 the had-C1-held row asks                                each 1 RED -- the row it names
//   L1 (section 142) round 62's R seeds moved onto round 61's                     2 RED -- the round row, the refusal row (57000 named)
//   L2 C1 at 20, not 22                                                          1 RED -- the round row
//   L3 runFrameGenStudy not passing c1Min to verdict()                           1 RED -- the miniature's c1Min row
//   L4 --harvest-framegen-large without its c1Min                                1 RED -- the command row
//   L5 SPLITS_FRAMEGEN_LARGE left out of the dataset refusal                      2 RED -- the round row, the refusal row
//   L6 the families 6 R and 18 C                                                 1 RED -- the round row
//   L7 ROUND_FRAMEGEN_LARGE left off the command's import line (the first harvest's death) 1 RED -- the import row
//   V145a-f (section 145) the lost image, H1's count, H1's threshold, linear H1's count, the results' commit, C1 at 24
//           each 1 RED -- the row it names
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const imp = (p) => import(pathToFileURL(path.join(ENG, p)).href);
const { SEEDS, RESULTS, RESULTS_R2, RESULTS_R3, RESULTS_R4, RESULTS_R5, RESULTS_R6, RESULTS_R7, RESULTS_R8, RESULTS_R9, RESULTS_R10, RESULTS_R11, RESULTS_R47, ROUND1, ROUND2, ROUND3, ROUND4, ROUND5, ROUND6, ROUND7, ROUND8, ROUND9, ROUND10, ROUND11, ROUND47, MINI, shuffledTargets, stopBeforeTests,
        renderSplit, runStudy, HARVESTS, studyOptions } = await imp("render/denoiseStudy.mjs");
const { SPLITS, SPLITS_R2, SPLITS_R3, SPLITS_R4, SPLITS_R5, SPLITS_R6, SPLITS_R7, SPLITS_R8, SPLITS_R9, SPLITS_R10, SPLITS_R11, SPLITS_R47, isDatasetSeed, renderImages } = await imp("render/denoiseScenes.mjs");
const { TRAIN, TRAIN_LONG, INIT, trainDenoiser, denoise } = await imp("render/denoiseNet.mjs");
const { trainFit, historyFit, trainSanity, verdict, relMSE } = await imp("render/denoiseStats.mjs");

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

console.log("\n8. THE RANDOMIZED ROUND'S CONFIGURATION (pre-registration section 23)");
{
    ok("!! ROUND7 is section 23's: the 96-scene randomized training split, H2 on family C, round 6's masked kernel network, round 5/6's A+B training as the comparison",
        ROUND7.splits === SPLITS_R7 && SPLITS_R7.train.seeds.length === 96 && SPLITS_R7.T2.family === "C" && ROUND7.emitterMask === true && ROUND7.head === "kernel" &&
        ROUND7.temporal === false && ROUND7.init === "zero-last" && ROUND7.c0 === true && ROUND7.compareTrainSplit === SPLITS_R5.train && RESULTS_R7 === "render/denoise-results-r7.json");
}

console.log("\n9. C1 ON THE TRAINING IMAGES (pre-registration section 26)");
{
    ok("!! ROUND8 is section 26's: round 7 exactly -- its training split, network, mask and comparison -- with C1 decided on the training images, and NEW test splits",
        ROUND8.splits === SPLITS_R8 && SPLITS_R8.train === SPLITS_R7.train && SPLITS_R8.val === SPLITS_R7.val && ROUND8.c1OnTraining === true && ROUND8.emitterMask === true &&
        ROUND8.head === "kernel" && ROUND8.temporal === false && ROUND8.init === "zero-last" && ROUND8.c0 === true && ROUND8.compareTrainSplit === SPLITS_R5.train &&
        !ROUND7.c1OnTraining && RESULTS_R8 === "render/denoise-results-r8.json" &&
        ![...SPLITS_R7.T1.seeds, ...SPLITS_R7.T2.seeds].some((s) => [...SPLITS_R8.T1.seeds, ...SPLITS_R8.T2.seeds].includes(s)));
    const fitOk = trainFit([[0.1]], [1]), good = trainSanity([0.5], [[0.5]], [1]), bad = trainSanity([2], [[0.5]], [1]);
    ok("  the stop reads it: a failed training C1 stops the run before the tests even with C0 off; a passing one does not",
        stopBeforeTests(fitOk, null, true, good) === null && /^C1 on the training images: /.test(stopBeforeTests(fitOk, null, true, bad)?.reasons[0] ?? "") &&
        /^C1 on the training images: /.test(stopBeforeTests(trainFit([[2]], [1]), null, false, bad)?.reasons[0] ?? "") && stopBeforeTests(fitOk, null, true) === null);
    // the miniature's training scenes with round 8's REAL test splits behind them and harvest off: rendering a test scene
    // would throw, so returning at all proves the stop came first. Zero steps leave the zero-last residual network exactly
    // the identity -- it TIES the noisy input on every training image, and a tie is not a win.
    const probe = { ...MINI, image: 8, splits: { ...MINI.splits, T1: SPLITS_R8.T1, T2: SPLITS_R8.T2 }, train: { ...MINI.train, steps: 0, crop: 8 }, secondarySpp: [], c0: false };
    let out = null, threw = null; try { out = runStudy({ ...probe, c1OnTraining: true }); } catch (e) { threw = e.message; }
    ok("!! *** a network that beats the noisy input on no training image fails C1 THERE, and the run returns WITHOUT rendering a test scene ***",
        !threw && out.verdict.run === "not reported" && /^C1 on the training images: /.test(out.verdict.reasons[0]) && out.tables === null &&
        !("tests rendered" in out.timings) && "C1" in out.timings && out.trainSanity.netWins === 0 && out.verdict.controls.C1 === out.trainSanity, threw || out.verdict.reasons[0]);
    let threw2 = null; try { runStudy({ ...probe, c1OnTraining: false }); } catch (e) { threw2 = e.message; }
    ok("  ...and without it the same call goes on to the tests -- refused at round 8's first test seed, which is what the row above relies on",
        /seed 24000 is a dataset seed/.test(threw2 || ""), threw2);
    // and when it holds, the run goes on, and the verdict reads the training C1, not the test sets' counts. Residual head,
    // 1-sample inputs, ten steps: the smallest miniature found to beat the noisy input on all three training images.
    const pass = runStudy({ splits: MINI.splits, image: 8, sppIn: 1, sppRef: 16, train: { steps: 10, batch: 1, crop: 8 }, secondarySpp: [], c0: false, c1OnTraining: true });
    const T = pass.timings, H = pass.verdict.hypotheses;
    ok("!! when it holds the run goes on: C1 is decided after C0 and before the tests, and the verdict's C1 IS the training one -- the test sets' counts reported, never tested",
        pass.trainSanity.ok === true && pass.verdict.controls.C1 === pass.trainSanity && T.C0 <= T.C1 && T.C1 <= T["tests rendered"] && pass.tables !== null &&
        H.H1.c1.tested === false && H.H2.c1.tested === false && !pass.verdict.reasons.some((r) => /^C1/.test(r)) && pass.config.c1OnTraining === true,
        `training C1 ${pass.trainSanity.netWins} / ${pass.trainSanity.filterWins} of ${pass.trainSanity.n}; run "${pass.verdict.run}"`);
}

console.log("\n10. THE LARGER NETWORK AND THE SIGN-FLIP TEST (pre-registration section 28; the pipeline runs are render/denoisePool-selfcheck.mjs's)");
{
    ok("!! ROUND9 is section 28's: round 8 with the LARGE network trained on TRAIN_LONG and the hypotheses tested by sign flips; the small network on round 8's schedule as the comparison; NEW test splits",
        ROUND9.splits === SPLITS_R9 && SPLITS_R9.train === SPLITS_R8.train && ROUND9.size === "large" && ROUND9.train === TRAIN_LONG && ROUND9.test === "signflip" &&
        ROUND9.compareSize.size === "small" && ROUND9.compareSize.train === TRAIN && ROUND9.c1OnTraining === true && ROUND9.c0 === true && ROUND9.emitterMask === true &&
        ROUND9.head === "kernel" && ROUND9.init === "zero-last" && ROUND9.temporal === false && !ROUND9.compareTrainSplit && RESULTS_R9 === "render/denoise-results-r9.json" &&
        ![...SPLITS_R8.T1.seeds, ...SPLITS_R8.T2.seeds].some((s) => [...SPLITS_R9.T1.seeds, ...SPLITS_R9.T2.seeds].includes(s)) &&
        !ROUND8.size && !ROUND8.test);
}

console.log("\n11. TRAINED ON FAMILY C (pre-registration section 30)");
{
    ok("!! ROUND10 is section 30's: round 9's large network, schedule, test and controls, trained on SPLITS_R10's 96 scenes of C, with round 9's 96 scenes of R as the comparison training",
        ROUND10.splits === SPLITS_R10 && SPLITS_R10.train.family === "C" && ROUND10.size === ROUND9.size && ROUND10.train === ROUND9.train && ROUND10.test === ROUND9.test &&
        ROUND10.c1OnTraining === true && ROUND10.c0 === true && ROUND10.emitterMask === true && ROUND10.head === "kernel" && ROUND10.init === "zero-last" &&
        ROUND10.temporal === false && ROUND10.compareTrainSplit === SPLITS_R9.train && !ROUND10.compareSize && RESULTS_R10 === "render/denoise-results-r10.json");
}

console.log("\n12. THE DEPLOYMENT ROUND: ONE NETWORK FOR BOTH FAMILIES (pre-registration section 32)");
{
    ok("!! ROUND11 is section 32's: round 10's large network, schedule, test and controls, trained on SPLITS_R11's 192 scenes of R AND C, with each family's own 96 as the comparison trainings",
        ROUND11.splits === SPLITS_R11 && SPLITS_R11.train.family === "R+C" && ROUND11.size === ROUND10.size && ROUND11.train === ROUND10.train && ROUND11.test === "signflip" &&
        ROUND11.c1OnTraining === true && ROUND11.c0 === true && ROUND11.emitterMask === true && ROUND11.head === "kernel" && ROUND11.init === "zero-last" && ROUND11.temporal === false &&
        Object.keys(ROUND11.compareTrainSplits).join() === "R,C" && ROUND11.compareTrainSplits.R === SPLITS_R7.train && ROUND11.compareTrainSplits.C === SPLITS_R10.train &&
        !ROUND11.compareTrainSplit && !ROUND11.compareSize && RESULTS_R11 === "render/denoise-results-r11.json");
    // a miniature shaped like round 11 -- a training split of both families, each family's half as a comparison training,
    // the sign-flip test -- seeded outside every split, 8 x 8, the small network for speed
    const tr = { R: { family: "R", seeds: [910040, 910041] }, C: { family: "C", seeds: [910042, 910043] } };
    const mini11 = { splits: { train: { family: "R+C", families: ["R", "R", "C", "C"], seeds: [...tr.R.seeds, ...tr.C.seeds] },
                               T1: { family: "R", seeds: [930040, 930041, 930042] }, T2: { family: "C", seeds: [940040, 940041, 940042] } },
                     image: 8, sppIn: 4, sppRef: 16, train: { steps: 2, batch: 2, crop: 8 }, secondarySpp: [], c0: false, head: "kernel", emitterMask: true, test: "signflip" };
    let out = null, runErr = null;
    try { out = runStudy({ ...mini11, compareTrainSplits: tr }); } catch (e) { runErr = e.message; }
    const S = out ? Object.fromEntries(["R", "C"].flatMap((f) => ["T1", "T2"].map((n) => [`${n}${f}`, out.secondary[`${n}@trainedOn${f}`]]))) : {};
    ok("!! each family's own training is run and recorded: its filter, its three networks on both test sets, their statistics, and the primary networks' against its filter",
        !!out && ["R", "C"].every((f) => typeof out.secondary[`filterTrainedOn${f}`]?.sS === "number" && ["T1", "T2"].every((n) => {
            const X = S[`${n}${f}`];
            return X && X.filter.length === 3 && X.net.length === 3 && X.net.every((a) => a.length === 3) && typeof X.k === "number" && typeof X.p === "number" &&
                typeof X.pSign === "number" && typeof X.primaryVsFilter?.p === "number" && typeof X.primaryVsFilter.pSign === "number";
        })) && out.config.compareTrains.R.first === 910040 && out.config.compareTrains.C.first === 910042 && out.config.compareTrain === null, runErr);
    // what each statistic is, recomputed from the tables: the comparison networks against the PRIMARY filter; the primary
    // networks against the comparison's filter
    const stat = (sets) => verdict({ sets, shuffled: null, determinism: true, seedsDistinct: true, c1Train: null, test: "signflip" }).hypotheses;
    const pick = (h) => ({ k: h.k, meanD: h.meanD, p: h.p, pSign: h.pSign });
    let exact = !!out, differs = false;
    for (const f of out ? ["R", "C"] : []) {
        const own = stat({ H1: { ...out.tables.T1, net: S[`T1${f}`].net }, H2: { ...out.tables.T2, net: S[`T2${f}`].net } });
        const pf = stat({ H1: { ...out.tables.T1, filter: S[`T1${f}`].filter }, H2: { ...out.tables.T2, filter: S[`T2${f}`].filter } });
        for (const [n, h] of [["T1", "H1"], ["T2", "H2"]]) {
            const X = S[`${n}${f}`];
            exact &&= ["k", "meanD", "p", "pSign"].every((k) => Object.is(X[k], pick(own[h])[k]) && Object.is(X.primaryVsFilter[k], pick(pf[h])[k]));
            differs ||= !Object.is(X.primaryVsFilter.meanD, out.verdict.hypotheses[h].meanD);
        }
    }
    ok("!! ...and each statistic is the one section 32 names: a family's networks against the PRIMARY filter, the primary networks against THAT family's filter -- recomputed from the tables, exactly",
        exact && differs, out ? `filters: R's ${JSON.stringify(out.secondary.filterTrainedOnR)}, C's ${JSON.stringify(out.secondary.filterTrainedOnC)}, the primary's ${JSON.stringify(out.filter)}` : runErr);
    // and each family's networks are trained on ITS scenes: seed 1 trained here on R's half alone gives R's seed-1 errors
    let own = false;
    if (out) {
        const half = renderSplit(tr.R, { harvest: false, image: 8, sppIn: 4, sppRef: 16, ref2: false, emitterMask: true }).map((im) => ({ x: im.x, ref: im.ref, w: 8, h: 8 }));
        const T1 = renderSplit(mini11.splits.T1, { harvest: false, image: 8, sppIn: 4, sppRef: 16, ref2: true, emitterMask: true });
        const net = trainDenoiser(half, { seed: 1, init: INIT, head: "kernel", ...mini11.train }).net;
        own = T1.every((im, i) => Object.is(relMSE(denoise(net, im.x, 8, 8).y, im.ref), S.T1R.net[0][i])) && S.T1R.net[0].some((v, i) => v !== out.tables.T1.net[0][i]);
    }
    ok("  ...and R's networks are trained on R's scenes alone: seed 1 trained here on them gives its errors bit for bit, which are not the primary's", own);
}

console.log("\n12b. ROUND 47: THE NARROWER NETWORK (pre-registration section 116)");
{
    // round 11 in every option but four: its splits (round 11's training and val scenes, new test scenes), the network's size,
    // no per-family trainings, and the 32-channel network beside it; and its own file
    const changed = ["splits", "size", "compareTrainSplits", "compareSize", "results"];
    ok("!! ROUND47 is section 116's: round 11 in every option -- schedule, seeds, test, controls, mask, head -- but its splits (round 11's 192 training scenes, new tests), the w16 network, and the 32-channel one trained beside it",
        Object.keys(ROUND11).filter((k) => !changed.includes(k)).every((k) => ROUND47[k] === ROUND11[k]) && Object.keys(ROUND47).sort().join() === [...new Set([...Object.keys(ROUND11), "compareSize"])].sort().join() &&
        ROUND47.splits === SPLITS_R47 && SPLITS_R47.train === ROUND11.splits.train && ROUND47.size === "w16" && ROUND47.compareTrainSplits === null &&
        ROUND47.compareSize.size === "large" && ROUND47.compareSize.train === ROUND11.train && ROUND47.train === ROUND11.train && RESULTS_R47 === "render/denoise-results-r47.json" &&
        HARVESTS["--harvest-r47"] === ROUND47 && !Object.values(HARVESTS).some((r) => r !== ROUND47 && r.results === RESULTS_R47));
    // a miniature shaped like round 47, seeded outside every split, 8 x 8: the w16 primary, the large network beside it, both tests
    const mini47 = { splits: { train: { family: "R+C", families: ["R", "R", "C", "C"], seeds: [910050, 910051, 910052, 910053] },
                               T1: { family: "R", seeds: [930050, 930051, 930052] }, T2: { family: "C", seeds: [940050, 940051, 940052] } },
                     image: 8, sppIn: 4, sppRef: 16, train: { steps: 2, batch: 2, crop: 8 }, secondarySpp: [], c0: false, head: "kernel", emitterMask: true, test: "signflip",
                     size: "w16", compareSize: { size: "large", train: { steps: 2, batch: 2, crop: 8 } } };
    let out = null, runErr = null;
    try { out = runStudy(mini47); } catch (e) { runErr = e.message; }
    const big = out && ["T1", "T2"].map((n) => out.secondary[`${n}@large`]);
    ok("!! the miniature runs: the w16 networks are the primary, and the large networks beside them are measured on the same test images with their statistics against the same filter",
        !!out && out.config.size === "w16" && out.config.compareSize.size === "large" && big.every((X) => X && X.net.length === 3 && X.net.every((a) => a.length === 3) &&
            typeof X.k === "number" && typeof X.meanD === "number" && typeof X.p === "number") &&
        big.some((X, i) => X.net[0].some((v, j) => v !== out.tables[["T1", "T2"][i]].net[0][j])), runErr || (out ? `H1 w16 mean d ${out.verdict.hypotheses.H1.meanD.toFixed(3)}, large ${big[0].meanD.toFixed(3)}` : ""));
}

console.log("\n12c. ROUND 47'S VERDICT (pre-registration section 118), RE-DERIVED FROM render/denoise-results-r47.json AS COMMITTED");
{
    // SABOTAGED (section 118), each restored byte-identical: Q1 the verdict read off round 11's file, 2 red; Q2 the fixture's shift
    // too small to move the rule, 1 red; Q3 C's gap read as within its prediction, 1 red
    const res = JSON.parse(fs.readFileSync(path.join(ENG, RESULTS_R47), "utf8")), V0 = res.verdict;
    // the verdict again from the file's own tables and controls -- C2 is the file's own shuffled-target figure, whose networks'
    // errors the file does not keep, so it is carried in as a prior of this round's own (the one input not re-derived here)
    const again = (tables) => verdict({ sets: { H1: tables.T1, H2: tables.T2 }, shuffled: null, determinism: res.determinism, seedsDistinct: res.seedsDistinct,
        c0: res.trainFit, c1Train: res.trainSanity, c2Prior: { round: 47, meanD: V0.controls.C2.meanD, ok: V0.controls.C2.ok }, test: "signflip" });
    const V = again(res.tables), pick = (h) => [h.status, h.k, h.n, h.meanD, h.p, h.reject].join("|");
    ok("!! *** section 118, by section 116's rule: ROUND 47 IS REPORTED, H1 AND H2 SUPPORTED -- the 16-channel network beats the filter on new scenes of R (10 of 12, mean d +0.376) and of C (11 of 12, +0.425), every control held -- so it goes to the device, as denoise-w16-device ***",
        V0.run === "reported" && V.run === "reported" && ["H1", "H2"].every((h) => pick(V.hypotheses[h]) === pick(V0.hypotheses[h]) && V.hypotheses[h].status === "supported") &&
        V0.hypotheses.H1.k === 10 && V0.hypotheses.H2.k === 11 && res.config.size === "w16" && res.config.splits.T1.first === 48000 && res.config.splits.T2.first === 49000 &&
        res.trainFit.ratios.every((x) => x <= 0.8) && res.trainSanity.netWins >= 176 && res.trainSanity.filterWins >= 176 && res.determinism && res.seedsDistinct && V0.controls.C2.meanD <= 0,
        `H1 ${V.hypotheses.H1.k} of 12, mean d ${V.hypotheses.H1.meanD.toFixed(3)}, p ${V.hypotheses.H1.p}; H2 ${V.hypotheses.H2.k} of 12, mean d ${V.hypotheses.H2.meanD.toFixed(3)}, p ${V.hypotheses.H2.p}; C2 ${V0.controls.C2.meanD.toFixed(3)}`);
    // the rule moves: the network's errors on C raised by e^0.5 leave H2 unsupported; on both, neither
    const scale = (T, f) => ({ ...T, net: T.net.map((row) => row.map((x) => x * f)) });
    const fx = [again({ ...res.tables, T2: scale(res.tables.T2, Math.exp(0.5)) }), again({ T1: scale(res.tables.T1, Math.exp(0.5)), T2: scale(res.tables.T2, Math.exp(0.5)) })];
    ok("  ...and the rule moves: the w16 network's errors on C raised by e^0.5 leave H2 unsupported and H1 standing; on both, neither stands",
        fx[0].hypotheses.H1.status === "supported" && fx[0].hypotheses.H2.status !== "supported" && fx[1].hypotheses.H1.status !== "supported" && fx[1].hypotheses.H2.status !== "supported",
        `${fx[0].hypotheses.H2.status}; ${fx[1].hypotheses.H1.status} / ${fx[1].hypotheses.H2.status}`);
    // the secondary: what the narrowing costs, on the same images -- the seed-mean errors, w16 over large, as a geometric mean
    const gap = (name) => { const w = res.tables[name].net, L = res.secondary[`${name}@large`].net, n = w[0].length;
        const m = (rows, i) => rows.reduce((a, r) => a + r[i], 0) / rows.length; let s2 = 0; for (let i = 0; i < n; i++) s2 += Math.log(m(w, i) / m(L, i)); return Math.exp(s2 / n); };
    const gR = gap("T1"), gC = gap("T2");
    ok("  ...and section 116's predictions are read as made: H1's +0.30-0.50 and H2's +0.40-0.70 MET; the w16 error 10-25 % above the large network's MET on R (+11.7 %) and MISSED on C (+29.7 %)",
        V.hypotheses.H1.meanD >= 0.30 && V.hypotheses.H1.meanD <= 0.50 && V.hypotheses.H2.meanD >= 0.40 && V.hypotheses.H2.meanD <= 0.70 &&
        gR >= 1.10 && gR <= 1.25 && gC > 1.25 && Math.abs(gR - Math.exp(res.secondary["T1@large"].meanD - V.hypotheses.H1.meanD)) < 1e-9,
        `w16 / large error: R ${gR.toFixed(4)}, C ${gC.toFixed(4)}; the large network's mean d ${res.secondary["T1@large"].meanD.toFixed(3)} / ${res.secondary["T2@large"].meanD.toFixed(3)}`);
}

console.log("\n13. THE RUNNER HANDS THE STUDY EVERY OPTION A ROUND NAMES (pre-registration section 33)");
{
    // round 11's harvest ran without its secondary: the runner passed options one by one, and compareTrainSplits was not one
    const rounds = [["--harvest-r1", ROUND1], ["--harvest-r2", ROUND2], ["--harvest-r3", ROUND3], ["--harvest-r4", ROUND4], ["--harvest-r5", ROUND5], ["--harvest-r6", ROUND6],
                    ["--harvest-r7", ROUND7], ["--harvest-r8", ROUND8], ["--harvest-r9", ROUND9], ["--harvest-r10", ROUND10], ["--harvest-r11", ROUND11], ["--harvest-r47", ROUND47]];
    const whole = (round) => { const o = studyOptions(round), want = Object.keys(round).filter((k) => k !== "results");
                               return Object.keys(o).sort().join() === want.sort().join() && want.every((k) => o[k] === round[k]); };
    ok("!! *** every round's command runs THAT round, and the study is handed every option it names -- the same objects -- less only the file it writes ***",
        rounds.every(([f, r]) => HARVESTS[f] === r && whole(r)) && "compareTrainSplits" in studyOptions(ROUND11) && !("results" in studyOptions(ROUND11)),
        `${rounds.length} rounds; round 11 hands over ${Object.keys(studyOptions(ROUND11)).length} options`);
    // and runStudy reads every one of them: each is a name in its parameter list
    const params = new Set([...(runStudy.toString().match(/^function runStudy\(\{([\s\S]*?)\}\s*=\s*\{\}\)/)?.[1] ?? "").matchAll(/(\w+)\s*=/g)].map((m) => m[1]));
    const unread = rounds.flatMap(([, r]) => Object.keys(studyOptions(r)).filter((k) => !params.has(k)));
    ok("  ...and runStudy takes every one of them by name -- none is handed over only to be ignored", params.size > 20 && unread.length === 0, unread.join() || `${params.size} parameters`);
    const S2 = HARVESTS["--secondary-r11"], others = Object.values(HARVESTS).filter((r) => r !== S2).map((r) => r.results);
    ok("!! --secondary-r11 is round 11 in every option, writing its own file -- never the harvest's, never any round's",
        whole(S2) && Object.keys(studyOptions(S2)).every((k) => S2[k] === ROUND11[k]) && Object.keys(S2).length === Object.keys(ROUND11).length &&
        S2.results === "render/denoise-results-r11-secondary.json" && !others.includes(S2.results));
    // the verdict is in the file, committed before it is read: the harvest branch logs no part of it
    const cli = fs.readFileSync(path.join(ENG, "tools/denoiseStudy.mjs"), "utf8"), branch = cli.slice(cli.indexOf("} else if (round) {"), cli.indexOf("} else {", cli.indexOf("} else if (round) {")));
    ok("  a harvest's log names no part of its verdict: the runner's harvest branch never reads it", branch.length > 500 && !/verdict|status|supported/.test(branch.replace(/\/\/.*$/gm, "")));
}

console.log("\n14. THE MESH ROUND: THE SHIPPED PAIR, NOTHING TRAINED (pre-registration section 79)");
{
    const { runShippedStudy, ROUND_MESH, RESULTS_MESH, SHIPPED_NET } = await imp("render/denoiseStudy.mjs");
    const { SPLITS_MESH } = await imp("render/denoiseScenes.mjs");
    const { decodeNet } = await imp("render/denoiseDevice.mjs");
    const shipped = JSON.parse(fs.readFileSync(path.join(ENG, SHIPPED_NET), "utf8")), net = decodeNet(shipped.net);
    const r11 = JSON.parse(fs.readFileSync(path.join(ENG, RESULTS_R11), "utf8"));
    ok("!! ROUND_MESH: the mesh splits, the emitter mask, the sign-flip test, and C2 CITED from round 11 -- its mean d the one round 11's file holds, bit for bit",
        ROUND_MESH.splits === SPLITS_MESH && ROUND_MESH.emitterMask === true && ROUND_MESH.test === "signflip" && ROUND_MESH.results === RESULTS_MESH &&
        RESULTS_MESH === "render/denoise-results-mesh.json" && SHIPPED_NET === "render/denoise-net-r11.json" && ROUND_MESH.c2Prior.round === 11 &&
        Object.is(ROUND_MESH.c2Prior.meanD, r11.verdict.controls.C2.meanD) && ROUND_MESH.c2Prior.ok === r11.verdict.controls.C2.ok,
        `cited ${ROUND_MESH.c2Prior.meanD}; round 11's file ${r11.verdict.controls.C2.meanD}`);
    let threw = null; try { runShippedStudy({ net, filter: shipped.filter, image: 4, sppIn: 1, sppRef: 1 }); } catch (e) { threw = e.message; }
    ok("!! on the REAL mesh splits without harvest it is refused at its first scene", /seed 36000 is a dataset seed/.test(threw || ""), threw);
    let threw2 = null; try { runShippedStudy({ splits: SPLITS_MESH }); } catch (e) { threw2 = e.message; }
    ok("  without the shipped network and filter it refuses rather than run something else", /needs the shipped network and filter/.test(threw2 || ""));
    // the miniature: V and M scenes seeded outside every split, 16 x 16 -- the PLUMBING, no number read for its value
    const mini = Object.freeze({ T1: Object.freeze({ family: "V", seeds: Object.freeze([950000, 950001]) }), T2: Object.freeze({ family: "M", seeds: Object.freeze([960000, 960001]) }) });
    const out = runShippedStudy({ splits: mini, net, filter: shipped.filter, image: 16, sppIn: 4, sppRef: 16 });
    const V = out.verdict, T = out.tables;
    const shapeOk = ["T1", "T2"].every((n) => ["noisy", "filter", "floor"].every((k) => T[n][k].length === 2 && T[n][k].every(Number.isFinite)) &&
        T[n].net.length === 1 && T[n].net[0].length === 2);
    ok("!! end to end on the miniature: two test sets, one network column (the shipped seed), C4 from the forward pass run twice, C5, and C2 cited from round 11",
        shapeOk && out.determinism === true && out.seedsDistinct === true && out.seedCount === 12 && V.controls.C2.citedFrom === 11 && V.controls.C2.ok === true &&
        V.controls.C4 === true && V.controls.C5 === true && Object.keys(V.hypotheses).join() === "H1,H2" && V.hypotheses.H1.test === "signflip",
        `run ${V.run}; ${JSON.stringify(V.controls.C2)}`);
    // the measured errors are the page's own arithmetic: recomputed here from scratch for one image of each set
    const { renderSplit: rs } = await imp("render/denoiseStudy.mjs");
    const again = ["T1", "T2"].map((n) => rs(mini[n], { harvest: false, image: 16, sppIn: 4, sppRef: 16, ref2: true, emitterMask: true }));
    const { jointBilateral } = await imp("render/denoiseFilter.mjs");
    const same = ["T1", "T2"].every((n, k) => { const im = again[k][1];
        return Object.is(T[n].net[0][1], relMSE(denoise(net, im.x, 16, 16).y, im.ref)) && Object.is(T[n].filter[1], relMSE(jointBilateral(im.x, 16, 16, shipped.filter), im.ref)) &&
               Object.is(T[n].floor[1], relMSE(im.ref2, im.ref)); });
    ok("!! each set's network and filter errors are the shipped pair's on THAT set's own image, recomputed from nothing, bit for bit", same);
    ok("  the filter it ran is the one the shipped file names", JSON.stringify(out.filter) === JSON.stringify(shipped.filter) && JSON.stringify(out.config.filter) === JSON.stringify(shipped.filter));
    // the command: decodes the shipped file, writes the mesh round's file and refuses an existing one, logs no part of the verdict
    const cli = fs.readFileSync(path.join(ENG, "tools/denoiseStudy.mjs"), "utf8");
    const b0 = cli.indexOf('} else if (args.includes("--harvest-mesh")) {'), branch = b0 >= 0 ? cli.slice(b0, cli.indexOf('} else if (args.includes("--harvest-mesh-c")) {', b0)) : "";
    const code = branch.replace(/\/\/.*$/gm, "");
    // section 80: the committed results, read back by code -- the verdict re-derived from the file's own tables under
    // ROUND_MESH's rule, so the section's "both supported" is the rule's output, not a sentence somebody typed
    const mfile = path.join(ENG, RESULTS_MESH);
    if (fs.existsSync(mfile)) {
        const res = JSON.parse(fs.readFileSync(mfile, "utf8"));
        const again = verdict({ sets: { H1: res.tables.T1, H2: res.tables.T2 }, shuffled: null, c2Prior: ROUND_MESH.c2Prior,
                                determinism: res.determinism, seedsDistinct: res.seedsDistinct, test: ROUND_MESH.test });
        const st = (v) => Object.fromEntries(Object.entries(v.hypotheses).map(([h, x]) => [h, [x.status, x.k, Number(x.meanD.toFixed(12))]]));
        ok("!! *** section 80: verdict() over the committed mesh results' own tables gives the file's verdict -- reported, H1 and H2 SUPPORTED ***",
            again.run === "reported" && res.verdict.run === "reported" && JSON.stringify(st(again)) === JSON.stringify(st(res.verdict)) &&
            again.hypotheses.H1.status === "supported" && again.hypotheses.H2.status === "supported" &&
            res.shipped && res.shipped.file === SHIPPED_NET && /^[0-9a-f]{64}$/.test(res.shipped.sha256),
            `H1 ${again.hypotheses.H1.status} (mean d ${again.hypotheses.H1.meanD.toFixed(3)}, ${again.hypotheses.H1.k}/12), ` +
            `H2 ${again.hypotheses.H2.status} (mean d ${again.hypotheses.H2.meanD.toFixed(3)}, ${again.hypotheses.H2.k}/12)`);
        const page = fs.readFileSync(path.join(ENG, "denoise.html"), "utf8"), scope = (page.match(/<p class="scope" id="scope">([\s\S]*?)<\/p>/) || [, ""])[1];
        ok("!! ...and the page's scope note widens exactly as section 79 allowed: both mesh families named, section 80 cited, R and C still the only ones it renders",
            /voxel\s+structures/.test(scope) && /lathed and extruded solids/.test(scope) && /section 80/.test(scope) && /renders only those/.test(scope) &&
            /any other\s+material, light or sky/.test(scope));
    } else ok("!! section 80 reads render/denoise-results-mesh.json, and it is not there", false);
    ok("!! --harvest-mesh decodes the shipped file with decodeNet, runs runShippedStudy under harvest, writes ROUND_MESH.results and never an existing one, and logs no verdict",
        branch.length > 400 && /decodeNet\(shipped\.net\)/.test(code) && /filter: shipped\.filter/.test(code) && /runShippedStudy\(/.test(code) && /harvest: true/.test(code) &&
        /path\.join\(ENG, ROUND_MESH\.results\)/.test(code) && /existsSync\(file\)/.test(code) && /sha256/.test(code) && !/verdict|status|supported/.test(code));
}

console.log("\n14b. ROUND 56: THE SAME SHAPES IN FAMILY C'S MATERIALS AND LIGHT, THE SHIPPED PAIR, NOTHING TRAINED (pre-registration section 127)");
{
    const { runShippedStudy, ROUND_MESH, ROUND_MESH_C, RESULTS_MESH_C, SHIPPED_NET } = await imp("render/denoiseStudy.mjs");
    const { SPLITS_MESH_C } = await imp("render/denoiseScenes.mjs");
    const { decodeNet } = await imp("render/denoiseDevice.mjs");
    const shipped = JSON.parse(fs.readFileSync(path.join(ENG, SHIPPED_NET), "utf8")), net = decodeNet(shipped.net);
    ok("!! ROUND_MESH_C: the VC and MC splits, the emitter mask, the sign-flip test, and C2 cited from round 11 as section 79 cites it -- its own results file",
        ROUND_MESH_C.splits === SPLITS_MESH_C && ROUND_MESH_C.emitterMask === true && ROUND_MESH_C.test === "signflip" && ROUND_MESH_C.c2Prior === ROUND_MESH.c2Prior &&
        ROUND_MESH_C.results === RESULTS_MESH_C && RESULTS_MESH_C === "render/denoise-results-mesh-c.json");
    let threw = null; try { runShippedStudy({ splits: SPLITS_MESH_C, net, filter: shipped.filter, image: 4, sppIn: 1, sppRef: 1 }); } catch (e) { threw = e.message; }
    ok("!! on the REAL splits without harvest it is refused at its first scene", /seed 50000 is a dataset seed/.test(threw || ""), threw);
    // the miniature: VC and MC scenes seeded outside every split, 16 x 16 -- the PLUMBING, no number read for its value
    const mini = Object.freeze({ T1: Object.freeze({ family: "VC", seeds: Object.freeze([950100, 950101]) }), T2: Object.freeze({ family: "MC", seeds: Object.freeze([960100, 960101]) }) });
    const out = runShippedStudy({ splits: mini, net, filter: shipped.filter, image: 16, sppIn: 4, sppRef: 16 });
    const V = out.verdict, T = out.tables;
    const shapeOk = ["T1", "T2"].every((n) => ["noisy", "filter", "floor"].every((k) => T[n][k].length === 2 && T[n][k].every(Number.isFinite)) && T[n].net.length === 1 && T[n].net[0].length === 2);
    ok("!! end to end on the miniature: two test sets of VC and MC, one network column, C4, C5, and C2 cited from round 11",
        shapeOk && out.determinism === true && out.seedsDistinct === true && out.seedCount === 12 && V.controls.C2.citedFrom === 11 && V.controls.C4 === true && V.controls.C5 === true &&
        Object.keys(V.hypotheses).join() === "H1,H2" && V.hypotheses.H1.test === "signflip" && out.config.splits.T1.family === "VC" && out.config.splits.T2.family === "MC",
        `run ${V.run}; ${JSON.stringify(out.config.splits)}`);
    // the command: section 79's branch on ROUND_MESH_C, writing its own file and never an existing one, logging no verdict
    const cli = fs.readFileSync(path.join(ENG, "tools/denoiseStudy.mjs"), "utf8");
    const b0 = cli.indexOf('} else if (args.includes("--harvest-mesh-c")) {'), branch = b0 >= 0 ? cli.slice(b0, cli.indexOf('} else if (args.includes("--harvest-page")) {', b0)) : "";
    const code = branch.replace(/\/\/.*$/gm, "");
    ok("!! --harvest-mesh-c decodes the shipped file with decodeNet, runs runShippedStudy on ROUND_MESH_C's splits under harvest, writes ROUND_MESH_C.results and never an existing one, and logs no verdict",
        branch.length > 400 && /decodeNet\(shipped\.net\)/.test(code) && /filter: shipped\.filter/.test(code) && /runShippedStudy\(\{ splits: ROUND_MESH_C\.splits,/.test(code) && /harvest: true/.test(code) &&
        /path\.join\(ENG, ROUND_MESH_C\.results\)/.test(code) && /existsSync\(file\)/.test(code) && /sha256/.test(code) && !/ROUND_MESH\./.test(code) && !/verdict|status|supported/.test(code));
    // section 128: the committed results, read back by code -- the verdict re-derived from the file's own tables under ROUND_MESH_C's
    // rule, so "neither holds" is the rule's output, not a sentence somebody typed; then the predictions, read as made
    const cfile = path.join(ENG, RESULTS_MESH_C);
    if (fs.existsSync(cfile)) {
        const res = JSON.parse(fs.readFileSync(cfile, "utf8"));
        const again = verdict({ sets: { H1: res.tables.T1, H2: res.tables.T2 }, shuffled: null, c2Prior: ROUND_MESH_C.c2Prior,
                                determinism: res.determinism, seedsDistinct: res.seedsDistinct, test: ROUND_MESH_C.test });
        const st = (v) => Object.fromEntries(Object.entries(v.hypotheses).map(([h, x]) => [h, [x.status, x.k, Number(x.meanD.toFixed(12)), x.threshold]]));
        const H1 = again.hypotheses.H1, H2 = again.hypotheses.H2;
        ok("!! *** section 128: verdict() over the committed results' own tables gives the file's verdict -- reported, H1 and H2 NOT SUPPORTED, H2 at p 0.036 against Holm's 0.025 ***",
            again.run === "reported" && res.verdict.run === "reported" && JSON.stringify(st(again)) === JSON.stringify(st(res.verdict)) &&
            H1.status === "not supported" && H2.status === "not supported" && H2.threshold === 0.025 && H2.p > 0.025 && H2.p < 0.05 && H1.meanD < 0 && H2.meanD > 0 &&
            again.controls.C1 === true && again.controls.C4 === true && again.controls.C5 === true && again.controls.C2.citedFrom === 11 &&
            res.config.splits.T1.family === "VC" && res.config.splits.T2.family === "MC" && res.config.trained === "nothing -- the shipped network and filter" &&
            res.shipped && res.shipped.file === SHIPPED_NET && /^f1a84d47/.test(res.shipped.sha256),
            `H1 ${H1.status} (mean d ${H1.meanD.toFixed(3)}, ${H1.k}/12, p ${H1.p.toFixed(4)}), H2 ${H2.status} (mean d ${H2.meanD.toFixed(3)}, ${H2.k}/12, p ${H2.p.toFixed(4)} against ${H2.threshold})`);
        // the one image section 128 names: the only one of 24 on which the network did worse than its own input
        const T = res.tables.T1, worse = [...["T1", "T2"].flatMap((n) => res.tables[n].net[0].map((v, i) => (v > res.tables[n].noisy[i] ? `${n}:${i}` : null)))].filter(Boolean);
        ok("  ...and section 128's one image: VC's second scene (seed 50001) is the only image of 24 on which the network did worse than its input, its d about -3",
            worse.join() === "T1:1" && Math.abs(Math.log(T.filter[1]) - Math.log(T.net[0][1]) + 3.024) < 0.01, `${worse.join(", ")}; d ${(Math.log(T.filter[1]) - Math.log(T.net[0][1])).toFixed(3)}`);
        // section 127's predictions, read as made: P1 held; P2 and P3 failed; P4 half -- both below C's 0.765, but MC NOT below VC
        const r11 = JSON.parse(fs.readFileSync(path.join(ENG, RESULTS_R11), "utf8")), cD = r11.verdict.hypotheses.H2.meanD;
        const P = { P1: again.controls.C1 === true, P2: H1.status === "supported", P3: H2.status === "supported", P4a: H1.meanD < cD && H2.meanD < cD, P4b: H2.meanD < H1.meanD };
        ok("  section 127's predictions, read as made: P1 held, P2 and P3 failed, and P4 is half wrong -- both means below round 11's C (0.765), but MC's above VC's",
            P.P1 && !P.P2 && !P.P3 && P.P4a && !P.P4b && Math.abs(cD - 0.7646) < 1e-4, JSON.stringify(P));
        const page = fs.readFileSync(path.join(ENG, "denoise.html"), "utf8"), scope = (page.match(/<p class="scope" id="scope">([\s\S]*?)<\/p>/) || [, ""])[1];
        ok("!! ...and the page's scope note stays as section 80 left it: section 80 cited, no other material, light or sky claimed, nothing of round 56's families",
            /section 80/.test(scope) && /any other\s+material, light or sky/.test(scope) && !/section 128|VC|MC|C's materials/.test(scope));
    } else ok("!! section 128 reads render/denoise-results-mesh-c.json, and it is not there", false);
}

console.log("\n14c. ROUND 58: path-tracer.html'S OWN SIX SCENES, THE SHIPPED PAIR, NOTHING TRAINED (pre-registration section 131)");
{
    const { runShippedStudy, ROUND_MESH, ROUND_PAGE, RESULTS_PAGE, SHIPPED_NET } = await imp("render/denoiseStudy.mjs");
    const { SPLITS_PAGE } = await imp("render/denoiseScenes.mjs");
    const { decodeNet } = await imp("render/denoiseDevice.mjs");
    const shipped = JSON.parse(fs.readFileSync(path.join(ENG, SHIPPED_NET), "utf8")), net = decodeNet(shipped.net);
    ok("!! ROUND_PAGE: the page's split, the emitter mask, the sign-flip test, C2 cited from round 11 as section 79 cites it, C1 at 5 of 6 -- its own results file",
        ROUND_PAGE.splits === SPLITS_PAGE && ROUND_PAGE.emitterMask === true && ROUND_PAGE.test === "signflip" && ROUND_PAGE.c2Prior === ROUND_MESH.c2Prior && ROUND_PAGE.c1Min === 5 &&
        ROUND_PAGE.results === RESULTS_PAGE && RESULTS_PAGE === "render/denoise-results-page.json");
    let threw = null; try { runShippedStudy({ splits: SPLITS_PAGE, c1Min: 5, net, filter: shipped.filter, image: 4, sppIn: 1, sppRef: 1 }); } catch (e) { threw = e.message; }
    ok("!! on the REAL split without harvest it is refused at its first scene", /seed 52000 is a dataset seed/.test(threw || ""), threw);
    // the miniature: the six page scenes on seeds outside every split, 16 x 16 -- the PLUMBING, no number read for its value
    const mini = Object.freeze({ T1: Object.freeze({ family: "P", seeds: Object.freeze([960300, 960301, 960302, 960303, 960304, 960305]) }) });
    const out = runShippedStudy({ splits: mini, c1Min: 5, net, filter: shipped.filter, image: 16, sppIn: 4, sppRef: 16 });
    const V = out.verdict, T = out.tables;
    const shapeOk = Object.keys(T).join() === "T1" && ["noisy", "filter", "floor"].every((k) => T.T1[k].length === 6 && T.T1[k].every(Number.isFinite)) && T.T1.net.length === 1 && T.T1.net[0].length === 6;
    ok("!! end to end on the miniature: ONE test set of the six page scenes, one hypothesis tested at 0.05 (Holm over one), one network column, C1 judged at 5 of 6, C4, C5, C2 cited from round 11",
        shapeOk && Object.keys(V.hypotheses).join() === "H1" && V.hypotheses.H1.threshold === 0.05 && V.hypotheses.H1.test === "signflip" && out.config.c1Min === 5 &&
        out.determinism === true && out.seedsDistinct === true && out.seedCount === 18 && V.controls.C2.citedFrom === 11 && V.controls.C4 === true && V.controls.C5 === true &&
        out.config.splits.T1.family === "P" && !("T2" in out.config.splits) && !V.reasons.some((r) => /both need 11/.test(r)),
        `run ${V.run}; ${JSON.stringify(out.config.splits)}${V.reasons.length ? "; " + V.reasons.join(" | ") : ""}`);
    // the command: section 79's branch on ROUND_PAGE, with its C1, writing its own file and never an existing one, logging no verdict
    const cli = fs.readFileSync(path.join(ENG, "tools/denoiseStudy.mjs"), "utf8");
    const b0 = cli.indexOf('} else if (args.includes("--harvest-page")) {'), branch = b0 >= 0 ? cli.slice(b0, cli.indexOf('} else if (args.includes("--harvest-framegen")) {', b0)) : "";
    const code = branch.replace(/\/\/.*$/gm, "");
    ok("!! --harvest-page decodes the shipped file with decodeNet, runs runShippedStudy on ROUND_PAGE's split with its C1 under harvest, writes ROUND_PAGE.results and never an existing one, and logs no verdict",
        branch.length > 400 && /decodeNet\(shipped\.net\)/.test(code) && /filter: shipped\.filter/.test(code) && /runShippedStudy\(\{ splits: ROUND_PAGE\.splits, c1Min: ROUND_PAGE\.c1Min,/.test(code) && /harvest: true/.test(code) &&
        /path\.join\(ENG, ROUND_PAGE\.results\)/.test(code) && /existsSync\(file\)/.test(code) && /sha256/.test(code) && !/ROUND_MESH(_C)?\./.test(code) && !/verdict|status|supported/.test(code));
    // section 132: the committed results read back by code -- the verdict re-derived from the file's tables under ROUND_PAGE's rule,
    // the furnace pair named as the ties they are, the predictions as made, and the page's note widened exactly so far
    const pfile = path.join(ENG, RESULTS_PAGE);
    if (fs.existsSync(pfile)) {
        const res = JSON.parse(fs.readFileSync(pfile, "utf8")), { makeScene } = await imp("render/denoiseScenes.mjs");
        const again = verdict({ sets: { H1: res.tables.T1 }, shuffled: null, c2Prior: ROUND_PAGE.c2Prior, determinism: res.determinism, seedsDistinct: res.seedsDistinct,
                                test: ROUND_PAGE.test, c1Min: ROUND_PAGE.c1Min });
        const H1 = again.hypotheses.H1, f = res.verdict.hypotheses.H1;
        ok("!! *** section 132: verdict() over the committed results' own table gives the file's verdict -- reported, H1 SUPPORTED: mean d 0.480, 5 of 6, p 0.031 against 0.05 ***",
            again.run === "reported" && res.verdict.run === "reported" && H1.status === "supported" && f.status === "supported" && H1.k === f.k && Object.is(H1.meanD, f.meanD) &&
            H1.k === 5 && H1.threshold === 0.05 && Math.abs(H1.p - 2 / 64) < 1e-12 && Math.abs(H1.meanD - 0.4798) < 1e-4 && again.controls.C1 === true && res.config.c1Min === 5 &&
            res.config.splits.T1.family === "P" && res.shipped && res.shipped.file === SHIPPED_NET && /^f1a84d47/.test(res.shipped.sha256),
            `H1 ${H1.status} (mean d ${H1.meanD.toFixed(3)}, ${H1.k}/6, p ${H1.p}); C1 net ${H1.c1.netWins}, filter ${H1.c1.filterWins} of 6`);
        const T = res.tables.T1, names = SPLITS_PAGE.T1.seeds.map((s2) => makeScene("P", s2).page), d = T.filter.map((x, i) => Math.log(x) - Math.log(T.net[0][i]));
        const worse = names.filter((n, i) => T.net[0][i] > T.noisy[i] || T.filter[i] > T.noisy[i]), ties = names.filter((n, i) => Math.abs(d[i]) < 0.05);
        ok("  ...and section 132's reading: both methods worse than the input on the furnace alone; the furnace and enclosed ties (|d| < 0.05); the four others won by more than 0.4",
            worse.join() === "furnace" && T.net[0][names.indexOf("furnace")] > T.noisy[names.indexOf("furnace")] && T.filter[names.indexOf("furnace")] > T.noisy[names.indexOf("furnace")] &&
            ties.sort().join() === "enclosed,furnace" && names.filter((n, i) => d[i] > 0.4).sort().join() === "gradient,pair,rough,roughcomp",
            names.map((n, i) => `${n} ${d[i].toFixed(3)}`).join(", "));
        // section 131's predictions, read as made: P1 held; P2 (not supported) FAILED; P3 half -- rough the largest, roughcomp not second
        const order = names.map((n, i) => [n, d[i]]).sort((a, b) => b[1] - a[1]).map((x) => x[0]);
        ok("  section 131's predictions, read as made: P1 held, P2 FAILED (H1 held), P3 half right -- the largest win on rough, roughcomp's only fourth",
            again.controls.C1 === true && H1.status === "supported" && order[0] === "rough" && order.indexOf("roughcomp") === 3, order.join(" > "));
        const page = fs.readFileSync(path.join(ENG, "denoise.html"), "utf8"), scope = (page.match(/<p class="scope" id="scope">([\s\S]*?)<\/p>/) || [, ""])[1];
        ok("!! ...and the page's scope note widens exactly as section 131 allowed: the path tracer page's six scenes, section 132 cited, the furnace named, no other material, light or sky",
            /path tracer page's own six\s+scenes/.test(scope) && /section 132/.test(scope) && /furnace/.test(scope) && /any other material, light or sky/.test(scope));
    } else ok("!! section 132 reads render/denoise-results-page.json, and it is not there", false);
}

console.log("\n14d. ROUND 59: FSR3's FRAME GENERATION BETWEEN TWO OF ROUND 32's CHAIN FRAMES (pre-registration section 133)");
{
    const { runFrameGenStudy, ROUND_FRAMEGEN, RESULTS_FRAMEGEN, frameGenSets, ROUND_TEMPORALUP, SHIPPED_NET } = await imp("render/denoiseStudy.mjs");
    const D = await imp("render/denoiseScenes.mjs"), { decodeNet } = await imp("render/denoiseDevice.mjs");
    const net = decodeNet(JSON.parse(fs.readFileSync(path.join(ENG, SHIPPED_NET), "utf8")).net);
    const earlier = new Set([D.SPLITS, D.SPLITS_R2, D.SPLITS_R3, D.SPLITS_R4, D.SPLITS_R5, D.SPLITS_R6, D.SPLITS_R7, D.SPLITS_R8, D.SPLITS_R9, D.SPLITS_R10, D.SPLITS_R11, D.SPLITS_MESH, D.SPLITS_FSR1,
        D.SPLITS_HALFRES, D.SPLITS_EMITTER, D.SPLITS_TEMPORALUP, D.SPLITS_R47, D.SPLITS_MESH_C, D.SPLITS_PAGE].flatMap((S) => Object.values(S).flatMap((x) => x.seeds)));
    ok("!! ROUND_FRAMEGEN: its split on seeds no earlier split used, round 32's image size, the sign-flip test, C2 cited from round 11 -- its own results file",
        ROUND_FRAMEGEN.splits === D.SPLITS_FRAMEGEN && D.SPLITS_FRAMEGEN.T1.seeds.every((s2) => !earlier.has(s2)) && ROUND_FRAMEGEN.image === ROUND_TEMPORALUP.image && ROUND_FRAMEGEN.image === 256 &&
        ROUND_FRAMEGEN.test === "signflip" && ROUND_FRAMEGEN.c2Prior === ROUND_TEMPORALUP.c2Prior && RESULTS_FRAMEGEN === "render/denoise-results-framegen.json" && ROUND_FRAMEGEN.results === RESULTS_FRAMEGEN);
    // the two hypotheses' sets by name: G the candidate's column in both, X and R the comparators, the newer frame's noisy input
    const t = { G: [1], X: [2], R: [3], noisy: [4], floor: [5] }, hs = frameGenSets(t);
    ok("  frameGenSets: H1 G against the cross-fade X, H2 G against the repeated R, both over the newer frame's noisy input and the floor",
        hs.H1.net[0] === t.G && hs.H1.filter === t.X && hs.H2.net[0] === t.G && hs.H2.filter === t.R && hs.H1.noisy === t.noisy && hs.H2.noisy === t.noisy && hs.H1.floor === t.floor);
    let threw = null; try { runFrameGenStudy({ net, image: 4, sppIn: 1, sppRef: 1 }); } catch (e) { threw = e.message; }
    ok("!! on the REAL split without harvest it is refused at its first scene", /seed 53000 is a dataset seed/.test(threw || ""), threw);
    // the miniature: an R and a C scene outside every split at 16 x 16 -- the PLUMBING, no number read for its value
    const mini = Object.freeze({ T1: Object.freeze({ family: "R+C", families: Object.freeze(["R", "C"]), seeds: Object.freeze([990910, 990911]) }) });
    const out = runFrameGenStudy({ splits: mini, net, image: 16, sppIn: 4, sppRef: 8 }), V = out.verdict;
    ok("!! end to end on the miniature: both hypotheses, every arm measured on both images, C4 from the frames re-made, C5 over 22 render seeds, C2 cited, the field's check reported, and not reported by C1 alone (two images)",
        Object.keys(V.hypotheses).join() === "H1,H2" && ["G", "X", "R", "O7", "noisy", "Bmid1", "GNoFill", "floor"].every((k) => out.tables[k].length === 2 && out.tables[k].every(Number.isFinite)) &&
        out.determinism === true && out.seedsDistinct === true && out.seedCount === 22 && V.controls.C2.citedFrom === 11 && out.secondary.field.length === 2 &&
        // at 16 x 16 the field moves pixels under half a pixel on one of the two, and the check rounds to whole pixels: no farther, there
        out.secondary.field.every((f) => f.pointWarped <= f.pointStill && f.holes === 0) && out.config.fill.reach === 16 &&
        V.run === "not reported" && V.reasons.length === 2 && V.reasons.every((r) => /^C1 on H[12]: .* of 2; both need 11$/.test(r)), `run ${V.run}, by C1 alone on two images`);
    const cli = fs.readFileSync(path.join(ENG, "tools/denoiseStudy.mjs"), "utf8");
    const b0 = cli.indexOf('} else if (args.includes("--harvest-framegen")) {'), branch = b0 >= 0 ? cli.slice(b0, cli.indexOf('} else if (args.includes("--harvest-framegen-lf")) {', b0)) : "";
    const code = branch.replace(/\/\/.*$/gm, "");
    ok("!! --harvest-framegen decodes the shipped file with decodeNet, runs runFrameGenStudy on ROUND_FRAMEGEN at its size under harvest, writes ROUND_FRAMEGEN.results and never an existing one, records its commit, and logs no verdict",
        branch.length > 400 && /decodeNet\(shipped\.net\)/.test(code) && /runFrameGenStudy\(\{ splits: ROUND_FRAMEGEN\.splits, image: ROUND_FRAMEGEN\.image,/.test(code) && /harvest: true/.test(code) &&
        /path\.join\(ENG, ROUND_FRAMEGEN\.results\)/.test(code) && /existsSync\(file\)/.test(code) && /sha256/.test(code) && /out\.commit = /.test(code) && !/ROUND_TEMPORALUP/.test(code) && !/verdict|status|supported/.test(code));
    // section 134: the committed results read back by code -- the verdict re-derived from the file's tables under ROUND_FRAMEGEN's
    // rule: NOT REPORTED, C1 firing on both hypotheses because G beat the noisy frame on 5 of 12; the figures section 134 reports
    const ffile = path.join(ENG, RESULTS_FRAMEGEN);
    if (fs.existsSync(ffile)) {
        const res = JSON.parse(fs.readFileSync(ffile, "utf8"));
        const again = verdict({ sets: frameGenSets(res.tables), shuffled: null, c2Prior: ROUND_FRAMEGEN.c2Prior, determinism: res.determinism, seedsDistinct: res.seedsDistinct, test: ROUND_FRAMEGEN.test });
        const H1 = again.hypotheses.H1, H2 = again.hypotheses.H2, wins = (a, b) => a.filter((v, i) => v < b[i]).length;
        ok("!! *** section 134: verdict() over the committed results' own tables gives the file's verdict -- NOT REPORTED, C1 firing on both hypotheses: G beat the noisy frame on 5 of 12 ***",
            again.run === "not reported" && res.verdict.run === "not reported" && again.controls.C1 === false && again.reasons.length === 2 &&
            H1.c1.netWins === 5 && H1.c1.filterWins === 12 && H2.c1.filterWins === 10 && wins(res.tables.G, res.tables.noisy) === 5 &&
            again.controls.C4 === true && again.controls.C5 === true && res.commit === "5f1f344c" && /^f1a84d47/.test(res.shipped.sha256),
            again.reasons.join(" | "));
        const mean = (a) => a.reduce((x, v) => x + v, 0) / a.length, F = res.secondary.field;
        ok("  ...and section 134's figures: G won 2 of 12 against the cross-fade and 3 of 12 against the repeated frame; the midpoint traced alone beat G on 11 of 12 (mean d 4.37); the fill helped on 5 (mean d 0.248)",
            H1.k === 2 && H2.k === 3 && Math.abs(H1.meanD + 1.728) < 1e-3 && Math.abs(H2.meanD + 1.103) < 1e-3 &&
            res.secondary.midTraced.filter((v) => v < 0).length === 11 && Math.abs(mean(res.secondary.midTraced) + 4.370) < 1e-3 &&
            res.secondary.fill.filter((v) => v > 0).length === 5 && Math.abs(mean(res.secondary.fill) - 0.248) < 1e-3,
            `H1 ${H1.k}/12, H2 ${H2.k}/12; Bmid1 beat G on ${res.secondary.midTraced.filter((v) => v < 0).length}; fill ${res.secondary.fill.filter((v) => v > 0).length}/12`);
        ok("  ...and the field held on every image: moved along it, a pixel's surface point within 0.02 of the newer frame's against 0.06-0.16 unmoved, no hole left after the fill",
            F.length === 12 && F.every((f) => f.pointWarped < 0.02 && f.pointStill > 0.06 && f.pointStill < 0.16 && f.holes === 0 && f.holesNoFill > 1000),
            F.map((f) => `${f.pointWarped.toFixed(3)}/${f.pointStill.toFixed(3)}`).join(" "));
    } else ok("!! section 134 reads render/denoise-results-framegen.json, and it is not there", false);
}

console.log("\n14e. ROUND 60: THE GENERATOR BETWEEN LIGHT-FREE FRAMES, LIT AT THE MIDPOINT (pre-registration section 136)");
{
    const { runFrameGenStudy, ROUND_FRAMEGEN, ROUND_FRAMEGEN_LF, RESULTS_FRAMEGEN_LF, frameGenSetsLightFree, SHIPPED_NET } = await imp("render/denoiseStudy.mjs");
    const D = await imp("render/denoiseScenes.mjs"), { decodeNet } = await imp("render/denoiseDevice.mjs");
    const net = decodeNet(JSON.parse(fs.readFileSync(path.join(ENG, SHIPPED_NET), "utf8")).net);
    const earlier = new Set([D.SPLITS_TEMPORALUP, D.SPLITS_FRAMEGEN, D.SPLITS_PAGE, D.SPLITS_MESH_C, D.SPLITS_R47].flatMap((S) => Object.values(S).flatMap((x) => x.seeds)));
    ok("!! ROUND_FRAMEGEN_LF: the light-free arrangement on its own split (55000, 56000), seeds round 59's and the others never used, round 59's size, test and cited C2 -- its own results file",
        ROUND_FRAMEGEN_LF.splits === D.SPLITS_FRAMEGEN_LF && ROUND_FRAMEGEN_LF.arrangement === "lightFree" && D.SPLITS_FRAMEGEN_LF.T1.seeds[0] === 55000 && D.SPLITS_FRAMEGEN_LF.T1.seeds[6] === 56000 &&
        D.SPLITS_FRAMEGEN_LF.T1.seeds.every((s2) => !earlier.has(s2)) && ROUND_FRAMEGEN_LF.image === ROUND_FRAMEGEN.image && ROUND_FRAMEGEN_LF.test === ROUND_FRAMEGEN.test &&
        ROUND_FRAMEGEN_LF.c2Prior === ROUND_FRAMEGEN.c2Prior && RESULTS_FRAMEGEN_LF === "render/denoise-results-framegen-lf.json");
    const t = { Gl: [1], Xl: [2], Rl: [3], noisyMid: [4], floor: [5] }, hs = frameGenSetsLightFree(t);
    ok("  frameGenSetsLightFree: H1 G' against X', H2 G' against R', both over the noisy frame lit at the midpoint",
        hs.H1.net[0] === t.Gl && hs.H1.filter === t.Xl && hs.H2.net[0] === t.Gl && hs.H2.filter === t.Rl && hs.H1.noisy === t.noisyMid && hs.H2.noisy === t.noisyMid);
    let threw = null; try { runFrameGenStudy({ splits: ROUND_FRAMEGEN_LF.splits, arrangement: "lightFree", net, image: 4, sppIn: 1, sppRef: 1 }); } catch (e) { threw = e.message; }
    let bad = null; try { runFrameGenStudy({ arrangement: "lit", net }); } catch (e) { bad = e.message; }
    ok("!! on the REAL split without harvest it is refused at its first scene, and an arrangement it does not know is refused by name",
        /seed 55000 is a dataset seed/.test(threw || "") && /arrangement is "shown" \(section 133\), "lightFree" \(section 136\) or "lightFreeDisplay" \(section 139\)/.test(bad || ""), threw);
    const mini = Object.freeze({ T1: Object.freeze({ family: "R+C", families: Object.freeze(["R", "C"]), seeds: Object.freeze([990912, 990913]) }) });
    const out = runFrameGenStudy({ splits: mini, arrangement: "lightFree", net, image: 16, sppIn: 4, sppRef: 8 }), V = out.verdict;
    ok("!! end to end on the miniature: the light-free arms and round 59's measured on both images, both hypotheses over G', the display-space grading and the field reported, C4 on G', C5, C2 cited",
        Object.keys(V.hypotheses).join() === "H1,H2" && ["Gl", "Xl", "Rl", "noisyMid", "GlNoFill", "G", "X", "R", "Bmid1", "floor"].every((k) => out.tables[k].length === 2 && out.tables[k].every(Number.isFinite)) &&
        out.determinism === true && out.seedsDistinct === true && out.config.arrangement === "lightFree" && /G' \(generated between L6 and L7/.test(out.config.hypotheses.H1) &&
        out.secondary.display.H1.length === 2 && out.secondary.displayTables.Gl.length === 2 && out.secondary.overShown.length === 2 && V.controls.C2.citedFrom === 11, `run ${V.run}`);
    const cli = fs.readFileSync(path.join(ENG, "tools/denoiseStudy.mjs"), "utf8");
    const b0 = cli.indexOf('} else if (args.includes("--harvest-framegen-lf")) {'), branch = b0 >= 0 ? cli.slice(b0, cli.indexOf('} else if (args.includes("--harvest-framegen-display")) {', b0)) : "";
    const code = branch.replace(/\/\/.*$/gm, "");
    ok("!! --harvest-framegen-lf runs runFrameGenStudy on ROUND_FRAMEGEN_LF's split, size and light-free arrangement under harvest, writes its own file and never an existing one, records its commit, and logs no verdict",
        branch.length > 400 && /runFrameGenStudy\(\{ splits: ROUND_FRAMEGEN_LF\.splits, image: ROUND_FRAMEGEN_LF\.image, arrangement: ROUND_FRAMEGEN_LF\.arrangement,/.test(code) && /harvest: true/.test(code) &&
        /path\.join\(ENG, ROUND_FRAMEGEN_LF\.results\)/.test(code) && /existsSync\(file\)/.test(code) && /out\.commit = /.test(code) && !/ROUND_FRAMEGEN\./.test(code) && !/verdict|status|supported/.test(code));
    // section 138: the committed results read back by code -- NOT REPORTED, C1 firing on H2's CONTROL alone: the held frame beat the
    // noisy frame on 10 of 12; the candidate passed its own C1 on both; and the figures section 138 reports
    const lfile = path.join(ENG, RESULTS_FRAMEGEN_LF);
    if (fs.existsSync(lfile)) {
        const res = JSON.parse(fs.readFileSync(lfile, "utf8")), T = res.tables;
        const again = verdict({ sets: frameGenSetsLightFree(T), shuffled: null, c2Prior: ROUND_FRAMEGEN_LF.c2Prior, determinism: res.determinism, seedsDistinct: res.seedsDistinct, test: ROUND_FRAMEGEN_LF.test });
        const H1 = again.hypotheses.H1, H2 = again.hypotheses.H2, mean = (a) => a.reduce((x, v) => x + v, 0) / a.length;
        ok("!! *** section 138: verdict() over the committed results' own tables gives the file's verdict -- NOT REPORTED, C1 firing on H2's control alone: R' beat the noisy frame on 10 of 12; G' passed on both ***",
            again.run === "not reported" && res.verdict.run === "not reported" && again.reasons.length === 1 && /^C1 on H2: .* on 11 and the filter on 10 of 12/.test(again.reasons[0]) &&
            H1.c1.ok === true && H1.c1.netWins === 11 && H2.c1.netWins === 11 && H2.c1.filterWins === 10 && res.commit === "3917dac6" && res.config.arrangement === "lightFree",
            again.reasons.join(" | "));
        const S2 = res.secondary, ties = S2.overShown.map((d, i) => (d === 0 ? i : -1)).filter((i) => i >= 0);
        ok("  ...and section 138's figures: H1 5 of 12 (mean d -0.221), H2 9 of 12 at p 0.011 against 0.025; G' over round 59's G on 10, tied on the two scenes with no light in view; display space 8 and 11 of 12; the midpoint traced beat G' on 10",
            H1.k === 5 && Math.abs(H1.meanD + 0.221) < 1e-3 && H2.k === 9 && Math.abs(H2.p - 0.01123046875) < 1e-12 && H2.threshold === 0.025 &&
            S2.overShown.filter((d) => d > 0).length === 10 && ties.join() === "1,2" && ties.every((i) => T.G[i] === T.Gl[i]) &&
            S2.display.H1.filter((d) => d > 0).length === 8 && S2.display.H2.filter((d) => d > 0).length === 11 && S2.midTraced.filter((d) => d < 0).length === 10 &&
            S2.fill.every((d) => d > 0), `overShown ${S2.overShown.filter((d) => d > 0).length}/12 (ties at ${ties.join(", ")}); display ${S2.display.H1.filter((d) => d > 0).length} / ${S2.display.H2.filter((d) => d > 0).length}`);
    } else ok("!! section 138 reads render/denoise-results-framegen-lf.json, and it is not there", false);
}

console.log("\n14f. ROUND 61: THE LIGHT-FREE GENERATOR GRADED IN DISPLAY SPACE, C1 OF THE CANDIDATE ALONE (pre-registration section 139)");
{
    const { runFrameGenStudy, ROUND_FRAMEGEN_LF, ROUND_FRAMEGEN_DISPLAY, RESULTS_FRAMEGEN_DISPLAY, toDisplay, SHIPPED_NET } = await imp("render/denoiseStudy.mjs");
    const D = await imp("render/denoiseScenes.mjs"), { decodeNet } = await imp("render/denoiseDevice.mjs"), { toPerceptual, GAMMA } = await imp("render/denoiseUpscale.mjs");
    const FG = await imp("render/denoiseFrameGen.mjs");
    const net = decodeNet(JSON.parse(fs.readFileSync(path.join(ENG, SHIPPED_NET), "utf8")).net);
    const earlier = new Set([D.SPLITS_TEMPORALUP, D.SPLITS_FRAMEGEN, D.SPLITS_FRAMEGEN_LF, D.SPLITS_PAGE, D.SPLITS_MESH_C, D.SPLITS_R47].flatMap((S) => Object.values(S).flatMap((x) => x.seeds)));
    ok("!! ROUND_FRAMEGEN_DISPLAY: the display-graded arrangement on its own split (57000, 58000), new seeds, C1 of the candidate, round 60's size, test and cited C2 -- its own results file",
        ROUND_FRAMEGEN_DISPLAY.splits === D.SPLITS_FRAMEGEN_DISPLAY && ROUND_FRAMEGEN_DISPLAY.arrangement === "lightFreeDisplay" && ROUND_FRAMEGEN_DISPLAY.c1Of === "candidate" &&
        D.SPLITS_FRAMEGEN_DISPLAY.T1.seeds[0] === 57000 && D.SPLITS_FRAMEGEN_DISPLAY.T1.seeds[6] === 58000 && D.SPLITS_FRAMEGEN_DISPLAY.T1.seeds.every((s2) => !earlier.has(s2)) &&
        ROUND_FRAMEGEN_DISPLAY.image === ROUND_FRAMEGEN_LF.image && ROUND_FRAMEGEN_DISPLAY.test === ROUND_FRAMEGEN_LF.test && RESULTS_FRAMEGEN_DISPLAY === "render/denoise-results-framegen-display.json");
    const xs = [-1, 0, 1e-6, 0.18, 1, 30];
    ok("  toDisplay is round 26's transfer, render/denoiseUpscale.mjs's toPerceptual -- Reinhard then gamma 2.2, a negative at 0",
        Array.from(toDisplay(xs)).every((v, i) => Object.is(v, toPerceptual(xs[i])) && Math.abs(v - Math.pow(Math.max(xs[i], 0) / (1 + Math.max(xs[i], 0)), 1 / 2.2)) < 1e-15) && GAMMA === 2.2);
    let threw = null; try { runFrameGenStudy({ splits: ROUND_FRAMEGEN_DISPLAY.splits, arrangement: "lightFreeDisplay", net, image: 4, sppIn: 1, sppRef: 1 }); } catch (e) { threw = e.message; }
    ok("!! on the REAL split without harvest it is refused at its first scene", /seed 57000 is a dataset seed/.test(threw || ""), threw);
    // the miniature: its tables are display-space relMSE of the arms against the truth, recomputed here from the same sequence
    const mini = Object.freeze({ T1: Object.freeze({ family: "R+C", families: Object.freeze(["R", "C"]), seeds: Object.freeze([990914, 990915]) }) });
    const out = runFrameGenStudy({ splits: mini, arrangement: "lightFreeDisplay", net, image: 16, sppIn: 4, sppRef: 8 }), V = out.verdict;
    const seq = FG.renderFrameGenImages("R", 990914, { w: 16, h: 16, sppIn: 4, sppRef: 8 }), F = FG.frameGenFrames(seq, net), rD = toDisplay(seq.ref);
    ok("!! end to end on the miniature: every table is the arm's relMSE IN DISPLAY SPACE, recomputed here from the same sequence bit for bit; the linear grading reported beside it; C1 asked of the candidate alone",
        ["Gl", "Xl", "Rl", "noisyMid"].every((k) => Object.is(out.tables[k][0], relMSE(toDisplay(F[k]), rD))) && Object.is(out.tables.floor[0], relMSE(toDisplay(seq.ref2), rD)) &&
        Object.is(out.secondary.linearTables.Gl[0], relMSE(F.Gl, seq.ref)) && out.config.c1Of === "candidate" && /^display/.test(out.config.grading) &&
        V.reasons.every((r) => !/both need/.test(r)), `run ${V.run}; ${V.reasons.join(" | ")}`);
    const cli = fs.readFileSync(path.join(ENG, "tools/denoiseStudy.mjs"), "utf8");
    const b0 = cli.indexOf('} else if (args.includes("--harvest-framegen-display")) {'), branch = b0 >= 0 ? cli.slice(b0, cli.indexOf("} else if (round) {", b0)) : "";
    const code = branch.replace(/\/\/.*$/gm, "");
    ok("!! --harvest-framegen-display runs runFrameGenStudy on ROUND_FRAMEGEN_DISPLAY's split, size and arrangement under harvest, writes its own file and never an existing one, records its commit, and logs no verdict",
        branch.length > 400 && /runFrameGenStudy\(\{ splits: ROUND_FRAMEGEN_DISPLAY\.splits, image: ROUND_FRAMEGEN_DISPLAY\.image, arrangement: ROUND_FRAMEGEN_DISPLAY\.arrangement,/.test(code) &&
        /harvest: true/.test(code) && /path\.join\(ENG, ROUND_FRAMEGEN_DISPLAY\.results\)/.test(code) && /existsSync\(file\)/.test(code) && /out\.commit = /.test(code) && !/ROUND_FRAMEGEN_LF\./.test(code) && !/verdict|status|supported/.test(code));
    // section 140: the committed results read back by code -- NOT REPORTED, C1 firing on the candidate at 10 of 12, on both hypotheses
    // (one candidate); and had it held, both would have been supported under Holm, which section 140 says and decides nothing
    const dfile = path.join(ENG, RESULTS_FRAMEGEN_DISPLAY);
    if (fs.existsSync(dfile)) {
        const res = JSON.parse(fs.readFileSync(dfile, "utf8")), T = res.tables, { frameGenSetsLightFree } = await imp("render/denoiseStudy.mjs");
        const again = verdict({ sets: frameGenSetsLightFree(T), shuffled: null, c2Prior: ROUND_FRAMEGEN_DISPLAY.c2Prior, determinism: res.determinism, seedsDistinct: res.seedsDistinct, test: ROUND_FRAMEGEN_DISPLAY.test, c1Of: "candidate" });
        const H1 = again.hypotheses.H1, H2 = again.hypotheses.H2, lost = T.Gl.map((v, i) => (v > T.noisyMid[i] ? i : -1)).filter((i) => i >= 0);
        ok("!! *** section 140: verdict() over the committed results' own tables gives the file's verdict -- NOT REPORTED, C1 firing on the candidate at 10 of 12, the two it lost C 58002 and C 58003 ***",
            again.run === "not reported" && res.verdict.run === "not reported" && again.reasons.length === 2 && again.reasons.every((r) => /on 10 and .* of 12; the candidate needs 11$/.test(r)) &&
            lost.join() === "8,9" && res.commit === "0a4e6cbf" && res.config.arrangement === "lightFreeDisplay" && res.config.c1Of === "candidate", again.reasons.join(" | "));
        // with C1 out of the question, what Holm would have said -- reported, as section 140 reports it, never a verdict
        const noC1 = verdict({ sets: frameGenSetsLightFree(T), shuffled: null, c2Prior: ROUND_FRAMEGEN_DISPLAY.c2Prior, determinism: res.determinism, seedsDistinct: res.seedsDistinct, test: ROUND_FRAMEGEN_DISPLAY.test, c1Of: "candidate", c1Min: 10 });
        ok("  ...and section 140's 'had C1 held': H2 11 of 12 at p 0.00049 under 0.025, H1 7 of 12 at p 0.038 under its second threshold 0.05 -- both supported at a C1 of 10, which nobody pre-registered",
            H1.k === 7 && H2.k === 11 && Math.abs(H1.p - 0.0380859375) < 1e-12 && Math.abs(H2.p - 0.00048828125) < 1e-12 &&
            noC1.run === "reported" && noC1.hypotheses.H1.status === "supported" && noC1.hypotheses.H2.status === "supported" && noC1.hypotheses.H1.threshold === 0.05,
            `H1 ${H1.k}/12 p ${H1.p}, H2 ${H2.k}/12 p ${H2.p}`);
        ok("  ...and beside it: linear radiance H1 6 of 12, H2 11 of 12; the midpoint traced alone beat G' on 12 of 12; the fill helped on 12",
            res.secondary.linear.H1.filter((d) => d > 0).length === 6 && res.secondary.linear.H2.filter((d) => d > 0).length === 11 &&
            res.secondary.midTraced.every((d) => d < 0) && res.secondary.fill.every((d) => d > 0));
    } else ok("!! section 140 reads render/denoise-results-framegen-display.json, and it is not there", false);
}

console.log("\n14g. ROUND 62: ROUND 61's ARRANGEMENT ON A TEST SET TWICE ITS SIZE, FIXED IN ADVANCE (pre-registration section 142)");
{
    const { runFrameGenStudy, ROUND_FRAMEGEN_DISPLAY, ROUND_FRAMEGEN_LARGE, RESULTS_FRAMEGEN_LARGE, SHIPPED_NET } = await imp("render/denoiseStudy.mjs");
    const D = await imp("render/denoiseScenes.mjs"), { decodeNet } = await imp("render/denoiseDevice.mjs"), { signFlipUpper } = await imp("render/denoiseStats.mjs");
    const net = decodeNet(JSON.parse(fs.readFileSync(path.join(ENG, SHIPPED_NET), "utf8")).net);
    const earlier = new Set([D.SPLITS_TEMPORALUP, D.SPLITS_FRAMEGEN, D.SPLITS_FRAMEGEN_LF, D.SPLITS_FRAMEGEN_DISPLAY, D.SPLITS_PAGE, D.SPLITS_MESH_C, D.SPLITS_R47].flatMap((S) => Object.values(S).flatMap((x) => x.seeds)));
    const T1 = D.SPLITS_FRAMEGEN_LARGE.T1;
    ok("!! ROUND_FRAMEGEN_LARGE: round 61's arrangement, grading, test, size and cited C2 on 24 new scenes -- 12 R from 59000, 12 C from 60000 -- C1 of the candidate at 22, round 61's 11 of 12 in proportion; its own results file",
        ROUND_FRAMEGEN_LARGE.splits === D.SPLITS_FRAMEGEN_LARGE && T1.seeds.length === 24 && new Set(T1.seeds).size === 24 && T1.families.length === 24 &&
        T1.seeds.slice(0, 12).every((x, i) => x === 59000 + i && T1.families[i] === "R") && T1.seeds.slice(12).every((x, i) => x === 60000 + i && T1.families[12 + i] === "C") &&
        T1.seeds.every((x) => !earlier.has(x) && D.isDatasetSeed(x)) && ROUND_FRAMEGEN_LARGE.c1Min === 22 && 22 / 24 === 11 / 12 &&
        ["image", "test", "arrangement", "c1Of", "c2Prior"].every((k) => ROUND_FRAMEGEN_LARGE[k] === ROUND_FRAMEGEN_DISPLAY[k]) && RESULTS_FRAMEGEN_LARGE === "render/denoise-results-framegen-large.json");
    // 24 is the largest set the exact test enumerates: signFlipUpper takes 24 effects and refuses 25
    let refused25 = null; try { signFlipUpper(Array(25).fill(1)); } catch (e) { refused25 = e.message; }
    ok("  ...and 24 is the largest set section 28's exact sign-flip test enumerates: 24 all-positive effects give 2^-24, 25 are refused",
        signFlipUpper(Array(24).fill(1)) === 2 ** -24 && /sign-flip test over 25 effects/.test(refused25 || ""));
    let threw = null; try { runFrameGenStudy({ splits: ROUND_FRAMEGEN_LARGE.splits, arrangement: "lightFreeDisplay", net, image: 4, sppIn: 1, sppRef: 1 }); } catch (e) { threw = e.message; }
    ok("!! on the REAL split without harvest it is refused at its first scene", /seed 59000 is a dataset seed/.test(threw || ""), threw);
    // the miniature: c1Min reaches verdict() and the config -- three scenes, C1 at 3, so a candidate that loses one to its noisy frame fires C1 by that count
    const mini = Object.freeze({ T1: Object.freeze({ family: "R+C", families: Object.freeze(["R", "C"]), seeds: Object.freeze([990914, 990915]) }) });
    const out = runFrameGenStudy({ splits: mini, arrangement: "lightFreeDisplay", net, image: 16, sppIn: 4, sppRef: 8, c1Min: 3 });
    ok("!! end to end on the miniature, c1Min carried: the config records it and verdict() asks the candidate for it -- 3 of 2 cannot be met, so C1 names 3",
        out.config.c1Min === 3 && out.verdict.run === "not reported" && out.verdict.reasons.some((r) => /the candidate needs 3$/.test(r)), out.verdict.reasons.join(" | "));
    const cli = fs.readFileSync(path.join(ENG, "tools/denoiseStudy.mjs"), "utf8");
    const b0 = cli.indexOf('} else if (args.includes("--harvest-framegen-large")) {'), branch = b0 >= 0 ? cli.slice(b0, cli.indexOf("} else if (round) {", b0)) : "";
    const code = branch.replace(/\/\/.*$/gm, "");
    ok("!! --harvest-framegen-large runs runFrameGenStudy on ROUND_FRAMEGEN_LARGE's split, size, arrangement and c1Min under harvest, writes its own file and never an existing one, records its commit, and logs no verdict",
        branch.length > 400 && /runFrameGenStudy\(\{ splits: ROUND_FRAMEGEN_LARGE\.splits, image: ROUND_FRAMEGEN_LARGE\.image, arrangement: ROUND_FRAMEGEN_LARGE\.arrangement,/.test(code) &&
        /c1Min: ROUND_FRAMEGEN_LARGE\.c1Min/.test(code) && /harvest: true/.test(code) && /path\.join\(ENG, ROUND_FRAMEGEN_LARGE\.results\)/.test(code) && /existsSync\(file\)/.test(code) &&
        /out\.commit = /.test(code) && !/ROUND_FRAMEGEN_DISPLAY\./.test(code) && !/verdict|status|supported/.test(code));
    // section 142: the first harvest died at once -- ROUND_FRAMEGEN_LARGE named in its branch and never imported, which the row above,
    // reading the branch's text, could not see. So: every ROUND_* the command names is one its import line brings in, and the
    // module it comes from exports it
    const imported = new Set(((cli.match(/^import \{([^}]*)\} from "\.\.\/render\/denoiseStudy\.mjs";$/m) || [])[1] || "").split(",").map((x) => x.trim()));
    const named = [...new Set(cli.replace(/\/\/.*$/gm, "").match(/\bROUND_[A-Z0-9_]+\b/g) || [])], study = await imp("render/denoiseStudy.mjs");
    ok("!! every ROUND_* tools/denoiseStudy.mjs names is on its import line from render/denoiseStudy.mjs, and exported there -- ROUND_FRAMEGEN_LARGE among them",
        named.includes("ROUND_FRAMEGEN_LARGE") && named.every((k) => imported.has(k) && k in study), named.filter((k) => !imported.has(k) || !(k in study)).join(", ") || `${named.length} names`);
    // section 145: the committed results read back by code -- REPORTED, both supported under Holm, C1 at 23 of 24
    const lfile = path.join(ENG, RESULTS_FRAMEGEN_LARGE);
    if (fs.existsSync(lfile)) {
        const res = JSON.parse(fs.readFileSync(lfile, "utf8")), T = res.tables, { frameGenSetsLightFree, verdict: V0 } = { ...(await imp("render/denoiseStudy.mjs")), ...(await imp("render/denoiseStats.mjs")) };
        const again = V0({ sets: frameGenSetsLightFree(T), shuffled: null, c2Prior: ROUND_FRAMEGEN_LARGE.c2Prior, determinism: res.determinism, seedsDistinct: res.seedsDistinct, test: ROUND_FRAMEGEN_LARGE.test, c1Of: "candidate", c1Min: ROUND_FRAMEGEN_LARGE.c1Min });
        const H1 = again.hypotheses.H1, H2 = again.hypotheses.H2, lost = T.Gl.map((v, i) => (v > T.noisyMid[i] ? i : -1)).filter((i) => i >= 0);
        ok("!! *** section 145: verdict() over the committed results' own tables gives the file's verdict -- REPORTED, H1 and H2 both SUPPORTED, C1 at 23 of 24 (the one lost C 60008) ***",
            again.run === "reported" && res.verdict.run === "reported" && H1.status === "supported" && H2.status === "supported" && res.verdict.hypotheses.H1.status === "supported" &&
            lost.join() === "20" && res.commit === "3d215c83" && res.config.c1Min === 22 && res.config.c1Of === "candidate" && T.Gl.length === 24,
            `H1 ${H1.k}/24 p ${H1.p}, H2 ${H2.k}/24 p ${H2.p}`);
        ok("  ...and its figures: H1 17 of 24, mean d +0.178, p 0.0479 under Holm's 0.05; H2 19 of 24, mean d +0.570, p 7.1e-5 under 0.025",
            H1.k === 17 && Math.abs(H1.meanD - 0.178) < 5e-4 && Math.abs(H1.p - 0.04789501428604126) < 1e-12 && H1.threshold === 0.05 &&
            H2.k === 19 && Math.abs(H2.meanD - 0.570) < 5e-4 && Math.abs(H2.p - 0.00007081031799316406) < 1e-15 && H2.threshold === 0.025);
        const pos = (a) => a.filter((d) => d > 0).length;
        ok("  ...and beside it, as section 145 reports: linear radiance's H1 12 of 24 (no win), H2 19 of 24; the midpoint traced alone beat G' on 16 of 24; the fill helped on all 24",
            pos(res.secondary.linear.H1) === 12 && res.secondary.linear.H1.reduce((a, d) => a + d, 0) < 0 && pos(res.secondary.linear.H2) === 19 &&
            res.secondary.midTraced.filter((d) => d < 0).length === 16 && pos(res.secondary.fill) === 24);
    } else ok("!! section 145 reads render/denoise-results-framegen-large.json, and it is not there", false);
}

console.log("\n15. THE UPSCALE ROUND: HALF SIZE + FSR1 AGAINST THE FRAMES IT COULD BE INSTEAD (pre-registration section 81)");
{
    const { runUpscaleStudy, ROUND_FSR1, RESULTS_FSR1, ROUND_MESH, SHIPPED_NET } = await imp("render/denoiseStudy.mjs");
    const { SPLITS_FSR1 } = await imp("render/denoiseScenes.mjs");
    const { decodeNet } = await imp("render/denoiseDevice.mjs");
    const net = decodeNet(JSON.parse(fs.readFileSync(path.join(ENG, SHIPPED_NET), "utf8")).net);
    ok("!! ROUND_FSR1: the upscale split, the sign-flip test, C2 cited from round 11 as section 79 cites it, its own results file",
        ROUND_FSR1.splits === SPLITS_FSR1 && ROUND_FSR1.test === "signflip" && ROUND_FSR1.c2Prior === ROUND_MESH.c2Prior &&
        ROUND_FSR1.results === RESULTS_FSR1 && RESULTS_FSR1 === "render/denoise-results-fsr1.json");
    let threw = null; try { runUpscaleStudy({ net, image: 4, sppIn: 1, sppRef: 1 }); } catch (e) { threw = e.message; }
    ok("!! on the REAL split without harvest it is refused at its first scene", /seed 40000 is a dataset seed/.test(threw || ""), threw);
    let threw2 = null; try { runUpscaleStudy({}); } catch (e) { threw2 = e.message; }
    ok("  without the shipped network it refuses rather than run something else", /needs the shipped network/.test(threw2 || ""));
    // the miniature: R and C scenes outside every split, 16 x 16 (half 8) -- the PLUMBING, no number read for its value
    const mini = Object.freeze({ T1: Object.freeze({ family: "R+C", families: Object.freeze(["R", "C"]), seeds: Object.freeze([990100, 990101]) }) });
    const out = runUpscaleStudy({ splits: mini, net, image: 16, sppIn: 4, sppRef: 8 }), V = out.verdict, T = out.tables;
    const shapeOk = ["A", "B", "C", "D", "easu", "fsr1NoDenoise", "noisyFull1", "noisyFull4", "noisyHalfUp", "floor"].every((k) => T[k].length === 2 && T[k].every(Number.isFinite));
    ok("!! end to end on the miniature: every frame measured, the candidate's chain twice bit for bit (C4), 10 distinct render seeds (C5), C2 cited",
        shapeOk && out.determinism === true && out.seedsDistinct === true && out.seedCount === 10 && V.controls.C2.citedFrom === 11 && V.controls.C4 === true &&
        Object.keys(V.hypotheses).join() === "H1,H2" && out.config.half === 8 && out.config.upscale.kind === "fsr1", `run ${V.run}`);
    // the columns verdict() reads are the arms the pre-registration names: H1's comparator is D, H2's is C, B is the candidate in both
    const dWant = (cmp) => T.B.map((b, i) => Math.log(cmp[i]) - Math.log(b));
    ok("!! H1 holds B (half + FSR1) against D (full size at 1 sample) and H2 holds B against C (half + bilinear) -- the effects are those columns' own",
        V.hypotheses.H1.d.every((v, i) => Object.is(v, dWant(T.D)[i])) && V.hypotheses.H2.d.every((v, i) => Object.is(v, dWant(T.C)[i])) &&
        V.hypotheses.H1.c1.netWins === T.B.filter((v, i) => v < T.noisyFull1[i]).length && V.hypotheses.H2.c1.filterWins === T.C.filter((v, i) => v < T.noisyHalfUp[i]).length);
    // the frames are what they say: B is the shipped network at half size through FSR1, recomputed from nothing
    const { renderUpscaleImages, upscale } = await imp("render/denoiseUpscale.mjs");
    const im = renderUpscaleImages("C", 990101, { w: 16, h: 16, sppIn: 4, sppRef: 8 });
    const B1 = upscale(denoise(net, im.half4.x, 8, 8).y, 8, 8, 16, 16, "fsr1"), D1 = denoise(net, im.full1.x, 16, 16).y;
    ok("!! B and D for an image are the shipped network's own frames -- half size then FSR1, and full size at 1 sample -- scored against that image's reference, bit for bit",
        Object.is(T.B[1], relMSE(B1, im.ref)) && Object.is(T.D[1], relMSE(D1, im.ref)) && Object.is(T.floor[1], relMSE(im.ref2, im.ref)));
    // section 82: the committed upscale results, read back by code -- "not reported, C1 on H2" is the rule's output
    const ufile = path.join(ENG, RESULTS_FSR1);
    if (fs.existsSync(ufile)) {
        const res = JSON.parse(fs.readFileSync(ufile, "utf8")), T2 = res.tables;
        const sets = { H1: { noisy: T2.noisyFull1, filter: T2.D, net: [T2.B], floor: T2.floor }, H2: { noisy: T2.noisyHalfUp, filter: T2.C, net: [T2.B], floor: T2.floor } };
        const again = verdict({ sets, shuffled: null, c2Prior: ROUND_FSR1.c2Prior, determinism: res.determinism, seedsDistinct: res.seedsDistinct, test: ROUND_FSR1.test });
        const h2 = again.hypotheses.H2.c1;
        ok("!! *** section 82: verdict() over the committed upscale results' own tables gives the file's verdict -- NOT REPORTED, C1 on H2 (9 and 9 of 12) ***",
            again.run === "not reported" && res.verdict.run === "not reported" && JSON.stringify(again.reasons) === JSON.stringify(res.verdict.reasons) &&
            h2.netWins === 9 && h2.filterWins === 9 && h2.ok === false && again.hypotheses.H1.c1.ok === true,
            again.reasons.join(" | "));
    } else ok("!! section 82 reads render/denoise-results-fsr1.json, and it is not there", false);
    const cli = fs.readFileSync(path.join(ENG, "tools/denoiseStudy.mjs"), "utf8");
    const b0 = cli.indexOf('} else if (args.includes("--harvest-fsr1")) {'), branch = b0 >= 0 ? cli.slice(b0, cli.indexOf('} else if (args.includes("--harvest-mesh")) {', b0)) : "";
    const code = branch.replace(/\/\/.*$/gm, "");
    ok("!! --harvest-fsr1 decodes the shipped file with decodeNet, runs runUpscaleStudy under harvest, writes ROUND_FSR1.results and never an existing one, and logs no verdict",
        branch.length > 400 && /decodeNet\(shipped\.net\)/.test(code) && /runUpscaleStudy\(/.test(code) && /harvest: true/.test(code) &&
        /path\.join\(ENG, ROUND_FSR1\.results\)/.test(code) && /existsSync\(file\)/.test(code) && /sha256/.test(code) && /"fx\/fsr"/.test(code) && !/verdict|status|supported/.test(code));
}

console.log("\n16. ROUND 29: THE SAME QUESTION AT 256 x 256, EASU THE CANDIDATE (pre-registration section 89)");
{
    const { runUpscaleStudy, ROUND_HALFRES, RESULTS_HALFRES, ROUND_FSR1, ROUND_MESH, SHIPPED_NET } = await imp("render/denoiseStudy.mjs");
    const { SPLITS_HALFRES } = await imp("render/denoiseScenes.mjs");
    const { decodeNet } = await imp("render/denoiseDevice.mjs");
    const { renderUpscaleImages, upscale } = await imp("render/denoiseUpscale.mjs");
    const net = decodeNet(JSON.parse(fs.readFileSync(path.join(ENG, SHIPPED_NET), "utf8")).net);
    ok("!! ROUND_HALFRES: its own split, 256 x 256 (half 128), EASU the candidate, the sign-flip test, C2 cited from round 11 as round 26 cites it, its own results file",
        ROUND_HALFRES.splits === SPLITS_HALFRES && ROUND_HALFRES.image === 256 && ROUND_HALFRES.candidate === "easu" && ROUND_HALFRES.test === "signflip" &&
        ROUND_HALFRES.c2Prior === ROUND_MESH.c2Prior && ROUND_HALFRES.c2Prior === ROUND_FSR1.c2Prior &&
        ROUND_HALFRES.results === RESULTS_HALFRES && RESULTS_HALFRES === "render/denoise-results-halfres.json");
    let threw = null; try { runUpscaleStudy({ splits: ROUND_HALFRES.splits, candidate: "easu", net, image: 4, sppIn: 1, sppRef: 1 }); } catch (e) { threw = e.message; }
    let threw2 = null; try { runUpscaleStudy({ net, candidate: "lanczos", image: 4, sppIn: 1, sppRef: 1 }); } catch (e) { threw2 = e.message; }
    ok("!! on the REAL split without harvest it is refused at its first scene, and a candidate other than FSR1 or EASU is refused before anything renders",
        /seed 42000 is a dataset seed/.test(threw || "") && /candidate is "fsr1" \(section 81\) or "easu" \(section 89\)/.test(threw2 || ""), `${threw} | ${threw2}`);
    // the miniature, EASU the candidate: the PLUMBING, no number read for its value
    const mini = Object.freeze({ T1: Object.freeze({ family: "R+C", families: Object.freeze(["R", "C"]), seeds: Object.freeze([990100, 990101]) }) });
    const out = runUpscaleStudy({ splits: mini, net, candidate: "easu", image: 16, sppIn: 4, sppRef: 8 }), V = out.verdict, T = out.tables;
    const shapeOk = ["A", "B", "C", "D", "easu", "fsr1", "fsr1NoDenoise", "noisyFull1", "noisyFull4", "noisyHalfUp", "floor"].every((k) => T[k].length === 2 && T[k].every(Number.isFinite));
    const im = renderUpscaleImages("C", 990101, { w: 16, h: 16, sppIn: 4, sppRef: 8 });
    const B1 = upscale(denoise(net, im.half4.x, 8, 8).y, 8, 8, 16, 16, "easu");
    const dOf = (x) => T.B.map((b, i) => Math.log(x[i]) - Math.log(b));
    ok("!! end to end with EASU: B is the shipped network at half size through EASU, recomputed from nothing; C4 re-runs EASU; FSR1 whole and RCAS without denoise are reported against B; H1 and H2 are D's and C's columns",
        shapeOk && Object.is(T.B[1], relMSE(B1, im.ref)) && T.B.every((v, i) => Object.is(v, T.easu[i])) && out.determinism === true && out.seedsDistinct === true &&
        out.seedCount === 10 && out.config.upscale.kind === "easu" && /half size \+ EASU/.test(out.config.hypotheses.H1) &&
        out.secondary.fsr1VsEasu.every((v, i) => Object.is(v, dOf(T.fsr1)[i])) && out.secondary.rcasNoDenoiseVsEasu.every((v, i) => Object.is(v, dOf(T.fsr1NoDenoise)[i])) &&
        V.hypotheses.H1.d.every((v, i) => Object.is(v, dOf(T.D)[i])) && V.hypotheses.H2.d.every((v, i) => Object.is(v, dOf(T.C)[i])), `run ${V.run}`);
    // round 26's chain is untouched by the parameter: no candidate is FSR1, and its tables carry no fsr1 column of their own
    const r26 = runUpscaleStudy({ splits: mini, net, image: 16, sppIn: 4, sppRef: 8 });
    ok("  ...and round 26's default is unchanged: FSR1 the candidate, its own secondary, no separate fsr1 column",
        r26.config.upscale.kind === "fsr1" && !("fsr1" in r26.tables) && "easuAloneVsFsr1" in r26.secondary && T.C.every((v, i) => Object.is(v, r26.tables.C[i])));
    const cli = fs.readFileSync(path.join(ENG, "tools/denoiseStudy.mjs"), "utf8");
    const b0 = cli.indexOf('} else if (args.includes("--harvest-halfres")) {'), branch = b0 >= 0 ? cli.slice(b0, cli.indexOf('} else if (args.includes("--harvest-fsr1")) {', b0)) : "";
    const code = branch.replace(/\/\/.*$/gm, "");
    // section 90: the committed round 29 results, read back by code -- "not reported, C1 on H2" is the rule's output over the file's own
    // tables, with C1's two counts (EASU's 9, bilinear's 12) and every other control as the file states them
    const hfile = path.join(ENG, RESULTS_HALFRES);
    if (fs.existsSync(hfile)) {
        const res = JSON.parse(fs.readFileSync(hfile, "utf8")), T3 = res.tables;
        const sets3 = { H1: { noisy: T3.noisyFull1, filter: T3.D, net: [T3.B], floor: T3.floor }, H2: { noisy: T3.noisyHalfUp, filter: T3.C, net: [T3.B], floor: T3.floor } };
        const again3 = verdict({ sets: sets3, shuffled: null, c2Prior: ROUND_HALFRES.c2Prior, determinism: res.determinism, seedsDistinct: res.seedsDistinct, test: ROUND_HALFRES.test });
        const c1h2 = again3.hypotheses.H2.c1, c1h1 = again3.hypotheses.H1.c1;
        ok("!! *** section 90: verdict() over the committed round 29 tables gives the file's verdict -- NOT REPORTED, C1 on H2: EASU beat its noisy frame on 9 of 12, bilinear on 12 ***",
            again3.run === "not reported" && res.verdict.run === "not reported" && JSON.stringify(again3.reasons) === JSON.stringify(res.verdict.reasons) &&
            c1h2.netWins === 9 && c1h2.filterWins === 12 && c1h2.ok === false && c1h1.ok === true && c1h1.netWins === 11 && c1h1.filterWins === 12 &&
            res.determinism === true && res.seedsDistinct === true && res.seedCount === 60 && res.config.image === 256 && res.config.upscale.kind === "easu" &&
            T3.B.every((v, i) => Object.is(v, T3.easu[i])), again3.reasons.join(" | "));
    } else ok("!! section 90 reads render/denoise-results-halfres.json, and it is not there", false);
    ok("!! --harvest-halfres decodes the shipped file with decodeNet, runs runUpscaleStudy on ROUND_HALFRES's split, size and candidate under harvest, writes its results file and never an existing one, and logs no verdict",
        branch.length > 400 && /decodeNet\(shipped\.net\)/.test(code) && /runUpscaleStudy\(/.test(code) && /harvest: true/.test(code) &&
        /splits: ROUND_HALFRES\.splits/.test(code) && /image: ROUND_HALFRES\.image/.test(code) && /candidate: ROUND_HALFRES\.candidate/.test(code) &&
        /path\.join\(ENG, ROUND_HALFRES\.results\)/.test(code) && /existsSync\(file\)/.test(code) && /sha256/.test(code) && /"fx\/fsr"/.test(code) && !/verdict|status|supported/.test(code));
}

console.log("\n17. ROUND 30: THE EMITTERS TAKEN OUT OF THE UPSCALE (pre-registration section 91)");
{
    const { runEmitterAwareStudy, emitterSets, ROUND_EMITTER, RESULTS_EMITTER, ROUND_HALFRES, ROUND_MESH, SHIPPED_NET } = await imp("render/denoiseStudy.mjs");
    const { SPLITS_EMITTER, makeScene } = await imp("render/denoiseScenes.mjs");
    const { decodeNet } = await imp("render/denoiseDevice.mjs");
    const { renderUpscaleImages, upscale, emitterAwareUpscale, fillEmitters, compositeEmitters, nearEmitterShare } = await imp("render/denoiseUpscale.mjs");
    const { emitterRadiance, MASK_STRIDE, MASK_CHANNEL } = await imp("render/denoiseMask.mjs");
    const net = decodeNet(JSON.parse(fs.readFileSync(path.join(ENG, SHIPPED_NET), "utf8")).net);
    ok("!! ROUND_EMITTER: its own split, 256 x 256 (half 128), the sign-flip test, C2 cited from round 11 as rounds 26 and 29 cite it, its own results file",
        ROUND_EMITTER.splits === SPLITS_EMITTER && ROUND_EMITTER.image === 256 && ROUND_EMITTER.test === "signflip" &&
        ROUND_EMITTER.c2Prior === ROUND_MESH.c2Prior && ROUND_EMITTER.c2Prior === ROUND_HALFRES.c2Prior &&
        ROUND_EMITTER.results === RESULTS_EMITTER && RESULTS_EMITTER === "render/denoise-results-emitter.json");
    let threw = null; try { runEmitterAwareStudy({ net, image: 4, sppIn: 1, sppRef: 1 }); } catch (e) { threw = e.message; }
    ok("!! on the REAL split without harvest it is refused at its first scene", /seed 44000 is a dataset seed/.test(threw || ""), threw);
    // the miniature, on two scenes outside every split with an emitter in view at 16 x 16: the PLUMBING, no number read for its value
    const mini = Object.freeze({ T1: Object.freeze({ family: "R+C", families: Object.freeze(["R", "C"]), seeds: Object.freeze([990211, 990101]) }) });
    const out = runEmitterAwareStudy({ splits: mini, net, image: 16, sppIn: 4, sppRef: 8 }), V = out.verdict, T = out.tables, X = out.secondary;
    const cols = ["A", "B", "C", "D", "plainEasu", "plainBilinear", "Daware", "noisyFull1", "noisyFull4", "noisyHalfAware", "noisyHalfUp", "floor"];
    const shapeOk = cols.every((k) => T[k].length === 2 && T[k].every(Number.isFinite)) && Object.keys(T).length === cols.length;
    // every frame recomputed from nothing: the images, the emitters' light from the geometry, the network, the chain
    const mask = (fr) => Float64Array.from({ length: fr.w * fr.h }, (_, p) => fr.x[p * MASK_STRIDE + MASK_CHANNEL]);
    const want = mini.T1.seeds.map((seed, i) => {
        const fam = mini.T1.families[i], im = renderUpscaleImages(fam, seed, { w: 16, h: 16, sppIn: 4, sppRef: 8 }), F = emitterRadiance(makeScene(fam, seed), 16, 16);
        const h4 = denoise(net, im.half4.x, 8, 8).y, D = denoise(net, im.full1.x, 16, 16).y, aw = (y, k) => emitterAwareUpscale(y, mask(im.half4), 8, 8, 16, 16, k, F);
        const fr = { B: aw(h4, "easu"), C: aw(h4, "bilinear"), D, plainEasu: upscale(h4, 8, 8, 16, 16, "easu"), Daware: compositeEmitters(fillEmitters(D, F.cov, 16, 16), F),
                     noisyHalfAware: aw(im.half4.input, "bilinear"), noisyHalfUp: upscale(im.half4.input, 8, 8, 16, 16, "bilinear") };
        return { rel: Object.fromEntries(Object.entries(fr).map(([k, y]) => [k, relMSE(y, im.ref)])), nearB: nearEmitterShare(fr.B, im.ref, F.cov, 16, 16),
                 lit: F.cov.filter((v) => v > 0).length };
    });
    const recomputed = ["B", "C", "D", "plainEasu", "Daware", "noisyHalfAware", "noisyHalfUp"].every((k) => want.every((wt, i) => Object.is(T[k][i], wt.rel[k])));
    ok("!! *** end to end: B is the shipped network at half size, the emitters filled out, EASU, the emitters composited back from the geometry -- recomputed from nothing; so are C, H2's noisy frame, D composited, and round 29's plain EASU ***",
        shapeOk && recomputed && want.every((wt) => wt.lit > 0) && X.emitterPixels.every((n, i) => n === want[i].lit) && X.nearEmitter.B.every((v, i) => Object.is(v, want[i].nearB)),
        `${want.map((wt) => wt.lit).join(" + ")} emitter pixels in view`);
    const dOf = (x) => T.B.map((b, i) => Math.log(x[i]) - Math.log(b));
    // the columns by IDENTITY, not by the verdict they give: on two images, C1's counts over H2's noisy frame read the same
    // whether that frame is the emitter-aware one or round 29's plain bilinear -- measured, sabotage R55 went 0 red on the
    // verdict alone -- so the definition is one exported function, held here column by column, and the run is held to it
    const st = emitterSets(T);
    const columns = st.H1.noisy === T.noisyFull1 && st.H1.filter === T.D && st.H1.net.length === 1 && st.H1.net[0] === T.B && st.H1.floor === T.floor &&
        st.H2.noisy === T.noisyHalfAware && st.H2.filter === T.C && st.H2.net.length === 1 && st.H2.net[0] === T.B && st.H2.floor === T.floor &&
        /const sets = emitterSets\(tables\);\s+const V = verdict\(\{ sets, /.test(runEmitterAwareStudy.toString());
    const again = verdict({ sets: st, shuffled: null, c2Prior: ROUND_EMITTER.c2Prior, determinism: out.determinism, seedsDistinct: out.seedsDistinct, test: ROUND_EMITTER.test });
    ok("!! the verdict is section 91's: H1 B against D over D's 1-sample input, H2 B against C over the half-size input through the SAME emitter-aware bilinear chain -- C4 re-runs the whole candidate chain",
        columns && JSON.stringify(again) === JSON.stringify(V) && V.hypotheses.H1.d.every((v, i) => Object.is(v, dOf(T.D)[i])) && V.hypotheses.H2.d.every((v, i) => Object.is(v, dOf(T.C)[i])) &&
        out.determinism === true && out.seedsDistinct === true && out.seedCount === 10 && out.config.upscale.kind === "easu" &&
        /emitter-aware EASU/.test(out.config.hypotheses.H1) && /emitter-aware bilinear/.test(out.config.hypotheses.H2), `run ${V.run}`);
    ok("  reported beside it, never tested: the price of the quarter (A against B), aware against plain EASU, D composited against B, the share near an emitter of B, C, plain EASU and D",
        X.priceOfHalf.every((v, i) => Object.is(v, Math.log(T.B[i]) - Math.log(T.A[i]))) && X.awareVsPlainEasu.every((v, i) => Object.is(v, dOf(T.plainEasu)[i])) &&
        X.dAwareVsB.every((v, i) => Object.is(v, dOf(T.Daware)[i])) && ["B", "C", "plainEasu", "D"].every((k) => X.nearEmitter[k].length === 2 && X.nearEmitter[k].every((v) => v >= 0 && v <= 1)));
    const src = runEmitterAwareStudy.toString();
    ok("  ...and the run refuses to measure over a composite whose coverage is not the mask the network read at full size",
        /if \(!f\.cov\.every\(\(v, p\) => Object\.is\(v, m\[p\]\)\)\) throw new Error/.test(src));
    const cli = fs.readFileSync(path.join(ENG, "tools/denoiseStudy.mjs"), "utf8");
    const b0 = cli.indexOf('} else if (args.includes("--harvest-emitter")) {'), branch = b0 >= 0 ? cli.slice(b0, cli.indexOf('} else if (args.includes("--harvest-halfres")) {', b0)) : "";
    const code = branch.replace(/\/\/.*$/gm, "");
    ok("!! --harvest-emitter decodes the shipped file with decodeNet, runs runEmitterAwareStudy on ROUND_EMITTER's split and size under harvest, writes its results file and never an existing one, and logs no verdict",
        branch.length > 400 && /decodeNet\(shipped\.net\)/.test(code) && /runEmitterAwareStudy\(/.test(code) && !/runUpscaleStudy/.test(code) && /harvest: true/.test(code) &&
        /splits: ROUND_EMITTER\.splits/.test(code) && /image: ROUND_EMITTER\.image/.test(code) && /test: ROUND_EMITTER\.test/.test(code) && /c2Prior: ROUND_EMITTER\.c2Prior/.test(code) &&
        /path\.join\(ENG, ROUND_EMITTER\.results\)/.test(code) && /existsSync\(file\)/.test(code) && /sha256/.test(code) && /"fx\/fsr"/.test(code) && !/verdict|status|supported/.test(code));
    // section 92: the committed round 30 results, read back by code -- REPORTED, both hypotheses supported, as the rule gives it over
    // the file's own tables through the one definition of the hypotheses' columns
    const efile = path.join(ENG, RESULTS_EMITTER);
    if (fs.existsSync(efile)) {
        const res = JSON.parse(fs.readFileSync(efile, "utf8")), T4 = res.tables, X4 = res.secondary;
        const again4 = verdict({ sets: emitterSets(T4), shuffled: null, c2Prior: ROUND_EMITTER.c2Prior, determinism: res.determinism, seedsDistinct: res.seedsDistinct, test: ROUND_EMITTER.test });
        const H1 = again4.hypotheses.H1, H2 = again4.hypotheses.H2;
        ok("!! *** section 92: verdict() over the committed round 30 tables gives the file's verdict -- REPORTED, H1 SUPPORTED (12 of 12, p 1/4096 under 0.025), H2 SUPPORTED (10 of 12, p 0.0022 under 0.05) ***",
            again4.run === "reported" && res.verdict.run === "reported" && JSON.stringify(again4) === JSON.stringify(res.verdict) && again4.reasons.length === 0 &&
            H1.status === "supported" && H1.k === 12 && H1.p === 1 / 4096 && H1.threshold === 0.025 && H1.meanD > 0.69 && H1.meanD < 0.70 &&
            H2.status === "supported" && H2.k === 10 && H2.p < 0.0023 && H2.threshold === 0.05 && H2.meanD > 0.10 && H2.meanD < 0.11 &&
            [H1, H2].every((h) => h.c1.ok && h.c1.netWins === 12 && h.c1.filterWins === 12 && h.c3.nearFloor === 0) &&
            res.determinism === true && res.seedsDistinct === true && res.seedCount === 60 && res.config.image === 256 && res.config.upscale.kind === "easu",
            `H1 ${H1.meanD.toFixed(3)} p ${H1.p} | H2 ${H2.meanD.toFixed(3)} p ${H2.p.toFixed(4)}`);
        const crypto = await import("node:crypto");
        ok("!! ...and the network that ran is the one the page ships: the file's sha-256 is render/denoise-net-r11.json's, in this tree",
            res.shipped.file === SHIPPED_NET && res.shipped.sha256 === crypto.createHash("sha256").update(fs.readFileSync(path.join(ENG, SHIPPED_NET))).digest("hex"));
        const none = X4.emitterPixels.map((n, i) => (n === 0 ? i : -1)).filter((i) => i >= 0);
        ok("!! on every image with no emitter pixel in view (8 of 12), the chain IS round 29's, bit for bit -- B plain EASU, C plain bilinear, D composited D, H2's noisy frame the plain one",
            none.length === 8 && none.every((i) => Object.is(T4.B[i], T4.plainEasu[i]) && Object.is(T4.C[i], T4.plainBilinear[i]) && Object.is(T4.Daware[i], T4.D[i]) &&
                Object.is(T4.noisyHalfAware[i], T4.noisyHalfUp[i]) && Object.is(X4.awareVsPlainEasu[i], 0)), `no emitter in view: ${none.join(",")}`);
        // section 91's qualification, fixed before the run: H1 supported is half resolution's only if B ALSO beats D composited on the mean
        const mean = (a) => a.reduce((x, v) => x + v, 0) / a.length;
        const rule92 = (r) => r.verdict.run !== "reported" ? "recorded"
            : r.verdict.hypotheses.H1.status === "supported" ? (mean(r.secondary.dAwareVsB) > 0 ? "rig-timing" : "composite-fullres")
            : r.verdict.hypotheses.H2.status === "supported" ? "no-rig" : "recorded";
        const flipD = { ...res, secondary: { ...X4, dAwareVsB: X4.dAwareVsB.map((v) => -v) } };
        const onlyH2 = { ...res, verdict: { ...res.verdict, hypotheses: { ...res.verdict.hypotheses, H1: { ...res.verdict.hypotheses.H1, status: "not supported" } } } };
        ok("!! *** section 92's rule, as section 91 fixed it: H1 supported AND B ahead of D composited on the mean -- the half resolution carried it, so the next round is the rig's ***",
            rule92(res) === "rig-timing" && rule92(flipD) === "composite-fullres" && rule92(onlyH2) === "no-rig" && mean(X4.dAwareVsB) > 0.62 && mean(X4.dAwareVsB) < H1.meanD,
            `D composited against B: mean ${mean(X4.dAwareVsB).toFixed(3)}`);
        // the seven predictions, read off the file -- they decided nothing, and the claim that all seven held is this row's
        const wins = (a) => a.filter((v) => v > 0).length, lit = X4.emitterPixels.map((n) => n > 0);
        const P = {
            P1: H2.status === "supported" && H2.meanD >= 0.03 && H2.meanD <= 0.25 && H2.k >= 10,
            P2: H1.status === "supported" && H1.meanD >= 0.3 && H1.meanD <= 0.8 && H1.k >= 11,
            P3: [H1, H2].every((h) => h.c1.netWins === 12 && h.c1.filterWins === 12),
            P4: lit.every((l, i) => (l ? X4.awareVsPlainEasu[i] > 0 : Object.is(X4.awareVsPlainEasu[i], 0))),
            P5: X4.nearEmitter.B.every((v) => v < 0.5) && lit.every((l, i) => !l || X4.nearEmitter.B[i] < X4.nearEmitter.plainEasu[i]),
            P6: mean(X4.dAwareVsB) > 0 && wins(X4.dAwareVsB) >= 9 && mean(X4.dAwareVsB) < H1.meanD,
            P7: mean(X4.priceOfHalf) >= 0.3 && mean(X4.priceOfHalf) <= 0.8 && wins(X4.priceOfHalf) >= 10,
        };
        ok("  ...and section 91's seven predictions, read off the file: all seven held", Object.values(P).every(Boolean),
            Object.entries(P).map(([k, v]) => `${k} ${v ? "held" : "FAILED"}`).join(", "));
    } else ok("!! section 92 reads render/denoise-results-emitter.json, and it is not there", false);
}

console.log("\n18. ROUND 32: THE TEMPORAL UPSCALE (pre-registration section 95)");
{
    const { runTemporalUpscaleStudy, temporalUpFrames, temporalUpSets, ROUND_TEMPORALUP, RESULTS_TEMPORALUP } = await imp("render/denoiseStudy.mjs");
    const { SPLITS_TEMPORALUP } = await imp("render/denoiseScenes.mjs");
    ok("!! ROUND_TEMPORALUP is section 95's: SPLITS_TEMPORALUP at 256 x 256, the sign-flip test, the results file named, and temporalUpSets the two hypotheses' columns",
        ROUND_TEMPORALUP.splits === SPLITS_TEMPORALUP && ROUND_TEMPORALUP.image === 256 && ROUND_TEMPORALUP.test === "signflip" && ROUND_TEMPORALUP.results === RESULTS_TEMPORALUP &&
        RESULTS_TEMPORALUP === "render/denoise-results-temporalup.json" && temporalUpSets({ B1: 1, Bt: 2, Dt: 3 }).H1.filter === 1 && temporalUpSets({ B1: 1, Bt: 2, Dt: 3 }).H2.filter === 3 &&
        typeof temporalUpFrames === "function");
    // the whole study, end to end, on three scenes outside every split at 24 x 24: every table filled, C4 and C5 held, a verdict made
    const shipped = JSON.parse(fs.readFileSync(path.join(ENG, "render", "denoise-net-r11.json"), "utf8")), { decodeNet } = await imp("render/denoiseDevice.mjs");
    const out = runTemporalUpscaleStudy({ splits: { T1: { family: "R+C", families: ["R", "C", "R"], seeds: [990000, 990001, 990004] } }, net: decodeNet(shipped.net), image: 24, sppIn: 2, sppRef: 8 });
    ok("  runTemporalUpscaleStudy end to end on three scenes outside every split: every table three long and finite, C4 and C5 held, the verdict made",
        ["Bt", "B1", "Dt", "D1", "BtNoClamp", "DtAware", "noisyHalf", "noisyFull1", "floor"].every((k) => out.tables[k].length === 3 && out.tables[k].every(Number.isFinite)) &&
        out.determinism === true && out.seedsDistinct === true && out.seedCount === 54 && !!out.verdict && !!out.verdict.run && out.secondary.history.length === 3,
        `run ${out.verdict.run}`);
    // SECTION 96: round 32's verdict, re-derived from the committed results file -- verdict() over its own tables through
    // temporalUpSets, the one definition of the hypotheses' columns, and section 95's rule as code
    const tfile = path.join(ENG, RESULTS_TEMPORALUP);
    if (!fs.existsSync(tfile)) console.log(`  SKIP  section 96: ${RESULTS_TEMPORALUP} not in this tree`);
    else {
        const res = JSON.parse(fs.readFileSync(tfile, "utf8")), T = res.tables, X = res.secondary, crypto = await import("node:crypto");
        ok("!! section 96: the file is the harvest of the commit carrying section 95, at 256 x 256 over eight jittered frames, with the network the page ships",
            res.commit === "75052a02" && res.config.image === 256 && res.config.frames === 8 && res.config.split.n === 12 &&
            res.shipped.sha256 === crypto.createHash("sha256").update(fs.readFileSync(path.join(ENG, "render", "denoise-net-r11.json"))).digest("hex"),
            `${res.commit}; sha-256 ${res.shipped.sha256.slice(0, 12)}`);
        const again = verdict({ sets: temporalUpSets(T), shuffled: null, c2Prior: ROUND_TEMPORALUP.c2Prior, determinism: res.determinism, seedsDistinct: res.seedsDistinct, test: ROUND_TEMPORALUP.test });
        const H = again.hypotheses;
        ok("!! *** section 96: verdict() over the committed round 32 tables gives the file's verdict -- REPORTED, H1 SUPPORTED (12 of 12, p 1/4096 under 0.025), H2 SUPPORTED (11 of 12, p 0.00073 under 0.05) ***",
            JSON.stringify(again) === JSON.stringify(res.verdict) && again.run === "reported" && H.H1.status === "supported" && H.H1.k === 12 && H.H1.p === 1 / 4096 &&
            H.H2.status === "supported" && H.H2.k === 11 && Math.abs(H.H2.p - 3 / 4096) < 1e-15 && H.H1.c1.ok && H.H2.c1.ok && res.determinism && res.seedsDistinct && res.seedCount === 216,
            `H1 mean d ${H.H1.meanD.toFixed(3)}, H2 mean d ${H.H2.meanD.toFixed(3)}`);
        // section 95's rule: both supported -> the accumulation to the device; H1 alone -> the half-size lead was a single frame's; H1 not -> the suspects
        const rule96 = (v) => (v.run !== "reported" ? "recorded" : v.hypotheses.H1.status !== "supported" ? "suspects" : v.hypotheses.H2.status === "supported" ? "device" : "single-frame");
        const flip = (k) => ({ ...again, hypotheses: { ...again.hypotheses, [k]: { ...again.hypotheses[k], status: "not supported" } } });
        ok("!! *** section 96's rule, as section 95 fixed it: both supported, so the accumulation goes to the device and is timed on the rig -- denoise-temporalup-device ***",
            rule96(again) === "device" && rule96(flip("H2")) === "single-frame" && rule96(flip("H1")) === "suspects" && rule96({ ...again, run: "not reported" }) === "recorded");
        // the five predictions, read off the file -- they decided nothing, and section 96 says which held
        const mean = (a) => a.reduce((x, v) => x + v, 0) / a.length;
        const P = { P1: H.H1.meanD >= 0.05 && H.H1.meanD <= 0.40 && H.H1.k >= 10, P2: H.H2.meanD >= 0.5 && H.H2.meanD <= 3.0 && H.H2.k >= 10, P3: H.H1.c1.ok && H.H2.c1.ok,
                    P4: mean(X.clamp) > 0, P5: X.history.every((h) => h.meanN >= 3 && h.meanN <= 7) };
        ok("  section 96's account of section 95's predictions: P1, P3, P4 and P5 held; P2 missed -- H2's mean d +3.016 is over its predicted +3.0",
            P.P1 && !P.P2 && P.P3 && P.P4 && P.P5 && H.H2.meanD > 3.0 && H.H2.meanD < 3.05 && H.H2.k === 11,
            `clamp mean d ${mean(X.clamp).toFixed(3)} (${X.clamp.filter((v) => v > 0).length} of 12); history ${Math.min(...X.history.map((h) => h.meanN)).toFixed(2)}-${Math.max(...X.history.map((h) => h.meanN)).toFixed(2)} frames`);
    }
}

console.log(`\n${fails ? "FAIL -- " + fails + " check(s)" : "ALL GREEN"} (${Date.now() - t0} ms)` +
    "\nnot closed here: the study itself. `node tools/denoiseStudy.mjs --harvest-r11 --cache <dir> --workers 4` is round 11's one command, and " +
    "no gate runs it.");
process.exit(fails ? 1 : 0);
