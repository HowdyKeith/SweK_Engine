// WebGLEngine/world/ribbonRoad.mjs -- v4529
//
// RACING CITY 6 -- RIBBON ROADS OVER THE GIT TERRAIN. Phase 1's track is Kenney's tiles on a flat floor (world/raceTrack.mjs,
// v4524) and its car drives an analytic ground at ROAD_Y (physics/raceCar.mjs). Phase 2 keeps the same seeded loop of cells,
// the same centreline, the same checkpoints and the same car, and puts them on the treemap terrain of v4149 / v4479 -- a
// repository's files as landmasses and peaks (world/repoHeightfield.js through render/bodyTerrain.mjs's repoTerrainOf, drawn
// by render/gpuTerrain.mjs) -- so a GitHub repo IS the landscape the brain drives. The tiles are gone here: the road is a
// SWEPT RIBBON along the draped centreline, and the ribbon is what the car drives.
//
//   fleetFiles(json)                       the repository listing the page and the gate share: the importers orrery-fleet.json
//                                          names, each with its bytes (render/bodyTerrain.mjs makes lines of bytes).
//   terrainOf(files, opts)                 the treemap ground over the track's grid: repoTerrainOf with this round's frame.
//   drapeSpine(track, terrain, road)       the centreline resampled by arc length (render/sweptSpine.js), lifted to the terrain,
//                                          smoothed, graded no steeper than road.maxGrade, BANKED on the curves by the design
//                                          speed, with a frame { P, T, R, N } at every sample. The road's frame is NOT a
//                                          rotation-minimising one, and the reason is measured in the gate: an RMF carries its
//                                          twist round the loop and does not close at the seam; a road's normal is up, then
//                                          tilted by the bank, at every sample independently, and closes by construction.
//   cutFill(terrain, spine, road)          every texel under the road and its shoulders rewritten to the road's plane (cut where
//                                          the ground was above it, fill where below), blended out over the shoulder.
//   ribbonMesh(spine, road)                the ribbon in packMeshes' lit layout: asphalt between the kerbs, the kerbs raised
//                                          KERB_HEIGHT and striped, per-vertex colours, normals the road's own.
//   ribbonSurface(spine, terrain, track)   the surface the car drives (physics/raceCar.mjs's contract: at(x, z) -> { y, kind,
//                                          grip, rolling }, along(x, z) -> { s, d }, centreline): the road's plane between the
//                                          kerbs, the kerb a step up, the terrain beyond -- so the same carForces climbs and
//                                          banks with no change to the car.
//   terrainScene(device, ...)              the terrain chunks, the ribbon and the car in one gpuDriven scene on either backend.
//
// Run: node tools/ship/ribbonRoad-selfcheck.mjs
// ---------------------------------------------------------------------------------------------------------------
"use strict";
import * as T from "./raceTrack.mjs";
import { CAR, KERB_HEIGHT, createCar, rideHeight } from "../physics/raceCar.mjs";
import { repoTerrainOf } from "../render/bodyTerrain.mjs";
import { heightAt, chunkRecords, terrainPipelineDesc, terrainParams, skirtedQuadMesh, LIGHT } from "../render/gpuTerrain.mjs";
import { resampleByArcLength, rotationMinimizingFrames } from "../render/sweptSpine.js";
import { litPipelineDesc, litBind } from "../render/litSphere.mjs";
import { bodyLitPipelineDesc } from "../render/voxelBodies.mjs";
import { SUN } from "../render/voxelDevice.mjs";
import { carMesh, CAR_COLOURS } from "./raceReplayBake.mjs";

/** The road's numbers. halfWidth and the kerb band are raceTrack's (4.5 and 0.5), so the flat track's kinds are the draped one's. */
export const ROAD = Object.freeze({
    halfWidth: T.HALF_WIDTH, kerb: T.TILE / 2 - T.HALF_WIDTH, kerbHeight: KERB_HEIGHT,
    slab: 0.25,             // the road's top sits this far above the ground it was cut to, so the terrain never pokes through it
    shoulder: 3,            // metres beyond the kerb over which the cut/fill blends back to the ground
    step: 1,                // metres between spine samples
    smooth: 10,             // the box filter's half-width in samples, three passes
    maxGrade: 0.12,         // rise over run; the spine is relaxed until no step exceeds it
    designSpeed: 12,        // m/s: the bank is the angle that holds this speed on the curve, atan(v^2 k / g)
    maxBank: 0.26,          // rad, 15 degrees
});
/**
 * The terrain's frame over the 12 x 12 grid of 10 m cells: 160 m square with a 20 m margin, 128 texels a side, a 10 m height scale
 * with the ground in the lower 8 m. The field is a byte per texel over 0..heightScale, and a road banked 15 degrees over 5 m
 * stands 1.35 m above its own centreline: a first draft let the ground use the whole range and the cut/fill saturated at 255
 * under every banked edge on the top plateau, 0.7 m under the ribbon. `headroom` keeps the top fifth for the banks and kerbs.
 */
export const TERRAIN = Object.freeze({ size: 128, extent: 160, originX: -80, originZ: -80, heightScale: 10, headroom: 0.2 });
export const COLOURS = Object.freeze({ asphalt: [0.17, 0.16, 0.15, 1], kerbA: [0.65, 0.65, 0.7, 1], kerbB: [0.95, 0.97, 1, 1] });
const G_ACCEL = 9.81;

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/** The repository as files: every importer orrery-fleet.json names, once, with its bytes -- the listing repoTerrainOf lands on. */
export function fleetFiles(json) {
    const seen = new Map();
    for (const rows of Object.values((json && json.bodies) || {})) for (const r of rows || []) if (r && typeof r.path === "string" && !seen.has(r.path)) seen.set(r.path, { path: r.path, bytes: Math.max(1, Number(r.bytes) || 1) });
    return [...seen.values()].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

/** The treemap ground over the grid. `heightAt(x, z)` is world metres: the shader's nearest texel times heightScale. */
export function terrainOf(files, opts = {}) {
    const o = { ...TERRAIN, ...opts };
    const { headroom, ...frame } = o, bt = repoTerrainOf({ name: "repo", files }, frame);
    for (let i = 0; i < bt.field.data.length; i += 4) bt.field.data[i] = Math.round(bt.field.data[i] * (1 - headroom));
    bt.headroom = headroom;
    bt.metresAt = (x, z) => heightAt(bt.field, bt.params, x, z) * bt.params.heightScale;
    bt.texelCentre = (tx, tz) => [o.originX + (tx + 0.5) * o.extent / o.size, o.originZ + (tz + 0.5) * o.extent / o.size];
    return bt;
}

/** A closed box filter over a ring of numbers: `passes` times, half-width `r`. */
function ringSmooth(y, r, passes) {
    const n = y.length; let cur = y.slice();
    for (let p = 0; p < passes; p++) { const out = new Array(n); for (let i = 0; i < n; i++) { let s = 0; for (let k = -r; k <= r; k++) s += cur[(i + k + n) % n]; out[i] = s / (2 * r + 1); } cur = out; }
    return cur;
}

/**
 * The centreline draped over the terrain: `count` samples a step apart round the closed loop, each with the road's frame.
 * Returns { frames: [{ P, T, R0, R, N, phi, kappa, s }], length, count, ... } -- R0 is the horizontal right, R the banked right, N the
 * road's up (perpendicular to T and R); phi the bank (positive raises the right edge), kappa the signed horizontal curvature.
 */
export function drapeSpine(track, terrain, road = ROAD) {
    const line = T.centreline(track), length = T.lapLength(line);
    const closed = [...line.map(([x, z]) => [x, 0, z]), [line[0][0], 0, line[0][1]]];
    const count = Math.max(16, Math.round(length / road.step));
    const rs = resampleByArcLength(closed, count + 1); rs.pop();   // the last sample is the first again
    const n = rs.length, ds = length / n;
    // the ground under the line, smoothed, then relaxed down until no step is steeper than the grade (a cut never a lift, so a
    // pass that only lowers converges; the smoothing already lifted the road over the dips it fills)
    const raw = rs.map((p) => terrain.metresAt(p[0], p[2]));
    let y = ringSmooth(raw, road.smooth, 3);
    const g = road.maxGrade * ds, top = terrain.params.heightScale * (1 - (terrain.headroom || 0));
    y = y.map((v) => Math.min(top, Math.max(0.2, v)));   // inside the field's range, with the headroom the banks need
    for (let it = 0; it < 8; it++) {
        for (let i = 0; i < n; i++) { const j = (i + 1) % n; if (y[j] > y[i] + g) y[j] = y[i] + g; }
        for (let i = n - 1; i >= 0; i--) { const j = (i + 1) % n; if (y[i] > y[j] + g) y[i] = y[j] + g; }
    }
    const P = rs.map((p, i) => [p[0], y[i], p[2]]);
    // horizontal tangents and signed curvature from the 2D line (the bank is a plan-view property); the curve's inside is where
    // the tangent turns toward
    const th = P.map((_, i) => { const a = P[(i - 1 + n) % n], b = P[(i + 1) % n]; const v = [b[0] - a[0], 0, b[2] - a[2]]; return norm(v); });
    let kappa = th.map((_, i) => { const a = th[(i - 1 + n) % n], b = th[(i + 1) % n]; const c = a[0] * b[2] - a[2] * b[0], d = dot(a, b); return Math.atan2(c, d) / (2 * ds); });
    kappa = ringSmooth(kappa, 3, 2);
    // the bank: the angle that holds the design speed on the curve, capped; positive raises the RIGHT edge, and the inside edge
    // must be the low one, so the sign follows which side the curve's centre lies on
    let phi = kappa.map((k, i) => {
        const inside = [th[(i + 1) % n][0] - th[(i - 1 + n) % n][0], 0, th[(i + 1) % n][2] - th[(i - 1 + n) % n][2]];   // toward the centre of curvature
        const R0 = norm(cross(th[i], [0, 1, 0]));
        const mag = Math.min(road.maxBank, Math.atan(Math.abs(k) * road.designSpeed * road.designSpeed / G_ACCEL));
        return Math.hypot(inside[0], inside[2]) < 1e-9 ? 0 : (dot(inside, R0) > 0 ? -mag : mag);   // inside on the right: the right edge goes down
    });
    // smoothed less than the curvature is (kappa's box is 3 wide, twice): a first draft smoothed the bank as widely as the
    // height, and through an S-bend the previous curve's opposite bank lingered nine samples into the next one -- an adverse
    // camber the gate named; a bank that changes faster than the curvature crosses zero where the curvature does
    phi = ringSmooth(phi, 2, 2);
    const frames = P.map((p, i) => {
        const a = P[(i - 1 + n) % n], b = P[(i + 1) % n];
        const Tt = norm(sub(b, a));                                   // the 3D tangent, so N carries the grade
        const R0 = norm(cross(Tt, [0, 1, 0]));                        // the horizontal right
        const N0 = norm(cross(R0, Tt));                               // up, perpendicular to the tangent
        const R = norm([R0[0] * Math.cos(phi[i]) + N0[0] * Math.sin(phi[i]), R0[1] * Math.cos(phi[i]) + N0[1] * Math.sin(phi[i]), R0[2] * Math.cos(phi[i]) + N0[2] * Math.sin(phi[i])]);
        const N = norm(cross(R, Tt));
        return { P: p, T: Tt, R0, R, N, phi: phi[i], kappa: kappa[i], s: i * ds };
    });
    const grades = frames.map((f, i) => { const q = frames[(i + 1) % n]; return (q.P[1] - f.P[1]) / Math.hypot(q.P[0] - f.P[0], q.P[2] - f.P[2]); });
    return { frames, length, count: n, ds, raw, grades, maxGrade: Math.max(...grades.map(Math.abs)), maxBank: Math.max(...phi.map(Math.abs)),
             relief: Math.max(...y) - Math.min(...y), rawRelief: Math.max(...raw) - Math.min(...raw), road, track };
}

/** The height of the road's plane at frame f, at world (x, z): the plane through P with normal N. The slab's top is `slab` above it. */
export function planeY(f, x, z) { return f.P[1] - (f.N[0] * (x - f.P[0]) + f.N[2] * (z - f.P[2])) / f.N[1]; }

/** A spatial index over the frames: nearest(x, z) -> { i, t, d, f } with the frame pair interpolated at t and the signed lateral d. */
export function spineIndex(spine, cell = 4) {
    const { frames } = spine, n = frames.length, grid = new Map();
    const key = (gx, gz) => gx + "," + gz;
    frames.forEach((f, i) => { const k = key(Math.floor(f.P[0] / cell), Math.floor(f.P[2] / cell)); (grid.get(k) || grid.set(k, []).get(k)).push(i); });
    const interp = (i, x, z) => {
        // the segment i -> i+1, or i-1 -> i, whichever the point projects into
        const a = frames[i], b = frames[(i + 1) % n], c = frames[(i - 1 + n) % n];
        let f0 = a, f1 = b, i0 = i;
        const vx = b.P[0] - a.P[0], vz = b.P[2] - a.P[2], L2 = vx * vx + vz * vz || 1;
        let t = ((x - a.P[0]) * vx + (z - a.P[2]) * vz) / L2;
        if (t < 0) { f0 = c; f1 = a; i0 = (i - 1 + n) % n; const wx = a.P[0] - c.P[0], wz = a.P[2] - c.P[2], W2 = wx * wx + wz * wz || 1; t = Math.max(0, Math.min(1, ((x - c.P[0]) * wx + (z - c.P[2]) * wz) / W2)); }
        else t = Math.min(1, t);
        const P = lerp3(f0.P, f1.P, t), N = norm(lerp3(f0.N, f1.N, t)), R0 = norm(lerp3(f0.R0, f1.R0, t)), R = norm(lerp3(f0.R, f1.R, t));
        const d = (x - P[0]) * R0[0] + (z - P[2]) * R0[2];
        return { i: i0, t, s: i0 + t, d, f: { P, N, R0, R, T: norm(lerp3(f0.T, f1.T, t)) } };
    };
    const ds = spine.ds;
    return {
        at: interp,
        /**
         * Every leg of the loop the point lies BESIDE within `reach`: a frame counts when the point projects inside its segment
         * (not ahead of or behind it -- on a straight the frames ten samples on are within reach too, and a first draft that
         * grouped legs by index distance either took them, and a grade's worth of plane with them, or missed a hairpin's second
         * leg, which is the one this exists for). Nearest first; two accepted frames within three samples are one leg.
         */
        legs(x, z, reach) {
            const cands = [];
            for (let i = 0; i < n; i++) { const f = frames[i], d2 = (f.P[0] - x) ** 2 + (f.P[2] - z) ** 2; if (d2 <= (reach + 2) * (reach + 2)) cands.push([d2, i]); }
            cands.sort((a, b) => a[0] - b[0]);
            const out = [];
            for (const [, i] of cands) {
                if (out.some((o) => Math.min(Math.abs(o.i - i), n - Math.abs(o.i - i)) <= 3)) continue;
                const q = interp(i, x, z), along = (x - q.f.P[0]) * q.f.T[0] + (z - q.f.P[2]) * q.f.T[2];
                if (Math.abs(q.d) <= reach && Math.abs(along) <= 0.75 * ds) out.push({ ...q, i, along });
            }
            return out;
        },
        /** The leg the point is beside with the smallest lateral distance, or the nearest frame when it is beside none. */
        beside(x, z, reach) { const L = this.legs(x, z, reach); if (!L.length) return this.nearest(x, z); let b = L[0]; for (const q of L) if (Math.abs(q.d) < Math.abs(b.d)) b = q; return b; },
        nearest(x, z) {
            const gx = Math.floor(x / cell), gz = Math.floor(z / cell); let best = Infinity, bi = -1;
            for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) { const list = grid.get(key(gx + dx, gz + dz)); if (!list) continue; for (const i of list) { const f = frames[i], d2 = (f.P[0] - x) ** 2 + (f.P[2] - z) ** 2; if (d2 < best) { best = d2; bi = i; } } }
            // the 3 x 3 block guarantees every frame within one cell of the point; a nearest found farther than that may not be
            // the nearest at all (a first draft took it, and a texel 5 m from the road read a frame across the loop), so past
            // one cell the whole ring is walked
            if (bi < 0 || best > cell * cell) for (let i = 0; i < n; i++) { const f = frames[i], d2 = (f.P[0] - x) ** 2 + (f.P[2] - z) ** 2; if (d2 < best) { best = d2; bi = i; } }
            return interp(bi, x, z);
        },
    };
}

/**
 * Cut and fill: every texel whose centre lies within halfWidth + kerb + shoulder of the spine is rewritten -- to the road's plane
 * under the road and the kerb, blended toward the old ground across the shoulder. Returns the volumes moved and the texel counts.
 */
export function cutFill(terrain, spine, road = ROAD) {
    const { field, params } = terrain, size = field.width, hs = params.heightScale, texel = params.extent / size, area = texel * texel;
    const { frames, ds } = spine, n = frames.length;
    // THE BAND: every texel whose centre lies BESIDE a frame's cross-line (within three quarters of a sample along it) and within
    // W of the spine, W one texel past the kerb's outer edge -- the shader reads the NEAREST texel, so a kerb vertex sits in a
    // texel whose centre can be 0.7 texel outside it. Two drafts before this one: the plane of the frame the centre was nearest
    // to (on a 5 m corner the outer kerb's texel is nearest a frame two samples on, whose plane is a grade and a bank away),
    // then the ribbon's own quads rasterised (on the INSIDE of a corner the cross-lines cross, the quads are bow-ties, and the
    // triangles leave pockets that older, lower frames fill). The cross-lines themselves overlap continuously; the frame whose
    // cross-line passes nearest the centre is the one whose plane the ground takes.
    // `near`: how far along a cross-line's own tangent a texel centre may sit and still be beside it. On the OUTSIDE of a 5 m
    // corner the cross-lines fan out to (1 + W / 5) samples apart at the band's edge, so three quarters of a sample left
    // texels under the outer kerb beside no frame at all, on the old ground.
    const W = road.halfWidth + road.kerb + texel, reach = W + road.shoulder, near = 0.5 * ds * (1 + W / T.CORNER_RADIUS) + 0.1;
    const foldMask = new Uint8Array(size * size), idx = spineIndex(spine);
    let cut = 0, fill = 0, touched = 0, under = 0, worstBefore = 0, folds = 0;
    for (let tz = 0; tz < size; tz++) for (let tx = 0; tx < size; tx++) {
        const k = tz * size + tx, [x, z] = terrain.texelCentre(tx, tz), yOld = field.data[k * 4] / 255 * hs;
        const beside = [];
        for (let i = 0; i < n; i++) {
            const f = frames[i], dx = x - f.P[0], dz = z - f.P[2]; if (dx * dx + dz * dz > (W + 2) * (W + 2)) continue;
            const along = dx * f.T[0] + dz * f.T[2], d = dx * f.R0[0] + dz * f.R0[2];
            if (Math.abs(along) <= near && Math.abs(d) <= W) beside.push({ i, along: Math.abs(along), y: planeY(f, x, z) });
        }
        let yNew;
        if (beside.length) {
            // A FOLD: cross-lines more than three samples apart share the texel -- a hairpin's other leg, or the inside of a 5 m
            // corner where a 6.25 m band folds across ten samples -- at heights a grade apart. The texel holds one height and takes
            // the LOWER: the lower road lies on the ground and the higher one's kerb stands on a wall, which is what a road does
            // there; a texel raised to the higher plane would bury the lower road.
            let fold = false; for (let a = 0; a < beside.length && !fold; a++) for (let b = a + 1; b < beside.length; b++) { const g = Math.abs(beside[a].i - beside[b].i); if (Math.min(g, n - g) > 3) { fold = true; break; } }
            if (fold) { yNew = Math.min(...beside.map((q) => q.y)); foldMask[k] = 1; folds++; }
            else { let best = beside[0]; for (const q of beside) if (q.along < best.along) best = q; yNew = best.y; }
            under++; worstBefore = Math.max(worstBefore, Math.abs(yNew - yOld));
        } else {
            const legs = idx.legs(x, z, reach); if (!legs.length) continue;
            const q = legs[0], w = Math.max(0, 1 - (Math.abs(q.d) - W) / road.shoulder);
            yNew = planeY(q.f, x, z) * w + yOld * (1 - w);
        }
        const byte = Math.max(0, Math.min(255, Math.round(yNew / hs * 255)));
        field.data[k * 4] = byte; touched++;
        const dy = byte / 255 * hs - yOld; if (dy < 0) cut -= dy * area; else fill += dy * area;
    }
    return { cut, fill, touched, under, worstBefore, folds, foldMask, texel, band: W, reach };
}

/** The texel index under world (x, z), for the fold mask. */
export function texelIndex(terrain, x, z) {
    const p = terrain.params, s = terrain.field.width, tx = Math.max(0, Math.min(s - 1, Math.floor((x - p.originX) / p.extent * s))), tz = Math.max(0, Math.min(s - 1, Math.floor((z - p.originZ) / p.extent * s)));
    return tz * s + tx;
}

/** The ribbon: six vertices a sample (kerb outer, kerb inner, edge on each side), the kerbs KERB_HEIGHT up and striped, closed. */
export function ribbonMesh(spine, road = ROAD, colours = COLOURS) {
    const { frames } = spine, n = frames.length, V = 6, offs = [-(road.halfWidth + road.kerb), -road.halfWidth, -road.halfWidth, road.halfWidth, road.halfWidth, road.halfWidth + road.kerb];
    const lift = [road.kerbHeight, road.kerbHeight, 0, 0, road.kerbHeight, road.kerbHeight].map((v) => v + road.slab);
    const positions = new Float32Array(n * V * 3), normals = new Float32Array(n * V * 3), colors = new Float32Array(n * V * 4), indices = new Uint32Array(n * (V - 1) * 6);
    frames.forEach((f, i) => {
        const stripe = ((i >> 2) & 1) ? colours.kerbA : colours.kerbB;
        for (let k = 0; k < V; k++) {
            const v = i * V + k, c = k === 2 || k === 3 ? colours.asphalt : stripe;
            positions.set([f.P[0] + f.R[0] * offs[k] + f.N[0] * lift[k], f.P[1] + f.R[1] * offs[k] + f.N[1] * lift[k], f.P[2] + f.R[2] * offs[k] + f.N[2] * lift[k]], v * 3);
            normals.set(f.N, v * 3); colors.set(c, v * 4);
        }
        const j = (i + 1) % n;
        for (let k = 0; k < V - 1; k++) { const a = i * V + k, b = i * V + k + 1, c = j * V + k, d = j * V + k + 1; indices.set([a, c, b, b, c, d], (i * (V - 1) + k) * 6); }
    });
    return { positions, normals, colors, indices, color: colours.asphalt, vertexCount: n * V, triangles: n * (V - 1) * 2 };
}

/** The surface the car drives on the draped track (physics/raceCar.mjs's contract). */
export function ribbonSurface(spine, terrain, { spec = CAR, road = ROAD } = {}) {
    const idx = spineIndex(spine), track = spine.track, centreline = spine.frames.map((f) => [f.P[0], f.P[2]]), reach = road.halfWidth + road.kerb + road.shoulder;
    return {
        track, centreline, kerbHeight: road.kerbHeight, spine, terrain,
        at(x, z) {
            const q = idx.beside(x, z, reach), ad = Math.abs(q.d);
            if (ad <= road.halfWidth) return { y: planeY(q.f, x, z) + road.slab, kind: "asphalt", grip: spec.grip.asphalt, rolling: spec.rolling.asphalt };
            if (ad <= road.halfWidth + road.kerb) return { y: planeY(q.f, x, z) + road.slab + road.kerbHeight, kind: "kerb", grip: spec.grip.kerb, rolling: spec.rolling.kerb };
            return { y: terrain.metresAt(x, z), kind: "grass", grip: spec.grip.grass, rolling: spec.rolling.grass };
        },
        along(x, z) { const q = idx.beside(x, z, reach); return { s: q.s, d: Math.abs(q.d) }; },
    };
}

/** The car placed on the road `ahead` metres past the finish line, facing along it, at rest height over the plane. */
export function placeCar(world, surface, { ahead = 5, spec = CAR } = {}) {
    const cp = T.checkpoints(surface.track)[0], q = surface.along(cp.x, cp.z), n = surface.spine.frames.length;
    const i = Math.round(q.s + ahead / surface.spine.ds) % n, f = surface.spine.frames[i];
    const yaw = Math.atan2(f.T[0], f.T[2]), y = surface.at(f.P[0], f.P[2]).y;
    return createCar(world, { x: f.P[0], z: f.P[2], yaw, spec, groundY: y });
}

/** The pose's height over the road's plane under it, less the ride height: 0 when the car sits on the road as it would at rest. */
export function clearance(surface, pose, spec = CAR) { return pose.pos[1] - surface.at(pose.pos[0], pose.pos[2]).y - rideHeight(spec); }

/** FNV-1a over the spine's heights and banks, quantised to millimetres: the drape's fingerprint, the same in node and the page. */
export function spineHash(spine) {
    let h = 0x811c9dc5; const fold = (v) => { const q = Math.round(v * 1000) | 0; for (let k = 0; k < 4; k++) { h ^= (q >>> (k * 8)) & 0xff; h = Math.imul(h, 0x01000193); } };
    for (const f of spine.frames) { fold(f.P[1]); fold(f.phi); }
    return (h >>> 0).toString(16).padStart(8, "0");
}

/**
 * The terrain's chunks, the ribbon and the car in one scene: three fleets under one cull. The terrain fleet draws gpuTerrain's
 * shaders over the field after the cut/fill; the ribbon rides the lit pipeline with its own normals and colours; the car is a
 * box in quat mode whose record is rewritten by setCar (a storage buffer on WebGPU, the cpu() path on WebGL2).
 */
export function terrainScene(device, G, terrain, spine, { side = 16, light = SUN, colour = CAR_COLOURS[0], road = ROAD } = {}) {
    const chunks = chunkRecords(terrain.params, side), nChunks = side * side, count = nChunks + 2, fleetOf = new Uint32Array(count);
    const rec = new Float32Array(count * 4), ext = new Float32Array(count * 4);
    rec.set(chunks, 0);
    rec.set([0, 0, 0, 1], nChunks * 4); fleetOf[nChunks] = 1;                     // the ribbon, at the origin, unit scale
    rec.set([0, 0, 0, 1], (nChunks + 1) * 4); ext.set([0, 0, 0, 1], (nChunks + 1) * 4); fleetOf[nChunks + 1] = 2;   // the car
    const buffer = device.backend === "webgpu" ? device.buffer({ data: rec, usage: "storage" }) : null;
    const fill = () => { if (buffer) buffer.write(rec); };
    const records = { count, cpu: () => rec, ...(buffer ? { buffer } : {}) }, headings = { cpu: () => { fill(); return ext; } };
    const tex = device.texture({ width: terrain.field.width, height: terrain.field.height, data: terrain.field.data, nearest: true });
    const params = terrainParams(terrain.params), lightU = new Float32Array(LIGHT), look = new Float32Array([0, 0, 0, 0]);
    const ribbon = ribbonMesh(spine, road);
    const fleets = [
        { name: "terrain", lods: [{ name: "coarse", mesh: skirtedQuadMesh(2) }, { name: "fine", mesh: skirtedQuadMesh(8) }], pipeline: terrainPipelineDesc(),
          bind: (pass) => { pass.uniform("terrain", params); pass.uniform("light", lightU); pass.uniform("look", look); pass.texture("heightTex", tex, 0); } },
        { name: "ribbon", lods: [{ name: "coarse", mesh: ribbon }, { name: "fine", mesh: ribbon }], layout: G.LAYOUTS.lit, pipeline: litPipelineDesc({ cull: "none" }), bind: litBind(light) },
        { name: "car", lods: [{ name: "coarse", mesh: carMesh(colour) }, { name: "fine", mesh: carMesh(colour) }], layout: G.LAYOUTS.lit, pipeline: bodyLitPipelineDesc(), bind: litBind(light) },
    ];
    const scene = G.makeGpuDrivenScene(device, { fleets, fleetOf, thresholds: [0.05], records, headings });
    const setCar = (pose) => { const o = (nChunks + 1) * 4; rec[o] = pose.pos[0]; rec[o + 1] = pose.pos[1]; rec[o + 2] = pose.pos[2]; rec[o + 3] = 1; ext.set(pose.quat, o); fill(); };
    return { scene, setCar, records: rec, extras: ext, count, chunks: nChunks, ribbon, tex };
}

/** What this round measured here, for the page and the roadmap; the gate re-measures every number. */
export const MEASURED_V4529 = Object.freeze({
    frame: "160 m square, 128 texels (1.25 m), 10 m of relief over the 12 x 12 grid of 10 m cells",
    road: "the ribbon replaces the tiles everywhere on this page; the flat tiles stay race-track.html's",
    notBuilt: "buildings on the terrain (CityGen stamps a flat floor); the brain (drivePolicy) on the draped track; a heightfield collider in box3d (the surface is analytic, as the flat one was)",
});

export function reportLines() {
    return [
        `ribbonRoad: the track's centreline draped over the treemap terrain (${TERRAIN.extent} m, ${TERRAIN.size} texels, ${TERRAIN.heightScale} m relief), graded to ${ROAD.maxGrade} and banked to ${(ROAD.maxBank * 180 / Math.PI).toFixed(0)} deg for ${ROAD.designSpeed} m/s`,
        `the terrain cut and filled to the road's plane under ${ROAD.halfWidth + ROAD.kerb} m either side, blended over ${ROAD.shoulder} m; the car drives the ribbon's plane through raceCar's own contract`,
    ];
}
