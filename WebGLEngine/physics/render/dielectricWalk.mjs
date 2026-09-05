// physics/render/dielectricWalk.mjs -- v4447 -- the ground truth v4436's excess never had.
//
// *** v4436 MEASURED THE ROUGH DIELECTRIC CREATING TWENTY-EIGHT PER CENT MORE LIGHT THAN ARRIVED, AND SAID
// PLAINLY THAT IT COULD NOT SAY WHY. *** Its honest scope: "WHY the single-scatter BTDF gains where the BRDF
// loses is NOT DERIVED here, only measured and localised." It cleared the reflection lobe against an
// independently graded module and left the transmission lobe accused without a trial. v4446 built the
// conductor walk and noted it was conductor-only, so the dielectric still had no ground truth. This is it.
//
// The method is Heitz et al. 2016 again, extended to refraction: the same microsurface, the same height walk,
// with a stochastic choice of reflection or refraction at each microfacet by its Fresnel reflectance, and the
// ray tracked across the interface. A paper, not a repository. Nothing vendored.
//
// ---- *** VALIDATED TWICE BEFORE IT IS BELIEVED, AS v4446 INSISTED *** -------------------------------------
//
//   THE SMOOTH LIMIT.  At alpha 0.002 the walk gives R = 0.050833, T = 0.949167 against the exact Fresnel
//                      equations' 0.050917 and 0.949083 -- a bounce simulation arriving at a closed form
//                      graded rounds ago in physics/render/fresnel.mjs.
//   TERMINATION.       R + T = 1.000000 at every roughness with ZERO stuck paths. Every path leaves; nothing
//                      is lost to the bounce cap, which is what makes the split meaningful rather than a
//                      normalisation.
//
// ---- *** AND THE VERDICT ON v4436, WHICH IS SHARPER THAN THE ACCUSATION *** --------------------------------
//
//     alpha  cosO   Walter single-scatter T   walk T (one bounce)   walk T (all bounces)
//     1      0.25   1.244351                  0.306750              0.953675
//     1      0.7    1.068211                  0.738650              0.978912
//     0.4    0.25   1.081830                  0.747337              0.907563
//     0.05   0.7    0.949566                  0.946600              0.947237
//
// *** THE BTDF IS NOT MERELY MISSING MULTIPLE SCATTERING. IT OVER-COUNTS ITS OWN SINGLE-SCATTER LOBE, BY A
// FACTOR OF FOUR AT ROUGHNESS 1 AND GRAZING INCIDENCE. *** That is the innocent explanation ruled out: had
// the excess been absent multiple scattering, the walk's SINGLE-BOUNCE transmission would have matched
// Walter's and the total would have exceeded it. It is the other way round -- the walk's single bounce is
// 0.3068 where Walter says 1.2444, and even the walk's FULL multiple-scattering total, 0.9537, is below it.
// And all three agree at alpha 0.05, which is what makes the disagreement at alpha 1 mean something rather
// than being two unrelated calculations.

import { sampleVNDF, sampleHeight, rng } from "./microsurfaceWalk.mjs";
import { fresnel } from "./fresnel.mjs";

"use strict";

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const nrm = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };

/** Refract `wi` about `n` with relative index eta = n_incident / n_transmitted. Null on total internal
 *  reflection, which is a BRANCH rather than a small number -- v4436's rule, and the same one here. */
export function refract(wi, n, eta) {
    const c = dot(wi, n);
    const k = 1 - eta * eta * (1 - c * c);
    if (k < 0) return null;
    const f = eta * c + Math.sqrt(k);
    return nrm([eta * wi[0] - f * n[0], eta * wi[1] - f * n[1], eta * wi[2] - f * n[2]]);
}

/**
 * One path through a rough dielectric slab interface.
 *
 * *** THE RAY IS TRACKED ACROSS THE INTERFACE BY FLIPPING THE FRAME RATHER THAN BY DUPLICATING THE WALK. ***
 * Once inside, "escape" means leaving DOWNWARD, and the height walk's sense of up is inverted. Negating the
 * z of the direction and the height lets the same sampleHeight and sampleVNDF serve both sides, which matters
 * because a second copy of that arithmetic is a second thing to get the sign of Lambda wrong in -- and v4446
 * spent a run finding that sign the first time.
 */
// *** v4455 ADDED `dir` TO THE RETURN, AND IT IS ONE LINE THAT TURNED A TOTAL INTO A DIAGNOSIS. *** This
// walk already knew which direction each path left in; it threw it away and reported only reflected /
// transmitted / stuck. v4447 could therefore say the BTDF over-counts by 4.07x and could NOT say where,
// because a scalar has no shape to compare against. With the exit direction kept, binning by |dir.z| shows
// the single-scatter walk giving EXACTLY ZERO in the two bins Walter pays 9.8% of its energy into, which is
// what btdfDomain.mjs convicts on. The measurement that was missing was not a harder one; it was the one
// nobody kept.
export function dielectricWalk(cosO, alpha, nAbove, nBelow, rand, { maxBounces = 128 } = {}) {
    const so = Math.sqrt(Math.max(0, 1 - cosO * cosO));
    let wr = [-so, 0, -cosO];
    let h = 1 + 1e-4, outside = true, bounces = 0, tir = 0;
    while (bounces < maxBounces) {
        const s = outside ? 1 : -1;
        const hNext = sampleHeight([wr[0], wr[1], s * wr[2]], s * h, rand(), alpha);
        if (!Number.isFinite(hNext)) return { exit: outside ? "reflected" : "transmitted", bounces, tir, dir: wr };
        h = s * hNext;
        const wo = [-wr[0], -wr[1], -wr[2]];
        const wmFlip = sampleVNDF([wo[0], wo[1], s * wo[2]], alpha, rand(), rand());
        const wm = [wmFlip[0], wmFlip[1], s * wmFlip[2]];
        const nI = outside ? nAbove : nBelow, nT = outside ? nBelow : nAbove;
        const F = fresnel(Math.abs(dot(wo, wm)), nI, nT).R;
        const reflectAbout = () => {
            const d = dot(wr, wm);
            wr = [wr[0] - 2 * d * wm[0], wr[1] - 2 * d * wm[1], wr[2] - 2 * d * wm[2]];
        };
        if (rand() < F) {
            reflectAbout();
        } else {
            const nn = dot(wr, wm) < 0 ? wm : [-wm[0], -wm[1], -wm[2]];
            const t = refract(wr, nn, nI / nT);
            // Fresnel already returns R = 1 past the critical angle, so a null here is the numerical edge of
            // that same branch rather than a second physical case. Reflect, and COUNT it.
            if (t === null) { reflectAbout(); tir++; } else { wr = t; outside = !outside; }
        }
        bounces++;
    }
    return { exit: "stuck", bounces, tir, dir: wr };
}

/**
 * The reflected and transmitted fractions. `onlyBounces` restricts which path lengths are counted, which is
 * what separates "the BTDF is missing multiple scattering" from "the BTDF over-counts one bounce".
 */
export function split(cosO, alpha, nAbove, nBelow,
                      { n = 80000, seed = 13, onlyBounces = null, maxBounces = 128 } = {}) {
    const rand = rng(seed);
    let R = 0, T = 0, stuck = 0, bounceTotal = 0;
    for (let k = 0; k < n; k++) {
        const r = dielectricWalk(cosO, alpha, nAbove, nBelow, rand, { maxBounces });
        bounceTotal += r.bounces;
        if (r.exit === "stuck") { stuck++; continue; }
        if (onlyBounces !== null && r.bounces !== onlyBounces) continue;
        if (r.exit === "reflected") R++; else T++;
    }
    return { R: R / n, T: T / n, total: (R + T) / n, stuck, meanBounces: bounceTotal / n, n };
}

// *** THE RECORD, FROZEN BY NAME (v4399's rule). v4436's excess, tried and localised. ***
export const BTDF_AT_V4447 = Object.freeze({
    at: "v4447",
    accused: "physics/render/transmission.mjs's single-scatter BTDF, which v4436 measured creating up to " +
             "28% more light than arrived (worst total 1.28276 at alpha 1, cosO 0.25) and could not explain",
    verdict: "IT OVER-COUNTS ITS OWN SINGLE-SCATTER LOBE, by a factor of four at alpha 1 and cosO 0.25. The " +
             "innocent explanation -- that the excess was absent multiple scattering -- is ruled out, because " +
             "the walk's SINGLE-BOUNCE transmission is 0.3068 where Walter says 1.2444, and even the walk's " +
             "full multiple-scattering total is 0.9537, still below it.",
    rows: Object.freeze([
        Object.freeze({ alpha: 1.0, cosO: 0.25, walter: 1.244351, walkOne: 0.306750, walkAll: 0.953675 }),
        Object.freeze({ alpha: 1.0, cosO: 0.7, walter: 1.068211, walkOne: 0.738650, walkAll: 0.978912 }),
        Object.freeze({ alpha: 0.4, cosO: 0.25, walter: 1.081830, walkOne: 0.747337, walkAll: 0.907563 }),
        Object.freeze({ alpha: 0.05, cosO: 0.7, walter: 0.949566, walkOne: 0.946600, walkAll: 0.947237 }),
    ]),
    agreeAt: "alpha 0.05, where all three sit within 0.003 -- which is what makes the disagreement at alpha 1 " +
             "a finding rather than two unrelated calculations",
});

// ---- *** THE DOOR (v3327's split) *** ---------------------------------------------------------------------
//
// v4461 -- registered at v4460 with nothing to render. The report re-runs the walk and prints Walter's
// number BESIDE it from the record rather than importing transmission.mjs, because the accusation in
// BTDF_AT_V4447 is against that module and an instrument that imports its defendant is not an instrument.

export function reportLines() {
    const L = [];
    const R = BTDF_AT_V4447;
    L.push("[dielectricWalk] a random walk on a rough dielectric, and where transmission.mjs's excess comes from");
    L.push("");
    L.push("  ACCUSED: " + R.accused);
    L.push("");
    L.push("  n = 40000 per row, nAbove 1, nBelow 1.5. `walter` is the recorded value at " + R.at + " --");
    L.push("  not recomputed here, because importing the module under accusation would make this its own witness.");
    L.push("");
    L.push("   alpha   cosO      R        T      R+T     one bounce   all bounces   walter (" + R.at + ")");
    for (const row of R.rows) {
        const one = split(row.cosO, row.alpha, 1, 1.5, { n: 40000, seed: 13, onlyBounces: 1 });
        const all = split(row.cosO, row.alpha, 1, 1.5, { n: 40000, seed: 13 });
        L.push("   " + String(row.alpha).padStart(5) + "   " + String(row.cosO).padStart(4) + "  " +
               all.R.toFixed(4).padStart(7) + "  " + all.T.toFixed(4).padStart(7) + "  " +
               all.total.toFixed(4).padStart(7) + "   " + one.T.toFixed(6).padStart(9) + "    " +
               all.T.toFixed(6).padStart(9) + "    " + row.walter.toFixed(6).padStart(9));
    }
    L.push("");
    // *** THE INNOCENT EXPLANATION IS RULED OUT BY THE THIRD COLUMN, NOT BY THE SECOND. *** "The excess is
    // missing multiple scattering" would require the walk's FULL total to exceed Walter's. It does not.
    L.push("  *** R + T <= 1 EVERYWHERE ABOVE -- the walk cannot create light, which is what makes it usable");
    L.push("      as a bound. Walter's single-scatter BTDF exceeds 1 at three of these four rows. ***");
    L.push("  VERDICT: " + R.verdict);
    L.push("  and the disagreement is a finding rather than two unrelated calculations because they AGREE at " +
           R.agreeAt);
    return L;
}
