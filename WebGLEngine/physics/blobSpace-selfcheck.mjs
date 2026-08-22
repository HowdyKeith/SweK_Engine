// WebGLEngine/physics/blobSpace-selfcheck.mjs — v2589
//
// Run: node physics/blobSpace-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs.
//
// GATES physics/blobSpace.js -- Keith's question: "can blobulator be physics.js for the SweK simulator choice?
// blob would be the space, and the universe in the simulator."
//
// THE ANSWER IS NO, AND IT IS GATED AS A FACT ABOUT THE INTERFACE, NOT AN OPINION ABOUT THE BLOB.
import { CONTRACT } from "./backendConformance.mjs";
import { insideBlob, outwardNormal, castIntoBlob, pushOut, depth } from "./blobSpace.js";
import { makeBlobs } from "../simulation/tomo/blobPhantom.js";

let fails = 0;
const ok = (name, cond, detail) => {
    console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : ""));
    if (!cond) fails++;
};
const blobs = makeBlobs(7, 20260715);

// ---- 1. WHY IT CANNOT BE A BACKEND -- read off the real contract, not asserted --------------------------------
{
    ok("!! THE CONTRACT IS " + CONTRACT.length + " CALLS, AND EVERY ONE IS ABOUT A BODY", CONTRACT.length === 13,
       CONTRACT.join(", ") + ". NOT ONE ASKS WHAT SHAPE THE UNIVERSE IS. So the blobulator cannot be a backend -- NOT BECAUSE IT IS TOO WEAK, BUT BECAUSE IT IS A DIFFERENT CATEGORY. box3d and Jolt answer 'how do bodies move'. The blob answers 'where is there anything'. THE INTERFACE HAS A SLOT FOR THE SOLVER AND NO SLOT FOR THE SPACE. Keith did not ask a physics question; HE FOUND A MISSING ABSTRACTION.");
    ok("...and NOT ONE of the thirteen is a question about space", !CONTRACT.some((c) => /space|field|inside|terrain|world(?!\W)/i.test(c)),
       "no insideAt, no normalAt, no sample. A backend is handed an EMPTY UNIVERSE and asked to move things in it.");
    ok("...and the check guarding those 13 is named 'answers all ten calls'", CONTRACT.length !== 10,
       "A NAME IS A CLAIM, and that one has been wrong since the eleventh was added (impulse was the thirteenth, v2567). It is prose, so nothing ever failed -- THE SAME SHAPE AS EVERY OTHER NAME THAT LIED THIS SESSION.");
}

// ---- 2. THE TWO QUESTIONS A SPACE ACTUALLY OWES A SOLVER ------------------------------------------------------
{
    const hit = castIntoBlob(3, 0, 0, -1, 0, 0, blobs);
    ok("THERE IS A SURFACE, and a ray finds it", hit !== null && Math.abs(hit.x - 0.53) < 0.05,
       hit ? "crossed at x=" + hit.x.toFixed(3) + " marching in from x=3. THE FIELD IS THE WALL." : "no crossing");
    const n = hit ? hit.normal : [0, 0, 0];
    const L = Math.hypot(...n);
    ok("...and the normal is a UNIT VECTOR to six decimals", Math.abs(L - 1) < 1e-6,
       "|n| = " + L.toFixed(6) + " -- USABLE AS A COLLISION NORMAL WITH NO NORMALISATION PASS. That is the field doing the solver a favour.");
}

// ---- 3. THE SIGN. THE WHOLE POINT OF THE FILE. ----------------------------------------------------------------
{
    const hit = castIntoBlob(3, 0, 0, -1, 0, 0, blobs);
    const [nx, ny, nz] = hit.normal;
    const s = 0.15;
    const alongNormal = insideBlob(hit.x + nx * s, hit.y + ny * s, hit.z + nz * s, blobs);
    const againstNormal = insideBlob(hit.x - nx * s, hit.y - ny * s, hit.z - nz * s, blobs);
    ok("!! THE NORMAL POINTS *OUT* -- which the raw gradient does NOT", alongNormal === false && againstNormal === true,
       "step +n -> " + (alongNormal ? "inside" : "OUTSIDE") + ", step -n -> " + (againstNormal ? "INSIDE" : "outside") +
       ". THE RAW GRADIENT POINTS THE WRONG WAY, and measuring it is the only reason this file exists: A DENSITY FIELD'S GRADIENT POINTS UPHILL, AND UPHILL IS INTO THE BLOB -- it is the direction of MORE STUFF, and 'out' is the direction of LESS. Same species as v2578's winding bug: GEOMETRICALLY PERFECT, SIGN INVERTED, INVISIBLE TO ANY TEST THAT ONLY CHECKS THE MAGNITUDE, and it would have read as 'the physics is just weird' for a week.");

    // and the one that would catch a lazy fix: |n| is 1 either way, so length proves NOTHING here
    ok("...and |n| would be 1.0 EVEN IF THE SIGN WERE WRONG", Math.abs(Math.hypot(-nx, -ny, -nz) - 1) < 1e-9,
       "the inverted normal is EXACTLY as unit-length as the correct one. A GATE THAT CHECKED THE LENGTH WOULD HAVE PASSED THE BUG. THE DIRECTION IS THE CLAIM; THE MAGNITUDE IS DECORATION.");
}

// ---- 4. THE ONE SERVICE A SPACE PROVIDES, AND ITS HONEST LIMIT ------------------------------------------------
{
    const hit = castIntoBlob(3, 0, 0, -1, 0, 0, blobs);
    const deepX = hit.x - 0.25;   // well inside
    ok("a point INSIDE is recognised", insideBlob(deepX, 0, 0, blobs) === true,
       "depth = " + depth(deepX, 0, 0, blobs).toFixed(4) + " (positive = inside)");
    const out = pushOut(deepX, 0, 0, blobs);
    ok("...and pushOut ESCAPES it", out.wasInside && out.escaped,
       "walked " + out.moved + " steps along the outward normal and left the solid. THIS IS THE ONE THING A SOLVER NEEDS FROM A SPACE -- and note it is NOT a step(): THE SOLVER STILL OWNS THE BODIES. blobSpace only ever answers questions.");
    const already = pushOut(3, 0, 0, blobs);
    ok("...and it does NOTHING to a point already outside", already.wasInside === false && already.x === 3,
       "a space that shoves things that were never touching it is A CONTROL THAT CANNOT FAIL, wearing the costume of collision response.");
    ok("!! AND THE HONEST LIMIT: THIS IS A DENSITY, NOT A DISTANCE", depth(deepX, 0, 0, blobs) < 5,
       "blobFieldAt returns a DENSITY. depth tells you THAT you are inside and roughly how deep IN FIELD UNITS -- IT DOES NOT TELL YOU HOW MANY METRES TO MOVE. So pushOut WALKS OUT rather than solving for the surface: correct, but not free (" + out.moved + " field evaluations for one escape). A TRUE SDF WOULD GIVE THE DISTANCE DIRECTLY; A METABALL FIELD WILL NOT, AND PRETENDING OTHERWISE IS HOW TUNNELLING HAPPENS.");
}

{
    // =============================================================================================================
    // v3906 -- THE EXTERNAL ANSWER KEY. Everything above this line is SELF-CONSISTENCY: it asks whether the normal
    // is unit-length, whether pushOut escapes, whether a ray finds *a* surface. Those are real checks and they
    // caught a real inverted sign. BUT NOT ONE OF THEM KNOWS WHERE THE SURFACE ACTUALLY IS -- the crossing at
    // "x = 0.530" is a number this code produced, compared against nothing. gradedCoverage's GRADE door asked for
    // an answer key, and this is it: THE FIELD HAS A CLOSED FORM AND THE CLOSED FORM WAS NEVER WRITTEN DOWN.
    //
    // blobPhantom's field is the Wyvill polynomial, f = a*(1 - d^2/r^2)^3 for d < r, and the skin is f = ISO = 1.
    // For a SINGLE blob that inverts exactly:
    //
    //          a * (1 - d^2/r^2)^3 = 1     ->     d_iso = r * sqrt(1 - a^(-1/3))
    //
    // That is algebra, not measurement. It is derived here from a, r and ISO and never from anything blobSpace
    // returns, which is what makes it a KEY and not another self-check.
    // =============================================================================================================
    const report = (l, n = "") => console.log(`  ----  ${l}${n ? "   " + n : ""}`);
    const isoRadius = (a, r) => r * Math.sqrt(1 - Math.pow(a, -1 / 3));
    const rows = [];
    for (const [a, r] of [[1.5, 1.0], [2.0, 0.8], [4.0, 1.3], [8.0, 0.5]]) {
        const B = [{ x: 0, y: 0, z: 0, r, a }];
        let lo = 0, hi = r;                                    // depth() > 0 inside, < 0 outside
        for (let i = 0; i < 200; i++) { const mid = (lo + hi) / 2; if (depth(mid, 0, 0, B) > 0) lo = mid; else hi = mid; }
        const got = (lo + hi) / 2, want = isoRadius(a, r);
        rows.push([a, r, got, want, Math.abs(got - want) / want]);
    }
    ok("*** the surface depth() reports sits on the CLOSED-FORM iso radius, at four different (a, r) ***",
       rows.every((x) => x[4] < 1e-14),
       rows.map(([a, r, , want, e]) => `a=${a} r=${r} -> ${want.toPrecision(9)} (rel ${e.toExponential(1)})`).join(";  "));
    report("FOUR PAIRS, NOT ONE", "a single (a, r) would be matched by any formula that happens to agree there. " +
           "Amplitude and radius are varied INDEPENDENTLY, so a key that dropped either term could not pass all four");

    // The normal for a radial field must be radial. Not approximately -- the gradient of f(|p|) is parallel to p
    // by construction, so any departure is finite-difference error and nothing else.
    {
        const B = [{ x: 0, y: 0, z: 0, r: 1, a: 3 }];
        const dots = [[0.4, 0.2, 0.1], [0.1, -0.5, 0.3], [-0.3, 0.3, -0.4]].map((p) => {
            const n = outwardNormal(p[0], p[1], p[2], B), L = Math.hypot(p[0], p[1], p[2]);
            return (n[0] * p[0] + n[1] * p[1] + n[2] * p[2]) / L;
        });
        ok("...and the normal of a single blob is EXACTLY RADIAL, which no length check can see",
           dots.every((d) => d > 1 - 1e-8),
           "n . rhat = " + dots.map((d) => d.toPrecision(12)).join(", ") + " at three off-axis points");
        report("THIS IS THE DIRECTION CHECK THE SECTION ABOVE COULD NOT MAKE", "it asserts the normal points OUT " +
               "-- a binary. A normal tilted twenty degrees still points out, still has |n| = 1, and still passes " +
               "everything above. The radial identity is the first thing here that would notice");
    }

    // *** AND THE FINITE DIFFERENCE IS SECOND ORDER, WHICH IS THE STRONGEST SINGLE CLAIM IN THIS FILE. ***
    {
        const B = [{ x: 0, y: 0, z: 0, r: 1, a: 3 }], p = [0.4, 0.2, 0.1];
        const L = Math.hypot(p[0], p[1], p[2]), rad = p.map((c) => c / L);
        const errs = [0.04, 0.02, 0.01, 0.005].map((h) => {
            const n = outwardNormal(p[0], p[1], p[2], B, h);
            return Math.hypot(n[0] - rad[0], n[1] - rad[1], n[2] - rad[2]);
        });
        const ratios = errs.slice(0, -1).map((e, i) => e / errs[i + 1]);
        ok("*** halving h quarters the normal's error -- the gradient is genuinely SECOND ORDER ***",
           ratios.every((r) => Math.abs(r - 4) < 0.05),
           "errors " + errs.map((e) => e.toExponential(3)).join(" -> ") + ";  ratios " + ratios.map((r) => r.toFixed(3)).join(", "));
        report("WHY AN ORDER BEATS A TOLERANCE", "|n - rhat| < 1e-3 at the default h would pass with a ONE-SIDED " +
               "difference, which is first order and would read 1e-2 at four times the step. The ORDER is what " +
               "identifies the scheme; the magnitude only says today's h was small enough");
    }

    // castIntoBlob: the honest limit, MEASURED rather than assumed.
    {
        const a = 3, r = 1, B = [{ x: 0, y: 0, z: 0, r, a }];
        const want = isoRadius(a, r), h = 0.002;
        const hit = castIntoBlob(3, 0, 0, -1, 0, 0, B, 8, h);
        const overshoot = want - hit.x;
        ok("a radial cast returns the closed-form radius to WITHIN ITS OWN STEP, and lands INSIDE it",
           overshoot > 0 && overshoot < h,
           `hit x = ${hit.x.toPrecision(9)} against the exact ${want.toPrecision(9)} -- short by ${overshoot.toExponential(3)}, step h = ${h}`);
        ok("...and the normal it hands back at a radial hit is exactly the ray axis", 
           hit.normal[0] === 1 && hit.normal[1] === 0 && hit.normal[2] === 0, JSON.stringify(hit.normal));
        report("WHAT IS NOT CLAIMED, AND IT IS A REAL LIMIT", "castIntoBlob MARCHES and stops at the first sample " +
               "inside; it does not refine the last interval. So the hit is accurate to h and is always INSIDE the " +
               "true surface, never on it. A contact resolver that trusted it as a surface point would embed every " +
               "body by up to one step. Bisecting the final interval would make it exact and costs ~40 evaluations " +
               "-- NOT DONE HERE, because changing the function is a different round from keying it.");
    }
}

console.log(fails ? "\nblobSpace-selfcheck: " + fails + " FAILED" : "\nblobSpace-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
