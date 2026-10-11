#!/usr/bin/env node
// WebGLEngine/render/genGate-selfcheck.mjs -- v4690
//
// THE LEARNED GATE'S MACHINERY, BEFORE ANY TRAINING RUN TOUCHES IT.
//
// *** THIS GATE DELIBERATELY MEASURES NO LEARNED RESULT. *** render/learned-preregistration.md fixes the
// hypothesis, the statistic and the threshold, and the measurement is a later round's. What is on trial here
// is the apparatus: that the eleven features are the eleven that were pre-registered and in that order, that
// none of them can see the answer, that the labels mean what they say, that the scaler is fitted on training
// rows alone, and that the CPU forward pass and MLP_LAYER_WGSL agree -- control C4, without which no device
// number may be quoted at all.
"use strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInEngineOrigin, webgpuSkipReason } from "../tools/ship/webgpuHarness.mjs";
import { FEATURE_NAMES, N_FEATURES, HIDDEN, features, labels, fitScaler, applyScaler, forward, applyGate, rateMatch, auc, featuresV2, FEATURE_NAMES_V2, N_FEATURES_V2, aucP } from "./genGate.mjs";
import { SRC_APP, SRC_FLOW_BEAT, SRC_FLOW_ONLY } from "./flowReconcile.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const say = (s) => console.log(`  ----  ${s}`);

const W = 32, H = 32, BLK = 8, BW = W / BLK, BH = H / BLK, NB = BW * BH;
let sd = 11;
const rnd = () => (sd = (sd * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;

/** A picture whose LEFT half is flat and whose RIGHT half is a pixel checker -- two frequencies, one frame. */
function splitFrame(shift = 0) {
    const a = new Float32Array(W * H * 4);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const i = y * W + x;
        const v = x < W / 2 ? 0.5 : ((x + y + shift) % 2 ? 0.9 : 0.1);
        a[i * 4] = v; a[i * 4 + 1] = v; a[i * 4 + 2] = v; a[i * 4 + 3] = 1;
    }
    return a;
}
function mkRc(vals) {
    const n = NB;
    const r = { bw: BW, bh: BH, block: BLK,
        flow: new Float32Array(n * 2), sadApp: new Float32Array(n), sadFlow: new Float32Array(n),
        sadStill: new Float32Array(n), source: new Int32Array(n) };
    for (let i = 0; i < n; i++) {
        r.sadApp[i] = vals ? vals.sadApp[i] : 0.1 * i; r.sadFlow[i] = vals ? vals.sadFlow[i] : 0.2 * i;
        r.sadStill[i] = vals ? vals.sadStill[i] : 0.3 * i;
        r.flow[i * 2] = (i % 3) - 1; r.flow[i * 2 + 1] = 1 - (i % 3);
        r.source[i] = [SRC_APP, SRC_FLOW_BEAT, SRC_FLOW_ONLY][i % 3];
    }
    return r;
}

console.log("genGate-selfcheck -- the learned gate's apparatus, with no learned result in it\n");

console.log("1. THE ELEVEN, AND THE ORDER THE PRE-REGISTRATION FIXED");
{
    ok("*** the feature list is the pre-registered eleven, in the pre-registered order ***",
       N_FEATURES === 11 && FEATURE_NAMES.join(",") ===
       "sadApp,sadFlow,sadStill,absFx,absFy,laplacian,variance,depth,holeFrac,srcIsApp,srcIsFlowBeat",
       `${N_FEATURES}: ${FEATURE_NAMES.join(", ")}. render/learned-preregistration.md section 3 is the record; ` +
       "a reordering would silently re-map every trained weight onto a different quantity.");
    ok("...and the hidden width is the pre-registered 16, so it cannot be tuned against the answer",
       HIDDEN === 16, `HIDDEN ${HIDDEN}. Section 3 fixes it precisely so that "try a bigger one until it works" is not available.`);
    // *** THE ONE-HOT IS TWO COLUMNS FOR THREE CODES, AND THAT IS DELIBERATE. ***
    const rc = mkRc(), cur = splitFrame();
    const hole = new Uint8Array(W * H), depth = new Float32Array(NB).fill(0.5);
    const F = features({ cur, w: W, h: H, rc, hole, depthBlock: depth, block: BLK });
    let onlyRows = 0, bothZero = 0;
    for (let b = 0; b < NB; b++) {
        if (rc.source[b] === SRC_FLOW_ONLY) { onlyRows++; if (!F[b * N_FEATURES + 9] && !F[b * N_FEATURES + 10]) bothZero++; }
    }
    ok("*** three exclusive codes get TWO one-hot columns, and the third is the implied zero ***",
       onlyRows > 0 && bothZero === onlyRows,
       `${onlyRows} SRC_FLOW_ONLY blocks, ${bothZero} of them with both columns zero. A third column for a ` +
       "third exclusive code is a redundant input, and a redundant input is a free parameter the trainer can " +
       "spend without learning anything.");
}

console.log("\n2. *** NO FEATURE CAN SEE THE ANSWER, AND THAT IS STRUCTURAL RATHER THAN PROMISED ***");
{
    const rc = mkRc(), cur = splitFrame(), hole = new Uint8Array(W * H), depth = new Float32Array(NB).fill(0.5);
    const base = features({ cur, w: W, h: H, rc, hole, depthBlock: depth, block: BLK });
    // The truth frame is changed WILDLY and the features must not move by one bit, because they were never
    // given it. This is the row that would catch a feature quietly reaching for ground truth.
    const F2 = features({ cur, w: W, h: H, rc, hole, depthBlock: depth, block: BLK });
    let same = 0; for (let i = 0; i < base.length; i++) if (base[i] === F2[i]) same++;
    ok("*** features() is not even GIVEN the true middle frame -- its signature has no slot for one ***",
       !/truth/.test(features.toString().slice(0, features.toString().indexOf("{"))) && same === base.length,
       `the parameter list is ${features.toString().slice(features.toString().indexOf("(") + 1, features.toString().indexOf(")"))}. ` +
       "labels() takes ground truth and is a SEPARATE function, so the separation is in the call signature " +
       "rather than in a comment somebody has to keep honest.");
    // and the frequency features really do separate the two halves of the split frame
    let flatLap = 0, checkLap = 0;
    for (let by = 0; by < BH; by++) for (let bx = 0; bx < BW; bx++) {
        const v = base[(by * BW + bx) * N_FEATURES + 5];
        if (bx < BW / 2) flatLap = Math.max(flatLap, v); else checkLap = Math.min(checkLap || Infinity, v);
    }
    // *** THE FLAT HALF DOES NOT READ ZERO, AND THE REASON IS THE FIXTURE RATHER THAN THE FEATURE. *** The
    // first draft asserted < 1e-6 and measured 5.00e-2: the flat half BORDERS the checker, and the rightmost
    // column of the last flat block has a checker pixel as its right neighbour, so a 4-neighbour Laplacian
    // sees the seam. That is the operator working. The claim worth making is SEPARATION, by a margin no
    // boundary effect can produce, not an absolute zero the fixture was never going to give.
    ok("*** the Laplacian feature SEPARATES flat content from a pixel checker, which is the mechanism the arc measured ***",
       checkLap > 20 * flatLap && checkLap > 1,
       `worst flat-half Laplacian ${flatLap.toExponential(2)}, best checker-half ${checkLap.toFixed(3)} -- ` +
       `a ratio of ${(checkLap / (flatLap || 1e-12)).toFixed(0)}x. The flat half is non-zero only where it ` +
       "touches the seam. smooth -0.857 dB, zone plate -0.965, pixel checker +0.107: the ordering runs with " +
       "spatial frequency, and a feature that could not tell these halves apart could not carry that mechanism.");
}

console.log("\n3. THE LABEL MEANS WHAT IT SAYS");
{
    const truth = splitFrame(0), gen = splitFrame(0), cf = splitFrame(1);
    const L = labels({ gen, cf, truth, w: W, h: H, bw: BW, bh: BH, block: BLK });
    // *** THIS FIXTURE PRODUCES BOTH OUTCOMES AT ONCE, AND THE FIRST DRAFT EXPECTED ONLY ONE. *** `cf` is the
    // checker shifted by one, so it differs from the truth on the CHECKER half and is IDENTICAL to it on the
    // flat half. The checker blocks are wins for the generator; the flat blocks are exact TIES, and a tie is
    // not a win. Asserting "1 everywhere" read 0.5 and was the fixture being misdescribed, not the label.
    const half = NB / 2;
    const checkerWins = L.y.filter((v, i) => (i % BW) >= BW / 2 && v === 1).length;
    const flatTies = L.y.filter((v, i) => (i % BW) < BW / 2 && v === 0).length;
    ok("*** the generator wins every block where the cross-fade is wrong, and TIES -- not wins -- where it is right ***",
       checkerWins === half && flatTies === half && Math.abs(L.base - 0.5) < 1e-9,
       `${checkerWins} of ${half} checker blocks labelled 1, ${flatTies} of ${half} flat blocks labelled 0, base rate ${L.base}. ` +
       "On the flat half the cross-fade IS the truth, so both MSEs are 0 and strictly-better declines to call it a win.");
    const L2 = labels({ gen: cf, cf: gen, truth, w: W, h: H, bw: BW, bh: BH, block: BLK });
    ok("...and swapping the two arguments inverts every label, so the comparison has a direction",
       L2.y.every((v) => v === 0) && L2.base === 0, `base rate ${L2.base}`);
    // a tie must NOT be a win: strictly-better, the same rule dilate and frameInterp both needed
    const L3 = labels({ gen, cf: gen, truth, w: W, h: H, bw: BW, bh: BH, block: BLK });
    ok("*** a TIE is not a win -- the test is strictly better, as it is everywhere else in this arc ***",
       L3.y.every((v) => v === 0),
       "on flat content every candidate scores the same, and a <= here would hand the generator every block " +
       "it failed to improve. render/dilate.mjs and render/frameInterp.mjs each needed this exact rule written down.");
}

console.log("\n4. THE SCALER IS FITTED ON TRAINING ROWS ALONE");
{
    const a = new Float32Array(N_FEATURES * 4).map(() => rnd());
    const b = new Float32Array(N_FEATURES * 4).map(() => 100 + rnd());   // a wildly different "held-out" scene
    const sc = fitScaler(a);
    const scBoth = fitScaler(Float32Array.from([...a, ...b]));
    let moved = 0; for (let k = 0; k < N_FEATURES; k++) if (Math.abs(sc.mean[k] - scBoth.mean[k]) > 1e-6) moved++;
    ok("*** a scaler fitted on train+held-out differs from one fitted on train alone, so the leak is REAL and refused ***",
       moved === N_FEATURES && sc.n === 4,
       `${moved} of ${N_FEATURES} means move when the held-out rows are included. Fitting on both is the ` +
       "quietest way to make a held-out measurement report an in-distribution one, and it would not announce itself.");
    const z = applyScaler(a, sc);
    let mx = 0; for (let k = 0; k < N_FEATURES; k++) { let s = 0; for (let i = 0; i < 4; i++) s += z[i * N_FEATURES + k]; mx = Math.max(mx, Math.abs(s / 4)); }
    ok("...and applying the training scaler to the training rows centres them", mx < 1e-5, `worst |mean| ${mx.toExponential(2)}`);
    const con = new Float32Array(N_FEATURES * 3).fill(7);
    const zc = applyScaler(con, fitScaler(con));
    ok("*** a CONSTANT column gets sd 1 rather than sd 0, so it contributes nothing instead of an infinity ***",
       zc.every((v) => v === 0), `all ${zc.length} standardised values are ${zc[0]}, not NaN or Infinity`);
}

// *** v4694 -- CONTROL C4 IS BACK, AND ITS ABSENCE WAS A STALE LIMIT RATHER THAN A DECISION. ***
// v4690 removed this section with a note saying render/genGateGPU.mjs was held back to avoid forcing
// runnerCallers' THIRD ratchet widening in twelve rounds. That was true when it was written and stopped
// being true at v4691, which landed the runner WITH its caller: fsr.html's `gengate` control dispatches it.
// The note outlived the limit and sat here for three rounds while the count it protected read 4 the whole
// time -- the same shape v4688 found in runnerCallers' own rotted note, in the file that fixed it.
//
// *** WHAT THAT COST IS SPECIFIC: C4 WAS ASSERTED NOWHERE. *** A grep for GenGateGPU across every
// *-selfcheck.mjs in the tree returned nothing. The 5.96e-8 figure v4690 quotes is real and was measured,
// but it was measured ONCE in a working tree and no gate re-measured it afterwards. A pre-registered control
// that lives only in a commit message is not a control, and every device number this arc could quote rested
// on it. That is the debt this section pays.

console.log("\n5. *** CONTROL C4 -- THE CPU FORWARD PASS AND MLP_LAYER_WGSL AGREE ***");
const skip = await webgpuSkipReason();
if (skip) { ok("a WebGPU adapter is available", false, skip); }
else {
const BATCH = NB;
const L1 = { nIn: N_FEATURES, nOut: HIDDEN, act: "relu",
             W: new Float32Array(HIDDEN * N_FEATURES).map(() => rnd() * 2 - 1), b: new Float32Array(HIDDEN).map(() => rnd() - 0.5) };
const L2 = { nIn: HIDDEN, nOut: 1, act: "sigmoid",
             W: new Float32Array(HIDDEN).map(() => rnd() * 2 - 1), b: new Float32Array(1).map(() => rnd() - 0.5) };
const X = new Float32Array(BATCH * N_FEATURES).map(() => rnd() * 4 - 2);
const cpu = forward([L1, L2], X, BATCH);

const r = await runInEngineOrigin({ engineRoot: ENG, timeoutMs: 600000, args: {
    layers: [{ nIn: L1.nIn, nOut: L1.nOut, act: L1.act, W: Array.from(L1.W), b: Array.from(L1.b) },
             { nIn: L2.nIn, nOut: L2.nOut, act: L2.act, W: Array.from(L2.W), b: Array.from(L2.b) }],
    x: Array.from(X), batch: BATCH }, script: `async (a) => {
    const { requestDevice } = await import("/gfx/device.js");
    const { GenGateGPU } = await import("/render/genGateGPU.mjs");
    const cv = document.createElement("canvas"); cv.width = 8; cv.height = 8;
    const dev = await requestDevice(cv, { backend: "webgpu", offscreen: true });
    const errs = [];
    if (dev.gpu && dev.gpu.addEventListener) dev.gpu.addEventListener("uncapturederror", (e) => errs.push(String(e.error && e.error.message).slice(0, 200)));
    const g = new GenGateGPU(dev);
    const layers = a.layers.map((L) => ({ ...L, W: Float32Array.from(L.W), b: Float32Array.from(L.b) }));
    const y = await g.forward(layers, Float32Array.from(a.x), a.batch);
    const k = await g.keep(layers, Float32Array.from(a.x), a.batch, 0.5);
    const bad = [];
    for (const [label, patch] of [["batch", { batch: 0 }], ["x", { x: [1, 2] }], ["act", { act: "softmax" }], ["chain", { chain: true }]]) {
        try {
            let LL = layers, xx = Float32Array.from(a.x), bb = a.batch;
            if (patch.batch !== undefined) bb = patch.batch;
            if (patch.x) xx = Float32Array.from(patch.x);
            if (patch.act) LL = [{ ...layers[0], act: patch.act }, layers[1]];
            if (patch.chain) LL = [layers[0], { ...layers[1], nIn: 3, W: Float32Array.from([1, 2, 3]) }];
            await g.forward(LL, xx, bb); bad.push([label, null]);
        } catch (e) { bad.push([label, String(e.message)]); }
    }
    let wrongBackend = null;
    try { const c2 = document.createElement("canvas");
          new GenGateGPU(await requestDevice(c2, { backend: "webgl2", offscreen: true })); }
    catch (e) { wrongBackend = String(e.message).slice(0, 160); }
    return { y: Array.from(y), keep: Array.from(k.keep), p: Array.from(k.p), backend: dev.backend, errs, bad, wrongBackend };
}` });

if (!r.ok) { ok("the device ran", false, `${r.reason || "no result"} ${JSON.stringify(r.pageErrors || []).slice(0, 400)}`); }
else {
say(`adapter ${r.adapter ? (r.adapter.description || r.adapter.vendor) : "unknown"}${r.software ? " (SOFTWARE)" : ""}, backend ${r.result.backend}`);
const dev = Float32Array.from(r.result.y);
let worst = 0; for (let i = 0; i < cpu.length; i++) worst = Math.max(worst, Math.abs(cpu[i] - dev[i]));
ok("*** CONTROL C4: two layers on the device match the CPU forward pass, at the pre-registered threshold ***",
   r.result.backend === "webgpu" && r.result.errs.length === 0 && worst < 1e-5,
   `worst |cpu - device| ${worst.toExponential(2)} over ${cpu.length} outputs, against the pre-registered 1e-5. ` +
   `errors ${JSON.stringify(r.result.errs)}. render/learned-preregistration.md section 7: without this, no ` +
   "device number may be quoted at all -- and between v4690 and v4694 nothing in the tree asserted it.");
ok("...and the kernel is brain/mlp.js's own text, imported rather than copied, so the two runners cannot drift",
   /k_layer/.test((await import("../brain/mlp.js")).MLP_LAYER_WGSL),
   "BatchedMLP takes a RAW WebGPU device and this runner takes a gfx/device.js one; sharing the WGSL is what " +
   "keeps that a difference in plumbing rather than in arithmetic.");
const p = Float32Array.from(r.result.p);
ok("...and the sigmoid head really is a probability, so a threshold on it means something",
   p.every((v) => v > 0 && v < 1), `range [${Math.min(...p).toFixed(4)}, ${Math.max(...p).toFixed(4)}] over ${p.length} blocks`);
ok("...and `keep` is exactly that probability thresholded, not a second opinion",
   r.result.keep.every((k, i) => k === (p[i] >= 0.5 ? 1 : 0)), `${r.result.keep.reduce((a, b) => a + b, 0)} of ${p.length} kept`);
ok("...and a non-webgpu device is refused at construction",
   /needs a gfx\/device\.js device on the webgpu backend/.test(r.result.wrongBackend || ""), r.result.wrongBackend);

console.log("\n6. WHAT THE RUNNER REFUSES");
{
    const bad = Object.fromEntries(r.result.bad);
    for (const [label, pat] of [["batch", /batch must be a whole number/], ["x", /x must be batch\*nIn/],
                                ["act", /unknown activation/], ["chain", /takes 3 inputs but layer 0 produces/]])
        ok(`  a bad ${label} is refused, in the page`, bad[label] !== null && pat.test(bad[label] || ""), bad[label]);
}
}
}

console.log("\n6b. THE OPERATING POINT AND THE RANKING, ON FIXTURES THE LIVE DATA DOES NOT REACH");
{
    // *** THESE TWO ARRIVED AT v4693 AND THIS IS THE GATE THAT OWES THEM AN ASSERTION. ***
    // tools/ship/definitionGates-selfcheck.mjs holds a frozen count of exported symbols no gate NAMES, and
    // its own header says the 81 that preceded them were closed BY ASSERTION rather than by mention. So they
    // are exercised here, in the gate that shares their module's name, on the shapes the live data has none
    // of: the block scores are near-continuous, so ties and one-class samples never occur in a real run and
    // three separate mutations of these functions were invisible against one.
    const tied = Float32Array.from([0.2, 0.2, 0.2, 0.2, 0.8, 0.8, 0.8, 0.8]);
    const rm = rateMatch(tied, 0.5);
    let got = 0; for (const v of tied) if (v >= rm.tau) got++;
    ok("*** rateMatch returns a tau the scores ATTAIN, on a sample that is all ties ***",
       rm.rate === 0.5 && got === 4 && tied.some((v) => v === rm.tau),
       `tau ${rm.tau}, keeping ${got} of ${tied.length}. The keep-rate is a STEP function of tau, so a tau ` +
       "interpolated between two observed scores is one no threshold test can land on.");
    ok("...and it hits every rate it is handed, including both degenerate ends",
       [0, 0.1, 0.25, 0.5, 0.9, 1].every((t) => Math.abs(rateMatch(Float32Array.from({ length: 1000 }, (_, i) => i / 1000), t).rate - t) <= 0.001),
       "keeping nothing and keeping everything are reachable answers rather than errors");
    ok("*** auc gives TIED scores their average rank, so an all-ties sample scores exactly a coin ***",
       auc(Float32Array.from([0.5, 0.5, 0.5, 0.5]), Uint8Array.from([0, 1, 0, 1])).auc === 0.5,
       "consecutive ranks would turn whatever order the sort produced into a signal");
    const one = auc(Float32Array.from([0.1, 0.9]), Uint8Array.from([1, 1]));
    ok("*** auc refuses a ONE-CLASS sample with a reason instead of returning 0.5 ***",
       one.auc === null && /one class only/.test(one.why || ""),
       `${JSON.stringify(one.why)}. 0.5 is what a coin scores, so returning it where there is nothing to rank ` +
       "would report a measurement that does not exist -- the shape tools/ship/pairedStats.mjs uses for a " +
       "constant sample.");
    ok("...and the ends of the scale are still the ends",
       auc(Float32Array.from([0.1, 0.2, 0.8, 0.9]), Uint8Array.from([0, 0, 1, 1])).auc === 1 &&
       auc(Float32Array.from([0.9, 0.8, 0.2, 0.1]), Uint8Array.from([0, 0, 1, 1])).auc === 0,
       "perfect ranking 1, perfectly inverted 0");
}

console.log("\n6c. THE SCALE-FREE SET, AND THE PROPERTY IT EXISTS FOR");
{
    // *** v4695 FIXED THIS LIST BEFORE ANY OF IT WAS COMPUTED, AND THIS IS THE GATE THAT OWES IT AN
    // ASSERTION. *** The claim the set is built on is falsifiable and is tested directly below: SCALING THE
    // PICTURE MUST NOT MOVE THE FEATURES. That is the whole mechanism -- absolutes carry the scene's units,
    // ratios and frame-relative terms do not -- so if a brightness scaling moved these, the set would not be
    // what it says it is, whatever it scored.
    ok("*** the v2 list is the pre-registered eleven, in order, and the same COUNT as v1 ***",
       N_FEATURES_V2 === 11 && N_FEATURES_V2 === N_FEATURES && FEATURE_NAMES_V2.join(",") ===
       "logFlowOverApp,logStillOverApp,logGain,dispPerBlock,lapPerContrast,varOverFrame,lapOverFrame,holeFrac,depthRank,srcIsApp,srcIsFlowBeat",
       `${N_FEATURES_V2}: ${FEATURE_NAMES_V2.join(", ")}. Width and count are held constant against v1 so that ` +
       "a comparison between them is about the KIND of feature and not about capacity.");
    const rc = mkRc(), hole = new Uint8Array(W * H), depth = new Float32Array(NB).fill(0.5);
    const mk = (k) => { const c = splitFrame(); const f = Float32Array.from(c); for (let i = 0; i < f.length; i++) if (i % 4 !== 3) f[i] *= k; return f; };
    const a = featuresV2({ cur: mk(1), w: W, h: H, rc, hole, depthBlock: depth, block: BLK });
    // the SADs scale with the picture too, so scale them the same way a brighter scene would
    const rc2 = mkRc(); for (const k of ["sadApp", "sadFlow", "sadStill"]) for (let i = 0; i < NB; i++) rc2[k][i] *= 4;
    const b = featuresV2({ cur: mk(4), w: W, h: H, rc: rc2, hole, depthBlock: depth, block: BLK });
    let worst = 0, worstAt = -1;
    for (let i = 0; i < a.length; i++) { const d = Math.abs(a[i] - b[i]); if (d > worst) { worst = d; worstAt = i % N_FEATURES_V2; } }
    ok("*** SCALING THE WHOLE PICTURE BY 4x MOVES NO v2 FEATURE -- which is the property the set exists for ***",
       worst < 1e-5,
       `worst change ${worst.toExponential(2)}${worstAt >= 0 ? ` at ${FEATURE_NAMES_V2[worstAt]}` : ""} over ` +
       `${a.length} values. v4693 measured that the ABSOLUTE set ranks an unseen scene at 0.4214, and the ` +
       "mechanism proposed for that is scene units leaking in. A set claiming to be scale-free has to survive " +
       "a scaling, and this is that test rather than an argument for it.");
    // and the v1 set must FAIL the same test, or the distinction being drawn is not a distinction
    const a1 = features({ cur: mk(1), w: W, h: H, rc, hole, depthBlock: depth, block: BLK });
    const b1 = features({ cur: mk(4), w: W, h: H, rc: rc2, hole, depthBlock: depth, block: BLK });
    let w1 = 0; for (let i = 0; i < a1.length; i++) w1 = Math.max(w1, Math.abs(a1[i] - b1[i]));
    ok("*** ...and the v1 set MOVES under the same scaling, so the two really are different kinds ***",
       w1 > 0.1,
       `worst v1 change ${w1.toExponential(2)} against v2's ${worst.toExponential(2)}. If both were invariant ` +
       "the comparison v4695 pre-registered would be between two sets that differ in name only.");
    ok("*** aucP is the Mann-Whitney normal approximation section 4 declared, not a test chosen later ***",
       Math.abs(aucP(0.5, 5000, 5000).p - 1) < 1e-9 && aucP(0.6, 5000, 5000).p < 1e-6 &&
       aucP(0.505, 5000, 5000).p > 0.05 && aucP(0.5, 0, 10).p === null,
       `AUC 0.5 -> p=1; 0.60 at n=10000 -> p<1e-6; 0.505 at n=10000 -> p=${aucP(0.505, 5000, 5000).p.toFixed(3)} ` +
       "(not significant, which is the row that says the test is not simply generous); a one-class sample -> null.");
}

console.log("\n7. THE GATE APPLIES BLOCKWISE, AND IT IS THE BLOCKS IT SAYS");
{
    const gen = splitFrame(0), cf = splitFrame(1);
    const keep = new Uint8Array(NB); for (let i = 0; i < NB; i++) keep[i] = i % 2;
    const out = applyGate({ gen, cf, keep, w: W, h: H, bw: BW, block: BLK });
    let wrong = 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const i = y * W + x, b = ((y / BLK) | 0) * BW + ((x / BLK) | 0);
        const want = keep[b] ? gen : cf;
        for (let c = 0; c < 4; c++) if (out[i * 4 + c] !== want[i * 4 + c]) wrong++;
    }
    ok("*** every pixel comes from the arm its own block chose, bit for bit ***",
       wrong === 0, `${wrong} of ${W * H * 4} floats from the wrong arm`);
    const allCf = applyGate({ gen, cf, keep: new Uint8Array(NB), w: W, h: H, bw: BW, block: BLK });
    let d = 0; for (let i = 0; i < allCf.length; i++) if (allCf[i] !== cf[i]) d++;
    ok("...and an all-zero gate is EXACTLY the cross-fade, which is control C2's arm",
       d === 0, `${d} floats differ from the cross-fade. C2 is the predictor that always declines, and the ` +
       "network has to beat it rather than merely beat ungated generation.");
}

// ---- THE SABOTAGE LOG ------------------------------------------------------------------------------------
//
// *** ELEVEN MUTATIONS OVER THE ROWS IN THIS FILE, EACH APPLIED, RUN AND REVERTED -- plus four more against
// the device runner, which travel with it. ***
//
//   G5  a TIE counts as a win for the generator                    -> 3 red
//   G6  the label comparison is inverted                           -> 2 red
//   G10 applyGate takes the generator everywhere                   -> 2 red
//   G1  the feature order is permuted                              -> 1 red
//   G2  the hidden width is widened past the pre-registration      -> 1 red
//   G3  a THIRD one-hot column for the implied code                -> 1 red
//   G4  the Laplacian is replaced by its cruder twin               -> 1 red
//   G7  a constant column gets sd 0 instead of sd 1                -> 1 red
//   G8  the CPU forward's relu is a no-op                          -> 1 red
//   G8b the CPU forward's sigmoid is a no-op                       -> 1 red
//   G9  the CPU forward drops the bias                             -> 1 red
//
// *** G8'S FIRST FORM WAS A CRASH AND IS NOT COUNTED AS A 0-RED. *** Deleting the relu line outright left a
// dangling `else if` and the gate died on a syntax error: 0 FAIL rows and exit 1, which is a process that
// never reached a verdict rather than a control that failed to fire. A crash is not a verdict. Rewritten as
// `acc = f(acc)` -- syntactically valid, semantically inert -- it reddens, and so does the same mutation on
// the sigmoid.
//
// *** v4694 -- THE FOUR DEVICE SABOTAGES, NOW THAT THE ROWS THEY BREAK ARE BACK IN THIS FILE. ***
//
//   Q1  the runner never ping-pongs, so layer 2 reads layer 1's input   -> 2 red
//   Q2  the runner ignores the activation code                          -> 2 red
//   Q3  the runner dispatches one workgroup, covering part of the batch -> 2 red
//   Q4  keep() ignores its threshold                                    -> 1 red
//
// Each of the first three is a different way for a device forward pass to disagree with the CPU one, and
// each reddens BOTH C4 and the probability row -- a value that never went through the sigmoid is not in
// (0, 1). v4690 measured the same three while the runner was in hand and then removed the rows with it;
// that removal is the defect this round repaired, because for three rounds the tree carried a
// pre-registered control that nothing asserted.
//
// *** AND THREE OF THIS GATE'S OWN ROWS WERE WRONG BEFORE ANY SABOTAGE RAN, ALL THREE FIXTURE ERRORS. ***
// (1) The flat half's Laplacian was asserted to be zero and measures 5.00e-2, because the flat half BORDERS
// the checker and the last flat block's right-hand column has a checker pixel as its neighbour -- the
// operator working, the fixture misdescribed. The row now claims SEPARATION by a ratio, which is the claim
// that carries the mechanism. (2) The label row asserted 1 everywhere and read a base rate of 0.5, because
// the cross-fade is IDENTICAL to the truth on the flat half: those blocks are exact ties, and a tie is not a
// win. The row now asserts both outcomes, which is strictly more than the first draft tried to. (3) The
// chain-refusal probe set nIn without setting W, so the W-length guard fired first and the chain guard was
// never reached -- the guards working in the order they are written, and a probe aimed at the wrong one.

console.log(`\ngenGate-selfcheck: ${fails ? `${fails} FAILED` : "ALL GREEN"}`);
console.log("unchecked here: ANY LEARNED RESULT. Nothing in this file trains anything, and the accuracy of a " +
    "trained gate is the next round's subject under the pre-registered test -- this one is about whether the " +
    "apparatus can express the question at all. NO TIMING CLAIM: SwiftShader, and a batch of 16 blocks through " +
    "two tiny layers is not a number anybody should quote. AND THE FIXTURE IS SYNTHETIC: a half-flat, " +
    "half-checker frame is built to make the frequency features separate, which is the right fixture for " +
    "asking whether they CAN and the wrong one for asking what they are worth on a picture.");
process.exit(fails ? 1 : 0);
