#!/usr/bin/env node
// WebGLEngine/physics/render/microfacetWgsl-selfcheck.mjs -- v4408
//
// *** THE MICROFACET LOBE ON A DEVICE. THE MODEL'S ARITHMETIC PREDICTION IS RIGHT TO FOUR FIGURES AND ITS
// TRANSCENDENTAL ASSUMPTION IS WRONG BY SIXTEEN PERCENT. ***
//
// render/microfacetShader.js has carried the GGX lobe in GLSL since v3494 and has never run on a GPU. It said
// what it could not answer -- "THE SANDBOX MODELS binary32; THE GPU IS THE AUTHORITY, and the page reads the
// numbers back to ask it" -- and the sandbox has a device now. This asks, and gets two different answers.
//
// ---- WHAT THE MODEL GOT RIGHT, WHICH IS EVERYTHING IT ACTUALLY MODELLED ----------------------------------------
//
// v3494's headline is a Math.fround measurement: at roughness 0.001 the textbook denominator cos^2(a^2-1)+1 is
// 2.60e-2 out and the shipped rewrite (1-cos^2)+a^2 cos^2 is 1.33e-7 out. A DEVICE RETURNS 2.604e-2 AND
// 1.333e-7 -- the same two numbers to four significant figures, from real f32 silicon rather than from a
// double rounded after every operation. Over a 20-cell (roughness, cos) grid the device and the model agree to
// within a last-bit difference on both forms. That prediction is scored and it holds.
//
// ---- AND THE ONE THING A fround MODEL CANNOT MODEL --------------------------------------------------------------
//
// *** WGSL BOUNDS sin AND cos BY AN ABSOLUTE ERROR OF 2^-11 INSIDE [-PI, PI]. Math.cos is near-correctly-
// rounded, so the model has no way to express that and quietly assumes a transcendental it will not get. ***
//
// The bill arrives at the identity v3494 could not reach at all -- a fragment shader writing one lobe value per
// pixel cannot take an integral, so microfacet.mjs's three keys stayed on the CPU. A compute pass can, and the
// first key, INT D(m)(n.m)dm = 1, reads 0.837 at roughness 0.02 on this device. Not 1. Sixteen percent.
//
// THE CAUSE IS PINNED RATHER THAN GUESSED AT, by handing the same kernel the same grid's sine and cosine
// computed on the HOST and changing nothing else: the residual drops from 1.63e-1 to 2.50e-5 and the partial
// sums land on the f32 mirror, 36 of 64 lanes bit-identical and 1.9e-7 worst on the rest. So the deficit is
// the transcendental, entirely, and the arithmetic port is exact.
//
// *** AND THE DEVICE IS NOT AT FAULT. *** cos(1.96e-4) comes back as 0.999999464 against a true 0.999999981 --
// 5.2e-7 absolute, well inside the 4.88e-4 the specification allows. Any conformant device may do this. What
// breaks is ggxD's (1.0 - c2), which is the difference of two numbers within 2^-11 of 1: it reads 1.07e-6
// where the truth is 3.9e-8, twenty-eight times too big, and D goes as 1/t^2.
//
// ---- SO THE ROUND'S ACTUAL SUBJECT IS ONE EXPRESSION, AND v3494 REMOVED THE OTHER HALF OF IT -----------------
//
// v3494 rewrote the denominator to kill the cancellation in (a^2 - 1). The SURVIVING half is (1 - c2), and it
// is a difference of numbers near 1 whenever the surface is near-normal -- which is where a narrow lobe puts
// all of its mass. It cannot be seen at f64, it cannot be seen by evaluating D at a handed-in cosine, and it
// cannot be seen without taking the integral. It needs all three of the conditions this round is the first to
// have at once.
//
// A SECOND, SMALLER FINDING ABOUT v3494's OWN CLAIM: "THE REWRITE HOLDS AT 1e-7 THROUGHOUT" IS A ROUGHNESS
// SWEEP AT cos = 1. Its rows are D32(kind, 1, a) for seven roughnesses -- one column of a shader whose every
// pixel is a different (roughness, cos) pair. At cos = 1 the rewrite has nothing to cancel, because 1 - 1*1 is
// exactly 0 in any precision. Swept along the cos axis instead, the rewrite is 9.9e-5 out at cos = 0.9999 --
// three orders worse than the number that sentence quotes, and confirmed on the device to the same figures.
// The claim is true where it was measured. The axis it was not measured on is the one the shader spans.
//
// SABOTAGES: see the log at the foot of this file.
//
// Run: node physics/render/microfacetWgsl-selfcheck.mjs   (exit 0 all-pass, 1 on any fail; a SKIP counts as a fail)
"use strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInEngineOrigin, webgpuSkipReason } from "../../tools/ship/webgpuHarness.mjs";
import { adapterKey, verdict, describe, owedCount, compareFor, boundFrom,
         readReadings, recordReading, mergeRecords, READINGS_PATH, SLACK } from "../../tools/ship/adapterRecord.mjs";
import { buildWgsl, glslFnToWgsl, plantedGlsl, packParams, reduce, trigTable, ndfEmulated, dEmulated,
         MODE, FAULT, TRIG_ABS_ERR } from "./microfacetWgsl.mjs";
import { FRAG_SRC_GGX, T_LINES } from "../../render/microfacetShader.js";
import { D, ndfIntegral, furnaceIntegral } from "./microfacet.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const report = (s) => console.log(`  ----  ${s}`);
const fr = Math.fround;

// *** EVERY BOUND BELOW WAS A READING OF ONE ADAPTER, AND THE GATE COULD NOT SAY WHICH. ***
//
// This file's numbers were all taken on SwiftShader -- the Playwright bundle's rasteriser, which is the only
// adapter the sandbox has. Run on Keith's rig at v4646 (an NVIDIA Pascal through D3D12) SIX rows went red,
// and reading them is the finding: builtin[0] > 0.15 wants the device's own trig to be at least 16% WRONG,
// and Pascal is 1.87e-4; worstCosAbs > 1e-7 wants its cos to be at least that far off, and Pascal is 9.46e-8;
// worstOneMinusC2Rel > 10 wants the pole error an order up, and Pascal is 2.09. THOSE ROWS FAIL BECAUSE THE
// HARDWARE IS BETTER. They were written to demonstrate a deficiency and they assert the deficiency exists --
// the register-of-grievances shape this tree keeps finding, going red for the improvement.
//
// So each such claim is split. The DURABLE half is a fact about the port or the specification and is asserted
// on every adapter: host trig repairs the integral, the device's cos stays inside WGSL's 2^-11 bound, the
// arithmetic matches the f32 mirror in direction. The ADAPTER half is a magnitude, and a magnitude belongs to
// the silicon that produced it -- HELD against the reading on file for this adapter, or OWED when there is
// none, per tools/ship/adapterRecord.mjs and the three states deviceOwed.mjs established at v3339.
const DEVICE_AT_V4646 = Object.freeze({
    // SwiftShader's readings, which are the bounds this file has always carried, unchanged.
    "google/swiftshader": Object.freeze({
        worstGap: 2e-7, builtinLow: 0.15, hostWorst: 3e-5, hostRatio: 1000,
        mirrorGap: 5e-8, laneSame: 30, laneWorst: 5e-7, cosAbsMin: 1e-7, oneMinusC2Min: 10,
        // v4647: measured 0.84 (the residual RISES from 500x500 to 800x800), bounded at the SLACK convention.
        coarseFall: 1.68,
    }),
    // *** NOTHING ELSE IS ENTERED HERE BY HAND, AND v4647 GAVE THAT RULE A WAY TO BE PAID. *** A reading typed
    // in from a terminal is not a reading this gate took, so Pascal's numbers stayed OWED at v4646 -- correctly,
    // and with no route to ever stop being OWED, since the person who can run the gate on that box is not the
    // person editing this file. `--record` writes the reading on the box that took it into
    // tools/ship/adapter-readings.json, which merges UNDER this record and can never override it.
});

// *** AND THE COST OF OWED, MEASURED RATHER THAN ASSERTED, BECAUSE IT IS THE PART THAT CAN BITE. ***
// Perturbing ndfEmulated -- the f32 mirror every arithmetic claim here rests on -- by one part in a million
// turns the mirror row RED on SwiftShader at 5.02e-3 against its 5e-8 bound, so HELD has not been softened.
// Run with that same sabotage against an UNRECORDED adapter, the whole file goes green: the magnitude rows
// report OWED and assert nothing, and no durable row covers that particular break. So an adapter with no
// reading on file is NOT protected by these rows, and OWED is a visible debt rather than a resting place --
// which is the whole reason owedCount() prints at the end instead of each row quietly saying "fine".


const LANES = 64, N_NDF = 4000;
const ALPHAS = [0.02, 0.05, 0.1, 0.25, 0.5, 1.0];
const COS_O = [0.95, 0.6, 0.25];
// *** alpha 0.02 IS OUT OF THE WEAK SWEEP AND THE REASON IS MEASURED, NOT ASSERTED. *** A 200x200 grid does not
// resolve a lobe that narrow: the residual there is 8.6e-2 on the device AND 8.7e-2 in f64 on the same grid, so
// it is the quadrature and not the key. The refinement check below shows it falling when the grid is refined,
// which is microfacet.mjs's own rule for the NDF -- proved BY REFINEMENT rather than by a widened band.
const WEAK_ALPHAS = ALPHAS.slice(1);
const NQ = 200, COARSE_GRIDS = [200, 500, 800], COARSE_ALPHA = 0.02, COARSE_COS = 0.25;
// The (roughness, cos) cells v3494's model is scored on. cos = 1 is its own column: the ONLY one it measured.
const CELLS = [];
for (const a of [0.001, 0.01, 0.05, 0.3]) for (const c of [1, 0.999999, 0.9999, 0.99, 0.5]) CELLS.push({ a, c });

/** The f32 model of the two denominators, transcribed from microfacetShader-selfcheck.mjs's t32/D32 at v3494. */
const t32 = (kind, a, c) => {
    const a2 = fr(fr(a) * fr(a)), c2 = fr(fr(c) * fr(c));
    return kind === "naive" ? fr(fr(c2 * fr(a2 - 1)) + 1) : fr(fr(1 - c2) + fr(a2 * c2));
};
const D32 = (kind, c, a) => { const t = t32(kind, a, c); return fr(fr(fr(a) * fr(a)) / fr(fr(Math.PI) * fr(t * t))); };
const relD32 = (kind, c, a) => Math.abs(D32(kind, fr(c), a) - D(fr(c), a)) / D(fr(c), a);

console.log("\n1. THE TRANSLATOR, PROVEN ON A FIXTURE BEFORE IT IS POINTED AT THE SHIPPING SHADER");
{
    // *** THE ARMS SWAP AND THAT IS THE WHOLE RISK. *** select(false, true, cond) is the reverse of every
    // C-family ternary, and getting it backwards compiles, runs, and is wrong only where the condition bites.
    // 7 and 9 rather than 0 and 1, so a swap cannot hide behind a value that means something else too.
    const fx = "float pick(float x){\n  float u = x * 2.0;\n  return u > 1.0 ? 7.0 : 9.0;\n}";
    const w = glslFnToWgsl(fx, "pick");
    ok("!! the ternary is translated with its arms in select()'s order, not the ternary's",
        w.includes("select(9.0, 7.0, u > 1.0)"),
        `select's FIRST argument is the false arm. Got: ${JSON.stringify((w.match(/return .*/) || [""])[0])}`);
    ok("  and each GLSL local becomes a typed WGSL let, signature included",
        w.startsWith("fn pick(x : f32) -> f32 {") && w.includes("let u : f32 = x * 2.0;"), w.split("\n")[0]);

    let refused = false;
    try { glslFnToWgsl("float q(float x){\n  return x > 1.0 ? (x > 2.0 ? 1.0 : 2.0) : 3.0;\n}", "q"); }
    catch { refused = true; }
    ok("  and a nested ternary is REFUSED rather than translated by guess",
        refused, "a translator that guesses at a shape it cannot see produces a shader that is wrong in a way nothing here would find");
    ok("  and a function that is not in the source returns null, which is a finding a caller can name",
        glslFnToWgsl(FRAG_SRC_GGX, "ggxNotThere") === null, "not a throw: 'the shipped shader no longer has this function' is a report, not a crash");

    const wgsl = buildWgsl();
    ok("*** and the WGSL the device runs carries the SHIPPED GLSL's expression text verbatim, not a retyping ***",
        wgsl.includes("let t : f32 = (1.0 - c2) + a2 * c2;") &&
        wgsl.includes("(-1.0 + sqrt(1.0 + a * a * tan2)) / 2.0") &&
        wgsl.includes("1.0 / (1.0 + ggxLambda(cosO, a) + ggxLambda(cosI, a))"),
        "render/microfacetShader.js's own lines, lifted. A hand-written copy would make every agreement below a statement about the copy");

    const planted = plantedGlsl({ textbook: true });
    const diff = FRAG_SRC_GGX.split("\n").filter((l, i) => l !== planted.split("\n")[i]);
    ok("  and the textbook plant is produced by a replace that is ASSERTED to have happened, differing by exactly one line",
        diff.length === 1 && diff[0] === T_LINES.stable && planted.includes(T_LINES.naive),
        `${diff.length} line(s) differ. A silent no-op replace leaves the plant equal to the clean text and every comparison reports a comfortable zero -- FRAG_SRC_GGX_NAIVE's own stated reason for existing`);
    let noPiRefused = false;
    try { plantedGlsl.call(null, { noPi: true }); } catch { noPiRefused = true; }
    ok("  and the noPi plant finds its constant where it expects it", !noPiRefused && plantedGlsl({ noPi: true }).includes("1.0 * t * t"),
        "the replace throws rather than returning the clean text if the shader moved the pi");
}

console.log("\n2. v3494's PREDICTION ABOUT binary32, SCORED ON A DEVICE FOR THE FIRST TIME");
const skip = webgpuSkipReason();
if (skip) { ok("a device is reachable", false, `SKIP: ${skip} -- a skip counts as a failure here; the whole round is the device`); }
const R = skip ? null : await run();
// The adapter every reading below belongs to, and the bounds on file for it (none -> every magnitude row
// reports OWED and asserts nothing, while the durable rows still hold).
const ADAPTER = R ? R.adapter : null;
const AKEY = adapterKey(ADAPTER);
const GATE = "microfacetWgsl";
const VERDICTS = [];
// The readings this gate has WRITTEN on other boxes, merged UNDER the frozen record so the frozen one always
// wins -- see adapterRecord.mjs. A recorded reading can only ever turn OWED into HELD.
const RECORDED = readReadings(GATE);
const RECORD = mergeRecords(DEVICE_AT_V4646, RECORDED);
// *** A DIRECTION, NOT A COMPARATOR, AND THE REASON IS THAT SEVEN HAND-WRITTEN ONES ARE SEVEN CHANCES TO
// WRITE ONE BACKWARDS. *** "max" means the measurement must stay at or below the stored bound, "min" at or
// above. It is also what --record needs: a bound cannot be widened in the right direction by something that
// does not know which direction the row is asserted in.
const held = (name, measured, dir) => {
    const v = verdict(RECORD, ADAPTER, measured, compareFor(name, dir));
    VERDICTS.push({ ...v, name, dir });
    return v;
};
if (R) {
    const relGpu = (name, k) => { const g = R.probe[name][k * 3]; const e = D(fr(CELLS[k].c), CELLS[k].a); return Math.abs(g - e) / e; };
    const head = CELLS.findIndex((x) => x.a === 0.001 && x.c === 1);
    ok("*** the two numbers v3494 measured with Math.fround come back off a device to four significant figures ***",
        Math.abs(relGpu("textbook", head) - 2.604e-2) / 2.604e-2 < 2e-3 && Math.abs(relGpu("stable", head) - 1.333e-7) / 1.333e-7 < 2e-3,
        `at roughness 0.001, cos 1: textbook ${relGpu("textbook", head).toExponential(3)} (model ${relD32("naive", 1, 0.001).toExponential(3)}), rewrite ${relGpu("stable", head).toExponential(3)} (model ${relD32("stable", 1, 0.001).toExponential(3)}). FIVE ORDERS, on silicon`);

    const gaps = CELLS.map((x, k) => ["stable", "naive"].map((kind) => {
        const g = relGpu(kind === "naive" ? "textbook" : "stable", k), m = relD32(kind, x.c, x.a);
        return Math.abs(g - m);
    })).flat();
    const worstGap = Math.max(...gaps);
    const vGap = held("worstGap", worstGap, "max");
    ok(`  and over all ${CELLS.length} (roughness, cos) cells the device and the fround model agree on BOTH denominators [${vGap.state}]`,
        vGap.ok,
        `worst departure ${worstGap.toExponential(2)} in relative error -- a last-bit difference, at cells where both sit on the 1e-7 floor. The arithmetic port is the model's arithmetic`);

    // *** THE AXIS v3494 DID NOT SWEEP. *** Its rows are D32(kind, 1, a): cos is pinned at 1, where the rewrite
    // has nothing to cancel because 1 - 1*1 is exactly zero in every precision.
    const atOne = Math.max(...[0.001, 0.01, 0.05, 0.3].map((a) => relD32("stable", 1, a)));
    const offOne = relD32("stable", 0.9999, 0.001);
    ok("!! *** \"THE REWRITE HOLDS AT 1e-7 THROUGHOUT\" IS A ROUGHNESS SWEEP AT cos = 1, AND THE COS AXIS IS WORSE ***",
        atOne < 2e-7 && offOne > 5e-5 && offOne / atOne > 100,
        `at cos = 1 the rewrite is ${atOne.toExponential(2)} across four roughnesses; at cos = 0.9999 it is ${offOne.toExponential(2)}. (1 - c2) is ITSELF a difference of numbers near 1 -- v3494 removed the cancellation in (a^2 - 1) and this is the half that stayed. The claim is true where it was measured; the shader spans the axis it was not`);
    const offOneGpu = Math.abs(R.probe.stable[CELLS.findIndex((x) => x.a === 0.001 && x.c === 0.9999) * 3] - D(fr(0.9999), 0.001)) / D(fr(0.9999), 0.001);
    ok("  and the device confirms that, so it is arithmetic rather than an artefact of the model",
        Math.abs(offOneGpu - offOne) / offOne < 1e-2, `device ${offOneGpu.toExponential(3)} against model ${offOne.toExponential(3)}`);
}

console.log("\n3. THE IDENTITY A FRAGMENT SHADER CANNOT TAKE -- AND WHERE THE MODEL STOPS BEING THE DEVICE");
if (R) {
    const builtin = ALPHAS.map((a) => Math.abs(reduce(R.ndf[`b/${a}`], MODE.ndf) - 1));
    const host = ALPHAS.map((a) => Math.abs(reduce(R.ndf[`h/${a}`], MODE.ndf) - 1));
    report(`INT D(m)(n.m) dm, which must be 1 at every roughness. N = ${N_NDF}, ${LANES} lanes.`);
    ALPHAS.forEach((a, i) => report(`  alpha ${String(a).padEnd(5)} device sin/cos ${reduce(R.ndf[`b/${a}`], MODE.ndf).toFixed(8)}  (residual ${builtin[i].toExponential(2)})   host sin/cos ${reduce(R.ndf[`h/${a}`], MODE.ndf).toFixed(8)}  (residual ${host[i].toExponential(2)})`));

    // DURABLE: the built-in-trig integral is worse at low roughness than at high, on any adapter. That is the
    // shape of the defect and it does not depend on how big the defect is here.
    ok("*** the first key is WORSE at low roughness than at high, using the device's own sin and cos ***",
        builtin[0] > builtin[ALPHAS.length - 1] && builtin[ALPHAS.length - 1] < 1e-4,
        `residual ${builtin[0].toExponential(2)} at alpha ${ALPHAS[0]} against ${builtin[ALPHAS.length - 1].toExponential(2)} at alpha ${ALPHAS[ALPHAS.length - 1]}`);
    // ADAPTER: HOW MUCH worse. SwiftShader is 16%+; a device whose trig is better reads smaller and is not
    // thereby regressing, which is exactly what made this row red on Pascal at 1.87e-4.
    const vLow = held("builtinLow", builtin[0], "min");
    ok(`  ...and by how much is this adapter's own number [${vLow.state}]`,
        vLow.ok,
        `residual ${builtin[0].toExponential(2)} at alpha ${ALPHAS[0]} falling to ${builtin[ALPHAS.length - 1].toExponential(2)} at alpha ${ALPHAS[ALPHAS.length - 1]} -- four orders across the roughness knob`);
    ok("  and it is strictly monotone in roughness, which is what tells it apart from a tolerance question",
        builtin.every((v, i) => i === 0 || v < builtin[i - 1]),
        `${builtin.map((v) => v.toExponential(1)).join(" > ")}. microfacet.mjs's own rule for the strong test, holding here: TOLD APART BY THE TREND, NOT BY WHETHER THE NUMBER IS SMALL. The 4.1e-5 end would pass any band anybody would write`);
    // DURABLE: host trig repairs it -- strictly better at every roughness, on any adapter. Nothing else
    // changes, so the deficit is the transcendental. The RATIO is the adapter's.
    ok("*** and handing the SAME kernel the same grid's sin and cos from the host repairs it ***",
        host.every((v, i) => v <= builtin[i]) && host[0] < builtin[0],
        `worst host-trig residual ${Math.max(...host).toExponential(2)} against ${builtin[0].toExponential(2)} -- same shader, same lanes, same order, same f32 store`);
    const vHost = held("hostRatio", builtin[0] / Math.max(host[0], Number.MIN_VALUE), "min");
    ok(`  ...and the size of the repair is this adapter's own number [${vHost.state}]`,
        vHost.ok && Math.max(...host) < 3e-4,
        `worst host-trig residual ${Math.max(...host).toExponential(2)} against ${builtin[0].toExponential(2)}. Nothing else changed -- same shader, same lanes, same order, same f32 store -- so the deficit is the transcendental and nothing else`);

    const mirror = ALPHAS.map((a) => ndfEmulated(a, { nTheta: N_NDF, laneCount: LANES }));
    const mirrorGap = Math.max(...ALPHAS.map((a, i) => Math.abs(reduce(R.ndf[`h/${a}`], MODE.ndf) - mirror[i])));
    const vMirror = held("mirrorGap", mirrorGap, "max");
    ok(`  and with host trig the device lands on the f32 MIRROR, so the arithmetic port itself is exact [${vMirror.state}]`,
        vMirror.ok,
        `worst gap ${mirrorGap.toExponential(2)} against a Math.fround mirror that models the Float32Array store as well as the arithmetic -- v4405's lesson, kept`);

    // Per-lane, which is the statement the total cannot make: a total can agree by cancellation.
    const lanes = laneMirror(0.05);
    const same = R.ndf["h/0.05"].filter((v, i) => Object.is(v, lanes[i])).length;
    const worstLane = Math.max(...R.ndf["h/0.05"].map((v, i) => (Object.is(v, lanes[i]) ? 0 : Math.abs(v - lanes[i]) / Math.abs(lanes[i]))));
    // The bit-identical COUNT is decided by whether the compiler contracts a multiply-add, which is silicon
    // and driver, not arithmetic: SwiftShader gives 36 of 64 and Pascal 18 of 64. The durable half is that
    // the lanes that are NOT bit-identical are within an ULP or two -- a contracted fma, not a different
    // expression -- and that holds wherever the port is right.
    const vLane = held("laneSame", same, "min");
    ok("  ...and it does so PER LANE, which a total could fake by cancelling",
        worstLane < 5e-6,
        `worst ${worstLane.toExponential(2)} on the lanes that are not bit-identical -- about 1.5 ULP, a contracted multiply-add and not a different expression`);
    ok(`  ...and HOW MANY lanes come back bit-identical is this adapter's own number [${vLane.state}]`,
        vLane.ok,
        `${same} of ${LANES} partial sums bit-identical to the mirror, worst ${worstLane.toExponential(2)} on the rest -- about 1.5 ULP, which is a contracted multiply-add and not a different expression`);

    // DURABLE, and it is the claim worth keeping: whatever this adapter's cos does, it is inside WGSL's own
    // bound. That is conformance and it holds everywhere. The LOWER bound -- "and it is at least 1e-7 off" --
    // was the half that reddened on Pascal at 9.46e-8, because Pascal's cos is BETTER than SwiftShader's and
    // the row demanded it be at least as bad.
    ok(`  and the departure the device shows in cos is INSIDE the specification, so this is conformance and not a bad driver`,
        R.trig.worstCosAbs < TRIG_ABS_ERR,
        `worst |cos_device - cos_true| ${R.trig.worstCosAbs.toExponential(2)} over the grid, against WGSL's bound of 2^-11 = ${TRIG_ABS_ERR.toExponential(2)} ABSOLUTE inside [-PI, PI]. Math.fround cannot express that, because Math.cos is near-correctly-rounded -- so the model silently assumed a transcendental no device promises`);
    const vCos = held("cosAbsMin", R.trig.worstCosAbs, "min");
    ok(`  ...and HOW FAR off this adapter's cos runs is its own number, not a universal [${vCos.state}]`,
        vCos.ok,
        describe(vCos).slice(0, 150));
    const vPole = held("oneMinusC2Min", R.trig.worstOneMinusC2Rel, "min");
    ok(`  and the mechanism is named rather than inferred: (1 - c2) reads too large near the pole [${vPole.state}]`,
        vPole.ok,
        `worst relative error in (1.0 - c2) computed from the device's cos: ${R.trig.worstOneMinusC2Rel.toExponential(2)}x the true value near theta = 0. D goes as 1/t^2, so a t that is 4% large is a D that is 8% small`);
}

console.log("\n4. THE TWO ANALYTIC KEYS AND THE MEASURED CURVE, ON A DEVICE");
if (R) {
    const weak = [];
    for (const a of WEAK_ALPHAS) for (const c of COS_O) weak.push({ a, c, v: reduce(R.furn[`w/${a}/${c}`], MODE.weak) });
    const worstWeak = Math.max(...weak.map((x) => Math.abs(x.v - 1)));
    const cpuWorst = Math.max(...weak.map((x) => Math.abs(furnaceIntegral(x.a, x.c, { N: NQ, M: NQ }) - 1)));
    ok(`*** the weak white furnace holds at every one of ${weak.length} (roughness, view) pairs -- a two-parameter must-not-matter key, on a device ***`,
        worstWeak < 2e-3,
        `worst |INT D G1 /(4|cos_o|) dwi - 1| = ${worstWeak.toExponential(2)} over the full sphere. It holds only if D and G1 are mutually consistent, which is the reason the test exists`);
    ok("  and the residual is the QUADRATURE's, not the device's: the CPU's f64 on the same grid is the same size",
        Math.abs(worstWeak - cpuWorst) / cpuWorst < 0.6,
        `device ${worstWeak.toExponential(2)} against f64 on the identical ${NQ}x${NQ} grid ${cpuWorst.toExponential(2)} -- so this is the grid, and refining it moves both`);
    // The alpha this sweep leaves out, and WHY, proved by refining rather than by widening a band.
    const cw = COARSE_GRIDS.map((n) => Math.abs(reduce(R.furn[`c/${n}`], MODE.weak) - 1));
    const cwCpu = COARSE_GRIDS.map((n) => Math.abs(furnaceIntegral(COARSE_ALPHA, COARSE_COS, { N: n, M: n }) - 1));
    report(`the cell this sweep leaves out, refined: alpha ${COARSE_ALPHA}, cos_o ${COARSE_COS}`);
    COARSE_GRIDS.forEach((n, i) => report(`  ${n}x${n}   device ${cw[i].toExponential(3)}   f64 ${cwCpu[i].toExponential(3)}`));
    ok(`!! and the roughness this sweep LEAVES OUT is excluded by a MEASUREMENT, not by a widened band: the residual falls with the grid`,
        Math.abs(cw[0] - cwCpu[0]) / cwCpu[0] < 0.1 && cw[1] < cw[0] / 10 && cwCpu[1] < cwCpu[0] / 10,
        `at ${COARSE_GRIDS[0]}x${COARSE_GRIDS[0]} the device and f64 agree to ${(Math.abs(cw[0] - cwCpu[0]) / cwCpu[0] * 100).toFixed(1)}%, so the 8.6e-2 belongs to the grid; refining to ${COARSE_GRIDS[1]} drops the device ${(cw[0] / cw[1]).toFixed(0)}x and f64 ${(cwCpu[0] / cwCpu[1]).toFixed(0)}x. A residual that did NOT fall would mean the identity itself was broken`);
    // *** THIS ROW SAID "THE DEVICE DOES NOT FALL AT ALL" AND THAT WAS SwiftShader'S MAGNITUDE WEARING A
    // PROPERTY'S CLOTHES -- THE SEVENTH OF ITS SPECIES IN THIS FILE. *** It asserted cw[2] >= cw[1] * 0.9, and
    // on SwiftShader the device really does stall (1.35e-3 then 1.60e-3, a RISE). Measured on Keith's Intel
    // gen-9 through D3D12: 3.09e-4 then 4.72e-5, a 6.5x FALL -- better trig, so refinement still buys the
    // device something. The row went red FOR THE HARDWARE BEING BETTER, which is the defect this file spent
    // its last round removing six instances of and then shipped a seventh of.
    //
    // What is durable is not "the device stalls" but "refinement buys the device far less than it buys f64",
    // which is what a transcendental floor IS. f64 falls 131x over the same refinement on both boxes; the
    // device falls 0.84x on SwiftShader and 6.5x on gen-9, so an order of magnitude short on both. A device
    // whose sin and cos were exact would fall WITH f64, and that is the thing this row can actually refuse.
    const devFall = cw[1] / cw[2], cpuFall = cwCpu[1] / cwCpu[2];
    // The predicate is NAMED so a fixture can drive it, for the reason section 6 gives about the two dead
    // guards: widening it to `devFall < cpuFall * 10` goes 0 RED on this box, because the case that
    // discriminates is a device whose trig is GOOD ENOUGH TO TRACK f64 and SwiftShader is not one. A row whose
    // refusal cannot be demonstrated where it runs is a row this tree does not count as covered.
    const floorHolds = (dev, cpu) => dev < cpu / 10;
    ok(`  ...and refinement buys the DEVICE an order of magnitude less than it buys f64 -- the transcendental floor section 3 named`,
        floorHolds(devFall, cpuFall) && cwCpu[2] < cwCpu[1] / 100,
        `from ${COARSE_GRIDS[1]} to ${COARSE_GRIDS[2]} f64 falls ${cpuFall.toFixed(0)}x to ${cwCpu[2].toExponential(2)} and the device falls ${devFall.toFixed(2)}x -- ${cw[1].toExponential(2)} then ${cw[2].toExponential(2)}. The estimator converges and the device stops tracking it, which is the signature of a floor rather than of a converging estimator, and the same wall section 3 reached from the other side`);
    // ...and HOW FAR short is this adapter's own number, because that is the part that moved between two boxes.
    // *** THE COUNTERFACTUAL THIS BOX CANNOT PRODUCE, AS A FIXTURE. *** 131x is what f64 buys from the same
    // refinement on both boxes measured so far. 6.5 is Intel gen-9's fall through D3D12 and 0.84 is
    // SwiftShader's -- used here as INPUTS that demonstrate the predicate, not as a reading recorded against
    // either adapter, which is a different thing and is what --record is for.
    ok(`    CONTROL: a device that DID track f64 through the refinement is REFUSED by that same test`,
        !floorHolds(120, 131) && !floorHolds(13.2, 131) && floorHolds(6.5, 131) && floorHolds(0.84, 131),
        `against f64's ${cpuFall.toFixed(0)}x: a device falling 120x is tracking it and must fail, 13.2x is the boundary and must fail, and both boxes measured so far (6.5x, 0.84x) are an order short and must pass`);
    const vFall = held("coarseFall", devFall, "max");
    ok(`    ...and how far short is this adapter's own number [${vFall.state}]`,
        vFall.ok, describe(vFall) + ` -- SwiftShader stalls outright (0.84x, a rise); better trig falls further before it stops`);
    ok("!! *** AND IT HOLDS ON THE SAME BUILT-IN sin AND cos THAT COST THE NDF SIXTEEN PERCENT ***",
        worstWeak < 2e-3,
        `same device, same transcendentals, same kernel. The difference is not the hardware: it is whether the expression SUBTRACTS. The furnace's half-vector comes out of a normalised sum, the NDF's t comes out of 1 - c2`);

    const nojac = reduce(R.furn["nojac"], MODE.weak);
    ok("  and dropping the half-vector Jacobian reads EXACTLY four times too large, a predicted factor with no free parameter",
        Math.abs(nojac / 4 - 1) < 3e-3, `${nojac.toFixed(6)} against 4. The NDF normalisation cannot see this, because there is no 4 in D`);
    const noPi = ALPHAS.slice(2).map((a) => reduce(R.ndf[`p/${a}`], MODE.ndf));
    ok("  and dropping the normalising pi makes the first key read EXACTLY pi",
        noPi.every((v) => Math.abs(v - Math.PI) < 2e-5), `${noPi.map((v) => v.toFixed(7)).join(", ")} against ${Math.PI.toFixed(7)}`);

    const strong = ALPHAS.map((a) => reduce(R.furn[`s/${a}`], MODE.strong));
    report("the strong test, which is a MEASURED CURVE and not a constant: E(wo) at cos_o = 0.7");
    ALPHAS.forEach((a, i) => report(`  alpha ${String(a).padEnd(5)} device ${strong[i].toFixed(7)}   f64 ${furnaceIntegral(a, 0.7, { strong: true, N: NQ, M: NQ }).toFixed(7)}   shortfall ${((1 - strong[i]) * 100).toFixed(2)}%`));
    ok("*** the single-scattering shortfall is monotone in roughness, from under a percent to nearly two thirds ***",
        strong.every((v, i) => i === 0 || v < strong[i - 1]) && 1 - strong[0] < 0.02 && 1 - strong[strong.length - 1] > 0.5,
        `${((1 - strong[0]) * 100).toFixed(2)}% at alpha ${ALPHAS[0]} to ${((1 - strong[strong.length - 1]) * 100).toFixed(1)}% at alpha ${ALPHAS[ALPHAS.length - 1]}. It is the energy multiple scattering would have returned -- not a bug and not a tolerance`);
    const strongGap = Math.max(...ALPHAS.map((a, i) => Math.abs(strong[i] - furnaceIntegral(a, 0.7, { strong: true, N: NQ, M: NQ }))));
    ok("  and the device tracks the CPU's curve, so the shortfall is the model's and not the port's",
        strongGap < 1e-3, `worst gap ${strongGap.toExponential(2)} against f64 on the same grid`);
}

console.log("\n5. THE MISTAKE THE WEAK FURNACE TEST WAS INVENTED TO CATCH, ON A DEVICE");
if (R) {
    const beck = reduce(R.furn["beck"], MODE.weak);
    const clean = reduce(R.furn["w/0.5/0.6"], MODE.weak);
    ok("*** Smith's Lambda for the BECKMANN distribution, used with GGX's D, breaks the weak furnace by ten percent ***",
        Math.abs(beck - 1) > 0.05 && Math.abs(clean - 1) < 2e-3,
        `${beck.toFixed(6)} against ${clean.toFixed(6)} clean, at alpha 0.5, cos_o 0.6. A real function, correctly implemented, belonging to a different microfacet distribution -- and both forms are published beside each other`);
    ok("  and the FIRST key cannot see it at all, which is why the second one exists",
        Math.abs(reduce(R.ndf["h/0.5"], MODE.ndf) - reduce(R.ndf["hbeck/0.5"], MODE.ndf)) === 0,
        "the NDF integral does not call a masking function, so a wrong G1 leaves D normalised and the picture plausible. A tree with only key (1) would ship this");
    const sep = reduce(R.furn["sep"], MODE.strong), strongClean = reduce(R.furn["s/0.5"], MODE.strong);
    ok("  and the separable G2 is measured rather than argued about: it is a different model, not a wrong one",
        Math.abs(sep - strongClean) / strongClean > 1e-3 && Math.abs(sep - strongClean) / strongClean < 5e-2,
        `G1(o)G1(i) reads ${sep.toFixed(6)} against height-correlated ${strongClean.toFixed(6)}, ${(Math.abs(sep - strongClean) / strongClean * 100).toFixed(2)}% apart -- microfacet.mjs says this one is NOT a plant and the number says how much the choice is worth`);
}

console.log("\n6. THE TWO GUARDS THIS QUADRATURE NEVER REACHES, MEASURED RATHER THAN ASSUMED");
{
    // *** TWO SABOTAGES WENT 0 RED AND THIS SECTION IS WHAT THEY EARNED. *** Loosening the shipped tan2 guard
    // from 1e-16 to 1e-30, and the degenerate half-vector cutoff from 1e-9 to 1e-3, both moved NOTHING. A
    // sabotage that goes 0 red is a finding, not a pass -- so the question is whether the checks are blind or
    // the branches are unreachable, and the answer is a number rather than an argument.
    let minAbsCt = Infinity, minHl = Infinity;
    for (const strong of [false, true]) {
        const thMax = strong ? Math.PI / 2 : Math.PI, dth = thMax / NQ, dph = Math.PI / NQ;
        for (const cosO of [...COS_O, 0.7]) {
            const so = Math.sqrt(1 - cosO * cosO);
            for (let i = 0; i < NQ; i++) {
                const th = (i + 0.5) * dth, ct = Math.cos(th), st = Math.sin(th);
                minAbsCt = Math.min(minAbsCt, Math.abs(ct));
                for (let j = 0; j < NQ; j++) {
                    const ph = (j + 0.5) * dph;
                    minHl = Math.min(minHl, Math.hypot(so + st * Math.cos(ph), st * Math.sin(ph), cosO + ct));
                }
            }
        }
    }
    ok("!! the shipped max(c2, 1.0e-16) in ggxLambda is DEAD CODE on this grid, by five orders",
        minAbsCt > 1e-3,
        `the smallest |cos| any Lambda here is handed is ${minAbsCt.toExponential(3)}, and the guard bites below 1e-8. Midpoints never land on theta = pi/2 -- that would need i + 0.5 = N/2. So the guard is untested here and this gate says so rather than counting a 0-red sabotage as coverage`);
    ok("!! and so is the 1.0e-9 degenerate half-vector cutoff, by six",
        minHl > 1e-3,
        `the smallest |wo + wi| the quadrature ever sees is ${minHl.toExponential(3)}. wi = -wo is a single direction and a midpoint grid does not contain it. Reaching either branch needs a fixture built for it, which is a different round`);
}

report("UNCHECKED, and the first two are the ones that matter. WHETHER A REAL CARD'S sin AND cos ARE BETTER THAN " +
       "THIS ONE'S: 2^-11 is a ceiling, most hardware is far under it, and the NDF residual on a discrete GPU is " +
       "an open number this box cannot produce -- what IS established is that the specification permits 0.837. " +
       "WHETHER THE TREE'S SHADERS SHOULD STOP COMPUTING (1 - c2) FROM c: they should, and the repair is a " +
       "round of its own, because every consumer of microfacetShader.js and pathTracerWgsl.mjs would move with " +
       "it. Also unchecked: the SAMPLING half (sampleHalfVector, sampleDirPdf, bounceWeight, misWeight), which " +
       "is not ported here; energy compensation, which is what the strong test's shortfall is FOR; and speed, " +
       "which nothing times, on a software rasteriser where a millisecond would be a fact about a CPU.");

/* -----------------------------------------------------------------------------------------------------------
 * THE DEVICE RUN. One page, one adapter, one module per shader text, and every job dispatched from it.
 * --------------------------------------------------------------------------------------------------------- */
function laneMirror(alpha) {
    const t = trigTable(N_NDF), out = new Float32Array(LANES), dth = fr(fr(fr(Math.PI) / 2) / fr(N_NDF));
    for (let lane = 0; lane < LANES; lane++) {
        let s = 0;
        for (let i = lane; i < N_NDF; i += LANES) {
            const c = t[i * 2 + 1], st = t[i * 2];
            s = fr(s + fr(fr(fr(dEmulated(c, alpha)) * c) * fr(st * dth)));
        }
        out[lane] = s;
    }
    return out;
}

async function run() {
    const P = (o) => [...new Uint8Array(packParams({ laneCount: LANES, ...o }).buf)];
    const ndfJobs = [], furnJobs = [];
    for (const a of ALPHAS) {
        ndfJobs.push({ key: `b/${a}`, shader: "stable", pack: P({ mode: MODE.ndf, nTheta: N_NDF, hostTrig: 0, alpha: a }) });
        ndfJobs.push({ key: `h/${a}`, shader: "stable", pack: P({ mode: MODE.ndf, nTheta: N_NDF, hostTrig: 1, alpha: a }) });
    }
    ndfJobs.push({ key: "hbeck/0.5", shader: "stable", pack: P({ mode: MODE.ndf, nTheta: N_NDF, hostTrig: 1, alpha: 0.5, faults: FAULT.beckmann }) });
    for (const a of ALPHAS.slice(2)) ndfJobs.push({ key: `p/${a}`, shader: "noPi", pack: P({ mode: MODE.ndf, nTheta: N_NDF, hostTrig: 1, alpha: a }) });
    for (const a of WEAK_ALPHAS) for (const c of COS_O) furnJobs.push({ key: `w/${a}/${c}`, shader: "stable", pack: P({ mode: MODE.weak, nTheta: NQ, nPhi: NQ, alpha: a, cosO: c }) });
    for (const a of ALPHAS) furnJobs.push({ key: `s/${a}`, shader: "stable", pack: P({ mode: MODE.strong, nTheta: NQ, nPhi: NQ, alpha: a, cosO: 0.7 }) });
    for (const n of COARSE_GRIDS) furnJobs.push({ key: `c/${n}`, shader: "stable", pack: P({ mode: MODE.weak, nTheta: n, nPhi: n, alpha: COARSE_ALPHA, cosO: COARSE_COS }) });
    furnJobs.push({ key: "beck", shader: "stable", pack: P({ mode: MODE.weak, nTheta: NQ, nPhi: NQ, alpha: 0.5, cosO: 0.6, faults: FAULT.beckmann }) });
    furnJobs.push({ key: "nojac", shader: "stable", pack: P({ mode: MODE.weak, nTheta: NQ, nPhi: NQ, alpha: 0.5, cosO: 0.6, faults: FAULT.noJacobian }) });
    furnJobs.push({ key: "sep", shader: "stable", pack: P({ mode: MODE.strong, nTheta: NQ, nPhi: NQ, alpha: 0.5, cosO: 0.7, faults: FAULT.separable }) });

    const cellIn = new Float32Array(CELLS.length * 3);
    CELLS.forEach((x, k) => { cellIn[k * 3] = x.c; cellIn[k * 3 + 1] = x.a; });

    const r = await runInEngineOrigin({ engineRoot: ENG, timeoutMs: 120000, args: {
        LANES, N_NDF, cells: CELLS.length, cellIn: [...cellIn], trig: [...trigTable(N_NDF)],
        ndfJobs, furnJobs, probePack: P({ mode: MODE.ndf }), trigPack: P({ mode: MODE.ndf, nTheta: N_NDF }),
        shaders: { stable: buildWgsl(), textbook: buildWgsl({ textbook: true }), noPi: buildWgsl({ noPi: true }) },
    }, script: `async (a) => {
        const out = { probe: {}, ndf: {}, furn: {}, trig: null, compileErrors: [], adapter: null };
        try {
            if (!navigator.gpu) throw new Error("no navigator.gpu in this page");
            const adapter = await navigator.gpu.requestAdapter(); if (!adapter) throw new Error("no adapter");
            // WHICH adapter, reported rather than assumed: every number below is a reading OF THIS ONE, and
            // until v4646 this gate had no way to say which -- so its frozen numbers read as universal.
            try { const i = adapter.info || {}; out.adapter = { vendor: i.vendor || null, architecture: i.architecture || null }; }
            catch (e) { out.adapter = null; }
            const dev = await adapter.requestDevice();
            const mods = {};
            for (const [k, src] of Object.entries(a.shaders)) {
                const m = dev.createShaderModule({ code: src });
                const info = await m.getCompilationInfo?.();
                for (const msg of (info ? info.messages : [])) if (msg.type === "error") out.compileErrors.push(k + " line " + msg.lineNum + ": " + msg.message.slice(0, 160));
                mods[k] = m;
            }
            if (out.compileErrors.length) return out;
            const trigBuf = dev.createBuffer({ size: a.N_NDF * 2 * 4, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
            dev.queue.writeBuffer(trigBuf, 0, new Float32Array(a.trig));

            const run = (pipe, pack, bytes, seed, withTrig) => {
                const uni = dev.createBuffer({ size: 32, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
                dev.queue.writeBuffer(uni, 0, new Uint8Array(pack));
                const pb = dev.createBuffer({ size: bytes, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST });
                if (seed) dev.queue.writeBuffer(pb, 0, new Float32Array(seed));
                const entries = [{ binding: 0, resource: { buffer: uni } }, { binding: 1, resource: { buffer: pb } }];
                if (withTrig) entries.push({ binding: 2, resource: { buffer: trigBuf } });
                const bg = dev.createBindGroup({ layout: pipe.getBindGroupLayout(0), entries });
                const enc = dev.createCommandEncoder(); const p = enc.beginComputePass();
                p.setPipeline(pipe); p.setBindGroup(0, bg); p.dispatchWorkgroups(Math.ceil(bytes / 4 / 64) || 1); p.end();
                const rb = dev.createBuffer({ size: bytes, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
                enc.copyBufferToBuffer(pb, 0, rb, 0, bytes); dev.queue.submit([enc.finish()]);
                return rb.mapAsync(GPUMapMode.READ).then(() => { const v = [...new Float32Array(rb.getMappedRange().slice(0))]; rb.unmap(); rb.destroy(); pb.destroy(); uni.destroy(); return v; });
            };
            const pipeOf = {};
            const P2 = (k, ep) => (pipeOf[k + "|" + ep] ||= dev.createComputePipeline({ layout: "auto", compute: { module: mods[k], entryPoint: ep } }));

            for (const k of ["stable", "textbook"]) out.probe[k] = await run(P2(k, "probe"), a.probePack, a.cells * 3 * 4, a.cellIn, false);
            for (const j of a.ndfJobs)  out.ndf[j.key]  = await run(P2(j.shader, "integrate"), j.pack, a.LANES * 4, null, true);
            for (const j of a.furnJobs) out.furn[j.key] = await run(P2(j.shader, "integrate"), j.pack, a.LANES * 4, null, true);

            // What the device's own sin and cos actually are on the theta grid, read back rather than assumed.
            out.trigRaw = await run(P2("stable", "trigProbe"), a.trigPack, a.LANES * 2 * 4, null, false);
        } catch (e) { out.error = String(e && e.message || e).slice(0, 600); }
        return out;
    }` });

    ok("*** the microfacet lobe COMPILES AND RUNS on a device -- render/microfacetShader.js has never done so since v3494 ***",
        r.ok && r.result && !r.result.error && (r.result.compileErrors || []).length === 0,
        r.ok ? (r.result && r.result.error) || ((r.result && r.result.compileErrors || []).join("; ") || "three lobe functions, two entry points, three shader texts") : (r.reason || (r.pageErrors || []).join("; ")));
    if (!r.ok || !r.result || r.result.error || (r.result.compileErrors || []).length) return null;

    const dth = fr(fr(fr(Math.PI) / 2) / fr(N_NDF));
    let worstCosAbs = 0, worstOneMinusC2Rel = 0;
    for (let k = 0; k < 64; k++) {
        const th = fr(fr(fr(k) + 0.5) * dth);
        const cd = r.result.trigRaw[k * 2 + 1], ct = Math.cos(th);
        worstCosAbs = Math.max(worstCosAbs, Math.abs(cd - ct));
        const trueOMC = Math.sin(th) ** 2, devOMC = fr(1 - fr(cd * cd));
        if (trueOMC > 0) worstOneMinusC2Rel = Math.max(worstOneMinusC2Rel, Math.abs(devOMC - trueOMC) / trueOMC);
    }
    return { ...r.result, trig: { worstCosAbs, worstOneMinusC2Rel } };
}

console.log(fails ? `\n${fails} FAILURE(S)` : "\nALL GREEN");
// *** THE OWED POPULATION, AS A NUMBER, BECAUSE A ROW NOBODY READS MEASURES NOTHING. ***
// Every magnitude row above is HELD against this adapter's reading or OWED for want of one. A run that is
// entirely OWED is a run that asserted nothing about the silicon it just used, and that has to be visible in
// one line rather than inferred by counting brackets.
if (R) {
    const c = owedCount(VERDICTS);
    report(c.owed === 0
        ? `adapter ${AKEY}: all ${c.of} magnitude readings HELD against the record on file.`
        : `adapter ${AKEY}: ${c.owed} of ${c.of} magnitude readings are OWED -- this adapter has no reading on ` +
          `file, so those rows measured and reported rather than asserted. The durable rows (host trig repairs ` +
          `the integral, cos inside WGSL's 2^-11 bound, the non-identical lanes within an ULP) still held. ` +
          `Re-run with --record ON THAT BOX to write them; do not type them in from this output.`);

    // *** --record, AND IT RUNS AFTER EVERY ROW HAS ALREADY REPORTED. *** A gate that writes its record before
    // it finishes is a gate that grades the file it just wrote, which is the 2026-09-03 fault sweepCoverage.mjs
    // is built around. Nothing above reads adapter-readings.json a second time, so the write cannot change this
    // run's verdicts -- it changes the NEXT run's, on this same adapter, which is the whole point.
    if (process.argv.includes("--record")) {
        const owed = VERDICTS.filter((v) => v.state === "OWED" && Number.isFinite(v.measured));
        if (!owed.length) {
            report(`--record: nothing OWED for ${AKEY} -- every reading is already HELD, and --record never touches one.`);
        } else {
            const values = {};
            for (const v of owed) values[v.name] = boundFrom(v.dir, v.measured);
            const r = recordReading(GATE, AKEY, values, { frozen: DEVICE_AT_V4646 });
            report(r.wrote
                ? `--record: WROTE ${owed.length} reading(s) for ${AKEY} into ${READINGS_PATH} at the ` +
                  `${SLACK}x slack convention -- ${owed.map((v) => `${v.name} ${v.measured.toPrecision(4)} -> ${boundFrom(v.dir, v.measured).toPrecision(4)} (${v.dir})`).join(", ")}. ` +
                  `Commit that file FROM THIS BOX: it is the reading, and a retyped one is not.`
                : `--record: REFUSED -- ${r.why}`);
        }
    } else if (c.owed > 0) {
        report(`--record is how ${c.owed} OWED reading(s) stop being owed, and it is not on: nothing was written.`);
    }
}
process.exit(fails ? 1 : 0);

/* -----------------------------------------------------------------------------------------------------------
 * SABOTAGE LOG -- 19 / 4 / 3 / 6 by name, and TWO that went 0 red and earned section 6.
 *
 * A. select()'s arms swapped in `ternary` (`select(then, els, cond)`).                            19 RED
 *    The exact translation risk this module's header names, and the FIXTURE catches it first: section 1's 7/9
 *    check is red before anything reaches a device. That is the ordering the round is built on -- an
 *    unverified translator would have made every device number below a statement about the translator.
 *
 * B. `P.hostTrig == 1u` changed to `== 2u`, so the host's sine and cosine are computed, uploaded,
 *    bound, and then silently ignored.                                                             4 RED
 *    *** THIS IS THE ONE THAT TESTS THE ROUND'S DIAGNOSIS. *** Section 3's whole argument is that the 16%
 *    deficit is the transcendental, proved by a repair that changes nothing else. If the repair is not a
 *    repair, three of the four claims that carry the diagnosis go red and the noPi identity goes with them.
 *    The 16% claim itself STAYS GREEN, correctly: it never depended on the repair.
 *
 * C. `plantedGlsl`'s textbook replace made a no-op (`replace(stable, stable)`).                     3 RED
 *    FRAG_SRC_GGX_NAIVE's own stated hazard. The one-line-difference assertion goes red, and so does the
 *    v3494 comparison -- because a plant equal to the clean text reports a comfortable zero, which is the
 *    failure mode that would otherwise look like agreement.
 *
 * D. The weak furnace masked with G2 instead of G1.                                                6 RED
 *    Not an invented fault: it is the confusion the weak and strong tests exist to separate. The weak key
 *    leaves 1, the refinement floor moves, the beckmann plant stops being distinguishable -- and the NDF
 *    stays green throughout, which is the same blindness section 5 states.
 *
 * E. The shipped `max(c2, 1.0e-16)` in ggxLambda loosened to 1.0e-30.                               0 RED
 * F. The degenerate half-vector cutoff `hl >= 1.0e-9` loosened to 1.0e-3.                           0 RED
 *    *** A SABOTAGE THAT GOES 0 RED IS A FINDING, NOT A PASS. *** Both branches are UNREACHABLE on a midpoint
 *    grid: the smallest |cos| any Lambda is handed is 3.93e-3 against a guard at 1e-8, and the smallest
 *    |wo + wi| is 5.09e-3 against a cutoff at 1e-9 -- five and six orders of clearance. Section 6 now
 *    measures both rather than leaving two dead branches looking covered.
 * --------------------------------------------------------------------------------------------------------- */
