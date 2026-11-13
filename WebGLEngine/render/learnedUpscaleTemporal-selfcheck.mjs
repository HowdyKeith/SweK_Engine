#!/usr/bin/env node
// WebGLEngine/render/learnedUpscaleTemporal-selfcheck.mjs -- FSR4 round 70 (pre-registration section 161): U_T, a held residual on
// round 32's temporal upscale, and its two harvests' code, on non-dataset sequences at 32 x 32 and synthetic inputs:
//   1. the example: its input's channels are Bt's light, the unclamped history, the measured frame's EASU, the history length,
//      the guides; Bt and B1 are those composited
//   2. U_T: untrained it is Bt bit for bit; any U_T stays within 0.5-1.5 x A; its gradient against central differences; a crop
//   3. its training: deterministic by seed, and it learns
//   4. the study: the splits, the round, the training's choice and C2, the test's arms and verdict, the cache's key, the commands
//
// SABOTAGED, each restored byte-identical: T1 the head's bias 0.1, T3 the gradient without tanh', T4 A unclamped, T6 the history
// length not normalised, T7 the crop's column offset dropped, S1 H1 against B1, S2 C2 unshuffled, S3 the candidate the highest
// validation, S5 the test's truth 512, S6 the test's commit read after -> 1 red each; T2 the hold 0.6, S4 the test seeds onto round
// 69's -> 2 red; T5 the measured frame's EASU left jittered and T8 the reference at the orbit's first eye -> *** 0 RED at first ***,
// then 1 each with the two rows added for them.
// SECTION 162: V162a the candidate typed 2, V162b H1's count typed 19, V162c the test's commit typed 2daaa618, V162d the rule read at
// 10 %, V162f the losses typed 3,4,7,10 -> 1 red each; V162e H1 re-derived against B1 -> 2 red. Each restored byte-identical.
// ROUND 72 (section 167): H1 halfInput one corner -> 3 red, H2 the upsample's centres shifted -> 2, H3 the backward without the
// transpose -> 1, H4 width 8 -> 3, S1 round 72's variant full -> 1, S2 its test seeds onto round 70's -> 1; H5 U_TH's crops at odd
// corners and S3 the study's training without the variant -> *** 0 RED at first ***, then 1 each with the two rows added for them.
// SECTION 170: V170a round 72's candidate typed 2, V170b H72a's count typed 15, V170c the gain typed 0.0644, V170d the test's commit
// typed 670c28bd -> 1 red each. Each restored byte-identical.
// ROUND 84 (section 190), against this gate, denoiseLearnedUpscaleGPU-selfcheck and denoiseScenes-selfcheck, each restored byte-identical:
//   E3 U_TH8's crops at odd corners, E5 U0 graded as U, E6 the kept fraction inverted, E7 round 84 without its baseline, E10 temporalRound(84)
//   round 72's, E15 the odd-crop refusal U_TH's alone -> 1 red each; E8 its R seeds onto round 72's and E9 its seeds not reserved -> 2 red
//   each (here and denoiseScenes-selfcheck); E1 isHalfT 16 wide only -> 4 red; E2 U_TH8 12 wide and E4 shapeOfT's half8 U_TH's shape ->
//   5 red each. This gate's v4909 row pinned UT_VARIANTS to "full,half" and was widened to "full,half,half8" with the variant.
// SECTION 191 (round 84's verdict rows, sabotaged in the committed files and the registration, each restored byte-identical): Y1 the
//   test's cache hits typed 0, Y2 H84a's count typed 22, Y4 a U_TH grade nudged, Y5 seed 2's validation altered in the 1080's net, Y6 one
//   loss altered in the Intel's, Y7 section 191 reading round 85, Y8 it calling P2 held -> 1 red each; Y3 a U_TH8 grade nudged -> 2 red.
// ROUND 87 (section 195), against this gate, denoiseLearnedUpscaleGPU-selfcheck and denoiseScenes-selfcheck, each restored byte-identical:
//   Q5 U_TQ's corner grid by 2, Q6 no refusal of a crop off the 4 grid, Q7 the loss's gradient scaled, Q8 encodeNet and Q9 decodeNet dropping
//   the scale, Q10 round 87's variant half, Q13 temporalRound(87) round 84's -> 1 red each; Q2 upQuarter's taps by 2, Q3 upQuarterT
//   scattering to the wrong tap, Q11 its R seeds onto round 84's, Q12 its seeds not reserved -> 2 red each; Q1 quarterInput over 15 -> 3
//   red; Q19 scaleOfT ignoring the scale -> 6 red; Q4 makeUpscalerT not marking the scale -> 7 red. Writing U_TQ's corners, I first named
//   the grid `step`, which the training loop's own `step` shadowed, so the corners fell on multiples of 2: the corner row was red on the
//   first run and the constant is now `grid`. This gate's v4909 row was widened again, to "full,half,half8,quarter".
"use strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const imp = (p) => import(pathToFileURL(path.join(ENG, p)).href);
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const t0 = Date.now();
const T = await imp("render/learnedUpscaleTemporal.mjs"), LT = await imp("render/learnedUpscaleTemporalStudy.mjs"), D = await imp("render/denoiseScenes.mjs");
const { decodeNet } = await imp("render/denoiseDevice.mjs"), { seededRandom } = await imp("brain/convNet.mjs"), { compositeEmitters, toPerceptual } = await imp("render/denoiseUpscale.mjs");
const { emitterRadiance } = await imp("render/denoiseMask.mjs"), { FRAMES } = await imp("render/denoiseTemporal.mjs"), { relMSE } = await imp("render/denoiseStats.mjs");
const net = decodeNet(JSON.parse(fs.readFileSync(path.join(ENG, "render", "denoise-net-r11.json"), "utf8")).net);
const W = 32, o = { W, sppIn: 2, sppRef: 8 };

console.log("1. THE EXAMPLE");
const ex = T.temporalExample("R", 990950, net, { ...o, ref2: true });
{
    const S = D.makeScene("R", 990950), full = emitterRadiance(S, W, W), C = T.UT_CHANNELS, ch = (k) => { const a = new Float64Array(W * W * 3); for (let p = 0; p < W * W; p++) for (let c = 0; c < 3; c++) a[p * 3 + c] = ex.x[p * C + k + c]; return a; };
    const same = (a, b) => a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
    ok("!! UT_CHANNELS 17: Bt's light (0-2) composited IS Bt, the measured frame's EASU (6-8) composited IS B1, bit for bit -- and the unclamped history (3-5) differs from the clamped",
        C === 17 && same(compositeEmitters(ch(0), full), ex.bt) && same(compositeEmitters(ch(6), full), ex.b1) && ch(3).some((v, i) => v !== ch(0)[i]) && same(ex.cov, full.cov));
    let nOk = true, gOk = true; for (let p = 0; p < W * W; p++) { const n = ex.x[p * C + 9] * FRAMES; if (!(n >= 1 && n <= FRAMES)) nOk = false; const d = ex.x[p * C + 16]; if (!(d >= 0 && d < 1)) gOk = false; }
    ok("  ...the history length n / 8 with n in 1..8, the depth d / (1 + d) in [0, 1), the references two different renders", nOk && gOk && ex.ref2.some((v, i) => v !== ex.ref[i]) && ex.W === W && ex.H === W);
    // sabotages T5 (the measured frame's EASU left jittered) and T8 (the reference at the orbit's first eye) went 0 red before these
    // two rows: every row read the example's own channels, which agreed with themselves either way
    const { render } = await imp("physics/render/pathTracer.mjs"), { cameraPath } = await imp("render/denoiseTemporal.mjs"), TU = await imp("render/denoiseTemporalUpscale.mjs");
    const { denoise } = await imp("render/denoiseNet.mjs"), { upscale, fillEmitters } = await imp("render/denoiseUpscale.mjs"), { emitterCoverage, withMask } = await imp("render/denoiseMask.mjs");
    const rs = TU.temporalUpscaleSeeds(990950), path8 = cameraPath(S), j = TU.JITTER[FRAMES - 1], w = W / 2, eye = path8.eyes[FRAMES - 1];
    const opt = (ww, spp, sd, e, off) => ({ w: ww, h: ww, spp, seed: sd, rgb: true, eye: e, look: S.look, up: S.up, fovDeg: S.fovDeg, sky: S.sky, pixelOffset: off });
    const inp = render(S.scene, opt(w, 2, rs.half[FRAMES - 1], eye, j)), gb = D.guideBuffers({ ...S, eye }, w, w, j), cv = emitterCoverage({ ...S, eye }, w, w, j);
    const easuLast = upscale(fillEmitters(denoise(net, withMask(D.inputChannels(inp, gb.albedo, gb.normal, w, w), cv), w, w).y, cv, w, w), w, w, W, W, "easu");
    ok("!! channels 6-8 are the measured frame's EASU moved to the unjittered grid -- shiftResample by twice its jitter -- re-derived here from its own render",
        same(ch(6), TU.shiftResample(easuLast, W, W, ...TU.halfShift(j))) && !same(ch(6), easuLast));
    ok("!! the references are traced at the measured frame's eye -- the orbit's last, the scene's own -- unjittered, with the round's own seeds",
        eye.every((v, i) => v === S.eye[i]) && same(ex.ref, render(S.scene, opt(W, 8, rs.ref, S.eye, null))) && same(ex.ref2, render(S.scene, opt(W, 8, rs.ref2, S.eye, null))));
    let threw = null; try { T.temporalExample("R", 73000, net, o); } catch (e) { threw = e.message; }
    ok("!! a dataset seed without harvest is refused before anything is rendered", /seed 73000 is a dataset seed/.test(threw || ""), threw);
}

console.log("\n2. U_T");
{
    const u0 = T.makeUpscalerT(4), r0 = T.temporalUpscale(u0, ex.x, W, W);
    ok("!! an untrained U_T -- the head zero -- is Bt exactly: its chain bit for bit Bt's; three layers of 32, a 3-channel head, the hold 0.5",
        T.temporalChain(u0, ex).every((v, i) => Object.is(v, ex.bt[i])) && T.UT_SHAPE[0][0] === 17 && T.UT_SHAPE[0][1] === 32 && T.UT_SHAPE[3][1] === 3 && T.UT_SCALE === 0.5 && r0.r.every((v) => v === 0));
    const nt = T.makeUpscalerT(5);
    nt.layers.forEach((L, li) => { const r = seededRandom(60 + li); for (let i = 0; i < L.W.length; i++) L.W[i] += 0.3 * (r.u() - 0.5); for (let i = 0; i < L.b.length; i++) L.b[i] += 0.3 * (r.u() - 0.5); });
    const q = T.temporalUpscale(nt, ex.x, W, W);
    let held = true; for (let p = 0; p < W * W; p++) for (let c = 0; c < 3; c++) { const a = ex.x[p * 17 + c], k = q.y[p * 3 + c] / a; if (a > 0 && !(k >= 0.5 - 1e-12 && k <= 1.5 + 1e-12 && Math.abs(k - (1 + 0.5 * Math.tanh(q.r[p * 3 + c]))) < 1e-12)) held = false; }
    ok("!! any U_T's pixel is A's times 1 + 0.5 tanh(r): within half and one and a half of the accumulation on every channel", held && q.r.some((v) => Math.abs(v) > 0.05));
    // the gradient on a synthetic 8 x 8 frame: random inputs, a reference, light sources on some pixels
    const r = seededRandom(7), n = 64, x = Float64Array.from({ length: n * 17 }, () => r.u()), ref = Float64Array.from({ length: n * 3 }, () => 2 * r.u()), cov = new Float64Array(n), E = new Float64Array(n * 3);
    for (let p = 0; p < n; p += 7) { cov[p] = 0.4; for (let c = 0; c < 3; c++) E[p * 3 + c] = 0.6; }
    const G = T.temporalLoss(nt, x, 8, 8, ref, cov, E), L = () => T.temporalLoss(nt, x, 8, 8, ref, cov, E).loss;
    let worst = 0;
    for (const [li, wi] of [[0, 9], [0, 16 * 9 + 2], [1, 500], [2, 3000], [3, 5], [3, 70]]) { const Wt = nt.layers[li].W, keep = Wt[wi], e = 1e-5; Wt[wi] = keep + e; const a1 = L(); Wt[wi] = keep - e; const b1 = L(); Wt[wi] = keep;
        const fd = (a1 - b1) / (2 * e), an = G.grads[li].dW[wi]; worst = Math.max(worst, Math.abs(fd - an) / Math.max(1e-9, Math.abs(fd) + Math.abs(an))); }
    ok("!! U_T's gradient, through the composite, the transfer and the hold, matches central differences in every layer within 1e-5 relative", worst < 1e-5, `worst ${worst.toExponential(2)}`);
    const Cw = T.temporalCrop(ex, 0, 0, W), Gw = T.temporalLoss(nt, ex.x, W, W, ex.ref, ex.cov, ex.E), Gc = T.temporalLoss(nt, Cw.x, W, W, Cw.ref, Cw.cov, Cw.E);
    const C4 = T.temporalCrop(ex, 5, 9, 8);
    ok("  a crop of the whole frame gives the whole frame's loss and gradients; a crop's pixel is the frame's at its offset",
        Gc.loss === Gw.loss && Gc.grads.every((g, i) => g.dW.every((v, j) => v === Gw.grads[i].dW[j])) && C4.x[(2 * 8 + 3) * 17 + 4] === ex.x[((9 + 2) * W + 5 + 3) * 17 + 4] && C4.ref[(2 * 8 + 3) * 3] === ex.ref[((9 + 2) * W + 8) * 3]);
}

console.log("\n3. TRAINING");
const seqs = [0, 1, 2, 3].map((i) => T.temporalExample(i % 2 ? "C" : "R", 990951 + i, net, o));
{
    const a = T.trainTemporal(seqs, { seed: 3, steps: 6, batch: 2, crop: 16 }), b = T.trainTemporal(seqs, { seed: 3, steps: 6, batch: 2, crop: 16 });
    ok("  U_T trains deterministically by seed", a.net.layers.every((L, i) => L.W.every((v, j) => Object.is(v, b.net.layers[i].W[j]))));
    const long = T.trainTemporal(seqs, { seed: 2, steps: 150, batch: 2, crop: 16 }), m = (xs) => xs.reduce((q, v) => q + v, 0) / xs.length;
    const fit = seqs.map((e) => relMSE(Float64Array.from(T.temporalChain(long.net, e), toPerceptual), Float64Array.from(e.ref, toPerceptual))), bt = seqs.map((e) => relMSE(Float64Array.from(e.bt, toPerceptual), Float64Array.from(e.ref, toPerceptual)));
    ok("!! it learns: 150 steps on four sequences bring their loss below Bt's on the mean -- the training moves it off its start",
        m(fit) < m(bt) && T.temporalCorrection(long.net, seqs[0]) > 1e-3, `${m(fit).toExponential(3)} against Bt's ${m(bt).toExponential(3)}`);
    let bad = null; try { T.trainTemporal(seqs, { seed: 1, steps: 1, crop: 64 }); } catch (e) { bad = e.message; }
    ok("  ...and a crop larger than the frames is refused", /crop no larger/.test(bad || ""));
}

console.log("\n4. THE STUDY");
{
    const S = D.SPLITS_UPSCALE_TEMPORAL, R = LT.ROUND_UPSCALE_TEMPORAL, earlier = new Set([D.SPLITS_UPSCALE_LEARNED, D.SPLITS_UPSCALE_LEARNED_67, D.SPLITS_UPSCALE_LEARNED_68, D.SPLITS_UPSCALE_LEARNED_69].flatMap((x) => x.T1.seeds));
    ok("!! SPLITS_UPSCALE_TEMPORAL and the round are section 161's: round 65's training and validation scenes, 24 new test scenes (73000-73011 R, 74000-74011 C), 256 x 256, 4 samples in, 512 for training and 2048 for the test, C1 at 22, H1's 1 % rule, its own two files",
        S.train === D.SPLITS_UPSCALE_LEARNED.train && S.val === D.SPLITS_UPSCALE_LEARNED.val && S.T1.seeds.slice(0, 12).every((x, i) => x === 73000 + i && S.T1.families[i] === "R") &&
        S.T1.seeds.slice(12).every((x, i) => x === 74000 + i && S.T1.families[12 + i] === "C") && S.T1.seeds.every((x) => D.isDatasetSeed(x) && !earlier.has(x)) &&
        R.splits === S && R.image === 256 && R.sppIn === 4 && R.sppRef === 512 && R.sppRefTest === 2048 && R.c1Min === 22 && R.minGain === 0.01 && R.round === 70 &&
        R.net === "render/upscale-net-r70.json" && R.results === "render/denoise-results-upscale-temporal-r70.json");
    const mini = Object.freeze({ train: Object.freeze({ family: "R+C", families: Object.freeze(["R", "C", "R", "C"]), seeds: Object.freeze([990951, 990952, 990953, 990954]) }),
                                 val: Object.freeze({ family: "R", families: Object.freeze(["R"]), seeds: Object.freeze([990955]) }),
                                 T1: Object.freeze({ family: "R+C", families: Object.freeze(["R", "C"]), seeds: Object.freeze([990950, 990956]) }) });
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ut70-")), { openCache } = await imp("render/denoiseCache.mjs");
    const c1 = openCache(dir, { t: 70 }), tr = LT.runTemporalTraining({ splits: mini, net, ...o, seeds: [1, 2], train: { steps: 6, batch: 2, crop: 16 }, cache: c1 });
    const best = tr.runs.find((r) => r.seed === tr.candidate), again = T.trainTemporal(seqs, { seed: best.seed, steps: 6, batch: 2, crop: 16 });
    ok("!! the training: each seed's U_T is trainTemporal's on the training sequences bit for bit, the candidate the lowest validation loss, C2 on the candidate's seed and differing from it",
        best.valMean === Math.min(...tr.runs.map((r) => r.valMean)) && again.net.layers.every((L, i) => L.W.every((v, j) => Object.is(v, best.net.layers[i].W[j]))) &&
        tr.c2.seed === tr.candidate && tr.c2.net.layers[0].W.some((v, j) => v !== best.net.layers[0].W[j]) && tr.config.shape === T.UT_SHAPE && c1.misses === 5);
    const c2 = openCache(dir, { t: 70 }), out = LT.runTemporalTest({ splits: mini, net, U: best.net, Uc2: tr.c2.net, ...o, c1Min: 2, cache: c2 }), g = (y) => relMSE(Float64Array.from(y, toPerceptual), Float64Array.from(ex.ref, toPerceptual));
    ok("!! the test: every table is its arm's display-space relMSE bit for bit -- U_T's chain, Bt, B1, the noisy floor, C2's U_T, the second reference -- and P4's correction",
        Object.is(out.tables.U[0], g(T.temporalChain(best.net, ex))) && Object.is(out.tables.bt[0], g(ex.bt)) && Object.is(out.tables.b1[0], g(ex.b1)) && Object.is(out.tables.noisy[0], g(ex.noisy)) &&
        Object.is(out.tables.c2[0], g(T.temporalChain(tr.c2.net, ex))) && Object.is(out.tables.floor[0], g(ex.ref2)) && Object.is(out.secondary.correction[0], T.temporalCorrection(best.net, ex)) && c2.misses === 2 && c2.hits === 0,
        `cache: ${c2.misses} rendered (the test's sequences carry a second reference, so none is a training record)`);
    const { effects } = await imp("render/denoiseStats.mjs"), mean = (xs) => xs.reduce((q, v) => q + v, 0) / xs.length;
    ok("!! H1 is U_T against Bt and H2 U_T against B1, table by table; C2 cited as round 70's; the 1 % rule's figure is 1 - mean(U_T) / mean(Bt)",
        Math.abs(out.verdict.hypotheses.H1.meanD - mean(effects(out.tables.bt, out.tables.U))) < 1e-15 && Math.abs(out.verdict.hypotheses.H2.meanD - mean(effects(out.tables.b1, out.tables.U))) < 1e-15 &&
        out.verdict.controls.C2.citedFrom === 70 && out.secondary.gainOverBt === 1 - mean(out.tables.U) / mean(out.tables.bt) && out.determinism === true);
    fs.rmSync(dir, { recursive: true, force: true });
    const base = { W: 32, sppIn: 2, sppRef: 4, ref2: false, harvest: false }, k0 = LT.temporalKey("R", 1, base);
    ok("  the cache's key names everything a sequence depends on, and is not the single-frame rounds' key",
        [LT.temporalKey("C", 1, base), LT.temporalKey("R", 2, base), LT.temporalKey("R", 1, { ...base, W: 64 }), LT.temporalKey("R", 1, { ...base, sppIn: 4 }), LT.temporalKey("R", 1, { ...base, sppRef: 8 }),
         LT.temporalKey("R", 1, { ...base, ref2: true }), LT.temporalKey("R", 1, { ...base, harvest: true })].every((k, i, all) => k !== k0 && all.indexOf(k) === i) && k0.startsWith("upscale-temporal-"));
    const cli = fs.readFileSync(path.join(ENG, "tools/denoiseStudy.mjs"), "utf8"), br = (flag) => { const b0 = cli.indexOf(`} else if (args.includes("${flag}")) {`); return b0 >= 0 ? cli.slice(b0, cli.indexOf("} else if (", b0 + 10)).replace(/\/\/.*$/gm, "") : ""; };
    const a = br("--harvest-upscale-temporal-train"), b = br("--harvest-upscale-temporal-test");
    // round 77 (section 176): the test's call is (RD.moving ? LT.runMovingTest : LT.runTemporalTest)(...) since that round, so the order
    // row reads that call site; the start commit still has to come first. movingScenes-selfcheck holds the dispatch itself.
    ok("!! --harvest-upscale-temporal-train: the round's splits and samples under harvest, the start commit read before it runs, its own file never overwritten, every seed's net and C2's, the shipped sha-256",
        /LT\.runTemporalTraining\(\{ splits: RD\.splits, W: RD\.image, sppIn: RD\.sppIn, sppRef: RD\.sppRef, net: decodeNet\(shipped\.net\), harvest: true, cache,/.test(a) && /path\.join\(ENG, RD\.net\)/.test(a) &&
        /existsSync\(file\)/.test(a) && a.indexOf("startCommit = git(") >= 0 && a.indexOf("startCommit = git(") < a.indexOf("LT.runTemporalTraining(") && /commit: startCommit/.test(a) && /c2: \{/.test(a) && /sha256/.test(a) && !/verdict/.test(a));
    ok("!! --harvest-upscale-temporal-test: the committed training file's candidate and C2, the test's 2048-sample truth under harvest, its own file never overwritten, both commits",
        /tr\.runs\.find\(\(x\) => x\.seed === tr\.candidate\)/.test(b) && /Uc2: decodeNet\(tr\.c2\.net\)/.test(b) && /sppRef: RD\.sppRefTest/.test(b) && /harvest: true/.test(b) && /path\.join\(ENG, RD\.results\)/.test(b) &&
        /existsSync\(file\)/.test(b) && b.indexOf("startCommit = git(") >= 0 && b.indexOf("startCommit = git(") < b.indexOf("LT.runTemporalTest)(") && /out\.commit = startCommit;/.test(b) && /commit: tr\.commit/.test(b));
}

console.log("\n5. SECTION 162: ROUND 70's COMMITTED HARVESTS, READ BACK -- U_T BEAT Bt");
{
    const R = LT.ROUND_UPSCALE_TEMPORAL, tr = JSON.parse(fs.readFileSync(path.join(ENG, R.net), "utf8")), res = JSON.parse(fs.readFileSync(path.join(ENG, R.results), "utf8")), Tb = res.tables;
    const vals = tr.runs.map((r) => r.valMean), mean = (a) => a.reduce((q, v) => q + v, 0) / a.length;
    ok("!! round 70's training file: 512-sample targets at 256 x 256, the candidate seed 1 with the lowest validation loss (1.637e-3), at 2daaa618",
        tr.round === 70 && tr.config.sppRef === 512 && tr.config.W === 256 && tr.candidate === 1 && tr.commit === "2daaa618" && tr.runs.length === 3 &&
        tr.runs.find((r) => r.seed === 1).valMean === Math.min(...vals) && Math.abs(vals[0] - 1.6371e-3) < 5e-8 && tr.c2.seed === 1);
    const { verdict } = await imp("render/denoiseStats.mjs");
    const again = verdict({ sets: { H1: { noisy: Tb.noisy, filter: Tb.bt, net: [Tb.U], floor: Tb.floor }, H2: { noisy: Tb.noisy, filter: Tb.b1, net: [Tb.U], floor: Tb.floor } }, shuffled: null,
        c2Prior: { round: 70, meanD: res.verdict.controls.C2.meanD, ok: res.verdict.controls.C2.ok }, determinism: res.determinism, seedsDistinct: true, test: "signflip", c1Of: "candidate", c1Min: 22 });
    const H1 = again.hypotheses.H1, H2 = again.hypotheses.H2;
    ok("!! *** section 162: verdict() over the committed tables gives the file's verdict -- REPORTED, every control held, H1 SUPPORTED (20 of 24, p 7.0e-6), H2 supported (22 of 24, p 4.8e-7) ***",
        again.run === "reported" && res.verdict.run === "reported" && H1.status === "supported" && H2.status === "supported" && H1.k === 20 && H2.k === 22 &&
        Math.abs(H1.p - 0.000006973743438720703) < 1e-15 && Math.abs(H2.p - 4.76837158203125e-7) < 1e-15 && H1.c1.netWins === 24 && H1.c3.nearFloor === 0 && res.verdict.controls.C2.ok === true &&
        res.round === 70 && res.commit === "a621735c" && res.trained.candidate === 1 && res.trained.commit === "2daaa618", `H1 ${H1.k}/24 p ${H1.p.toExponential(2)}; H2 ${H2.k}/24`);
    const gain = 1 - mean(Tb.U) / mean(Tb.bt);
    ok("!! *** ...and section 161's 1 % rule is MET: U_T's mean display relMSE 1.7503e-3 against Bt's 1.9373e-3, 9.65 % below -- inside P2's 1-10 % ***",
        gain >= R.minGain && Math.abs(gain - 0.09653) < 5e-5 && Math.abs(res.secondary.gainOverBt - gain) < 1e-15 && Math.abs(mean(Tb.U) - 1.7503e-3) < 5e-8 && Math.abs(mean(Tb.bt) - 1.9373e-3) < 5e-8,
        `${(100 * gain).toFixed(2)} % below Bt`);
    const z = res.secondary.correction;
    ok("!! P4 held: the mean correction 0.66 % of Bt (0.11-1.95 % by scene) -- small, and not collapsed",
        z.length === 24 && Math.abs(mean(z) - 0.006603) < 1e-5 && Math.min(...z) > 0.0011 && Math.max(...z) < 0.0196);
    const d = H1.d, gR = 1 - mean(Tb.U.slice(0, 12)) / mean(Tb.bt.slice(0, 12)), gC = 1 - mean(Tb.U.slice(12)) / mean(Tb.bt.slice(12));
    ok("  descriptively: U_T won all 12 C scenes (11.5 % below Bt) and 8 of 12 R (3.2 %); its four losses are R 73003, 73004, 73007, 73011, each by under 2 %",
        d.slice(12).every((x) => x > 0) && d.slice(0, 12).filter((x) => x > 0).length === 8 && Math.abs(gC - 0.1153) < 5e-4 && Math.abs(gR - 0.0319) < 5e-4 &&
        d.map((x, i) => (x < 0 ? i : -1)).filter((i) => i >= 0).join() === "3,4,7,11" && d.every((x) => x > -0.02));
}

console.log("\n6. ROUND 72 (section 167): U_TH -- THE NETWORK AT HALF SIZE AND 16 WIDE");
{
    const C = T.UT_CHANNELS, hw = W / 2, xh = T.halfInput(ex.x, W, W), p = 5 * hw + 7, k = 9;
    const avg = (ex.x[((10) * W + 14) * C + k] + ex.x[((10) * W + 15) * C + k] + ex.x[((11) * W + 14) * C + k] + ex.x[((11) * W + 15) * C + k]) / 4;
    ok("!! halfInput averages each of the 17 channels over its 2 x 2 block: half pixel (7, 5) is full (14-15, 10-11)", xh.length === hw * hw * C && xh[p * C + k] === avg);
    const r = { u: (() => { let s7 = 11; return () => ((s7 = (s7 * 1103515245 + 12345) >>> 0) >>> 8) / 16777216 - 0.5; })() };
    const a = Float64Array.from({ length: 6 * 5 * 3 }, r.u), gF = Float64Array.from({ length: 12 * 10 * 3 }, r.u), ua = T.upHalf(a, 6, 5), tg = T.upHalfT(gF, 6, 5);
    let lhs = 0, rhs = 0; for (let i = 0; i < ua.length; i++) lhs += ua[i] * gF[i]; for (let i = 0; i < a.length; i++) rhs += a[i] * tg[i];
    const flat = T.upHalf(Float64Array.from({ length: 6 * 5 * 3 }, () => 0.7), 6, 5);
    ok("!! upHalf is bilinear at pixel centres, edges clamped (a flat field stays flat), and upHalfT is its transpose: <up a, g> = <a, up^T g>",
        Math.abs(lhs - rhs) < 1e-12 && flat.every((v) => Math.abs(v - 0.7) < 1e-15) && ua.length === 12 * 10 * 3, `${lhs.toExponential(6)} against ${rhs.toExponential(6)}`);
    const u0 = T.makeUpscalerT(4, "half");
    ok("!! an untrained U_TH is Bt exactly; it is three 3 x 3 layers of 16 and a 3-channel head, run at half size, and isHalfT tells it from U_T",
        T.temporalChain(u0, ex).every((v, i) => Object.is(v, ex.bt[i])) && T.UTH_SHAPE.map((l) => `${l[0]}-${l[1]}`).join() === "17-16,16-16,16-16,16-3" && T.isHalfT(u0) && !T.isHalfT(T.makeUpscalerT(4)) &&
        T.temporalUpscale(u0, ex.x, W, W).rh.length === hw * hw * 3);
    const nh = T.makeUpscalerT(5, "half");
    nh.layers.forEach((L, li) => { const q = seededRandom(80 + li); for (let i = 0; i < L.W.length; i++) L.W[i] += 0.3 * (q.u() - 0.5); for (let i = 0; i < L.b.length; i++) L.b[i] += 0.3 * (q.u() - 0.5); });
    const G = T.temporalLoss(nh, ex.x, W, W, ex.ref, ex.cov, ex.E), Lf = () => T.temporalLoss(nh, ex.x, W, W, ex.ref, ex.cov, ex.E).loss;
    let worst = 0;
    for (const [li, wi] of [[0, 9], [0, 17 * 9 + 2], [1, 200], [2, 1000], [3, 5], [3, 40]]) { const Wt = nh.layers[li].W, keep = Wt[wi], e = 1e-5; Wt[wi] = keep + e; const a1 = Lf(); Wt[wi] = keep - e; const b1 = Lf(); Wt[wi] = keep;
        const fd = (a1 - b1) / (2 * e), an = G.grads[li].dW[wi]; worst = Math.max(worst, Math.abs(fd - an) / Math.max(1e-9, Math.abs(fd) + Math.abs(an))); }
    ok("!! U_TH's gradient, through the hold, the upsample (its transpose) and the half-size network, matches central differences within 1e-5 relative", worst < 1e-5, `worst ${worst.toExponential(2)}`);
    const a2 = T.trainTemporal(seqs, { seed: 3, steps: 6, batch: 2, crop: 16, variant: "half" }), b2 = T.trainTemporal(seqs, { seed: 3, steps: 6, batch: 2, crop: 16, variant: "half" });
    let odd = null; try { T.trainTemporal(seqs, { seed: 1, steps: 1, crop: 15, variant: "half" }); } catch (e) { odd = e.message; }
    ok("  U_TH trains deterministically by seed, on even crops at even corners (an odd crop refused)", a2.net.layers.every((L, i) => L.W.every((v, j) => Object.is(v, b2.net.layers[i].W[j]))) && T.isHalfT(a2.net) && /even crops/.test(odd || ""));
    // sabotage H5 (U_TH's crops at odd corners) went 0 red before this row: the training stayed deterministic and still learned
    const corners = []; T.trainTemporal(seqs, { seed: 4, steps: 20, batch: 2, crop: 16, variant: "half", onCrop: (cx, cy) => corners.push(cx, cy) });
    ok("  ...every U_TH crop corner is even, so a crop's 2 x 2 blocks are the frame's own, and the corners reach the frame's far edge",
        corners.length === 80 && corners.every((v) => v % 2 === 0 && v >= 0 && v <= W - 16) && corners.some((v) => v > 0));
    const long = T.trainTemporal(seqs, { seed: 2, steps: 150, batch: 2, crop: 16, variant: "half" }), m = (xs) => xs.reduce((q2, v) => q2 + v, 0) / xs.length;
    const g2 = (y, e) => relMSE(Float64Array.from(y, toPerceptual), Float64Array.from(e.ref, toPerceptual));
    const fit = seqs.map((e) => g2(T.temporalChain(long.net, e), e)), bt = seqs.map((e) => g2(e.bt, e));
    ok("!! ...and it learns: 150 steps on four sequences bring their loss below Bt's on the mean", m(fit) < m(bt), `${m(fit).toExponential(3)} against Bt's ${m(bt).toExponential(3)}`);
    // sabotage S3 (the study's training ignoring the variant) went 0 red before this row: only round 70's variant had been run through it
    const miniH = Object.freeze({ train: Object.freeze({ family: "R+C", families: Object.freeze(["R", "C"]), seeds: Object.freeze([990951, 990952]) }),
                                  val: Object.freeze({ family: "R", families: Object.freeze(["R"]), seeds: Object.freeze([990955]) }) });
    const th = LT.runTemporalTraining({ splits: miniH, net, ...o, seeds: [1], train: { steps: 4, batch: 2, crop: 16 }, variant: "half" });
    ok("!! the study's training under round 72's variant trains U_TH for every seed and C2, and records the variant and its shape",
        th.runs.every((q) => T.isHalfT(q.net)) && T.isHalfT(th.c2.net) && th.config.variant === "half" && th.config.shape === T.UTH_SHAPE);
    const R72 = LT.ROUND_UPSCALE_TEMPORAL_72, S72 = D.SPLITS_UPSCALE_TEMPORAL_72, prev = new Set([...D.SPLITS_UPSCALE_TEMPORAL.T1.seeds, ...D.SPLITS_UPSCALE_LEARNED_69.T1.seeds]);
    let bad = null; try { LT.temporalRound(71); } catch (e) { bad = e.message; }
    ok("!! ROUND_UPSCALE_TEMPORAL_72: U_TH's variant, round 70's training and samples, 24 new test scenes (75000-75011 R, 76000-76011 C), the 1 % rule, its own two files; temporalRound 70 / 72, 71 refused",
        R72.variant === "half" && R72.round === 72 && R72.splits === S72 && S72.train === D.SPLITS_UPSCALE_LEARNED.train && S72.T1.seeds.slice(0, 12).every((x, i) => x === 75000 + i && S72.T1.families[i] === "R") &&
        S72.T1.seeds.slice(12).every((x, i) => x === 76000 + i && S72.T1.families[12 + i] === "C") && S72.T1.seeds.every((x) => D.isDatasetSeed(x) && !prev.has(x)) &&
        ["image", "sppIn", "sppRef", "sppRefTest", "c1Min", "minGain", "seeds", "train"].every((key) => R72[key] === LT.ROUND_UPSCALE_TEMPORAL[key]) && LT.ROUND_UPSCALE_TEMPORAL.variant === "full" &&
        R72.net === "render/upscale-net-r72.json" && R72.results === "render/denoise-results-upscale-temporal-r72.json" && LT.temporalRound(72) === R72 && LT.temporalRound(null) === LT.ROUND_UPSCALE_TEMPORAL && /no temporal round 71/.test(bad || ""));
    const cli = fs.readFileSync(path.join(ENG, "tools/denoiseStudy.mjs"), "utf8"), br = (flag) => { const b0 = cli.indexOf(`} else if (args.includes("${flag}")) {`); return b0 >= 0 ? cli.slice(b0, cli.indexOf("} else if (", b0 + 10)).replace(/\/\/.*$/gm, "") : ""; };
    const ta = br("--harvest-upscale-temporal-train"), tb = br("--harvest-upscale-temporal-test");
    ok("!! both temporal commands take --round (LT.temporalRound), the training hands on the round's variant, the test its round for C2's citation",
        /RD = LT\.temporalRound\(/.test(ta) && /variant: RD\.variant/.test(ta) && /RD = LT\.temporalRound\(/.test(tb) && /round: RD\.round, harvest: true/.test(tb));
}

console.log("\n6b. ROUND 84 (section 190): U_TH8 -- U_TH AT 8 WIDE");
{
    const hw = W / 2, u0 = T.makeUpscalerT(4, "half8");
    ok("!! an untrained U_TH8 is Bt exactly; it is three 3 x 3 layers of 8 and a 1 x 1 3-channel head at half size, the half-size kind; shapeOfT names each variant's shape",
        T.temporalChain(u0, ex).every((v, i) => Object.is(v, ex.bt[i])) && T.UTH8_WIDTH === 8 && T.UTH8_SHAPE.map((l) => `${l[0]}-${l[1]}-${l[3] ?? 3}`).join() === "17-8-3,8-8-3,8-8-3,8-3-1" &&
        u0.layers.map((L) => `${L.Cin}-${L.Cout}-${L.k}`).join() === "17-8-3,8-8-3,8-8-3,8-3-1" && T.isHalfT(u0) && T.temporalUpscale(u0, ex.x, W, W).rh.length === hw * hw * 3 &&
        T.shapeOfT("half8") === T.UTH8_SHAPE && T.shapeOfT("half") === T.UTH_SHAPE && T.shapeOfT("full") === T.UT_SHAPE && Object.isFrozen(T.UTH8_SHAPE));
    const nh = T.makeUpscalerT(5, "half8");
    nh.layers.forEach((L, li) => { const qq = seededRandom(180 + li); for (let i = 0; i < L.W.length; i++) L.W[i] += 0.3 * (qq.u() - 0.5); for (let i = 0; i < L.b.length; i++) L.b[i] += 0.3 * (qq.u() - 0.5); });
    const G = T.temporalLoss(nh, ex.x, W, W, ex.ref, ex.cov, ex.E), Lf = () => T.temporalLoss(nh, ex.x, W, W, ex.ref, ex.cov, ex.E).loss;
    let worst = 0;
    for (const [li, wi] of [[0, 9], [0, 17 * 9 + 2], [1, 100], [2, 300], [3, 5], [3, 20]]) { const Wt = nh.layers[li].W, keep = Wt[wi], e = 1e-5; Wt[wi] = keep + e; const a1 = Lf(); Wt[wi] = keep - e; const b1 = Lf(); Wt[wi] = keep;
        const fd = (a1 - b1) / (2 * e), an = G.grads[li].dW[wi]; worst = Math.max(worst, Math.abs(fd - an) / Math.max(1e-9, Math.abs(fd) + Math.abs(an))); }
    ok("!! U_TH8's gradient matches central differences within 1e-5 relative", worst < 1e-5, `worst ${worst.toExponential(2)}`);
    const a2 = T.trainTemporal(seqs, { seed: 3, steps: 6, batch: 2, crop: 16, variant: "half8" }), b2 = T.trainTemporal(seqs, { seed: 3, steps: 6, batch: 2, crop: 16, variant: "half8" }), corners = [];
    T.trainTemporal(seqs, { seed: 4, steps: 20, batch: 2, crop: 16, variant: "half8", onCrop: (cx, cy) => corners.push(cx, cy) });
    let odd = null; try { T.trainTemporal(seqs, { seed: 1, steps: 1, crop: 15, variant: "half8" }); } catch (e) { odd = e.message; }
    ok("!! U_TH8 trains deterministically by seed, 8 wide, at even corners reaching the far edge, an odd crop refused",
        a2.net.layers.every((L, i) => L.W.every((v, j) => Object.is(v, b2.net.layers[i].W[j]))) && a2.net.layers[0].Cout === 8 && corners.length === 80 && corners.every((v) => v % 2 === 0 && v >= 0 && v <= W - 16) && corners.some((v) => v > 0) && /even crops/.test(odd || ""));
    const long = T.trainTemporal(seqs, { seed: 2, steps: 150, batch: 2, crop: 16, variant: "half8" }), m = (xs) => xs.reduce((q2, v) => q2 + v, 0) / xs.length;
    const g2 = (y, e) => relMSE(Float64Array.from(y, toPerceptual), Float64Array.from(e.ref, toPerceptual));
    ok("!! ...and it learns: 150 steps on four sequences bring their loss below Bt's on the mean", m(seqs.map((e) => g2(T.temporalChain(long.net, e), e))) < m(seqs.map((e) => g2(e.bt, e))));
    const miniH = Object.freeze({ train: Object.freeze({ family: "R+C", families: Object.freeze(["R", "C"]), seeds: Object.freeze([990951, 990952]) }),
                                  val: Object.freeze({ family: "R", families: Object.freeze(["R"]), seeds: Object.freeze([990955]) }) });
    const th = LT.runTemporalTraining({ splits: miniH, net, ...o, seeds: [1], train: { steps: 4, batch: 2, crop: 16 }, variant: "half8" });
    ok("!! the study's training under round 84's variant trains U_TH8 for every seed and C2, and records the variant and its shape",
        th.runs.every((qq) => qq.net.layers[0].Cout === 8) && th.c2.net.layers[0].Cout === 8 && th.config.variant === "half8" && th.config.shape === T.UTH8_SHAPE);
    // the test with round 72's U_TH beside: U0 graded on every scene, H1 still U against Bt; without U0 the output is round 72's shape
    const miniT = Object.freeze({ T1: Object.freeze({ family: "R+C", families: Object.freeze(["R", "C"]), seeds: Object.freeze([990956, 990957]) }) });
    const Ua = th.runs[0].net, U0 = T.makeUpscalerT(9, "half"); U0.layers[3].b[0] = 0.2;
    const te = LT.runTemporalTest({ splits: miniT, net, U: Ua, Uc2: th.c2.net, U0, ...o, sppRef: 8, round: 84, c1Min: 0 }), t0n = LT.runTemporalTest({ splits: miniT, net, U: Ua, Uc2: th.c2.net, ...o, sppRef: 8, round: 84, c1Min: 0 });
    const mm = (xs) => xs.reduce((q2, v) => q2 + v, 0) / xs.length, es = miniT.T1.seeds.map((sd, i) => T.temporalExample(miniT.T1.families[i], sd, net, { ...o, sppRef: 8, ref2: true }));
    const { gradeDisplay } = await imp("render/learnedUpscaleStudy.mjs"), u0g = es.map((e) => gradeDisplay(T.temporalChain(U0, e), e)), sec = te.secondary;
    ok("!! round 84's test grades round 72's U_TH (U0) beside U_TH8 on every scene, H1 still U against Bt; the gains re-derive (U0's over Bt, U_TH8's as a fraction of it, U_TH8 against U0); without U0 none of it",
        te.tables.U0.every((v, i) => Object.is(v, u0g[i])) && te.tables.U.every((v, i) => Object.is(v, t0n.tables.U[i])) && te.verdict.hypotheses.H1.d.every((v, i) => Object.is(v, t0n.verdict.hypotheses.H1.d[i])) &&
        sec.u0GainOverBt === 1 - mm(te.tables.U0) / mm(te.tables.bt) && sec.keep === sec.gainOverBt / sec.u0GainOverBt && sec.overU0 === 1 - mm(te.tables.U) / mm(te.tables.U0) &&
        !("U0" in t0n.tables) && !("keep" in t0n.secondary) && !("u0GainOverBt" in t0n.secondary));
    const R84 = LT.ROUND_UPSCALE_TEMPORAL_84, S84 = D.SPLITS_UPSCALE_TEMPORAL_84, R72 = LT.ROUND_UPSCALE_TEMPORAL_72;
    const prev = new Set([...D.SPLITS_UPSCALE_TEMPORAL.T1.seeds, ...D.SPLITS_UPSCALE_TEMPORAL_72.T1.seeds, ...D.SPLITS_UPSCALE_LIGHTS.T1.seeds, ...D.SPLITS_UPSCALE_SAMPLING.T1.seeds]);
    ok("!! ROUND_UPSCALE_TEMPORAL_84: U_TH8's variant, round 72's training, validation and samples, 24 new test scenes (91000-91011 R, 92000-92011 C), round 72's U_TH as its baseline, its own two files; temporalRound 84",
        R84.variant === "half8" && R84.round === 84 && R84.splits === S84 && S84.train === D.SPLITS_UPSCALE_TEMPORAL_72.train && S84.val === D.SPLITS_UPSCALE_TEMPORAL_72.val &&
        S84.T1.seeds.slice(0, 12).every((x, i) => x === 91000 + i && S84.T1.families[i] === "R") && S84.T1.seeds.slice(12).every((x, i) => x === 92000 + i && S84.T1.families[12 + i] === "C") &&
        S84.T1.seeds.every((x) => D.isDatasetSeed(x) && !prev.has(x)) && ["image", "sppIn", "sppRef", "sppRefTest", "c1Min", "minGain", "seeds", "train", "test"].every((key) => R84[key] === R72[key]) &&
        R84.baseline === "render/upscale-net-r72.json" && !R84.moving && R84.net === "render/upscale-net-r84.json" && R84.results === "render/denoise-results-upscale-temporal-r84.json" && LT.temporalRound(84) === R84);
    const cli = fs.readFileSync(path.join(ENG, "tools/denoiseStudy.mjs"), "utf8"), br = (flag) => { const b0 = cli.indexOf(`} else if (args.includes("${flag}")) {`); return b0 >= 0 ? cli.slice(b0, cli.indexOf("} else if (", b0 + 10)).replace(/\/\/.*$/gm, "") : ""; };
    const tb = br("--harvest-upscale-temporal-test");
    ok("  the test command loads the round's baseline (round 72's candidate) as U0 and hands it to the runner, recording which file and commit it came from",
        /const b0 = RD\.baseline \? JSON\.parse/.test(tb) && /U0 = b0 \? decodeNet\(b0\.runs\.find\(\(x\) => x\.seed === b0\.candidate\)\.net\)/.test(tb) && /\(\{ U0, gamma/.test(tb) && /if \(b0\) out\.baseline = \{ file: RD\.baseline, candidate: b0\.candidate, commit: b0\.commit \}/.test(tb));
}

console.log("\n6c. ROUND 87 (section 195): U_TQ -- U_TH's NETWORK AT A QUARTER OF THE SIZE");
{
    const C = T.UT_CHANNELS, qw = W / 4, xq = T.quarterInput(ex.x, W, W), pq = 3 * qw + 5, k = 11;
    let s16 = 0; for (let dy = 0; dy < 4; dy++) for (let dx = 0; dx < 4; dx++) s16 += ex.x[((12 + dy) * W + 20 + dx) * C + k];
    let refused = null; try { T.quarterInput(new Float64Array(6 * 6 * C), 6, 6); } catch (e) { refused = e.message; }
    ok("!! quarterInput averages each of the 17 channels over its 4 x 4 block, summed row by row then / 16: quarter pixel (5, 3) is full (20-23, 12-15); a size not a multiple of 4 refused",
        xq.length === qw * qw * C && xq[pq * C + k] === s16 / 16 && /no quarter size/.test(refused || ""));
    const r = { u: (() => { let s7 = 13; return () => ((s7 = (s7 * 1103515245 + 12345) >>> 0) >>> 8) / 16777216 - 0.5; })() };
    const a = Float64Array.from({ length: 5 * 4 * 3 }, r.u), gF = Float64Array.from({ length: 20 * 16 * 3 }, r.u), ua = T.upQuarter(a, 5, 4), tg = T.upQuarterT(gF, 5, 4);
    let lhs = 0, rhs = 0; for (let i = 0; i < ua.length; i++) lhs += ua[i] * gF[i]; for (let i = 0; i < a.length; i++) rhs += a[i] * tg[i];
    const flat = T.upQuarter(Float64Array.from({ length: 5 * 4 * 3 }, () => 0.3), 5, 4);
    // by hand: full pixel (6, 9) sits at quarter coordinates u = 6.5 / 4 - 0.5 = 1.125, v = 9.5 / 4 - 0.5 = 1.875
    const tap = (x0, y0) => a[(y0 * 5 + x0) * 3], hand = 0.875 * 0.125 * tap(1, 1) + 0.125 * 0.125 * tap(2, 1) + 0.875 * 0.875 * tap(1, 2) + 0.125 * 0.875 * tap(2, 2);
    ok("!! upQuarter is bilinear by 4 at pixel centres (full (6, 9) re-derived by hand), edges clamped (a flat field stays flat), and upQuarterT is its transpose: <up a, g> = <a, up^T g>",
        Math.abs(lhs - rhs) < 1e-12 && flat.every((v) => Math.abs(v - 0.3) < 1e-15) && ua.length === 20 * 16 * 3 && Math.abs(ua[(9 * 20 + 6) * 3] - hand) < 1e-15, `${lhs.toExponential(6)} against ${rhs.toExponential(6)}`);
    const u0 = T.makeUpscalerT(4, "quarter");
    ok("!! an untrained U_TQ is Bt exactly; it is U_TH's shapes (17 -> 16 -> 16 -> 16 at 3 x 3, 16 -> 3 at 1 x 1) at a quarter of the size, scale 4, its head's output quarter-size",
        T.temporalChain(u0, ex).every((v, i) => Object.is(v, ex.bt[i])) && u0.scale === 4 && T.scaleOfT(u0) === 4 && u0.layers.map((L) => `${L.Cin}-${L.Cout}-${L.k}`).join() === "17-16-3,16-16-3,16-16-3,16-3-1" &&
        T.shapeOfT("quarter") === T.UTH_SHAPE && T.temporalUpscale(u0, ex.x, W, W).rh.length === qw * qw * 3 && T.scaleOfT(T.makeUpscalerT(4, "half")) === 2);
    const nq = T.makeUpscalerT(5, "quarter");
    nq.layers.forEach((L, li) => { const qq = seededRandom(280 + li); for (let i = 0; i < L.W.length; i++) L.W[i] += 0.3 * (qq.u() - 0.5); for (let i = 0; i < L.b.length; i++) L.b[i] += 0.3 * (qq.u() - 0.5); });
    const G = T.temporalLoss(nq, ex.x, W, W, ex.ref, ex.cov, ex.E), Lf = () => T.temporalLoss(nq, ex.x, W, W, ex.ref, ex.cov, ex.E).loss;
    let worst = 0;
    for (const [li, wi] of [[0, 9], [0, 17 * 9 + 2], [1, 200], [2, 1000], [3, 5], [3, 40]]) { const Wt = nq.layers[li].W, keep = Wt[wi], e = 1e-5; Wt[wi] = keep + e; const a1 = Lf(); Wt[wi] = keep - e; const b1 = Lf(); Wt[wi] = keep;
        const fd = (a1 - b1) / (2 * e), an = G.grads[li].dW[wi]; worst = Math.max(worst, Math.abs(fd - an) / Math.max(1e-9, Math.abs(fd) + Math.abs(an))); }
    ok("!! U_TQ's gradient, through the hold, the upsample by 4 (its transpose) and the quarter-size network, matches central differences within 1e-5 relative", worst < 1e-5, `worst ${worst.toExponential(2)}`);
    const a2 = T.trainTemporal(seqs, { seed: 3, steps: 6, batch: 2, crop: 16, variant: "quarter" }), b2 = T.trainTemporal(seqs, { seed: 3, steps: 6, batch: 2, crop: 16, variant: "quarter" }), corners = [];
    T.trainTemporal(seqs, { seed: 4, steps: 20, batch: 2, crop: 16, variant: "quarter", onCrop: (cx, cy) => corners.push(cx, cy) });
    let odd = null; try { T.trainTemporal(seqs, { seed: 1, steps: 1, crop: 18, variant: "quarter" }); } catch (e) { odd = e.message; }
    ok("!! U_TQ trains deterministically by seed, scale 4 kept, at corners on multiples of 4 reaching the far edge; a crop not a multiple of 4 refused",
        a2.net.layers.every((L, i) => L.W.every((v, j) => Object.is(v, b2.net.layers[i].W[j]))) && a2.net.scale === 4 && corners.length === 80 && corners.every((v) => v % 4 === 0 && v >= 0 && v <= W - 16) &&
        corners.some((v) => v === W - 16) && /multiples of 4/.test(odd || ""));
    const long = T.trainTemporal(seqs, { seed: 2, steps: 150, batch: 2, crop: 16, variant: "quarter" }), m = (xs) => xs.reduce((q2, v) => q2 + v, 0) / xs.length;
    const g2 = (y, e) => relMSE(Float64Array.from(y, toPerceptual), Float64Array.from(e.ref, toPerceptual));
    ok("!! ...and it learns: 150 steps on four sequences bring their loss below Bt's on the mean", m(seqs.map((e) => g2(T.temporalChain(long.net, e), e))) < m(seqs.map((e) => g2(e.bt, e))));
    const { encodeNet } = await imp("render/denoiseDevice.mjs"), back = decodeNet(JSON.parse(JSON.stringify(encodeNet(long.net)))), r72 = JSON.parse(fs.readFileSync(path.join(ENG, "render", "upscale-net-r72.json"), "utf8"));
    const c72 = r72.runs.find((x) => x.seed === r72.candidate).net;
    ok("!! the net file carries U_TQ's scale: encodeNet then decodeNet give scale 4 and the same chain bit for bit; a net with no scale (round 72's committed U_TH) encodes exactly as its file holds it",
        back.scale === 4 && T.scaleOfT(back) === 4 && T.temporalChain(back, ex).every((v, i) => Object.is(v, T.temporalChain(long.net, ex)[i])) &&
        JSON.stringify(encodeNet(decodeNet(c72))) === JSON.stringify(c72) && !("scale" in c72) && !("scale" in decodeNet(c72)));
    const miniH = Object.freeze({ train: Object.freeze({ family: "R+C", families: Object.freeze(["R", "C"]), seeds: Object.freeze([990951, 990952]) }),
                                  val: Object.freeze({ family: "R", families: Object.freeze(["R"]), seeds: Object.freeze([990955]) }) });
    const th = LT.runTemporalTraining({ splits: miniH, net, ...o, seeds: [1], train: { steps: 4, batch: 2, crop: 16 }, variant: "quarter" });
    ok("!! the study's training under round 87's variant trains U_TQ (scale 4) for every seed and C2, and records the variant and its shape",
        th.runs.every((qq) => qq.net.scale === 4) && th.c2.net.scale === 4 && th.config.variant === "quarter" && th.config.shape === T.UTH_SHAPE);
    const R87 = LT.ROUND_UPSCALE_TEMPORAL_87, S87 = D.SPLITS_UPSCALE_TEMPORAL_87, R84 = LT.ROUND_UPSCALE_TEMPORAL_84;
    const prev = new Set([...D.SPLITS_UPSCALE_TEMPORAL_84.T1.seeds, ...D.SPLITS_UPSCALE_TEMPORAL_72.T1.seeds, ...D.SPLITS_COUNT_86.T1.seeds, ...D.SPLITS_UPSCALE_LIGHTS.T1.seeds]);
    ok("!! ROUND_UPSCALE_TEMPORAL_87: U_TQ's variant, round 84's everything else (round 72's training, samples, U_TH as baseline), 24 new test scenes (95000-95011 R, 96000-96011 C), its own two files; temporalRound 87",
        R87.variant === "quarter" && R87.round === 87 && R87.splits === S87 && S87.train === D.SPLITS_UPSCALE_TEMPORAL_72.train && S87.val === D.SPLITS_UPSCALE_TEMPORAL_72.val &&
        S87.T1.seeds.slice(0, 12).every((x, i) => x === 95000 + i && S87.T1.families[i] === "R") && S87.T1.seeds.slice(12).every((x, i) => x === 96000 + i && S87.T1.families[12 + i] === "C") &&
        S87.T1.seeds.every((x) => D.isDatasetSeed(x) && !prev.has(x)) && ["image", "sppIn", "sppRef", "sppRefTest", "c1Min", "minGain", "seeds", "train", "test", "baseline"].every((key) => R87[key] === R84[key]) &&
        R87.net === "render/upscale-net-r87.json" && R87.results === "render/denoise-results-upscale-temporal-r87.json" && LT.temporalRound(87) === R87);
}

console.log("\n7. SECTION 170: ROUND 72's COMMITTED HARVESTS, READ BACK -- U_TH BEAT Bt BY 5.4 %");
{
    const R = LT.ROUND_UPSCALE_TEMPORAL_72, tr = JSON.parse(fs.readFileSync(path.join(ENG, R.net), "utf8")), res = JSON.parse(fs.readFileSync(path.join(ENG, R.results), "utf8")), Tb = res.tables;
    const vals = tr.runs.map((r) => r.valMean), mean = (a) => a.reduce((q, v) => q + v, 0) / a.length;
    ok("!! round 72's training file: U_TH (variant half), 512-sample targets, the candidate seed 1 with the lowest validation loss (1.661e-3), at 670c28bd",
        tr.round === 72 && tr.config.variant === "half" && tr.config.sppRef === 512 && tr.candidate === 1 && tr.commit === "670c28bd" && tr.runs.length === 3 &&
        tr.runs.find((r) => r.seed === 1).valMean === Math.min(...vals) && Math.abs(vals[0] - 1.6612e-3) < 5e-8 && tr.c2.seed === 1 && T.isHalfT(decodeNet(tr.runs[0].net)));
    const { verdict } = await imp("render/denoiseStats.mjs");
    const again = verdict({ sets: { H1: { noisy: Tb.noisy, filter: Tb.bt, net: [Tb.U], floor: Tb.floor }, H2: { noisy: Tb.noisy, filter: Tb.b1, net: [Tb.U], floor: Tb.floor } }, shuffled: null,
        c2Prior: { round: 72, meanD: res.verdict.controls.C2.meanD, ok: res.verdict.controls.C2.ok }, determinism: res.determinism, seedsDistinct: true, test: "signflip", c1Of: "candidate", c1Min: 22 });
    const H1 = again.hypotheses.H1, H2 = again.hypotheses.H2;
    ok("!! *** section 170: verdict() over the committed tables gives the file's verdict -- REPORTED, every control held, H72a SUPPORTED (16 of 24, p 0.0066), H72b supported (24 of 24) ***",
        again.run === "reported" && res.verdict.run === "reported" && H1.status === "supported" && H2.status === "supported" && H1.k === 16 && H2.k === 24 &&
        Math.abs(H1.p - 0.0066182613372802734) < 1e-12 && H1.c1.netWins === 24 && H1.c3.nearFloor === 0 && res.verdict.controls.C2.ok === true && res.verdict.controls.C2.citedFrom === 72 &&
        res.round === 72 && res.commit === "c9f2a1bc" && res.trained.candidate === 1 && res.trained.commit === "670c28bd", `H1 ${H1.k}/24 p ${H1.p.toFixed(4)}; H2 ${H2.k}/24`);
    const gain = 1 - mean(Tb.U) / mean(Tb.bt), z = res.secondary.correction;
    ok("!! *** ...and the 1 % rule is MET: U_TH's mean display relMSE 1.6702e-3 against Bt's 1.7663e-3, 5.44 % below -- inside P2's 2-8 %, 56 % of round 70's 9.65 % on another set ***",
        gain >= R.minGain && Math.abs(gain - 0.05441) < 5e-5 && Math.abs(res.secondary.gainOverBt - gain) < 1e-15 && Math.abs(mean(z) - 0.009510) < 1e-5, `${(100 * gain).toFixed(2)} % below Bt; correction ${(100 * mean(z)).toFixed(2)} %`);
    const d = H1.d, gR = 1 - mean(Tb.U.slice(0, 12)) / mean(Tb.bt.slice(0, 12)), gC = 1 - mean(Tb.U.slice(12)) / mean(Tb.bt.slice(12));
    ok("  descriptively: on C 9 of 12, 6.4 % below Bt; on R 7 of 12, 0.18 % -- the gain is C's, as round 70's mostly was",
        d.slice(12).filter((x) => x > 0).length === 9 && d.slice(0, 12).filter((x) => x > 0).length === 7 && Math.abs(gC - 0.0636) < 5e-4 && Math.abs(gR - 0.0018) < 5e-4);
}

{   // v4909 -- temporalInput, UTH_WIDTH and UT_VARIANTS, exercised (found unnamed by definitionGates at the ship). SABOTAGED, each restored
    // byte-identical: T1 temporalInput's depth d / (2 + d) -> 1 red; T2 UT_VARIANTS gaining "quarter" -> 1 red.
    const W = 3, H = 2, n = W * H, v = (k) => Float64Array.from({ length: n * 3 }, (_, i) => k + i / 100), nn = Float64Array.from({ length: n }, (_, p) => p + 1), dep = Float64Array.from({ length: n }, (_, p) => (p === 0 ? 1e9 : p));
    const x = T.temporalInput(v(1), v(2), v(3), nn, v(4), v(5), dep, W, H), at = (p, c) => x[p * T.UT_CHANNELS + c];
    ok("  v4909: temporalInput lays out U_T's 17 channels -- A, Au, C, n / 8, albedo, normal, depth d / (1 + d) with a miss as 0",
        x.length === n * 17 && at(4, 0) === 1.12 && at(4, 4) === 2.13 && at(4, 8) === 3.14 && at(4, 9) === 5 / FRAMES && at(4, 11) === 4.13 && at(4, 15) === 5.14 && at(4, 16) === 4 / 5 && at(0, 16) === 0);
    // round 84 (section 190) added "half8": this row read "full,half" until then
    // round 87 (section 195) added "quarter": this row read "full,half,half8" until then
    ok("  v4909: U_TH is UTH_WIDTH (16) wide in every hidden layer and isHalfT reads it; UT_VARIANTS is full, half, half8 (round 84) and quarter (round 87), and makeUpscalerT builds each",
        T.UTH_WIDTH === 16 && T.UTH_SHAPE.slice(0, 3).every((l) => l[1] === T.UTH_WIDTH) && T.UT_VARIANTS.join() === "full,half,half8,quarter" && Object.isFrozen(T.UT_VARIANTS) &&
        T.UT_VARIANTS.map((vv) => T.isHalfT(T.makeUpscalerT(seededRandom(3), vv))).join() === "false,true,true,true" &&
        T.UT_VARIANTS.map((vv) => T.scaleOfT(T.makeUpscalerT(seededRandom(3), vv))).join() === "1,2,2,4");
}

{   // round 77 (section 176): exampleFrames, the eight frames temporalExample takes (moved out of it so a moving frame can be held to sceneAt)
    // SABOTAGED, restored byte-identical: X1 each frame's shift the unscaled jitter -> 2 red (this row, and section 1's channels 6-8);
    // O1 the test's start commit dropped from the command -> 1 red (the order row in section 4, re-pointed at round 77's call site).
    const TU = await imp("render/denoiseTemporalUpscale.mjs"), net0 = decodeNet(JSON.parse(fs.readFileSync(path.join(ENG, "render", "denoise-net-r11.json"), "utf8")).net);
    const S = D.makeScene("R", 990950), fr = T.exampleFrames(S, net0, { W: 16, sppIn: 1 }), ex = T.temporalExample("R", 990950, net0, { W: 16, sppIn: 1, sppRef: 2 });
    const C = TU.shiftResample(fr[FRAMES - 1].y, 16, 16, ...fr[FRAMES - 1].shift), c6 = []; for (let p = 0; p < 256; p++) for (let c = 0; c < 3; c++) c6.push(ex.x[p * T.UT_CHANNELS + 6 + c]);
    ok("  exampleFrames: eight frames, each W x W after EASU with its jitter's full-size shift, and the last one, re-sampled, is the example's C (channels 6-8) bit for bit",
        fr.length === FRAMES && fr.every((f, k) => f.y.length === 768 && f.input.length === 192 && f.shift.join() === TU.halfShift(TU.JITTER[k]).join()) && c6.every((v, i) => Object.is(v, C[i])));
}

{   // round 77 (section 176): exampleFrames, the eight frames temporalExample takes (moved out of it so a moving frame can be held to sceneAt)
    // SABOTAGED, restored byte-identical: X1 each frame's shift the unscaled jitter -> 2 red (this row, and section 1's channels 6-8);
    // O1 the test's start commit dropped from the command -> 1 red (the order row in section 4, re-pointed at round 77's call site).
    const TU = await imp("render/denoiseTemporalUpscale.mjs"), net0 = decodeNet(JSON.parse(fs.readFileSync(path.join(ENG, "render", "denoise-net-r11.json"), "utf8")).net);
    const S = D.makeScene("R", 990950), fr = T.exampleFrames(S, net0, { W: 16, sppIn: 1 }), ex = T.temporalExample("R", 990950, net0, { W: 16, sppIn: 1, sppRef: 2 });
    const C = TU.shiftResample(fr[FRAMES - 1].y, 16, 16, ...fr[FRAMES - 1].shift), c6 = []; for (let p = 0; p < 256; p++) for (let c = 0; c < 3; c++) c6.push(ex.x[p * T.UT_CHANNELS + 6 + c]);
    ok("  exampleFrames: eight frames, each W x W after EASU with its jitter's full-size shift, and the last one, re-sampled, is the example's C (channels 6-8) bit for bit",
        fr.length === FRAMES && fr.every((f, k) => f.y.length === 768 && f.input.length === 192 && f.shift.join() === TU.halfShift(TU.JITTER[k]).join()) && c6.every((v, i) => Object.is(v, C[i])));
}

console.log("\n8. SECTION 191: ROUND 84's VERDICT, RE-DERIVED FROM ITS COMMITTED FILES");
{
    const R = LT.ROUND_UPSCALE_TEMPORAL_84, tr = JSON.parse(fs.readFileSync(path.join(ENG, R.net), "utf8")), tri = JSON.parse(fs.readFileSync(path.join(ENG, "render", "upscale-net-r84-intel.json"), "utf8"));
    const r = JSON.parse(fs.readFileSync(path.join(ENG, R.results), "utf8")), H = r.verdict.hypotheses, Tb = r.tables, sec = r.secondary, { effects } = await imp("render/denoiseStats.mjs");
    const mean = (a) => a.reduce((q, v) => q + v, 0) / a.length, g = (u, b) => 1 - mean(u) / mean(b), near = (a, b, e = 5e-5) => Math.abs(a - b) < e, fewer = (u, b) => u.filter((v, i) => v < b[i]).length;
    const core = (q) => JSON.stringify({ candidate: q.candidate, runs: q.runs, c2: q.c2, config: q.config, shipped: q.shipped });
    const same = (a, b) => a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
    ok("!! the training: U_TH8 (half8, 17-8-8-8-3) at 57edf87e, candidate seed 1 (validation 1.6881e-3, 1.7056e-3, 1.6989e-3); the Intel machine's training is the same nets, losses, validation and C2 bit for bit, its file differing only in time and cache",
        tr.round === 84 && tr.commit === "57edf87e" && tr.config.variant === "half8" && JSON.stringify(tr.config.shape) === JSON.stringify(T.UTH8_SHAPE) && tr.candidate === 1 &&
        tr.runs.map((q) => q.valMean.toExponential(4)).join() === "1.6881e-3,1.7056e-3,1.6989e-3" && core(tr) === core(tri) && tri.commit === "57edf87e" && tr.cache.hits === 0 && tri.cache.hits === 140 && tr.ms !== tri.ms);
    ok("!! the test read that net: round 84 at 57edf87e, the candidate from render/upscale-net-r84.json at 57edf87e, round 72's U_TH beside it, 1 of 24 sequences cached",
        r.round === 84 && r.commit === "57edf87e" && r.trained.file === R.net && r.trained.candidate === 1 && r.trained.commit === "57edf87e" && r.baseline.file === "render/upscale-net-r72.json" &&
        r.cache.hits === 1 && r.cache.misses === 23 && r.determinism === true && Tb.U.length === 24 && Tb.U0.length === 24);
    ok("!! *** H84a SUPPORTED: U_TH8 9.72 % below Bt, 23 of 24, p 1.8e-7 under Holm's 0.025; H84b SUPPORTED: 9.62 % below B1, 19 of 24, p 0.0029 ***",
        H.H1.status === "supported" && H.H1.k === 23 && near(H.H1.p, 1.788e-7, 1e-9) && H.H1.threshold === 0.025 && same(H.H1.d, effects(Tb.bt, Tb.U)) && near(g(Tb.U, Tb.bt), 0.0972) &&
        H.H2.status === "supported" && H.H2.k === 19 && near(H.H2.p, 0.00286, 1e-5) && same(H.H2.d, effects(Tb.b1, Tb.U)) && near(g(Tb.U, Tb.b1), 0.0962) &&
        r.verdict.run === "reported" && r.verdict.controls.C1 && r.verdict.controls.C4 && r.verdict.controls.C5 && r.verdict.controls.C2.ok && near(r.verdict.controls.C2.meanD, -3.0698, 1e-4) && H.H1.c3.resolvable);
    ok("!! the table: Bt 2.2505e-3, B1 2.2480e-3, U_TH8 2.0317e-3, U_TH 1.9988e-3 (11.18 % below Bt, 21 of 24); U_TH8 keeps 87 % of U_TH's gain and is 1.65 % above it (10 of 24); C 11.67 %, R 3.35 % -- P2 MISSED, P4 HELD",
        near(mean(Tb.bt), 2.2505e-3, 5e-8) && near(mean(Tb.b1), 2.2480e-3, 5e-8) && near(mean(Tb.U), 2.0317e-3, 5e-8) && near(mean(Tb.U0), 1.9988e-3, 5e-8) && near(g(Tb.U0, Tb.bt), 0.1118) && fewer(Tb.U0, Tb.bt) === 21 &&
        near(sec.keep, 0.8693) && sec.keep === sec.gainOverBt / sec.u0GainOverBt && near(sec.overU0, -0.0165) && fewer(Tb.U, Tb.U0) === 10 && sec.gainOverBt > 0.05 && sec.keep >= 0.55 && sec.keep <= 0.95 &&
        near(g(Tb.U.slice(12), Tb.bt.slice(12)), 0.1167) && near(g(Tb.U.slice(0, 12), Tb.bt.slice(0, 12)), 0.0335));
    const reg = fs.readFileSync(path.join(ENG, "render", "learned-denoiser-preregistration.md"), "utf8"), iX = reg.indexOf("## 191."), sX = reg.slice(iX, reg.indexOf("\n## ", iX + 1) > 0 ? reg.indexOf("\n## ", iX + 1) : undefined);
    ok("  section 191 says both hold, P2 missed, that the two machines' trainings are the same net, and that round 85 is not read (the Intel's runs without Playwright) and is owed again",
        iX > 0 && /\*\*H84a SUPPORTED:\*\*/.test(sX) && /\*\*H84b SUPPORTED:\*\*/.test(sX) && /\*\*P2 MISSED:\*\*/.test(sX) && /\*\*P4 HELD:\*\*/.test(sX) && /trained the same U_TH8 bit for bit/.test(sX) &&
        /\*\*ROUND 85: NOT READ\.\*\*/.test(sX) && /without Playwright/.test(sX) && /committed unread/.test(sX));
}

console.log(`\n${fails ? "FAIL -- " + fails + " check(s)" : "ALL GREEN"} (${Date.now() - t0} ms)` +
    "\nnot closed here: what U_T costs on a device, or how it looks on a page. Section 162 leaves those to the next rounds.");
process.exit(fails ? 1 : 0);
