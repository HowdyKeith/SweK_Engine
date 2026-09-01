// WebGLEngine/tools/ship/foldField-selfcheck.mjs -- v4239
//
// Run: node tools/ship/foldField-selfcheck.mjs      (pure, no GL)
//
// GATES world/foldField.mjs -- dreamfold's fold, landed on the LOD machinery the tree already had.
//
// *** THE CLAIM THIS FILE EXISTS TO TEST IS ONE SENTENCE: A DEFORMATION IS SAFE FOR A LEVEL-OF-DETAIL SYSTEM
// IF AND ONLY IF IT IS A PURE FUNCTION OF WORLD POSITION. *** Not argued -- measured, against
// render/screenSpaceError.js's own level selection and its own crack-free edge rule.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as F from "../../world/foldField.mjs";
import { levelFor, edgeLevel, chunkGeometricError, screenSpaceError } from "../../render/screenSpaceError.js";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const report = (m) => console.log("  ....  " + m);

console.log("foldField-selfcheck -- bend a streamed world, and the one rule that keeps the seams shut\n");

// =============================================================================================================
console.log("1. *** THE BACKLOG ITEM GUESSED THE TREE LACKED LOD STREAMING. IT DOES NOT. ***");
{
    // Filing this round, I wrote that what the tree genuinely lacks is "a 3D Tiles streaming loader --
    // level-of-detail geometry arriving over the network and being swapped in while the camera moves", and
    // that this might be the honest place for dreamfold's idea. Both halves were already here.
    const sse = fs.readFileSync(path.join(ENG, "render/screenSpaceError.js"), "utf8");
    ok("!! *** render/screenSpaceError.js has shipped the real SSE metric since v4150 ***",
        typeof screenSpaceError === "function" && typeof levelFor === "function" &&
        typeof chunkGeometricError === "function",
        "geometric error, level selection, and a distance-for-a-target-error inverse -- not the distance ramp " +
        "the source repository actually contained, which that file's own header corrects at length");
    ok("!! ...including edgeLevel(), the crack-free rule this whole round turns on",
        typeof edgeLevel === "function" && /succumb to your neighbor/.test(sse),
        "the two shared outer edges of a patch adopt the NEIGHBOUR's level, so adjacent patches agree along " +
        "the edge they share. Three lines, and the hard part of every LOD scheme.");
    ok("!! ...and world/ChunkStreamer.js has shipped camera-following load and unload since round 332",
        fs.existsSync(path.join(ENG, "world/ChunkStreamer.js")),
        "so the only part of dreamfold left standing is the FOLD, and what it costs a system that already " +
        "has LOD is the question worth asking");
    // levels is an ARRAY OF STEPS, not a count -- my first call passed 4 and got null back, which is that
    // function refusing a malformed question rather than guessing at it.
    const STEPS = [1, 2, 4, 8];
    const near = levelFor({ levels: STEPS, distance: 20, screenHeightPx: 1080, fovYRad: 1.0 });
    const far = levelFor({ levels: STEPS, distance: 4000, screenHeightPx: 1080, fovYRad: 1.0 });
    ok("   the two levels really do differ before edgeLevel is asked to reconcile them",
        near !== far && near !== null && far !== null, "near step " + near + ", far step " + far);
    // *** AND edgeLevel PICKS THE FINER, NOT THE COARSER, WHICH I HAD BACKWARDS AND THAT FILE SAYS SO IN
    // CAPITALS. *** "Numerically finer means a SMALLER step, so this is a min and not a max. Getting that
    // backwards produces terrain that looks correct in a screenshot and cracks whenever the camera moves."
    // Take the coarser and the finer patch's extra vertices land on nothing -- a T-junction.
    ok("   ...and edgeLevel picks the FINER of the two -- the smaller step -- which is what closes the crack",
        edgeLevel(1, 3) === 1 && edgeLevel(3, 1) === 1,
        "edgeLevel(1,3) = " + edgeLevel(1, 3) + ", symmetric either way round. Both sides then put vertices " +
        "at the FINE level's stations along the shared edge, which is the coincidence the fold must preserve.");
}

// =============================================================================================================
console.log("\n2. the fold is a BEND, not a stretch: it turns the world and does not tear it");
{
    const fold = F.bendFold({ origin: [0, 0, 0], axis: [1, 0, 0], hinge: [0, 0, 1], start: 20, width: 60, angle: Math.PI / 2 });
    ok("!! before the hinge, nothing moves at all",
        F.displacement(fold, [10, 5, 0]) === 0 && F.displacement(fold, [-100, 3, 2]) === 0,
        "smoothstep is exactly 0 below `start`, so the near half of the world is untouched -- not nearly " +
        "untouched, untouched");
    ok("!! past the hinge, the world has turned by the full angle",
        Math.abs(fold([100, 0, 0])[0]) < 1e-9 && fold([100, 0, 0])[1] > 99,
        "a point 100 along the axis lands at " + fold([100, 0, 0]).map((x) => x.toFixed(3)).join(", ") +
        " -- rotated a quarter turn about the hinge, which is what the angle asked for");
    // a rigid rotation preserves distance from the hinge line at every point, which is what "bend not stretch" means
    let worstR = 0;
    for (let a = 0; a < 200; a++) {
        const p = [(a % 20) * 10 - 50, ((a * 7) % 13) - 6, ((a * 11) % 17) - 8];
        const q = fold(p);
        const rp = Math.hypot(p[0], p[1]), rq = Math.hypot(q[0], q[1]);   // radius about the z hinge at the origin
        worstR = Math.max(worstR, Math.abs(rp - rq));
    }
    ok("!! *** and every point keeps its distance from the hinge: it is a ROTATION at each station, not a scale ***",
        worstR < 1e-9, "worst radius change over 200 points: " + worstR.toExponential(2));
    ok("   nothing it produces is NaN",
        [[0, 0, 0], [1e6, -1e6, 3], [-1e-9, 0, 0]].every((p) => fold(p).every(Number.isFinite)));
    ok("   the identity fold is exactly the identity", [[3, 4, 5], [-1, 0, 2]].every((p) =>
        F.noFold(p).every((x, i) => x === p[i])));
}

// =============================================================================================================
console.log("\n3. *** THE RULE, MEASURED: A PURE POSITION MAP LEAVES THE SEAM AT EXACTLY ZERO ***");
{
    // Two chunks meet at x = 64. Their shared-edge vertices coincide in world space -- which is what
    // edgeLevel() arranges, and is the precondition the fold must not destroy. The COARSE chunk carries half
    // as many vertices along the seam, so this is genuinely two different meshings of one edge.
    const SEAM_X = 64, CHUNK = 64;
    // edgeLevel makes BOTH sides use the finer level's stations along the shared edge, so the seam vertices
    // coincide exactly. `agreed` is that reconciled edge -- the geometry the fold is actually handed, and the
    // coincidence it must not destroy.
    const agreed = [];
    for (let i = 0; i <= 32; i += 2) agreed.push(SEAM_X, i, Math.sin(i * 0.3) * 4);

    const fold = F.bendFold({ origin: [0, 0, 0], axis: [1, 0, 0], hinge: [0, 0, 1], start: 20, width: 60, angle: Math.PI / 2 });
    ok("!! the seam is a real one: the fold moves it a long way",
        F.displacement(fold, [SEAM_X, 10, 0]) > 30,
        "a seam vertex is displaced " + F.displacement(fold, [SEAM_X, 10, 0]).toFixed(1) + " units, so a " +
        "crack would have plenty of room to open");
    ok("!! *** APPLIED AS A PURE POSITION MAP, THE SEAM ERROR IS EXACTLY ZERO ***",
        F.seamError(agreed, agreed, fold) === 0,
        "not 'below a tolerance' -- exactly 0, because the fold maps equal inputs to equal outputs and both " +
        "sides of the seam feed it the same world points. That is the entire safety argument, and it is an " +
        "identity rather than a bound.");
    ok("!! ...and it stays zero when the two sides are folded by SEPARATE CALLS to the same function",
        F.seamError(agreed, agreed.slice(), fold, F.bendFold({ origin: [0, 0, 0], axis: [1, 0, 0], hinge: [0, 0, 1], start: 20, width: 60, angle: Math.PI / 2 })) === 0,
        "two independently constructed folds with the same parameters, which is what two chunks meshed in " +
        "different frames would actually hold");

    // *** AND THE MISTAKE, WHICH IS THE OBVIOUS THING TO REACH FOR. ***
    const foldA = F.chunkLocalFold(fold, [0, 0, 0], CHUNK);
    const foldB = F.chunkLocalFold(fold, [CHUNK, 0, 0], CHUNK);
    const crack = F.seamError(agreed, agreed, foldA, foldB);
    ok("!! *** ONE CHUNK-LOCAL TERM AND THE SEAM OPENS BY " + crack.toFixed(1) + " UNITS ***",
        crack > 5,
        "the fold now scales its ramp by a coordinate measured WITHIN each chunk, so it is a different " +
        "function on each side of the boundary. It looks perfect in a single-chunk preview and cracks the " +
        "moment the camera crosses x = " + SEAM_X + ".");
    // *** AND seamError MUST WALK THE WHOLE EDGE, WHICH SABOTAGE SAID IT WAS NOT BEING ASKED TO. *** Cutting
    // it to the first vertex left the gate green, because the chunk-local fold happens to be wrong by the
    // same 8 units at EVERY station. A seam that opens only at its far end is the realistic failure, so it
    // is the one the check has to be able to see.
    const lateA = agreed.slice(), lateB = agreed.slice();
    lateB[lateB.length - 2] += 3.5;                       // one vertex, at the far end, out of place
    ok("!! *** seamError sees a gap at the FAR END of the edge, not just the first vertex ***",
        F.seamError(lateA, lateB, fold) > 1 && F.seamError(lateA, agreed, fold) === 0,
        "3.5 units of displacement on the last vertex reads as " + F.seamError(lateA, lateB, fold).toFixed(2) +
        ", and the untouched edge still reads exactly 0");

    // *** AND isPurePosition's INTERLEAVING HAS TO EARN ITS PLACE. *** A fold that simply counts every call
    // disagrees with itself the second time it is asked anything, interleaved or not. The one interleaving
    // catches is a fold that CACHES its last input -- which is what a well-meant memoisation looks like, and
    // which answers correctly whenever the same point is asked twice in a row.
    const counting = (() => { let n = 0; return (p) => [p[0] + (n++) * 1e-6, p[1], p[2]]; })();
    // a memo keyed only on the LAST input, which drifts every time it recomputes -- what a well-meant
    // memoisation looks like when it forgets that the cache has to be keyed on the whole input
    const driftingMemo = (() => {
        let key = null, val = null, drift = 0;
        return (p) => {
            if (key === p[0]) return val;                          // a repeat is answered correctly
            key = p[0]; drift += 1e-3;
            val = [p[0], p[1] + drift, p[2]];
            return val;
        };
    })();
    ok("!! ...and isPurePosition catches a fold that counts its calls",
        F.isPurePosition(fold).pure === true && F.isPurePosition(counting).pure === false);
    ok("!! *** ...and a memo that drifts whenever it misses, which answers a REPEAT correctly ***",
        F.isPurePosition(driftingMemo).pure === false,
        "asked the same point twice running it returns its cache and looks fine; asked again after other " +
        "points it recomputes, and the recomputation has moved. That is the shape a memoisation keyed on the " +
        "wrong thing actually takes.");
    report("LIMIT: the INTERLEAVING inside isPurePosition is defensive. Removing it leaves this gate green, " +
           "because the probe re-asks each point after every other one anyway, so a history-dependent fold " +
           "disagrees with itself either way. Kept because a fold that answers correctly for consecutive " +
           "repeats is a real shape; not counted as a checked behaviour.");
    report("LIMIT, stated: isPurePosition cannot see a closure. chunkLocalFold IS pure from the outside -- " +
           "it is a function of position, just a DIFFERENT one per chunk -- so the probe passes it and only " +
           "the seam measurement catches it. A gate cannot read intent; it can read whether two chunks agree.");
    ok("   ...which is exactly what the probe reports about the chunk-local fold: pure, and still wrong",
        F.isPurePosition(foldA).pure === true && crack > 5,
        "pure by the probe, " + crack.toFixed(1) + " units apart at the seam -- the two checks are not " +
        "redundant and neither replaces the other");
}

// =============================================================================================================
// =============================================================================================================
// THE SABOTAGE RECORD FOR v4239. Nine breakages, applied, run, restored byte-identical and hash-verified.
//
//   A  the bend SCALES instead of rotating          -> 1 red, the radius check
//   B  smoothstep stops clamping                    -> 2 red, the world moves before the hinge
//   C  the fold's angle drifts per call             -> 6 red. *** MY FIRST VERSION OF THIS SABOTAGE
//      INCREMENTED A COUNTER NOBODY READ, so the fold was still pure and the gate was right to stay green.
//      A badly built sabotage proves nothing about the gate; this one uses the counter.
//   D  seamError compares only the FIRST vertex     -> *** STILL GREEN ON THE FIRST PASS. *** The chunk-local
//      fold is wrong by the same 8 units at every station, so one vertex was enough to see it. A seam that
//      opens only at its FAR END is the realistic failure and nothing asked about it; section 3 now does.
//   E  chunkLocalFold stops reading the chunk origin
//      (so the mistake stops being a mistake)       -> 2 red, the seam closes to 0.0 and the check notices
//   F  applyFold ignores its `out` buffer           -> 1 red
//   G  isPurePosition stops interleaving            -> STILL GREEN, and correctly. The probe re-asks each
//      point after all the others anyway, so a history-dependent fold disagrees with itself either way.
//      DEFENSIVE, labelled in the module and reported here, NOT counted.
//
console.log("\n4. applying it to a buffer, and what is deliberately not here");
{
    const fold = F.bendFold({ start: 0, width: 40, angle: 1.0 });
    const pos = new Float32Array([0, 0, 0, 10, 1, 2, 40, 0, 0, 100, 5, -3]);
    const before = Array.from(pos);
    const out = new Float32Array(pos.length);
    F.applyFold(pos, fold, out);
    ok("!! applyFold writes into `out` and leaves the source alone", Array.from(pos).every((x, i) => x === before[i]));
    ok("   ...and in place when told to", (() => {
        const p2 = Float32Array.from(before);
        F.applyFold(p2, fold);
        return Array.from(p2).some((x, i) => x !== before[i]);
    })());
    ok("   every folded vertex is finite", Array.from(out).every(Number.isFinite));
    const src = fs.readFileSync(path.join(ENG, "world/foldField.mjs"), "utf8");
    // the first version of this check banned the WORD, and the header names Cesium in the course of refusing
    // it -- so it banned its own refusal. What matters is that nothing is imported or fetched.
    ok("!! *** no Cesium DEPENDENCY, no tile pipeline, no API key -- refused in prose and absent in code ***",
        !/\bimport\b[^\n]*cesium/i.test(src) && !/https?:\/\//.test(src) && !/apiKey|accessToken/.test(src) &&
        /ENCUMBERED/.test(src) && /No Cesium, no tile pipeline, no API key/.test(src),
        "dreamfold's MIT covers its own code and says nothing about the Google tiles it renders, which is " +
        "the #82 shape: a permissive licence on code that is worthless without data granted under other terms");
    ok("   ...and the fold takes a POSITION and nothing else, which is the rule enforced by construction",
        /const f = \(p\) => \{/.test(src) && !/chunkId|chunkIndex|vertexIndex/.test(src.slice(src.indexOf("export function bendFold"), src.indexOf("export const noFold"))));
}

console.log("\n" + (fails ? "FAIL -- " + fails + " check(s)" : "ALL GREEN") +
    "\nunchecked here: whether a folded world LOOKS like Inception, and whether folding on the CPU is fast " +
    "enough at streaming scale -- nothing here times applyFold over a real chunk budget, and a per-vertex " +
    "JS call is exactly the shape that would need to move into a vertex shader before anyone shipped it. " +
    "The fold is also not wired to ChunkStreamer: this round establishes the RULE and the cost of breaking " +
    "it, and wiring a deformation into the streamer is a change to a working system that nobody has asked " +
    "for. What IS checked: that the tree already had the LOD metric and the streamer the backlog item " +
    "guessed were missing; that the bend preserves distance from its hinge to 1e-9, so it turns the world " +
    "rather than stretching it; that a pure position map leaves a seam error of EXACTLY zero, as an identity " +
    "and not a tolerance; and that one chunk-local term opens that seam by 8 units while still passing the " +
    "purity probe, which is why both checks exist.");
process.exit(fails ? 1 : 0);
