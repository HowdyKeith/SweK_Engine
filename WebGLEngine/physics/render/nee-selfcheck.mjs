// WebGLEngine/physics/render/nee-selfcheck.mjs -- v3472
//
// Run: node physics/render/nee-selfcheck.mjs
//
// Four claims, each with a number:
//
//   1. The direct term from a sphere light is rho * Le * (r/d)^2 -- the EXACT COMPLEMENT of v3469's occlusion
//      key, because blocked and emitting are the same solid angle wearing different clothes.
//   2. Light sampling, BSDF sampling and MIS all agree in expectation. THE STRATEGY IS A PARAMETER THAT MUST
//      NOT MATTER -- and unlike v3468, here the variance gap between them is enormous.
//   3. The balance-heuristic weights sum to EXACTLY one for every direction. Not approximately: that is the
//      only reason combining two estimators does not double-count.
//   4. Using the hemisphere pdf with the cone sampler predicts 1/(1 - cos alpha) too bright -- and it gets
//      WORSE as the light gets smaller, which is the opposite of how anybody debugs.
"use strict";
import { rng, cosineSampleHemisphere, createCoordinateSystem, toWorld, furnace } from "./furnace.mjs";
import { occluded } from "./occlusion.mjs";
import { directExact, directNEE, directBSDF, directMIS, misWeights, conePdf, capHalfAngle, sampleCone } from "./nee.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ----  " + m);

const RHO = 0.18, LE = 1, S = 400000;
const wire = { rng, sampler: cosineSampleHemisphere };

/* ------------------------------------------------------------------------------------------------------------
 * 1. THE DIRECT TERM
 * --------------------------------------------------------------------------------------------------------- */
{
    const rows = [[1, 2], [1, 4], [0.5, 3], [1, 1.2]].map(([r, d]) => ({
        r, d, got: directNEE(RHO, LE, r, d, S, { seed: 3, ...wire }), want: directExact(RHO, LE, r, d),
    }));
    for (const x of rows) say(`r=${x.r} d=${x.d}: ${x.got.toFixed(6)} against rho*Le*(r/d)^2 = ${x.want.toFixed(6)}`);
    ok("!! *** THE DIRECT TERM IS rho * Le * (r/d)^2, ACROSS FOUR GEOMETRIES ***",
       rows.every((x) => Math.abs(x.got - x.want) / x.want < 4e-3),
       "The r=1 d=1.2 row is a light filling most of the sky (alpha = 56 degrees) and the 0.5/3 row is a small one; ONE FORMULA COVERS BOTH, which a wrong constant folded into the pdf could not.");
}

/* ------------------------------------------------------------------------------------------------------------
 * 2. *** THE IDENTITY THAT TIES THREE ROUNDS TOGETHER ***
 * --------------------------------------------------------------------------------------------------------- */
{
    const r = 1, d = 2;
    const P = [0, 0, 0], N = [0, 1, 0];
    const blockerScene = [{ centre: [0, d, 0], radius: r }];
    const geom = { rng, sampler: cosineSampleHemisphere, frame: createCoordinateSystem, toWorld };
    // v3469's occluded furnace, recomputed here rather than quoted.
    const occ = (() => {
        const rand = rng(5); const { Nt, Nb } = createCoordinateSystem(N);
        let sum = 0;
        for (let i = 0; i < S; i++) {
            const dir = toWorld(cosineSampleHemisphere(rand(), rand()), N, Nt, Nb);
            if (!occluded(P, dir, blockerScene)) sum += 1;
        }
        return RHO * (sum / S);
    })();
    const direct = directNEE(RHO, LE, r, d, S, { seed: 3, ...wire });
    const plain = furnace(RHO, S, { seed: 5, strategy: "cosine" });
    say(`occluded furnace ${occ.toFixed(6)} + direct from the same cap ${direct.toFixed(6)} = ${(occ + direct).toFixed(6)}, against the plain furnace ${plain.toFixed(6)}`);
    ok("!! *** BLOCKED PLUS EMITTING EQUALS UNOBSTRUCTED -- THE SAME SOLID ANGLE, COUNTED TWO WAYS ***",
       Math.abs(occ + direct - plain) / plain < 5e-3,
       `*** A STRUCTURAL CHECK ACROSS THREE ROUNDS RATHER THAN A NEW MEASUREMENT: v3467's plain furnace, v3469's occlusion and this round's light must add up, because a cap that removes (r/d)^2 and a cap that supplies (r/d)^2 are the same geometry. IF ANY ONE OF THE THREE WERE WRONG THIS WOULD NOT CLOSE -- and it uses no formula either round was told. ***`);
}

/* ------------------------------------------------------------------------------------------------------------
 * 3. THREE STRATEGIES, ONE ANSWER, VERY DIFFERENT NOISE
 * --------------------------------------------------------------------------------------------------------- */
{
    const r = 0.4, d = 4;                                   // a SMALL light: this is where the strategies part
    const want = directExact(RHO, LE, r, d);
    const got = {
        nee: directNEE(RHO, LE, r, d, S, { seed: 3, ...wire }),
        bsdf: directBSDF(RHO, LE, r, d, S, { seed: 3, ...wire }),
        mis: directMIS(RHO, LE, r, d, S, { seed: 3, ...wire }),
    };
    for (const k of Object.keys(got)) say(`${k.padEnd(5)} ${got[k].toFixed(7)} against ${want.toFixed(7)}`);
    ok("!! *** ALL THREE STRATEGIES LAND ON THE SAME ANSWER ***",
       Object.values(got).every((v) => Math.abs(v - want) / want < 2e-2),
       "THE PARAMETER THAT MUST NOT MATTER IS WHICH ESTIMATOR YOU CHOSE. Three different pdfs, three different sample distributions, one expectation.");

    const spread = (fn, opts) => {
        const xs = [];
        for (let s = 1; s <= 40; s++) xs.push(fn(RHO, LE, r, d, 500, { seed: s * 7919, ...wire, ...opts }));
        const m = xs.reduce((a, b) => a + b, 0) / xs.length;
        return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length);
    };
    const sN = spread(directNEE), sB = spread(directBSDF);
    say(`std-dev over 40 seeds at 500 samples, r/d = ${r / d}: NEE ${sN.toExponential(3)} | BSDF ${sB.toExponential(3)} | ratio ${(sB / sN).toFixed(1)}x`);
    ok("!! *** AND SAMPLING THE LIGHT IS DRAMATICALLY QUIETER FOR A SMALL ONE -- WHICH IS WHY NEE EXISTS ***",
       sB > sN * 3,
       `${(sB / sN).toFixed(1)}x tighter. A cosine-weighted ray finds a light this size only (r/d)^2 = ${((r / d) ** 2 * 100).toFixed(1)}% of the time, so BSDF sampling spends most of its samples learning nothing. *** THIS IS THE v3468 SHAPE AGAIN -- same answer, less noise, a free improvement -- AND NOT THE v3471 SHAPE, where the noise went UP in exchange for speed. Three techniques, and only naming which kind each one is makes them comparable. ***`);
}

/* ------------------------------------------------------------------------------------------------------------
 * 4. THE MIS WEIGHTS, AND THE PDF FAULT
 * --------------------------------------------------------------------------------------------------------- */
{
    const cosA = Math.cos(capHalfAngle(1, 2));
    const pL = conePdf(cosA);
    const rand = rng(77);
    let worst = 0;
    for (let i = 0; i < 20000; i++) {
        const cos = sampleCone(rand(), rand(), cosA)[1];
        const [wl, wb] = misWeights(pL, cos / Math.PI);
        worst = Math.max(worst, Math.abs(wl + wb - 1));
    }
    ok("!! *** THE BALANCE-HEURISTIC WEIGHTS SUM TO ONE, TO MACHINE PRECISION, FOR EVERY DIRECTION ***",
       worst < 1e-15,
       `worst deviation ${worst.toExponential(2)} over 20000 directions. NOT A TOLERANCE -- it is p_i/(p_L+p_B) summed over i, so it is one by construction. THAT IS THE ONLY REASON COMBINING TWO ESTIMATORS DOES NOT DOUBLE-COUNT, and a heuristic whose weights did not sum to one would produce a smooth, confident, wrong image.`);

    const rows = [[1, 2], [0.5, 4], [0.2, 8]].map(([r, d]) => {
        const cA = Math.cos(capHalfAngle(r, d));
        return { r, d, ratio: directNEE(RHO, LE, r, d, S, { seed: 3, ...wire, wrongPdf: true }) / directExact(RHO, LE, r, d), want: 1 / (1 - cA) };
    });
    for (const x of rows) say(`r/d = ${(x.r / x.d).toFixed(3)}: hemisphere pdf gives ${x.ratio.toFixed(3)}x too bright (predicted ${x.want.toFixed(3)})`);
    ok("!! *** THE WRONG PDF PREDICTS 1/(1 - cos alpha), AND IT GETS WORSE AS THE LIGHT GETS SMALLER ***",
       rows.every((x) => Math.abs(x.ratio - x.want) / x.want < 1e-2),
       // THE FIGURES IN THIS MESSAGE ARE INTERPOLATED FROM THE RUN, NOT TYPED. My first version wrote "7.5x,
       // then 32x, then 200x" from memory while the measurement read 7.5, 127 and 3199 -- prose quoting numbers
       // the code did not produce, in a file whose entire subject is not typing numbers. A MESSAGE IS PART OF
       // THE CLAIM, and one that disagrees with its own output is a smaller version of the bug being hunted.
       `${rows.map((x) => x.ratio.toFixed(1) + "x").join(", then ")}. *** THAT IS THE OPPOSITE OF HOW ANYBODY DEBUGS: you shrink the light to simplify the scene and the bug grows. And at a light filling the sky it approaches 1x and DISAPPEARS ENTIRELY -- so the easiest fixture to build is the one that cannot see it. ***`);
}

console.log(fails ? "\nnee-selfcheck: " + fails + " FAILED" : "\nnee-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
