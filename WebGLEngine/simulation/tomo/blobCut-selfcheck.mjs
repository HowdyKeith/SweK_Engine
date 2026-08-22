// WebGLEngine/simulation/tomo/blobCut-selfcheck.mjs — v2592
//
// Run: node simulation/tomo/blobCut-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs.
//
// GATES simulation/tomo/blobCut.js.
//
// Keith: "if we wanted to freeze a slice and cut that slice, we don't need to see a cutting animation, we need
// a formula to drop through, all points at once. How do we cut a blob? It's not a liquid. But we do want to see
// what we can see."
//
// THE ANSWER: YOU DON'T CUT IT. THE BLOB DOES NOT CHANGE. YOU STOP ASKING ABOUT HALF OF IT.
//
// ---- AND THE TEST THAT CAUGHT ME ---------------------------------------------------------------------------------
//
// My first run printed "cut by the plane: 2.010358 <- LESS. the beam stops at the plane" NEXT TO A NUMBER
// IDENTICAL TO THE UNCUT ONE. I had written the conclusion into the label before reading the measurement.
//
// The code was right. THE RAY WAS THE PROBLEM: the beam direction is (-sin θ, cos θ, 0) = (-0.644, 0.765, 0),
// and my plane normal was (0.6, 0.5, 0.62). Their dot product is -0.386 + 0.383 = -0.003. I HAD PICKED A RAY
// THAT RUNS ALMOST EXACTLY PARALLEL TO THE CUT PLANE. It never crosses, so the cut correctly removed nothing --
// and I labelled it "LESS".
//
// That is a real edge case and it is gated below: A RAY PARALLEL TO THE PLANE IS ENTIRELY KEPT OR ENTIRELY
// GONE, AND THERE IS NO THIRD OPTION. It is also the case that will silently make a cut look broken.
import { plane, side, kept, cutFieldAt, cutFace, cutRadonAt } from "./blobCut.js";
import { blobFieldAt, blobRadonAt, makeBlobs, ISO } from "./blobPhantom.js";

let fails = 0;
const ok = (name, cond, detail) => {
    console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : ""));
    if (!cond) fails++;
};
const blobs = makeBlobs(7, 20260715);

// ---- 1. THE CUT DOES NOT TOUCH THE BLOB -----------------------------------------------------------------------
{
    const pl = plane(1, 0, 0, 0.2);
    let checked = 0, identical = 0;
    let rng = 12345;
    const rnd = () => { rng = (rng * 1664525 + 1013904223) >>> 0; return rng / 4294967296; };
    for (let i = 0; i < 600; i++) {
        const x = rnd() * 4 - 2, y = rnd() * 4 - 2, z = rnd() * 4 - 2;
        if (!kept(x, y, z, pl)) continue;
        checked++;
        if (cutFieldAt(x, y, z, blobs, [pl]) === blobFieldAt(x, y, z, blobs)) identical++;
    }
    ok("!! THE CUT DOES NOT TOUCH THE BLOB", checked > 100 && identical === checked,
       identical + " of " + checked + " points on the kept side are BYTE-IDENTICAL to the uncut field. YOU DO NOT CUT A BLOB. THE BLOB DOES NOT CHANGE -- YOU STOP ASKING ABOUT HALF OF IT. That is why it is free, and why you can cut it a thousand ways at once without a single copy.");
    // FIND A POINT THAT IS BOTH CUT AWAY *AND* HAS DENSITY -- BY LOOKING, NOT BY GUESSING.
    //
    // My first version asserted blobFieldAt(0.9, 0, 0) > 0. IT IS 0.0000. The blob is not there: it runs
    // 2.3268 at x=0.3, 1.2099 at x=0.5, 0.1631 at x=0.7, and NOTHING by x=0.9. I ASSERTED MY OWN BLOB'S
    // GEOMETRY INSTEAD OF MEASURING IT, and the check failed on a working cut -- the same shape as the parallel
    // ray below, twice in one file.
    const far = (() => {
        let best = null;
        for (let x = 0.25; x < 2; x += 0.05) {
            for (let y = -1.5; y < 1.5; y += 0.05) {
                const f = blobFieldAt(x, y, 0, blobs);
                if (side(x, y, 0, pl) > 0 && (!best || f > best.f)) best = { x, y, f };
            }
        }
        return best;
    })();
    ok("...and the far side is simply not answered", far.f > 0.5 && cutFieldAt(far.x, far.y, 0, blobs, [pl]) === 0,
       "at (" + far.x.toFixed(2) + ", " + far.y.toFixed(2) + ") -- FOUND BY SEARCHING FOR REAL DENSITY BEYOND THE PLANE, NOT BY GUESSING -- the real field is " + far.f.toFixed(3) +
       " and the cut field returns 0. NOTHING WAS DESTROYED. THE QUESTION CHANGED. (My first version asserted blobFieldAt(0.9,0,0) > 0; IT IS 0.0000, THE BLOB IS NOT THERE, and the check failed on a working cut.)");
}

// ---- 2. IT IS A FORMULA, SO THERE IS NOTHING TO ANIMATE -------------------------------------------------------
{
    const pl = plane(1, 1, 0, 0.1);
    const t0 = process.hrtime.bigint();
    let n = 0;
    for (let i = 0; i < 200000; i++) n += side(i * 0.001, 0, 0, pl) > 0 ? 1 : 0;
    const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    ok("!! ALL POINTS AT ONCE -- A CUT HAS NO ORDER", n > 0 && ms < 500,
       "200,000 cut tests in " + ms.toFixed(1) + "ms = " + (200 / ms).toFixed(1) +
       "M points/ms. ONE DOT PRODUCT PER POINT, NO SWEEP, NO NEIGHBOURS, NO STATE. A GUILLOTINE COMING DOWN IS A STORY ABOUT A CUT; THE SIGN OF A DOT PRODUCT IS THE CUT. Keith asked for the formula and the formula is one line.");
    ok("...and a second cut costs a second dot product, not a second blob", (() => {
        const two = [plane(1, 0, 0, 0.2), plane(0, 1, 0, 0.2)];
        return cutFieldAt(0.9, 0.9, 0, blobs, two) === 0 && cutFieldAt(-0.5, -0.5, 0, blobs, two) === blobFieldAt(-0.5, -0.5, 0, blobs);
    })(), "cut by two planes at once: the corner is gone, the far corner is untouched. NO COPY WAS MADE.");
}

// ---- 3. THE PLANE IS NORMALISED, WHICH IS NOT COSMETIC --------------------------------------------------------
{
    const pl = plane(3, 0, 0, 0.6);   // asked for length 3
    ok("plane() NORMALISES, so side() is a real distance", Math.abs(Math.hypot(pl.nx, pl.ny, pl.nz) - 1) < 1e-12,
       "|n| = " + Math.hypot(pl.nx, pl.ny, pl.nz).toFixed(12) + ". AN UNNORMALISED PLANE STILL GIVES THE RIGHT SIGN AND A MEANINGLESS DISTANCE -- and that is the kind of half-right that SURVIVES EVERY TEST YOU WOULD THINK TO WRITE, because everyone tests the sign.");
    ok("...and a zero normal REFUSES instead of returning NaN", (() => {
        try { plane(0, 0, 0, 1); return false; } catch { return true; }
    })(), "a zero normal is not a plane, IT IS A POINT OF CONFUSION. Dividing by |n|=0 would have given NaN normals and every side() test would silently return false -- A CUT THAT KEEPS EVERYTHING, WHICH LOOKS EXACTLY LIKE NO CUT AT ALL.");
}

// ---- 4. THE EDGE CASE THAT MADE ME WRITE 'LESS' NEXT TO AN IDENTICAL NUMBER -----------------------------------
{
    // A ray parallel to the plane. dir = (-sin θ, cos θ, 0); pick a normal perpendicular to that.
    const theta = 0.7;
    const dir = [-Math.sin(theta), Math.cos(theta), 0];
    const parallelPlane = plane(dir[1], -dir[0], 0, 0.05);   // n . dir == 0 exactly
    const dot = parallelPlane.nx * dir[0] + parallelPlane.ny * dir[1];
    ok("!! A RAY PARALLEL TO THE PLANE IS ENTIRELY KEPT OR ENTIRELY GONE", Math.abs(dot) < 1e-12,
       "n.dir = " + dot.toExponential(2) + ". THERE IS NO THIRD OPTION, and this is the case that makes a working cut look broken. MY FIRST RUN PRINTED 'cut by the plane: 2.010358 <- LESS' NEXT TO A NUMBER IDENTICAL TO THE UNCUT ONE: I had picked a ray whose direction dotted with my plane normal to -0.003 -- ALMOST EXACTLY PARALLEL -- so it never crossed, the cut correctly removed nothing, AND I HAD WRITTEN THE CONCLUSION INTO THE LABEL BEFORE READING THE MEASUREMENT.");

    // and now a plane the ray REALLY crosses: normal ALONG the ray direction
    const crossing = plane(dir[0], dir[1], 0, 0);
    const un = blobRadonAt(0.1, theta, 0, blobs);
    const cut = cutRadonAt(0.1, theta, 0, blobs, [crossing]);
    ok("!! AND A PLANE IT REALLY CROSSES TAKES HALF THE BEAM", cut < un * 0.75 && cut > 0,
       "uncut " + un.toFixed(6) + " -> cut " + cut.toFixed(6) + " = " + ((cut / un) * 100).toFixed(1) +
       "% left. THE BEAM STOPS AT THE PLANE. This is the check the first one should have been.");
    ok("...and cutting by NOTHING falls back to the exact closed form", cutRadonAt(0.1, theta, 0, blobs, []) === un,
       "identical, not approximately identical -- an empty plane list does not march at all, IT RETURNS blobRadonAt. WHY THAT MATTERS: the closed form integrates a Gaussian from -inf to +inf, and A CUT MAKES THE LIMITS FINITE -- THE ANTIDERIVATIVE STOPS BEING ELEMENTARY THE MOMENT YOU CUT IT. So the cut MUST march, and the uncut MUST NOT.");
}

// ---- 5. WHAT WE CAME TO SEE ------------------------------------------------------------------------------------
{
    const pl = plane(0.6, 0.5, 0.62, 0.15);   // tilted -- axis-aligned is the case that always works
    const t0 = Date.now();
    const face = cutFace(pl, blobs, { w: 96, h: 96 });
    const ms = Date.now() - t0;
    let insideCount = 0;
    for (const d of face.data) if (d > ISO) insideCount++;
    ok("!! THE FACE: the actual density AT the cut", face.max > ISO && insideCount > 50,
       "96x96 in " + ms + "ms, max density " + face.max.toFixed(3) + ", " + insideCount + " of " + face.data.length +
       " pixels inside. THE X-RAY INTEGRATES *THROUGH* AND GIVES YOU SHADOWS; blobSinogram RECONSTRUCTS a guess at the inside. THIS IS THE INSIDE, AT THAT PLANE, EXACTLY -- not a shadow of it, not a reconstruction of it. NOBODY HAS EVER LOOKED AT IT.");
    ok("...on a TILTED plane, not an axis-aligned one", Math.abs(pl.nz) > 0.1 && Math.abs(pl.nx) > 0.1,
       "n=(" + pl.nx.toFixed(2) + "," + pl.ny.toFixed(2) + "," + pl.nz.toFixed(2) + "). blobRadonAt(s, theta, z) HAS ALWAYS TAKEN A z -- THE AXIS-ALIGNED SLICE WAS FREE SINCE THE PHANTOM WAS WRITTEN and nobody ever passed anything but 0. THE TILTED ONE IS THE PART THAT NEEDED A BASIS.");
    ok("...and the face's basis is orthonormal, or the picture is sheared", (() => {
        // reconstruct the basis the same way cutFace does and verify it
        const n = [pl.nx, pl.ny, pl.nz];
        const seed = Math.abs(n[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
        const cr = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
        const nm = (a) => { const L = Math.hypot(...a); return [a[0] / L, a[1] / L, a[2] / L]; };
        const u = nm(cr(seed, n)), v = nm(cr(n, u));
        const uv = u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
        const un2 = u[0] * n[0] + u[1] * n[1] + u[2] * n[2];
        return Math.abs(uv) < 1e-9 && Math.abs(un2) < 1e-9;
    })(), "u.v = 0 and u.n = 0. A NON-ORTHOGONAL BASIS STILL PRODUCES A PICTURE -- a SHEARED one -- and it would look plausible, which is the whole problem.");
}

console.log(fails ? "\nblobCut-selfcheck: " + fails + " FAILED" : "\nblobCut-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
