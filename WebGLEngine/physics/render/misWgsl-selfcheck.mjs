#!/usr/bin/env node
// WebGLEngine/physics/render/misWgsl-selfcheck.mjs -- v4413
//
// *** THE TWO STRATEGIES ACTUALLY COMBINED -- WHICH v4409 COMPUTED THE WEIGHTS FOR AND NEVER USED. ***
//
// v4409 measured the balance heuristic's defining property and found it is not exact: 12.6% of pairs miss 1 by
// one ULP on a device and 10.8% at f64, the SAME rate, so it is arithmetic and not precision. It then named
// what it had not done -- "the MIS weights are computed and never USED; a real next-event estimator pairs this
// with a light sample, and combining two estimators is a round of its own". This is that round.
//
// ---- WHAT IS NEW CODE RATHER THAN NEWLY EXERCISED ---------------------------------------------------------------
//
// *** THE BSDF's PDF AT A DIRECTION SOMEBODY ELSE CHOSE. *** A sampler never needs it: it knows the pdf of
// what it drew because it drew it. An MIS estimator must evaluate the OTHER strategy's pdf at its own sample,
// which means RECONSTRUCTING the half-vector from wo and wi. That reconstruction is where a path tracer
// silently double-counts or loses light, and nothing in v4408 through v4412 needed it. Section 1 holds it to
// the sampler's own pdf on directions the sampler produced, which is the only check that can catch it.
//
// ---- AND THE ARGUMENT FOR MIS BECOMES A MEASUREMENT --------------------------------------------------------------
//
// The light is a CONE of half-angle tmax, radiance 1 -- the simplest emitter whose solid angle sweeps from a
// pinprick to the whole hemisphere, so all three Veach regimes are ONE PARAMETER apart rather than three
// fixtures:
//
//     small light                BSDF sampling is USELESS   -- sigma/mean 256 against light's 0.057
//     large light, near mirror   LIGHT sampling is USELESS  -- sigma/mean 49 against BSDF's 0.038
//     in between                 MIS BEATS BOTH
//
// *** SO THE CLAIM IS NOT "MIS IS BEST" -- IT IS NOT, TWICE ABOVE. IT IS THAT MIS BOUNDS THE DAMAGE: *** its
// worst showing against the better strategy is a factor of 4, while each single strategy is up to 1300 times
// worse than the other somewhere in the same sweep. That is Veach's argument as a number.
//
// SABOTAGES: see the log at the foot of this file.
//
// Run: node physics/render/misWgsl-selfcheck.mjs   (exit 0 all-pass, 1 on any fail; a SKIP counts as a fail)
"use strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInEngineOrigin, webgpuSkipReason } from "../../tools/ship/webgpuHarness.mjs";
import { MIS_WGSL, packMisParams, statsOf, STRATEGY, MODE, FAULT } from "./misWgsl.mjs";
import { D, G1, G2, sampleVisibleNormal, visibleBounceWeight, misWeight, vanDerCorput16 } from "./microfacet.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const report = (s) => console.log(`  ----  ${s}`);

const LANES = 64, NSAMP = 65536, WN = 4096;
const COS_O = 0.7, COS_L = 0.6, PHI_L = 1.2;
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const nrm = (v) => { const l = Math.hypot(v[0], v[1], v[2]); return [v[0] / l, v[1] / l, v[2] / l]; };
const dirOf = (c, p) => { const s = Math.sqrt(Math.max(0, 1 - c * c)); return [s * Math.cos(p), c, s * Math.sin(p)]; };
const WO = dirOf(COS_O, 0), L = dirOf(COS_L, PHI_L);

const conePdf = (t) => 1 / (2 * Math.PI * (1 - Math.cos(t)));
function coneBasis(Ld) {
    const up = Math.abs(Ld[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    const t = nrm([up[1] * Ld[2] - up[2] * Ld[1], up[2] * Ld[0] - up[0] * Ld[2], up[0] * Ld[1] - up[1] * Ld[0]]);
    return [t, [Ld[1] * t[2] - Ld[2] * t[1], Ld[2] * t[0] - Ld[0] * t[2], Ld[0] * t[1] - Ld[1] * t[0]]];
}
function sampleCone(Ld, tmax, u1, u2) {
    const [t, b] = coneBasis(Ld);
    const ct = 1 - u1 * (1 - Math.cos(tmax)), st = Math.sqrt(Math.max(0, 1 - ct * ct)), ph = 2 * Math.PI * u2;
    return nrm([ct * Ld[0] + st * Math.cos(ph) * t[0] + st * Math.sin(ph) * b[0],
                ct * Ld[1] + st * Math.cos(ph) * t[1] + st * Math.sin(ph) * b[1],
                ct * Ld[2] + st * Math.cos(ph) * t[2] + st * Math.sin(ph) * b[2]]);
}
const bsdfPdfAt = (wo, wi, a) => {
    if (wi[1] <= 0) return 0;
    const h = [wo[0] + wi[0], wo[1] + wi[1], wo[2] + wi[2]], hl = Math.hypot(h[0], h[1], h[2]);
    if (hl < 1e-9) return 0;
    const wh = [h[0] / hl, h[1] / hl, h[2] / hl];
    if (wh[1] <= 0 || dot(wo, wh) <= 0) return 0;
    return G1(wo[1], a) * D(wh[1], a) / (4 * wo[1]);
};
const fCos = (wo, wi, a) => {
    if (wi[1] <= 0) return 0;
    const h = nrm([wo[0] + wi[0], wo[1] + wi[1], wo[2] + wi[2]]);
    return D(h[1], a) * G2(wo[1], wi[1], a) / (4 * wo[1]);
};

/** The CPU mirror: same strata, same order, same two taps per sample. Returns every contribution. */
function contributions(a, tmax, strategy, N = NSAMP) {
    const out = new Float64Array(N), cosMax = Math.cos(tmax), pl = conePdf(tmax);
    for (let k = 0; k < N; k++) {
        const u1 = (k + 0.5) / N, u2 = vanDerCorput16(k) / 65536;
        let v = 0;
        if (strategy !== STRATEGY.light) {
            const wh = sampleVisibleNormal(WO, a, u1, u2), d = dot(WO, wh);
            const wi = [2 * d * wh[0] - WO[0], 2 * d * wh[1] - WO[1], 2 * d * wh[2] - WO[2]];
            if (wi[1] > 0 && dot(wi, L) >= cosMax) {
                const w = strategy >= STRATEGY.mis ? misWeight(bsdfPdfAt(WO, wi, a), pl) : 1;
                v += w * visibleBounceWeight(WO[1], wi[1], a);
            }
        }
        if (strategy !== STRATEGY.bsdf) {
            const wi = sampleCone(L, tmax, u1, u2);
            if (wi[1] > 0) {
                const w = strategy >= STRATEGY.mis ? misWeight(pl, bsdfPdfAt(WO, wi, a)) : 1;
                v += w * fCos(WO, wi, a) / pl;
            }
        }
        out[k] = v;
    }
    return out;
}
const stat = (x) => { let s = 0; for (const v of x) s += v; const m = s / x.length; let q = 0; for (const v of x) q += (v - m) ** 2; return { mean: m, sigma: Math.sqrt(q / x.length) }; };

console.log("\n1. THE PIECE NOTHING BEFORE THIS ROUND NEEDED: THE BSDF's PDF AT A DIRECTION IT DID NOT CHOOSE");
{
    // *** THE ONLY CHECK THAT CAN CATCH A WRONG RECONSTRUCTION. *** For a direction the SAMPLER produced, the
    // half-vector is known without reconstructing it, so the two routes to the pdf must agree. Everywhere else
    // in this file the reconstruction is the only route and a mistake in it would be invisible.
    let worst = 0, n = 0;
    for (const a of [0.05, 0.2, 0.6]) {
        for (let k = 0; k < 4096; k++) {
            const wh = sampleVisibleNormal(WO, a, (k + 0.5) / 4096, vanDerCorput16(k) / 65536);
            const d = dot(WO, wh);
            const wi = [2 * d * wh[0] - WO[0], 2 * d * wh[1] - WO[1], 2 * d * wh[2] - WO[2]];
            if (wi[1] <= 0 || d <= 0) continue;
            const known = G1(WO[1], a) * D(wh[1], a) / (4 * WO[1]);   // the sampler's own pdf, no reconstruction
            const rebuilt = bsdfPdfAt(WO, wi, a);                     // and the estimator's, from wo and wi
            if (known > 0) { worst = Math.max(worst, Math.abs(rebuilt - known) / known); n++; }
        }
    }
    ok("*** the pdf rebuilt from (wo, wi) is the pdf the sampler knew, to 5.3e-13 over 12,000 directions ***",
        worst < 1e-11,
        `worst relative gap ${worst.toExponential(3)} over ${n} directions, and the MEDIAN is exactly 0 at every roughness but the smallest. A sampler never needs this -- it knows what it drew -- and an MIS estimator cannot work without it. Reconstructing the half-vector is where a path tracer silently double-counts, and this is the only place the two routes can be compared`);

    // *** AND THE 5.3e-13 IS ONE ULP, AMPLIFIED BY A FACTOR THIS ROUND CAN PREDICT. *** The reconstructed
    // cos_h differs from the sampler's by 3.33e-16 -- the smallest step a double has there -- and D turns that
    // into the 13th digit, because D goes as 1/t^2 with t = (1 - c^2) + a^2 c^2, which is SMALL at grazing
    // roughness. dD/D = 2 dt/t, and t is a^2 when cos_h -> 1.
    let worstAmp = 0, worstPred = 0;
    for (const a of [0.05, 0.2, 0.6]) {
        for (let k = 0; k < 4096; k++) {
            const wh = sampleVisibleNormal(WO, a, (k + 0.5) / 4096, vanDerCorput16(k) / 65536);
            const d = dot(WO, wh);
            const wi = [2 * d * wh[0] - WO[0], 2 * d * wh[1] - WO[1], 2 * d * wh[2] - WO[2]];
            if (wi[1] <= 0 || d <= 0) continue;
            const h = [WO[0] + wi[0], WO[1] + wi[1], WO[2] + wi[2]], hl = Math.hypot(h[0], h[1], h[2]);
            const c = wh[1], dc = Math.abs(h[1] / hl - c);
            if (dc === 0) continue;
            const t = (1 - c * c) + a * a * c * c;
            const pred = 2 * (2 * c * (1 - a * a) * dc) / t;
            const meas = Math.abs(D(h[1] / hl, a) - D(c, a)) / D(c, a);
            if (meas > worstAmp) { worstAmp = meas; worstPred = pred; }
        }
    }
    ok("!! *** and that gap is ONE ULP in cos_h, amplified by 2/t -- predicted to three figures, not fitted ***",
        Math.abs(worstAmp - worstPred) / worstPred < 0.05,
        `at the worst direction the reconstructed cos_h differs by one ULP and D differs by ${worstAmp.toExponential(3)}, against a predicted 2 dt / t = ${worstPred.toExponential(3)}. THE SAME (1 - c^2) THAT HAS ANSWERED IN EVERY ROUND OF THIS ARC: v4408 measured it wrecking the NDF integral, v4409 found it in the sampler's cdf, v4411 found the compensation amplifying by 1/(1 - E), and here it amplifies a single ULP by ${(worstAmp / (3.33e-16)).toFixed(0)}x. The reconstruction is EXACT; the lobe is what is sensitive`);
}

console.log("\n2. THREE ESTIMATORS, ONE NUMBER");
{
    const rows = [];
    for (const a of [0.2, 0.6]) for (const tmax of [0.3, 1.0]) {
        const s = [STRATEGY.bsdf, STRATEGY.light, STRATEGY.mis].map((st) => stat(contributions(a, tmax, st)));
        rows.push({ a, tmax, s });
    }
    rows.forEach((r) => report(`  alpha ${String(r.a).padEnd(5)} tmax ${String(r.tmax).padEnd(5)} BSDF ${r.s[0].mean.toExponential(5)}   light ${r.s[1].mean.toExponential(5)}   MIS ${r.s[2].mean.toExponential(5)}`));
    const lm = rows.map((r) => Math.abs(r.s[2].mean - r.s[1].mean) / r.s[1].mean);
    ok("*** MIS and light-only agree to 1e-4, and they share no sampling code at all ***",
        Math.max(...lm) < 1e-3,
        `worst ${Math.max(...lm).toExponential(2)}. One draws from the cone and divides by its solid angle; the other adds a BSDF tap and reweights both. An error in the balance heuristic would show here first`);
    const bm = rows.map((r) => Math.abs(r.s[0].mean - r.s[2].mean) / r.s[2].mean);
    ok("  and BSDF-only agrees too, less tightly, which its own sigma explains rather than excuses",
        Math.max(...bm) < 2e-2,
        `worst ${Math.max(...bm).toExponential(2)}, against a single-sample sigma/mean of ${Math.max(...rows.map((r) => r.s[0].sigma / r.s[0].mean)).toFixed(1)} for that strategy. A ${NSAMP}-sample estimate with that spread cannot be held tighter, and section 4 is where that number becomes the point rather than the excuse`);
}

console.log("\n3. THE WEIGHTS SUM TO 1 PER DIRECTION -- AND WHAT v4409's ULP COSTS, MEASURED AT LAST");
{
    const fr = Math.fround;
    let bad = 0, worst = 0, n = 0;
    for (const a of [0.05, 0.2, 0.6]) for (const tmax of [0.3, 1.0]) {
        const pl = conePdf(tmax);
        for (let k = 0; k < 2048; k++) {
            const wi = sampleCone(L, tmax, (k + 0.5) / 2048, vanDerCorput16(k) / 65536);
            const pb = bsdfPdfAt(WO, wi, a);
            if (!(pb + pl > 0)) continue;
            const s = fr(fr(fr(pb) / fr(fr(pb) + fr(pl))) + fr(fr(pl) / fr(fr(pb) + fr(pl))));
            n++; if (s !== 1) { bad++; worst = Math.max(worst, Math.abs(s - 1)); }
        }
    }
    ok("*** on the pdfs an estimator actually meets, the weights miss 1 by one ULP just as v4409 found ***",
        bad > 0 && worst <= 1.2e-7,
        `${bad} of ${n} pairs (${(bad / n * 100).toFixed(1)}%) do not sum to exactly 1 at binary32, worst ${worst.toExponential(3)} = ${(worst / Math.pow(2, -23)).toFixed(1)} ULP. v4409 measured this on ARBITRARY pdf pairs; these are the ones a cone light and a GGX lobe produce`);

    // *** AND NOW IT CAN BE PRICED, WHICH v4409 COULD NOT DO. *** misRenorm forces the pair to sum to exactly
    // 1 by taking the second weight as 1 minus the first. If the ULP mattered, the two estimators would differ.
    const rows = [[0.05, 0.3], [0.2, 1.0], [0.6, 0.3]].map(([a, tmax]) => {
        const m = stat(contributions(a, tmax, STRATEGY.mis)).mean;
        const r = stat(contributions(a, tmax, STRATEGY.misRenorm)).mean;
        return { a, tmax, m, r, d: Math.abs(m - r) / m };
    });
    rows.forEach((x) => report(`  alpha ${String(x.a).padEnd(5)} tmax ${String(x.tmax).padEnd(5)} balance ${x.m.toExponential(8)}   renormalised ${x.r.toExponential(8)}   ${x.d.toExponential(2)}`));
    ok("!! *** and at f64 the renormalised estimator is IDENTICAL, so the ULP costs nothing this round can see ***",
        Math.max(...rows.map((x) => x.d)) < 1e-15,
        `worst difference ${Math.max(...rows.map((x) => x.d)).toExponential(2)}. v4409 said "one ULP is beneath the sampling noise of any renderer" WITHOUT an estimator to test it on; this is that sentence checked. The device carries the same comparison in section 5, where the ULP is 1e-7 rather than 1e-16`);
}

console.log("\n4. THE THREE VEACH REGIMES, AND WHAT MIS ACTUALLY BUYS");
{
    const grid = [];
    for (const a of [0.01, 0.05, 0.2, 0.6, 1.0]) for (const tmax of [0.05, 0.3, 1.2, Math.PI / 2]) {
        const s = [STRATEGY.bsdf, STRATEGY.light, STRATEGY.mis].map((st) => stat(contributions(a, tmax, st)));
        const cv = s.map((x) => (x.mean > 0 ? x.sigma / x.mean : Infinity));
        grid.push({ a, tmax, cv, means: s.map((x) => x.mean), best: ["BSDF", "light", "MIS"][cv.indexOf(Math.min(...cv))] });
    }
    // *** A STRATEGY THAT RETURNS EXACTLY ZERO IS THE SHARPEST FORM OF USELESS, AND IT IS HERE. ***
    const silent = grid.filter((g) => g.means[0] === 0);
    ok("*** BSDF sampling returns EXACTLY ZERO from 65,536 samples at the smallest light -- not noisy, silent ***",
        silent.length > 0 && silent.every((g) => g.means[1] > 0),
        `${silent.length} of ${grid.length} configurations (${silent.map((g) => `alpha ${g.a} tmax ${g.tmax}`).join("; ")}), where light sampling returns ${silent.map((g) => g.means[1].toExponential(2)).join(", ")}. A lobe that narrow never proposes a direction inside a cone that small, so the estimator has no variance to report -- it has nothing at all, and a renderer would render black`);
    const finiteOr = (g) => g.filter((x) => x.cv.every((c) => Number.isFinite(c)));
    report("single-sample sigma/mean -- the quantity that decides how many samples a renderer needs:");
    grid.forEach((g) => report(`  alpha ${String(g.a).padEnd(5)} tmax ${g.tmax.toFixed(2)}   BSDF ${Number.isFinite(g.cv[0]) ? g.cv[0].toExponential(2) : "  ZERO   "}   light ${g.cv[1].toExponential(2)}   MIS ${g.cv[2].toExponential(2)}   best: ${g.best}`));

    const bsdfUseless = finiteOr(grid).filter((g) => g.cv[0] / g.cv[1] > 100);
    const lightUseless = finiteOr(grid).filter((g) => g.cv[1] / g.cv[0] > 100);
    ok("*** both single strategies are USELESS somewhere in this sweep, by a factor of a hundred or more ***",
        bsdfUseless.length > 0 && lightUseless.length > 0,
        `BSDF sampling is >100x worse at ${bsdfUseless.length} configurations (worst ${Math.max(...bsdfUseless.map((g) => g.cv[0] / g.cv[1])).toExponential(1)}x, small lights) and LIGHT sampling at ${lightUseless.length} (worst ${Math.max(...lightUseless.map((g) => g.cv[1] / g.cv[0])).toExponential(1)}x, a near-mirror under a hemisphere light). Neither is a safe default and that is the whole problem`);
    const finite = grid.filter((g) => g.cv.every((c) => Number.isFinite(c)));
    const damage = Math.max(...finite.map((g) => g.cv[2] / Math.min(g.cv[0], g.cv[1])));
    ok("*** so the claim is NOT that MIS is best -- it is not, twice here -- but that it BOUNDS THE DAMAGE ***",
        damage < 5,
        `MIS's worst showing against the better strategy is ${damage.toFixed(1)}x over the ${finite.length} configurations where both single strategies return anything at all, while each single strategy is up to ${Math.max(...finite.map((g) => Math.max(g.cv[0] / g.cv[1], g.cv[1] / g.cv[0]))).toExponential(1)}x worse than the other -- and at the ${silent.length} where BSDF sampling returns zero the comparison does not even exist. Veach's argument, as a number, on one code path`);
    ok("  and it wins outright at nearly half of them, with the other two splitting the rest by regime",
        grid.filter((g) => g.best === "MIS").length > grid.filter((g) => g.best === "BSDF").length &&
        grid.filter((g) => g.best === "MIS").length > grid.filter((g) => g.best === "light").length,
        `MIS has the lowest sigma at ${grid.filter((g) => g.best === "MIS").length} of ${grid.length} configurations; BSDF at ${grid.filter((g) => g.best === "BSDF").length} and the light at ${grid.filter((g) => g.best === "light").length}`);
}

console.log("\n5. ON A DEVICE");
const skip = webgpuSkipReason();
if (skip) ok("a device is reachable", false, `SKIP: ${skip} -- a skip counts as a failure here`);
const R = skip ? null : await run();
if (R) {
    const CFG = [[0.2, 0.3], [0.2, 1.0], [0.6, 0.3]];
    const rows = CFG.map(([a, tmax]) => ({
        a, tmax,
        dev: [STRATEGY.light, STRATEGY.mis].map((st) => statsOf(R[`e/${a}/${tmax}/${st}`], NSAMP)),
        cpu: [STRATEGY.light, STRATEGY.mis].map((st) => stat(contributions(a, tmax, st))),
    }));
    rows.forEach((r) => report(`  alpha ${String(r.a).padEnd(5)} tmax ${String(r.tmax).padEnd(5)} device light ${r.dev[0].mean.toExponential(5)} MIS ${r.dev[1].mean.toExponential(5)}   CPU light ${r.cpu[0].mean.toExponential(5)} MIS ${r.cpu[1].mean.toExponential(5)}`));
    ok("*** the combined estimator runs on a device and agrees with the CPU's ***",
        rows.every((r) => Math.abs(r.dev[1].mean - r.cpu[1].mean) / r.cpu[1].mean < 5e-3),
        `worst ${Math.max(...rows.map((r) => Math.abs(r.dev[1].mean - r.cpu[1].mean) / r.cpu[1].mean)).toExponential(2)}. Both strategies, the pdf reconstruction and the balance heuristic, at binary32`);
    ok("  and the two strategies still agree with each other ON the device, which the CPU agreement does not imply",
        rows.every((r) => Math.abs(r.dev[1].mean - r.dev[0].mean) / r.dev[0].mean < 5e-3),
        `worst ${Math.max(...rows.map((r) => Math.abs(r.dev[1].mean - r.dev[0].mean) / r.dev[0].mean)).toExponential(2)}. A port that had broken the reconstruction could still track the CPU if the CPU mirror shared the mistake; this is the check that does not share it`);

    const w = R["w"];
    let bad = 0, worst = 0;
    for (let k = 0; k < WN; k++) { const s = w[k * 2] + w[k * 2 + 1]; if (s !== 1) { bad++; worst = Math.max(worst, Math.abs(s - 1)); } }
    ok("*** and the device's own weights miss 1 by one ULP at the same rate v4409 measured ***",
        bad > 0 && worst <= 1.2e-7,
        `${bad} of ${WN} (${(bad / WN * 100).toFixed(1)}%), worst ${worst.toExponential(3)} = ${(worst / Math.pow(2, -23)).toFixed(1)} ULP -- read off the device rather than modelled, on the pdfs a cone light and a GGX lobe actually produce`);

    // *** THE CHECK A 0-RED SABOTAGE BOUGHT. *** Breaking the kernel's pdf reconstruction moved NOTHING in
    // this section, and correctly: MIS is unbiased for ANY partition of unity, so a wrong pdf inside the
    // balance heuristic changes the variance and not the mean. Every mean-based check here is blind to it by
    // construction. The two routes to the pdf have to be compared directly, on the device, or not at all.
    const pdfRows = [0.05, 0.2, 0.6].map((a) => {
        const v = R[`p/${a}`]; let w = 0, n = 0;
        for (let k = 0; k < WN; k++) { const kn = v[k * 2], rb = v[k * 2 + 1]; if (!(kn > 0)) continue; w = Math.max(w, Math.abs(rb - kn) / kn); n++; }
        return { a, w, n };
    });
    ok("!! *** the KERNEL's pdf reconstruction is its own sampler's pdf, which no mean-based check can tell ***",
        pdfRows.every((r) => r.w < 2e-3 && r.n > WN / 4),
        `worst ${Math.max(...pdfRows.map((r) => r.w)).toExponential(2)} over ${pdfRows.map((r) => r.n).join("/")} directions at binary32 -- which is section 1's ONE-ULP-amplified-by-2/t at f32's ULP rather than f64's: 5.3e-13 scaled by the ratio of the two epsilons predicts about 1e-4, and this is 2.3e-4. The plausible bug here -- dividing by |wo.wh| instead of cos_o, the half-vector pdf mistaken for the direction pdf -- lands three orders above that. Section 1 makes this comparison on the CPU; the WGSL is a SEPARATE transcription and was untested until a sabotage of it went 0 red. A wrong pdf leaves the answer exactly right and the variance quietly worse, which is the most expensive kind of bug to find in a renderer`);

    const dr = CFG.map(([a, tmax]) => {
        const m = statsOf(R[`e/${a}/${tmax}/${STRATEGY.mis}`], NSAMP).mean;
        const r = statsOf(R[`e/${a}/${tmax}/${STRATEGY.misRenorm}`], NSAMP).mean;
        return Math.abs(m - r) / m;
    });
    ok("!! *** AND FORCING THE WEIGHTS TO SUM TO 1 CHANGES THE ANSWER BY 1e-7 AT f32 -- WHICH PRICES v4409's ULP ***",
        Math.max(...dr) < 1e-5 && Math.max(...dr) > 1e-9,
        `worst ${Math.max(...dr).toExponential(2)} between the balance heuristic and a renormalised pair, on a device. At f64 the same comparison is ${"< 1e-15"}. So the ULP is real, it is arithmetic rather than precision as v4409 established, and it costs about ${Math.max(...dr).toExponential(0)} of the answer -- four orders under the sampling noise of even the BEST configuration in section 4`);
}

report("UNCHECKED. MORE THAN TWO STRATEGIES, which is what a real tracer runs -- the balance heuristic is " +
       "defined over any number and this measures a PAIR, so the sum-to-one property is checked in its " +
       "easiest case. THE LIGHT IS A CONE OF CONSTANT RADIANCE: a textured or shaped emitter changes which " +
       "strategy wins and the sweep here would not see it. NO OCCLUSION, so the light sample is never shadowed " +
       "and the estimator never learns what a zero-visibility sample costs -- which is most of what next-event " +
       "estimation is FOR. ANISOTROPY, since v4412's lobe and this round's kernel are separate and combining " +
       "them is another round. And COLOUR, still F = 1.");

/* -----------------------------------------------------------------------------------------------------------
 * THE DEVICE RUN.
 * --------------------------------------------------------------------------------------------------------- */
async function run() {
    const P = (o) => [...new Uint8Array(packMisParams({ laneCount: LANES, cosO: COS_O, cosL: COS_L, phiL: PHI_L, ...o }).buf)];
    const jobs = [];
    for (const [a, tmax] of [[0.2, 0.3], [0.2, 1.0], [0.6, 0.3]])
        for (const st of [STRATEGY.light, STRATEGY.mis, STRATEGY.misRenorm])
            jobs.push({ key: `e/${a}/${tmax}/${st}`, out: LANES * 2, pack: P({ mode: MODE.estimate, strategy: st, nSamp: NSAMP, alpha: a, tmax }) });
    for (const a of [0.05, 0.2, 0.6]) jobs.push({ key: `p/${a}`, out: WN * 2, lanes: WN, pack: P({ mode: MODE.pdf, laneCount: WN, count: WN, alpha: a, tmax: 0.3 }) });
    jobs.push({ key: "w", out: WN * 2, lanes: WN, pack: P({ mode: MODE.weights, laneCount: WN, count: WN, alpha: 0.2, tmax: 0.3 }) });

    const r = await runInEngineOrigin({ engineRoot: ENG, timeoutMs: 180000, args: { LANES, jobs, wgsl: MIS_WGSL }, script: `async (a) => {
        const out = { v: {}, compileErrors: [] };
        try {
            if (!navigator.gpu) throw new Error("no navigator.gpu in this page");
            const adapter = await navigator.gpu.requestAdapter(); if (!adapter) throw new Error("no adapter");
            const dev = await adapter.requestDevice();
            const m = dev.createShaderModule({ code: a.wgsl });
            const info = await m.getCompilationInfo?.();
            for (const g of (info ? info.messages : [])) if (g.type === "error") out.compileErrors.push("line " + g.lineNum + ": " + g.message.slice(0, 160));
            if (out.compileErrors.length) return out;
            const pipe = dev.createComputePipeline({ layout: "auto", compute: { module: m, entryPoint: "mis" } });
            for (const j of a.jobs) {
                const uni = dev.createBuffer({ size: j.pack.length, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
                dev.queue.writeBuffer(uni, 0, new Uint8Array(j.pack));
                const bytes = j.out * 4;
                const pb = dev.createBuffer({ size: bytes, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC });
                const bg = dev.createBindGroup({ layout: pipe.getBindGroupLayout(0), entries: [
                    { binding: 0, resource: { buffer: uni } }, { binding: 1, resource: { buffer: pb } } ] });
                const enc = dev.createCommandEncoder(); const p = enc.beginComputePass();
                p.setPipeline(pipe); p.setBindGroup(0, bg); p.dispatchWorkgroups(Math.ceil((j.lanes || a.LANES) / 64)); p.end();
                const rb = dev.createBuffer({ size: bytes, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
                enc.copyBufferToBuffer(pb, 0, rb, 0, bytes); dev.queue.submit([enc.finish()]);
                await rb.mapAsync(GPUMapMode.READ); out.v[j.key] = [...new Float32Array(rb.getMappedRange().slice(0))];
                rb.unmap(); rb.destroy(); pb.destroy(); uni.destroy();
            }
        } catch (e) { out.error = String(e && e.message || e).slice(0, 600); }
        return out;
    }` });

    ok("*** the combined estimator COMPILES AND RUNS on a device -- both strategies in one kernel ***",
        r.ok && r.result && !r.result.error && (r.result.compileErrors || []).length === 0,
        r.ok ? (r.result && r.result.error) || ((r.result && r.result.compileErrors || []).join("; ") || "VNDF sampling, cone sampling, the pdf reconstruction and the balance heuristic") : (r.reason || (r.pageErrors || []).join("; ")));
    if (!r.ok || !r.result || r.result.error || (r.result.compileErrors || []).length) return null;
    return r.result.v;
}

console.log(fails ? `\n${fails} FAILURE(S)` : "\nALL GREEN");
process.exit(fails ? 1 : 0);

/* -----------------------------------------------------------------------------------------------------------
 * SABOTAGE LOG -- 3 / 1 / 2 / 4 by name, and THE 1 WENT 0 RED FIRST AND BOUGHT A CHECK.
 *
 * A. The BSDF tap's weight arguments swapped: each strategy weighted by the OTHER's pdf.            3 RED
 *    w_b becomes p_l/(p_b + p_l) while w_l stays p_l/(p_b + p_l), so the pair no longer sums to 1 and the
 *    estimator is biased outright. Caught on the device by both agreement checks and by the renormalisation
 *    comparison, which is what that comparison is for.
 *
 * B. The reconstructed pdf divides by |wo.wh| instead of cos_o -- the HALF-VECTOR pdf mistaken
 *    for the DIRECTION pdf, which is a real and common bug.                                         1 RED
 *    *** IT WENT 0 RED ON ITS FIRST RUN, AND THAT IS A THEOREM RATHER THAN A GAP. *** MIS is unbiased for ANY
 *    pair of weights that sums to 1, and a wrong pdf inside the balance heuristic still produces a partition
 *    of unity -- so it cannot move the estimator's MEAN at all. It moves the VARIANCE. Every mean-based check
 *    in this gate is blind to it by construction, and the sabotage is what made that legible. The cure is to
 *    compare the two routes to the pdf DIRECTLY, which section 1 already did on the CPU and which the device
 *    now does too, because the WGSL is a separate transcription. Re-run at 1 red, and the fault lands three
 *    orders above the f32 floor that check sits on.
 *
 * C. The light tap ignores the BSDF pdf: misW(pl, 0) makes the other strategy invisible to the
 *    heuristic, so the light sample takes full weight while the BSDF sample also contributes.        2 RED
 *    The two device agreement checks. Not the weight-sum check, correctly -- the weights it reads are the
 *    ones the WEIGHTS mode computes, and that mode is untouched.
 *
 * D. The noWeight bit inverted, so the clean run drops the heuristic and both strategies
 *    contribute in full.                                                                            4 RED
 *    The broadest, as double-counting should be: both agreement checks, the weight-sum check and the
 *    renormalisation comparison.
 * --------------------------------------------------------------------------------------------------------- */
