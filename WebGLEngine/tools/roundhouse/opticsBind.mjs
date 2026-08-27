// tools/roundhouse/opticsBind.mjs
//
// v2814 -- roundhouse device: the OPTICS bench. The lab already had two graded optics instruments
// (physics/optics/diffraction.js far-field, physics/optics/fresnel.js near-field) but neither was reachable from
// the roundhouse. They are ideal devices precisely because they already carry ANSWER KEYS: a claim about them can
// be refused by a number nobody chose.
//
// Modes:
//   "airy"     -- circular aperture. Measures the first dark ring in units of lambda/D. The Rayleigh criterion
//                 says 1.22, and nothing in the propagator is told that; it falls out of the phasor sum.
//   "slit"     -- single slit. Measures the RMS difference between the numeric propagator and the analytic
//                 sinc^2, plus the first minimum position in units of lambda/a (analytically exactly 1).
//   "edge"     -- straight edge, near field. Measures the intensity at the geometric shadow boundary (exactly
//                 1/4 of unobstructed, because C(0)=S(0)=0) and the first fringe peak and position.
//   "converge" -- pushes the NEAR-field propagator to a chosen distance and measures its shape difference from
//                 the FAR-field module. Small Fresnel number must agree; F ~ 1 must not.
//
// Every observable is a measured number, not a restatement of theory.

import { circularNumeric, firstMinimumAt, slitNumeric, slitAnalytic, scorePattern } from "../../physics/optics/diffraction.js";
import { firstMinimumRefined, AIRY_FIRST_RING } from "../../physics/optics/airyRefined.mjs";
import { knifeEdgeIntensity, slitFresnelAtAngles, fresnelNumber, profileRms } from "../../physics/optics/fresnel.js";

export const OPTICS_OBSERVABLES = [
    "rayleighFactor", "rayleighFactorExact", "airyRingErrFrac",
    "slitRms", "slitFirstMinFactor", "slitFirstMinErrFrac",
    "edgeShadowIntensity", "edgeFirstFringe", "edgeFirstFringeV", "edgeFirstFringeExact", "edgeFirstFringeErrFrac",
    "fresnelNumber", "nearFarRms",
    // v4032 -- the converge mode's Simpson budget, reported so the cost of a configuration is visible BEFORE
    // it is paid rather than inferred from a stopwatch afterwards.
    "quadratureEvals",
];

// *** v4030 -- `spread` WAS AN ORPHAN, AND ITS VALUE SAYS WHAT IT USED TO BE. *** It sat in DEF, was exposed as
// a knob, and was READ NOWHERE in buildOptics: every sweep width is computed fresh at its own call site from the
// physics (4*lambda/D for the Airy ring, 4*lambda/a for the slit, 3*lambda/a for the convergence comparison).
// The frozen 0.02 is EXACTLY 4*lambda/a at the default lambda and a -- the slit's own width, left behind when
// self-scaling came in. It was therefore right for one mode and wrong for the other two (airy wants 0.01,
// converge 0.015), which is why wiring it in as a flat window would have been a regression wearing a fix.
//
// null now means SELF-SCALE FROM THE PHYSICS, which is what the device already did and must keep doing: the
// sweep has to widen when the wavelength grows or the aperture shrinks, or the first minimum leaves the window.
// A NUMBER OVERRIDES IT, for a caller who wants a specific window -- and if that window is too narrow to contain
// the feature, the mode REFUSES rather than returning the wrong dip, which is the behaviour that already existed
// for a sweep that finds no minimum. Found by knobLiveness: a declared knob that moved no observable at any
// value, the v4028/v4029 signature for the third time.
const DEF = { lambda: 500e-6, D: 0.2, a: 0.1, z: 2000, nSamples: 900, spread: null };


export function opticsDefaults(hyp) {
    const h = { mode: "airy", ...(hyp || {}) };
    const c = { ...DEF, ...(h.config || {}) };
    const num = (v, d) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : d);
    c.lambda = Math.min(1e-2, Math.max(1e-7, num(c.lambda, DEF.lambda)));
    c.D = Math.min(10, Math.max(1e-3, num(c.D, DEF.D)));
    c.a = Math.min(10, Math.max(1e-3, num(c.a, DEF.a)));
    c.z = Math.min(1e6, Math.max(1, num(c.z, DEF.z)));
    c.nSamples = Math.min(2001, Math.max(101, num(c.nSamples, DEF.nSamples) | 0));
    // null (or anything non-positive) keeps the self-scaling path. Deliberately NOT clamped to a "sensible"
    // range: a window too small to hold the first minimum is a question worth being able to ask, and the answer
    // is the refusal below rather than a silently widened sweep.
    c.spread = (typeof c.spread === "number" && Number.isFinite(c.spread) && c.spread > 0) ? c.spread : null;
    h.config = c;
    if (!["airy", "slit", "edge", "converge", "radiusconfusion"].includes(h.mode)) h.mode = "airy";
    return h;
}

// ONE-SIDED sweep from the axis outward. firstMinimumAt() scans forward for the first local minimum, so a
// symmetric sweep starting on a side lobe finds the wrong dip -- the existing diffraction gate sweeps [0, spread]
// for exactly this reason, and matching it is what makes the ring measurement agree with that gate.
const sweep = (n, spread) => { const o = []; for (let i = 0; i < n; i++) o.push(spread * i / (n - 1)); return o; };

export async function buildOptics(hyp, base = {}) {
    const h = opticsDefaults({ ...hyp, config: { ...(hyp && hyp.config), ...base } });
    const c = h.config;
    const out = {};

    if (h.mode === "airy" || h.mode === "radiusconfusion") {
        // *** v3760 -- THE PLANT: "radiusconfusion" HANDS THE APERTURE RADIUS WHERE THE DIAMETER BELONGS.
        // THIS IS THE MISTAKE THE API INVITES, not one invented to be caught: the Airy pattern is 2J1(x)/x
        // with x = pi*D*sin(theta)/lambda, every optics text writes the first ring as 1.22*lambda/D, and half
        // the literature states the same aperture by its RADIUS. circularNumeric's first argument is a
        // DIAMETER and nothing in the call says so. THE NORMALISATION STILL DIVIDES BY lambda/D, because a
        // caller making this mistake would make it in ONE place -- a plant that changed both sides would
        // cancel and prove nothing (v3733). ***
        const aperture = h.mode === "radiusconfusion" ? c.D / 2 : c.D;
        const sp = c.spread ?? (4 * c.lambda / c.D);          // enough angle to contain the first ring
        const st = sweep(c.nSamples, sp);
        const pat = circularNumeric(aperture, c.lambda, st);
        // v2931 -- ADOPTED FROM v2911. Two changes, both measured improvements:
        //   (1) firstMinimumRefined instead of firstMinimumAt: the raw estimator returns the grid sample where
        //       the pattern turns, so rayleighFactor JITTERED with nSamples (4.4e-4 at 900, WORSE 8.3e-4 at
        //       1800) and at the nSamples clamp landed exactly on the rounded answer, scoring a fake zero. The
        //       parabolic refinement on intensity converges monotonically: 2.1e-5, 3.6e-6, 2.3e-6.
        //   (2) graded against the EXACT ring j(1,1)/pi, not the rounded 1.22 that put a 2.7e-4 floor under the
        //       error and rewarded landing near a wrong constant.
        const first = firstMinimumRefined(pat, st);
        if (!(first > 0)) return { error: "no-first-minimum-found" };
        out.rayleighFactor = first / (c.lambda / c.D);
        out.rayleighFactorExact = AIRY_FIRST_RING;           // j(1,1)/pi = 1.2196698912665045
        out.airyRingErrFrac = Math.abs(out.rayleighFactor - AIRY_FIRST_RING) / AIRY_FIRST_RING;
        return out;
    }

    if (h.mode === "slit") {
        const sp = c.spread ?? (4 * c.lambda / c.a);
        const st = sweep(c.nSamples, sp);
        const num = slitNumeric(c.a, c.lambda, st);
        const ana = slitAnalytic(c.a, c.lambda, st);
        const sc = scorePattern(num, ana);
        out.slitRms = typeof sc === "number" ? sc : (sc && (sc.rms ?? sc.err ?? sc.score));
        // v2931 -- ADOPTED FROM v2913. Same refined estimator as airy. The analytic first minimum is at
        // sin(theta) = lambda/a exactly, so slitFirstMinFactor should be 1; the raw estimator read exactly 1
        // only when (nSamples-1) divided by 4 (a grid point landing on the answer) and ~1e-3 otherwise. Refined
        // converges toward 1 smoothly instead of alternating between exact-hit and grid-miss.
        const first = firstMinimumRefined(num, st);
        // *** v4030 -- REFUSES NOW, WHERE IT USED TO EMIT `undefined` INTO TWO DECLARED OBSERVABLES. *** airy
        // three branches up already returns { error: "no-first-minimum-found" } for exactly this condition; slit
        // set both fields to undefined and returned, so the mode reported slitRms and silently dropped the other
        // two. THAT WAS UNREACHABLE UNTIL `spread` BECAME A LIVE KNOB -- with the window self-scaled from the
        // physics the first minimum is always inside it -- which is what made wiring the knob worth doing beyond
        // the knob itself. Two modes answering the same question two ways is one of them being wrong, and the
        // one that refuses is right: an observable that reads `undefined` is a reference that reports nothing.
        if (!(first > 0)) return { error: "no-first-minimum-found" };
        out.slitFirstMinFactor = first / (c.lambda / c.a);                          // analytically exactly 1
        out.slitFirstMinErrFrac = Math.abs(out.slitFirstMinFactor - 1);
        return out;
    }

    if (h.mode === "edge") {
        out.edgeShadowIntensity = knifeEdgeIntensity(0);      // exactly 0.25, from C(0)=S(0)=0
        // v2930 -- ADOPTED FROM v2914. The line above is a TAUTOLOGY: fresnelCS(0) is an integral over an empty
        // interval, so edgeShadowIntensity reads 0.25 for ANY Fresnel implementation, including a broken one --
        // it verifies nothing. The real content of this mode is the first fringe peak, whose location and height
        // v2914 checked against an INDEPENDENT golden-section optimum over a separately written Fresnel quadrature
        // and found agreeing to 8.2e-12. That check now lives here as a graded field instead of in a selfcheck
        // that never fed back a number.
        // coarse then refine: the peak is smooth, so 400 coarse probes plus a local sweep give the same answer
        // as 8000 uniform ones at a fraction of the Fresnel-integral evaluations.
        let best = 0, bv = 0;
        for (let v = 0; v < 4; v += 0.01) { const i = knifeEdgeIntensity(v); if (i > best) { best = i; bv = v; } }
        for (let v = Math.max(0, bv - 0.02); v < bv + 0.02; v += 0.0002) { const i = knifeEdgeIntensity(v); if (i > best) { best = i; bv = v; } }
        out.edgeFirstFringe = best;
        out.edgeFirstFringeV = bv;
        // independent reference: golden-section on the SAME intensity, to machine precision, so the coarse-search
        // peak is graded against a converged optimum rather than against nothing. Grades the VALUE (accurate to
        // O(h^2) at a smooth max) not the POSITION (only O(h)); v2914 measured why.
        {
            let a = 1.0, b = 1.5; const gr = (Math.sqrt(5) - 1) / 2;
            let cc = b - gr * (b - a), dd = a + gr * (b - a);
            for (let i = 0; i < 200; i++) {
                if (knifeEdgeIntensity(cc) > knifeEdgeIntensity(dd)) b = dd; else a = cc;
                cc = b - gr * (b - a); dd = a + gr * (b - a);
            }
            const iStar = knifeEdgeIntensity((a + b) / 2);
            out.edgeFirstFringeExact = iStar;
            out.edgeFirstFringeErrFrac = Math.abs(best - iStar) / iStar;
        }
        return out;
    }

    // *** v3759 -- THIS BLOCK WAS UNREACHABLE. `fresnelNumber` and `nearFarRms` have been DECLARED OBSERVABLES
    // since the device was written, and EVERY ONE of the three modes returns before reaching them: airy at
    // line 73, slit at 90, edge at 122. Measured on the shipped build -- all three modes report BOTH as
    // `undefined`. A DECLARED OBSERVABLE NO MODE PRODUCES IS THE v3732 SHAPE (an observable living only in a
    // branch nothing runs), and here it was worse: the code existed, was correct, and simply could not be got
    // to. NOTHING FAILED, because nothing asks a device to produce every observable it declares. ***
    // The mode name below is what makes it reachable, and the Fraunhofer limit below is the key it never had.
    // converge: near-field vs far-field at the chosen distance
    const sp = c.spread ?? (3 * c.lambda / c.a);
    const st = sweep(Math.min(161, c.nSamples), sp);   // a shape comparison needs far fewer points than a fringe hunt
    out.fresnelNumber = fresnelNumber(c.a, c.lambda, c.z);

    // *** v4032 -- THIS MODE'S COST IS EXACTLY THE RECIPROCAL OF THE NUMBER IT REPORTS, AND NOTHING SAID SO. ***
    //
    // fresnelCS integrates cos(pi t^2 / 2) by composite Simpson and sets its step count from the argument:
    // n = 400 * v^2 for v > 1. That is correct and its own comment argues for it -- the integrand oscillates as
    // t^2, so a fixed step loses accuracy exactly where the physics is interesting. But the argument here is set
    // by the sweep, and the arithmetic closes:
    //
    //     sweep edge  x = 3*lambda*z/a          v = x*sqrt(2/(lambda z)) = 3*sqrt(2*lambda*z)/a
    //     so          v^2 = 18*lambda*z/a^2 = 18/F        and       n = 400*v^2 = 7200/F
    //
    // EXACTLY, not approximately: F = 0.01 at the defaults and n = 7.2e5, measured. *** THE MODE EXISTS TO PUSH
    // THE NEAR-FIELD PROPAGATOR TOWARD THE FAR FIELD, WHICH MEANS F -> 0, AND ITS COST IS 1/F. IT GETS MORE
    // EXPENSIVE PRECISELY AS IT APPROACHES THE LIMIT IT IS TESTING. ***
    //
    // The shipped default already costs 2.33e8 Simpson evaluations and 3.5 s per build. knobLiveness probes
    // lambda at 8x, which is inside the [1e-7, 1e-2] clamp and costs 1.85e9; at the clamp's own maximum it is
    // 4.64e9, twenty times the default. The census does not hang there, IT FINISHES -- eventually, at a cost
    // nobody had written down, which is why optics never once produced a completed row in any sweep this
    // session. A cost that is invisible cannot be budgeted against.
    //
    // *** THE COST IS REPORTED AND NOT REFUSED, AND THE FIRST DRAFT OF THIS ROUND GOT THAT BACKWARDS. ***
    // A ceiling of 1e9 evaluations went in here first, in this file's own refusal idiom, and it REFUSED THE
    // DEVICE'S OWN KEY: opticsBind-selfcheck section 2 grades the Fraunhofer limit by sweeping z to 20000,
    // which is F = 1e-3 and 2.32e9 evaluations. The mode is expensive in exactly the direction its key must
    // travel, so any ceiling low enough to protect a caller is low enough to cut off the physics. A COST
    // POLICY DOES NOT BELONG INSIDE A PHYSICS DEVICE; what belongs here is the cost, stated, so a caller can
    // decide BEFORE paying it instead of inferring it from a stopwatch afterwards. The bound is knobLiveness's
    // (v4032, probeKnob's per-build deadline), because a budget is a property of the survey, not of the optics.
    const perCall = Math.max(64, Math.ceil(7200 / out.fresnelNumber));
    out.quadratureEvals = 2 * st.length * perCall;      // two fresnelCS per angle, one per slit edge

    const far = slitAnalytic(c.a, c.lambda, st);
    const near = slitFresnelAtAngles(c.a, c.lambda, c.z, st);
    out.nearFarRms = profileRms(near, far);
    return out;
}

export const opticsDevice = {
    // v3192 -- EXPORTED. This device reported as ONE-MODE to the census because its own mode names were
    // not in the probe's candidate list -- the LOWER BOUND, biting for the third time. Derived from
    // this file's own default plus every mode its own build() branches on, each verified to give a
    // DISTINCT answer. *** A MODE NOBODY CAN DISCOVER IS A MODE NOBODY WILL USE. ***
    // v3759 -- "converge" ADDED. Making the block reachable was half the fix; a mode absent from this list is
    // one the census cannot see and a caller can only find by reading the source -- the LOWER BOUND problem
    // this device already hit twice (v3192). THE GATE CAUGHT ME DOING EXACTLY THAT.
    modes: ["airy", "slit", "edge", "converge", "radiusconfusion"],
    // v3760 -- the mode-plant declaration. `airyRingErrFrac` is reported by the PRIMARY mode too, which is
    // what the MODE-PLANT CONTRACT requires: an observable living only in the plant's own branch reads
    // DECLARED BUT DEAD.
    plantMode: "radiusconfusion", plantFlips: "airyRingErrFrac", plantKind: "mode",
    name: "optics-bench",
    observables: OPTICS_OBSERVABLES,
    build: buildOptics,
    defaults: opticsDefaults,
};
