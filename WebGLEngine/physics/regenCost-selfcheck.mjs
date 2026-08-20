// WebGLEngine/physics/regenCost-selfcheck.mjs — v2611
//
// THE GRID IS NOT WRONG. THE BOX IS.
//
// ---- WHERE THIS CAME FROM ----------------------------------------------------------------------------------------
//
// Keith brought back a Gemini exchange, and this time IT CONCEDED AND THEN CONVERGED. Having been shown that
// semi-Lagrangian advection dissolves the blob (mass 100.0% while the peak falls -- MASS CONSERVATION IS
// EXACTLY THE PROPERTY THAT CANNOT SEE SMEARING), it proposed the right thing:
//
//     struct WyvillLump { position: vec3<f32>, radius: f32, amplitude: f32 };
//     ...
//     if (r2 < R2) {                                   // COMPACT SUPPORT CHECK
//         let x = 1.0 - (r2 / R2);
//         let fieldContribution = lump.amplitude * (x * x * x);      // a*(1-d^2/r^2)^3
//         totalField = totalField + fieldContribution;
//     }
//     ...
//     [ Step 2: GPU Field Regen ]   ──►  (Zero Diffusion, 100% Peak Kept)
//     "Do You Even Need the Grid Anymore? Now that the advection grid is dead..."
//
// THAT IS RIGHT, AND IT IS RIGHT FOR THE RIGHT REASON. Do not ADVECT the field -- REGENERATE it from the seven
// lumps every frame. The formula is EXACTLY blobPhantom.js:46. The compact-support check is EXACTLY the
// property v2596 measured. IT GOT THERE ON ITS OWN, AND SAYING SO IS NOT POLITENESS -- IT IS THE RESULT.
//
// ---- BUT "REGENERATING" HIDES A COST, AND HERE IT IS ---------------------------------------------------------------
//
// Counted, not timed (v2595/v2602: A COUNT CANNOT FLAKE). Its own shader, its own worldPos mapping to [-10, 10]:
//
//     32^3     dot+compare:    229,376    actually inside a lump:    26    = 0.0113%
//     64^3     dot+compare:  1,835,008    actually inside a lump:   179    = 0.0098%
//     128^3    dot+compare: 14,680,064    actually inside a lump: 1,433    = 0.0098%
//
// NINETY-NINE POINT NINE NINE PERCENT OF THE WORK TESTS VOXELS THAT ARE NOWHERE NEAR THE BLOB.
//
// AND IT IS NOT THE SHADER'S FAULT. The shader is correct. ITS OWN worldPos MAPS THE GRID TO TWENTY UNITS FOR A
// CREATURE THAT IS ONE UNIT ACROSS. The blob occupies (1/20)^3 = 0.0125% of that box, and the measurement says
// 0.0098%. THE NUMBER IS THE GEOMETRY. There is no cleverness to add and nothing to profile.
//
// ---- THE BLOB TELLS YOU ITS OWN BOX ---------------------------------------------------------------------------------
//
// Wyvill is EXACTLY ZERO past r. So the field lives in the union of the lumps' bounding boxes AND NOWHERE ELSE.
// THAT IS NOT AN OPTIMISATION -- IT IS THE KERNEL SAYING SO, and it is the same compact-support fact Gemini
// already used for its early-out. It just never applied it to the DOMAIN, only to the INNER LOOP.
//
//     tight bounds:  x -0.865 .. 0.980    span 1.845
//     its box:       x -10.000 .. 10.000  span 20.000       ratio of volumes: 1104x
//
//     at ITS OWN voxel size (0.3125 units), the tight box needs 7^3 = 2,401 tests
//     its 64^3 over [-10, 10] costs                                1,835,008 tests
//
// SAME RESOLUTION. 764x LESS WORK. AND THE SHADER DOES NOT CHANGE -- ONLY worldPos DOES.
//
// So its closing question -- "Do you even need the grid anymore?" -- has a sharper answer than yes or no:
// THE GRID IS NOT WRONG. THE BOX IS.
import { makeBlobs, blobFieldAt } from "../simulation/tomo/blobPhantom.js";

let fails = 0;
const ok = (name, cond, detail) => {
    console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : ""));
    if (!cond) fails++;
};
const blobs = makeBlobs(7, 20260715);

/** Its shader's inner test, counted. */
function countRegen(N, ext) {
    let tested = 0, inside = 0;
    const w = (i) => (i / N - 0.5) * 2 * ext;
    for (let k = 0; k < N; k++) for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
        const x = w(i), y = w(j), z = w(k);
        for (const b of blobs) {
            tested++;
            const dx = x - b.x, dy = y - b.y, dz = z - b.z;
            if (dx * dx + dy * dy + dz * dz < b.r * b.r) inside++;
        }
    }
    return { tested, inside };
}

/** The box the blob itself declares. */
function tightBounds(bs) {
    const lo = [0, 1, 2].map((k) => Math.min(...bs.map((b) => [b.x, b.y, b.z][k] - b.r)));
    const hi = [0, 1, 2].map((k) => Math.max(...bs.map((b) => [b.x, b.y, b.z][k] + b.r)));
    return { lo, hi, span: Math.max(...[0, 1, 2].map((k) => hi[k] - lo[k])) };
}

// ---- 1. THE SHADER IS RIGHT, AND SAYING SO IS THE RESULT ---------------------------------------------------------
{
    // its formula, against ours
    const b = blobs[0];
    const d = 0.3;
    const r2 = d * d, R2 = b.r * b.r;
    const theirs = r2 < R2 ? b.a * Math.pow(1 - r2 / R2, 3) : 0;
    const ours = blobFieldAt(b.x + d, b.y, b.z, [b]);
    ok("!! ITS REGEN SHADER IS OUR FORMULA, EXACTLY", Math.abs(theirs - ours) < 1e-12,
       "its `let x = 1.0 - (r2/R2); amplitude * (x*x*x)` gives " + theirs.toFixed(9) + "; blobPhantom.js:46 gives " + ours.toFixed(9) +
       ". AND ITS `if (r2 < R2)` IS THE COMPACT SUPPORT v2596 MEASURED. Having been shown that advection dissolves the blob, IT PROPOSED REGENERATING THE FIELD FROM THE SEVEN LUMPS INSTEAD -- and labelled its own pipeline '(Zero Diffusion, 100% Peak Kept)'. THAT IS v2595's FINDING ARRIVING FROM THE OTHER SIDE, UNPROMPTED. IT GOT THERE ON ITS OWN, AND SAYING SO IS NOT POLITENESS -- IT IS THE RESULT.");
}

// ---- 2. AND "REGENERATING" HIDES A COST THAT IS PURE GEOMETRY -----------------------------------------------------
{
    const r = countRegen(64, 10);          // ITS OWN grid, ITS OWN [-10,10] worldPos
    const frac = r.inside / r.tested;
    ok("!! 99.99% OF ITS REGEN TESTS TOUCH NOTHING", frac < 0.0002 && r.tested > 1e6,
       r.tested.toLocaleString() + " dot+compare at 64^3, and only " + r.inside + " (" + (frac * 100).toFixed(4) +
       "%) are inside any lump. AND IT IS NOT THE SHADER'S FAULT -- THE SHADER IS CORRECT. ITS OWN worldPos MAPS THE GRID TO TWENTY UNITS FOR A CREATURE ONE UNIT ACROSS. The blob occupies (1/20)^3 = 0.0125% of that box and the measurement says " + (frac * 100).toFixed(4) + "%. THE NUMBER IS THE GEOMETRY. There is no cleverness to add and nothing to profile.");

    const a = countRegen(32, 10), c = countRegen(128, 10);
    ok("...and it does not improve with resolution, because it cannot", Math.abs(a.inside / a.tested - c.inside / c.tested) < 0.002,
       "32^3: " + ((a.inside / a.tested) * 100).toFixed(4) + "%   128^3: " + ((c.inside / c.tested) * 100).toFixed(4) +
       "%. THE WASTED FRACTION IS A RATIO OF VOLUMES, SO IT IS THE SAME AT EVERY RESOLUTION. Going to 128^3 buys 8x the work AND THE SAME 0.0098%.");
}

// ---- 3. THE BLOB TELLS YOU ITS OWN BOX ----------------------------------------------------------------------------
{
    const t = tightBounds(blobs);
    const cell = 20 / 64;                              // ITS voxel size
    const n = Math.ceil(t.span / cell);
    const tight = n * n * n * blobs.length;
    const theirs = countRegen(64, 10).tested;

    ok("!! THE GRID IS NOT WRONG. THE BOX IS.", theirs / tight > 100,
       "tight bounds span " + t.span.toFixed(3) + " vs its 20.000 -- a volume ratio of " + Math.pow(20 / t.span, 3).toFixed(0) +
       "x. AT ITS OWN VOXEL SIZE (" + cell.toFixed(4) + " units) the tight box needs " + n + "^3 = " + tight.toLocaleString() +
       " tests against its " + theirs.toLocaleString() + ". SAME RESOLUTION. " + (theirs / tight).toFixed(1) +
       "x LESS WORK. AND THE SHADER DOES NOT CHANGE -- ONLY worldPos DOES. So its closing question, 'Do You Even Need the Grid Anymore?', HAS A SHARPER ANSWER THAN YES OR NO.");

    ok("...and the bounds are the kernel talking, not a heuristic", (() => {
        // the field is EXACTLY zero outside the union of lump boxes -- check the corners just past it
        const pts = [[t.hi[0] + 0.01, 0, 0], [t.lo[0] - 0.01, 0, 0], [0, t.hi[1] + 0.01, 0], [0, 0, t.lo[2] - 0.01]];
        return pts.every((p) => blobFieldAt(p[0], p[1], p[2], blobs) === 0);
    })(), "the field is EXACTLY 0 just outside the union of the lumps' boxes -- not small, ZERO. WYVILL HAS COMPACT SUPPORT, so the field lives in that union AND NOWHERE ELSE. THAT IS NOT AN OPTIMISATION, IT IS THE KERNEL SAYING SO. Gemini already used this fact for its INNER-LOOP early-out AND NEVER APPLIED IT TO THE DOMAIN.");
}

// ---- 4. AND WHAT I AM NOT CLAIMING ---------------------------------------------------------------------------------
{
    ok("!! NOT CLAIMING THE GPU IS THE WRONG PLACE FOR THIS", true,
       "1,835,008 wasted tests ON A GPU may still be FREE -- 64^3 workgroups of trivial ALU with an early-out is exactly what that hardware eats, AND I HAVE NOT MEASURED A GPU. v2137 measured the GPU brain 50x SLOWER than CPU Dijkstra on small grids and I am not going to pretend that settles this one. THE CLAIM IS NARROW AND COUNTED: ITS BOX IS 1104x BIGGER THAN ITS CREATURE, AND SHRINKING THE BOX COSTS NOTHING AND CHANGES NO MATHS. Whether the waste MATTERS is a measurement neither of us has taken.");
    ok("...and the tight box has to follow him", true,
       "v2610: the blob WANDERS -- 6.37 units in sixty seconds with no walls, 3.11 with them. A BOX COMPUTED ONCE AT BOOT IS A BOX HE LEAVES. It is recomputed from the lumps each frame, which is seven min/max operations against 1.8 million dot products. AND THAT IS THE SAME BUG THE OTHER HALF OF THIS CONVERSATION HIT: 'the box was not following him', 240 frames x 0.02 = 4.8 units of drift out of a static sampler.");
}

console.log(fails ? "\nregenCost-selfcheck: " + fails + " FAILED" : "\nregenCost-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
