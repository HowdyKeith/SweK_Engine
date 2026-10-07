// WebGLEngine/render/denoiseStudy-selfcheck.mjs -- the denoiser arc, round 2
//
// Run: node render/denoiseStudy-selfcheck.mjs
//
// GATES render/denoiseStudy.mjs -- the pre-registered study as one pipeline (tools/denoiseStudy.mjs is its CLI) -- on its MINIATURE only (scenes seeded
// outside every split, 16 x 16, four training steps). Its exports, each named here: SEEDS, RESULTS, MINI,
// shuffledTargets, renderSplit, runStudy. What it holds is the PLUMBING: that every stage runs, in order, on every
// split, and hands verdict() what the pre-registration says -- not any number the miniature produces, which is
// meaningless at this size and is not looked at beyond its shape.
"use strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const imp = (p) => import(pathToFileURL(path.join(ENG, p)).href);
const { SEEDS, RESULTS, MINI, shuffledTargets, renderSplit, runStudy } = await imp("render/denoiseStudy.mjs");
const { SPLITS, isDatasetSeed } = await imp("render/denoiseScenes.mjs");

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
    const out = runStudy({ ...MINI });
    const T = out.tables;
    ok("!! every stage ran in order: rendered, filter tuned, networks trained, shuffled networks trained, measured, secondary",
        ["rendered", "filter tuned", "networks trained", "shuffled networks trained", "measured", "secondary"].every((k, i, a) => out.timings[k] >= (i ? out.timings[a[i - 1]] : 0)),
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

console.log(`\n${fails ? "FAIL -- " + fails + " check(s)" : "ALL GREEN"} (${Date.now() - t0} ms)` +
    "\nnot closed here: the study itself. `node tools/denoiseStudy.mjs --harvest` is the harvest round's one command, and " +
    "nothing in this round runs it.");
process.exit(fails ? 1 : 0);
