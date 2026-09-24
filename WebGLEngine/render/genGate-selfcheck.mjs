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
import { FEATURE_NAMES, N_FEATURES, HIDDEN, features, labels, fitScaler, applyScaler, forward, applyGate, rateMatch, auc } from "./genGate.mjs";
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

// *** SECTIONS 5 AND 6 -- CONTROL C4 AND THE DEVICE RUNNER'S REFUSALS -- ARE NOT HERE, AND THAT IS A
// RATCHET DECISION RATHER THAN AN OMISSION. *** render/genGateGPU.mjs is a compute runner, and
// tools/ship/runnerCallers-selfcheck.mjs holds a frozen count of runners NOTHING OUTSIDE A GATE CAN
// CONSTRUCT. Landing it here would take that count from 4 to 5 and force this arc's THIRD widening in twelve
// rounds -- and v4680's own note says the next round that wants to widen has to write "the third widening"
// and mean it. It does not have to: the runner cannot have a production caller until trained weights exist,
// and the round that trains them is the round that wires it into fsr.html. So the runner arrives WITH its
// caller, and the ratchet stays at 4.
//
// The pre-registration is unaffected. C4 says no DEVICE NUMBER may be quoted until the CPU and
// MLP_LAYER_WGSL forward passes agree to 1e-5, and this round quotes none. (It has been measured at 5.96e-8
// while the runner was in hand, which is why the decision above is about debt and not about doubt.)

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
// *** THREE FURTHER SABOTAGES WERE RUN AGAINST THE DEVICE RUNNER AND EACH REDDENED C4 BY 2 -- not
// ping-ponging the activations, hard-wiring the activation code to `none`, and dispatching a single
// workgroup. They are recorded here rather than listed above because the rows they broke travel with
// render/genGateGPU.mjs into the round that wires it; measuring them early is why that runner is known to
// work before it is known to be wanted.
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
