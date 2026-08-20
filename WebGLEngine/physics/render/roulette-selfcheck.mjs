// WebGLEngine/physics/render/roulette-selfcheck.mjs -- v3471
//
// Run: node physics/render/roulette-selfcheck.mjs
//
// *** RUSSIAN ROULETTE IS NOT A VARIANCE REDUCTION AND THIS FILE MEASURES BOTH HALVES OF THAT. *** v3468's
// cosine sampling made the answer the same and the noise SMALLER. Roulette makes the answer the same and the
// noise LARGER, in exchange for shorter paths. Calling both "optimisations" hides the only thing a person
// actually has to decide.
//
// THREE CLAIMS, EACH WITH ITS OWN NUMBER:
//
//   1. UNBIASED -- the survival probability q is a parameter that must not matter. Every q must land on the
//      same closed-form limit rho(1-k)/(1-rho k), which v3470 established independently.
//   2. CHEAPER -- the mean number of extra bounces is kq/(1-kq) exactly, because a path continues only when it
//      is BOTH blocked and survives.
//   3. NOISIER -- the spread grows as q falls. That is the price, and it is the half nobody quotes.
//
// AND THE FAULT IS THE ONE EVERYBODY WRITES: kill paths and forget to divide the survivors by q. It does not
// merely add noise -- it changes the answer to rho(1-k)/(1-rho k q), A DIFFERENT CLOSED FORM, so the wrong code
// converges beautifully to the wrong number.
"use strict";
import { rng, cosineSampleHemisphere, createCoordinateSystem, toWorld } from "./furnace.mjs";
import { occluded } from "./occlusion.mjs";
import { gather, seriesLimit, rrUncompensated, rrMeanBounces } from "./bounces.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ----  " + m);

const wire = { rng, sampler: cosineSampleHemisphere, frame: createCoordinateSystem, toWorld };
const N = [0, 1, 0], P = [0, 0, 0];
const SPHERE = [{ centre: [0, 1.5, 0], radius: 1 }];      // r/d = 2/3, so k ~ 4/9 -- deep paths, RR earns its keep
const blocked = (dir) => occluded(P, dir, SPHERE);
const RHO = 0.85, S = 300000, DEEP = 400;

const K = (() => {
    const rand = rng(4242);
    const { Nt, Nb } = createCoordinateSystem(N);
    let hit = 0;
    for (let i = 0; i < S; i++) if (blocked(toWorld(cosineSampleHemisphere(rand(), rand()), N, Nt, Nb))) hit++;
    return hit / S;
})();
const LIMIT = seriesLimit(RHO, K);
say(`k = ${K.toFixed(5)} (geometry: (r/d)^2 = ${(4 / 9).toFixed(5)}), rho = ${RHO}, closed-form limit ${LIMIT.toFixed(6)}`);

/* ------------------------------------------------------------------------------------------------------------
 * 1. UNBIASED: q IS A PARAMETER THAT MUST NOT MATTER
 * --------------------------------------------------------------------------------------------------------- */
{
    const rows = [0.9, 0.7, 0.5, 0.3].map((q) => ({ q, got: gather(RHO, S, { seed: 21, maxDepth: DEEP, blocked, ...wire, rrQ: q }) }));
    for (const r of rows) say(`q = ${r.q}: ${r.got.toFixed(6)} against the limit ${LIMIT.toFixed(6)}`);
    ok("!! *** EVERY SURVIVAL PROBABILITY LANDS ON THE SAME LIMIT -- ROULETTE IS UNBIASED ***",
       rows.every((r) => Math.abs(r.got - LIMIT) / LIMIT < 8e-3),
       `FOUR values of q spanning 0.9 down to 0.3, one answer. *** THE PARAMETER THAT MUST NOT MATTER IS THE ONE THAT DECIDES WHICH PATHS DIE. Killing 70% of continuations at every bounce and still recovering the same number is the entire claim, and it works because the survivors are divided by q and carry the dead paths' share. ***`);

    const noRr = gather(RHO, S, { seed: 21, maxDepth: DEEP, blocked, ...wire });
    ok("...and it agrees with the un-rouletted deep run, so RR did not merely move both together",
       Math.abs(noRr - LIMIT) / LIMIT < 8e-3,
       `${noRr.toFixed(6)} at depth ${DEEP} with no roulette. If only the RR runs had been compared with each other, a shared bias would have looked like agreement.`);
}

/* ------------------------------------------------------------------------------------------------------------
 * 2. CHEAPER: THE MEAN PATH LENGTH IS PREDICTED, NOT OBSERVED
 * --------------------------------------------------------------------------------------------------------- */
{
    const rows = [0.9, 0.7, 0.5, 0.3].map((q) => {
        gather(RHO, S, { seed: 33, maxDepth: DEEP, blocked, ...wire, rrQ: q });
        return { q, got: gather.lastMeanBounces, want: rrMeanBounces(K, q) };
    });
    for (const r of rows) say(`q = ${r.q}: mean extra bounces ${r.got.toFixed(4)} against kq/(1-kq) = ${r.want.toFixed(4)}`);
    ok("!! *** THE COST IS A CLOSED FORM TOO: kq/(1-kq), MEASURED ACROSS FOUR q ***",
       rows.every((r) => Math.abs(r.got - r.want) / r.want < 0.03),
       "A path continues only when it is BOTH blocked and survives, so the continuation probability is kq and the expected extra bounces sum geometrically. THE SAVING IS NOT AN IMPRESSION -- it is a number that can be predicted before the run and disagreed with afterwards.");

    ok("...and lowering q really does shorten paths, monotonically",
       rows.every((r, i) => i === 0 || r.got < rows[i - 1].got),
       rows.map((r) => r.q + "->" + r.got.toFixed(3)).join("  ") + ". Stated separately from the formula because a formula can be right about a quantity that never moves.");
}

/* ------------------------------------------------------------------------------------------------------------
 * 3. NOISIER: THE HALF NOBODY QUOTES
 * --------------------------------------------------------------------------------------------------------- */
{
    const spread = (opts) => {
        const xs = [];
        for (let s = 1; s <= 40; s++) xs.push(gather(RHO, 400, { seed: s * 7919, maxDepth: DEEP, blocked, ...wire, ...opts }));
        const m = xs.reduce((a, b) => a + b, 0) / xs.length;
        return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length);
    };
    const plain = spread({}), q7 = spread({ rrQ: 0.7 }), q3 = spread({ rrQ: 0.3 });
    say(`std-dev over 40 seeds at 400 paths: no RR ${plain.toExponential(3)} | q=0.7 ${q7.toExponential(3)} | q=0.3 ${q3.toExponential(3)}`);
    ok("!! *** ROULETTE MAKES IT NOISIER, AND THE NOISE GROWS AS q FALLS ***",
       q3 > q7 && q7 > plain,
       `*** THIS IS THE OPPOSITE OF v3468. Cosine sampling gave the same answer with LESS noise -- a free improvement. Roulette gives the same answer with MORE noise and SHORTER paths: a TRADE, not a win. Calling both "optimisations" hides the only thing a person actually has to decide, which is whether the cheaper paths buy back more samples than the extra variance costs. ***`);
}

/* ------------------------------------------------------------------------------------------------------------
 * 4. THE FAULT: KILL PATHS, FORGET TO COMPENSATE
 * --------------------------------------------------------------------------------------------------------- */
{
    const rows = [0.7, 0.5].map((q) => ({
        q,
        got: gather(RHO, S, { seed: 44, maxDepth: DEEP, blocked, ...wire, rrQ: q, noRrCompensation: true }),
        want: rrUncompensated(RHO, K, q),
    }));
    for (const r of rows) say(`q = ${r.q}, no 1/q compensation: ${r.got.toFixed(6)} against rho(1-k)/(1-rho k q) = ${r.want.toFixed(6)} [true limit ${LIMIT.toFixed(6)}]`);
    ok("!! *** THE UNCOMPENSATED ESTIMATOR CONVERGES BEAUTIFULLY TO A DIFFERENT CLOSED FORM ***",
       rows.every((r) => Math.abs(r.got - r.want) / r.want < 8e-3 && Math.abs(r.got - LIMIT) / LIMIT > 0.02),
       `*** IT IS NOT NOISE AND IT DOES NOT SHRINK WITH MORE SAMPLES: rho(1-k)/(1-rho k q) is a perfectly well-behaved answer to a DIFFERENT QUESTION, and it gets smoother as you throw samples at it. That is the worst kind of bug -- one whose convergence looks like correctness -- and the only thing that catches it is knowing the number it should have reached. ***`);

    ok("...and the error grows as q falls, so a gentle roulette hides it best",
       Math.abs(rows[1].got - LIMIT) > Math.abs(rows[0].got - LIMIT),
       `${(100 * Math.abs(rows[0].got / LIMIT - 1)).toFixed(1)}% off at q=0.7 against ${(100 * Math.abs(rows[1].got / LIMIT - 1)).toFixed(1)}% at q=0.5. A cautious q=0.95 would put this fault under a percent -- INSIDE ANY TOLERANCE ANYBODY WOULD WRITE -- which is why the check is against a PREDICTED VALUE and not a threshold.`);
}

console.log(fails ? "\nroulette-selfcheck: " + fails + " FAILED" : "\nroulette-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
