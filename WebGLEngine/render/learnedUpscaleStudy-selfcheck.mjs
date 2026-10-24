#!/usr/bin/env node
// WebGLEngine/render/learnedUpscaleStudy-selfcheck.mjs -- FSR4's round 65 (pre-registration section 148): its two harvests' code,
// on a miniature of non-dataset scenes at 32 x 32 -- the splits as section 148 fixed them, the refusals, the training's choice of
// seed by validation and C2's shuffle, the test's arms and verdict, and the two commands.
//
// SABOTAGED, each restored byte-identical: LS1 the candidate the highest validation loss -> 1 red; LS2 C2 trained on unshuffled
// targets -> 1 red; LS3 the shuffle allowed fixed points -> 1 red; LS4 H1 against bilinear -> *** 0 RED at first ***, then 1 with
// the effects row added for it; LS5 the training command without harvest -> 1 red; LS6 EASU graded in linear radiance -> 1 red;
// LS7 the C seeds shifted onto 61101 -> 1 red.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const imp = (p) => import(pathToFileURL(path.join(ENG, p)).href);
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const t0 = Date.now();
const LS = await imp("render/learnedUpscaleStudy.mjs"), U = await imp("render/learnedUpscale.mjs"), D = await imp("render/denoiseScenes.mjs");
const { decodeNet } = await imp("render/denoiseDevice.mjs"), { relMSE } = await imp("render/denoiseStats.mjs"), { toPerceptual } = await imp("render/denoiseUpscale.mjs");
const net = decodeNet(JSON.parse(fs.readFileSync(path.join(ENG, "render", "denoise-net-r11.json"), "utf8")).net);

console.log("1. THE SPLITS AND THE ROUND");
{
    const S = D.SPLITS_UPSCALE_LEARNED, all = [S.train, S.val, S.T1].flatMap((x) => x.seeds);
    const earlier = new Set([D.SPLITS_TEMPORALUP, D.SPLITS_FRAMEGEN, D.SPLITS_FRAMEGEN_LF, D.SPLITS_FRAMEGEN_DISPLAY, D.SPLITS_FRAMEGEN_LARGE, D.SPLITS_FRAMEGEN_HOLES, D.SPLITS_PAGE, D.SPLITS_MESH_C, D.SPLITS_R47].flatMap((x) => Object.values(x).flatMap((y) => y.seeds)));
    ok("!! SPLITS_UPSCALE_LEARNED is section 148's: training 61000-61199 (100 R, 100 C), validation 62000-62019 (10 and 10), test 63000-63011 R and 64000-64011 C -- all new, all reserved, none shared",
        S.train.seeds.length === 200 && S.train.seeds.every((x, i) => x === 61000 + i) && S.train.families.slice(0, 100).every((f) => f === "R") && S.train.families.slice(100).every((f) => f === "C") &&
        S.val.seeds.every((x, i) => x === 62000 + i) && S.val.seeds.length === 20 && S.val.families.filter((f) => f === "R").length === 10 &&
        S.T1.seeds.slice(0, 12).every((x, i) => x === 63000 + i) && S.T1.seeds.slice(12).every((x, i) => x === 64000 + i) && S.T1.families.slice(12).every((f) => f === "C") &&
        new Set(all).size === 244 && all.every((x) => D.isDatasetSeed(x) && !earlier.has(x)));
    const R = LS.ROUND_UPSCALE_LEARNED;
    ok("  ROUND_UPSCALE_LEARNED: 256 x 256 at 4 spp in and 32 for the truth, the sign-flip test, C1 of the candidate at 22, seeds 1-3, the denoiser's schedule, its two files",
        R.image === 256 && R.sppIn === 4 && R.sppRef === 32 && R.test === "signflip" && R.c1Of === "candidate" && R.c1Min === 22 && R.seeds.join() === "1,2,3" && R.train === U.UP_TRAIN &&
        R.net === "render/upscale-net-r65.json" && R.results === "render/denoise-results-upscale-learned.json" && U.UP_TRAIN.steps === 1500 && U.UP_TRAIN.batch === 4 && U.UP_TRAIN.crop === 32);
    const p = LS.derangement(200, LS.SHUFFLE_SEED);
    ok("  C2's shuffle: a permutation of the 200 training targets with no image keeping its own, from seed 65", p.length === 200 && new Set(p).size === 200 && p.every((v, i) => v !== i) && LS.SHUFFLE_SEED === 65);
    let threw = null; try { U.upscaleExample("R", 61000, net, { W: 8, H: 8, sppIn: 1, sppRef: 1 }); } catch (e) { threw = e.message; }
    ok("!! a dataset seed without harvest is refused before anything is rendered", /seed 61000 is a dataset seed/.test(threw || ""), threw);
}

console.log("\n2. THE TRAINING HARVEST, IN MINIATURE");
const mini = Object.freeze({ train: Object.freeze({ family: "R+C", families: Object.freeze(["R", "C", "R"]), seeds: Object.freeze([990930, 990931, 990932]) }),
                             val: Object.freeze({ family: "R", families: Object.freeze(["R"]), seeds: Object.freeze([990933]) }),
                             T1: Object.freeze({ family: "R+C", families: Object.freeze(["R", "C"]), seeds: Object.freeze([990934, 990935]) }) });
const tr = LS.runUpscaleTraining({ splits: mini, net, W: 32, sppIn: 2, sppRef: 4, seeds: [1, 2], train: { steps: 6, batch: 2, crop: 16 } });
{
    const vals = tr.runs.map((r) => r.valMean), best = tr.runs.find((r) => r.seed === tr.candidate);
    ok("!! the candidate is the seed with the lowest validation loss -- the validation loss each seed's chain's display-space relMSE on the validation split",
        best.valMean === Math.min(...vals) && tr.runs.every((r) => r.val.length === 1 && r.val.every(Number.isFinite)), `seeds ${tr.runs.map((r) => `${r.seed}: ${r.valMean.toExponential(3)}`).join(", ")} -> ${tr.candidate}`);
    const ex = U.upscaleExample("R", 990933, net, { W: 32, H: 32, sppIn: 2, sppRef: 4 }), y = U.upscaleChain(best.net, ex);
    ok("  ...and the validation loss is gradeDisplay of U's chain, recomputed here bit for bit", Object.is(best.val[0], relMSE(Float64Array.from(y, toPerceptual), Float64Array.from(ex.ref, toPerceptual))));
    const again = U.trainUpscaler([0, 1, 2].map((i) => U.upscaleExample(mini.train.families[i], mini.train.seeds[i], net, { W: 32, H: 32, sppIn: 2, sppRef: 4 })), { seed: best.seed, steps: 6, batch: 2, crop: 16 });
    ok("  each seed's U is trainUpscaler's on the training examples, bit for bit", again.net.layers.every((L, i) => L.W.every((v, j) => Object.is(v, best.net.layers[i].W[j]))));
    ok("  C2's U is trained on the candidate's seed and differs from it -- its targets were shuffled", tr.c2.seed === tr.candidate && tr.c2.net.layers[0].W.some((v, j) => v !== best.net.layers[0].W[j]));
}

console.log("\n3. THE TEST HARVEST, IN MINIATURE");
{
    const best = tr.runs.find((r) => r.seed === tr.candidate), out = LS.runUpscaleTest({ splits: mini, net, U: best.net, Uc2: tr.c2.net, W: 32, sppIn: 2, sppRef: 4, c1Min: 2 });
    const ex = U.upscaleExample("R", 990934, net, { W: 32, H: 32, sppIn: 2, sppRef: 4, ref2: true }), g = (y) => LS.gradeDisplay(y, ex);
    ok("!! every table is its arm's display-space relMSE, recomputed here bit for bit: U's chain, EASU's, bilinear's, the noisy floor, C2's U, and the second reference",
        Object.is(out.tables.U[0], g(U.upscaleChain(best.net, ex))) && Object.is(out.tables.easu[0], g(ex.easu)) && Object.is(out.tables.bilinear[0], g(ex.bilinear)) &&
        Object.is(out.tables.noisy[0], g(ex.noisy)) && Object.is(out.tables.c2[0], g(U.upscaleChain(tr.c2.net, ex))) && Object.is(out.tables.floor[0], g(ex.ref2)));
    ok("  ...and the verdict asks H1 of U against EASU and H2 of U against bilinear, C1 of the candidate, C2 from the shuffled U's mean d against EASU",
        out.verdict.hypotheses.H1 && out.verdict.hypotheses.H2 && out.verdict.controls.C2.citedFrom === 65 && out.determinism === true && out.secondary.linear.H1.length === 2);
    // sabotage LS4 (H1 against bilinear) went 0 red before this row: nothing held which arm each hypothesis compares
    const { effects } = await imp("render/denoiseStats.mjs"), mean = (xs) => xs.reduce((q, v) => q + v, 0) / xs.length;
    ok("!! H1's effects are U against EASU and H2's U against bilinear, table by table",
        Math.abs(out.verdict.hypotheses.H1.meanD - mean(effects(out.tables.easu, out.tables.U))) < 1e-15 && Math.abs(out.verdict.hypotheses.H2.meanD - mean(effects(out.tables.bilinear, out.tables.U))) < 1e-15,
        `H1 ${out.verdict.hypotheses.H1.meanD}, H2 ${out.verdict.hypotheses.H2.meanD}`);
    ok("  the arms are the chain's: EASU's and bilinear's frames are compositeEmitters(upscale(half), the light sources at full size), the noisy floor the half-size INPUT so",
        ex.easu.length === 32 * 32 * 3 && ex.bilinear.some((v, i) => v !== ex.easu[i]) && ex.noisy.some((v, i) => v !== ex.bilinear[i]));
}

console.log("\n4. THE COMMANDS");
{
    const cli = fs.readFileSync(path.join(ENG, "tools/denoiseStudy.mjs"), "utf8"), br = (flag) => { const b0 = cli.indexOf(`} else if (args.includes("${flag}")) {`); return b0 >= 0 ? cli.slice(b0, cli.indexOf("} else if (", b0 + 10)).replace(/\/\/.*$/gm, "") : ""; };
    const a = br("--harvest-upscale-train"), b = br("--harvest-upscale-test");
    ok("!! --harvest-upscale-train runs runUpscaleTraining under harvest, writes render/upscale-net-r65.json and never an existing one, with every seed's net, C2's, the shipped sha-256 and the commit",
        /runUpscaleTraining\(\{ net: decodeNet\(shipped\.net\), harvest: true/.test(a) && /RESULTS_UPSCALE_TRAIN/.test(a) && /existsSync\(file\)/.test(a) && /c2: \{/.test(a) && /sha256/.test(a) && /commit: git/.test(a) && !/verdict/.test(a));
    ok("!! --harvest-upscale-test reads the committed training file's candidate and C2's U, runs runUpscaleTest under harvest, writes its own file and never an existing one, and records both commits",
        /tr\.runs\.find\(\(x\) => x\.seed === tr\.candidate\)/.test(b) && /Uc2: decodeNet\(tr\.c2\.net\)/.test(b) && /harvest: true/.test(b) && /RESULTS_UPSCALE_TEST/.test(b) && /existsSync\(file\)/.test(b) && /out\.commit = /.test(b) && /commit: tr\.commit/.test(b));
    ok("  neither file is written yet: section 148's order -- this code, then the training harvest, then the test harvest", !fs.existsSync(path.join(ENG, LS.RESULTS_UPSCALE_TRAIN)) && !fs.existsSync(path.join(ENG, LS.RESULTS_UPSCALE_TEST)));
}

console.log(`\n${fails ? "FAIL -- " + fails + " check(s)" : "ALL GREEN"} (${Date.now() - t0} ms)`);
process.exit(fails ? 1 : 0);
