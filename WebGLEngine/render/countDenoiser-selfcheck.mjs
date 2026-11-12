#!/usr/bin/env node
// WebGLEngine/render/countDenoiser-selfcheck.mjs -- round 86 (pre-registration section 192): D_S, the denoiser told each pixel's sample
// count, on non-dataset scenes at 8-32 px:
//   1. the input: the count channel, the mask's rule at its stride, the share maps, the counts, the passes' seeds, the training image
//   2. the training: round 11's network and schedule on count images, the candidate by validation, C2
//   3. the test: samplingFrames' extra arms, round 82's two arms bit for bit, the four arms and the verdict's sets; the round, the split, the commands
//
// SABOTAGED, each restored byte-identical (against this gate, denoiseScenes-selfcheck and denoiseMask-selfcheck): K3 the disks to radius 15,
//   K5 every pixel averaging all twelve passes, K6 the passes' seeds on round 82's base, K7 the reference from the ref2 seed, K9 the
//   candidate the highest validation, K10 C2 unshuffled, K13 H1 against S_U, K14 C2's arm D_A's, K16
//   the test's C2 the candidate, K17 the test's references 1,024 samples, K18 the validation images graded without their counts -> 1 red
//   each; K1 the mask read at stride 10 only, K4 the count not over the budget, K12 the adaptive extra arm through the shipped denoiser on
//   its plain input, K15 round 86's seeds not reserved (here and denoiseScenes-selfcheck) -> 2 red each; K8 the training's head residual and small -> 4 red. K2 the share map's stream unsalted and K11 the
//   uniform extra arm handed the adaptive counts -> *** 0 RED at first *** (990960 draws no disk either way; no row read the counts an
//   arm is handed), then 1 each with every seed's disks re-drawn by hand and the counts each arm is handed recorded.
// SECTION 193 (round 86's verdict rows, sabotaged in the committed files and the registration, each restored byte-identical): Y10 H86a's
//   count typed 5, Y13 a rejected share nudged, Y14 the candidate typed 1, Y15 section 193 keeping history-guided sampling open, Y16 it
//   calling P4 held -> 1 red each; Y11 a D_A grade and Y12 a D_U grade nudged -> 2 red each.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const imp = (p) => import(pathToFileURL(path.join(ENG, p)).href);
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const t0 = Date.now();
const CD = await imp("render/countDenoiser.mjs"), CS = await imp("render/countDenoiserStudy.mjs"), D = await imp("render/denoiseScenes.mjs"), M = await imp("render/denoiseMask.mjs");
const A = await imp("render/adaptiveSampling.mjs"), N = await imp("render/denoiseNet.mjs"), LT = await imp("render/learnedUpscaleTemporalStudy.mjs"), T = await imp("render/learnedUpscaleTemporal.mjs");
const { decodeNet } = await imp("render/denoiseDevice.mjs"), { rng } = await imp("physics/render/furnace.mjs"), { render } = await imp("physics/render/pathTracer.mjs");
const { derangement, SHUFFLE_SEED } = await imp("render/learnedUpscaleStudy.mjs"), { effects } = await imp("render/denoiseStats.mjs");
const net = decodeNet(JSON.parse(fs.readFileSync(path.join(ENG, "render", "denoise-net-r11.json"), "utf8")).net);
const same = (a, b) => a.length === b.length && a.every((v, i) => Object.is(v, b[i]));

console.log("1. THE INPUT");
{
    ok("!! D_S's input is the mask's ten channels and the count: stride 11, the count at 10; the mask is read at stride 10 and 11 alike (channel 9), at no other",
        CD.COUNT_STRIDE === 11 && CD.COUNT_STRIDE === M.MASK_STRIDE + 1 && CD.COUNT_CHANNEL === 10 && M.maskChannelOf(10) === 9 && M.maskChannelOf(11) === 9 && M.maskChannelOf(9) === -1 && M.maskChannelOf(12) === -1 && M.maskChannelOf(13) === -1);
    const x10 = Float64Array.from({ length: 3 * 10 }, (_, i) => i + 0.5), x = CD.withCounts(x10, Int32Array.of(4, 12, 1));
    let bad = null; try { CD.withCounts(new Float64Array(3 * 9), Int32Array.of(4, 4, 4)); } catch (e) { bad = e.message; }
    ok("  withCounts: each pixel's ten channels as they were, then its count over the budget (4 -> 1, 12 -> 3, 1 -> 0.25); a nine-channel input refused",
        x.length === 33 && [0, 1, 2].every((p) => same(x.slice(p * 11, p * 11 + 10), x10.slice(p * 10, p * 10 + 10))) && x[10] === 1 && x[21] === 3 && x[32] === 0.25 && /10-channel input/.test(bad || ""));
    // the share map by hand: the scene's seed salted by COUNT_SALT, the disk count first, then each disk's centre and radius
    const sd = 990960, w = 32, sm = CD.shareMap(sd, w, w), r = rng((((sd >>> 0) * 3266489917) + 86) >>> 0), k = Math.floor(r() * 4), disks = [];
    for (let i = 0; i < k; i++) disks.push({ cx: r() * w, cy: r() * w, rad: 3 + 9 * r() });
    const inside = (x0, y0) => disks.some((d) => (x0 + 0.5 - d.cx) ** 2 + (y0 + 0.5 - d.cy) ** 2 <= d.rad ** 2);
    let match = true; for (let y = 0; y < w; y++) for (let x0 = 0; x0 < w; x0++) if (sm.share[y * w + x0] !== (inside(x0, y) ? 1 : 0)) match = false;
    const counts = [990960, 990961, 990962, 990963, 990964, 990965, 990966, 990967].map((s) => CD.shareMap(s, w, w).disks.length);
    // sabotage K2 (the stream unsalted) went 0 red before this: 990960 draws no disk either way, so every seed is re-drawn by hand
    const byHand = (sd2) => { const q = rng((((sd2 >>> 0) * 3266489917) + 86) >>> 0), kk = Math.floor(q() * 4), dd = []; for (let i = 0; i < kk; i++) dd.push({ cx: q() * w, cy: q() * w, rad: 3 + 9 * q() }); return dd; };
    const allByHand = [990960, 990961, 990962, 990963, 990964, 990965, 990966, 990967].every((sd2) => JSON.stringify(CD.shareMap(sd2, w, w).disks) === JSON.stringify(byHand(sd2)));
    ok("!! shareMap is section 192's: from the scene's stream salted by 86, 0-3 disks of radius 3-12, share 1 inside them and 0 elsewhere -- here re-drawn by hand pixel for pixel",
        CD.COUNT_SALT === 86 && CD.COUNT_DISKS.max === 3 && CD.COUNT_DISKS.rMin === 3 && CD.COUNT_DISKS.rMax === 12 && Object.isFrozen(CD.COUNT_DISKS) && match && sm.disks.length === k &&
        JSON.stringify(sm.disks) === JSON.stringify(disks) && allByHand && counts.every((c) => c >= 0 && c <= 3) && new Set(counts).size > 1, `disks ${counts.join(",")}`);
    const withDisk = [990960, 990961, 990962, 990963, 990964, 990965].map((s) => CD.shareMap(s, w, w)).find((q) => q.disks.length > 0), m = CD.countsOf(withDisk.share);
    const tot = m.reduce((q, v) => q + v, 0), inMean = m.filter((_, p) => withDisk.share[p]).reduce((q, v, _, a) => q + v / a.length, 0), outMean = m.filter((_, p) => !withDisk.share[p]).reduce((q, v, _, a) => q + v / a.length, 0);
    ok("!! countsOf is round 82's allocate over 1 + 2 s: 4 a pixel on the mean exactly, each 1-12, more inside the disks than out; a share of zero is the uniform 4",
        tot === 4 * w * w && m.every((v) => v >= 1 && v <= 12) && inMean > outMean && same(m, A.allocate(Array.from(withDisk.share, (s) => 1 + 2 * s), { budget: 4, hi: 12 })) && CD.countsOf(new Float64Array(64)).every((v) => v === 4),
        `inside ${inMean.toFixed(2)}, outside ${outMean.toFixed(2)}`);
    const P = [Float64Array.of(1, 2, 3, 10, 10, 10), Float64Array.of(3, 4, 5, 20, 20, 20), Float64Array.of(5, 6, 7, 30, 30, 30)], mo = CD.meanOfPasses(P, Int32Array.of(2, 3));
    ok("  meanOfPasses: each pixel the mean of its own first m passes", same(mo, Float64Array.of(2, 3, 4, 20, 20, 20)));
    // the passes' render seeds: their own range, above round 82's for every seed either round uses, and above every renderSeeds seed
    const allSeeds = [...D.SPLITS_R11.train.seeds, ...D.SPLITS_R11.val.seeds, ...D.SPLITS_COUNT_86.T1.seeds], top82 = Math.max(...allSeeds.map((s) => A.samplingSeed(s, 7, 11)));
    const lo = Math.min(...allSeeds.map((s) => CD.countSeed(s, 0))), seen = new Set(allSeeds.flatMap((s) => Array.from({ length: 12 }, (_, j) => CD.countSeed(s, j))));
    ok("  countSeed: 9e7 + seed x 16 + j, every one distinct over round 11's 200 scenes and round 86's 24, and above round 82's passes and round 11's own seeds",
        CD.COUNT_SEED_BASE === 9e7 && CD.countSeed(5, 3) === 9e7 + 83 && seen.size === allSeeds.length * 12 && lo > top82 && lo > Math.max(...allSeeds.map((s) => D.renderSeeds(s).ref2)), `lowest ${lo}, round 82's highest ${top82}`);
    // one count image at 16 x 16, rebuilt from its parts; its reference is round 11's own render of the scene
    const im = CD.countImage("R", 990960, { w: 16, sppRef: 8 }), S = D.makeScene("R", 990960), opts = (spp, s) => ({ w: 16, h: 16, spp, seed: s, rgb: true, eye: S.eye, look: S.look, up: S.up, fovDeg: S.fovDeg, sky: S.sky });
    const passes = Array.from({ length: 12 }, (_, j) => render(S.scene, opts(1, CD.countSeed(990960, j)))), cm = CD.countsOf(CD.shareMap(990960, 16, 16).share), g = D.guideBuffers(S, 16, 16);
    const want = CD.withCounts(M.withMask(D.inputChannels(CD.meanOfPasses(passes, cm), g.albedo, g.normal, 16, 16), M.emitterCoverage(S, 16, 16)), cm), r11 = D.renderImages("R", 990960, { w: 16, h: 16, sppRef: 8 });
    let refused = null; try { CD.countImage("R", D.SPLITS_R11.train.seeds[0], { w: 16, sppRef: 2 }); } catch (e) { refused = e.message; }
    ok("!! a count image is its twelve one-sample passes (countSeed), each pixel averaged over its count, the mask's ten channels and the count -- bit for bit -- against round 11's reference, rendered as renderImages renders it",
        same(im.x, want) && same(im.counts, cm) && same(im.ref, r11.ref) && im.w === 16 && im.h === 16 && /dataset seed/.test(refused || ""));
    const un = CD.countImage("R", 990960, { w: 16, sppRef: 8, uniform: true });
    ok("  ...with `uniform`, every count is 4 and the count channel 1", un.counts.every((v) => v === 4) && Array.from({ length: 256 }, (_, p) => un.x[p * 11 + 10]).every((v) => v === 1) && un.disks.length === 0);
    // the kernel's taps keep the mask's rule at stride 11: a tap across the mask's edge has weight zero
    const dn = N.makeDenoiser(7, N.INIT, "kernel", 11, "large"); dn.layers[dn.layers.length - 1].W.forEach((_, i, a) => { a[i] = 0.01 * Math.sin(i); });
    const xi = new Float64Array(12 * 12 * 11); for (let p = 0; p < 144; p++) { for (let c = 0; c < 9; c++) xi[p * 11 + c] = 0.3 + 0.01 * ((p * 7 + c) % 5); xi[p * 11 + 9] = p % 12 < 6 ? 1 : 0; xi[p * 11 + 10] = 1; }
    const o = N.denoise(dn, xi, 12, 12), T9 = N.KERNEL_TAPS, R = N.KERNEL_RADIUS, Dk = 2 * R + 1, p0 = 6 * 12 + 5;
    let across = 0, within = 0; for (let t = 0; t < T9; t++) { const qy = 6 + ((t / Dk) | 0) - R, qx = 5 + (t % Dk) - R; if (qy < 0 || qy >= 12 || qx < 0 || qx >= 12) continue; if (qx < 6) within += o.w[p0 * T9 + t]; else across += o.w[p0 * T9 + t]; }
    ok("!! at stride 11 the kernel keeps the emitter mask's rule: a pixel's taps across the mask's edge weigh nothing, its own side's sum to 1", dn.layers[0].Cin === 11 && across === 0 && Math.abs(within - 1) < 1e-12);
}

console.log("\n2. THE TRAINING");
const mini = Object.freeze({ train: Object.freeze({ family: "R+C", families: Object.freeze(["R", "C", "R"]), seeds: Object.freeze([990961, 990962, 990963]) }),
                             val: Object.freeze({ family: "R", families: Object.freeze(["R", "C"]), seeds: Object.freeze([990964, 990965]) }) });
const tr = CS.runCountTraining({ splits: mini, w: 32, sppRef: 8, seeds: [1, 2], train: { steps: 3, batch: 2, crop: 16 } });
{
    const tr2 = CS.runCountTraining({ splits: mini, w: 32, sppRef: 8, seeds: [2], train: { steps: 3, batch: 2, crop: 16 } });
    const ims = CS.countImages(mini.train, { w: 32, sppRef: 8 }), va = CS.countImages(mini.val, { w: 32, sppRef: 8 });
    const r1 = N.trainDenoiser(ims.map((e) => ({ x: e.x, ref: e.ref, w: e.w, h: e.h })), { seed: 1, steps: 3, batch: 2, crop: 16, init: N.INIT, head: "kernel", size: "large" });
    ok("!! each seed is round 11's network trained on the count images -- the large kernel head, 11 channels in -- deterministic by seed (seed 2 alone gives the same net)",
        tr.runs[0].net.layers.every((L, i) => same(L.W, r1.net.layers[i].W)) && tr.runs[0].net.layers[0].Cin === 11 && N.headOf(tr.runs[0].net) === "kernel" && tr.runs[0].net.layers[0].Cout === 32 &&
        tr.runs[1].net.layers.every((L, i) => same(L.W, tr2.runs[0].net.layers[i].W)));
    const vals = tr.runs.map((q) => q.valMean), best = tr.runs.reduce((b, q) => (q.valMean < b.valMean ? q : b));
    ok("!! the candidate is the lowest validation (display relMSE of each validation image's denoised frame), re-derived", tr.candidate === best.seed && tr.runs.every((q) => same(q.val, va.map((e) => CS.gradeImage(q.net, e)))) && vals.every(Number.isFinite), vals.map((v) => v.toExponential(3)).join(", "));
    const perm = derangement(3, SHUFFLE_SEED), sh = ims.map((e, i) => ({ x: e.x, ref: ims[perm[i]].ref, w: e.w, h: e.h }));
    const c2 = N.trainDenoiser(sh, { seed: tr.candidate, steps: 3, batch: 2, crop: 16, init: N.INIT, head: "kernel", size: "large" });
    ok("!! C2 is the candidate's seed on shuffled targets (the arc's derangement), recorded with its seed and shuffle", tr.c2.net.layers.every((L, i) => same(L.W, c2.net.layers[i].W)) && tr.c2.seed === tr.candidate && tr.c2.shuffle === SHUFFLE_SEED && perm.every((j, i) => j !== i));
    ok("  the config records the stride, the disks, round 82's rule, the schedule and the splits", tr.config.stride === 11 && tr.config.disks === CD.COUNT_DISKS && tr.config.sampling === A.SAMPLING && tr.config.head === "kernel" && tr.config.size === "large" &&
        tr.config.splits.train === 3 && tr.config.splits.val === 2 && tr.config.uniformImages === ims.filter((e) => e.disks.length === 0).length);
}

console.log("\n3. THE TEST");
{
    const S = D.makeScene("R", 990966), motion = (await imp("render/movingScenes.mjs")).sceneMotion(S), prep = (x10, c) => CD.withCounts(x10, c, 4), ds = tr.runs[0].net;
    const plain = A.samplingFrames(S, net, { W: 16, motion }), withAlt = A.samplingFrames(S, net, { W: 16, motion, alts: [{ net, prep: (x10) => x10 }, { net: ds, prep }] });
    ok("!! samplingFrames' extra arms take the SAME passes: with no arms its output is round 82's, and an extra arm through the shipped denoiser with its plain input is the main arms bit for bit",
        plain.uniform.every((f, k) => same(f.y, withAlt.uniform[k].y)) && plain.adaptive.every((f, k) => same(f.y, withAlt.adaptive[k].y)) && plain.alts.length === 0 &&
        withAlt.alts[0].uniform.every((f, k) => same(f.y, plain.uniform[k].y) && same(f.input, plain.uniform[k].input)) && withAlt.alts[0].adaptive.every((f, k) => same(f.y, plain.adaptive[k].y)));
    // sabotage K11 (the uniform extra arm handed the adaptive counts) went 0 red before this: the arms above ignore the counts they are given
    const seen = [], spy = (x10, c) => { seen.push(Int32Array.from(c)); return x10; }, sp = A.samplingFrames(S, net, { W: 16, motion, alts: [{ net, prep: spy }] });
    ok("!! each extra arm is handed its own counts: the uniform arm the budget (4) at every pixel of every frame, the adaptive arm that frame's allocation",
        seen.length === 16 && [0, 2, 4, 6, 8, 10, 12, 14].every((i) => seen[i].every((v) => v === 4)) && [1, 3, 5, 7, 9, 11, 13, 15].every((i, f) => same(seen[i], sp.spp[f])) && sp.spp.slice(1).some((m) => m.some((v) => v !== 4)));
    ok("  ...and D_S's arm is a different image (it denoises the same input with the count channel)", !same(withAlt.alts[1].adaptive[7].y, plain.adaptive[7].y) && same(withAlt.alts[1].adaptive[7].input, plain.adaptive[7].input));
    const miniT = Object.freeze({ T1: Object.freeze({ family: "R+C", families: Object.freeze(["R", "C"]), seeds: Object.freeze([990966, 990967]) }) }), o = { W: 16, sppIn: 4, sppRef: 8, c1Min: 0 };
    const res = CS.runCountTest({ splits: miniT, net, ds, dsC2: tr.c2.net, ...o }), U = T.makeUpscalerT(3, "half"), r82 = LT.runSamplingTest({ splits: miniT, net, U, Uc2: U, ...o });
    ok("!! *** S_U and S_A are round 82's two arms bit for bit (runSamplingTest's btU and btA, and its B1s, noisy input and floor) ***",
        same(res.tables.sU, r82.tables.btU) && same(res.tables.sA, r82.tables.btA) && same(res.tables.b1sU, r82.tables.b1U) && same(res.tables.b1sA, r82.tables.b1A) && same(res.tables.noisy, r82.tables.noisy) && same(res.tables.floor, r82.tables.floor));
    const H = res.verdict.hypotheses;
    ok("!! H1 is D_A against D_U, H2 D_A against S_U, C2 C2's D_S on the adaptive passes against D_A; the four arms differ",
        same(H.H1.d, effects(res.tables.dU, res.tables.dA)) && same(H.H2.d, effects(res.tables.sU, res.tables.dA)) && same(res.secondary.c2, effects(res.tables.dA, res.tables.c2)) &&
        !same(res.tables.dA, res.tables.dU) && !same(res.tables.dA, res.tables.sA) && !same(res.tables.c2, res.tables.dA) && res.determinism === true);
    const g = (u, b) => 1 - u.reduce((q, v) => q + v, 0) / b.reduce((q, v) => q + v, 0);
    ok("  the descriptive gains re-derive: D_A over D_U and S_U, S_A over S_U (round 82's), D_U over S_U",
        res.secondary.gains.dAoverdU === g(res.tables.dA, res.tables.dU) && res.secondary.gains.dAoversU === g(res.tables.dA, res.tables.sU) && res.secondary.gains.sAoversU === g(res.tables.sA, res.tables.sU) &&
        res.secondary.gains.dUoversU === g(res.tables.dU, res.tables.sU) && res.secondary.gains.sAoversU === r82.secondary.gains.bt);
    // the cache keys: everything an image or a test scene depends on, and apart from every other round's
    const k1 = CS.countKey("R", 93000, { w: 64, sppRef: 1024, harvest: true }), k2 = CS.countTestKey("C", 94003, { W: 256, sppIn: 4, sppRef: 2048, ref2: true, harvest: true });
    ok("  the cache keys: a count image's names its family, seed, size, samples and harvest; a test scene's is round 82's sequence key marked as round 86's four arms",
        k1 === "count-image-R-93000-64-1024-harvest" && CS.countKey("R", 93000, { w: 32, sppRef: 1024 }) !== k1 && CS.countKey("C", 93000, { w: 64, sppRef: 1024, harvest: true }) !== k1 &&
        k2 === LT.temporalKey("C", 94003, { W: 256, sppIn: 4, sppRef: 2048, ref2: true, harvest: true }) + "-count86" && k2 !== LT.temporalKey("C", 94003, { W: 256, sppIn: 4, sppRef: 2048, ref2: true, harvest: true }));
    let nods = null; try { CS.runCountTest({ splits: miniT, net, ds: net, dsC2: net, ...o }); } catch (e) { nods = e.message; }
    ok("  a D_S that does not take 11 channels is refused", /D_S takes 11 channels/.test(nods || ""));
    const R = CS.ROUND_COUNT_86, Sp = D.SPLITS_COUNT_86, prior = new Set([...D.SPLITS_UPSCALE_TEMPORAL_84.T1.seeds, ...D.SPLITS_UPSCALE_LIGHTS.T1.seeds, ...D.SPLITS_UPSCALE_SAMPLING.T1.seeds, ...D.SPLITS_R11.T1.seeds, ...D.SPLITS_R11.T2.seeds]);
    let bad = null; try { CS.countRound(85); } catch (e) { bad = e.message; }
    ok("!! ROUND_COUNT_86: round 11's scenes, 64 x 64, 1,024 samples, seeds 1-3, 4,500 steps, the large kernel head; round 82's rule and test (256, 4 samples, 2,048, sign-flip, C1 at 22); its own two files; countRound 86, 85 refused",
        R.round === 86 && R.trainSplits === D.SPLITS_R11 && R.image === 64 && R.sppRef === 1024 && R.seeds.join() === "1,2,3" && R.train === N.TRAIN_LONG && R.train.steps === 4500 && R.head === "kernel" && R.size === "large" &&
        R.sampling === A.SAMPLING && R.testImage === 256 && R.sppIn === 4 && R.sppRefTest === 2048 && R.test === "signflip" && R.c1Min === 22 && R.splits === Sp &&
        R.net === "render/denoise-net-count-r86.json" && R.results === "render/denoise-results-count-r86.json" && CS.countRound(86) === R && /no count round 85/.test(bad || "") && Object.isFrozen(R));
    ok("!! SPLITS_COUNT_86: a test set only, 12 R at 93000-93011 then 12 C at 94000-94011, frozen, reserved, none an earlier test seed",
        Object.keys(Sp).join() === "T1" && Object.isFrozen(Sp) && Sp.T1.seeds.length === 24 && Sp.T1.seeds.slice(0, 12).every((x, i) => x === 93000 + i && Sp.T1.families[i] === "R") &&
        Sp.T1.seeds.slice(12).every((x, i) => x === 94000 + i && Sp.T1.families[12 + i] === "C") && Sp.T1.seeds.every((x) => D.isDatasetSeed(x) && !prior.has(x)));
    const cli = fs.readFileSync(path.join(ENG, "tools/denoiseStudy.mjs"), "utf8"), br = (flag) => { const b0 = cli.indexOf(`} else if (args.includes("${flag}")) {`); return b0 >= 0 ? cli.slice(b0, cli.indexOf("} else if (", b0 + 10)).replace(/\/\/.*$/gm, "") : ""; };
    const ta = br("--harvest-count-train"), tb = br("--harvest-count-test");
    ok("!! the two commands: --round through countRound; the training on the round's scenes, image, samples, seeds and schedule, never overwriting; the test reading the candidate and C2 from the committed training file, its start commit taken before it runs",
        /RD = CS\.countRound\(/.test(ta) && /CS\.runCountTraining\(\{ splits: RD\.trainSplits, harvest: true, w: RD\.image, sppRef: RD\.sppRef, seeds: RD\.seeds, train: RD\.train,/.test(ta) && /exists -- a harvest's results are never overwritten/.test(ta) &&
        /RD = CS\.countRound\(/.test(tb) && /cand = tr\.runs\.find\(\(x\) => x\.seed === tr\.candidate\)/.test(tb) && /ds: decodeNet\(cand\.net\), dsC2: decodeNet\(tr\.c2\.net\)/.test(tb) &&
        /W: RD\.testImage, sppIn: RD\.sppIn, sppRef: RD\.sppRefTest/.test(tb) && tb.indexOf("startCommit = git(") < tb.indexOf("CS.runCountTest(") && /exists -- a harvest's results are never overwritten/.test(tb));
}

console.log("\n4. SECTION 193: ROUND 86's VERDICT, RE-DERIVED FROM ITS COMMITTED FILES");
{
    const R = CS.ROUND_COUNT_86, tr = JSON.parse(fs.readFileSync(path.join(ENG, R.net), "utf8")), r = JSON.parse(fs.readFileSync(path.join(ENG, R.results), "utf8")), H = r.verdict.hypotheses, Tb = r.tables, sec = r.secondary;
    const mean = (a) => a.reduce((q, v) => q + v, 0) / a.length, g = (u, b) => 1 - mean(u) / mean(b), near = (a, b, e = 5e-5) => Math.abs(a - b) < e, fewer = (u, b) => u.filter((v, i) => v < b[i]).length;
    ok("!! the training: round 86 at 57edf87e, 192 + 8 count images (49 uniform), nothing cached, candidate seed 2 (3.6264e-3 against 3.8571e-3 and 3.8823e-3), stride 11; the test read it, at the same commit, nothing cached",
        tr.round === 86 && tr.commit === "57edf87e" && tr.config.splits.train === 192 && tr.config.splits.val === 8 && tr.config.uniformImages === 49 && tr.cache.hits === 0 && tr.candidate === 2 && tr.config.stride === 11 &&
        tr.runs.map((q) => q.valMean.toExponential(4)).join() === "3.8571e-3,3.6264e-3,3.8823e-3" && r.round === 86 && r.commit === "57edf87e" && r.trained.file === R.net && r.trained.candidate === 2 &&
        r.cache.hits === 0 && r.cache.misses === 24 && r.determinism === true && decodeNet(tr.runs[1].net).layers[0].Cin === 11);
    ok("!! *** H86a NOT SUPPORTED: D_A 9.97 % ABOVE D_U, better on 4 of 24, p 1.00; H86b NOT SUPPORTED: D_A 6.52 % above S_U, 8 of 24, p 0.99 ***",
        H.H1.status === "not supported" && H.H1.k === 4 && H.H1.p > 0.999 && same(H.H1.d, effects(Tb.dU, Tb.dA)) && near(g(Tb.dA, Tb.dU), -0.0997) &&
        H.H2.status === "not supported" && H.H2.k === 8 && H.H2.p > 0.98 && same(H.H2.d, effects(Tb.sU, Tb.dA)) && near(g(Tb.dA, Tb.sU), -0.0652) &&
        r.verdict.run === "reported" && r.verdict.controls.C1 && r.verdict.controls.C4 && r.verdict.controls.C5 && r.verdict.controls.C2.ok && near(r.verdict.controls.C2.meanD, -2.7140, 1e-4) && H.H1.c3.resolvable);
    ok("!! the table: S_U 2.0966e-3, S_A 2.2557e-3 (7.59 % above, 6 of 24), D_U 2.0308e-3 (3.14 % below S_U, 16 of 24), D_A 2.2333e-3 -- P4 MISSED (D_A loses more than S_A), P5 MISSED",
        near(mean(Tb.sU), 2.0966e-3, 5e-8) && near(mean(Tb.sA), 2.2557e-3, 5e-8) && near(mean(Tb.dU), 2.0308e-3, 5e-8) && near(mean(Tb.dA), 2.2333e-3, 5e-8) &&
        near(g(Tb.sA, Tb.sU), -0.0759) && fewer(Tb.sA, Tb.sU) === 6 && near(g(Tb.dU, Tb.sU), 0.0314) && fewer(Tb.dU, Tb.sU) === 16 && g(Tb.dA, Tb.dU) < g(Tb.sA, Tb.sU) &&
        sec.gains.dAoverdU === g(Tb.dA, Tb.dU) && sec.gains.dUoversU === g(Tb.dU, Tb.sU) && near(g(Tb.dA.slice(0, 12), Tb.dU.slice(0, 12)), -0.0615) && near(g(Tb.dA.slice(12), Tb.dU.slice(12)), -0.1092));
    ok("!! P6 HELD: on the rejected pixels (8.7 % of the frame, 6.52 samples) D_A is 6.67 % below D_U, S_A 6.33 % below S_U; B1 beats Bt in the uniform arm (Bt 8.08 % above)",
        near(sec.rejected.gains.dAoverdU, 0.0667) && near(sec.rejected.gains.sAoversU, 0.0633) && near(mean(sec.rejected.share), 0.0874, 1e-4) && near(mean(sec.rejected.sppA.filter((v) => v !== null)), 6.521, 1e-3) && near(g(Tb.sU, Tb.b1sU), -0.0808));
    const reg = fs.readFileSync(path.join(ENG, "render", "learned-denoiser-preregistration.md"), "utf8"), iX = reg.indexOf("## 193."), sX = reg.slice(iX, reg.indexOf("\n## ", iX + 1) > 0 ? reg.indexOf("\n## ", iX + 1) : undefined);
    ok("  section 193 says neither holds, P4 and P5 missed, that history-guided sampling closes, and that D_U's gain is unregistered and Keith's call",
        iX > 0 && /\*\*H86a NOT SUPPORTED:\*\*/.test(sX) && /\*\*H86b NOT SUPPORTED:\*\*/.test(sX) && /\*\*P4 MISSED:\*\*/.test(sX) && /\*\*P5 MISSED:\*\*/.test(sX) && /\*\*P6 HELD:\*\*/.test(sX) &&
        /\*\*History-guided sampling closes\*\*/.test(sX) && /Nothing was\s+pre-registered on this/.test(sX) && /Keith's call/.test(sX) && /committed unread/.test(sX));
}

console.log(`\n${fails ? "FAIL -- " + fails + " check(s)" : "ALL GREEN"} (${Date.now() - t0} ms)` +
    "\nnot closed here: whether a denoiser told the counts makes history-guided sampling pay. That is round 86's harvest, section 193's.");
process.exit(fails ? 1 : 0);
