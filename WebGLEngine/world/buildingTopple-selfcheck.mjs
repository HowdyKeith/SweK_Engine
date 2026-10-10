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
// prediction. Section 5, THE SCENE EXTRAS, pure (5b the chip, 5c the body made again from what a chip leaves). Section 6, THE PAGE: race-crash.html ramming on load, in its own browser.
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
//   H. v4822, bindKit rewriting only a block with no mesh yet (a scene built AGAIN keeps the old buffers' empty copy)  -> 2 red: the bind rows
//      here (the block already in the air is not written), and raceTurret-selfcheck.mjs's "a scene built AGAIN with the block in the air still draws it" on both backends.
//   K. v4822, bindScene writing only a block with no mesh yet (the crash scene's binder, as H did to bindKit's)  -> 1 red: its second-bind row.
//   L. v4822 (the chip), shellOnBlock leaving the hit point unrotated into the block's frame    -> 4 red: the lying block's voxel, its hit points, the mesh row (a wrong
//      voxel came off), the lockstep fold row.
//   M. the chip not making the mesh again                                                         -> 1 red: the mesh row (one mesh, at birth).
//   N. the pieces a chip cuts loose staying on the block                                           -> 1 red: the 21-voxel bar (0 loose, 20 left, 6 cubes).
//   O. breakFraction 0 (a block shot down never comes apart)                                       -> 2 red: the early-shatter row and the empty-slot row after it.
//   P. localSig a constant                                                                         -> 1 red: the lockstep fold row (the signature did not move).
//   I. v4822, leanUp zeroed (a block that came to rest leaning never settles)    -> 1 red: the lean-to row ("never shattered").
//   J. v4822, leanUp 1.01 (even a block standing at 1.0000 counts as leaning)    -> 3 red: the middle-stub block "STANDS" (both rows) and the ram's body
//      (the 25 m/s ram's block settles and is gone, where it was meant to be a body on its stubs).
// The first run of this gate against the module was 14 red: the bare-rect path never parked the building's static box (D above, a real
// bug: the block was pushed 4 m out of the box and dropped upright), the exact centre of mass is of the whole anchored component (the
// stub voxels pull it toward x 13.5), the greedy mesher makes a uniform block six quads (36 vertices, not 1056), a shattered record's
// last pose is read from the record and not from the emptied body list, and the page's bindScene took the crash scene's RESULT for the
// gpuDriven scene (a silent no-op in node's dry run, a thrown TypeError in the page that aborted rebuild()) -- it takes either now.
// v4826 -- SECTION 5c, HONEST CHIPPED PHYSICS (world/buildingTopple.mjs refitBlock). v4822 chipped a block's voxels and left its body the box it fell
// as; the body is made again now from the voxels left (their mass, a box at their tight bounds, the old pose carried through the offset of the two
// centres, linear velocity moved to the new centre, angular velocity put back by an angular impulse through the new box). Measured on box3d, not
// asserted of the record: the mass by what an impulse does to the body (dv = J / m), the collider by the height the shortened block rests at, the spin
// by the rotation rate one tick on against the same tip with nothing shot.
//
// SABOTAGE LOG -- v4826, each applied to world/buildingTopple.mjs, the gate run, the file restored (13; every one red by name):
//   A  density from the OLD mass (the new box weighs what the old one did)              -> 2 red: the mass row (J / dv), and the spin row (a heavier body turns at 0.219 rad/s, not 0.247).
//   B  the old half on the new body (the collider not shrunk)                           -> 4 red: mass (the old-size box at the density worked out for the small one weighs 2.25 times what it should), the collider row (rests
//      at 5.56 m, not 4.0), the spin row (-0.431: the wrong inertia flung the spin the other way), and tips-faster.
//   C  local not re-based (the voxels keep the old origin)                               -> 1 red: the voxels-where-they-were row (the mesh and the hit test would be a box's height off).
//   D  linear velocity not carried (setVelocity zero)                                    -> 1 red: the linear-velocity row.
//   E  angular velocity not restored (no angular impulse)                                -> 1 red: the spin row (0.180 rad/s against 0.247). Without it the block is turning at 73% of its rate.
//   F  the old body not parked                                                           -> 3 red: the parked-old-body row, the collider row (a ghost box still holding the block up), the spin row.
//   G  the cap removed                                                                   -> 1 red: the cap row (the 9th and 10th shots made bodies, +10 not +8).
//   H  the threshold removed (made again at every chip)                                  -> 2 red: the one-voxel row (a body per voxel) and the next one's body count.
//   I  the angular velocity's sign flipped                                               -> 1 red: the spin row (-0.109 against -0.247).
//   J  the offset applied backwards (pos - r)                                            -> 3 red: voxels-where-they-were, tips-faster, and the bar row.
//   K  mass and rebuilds not folded into toppleHash                                      -> 1 red: the lockstep-fold row.
//   L  comOffset not divided by the voxel count                                          -> 1 red: the centre-of-mass row.
//   M  the body-slot guard removed (a refit asks for a slot with none to spare)           -> 1 red: the world-short-of-slots row (the refit goes ahead; the record shows rebuilds 1, capped undefined).
//   FINDING (J): the first draft of the voxels-where-they-were row asked whether each survivor's world cell was one of the ORIGINAL block's cells, and
//   sabotage J went 0 red on it: a body shifted by whole voxels along its own axis lands every survivor on another original voxel's cell, so a lattice is
//   no witness. The expected set is the voxels that stood OUTSIDE the blast, by where they stood, with no knowledge of the refit in it.
//   FINDING (the world): the wasm module keeps ONE world, so a control run and a chipped run cannot be alive together (a second worldFromModule destroys the
//   first, and the first run's bodies read as empty): the rows run the control, then the chipped runs, each building its own world.
//   FINDING (the hand-posed rows): a record posed by hand has no previous pose, so the angular velocity the refit estimates from it is the whole angle
//   in one tick (36 rad/s for 0.6 rad). Production never meets it -- stepTopple keeps the last pose and a block cannot be shot before its first read --
//   but a gate that poses a block by hand and then chips it applies that spin to a body nobody steps.
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
import { bodyLitPipelineDesc, rotateQ } from "../render/voxelBodies.mjs";
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
    // v4822 -- A LEAN-TO SETTLES. A tall building on ONE column of ground floor (7 x 7 x 11, the last column of seven) tips toward -x and is held
    // between its stub and the road at about 0.97 up: the centre is not over the stub (not "standing") and it cannot fall further (not "fallen"). It
    // used to stay a body for ever, a ruin that never turned into rubble until a car pushed it.
    const leanRun = settle((x) => x === 6, 8, { w: 7, d: 7, h: 11 }); report("lean-to: " + leanRun.rows.join(" | ") + " | events " + JSON.stringify(leanRun.t.events.map((e) => [e.kind, e.up && e.up[1], e.fell])));
    const leanEv = leanRun.t.events.find((e) => e.kind === "shatter");
    ok("!! a block that tipped and came to rest LEANING (0.9 < up.y < 0.999, not flat) shatters into rubble like a fallen one: a shatter event with fell false, the body gone", !!leanEv && leanEv.fell === false && leanEv.up[1] > 0.9 && leanEv.up[1] < BT.TOPPLE.leanUp && leanRun.t.shattered === 1 && leanRun.t.bodies.length === 0 && leanEv.rubble > 0, leanEv ? `up.y ${leanEv.up[1]}, ${leanEv.rubble} rubble voxels, at tick ${leanEv.at}` : "never shattered");
    ok("...while the block over a middle stub, still within leanUp of upright, still STANDS", midRun.body && midRun.body.up[1] > BT.TOPPLE.leanUp && midRun.t.shattered === 0);
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

    // v4822 -- THE SAME BLOCKS IN A kitScene (race-brain.html): kitFleets / placeBlocks / bindKit, with a stub scene standing in for the device
    const kf = BT.kitFleets(t);   // the default cap, which beginTopple's own blockMesh uses: a block's mesh fills the reservation exactly
    ok("kitFleets: a fleet per slot named block0..2 -- a reserved mesh of meshCap vertices, the quat-mode pipeline, one parked record, the identity quaternion", kf.length === 3 && kf.every((f, k) => f.name === "block" + k && f.mesh.positions.length === BT.TOPPLE.meshCap * 3 && JSON.stringify(f.pipeline) === quatDesc && f.records[1] === -500 && f.extras[3] === 1 && f.records.length === 4));
    const scene = { kitRecords: new Float32Array(16 * 4), kitExtras: new Float32Array(16 * 4), fleets: kf.map((f) => ({ name: f.name, vbuf: { writes: [], write(d, o) { this.writes.push([d.length, o]); } } })) };
    BT.placeBlocks(scene, 5, t);
    ok("placeBlocks: the block in slot 0 is its pose and bounding radius at record 5, the empty slots parked at y -500", near(scene.kitRecords[5 * 4], 12) && near(scene.kitRecords[5 * 4 + 1], 6.5) && near(scene.kitRecords[5 * 4 + 3], Math.fround(r.radius)) && scene.kitRecords[6 * 4 + 1] === -500 && scene.kitRecords[7 * 4 + 1] === -500, `record 5: ${Array.from(scene.kitRecords.slice(20, 24)).map((v) => +v.toFixed(2)).join(" ")}`);
    BT.bindKit(t, scene);
    ok("!! bindKit writes the block already in the air into the scene's reserved buffer for its slot (a scene built AGAIN has empty buffers), and nothing into the others", scene.fleets[0].vbuf.writes.length === 1 && scene.fleets[0].vbuf.writes[0][0] === BT.TOPPLE.meshCap * 10 && scene.fleets[1].vbuf.writes.length === 0 && scene.fleets[2].vbuf.writes.length === 0, JSON.stringify(scene.fleets.map((f) => f.vbuf.writes)));
    BT.bindKit(t, scene);
    ok("...and a SECOND bind (the next rebuild) writes it again: a block with its mesh already made is still rewritten", scene.fleets[0].vbuf.writes.length === 2);
    // the crash scene's own binder (race-crash.html) is rebuilt on a repack too, and had the same `if (!r.mesh)` skip
    const cscene = { extrasBase: 0, fleets: [0, 1, 2].map(() => ({ vbuf: { writes: [], write(d) { this.writes.push(d.length); } } })) };
    BT.bindScene(t, cscene, 0); BT.bindScene(t, cscene, 0);
    ok("bindScene (race-crash.html's) writes the block already in the air into a scene built AGAIN, every time it is bound, as bindKit does", cscene.fleets[0].vbuf.writes.length === 2 && cscene.fleets[1].vbuf.writes.length === 0, JSON.stringify(cscene.fleets.map((f) => f.vbuf.writes.length)));
}

// ---------------------------------------------------------------------------------------------------------------------------------
sec("5b. THE CHIP (v4822): a shell on a falling block takes off the voxels in its blast, in the block's own frame; what it cuts loose goes with them; a block shot down comes apart");
{
    const SQ = Math.SQRT1_2, fold = C.foldHash;
    const fresh = (opts = {}) => { const { g, rect, phys } = bareWorld((x) => x === 3), debris = new VoxelDebrisSystem(), t = BT.createTopple(g, { debris }), meshes = []; t.onBlock = (slot, mesh) => meshes.push(mesh); const rec = BT.beginTopple(t, null, null, rect); return { g, t, rec, debris, meshes, phys }; };
    // LAID ON ITS SIDE by hand (no physics step): a quarter turn about z at a known place. A hit on the voxel at local (a, b, c) is at pos + rotate(quat, (a, b, c)).
    const A = fresh(), q90 = [0, 0, SQ, SQ];
    A.rec.pose = { pos: [20, 8, 12], quat: q90 };
    const top = A.rec.local.reduce((m, l) => (l[1] > m[1] || (l[1] === m[1] && (l[0] > m[0] || (l[0] === m[0] && l[2] > m[2]))) ? l : m)), far = A.rec.local.find((l) => l[1] === -top[1]);
    const w = rotateQ(q90, [top[0], top[1], top[2]]), hitAt = [20 + w[0], 8 + w[1], 12 + w[2]], count0 = A.rec.count, sig0 = A.rec.sig, hash0 = BT.toppleHash(0x811c9dc5, A.t, fold);
    const res = BT.shellOnBlock(A.t, A.rec.slot, hitAt, 0.6);
    const stillThere = (l) => A.rec.local.some((m) => m[0] === l[0] && m[1] === l[1] && m[2] === l[2]);
    ok("!! a shell on a block LYING on its side takes off the voxel it hit and no other: the hit point goes into the block's frame through the inverse pose (a quarter turn), so the top voxel of its upright shape, now on its side, is the one that comes off", res.removed === 1 && res.loose === 0 && !stillThere(top) && stillThere(far) && A.rec.count === count0 - 1, `${res.removed} removed of ${count0}, the top voxel (${top.slice(0, 3)}) gone ${!stillThere(top)}, the one opposite (${far.slice(0, 3)}) kept ${stillThere(far)}`);
    ok("...its hit points are the voxels it has left (hp = count over what it fell with, the born count kept), and the block says what has come off it", A.rec.count0 === count0 && near(res.hp, (count0 - 1) / count0, 1e-12) && A.rec.chipped === 1 && A.t.chipped === 1 && A.t.shellHits === 1);
    ok("...the mesh is made again and written into the reserved buffer (the block's picture follows its voxels): a second mesh went to the scene, on the same slot, with the same radius", A.meshes.length === 2 && A.rec.mesh === A.meshes[1] && A.meshes[1].radius === A.meshes[0].radius && A.meshes[1].data.length === A.meshes[0].data.length);
    ok("...and cubes burst from the voxel that came off (6, in its colour), none from the rest", A.debris.particles.length === 6);
    const hash1 = BT.toppleHash(0x811c9dc5, A.t, fold);
    ok("!! the lockstep fold sees the chip: the fingerprint of the block moves when a voxel comes off it, and the signature is the voxels' own (a second block chipped the same way folds to the same number)", hash1 !== hash0 && A.rec.sig !== sig0 && (() => { const B = fresh(); B.rec.pose = { pos: [20, 8, 12], quat: q90 }; BT.shellOnBlock(B.t, B.rec.slot, hitAt, 0.6); return BT.toppleHash(0x811c9dc5, B.t, fold) === hash1; })(), `${hash0.toString(16)} -> ${hash1.toString(16)}`);
    // a hit on a HOLE in the box (no voxel within the radius): the box is hit, nothing comes off, no new mesh
    const H = fresh(); H.rec.pose = { pos: [20, 8, 12], quat: [0, 0, 0, 1] };
    const miss = BT.shellOnBlock(H.t, H.rec.slot, [20 + 40, 8, 12], 0.6);
    ok("a hit outside every voxel's reach (the block's box is bigger than its stone) counts as a hit and takes nothing off: no chip, no new mesh, the block whole", miss.removed === 0 && H.rec.count === H.rec.count0 && H.meshes.length === 1 && H.t.shellHits === 1 && H.t.chipped === undefined);

    // WHAT THE CHIP CUTS LOOSE: a bar of 21 voxels hit in the middle is two pieces of ten; the first stays the block, the second bursts with the voxel that was hit
    const L = fresh(); L.rec.local = Array.from({ length: 21 }, (_, k) => [0, 0, k - 10, 1]); L.rec.count = 21; L.rec.count0 = 21; L.rec.pose = { pos: [20, 8, 12], quat: [0, 0, 0, 1] }; L.debris.particles.length = 0;
    const cut = BT.shellOnBlock(L.t, L.rec.slot, [20, 8, 12], 0.6);
    ok("!! a chip that cuts the block in two keeps the LARGER piece (the first, on a tie) as the block and sends the other with the hit voxel: 1 removed, 10 loose, 10 left, all of them on one side, 11 voxels of cubes", cut.removed === 1 && cut.loose === 10 && cut.left === 10 && L.rec.local.every((l) => L.rec.pose.pos[2] + l[2] < 12) && !cut.shattered && L.debris.particles.length === 66 && L.t.chipped === 11, `${cut.removed} removed, ${cut.loose} loose, ${cut.left} left, ${L.debris.particles.length} cubes`);

    // A BLOCK SHOT DOWN COMES APART: under breakFraction of what it fell with, it shatters where it is, through the same shatter a block at rest takes
    // shot from the TOP END of the long axis, where the chip eats the block from one end and what is left stays one piece: a sphere through the middle would cut it in two
    const topEnd = (R) => [R.rec.pose.pos[0], R.rec.pose.pos[1] + R.rec.half[1], R.rec.pose.pos[2]];
    const sortedD = (R) => R.rec.local.map((l) => Math.hypot(l[0], l[1] - R.rec.half[1], l[2])).sort((a, b) => a - b);
    const S1 = fresh(), d1 = sortedD(S1), r30 = d1[Math.floor(d1.length * 0.3)] + 1e-6;
    const near70 = BT.shellOnBlock(S1.t, S1.rec.slot, topEnd(S1), r30);
    const S2 = fresh(), d2 = sortedD(S2), r80 = d2[Math.floor(d2.length * 0.8)] + 1e-6;
    const near80 = BT.shellOnBlock(S2.t, S2.rec.slot, topEnd(S2), r80);
    ok(`!! taken down to ${Math.round(near70.left / near70.rec.count0 * 100)}% of its voxels a block holds together (breakFraction ${BT.TOPPLE.breakFraction}); taken down to ${Math.round(near80.left / S2.rec.count0 * 100)}% it comes apart where it is: shattered, the body parked and gone from its slot, rubble in the world, the hit points the voxels it had left`, !near70.shattered && S1.t.bodies.length === 1 && near80.shattered && S2.t.bodies.length === 0 && S2.t.slots[0] === null && S2.t.shattered === 1 && S2.t.rubble > 0 && S2.g.parked.size >= 1, `30% removed: ${near70.left} left; 80% removed: ${near80.left} left, ${S2.t.rubble} rubble voxels`);
    ok("...and an empty slot is nothing to hit: a second shell on the shattered block's slot returns null and counts nothing", BT.shellOnBlock(S2.t, 0, [0, 0, 0]) === null && S2.t.shellHits === 1);
}

// ---------------------------------------------------------------------------------------------------------------------------------
sec("5c. HONEST CHIPPED PHYSICS (v4826): the body is made again from the voxels left -- their mass, a collider at their bounds, the motion carried over");
{
    const quiet2 = (fn) => { const l = console.log; console.log = () => {}; try { return fn(); } finally { console.log = l; } };
    const topPoint = (rec, up = rec.half[1]) => { const r = rotateQ(rec.pose.quat, [0, up, 0]); return [rec.pose.pos[0] + r[0], rec.pose.pos[1] + r[1], rec.pose.pos[2] + r[2]]; };
    const worldOf = (rec) => rec.local.map((l) => { const r = rotateQ(rec.pose.quat, [l[0], l[1], l[2]]); return [rec.pose.pos[0] + r[0], rec.pose.pos[1] + r[1], rec.pose.pos[2] + r[2]]; });
    const keyOf = (p) => p.map((v) => Math.round(v * 1e5)).join(",");
    const massOf = (phys, rec, J = 8640) => { const v0 = phys.readVelocities()[rec.body * 3]; phys.impulse(rec.body, [J, 0, 0]); const dv = phys.readVelocities()[rec.body * 3] - v0; phys.setVelocity(rec.body, [v0, phys.readVelocities()[rec.body * 3 + 1], phys.readVelocities()[rec.body * 3 + 2]]); return J / dv; };
    const standing = () => { const { g, rect, phys } = bareWorld(() => true), t = BT.createTopple(g, {}), rec = BT.beginTopple(t, null, null, rect); return { g, t, rec, phys }; };

    // MASS: box3d's own, read by what an impulse does to the body (dv = J / m), before and after the top five layers of a standing 4 x 9 x 4 block are shot off
    const M = standing(), m0 = quiet2(() => massOf(M.phys, M.rec)), bodies0 = M.phys.bodyCount(), oldBody = M.rec.body;
    const cut = BT.shellOnBlock(M.t, M.rec.slot, topPoint(M.rec), 5.0), m1 = quiet2(() => massOf(M.phys, M.rec));
    ok("!! the MASS follows the voxels: box3d's own mass of the block (J / dv of a real impulse) is 86,400 kg whole and 64 voxels x 600 = 38,400 after the top five layers are shot off -- it was 86,400 after, before the body was made again", Math.abs(m0 / 86400 - 1) < 1e-3 && Math.abs(m1 / 38400 - 1) < 1e-3 && cut.left === 64 && !cut.shattered, `${m0.toFixed(0)} -> ${m1.toFixed(0)} kg, ${cut.left} voxels left`);
    ok("...a NEW body took over (one more slot in the world, the record points at it) and the old one is parked out of the world as a static body, not left in the air as a ghost", M.rec.body !== oldBody && M.phys.bodyCount() === bodies0 + 1 && M.rec.rebuilds === 1 && M.t.rebuilt === 1 && M.phys.readTransforms()[oldBody * 7 + 1] === BT.TOPPLE.park[1], `body ${oldBody} -> ${M.rec.body}, ${bodies0} -> ${M.phys.bodyCount()} bodies, old body's y ${M.phys.readTransforms()[oldBody * 7 + 1]}`);
    const ev = M.t.events.find((e) => e.kind === "refit");
    ok("...its box is the TIGHT BOUNDS of what is left (half 2 x 2 x 2 from 2 x 4.5 x 2) and the event says what it was and what it is", ev && JSON.stringify(ev.half) === "[2,2,2]" && JSON.stringify(ev.halfWas) === "[2,4.5,2]" && ev.mass === 38400 && ev.massWas === 86400 && M.rec.half[1] === 2, JSON.stringify({ half: ev && ev.half, halfWas: ev && ev.halfWas, mass: ev && ev.mass }));

    // THE COLLIDER: not the bookkeeping -- the block, still standing on its ground floor, rests at the height of its NEW half, in box3d
    quiet2(() => { let tk = 0; for (let k = 0; k < 120; k++) { M.phys.step(C.CAR.dt, 4); BT.stepTopple(M.t, ++tk); } });
    ok("!! the COLLIDER follows too: after two seconds the shortened block rests on its ground floor with its centre 2.0 m above the road level (the half of its four layers; a box that had stayed 9 layers tall would sit 4.5), upright", Math.abs(M.rec.pose.pos[1] - (Y0 + 1 + 2)) < 0.05 && M.rec.up[1] > 0.999, `centre y ${M.rec.pose.pos[1].toFixed(3)} against ${(Y0 + 3).toFixed(3)}, up.y ${M.rec.up[1].toFixed(4)}`);

    // CONTINUITY AT THE INSTANT: every voxel that is left is where it was in the world, to rounding; the surviving centre of mass moves as the formula says
    const K = standing(); K.rec.pose = { pos: [20, 8, 12], quat: [0, 0, Math.sin(0.3), Math.cos(0.3)] }; K.phys.setTransform(K.rec.body, K.rec.pose.pos, K.rec.pose.quat);
    const beforeAll = worldOf(K.rec), hit0 = topPoint(K.rec, 4.5), expected = new Set(beforeAll.filter((p) => Math.hypot(p[0] - hit0[0], p[1] - hit0[1], p[2] - hit0[2]) > 4.01).map(keyOf));   // the survivors, named by where they stood: no knowledge of the refit in it
    const kcut = BT.shellOnBlock(K.t, K.rec.slot, hit0, 4.01), after = worldOf(K.rec), afterKeys = new Set(after.map(keyOf));
    ok("!! the voxels that are left are WHERE THEY WERE in the world (the new body's pose carried through the offset of the two boxes' centres, the voxels re-based to it): exactly the " + expected.size + " that stood outside the blast, each at its own cell, on a block turned 0.6 rad about z -- not merely on the old lattice, which a body moved by whole voxels would also land on", K.rec.count === kcut.left && kcut.loose === 0 && afterKeys.size === expected.size && [...afterKeys].every((k) => expected.has(k)) && K.rec.rebuilds === 1, `${[...afterKeys].filter((k) => expected.has(k)).length} of ${expected.size} at their own cells`);
    const hitBefore = worldOf(K.rec)[Math.floor(K.rec.count / 2)], kc2 = K.rec.count, again = BT.shellOnBlock(K.t, K.rec.slot, hitBefore, 0.6);
    ok("...and a SECOND shell at the world position of one of them takes off exactly that voxel: the hit test works in the re-based frame, not the one the block fell in", again.removed === 1 && again.loose === 0 && K.rec.count === kc2 - 1 && !worldOf(K.rec).some((p) => Math.hypot(p[0] - hitBefore[0], p[1] - hitBefore[1], p[2] - hitBefore[2]) < 1e-3), `removed ${again.removed}, ${kc2} -> ${K.rec.count}`);

    // THE MOTION CARRIES OVER: the far-quarter block tipping (about 0.24 rad/s a second in), its top shot off; the run beside it is the same tip with nothing shot
    const tip = (shoot) => quiet2(() => {
        const { g, rect, phys } = bareWorld((x) => x === 3), t = BT.createTopple(g, {}), rec = BT.beginTopple(t, null, null, rect); let tk = 0; const step = () => { phys.step(C.CAR.dt, 4); BT.stepTopple(t, ++tk); };
        for (let k = 0; k < 40; k++) step();
        const v0 = phys.readVelocities().slice(rec.body * 3, rec.body * 3 + 3), w0 = BT.angularVelocity(rec.prevQuat, rec.pose.quat, 1 / 60), pose0 = { pos: rec.pose.pos.slice(), quat: rec.pose.quat.slice() }, body0 = rec.body;
        if (shoot) BT.shellOnBlock(t, rec.slot, topPoint(rec), 4.5);
        const vAfter = phys.readVelocities().slice(rec.body * 3, rec.body * 3 + 3), qa = rec.pose.quat.slice(); step();
        const w1 = BT.angularVelocity(qa, rec.pose.quat, 1 / 60); for (let k = 0; k < 29; k++) step();
        return { v0, vAfter, w0, w1, pose0, body0, rec, hash: phys.stateHash(), th: BT.toppleHash(0x811c9dc5, t, (h, v) => { for (let k = 0; k < 4; k++) { h ^= (v >>> (k * 8)) & 0xff; h = Math.imul(h, 0x01000193); } return h; }), y30: rec.pose.pos[1], up30: rec.up[1], t };
    });
    const ctl = tip(false), chip = tip(true), chip2 = tip(true);
    ok("!! the SPIN carries over: one tick after the top is shot off, the tipping block turns at " + chip.w1[2].toFixed(3) + " rad/s against the unshot block's " + ctl.w1[2].toFixed(3) + " (within 8%) -- a body made again at rest would be turning at a tenth of that", Math.abs(chip.w1[2] / ctl.w1[2] - 1) < 0.08 && ctl.w1[2] > 0.2, `chipped ${chip.w1[2].toFixed(4)}, control ${ctl.w1[2].toFixed(4)}, estimated before ${chip.w0[2].toFixed(4)}`);
    ok("...and so does the LINEAR velocity, moved to the new centre (v + w x r): the new body's velocity is not zero and not the old one's, and it matches the formula to float rounding", chip.rec.rebuilds === 1 && (() => { const r = rotateQ(chip.pose0.quat, [0, (chip.t.events.find((e) => e.kind === "refit").half[1] - chip.t.events.find((e) => e.kind === "refit").halfWas[1]), 0]); const w = chip.w0, c = [w[1] * r[2] - w[2] * r[1], w[2] * r[0] - w[0] * r[2], w[0] * r[1] - w[1] * r[0]]; return [0, 1, 2].every((a) => Math.abs(chip.vAfter[a] - (chip.v0[a] + c[a])) < 1e-5); })() && Math.hypot(...chip.vAfter) > 0.3, `before ${Array.from(chip.v0).map((v) => v.toFixed(3))}, after ${Array.from(chip.vAfter).map((v) => v.toFixed(3))}`);
    ok("!! two runs of the tip-and-shoot are one run: the same box3d state hash and the same lockstep fold, to the bit (the angular velocity is estimated from two float32 poses, which both peers hold identically)", chip.hash === chip2.hash && chip.th === chip2.th && chip.hash !== ctl.hash && chip.th !== ctl.th, `${chip.hash.toString(16)} / ${chip2.hash.toString(16)}, control ${ctl.hash.toString(16)}`);
    ok("...and the shortened block TIPS FASTER than the whole one a second on (its centre is lower and its lever shorter): up.y " + chip.up30.toFixed(3) + " against " + ctl.up30.toFixed(3) + ", centre " + chip.y30.toFixed(2) + " against " + ctl.y30.toFixed(2), chip.up30 < ctl.up30 && chip.y30 < ctl.y30 - 1.5);

    // WHEN IT IS NOT MADE AGAIN: a chip from the middle of the block moves its mass under a share of a tenth and its bounds not at all
    const Q = standing(), qbodies = Q.phys.bodyCount(), q0body = Q.rec.body, interior = Q.rec.local.find((l) => Math.abs(l[0]) < 1 && Math.abs(l[2]) < 1 && Math.abs(l[1]) < 3), ir = rotateQ(Q.rec.pose.quat, [interior[0], interior[1], interior[2]]);
    const small = BT.shellOnBlock(Q.t, Q.rec.slot, [Q.rec.pose.pos[0] + ir[0], Q.rec.pose.pos[1] + ir[1], Q.rec.pose.pos[2] + ir[2]], 0.6);
    ok("a one-voxel chip from the middle (mass 0.7%, bounds unchanged) does NOT make the body again: same body, no new slot, the record's mass still the block's, the voxel gone", small.removed === 1 && Q.rec.body === q0body && Q.phys.bodyCount() === qbodies && Q.rec.rebuilds === 0 && Q.rec.mass === 86400 && Q.rec.count === 143, `mass ${Q.rec.mass}, ${Q.rec.count} voxels, ${Q.phys.bodyCount()} bodies`);
    const big = BT.shellOnBlock(Q.t, Q.rec.slot, topPoint(Q.rec), 3.0);
    ok("...and a bigger one does: the same block, one shot later, is a new body of the mass it has", big.removed > 20 && Q.rec.rebuilds === 1 && Q.rec.mass === Q.rec.count * BT.TOPPLE.density && Q.phys.bodyCount() === qbodies + 1, `${big.removed} off, mass ${Q.rec.mass}`);

    // THE CAP: box3d cannot destroy a body, so a block is made again at most TOPPLE.rebuild.maxPerBlock times; the shots after that still take their voxels, and the record SAYS the body could not follow
    const S = (() => { const { g, rect, phys } = bareWorld(() => true, { w: 1, d: 1, h: 20, x0: 40, z0: 40 }), t = BT.createTopple(g, {}), rec = BT.beginTopple(t, null, null, rect); return { g, t, rec, phys }; })();
    const sb0 = S.phys.bodyCount(), c0 = S.rec.count; let topY = () => Math.max(...S.rec.local.map((l) => l[1]));
    for (let k = 0; k < 10; k++) BT.shellOnBlock(S.t, S.rec.slot, topPoint(S.rec, topY() + 0.0), 0.6);
    ok("!! the cap: ten shots down a 1 x 19 x 1 column take ten voxels (" + c0 + " -> " + S.rec.count + "), the body is made again " + BT.TOPPLE.rebuild.maxPerBlock + " times (that many slots, no more) and the two shots past it are COUNTED as capped, on the record and on the topple, not hidden", S.rec.count === c0 - 10 && S.rec.rebuilds === BT.TOPPLE.rebuild.maxPerBlock && S.phys.bodyCount() === sb0 + BT.TOPPLE.rebuild.maxPerBlock && S.t.rebuilt === BT.TOPPLE.rebuild.maxPerBlock && S.rec.capped === 2 && S.t.refitCapped === 2, `rebuilds ${S.rec.rebuilds}, capped ${S.rec.capped}, +${S.phys.bodyCount() - sb0} bodies`);

    const fold = (h, v) => { for (let k = 0; k < 4; k++) { h ^= (v >>> (k * 8)) & 0xff; h = Math.imul(h, 0x01000193); } return h; };
    const F = standing(), fh = () => BT.toppleHash(0x811c9dc5, F.t, fold), f0 = fh(); F.rec.mass += 600; const f1 = fh(); F.rec.mass -= 600; F.t.rebuilt = 1; const f2 = fh(); F.t.rebuilt = 0;
    ok("the lockstep fold sees what the refit changes: the block's MASS moves the fingerprint (everything else equal), and so does the count of bodies made again", f1 !== f0 && f2 !== f0 && f1 !== f2 && fh() === f0, `${(f0 >>> 0).toString(16)} / mass +600 ${(f1 >>> 0).toString(16)} / rebuilt 1 ${(f2 >>> 0).toString(16)}`);

    // THE WORLD RUNNING OUT OF BODIES: box3d's slots are 4,096 and a refit takes one. Near the end the refit is declined and counted; the voxels still come off.
    const Y = standing(), ybody = Y.rec.body, realCount = Y.phys.bodyCount.bind(Y.phys); Y.phys.bodyCount = () => BT.TOPPLE.bodyLimit - BT.TOPPLE.bodyReserve + 2;
    const ycut = BT.shellOnBlock(Y.t, Y.rec.slot, topPoint(Y.rec), 5.0); Y.phys.bodyCount = realCount;
    ok("!! with the world short of body slots (" + (BT.TOPPLE.bodyLimit - BT.TOPPLE.bodyReserve + 2) + " of " + BT.TOPPLE.bodyLimit + " in use) a big chip is NOT made into a new body -- it is declined and COUNTED (capped 1, refitCapped 1), the same body stays, and the voxels still come off; a refit that threw `body limit reached` from inside a race would end it", ycut.removed > 60 && Y.rec.body === ybody && Y.rec.rebuilds === 0 && Y.rec.capped === 1 && Y.t.refitCapped === 1 && !Y.t.rebuilt && Y.rec.count === ycut.left, `body ${ybody} kept, ${ycut.left} voxels left, capped ${Y.rec.capped}`);

    // WHAT IT IS NOT: the centre of mass of a box is its centre. An off-centre bite moves the voxels' centroid off it, and the event says by how much
    const Z = standing(), zc = BT.shellOnBlock(Z.t, Z.rec.slot, (() => { const r = rotateQ(Z.rec.pose.quat, [1.5, 4, 1.5]); return [Z.rec.pose.pos[0] + r[0], Z.rec.pose.pos[1] + r[1], Z.rec.pose.pos[2] + r[2]]; })(), 3.0), zev = Z.t.events.find((e) => e.kind === "refit");
    const cen = Z.rec.local.reduce((a, l) => [a[0] + l[0], a[1] + l[1], a[2] + l[2]], [0, 0, 0]).map((v) => v / Z.rec.local.length), off = Math.hypot(...cen);
    ok("the honest limit, MEASURED: a bite out of one top corner leaves the voxels' centroid " + off.toFixed(3) + " m off the box3d body's centre (the body's centre of mass is its box's centre), and the refit event reports exactly that distance rather than leaving it to be assumed", zev && off > 0.1 && off < 1.5 && Math.abs(zev.comOffset - off) < 1e-3, `event ${zev && zev.comOffset}, own centroid ${off.toFixed(3)}, ${zc.removed} off`);
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
// v4663 -- process.exitCode, NOT process.exit: this gate compiles a wasm module, and exiting while V8's
// background compiler still has work posts a task into a torn-down platform. tools/ship/wasmTeardown.mjs.
process.exitCode = fails ? 1 : 0;
