// WebGLEngine/physics/render/bounces.mjs -- v3470
//
// *** INTER-REFLECTION: THE FIRST PIECE THAT NEEDS RECURSION, AND THE KEY IS EXACT AT EVERY DEPTH RATHER THAN
// ONLY IN THE LIMIT. ***
//
// v3467 graded a single gather, v3468 the sampling strategy, v3469 the geometry. None of them bounced. This one
// does, and what it grades is THE BOUNCE ACCOUNTING -- throughput, depth truncation, and whether energy is
// conserved -- which is where a path tracer actually goes wrong.
//
// ================================================================================================
// THE TWO-STATE SYSTEM, AND WHY IT IS STATED AS ONE RATHER THAN DRESSED AS A SCENE
// ================================================================================================
//
// A shading point sees the emitting environment over a cosine-weighted fraction (1 - k) and a grey surface of
// albedo rho over the remaining k. That surface sees the same split. Writing L(n) for the radiance after n
// bounces, with L(0) = 0 because nothing is gathered past the depth limit:
//
//     L(n) = rho * [ (1 - k) * 1 + k * L(n-1) ]
//
// which unrolls to a geometric series with an exact closed form at every n:
//
//     L(n) = rho (1 - k) * (1 - (rho k)^n) / (1 - rho k),      L(inf) = rho (1 - k) / (1 - rho k)
//
// *** AND AT rho = 1 IT COLLAPSES TO SOMETHING SHARPER STILL: L(n) = 1 - k^n, EXACTLY. A perfectly reflecting
// closed furnace must read 1, and the shortfall at finite depth is not "some small error" -- IT IS k^n, a
// number predicted before the run. Any energy the accounting loses shows up as a deficit LARGER than k^n, and
// any energy it invents shows up as a surplus. ***
//
// THIS IS A TWO-STATE RADIOSITY SYSTEM AND IT IS CALLED ONE HERE. Presenting it as a full scene would be the
// mirror this tree refuses: the closed form would then be a restatement of the geometry rather than an
// independent answer. WHAT IS NOT ASSUMED IS k -- it is MEASURED BY CASTING RAYS at the real sphere through
// v3469's intersection code, so the geometry half is derived and only the recursion half is modelled.
"use strict";

/** The exact truncated series. Nothing in the estimator is told this. */
export const seriesExact = (rho, k, n) =>
    rho * (1 - k) * (1 - Math.pow(rho * k, n)) / (1 - rho * k);

export const seriesLimit = (rho, k) => rho * (1 - k) / (1 - rho * k);

/**
 * Gather with recursion. `maxDepth` counts BOUNCES, not rays: depth 1 is a single gather with no
 * inter-reflection, which is exactly what v3467 measured.
 *
 * `blocked(dir)` says whether a direction lands on the grey surface rather than the sky -- supplied by the
 * caller so the GEOMETRY comes from real ray casting and only the recursion lives here.
 *
 * The faults are parameters, not edits:
 *   loseThroughput  -- forget to carry albedo into the recursive call, the commonest bounce bug
 *   noDepthGuard    -- treat the depth limit as "return the sky" instead of "return nothing", which INVENTS
 *                      energy at the truncation and hides a missing bounce as a brighter image
 */
export function gather(rho, samples, {
    seed = 1, maxDepth = 1, blocked, rng, sampler, frame, toWorld, N = [0, 1, 0],
    loseThroughput = false, noDepthGuard = false,
    // v3471 -- RUSSIAN ROULETTE. `rrQ` is the survival probability at each blocked bounce; null disables it and
    // maxDepth alone truncates. THE COMPENSATION IS THE WHOLE THING: a surviving path must be divided by q, or
    // the estimator silently throws away the energy of the paths it killed.
    rrQ = null, noRrCompensation = false,
} = {}) {
    const rand = rng(seed);
    const { Nt, Nb } = frame(N);
    let total = 0, bounces = 0;
    for (let p = 0; p < samples; p++) {
        // ONE DIRECTION PER BOUNCE AND A RUNNING THROUGHPUT -- which is what a path tracer is. My first version
        // recursed with a full sample set per bounce: correct in expectation and samples^depth in work, which at
        // 4000 samples and six bounces is not a run anybody finishes. THE SHAPE OF THE ALGORITHM IS PART OF WHAT
        // IS BEING GRADED, so getting it wrong here would have graded something nobody would ever ship.
        let throughput = 1, escaped = false;
        for (let d = 0; d < maxDepth; d++) {
            throughput *= loseThroughput ? 1 : rho;      // forget to carry albedo into the next bounce
            const dir = toWorld(sampler(rand(), rand()), N, Nt, Nb);
            // Cosine-weighted, so the cosine cancels against the pdf and the estimator carries neither.
            if (!blocked(dir)) { total += throughput; escaped = true; break; }
            if (rrQ !== null) {
                if (rand() >= rrQ) { escaped = true; break; }      // killed: this path gathers nothing
                if (!noRrCompensation) throughput /= rrQ;          // survivors carry the dead paths' share
                bounces++;
            }
        }
        // A path that never escaped has gathered nothing. Returning the sky here INVENTS energy at the
        // truncation and makes a missing bounce look like a brighter image.
        if (!escaped && noDepthGuard) total += throughput;
    }
    // The mean path length is returned alongside the answer, because RUSSIAN ROULETTE IS A COST TRADE and an
    // answer without its cost cannot show the trade at all.
    gather.lastMeanBounces = bounces / samples;
    return total / samples;
}

/** RR is unbiased, so the limit is unchanged; and WITHOUT the 1/q compensation it is exactly this instead. */
export const rrUncompensated = (rho, k, q) => rho * (1 - k) / (1 - rho * k * q);
/** Continuation happens only when a path is BOTH blocked and survives, so E[extra bounces] = kq/(1-kq). */
export const rrMeanBounces = (k, q) => (k * q) / (1 - k * q);
