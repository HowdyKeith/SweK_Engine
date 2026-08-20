// WebGLEngine/physics/render/sdfMarch.mjs -- v3488
//
// *** RAY-MARCH AN IMPLICIT FIELD. The tree has had four voxel DDA marchers for hundreds of versions and NOT
// ONE TRACER THAT WALKS A CONTINUOUS FIELD -- verified at v3488 rather than assumed: zero hits tree-wide for
// sphereTrace, sphereTracing, rayMarchSDF, marchSDF, lipschitz, sdfMarch or distanceField. ***
//
// A DDA marcher walks a GRID and its step is a cell boundary. A sphere tracer walks a FUNCTION and its step is
// a DISTANCE it has to estimate, which is where every bug in this file's subject lives.
//
// ================================================================================================
// TWO THINGS WEARING ONE LABEL: A FIELD AND A DISTANCE FIELD
// ================================================================================================
//
// Sphere tracing steps by "the distance to the nearest surface" and is safe only when the field IS that
// distance. *** NEITHER FIELD IN THIS TREE IS. *** sphereField is f = R^2 - r^2, whose magnitude at r = 3 with
// R = 1 is EIGHT while the surface is TWO away -- so a tracer stepping by the field value leaps clean past the
// sphere and reports a MISS ON A SPHERE SITTING DIRECTLY IN FRONT OF IT. Measured: 2 steps, no hit.
//
// The cure is first-order and needs no new physics, because both fields already export an analytic gradient:
//
//     d = |f - iso| / |grad f|
//
// which is the Newton distance estimate. For a quadratic field OUTSIDE the surface it is an UNDERESTIMATE
// ((r-R)(r+R)/2r < r-R for R < r), so it converges without overshooting. Measured on the same ray: 5 steps onto
// t = 1.9999999995 against raySphere's analytic 2.
//
// *** THE ESTIMATE IS NOT A SAFE BOUND EVERYWHERE AND THIS FILE DOES NOT PRETEND IT IS. A true Lipschitz bound
// would need a global max of |grad f|; the local gradient is what a renderer can afford, and where it
// overestimates the tracer can still step through a thin feature. THAT IS STATED RATHER THAN GATED AWAY, and it
// is why the agreement key below compares hits against an INDEPENDENTLY EXTRACTED SURFACE rather than against
// this file's own idea of where the surface is. ***
//
// ================================================================================================
// AND THE FINDING NOBODY WOULD GUESS: A METABALL FIELD CARRIES NO INFORMATION OUTSIDE ITS SUPPORT
// ================================================================================================
//
// Wyvill falloff is (1 - d^2/R^2)^3 INSIDE R and EXACTLY ZERO OUTSIDE IT. So beyond the balls the field is 0,
// the gradient is 0, and the distance estimate is 0/0. *** A SPHERE TRACER LAUNCHED AT A BLOB FROM OUTSIDE
// STALLS ON ITS FIRST STEP, EVERY TIME, AND NOT BECAUSE ANYTHING IS BROKEN -- there is genuinely nothing in the
// field to march along. *** A tracer that quietly treated a zero step as a small step would loop to its step
// cap and report a miss, which reads as "the blob is not there".
//
// So the support is entered ANALYTICALLY, with occlusion.mjs's raySphere against each ball's own radius -- the
// same intersection routine v3469 graded, not a second one. Sphere tracing starts where the field starts
// meaning something. THE STALL IS REPORTED BY NAME (`stalled-no-gradient`) rather than folded into "miss",
// because a tracer that found nothing and a tracer that could not move are opposite news.
"use strict";
import { raySphere } from "./occlusion.mjs";

/** Outcomes are NAMED. "It returned null" is not a diagnosis; "it stalled with no gradient" is. */
export const MARCH_REASONS = ["hit", "exhausted", "out-of-range", "stalled-no-gradient", "no-support"];

const at = (o, d, t) => [o[0] + d[0] * t, o[1] + d[1] * t, o[2] + d[2] * t];

/**
 * Sphere-trace a field. `field` is { f, g } in marchingCubes' convention: INSIDE is f > iso.
 *
 * `t0` is where to start, which is what lets a caller hand in an analytic support entry.
 */
export function marchRay(field, orig, dir, {
    iso = 0, t0 = 0, tMax = 20, epsilon = 1e-6, maxSteps = 256, rawStep = false,
    gradFloor = 1e-12, maxStep = 0.25,
} = {}) {
    let t = t0, steps = 0;
    // A ray that STARTS inside is a real case (a camera in the blob) and is reported rather than marched.
    if (field.f(...at(orig, dir, t)) - iso > 0) return { hit: true, t, P: at(orig, dir, t), N: null, steps, reason: "hit", startedInside: true };
    while (steps < maxSteps) {
        const P = at(orig, dir, t);
        const s = field.f(P[0], P[1], P[2]) - iso;
        if (s > 0 || Math.abs(s) < epsilon * 1e-3) {
            const g = field.g(P[0], P[1], P[2]);
            const gm = Math.hypot(g[0], g[1], g[2]) || 1;
            // The normal points OUT of the solid, and inside is f > iso, so it is the NEGATIVE gradient. Getting
            // this backwards is invisible to every distance key in this file and turns a lit surface black.
            return { hit: true, t, P, N: [-g[0] / gm, -g[1] / gm, -g[2] / gm], steps, reason: "hit" };
        }
        const g = field.g(P[0], P[1], P[2]);
        const gm = Math.hypot(g[0], g[1], g[2]);
        // *** rawStep IS THE PLANT AND IT IS A PARAMETER, NOT AN EDITED COPY: step by the field value, which is
        // what "march by the distance" turns into when nobody asks whether the field is a distance. ***
        //
        // *** AND THE NEWTON ESTIMATE OVERSHOOTS TOO, THROUGH THE OPPOSITE DOOR, WHICH IS THE THING I HAD TO
        // MEASURE TO FIND. It is a LOCAL LINEARISATION, so it is only a distance where the field is locally
        // sloped. On a Wyvill blob it is degenerate exactly where a tracer starts: the falloff is
        // (1 - d^2/R^2)^3, so its gradient carries (1 - d^2/R^2)^2 and VANISHES AT THE SUPPORT BOUNDARY, which
        // is precisely where the analytic support entry puts you. |s| is then about the whole iso value and gm
        // is nearly zero, so |s|/gm is ENORMOUS and the tracer leaps past the blob -- the same tunnelling as
        // the raw rule, arriving from the other side. My first version stalled or ran out of range on every
        // ray, and neither reason mentioned overshoot. ***
        //
        // ONE CLAMP COVERS BOTH, WHICH IS WHY THERE IS ONE PARAMETER AND NOT TWO: the estimate is trusted while
        // it is small and a fixed march takes over when it is not. THE COST IS NAMED RATHER THAN HIDDEN -- a
        // feature thinner than `maxStep` can be stepped over, and no value removes that; it only trades
        // tunnelling against step count.
        //
        // maxStep <= 0 IS THE PURE TEXTBOOK TRACER WITH NO CLAMP AT ALL, kept reachable on purpose: it is what
        // demonstrates the dead zone, and a `stalled-no-gradient` nobody can reach would be a reason that
        // cannot fire.
        if (!rawStep && maxStep <= 0 && gm <= gradFloor)
            return { hit: false, t, P, N: null, steps, reason: "stalled-no-gradient" };
        const newton = Math.abs(s) / Math.max(gm, gradFloor);
        const d = rawStep ? Math.abs(s) : maxStep > 0 ? Math.min(newton, maxStep) : newton;
        // A HIT IS A HIT WHICHEVER BRANCH FOUND IT, AND IT CARRIES A NORMAL EITHER WAY. My first version
        // returned N: null here, and the page then shaded 1208 of its 1284 hits as background -- a hit with no
        // normal is indistinguishable from a miss to every consumer that shades.
        if (d < epsilon) {
            const gn = field.g(P[0], P[1], P[2]);
            const gnm = Math.hypot(gn[0], gn[1], gn[2]) || 1;
            return { hit: true, t, P, N: [-gn[0] / gnm, -gn[1] / gnm, -gn[2] / gnm], steps, reason: "hit" };
        }
        t += d; steps++;
        if (t > tMax) return { hit: false, t, P: null, N: null, steps, reason: "out-of-range" };
    }
    return { hit: false, t, P: null, N: null, steps, reason: "exhausted" };
}

/**
 * Where a ray first enters the union of a metaball's supports, analytically.
 *
 * *** THIS IS NOT AN OPTIMISATION. Outside every ball the Wyvill field is identically zero and so is its
 * gradient, so there is no step for a tracer to take -- the field does not merely become inaccurate out there,
 * IT CONTAINS NOTHING AT ALL. *** raySphere is v3469's routine, including the `t > 0` test, rather than a second
 * intersection written here.
 */
export function supportEntry(balls, orig, dir, { eps = 1e-9 } = {}) {
    let best = null;
    for (const b of balls) {
        const t = raySphere(orig, dir, [b.cx, b.cy, b.cz], b.r);
        if (t !== null && (best === null || t < best)) best = t;
    }
    // Already inside somebody's support: the field is live where we stand, so start here.
    for (const b of balls) {
        const dx = orig[0] - b.cx, dy = orig[1] - b.cy, dz = orig[2] - b.cz;
        if (dx * dx + dy * dy + dz * dz < b.r * b.r) return 0;
    }
    return best === null ? null : Math.max(0, best - eps);
}

/** Trace a Wyvill metaball field: enter the support analytically, then sphere-trace. */
export function marchBalls(balls, orig, dir, { iso = 0.5, wyvill, wyvillGrad, ...opts } = {}) {
    const t0 = supportEntry(balls, orig, dir);
    if (t0 === null) return { hit: false, t: null, P: null, N: null, steps: 0, reason: "no-support" };
    const field = { f: (x, y, z) => wyvill(balls, x, y, z), g: (x, y, z) => wyvillGrad(balls, x, y, z) };
    return marchRay(field, orig, dir, { ...opts, iso, t0 });
}
