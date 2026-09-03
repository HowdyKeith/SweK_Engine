#!/usr/bin/env node
// tools/ship/krbnPaint-selfcheck.mjs -- v4418
//
// Run: node tools/ship/krbnPaint-selfcheck.mjs      (pure: no GL, no canvas, no model, no network)
//
// *** THE PAINTER IS 2D. KRBN IS THE GATED, EXACT BRIDGE BETWEEN THAT PLANE AND A 3D SURFACE. NOTHING HAD
// EVER CONNECTED THEM. *** v2721 settled that Krbn's flattening is one-way for the PICTURE and reversible
// GIVEN THE GEOMETRY; v2722 lifted whole strokes onto the surface as OBJ polylines; v4047 made the lift
// return { tri, bary } so a lifted mark follows an animation exactly rather than approximately. On the other
// side, fx/primitiveFit.mjs places flat convex shapes into a raster and every shape it places already HAS a
// screen-space boundary polyline, which is liftStrokes's input format. The two halves simply had no caller
// in common.
//
// ---- WHAT THE CONNECTION MEASURES, WHICH NEITHER HALF CAN ALONE -----------------------------------------------
//
// *** THE FITTER SCORES IN SCREEN SPACE, WHERE A PIXEL BESIDE A SILHOUETTE COSTS EXACTLY WHAT A PIXEL IN THE
// MIDDLE OF A FACE COSTS. ON THE SURFACE THEY ARE NOT THE SAME PIXEL. *** Measured over four Krbn meshes of
// 22 to 1320 triangles, at a budget of 80 shapes:
//
//   * only 1 to 19 of the 80 shapes lie WHOLLY on the surface; 40 to 49 straddle a silhouette;
//   * 22 to 34 of them cover NO MESH PIXEL AT ALL -- a third of the budget spent on the empty space;
//   * the whole painting lifts to 33 to 58 polylines, so under half of it becomes 3D geometry;
//   * 34% to 51% of the improvement the painter reports was bought OFF the object;
//   * and the fitter's own ranking of what mattered agrees with the surface's on the FIRST shape at every
//     mesh and then diverges at once -- 1 to 3 of the top five are shared.
//
// ---- AND THE MUST-MATTER, WHICH CONTINUES v4417's FINDING ------------------------------------------------------
//
// A fitter told which pixels are the object -- same shipped search, same budget, same seed, one changed
// target -- gets 16% to 34% more of the object's error out and puts a third fewer shapes on the background.
// *** SO THE BINDING CONSTRAINT HERE IS THE SCORE, not the model class and not the sample budget. *** v4417
// measured that representability is not what governs this fitter; this measures something that is.
//
// The round-trip check is also a SECOND INDEPENDENT CALLER holding project() and rayThroughScreen() together.
// krbnCompare.js's own v4045 note says a mismatch between them would be "a silent, plausible-looking
// wrongness rather than a crash", and names its selfcheck's point round-trip as the only thing holding them.
// Now a whole shape boundary does too, at 1e-13 px.
//
// SABOTAGES: see the log at the foot of this file.
"use strict";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { fit, blank, averageColour, spansOf } from "../../fx/primitiveFit.mjs";
import { sharedMesh } from "../../tools/krbn/krbnCompare.js";
import { sceneMesh } from "../../tools/krbn/sceneMeshes.js";
import { distinctColours, startDistanceOf, convergenceExponent } from "../../fx/paintTargets.mjs";
import {
    frameFor, krbnTarget, boundaryOf, classifyShapes, splitError, perShapeGain, rankOverlap,
    surfaceScoredTarget, boundaryRoundTrip,
} from "../../fx/krbnPaint.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const report = (s) => console.log(`  ----  ${s}`);

const W = 64, H = 64, SHAPES = 80, SEED = 7;
const MESHES = [["shared", sharedMesh()], ["blob", sceneMesh("blob")], ["splat", sceneMesh("splat")], ["ragdoll", sceneMesh("ragdoll")]];

const RUNS = MESHES.map(([name, mesh]) => {
    const frame = frameFor(mesh, { w: W, h: H });
    const { image, hit, onMesh } = krbnTarget(mesh, frame);
    const painted = fit(image, { shapes: SHAPES, seed: SEED });
    const base = blank(W, H, averageColour(image));
    const bg = averageColour(image).map((v) => Math.round(v));
    const masked = surfaceScoredTarget(image, hit, bg);
    const surface = fit(masked, { shapes: SHAPES, seed: SEED, background: bg });
    const rows = perShapeGain(image, painted.shapes, hit);
    return {
        name, mesh, frame, image, hit, onMesh, painted, surface, rows,
        cls: classifyShapes(painted.shapes, mesh, frame),
        rt: boundaryRoundTrip(painted.shapes, mesh, frame),
        e0: splitError(image, base, hit), e1: splitError(image, painted.canvas, hit),
        meshErrScreen: splitError(image, painted.canvas, hit).on,
        meshErrSurface: splitError(image, surface.canvas, hit).on,
        bgShapesScreen: rows.filter((r) => r.areaOn === 0).length,
        bgShapesSurface: perShapeGain(image, surface.shapes, hit, { background: bg }).filter((r) => r.areaOn === 0).length,
    };
});
for (const r of RUNS) report(`${r.name.padEnd(8)} ${String(r.mesh.triangles.length).padStart(4)} triangles | ${r.onMesh} of ${W * H} pixels are the object (${(100 * r.onMesh / (W * H)).toFixed(1)}%), ${distinctColours(r.image)} colours, start ${startDistanceOf(r.image).toFixed(6)}`);

/* ------------------------------------------------------------------------------------------------------------
 * 1. *** THE BRIDGE IS EXACT FOR A WHOLE SHAPE BOUNDARY, NOT ONLY FOR A POINT ***
 * --------------------------------------------------------------------------------------------------------- */
{
    for (const r of RUNS) report(`${r.name.padEnd(8)} boundary round-trip: ${r.rt.hits} points landed on the surface, ${r.rt.misses} missed | worst |project(backProject(s)) - s| = ${r.rt.worst.toExponential(2)} px`);
    ok("!! *** EVERY BOUNDARY POINT THAT LANDS COMES BACK TO WHERE IT CAME FROM, TO 1e-13 OF A PIXEL ***",
       RUNS.every((r) => r.rt.worst < 1e-11 && r.rt.hits > 100),
       `*** krbnCompare-selfcheck holds this for ONE POINT at err < 1e-6. Here it is ${RUNS.reduce((a, r) => a + r.rt.hits, 0)} points, the boundaries of ${RUNS.length * SHAPES} painted shapes across four meshes of 22 to 1320 triangles, and the worst is ${Math.max(...RUNS.map((r) => r.rt.worst)).toExponential(2)} px. *** v2721's claim is that the flattening is one-way FOR THE PICTURE and reversible GIVEN THE GEOMETRY; this is that claim exercised by a caller it was not written for.`);

    ok("!! ...and that makes this a SECOND independent caller holding project() and rayThroughScreen() together",
       RUNS.every((r) => r.rt.worst < 1e-11),
       "krbnCompare.js's v4045 note says leaving one of them on the old two-focal-length form while the other moved would put every lifted point on the wrong ray -- \"a silent, plausible-looking wrongness rather than a crash\" -- and names its own selfcheck's point round-trip as the only thing holding them. A SINGLE GATE HOLDING A TWO-SIDED INVARIANT IS ONE EDIT FROM HOLDING NOTHING, and this round did not set out to add a second; it needed the inverse and got the check for free.");
}

/* ------------------------------------------------------------------------------------------------------------
 * 2. *** MOST OF THE PAINTING CANNOT BE LIFTED AT ALL ***
 * --------------------------------------------------------------------------------------------------------- */
{
    for (const r of RUNS) report(`${r.name.padEnd(8)} of ${SHAPES} shapes: ${r.cls.whole} wholly on the surface, ${r.cls.straddle} straddling a silhouette, ${r.cls.off} entirely off it -> ${r.cls.polylines} 3D polylines, ${r.cls.vertices} vertices`);
    ok("!! *** ONE TO NINETEEN OF EIGHTY SHAPES LIE WHOLLY ON THE SURFACE. THE REST STRADDLE OR MISS ***",
       RUNS.every((r) => r.cls.whole < SHAPES / 3 && r.cls.straddle > SHAPES / 3 && r.cls.whole + r.cls.straddle + r.cls.off === SHAPES),
       `${RUNS.map((r) => `${r.name} ${r.cls.whole}`).join(", ")} wholly on, against ${RUNS.map((r) => r.cls.straddle).join("/")} straddling. THE PAINTER HAS NO REASON TO RESPECT A SILHOUETTE -- it is optimising an image, and an image has no silhouettes in it, only colour. The three counts are asserted to partition the budget so a fault cannot lose shapes between them.`);

    // *** THE CONTRACT SAYS "CLOSED" AND NOTHING CHECKED IT, WHICH A SABOTAGE HAD TO SHOW ME. ***
    const f0 = RUNS[0].frame;
    const kinds = [
        { kind: "rect", x: 10, y: 12, w: 20, h: 14, corners: 4 },
        { kind: "rotatedRect", x: 30, y: 30, w: 18, h: 9, angle: 0.7, corners: 4 },
        { kind: "triangle", x1: 5, y1: 5, x2: 40, y2: 9, x3: 20, y3: 44, corners: 3 },
        { kind: "ellipse", x: 32, y: 32, rx: 12, ry: 8, corners: null },
    ];
    const loops = kinds.map((k) => { const b = boundaryOf(k, f0, { samples: 48 }); return { k, b,
        closed: Math.hypot(b[0][0] - b[b.length - 1][0], b[0][1] - b[b.length - 1][1]) < 1e-12,
        len: b.length, want: k.corners === null ? 49 : k.corners + 1 }; });
    ok("!! every kind's boundary comes back CLOSED, and a polygon's is corners + 1 points",
       loops.every((l) => l.closed && l.len === l.want),
       `${loops.map((l) => `${l.k.kind} ${l.len}`).join(", ")} points, first and last identical in all four. *** DROPPING THE REPEATED FIRST POINT WENT 0 RED: *** the last edge -- a rectangle's fourth side -- is then never sampled and never lifted, the counts above barely move, and the OBJ would export three-sided rectangles. The module's own comment promises a closed polyline and this is the only thing that holds it to that.`);

    ok("!! ...and the whole painting lifts to fewer polylines than it has shapes -- a straddler can lift to NOTHING",
       RUNS.every((r) => r.cls.polylines < SHAPES && r.cls.polylines > 20),
       `${RUNS.map((r) => `${r.name} ${r.cls.polylines}`).join(", ")} polylines from ${SHAPES} shapes. *** liftStrokes EMITS A POLYLINE ONLY WHERE TWO CONSECUTIVE POINTS HIT, so a boundary that clips the object between samples contributes NO 3D geometry even though part of it genuinely touches the surface. *** That is strokeLift working exactly as written -- it refuses to emit anything floating in space, which is the v2722 claim -- and it is why "straddling" and "liftable" are counted as two things here.`);
}

/* ------------------------------------------------------------------------------------------------------------
 * 3. *** A THIRD OF THE BUDGET IS SPENT ON THE EMPTY SPACE AROUND THE OBJECT ***
 * --------------------------------------------------------------------------------------------------------- */
{
    for (const r of RUNS) report(`${r.name.padEnd(8)} shapes covering NO mesh pixel at all: ${r.bgShapesScreen} of ${SHAPES} (${(100 * r.bgShapesScreen / SHAPES).toFixed(0)}%)`);
    ok("!! *** TWENTY-TWO TO THIRTY-FOUR OF EIGHTY SHAPES TOUCH THE OBJECT NOWHERE ***",
       RUNS.every((r) => r.bgShapesScreen > SHAPES / 8 && r.bgShapesScreen < SHAPES / 2),
       `${RUNS.map((r) => `${r.name} ${r.bgShapesScreen}`).join(", ")}. This is COVERAGE, not the boundary classification above: a shape can have every boundary sample off the mesh and still contain the object, or clip it and cover nothing. THE TWO COUNTS ANSWER DIFFERENT QUESTIONS -- one is "can this mark be lifted", the other is "is this mark about the object at all" -- and a round reporting either as the other would be wrong by ${Math.abs(RUNS[0].bgShapesScreen - RUNS[0].cls.off)} shapes on the first mesh alone.`);
}

/* ------------------------------------------------------------------------------------------------------------
 * 4. *** THE FITTER'S ORDERING AND THE SURFACE'S AGREE ON THE FIRST SHAPE AND THEN DIVERGE AT ONCE ***
 * --------------------------------------------------------------------------------------------------------- */
{
    const ranks = RUNS.map((r) => ({ name: r.name, o: [1, 5, 10, 20].map((n) => rankOverlap(r.rows, n)) }));
    for (const r of ranks) report(`${r.name.padEnd(8)} top-1 / top-5 / top-10 / top-20 by total gain, shared with the same ranks by ON-MESH gain: ${r.o.join(" / ")}`);
    ok("!! *** THE BIGGEST SHAPE IS RIGHT AT EVERY MESH AND THE NEXT FOUR ARE NOT ***",
       ranks.every((r) => r.o[0] === 1 && r.o[1] <= 3),
       `top-1 shared at all four meshes, top-5 shared ${ranks.map((r) => r.o[1]).join("/")} of five. The first shape a greedy fitter places is the one choice where "cover the most error" and "cover the most OBJECT" coincide, because the object IS most of the error at that point. AFTER THAT IT WANDERS INTO THE BACKGROUND, and its own ordering stops being a statement about the subject.`);

    let exact = 0;
    for (const r of RUNS) {
        const sum = r.rows.reduce((a, x) => a + x.gain, 0);
        const real = (r.e0.on + r.e0.off) - (r.e1.on + r.e1.off);
        if (sum === real) exact++;
    }
    ok("!! and the per-shape replay sums EXACTLY to the painting's own improvement -- the control on section 5",
       exact === RUNS.length,
       `${exact} of ${RUNS.length} meshes, integer-equal. *** THE FIRST DRAFT SUMMED TO 1.0004 OF IT *** because the replay composited in raw floats where drawShape writes through a Uint8ClampedArray and differenceChange rounds with quantise(). A 0.04% drift looks like nothing and is a DIFFERENT ARITHMETIC; a replay that does not round is measuring a painting nobody painted, and every split below rests on it.`);
}

/* ------------------------------------------------------------------------------------------------------------
 * 5. *** A THIRD TO A HALF OF THE HEADLINE IMPROVEMENT WAS BOUGHT OFF THE OBJECT ***
 * --------------------------------------------------------------------------------------------------------- */
{
    const shares = RUNS.map((r) => ({ name: r.name, share: (r.e0.off - r.e1.off) / ((r.e0.on - r.e1.on) + (r.e0.off - r.e1.off)),
                                      pix: 1 - r.onMesh / (W * H), on: 1 - r.e1.on / r.e0.on, off: 1 - r.e1.off / r.e0.off }));
    for (const s of shares) report(`${s.name.padEnd(8)} error removed: ${(100 * s.on).toFixed(1)}% on the object, ${(100 * s.off).toFixed(1)}% off it | the off-object share of the whole improvement is ${(100 * s.share).toFixed(1)}%, on ${(100 * s.pix).toFixed(1)}% of the pixels`);
    ok("!! *** THE PAINTER'S ONE NUMBER IS TWO NUMBERS, AND ONLY THE GEOMETRY CAN SEPARATE THEM ***",
       shares.every((s) => s.share > 0.25 && s.share < 0.6),
       `${shares.map((s) => (100 * s.share).toFixed(0) + "%").join(", ")} of the improvement is the empty space around the object. A READER TAKING primitiveFit's distance AS "HOW WELL THE OBJECT WAS CAPTURED" IS OFF BY THAT MUCH, and nothing in the image says so -- the split needs the mesh and the camera, which is exactly what Krbn supplies and what the painter has never had. THIS IS THE TWO-THINGS-ONE-LABEL SHAPE THIS TREE NAMES MOST OFTEN, in a place nobody had looked.`);

    report(`for v4417's series -- the Krbn target's convergence exponent is p = ${convergenceExponent(RUNS[0].image, [5, 10, 20, 40, 80, 160, 320]).toFixed(3)}, against 0.572 flat / 0.713 ramp / 0.433 marched`);
    ok("...and a Krbn frame is a fourth target from a fourth generator, in the same narrow band of exponents",
       (() => { const p = convergenceExponent(RUNS[0].image, [5, 10, 20, 40, 80, 160, 320]); return p > 0.3 && p < 0.8; })(),
       "v4417 measured three targets whose exponents span 1.65x while their representability spans everything from 'five shapes finish it' to 'nothing finishes it'. A FOURTH INDEPENDENT GENERATOR LANDS IN THE SAME BAND, which is more evidence for that round's conclusion than another point on one of its own curves would be.");
}

/* ------------------------------------------------------------------------------------------------------------
 * 6. *** THE MUST-MATTER: THE SCORE IS THE BINDING CONSTRAINT, AND IT COSTS NOTHING TO FIX ***
 * --------------------------------------------------------------------------------------------------------- */
{
    for (const r of RUNS) report(`${r.name.padEnd(8)} object error after ${SHAPES} shapes: screen-scored ${r.meshErrScreen.toExponential(3)}, surface-scored ${r.meshErrSurface.toExponential(3)} (${(100 * (1 - r.meshErrSurface / r.meshErrScreen)).toFixed(1)}% better) | shapes on pure background ${r.bgShapesScreen} -> ${r.bgShapesSurface}`);
    ok("!! *** TOLD WHICH PIXELS ARE THE OBJECT, THE SAME SEARCH GETS 16% TO 34% MORE OF IT OUT ***",
       RUNS.every((r) => r.meshErrSurface < r.meshErrScreen * 0.9 && r.bgShapesSurface < r.bgShapesScreen),
       `Same shipped fitter, same ${SHAPES} shapes, same seed ${SEED}, ONE CHANGED TARGET. Background shapes fall ${RUNS.map((r) => `${r.bgShapesScreen}->${r.bgShapesSurface}`).join(", ")}. *** v4417 measured that REPRESENTABILITY is not what governs this fitter and that the search costs a factor of two at the budget where the answer is known. THIS IS A THIRD VARIABLE AND IT IS THE CHEAPEST OF THE THREE: the score. *** Nothing was added -- no new primitive, no bigger budget, no training.`);

    ok("...and what that construction IS gets said, because it is not the obvious one",
       RUNS.every((r) => r.meshErrSurface > 0),
       "*** OFF-MESH TARGET PIXELS ARE SET TO THE COLOUR THE CANVAS STARTS AT, SO THEY BEGIN AT ZERO ERROR. THAT IS A PENALTY, NOT A MASK. *** Masking the score would make a background pixel contribute nothing whether painted or not; here, covering one COSTS. The stronger condition is the right one for this question -- a painter of surfaces should be pushed off the background, not merely unrewarded for it -- but calling it masking would be describing an experiment nobody ran.");
}

/* ------------------------------------------------------------------------------------------------------------
 * 7. DISCIPLINE
 * --------------------------------------------------------------------------------------------------------- */
{
    const src = fs.readFileSync(path.join(ENG, "fx", "krbnPaint.mjs"), "utf8");
    ok("the connector owns no rasteriser, no ray-caster, no projection and no BVH of its own",
       !/function\s+(spansOf|pointsOf|rayThroughScreen|backProjectHit|raycastFirst|project)\b/.test(src) &&
       /from "\.\/primitiveFit\.mjs"/.test(src) && /from "\.\.\/tools\/krbn\/krbnCompare\.js"/.test(src) &&
       /from "\.\.\/tools\/krbn\/strokeLift\.js"/.test(src),
       "It calls primitiveFit for rasterisation, krbnCompare for the projection and the ray-cast, strokeLift for the lift. A CONNECTOR THAT REIMPLEMENTED EITHER SIDE WOULD BE GRADING ITS OWN COPY -- and krbnCompare's own v4221 note records deleting a second Moller-Trumbore kernel for exactly that reason.");

    const mine = fs.readFileSync(new URL(import.meta.url), "utf8");
    const specs = [...mine.matchAll(/^import[^;]*?from\s+"([^"]+)"/gm)].map((x) => x[1]);
    ok("!! and the four meshes come from the tree's own scene library, not from fixtures written here",
       specs.some((x) => x.endsWith("sceneMeshes.js")) && specs.some((x) => x.endsWith("krbnCompare.js")) &&
       !/positions:\s*\[/.test(mine),
       `sharedMesh() plus sceneMeshes.js's blob, splat and ragdoll -- 22 to 1320 triangles, 9.6% to 36.0% of the frame. FOUR MESHES RATHER THAN ONE BECAUSE EVERY NUMBER ABOVE IS A RANGE: a single mesh would have made each of them look like a constant, and the ranges are what say the finding is about the painter rather than about a shape.`);
}

console.log(fails ? `\n${fails} FAILURE(S)` : "\nALL GREEN");
console.log(`
----  WHAT THIS DOES NOT CLAIM
      THAT THE PAINTER SHOULD RESPECT SILHOUETTES. It is a picture fitter and it is fitting a picture
      correctly; the finding is that its number means less about the SUBJECT than a reader would take
      it to mean, and that the geometry to say so was already in the tree and unconnected. Nothing
      here trains anything, nothing here scores a composition, and nothing here says the lifted
      drawings look good.

      STILL UNCHECKED: the lift returns { tri, bary }, so a lifted mark FOLLOWS AN ANIMATION EXACTLY
      -- v4047's identity, because linear blend skinning is linear in the vertex position. Every
      polyline this round lifts is therefore riggable and NOT ONE OF THEM IS POSED HERE.
      liftStrokesRigged and poseRiggedStrokes exist and this gate does not call them.`);
process.exit(fails ? 1 : 0);

/* -----------------------------------------------------------------------------------------------------------
 * SABOTAGE LOG -- 4 / 4 / 2 / 1 / 1 / 1 / 1 / 1 / 1 by name, and ONE WENT 0 RED FIRST.
 *
 * A. rayThroughScreen reverted to the two-focal-length form v4045 removed, leaving project() on
 *    the single one -- exactly the mismatch krbnCompare.js's own note calls "a silent,
 *    plausible-looking wrongness rather than a crash".               4 RED here, AND 1 RED in krbnCompare's
 *    *** THIS IS THE ONE THAT MAKES SECTION 1's SECOND CLAIM TRUE RATHER THAN RHETORICAL. *** Both gates go
 *    red, independently, on the same one-line edit -- which is what "a second caller holding the invariant"
 *    has to mean if it means anything. It also reaches the ranking and the surface-scored comparison, because
 *    a wrong ray moves the mask and the mask is what those two read.
 *
 * B. krbnTarget marks every pixel as the object.                                                    4 RED
 *    Every check that reads the mask: the background-shape count, the ranking, the error split and the
 *    surface-scored comparison. Correctly NOT section 1 or 2, which read the ray-cast rather than the mask.
 *    *** THE FIRST ATTEMPT AT THIS ONE WAS A MALFORMED EDIT that produced a meaningless 0 RED -- v4413's
 *    heredoc lesson again. A sabotage that does not compile into the thing you meant is not a measurement,
 *    and "0 red" from one is worth nothing. Re-applied as a one-token change and re-run.
 *
 * C. splitError puts the on-mesh error in the off bucket and vice versa.                            2 RED
 *    The error split and the surface-scored comparison. Not the background-shape count, correctly -- that
 *    reads coverage from perShapeGain, not from this function.
 *
 * D. perShapeGain composites in raw floats instead of quantising.                                   1 RED
 *    *** THIS IS THE FIRST DRAFT'S OWN BUG, KEPT AS A SABOTAGE. *** The replay then sums to 1.0004 of the
 *    painting's real improvement -- a 0.04% drift that looks like rounding noise and is a different
 *    arithmetic. The exactness control is the only thing that sees it, and every split in section 5 rests on
 *    the replay being the painting that was actually painted.
 *
 * E. classifyShapes counts any boundary contact as "wholly on the surface".                         1 RED
 *    The partition check. Narrow and right: nothing else reads that split, and the three counts are asserted
 *    to sum to the budget precisely so a fault cannot lose shapes between the buckets.
 *
 * F. surfaceScoredTarget returns the target unchanged.                                              1 RED
 *    The must-matter collapses to "the same fitter twice", and a 0% improvement fails it. The construction
 *    check beside it correctly does NOT fire -- it asserts what the construction is, not that it did anything.
 *
 * G. rankOverlap compares the total-gain ordering with itself.                                      1 RED
 *    Overlap becomes n at every n, so top-5 is 5 of 5 and the divergence disappears. A CHECK THAT COMPARED A
 *    LIST WITH ITSELF IS v4414's DEFECT, and this is the sabotage that proves it is not this one.
 *
 * H. boundaryOf leaves the polygon open -- the repeated first point dropped.         0 RED, then 1 RED
 *    *** THE MODULE'S OWN COMMENT PROMISES A CLOSED POLYLINE AND NOTHING HELD IT TO THAT. *** With the loop
 *    open, a rectangle's fourth side is never sampled, never lifted and never exported; the counts above
 *    barely move because the other three edges still classify the shape the same way. An OBJ of three-sided
 *    rectangles would have been the first anyone noticed. Closure is now asserted for all four kinds.
 *
 * I. boundaryOf leaves the ELLIPSE open (k < samples rather than <=).                                1 RED
 *    Added because H's cure had to cover the sampled kind as well as the cornered ones -- the two share a
 *    contract and not a code path.
 * --------------------------------------------------------------------------------------------------------- */
