#!/usr/bin/env node
// WebGLEngine/physics/render/fresnelWgsl-selfcheck.mjs -- v4416
//
// *** THE F = 1 THAT SIX ROUNDS CLOSED THEIR UNCHECKED LIST WITH. ***
//
// v4408 through v4413 put the GGX lobe on a real GPU -- the NDF integral, the visible-normal sampler, the
// energy-compensation table, anisotropy, MIS -- and every one of them ended by saying "FRESNEL, F = 1
// THROUGHOUT". physics/render/fresnel.mjs has held the exact equations since v3491 and is gated hard at f64.
// It has never been near a device, and the lobe has never carried it.
//
// ---- THE HEADLINE: THE SENTENCE THAT WAS AN ASSERTION UNTIL SOMEBODY MADE THE TWO NUMBERS EQUAL -----------
//
// fresnel.mjs's header says why F was left out of the furnace test:
//
//     "with a real Fresnel term energy LEGITIMATELY LEAVES the reflection lobe -- it is transmitted, not lost.
//      THOSE TWO DEFICITS LOOK IDENTICAL FROM THE NUMBER ALONE AND ONE IS A MODEL FAILURE WHILE THE OTHER IS
//      PHYSICS."
//
// Section 1 makes them identical. At each roughness there is an index -- recovered by bisection, never typed
// -- at which a CORRECT lobe on a metal and a BROKEN lobe (the separable G2) on a white surface return the
// same directional albedo BIT FOR BIT at f64, and to 1.3e-8 on a device. The collided F0 is 0.9934 at
// alpha 0.5 and 0.9527 at alpha 1: ordinary metals, not absurd indices reached by torturing a parameter.
//
// *** SO A CHECK ON THE FURNACE NUMBER CERTIFIES BOTH, AND NO TOLERANCE ANYWHERE CAN SEPARATE THEM. *** What
// separates them is the TRANSMITTED SHARE, accumulated alongside the reflected one out of the same samples:
// 4.500e-3 for the metal, IDENTICALLY ZERO for the broken lobe, against a collision residual of 1.3e-8. The
// discriminator is 345,000 times the thing it has to see past.
//
// *** AND THE FIRST DRAFT GOT THE REASON WRONG. *** It said this lifts fresnel-selfcheck.mjs's "R + T = 1 is
// worthless if T is defined as 1 - R" from one interface to a whole lobe. IT DOES NOT: in the lobe those two
// ARE the same quantity by linearity, and the check would have been true about a number that does not bear on
// the claim it serves. What actually separates the two surfaces is running them AGAIN WITH F = 1, where the
// albedos differ by 4.5e-3 -- which is to say, the instrument that tells physics from a model failure is the
// white furnace test, taken with Fresnel out. That is not a workaround for v3490's choice. IT IS v3490's
// CHOICE, and this round is the first thing in the tree that needed it.
//
// ---- AND THREE THINGS THE DEVICE SAYS THAT f64 CANNOT ----------------------------------------------------
//
//   1. The f32 floor for the exact equations is ~1e-7 for air/glass and air/diamond -- AND TWENTY TIMES
//      WORSE IN A NARROW BAND AROUND TOTAL INTERNAL REFLECTION, because cos_t = sqrt(1 - sin_t^2) cancels as
//      sin_t -> 1. THE SAME (1 - x^2) THIS ARC HAS NOW FOUND IN FIVE CONSECUTIVE ROUNDS.
//   2. Brewster survives f32 by both routes that read r_p, and the third route -- the only one a renderer
//      could actually run -- fails completely, for a reason stronger than precision. See section 3.
//   3. pow(m, 5.0) and m*m*m*m*m differ by 4.2e-7, five times the curve's own f32 floor. A spelling that
//      is not one.
//
// SABOTAGES: see the log at the foot of this file.
//
// Run: node physics/render/fresnelWgsl-selfcheck.mjs   (exit 0 all-pass, 1 on any fail; a SKIP counts as a fail)
"use strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInEngineOrigin, webgpuSkipReason } from "../../tools/ship/webgpuHarness.mjs";
import { FRESNEL_WGSL, packFresnelParams, albedoOf, MODE, FAULT, VARIANT } from "./fresnelWgsl.mjs";
import { fresnel, rp, schlick, F0of, brewsterCos, criticalCos } from "./fresnel.mjs";
import { directionalAlbedoSplit } from "./microfacet.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const report = (s) => console.log(`  ----  ${s}`);

const N = 512, LANES = 64, NSAMP = 65536, COS_O = 0.7, EPS = 1e-9;
const LADDER = [0.00625, 0.025, 0.1, 0.2];

/* ------------------------------------------------------------------------------------------------------------
 * 1. *** THE TWO DEFICITS MADE EQUAL, AND THE ONE THING THAT STILL TELLS THEM APART ***
 * --------------------------------------------------------------------------------------------------------- */
const COLLIDED = {};
{
    for (const alpha of [0.5, 1.0]) {
        // The BROKEN lobe: the separable G2 on a white surface. Separable is not an approximation of the
        // height-correlated form, it is a different model, and it loses energy that goes nowhere.
        const broken = directionalAlbedoSplit(alpha, COS_O, null, { samples: NSAMP, separable: true });
        // *** THE INDEX IS BISECTED FOR, NEVER TYPED. *** Nothing in the loop is told what answer to reach;
        // it reads only whether the metal's albedo is under the broken one, which is a comparison.
        let lo = 0.5, hi = 1;
        for (let k = 0; k < 60; k++) {
            const m = (lo + hi) / 2;
            if (directionalAlbedoSplit(alpha, COS_O, (d) => schlick(d, m), { samples: NSAMP }).E < broken.E) lo = m; else hi = m;
        }
        const F0 = (lo + hi) / 2;
        const metal = directionalAlbedoSplit(alpha, COS_O, (d) => schlick(d, F0), { samples: NSAMP });
        COLLIDED[alpha] = { F0, broken, metal };
        report(`alpha ${alpha}: broken-lobe white surface ${broken.E.toFixed(12)} | correct lobe on a metal of F0 ${F0.toFixed(9)} ${metal.E.toFixed(12)}`);
    }

    const c5 = COLLIDED[0.5], c10 = COLLIDED[1.0];
    ok("!! *** THE MODEL FAILURE AND THE PHYSICS RETURN THE SAME FURNACE NUMBER, BIT FOR BIT AT f64 ***",
       c5.metal.E === c5.broken.E && c10.metal.E === c10.broken.E,
       `${c5.metal.E.toFixed(12)} against ${c5.broken.E.toFixed(12)} at alpha 0.5, and ${c10.metal.E.toFixed(12)} against ${c10.broken.E.toFixed(12)} at alpha 1 -- EQUAL, not close. *** fresnel.mjs's header has said since v3491 that a Fresnel deficit and a masking deficit "look identical from the number alone". THIS IS THAT SENTENCE AS A MEASUREMENT: there is no tolerance, however tight, that separates these two, because there is nothing between them. A furnace test reporting either would certify the other. ***`);

    ok("!! ...and the index it takes is an ORDINARY METAL, not a parameter tortured to reach a collision",
       c5.F0 > 0.9 && c5.F0 < 1 && c10.F0 > 0.9 && c10.F0 < 1,
       `F0 ${c5.F0.toFixed(6)} at alpha 0.5 and ${c10.F0.toFixed(6)} at alpha 1 -- silver and aluminium live in that range. IF THE COLLISION NEEDED F0 = 3 IT WOULD BE A CURIOSITY. It needs a material somebody ships.`);

    ok("!! *** AND WHAT SEPARATES THEM IS THE SAME TWO SURFACES RUN AGAIN WITH F = 1 -- WHICH IS v3490's DESIGN ***",
       Math.abs(c5.metal.one - c5.broken.one) > 4e-3 && Math.abs(c10.metal.one - c10.broken.one) > 1.5e-2 &&
       c5.broken.T === 0 && c10.broken.T === 0 && c5.metal.T > 4e-3 && c10.metal.T > 1.5e-2,
       `the two lobes' F = 1 albedos are ${c5.metal.one.toFixed(9)} and ${c5.broken.one.toFixed(9)} -- APART BY ${Math.abs(c5.metal.one - c5.broken.one).toExponential(3)} where the Fresnel-carrying albedos were equal to the last bit. *** SO THE INSTRUMENT THAT TELLS THEM APART IS THE WHITE FURNACE ITSELF, RUN WITH FRESNEL TAKEN OUT, and that is not a workaround -- it is the reason v3490 sets F = 1 in the first place. *** The transmitted share names the difference: ${c5.metal.T.toFixed(9)} for the metal against ${c5.broken.T} for the broken lobe, IDENTICALLY ZERO. A DEFICIT WITH AN ACCOUNT IS PHYSICS AND A DEFICIT WITHOUT ONE IS A BUG.`);

    ok("!! ...and the account is ATTRIBUTION, not an independent second route -- which is a weaker thing than it looks",
       Math.abs(c5.metal.T - (c5.metal.one - c5.metal.E)) < 1e-14 && Math.abs(c10.metal.T - (c10.metal.one - c10.metal.E)) < 1e-14,
       `*** THE FIRST DRAFT OF THIS SECTION CLAIMED THE TRANSMITTED SHARE IS "NOT 1 - R", BORROWING fresnel-selfcheck.mjs's WORDS FOR A PLACE THEY DO NOT APPLY. *** At one interface T really is independent -- section 6 computes it from t_s and t_p and closes R + T = 1, which is a fact about the boundary conditions. In the LOBE the two are the same quantity by linearity: sum (1 - F) w and sum w - sum F w differ by nothing but the order of the additions (${Math.abs(c5.metal.T - (c5.metal.one - c5.metal.E)).toExponential(2)} and ${Math.abs(c10.metal.T - (c10.metal.one - c10.metal.E)).toExponential(2)} at f64, over 65536 terms). What the split buys is not a second measurement, it is a NAME for which of the two deficits is which -- and the name is only trustworthy because F itself was verified against a closure that IS independent, one level down.`);

    const close5 = c5.metal.E + c5.metal.T + (1 - c5.metal.one);
    const close10 = c10.metal.E + c10.metal.T + (1 - c10.metal.one);
    report(`three-way closure: reflected ${c5.metal.E.toFixed(9)} + transmitted ${c5.metal.T.toFixed(9)} + multiple-scattering loss ${(1 - c5.metal.one).toFixed(9)} = ${close5.toFixed(12)}`);
    ok("!! ...so ALL THREE deficits close on one surface: reflected, transmitted, and the lobe's own loss",
       Math.abs(close5 - 1) < 1e-12 && Math.abs(close10 - 1) < 1e-12,
       `${close5.toFixed(15)} and ${close10.toFixed(15)}. The single-scattering lobe loses ${((1 - c5.metal.one) * 100).toFixed(1)}% at alpha 0.5 to masking that v4411's compensation table adds back, Fresnel transmits ${(c5.metal.T * 100).toFixed(2)}%, and the surface reflects the rest. THREE CAUSES, THREE NUMBERS, ONE SUM -- which is what makes the furnace number decomposable at all.`);

    const exact = directionalAlbedoSplit(0.5, COS_O, (d) => fresnel(d, 1, 1.5).R, { samples: NSAMP });
    ok("!! and on GLASS the furnace 'deficit' is 96.6% and every point of it is accounted for",
       Math.abs(exact.E + exact.T - exact.one) < 1e-12 && exact.E < 0.05 && exact.T > 0.6,
       `a rough glass surface at alpha 0.5 reflects ${(exact.E * 100).toFixed(2)}% and transmits ${(exact.T * 100).toFixed(2)}%. *** A WHITE FURNACE TEST RUN WITH FRESNEL ON WOULD REPORT A 96.6% ENERGY DEFICIT ON A PERFECTLY CORRECT MODEL. *** That is exactly why v3490 sets F = 1, and it is the two-things-one-label defect this tree names most often.`);
}

/* ------------------------------------------------------------------------------------------------------------
 * 2. WHAT AN UNPOLARISED RENDERER CAN SEE OF BREWSTER -- WHICH IS LESS THAN v3491 WROTE DOWN
 * --------------------------------------------------------------------------------------------------------- */
{
    const PAIRS = [[1, 1.33], [1, 1.5], [1, 2.4], [1.5, 1]];
    const rows = PAIRS.map(([a, b]) => {
        let mono = true, prev = null, minV = Infinity, minAt = 0;
        for (let i = 1; i <= 4000; i++) {
            const c = i / 4000, R = fresnel(c, a, b).R;
            if (prev !== null && R > prev) mono = false;
            prev = R;
            if (R < minV) { minV = R; minAt = c; }
        }
        return { a, b, mono, minV, minAt, F0: F0of(a, b), cB: brewsterCos(a, b) };
    });
    for (const r of rows) report(`n ${r.a} -> ${r.b}: unpolarised R is monotone in cos? ${r.mono}; its minimum over (0,1] is ${r.minV.toFixed(9)} at cos ${r.minAt.toFixed(4)}, and F0 = ${r.F0.toFixed(9)}. Brewster is at cos ${r.cB.toFixed(6)}`);

    ok("!! *** BREWSTER LEAVES NO FEATURE AT ALL IN UNPOLARISED LIGHT -- NOT A BLURRED ZERO, NOT A MINIMUM ***",
       rows.every((r) => r.mono && Math.abs(r.minV - r.F0) < 1e-12 && r.minAt === 1),
       `*** v3491's fresnel-selfcheck.mjs says a renderer working in unpolarised light "sees a MINIMUM at Brewster, never a zero". THE MEASUREMENT SAYS THERE IS NO MINIMUM. *** R = (R_s + R_p)/2 is STRICTLY MONOTONE in cos for every index pair here, and its least value over the whole range is F0, AT NORMAL INCIDENCE -- R_s climbs faster than R_p falls, everywhere. The check that sentence decorates is correct and still passes; the sentence understates it, and the stronger claim is the true one: the angle is not merely hard to see without polarisation, it is ABSENT. Corrected in that file by this round.`);

    ok("...and that is why the exact zero has to be read off an AMPLITUDE, which no renderer displays",
       rows.every((r) => rp(r.cB, r.a, r.b) ** 2 < 1e-20 && fresnel(r.cB, r.a, r.b).R > 0.019),
       `at Brewster the p amplitude is ${rp(brewsterCos(1, 1.5), 1, 1.5).toExponential(2)} -- an EXACT zero, passed through rather than approached -- while the unpolarised R a pixel would receive is ${fresnel(brewsterCos(1, 1.5), 1, 1.5).R.toFixed(6)}, on a curve with no feature there at all. THE KEY LIVES IN A QUANTITY THAT NEVER REACHES A PIXEL -- and section 3 runs a search for it in the quantity that does, on a device, to see what happens.`);
}

/* ------------------------------------------------------------------------------------------------------------
 * 3-6. THE DEVICE
 * --------------------------------------------------------------------------------------------------------- */
const V = await onDevice();
if (V) {
    /* --------------------------------------------------------------------------------------------------------
     * 3. THE EXACT EQUATIONS IN f32, AND THE ONE BAND WHERE THE FLOOR IS TWENTY TIMES WORSE
     * ----------------------------------------------------------------------------------------------------- */
    const curveStats = (key, n1, n2) => {
        const d = V[key];
        let wR = 0, atR = 0, wT = 0, wPow = 0, near = 0, far = 0;
        const cc = criticalCos(n1, n2);
        for (let i = 0; i < N; i++) {
            const ci = (i + 1) / N, f = fresnel(ci, n1, n2);
            const e = Math.abs(d[i * 6] - f.R);
            if (e > wR) { wR = e; atR = ci; }
            wT = Math.max(wT, Math.abs(d[i * 6 + 3] - f.T));
            wPow = Math.max(wPow, Math.abs(d[i * 6 + 4] - d[i * 6 + 5]));
            if (cc !== null) { if (Math.abs(ci - cc) < 0.02) near = Math.max(near, e); else far = Math.max(far, e); }
        }
        return { wR, atR, wT, wPow, near, far, cc };
    };
    const g15 = curveStats("curve15", 1, 1.5), g24 = curveStats("curve24", 1, 2.4), gT = curveStats("curveTIR", 1.5, 1);
    report(`f32 vs f64 over ${N} exactly-representable cosines: air/glass worst |dR| ${g15.wR.toExponential(3)} at cos ${g15.atR.toFixed(4)}, air/diamond ${g24.wR.toExponential(3)} at cos ${g24.atR.toFixed(4)}`);
    ok("!! the exact equations port to f32 at a floor of about 1e-7 wherever there is no critical angle",
       g15.wR < 2e-7 && g24.wR < 2e-7 && g15.wT < 5e-7 && g24.wT < 5e-7,
       `Both index pairs go higher-to-lower, so sin_t never approaches 1 and nothing cancels. The threshold is set from the measurement with room for a different device, and both pairs sit at 40% of it. THE COSINES ARE k/512 SO BOTH MACHINES EVALUATE THE SAME ARGUMENT EXACTLY -- a (k + 0.5)/512 grid would have measured the grid as well as the function.`);

    report(`glass -> air, critical cos ${gT.cc.toFixed(6)}: worst |dR| within 0.02 of it ${gT.near.toExponential(3)}, worst everywhere else ${gT.far.toExponential(3)} -- a factor of ${(gT.near / gT.far).toFixed(1)}`);
    ok("!! *** AND IT IS TWENTY TIMES WORSE IN A NARROW BAND AT TOTAL INTERNAL REFLECTION -- (1 - x^2) AGAIN ***",
       gT.near > 1e-6 && gT.far < 1e-6 && gT.near / gT.far > 8,
       `cos_t = sqrt(1 - sin_t^2) and sin_t -> 1 at the branch, so the subtraction loses the digits that the square root then halves. *** THIS IS THE FIFTH ROUND RUNNING IN WHICH (1 - c^2) IS THE ANSWER: v4408 found it wrecking the NDF integral, v4409 in the sampler's cdf, v4411 amplified by 1/(1 - E), v4413 one ULP amplified by 2/t, and here it is one f32 ULP amplified by the derivative of a square root at zero. *** The damage is LOCALISED -- outside the band this pair is as good as the other two -- which is why a worst-case number over a whole sweep would have reported one bad floor and hidden that the function is fine everywhere else.`);

    ok("!! and pow(m, 5.0) is not a spelling of m*m*m*m*m -- they differ by five times the curve's own floor",
       g15.wPow > 1e-7 && g15.wPow < 1e-5,
       `worst gap ${g15.wPow.toExponential(3)} against a curve floor of ${g15.wR.toExponential(3)}. A GPU's pow is exp2(y * log2(x)) and Schlick's fifth power is four multiplies; a port that reaches for pow has chosen a different function. Neither is wrong -- but a gate holding a ported Schlick to 1e-7 against its CPU twin would fail on the spelling alone and the author would go looking at the physics.`);

    /* --------------------------------------------------------------------------------------------------------
     * 4. BREWSTER THREE WAYS ON ONE DEVICE, AND A GUARD THAT SURVIVES THE PORT BY LUCK
     * ----------------------------------------------------------------------------------------------------- */
    const brows = [["brew15", 1, 1.5], ["brew24", 1, 2.4], ["brew133", 1, 1.33]].map(([k, n1, n2]) => {
        const d = V[k], want = brewsterCos(n1, n2);
        return { k, n1, n2, want, sign: d[0], minRp: d[1], minR: d[2], rpSign: d[3], rpMin: d[4], Rmin: d[5],
                 eSign: Math.abs(d[0] - want), eMinRp: Math.abs(d[1] - want), eMinR: Math.abs(d[2] - want) };
    });
    for (const b of brows) report(`n ${b.n1} -> ${b.n2}: sign route ${b.sign.toFixed(9)} (err ${b.eSign.toExponential(3)}) | r_p^2 minimum ${b.minRp.toFixed(9)} (err ${b.eMinRp.toExponential(3)}) | unpolarised minimum ${b.minR.toFixed(9)} (err ${b.eMinR.toExponential(3)}) | want ${b.want.toFixed(9)}`);

    ok("!! Brewster's angle survives f32 to about 1e-7 by BOTH routes that read the p amplitude",
       brows.every((b) => b.eSign < 5e-7 && b.eMinRp < 5e-7),
       `*** I EXPECTED THE MINIMUM ROUTE TO LOSE HALF THE MACHINE'S DIGITS AND IT DOES NOT. *** The folklore is that hunting a flat minimum costs sqrt(eps), and it is right whenever the flatness comes from CANCELLATION. Here r_p is computed and then SQUARED, and a square is a product: it keeps full relative precision however small it gets, so comparing two of them resolves the angle as finely as f32 can represent the angle at all. THE FLATNESS IS IN THE VALUE, NOT IN THE ERROR. This is the prediction the round got wrong, and the number is why it is recorded rather than quietly dropped.`);

    ok("!! *** AND THE ONE ROUTE A RENDERER COULD ACTUALLY RUN FAILS OUTRIGHT -- IT RUNS TO THE BRACKET'S END ***",
       brows.every((b) => b.eMinR > 0.3 && b.minR > 0.99),
       `the search for a minimum of the UNPOLARISED reflectance returns cos ${brows[0].minR.toFixed(6)}, ${brows[0].eMinR.toFixed(3)} away from Brewster, and reports R = ${brows[0].Rmin.toExponential(6)} -- which is F0. *** IT IS NOT IMPRECISE. IT IS SEARCHING FOR SOMETHING THAT IS NOT THERE: *** section 2 measured R strictly monotone in cos, so the minimum really is at normal incidence and a correct search finds it. A gate that had only asserted "the recovered angle is within 1e-3" would have called this a precision problem on a device and gone hunting for an f32 fix.`);

    const degF = V.brewDeg, degR = V.brewDegNoFloor, pF = V.brewP;
    report(`n1 = n2 on the device: bracket endpoints ${degF[6].toExponential(3)} and ${degF[7].toExponential(3)}; at f64 the same two are ${rp(0.01, 1, 1).toExponential(3)} and ${rp(0.999, 1, 1).toExponential(3)}`);
    ok("!! the bisection REFUSES on the device -- both for a degenerate interface and for the polarisation plant",
       degF[0] === -1 && pF[0] === -1,
       `-1 is the sentinel for "no such angle". At n1 = n2 there is no interface; under FAULT.pForS the p amplitude has become r_s, which never changes sign, so there is no root to bracket. *** "NO BREWSTER ANGLE EXISTS" IS A LOUDER ANSWER THAN A WRONG ONE *** -- v3424's correction, now holding at f32 as well.`);

    ok("!! ...and with the magnitude floor removed it returns an angle for an interface that does not exist",
       degR[0] > 0 && degR[0] < 0.9,
       `cos ${degR[0].toFixed(6)}, bisected on rounding noise. THIS IS fresnel.mjs's OWN RECORDED FIRST-VERSION BUG, reproduced on a device: a signs-only guard reads dust as a sign change. *** AND THE FLOOR SURVIVES THE PORT BY LUCK RATHER THAN BY THE CONDITION IT WAS WRITTEN FOR: *** the lower endpoint's dust is ${Math.abs(degF[6]).toExponential(3)} at f32 against ${Math.abs(rp(0.01, 1, 1)).toExponential(3)} at f64, NINE ORDERS LARGER, so eps = 1e-9 trips on that endpoint at f64 and NOT at f32 -- what refuses here is the other endpoint, which happens to be exactly zero at both precisions. A threshold earned at one precision is not earned at the other, and this one is one bracket away from not working.`);

    /* --------------------------------------------------------------------------------------------------------
     * 5. THE CRITICAL ANGLE FROM A BOOLEAN, AND A BRANCH THAT IS EXACT AT ANY PRECISION
     * ----------------------------------------------------------------------------------------------------- */
    const crows = [["crit15", 1.5, 1], ["crit24", 2.4, 1]].map(([k, n1, n2]) => {
        const d = V[k], want = criticalCos(n1, n2);
        return { k, n1, n2, want, found: d[0], err: Math.abs(d[0] - want), rsIn: d[1], rsOut: d[2], tsIn: d[3] };
    });
    for (const c of crows) report(`n ${c.n1} -> ${c.n2}: critical cos bisected on a YES/NO to ${c.found.toFixed(9)} against sqrt(1 - (n2/n1)^2) = ${c.want.toFixed(9)}, err ${c.err.toExponential(3)}`);
    ok("!! *** THE CRITICAL ANGLE COMES BACK FROM A BOOLEAN ON A DEVICE, TO THE f32 FLOOR ***",
       crows.every((c) => c.err < 2e-7),
       `The device bisection asks only WHETHER a transmitted ray exists. *** THERE IS NO MAGNITUDE IN THE LOOP FOR A COMPENSATING ERROR TO HIDE IN, *** and that is exactly why this key ports better than the reflectance curve does: section 3's worst f32 error near this same angle is ${gT.near.toExponential(3)}, twenty times larger than the error in the angle recovered from the branch that error surrounds.`);

    ok("!! ...and past it R is EXACTLY 1 and T EXACTLY 0 in f32, which no tolerance produces",
       crows.every((c) => c.rsIn === 1 && c.tsIn === 0 && c.rsOut < 1),
       `R_s = ${crows[0].rsIn} and T_s = ${crows[0].tsIn} one percent inside the critical angle, ${crows[0].rsOut.toFixed(6)} one percent outside. A BIFURCATION IS A BRANCH, NOT A LIMIT: there is no transmitted ray at all past it, so the value is written rather than computed and f32 carries it as faithfully as f64.`);

    /* --------------------------------------------------------------------------------------------------------
     * 6. ENERGY IN f32, AND THE DETECTION SPLIT RE-MEASURED WHERE THE ROUNDING IS DIFFERENT
     * ----------------------------------------------------------------------------------------------------- */
    const worstClose = (key) => { const d = V[key]; let w = 0, at = 0; for (let i = 0; i < N; i++) { const e = Math.max(Math.abs(d[i * 2]), Math.abs(d[i * 2 + 1])); if (e > w) { w = e; at = (i + 1) / N; } } return { w, at }; };
    const e15 = worstClose("en15"), e24 = worstClose("en24"), eNoK = worstClose("enNoK");
    let f64worst = 0;
    for (const [a, b] of [[1, 1.5], [1, 2.4]]) for (let i = 1; i <= N; i++) { const f = fresnel(i / N, a, b); if (!f.tir) f64worst = Math.max(f64worst, Math.abs(f.Rs + f.Ts - 1), Math.abs(f.Rp + f.Tp - 1)); }
    report(`worst |R + T - 1|: device ${e15.w.toExponential(4)} (air/glass) and ${e24.w.toExponential(4)} (air/diamond) against f64's ${f64worst.toExponential(3)}; with the solid-angle ratio dropped, ${eNoK.w.toFixed(6)} at cos ${eNoK.at.toFixed(4)}`);
    ok("!! energy closes on f32 to about 3e-7 with T computed from the transmission amplitudes, not as 1 - R",
       e15.w < 1e-6 && e24.w < 1e-6 && f64worst < 1e-14,
       `${(e15.w / f64worst).toExponential(1)} times the f64 residual, which is what nine fewer bits of mantissa buys. THE CLOSURE IS ONLY A CHECK BECAUSE THE TWO SIDES ARE INDEPENDENT: T carries (n2 cos_t)/(n1 cos_i) and is computed from t_s and t_p, so R + T = 1 is a fact about the interface rather than an identity about arithmetic.`);

    ok("!! ...and the missing solid-angle ratio is SIX ORDERS above that floor, so f32 does not hide it",
       eNoK.w > 0.4,
       `${eNoK.w.toFixed(6)} against a floor of ${e15.w.toExponential(3)}. *** THAT IS NOT AUTOMATIC. *** A plant whose signature is a few ULP at f64 can be swallowed whole by a port; this one is half the energy, and the f32 machine reports it as loudly as f64 does.`);

    const c15 = V.curve15, p15 = V.curveP;
    const coincide = [];
    for (let i = 0; i < N; i++) if (c15[i * 6] === p15[i * 6]) coincide.push((i + 1) / N);
    const gaps = [1, 2, 4, 8].map((k) => Math.abs(c15[k - 1] * 0 + c15[(k - 1) * 6] - p15[(k - 1) * 6]));
    const ratios = [gaps[1] / gaps[0], gaps[2] / gaps[1], gaps[3] / gaps[2]];
    report(`pForS on the device: bit-identical to the clean run at cos ${coincide.join(", ")} and NOWHERE ELSE; toward grazing the gap is ${gaps.map((g) => g.toExponential(3)).join(" <- ")} at cos 1/512, 2/512, 4/512, 8/512`);
    ok("!! *** THE POLARISATION PLANT IS BIT-IDENTICAL AT NORMAL INCIDENCE ON f32 TOO, AND ONLY THERE ***",
       coincide.length === 1 && coincide[0] === 1 && ratios.every((r) => Math.abs(r - 2) < 0.15),
       `*** THE TWO POLARISATIONS COINCIDE EXACTLY AT cos = 1, and a different rounding could have broken that tie either way -- it did not, because both amplitudes reduce to the SAME expression there and the machine rounds one number once. *** Toward grazing the gap halves with cos, ${ratios.map((r) => r.toFixed(3)).join(" / ")} per doubling: LINEAR, so the nearer you look to the place people check by hand, the more invisible the fault becomes. v3491 measured that law at f64 and it survives the port unchanged, which makes it arithmetic rather than precision.`);

    /* --------------------------------------------------------------------------------------------------------
     * 7. THE LOBE, CARRYING A REAL FRESNEL TERM ON A DEVICE
     * ----------------------------------------------------------------------------------------------------- */
    const A = (k) => albedoOf(V[k], NSAMP);
    const dW5 = A("albW5"), dS5 = A("albS5"), dM5 = A("albM5"), dS10 = A("albS10"), dM10 = A("albM10");
    const gap5 = Math.abs(dS5.E - dM5.E), gap10 = Math.abs(dS10.E - dM10.E);
    report(`the collision on a device: alpha 0.5 broken ${dS5.E.toFixed(9)} against metal ${dM5.E.toFixed(9)} (gap ${gap5.toExponential(3)}), alpha 1 gap ${gap10.toExponential(3)}; the metal's transmitted share is ${dM5.T.toFixed(9)} and ${dM10.T.toFixed(9)}`);
    ok("!! *** THE COLLISION IS NOT AN f64 ARTEFACT: THE SAME INDEX COLLIDES ON f32 TO THE DEVICE'S OWN FLOOR ***",
       gap5 < 1e-7 && gap10 < 1e-7 && dS5.T === 0 && dS10.T === 0 && dM5.T > 4e-3 && dM10.T > 1.5e-2,
       `The F0 was bisected for at f64 in section 1 and handed to the device unchanged, and the two albedos still land ${gap5.toExponential(3)} apart -- inside the f32 sampler's own noise. *** SO THE DISCRIMINATOR IS ${(dM5.T / gap5).toExponential(1)} TIMES THE THING IT HAS TO SEE PAST, *** and it is a share of the SAME samples rather than a second experiment. *** THE METAL's SHARE IS ASSERTED HERE AS WELL AS THE BROKEN LOBE's ZERO, because a sabotage that simply never accumulated the transmitted share went ONE red instead of two: this check read only the zero, which a fault producing zeroes everywhere satisfies. A CHECK THAT ONLY EVER LOOKS AT THE SIDE THAT IS SUPPOSED TO BE EMPTY CANNOT TELL EMPTY FROM BROKEN. ***`);

    ok("...and the split that is EXACT by linearity at f64 costs 5e-8 on a device, which is the accounting's floor",
       Math.abs(dM5.E + dM5.T - dM5.one) < 1e-6 && Math.abs(A("albEx5").E + A("albEx5").T - A("albEx5").one) < 1e-6 && dW5.T === 0,
       `|R + T - one| = ${Math.abs(dM5.E + dM5.T - dM5.one).toExponential(3)} over ${NSAMP} samples on the metal and ${Math.abs(A("albEx5").E + A("albEx5").T - A("albEx5").one).toExponential(3)} on glass. Section 1 established the identity holds to 2e-15 at f64 BY LINEARITY, so this measures nothing about the physics and everything about SUMMATION ORDER -- three running totals over 65536 f32 additions, split across 64 lanes. It is here to set the floor any claim built on the split has to clear, and the discriminator above clears it by ${(dM5.T / Math.abs(dM5.E + dM5.T - dM5.one)).toExponential(1)}.`);

    const rel = (k) => { const e = A("albEx_" + k), s = A("albSc_" + k); return Math.abs(s.E - e.E) / e.E; };
    const relLo = rel(LADDER[0]), rel5 = Math.abs(A("albSc5").E - A("albEx5").E) / A("albEx5").E;
    const single = Math.abs(schlick(COS_O, F0of(1, 1.5)) - fresnel(COS_O, 1, 1.5).R) / fresnel(COS_O, 1, 1.5).R;
    report(`Schlick inside the lobe: ${(relLo * 100).toFixed(2)}% short at alpha ${LADDER[0]} and ${(rel5 * 100).toFixed(2)}% at alpha 0.5, against a single-angle error at cos_o of ${(single * 100).toFixed(2)}%`);
    ok("!! *** ROUGHNESS DOES NOT AMPLIFY SCHLICK'S ERROR, IT AVERAGES IT AWAY ***",
       Math.abs(relLo - single) < 0.005 && rel5 < relLo - 0.02,
       `A near-mirror reproduces the single-angle error exactly, as it must -- every microfacet is the surface. At alpha 0.5 the lobe spreads over angles where Schlick's signed error CHANGES SIGN (it is ${((schlick(0.7, 0.04) - fresnel(0.7, 1, 1.5).R) * 100).toFixed(2)} points at cos 0.7 and ${((schlick(0.1, 0.04) - fresnel(0.1, 1, 1.5).R) * 100).toFixed(2)} at cos 0.1), so the average partly cancels. THE APPROXIMATION GETS BETTER AS THE SURFACE GETS ROUGHER, which is the opposite of the usual instinct -- AND IT IS STILL ${(rel5 * 100).toFixed(0)}% OF THE REFLECTED ENERGY, on a term v3491 called "exact at both ends".`);

    const bugs = LADDER.map((a) => ({ a, gap: Math.abs(A("albBug_" + a).E - A("albEx_" + a).E) }));
    report(`Fresnel at the macroscopic cosine instead of the microfacet's: ${bugs.map((b) => `alpha ${b.a} -> ${b.gap.toExponential(3)}`).join(", ")}`);
    ok("!! and evaluating F at cos_o instead of dot(wo, wh) is a bias a SMOOTH fixture cannot see",
       bugs.every((b, i) => i === 0 || b.gap > bugs[i - 1].gap) && bugs[0].gap < 5e-5 && bugs[bugs.length - 1].gap > 1e-3 && bugs[1].gap / bugs[0].gap > 4,
       `${bugs[0].gap.toExponential(3)} at alpha ${LADDER[0]} against ${bugs[bugs.length - 1].gap.toExponential(3)} at alpha ${LADDER[LADDER.length - 1]}: a factor of ${(bugs[bugs.length - 1].gap / bugs[0].gap).toFixed(0)} for a factor of ${(LADDER[LADDER.length - 1] / LADDER[0]).toFixed(0)} in roughness, and SUPER-LINEAR at the smooth end (x${(bugs[1].gap / bugs[0].gap).toFixed(1)} for x4 in alpha) because the two angles differ at second order in alpha. *** FRESNEL IS A FUNCTION OF THE ANGLE AT THE MICROFACET. *** A material test done on polished metal certifies this bug and a rough one does not, which is the wrong way round from how materials get authored.`);
}

async function onDevice() {
    const skip = webgpuSkipReason();
    if (skip) { ok("device jobs ran", false, "SKIP: " + skip + " -- a SKIP counts as a fail here; this gate's whole subject is what f32 does to Fresnel"); return null; }
    const P = (o) => [...new Uint8Array(packFresnelParams(o).buf)];
    const curve = (key, n1, n2, faults = 0) => ({ key, out: N * 6, lanes: N, pack: P({ mode: MODE.curve, faults, laneCount: N, count: N, n1, n2, f0: F0of(n1, n2) }) });
    const brew = (key, n1, n2, faults = 0, eps = EPS) => ({ key, out: 8, lanes: 1, pack: P({ mode: MODE.brewster, faults, laneCount: 1, n1, n2, eps }) });
    const alb = (key, o) => ({ key, out: LANES * 4, lanes: LANES, pack: P({ mode: MODE.albedo, laneCount: LANES, nSamp: NSAMP, cosO: COS_O, ...o }) });
    const jobs = [
        curve("curve15", 1, 1.5), curve("curve24", 1, 2.4), curve("curveTIR", 1.5, 1), curve("curveP", 1, 1.5, FAULT.pForS),
        brew("brew15", 1, 1.5), brew("brew24", 1, 2.4), brew("brew133", 1, 1.33),
        brew("brewP", 1, 1.5, FAULT.pForS), brew("brewDeg", 1, 1), brew("brewDegNoFloor", 1, 1, 0, 0),
        { key: "crit15", out: 4, lanes: 1, pack: P({ mode: MODE.critical, laneCount: 1, n1: 1.5, n2: 1 }) },
        { key: "crit24", out: 4, lanes: 1, pack: P({ mode: MODE.critical, laneCount: 1, n1: 2.4, n2: 1 }) },
        { key: "en15", out: N * 2, lanes: N, pack: P({ mode: MODE.energy, laneCount: N, count: N, n1: 1, n2: 1.5 }) },
        { key: "en24", out: N * 2, lanes: N, pack: P({ mode: MODE.energy, laneCount: N, count: N, n1: 1, n2: 2.4 }) },
        { key: "enNoK", out: N * 2, lanes: N, pack: P({ mode: MODE.energy, faults: FAULT.noTransmissionFactor, laneCount: N, count: N, n1: 1, n2: 1.5 }) },
        alb("albW5", { variant: VARIANT.schlickLobe, alpha: 0.5, f0: 1 }),
        alb("albS5", { variant: VARIANT.schlickLobe | VARIANT.separableG, alpha: 0.5, f0: 1 }),
        alb("albM5", { variant: VARIANT.schlickLobe, alpha: 0.5, f0: COLLIDED[0.5].F0 }),
        alb("albS10", { variant: VARIANT.schlickLobe | VARIANT.separableG, alpha: 1.0, f0: 1 }),
        alb("albM10", { variant: VARIANT.schlickLobe, alpha: 1.0, f0: COLLIDED[1.0].F0 }),
        alb("albEx5", { alpha: 0.5, n1: 1, n2: 1.5 }),
        alb("albSc5", { variant: VARIANT.schlickLobe, alpha: 0.5, f0: F0of(1, 1.5) }),
    ];
    for (const a of LADDER) {
        jobs.push(alb("albEx_" + a, { alpha: a, n1: 1, n2: 1.5 }));
        jobs.push(alb("albBug_" + a, { variant: VARIANT.fAtCosO, alpha: a, n1: 1, n2: 1.5 }));
        jobs.push(alb("albSc_" + a, { variant: VARIANT.schlickLobe, alpha: a, f0: F0of(1, 1.5) }));
    }

    const r = await runInEngineOrigin({ engineRoot: ENG, timeoutMs: 180000, args: { jobs, wgsl: FRESNEL_WGSL }, script: `async (a) => {
        const out = { v: {}, compileErrors: [] };
        try {
            if (!navigator.gpu) throw new Error("no navigator.gpu in this page");
            const adapter = await navigator.gpu.requestAdapter(); if (!adapter) throw new Error("no adapter");
            const dev = await adapter.requestDevice();
            const m = dev.createShaderModule({ code: a.wgsl });
            const info = await m.getCompilationInfo?.();
            for (const g of (info ? info.messages : [])) if (g.type === "error") out.compileErrors.push("line " + g.lineNum + ": " + g.message.slice(0, 160));
            if (out.compileErrors.length) return out;
            const pipe = dev.createComputePipeline({ layout: "auto", compute: { module: m, entryPoint: "fres" } });
            for (const j of a.jobs) {
                const uni = dev.createBuffer({ size: j.pack.length, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
                dev.queue.writeBuffer(uni, 0, new Uint8Array(j.pack));
                const bytes = j.out * 4;
                const pb = dev.createBuffer({ size: bytes, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC });
                const bg = dev.createBindGroup({ layout: pipe.getBindGroupLayout(0), entries: [
                    { binding: 0, resource: { buffer: uni } }, { binding: 1, resource: { buffer: pb } } ] });
                const enc = dev.createCommandEncoder(); const p = enc.beginComputePass();
                p.setPipeline(pipe); p.setBindGroup(0, bg); p.dispatchWorkgroups(Math.ceil(j.lanes / 64)); p.end();
                const rb = dev.createBuffer({ size: bytes, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
                enc.copyBufferToBuffer(pb, 0, rb, 0, bytes); dev.queue.submit([enc.finish()]);
                await rb.mapAsync(GPUMapMode.READ); out.v[j.key] = [...new Float32Array(rb.getMappedRange().slice(0))];
                rb.unmap(); rb.destroy(); pb.destroy(); uni.destroy();
            }
        } catch (e) { out.error = String(e && e.message || e).slice(0, 600); }
        return out;
    }` });

    ok("*** the exact Fresnel equations, Schlick, and a GGX lobe carrying one of them COMPILE AND RUN on a device ***",
        r.ok && r.result && !r.result.error && (r.result.compileErrors || []).length === 0,
        r.ok ? (r.result && r.result.error) || ((r.result && r.result.compileErrors || []).join("; ") || `${jobs.length} jobs: the reflectance curve, three searches for Brewster, the critical angle from a boolean, the closure, and the lobe`) : (r.reason || (r.pageErrors || []).join("; ")));
    if (!r.ok || !r.result || r.result.error || (r.result.compileErrors || []).length) return null;
    return r.result.v;
}

console.log(fails ? `\n${fails} FAILURE(S)` : "\nALL GREEN");
process.exit(fails ? 1 : 0);

/* -----------------------------------------------------------------------------------------------------------
 * SABOTAGE LOG -- 0 / 2 / 2 / 7 / 2 / 1 / 3 / 2 / 1 by name, AND THE 0 IS THE ONE WORTH READING.
 *
 * A. The lobe's transmitted share computed as sOne - sR after the loop instead of accumulated
 *    as (1 - F) * w inside it.                                                                      0 RED
 *    *** AND IT SHOULD GO 0 RED, WHICH IS WHY IT IS FIRST. *** sum (1 - F) w and sum w - sum F w are the same
 *    quantity; no check can separate them and none should claim to. This sabotage exists to hold section 1's
 *    correction in place: the first draft of that section borrowed fresnel-selfcheck.mjs's "T is never
 *    defined as 1 - R" for a place the sentence does not apply. At ONE INTERFACE T is computed from the
 *    transmission amplitudes and R + T = 1 is a real closure -- section 6 measures it, and sabotage C drives
 *    it red. In the LOBE the split is exact by linearity and buys ATTRIBUTION, not independence. Had the
 *    first draft shipped, this sabotage would have gone 0 red against a check that claimed it could not.
 *
 * B. The transmitted share never accumulated at all -- (1 - F) * w replaced by 0 * w.                2 RED
 *    *** IT WENT 1 RED FIRST AND BOUGHT THE SECOND. *** The device collision check asserted only that the
 *    BROKEN lobe's transmitted share is zero, which a fault producing zeroes everywhere satisfies. A check
 *    that only ever looks at the side that is supposed to be empty cannot tell empty from broken; the metal's
 *    share is now asserted alongside it.
 *
 * C. The (n2 cos_t)/(n1 cos_i) ratio dropped from fresnelAt's clean path -- FAULT.noTransmissionFactor
 *    made permanent, which is the commonest real mistake in this subject.                            2 RED
 *    The closure, and the reflectance curve's own floor -- because with the plant on the clean path there is
 *    nothing left for the plant job to differ from.
 *
 * D. Snell inverted inside fresnelAt: (n2/n1) sin_i where (n1/n2) sin_i belongs.                     7 RED
 *    The broadest, as an inverted index ratio should be: it moves the curve, invents a critical angle where
 *    there is none and removes the one there is, and reaches all the way into the lobe.
 *
 * E. rpAmp returns the s amplitude on its CLEAN path -- the polarisation swap made permanent.        2 RED
 *    Both Brewster routes that read r_p. Correctly NOT the unpolarised route, which is looking for a feature
 *    that does not exist either way, and correctly not the curve, which reads fresnelAt rather than rpAmp.
 *
 * F. The separable-G2 variant bit inverted, so the "broken" lobe is the correct one.                 1 RED
 *    Narrow and correctly so: only the device collision reads that bit. The CPU collision in section 1 uses
 *    microfacet.mjs's own G2 and is untouched, which is the point of grading a port against a separate
 *    transcription rather than against itself.
 *
 * G. The lobe evaluates F at cos_o always -- VARIANT.fAtCosO made permanent.                         3 RED
 *    The roughness ladder, the Schlick comparison, and the collision. Every check that reads the lobe.
 *
 * H. microfacet.mjs's directionalAlbedoSplit evaluates Fof at cos_o instead of dot(wo, wh).          2 RED
 *    The CPU half of G, and it takes the headline with it: the collision is no longer bit-identical, because
 *    the bisection is now solving a different problem from the one the device runs.
 *
 * I. The Brewster bracket's magnitude floor removed, leaving a signs-only guard.                     1 RED
 *    The refusal check. This is fresnel.mjs's own recorded first-version bug, and section 4 runs it
 *    deliberately as a fixture as well -- so the sabotage confirms the fixture is load-bearing rather than
 *    decorative.
 * --------------------------------------------------------------------------------------------------------- */
