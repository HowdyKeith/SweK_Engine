#!/usr/bin/env node
// WebGLEngine/tools/ship/raceTrack-selfcheck.mjs -- Racing city 1 (task 64)
//
// THE FLAT GRID TRACK: world/raceTrack.mjs behind race-track.html. Section 1, the grammar is MEASURED: the racing kit is loaded
// headless and each tile's asphalt (the dark [54, 54, 58] vertices) is counted at every edge, which must agree with PORTS (the
// straight leaves north and south, the corner west and south); rotDir is held to rotateQ on the same quaternion the shader gets, and
// tileFor answers every ordered pair of distinct ports with a tile whose turned ports are those two. Section 2, the generator: forty
// seeds all valid (a simple 4-connected cycle in bounds), forty distinct hashes, one seed the same cells twice, every accepted bump
// one hairpin, the lap starting on a straight that carries the finish, zero bumps the plain ring. Section 3, the placements: each
// tile's turned ports are its cell's two neighbour directions, AND the tile's unrotated port-edge midpoints rotated by the placement's
// quaternion land on the cell's edge midpoints in world space -- the quaternion handed to the shader is the one that makes the
// asphalt meet. Section 4, the derived data: the centreline closed with no step over a tile, its length within 3 % of straights x 10
// plus corners x a quarter circle of radius 5, every point on a track cell; the checkpoints met in index order walking the lap; the
// kerbs on track cells. Section 5, the city: every rect inside a free cell with its margin, none on the loop, none overlapping;
// trackWorld stamps the floor and the buildings through CityGen (a column at a building is tall, a column on the loop is the floor),
// the world's mesh hash the same twice. Section 6, ON BOTH BACKENDS: seed 1 from above -- every track cell's window asphalt-grey,
// every empty block green, every built block not all green, red at the finish gate, the backends agreeing.
//
// MEASURED AT THE ROUND: forty seeds valid and distinct; seed 1 is 44 tiles (16 straights, 28 corners, 8 hairpins from 8 of 21 bumps), a
// 379.3-unit lap against 379.9 ideal, 79 buildings on 100 free blocks stamped in 25 ms and meshed in 159 ms (62 chunks, 8,432 triangles,
// hash da4f958b); the browser builds the same hashes in 197 ms; on both backends all 184 centreline points are asphalt-grey, every empty
// block 100 % green, the built blocks at most 93 % green, the finish cell 36 to 38 % red, the backends 326 pixels apart of 160,000.
// THREE CORRECTIONS: the module's first invariant, "no two cells adjacent unless consecutive", refused twenty of twenty seeds -- a bump
// leaves its two cells side by side, which is a hairpin and not a crossing; this gate's first frame key sampled the cell centres, which
// on a corner tile (1,976 vertices against the straight's 188) land among Kenney's trackside props, so 13 to 15 loop cells read as
// not-asphalt on a track drawn right, and the road is sampled along the centreline instead; and with the floor laid under the loop the
// tiles' asphalt z-fought it (both at y = 1), 44 to 46 centreline points reading grass on both backends along the seams, so there is
// no floor under the loop.
//
// SABOTAGE (the round; world/raceTrack.mjs md5 3a86dbd5778acfe0dd7f1d73e396ee3d before and after all four):
//   A  the corner's ports typed W, N instead of W, S            -> 4 red: the measured reach disagrees by name, tileFor's k for W-S,
//                                                                    and 67 centreline points off the asphalt on both backends.
//   B  a bump inserting one cell instead of two                  -> 2 red: seed 1's cells 6,1 and 7,2 not adjacent (the cycle breaks), and
//                                                                    36 cells for 8 bumps.
//   C  the corner arc at radius 4                                -> 4 red: a step over a tile, the lap 6 % long, the checkpoints off the line,
//                                                                    64 kerb points off the loop -- and the frame stays green, because a
//                                                                    radius-4 arc is still on the asphalt: the geometry holds catch this one.
//   D  the placement quaternion at half the turn (k * PI / 4)   -> 3 red: the port-edge midpoints miss the cell's edges, and 80 centreline
//                                                                    points off the asphalt on both backends -- while the port-NAME check stays
//                                                                    green, which is why the geometric key exists beside it.
//   Each restored and the baseline re-run: 0 red.
//
// Run: node tools/ship/raceTrack-selfcheck.mjs      (~25 s: headless, then both backends in the browser)
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInEngineOrigin, webgpuSkipReason } from "./webgpuHarness.mjs";
import { decodePNG } from "./pngCoverage.mjs";
import * as K from "../../world/kenneyKit.mjs";
import * as T from "../../world/raceTrack.mjs";
import { rotateQ } from "../../render/voxelBodies.mjs";
import { miniWorld, meshWorld, columnTop } from "../../render/voxelDevice.mjs";
import { CityGen } from "../../world/CityGen.js";
import * as G from "../../render/gpuDriven.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const report = (s) => console.log(`  ----  ${s}`);
const sec = (s) => console.log("\n" + s);
const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;
const quiet = () => { const log = console.log; console.log = (...a) => { if (!/\[GLBParser\]|\[CityGen\]|\[facade\]/.test(String(a[0]))) log(...a); }; };
quiet();
const DIRNAMES = ["N", "E", "S", "W"];

// ---------------------------------------------------------------------------------------------------------------------------------
sec("1. the grammar is measured: which edges the asphalt leaves through, and the turn the shader applies");
const kit = await K.loadKit("racing", { readBytes: async (p) => fs.readFileSync(path.join(ENG, p)), readImage: async (p) => decodePNG(fs.readFileSync(path.join(ENG, p))) });
{
    const reach = (file) => { const m = kit.models.get(file), c = kit.colours.get(file), out = { N: 0, E: 0, S: 0, W: 0 }; for (let i = 0; i < m.verts; i++) { if (!(c[i * 4] < 0.3 && c[i * 4 + 1] < 0.3 && c[i * 4 + 2] < 0.3)) continue; const x = m.positions[i * 3], z = m.positions[i * 3 + 2]; if (z < -4.9) out.N++; if (z > 4.9) out.S++; if (x > 4.9) out.E++; if (x < -4.9) out.W++; } return out; };
    for (const file of [T.STRAIGHT, T.FINISH, T.CORNER]) {
        const r = reach(file), ports = T.PORTS[file], strong = DIRNAMES.filter((d) => r[d] >= 5), weak = DIRNAMES.filter((d) => r[d] > 0 && r[d] < 5);
        ok(`${file}: the asphalt reaches ${ports.join(" and ")} (5 or more dark vertices at those edges) and no other edge with more than the kerb's 2`, JSON.stringify(strong.sort()) === JSON.stringify(ports.slice().sort()) && weak.every((d) => r[d] <= 2), JSON.stringify(r));
    }
    ok("one quarter turn (yawQuat(PI / 2) through rotateQ) sends E to N, N to W, W to S, S to E -- derived, not typed", T.rotDir("E", 1) === "N" && T.rotDir("N", 1) === "W" && T.rotDir("W", 1) === "S" && T.rotDir("S", 1) === "E" && T.rotDir("E", 4) === "E");
    let answered = 0, wrong = [];
    for (const a of DIRNAMES) for (const b of DIRNAMES) { if (a === b) { if (T.tileFor(a, b) !== null) wrong.push(a + a); continue; } const t = T.tileFor(a, b); if (!t) { wrong.push(a + b + ": none"); continue; } const p = T.portsOf(t.file, t.k).slice().sort().join(""); if (p !== [a, b].sort().join("")) wrong.push(`${a}${b}: ${t.file} k${t.k} gives ${p}`); else answered++; }
    ok("tileFor answers all 12 ordered pairs of distinct ports with a tile whose turned ports are those two, and refuses a pair of one port", answered === 12 && wrong.length === 0, wrong.join("; ") || "12 of 12");
    ok("  opposite ports get a straight (the finish when asked), the rest a corner", T.tileFor("N", "S").file === T.STRAIGHT && T.tileFor("E", "W", { finish: true }).file === T.FINISH && T.tileFor("N", "E").file === T.CORNER && T.tileFor("W", "S").k === 0);
}

// ---------------------------------------------------------------------------------------------------------------------------------
sec("2. the generator: forty seeds, one simple cycle each, distinct, deterministic");
const track = T.generateTrack({ seed: 1 });
{
    const hashes = new Set(), bad = [];
    for (let s = 1; s <= 40; s++) { const t = T.generateTrack({ seed: s }), v = T.validateTrack(t); if (v.length) bad.push(`${s}: ${v[0]}`); hashes.add(T.trackHash(t)); if (T.hairpins(t).length !== t.bumpsAccepted) bad.push(`${s}: ${T.hairpins(t).length} hairpins for ${t.bumpsAccepted} bumps`); }
    ok("*** forty seeds give forty valid tracks (a simple 4-connected cycle in bounds) with forty distinct hashes ***", bad.length === 0 && hashes.size === 40, bad.slice(0, 3).join("; ") || `${hashes.size} hashes`);
    const again = T.generateTrack({ seed: 1 });
    ok("the same seed gives the same cells twice", JSON.stringify(again.cells) === JSON.stringify(track.cells) && T.trackHash(again) === T.trackHash(track), T.trackHash(track));
    report(T.describeTrack(track));
    ok("seed 1 took its 8 bumps and each is one hairpin (two cells side by side, the road turning back two cells over)", track.bumpsAccepted === 8 && T.hairpins(track).length === 8 && track.cells.length === 28 + 16, `${track.cells.length} cells, ${T.hairpins(track).length} hairpins`);
    const ports = T.cellPorts(track);
    ok("the lap starts on a straight (cell 0's ports opposite), so it can carry the finish gate", T.OPPOSITE[ports[0].from] === ports[0].to);
    const ring = T.generateTrack({ seed: 1, bumps: 0 });
    ok("zero bumps is the plain ring: 28 cells on a 12 x 12 grid (8 by 8, two in from every edge), four corners, no hairpin", ring.cells.length === 28 && T.cellPorts(ring).filter((p) => T.OPPOSITE[p.from] !== p.to).length === 4 && T.hairpins(ring).length === 0 && T.validateTrack(ring).length === 0);
    const v = T.validateTrack({ cols: 12, rows: 12, cells: [[2, 2], [3, 2], [3, 3], [2, 3], [2, 2], [5, 5], [5, 4], [4, 4], [3, 4]] });
    ok("validateTrack names a repeated cell and a non-adjacent step by name", v.some((m) => /repeats/.test(m)) && v.some((m) => /not adjacent/.test(m)), v.join("; "));
}

// ---------------------------------------------------------------------------------------------------------------------------------
sec("3. the placements: every tile turned so its measured asphalt meets its neighbours'");
const placements = T.tilePlacements(track);
{
    const ports = T.cellPorts(track), wrongPorts = [], wrongGeom = [];
    placements.forEach((p, i) => {
        const turned = T.portsOf(p.file, p.k).slice().sort().join(""), want = [ports[i].from, ports[i].to].sort().join("");
        if (turned !== want) wrongPorts.push(`${i}: ${p.file} k${p.k} ${turned} not ${want}`);
        // the geometric key: rotate the tile's UNROTATED port-edge midpoints by the placement's quaternion; they must land on the cell's edge midpoints
        for (const d of T.PORTS[p.file]) {
            const local = [T.DIRS[d][0] * T.TILE / 2, 0, T.DIRS[d][1] * T.TILE / 2], w = rotateQ(p.quat, local), wx = p.pos[0] + w[0], wz = p.pos[2] + w[2];
            const hits = [ports[i].from, ports[i].to].some((e) => { const m = T.edgeMid(track, p.cell, e); return near(m[0], wx, 1e-6) && near(m[1], wz, 1e-6); });
            if (!hits) wrongGeom.push(`${i}: port ${d} of ${p.file} k${p.k} lands at ${wx.toFixed(2)}, ${wz.toFixed(2)}`);
        }
    });
    ok("every placement's turned ports are its cell's two neighbour directions", wrongPorts.length === 0, wrongPorts.slice(0, 3).join("; ") || `${placements.length} tiles`);
    ok("*** every tile's port-edge midpoints, rotated by the QUATERNION THE SHADER GETS, land on its cell's edge midpoints ***", wrongGeom.length === 0, wrongGeom.slice(0, 3).join("; ") || `${placements.length * 2} ports land`);
    const corners = placements.filter((p) => p.file === T.CORNER).length, turns = ports.filter((p) => T.OPPOSITE[p.from] !== p.to).length;
    ok("the corner count is the number of direction changes, the rest straights, cell 0 the finish", corners === turns && placements.filter((p) => p.file === T.STRAIGHT).length === placements.length - corners - 1 && placements[0].file === T.FINISH, `${corners} corners, ${placements.length - corners} straights`);
    ok("every tile sits at ROAD_Y on its cell's centre", placements.every((p) => p.pos[1] === T.ROAD_Y && near(p.pos[0], T.cellCentre(track, p.cell[0], p.cell[1])[0]) && near(p.pos[2], T.cellCentre(track, p.cell[0], p.cell[1])[1])));
}

// ---------------------------------------------------------------------------------------------------------------------------------
sec("4. the centreline, the checkpoints and the kerbs, all from the same cells");
{
    const pts = T.centreline(track), n = pts.length; let maxStep = 0;
    for (let i = 0; i < n; i++) { const a = pts[i], b = pts[(i + 1) % n]; maxStep = Math.max(maxStep, Math.hypot(b[0] - a[0], b[1] - a[1])); }
    ok("the centreline is closed with no step longer than a tile", maxStep <= T.TILE + 1e-6, `${n} points, longest step ${maxStep.toFixed(2)}`);
    const ports = T.cellPorts(track), corners = ports.filter((p) => T.OPPOSITE[p.from] !== p.to).length, straights = track.cells.length - corners;
    const ideal = straights * T.TILE + corners * (Math.PI / 2) * T.CORNER_RADIUS, L = T.lapLength(pts);
    ok(`the lap length is within 3 % of ${straights} x 10 + ${corners} x a quarter circle of radius 5 = ${ideal.toFixed(1)}`, Math.abs(L - ideal) / ideal < 0.03, `${L.toFixed(1)} (chords of the arcs)`);
    ok("every centreline point lies on a track cell", pts.every((p) => { const c = T.cellAt(track, p[0], p[1]); return c && T.isTrackCell(track, c); }));
    const cps = T.checkpoints(track);
    const nearest = (p) => { let best = 0, bd = Infinity; for (let i = 0; i < n; i++) { const d = Math.hypot(pts[i][0] - p.x, pts[i][1] - p.z); if (d < bd) { bd = d; best = i; } } return { i: best, d: bd }; };
    const idx = cps.map(nearest);
    ok("*** the checkpoints are met in index order walking the lap: each one's nearest centreline point is later than the last's, and on it ***", idx.every((q, i) => i === 0 || q.i > idx[i - 1].i) && idx.every((q) => q.d < 1e-6) && cps.length === track.cells.length && cps[0].index === 0, `${cps.length} checkpoints; the finish at ${cps[0].x}, ${cps[0].z} heading ${cps[0].dir}`);
    const kb = T.kerbs(track);
    const offTrack = [...kb.left, ...kb.right].filter((p) => { const c = T.cellAt(track, p[0], p[1]); return !(c && T.isTrackCell(track, c)); }).length;
    ok(`the kerbs (${T.HALF_WIDTH} either side) stay on track cells`, offTrack === 0, `${offTrack} of ${kb.left.length * 2} kerb points off the loop`);
    ok("  ...and a kerb point is HALF_WIDTH from its centreline point", kb.left.every((p, i) => near(Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]), T.HALF_WIDTH, 1e-6)));
}

// ---------------------------------------------------------------------------------------------------------------------------------
sec("5. the city on the free blocks, stamped through CityGen into a one-voxel floor");
let packed = null, rects = null;
{
    rects = T.cityRects(track);
    const free = T.freeCells(track), inCell = rects.every((r) => { const [cx, cz] = T.cellCentre(track, r.cell[0], r.cell[1]); return r.x >= cx - 5 + 1 && r.z >= cz - 5 + 1 && r.x + r.w <= cx + 5 - 1 && r.z + r.d <= cz + 5 - 1; });
    const onLoop = rects.filter((r) => T.isTrackCell(track, r.cell)).length;
    let overlaps = 0; for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) { const a = rects[i], b = rects[j]; if (a.x < b.x + b.w && b.x < a.x + a.w && a.z < b.z + b.d && b.z < a.z + a.d) overlaps++; }
    ok(`${rects.length} buildings on ${free.length} free blocks: each inside its block with a one-voxel margin, none on the loop, none overlapping`, inCell && onLoop === 0 && overlaps === 0 && rects.length > free.length * 0.6 && rects.length < free.length, `${onLoop} on the loop, ${overlaps} overlaps`);
    ok("  footprints 3..7 a side, 4..12 tall", rects.every((r) => r.w >= 3 && r.w <= 7 && r.d >= 3 && r.d <= 7 && r.h >= 4 && r.h <= 12));
    const w = miniWorld(), t0 = performance.now(), built = T.trackWorld(track, w, CityGen), t1 = performance.now();
    packed = meshWorld(w);
    report(`world: ${built.city.buildings.length} buildings, ${w.chunks.size} chunks, ${packed.triangles} triangles, stamped in ${(t1 - t0).toFixed(0)} ms and meshed in ${(performance.now() - t1).toFixed(0)} ms, hash ${packed.hash}`);
    const r0 = rects[0], col = columnTop(w, r0.x + 1, r0.z + 1), c0 = T.cellCentre(track, track.cells[3][0], track.cells[3][1]), road = columnTop(w, Math.floor(c0[0]), Math.floor(c0[1]));
    const emptyFree = T.freeCells(track).find((c) => !rects.some((q) => q.cell[0] === c[0] && q.cell[1] === c[1])), ce = T.cellCentre(track, emptyFree[0], emptyFree[1]), grass = columnTop(w, Math.floor(ce[0]), Math.floor(ce[1]));
    ok("a column inside the first building is the building's height on the floor; a column on an empty block is the grass floor; a column on the loop is EMPTY (nothing under the road but the tile)", col && col.y === r0.h && grass && grass.y === 0 && grass.id === T.FLOOR_ID && road === null, `building top y ${col && col.y} (h ${r0.h}), grass ${JSON.stringify(grass)}, road column ${JSON.stringify(road)}`);
    ok("  the stamp is CityGen's: as many buildings as rects, each with hit points", built.city.buildings.length === rects.length && built.city.buildings.every((b) => b.hp > 0));
    const w2 = miniWorld(); T.trackWorld(track, w2, CityGen); const p2 = meshWorld(w2);
    ok("the world's mesh hashes the same twice", p2.hash === packed.hash, packed.hash);
    const w3 = miniWorld(); const none = T.trackWorld(track, w3, CityGen, { fill: 0 });
    ok("  fill 0 stamps the floor and no building", none.rects.length === 0 && none.city.buildings.length === 0 && columnTop(w3, Math.floor(ce[0]), Math.floor(ce[1])).y === 0);
}

// ---------------------------------------------------------------------------------------------------------------------------------
sec("6. ON BOTH BACKENDS: seed 1 from above -- asphalt on the loop, grass on the empty blocks, walls on the built ones, red at the finish");
{
    const skip = webgpuSkipReason();
    if (skip) { console.log(`  SKIP  ${skip}`); report("*** NOT A PASS. ***"); fails++; }
    else {
        const W = 400, H = 400, FOV = 0.9, eye = [0, 230, 0.5], target = [0, 0, 0];
        const r = await runInEngineOrigin({ engineRoot: ENG, args: { W, H, FOV, eye, target }, script: `async (a) => {
            const { requestDevice } = await import("/gfx/device.js");
            const G = await import("/render/gpuDriven.mjs");
            const L = await import("/render/litSphere.mjs");
            const K = await import("/world/kenneyKit.mjs");
            const T = await import("/world/raceTrack.mjs");
            const V = await import("/render/voxelDevice.mjs");
            const { CityGen } = await import("/world/CityGen.js");
            const { W, H, FOV, eye, target } = a; const out = {};
            const readBytes = async (p) => { const r = await fetch("/" + p); if (!r.ok) throw new Error(p + ": HTTP " + r.status); return r.arrayBuffer(); };
            const readImage = async (p) => { const r = await fetch("/" + p); if (!r.ok) throw new Error(p + ": HTTP " + r.status); const bmp = await createImageBitmap(await r.blob(), { colorSpaceConversion: "none", premultiplyAlpha: "none" }); const oc = new OffscreenCanvas(bmp.width, bmp.height), ctx = oc.getContext("2d"); ctx.drawImage(bmp, 0, 0); return K.imageToColormap(ctx.getImageData(0, 0, bmp.width, bmp.height)); };
            const kit = await K.loadKit("racing", { readBytes, readImage, baseUrlOf: (p) => new URL("/" + p, location.href).href });
            const t0 = performance.now(), track = T.generateTrack({ seed: 1 }), placements = T.tilePlacements(track), world = V.miniWorld(), built = T.trackWorld(track, world, CityGen), packed = V.meshWorld(world), buildMs = performance.now() - t0;
            const cam = { viewProj: G.multiply(G.perspective(FOV, W / H, 0.5, 800), G.lookAt(eye, target)), eye };
            for (const backend of ["webgpu", "webgl2"]) {
                const cv = document.createElement("canvas"); cv.width = W; cv.height = H;
                const dev = await requestDevice(cv, { backend, offscreen: backend === "webgpu" });
                const errs = []; if (dev.gpu && dev.gpu.addEventListener) dev.gpu.addEventListener("uncapturederror", (e) => errs.push(String(e.error && e.error.message).slice(0, 300)));
                const sc = K.kitScene(dev, kit, placements, G, L, { light: V.SUN, extraFleets: [{ name: "world", mesh: packed.mesh, pipeline: L.litPipelineDesc({ cull: "none" }), bind: L.litBind(V.SUN), records: Float32Array.from([0, 0, 0, 1]), extras: new Float32Array(4) }] });
                const f = await sc.frame({ ...cam, read: true, clear: [0, 0, 0, 1] }).pixels;
                out[backend] = { path: sc.path, errs, fleets: sc.kitFleets.length, pixels: Array.from(f.pixels) };
                sc.destroy(); dev.destroy();
            }
            return { ...out, hash: T.trackHash(track), worldHash: packed.hash, rects: built.rects, cells: track.cells, buildMs, failed: kit.failed };
        }` });
        ok("both backends built the track and its world in the browser and drew it", r.ok && r.result && r.result.webgpu && r.result.webgl2 && r.result.webgpu.errs.length === 0 && r.result.failed.length === 0, r.ok ? ((r.result.webgpu && r.result.webgpu.errs) || []).join(" | ").slice(0, 300) : (r.reason || r.error || (r.pageErrors || []).join(" | ")).slice(0, 400));
        if (r.ok && r.result.webgpu && r.result.webgl2) {
            const R = r.result, N = W * H;
            report(`the browser built seed 1 in ${R.buildMs.toFixed(0)} ms; ${R.webgpu.fleets} fleets on ${R.webgpu.path}, ${R.webgl2.fleets} on ${R.webgl2.path}`);
            ok("the browser's track hash and world hash equal node's", R.hash === T.trackHash(track) && R.worldHash === packed.hash, `${R.hash} / ${R.worldHash}`);
            const vp = G.multiply(G.perspective(FOV, W / H, 0.5, 800), G.lookAt(eye, target));
            const project = (p) => { const x = vp[0] * p[0] + vp[4] * p[1] + vp[8] * p[2] + vp[12], y = vp[1] * p[0] + vp[5] * p[1] + vp[9] * p[2] + vp[13], w = vp[3] * p[0] + vp[7] * p[1] + vp[11] * p[2] + vp[15]; return [Math.round((x / w * 0.5 + 0.5) * W), Math.round((1 - (y / w * 0.5 + 0.5)) * H)]; };
            const window_ = (px, cx, cy, half) => { const o = []; for (let y = cy - half; y <= cy + half; y++) for (let x = cx - half; x <= cx + half; x++) if (x >= 0 && y >= 0 && x < W && y < H) { const i = (y * W + x) * 4; o.push([px[i], px[i + 1], px[i + 2]]); } return o; };
            const isGrey = (c) => Math.abs(c[0] - c[1]) < 14 && Math.abs(c[1] - c[2]) < 18 && c[0] + c[1] + c[2] > 30, isGreen = (c) => c[1] > c[0] * 1.2 && c[1] > c[2] * 1.2, isRed = (c) => c[0] > c[1] * 1.6 && c[0] > c[2] * 1.6 && c[0] > 90;
            const apart = (A, B) => { let n = 0; for (let p = 0; p < N; p++) if (Math.abs(A[p * 4] - B[p * 4]) > 8 || Math.abs(A[p * 4 + 1] - B[p * 4 + 1]) > 8 || Math.abs(A[p * 4 + 2] - B[p * 4 + 2]) > 8) n++; return n; };
            const built = new Set(rects.map((q) => q.cell.join(","))), free = T.freeCells(track);
            for (const bk of ["webgpu", "webgl2"]) {
                const px = R[bk].pixels;
                const share = (cell, pred, half = 3) => { const [x, z] = T.cellCentre(track, cell[0], cell[1]), [cx, cy] = project([x, 1, z]), w = window_(px, cx, cy, half); return w.filter(pred).length / Math.max(1, w.length); };
                // *** THE ROAD IS SAMPLED ALONG THE CENTRELINE, NOT AT THE CELL CENTRES. *** A corner tile's centre lies among Kenney's trackside
                // props (tyre stacks, barriers: 1,976 vertices against the straight's 188), so the first draft's cell-centre windows read 13 to 15
                // loop cells as not-asphalt on a track that was drawn right; the centreline is the road by construction, and its points are
                // what the frame is held to -- which also ties the derived data to the drawn tiles, where a cell-centre window tied nothing.
                const line = T.centreline(track), onRoad = line.map((p) => { const [cx, cy] = project([p[0], 1, p[1]]), w = window_(px, cx, cy, 1); return w.filter(isGrey).length / Math.max(1, w.length); });
                const grass = free.filter((c) => !built.has(c.join(","))).map((c) => share(c, isGreen)), walls = free.filter((c) => built.has(c.join(","))).map((c) => share(c, isGreen, 4));
                const finish = share(track.cells[0], isRed, 6);
                report(`${bk}: centreline points at least ${(Math.min(...onRoad) * 100).toFixed(0)} % grey (${onRoad.filter((v) => v <= 0.6).length} of ${onRoad.length} under 60 %), empty blocks at least ${(Math.min(...grass) * 100).toFixed(0)} % green, built blocks at most ${(Math.max(...walls) * 100).toFixed(0)} % green, finish cell ${(finish * 100).toFixed(0)} % red`);
                ok(`*** ${bk}: the centreline lies on asphalt-grey pixels at every one of its ${line.length} points, and every empty block is grass-green ***`, onRoad.every((v) => v > 0.6) && grass.every((v) => v > 0.6), `${onRoad.filter((v) => v <= 0.6).length} centreline points and ${grass.filter((v) => v <= 0.6).length} blocks fail`);
                ok(`  ${bk}: every built block shows something that is not grass (a wall or a roof) and the finish cell carries red`, walls.every((v) => v < 0.95) && finish > 0.02, `${walls.filter((v) => v >= 0.95).length} built blocks read as all grass`);
            }
            ok("  the two backends agree within 8 of 255 on all but edge pixels (fewer than 3 %)", apart(R.webgpu.pixels, R.webgl2.pixels) < N * 0.03, `${apart(R.webgpu.pixels, R.webgl2.pixels)} apart`);
        }
        if (r && r.pageErrors && r.pageErrors.length) report("page errors: " + r.pageErrors.slice(0, 3).join(" | "));
    }
}

console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nall checks pass");
console.log("unchecked here: the kerb as a collider (round 2 raises it); that the finish gate's banner faces the direction of travel (it is a straight either way); the page's orbit (eyeballed); tracks on grids other than 12 x 12 (the generator takes cols and rows and the ring rule holds for any 6 x 6 or larger, unmeasured beyond the default).");
process.exit(fails ? 1 : 0);
