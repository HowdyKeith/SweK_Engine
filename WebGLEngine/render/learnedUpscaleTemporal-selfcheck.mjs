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
    ok("!! --harvest-upscale-temporal-train: the round's splits and samples under harvest, the start commit read before it runs, its own file never overwritten, every seed's net and C2's, the shipped sha-256",
        /LT\.runTemporalTraining\(\{ splits: RD\.splits, W: RD\.image, sppIn: RD\.sppIn, sppRef: RD\.sppRef, net: decodeNet\(shipped\.net\), harvest: true, cache,/.test(a) && /path\.join\(ENG, RD\.net\)/.test(a) &&
        /existsSync\(file\)/.test(a) && a.indexOf("startCommit = git(") >= 0 && a.indexOf("startCommit = git(") < a.indexOf("LT.runTemporalTraining(") && /commit: startCommit/.test(a) && /c2: \{/.test(a) && /sha256/.test(a) && !/verdict/.test(a));
    ok("!! --harvest-upscale-temporal-test: the committed training file's candidate and C2, the test's 2048-sample truth under harvest, its own file never overwritten, both commits",
        /tr\.runs\.find\(\(x\) => x\.seed === tr\.candidate\)/.test(b) && /Uc2: decodeNet\(tr\.c2\.net\)/.test(b) && /sppRef: RD\.sppRefTest/.test(b) && /harvest: true/.test(b) && /path\.join\(ENG, RD\.results\)/.test(b) &&
        /existsSync\(file\)/.test(b) && b.indexOf("startCommit = git(") < b.indexOf("LT.runTemporalTest(") && /out\.commit = startCommit;/.test(b) && /commit: tr\.commit/.test(b));
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

console.log(`\n${fails ? "FAIL -- " + fails + " check(s)" : "ALL GREEN"} (${Date.now() - t0} ms)` +
    "\nnot closed here: what U_T costs on a device, or how it looks on a page. Section 162 leaves those to the next rounds.");
process.exit(fails ? 1 : 0);
