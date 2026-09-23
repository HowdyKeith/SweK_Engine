#!/usr/bin/env node
// WebGLEngine/world/buildingTopple-selfcheck.mjs -- v4591 (beside world/buildingTopple.mjs, the reportDoors convention)
//
// Run: node world/buildingTopple-selfcheck.mjs
//
// BUILDINGS THAT FALL (task 80): world/buildingTopple.mjs. A building stands while its centre of mass is over what is left of its
// ground floor; at the topple the block above the ground floor is one dynamic box3d body on the remaining ground-floor voxels as
// static stubs over a slab at the road, gravity decides, and what falls shatters into rubble and debris through its final pose.
//
// Section 1, THE SUPPORT AND THE BLOCK, pure: a 4 x 10 x 4 building in a mini world with its ground floor bitten; the support
// rectangles, their hull, the block as the largest anchored component (a piece cut loose is not it), its extents and mass, the
// prediction. Section 2, THE FALL, headless on box3d: the far-quarter block lies flat past the face it fell toward, the middle-stub
// block stands, the block with no ground floor drops and shatters where it stands, two runs one hash. Section 3, THE SHATTER: rubble
// through the final pose beyond the fallen face and none where the block stood, a debris burst per three voxels, the body parked.
// Section 4, THROUGH crashDamage: seed 1's rammable building rammed at 25 m/s becomes a body on its stubs (its box parked, its
// footprint above the ground floor empty, no rubble yet); over every building with a lane the outcome after 6 s follows the
// prediction. Section 5, THE SCENE EXTRAS, pure. Section 6, THE PAGE: race-crash.html ramming on load, in its own browser.
//
// SABOTAGE LOG -- v4591 (each against world/buildingTopple.mjs, the gate run headless, the module restored):
//   A. no slab under the city (ensureGround a no-op)                     -> 8 red: the body count, the fall (through the world), the drop,
//      the shatter (0 rubble at age 171: it fell off the world), the rubble, the bursts, the stubs, the crash world's body count
//   B. no stubs (supportRects empty)                                     -> 11 red: every support row, the fall, the hash, the prediction, the shatter
//   C. the shatter ignores the body's rotation                            -> 3 red: 96 of 144 rubble (the rest landed out of the world's
//      height, unrotated), the rubble's place, the bursts
//   D. the building's static box never parked                             -> 7 red: the body count (the block pushed out of the box it
//      overlapped, and the FIRST DRAFT of this gate's bare world had that bug: the bare path did not park), the fall, the hash, the
//      middle stub (pushed off it), the drop, the shatter
//   E. the rest rule shatters a standing block too                          -> 2 red: the middle-stub block gone, the ram's body gone
//   F. the block is the SMALLEST anchored component                         -> FINDING: 0 red -- every case had ONE anchored tower, so the
//      smallest was the largest. The split-tower row (a column of air, two anchored towers, the block the larger) was added; now 1 red.
//   G. the support polygon is the stubs themselves, not their hull          -> 5 red: the corner-stubs row, the far-quarter and both
//      prediction rows, and the 34-building outcome row (the buildings standing on two stubs were predicted to fall)
// The first run of this gate against the module was 14 red: the bare-rect path never parked the building's static box (D above, a real
// bug: the block was pushed 4 m out of the box and dropped upright), the exact centre of mass is of the whole anchored component (the
// stub voxels pull it toward x 13.5), the greedy mesher makes a uniform block six quads (36 vertices, not 1056), a shattered record's
// last pose is read from the record and not from the emptied body list, and the page's bindScene took the crash scene's RESULT for the
// gpuDriven scene (a silent no-op in node's dry run, a thrown TypeError in the page that aborted rebuild()) -- it takes either now.
"use strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInEngineOrigin } from "../tools/ship/webgpuHarness.mjs";
import * as BT from "./buildingTopple.mjs";
import * as D from "./crashDamage.mjs";
import * as T from "./raceTrack.mjs";
import * as C from "../physics/raceCar.mjs";
import { CityGen } from "./CityGen.js";
import { VoxelDebrisSystem } from "./voxelDebrisSystem.js";
import { miniWorld } from "../render/voxelDevice.mjs";
import { editState } from "../render/voxelDeviceEdit.mjs";
import { initNode, mod } from "../physics/box3d/box3dNode.mjs";
import { bodyLitPipelineDesc } from "../render/voxelBodies.mjs";
import { worldFromModule } from "../render/slugTicker.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const report = (m) => console.log("  ----  " + m);
const sec = (t) => console.log("\n" + t);
const quiet = (fn) => { const log = console.log; console.log = (...a) => { if (!/^\[CityGen\]|^\[box3d\]/.test(String(a[0]))) log(...a); }; try { return fn(); } finally { console.log = log; } };
const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;
const G0 = D.CRASH.groundY, Y0 = G0 + 1;   // the first building layer
console.log("buildingTopple-selfcheck -- a building stands while its centre of mass is over what is left of its ground floor\n");
const st = await initNode(); if (!st.ready) { ok("box3d's wasm", false, st.reason); console.log("\nFAIL -- 1 check(s)"); process.exit(1); }
const worldFrom = () => worldFromModule(mod(), [0, -9.81, 0]);

/** A bare crash-like world: one 4 x 10 x 4 building of stone at (10, Y0, 10) with its ground floor bitten to `keep` (a predicate on x, z). */
function bareWorld(keep, { w = 4, d = 4, h = 10, x0 = 10, z0 = 10, extra = null } = {}) {
    const world = miniWorld(), rect = { x: x0, z: z0, w, d, h };
    for (let x = 0; x < w; x++) for (let z = 0; z < d; z++) for (let y = 0; y < h; y++) { if (y === 0 && !keep(x, z)) continue; world.setVoxel(x0 + x, Y0 + y, z0 + z, 1); }
    if (extra) extra(world, rect);
    const state = editState(world), phys = worldFrom();
    const g = { world, state, rects: [rect], city: null, colliders: [phys.addBox({ type: "static", pos: [x0 + w / 2, Y0 + h / 2, z0 + d / 2], half: [w / 2, h / 2, d / 2] })], phys, parked: new Set(), impacts: [] };
    return { g, rect, world, phys };
}
const quatUp = (q) => { const [x, y, z, w] = q; return [2 * (x * y - w * z), 1 - 2 * (x * x + z * z), 2 * (y * z + w * x)]; };

// ---------------------------------------------------------------------------------------------------------------------------------
sec("1. THE SUPPORT AND THE BLOCK: rectangles, their hull, the largest anchored component, the prediction");
{
    const { g, rect, world } = bareWorld((x) => x === 3);   // the far-quarter stub: ground floor only at x = 13
    const rects = BT.supportRects(world, rect);
    ok("the bitten ground floor's support is ONE rectangle, the far column, x 13..14 over the whole depth", rects.length === 1 && rects[0].x0 === 13 && rects[0].x1 === 14 && rects[0].z0 === 10 && rects[0].z1 === 14, JSON.stringify(rects));
    const mid = bareWorld((x) => x === 1 || x === 2), mr = BT.supportRects(mid.world, mid.rect);
    ok("...a middle bite's neighbour columns merge into one rectangle x 11..13", mr.length === 1 && mr[0].x0 === 11 && mr[0].x1 === 13, JSON.stringify(mr));
    const corners = bareWorld((x, z) => (x === 0 && z === 0) || (x === 3 && z === 3)), cr = BT.supportRects(corners.world, corners.rect), hull = BT.supportHull(cr);
    ok("!! two opposite corner stubs: two rectangles, a six-point hull, and the footprint's centre is OVER the support polygon (between them) though over neither stub", cr.length === 2 && hull.length === 6 && BT.overSupport(12, 12, cr) && !cr.some((r) => 12 >= r.x0 && 12 <= r.x1 && 12 >= r.z0 && 12 <= r.z1), JSON.stringify(hull));
    ok("!! the far-quarter stub: the centre (12, 12) is NOT over it; a point on the stub is", !BT.overSupport(12, 12, rects) && BT.overSupport(13.5, 12, rects));
    const block = BT.standingBlock(world, rect);
    ok("!! the block is the 4 x 9 x 4 above the ground floor: 144 voxels, one anchored component, extents from y 2 to 11, centre (12, 6.5, 12), half (2, 4.5, 2)", block.count === 144 && block.anchored === 1 && block.loose === 0 && block.others.length === 0 && near(block.centre[0], 12) && near(block.centre[1], 6.5) && near(block.centre[2], 12) && near(block.half[1], 4.5) && !block.dropped, `${block.count} voxels, centre ${block.centre}, half ${block.half}`);
    // the exact properties are of the whole anchored component, the four stub voxels (centres x 13.5, y 1.5) included: 148 voxels
    const ex = [(144 * 12 + 4 * 13.5) / 148, (144 * 6.5 + 4 * 1.5) / 148, 12];
    ok("!! its mass is the voxel count at TOPPLE.density, and fracture.js's exact properties are of the whole anchored component: 148 voxels with the centre of mass pulled toward the stub, exactly (144 x 12 + 4 x 13.5) / 148 in x", block.mass === 144 * BT.TOPPLE.density && block.exact && block.exact.voxels === 148 && near(block.exact.com[0], ex[0], 1e-9) && near(block.exact.com[1], ex[1], 1e-9) && near(block.exact.com[2], ex[2], 1e-9) && near(block.exact.mass, 148 * BT.TOPPLE.density, 1e-6), block.exact ? `exact com ${block.exact.com.map((v) => v.toFixed(4))} vs ${ex.map((v) => v.toFixed(4))}, ${block.exact.voxels} voxels` : "no exact");
    // a piece cut loose: a 2 x 2 x 2 cube floating beside the block inside the footprint? the footprint is the block; cut the top two rows off with a slab of air at y = 9
    const cut = bareWorld((x) => x === 3, { extra: (wd, r) => { for (let x = 0; x < 4; x++) for (let z = 0; z < 4; z++) wd.setVoxel(r.x + x, Y0 + 7, r.z + z, 0); } });
    const cb = BT.standingBlock(cut.world, cut.rect);
    ok("!! a layer of air at y 8 cuts the top two rows loose: the block is the 4 x 6 x 4 below (96 voxels), the 32 above are 'others' and not in it", cb.count === 96 && cb.others.length === 32 && cb.loose === 1 && cb.anchored === 1 && near(cb.half[1], 3), `${cb.count} + ${cb.others.length}`);
    // two towers, both anchored (sabotage F took the SMALLEST anchored component and went 0 red: every case above has one)
    const split = bareWorld(() => true, { extra: (wd, r) => { for (let z = 0; z < 4; z++) for (let y = 0; y < 10; y++) wd.setVoxel(r.x + 1, Y0 + y, r.z + z, 0); } }), sb = BT.standingBlock(split.world, split.rect);
    ok("!! a column of air splits the building into two anchored towers: the block is the LARGER (2 x 9 x 4 = 72 above its ground floor) and the smaller tower's 40 voxels are 'others'", sb.anchored === 2 && sb.count === 72 && sb.others.length === 40 && near(sb.centre[0], 13) && near(sb.half[0], 1), `${sb.count} + ${sb.others.length}, ${sb.anchored} anchored`);
    const gone = bareWorld(() => false), gb = BT.standingBlock(gone.world, gone.rect);
    ok("!! with NO ground floor left nothing is anchored: the largest piece is the block anyway and it is marked dropped", gb.count === 144 && gb.dropped && gb.anchored === 0 && gb.loose === 1);
    ok("the prediction for the block: not over the far-quarter stub", !BT.overSupport(block.centre[0], block.centre[2], rects) && BT.overSupport(block.centre[0], block.centre[2], mr));
}

// ---------------------------------------------------------------------------------------------------------------------------------
sec("2. THE FALL, HEADLESS ON BOX3D: the far-quarter block lies flat past the face it fell toward; the middle-stub block stands; the dropped block pancakes");
const settle = (keep, seconds = 5, opts = {}) => {
    const { g, rect, phys } = bareWorld(keep, opts), t = BT.createTopple(g, { debris: opts.debris || null }), rec = BT.beginTopple(t, null, null, rect);
    const afterTopple = { footprint: D.footprint(g.world, rect).solid, above: [10, 11, 12, 13].every((x) => !g.world.voxelAt(x, Y0 + 3, 12)), stub: g.world.voxelAt(13, Y0, 12) };
    const rows = []; let tick = 0, hash = 0;
    for (let s = 0; s < seconds * 60; s++) { phys.step(C.CAR.dt, 4); tick++; BT.stepTopple(t, tick); if (rec && s % 60 === 59) rows.push(`${((s + 1) / 60).toFixed(0)}s pos ${rec.pose.pos.map((v) => v.toFixed(2))} up.y ${rec.up ? rec.up[1].toFixed(3) : "-"} v ${rec.speed == null ? "-" : rec.speed.toFixed(3)}${t.bodies.includes(rec) ? "" : " (shattered)"}`); }
    hash = phys.stateHash(); const body = t.bodies[0] || null;
    return { g, rect, phys, t, rec, body, rows, hash, afterTopple, xf: phys.readTransforms() };
};
let farRun;
{
    farRun = settle((x) => x === 3);
    const { t, rec, body, rows, rect, phys } = farRun; report(rows.join(" | "));
    ok("!! the topple raised ONE body of 144 voxels on ONE stub over the slab: the physics world holds the parked box, the slab, the stub and the block", rec && rec.count === 144 && rec.stubs.length === 1 && t.ground !== null && phys.bodyCount() === 4 && t.g.parked.has(0), `${phys.bodyCount()} bodies`);
    ok("!! right after the topple the footprint above the ground floor is EMPTY in the world (the voxels are the body now) and the stub column still stands", farRun.afterTopple.footprint === 4 && farRun.afterTopple.above && farRun.afterTopple.stub === 1, JSON.stringify(farRun.afterTopple));
    ok("!! the block LIES FLAT within 5 s: up.y under 0.1, its centre past the -x face it fell toward (x < 10) at the height of its half width (y = 1 + 2 = 3, within 0.3), and it fell (not dropped)", rec.fallen && rec.up[1] < 0.1 && rec.pose.pos[0] < 10 && Math.abs(rec.pose.pos[1] - (Y0 + 2)) < 0.3 && !rec.dropped, `pos ${rec.pose.pos.map((v) => v.toFixed(2))} up.y ${rec.up[1].toFixed(3)}`);
    ok("...and it fell toward -x and not sideways: z within 0.5 of where it stood; at rest it shattered (the body is gone by 5 s)", Math.abs(rec.pose.pos[2] - 12) < 0.5 && t.shattered === 1 && body === null);
    const again = settle((x) => x === 3);
    ok("!! two fresh worlds, the same fall: one box3d state hash, the same shatter tick", again.hash === farRun.hash && again.t.events[1] && again.t.events[1].at === farRun.t.events[1].at, `${farRun.hash.toString(16)}, shattered at tick ${farRun.t.events[1] && farRun.t.events[1].at}`);
    const midRun = settle((x) => x === 1 || x === 2); report("middle stub: " + midRun.rows.join(" | "));
    ok("!! the block over a middle stub STANDS: after 5 s up.y is 1, its centre where it was, no fall, still a body (it stays one)", midRun.body && midRun.body.up[1] > 0.999 && near(midRun.body.pose.pos[0], 12, 0.05) && !midRun.body.fallen && midRun.t.bodies.length === 1 && midRun.t.shattered === 0, midRun.body ? `up.y ${midRun.body.up[1].toFixed(4)} pos ${midRun.body.pose.pos.map((v) => v.toFixed(2))}` : "no body");
    ok("...the prediction said so: over for the middle stub, not over for the far quarter", midRun.rec.over === true && farRun.rec.over === false);
    const dropRun = settle(() => false, 5); report("no ground floor: " + dropRun.rows.join(" | ") + " | events " + JSON.stringify(dropRun.t.events.map((e) => e.kind)));
    ok("!! with no ground floor the block DROPS onto the slab and, at rest, shatters where it stands: a drop event, no stubs, then a shatter with rubble in the footprint", dropRun.rec && dropRun.rec.dropped && dropRun.rec.stubs.length === 0 && dropRun.t.events[0].kind === "drop" && dropRun.t.shattered === 1 && dropRun.t.rubble > 100 && dropRun.t.g.world.voxelAt(11, Y0 + 2, 11) === BT.TOPPLE.rubbleId, `${dropRun.t.rubble} rubble`);
    const crumbs = (() => { const { g, rect } = bareWorld((x) => x === 1, { w: 2, d: 2, h: 2, x0: 30, z0: 30 }); const t = BT.createTopple(g, {}); const r = BT.beginTopple(t, null, null, rect); return { t, r, g }; })();
    ok("a 2 x 2 x 2 hut with 4 voxels above its ground floor is crumbs: no body, a crumbs event, rubble where it stood", crumbs.r === null && crumbs.t.crumbs === 1 && crumbs.t.events[0].kind === "crumbs" && crumbs.t.bodies.length === 0 && crumbs.g.world.voxelAt(30, Y0 + 1, 30) === BT.TOPPLE.rubbleId, JSON.stringify(crumbs.t.events[0]));
}

// ---------------------------------------------------------------------------------------------------------------------------------
sec("3. THE SHATTER: rubble through the final pose beyond the fallen face, none where the block stood, a burst per three voxels, the body parked");
{
    const debris = new VoxelDebrisSystem(), run = settle((x) => x === 3, 9, { debris });
    const { t, rect, phys, xf } = run, ev = t.events.find((e) => e.kind === "shatter");
    report(`events ${JSON.stringify(t.events.map((e) => e.kind))}; shatter ${JSON.stringify(ev)}; debris live ${debris.particles.length}`);
    ok("!! within 9 s the fallen block came to rest and SHATTERED: one shatter event, fell true, its rubble over 100 of 144 voxels", ev && ev.fell && ev.rubble > 100 && t.shattered === 1 && t.bodies.length === 0, ev ? `${ev.rubble} rubble at age ${ev.age}` : "no shatter");
    // the block tipped over the stub's -x edge (x 13) and slid: it lies from about x 2 to 11, so its base end reaches a little into the
    // footprint's first columns; none of it is over the stub column or higher than the block is wide (4), and it starts at the road (y 1)
    let beyond = 0, inside = 0, farSide = 0, high = 0, total = 0;
    for (let x = rect.x - 14; x < rect.x + rect.w + 2; x++) for (let z = rect.z - 2; z < rect.z + rect.d + 2; z++) for (let y = Y0; y < Y0 + 12; y++) { if (t.g.world.voxelAt(x, y, z) !== BT.TOPPLE.rubbleId) continue; total++; if (x < rect.x) beyond++; else if (x < rect.x + 2) inside++; else farSide++; if (y >= Y0 + 4) high++; }
    ok("!! the rubble is the whole block, lying BEYOND the -x face it fell toward (over 100 of 144 at x < 10, the rest in the first two columns where its base end came down), none over the stub column, none higher than the block is wide, from the road up", total === ev.rubble && beyond > 100 && inside <= 40 && farSide === 0 && high === 0 && t.g.world.voxelAt(6, Y0, 12) === BT.TOPPLE.rubbleId, `${beyond} beyond, ${inside} in the first columns, ${farSide} far side, ${high} high, ${total} in all`);
    ok("!! a debris burst per three voxels: the pool holds them (capped at 400) and their count is the event's", ev && ev.burst === Math.ceil(144 / BT.TOPPLE.debrisEvery) && debris.particles.length > 0, ev ? `${ev.burst} bursts` : "");
    const rec = run.rec, o = rec.body * 7;
    ok("...the body is parked under the world and the slot freed", xf[o + 1] < -400 && t.slots.every((s) => s === null));
    ok("the stubs stay: the ground floor's voxel and its static box are still there", t.g.world.voxelAt(13, Y0, 12) === 1 && phys.bodyCount() === 4);
}

// ---------------------------------------------------------------------------------------------------------------------------------
sec("4. THROUGH crashDamage: the 25 m/s ram raises a body on its stubs; over every building with a lane the outcome follows the prediction");
const SEED = 1, FROM = 8, track = T.generateTrack({ seed: SEED }), surface = C.trackSurface(track);
const make = () => quiet(() => { const g = D.crashWorld(track, CityGen); D.buildingColliders(g, worldFromModule(mod(), [0, -9.81, 0])); return g; });
const ring = (g, rect) => { let n = 0; for (let x = rect.x - 14; x < rect.x + rect.w + 14; x++) for (let z = rect.z - 14; z < rect.z + rect.d + 14; z++) { if (x >= rect.x && x < rect.x + rect.w && z >= rect.z && z < rect.z + rect.d) continue; for (let y = Y0; y < Y0 + 20; y++) if (g.world.voxelAt(x, y, z)) n++; } return n; };
const ramAndSettle = (i, { speed = 25, ramSteps = 90, after = 360, debris = null } = {}) => {
    const g = make(), t = BT.toppleWorld(g, { debris }), { car } = D.launch(g, i, { speed, from: FROM }), rect = g.rects[i], ringBefore = ring(g, rect);
    let tick = 0, h = 0x811c9dc5, atRam = null; const fold = (h, v) => { for (let k = 0; k < 4; k++) { h ^= (v >>> (k * 8)) & 0xff; h = Math.imul(h, 0x01000193); } return h; };
    for (let s = 0; s < ramSteps + after; s++) {
        quiet(() => D.crashStep(g, car, surface, s < ramSteps ? { throttle: 1, steer: 0, brake: 0 } : { throttle: 0, steer: 0, brake: 1 }, { debris }));
        tick++; BT.stepTopple(t, tick); h = fold(h, g.phys.stateHash());
        if (s === ramSteps - 1) atRam = { bodies: t.bodies.length, events: t.events.slice(), footprint: D.footprint(g.world, rect).solid, ring: ring(g, rect), parked: g.parked.has(i), state: g.city.buildingAt(rect.x + 0.5, rect.z + 0.5).state, physBodies: g.phys.bodyCount(), rec: t.bodies[0] ? { ...t.bodies[0] } : null };
    }
    return { g, t, car, rect, ringBefore, atRam, hash: (h >>> 0).toString(16), body: t.bodies[0] || null, pose: C.carPose(g.phys, car) };
};
let RAM = -1;
{
    const g0 = make(); RAM = D.rammable(g0.rects, FROM);
    const r = ramAndSettle(RAM), a = r.atRam, ev = a.events[0];
    report(`building ${RAM} ${JSON.stringify(r.rect)}: at the ram's end ${JSON.stringify(ev)}; state ${a.state}, footprint ${a.footprint}, ring ${r.ringBefore} -> ${a.ring}, ${a.physBodies} bodies`);
    ok("!! the ram collapses the building and the topple RAISES A BODY instead of stamping rubble: state toppled, one body, its static box parked, the footprint holding only the stubs, the ring around it UNCHANGED", a.state === "toppled" && a.bodies === 1 && a.parked && ev && (ev.kind === "topple" || ev.kind === "drop") && a.footprint === a.rec.stubRects.reduce((s, q) => s + (q.x1 - q.x0) * (q.z1 - q.z0), 0) && a.ring === r.ringBefore, `${a.bodies} bodies, footprint ${a.footprint}`);
    ok("...the physics world grew by the slab, the stubs and the block", a.physBodies === g0.rects.length + 1 + 1 + a.rec.stubs.length + 1, `${a.physBodies}`);
    const r2 = ramAndSettle(RAM);
    ok("!! two fresh worlds, one fingerprint through the ram, the topple and 6 s of settling", r2.hash === r.hash && r2.t.events.length === r.t.events.length, r.hash);
    ok("the car is still a car: a finite pose near the building", Number.isFinite(r.pose.pos[0]) && Math.abs(r.pose.pos[0] - r.rect.x) < 20);
    // every building with a lane: the outcome after 6 s against the prediction
    const rows = []; let agree = 0, total = 0, fell = 0, stood = 0, dropped = 0, crumbs = 0;
    for (let i = 0; i < g0.rects.length; i++) {
        if (!D.laneBefore(g0.rects, i, FROM)) continue;
        const q = ramAndSettle(i, { after: 360 }), e = q.t.events[0]; if (!e) continue;
        const b = q.body, moved = b ? Math.hypot(b.pose.pos[0] - b.centre[0], b.pose.pos[2] - b.centre[2]) : 0;
        let outcome, agrees;
        if (e.kind === "crumbs") { outcome = "crumbs"; agrees = true; crumbs++; }
        else if (e.kind === "drop") { outcome = q.t.shattered ? "dropped and shattered" : "dropped"; agrees = true; dropped++; }
        else if (e.over) { outcome = b && b.up[1] > 0.999 && moved < 0.05 ? "stands untouched" : "MOVED"; agrees = outcome === "stands untouched"; stood++; }
        else { outcome = q.t.shattered ? "fell and shattered" : b && b.fallen ? "fell" : b && (b.up[1] < 0.995 || moved > 0.2) ? "left its stubs, leans" : "STANDS"; agrees = outcome !== "STANDS"; fell++; }
        total++; if (agrees) agree++;
        rows.push(`${i}: ${e.kind} ${e.voxels}v support ${e.support == null ? "-" : e.support.toFixed(2)} over ${e.over} -> ${outcome}${agrees ? "" : " (!)"}`);
    }
    report(rows.join("; "));
    ok(`!! over the ${total} buildings with a lane the outcome after 6 s follows the prediction on every one: over the support polygon -> stands untouched; not over -> leaves its stubs (falls, or leans on the road); no ground floor -> drops`, total >= 20 && agree === total && stood >= 2 && fell >= 10 && dropped >= 5, `${agree} of ${total}: ${stood} predicted to stand, ${fell} to fall, ${dropped} to drop, ${crumbs} crumbs`);
}

// ---------------------------------------------------------------------------------------------------------------------------------
sec("5. THE SCENE EXTRAS, pure: a reserved fleet per slot, records parked until a block takes them, the block mesh in the body's unit space");
{
    const Gx = { LAYOUTS: { lit: "lit" } }, Lx = { litBind: () => ({}) };
    const { g, rect } = bareWorld((x) => x === 3), t = BT.createTopple(g, {}), ex = BT.sceneExtras(t, Gx, { litBind: Lx.litBind }, { cap: 3000 });
    const quatDesc = JSON.stringify(bodyLitPipelineDesc());
    ok("three fleets of 3000 reserved vertices in the bodies' quat-mode pipeline, three records", ex.count === 3 && ex.fleets.length === 3 && ex.fleets.every((f) => f.lods[0].mesh.positions.length === 9000 && f.layout === "lit" && JSON.stringify(f.pipeline) === quatDesc), `${ex.fleets.length} fleets`);
    const rec = new Float32Array(16 * 4), ext = new Float32Array(16 * 4); ex.fill(rec, ext, 8);
    ok("empty slots fill as parked records at y -500 with the identity quaternion", rec[8 * 4 + 1] === -500 && rec[10 * 4 + 1] === -500 && ext[8 * 4 + 3] === 1);
    let got = null; t.onBlock = (slot, mesh) => { got = { slot, mesh }; };
    const r = BT.beginTopple(t, null, null, rect); ex.fill(rec, ext, 8);
    ok("!! a block takes slot 0: its record is the body's centre with the block's bounding radius as the cull sphere (a float32), its quaternion the identity, and the mesh went to the scene", got && got.slot === 0 && near(rec[8 * 4], 12) && near(rec[8 * 4 + 1], 6.5) && near(rec[8 * 4 + 3], Math.fround(r.radius), 1e-6) && ext[8 * 4 + 3] === 1 && got.mesh.count > 0 && got.mesh.count <= 3000 && !got.mesh.truncated, got ? `${got.mesh.count} vertices, record ${Array.from(rec.slice(32, 36)).map((v) => v.toFixed(3))}` : "no mesh");
    const m = got.mesh; let maxAbs = 0; for (let i = 0; i < m.count; i++) for (let a = 0; a < 3; a++) maxAbs = Math.max(maxAbs, Math.abs(m.data[i * 10 + a]));
    ok("!! the mesh is the block in the body's unit space: every position within the unit sphere (over the radius), and the greedy mesher makes the 4 x 9 x 4 block of one stone SIX quads: 36 vertices", maxAbs <= 1 + 1e-6 && m.count === 36, `${m.count} vertices, max |p| ${maxAbs.toFixed(4)}`);
    // the corner vertices reach the bounding box: some |x| = 2 / R, |y| = 4.5 / R
    let maxY = 0, maxX = 0; for (let i = 0; i < m.count; i++) { maxX = Math.max(maxX, Math.abs(m.data[i * 10])); maxY = Math.max(maxY, Math.abs(m.data[i * 10 + 1])); }
    ok("...and its corners reach the block's own half extents over the radius (2 and 4.5 over 5.315)", near(maxX, 2 / r.radius, 1e-5) && near(maxY, 4.5 / r.radius, 1e-5), `${maxX.toFixed(4)} / ${maxY.toFixed(4)}`);
    ok("...colour and normal ride with each vertex: an alpha of 1 and a unit normal", m.data[6] === 1 && near(Math.hypot(m.data[7], m.data[8], m.data[9]), 1, 1e-5));
}

// ---------------------------------------------------------------------------------------------------------------------------------
sec("6. THE PAGE: race-crash.html in its own browser, ramming on load with the demolition charge, names a building that became a body");
{
    const rp = await runInEngineOrigin({ engineRoot: ENG, timeoutMs: 90000, script: `async () => {
        const f = document.createElement("iframe"); f.style.width = "900px"; f.style.height = "600px"; f.src = "/race-crash.html?webgl=1&ram=1&demolish=1"; document.body.appendChild(f);
        const pt = performance.now(); let d = null;
        while (performance.now() - pt < 60000) { await new Promise((r) => setTimeout(r, 250)); d = f.contentDocument; const el = d && d.getElementById("topple"); if (el && /became box3d bod/.test(el.textContent) && /[1-9]\\d* became/.test(el.textContent)) break; }
        const txt = (id) => { const el = d && d.getElementById(id); return el ? el.textContent : ""; };
        return { be: txt("be"), city: txt("city"), topple: txt("topple"), car: txt("car"), pageMs: performance.now() - pt };
    }` });
    if (!rp.ok) ok("the page loaded", false, rp.reason);
    else {
        const p = rp.result;
        report(`${p.be} | ${p.city.slice(0, 160)} | ${p.topple.slice(0, 260)} (${p.pageMs.toFixed(0)} ms)`);
        ok("*** ramming on load with ?demolish=1 (the Demolish button on the first impact), the page's HUD names a building that became a box3d body on what was left of its ground floor ***", /device: webgl2/.test(p.be) && /[1-9]\d* became box3d bod/.test(p.topple) && /[1-9]\d* toppled/.test(p.city) && /fingerprint [0-9a-f]{8}/.test(p.car), p.topple.slice(0, 160));
    }
}

console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nall checks pass");
console.log("unchecked here: the block's bounding box stands in for its exact centre of mass; a block leaning on the road or on a neighbour is left leaning; cascade damage to neighbours from the fall; the page on WebGPU (the presented device is lost on this harness, v4589).");
// v4661 -- process.exitCode, NOT process.exit: this gate compiles a wasm module, and exiting while V8's
// background compiler still has work posts a task into a torn-down platform. tools/ship/wasmTeardown.mjs.
process.exitCode = fails ? 1 : 0;
