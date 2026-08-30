// tools/roundhouse/kerrBind.mjs
//
// v2814 -- roundhouse device: the KERR rotating black hole (physics/blackhole/kerr.js). Distinct from the
// existing "blackhole" device, which is the Paczynski-Wiita pseudo-Newtonian potential -- this one is the exact
// Kerr geometry, so it can be asked about things PW has no opinion on: frame dragging, the ergosphere, and the
// prograde/retrograde split.
//
// Every observable is a closed form evaluated from the metric, so a claim about any of them is refused by
// arithmetic rather than by taste. Two are deliberately INVARIANTS rather than values -- horizonProductErr and
// horizonSumErr -- because r+ * r- = a^2 and r+ + r- = 2M must hold for EVERY spin, and an implementation that
// drifted would fail them everywhere at once.
//
// Modes:
//   "spin"        -- one spin. Reports horizons, ergosphere, photon orbits, ISCOs, shadow asymmetry, invariants.
//   "limit"       -- a=0. Reports the difference from the EXISTING Schwarzschild module's own exports, so a claim
//                    can be made about the two instruments agreeing.
//   "extremal"    -- a=M. The known exact values (horizon M, photon M and 4M, ISCO M and 9M).

import { iscoNumeric } from "../../physics/blackhole/kerr.js";
import { iscoDynamic } from "../../physics/blackhole/kerrOrbit.js";
import { kerrSummary, horizons, ergosphere, photonOrbits, criticalImpacts, isco, frameDragging, horizonAngularVelocity } from "../../physics/blackhole/kerr.js";
import { horizon as schwarzHorizon, photonSphere as schwarzPhoton, criticalImpact as schwarzShadow } from "../../physics/blackhole/geodesic.js";

export const KERR_OBSERVABLES = [
    "outerHorizon", "ergoEquator", "ergoThickness",
    "photonPrograde", "photonRetrograde", "iscoPrograde", "iscoRetrograde",
    "shadowAsymmetry", "omegaHorizon",
    "horizonProductErr", "horizonSumErr", "planted",
    "iscoNumericPrograde", "iscoNumericRetrograde", "iscoErrFrac",
    "iscoDynamicPrograde", "iscoDynamicErrFrac",
    "schwarzHorizonErr", "schwarzPhotonErr", "schwarzShadowErr",
    "dragAt5", "dragFalloffRatio",
];

const DEF = { M: 1, a: 0.6 };

export function kerrDefaults(hyp) {
    const h = { mode: "spin", ...(hyp || {}) };
    const c = { ...DEF, ...(h.config || {}) };
    const num = (v, d) => (typeof v === "number" && Number.isFinite(v) ? v : d);
    c.M = Math.min(100, Math.max(1e-6, num(c.M, DEF.M)));
    // clamp inside the horizon-bearing range: |a| <= M, or there is no black hole to measure
    c.a = Math.max(-c.M, Math.min(c.M, num(c.a, DEF.a)));
    h.config = c;
    if (!["spin", "limit", "extremal"].includes(h.mode)) h.mode = "spin";
    return h;
}

export async function buildKerr(hyp, base = {}) {
    const h = kerrDefaults({ ...hyp, config: { ...(hyp && hyp.config), ...base } });
    let { M, a } = h.config;
    if (h.mode === "limit") a = 0;
    if (h.mode === "extremal") a = M;

    // v3392 -- the linearised-discriminant plant. It reaches the horizon pair and NOTHING ELSE, which is the
    // point: one key is structurally blind to it and the other is not.
    const planted = !!(h.planted || (h.config && h.config.planted));
    const hz = horizons(M, a, { planted });
    if (hz.naked) return { error: "naked-singularity: |a| must be <= M" };
    const s = kerrSummary(M, a);
    const out = {
        // v3392 -- READ FROM hz, NOT FROM THE SUMMARY. The first version left this on kerrSummary's copy, so a
        // planted run reported an UNPLANTED horizon beside a PLANTED product: two declarations about one number
        // that nobody had compared, inside the round about telling keys apart. Unplanted they are the same
        // expression and the value is unchanged.
        outerHorizon: hz.outer,
        ergoEquator: s.ergoEquator,
        ergoThickness: s.ergoThickness,
        photonPrograde: s.photonPrograde,
        photonRetrograde: s.photonRetrograde,
        iscoPrograde: s.iscoPrograde,
        iscoRetrograde: s.iscoRetrograde,
        // v3299 -- *** THE DEVICE'S FIRST GENUINELY INDEPENDENT KEY. *** errorPairAudit found that kerr had ZERO
        // while appearing to have two: horizonSumErr holds for ANY discriminant (it tests nothing) and
        // horizonProductErr is a round trip through the same closed form (machine epsilon, worth nothing as
        // corroboration). iscoDynamic locates the ISCO by INTEGRATING perturbed circular orbits, using only
        // R(r) from the metric -- no horizon expression, no ISCO expression. Its residual shrinks with the
        // perturbation and sits near 4e-4 rather than at machine epsilon, which is what a measurement looks
        // like. Graded in physics/blackhole/kerrOrbit-selfcheck.mjs.
        // *** OPT-IN, AND MEASURED: IT COSTS 197ms PER BUILD. *** Wired in unconditionally it ran TWICE per
        // build and the corroboration census -- which builds hundreds of configurations -- stopped finishing at
        // all. An independent key is worth having; it is not worth paying for on every sweep that does not read
        // it. Set config.dynamicIsco to compute it, which the gate does. THE KEY IS NOT WEAKENED BY BEING
        // OPTIONAL: it is graded in physics/blackhole/kerrOrbit-selfcheck.mjs on every run of the suite.
        ...(h.config.dynamicIsco ? (() => {
            const dyn = iscoDynamic(M, a, true, { iters: 30, orbit: { steps: 20000, dtau: 0.05, kick: 1e-4 } }).r;
            return { iscoDynamicPrograde: dyn, iscoDynamicErrFrac: Math.abs(dyn - s.iscoPrograde) / s.iscoPrograde };
        })() : {}),
        // v3095 -- two further routes to the same radius: the Bardeen-Press-Teukolsky closed form above, and a
        // minimum of the circular-orbit energy. Both algebraic, and labelled as such.
        iscoNumericPrograde: iscoNumeric(M, a, true),
        iscoNumericRetrograde: iscoNumeric(M, a, false),
        // The worst of the two, so a device that got ONE branch right cannot hide behind the other -- prograde
        // and retrograde differ only by the sign of the spin term, which is exactly where a sign slip would sit.
        iscoErrFrac: Math.max(
            Math.abs(iscoNumeric(M, a, true) - s.iscoPrograde) / s.iscoPrograde,
            Math.abs(iscoNumeric(M, a, false) - s.iscoRetrograde) / s.iscoRetrograde),
        shadowAsymmetry: s.shadowAsymmetry,
        omegaHorizon: s.omegaHorizon,
        // invariants: these must hold at every spin, so they are the cheapest way to catch a drifting metric
        horizonProductErr: Math.abs(hz.outer * hz.inner - a * a),
        horizonSumErr: Math.abs(hz.outer + hz.inner - 2 * M),
        planted,
        // frame dragging: nonzero only when spinning, and falling off with distance
        dragAt5: frameDragging(M, a, 5 * M),
        dragFalloffRatio: frameDragging(M, a, 20 * M) !== 0 ? frameDragging(M, a, 5 * M) / frameDragging(M, a, 20 * M) : 0,
    };

    if (h.mode === "limit") {
        // the cross-instrument claim, measured against the OTHER module's own exports
        //
        // *** v4074 -- AN OBSERVABLE CENSUS FLAGGED THESE THREE, AND THEY ARE THE GENUINE ARTICLE THIS FILE'S
        // OWN v3299 COMMENT WISHED horizonProductErr AND horizonSumErr WERE. *** schwarzHorizon, schwarzPhoton
        // and schwarzShadow are imported from geodesic.js, a module that never touches kerr.js -- an
        // independent implementation of the a -> 0 limit, not a round trip through the same closed form.
        //
        // MEASURED FOR TEETH RATHER THAN ASSUMED TO HAVE THEM: at M=1, a=0 all three read exactly 0 (both
        // sides land on the same integers -- 2, 3 -- so there is no rounding to hide a real disagreement
        // behind). Perturbing M by a relative 1e-9 on the Schwarzschild side alone moves schwarzHorizonErr to
        // 2.0e-9, tracking the perturbation linearly. Not moved by any knob here because `limit` fixes a = 0
        // by construction; that is the claim, not an evasion of it.
        const p = photonOrbits(M, 0), b = criticalImpacts(M, 0);
        out.schwarzHorizonErr = Math.abs(hz.outer - schwarzHorizon(M));
        out.schwarzPhotonErr = Math.max(Math.abs(p.prograde - schwarzPhoton(M)), Math.abs(p.retrograde - schwarzPhoton(M)));
        out.schwarzShadowErr = Math.max(Math.abs(b.prograde - schwarzShadow(M)), Math.abs(b.retrograde - schwarzShadow(M)));
    }
    return out;
}

export const kerrDevice = {
    // v3400 -- KNOB PLANT: the perturbation replaces a PHYSICS LAW or FUNCTION upstream of every observable,
    // so the whole path from the wrong derivation to the reported number is graded. plantedError's second design
    // rule ("perturb the physics, not the number") in its ordinary form.
    plantKind: "knob",
    // v4092 -- NAMED, THE SAME COMPLETION v3851/v4088-v4091 gave the rest of this family. MEASURED, spin mode
    // both arms: horizonProductErr 5.55e-17 -> 0.48, while horizonSumErr stays exactly 0 in both -- the v3392
    // comment above already explains why (the linearised-discriminant plant reaches the horizon PRODUCT and
    // nothing else).
    planted: { knob: "planted", observable: "horizonProductErr",
               note: "a linearised discriminant in the horizon formula moves r+*r- away from a^2 while leaving r+ + r- = 2M exactly alone -- one invariant is structurally blind to this plant and the other is not" },
    // v3192 -- EXPORTED. This device reported as ONE-MODE to the census because its own mode names were
    // not in the probe's candidate list -- the LOWER BOUND, biting for the third time. Derived from
    // this file's own default plus every mode its own build() branches on, each verified to give a
    // DISTINCT answer. *** A MODE NOBODY CAN DISCOVER IS A MODE NOBODY WILL USE. ***
    modes: ["spin", "limit", "extremal"], name: "kerr-rotating-black-hole", observables: KERR_OBSERVABLES, build: buildKerr, defaults: kerrDefaults };
