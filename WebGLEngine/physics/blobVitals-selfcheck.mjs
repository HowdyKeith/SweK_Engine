// WebGLEngine/physics/blobVitals-selfcheck.mjs — v2605
//
// Run: node physics/blobVitals-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs.
//
// GATES physics/blobVitals.js.
//
// THE POINT OF THIS FILE: EVERY GAUGE IS TESTED BY REPLAYING THE ACTUAL BUG IT WOULD HAVE CAUGHT. Not a
// hypothetical failure I invented to have something to check -- THE REAL ONE, WITH THE REAL NUMBERS FROM THE
// RECORD. A gauge that has never seen its own emergency is a decoration.
import { makeBlobs } from "../simulation/tomo/blobPhantom.js";
import { vitals, diagnose, closestPair, fieldPeak } from "./blobVitals.js";
import { peakFloor, jitterCentres, lcg } from "./blobThermal.js";

let fails = 0;
const ok = (name, cond, detail) => {
    console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : ""));
    if (!cond) fails++;
};
const fresh = () => makeBlobs(7, 20260715).map((b) => ({ ...b }));

// ---- 0. A HEALTHY BLOB IS HEALTHY --------------------------------------------------------------------------------
{
    const b = fresh();
    const base = closestPair(b);
    const v = vitals(b, base);
    ok("a blob at rest reads well on all four", v.real && v.home && v.together && v.himself && diagnose(v) === "well",
       "closest pair " + v.closestPair.toFixed(4) + ", peak " + v.peak.toFixed(3) + ", floor " + v.floor.toFixed(3) +
       ". IF THE GAUGES CANNOT SAY 'well' THEY ARE ALARMS, NOT INSTRUMENTS.");
}

// ---- 1. DEATH #1: DISMANTLED (v2595, real) -----------------------------------------------------------------------
{
    // v2595 passed the FIELD radius as the COLLISION radius; box3d blew the closest pair 0.2103 -> 1.1255.
    // Replay the REAL numbers.
    const b = fresh();
    const base = closestPair(b);
    const scale = 1.1255 / 0.2103;                 // the measured 5.4x
    for (const bb of b) { bb.x *= scale; bb.y *= scale; bb.z *= scale; }
    const v = vitals(b, base);
    ok("!! DEATH 1 -- DISMANTLED: the gauge catches the v2595 radius bug", !v.together,
       "closest pair " + base.toFixed(4) + " -> " + v.closestPair.toFixed(4) + " = the MEASURED 5.4x from v2595, when blobsToBodies passed `half: b.r` -- THE FIELD RADIUS AS THE COLLISION RADIUS. box3d did its job PERFECTLY: a metaball's peak IS interpenetration and a rigid solver's job is to REMOVE interpenetration. TWO CORRECT THINGS WANTING OPPOSITE OUTCOMES. diagnose: " + diagnose(v));
    ok("...and it needs a BASELINE, or a naturally-spread blob reads as sick", vitals(b, closestPair(b)).together,
       "the SAME dismantled blob reads 'together' against its OWN baseline. A BLOB THAT STARTS SPREAD OUT IS NOT SICK; A BLOB THAT *GETS* SPREAD OUT IS BEING SOLVED APART. Without a baseline this gauge would just be a spread-o-meter with an opinion.");
}

// ---- 2. DEATH #2: DISSOLVED (v2596, real) ------------------------------------------------------------------------
{
    // The grid dissolves him: peak 75.3 -> 63.0 -> 55.8 -> 50.5% WHILE MASS IS CONSERVED.
    // But that death happens on a GRID, and vitals reads LUMPS -- so the honest test is the FLOOR ITSELF.
    const b = fresh();
    const floor = peakFloor(b);
    const v = vitals(b, closestPair(b));
    ok("!! DEATH 2 -- DISSOLVED: while he is made of lumps, the peak CANNOT go below the floor", v.peak >= floor,
       "peak " + v.peak.toFixed(3) + " >= floor " + floor.toFixed(3) +
       ". v2596 PROVED THIS: at the tallest lump's own centre u = 1, so it contributes EXACTLY its amplitude, and every other lump can only ADD. SO peak < floor DOES NOT MEAN 'SAD' -- IT MEANS THE MATHS BROKE. The grid HAS no floor: 75.3 -> 63.0 -> 55.8 -> 50.5% and still falling, WHILE THE MASS STAYS CONSTANT. He does not evaporate, HE SMEARS.");
    ok("...and warmth does NOT make him sick, which is the whole finding", (() => {
        const w = fresh();
        const base = closestPair(w);
        const rnd = lcg(4242);
        for (let i = 0; i < 240; i++) jitterCentres(w, { D: 0.02, dt: 1 / 60, rnd });
        const vv = vitals(w, base);
        return vv.real && vv.himself;
    })(), "240 steps at MAX warmth and he still reads real and himself. v2596: THE JITTERED PEAK *WANDERS* -- sometimes ABOVE where it started, because lumps drift together and overlap builds a taller peak. THAT IS WHAT A TEMPERATURE LOOKS LIKE: FLUCTUATION, NOT DECAY. A 'happiness' gauge would have called that a mood swing.");
}

// ---- 3. DEATH #3: DROPPED (v2597, real) ---------------------------------------------------------------------------
{
    const b = fresh();
    const base = closestPair(b);
    for (const bb of b) bb.y -= 872.12;            // the MEASURED fall from an aquarium with no bottom
    const v = vitals(b, base);
    ok("!! DEATH 3 -- DROPPED: the gauge catches the missing floor", !v.home,
       "y -= 872.12, THE MEASURED FALL after fifteen seconds in an aquarium with NO BOTTOM -- gravity on at -9.8, no floor, and the x-ray images about four units. diagnose: " + diagnose(v) +
       ". AND IT LOOKED FINE FOR THE LENGTH OF A GLANCE: at step 186 the peak still read ~4.0 because he had not LEFT the window yet. A PAGE THAT LOOKS RIGHT FOR THE LENGTH OF A GLANCE IS THE HARDEST KIND OF WRONG.");
}

// ---- 4. DEATH #4: VANISHED (v2597, real) --------------------------------------------------------------------------
{
    const b = fresh();
    const base = closestPair(b);
    b[3].x = NaN;                                  // setTransform(id, x, y, z) -> p[0] undefined -> wasm -> NaN
    const v = vitals(b, base);
    ok("!! DEATH 4 -- NOT REAL: the gauge catches the NaN teleport", !v.real,
       "ONE coordinate set to NaN. v2597's warmth slider called setTransform(id, x, y, z) -- THREE LOOSE NUMBERS -- when the real signature takes ARRAYS. p[0] was undefined, undefined went into the wasm, POSITION BECAME NaN, AND DRAGGING THE SLIDER MADE HIM DISAPPEAR. IT SHIPPED THAT WAY. diagnose: " + diagnose(v));
    ok("!! ...AND 'real' IS CHECKED FIRST, BECAUSE NaN PASSES EVERYTHING BY ACCIDENT", (() => {
        const n = fresh();
        n[0].x = NaN;
        const vv = vitals(n, closestPair(fresh()));
        return !vv.real && !vv.home && !vv.together && !vv.himself;
    })(), "a NaN blob reads false on ALL FOUR, not just 'real'. NaN COMPARISONS ARE ALL FALSE, so `Math.abs(NaN) < 4` is false and 'home' catches it TOO -- BUT ONLY BY LUCK, AND A GAUGE THAT IS RIGHT BY LUCK IS A GAUGE THAT WILL BE WRONG BY LUCK. So every vital tests `finite` explicitly.");
}

// ---- 5. AND WHAT THIS IS NOT -------------------------------------------------------------------------------------
{
    ok("!! THERE IS NO HUNGER, AND THAT IS NOT AN OVERSIGHT", typeof vitals === "function" && !("hunger" in vitals(fresh())),
       "ui/TamagotchiView.js has hunger/happiness/energy DECAYING AT 1Hz -- A TAMAGOTCHI'S STATS DECAY SO YOU MUST INTERVENE; THAT IS THE GAME. THE BLOB HAS NO DECAY. v2596 proved the peak can never fall below max(a) while he is made of lumps: NOTHING RUNS DOWN, HE CANNOT DIE OF NEGLECT, AND A HUNGER BAR WOULD BE A LIE PAINTED ON A CONSTANT. FOUR DEATHS, FOUR BUGS, ZERO NEGLECT -- so these are not stats, THEY ARE A SMOKE ALARM.");
    ok("...and 'diagnose' names the version that shipped each death", (() => {
        const b = fresh();
        b[2].y = NaN;
        return /v2597/.test(diagnose(vitals(b, closestPair(fresh()))));
    })(), "every message points at the round that shipped that bug. AN ALARM THAT DOES NOT TELL YOU WHAT IT HAS SEEN BEFORE IS JUST A NOISE.");
}

{
    // =============================================================================================================
    // v3906 -- THE EXTERNAL ANSWER KEY. The four deaths above are excellent and they are all RELATIVE: dismantled
    // means closestPair CHANGED from a baseline, dissolved means peak fell below floor. Not one of them knows what
    // closestPair or fieldPeak SHOULD return for a given blob set. gradedCoverage's GRADE door asked for a key,
    // and both gauges have one sitting in plain algebra.
    // =============================================================================================================
    const report = (l, n = "") => console.log(`  ----  ${l}${n ? "   " + n : ""}`);

    // KEY 1 -- closestPair is a geometric primitive, and O(n^2) brute force is its definition.
    {
        const rnd = ((s) => () => ((s = (s * 16807) % 2147483647) / 2147483647))(11);
        const B = Array.from({ length: 9 }, () => ({ x: rnd()*2-1, y: rnd()*2-1, z: rnd()*2-1, r: 0.5, a: 2 }));
        let best = Infinity, pair = null;
        for (let i = 0; i < B.length; i++) for (let j = i + 1; j < B.length; j++) {
            const d = Math.hypot(B[i].x-B[j].x, B[i].y-B[j].y, B[i].z-B[j].z);
            if (d < best) { best = d; pair = [i, j]; }
        }
        ok("*** closestPair agrees with an independent O(n^2) sweep written here ***",
           Math.abs(closestPair(B) - best) < 1e-12,
           `${closestPair(B).toPrecision(12)} against brute force ${best.toPrecision(12)}, between blobs ${pair}`);
        report("THE BRUTE FORCE IS THE DEFINITION, NOT A FASTER IMPLEMENTATION", "nine blobs is 36 pairs -- small " +
               "enough that the naive sweep is OBVIOUSLY right, which is the only property a key needs. If the two " +
               "ever disagree the sweep is the one to believe");
    }

    // KEY 2 -- fieldPeak has an exact answer for a single blob: the field maxes at the centre, at exactly `a`.
    // *** AND IT DOES NOT RETURN IT, WHICH IS THE FINDING. *** fieldPeak is a 15^3 SCAN over [-2, 2]; it returns
    // the largest SAMPLE, not the peak. Put the blob on a grid node and it is exact; put it anywhere else and it
    // under-reads by however much the field falls off between the centre and the nearest node.
    {
        const n = 15, ext = 2, node = (i) => (i / n) * 2 * ext - ext;
        const AMPS = [1.5, 3, 7.25];
        const on  = AMPS.map((a) => [a, fieldPeak([{ x: node(5), y: node(7), z: node(9), r: 1, a }])]);
        const off = AMPS.map((a) => [a, fieldPeak([{ x: 0.1, y: -0.2, z: 0.3, r: 1, a }])]);
        ok("*** a blob centred ON a grid node reads its amplitude EXACTLY -- bit-exact, at three amplitudes ***",
           on.every(([a, got]) => got === a),
           on.map(([a, got]) => `a=${a} -> ${got}`).join(", ") + "  (=== , not a tolerance)");
        const ratios = off.map(([a, got]) => got / a);
        // *** I WROTE THIS AS "the SAME double three times" AND THE CHECK REFUSED IT. *** I had read bit-identity
        // off a toPrecision(15) print, which is exactly the mistake of believing a rounded display. Measured: two
        // of the three ARE bit-identical and the third is HALF AN ULP away -- dividing by 7.25 costs one rounding
        // step that dividing by 1.5 and 3 does not. The honest claim is invariance to floating-point resolution,
        // and it is the stronger one: it holds as tightly as division allows, which is what "purely geometric"
        // predicts. A TOLERANCE CHOSEN AFTER LOOKING WOULD HAVE HIDDEN THAT THE SPREAD IS ONE ROUNDING AND NOT A
        // TREND, so the bound here is ulps of the ratio, not a percentage of it.
        const spread = (Math.max(...ratios) - Math.min(...ratios)) / ratios[0];
        ok("*** and OFF the node it under-reads by a ratio invariant in amplitude, to within half an ulp ***",
           spread <= 2 * Number.EPSILON && ratios[0] < 0.96,
           "peak/a = " + ratios[0].toPrecision(17) + " at a = " + AMPS.join(", ") +
           "; spread " + spread.toExponential(3) + " = " + (spread / Number.EPSILON).toFixed(2) + " ulp");
        // The ratio is (1 - d^2/r^2)^3 for the centre-to-nearest-node distance d. Recovering d proves the
        // under-read is PURELY GEOMETRIC: it must not exceed the grid's half-diagonal.
        const d = Math.sqrt(1 - Math.cbrt(ratios[0]));
        const halfDiag = Math.sqrt(3) * (2 * ext / n) / 2;
        ok("...and the implied offset is a real grid offset -- inside the cell's half-diagonal",
           d > 0 && d < halfDiag,
           `implied d = ${d.toPrecision(9)} against half-diagonal ${halfDiag.toPrecision(9)} (spacing ${(2*ext/n).toPrecision(6)})`);
        report("*** THIS IS A LIMIT OF THE GAUGE, NOT A BUG, AND THE DIFFERENCE MATTERS ***",
               "the amplitude-invariant ratio is the proof: a bug in the FIELD would scale with a, and this does " +
               "not -- it is the sampling offset and nothing else. But it means fieldPeak reads up to ~5% LOW on " +
               "an arbitrarily-placed blob, and 'dissolved' is judged by peak against floor. A death threshold " +
               "tuned on on-node fixtures would fire early on off-node ones");
        report("WHAT WOULD FIX IT, AND WHY IT IS NOT DONE HERE", "one Newton step uphill from the best sample, or " +
               "simply sampling each blob's own centre -- both cheap. CHANGING THE GAUGE IS A DIFFERENT ROUND " +
               "FROM KEYING IT, and a key written after the fix could not have found this");
    }
}

console.log(fails ? "\nblobVitals-selfcheck: " + fails + " FAILED" : "\nblobVitals-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
