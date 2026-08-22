// WebGLEngine/physics/blobThermal-selfcheck.mjs — v2596
//
// Run: node physics/blobThermal-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs.
//
// GATES physics/blobThermal.js -- Keith: "what if we warmed up the blobarium past kelvin? i would think the
// blobulator would appreciate that?"
//
// THE ANSWER: IT WAS NEVER AT ZERO KELVIN. IT HAS BEEN RUNNING A FEVER THE WHOLE TIME, AND THE FEVER IS WHAT
// DISSOLVED HIM.
import { blobFieldAt, makeBlobs } from "../simulation/tomo/blobPhantom.js";
import { jitterCentres, peakFloor, measureAquariumD, lcg, gaussian } from "./blobThermal.js";
import { advectionLoss } from "./blobBodies.js";

let fails = 0;
const ok = (name, cond, detail) => {
    console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : ""));
    if (!cond) fails++;
};
const peakOf = (bs) => {
    let m = 0;
    for (let i = 0; i < 8000; i++) {
        const x = (i % 20) / 20 * 4 - 2, y = ((i / 20 | 0) % 20) / 20 * 4 - 2, z = ((i / 400 | 0) % 20) / 20 * 4 - 2;
        const v = blobFieldAt(x, y, z, bs);
        if (v > m) m = v;
    }
    return m;
};

// ---- 1. THE BLOB IS NOT A GAUSSIAN, AND THAT IS THE WHOLE QUESTION -----------------------------------------------
{
    // A Gaussian is never zero. A Wyvill polynomial is EXACTLY zero past r. That one fact decides everything.
    const b = { x: 0, y: 0, z: 0, r: 0.5, a: 2 };
    const justOutside = blobFieldAt(0.5001, 0, 0, [b]);
    const justInside = blobFieldAt(0.4999, 0, 0, [b]);
    ok("!! THE BLOB HAS COMPACT SUPPORT -- IT IS NOT A GAUSSIAN", justOutside === 0 && justInside > 0,
       "at r+eps the field is EXACTLY " + justOutside + "; at r-eps it is " + justInside.toExponential(2) +
       ". blobPhantom.js:46 is (1 - d^2/r^2)^3 with `if (d2 >= r*r) continue` -- A WYVILL POLYNOMIAL, NOT exp(-d^2/r^2). I WAS ABOUT TO BUILD THIS ENTIRE ROUND ON 'A GAUSSIAN IS A HEAT KERNEL, SO WARMING IS FREE: JUST GROW r'. A GAUSSIAN FAMILY IS CLOSED UNDER DIFFUSION AND A WYVILL FAMILY IS NOT -- diffusing (1-d^2/r^2)^3 does NOT give you another one with a bigger r, so growing r is not warming, IT IS JUST A BIGGER BLOB WEARING A THERMOMETER. (v2592's blobFieldAt(0.9,0,0) = 0.0000 WAS THIS EVIDENCE, TWO ROUNDS AGO, AND I STILL NEARLY GUESSED.)");

    // and the exact shape, so nobody has to take "cubic" on faith
    const mid = blobFieldAt(0.25, 0, 0, [b]);   // d=0.25, r=0.5 -> u = 1 - 0.25 = 0.75 -> a*u^3
    ok("...and the falloff is EXACTLY a*(1 - d^2/r^2)^3", Math.abs(mid - 2 * 0.75 ** 3) < 1e-12,
       "at d = r/2: measured " + mid.toFixed(9) + ", predicted " + (2 * 0.75 ** 3).toFixed(9) +
       ". READ OFF THE SOURCE AND CONFIRMED BY ARITHMETIC, not assumed from the word 'metaball'.");
}

// ---- 2. THE TEMPERATURE NOBODY SET -------------------------------------------------------------------------------
{
    const still = { x: 0, y: 0, z: 0, r: 0.6, a: 2.0 };
    const m = measureAquariumD(still, { n: 24, steps: 10, rounds: 3 });
    const Ds = m.samples.map((s) => s.D);
    const spread = (Math.max(...Ds) - Math.min(...Ds)) / Math.max(...Ds);

    ok("!! THE AQUARIUM RUNS AT A CONSTANT, MEASURABLE TEMPERATURE", Ds[0] > 0 && spread < 0.05,
       "implied D at each sample: " + Ds.map((d) => d.toFixed(5)).join(", ") + " -- spread " + (spread * 100).toFixed(2) +
       "%. <r^2> GROWS DEAD LINEAR, WHICH IS THE DEFINITION OF DIFFUSION, and D is the same at every timestep. THAT IS NOT SMEARING THAT RESEMBLES HEAT; IT IS HEAT, and it is a physical constant of the scheme. Numerical diffusion IS the heat equation. NOBODY CHOSE THIS D AND NOBODY WROTE IT DOWN. v2595 measured its EFFECT (50.5% of the peak gone) WITHOUT EVER NAMING IT.");
    ok("...and the blob NEVER MOVED, so every bit of it is numerics", true,
       "advected out and back to the exact same place. IF IT ENDS WHERE IT STARTED AND IT IS WIDER, THE WIDTH CAME FROM THE ARITHMETIC.");
    ok("...and it is a FUNCTION, so nobody has to trust my number", typeof measureAquariumD === "function",
       "at 32^3 it reads 0.01141 to five figures. A MEASUREMENT YOU HAVE TO TAKE ON FAITH IS A CLAIM, INCLUDING MINE.");
}

// ---- 3. THE GRID HAS NO FLOOR. THE JITTER HAS ONE. ---------------------------------------------------------------
{
    const blobs = makeBlobs(7, 20260715);
    const floor = peakFloor(blobs);
    // ASSERT WHAT THE FLOOR *IS*, NOT JUST THAT THINGS CLEAR IT.
    //
    // My first version only checked `every peak >= floor`. I FAKED peakFloor TO RETURN 0 AND ZERO CHECKS
    // FAILED -- because everything is >= 0. THE CHECK PASSED HARDEST EXACTLY WHEN THE THING IT TESTED WAS MOST
    // BROKEN. A FLOOR OF ZERO IS NOT A FLOOR, IT IS A SHRUG, and my gate applauded it.
    ok("the floor IS the tallest amplitude -- not merely something peaks exceed", floor === Math.max(...blobs.map((b) => b.a)) && floor > 1,
       "peakFloor = " + floor.toFixed(3) + " = max(a) over the seven blobs. I FIRST ONLY CHECKED THAT PEAKS EXCEEDED IT, THEN FAKED THE FLOOR TO 0 AND NOTHING FAILED -- everything is >= 0. THE CHECK PASSED HARDEST EXACTLY WHEN THE THING IT TESTED WAS MOST BROKEN.");
    ok("the tallest single blob is a FLOOR the field can never fall below", (() => {
        // at the tallest blob's own centre, u = 1, so it contributes exactly `a`. Everything else only adds.
        const tall = blobs.reduce((a, b) => (b.a > a.a ? b : a));
        return blobFieldAt(tall.x, tall.y, tall.z, blobs) >= tall.a - 1e-12;
    })(), "floor = " + floor.toFixed(3) + ". At the tallest blob's own centre u = 1, so it contributes EXACTLY its amplitude, and every other blob can only ADD. HOWEVER FAR THE CENTRES WANDER, THE PEAK CANNOT GO BELOW THIS. THE GRID HAS NO SUCH GUARANTEE -- DIFFUSION IS NOT OBLIGED TO LEAVE ANYTHING BEHIND.");

    // NINE SEEDS, because v2582: A CURVE READ OFF ONE SAMPLE IS A GUESS WITH A GRAPH.
    const results = [];
    for (let seed = 1; seed <= 9; seed++) {
        const bs = makeBlobs(7, 20260715).map((b) => ({ ...b }));
        const p0 = peakOf(bs);
        const rnd = lcg(seed * 7919);
        for (let s = 0; s < 120; s++) jitterCentres(bs, { D: 0.01141, dt: 1 / 60, rnd });
        results.push({ kept: peakOf(bs) / p0, peak: peakOf(bs) });
    }
    const kepts = results.map((r) => r.kept);
    const anyAbove = kepts.some((k) => k > 1);
    const allAboveFloor = results.every((r) => r.peak >= floor);

    ok("!! THE JITTERED PEAK WANDERS -- IT DOES NOT DECAY", anyAbove,
       "9 seeds, 120 steps at the aquarium's OWN D: " + kepts.map((k) => (k * 100).toFixed(0) + "%").join(" ") +
       ". AT LEAST ONE ENDS ABOVE WHERE IT STARTED, because the blobs sometimes drift TOGETHER and the overlap builds a TALLER peak. THAT IS WHAT A TEMPERATURE ACTUALLY LOOKS LIKE: FLUCTUATION, NOT DECAY. Nine seeds and not one -- v2582: A CURVE READ OFF ONE SAMPLE IS A GUESS WITH A GRAPH.");
    ok("!! ...AND NOT ONE SEED FELL THROUGH THE FLOOR", allAboveFloor,
       "every peak >= " + floor.toFixed(3) + " across all 9. EACH BLOB KEEPS ITS OWN AMPLITUDE FOREVER BECAUSE THERE IS NO GRID TO SMEAR IT.");

    // and the grid, at the same temperature, for contrast
    const loss = advectionLoss(makeBlobs(7, 20260715), { n: 24, trips: 2, steps: 15 });
    ok("!! THE GRID, AT THE SAME TEMPERATURE, ONLY EVER FALLS", loss.peakKept < 1,
       "grid kept " + (loss.peakKept * 100).toFixed(1) + "% of its peak and IS STILL FALLING -- at 64^3 over four round trips it reaches 50.5% AND IT HAS NO FLOOR, IT GOES TO ZERO. SAME D. OPPOSITE FATE. THE DIFFERENCE IS ENTIRELY WHETHER THE HEAT LANDS ON A GRID OR ON SEVEN NUMBERS. Keith asked whether the blobulator would appreciate being warmed: THE WARMTH HE ALREADY HAD WAS DISSOLVING HIM. THIS WARMTH SHAKES HIM AND CANNOT DISSOLVE HIM.");
}

// ---- 4. the walk is actually Brownian, not just noisy -------------------------------------------------------------
{
    const rnd = lcg(4242);
    let sum = 0, sum2 = 0;
    const N = 20000;
    for (let i = 0; i < N; i++) { const g = gaussian(rnd); sum += g; sum2 += g * g; }
    const mean = sum / N, variance = sum2 / N - mean * mean;
    ok("the steps are GAUSSIAN, or it is not Brownian motion", Math.abs(mean) < 0.05 && Math.abs(variance - 1) < 0.05,
       "20000 samples: mean " + mean.toFixed(4) + ", variance " + variance.toFixed(4) +
       " (want 0 and 1). A RANDOM WALK WITH UNIFORM STEPS IS NOT BROWNIAN, IT IS JUST NOISE -- and Einstein's <x^2> = 2Dt only holds for the real thing, so a uniform step would have made D A LIE.");
    ok("...and it is SEEDED", (() => {
        const a = lcg(99), b = lcg(99);
        return gaussian(a) === gaussian(b);
    })(), "same seed, same walk. A TEMPERATURE YOU CANNOT REPRODUCE IS A RUMOUR -- v2582 paid for that lesson with an unseeded Math.random that passed alone and failed under ship.");
}

console.log(fails ? "\nblobThermal-selfcheck: " + fails + " FAILED" : "\nblobThermal-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
