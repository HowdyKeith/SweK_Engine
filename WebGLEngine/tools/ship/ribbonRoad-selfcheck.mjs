#!/usr/bin/env node
// WebGLEngine/tools/ship/ribbonRoad-selfcheck.mjs -- v4529
//
// RIBBON ROADS OVER THE GIT TERRAIN: the grid track's centreline draped over the treemap terrain of this repository's own files,
// the road a swept ribbon that cuts and fills the ground to its width with banked curves, and the same car lapping it.
//
// Section 1, THE TERRAIN: orrery-fleet.json's importers as files, repoTerrainOf's field over the grid, the ground in the lower
// four fifths of the height scale (the top fifth is the banks' and kerbs' headroom), deterministic by bytes.
// Section 2, THE DRAPE: one sample a metre round the loop (render/sweptSpine.js's arc-length resample), closed within a step,
// every grade under the cap, every tangent turning under 15 degrees a sample including the seam, the frames orthonormal, the
// road climbing metres, the banks tilting the INSIDE edge down on every curve and level on every straight; and the measurement
// that says why a road's frame is not a rotation-minimising one: the RMF's twist at the seam, beside the road frame's closure.
// Section 3, THE CUT AND FILL: the field rewritten under the road and blended over the shoulder, nothing beyond it touched, the
// volumes reported; then EVERY RIBBON VERTEX held to the terrain's own height model (the shader's nearest texel) -- within a
// tolerance where the ribbon lies on the ground, and never BELOW it where the ribbon folds over itself (a hairpin's other leg,
// the inside of a 5 m corner), where the ground takes the lower road and the higher kerb stands on a wall.
// Section 4, THE CAR: physics/raceCar.mjs's car on box3d through ribbonSurface -- the same carForces, no change -- laps the draped
// track with the pursuit driver, climbs, keeps its wheels on the asphalt and the ground, sits on the road's plane at rest height,
// and the same run twice is one fingerprint; the flat track's lap beside it.
// Section 5, IN THE BROWSER ON BOTH BACKENDS: the page's wasm drapes the same files to node's spine hash and drives the car to
// node's fingerprint; the terrain, the ribbon and the car drawn through gpuDriven and read back on WebGPU and WebGL2 -- the
// asphalt dark under the projected spine, the car's red at its pose, the terrain lit, the two backends agreeing.
// Section 6, THE PAGE: race-terrain.html in its own browser, on WebGL2, laps and names its numbers.
//
// MEASURED AT THE ROUND (v4529, seed 1, this repository's 159 importers as the ground): the field 128^2 over 160 m, bytes 0..204
// (the ground 0..8 m of a 10 m scale); 379 samples over 379.3 m, the ground under the line spanning 3.02 m and the road 2.67 m,
// max grade 0.080 (cap 0.12), max bank 14.9 deg (cap 15), max turn 12.7 deg a sample; the RMF round the same loop twists 2.6 deg
// at the seam and tilts 17.4 deg off vertical at worst, the road's frames meet at the seam within 2.6 deg; 196 of 196 banked
// curve samples with the inside edge low, 0 adverse, 17 runoff samples banked on straight ground before or after a corner, 18
// samples of level straight eight clear of any curvature; cut 648 m^3, fill 3,037 m^3 under 2,996 texels (4,093 touched to the
// shoulder), 214 fold texels, the ground 2.36 m off the road at worst before the cut; 2,274 ribbon vertices: 1,403 on plain
// ground within 0.361 m of the terrain (bound 0.4), 871 over folds standing up to 2.47 m above it, none buried; the car in
// 120 s: 2 laps, the first in 52.8 s (the flat track 52.9), 100% of wheel samples on the asphalt, all four wheels grounded 95.0%
// of the time, climb 3.24 m, worst clearance 0.29 m, fingerprint 508a984e twice; the page's wasm to the same spine hash and
// fingerprint; six terrain chunks of sixteen a side plus the ribbon and the car drawn and read back in ~250 ms on WebGPU
// (compute+drawIndexedIndirect) and ~120 ms on WebGL2 (cpu-twin+drawIndexed), asphalt dark under 378 of 379 projected spine
// points on both, the car's red 33% at its pose, 100% of the frame drawn, the backends within 24 on over 95% of pixels.
// Three runs alone (see tools/ship/gateBudget.mjs): about 34 s each, the car's 3 x 120 s of box3d and two browsers.
//
// SABOTAGE (the round; each red beside the baseline's own checks):
//   A  drapeSpine reads a flat 4 m ground instead of the terrain          -> 2 red (the road climbs 0.00 m; the car's climb 0.59 against 0.00)
//   B  the bank's sign flipped (the inside edge HIGH)                      -> 2 red (the banks; and the car lifts its wheels: grounded 89.7%)
//   C  cutFill computes every texel and writes none                       -> 2 red (plain vertices off the ground; fold vertices buried)
//   D  a fold takes the HIGHER road                                        -> 1 red (vertices buried under the ground)
//   E  ribbonSurface's asphalt without the slab                            -> 1 red (the car's surface is not the slab's top)
//   F  terrainScene's ribbon fleet given the car's box instead of the road -> 2 red (asphalt dark under 0 of 379 spine points, both backends)
//   G  race-terrain.html says the ribbon "is drawn over the tiles"         -> 1 red (the page line)
//   Findings on the way, all in world/ribbonRoad.mjs's comments: four drafts of the cut before every plain vertex sat within
//   0.15 m of the ground (the nearest frame's plane; the ribbon's quads rasterised; the fold flag against the current owner; the
//   ground given the whole byte range), the bank smoothed as widely as the height, and the bank's runoff read as adverse camber
//   until the camber test went geometric on the raw tangents.
//
// Run: node tools/ship/ribbonRoad-selfcheck.mjs      (~34 s: 3 x 120 s of box3d, two browsers)
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInEngineOrigin, webgpuSkipReason } from "./webgpuHarness.mjs";
import * as R from "../../world/ribbonRoad.mjs";
import * as T from "../../world/raceTrack.mjs";
import * as C from "../../physics/raceCar.mjs";
import * as G from "../../render/gpuDriven.mjs";
import { overheadCamera, projectPoint, pixelHash } from "../../world/raceReplayBake.mjs";
import { rotationMinimizingFrames } from "../../render/sweptSpine.js";
import { initNode, mod } from "../../physics/box3d/box3dNode.mjs";
import { worldFromModule } from "../../render/slugTicker.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const report = (m) => console.log("  ----  " + m);
const sec = (t) => console.log("\n" + t);
const deg = (r) => r * 180 / Math.PI;
// TOL: a texel centre can be 0.88 m from a vertex in its texel, the road's slope over that is the grade plus the bank's tangent
// (0.12 + 0.27 at the caps), and a byte of the field is 0.04 m: 0.88 x 0.39 + 0.04 = 0.38. The measurement is beside it.
const SEED = 1, TOL = 0.4, DRIVE_S = 120;
const files = R.fleetFiles(JSON.parse(fs.readFileSync(path.join(ENG, "orrery-fleet.json"), "utf8")));
const track = T.generateTrack({ seed: SEED });

// ---------------------------------------------------------------------------------------------------------------------------------
sec("1. THE TERRAIN: this repository's importers as the ground, in the lower four fifths of the field");
let terrain = null, before = null;
{
    const t0 = performance.now(); terrain = R.terrainOf(files); const ms = performance.now() - t0;
    const red = []; for (let i = 0; i < terrain.field.data.length; i += 4) red.push(terrain.field.data[i]);
    const top = Math.max(...red), bottom = Math.min(...red);
    before = Uint8Array.from(red);
    report(`${files.length} files from orrery-fleet.json, ${terrain.leaves.length} treemap leaves, ${terrain.repo.lakes.length} lakes; field ${terrain.field.width}^2 over ${terrain.params.extent} m, bytes ${bottom}..${top} of 255 (${(bottom / 255 * terrain.params.heightScale).toFixed(2)}..${(top / 255 * terrain.params.heightScale).toFixed(2)} m) in ${ms.toFixed(0)} ms`);
    ok("*** a repository is the landscape: more than a hundred files, every one a leaf of the treemap ***", files.length > 100 && terrain.leaves.length === files.length, `${files.length} files, ${terrain.leaves.length} leaves`);
    ok("  the ground keeps the top fifth of the field free for the banks and kerbs, and uses the rest", top <= Math.round(255 * (1 - R.TERRAIN.headroom)) && top >= Math.round(255 * (1 - R.TERRAIN.headroom)) - 1 && bottom === 0, `${bottom}..${top}`);
    ok("  the field is a function of the bytes: the same files again are the same field, one byte changed is not", (() => { const a = R.terrainOf(files); const b = R.terrainOf(files.map((f, i) => (i === 0 ? { ...f, bytes: f.bytes * 50 } : f))); return Buffer.compare(Buffer.from(a.field.data), Buffer.from(terrain.field.data)) === 0 && Buffer.compare(Buffer.from(b.field.data), Buffer.from(terrain.field.data)) !== 0; })());
    ok("  metresAt is the shader's model: the nearest texel times the height scale", (() => { const [x, z] = terrain.texelCentre(40, 70); return Math.abs(terrain.metresAt(x + 0.3, z - 0.3) - terrain.field.data[(70 * terrain.field.width + 40) * 4] / 255 * terrain.params.heightScale) < 1e-9; })());
}

// ---------------------------------------------------------------------------------------------------------------------------------
sec("2. THE DRAPE: the centreline on the ground, graded, banked, closed");
let spine = null;
{
    const t0 = performance.now(); spine = R.drapeSpine(track, terrain); const ms = performance.now() - t0;
    const { frames, count } = spine, n = count;
    const turns = frames.map((f, i) => { const g = frames[(i + 1) % n]; return Math.acos(Math.max(-1, Math.min(1, f.T[0] * g.T[0] + f.T[1] * g.T[1] + f.T[2] * g.T[2]))); });
    const seamStep = Math.hypot(...[0, 1, 2].map((k) => frames[n - 1].P[k] - frames[0].P[k]));
    report(`${n} samples over ${spine.length.toFixed(1)} m (ds ${spine.ds.toFixed(3)}); the ground under the line spans ${spine.rawRelief.toFixed(2)} m, the road ${spine.relief.toFixed(2)} m; max grade ${spine.maxGrade.toFixed(3)}, max bank ${deg(spine.maxBank).toFixed(1)} deg, max turn ${deg(Math.max(...turns)).toFixed(1)} deg a sample; ${ms.toFixed(0)} ms`);
    ok("*** the loop is closed: the last sample is one step from the first, and the seam's turn is a sample's ***", seamStep < spine.ds * 1.5 && seamStep > spine.ds * 0.5 && turns[n - 1] < 15 * Math.PI / 180, `${seamStep.toFixed(3)} m, ${deg(turns[n - 1]).toFixed(1)} deg`);
    ok("  one sample a metre, resampled by arc length: every step within 5% of ds", frames.every((f, i) => { const g = frames[(i + 1) % n]; const d = Math.hypot(g.P[0] - f.P[0], g.P[2] - f.P[2]); return Math.abs(d - spine.ds) < spine.ds * 0.05 + 1e-6; }));
    ok("  the road climbs: metres of relief along the loop, from a ground that spans more", spine.relief > 2 && spine.rawRelief >= spine.relief - 1e-9, `${spine.relief.toFixed(2)} of ${spine.rawRelief.toFixed(2)} m`);
    ok("  no grade over the cap", spine.maxGrade <= R.ROAD.maxGrade + 1e-6, spine.maxGrade.toFixed(3));
    ok("  continuous tangents: no sample turns more than 15 degrees (a 5 m corner at 1 m steps is 11.5)", turns.every((t) => t < 15 * Math.PI / 180), `max ${deg(Math.max(...turns)).toFixed(1)} deg`);
    ok("  every frame orthonormal and right-handed, N up", frames.every((f) => { const d = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; const l = (a) => Math.hypot(a[0], a[1], a[2]); return Math.abs(d(f.T, f.R)) < 1e-6 && Math.abs(d(f.T, f.N)) < 1e-6 && Math.abs(d(f.R, f.N)) < 1e-6 && Math.abs(l(f.T) - 1) < 1e-6 && Math.abs(l(f.R) - 1) < 1e-6 && Math.abs(l(f.N) - 1) < 1e-6 && f.N[1] > 0.9; }));
    // the bank: on a curve the inside edge is the low one, on a straight the edges are level
    // the inside from the RAW tangents either side of the sample (the geometry the car meets), not the smoothed curvature: a
    // sample with no raw turn has no inside, and the bank there is the runoff into the corner, not a camber
    const rawTurnOf = (f) => { const i = frames.indexOf(f), a = frames[(i - 1 + n) % n].T, b = frames[(i + 1) % n].T; return Math.hypot(b[0] - a[0], b[2] - a[2]); };
    const insideLowOf = (f) => { const i = frames.indexOf(f), a = frames[(i - 1 + n) % n].T, b = frames[(i + 1) % n].T, inside = [b[0] - a[0], 0, b[2] - a[2]]; const side = inside[0] * f.R0[0] + inside[2] * f.R0[2]; const rightEdge = f.P[1] + f.R[1] * R.ROAD.halfWidth, leftEdge = f.P[1] - f.R[1] * R.ROAD.halfWidth; return side > 0 ? rightEdge < leftEdge : leftEdge < rightEdge; };
    // a straight is level where it is a straight: eight samples clear of any curvature, past the bank's runoff into the corner
    const curved = frames.filter((f) => Math.abs(f.kappa) > 0.08 && Math.abs(f.phi) > 0.5 * Math.PI / 180 && rawTurnOf(f) > 0.05), straight = frames.filter((f, i) => { for (let k = -8; k <= 8; k++) if (Math.abs(frames[(i + k + n) % n].kappa) >= 1e-4) return false; return true; });
    const insideLow = curved.filter(insideLowOf);
    const runoff = frames.filter((f) => rawTurnOf(f) < 1e-6 && Math.abs(f.phi) > 0.5 * Math.PI / 180).length;
    const adverse = frames.filter((f) => rawTurnOf(f) > 0.01 && Math.abs(f.phi) > 0.5 * Math.PI / 180).filter((f) => !insideLowOf(f)).length;
    ok("*** the banks: on every curve the INSIDE edge is the low one -- no adverse camber anywhere the road both turns and is banked -- and every straight is level ***", curved.length > 50 && insideLow.length === curved.length && adverse === 0 && straight.length > 10 && straight.every((f) => Math.abs(f.phi) < 0.02), `${insideLow.length} of ${curved.length} curved samples, ${adverse} adverse, ${runoff} runoff samples banked before or after a turn, ${straight.length} straight`);
    ok("  the bank is the design speed's: under the cap everywhere, and over 5 degrees on the tightest curves", spine.maxBank <= R.ROAD.maxBank + 1e-9 && spine.maxBank > 5 * Math.PI / 180, `${deg(spine.maxBank).toFixed(1)} deg`);
    // why not a rotation-minimising frame: measured, not asserted
    const rmf = rotationMinimizingFrames([...frames.map((f) => f.P), frames[0].P], frames[0].N);
    const dotN = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    const rmfSeam = deg(Math.acos(Math.max(-1, Math.min(1, dotN(rmf[rmf.length - 1].N, rmf[0].N)))));
    const roadSeam = deg(Math.acos(Math.max(-1, Math.min(1, dotN(frames[n - 1].N, frames[0].N)))));
    const rmfTilt = Math.max(...rmf.map((f) => deg(Math.acos(Math.max(-1, Math.min(1, f.N[1]))))));
    report(`render/sweptSpine.js's rotation-minimising frames round the same loop: ${rmfSeam.toFixed(1)} deg of twist at the seam, the normal ${rmfTilt.toFixed(1)} deg off vertical at worst; the road's frames meet at the seam within ${roadSeam.toFixed(2)} deg`);
    ok("  the road's frame closes at the seam by construction (a sample's bank change), which is the property a loop needs", roadSeam < 3, `${roadSeam.toFixed(2)} deg`);
    ok("  the same track and terrain drape to the same hash; another seed's track to another", R.spineHash(R.drapeSpine(track, terrain)) === R.spineHash(spine) && R.spineHash(R.drapeSpine(T.generateTrack({ seed: 2 }), terrain)) !== R.spineHash(spine), R.spineHash(spine));
}

// ---------------------------------------------------------------------------------------------------------------------------------
sec("3. THE CUT AND FILL: the ground rewritten under the road, and every ribbon vertex held to it");
let cf = null, mesh = null;
{
    const t0 = performance.now(); cf = R.cutFill(terrain, spine); const ms = performance.now() - t0;
    mesh = R.ribbonMesh(spine);
    const size = terrain.field.width, after = []; for (let i = 0; i < terrain.field.data.length; i += 4) after.push(terrain.field.data[i]);
    let changed = 0, changedFar = 0, farTexels = 0;
    const idx = R.spineIndex(spine);
    for (let k = 0; k < size * size; k++) { const moved = after[k] !== before[k]; if (moved) changed++; const [x, z] = terrain.texelCentre(k % size, Math.floor(k / size)); const q = idx.nearest(x, z); const far = Math.hypot(q.f.P[0] - x, q.f.P[2] - z) > cf.reach + 2; if (far) { farTexels++; if (moved) changedFar++; } }
    report(`${cf.under} texels under the band (${cf.band.toFixed(2)} m either side), ${cf.touched} touched to the shoulder, ${cf.folds} folds; cut ${cf.cut.toFixed(0)} m^3, fill ${cf.fill.toFixed(0)} m^3, the ground was ${cf.worstBefore.toFixed(2)} m off the road at worst; ${changed} texels changed; ${ms.toFixed(0)} ms`);
    ok("*** the cut and fill moves ground: hundreds of cubic metres each way, under thousands of texels ***", cf.cut > 100 && cf.fill > 100 && cf.under > 1000 && cf.worstBefore > 0.5, `cut ${cf.cut.toFixed(0)}, fill ${cf.fill.toFixed(0)}, worst ${cf.worstBefore.toFixed(2)} m`);
    ok("  nothing beyond the shoulder is touched", farTexels > 5000 && changedFar === 0, `${changedFar} of ${farTexels} far texels changed`);
    // every vertex against the terrain the shader will draw
    let worst = 0, plain = 0, foldV = 0, worstFold = 0, buried = 0, worstBuried = 0;
    for (let v = 0; v < mesh.vertexCount; v++) {
        const k = v % 6, x = mesh.positions[v * 3], y = mesh.positions[v * 3 + 1], z = mesh.positions[v * 3 + 2], lift = (k === 2 || k === 3) ? 0 : R.ROAD.kerbHeight;
        const gap = y - lift - R.ROAD.slab - terrain.metresAt(x, z), fold = cf.foldMask[R.texelIndex(terrain, x, z)];
        if (fold) { foldV++; worstFold = Math.max(worstFold, gap); if (gap < -TOL) { buried++; worstBuried = Math.min(worstBuried, gap); } }
        else { plain++; worst = Math.max(worst, Math.abs(gap)); }
    }
    report(`${mesh.vertexCount} ribbon vertices (${mesh.triangles} triangles), the slab ${R.ROAD.slab} m over the cut ground: ${plain} on plain ground within ${worst.toFixed(3)} m of it, ${foldV} over folds standing up to ${worstFold.toFixed(2)} m above it`);
    ok(`*** every ribbon vertex on plain ground is within ${TOL} m of the terrain after the cut and fill (the bound is the road's slope over a texel: 0.88 m x (0.12 grade + 0.27 bank) + a byte, 0.38; measured ${worst.toFixed(3)}) ***`, plain > mesh.vertexCount / 2 && worst <= TOL, `${plain} vertices, worst ${worst.toFixed(3)} m`);
    ok("*** and no vertex is BURIED: over a fold the ground takes the lower road, so the higher kerb stands on a wall and never under the ground ***", buried === 0 && foldV > 0 && cf.folds > 0, `${foldV} fold vertices, ${buried} buried, worst ${worstBuried.toFixed(2)} m`);
    ok("  the kerbs stand KERB_HEIGHT over the slab, the slab over the plane, and the car's surface is the slab's top", (() => { const f = spine.frames[10]; const road = mesh.positions[(10 * 6 + 2) * 3 + 1], kerb = mesh.positions[(10 * 6 + 1) * 3 + 1], x = mesh.positions[(10 * 6 + 2) * 3], z = mesh.positions[(10 * 6 + 2) * 3 + 2]; const s = R.ribbonSurface(spine, terrain); return Math.abs(kerb - road - R.ROAD.kerbHeight * f.N[1]) < 1e-5 && Math.abs(R.planeY(f, x, z) + R.ROAD.slab / f.N[1] - road) < 1e-5 && Math.abs(s.at(f.P[0], f.P[2]).y - (f.P[1] + R.ROAD.slab)) < 1e-9; })());
    ok("  the ribbon is closed: the last sample's quads index the first sample's vertices", mesh.indices.some((i) => i < 6) && mesh.indices.some((i) => i >= (spine.count - 1) * 6) && Math.max(...mesh.indices) === mesh.vertexCount - 1);
}

// ---------------------------------------------------------------------------------------------------------------------------------
sec("4. THE CAR: the same car, the same forces, on the draped road");
const st = await initNode(); if (!st.ready) { ok("box3d's wasm", false, st.reason); }
let fingerprint = null, startPose = null;
if (st.ready) {
    const worldFrom = () => worldFromModule(mod(), [0, -9.81, 0]);
    const run = (seconds, onPose = null) => {
        const world = worldFrom(), surface = R.ribbonSurface(spine, terrain), car = R.placeCar(world, surface), tracker = C.lapTracker(surface), drv = C.pursuitDriver(surface, { vMax: 12 });
        let minY = Infinity, maxY = -Infinity, worstClear = 0, grounded = 0, samples = 0;
        const r = C.drive(world, car, surface, (pose) => { minY = Math.min(minY, pose.pos[1]); maxY = Math.max(maxY, pose.pos[1]); worstClear = Math.max(worstClear, Math.abs(R.clearance(surface, pose))); if (car.last) { samples++; if (car.last.wheels.every((w) => w.grounded)) grounded++; } if (onPose) onPose(pose); return drv(pose); }, { seconds, tracker });
        return { ...r, climb: maxY - minY, worstClear, groundedShare: grounded / Math.max(1, samples), surface };
    };
    const t0 = performance.now(); const a = run(DRIVE_S); const ms = performance.now() - t0; const b = run(DRIVE_S);
    const tot = Object.values(a.kinds).reduce((s, v) => s + v, 0), asphalt = a.kinds.asphalt / tot;
    // the flat track beside it
    const flat = worldFrom(), fsurf = C.trackSurface(track), cp = T.checkpoints(track)[0], fcar = C.createCar(flat, { x: cp.x + 5, z: cp.z, yaw: Math.PI / 2 }), ftr = C.lapTracker(fsurf);
    const f = C.drive(flat, fcar, fsurf, C.pursuitDriver(fsurf, { vMax: 12 }), { seconds: DRIVE_S, tracker: ftr });
    report(`${DRIVE_S} s at vMax 12: ${a.laps} laps, first in ${a.lapTime ? a.lapTime.toFixed(1) : "-"} s, ${(asphalt * 100).toFixed(1)}% of wheel samples on the asphalt, climb ${a.climb.toFixed(2)} m, wheels all grounded ${(a.groundedShare * 100).toFixed(1)}% of the time, worst clearance ${a.worstClear.toFixed(2)} m, fingerprint ${a.fingerprint}; the flat track: ${f.laps} laps, first in ${f.lapTime ? f.lapTime.toFixed(1) : "-"} s; ${ms.toFixed(0)} ms`);
    ok("*** the car laps the draped track, every checkpoint in order ***", a.laps >= 1 && a.hit >= T.checkpoints(track).length, `${a.laps} laps, ${a.hit} checkpoints`);
    ok("  and climbs: its chassis rises and falls by the road's relief", a.climb > 2 && a.climb < spine.relief + 2, `${a.climb.toFixed(2)} m against the road's ${spine.relief.toFixed(2)}`);
    ok("  on the asphalt: at least 95% of wheel samples", asphalt >= 0.95, `${(asphalt * 100).toFixed(1)}%`);
    ok("  on the ground: all four wheels grounded at least 90% of the time (a crest lifts them; measured)", a.groundedShare >= 0.9, `${(a.groundedShare * 100).toFixed(1)}%`);
    ok("  on the road's plane: the chassis never more than half a metre from its rest height over the plane under it", a.worstClear < 0.5, `${a.worstClear.toFixed(2)} m`);
    ok("  the same run twice is one fingerprint", a.fingerprint === b.fingerprint && a.laps === b.laps, a.fingerprint);
    ok("  the flat track laps too, in its own time (the ribbon is the same loop, on a different ground)", f.laps >= 1 && a.lapTime !== null && f.lapTime !== null, `draped ${a.lapTime && a.lapTime.toFixed(2)} s, flat ${f.lapTime && f.lapTime.toFixed(2)} s`);
    // the kinds by lateral distance: asphalt on the spine, the kerb at 4.7 m, and grass at 6.5 m on a straight with open ground
    // beside it (adjacent cells' roads touch kerb to kerb, and 9 m off a corner is beside the loop's next leg -- measured)
    const kinds = (() => { const s = a.surface; let open = null, grassOk = false; for (const fr of spine.frames) { if (Math.abs(fr.kappa) > 1e-4) continue; for (const side of [1, -1]) { const x = fr.P[0] + fr.R0[0] * 6.5 * side, z = fr.P[2] + fr.R0[2] * 6.5 * side, g = s.at(x, z); if (g.kind === "grass") { open = fr; grassOk = Math.abs(g.y - terrain.metresAt(x, z)) < 1e-9; break; } } if (open) break; }
        const fr = spine.frames[20], at = (d) => s.at(fr.P[0] + fr.R0[0] * d, fr.P[2] + fr.R0[2] * d); return { asphalt: at(0).kind === "asphalt", kerb: at(4.7).kind === "kerb", open: !!open, grassOk }; })();
    ok("  the surface answers what the flat one answers: asphalt on the spine, kerb at 4.7 m, grass at 6.5 m beside an open straight, at the terrain's height", kinds.asphalt && kinds.kerb && kinds.open && kinds.grassOk, JSON.stringify(kinds));
    // the short run the browser repeats
    const s5 = run(5); fingerprint = s5.fingerprint; startPose = s5.pose;
}

// ---------------------------------------------------------------------------------------------------------------------------------
sec("5. IN THE BROWSER ON BOTH BACKENDS: draped and driven in the page's wasm, drawn and read back");
const W = 256, H = 256;
let browser = null;
{
    const skip = webgpuSkipReason();
    if (skip) { console.log(`  SKIP  ${skip}`); report("*** NOT A PASS. ***"); fails++; }
    else {
        const r = await runInEngineOrigin({ engineRoot: ENG, timeoutMs: 120000, args: { W, H, seed: SEED }, script: `async (a) => {
            const step = (w) => { globalThis.__swekStep = w; console.log("[swek-step] " + w); };
            const { requestDevice } = await import("/gfx/device.js"); const G = await import("/render/gpuDriven.mjs"); const R = await import("/world/ribbonRoad.mjs");
            const T = await import("/world/raceTrack.mjs"); const C = await import("/physics/raceCar.mjs"); const B = await import("/world/raceReplayBake.mjs");
            const { box3d } = await import("/physics/box3d/box3dLoader.js"); const { worldFromModule } = await import("/render/slugTicker.mjs");
            const within = (ms, what, p) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(what + " did not resolve in " + ms + " ms")), ms))]);
            const b64 = (u8) => { let s = ""; for (let i = 0; i < u8.length; i += 8192) s += String.fromCharCode.apply(null, u8.subarray(i, i + 8192)); return btoa(s); };
            step("fetch"); const json = await (await fetch("/orrery-fleet.json")).json(); const files = R.fleetFiles(json);
            step("drape"); const t0 = performance.now(); const track = T.generateTrack({ seed: a.seed }), terrain = R.terrainOf(files), spine = R.drapeSpine(track, terrain), cf = R.cutFill(terrain, spine);
            const out = { files: files.length, hash: R.spineHash(spine), folds: cf.folds, bakeMs: performance.now() - t0, backends: {} };
            step("box3d.init"); const st = await box3d.init(); if (!st.ready) return { error: "box3d: " + st.reason };
            step("drive"); const world = worldFromModule(box3d._mod, [0, -9.81, 0]), surface = R.ribbonSurface(spine, terrain), car = R.placeCar(world, surface), drv = C.pursuitDriver(surface, { vMax: 12 });
            const d = C.drive(world, car, surface, drv, { seconds: 5 }); out.fingerprint = d.fingerprint; out.pose = { pos: d.pose.pos, quat: d.pose.quat };
            for (const bk of ["webgpu", "webgl2"]) {
                const cvs = document.createElement("canvas"); cvs.width = a.W; cvs.height = a.H; document.body.appendChild(cvs);
                let dev; step(bk + " requestDevice"); try { dev = await within(20000, bk + " requestDevice", requestDevice(cvs, { backend: bk, offscreen: bk === "webgpu" })); } catch (e) { out.backends[bk] = { error: e.message }; continue; }
                if (dev.backend !== bk) { out.backends[bk] = { error: "got " + dev.backend }; continue; }
                step(bk + " scene"); const sc = R.terrainScene(dev, G, terrain, spine); sc.setCar(d.pose);
                const cam = B.overheadCamera(G, a.W, a.H, { height: 150 });
                step(bk + " frame"); const t1 = performance.now();
                let raw; try { raw = await within(30000, bk + " frame", sc.scene.frame({ viewProj: cam.viewProj, eye: cam.eye, read: true, clear: [0.03, 0.05, 0.08, 1] }).pixels); } catch (e) { out.backends[bk] = { error: e.message }; continue; }
                const px = raw.pixels;
                out.backends[bk] = { path: sc.scene.path, renderMs: performance.now() - t1, png: b64(px), len: px.length, chunks: sc.chunks, count: sc.count };
                if (bk === "webgpu") { try { dev.destroy(); } catch (e) {} }
            }
            step("done");
            return out;
        }` });
        if (!r.ok || !r.result || r.result.error) ok("the browser draped, drove and drew", false, (r.result && r.result.error) || r.reason || (r.pageErrors || []).join(" | "));
        else {
            browser = r.result;
            report(`the page's wasm: ${browser.files} files, spine ${browser.hash} with ${browser.folds} folds in ${browser.bakeMs.toFixed(0)} ms; 5 s of driving to ${browser.fingerprint}`);
            ok("*** the page drapes the same files to node's spine hash and drives the car to node's fingerprint ***", browser.hash === R.spineHash(spine) && browser.fingerprint === fingerprint && browser.folds === cf.folds, `${browser.hash} / ${browser.fingerprint}`);
            const cam = overheadCamera(G, W, H, { height: 150 }), decode = (s) => Uint8Array.from(Buffer.from(s, "base64"));
            const red = (c) => c[0] > c[1] * 1.8 && c[0] > c[2] * 1.8 && c[0] > 90, dark = (c) => c[0] < 70 && c[1] < 70 && c[2] < 70;
            for (const bk of ["webgpu", "webgl2"]) {
                const row = browser.backends[bk];
                if (!row || row.error) { ok(`${bk}: rendered`, false, row && row.error); continue; }
                row.pixels = decode(row.png);
                const at = (p) => { const [x, y] = projectPoint(cam, p); if (x < 0 || y < 0 || x >= W || y >= H) return null; const o = (y * W + x) * 4; return [row.pixels[o], row.pixels[o + 1], row.pixels[o + 2]]; };
                const spineC = spine.frames.map((f) => at(f.P)).filter(Boolean), roadDark = spineC.filter(dark).length;
                let clear = 0, n = W * H; for (let i = 0; i < n; i++) { const o = i * 4; if (row.pixels[o] < 12 && row.pixels[o + 1] < 18 && row.pixels[o + 2] < 26) clear++; }
                const [cx, cy] = projectPoint(cam, browser.pose.pos); let carRed = 0, carT = 0; for (let y = cy - 3; y <= cy + 3; y++) for (let x = cx - 3; x <= cx + 3; x++) { if (x < 0 || y < 0 || x >= W || y >= H) continue; carT++; const o = (y * W + x) * 4; if (red([row.pixels[o], row.pixels[o + 1], row.pixels[o + 2]])) carRed++; }
                report(`${bk} (${row.path}): ${row.chunks} terrain chunks + ribbon + car in ${row.count} records, ${row.len} bytes read back in ${row.renderMs.toFixed(0)} ms; asphalt dark under ${roadDark} of ${spineC.length} spine points; ${(100 - clear / n * 100).toFixed(1)}% of the frame drawn; the car's red ${(carRed / Math.max(1, carT) * 100).toFixed(0)}% at its pose`);
                ok(`${bk}: *** the asphalt reads dark under the projected spine ***`, row.len === W * H * 4 && spineC.length > 200 && roadDark > spineC.length * 0.7, `${roadDark} of ${spineC.length}`);
                ok(`${bk}: the terrain fills the frame (the 160 m ground from 150 m up)`, clear < n * 0.1, `${(clear / n * 100).toFixed(1)}% clear`);
                ok(`${bk}: the car's red at its pose after 5 s of the page's own driving`, carRed > carT * 0.15, `${carRed} of ${carT}`);
                ok(`${bk}: the picture is not flat: the pixel hash of the frame`, pixelHash(row.pixels) !== pixelHash(new Uint8Array(W * H * 4)), pixelHash(row.pixels));
            }
            if (browser.backends.webgpu.pixels && browser.backends.webgl2.pixels) {
                let agree = 0; const A = browser.backends.webgpu.pixels, Bp = browser.backends.webgl2.pixels;
                for (let i = 0; i < W * H; i++) if (Math.abs(A[i * 4] - Bp[i * 4]) <= 24 && Math.abs(A[i * 4 + 1] - Bp[i * 4 + 1]) <= 24 && Math.abs(A[i * 4 + 2] - Bp[i * 4 + 2]) <= 24) agree++;
                ok("the two backends draw the same frame (95% of pixels within 24)", agree > W * H * 0.95, `${agree} of ${W * H}`);
            }
        }
        // the page, in its own browser (v4528's finding: a page loaded after the devices froze the renderer)
        const rp = await runInEngineOrigin({ engineRoot: ENG, timeoutMs: 60000, script: `async () => {
            const f = document.createElement("iframe"); f.style.width = "900px"; f.style.height = "600px"; f.src = "/race-terrain.html?webgl=1"; document.body.appendChild(f);
            const pt = performance.now(); let d = null;
            while (performance.now() - pt < 30000) { await new Promise((r) => setTimeout(r, 250)); d = f.contentDocument; const el = d && d.getElementById("car"); if (el && /steps/.test(el.textContent) && /fingerprint [0-9a-f]{8}/.test(el.textContent) && +(/(\\\\d+) steps/.exec(el.textContent) || [0, 0])[1] > 120) break; }
            const txt = (id) => { const el = d && d.getElementById(id); return el ? el.textContent : ""; };
            return { be: txt("be"), tick: txt("tick"), road: txt("road"), car: txt("car"), pageMs: performance.now() - pt };
        }` });
        sec("6. THE PAGE: race-terrain.html in its own browser");
        if (!rp.ok) ok("the page loaded", false, rp.reason);
        else {
            const p = rp.result;
            report(`${p.be} | ${p.tick.slice(0, 120)} | ${p.road.slice(0, 160)} | ${p.car.slice(0, 120)} (${p.pageMs.toFixed(0)} ms)`);
            ok("*** the page names its ground, its road and its car: files, relief, grade, bank, folds, the car stepping with a fingerprint ***", /device: webgl2/.test(p.be) && /files/.test(p.tick) && /relief/.test(p.tick) && /grade/.test(p.road) && /bank/.test(p.road) && /fold/.test(p.road) && /steps/.test(p.car) && /fingerprint [0-9a-f]{8}/.test(p.car) && +(/(\d+) steps/.exec(p.car) || [0, 0])[1] > 120, p.car.slice(0, 100));
            ok("  and says the ribbon replaces the tiles here, the flat tiles being race-track.html's", /replaces the tiles/.test(p.road) && /race-track\.html/.test(p.road));
        }
    }
}

console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nall checks pass");
console.log("unchecked here: the brain (drivePolicy) on the draped track (the pursuit driver laps it; the trained policy's features are the flat track's); buildings on the terrain (CityGen stamps a flat floor; the terrain page has none); a box3d heightfield collider (the surface is analytic, as the flat one was); the terrain's other looks (biome, language) under the road.");
process.exit(fails ? 1 : 0);
