// WebGLEngine/render/denoiseStudy-selfcheck.mjs -- the denoiser arc, round 2
//
// Run: node render/denoiseStudy-selfcheck.mjs
//
// GATES render/denoiseStudy.mjs -- the pre-registered study as one pipeline (tools/denoiseStudy.mjs is its CLI) -- on its MINIATURE only (scenes seeded
// outside every split, 16 x 16, four training steps). Its exports, each named here: SEEDS, RESULTS, RESULTS_R2, ROUND1,
// ROUND2, MINI, shuffledTargets, renderSplit, runStudy. What it holds is the PLUMBING: that every stage runs, in order, on every
// split, and hands verdict() what the pre-registration says -- not any number the miniature produces, which is
// meaningless at this size and is not looked at beyond its shape.
//
// Section 3 (the re-run, pre-registration section 13): control C0 stops the run BEFORE a test scene is rendered.
//
// ---- SABOTAGES, WITH THEIR RESULTS ---------------------------------------------------------------------------
//   R1  the test scenes rendered with the rest, before C0                        2 RED
//   R2  a C0 failure ignored: the run carries on to the tests                    2 RED
//   R3  ROUND2 pointed at round 1's spent test splits                            1 RED
"use strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const imp = (p) => import(pathToFileURL(path.join(ENG, p)).href);
const { SEEDS, RESULTS, RESULTS_R2, ROUND1, ROUND2, MINI, shuffledTargets, renderSplit, runStudy } = await imp("render/denoiseStudy.mjs");
const { SPLITS, SPLITS_R2, isDatasetSeed } = await imp("render/denoiseScenes.mjs");

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

console.log(`\n${fails ? "FAIL -- " + fails + " check(s)" : "ALL GREEN"} (${Date.now() - t0} ms)` +
    "\nnot closed here: the study itself. `node tools/denoiseStudy.mjs --harvest-r2` is the re-run's one command, and " +
    "no gate runs it.");
process.exit(fails ? 1 : 0);
