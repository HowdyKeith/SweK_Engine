// WebGLEngine/physics/render/bounces-selfcheck.mjs -- v3470
//
// Run: node physics/render/bounces-selfcheck.mjs
//
// *** THE KEY IS EXACT AT EVERY DEPTH, NOT ONLY IN THE LIMIT. *** With a grey surface of albedo rho covering a
// cosine-weighted fraction k of the hemisphere:
//
//     L(n) = rho (1 - k) (1 - (rho k)^n) / (1 - rho k)        and at rho = 1,   L(n) = 1 - k^n EXACTLY
//
// A perfectly reflecting closed furnace must read 1, and the shortfall at finite depth is not "some small
// error" -- IT IS k^n, PREDICTED BEFORE THE RUN.
//
// AND k IS MEASURED RATHER THAN TYPED: it comes from casting rays at the real sphere through v3469's
// intersection code, so the geometry half is derived and only the two-state recursion is modelled. If k were
// asserted, the series would be a restatement of itself.
"use strict";
import { rng, cosineSampleHemisphere, createCoordinateSystem, toWorld } from "./furnace.mjs";
import { occluded } from "./occlusion.mjs";
import { gather, seriesExact, seriesLimit } from "./bounces.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ----  " + m);

const wire = { rng, sampler: cosineSampleHemisphere, frame: createCoordinateSystem, toWorld };
const N = [0, 1, 0], P = [0, 0, 0];
const SPHERE = [{ centre: [0, 2, 0], radius: 1 }];       // r/d = 1/2, so k should come out near 1/4
const blocked = (dir) => occluded(P, dir, SPHERE);
const S = 300000;

/* ------------------------------------------------------------------------------------------------------------
 * 0. k, MEASURED FROM THE GEOMETRY
 * --------------------------------------------------------------------------------------------------------- */
const K = (() => {
    const rand = rng(4242);
    const { Nt, Nb } = createCoordinateSystem(N);
    let hit = 0;
    for (let i = 0; i < S; i++) if (blocked(toWorld(cosineSampleHemisphere(rand(), rand()), N, Nt, Nb))) hit++;
    return hit / S;
})();
say(`k measured by ray casting: ${K.toFixed(5)} (geometry predicts (r/d)^2 = 0.25)`);
ok("!! k comes from the GEOMETRY, not from a constant", Math.abs(K - 0.25) < 4e-3,
   "v3469 proved a cap of half-angle asin(r/d) removes exactly (r/d)^2 in cosine-weighted measure, and this run recovers it by casting rays. TYPING k WOULD HAVE MADE THE SERIES BELOW A RESTATEMENT OF ITSELF rather than a second route to the same number.");

/* ------------------------------------------------------------------------------------------------------------
 * 1. THE TRUNCATED SERIES, DEPTH BY DEPTH
 * --------------------------------------------------------------------------------------------------------- */
{
    const RHO = 0.8;
    const rows = [1, 2, 3, 5, 8].map((n) => {
        const got = gather(RHO, S, { seed: 9, maxDepth: n, blocked, ...wire });
        return { n, got, want: seriesExact(RHO, K, n) };
    });
    for (const r of rows) say(`depth ${r.n}: ${r.got.toFixed(6)} against ${r.want.toFixed(6)}`);
    ok("!! *** EVERY DEPTH LANDS ON ITS OWN PREDICTED PARTIAL SUM ***",
       rows.every((r) => Math.abs(r.got - r.want) / r.want < 5e-3),
       "FIVE depths, one formula, and the gaps between them SHRINK GEOMETRICALLY. A single depth could be matched by a wrong constant; a whole series with the right RATIO between terms could not.");

    ok("...and depth 1 reproduces v3467's single gather, so the new machinery did not move the old answer",
       Math.abs(rows[0].got - RHO * (1 - K)) / (RHO * (1 - K)) < 5e-3,
       `${rows[0].got.toFixed(6)} against rho*(1-k) = ${(RHO * (1 - K)).toFixed(6)}. Depth 1 IS the no-inter-reflection case, and it must agree with the round that had no recursion at all.`);

    const lim = gather(RHO, S, { seed: 9, maxDepth: 40, blocked, ...wire });
    ok("!! and at depth 40 it sits on the closed-form limit", Math.abs(lim - seriesLimit(RHO, K)) / seriesLimit(RHO, K) < 5e-3,
       `${lim.toFixed(6)} against rho(1-k)/(1-rho k) = ${seriesLimit(RHO, K).toFixed(6)}.`);
}

/* ------------------------------------------------------------------------------------------------------------
 * 2. ALBEDO ONE: A PERFECT FURNACE MUST READ 1, AND THE DEFICIT IS EXACTLY k^n
 * --------------------------------------------------------------------------------------------------------- */
{
    const rows = [1, 2, 3, 4].map((n) => {
        const got = gather(1, S, { seed: 3, maxDepth: n, blocked, ...wire });
        return { n, got, deficit: 1 - got, want: Math.pow(K, n) };
    });
    for (const r of rows) say(`rho=1 depth ${r.n}: reads ${r.got.toFixed(6)}, deficit ${r.deficit.toExponential(3)} against k^n = ${r.want.toExponential(3)}`);
    ok("!! *** A PERFECTLY REFLECTING FURNACE FALLS SHORT OF 1 BY EXACTLY k^n ***",
       rows.every((r) => Math.abs(r.deficit - r.want) < 4e-3 + 0.06 * r.want),
       `*** THE ERROR IS NOT "SMALL", IT IS PREDICTED. Energy the accounting LOSES appears as a deficit LARGER than k^n; energy it INVENTS appears as a surplus. A test that only asked "is it close to 1" would accept both, and both are real bugs with opposite causes. ***`);

    ok("...and the deficit falls by a factor of k per bounce, which is the geometric ratio itself",
       Math.abs((rows[0].deficit / rows[1].deficit) - 1 / K) / (1 / K) < 0.08,
       `${(rows[0].deficit / rows[1].deficit).toFixed(3)} against 1/k = ${(1 / K).toFixed(3)}. The RATIO is checked as well as the values, because a systematic scale error preserves ratios and a systematic ratio error preserves no value -- the two faults fail different lines.`);
}

/* ------------------------------------------------------------------------------------------------------------
 * 3. THE TWO BOUNCE FAULTS, WITH OPPOSITE SIGNS
 * --------------------------------------------------------------------------------------------------------- */
{
    const RHO = 0.5, D = 6;
    const clean = gather(RHO, S, { seed: 12, maxDepth: D, blocked, ...wire });
    const lost = gather(RHO, S, { seed: 12, maxDepth: D, blocked, ...wire, loseThroughput: true });
    // *** AT rho = 1 THIS FAULT IS INVISIBLE AND THAT IS WORTH MORE THAN THE CHECK I FIRST WROTE. With a
    // perfect reflector the throughput never decays, so a path that runs out of depth adds exactly 1 -- and the
    // invented energy CANCELS THE TRUNCATION DEFICIT EXACTLY. The furnace reads 1.000000 at any depth: the
    // right answer, for the wrong reason, from broken code. THE STRONGEST KEY IN THIS FILE IS BLIND TO ONE OF
    // ITS TWO FAULTS, and only a run with rho < 1 exposes it, because then the throughput decays and the
    // invention no longer matches what was lost. ***
    const blindAtOne = gather(1, S, { seed: 12, maxDepth: 2, blocked, ...wire, noDepthGuard: true });
    const invented = gather(RHO, S, { seed: 12, maxDepth: 2, blocked, ...wire, noDepthGuard: true });
    const limit = seriesLimit(RHO, K);
    say(`clean ${clean.toFixed(6)} | throughput dropped ${lost.toFixed(6)} | depth guard removed (rho=1, depth 2) ${invented.toFixed(6)}`);

    ok("!! *** FORGETTING TO CARRY THE ALBEDO INTO THE NEXT BOUNCE MAKES IT TOO BRIGHT ***", lost > clean * 1.02,
       `${lost.toFixed(6)} against ${clean.toFixed(6)}. Every path that bounces returns as if it had lost nothing on the way, so the deeper the path the bigger the lie -- AND IT IS INVISIBLE AT DEPTH 1, where there is no next bounce to carry anything into. A one-bounce test certifies it.`);

    ok("!! *** RETURNING THE SKY AT THE DEPTH LIMIT PUSHES PAST THE INFINITE-DEPTH LIMIT, WHICH NO TRUNCATION CAN DO ***",
       invented > limit,
       `${invented.toFixed(6)} at depth 2 against a limit of ${limit.toFixed(6)} that an INFINITE number of bounces could not exceed. *** THAT IS THE SIGNATURE: an honest truncation always sits BELOW the limit and climbs toward it, so a two-bounce answer above it is energy that was manufactured rather than gathered. ***`);

    ok("!! *** AND THE SAME FAULT IS COMPLETELY INVISIBLE AT rho = 1, WHICH IS THE FINDING OF THIS SECTION ***",
       Math.abs(blindAtOne - 1) < 1e-9,
       `${blindAtOne.toFixed(6)} -- EXACTLY 1, the right answer from broken code. With a perfect reflector the throughput never decays, so the invented energy CANCELS THE TRUNCATION DEFICIT TERM FOR TERM. *** THE STRONGEST KEY IN THIS FILE IS BLIND TO ONE OF ITS TWO FAULTS, and saying so is worth more than deleting the key: it means the albedo-1 furnace must never be the ONLY bounce check, and a suite that ran it alone would certify an energy-inventing renderer. ***`);
}

console.log(fails ? "\nbounces-selfcheck: " + fails + " FAILED" : "\nbounces-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
