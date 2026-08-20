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

console.log(fails ? "\nblobSpace-selfcheck: " + fails + " FAILED" : "\nblobSpace-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
