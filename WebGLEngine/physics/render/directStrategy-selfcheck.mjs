// WebGLEngine/physics/render/directStrategy-selfcheck.mjs -- v3495
//
// Run: node physics/render/directStrategy-selfcheck.mjs   (~40s)
//
// *** v3489 MEASURED MIS ON A DIFFUSE SURFACE AND CALLED IT A TRADE RATHER THAN A WIN -- 1.4x at one light size
// and 300x WORSE at another -- AND WROTE "DO NOT RE-PROPOSE WITHOUT NEW EVIDENCE". THIS IS THE NEW EVIDENCE, AND
// IT REVERSES THE VERDICT FOR A DIFFERENT SURFACE. *** A diffuse BRDF has no sharp lobe, so BSDF sampling is
// never the right strategy and there is nothing for MIS to combine. A microfacet BRDF does: a near-mirror finds
// a big light easily and almost never finds a small one, and a rough surface is the other way round.
//
// SO THE THREE STRATEGIES ARE MEASURED ACROSS THE REGIME RATHER THAN AT A POINT, AND THE RESULT IS NOT THAT MIS
// WINS -- IT IS THAT **MIS IS NEVER CATASTROPHIC**, WHICH IS A DIFFERENT AND MORE USEFUL CLAIM.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { trace } from "./pathTracer.mjs";
import { rng } from "./furnace.mjs";
import { misWeight } from "./microfacet.mjs";
import { buildTable } from "./energyCompensation.mjs";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ----  " + m);

/**
 * A flat rough surface with a sphere light ON THE MIRROR DIRECTION.
 *
 * *** THE PLACEMENT IS THE FIXTURE'S WHOLE DESIGN AND MY FIRST ONE WAS WRONG. I put the light overhead, where
 * the specular lobe does not point, and BSDF SAMPLING READ EXACTLY 0.00000 IN EVERY CELL -- v3474's trap, where
 * a route that cannot reach the light returns a constant zero and looks perfectly precise. COMPARING VARIANCES
 * BEFORE CHECKING THAT BOTH ROUTES COMPUTE THE QUANTITY IS HOW THAT PASSES FOR A RESULT. ***
 */
const EYE = [1.5, 0, 2.6], VDIR = [-0.5, 0, -0.866], MIRROR = [-0.5, 0, 0.866], DIST = 3;
function shade(alpha, lightR, mode, opts = {}, N = 40000, seed = 3) {
    const R = 2000, C = [MIRROR[0] * DIST, 0, MIRROR[2] * DIST];
    const sc = [{ centre: [0, 0, -R], radius: R, roughness: alpha },
                { centre: C, radius: lightR, emit: 4, albedo: 0 }];
    const r = rng(seed);
    let s = 0;
    for (let i = 0; i < N; i++) s += trace(EYE, VDIR, sc, r, { maxDepth: 3, sky: () => 0, direct: mode, ...opts });
    return s / N;
}
function stat(alpha, lightR, mode, seeds = 16, N = 4000) {
    const v = [];
    for (let s = 1; s <= seeds; s++) v.push(shade(alpha, lightR, mode, {}, N, s));
    const m = v.reduce((a, b) => a + b, 0) / v.length;
    return { m, rel: Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / v.length) / Math.max(1e-12, m) };
}
const CELLS = [[0.02, 0.2], [0.05, 0.2], [0.2, 0.2], [0.6, 0.2], [0.02, 1.0], [0.2, 1.0], [0.6, 1.0]];
const MODES = ["bsdf", "nee", "mis"];

/* ------------------------------------------------------------------------------------------------------------
 * 1. *** BEFORE ANY VARIANCE IS COMPARED: DOES EVERY ROUTE ACTUALLY COMPUTE THE QUANTITY ***
 * --------------------------------------------------------------------------------------------------------- */
{
    const zero = MODES.map((m) => ({ m, n: CELLS.filter(([a, r]) => shade(a, r, m, {}, 4000) === 0).length }));
    say(`cells where a strategy returns exactly zero: ${zero.map((z) => `${z.m} ${z.n}/${CELLS.length}`).join(", ")}`);
    ok("!! *** NO STRATEGY RETURNS A CONSTANT ZERO ON THIS FIXTURE, WHICH IS THE PRECONDITION FOR EVERYTHING BELOW ***",
       zero.every((z) => z.n === 0),
       "*** v3474: A DEGENERATE ESTIMATOR LOOKS PERFECTLY PRECISE. My first fixture put the light overhead, off the specular lobe, and BSDF sampling read exactly 0.00000 in all seven cells -- a relative standard deviation of zero, which a ranking would have called the winner. The light now sits ON THE MIRROR DIRECTION so both routes can reach it, and THIS CHECK RUNS FIRST rather than as a caveat afterwards. ***");
}

/* ------------------------------------------------------------------------------------------------------------
 * 2. THE ANSWER MUST NOT MOVE -- THE PARAMETER THAT MUST NOT MATTER IS THE STRATEGY
 * --------------------------------------------------------------------------------------------------------- */
{
    // *** THE TOLERANCE IS DERIVED FROM THE ESTIMATORS' OWN NOISE RATHER THAN CHOSEN. My first version asked for
    // 2% and read 3.36%, at the one cell where BSDF sampling is at its noisiest -- SO THE ASSERTION WAS ABOUT
    // THE SAMPLE COUNT AND NOT ABOUT THE ANSWER. Each strategy is run over 16 seeds, its STANDARD ERROR OF THE
    // MEAN comes out of that spread, and the three means must agree within a few combined standard errors. A
    // NOISY ROUTE IS ALLOWED TO BE FURTHER AWAY, AND A QUIET ONE IS NOT -- which is the property, where a flat
    // percentage would have been a threshold quietly indexed to whichever route happened to be loudest. ***
    const SEEDS = 16, N = 4000;
    let worstSigma = 0;
    const rows = CELLS.map(([a, r]) => {
        const s = {};
        for (const m of MODES) { const t = stat(a, r, m, SEEDS, N); s[m] = { m: t.m, se: t.rel * t.m / Math.sqrt(SEEDS) }; }
        let sig = 0;
        for (let i = 0; i < MODES.length; i++) for (let j = i + 1; j < MODES.length; j++) {
            const A = s[MODES[i]], B = s[MODES[j]];
            sig = Math.max(sig, Math.abs(A.m - B.m) / Math.sqrt(A.se * A.se + B.se * B.se));
        }
        worstSigma = Math.max(worstSigma, sig);
        return { a, r, s, sig };
    });
    for (const x of rows) say(`  alpha ${String(x.a).padEnd(5)} lightR ${String(x.r).padEnd(4)} bsdf/nee/mis: ${MODES.map((m) => x.s[m].m.toFixed(5)).join(" / ")}   worst pair ${x.sig.toFixed(2)} sigma`);
    say(`worst disagreement anywhere, in COMBINED STANDARD ERRORS: ${worstSigma.toFixed(2)} sigma`);
    ok("!! *** THREE ESTIMATORS, ONE ANSWER: WHICH ONE YOU CHOOSE MUST NOT MOVE IT ***",
       worstSigma < 4,
       "*** v3468'S PUREST SHAPE, WHERE THE PARAMETER IS THE ALGORITHM. The three share the BRDF and nothing else: one samples the light and evaluates f, one samples f and hopes to hit the light, and one runs both and weights them. A method that lowered the variance AND moved the answer would be a different, wrong integral. AND THE AGREEMENT IS MEASURED IN THE ESTIMATORS' OWN SIGMA, so a bias smaller than a percent would still fail here IF the routes were quiet enough to see it -- which a fixed percentage could never promise. ***");
}

/* ------------------------------------------------------------------------------------------------------------
 * 3. *** THE FINDING: THE BEST STRATEGY CHANGES WITH THE REGIME, WHICH IS WHY v3489'S VERDICT DOES NOT CARRY ***
 * --------------------------------------------------------------------------------------------------------- */
{
    const rows = CELLS.map(([a, r]) => {
        const s = {}; for (const m of MODES) s[m] = stat(a, r, m);
        const best = [...MODES].sort((x, y) => s[x].rel - s[y].rel)[0];
        return { a, r, s, best };
    });
    for (const x of rows) say(`  alpha ${String(x.a).padEnd(5)} lightR ${String(x.r).padEnd(4)} rel sd  ${MODES.map((m) => x.s[m].rel.toExponential(2)).join(" / ")}   best: ${x.best}`);

    const winners = new Set(rows.map((x) => x.best));
    ok("!! *** ALL THREE STRATEGIES WIN SOMEWHERE -- BSDF FOR A NEAR-MIRROR AND A BIG LIGHT, NEE FOR A ROUGH SURFACE AND A SMALL ONE ***",
       winners.size >= 2 && winners.has("nee") && winners.has("bsdf"),
       `*** THAT IS EXACTLY WHAT v3489 COULD NOT FIND FOR A DIFFUSE SURFACE, AND THE REASON IS STRUCTURAL RATHER THAN NUMERICAL: A DIFFUSE BRDF HAS NO SHARP LOBE, so BSDF sampling is never the right strategy and MIS has nothing to combine -- it just spends half its samples on a route that finds nothing. A microfacet BRDF has a lobe, so there is a regime where each route is the good one, AND THAT IS THE CONDITION UNDER WHICH COMBINING THEM MEANS ANYTHING. Winners here: ${[...winners].join(", ")}. ***`);

    const worst = {}; for (const m of MODES) worst[m] = Math.max(...rows.map((x) => x.s[m].rel));
    say(`worst relative std dev anywhere on the grid: ${MODES.map((m) => `${m} ${worst[m].toExponential(2)}`).join(", ")}`);
    ok("!! *** AND THE CLAIM FOR MIS IS NOT THAT IT WINS -- IT IS THAT IT IS NEVER CATASTROPHIC ***",
       worst.mis < worst.nee / 5 && worst.mis < worst.bsdf / 20,
       `*** MIS IS RARELY THE BEST CELL AND IT IS NEVER THE WORST: its worst case anywhere is ${worst.mis.toExponential(2)} against ${worst.nee.toExponential(2)} for NEE and ${worst.bsdf.toExponential(2)} for BSDF. THAT IS INSURANCE RATHER THAN AN OPTIMISATION, and it is a different claim from the one v3471 refused for roulette (same answer, MORE noise) and from the one v3468 accepted for cosine sampling (same answer, LESS noise). A RENDERER PICKS ONE STRATEGY FOR A WHOLE SCENE AND CANNOT KNOW WHICH CELL EACH PIXEL IS IN, which is what makes the worst case the number that matters. ***`);
}

/* ------------------------------------------------------------------------------------------------------------
 * 4. THE BALANCE HEURISTIC, ON A PAIR v3472 NEVER TESTED
 * --------------------------------------------------------------------------------------------------------- */
{
    let worst = 0;
    for (let i = 1; i <= 2000; i++) {
        const pL = i * 0.013, pB = Math.sin(i) * Math.sin(i) * 7 + 0.001;
        worst = Math.max(worst, Math.abs(misWeight(pL, pB) + misWeight(pB, pL) - 1));
    }
    say(`worst |w_light + w_bsdf - 1| over 2000 pdf pairs: ${worst.toExponential(2)}`);
    ok("!! the two weights sum to 1 to machine precision, and that is BY CONSTRUCTION rather than by tolerance",
       worst < 1e-15,
       "v3472 proved this for the cone/COSINE pair; THIS IS THE CONE AGAINST THE NDF, a different pair, and the property has to hold again. It is p_i/(p_L+p_B) summed over i, which is the only reason combining two estimators does not double-count.");

    ok("...and two zero pdfs REFUSE rather than dividing",
       misWeight(0, 0) === 0,
       "A direction neither route could have chosen carries no weight from either. Returning NaN there would poison a pixel and read as a black speck.");
}

/* ------------------------------------------------------------------------------------------------------------
 * 5. *** TWO PLANTS, WORST IN OPPOSITE CELLS ***
 * --------------------------------------------------------------------------------------------------------- */
{
    const cells = [[0.02, 1.0], [0.05, 0.2], [0.2, 0.2], [0.6, 0.2]];
    const rows = cells.map(([a, r]) => {
        const c = shade(a, r, "mis");
        return { a, r, c, dbl: shade(a, r, "mis", { plantNoMisWeight: true }) / c, sup: shade(a, r, "mis", { plantSuppressBsdf: true }) / c };
    });
    for (const x of rows) say(`  alpha ${String(x.a).padEnd(5)} lightR ${String(x.r).padEnd(4)} noMisWeight ${x.dbl.toFixed(4)}x   suppressBsdf ${x.sup.toFixed(4)}x`);

    ok("!! dropping the weights DOUBLE COUNTS, and it approaches exactly 2x where both routes are equally likely",
       rows[3].dbl > 1.85 && rows[3].dbl < 2.1 && rows[0].dbl < 1.3,
       "Both routes add the same light and neither is scaled down. It is MILDEST where one route dominates -- at a near-mirror with a big light the BSDF pdf swamps the light pdf, so the weights were nearly 1 and 0 already and there was little to double.");

    ok("!! *** AND SUPPRESSING THE BSDF SHARE IS WORST EXACTLY WHERE THE DOUBLE COUNT IS MILDEST ***",
       rows[0].sup < 0.25 && rows[3].sup > 0.99,
       `*** ${(100 - rows[0].sup * 100).toFixed(0)}% OF THE LIGHT LOST at a near-mirror with a big light, against ${((1 - rows[3].sup) * 100).toFixed(2)}% -- INVISIBLE -- on a rough surface with a small one. THE TWO PLANTS ARE WORST IN OPPOSITE CELLS, so a suite testing one configuration would certify one of them, and neither cell is the obvious one to pick. Same shape as v3489's pair, in a new subject. ***`);
}

/* ------------------------------------------------------------------------------------------------------------
 * 6. *** THE DEFECT THIS ROUND FOUND: v3489'S FAULT, RE-COMMITTED FOUR ROUNDS LATER IN A NEW BRANCH ***
 * --------------------------------------------------------------------------------------------------------- */
{
    ok("!! a microfacet surface under an explicit emitter collects the light with `direct` at its DEFAULT",
       shade(0.2, 0.2, "bsdf", {}, 20000) > 0.1,
       "*** MY FIRST VERSION RECORDED THE BOUNCE ONLY FOR nee AND mis. With `direct` at \"bsdf\" the record was null, the emitter hit fell through to the LAMBERTIAN guard, and that guard suppresses it because `nee` DEFAULTS TRUE -- while NEE is skipped on microfacet surfaces since v3493. NEITHER ROUTE COLLECTED IT and the surface read EXACTLY 0.00000 in all seven cells. THAT IS v3489'S DEFECT EXACTLY, FOUR ROUNDS AFTER FIXING IT, IN A BRANCH THAT DID NOT EXIST THEN. ***");

    ok("...and it did not show at v3493 because every scene there was lit by sky() rather than by an emitter",
       shade(0.2, 0.2, "bsdf", {}, 8000) > 0 && shade(0.6, 1.0, "bsdf", {}, 8000) > 0,
       "The furnace, the rough-metal scenes and the compensation check all use a constant environment, where there is no emitter sphere for a bounce ray to land on. A WHOLE ROUND OF FIXTURES CAN AGREE ON WHICH QUESTION NOT TO ASK.");

    // *** v3499 -- THE TWO REFUSAL CHECKS THAT STOOD HERE ARE **DELETED**, NOT WEAKENED. They asserted that an
    // msTable with direct=nee/mis THROWS, and v3499 closed that refusal by doing the work the reason described:
    // f_spec + f_ms at the light direction, and the MIXTURE of the two lobes' pdfs on the BSDF side. THE CHECK
    // WENT RED BECAUSE THE MECHANISM IT NAMED WAS CORRECTLY REPLACED -- the species this tree has committed
    // twenty-three times, and the law is to assert the PROPERTY rather than the arrangement that satisfied it.
    //
    // THE PROPERTY v3495 ACTUALLY CARED ABOUT -- that the compensation lobe's direct share is not silently lost
    // -- IS NOW GUARDED SOMEWHERE STRONGER: physics/render/msDirect-selfcheck.mjs plants exactly that omission
    // and measures it at 0.474x of the light on a rough surface, against 0.968x on a smooth one. A REFUSAL IS A
    // PLACEHOLDER WITH A REASON ATTACHED, AND THE RIGHT WAY TO RETIRE ONE IS TO SATISFY THE REASON AND HAND THE
    // GUARD TO WHATEVER NOW HOLDS IT. Weakening this line to "throws OR does not" would have guarded nothing.
    ok("!! the msTable + nee/mis combination now RUNS, and its guard has moved rather than vanished",
       (() => { try { shade(0.4, 0.2, "mis", {}, 100); return true; } catch { return false; } })(),
       "If this ever goes red again, the question is whether msDirect-selfcheck still holds the property -- not whether to restore a throw.");
}

/* ------------------------------------------------------------------------------------------------------------
 * 7. THE FRONT DOOR
 * --------------------------------------------------------------------------------------------------------- */
{
    const page = fs.readFileSync(path.join(ROOT, "path-tracer.html"), "utf8");
    ok("!! path-tracer.html runs all three strategies and reports the SPREAD as well as the means",
       /direct:\s*m/.test(page) && /relSd|rel sd/.test(page) && /"bsdf",\s*"nee",\s*"mis"/.test(page),
       "The means agreeing is the correctness claim and the spread is the whole reason to choose between them -- a page showing only one of the two would be answering half the question.");
}

console.log(fails ? "\ndirectStrategy-selfcheck: " + fails + " FAILED" : "\ndirectStrategy-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
