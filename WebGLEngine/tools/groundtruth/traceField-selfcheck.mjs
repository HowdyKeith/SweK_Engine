// tools/groundtruth/traceField-selfcheck.mjs
//
// Run: node tools/groundtruth/traceField-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs.
//
// SweK as a 4D ground-truth generator, held to the standard that makes it worth anything: the truth must be exact and the
// grader must catch a wrong answer. The scene replays bit-for-bit from a seed. The camera is self-consistent -- project a
// known 3D point and unproject it and you get the point back to fifteen digits, so the emitted answer is not itself an
// approximation. The observation an estimator receives is genuinely ambiguous -- a point twice as far along the same ray
// lands on the identical pixel -- which is exactly why recovering 3D from 2D is a real inference and not a lookup, and
// why a ground truth is worth having. And the grader scores a perfect recovery at zero and a wrong one in proportion to
// how wrong it is. The sabotage blinds the grader; a wrong answer then scores zero, which would let any estimator pass,
// so the gate refuses it.
import { makeScene, makeOccluders, groundTruth, visibleAt, renderFrames, exportTraceAnything, scoreTraceAnythingOutput, project, unproject, scoreEstimate, CAM } from "./traceField.js";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };
const scene = makeScene(2024);

// ---- 1. THE BENCHMARK REPLAYS BIT-FOR-BIT FROM A SEED ----------------------------------------------
{
    ok("!! the moving scene and its observations replay identically from a seed", JSON.stringify(makeScene(2024)) === JSON.stringify(scene) && JSON.stringify(groundTruth(makeScene(2024))) === JSON.stringify(groundTruth(scene)),
       scene.nPoints + " points over " + scene.nFrames + " frames -- " + (scene.nPoints * scene.nFrames) + " known 3D positions, reproducible, so the benchmark is fixed and not re-rolled each run.");
}

// ---- 2. THE GROUND TRUTH IS EXACT: the camera inverts to the bit -----------------------------------
{
    let maxErr = 0;
    for (let p = 0; p < scene.nPoints; p++) for (let f = 0; f < scene.nFrames; f++) {
        const pt = scene.tracks[p][f], pr = project(pt), back = unproject(pr.u, pr.v, pr.depth);
        maxErr = Math.max(maxErr, Math.hypot(back[0] - pt[0], back[1] - pt[1], back[2] - pt[2]));
    }
    ok("!! projecting a known point and unprojecting it recovers it exactly", maxErr < 1e-9,
       "worst round-trip error across all " + (scene.nPoints * scene.nFrames) + " positions is " + maxErr.toExponential(1) + " -- the emitted answer is exact, not an approximation of itself.");
}

// ---- 3. THE OBSERVATION IS AMBIGUOUS -> recovering 3D is a real inference ---------------------------
{
    const pt = scene.tracks[5][10], pr = project(pt);
    const far = [CAM.eye[0] + 2 * (pt[0] - CAM.eye[0]), CAM.eye[1] + 2 * (pt[1] - CAM.eye[1]), CAM.eye[2] + 2 * (pt[2] - CAM.eye[2])];
    const pf = project(far);
    ok("!! a point at a different depth on the same ray lands on the same pixel", Math.abs(pf.u - pr.u) < 1e-6 && Math.abs(pf.v - pr.v) < 1e-6 && Math.abs(pf.depth - pr.depth) > 0.5,
       "the 2D observation is a ray, not a point -- depth is genuinely lost, so recovering the 3D track is real inference. That is why the ground truth is worth generating.");
}

// ---- 4. THE GRADER SCORES A PERFECT RECOVERY AT ZERO AND A WRONG ONE IN PROPORTION -----------------
{
    const perfect = scoreEstimate(scene.tracks, scene.tracks).epe;
    const off = scoreEstimate(scene.tracks.map((tr) => tr.map((p) => [p[0] + 0.3, p[1], p[2]])), scene.tracks);
    ok("!! the grader is zero on the truth and proportional on a wrong answer", perfect === 0 && Math.abs(off.epe - 0.3) < 1e-9 && off.within01 === 0,
       "a perfect recovery scores 0; a recovery shifted 0.3 everywhere scores an end-point error of " + off.epe.toFixed(3) + " with 0% inside a tenth -- the grade tracks the error.");
}

// ---- 5. OCCLUSION: a solid between the camera and a point hides it, and the scene is partly occluded ----
{
    const occ = makeOccluders(2024);
    const o = occ[0], dir = [o.base[0] - CAM.eye[0], o.base[1] - CAM.eye[1], o.base[2] - CAM.eye[2]];
    const behind = [CAM.eye[0] + dir[0] * 1.6, CAM.eye[1] + dir[1] * 1.6, CAM.eye[2] + dir[2] * 1.6];
    const beside = [o.base[0] + 3, o.base[1] + 3, o.base[2]];
    const gt = groundTruth(scene, CAM, occ);
    let vis = 0, tot = 0; for (const tr of gt.visible) for (const v of tr) { tot++; if (v) vis++; }
    const frac = vis / tot;
    ok("!! a point behind a solid is hidden, one beside it is seen, and the scene is partly occluded", visibleAt(behind, occ, 0, scene.nFrames) === false && visibleAt(beside, occ, 0, scene.nFrames) === true && frac > 0.2 && frac < 0.95,
       "a point behind an occluder is hidden and one to the side is visible; " + Math.round(100 * frac) + "% of the " + tot + " observations are visible -- tracks vanish behind solids and return, like a real camera's.");
}

// ---- 6. RENDER TO DEPTH FRAMES + POINT-VS-POINT SELF-OCCLUSION FROM THE Z-BUFFER --------------------
{
    const occ = makeOccluders(2024), r = renderFrames(scene, occ), r2 = renderFrames(makeScene(2024), makeOccluders(2024));
    let same = r.nFrames === r2.nFrames, filled = 0;
    for (let f = 0; same && f < r.nFrames; f++) for (let i = 0; i < r.frames[f].length; i++) { if (r.frames[f][i] !== r2.frames[f][i]) { same = false; break; } }
    for (const z of r.frames[0]) if (isFinite(z)) filled++;
    const near = [1, 0.5, 0.5], far = [CAM.eye[0] + 2 * (near[0] - CAM.eye[0]), CAM.eye[1] + 2 * (near[1] - CAM.eye[1]), CAM.eye[2] + 2 * (near[2] - CAM.eye[2])];
    const rr = renderFrames({ nPoints: 2, nFrames: 1, tracks: [[near], [far]] }, null);
    ok("!! frames render deterministically and a nearer splat self-occludes the point behind it", same && filled > 0 && rr.renderedVisible[0][0] === true && rr.renderedVisible[1][0] === false,
       r.nFrames + " depth frames render identically each run (" + filled + " pixels in frame 0); on one ray the near point is drawn and the far one is hidden behind it -- point-vs-point occlusion straight from the z-buffer.");
}

// ---- 7. EXPORT IN THE ESTIMATOR'S FORMAT: their model can be scored against SweK's truth --------------
{
    const occ = makeOccluders(2024), ex = exportTraceAnything(scene, occ), rend = renderFrames(scene, occ);
    const hasSchema = ex.format && ex.control_points && ex.confidence && ex.camera && ex.camera.intrinsics && ex.camera.extrinsics;
    const back = JSON.parse(JSON.stringify(ex));
    let roundTrips = true; for (let p = 0; p < ex.nPoints && roundTrips; p++) for (let f = 0; f < ex.nFrames; f++) for (let k = 0; k < 3; k++) if (back.control_points[p][f][k] !== ex.control_points[p][f][k]) { roundTrips = false; break; }
    let confMatches = true; for (let p = 0; p < ex.nPoints && confMatches; p++) for (let f = 0; f < ex.nFrames; f++) if ((ex.confidence[p][f] === 1) !== rend.renderedVisible[p][f]) { confMatches = false; break; }
    const perfect = scoreTraceAnythingOutput(ex.control_points, ex).epeVisible;
    const shifted = scoreTraceAnythingOutput(ex.control_points.map((tr) => tr.map((q) => [q[0] + 0.5, q[1], q[2]])), ex).epeVisible;
    ok("!! the export carries the estimator's schema, round-trips, and scores an estimate against SweK's truth", hasSchema && roundTrips && confMatches && perfect === 0 && Math.abs(shifted - 0.5) < 1e-9,
       "control points and true-visibility confidence survive a JSON round-trip; a perfect estimate scores 0 and a 0.5 shift scores 0.5 -- their output.pt can be laid against this and graded.");
}

console.log(fails ? "\ntraceField-selfcheck: " + fails + " FAILED" : "\ntraceField-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
