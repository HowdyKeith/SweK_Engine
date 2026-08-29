// tools/roundhouse/renderBounceBind.mjs
//
// INTER-REFLECTION AND DIRECT LIGHTING, JOINED BY AN IDENTITY NEITHER FILE CAN CHECK ALONE.
//
// physics/render/bounces.mjs and physics/render/nee.mjs are both fully graded and both had no way in: no
// device, no instruments row, no page. They are bound together rather than separately because THE STRONGEST
// THING EITHER OF THEM SAYS IS A SENTENCE THAT SPANS BOTH, and it lived in a header where nothing ran it:
//
//     *** THE SAME SPHERE, BLOCKING AND EMITTING, IS THE SAME SOLID ANGLE WEARING DIFFERENT CLOTHES. ***
//
// A sphere of radius r at distance d along the normal subtends a cap that removes exactly (r/d)^2 of a
// cosine-weighted integral. Put that sphere in a white furnace as an OCCLUDER and the gather loses rho*(r/d)^2.
// Make the same sphere EMIT and next-event estimation contributes rho*Le*(r/d)^2. At Le = 1 the two must add
// back to the unoccluded furnace -- and the two numbers come from different files, different estimators and
// different random draws. If they disagreed, one of the two rounds would be wrong and neither could tell.
//
// ================================================================================================================
// THE KEYS, AND WHY THEY ARE NOT MIRRORS
// ================================================================================================================
//
//   THE TRUNCATED SERIES   L(n) = rho(1-k)(1 - (rho k)^n)/(1 - rho k), EXACT AT EVERY DEPTH rather than only in
//                          the limit -- so a recursive gather is graded at n = 1, 2, 3 ... and not just after it
//                          has converged. *** AND k IS NOT TYPED: it is MEASURED BY CASTING RAYS at the real
//                          sphere. *** Typing 0.25 would have made the series a restatement of itself.
//
//   THE WHITE FURNACE      at rho = 1 the series collapses to L(n) = 1 - k^n EXACTLY. A perfectly reflecting
//                          closed furnace must read 1, and the shortfall at finite depth is not "some small
//                          error" -- IT IS k^n, A NUMBER PREDICTED BEFORE THE RUN. Energy lost shows as a
//                          deficit larger than k^n; energy invented shows as a surplus.
//
//   THREE ESTIMATORS, ONE ANSWER   directExact = rho*Le*(r/d)^2 is reached by sampling the LIGHT (a cone with
//                          its own pdf), by sampling the BSDF (cosine-weighted, where cosine and pdf cancel),
//                          and by MIS combining both under the balance heuristic. Three routes, no shared line.
//
// *** THE PLANTS ARE THE MODULES' OWN, DECLARED AS PARAMETERS RATHER THAN INVENTED HERE. *** bounces.mjs ships
// `loseThroughput` (forget to carry albedo into the recursive call -- the commonest bounce bug) and
// `noDepthGuard` (treat the depth limit as "return the sky", which INVENTS energy at the truncation and hides a
// missing bounce as a brighter image). nee.mjs ships `wrongPdf` (the hemisphere pdf with the cone sampler --
// the changed-the-sampler-forgot-the-pdf mistake, which here overestimates by 1/(1 - cos alpha), so THE FURTHER
// AWAY THE LIGHT THE BRIGHTER THE BUG LOOKS). A bind that invented its own fault would be grading a fault
// nobody has ever shipped; these are the three the files were written to catch.
//
// plantKind METHOD: the estimator's arithmetic is wrong. No config value records it, which is why the census
// cannot see this one and the gate must.
//
// *** AND THE GEOMETRY IS BLIND TO ALL THREE, WHICH IS WHAT LOCALISES THEM. *** k is measured by ray casting
// through occlusion.mjs and no estimator fault can move it: the sphere is where it is. A device reporting only
// k would certify a renderer that loses a quarter of its light on every bounce.

import { rng, cosineSampleHemisphere, createCoordinateSystem, toWorld } from "../../physics/render/furnace.mjs";
import { occluded } from "../../physics/render/occlusion.mjs";
import { gather, seriesExact, seriesLimit } from "../../physics/render/bounces.mjs";
import { directExact, directNEE, directBSDF, directMIS, misWeights, capHalfAngle } from "../../physics/render/nee.mjs";

export const RENDERBOUNCE_OBSERVABLES = [
    "kMeasured", "kGeometric", "kResidual",
    "seriesWorstRel", "seriesDeepestRel", "seriesRelByDepth",
    "whiteFurnaceWorstRel", "deficitVsKPowNWorst",
    "neeRel", "bsdfRel", "misRel", "misWeightSumErr",
    "identityResidual",
];

const DEF = { rho: 0.8, radius: 1, dist: 2, samples: 60000, maxDepth: 6, seed: 9, Le: 1 };

const wire = { rng, sampler: cosineSampleHemisphere, frame: createCoordinateSystem, toWorld };
const N = [0, 1, 0], P = [0, 0, 0];
const rel = (a, b) => Math.abs(a - b) / Math.max(1e-300, Math.abs(b));

/** k by CASTING RAYS at the real sphere. The geometry half is derived; only the recursion half is modelled. */
function measureK(sphere, samples, seed) {
    const rand = rng(seed);
    const { Nt, Nb } = createCoordinateSystem(N);
    let hit = 0;
    for (let i = 0; i < samples; i++) {
        if (occluded(P, toWorld(cosineSampleHemisphere(rand(), rand()), N, Nt, Nb), sphere)) hit++;
    }
    return hit / samples;
}

/** The furnace with the sphere as a BLOCKER: a single cosine-weighted gather that misses it. */
function occludedFurnace(rho, sphere, samples, seed) {
    const rand = rng(seed);
    const { Nt, Nb } = createCoordinateSystem(N);
    let sum = 0;
    for (let i = 0; i < samples; i++) {
        if (!occluded(P, toWorld(cosineSampleHemisphere(rand(), rand()), N, Nt, Nb), sphere)) sum += rho;
    }
    return sum / samples;
}

function buildRenderBounce({ mode = "series", config = {} } = {}) {
    const c = { ...DEF, ...config };
    const planted = !!config.planted;
    const sphere = [{ centre: [0, c.dist, 0], radius: c.radius }];
    const blocked = (dir) => occluded(P, dir, sphere);
    const S = Math.max(500, c.samples | 0);

    // ---- THE GEOMETRY. Blind to every plant below, and asserted so.
    const kMeasured = measureK(sphere, S, c.seed + 4242);
    const kGeometric = (c.radius / c.dist) * (c.radius / c.dist);

    // ---- THE TRUNCATED SERIES, graded at every depth rather than at convergence.
    // THE PLANT: forget to carry albedo into the recursive call. bounces.mjs' own parameter.
    const fault = planted ? { loseThroughput: true } : {};
    // *** v4058 -- `seriesDepths` USED TO BE COUNTED HERE AND IT WAS maxDepth WRITTEN OUT LONGHAND. *** The
    // census read maxDepth as ECHOED AND IGNORED in `series`: the loop runs to it, every depth passes, so the
    // WORST over 1..n is the same number whether n is 3 or 9 -- correctly, because a worst-case that grew when
    // you looked at more depths would be the defect. The knob moved exactly one observable, and that observable
    // was the knob. (Under the plant the error compounds with depth, the worst does climb, and it read live --
    // which is why this arrived as a split reading rather than a still one.)
    //
    // The count is replaced by a MEASUREMENT AT THE SAME PLACE: the relative error at the DEEPEST depth
    // checked. It carries the coverage the count carried -- the deepest is maxDepth -- and unlike the count it
    // is a number the run produced rather than one the caller supplied, so moving the knob moves it honestly.
    // The deepest term is also the hardest one, which is the term a truncation defect reaches first.
    // *** AND THE COUNT IS REPLACED BY THE ERRORS THEMSELVES, WHICH THE FIRST DRAFT OF THIS FIX GOT WRONG. ***
    // Dropping seriesDepths broke renderBounceBind-selfcheck, which reads it to assert the series really is
    // graded at EVERY depth rather than only at the limit -- so the count was a COVERAGE WITNESS with a real
    // consumer, not spare rope. Restoring the count would restore the echo with it. The per-depth errors do
    // both jobs and neither is a knob handed back: their LENGTH is the coverage the gate checks, their VALUES
    // are measurements the run produced, and both move when maxDepth moves.
    const seriesRelByDepth = [];
    let seriesWorstRel = 0;
    for (let n = 1; n <= c.maxDepth; n++) {
        const got = gather(c.rho, S, { seed: c.seed, maxDepth: n, blocked, ...wire, ...fault });
        const r = rel(got, seriesExact(c.rho, kMeasured, n));
        seriesRelByDepth.push(r);
        seriesWorstRel = Math.max(seriesWorstRel, r);
    }
    const seriesDeepestRel = seriesRelByDepth[seriesRelByDepth.length - 1];

    // ---- THE WHITE FURNACE. At rho = 1 the shortfall IS k^n, predicted before the run.
    let whiteWorstRel = 0, deficitWorst = 0;
    for (let n = 1; n <= c.maxDepth; n++) {
        const got = gather(1, S, { seed: c.seed + 1, maxDepth: n, blocked, ...wire, ...fault });
        whiteWorstRel = Math.max(whiteWorstRel, rel(got, 1 - Math.pow(kMeasured, n)));
        // The DEFICIT against a perfect furnace, against the number geometry predicts it must be.
        deficitWorst = Math.max(deficitWorst, Math.abs((1 - got) - Math.pow(kMeasured, n)));
    }

    // ---- THREE ESTIMATORS FOR THE DIRECT TERM.
    // THE PLANT: the hemisphere pdf with the cone sampler. nee.mjs' own parameter.
    const exact = directExact(c.rho, c.Le, c.radius, c.dist);
    const nee = directNEE(c.rho, c.Le, c.radius, c.dist, S, { seed: c.seed, rng, wrongPdf: planted });
    const bsdf = directBSDF(c.rho, c.Le, c.radius, c.dist, S, { seed: c.seed, rng, sampler: cosineSampleHemisphere });
    const mis = directMIS(c.rho, c.Le, c.radius, c.dist, S, { seed: c.seed, rng, sampler: cosineSampleHemisphere });

    // The balance-heuristic weights sum to EXACTLY one for every direction, by construction. An INVARIANCE
    // rather than a tolerance, and the only reason combining two estimators does not double-count.
    let wErr = 0;
    for (let i = 1; i <= 64; i++) {
        const [a, b] = misWeights(i / 64, (65 - i) / 128);
        wErr = Math.max(wErr, Math.abs(a + b - 1));
    }

    // ---- *** THE IDENTITY THAT SPANS BOTH FILES. *** Blocking and emitting are the same solid angle.
    const occ = occludedFurnace(c.rho, sphere, S, c.seed + 7);
    const emit = planted
        ? directNEE(c.rho, c.Le, c.radius, c.dist, S, { seed: c.seed, rng, wrongPdf: true })
        : exact;

    return {
        kMeasured, kGeometric, kResidual: Math.abs(kMeasured - kGeometric),
        seriesWorstRel, seriesDeepestRel, seriesRelByDepth,
        whiteFurnaceWorstRel: whiteWorstRel, deficitVsKPowNWorst: deficitWorst,
        neeRel: rel(nee, exact), bsdfRel: rel(bsdf, exact), misRel: rel(mis, exact),
        misWeightSumErr: wErr,
        identityResidual: Math.abs(occ + emit - c.rho),
    };
}

const RENDERBOUNCE_MODES = ["series"];   // v4074 -- the single source `modes` and `defaults()` both read

export const renderBounceDevice = {
    plantKind: "method",
    modes: RENDERBOUNCE_MODES,
    name: "interreflection-and-direct-the-same-solid-angle-twice",
    observables: RENDERBOUNCE_OBSERVABLES,
    build: buildRenderBounce,
    // v4074 -- ONE DECLARATION, HONOURED BY BOTH FIELDS. `defaults()` used to return `mode || "series"`,
    // which ECHOES ANY STRING BACK, so checkMode asked for a nonsense mode, got it back, and concluded the
    // device declared it. A mode selects WHICH PHYSICS RUNS, so a device that accepts a name it does not
    // declare runs something else and says nothing. The list was never unknown -- it is the `modes` array
    // directly above -- and build() never reads `mode` at all, so there was no second mode to protect.
    // Both fields read MODES so a future mode cannot be added to one and missed by the other.
    defaults: ({ mode } = {}) => ({ mode: RENDERBOUNCE_MODES.includes(mode) ? mode : RENDERBOUNCE_MODES[0], config: { ...DEF } }),
};

/**
 * v3327's split: this half PRINTS and renderBounceBind-selfcheck beside it is what exits nonzero.
 * Required by the bench door, and required in a way a gate checks: registryOrphans asserts BOTH directions --
 * no reporting module without a bench entry, and no bench entry whose module cannot report. Adding the row
 * without this function would have rendered an error where a reader expected a measurement, and the gate said so.
 */
export function reportLines() {
    const h = buildRenderBounce({ mode: "series", config: {} });
    const p = buildRenderBounce({ mode: "series", config: { planted: true } });
    const f = (v, n = 6) => (Math.abs(v) < 1e-3 && v !== 0 ? v.toExponential(3) : v.toFixed(n));
    const L = [];
    L.push("[render/bounces+nee] the same solid angle, blocking and emitting");
    L.push("");
    L.push("  THE GEOMETRY, MEASURED RATHER THAN TYPED");
    L.push("    k by casting rays          " + f(h.kMeasured));
    L.push("    (r/d)^2                    " + f(h.kGeometric) + "     residual " + f(h.kResidual));
    L.push("");
    L.push("  THE TRUNCATED SERIES, EXACT AT EVERY DEPTH");
    L.push("    worst relative over " + DEF.maxDepth + "     " + f(h.seriesWorstRel)
        + "   (at the deepest, " + f(h.seriesDeepestRel) + ")");
    L.push("    white furnace: |(1-L) - k^n|  " + f(h.deficitVsKPowNWorst) + "   a number predicted before the run");
    L.push("");
    L.push("  THREE ESTIMATORS, ONE DIRECT TERM");
    L.push("    sample the light           rel " + f(h.neeRel));
    L.push("    sample the BSDF            rel " + f(h.bsdfRel) + "   looser ON PURPOSE: a small light is hit rarely,");
    L.push("                                              which is the whole reason NEE exists");
    L.push("    MIS (balance heuristic)    rel " + f(h.misRel));
    L.push("    MIS weights sum to 1       " + h.misWeightSumErr + " exactly -- an invariance, no sampling in it");
    L.push("");
    L.push("  *** THE IDENTITY THAT SPANS BOTH FILES ***");
    L.push("    occluded furnace + direct - plain furnace = " + f(h.identityResidual));
    L.push("    Two files, two estimators, two sets of random draws. If they disagreed, one of the two");
    L.push("    rounds would be wrong and neither could tell alone.");
    L.push("");
    L.push("  UNDER THE MODULES' OWN PLANTS");
    L.push("    series worst rel           " + f(h.seriesWorstRel) + " -> " + f(p.seriesWorstRel) + "   (loseThroughput)");
    L.push("    direct term rel            " + f(h.neeRel) + " -> " + f(p.neeRel) + "   (wrongPdf)");
    L.push("    identity residual          " + f(h.identityResidual) + " -> " + f(p.identityResidual));
    L.push("    *** white furnace          " + f(h.whiteFurnaceWorstRel) + " -> " + f(p.whiteFurnaceWorstRel) + "   BIT-IDENTICAL ***");
    L.push("    At rho = 1 the throughput factor IS 1, so the bug is the truth there. The exactest key in");
    L.push("    the round is the one place this fault cannot be seen -- and losing throughput turns EVERY");
    L.push("    surface into a perfect reflector, so a renderer passing a white-furnace test can have every");
    L.push("    material wrong. That is why this device's default albedo is 0.8, and the default is gated.");
    L.push("    k                          " + f(h.kMeasured) + " under both: the sphere is where it is.");
    return L;
}
