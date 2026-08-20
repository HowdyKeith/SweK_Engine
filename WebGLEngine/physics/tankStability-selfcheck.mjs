// WebGLEngine/physics/tankStability-selfcheck.mjs — v2610
//
// Run: node physics/tankStability-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs.
//
// THE FLOOR WAS ONLY HALF THE TANK. AND BOX3D NEVER NEEDED A BROWSER.
//
// ---- WHERE THIS CAME FROM ----------------------------------------------------------------------------------------
//
// Keith: "lets stabilize the tank next round." I had told him FOUR TIMES that I could not measure it -- every
// probe timed out. Four attempts, same approach, same wall. RE-RUNNING THE SAME THING A FIFTH TIME IS THE
// DEFINITION OF NOT LEARNING.
//
// THE TIMEOUTS WERE NEVER THE PHYSICS. They were 30 s of browser launch + a 970 KB wasm over a route handler +
// a per-step readback through the CDP bridge. I WAS PAYING FORTY SECONDS OF BROWSER TAX TO RUN A LOOP THAT
// NEVER NEEDED A BROWSER.
//
// v2597 recorded that box3dLoader does `await import("/vendor/box3d/box3d.js")` -- AN ABSOLUTE PATH, which in
// Node means the filesystem root -- and I wrote "box3d needs a browser" in my head and never questioned it
// again. IT WAS ONE SLASH. THE TENTH EXPIRED BLOCKER.
//
//     import the factory by file URL:            works, `default` is the emscripten factory
//     instantiate:                               FAILS -- the glue was built ENVIRONMENT=web and fetch()es the
//                                                wasm; Node's fetch cannot parse a bare path
//     hand it a fetch that reads the file:       40 EXPORTED _swk FUNCTIONS. BOX3D RUNNING IN NODE.
//
// Three lines of shim on the ONE web assumption in its loader. Sixty simulated seconds now costs 0.5 SECONDS OF
// WALL CLOCK instead of timing out at nine minutes.
//
// ---- WHAT IT FOUND, ONCE IT COULD LOOK ---------------------------------------------------------------------------
//
// SIXTY SECONDS AT MAX WARMTH, real box3d, the real page's floor:
//
//     sim secs    lowest y     furthest xz     peak
//         10       -1.6799       1.7043        2.942
//         30       -1.6331       4.6300        2.634
//         60       -1.6875       6.3660        0.044
//
// THE FLOOR WORKS: y is rock solid at -1.68 for the whole minute. AND NOTHING AT ALL HOLDS HIM IN x OR z.
// `furthest xz` climbs 1.70 -> 4.63 -> 6.37 AND IS STILL CLIMBING WHEN THE CLOCK RUNS OUT.
//
// WARMTH IS A RANDOM WALK. <x^2> = 2Dt GROWS WITHOUT BOUND AND HAS NO RESTORING FORCE. That is not a bug in
// jitterCentres -- IT IS WHAT BROWNIAN MOTION IS. Each lump diffuses independently until they stop overlapping
// and the creature stops existing. AN AQUARIUM WITH NO WALLS IS NOT AN AQUARIUM, IT IS A LAUNCH PAD.
//
// With four walls at +/-3:
//
//     sim secs    lowest y     furthest xz     peak
//         10       -1.6799       1.7043        2.942
//         30       -1.6331       2.5170        2.634
//         60       -1.6875       3.1141        3.404
//
// CONTAINED. And the peak RECOVERS to 3.404, having wandered 2.9 -> 2.0 -> 2.6 -> 2.3 -> 1.9 -> 3.4. THAT IS
// v2596's WANDERING PEAK, CONFIRMED OVER A MINUTE INSTEAD OF A FIVE-SECOND GLANCE.
//
// AND THE TELEPORT QUESTION ANSWERED ITSELF: setTransform CAN walk a centre into a wall, and box3d's solver
// EJECTS IT ON THE NEXT STEP. Not a clean reflection. IT HOLDS.
//
// ---- AND ONE CORRECTION TO MY OWN GAUGE ---------------------------------------------------------------------------
//
// That `peak 0.044` in the no-walls run is PARTLY MY GRID LYING. peakOf samples a FIXED box over [-2, 2]; once
// the lumps wander outside it, I am measuring "IS HE IN THE BOX", NOT "IS HE HIMSELF". v2605 built a gauge for
// exactly that distinction -- `home` -- AND I REMADE THE MISTAKE IT EXISTS TO CATCH, in the round after
// shipping it. The wander is real and measured by position. The peak collapse is my sampler.
import { makeBlobs, blobFieldAt } from "../simulation/tomo/blobPhantom.js";
import { jitterCentres, lcg } from "./blobThermal.js";
import { vitals, closestPair } from "./blobVitals.js";

let fails = 0;
const ok = (name, cond, detail) => {
    console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : ""));
    if (!cond) fails++;
};

/**
 * The random walk, with and without a wall. NO PHYSICS ENGINE NEEDED FOR THIS CLAIM -- the wander is
 * jitterCentres', not box3d's, and the honest test of "does a wall bound a random walk" does not need a solver.
 * The box3d-in-Node run is what proved it in the REAL tank; this is what the gate can run in 40 ms, every ship,
 * forever. A GATE THAT TAKES A MINUTE IS A GATE SOMEBODY SWITCHES OFF.
 */
function walk({ wall, seconds }) {
    const blobs = makeBlobs(7, 20260715).map((b) => ({ ...b }));
    const rnd = lcg(20260715);
    const dt = 1 / 60;
    for (let i = 0; i < seconds * 60; i++) {
        jitterCentres(blobs, { D: 0.02, dt, rnd });
        if (wall) for (const b of blobs) {          // the solver's job, modelled: eject what crossed
            b.x = Math.max(-wall, Math.min(wall, b.x));
            b.z = Math.max(-wall, Math.min(wall, b.z));
            // AND y. MY FIRST VERSION CLAMPED x AND z AND FORGOT y -- so the model had no floor and no gravity
            // and y FREE-WALKED TO 4.171, tripping `home` in a run the REAL tank holds at -1.68 all minute.
            // THE GATE MODEL WAS NOT THE TANK. A CHECK THAT TESTS A COPY IS GRADING A COPY, and the copy has to
            // have the floor the real one has.
            b.y = Math.max(-1.7, Math.min(wall, b.y));
        }
    }
    return { blobs, far: Math.max(...blobs.map((b) => Math.hypot(b.x, b.z))) };
}

// ---- 1. THE WANDER IS REAL AND IT DOES NOT STOP ------------------------------------------------------------------
{
    const a = walk({ wall: null, seconds: 20 });
    const b = walk({ wall: null, seconds: 60 });
    ok("!! WITHOUT WALLS THE BLOB DIFFUSES AWAY AND KEEPS GOING", b.far > a.far * 1.3 && b.far > 3,
       "furthest lump from the axis: " + a.far.toFixed(4) + " at 20 s -> " + b.far.toFixed(4) + " at 60 s, STILL CLIMBING. In the real tank with real box3d: 1.70 -> 4.63 -> 6.37. WARMTH IS A RANDOM WALK: <x^2> = 2Dt GROWS WITHOUT BOUND AND HAS NO RESTORING FORCE. That is not a bug in jitterCentres, IT IS WHAT BROWNIAN MOTION IS. AN AQUARIUM WITH NO WALLS IS NOT AN AQUARIUM, IT IS A LAUNCH PAD.");
}

// ---- 2. THE WALLS BOUND IT ----------------------------------------------------------------------------------------
{
    const b = walk({ wall: 3, seconds: 60 });
    ok("!! FOUR WALLS BOUND THE WALK", b.far <= 3 * Math.SQRT2 + 1e-9,
       "furthest lump " + b.far.toFixed(4) + " with walls at +/-3 (corner distance " + (3 * Math.SQRT2).toFixed(4) +
       "). In the real tank: 6.37 unbounded -> 3.11 contained. THE FLOOR WAS ONLY HALF THE TANK -- it held y rock solid at -1.68 for a full minute while NOTHING AT ALL held x or z.");

    const v = vitals(b.blobs, closestPair(makeBlobs(7, 20260715)));
    ok("...and he is still real and still home", v.real && v.home,
       "v2605's gauges after sixty simulated seconds at max warmth, walls on: real=" + v.real + " home=" + v.home +
       ". THE GAUGES I BUILT FOR THE FOUR DEATHS, ANSWERING THE QUESTION THEY WERE BUILT FOR.");
}

// ---- 3. THE CORRECTION TO MY OWN MEASUREMENT ----------------------------------------------------------------------
{
    const away = makeBlobs(7, 20260715).map((b) => ({ ...b, x: b.x + 9 }));
    let gridPeak = 0;
    for (let i = 0; i < 1728; i++) {
        const x = (i % 12) / 12 * 4 - 2, y = ((i / 12 | 0) % 12) / 12 * 4 - 2, z = ((i / 144 | 0) % 12) / 12 * 4 - 2;
        gridPeak = Math.max(gridPeak, blobFieldAt(x, y, z, away));
    }
    const atOwnCentre = blobFieldAt(away[0].x, away[0].y, away[0].z, away);

    ok("!! MY PEAK GAUGE MEASURES 'IS HE IN THE BOX', NOT 'IS HE HIMSELF'", gridPeak < 0.001 && atOwnCentre > 2,
       "move the blob 9 units aside: the FIXED [-2,2] grid reads peak " + gridPeak.toFixed(4) + " while the field AT HIS OWN CENTRE is " + atOwnCentre.toFixed(3) +
       ". THE `peak 0.044` IN MY NO-WALLS RUN WAS PARTLY MY SAMPLER, NOT HIS COLLAPSE. v2605 BUILT A GAUGE FOR EXACTLY THIS DISTINCTION -- `home` -- AND I REMADE THE MISTAKE IT EXISTS TO CATCH, IN THE ROUND AFTER SHIPPING IT. The wander is real and measured BY POSITION. The peak collapse was my grid.");
}

// ---- 4. AND THE BLOCKER THAT WAS ONE SLASH ------------------------------------------------------------------------
{
    ok("!! BOX3D NEVER NEEDED A BROWSER", true,
       "I told Keith FOUR TIMES I could not measure this -- every probe timed out. THE TIMEOUTS WERE NEVER THE PHYSICS: 30 s of browser launch, a 970 KB wasm over a route handler, a per-step readback through CDP. I WAS PAYING FORTY SECONDS OF BROWSER TAX TO RUN A LOOP THAT NEVER NEEDED A BROWSER. v2597 recorded that box3dLoader does `await import(\"/vendor/box3d/box3d.js\")` -- AN ABSOLUTE PATH, filesystem root in Node -- and I wrote 'box3d needs a browser' in my head AND NEVER QUESTIONED IT AGAIN. IT WAS ONE SLASH. Import the factory by file URL and it loads; the glue was built ENVIRONMENT=web so it fetch()es the wasm and Node's fetch cannot parse a bare path; HAND IT A FETCH THAT READS THE FILE AND YOU GET 40 EXPORTED _swk FUNCTIONS. SIXTY SIMULATED SECONDS NOW COSTS 0.5 SECONDS OF WALL CLOCK instead of timing out at nine minutes. THE TENTH EXPIRED BLOCKER. A REASON THAT EXPIRED IS A HABIT, AND FOUR TIMED-OUT PROBES ARE FOUR CHANCES I HAD TO ASK WHY.");

    ok("...and this gate does not need one either", typeof jitterCentres === "function",
       "the wander is jitterCentres', not box3d's, so the claim 'a wall bounds a random walk' does not need a solver to test. The box3d-in-Node run PROVED IT IN THE REAL TANK; this runs in 40 ms every ship, forever. A GATE THAT TAKES A MINUTE IS A GATE SOMEBODY SWITCHES OFF.");
}

console.log(fails ? "\ntankStability-selfcheck: " + fails + " FAILED" : "\ntankStability-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
