#!/usr/bin/env node
// WebGLEngine/physics/render/microfacetSampleWgsl-selfcheck.mjs -- v4409
//
// *** THE SAMPLING HALF OF THE BSDF ON A DEVICE -- AND IT IS A BETTER INSTRUMENT THAN v4408's QUADRATURE AT
// THE ROUGHNESS WHERE THE QUADRATURE IS 49% WRONG. ***
//
// v4408 put the LOBE on a device and closed by naming what it had not carried: "the SAMPLING half
// (sampleHalfVector, sampleDirPdf, bounceWeight, misWeight), which is not ported here". This is that half, and
// it is graded on three keys that need no tolerance invented for them.
//
// ---- THE PORT IS A DIFFERENT KIND FROM v4408's, AND SECTION 1 SAYS SO BEFORE ANYTHING ELSE ---------------------
//
// v4408's WGSL was TRANSLATED from render/microfacetShader.js's shipped GLSL, so an agreement was a statement
// about the shipped shader. There is no shipped GLSL for a sampler -- a fragment shader evaluates a lobe, it
// does not choose a direction -- so everything below the lobe here is a NEW transcription of microfacet.mjs's
// JavaScript. The lobe itself is still v4408's, COMPOSED rather than copied (`lobeWgsl`), and section 1 proves
// that composition rather than assuming it. A transcription cannot be graded by textual identity. Hence keys.
//
// ---- KEY 1: AN ALGEBRAIC IDENTITY, WITH NO FREE PARAMETER AND NO STATISTICS -----------------------------------
//
//     f cos_i / pdf = [D G2 F / (4 cos_o cos_i)] cos_i [4 |wo.wh| / (D cos_h)] = F G2 |wo.wh| / (cos_o cos_h)
//
// microfacet.mjs asserts that cancellation in a comment and ships only the right-hand side. Both sides are
// computable, so this computes BOTH and subtracts, per direction, with no averaging anywhere. At f64 the two
// routes agree to 4.7e-16 over ten thousand directions; at f32 on the device they agree to 3.0e-7, and the
// difference is TWO ROUNDINGS -- the long route computes D and divides it out, which the short route never
// pays. That is a measurement of the cancellation's worth, not a tolerance on it.
//
// ---- KEY 2: THE MIRROR LIMIT, WHICH IS WHERE THE TWO INSTRUMENTS PART COMPANY ---------------------------------
//
// As alpha -> 0 the NDF concentrates on the normal: every sample returns wh = n, wi is the mirror of wo, and
// the weight collapses to G2(cos_o, cos_o) = 1/(1 + 2 Lambda(cos_o)) with no dependence on the sample. *** THE
// ESTIMATOR HAS ZERO VARIANCE THERE, so its answer is a closed form and the device's number is a statement
// about arithmetic with nothing to hide behind. *** It lands on that constant to 5.4e-8 at three view angles.
//
// *** AND v4408's QUADRATURE READS 0.512 AT THE SAME POINT. *** A 500x500 grid cannot resolve a lobe of width
// 0.001 -- it is 49% low, and needs 1500x1500 to reach 0.982. v4408 shipped that curve and this round is the
// one that can say where it stops being trustworthy. Where the quadrature IS converged the two agree, and that
// agreement is the cross-check that makes both believable.
//
// ---- KEY 3: WHAT THIS ESTIMATOR IS BLIND TO, WHICH COMPLETES v4408's PARTITION ---------------------------------
//
//     the NDF integral (v4408)   sees D          blind to G
//     the weak furnace (v4408)   sees D and G1 together
//     this estimator             blind to D      sees G2
//
// microfacet.mjs states the blindness -- "a wrong D is INVISIBLE to this weight" -- and it is measured here
// rather than asserted: scaling D by pi leaves the estimator BIT-IDENTICAL at every roughness, and leaves the
// LONG route unmoved too, because D appears once in the numerator and once in the pdf.
//
// SABOTAGES: see the log at the foot of this file.
//
// Run: node physics/render/microfacetSampleWgsl-selfcheck.mjs   (exit 0 all-pass, 1 on any fail; SKIP fails)
"use strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInEngineOrigin, webgpuSkipReason } from "../../tools/ship/webgpuHarness.mjs";
import { buildSampleWgsl, packSampleParams, meanOf, mirrorLimit, estimateEmulated,
         MODE, FAULT, REPAIR } from "./microfacetSampleWgsl.mjs";
import { lobeWgsl, FAULT as LOBE_FAULT } from "./microfacetWgsl.mjs";
import { sampleHalfVector, bounceWeight, bsdfEval, sampleDirPdf, misWeight, furnaceIntegral }
    from "./microfacet.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const report = (s) => console.log(`  ----  ${s}`);
const fr = Math.fround;

const LANES = 64, NS = 128, IDN = 4096, IDS = 64;
const ALPHAS = [0.001, 0.01, 0.05, 0.25, 0.5, 1.0];
const COS_O = [0.95, 0.7, 0.3];
const TINY = 0.001;                 // where the mirror limit is the answer and the quadrature is not
const QUAD_N = 500;                 // v4408's own grid, so the comparison is with what that round shipped
const MIS_PAIRS = 4096;

/** The CPU estimator on the identical stratified grid: same u1, u2, same order. No RNG on either side. */
function* strata(n) { for (let k = 0; k < n * n; k++) yield [(Math.floor(k / n) + 0.5) / n, (k % n + 0.5) / n]; }
function estimate64(alpha, cosO, n, opts = {}) {
    const so = Math.sqrt(1 - cosO * cosO), wo = [so, cosO, 0];
    let s = 0;
    for (const [u1, u2] of strata(n)) {
        const wh = sampleHalfVector(u1, u2, alpha);
        const d = wo[0] * wh[0] + wo[1] * wh[1] + wo[2] * wh[2];
        const wi = [2 * d * wh[0] - wo[0], 2 * d * wh[1] - wo[1], 2 * d * wh[2] - wo[2]];
        s += bounceWeight(cosO, wi[1], wh[1], d, alpha, opts);
    }
    return s / (n * n);
}

console.log("\n1. THE LOBE IS COMPOSED RATHER THAN COPIED, AND THE SAMPLING HALF IS A TRANSCRIPTION -- SAID FIRST");
{
    const wgsl = buildSampleWgsl();
    ok("*** the three lobe functions in this kernel are v4408's, character for character, not a second translation ***",
        wgsl.includes(lobeWgsl()),
        "microfacetWgsl.lobeWgsl() is spliced in whole. A lobe copied for this file could have drifted from the one v4408 graded, and every number below would then be about a different D");
    ok("  and through it, still render/microfacetShader.js's own shipped GLSL text",
        wgsl.includes("let t : f32 = (1.0 - c2) + a2 * c2;") && wgsl.includes("(-1.0 + sqrt(1.0 + a * a * tan2)) / 2.0"),
        "the composition does not break the chain back to the shipped shader that v4408 established");
    ok("!! and the fault bits mean the SAME thing in both kernels, which a second enum would not guarantee",
        FAULT.separable === LOBE_FAULT.separable && FAULT.beckmann === LOBE_FAULT.beckmann,
        `separable ${FAULT.separable}, beckmann ${FAULT.beckmann} -- read out of microfacetWgsl.mjs rather than retyped, because the lobe's own g2() reads those bits and a divergent numbering would silently plant the wrong fault`);

    // *** THE DEFAULT MUST BE microfacet.mjs's FORM, NOT THE BETTER ONE. *** A port that quietly improves the
    // thing it is porting cannot be compared with it, and section 5's whole measurement depends on this.
    ok("*** and the sampler ships microfacet.mjs's OWN cdf denominator by default, not the better one ***",
        wgsl.includes("let denShipped = u1 * (a2 - 1.0) + 1.0;") && wgsl.includes("let denStable  = (1.0 - u1) + u1 * a2;"),
        "u1 * (a2 - 1) + 1 is what that file writes. A port that silently improved it would make section 5 unmeasurable and would be a second declaration wearing the first one's name");
    ok("  and the two forms are the same number in exact arithmetic, which is why neither is a fault",
        [0.1, 0.5, 0.9, 0.999].every((u) => Math.abs((u * (0.25 - 1) + 1) - ((1 - u) + u * 0.25)) < 1e-15),
        "at alpha 0.5 over four u1. The difference below is entirely binary32's");
}

console.log("\n2. KEY 1 -- THE ALGEBRAIC IDENTITY, AT f64 FIRST AND THEN ON A DEVICE");
const cpuIdentity = (() => {
    let worst = 0, n = 0;
    for (const a of [0.01, 0.05, 0.25, 1.0]) for (const cosO of COS_O) {
        const so = Math.sqrt(1 - cosO * cosO), wo = [so, cosO, 0];
        for (const [u1, u2] of strata(IDS)) {
            const wh = sampleHalfVector(u1, u2, a);
            const d = wo[0] * wh[0] + wo[1] * wh[1] + wo[2] * wh[2];
            const cosI = 2 * d * wh[1] - cosO;
            if (cosI <= 0 || d <= 0) continue;
            const pdf = sampleDirPdf(wh[1], d, a);
            if (!(pdf > 0)) continue;
            const long = bsdfEval(cosO, cosI, wh[1], a) * cosI / pdf, short = bounceWeight(cosO, cosI, wh[1], d, a);
            if (short > 0) { worst = Math.max(worst, Math.abs(long - short) / short); n++; }
        }
    }
    return { worst, n };
})();
ok("*** the cancellation microfacet.mjs asserts in a comment is COMPUTED here, both sides, and it holds at f64 ***",
    cpuIdentity.worst < 1e-14,
    `worst |f cos_i / pdf - F G2 |wo.wh| / (cos_o cos_h)| / short = ${cpuIdentity.worst.toExponential(3)} over ${cpuIdentity.n} directions. D DISAPPEARS -- that is the reason importance-sampling the NDF is worth doing, and it had never been checked against the long route`);

const skip = webgpuSkipReason();
if (skip) ok("a device is reachable", false, `SKIP: ${skip} -- a skip counts as a failure here; the whole round is the device`);
const R = skip ? null : await run();

if (R) {
    const idn = (key, tag = "clean") => {
        const v = R[tag][key]; let worst = 0, n = 0;
        for (let k = 0; k < IDN; k++) {
            if (v[k * 3 + 2] !== 1) continue;
            const s = v[k * 3], l = v[k * 3 + 1];
            if (!(s > 0)) continue;
            worst = Math.max(worst, Math.abs(l - s) / s); n++;
        }
        return { worst, n };
    };
    const dev = [0.05, 0.25, 1.0].map((a) => ({ a, ...idn(`i/${a}`) }));
    report("the same identity at binary32, per direction, no averaging:");
    dev.forEach((d) => report(`  alpha ${String(d.a).padEnd(5)} ${d.n} usable directions of ${IDN}   worst gap ${d.worst.toExponential(3)}`));
    ok("*** and on a device it holds to 3e-7 -- SEVEN ORDERS worse than f64, which is the price of the long route ***",
        dev.every((d) => d.worst < 1e-6 && d.worst > 1e-8),
        `worst ${Math.max(...dev.map((d) => d.worst)).toExponential(3)}. The long route computes D and then divides it out; the short route never computes it. Two roundings, about two ULP, and that is the WHOLE difference -- so the transcription of both routes is right`);
    ok("  and the usable fraction falls with roughness, which is the geometry and not a defect",
        dev[0].n > dev[2].n * 1.5,
        `${dev.map((d) => `alpha ${d.a}: ${d.n}`).join(", ")}. A wide lobe reflects a larger share of its samples below the horizon, where the BSDF is zero by definition`);
}

console.log("\n3. KEY 2 -- THE MIRROR LIMIT, AND THE POINT WHERE v4408's QUADRATURE IS 49% WRONG");
if (R) {
    const tiny = COS_O.map((c) => ({ c, d: meanOf(R.clean[`e/${TINY}/${c}`], NS), lim: mirrorLimit(TINY, c) }));
    report(`alpha ${TINY}: the NDF has collapsed onto the normal, so every sample returns the same weight`);
    tiny.forEach((t) => report(`  cos_o ${String(t.c).padEnd(5)} device ${t.d.toFixed(9)}   1/(1 + 2 Lambda) ${t.lim.toFixed(9)}   rel ${(Math.abs(t.d - t.lim) / t.lim).toExponential(2)}`));
    ok("*** the estimator lands on a CLOSED FORM at three view angles, with zero variance to hide behind ***",
        tiny.every((t) => Math.abs(t.d - t.lim) / t.lim < 2e-7),
        `worst ${Math.max(...tiny.map((t) => Math.abs(t.d - t.lim) / t.lim)).toExponential(2)}. No tolerance is invented for this: as alpha -> 0 the weight is G2(cos_o, cos_o) for EVERY sample, so the spread is nil and what is left is arithmetic`);
    const cpuTiny = Math.max(...COS_O.map((c) => Math.abs(estimate64(TINY, c, NS) - mirrorLimit(TINY, c)) / mirrorLimit(TINY, c)));
    ok("  and the f64 estimator is two orders closer, so the device's number IS the arithmetic and not the estimator",
        cpuTiny < Math.max(...tiny.map((t) => Math.abs(t.d - t.lim) / t.lim)) / 10,
        `f64 worst ${cpuTiny.toExponential(2)} against the device's ${Math.max(...tiny.map((t) => Math.abs(t.d - t.lim) / t.lim)).toExponential(2)} -- the same strata, the same order, the same code path`);

    const q = furnaceIntegral(TINY, 0.7, { strong: true, N: QUAD_N, M: QUAD_N });
    ok("!! *** AND v4408's QUADRATURE IS 49% LOW AT THE SAME POINT, WHICH IS THE ROUND'S REASON TO EXIST ***",
        Math.abs(q - mirrorLimit(TINY, 0.7)) / mirrorLimit(TINY, 0.7) > 0.4,
        `${QUAD_N}x${QUAD_N} reads ${q.toFixed(6)} where the answer is ${mirrorLimit(TINY, 0.7).toFixed(6)}. A midpoint grid with steps of pi/${QUAD_N} cannot resolve a lobe of width ${TINY}; it needs 1500x1500 to reach 0.982. THE TWO INSTRUMENTS ARE NOT INTERCHANGEABLE and this is which one to believe where`);

    const both = ALPHAS.filter((a) => a >= 0.25).map((a) => ({
        a, d: meanOf(R.clean[`e/${a}/0.7`], NS), q: furnaceIntegral(a, 0.7, { strong: true, N: QUAD_N, M: QUAD_N }),
    }));
    report("and where the quadrature IS converged, the two instruments cross-check each other:");
    both.forEach((b) => report(`  alpha ${String(b.a).padEnd(5)} sampler ${b.d.toFixed(7)}   quadrature ${b.q.toFixed(7)}   rel ${(Math.abs(b.d - b.q) / b.q).toExponential(2)}`));
    ok("*** two methods with nothing in common but the model agree at every converged roughness ***",
        both.every((b) => Math.abs(b.d - b.q) / b.q < 1e-3),
        `worst ${Math.max(...both.map((b) => Math.abs(b.d - b.q) / b.q)).toExponential(2)}. One is a deterministic grid over the hemisphere, the other importance-samples the NDF and divides by the pdf. They share D, G2 and nothing else -- a transcription error in either would not survive this`);

    const mir = ALPHAS.map((a) => Math.abs(meanOf(R.clean[`e/${a}/0.7`], NS) - estimateEmulated(a, 0.7, { nStrat: NS, laneCount: LANES })));
    ok("  and the device tracks the f32 MIRROR, so the port's arithmetic is the model's",
        Math.max(...mir) < 2e-5,
        `worst gap ${Math.max(...mir).toExponential(2)} against a Math.fround mirror that models the Float32Array partials as well as the arithmetic. Not bit-identical -- WGSL may contract a multiply-add and dot() is one -- and the gap is reported rather than wished away`);
}

console.log("\n4. KEY 3 -- WHAT THIS ESTIMATOR IS BLIND TO, WHICH COMPLETES v4408's PARTITION");
if (R) {
    const same = ALPHAS.filter((a) => meanOf(R.clean[`e/${a}/0.7`], NS) === meanOf(R.noPi[`e/${a}/0.7`], NS));
    ok("*** scaling D by pi leaves the estimator BIT-IDENTICAL at every roughness -- the blindness measured, not asserted ***",
        same.length === ALPHAS.length,
        `${same.length} of ${ALPHAS.length} roughnesses identical to the last bit. microfacet.mjs says "a wrong D is INVISIBLE to this weight and must be graded by the integrals in this file instead"; v4408 measured that the NDF integral reads exactly pi under the same plant, so the two rounds together SPLIT the model rather than each half-covering it`);
    const lp = [0.05, 0.25, 1.0].map((a) => {
        const c = R.clean[`i/${a}`], p = R.noPi[`i/${a}`];
        let w = 0;
        for (let k = 0; k < IDN; k++) { if (p[k * 3 + 2] !== 1 || !(p[k * 3] > 0)) continue; w = Math.max(w, Math.abs(p[k * 3 + 1] - p[k * 3]) / p[k * 3]); }
        return w;
    });
    ok("  and the LONG route is blind too, which is the sharper statement: D appears in the pdf as well",
        Math.max(...lp) < 1e-6,
        `worst identity gap under the noPi plant ${Math.max(...lp).toExponential(3)}, indistinguishable from the clean run. Computing D wrongly and then dividing by a pdf that is wrong the same way still gives the right weight -- so NEITHER route can grade D`);

    const clean = meanOf(R.clean["e/0.5/0.7"], NS);
    const rows = [["wrongPdf", FAULT.wrongPdf], ["separable", FAULT.separable], ["beckmann", FAULT.beckmann]]
        .map(([n]) => ({ n, v: meanOf(R.clean[`f/${n}`], NS) }));
    report("but it is NOT blind to the masking function, which is the half v4408's first key could not see:");
    rows.forEach((r) => report(`  ${r.n.padEnd(10)} ${r.v.toFixed(7)}   clean ${clean.toFixed(7)}   ${((r.v / clean - 1) * 100).toFixed(2)}%`));
    ok("*** so the estimator sees G2 where the NDF integral cannot, and the two keys together cover the model ***",
        rows.every((r) => Math.abs(r.v / clean - 1) > 5e-3) && Math.abs(rows[0].v / clean - 1) > 0.2,
        `all three named faults move it, wrongPdf by ${((rows[0].v / clean - 1) * 100).toFixed(0)}%. A tree holding only v4408's NDF key would ship every one of these`);
}

console.log("\n5. THE CANCELLATION microfacet.mjs's SAMPLER CARRIES -- AND THE NUMBER THAT SAYS IT DOES NOT BITE");
{
    // *** THE SAME SHAPE v3494 REWROTE IN D, IN THE SAME FILE, UNTOUCHED -- because that round was looking at D.
    const cdfErr = (u1, a) => {
        const a2 = fr(fr(a) * fr(a)), u = fr(u1);
        const exact = Math.sqrt((1 - u) / ((1 - u) + u * a2));
        const t = fr(Math.sqrt(fr(fr(1 - u) / fr(fr(u * fr(a2 - 1)) + 1))));
        const s = fr(Math.sqrt(fr(fr(1 - u) / fr(fr(1 - u) + fr(u * a2)))));
        return { t: Math.abs(t - exact) / exact, s: Math.abs(s - exact) / exact };
    };
    const tail = cdfErr(0.999999, 0.001);
    ok("!! *** microfacet.mjs's cdf inverse carries THE EXACT CANCELLATION v3494 REMOVED FROM D, un-rewritten ***",
        tail.t > 1e-3 && tail.s < 1e-7 && tail.t / tail.s > 1e4,
        `u1 * (a2 - 1) + 1 is ${tail.t.toExponential(3)} out in cos_h at alpha 0.001, u1 0.999999; (1 - u1) + u1 * a2 is ${tail.s.toExponential(3)}. FIVE ORDERS, the same shape and the same size as the denominator v3494 rewrote -- in the same file, missed because that round was looking at D`);
    if (R) {
        const moved = ALPHAS.map((a) => {
            const s = meanOf(R.clean[`e/${a}/0.7`], NS), r = meanOf(R.clean[`r/${a}`], NS);
            return Math.abs(r - s) / s;
        });
        report("and what it costs the estimator, which is the question that decides whether to repair it:");
        ALPHAS.forEach((a, i) => report(`  alpha ${String(a).padEnd(5)} shipped ${meanOf(R.clean[`e/${a}/0.7`], NS).toFixed(9)}   rewritten ${meanOf(R.clean[`r/${a}`], NS).toFixed(9)}   rel ${moved[i].toExponential(2)}`));
        ok("*** AND IT DOES NOT BITE: the rewrite moves the estimator by 1e-8, five orders below what it moves cos_h ***",
            Math.max(...moved) < 1e-7,
            `worst ${Math.max(...moved).toExponential(2)}, and exactly 0 at the three roughest. The corrupted samples live where u1 -> 1, they are a vanishing fraction of a stratified grid, and the weight they carry is smooth -- so this is a LATENT HAZARD, named with a number, and not a defect. Repairing it here would have been a change nobody could justify from a measurement`);
        ok("  ...and the hazard is real rather than theoretical, which is why it is left reachable behind a bit",
            REPAIR.stableCdf !== 0 && Object.values(FAULT).every((b) => (b & REPAIR.stableCdf) === 0),
            `REPAIR.stableCdf = ${REPAIR.stableCdf}, disjoint from every fault bit. A consumer that samples NON-uniformly in u1 -- adaptive, or a low-discrepancy sequence that clusters near 1 -- would meet the 3.28e-3, and the rewrite is one bit away`);
    }
}

console.log("\n6. THE BALANCE HEURISTIC IS NOT EXACTLY ONE, AND NOT BECAUSE OF THE DEVICE");
if (R) {
    const v = R.clean.mis;
    let bad = 0, worst = 0;
    for (let k = 0; k < MIS_PAIRS; k++) { const s = v[k * 3 + 2]; if (s !== 1) { bad++; worst = Math.max(worst, Math.abs(s - 1)); } }
    let bad64 = 0;
    for (let k = 0; k < MIS_PAIRS; k++) {
        const pa = (k % 97) + 1, pb = ((k * 7) % 89) + 1;
        if (misWeight(pa / 7.3, pb / 11.7) + misWeight(pb / 11.7, pa / 7.3) !== 1) bad64++;
    }
    report(`p/(p+q) + q/(p+q) over ${MIS_PAIRS} pairs: ${bad} not exactly 1 on the device, ${bad64} not exactly 1 at f64`);
    ok("*** the weights sum to 1 to within one ULP and NOT exactly, which \"one BY CONSTRUCTION\" does not say ***",
        bad > 0 && worst <= 1.2e-7,
        `worst departure ${worst.toExponential(3)} = ${(worst / Math.pow(2, -23)).toFixed(1)} ULP of 1. The property is algebra; floating point rounds two quotients and adds them, and the sum misses by a bit`);
    ok("!! and the rate is the SAME at f64, so this is not a precision question and the port changes nothing about it",
        Math.abs(bad / MIS_PAIRS - bad64 / MIS_PAIRS) < 0.05,
        `${(bad / MIS_PAIRS * 100).toFixed(1)}% on the device against ${(bad64 / MIS_PAIRS * 100).toFixed(1)}% at f64. A round that reported only the f32 number would have blamed the hardware for arithmetic that does the same thing everywhere -- which is the mirror image of v4408, where the model was right about f32 and wrong about the transcendental`);
    ok("  and no pair returns a weight outside [0, 1], which is what would actually break an estimator",
        Array.from({ length: MIS_PAIRS }, (_, k) => v[k * 3 + 2]).every((s) => s >= 0 && s <= 1 + 1.2e-7),
        "a sum above 1 double-counts and a sum below 1 loses light; one ULP of either is beneath the sampling noise of any renderer, and that is the honest statement rather than 'it is exactly one'");
}

console.log("\n7. THE AZIMUTH THIS FIXTURE CANNOT SEE, AND IT IS THE FIXTURE'S BLINDNESS RATHER THAN THE MODEL'S");
{
    // *** A SABOTAGE WENT 0 RED AND THIS IS WHAT IT EARNED. *** Negating the azimuth -- phi -> -phi, which is
    // the handedness of the tangent frame about the normal -- moved NOTHING. That is not luck and it is not a
    // blind check: this gate places wo in the plane z = 0, so wo.z is 0, and wh.z therefore never reaches
    // dot(wo, wh). Every quantity the weight is built from is independent of it, EXACTLY.
    let worstFlat = 0, movedTilted = 0, n = 0;
    for (const a of [0.05, 0.5]) for (const cosO of COS_O) {
        const so = Math.sqrt(1 - cosO * cosO);
        for (const [u1, u2] of strata(24)) {
            const wh = sampleHalfVector(u1, u2, a), whF = [wh[0], wh[1], -wh[2]];
            const w = (wo, h) => {
                const d = wo[0] * h[0] + wo[1] * h[1] + wo[2] * h[2];
                return bounceWeight(cosO, 2 * d * h[1] - wo[1], h[1], d, a);
            };
            const flat = [so, cosO, 0];
            worstFlat = Math.max(worstFlat, Math.abs(w(flat, wh) - w(flat, whF)));
            // the SAME test with wo given a component out of that plane, which is what a real tracer has
            const tl = [so * 0.6, cosO, so * 0.8];
            if (w(tl, wh) !== w(tl, whF)) movedTilted++;
            n++;
        }
    }
    ok("!! the estimator is EXACTLY blind to the azimuth's sign, and the reason is arithmetic rather than symmetry",
        worstFlat === 0,
        `worst departure over ${n} samples is exactly ${worstFlat}. wo = (sin, cos, 0) puts wo.z at zero, so wh.z cannot reach dot(wo, wh); cos_h, cos_i and |wo.wh| are all independent of it. No tangent-frame handedness can move this fixture`);
    ok("*** ...and that is a limitation of THIS FIXTURE, not a property of the model, which the same test proves ***",
        movedTilted > n / 2,
        `tilt wo out of the z = 0 plane and ${movedTilted} of ${n} samples MOVE. So handedness is untested here rather than harmless -- and a consumer that builds its tangent frame in-shader (physics/render/pathTracerWgsl.mjs's camera basis) gets no reassurance from this round. Naming it beats a 0-red sabotage counted as coverage`);
}

report("UNCHECKED. WHETHER A REAL CARD AGREES, which is v4408's open question and stays open -- though note this " +
       "round's keys are far less exposed to it: nothing here subtracts two numbers near 1 except the cdf " +
       "denominator that section 5 shows does not bite, and the built-in sin and cos enter only through the " +
       "azimuth, where a 2^-11 error is a 2^-11 error. THE OTHER STRATEGY: this samples the NDF only, so the " +
       "MIS weights are computed and never USED -- a real next-event estimator pairs this with a light sample, " +
       "and combining two estimators is a round of its own. " +
       // v4479 -- SETTLED at v4413, and this note went on advertising it as open for 66 versions.
       // misWgsl.mjs exports STRATEGY = { bsdf, light, mis, misRenorm } and its gate's own header reads
       // "THE TWO STRATEGIES ACTUALLY COMBINED -- WHICH v4409 COMPUTED THE WEIGHTS FOR AND NEVER USED".
       // Found by tools/ship/deferralCensus.mjs, which enumerates the prose this tree defers in; checked
       // against the EXPORT rather than against the sentence, because a mention test is how these go wrong.
       "SETTLED at v4413 -- see physics/render/misWgsl.mjs. " +
       "FRESNEL, which is F = 1 throughout, as " +
       "microfacet.mjs's default is. ENERGY COMPENSATION, which is what the shortfall this measures is FOR. " +
       "And the VISIBLE-NORMAL sampler (Heitz), which is what a modern tracer actually uses and which " +
       "microfacet.mjs does not carry either.");

/* -----------------------------------------------------------------------------------------------------------
 * THE DEVICE RUN. One page, one adapter, two shader texts (clean and noPi), every job dispatched from them.
 * --------------------------------------------------------------------------------------------------------- */
async function run() {
    const P = (o) => [...new Uint8Array(packSampleParams({ laneCount: LANES, ...o }).buf)];
    const jobs = [];
    for (const a of ALPHAS) for (const c of COS_O) jobs.push({ key: `e/${a}/${c}`, out: LANES, pack: P({ mode: MODE.estimate, nStrat: NS, alpha: a, cosO: c }) });
    for (const a of ALPHAS) jobs.push({ key: `r/${a}`, out: LANES, pack: P({ mode: MODE.estimate, nStrat: NS, alpha: a, cosO: 0.7, faults: REPAIR.stableCdf }) });
    for (const n of ["wrongPdf", "separable", "beckmann"]) jobs.push({ key: `f/${n}`, out: LANES, pack: P({ mode: MODE.estimate, nStrat: NS, alpha: 0.5, cosO: 0.7, faults: FAULT[n] }) });
    for (const a of [0.05, 0.25, 1.0]) jobs.push({ key: `i/${a}`, out: IDN * 3, lanes: IDN, pack: P({ mode: MODE.identity, laneCount: IDN, nStrat: IDS, count: IDN, alpha: a, cosO: 0.7 }) });

    // The MIS pairs are seeded by the host so the property is tested on numbers the shader did not choose.
    const misSeed = new Float32Array(MIS_PAIRS * 3);
    for (let k = 0; k < MIS_PAIRS; k++) { misSeed[k * 3] = ((k % 97) + 1) / 7.3; misSeed[k * 3 + 1] = (((k * 7) % 89) + 1) / 11.7; }
    jobs.push({ key: "mis", out: MIS_PAIRS * 3, lanes: MIS_PAIRS, seed: [...misSeed], pack: P({ mode: MODE.mis, laneCount: MIS_PAIRS, count: MIS_PAIRS }) });

    const r = await runInEngineOrigin({ engineRoot: ENG, timeoutMs: 120000, args: {
        LANES, jobs, shaders: { clean: buildSampleWgsl(), noPi: buildSampleWgsl({ noPi: true }) },
    }, script: `async (a) => {
        const out = { clean: {}, noPi: {}, compileErrors: [] };
        try {
            if (!navigator.gpu) throw new Error("no navigator.gpu in this page");
            const adapter = await navigator.gpu.requestAdapter(); if (!adapter) throw new Error("no adapter");
            const dev = await adapter.requestDevice();
            for (const [tag, src] of Object.entries(a.shaders)) {
                const m = dev.createShaderModule({ code: src });
                const info = await m.getCompilationInfo?.();
                for (const g of (info ? info.messages : [])) if (g.type === "error") out.compileErrors.push(tag + " line " + g.lineNum + ": " + g.message.slice(0, 160));
                if (out.compileErrors.length) return out;
                const pipe = dev.createComputePipeline({ layout: "auto", compute: { module: m, entryPoint: "sample" } });
                for (const j of a.jobs) {
                    const uni = dev.createBuffer({ size: j.pack.length, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
                    dev.queue.writeBuffer(uni, 0, new Uint8Array(j.pack));
                    const bytes = j.out * 4;
                    const pb = dev.createBuffer({ size: bytes, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST });
                    if (j.seed) dev.queue.writeBuffer(pb, 0, new Float32Array(j.seed));
                    const bg = dev.createBindGroup({ layout: pipe.getBindGroupLayout(0), entries: [
                        { binding: 0, resource: { buffer: uni } }, { binding: 1, resource: { buffer: pb } } ] });
                    const enc = dev.createCommandEncoder(); const p = enc.beginComputePass();
                    p.setPipeline(pipe); p.setBindGroup(0, bg); p.dispatchWorkgroups(Math.ceil((j.lanes || a.LANES) / 64)); p.end();
                    const rb = dev.createBuffer({ size: bytes, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
                    enc.copyBufferToBuffer(pb, 0, rb, 0, bytes); dev.queue.submit([enc.finish()]);
                    await rb.mapAsync(GPUMapMode.READ); out[tag][j.key] = [...new Float32Array(rb.getMappedRange().slice(0))];
                    rb.unmap(); rb.destroy(); pb.destroy(); uni.destroy();
                }
            }
        } catch (e) { out.error = String(e && e.message || e).slice(0, 600); }
        return out;
    }` });

    ok("*** the sampling half COMPILES AND RUNS on a device -- v4408 named it as what it had not carried ***",
        r.ok && r.result && !r.result.error && (r.result.compileErrors || []).length === 0,
        r.ok ? (r.result && r.result.error) || ((r.result && r.result.compileErrors || []).join("; ") || "sampleHalfVector, sampleDirPdf, bsdfEval, bounceWeight, misWeight; three modes, two shader texts") : (r.reason || (r.pageErrors || []).join("; ")));
    if (!r.ok || !r.result || r.result.error || (r.result.compileErrors || []).length) return null;
    return r.result;
}

console.log(fails ? `\n${fails} FAILURE(S)` : "\nALL GREEN");
process.exit(fails ? 1 : 0);

/* -----------------------------------------------------------------------------------------------------------
 * SABOTAGE LOG -- 6 / 5 / 2 / 3 by name, and ONE that went 0 red and earned section 7.
 *
 * A. The reflection's sign flipped: `wi = wo - 2 (wo.wh) wh`.                                       6 RED
 *    The mirror limit goes first and loudest, which is the right order: a closed form with zero variance is
 *    the check that cannot be argued with. The IDENTITY stays green, correctly -- both routes are evaluated
 *    at whatever direction the sampler produced, so an identity between them cannot see a wrong direction.
 *    That is the division of labour this gate is built on and the sabotage confirms it rather than assuming it.
 *
 * B. The analytic cancellation done wrong: `G2 |wo.wh| cos_h / cos_o` instead of dividing by cos_h.   5 RED
 *    The one mistake a reader of microfacet.mjs's comment could actually make, since the comment gives the
 *    algebra and not the code. Caught by the identity AND by the mirror limit AND by the quadrature
 *    cross-check -- three independent instruments, which is what a transcription with no textual proof needs.
 *
 * C. The pdf's Jacobian: `4 |cos_h|` instead of `4 |wo.wh|`.                                         2 RED
 *    *** THE SHARPEST ONE, AND IT IS CAUGHT BY THE IDENTITY ALONE. *** bounceWeight never calls
 *    sampleDirPdf -- the whole point is that the division was taken analytically -- so the ESTIMATOR cannot
 *    see this at all, and neither can the mirror limit, the quadrature cross-check, or the blindness tests.
 *    A round that had shipped only the estimator would have shipped a wrong pdf, and a wrong pdf is what
 *    breaks the moment somebody adds a second sampling strategy and combines them. This is why key 1 exists.
 *
 * D. misWeight divides by the OTHER pdf rather than by the sum.                                      3 RED
 *    All three in section 6, including the [0, 1] bound -- which is the check that matters, because a weight
 *    above 1 double-counts light and no amount of sampling fixes it.
 *
 * E. The azimuth negated: `phi = -2 PI u2`, which is the tangent frame's handedness.                 0 RED
 *    *** A SABOTAGE THAT GOES 0 RED IS A FINDING, NOT A PASS. *** This fixture puts wo in the plane z = 0, so
 *    wo.z is zero and wh.z never reaches dot(wo, wh) -- the blindness is EXACT and arithmetic, not a symmetry
 *    argument. Section 7 now proves both halves: the departure is exactly 0 here, and tilting wo out of that
 *    plane moves 3226 of 3456 samples. So handedness is UNTESTED rather than harmless, which is the opposite
 *    conclusion from v4407's furnace, where the integrand really was azimuthally symmetric.
 * --------------------------------------------------------------------------------------------------------- */
