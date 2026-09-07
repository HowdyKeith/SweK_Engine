#!/usr/bin/env node
// WebGLEngine/tools/ship/crashDamage-selfcheck.mjs -- v4530
//
// DESTRUCTIBLE BUILDINGS: the car of Racing city 2 against CityGen's buildings on the flat grid, through the sandbox's own damage
// (render/voxelDamage.mjs, v4520) with render/rebar.mjs's cage revealed on the cut.
//
// Section 1, THE CITY: seed 1's world and city; every building's hit points ARE its standing voxels (v4510), one static box per
// building, a building with a clear lane before its -x face for the rams.
// Section 2, ABOVE THE THRESHOLD: the car launched at 15 m/s loses more than CRASH.speedLoss in one step against the wall: ONE impact,
// the blast centred on the first solid voxel along its heading, voxels removed and six debris cubes spawned per voxel, the building
// charged EXACTLY the voxels its footprint lost (the blast's and the crumble's), its hit points equal to its standing voxels after,
// the crater air, the device's slots equal to a fresh pack of the carved world.
// Section 3, THE REBAR: steel revealed on the crater's faces -- every REBAR voxel lies on a rod of the building's cage (the gate's own
// reading of rebar.mjs's isRebar), touches air, and both families are there: x-rods cut square-on and vertical rods down the face.
// Section 4, BELOW THE THRESHOLD: the car at 2 m/s reaches the wall, loses less than the threshold, and the building is WHOLE -- hit
// points, every voxel, no debris, the box still standing in the car's way.
// Section 5, THE COLLAPSE: the car at 25 m/s takes the ground floor under CRASH.support; the building is charged the rest, CityGen
// topples it (footprint empty, rubble stamped beside it, hp 0), its box is parked, and the same car relaunched drives through where
// it stood.
// Section 6, DETERMINISM: two runs from two fresh worlds, one fingerprint, one impact record.
// Section 7, IN THE BROWSER ON BOTH BACKENDS: the world, the car and the debris through crashScene; the page's wasm rams to node's
// record; the frame after the impact is EXACTLY a fresh pack of the carved world, differs from the frame before, differs from the
// same world with its rebar turned back to stone (the steel is on the picture), and shows the debris; the backends agree.
// Section 8, THE PAGE: race-crash.html in its own browser, ramming on load.
//
// MEASURED AT THE ROUND (v4530, seed 1: 79 buildings, 79 static boxes, building 0 rammed along an 8 m lane before its -x face):
// at 15 m/s the car meets the wall at 13.2 m/s and loses 13.81 m/s in one step; radius 2.50; 46 voxels removed, 30 the building's,
// 276 debris, 8 chunks synced in ~120 ms; hp 190 -> 160 = the standing count; 6 rebar voxels (4 on x-rods, 2 vertical), all on
// the cage and touching air; the car stopped or thrown back before the wall. At 2 m/s the most lost in a step is 0.926 m/s, hp
// 190 of 190, 190 standing, 0 debris. At 25 m/s: 23.6 m/s lost, radius 3.50, 94 removed (60 charged, 24 by CityGen's crumble),
// support 0.00 -> collapsed, toppled, hp 0, 0 standing, the rubble ring 53 -> 76 voxels, box parked, the relaunched car past the
// far face with no impact. Fingerprint f6cee0ad twice. In the browser: both backends 46 / 160 / 6 to node's record; before vs
// after 21,727 (WebGPU) and 22,091 (WebGL2) pixels apart, after vs a fresh pack 5,366 / 5,416 (the debris), gone vs fresh 0 / 0,
// fresh vs no-steel 3,451 / 3,451 from 6 voxels. The page on WebGL2 rams on load: 6.2 m/s lost, 16 voxels, 4 rebar.
// Three runs alone: 9,114 / 9,404 / 9,009 ms, all exit 0 (tools/ship/gateBudget.mjs).
// FOUR FINDINGS ON THE WAY (world/crashDamage.mjs's comments carry them): stepCar returns the pose its forces came FROM, so the
// first draft measured a speed loss of exactly zero at every wall; the blast at the footprint's face carved the first crater's
// air on every later ram; the floor voxels under a building were charged to it (11 hit points) until the charge started at the
// first building layer; and THE WORLD RECORD -- one record at the origin with radius 1, culled whole when the camera's frustum
// lost the origin, so the steel check passed with 0 pixels apart while neither frame held a building. The steel also took id 7
// first, the registry's RUBBLE, coloured before the palette.
//
// SABOTAGE (the round):
//   A  the threshold raised to 30 m/s (no wall is an impact)                     -> 18 red (everything downstream of an impact)
//   B  the building charged nothing (blastAt with no city, the crumble's charge zeroed) -> 1 red (hp 190 for 160 standing). A first B
//      passed blastAt no city ALONE and went 0 RED: the module's own charge for what left the footprint covered the loss, which is
//      the property, not a hole -- so B disables both charges.
//   C  revealRebar returns before revealing                                       -> 6 red (no steel; the steel not on the picture)
//   D  the support share set to -1 (a building never collapses)                   -> 4 red (no topple, no rubble, no parking, no drive-through)
//   E  the world recorded at the origin with radius 1 again                       -> 2 red (the steel not on the picture: no world drawn)
//   F  the charge counting the floor under the building                           -> 1 red (hp 149 for 160 standing)
//   G  race-crash.html's line without the word rebar                              -> 1 red (the page line)
//
// Run: node tools/ship/crashDamage-selfcheck.mjs      (~9 s: five cities, three rams, two browsers)
"use strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInEngineOrigin, webgpuSkipReason } from "./webgpuHarness.mjs";
import * as D from "../../world/crashDamage.mjs";
import * as T from "../../world/raceTrack.mjs";
import * as C from "../../physics/raceCar.mjs";
import { CityGen } from "../../world/CityGen.js";
import { VoxelDebrisSystem } from "../../world/voxelDebrisSystem.js";
import { packSlots, FLOATS } from "../../render/voxelDeviceEdit.mjs";
import { rebarDistance } from "../../render/rebar.mjs";
import { PALETTE } from "../../world/chunkMesherCore.js";
import { initNode, mod } from "../../physics/box3d/box3dNode.mjs";
import { worldFromModule } from "../../render/slugTicker.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const report = (m) => console.log("  ----  " + m);
const sec = (t) => console.log("\n" + t);
const SEED = 1, FROM = 8;
const quiet = (fn) => { const log = console.log; console.log = (...a) => { if (!/^\[CityGen\]/.test(String(a[0]))) log(...a); }; try { return fn(); } finally { console.log = log; } };

/** THE TWIN, per slot (voxelDamage's gate): every slot's used floats equal a fresh pack's, and the tail is zero */
function matchesFreshPack(state) {
    const fresh = packSlots(state.world, state.opts); const bad = [];
    for (const [k, s] of state.slots) { const f = fresh.slots.get(k); if (!f || f.count !== s.count) { bad.push(k + " count"); continue; }
        for (let i = 0; i < s.count * FLOATS; i++) if (state.vertexData[s.offset * FLOATS + i] !== fresh.vertexData[f.offset * FLOATS + i]) { bad.push(k + " float " + i); break; } }
    return { same: bad.length === 0, bad };
}

const st = await initNode(); if (!st.ready) { ok("box3d's wasm", false, st.reason); console.log("\nFAIL -- 1 check(s)"); process.exit(1); }
const track = T.generateTrack({ seed: SEED }), surface = C.trackSurface(track);
const make = () => quiet(() => { const g = D.crashWorld(track, CityGen); D.buildingColliders(g, worldFromModule(mod(), [0, -9.81, 0])); return g; });
const bOf = (g, i) => g.city.buildingAt(g.rects[i].x + 0.5, g.rects[i].z + 0.5);
const runOnce = (speed, steps = 150) => { const g = make(), debris = new VoxelDebrisSystem(), { car } = D.launch(g, RAM, { speed, from: FROM }); const r = quiet(() => D.ram(g, car, surface, { steps, ctx: { debris } })); return { g, car, r, b: bOf(g, RAM), rect: g.rects[RAM], debris }; };

// ---------------------------------------------------------------------------------------------------------------------------------
sec("1. THE CITY: hit points are standing voxels, one box a building, a lane to ram along");
let RAM = -1;
{
    const g = make(); RAM = D.rammable(g.rects, FROM);
    const hpIsStanding = g.rects.filter((r) => { const b = g.city.buildingAt(r.x + 0.5, r.z + 0.5); return b && b.maxHp === D.footprint(g.world, r).solid && b.hp === b.maxHp && b.state === "standing"; }).length;
    report(`${g.rects.length} rects, ${g.city.buildings.length} buildings, ${g.colliders.length} static boxes, ${g.phys.bodyCount()} bodies; rammable building ${RAM} ${JSON.stringify(g.rects[RAM])}`);
    ok("*** every building's hit points are its standing voxels (v4510), and every one starts whole ***", hpIsStanding === g.rects.length && g.rects.length > 50, `${hpIsStanding} of ${g.rects.length}`);
    ok("  one static box per building in the physics world", g.colliders.length === g.rects.length && g.phys.bodyCount() === g.rects.length);
    ok("  a building with a clear 8 m lane before its -x face exists, and the lane starts facing +x", RAM >= 0 && D.laneBefore(g.rects, RAM, FROM) !== null && Math.abs(D.laneBefore(g.rects, RAM, FROM).yaw - Math.PI / 2) < 1e-9, `building ${RAM}`);
    ok("  the palette carries the steel the cut reveals", Array.isArray(PALETTE[D.REBAR_ID]) && PALETTE[D.REBAR_ID].length === 3);
}

// ---------------------------------------------------------------------------------------------------------------------------------
sec("2. ABOVE THE THRESHOLD: 15 m/s into the wall");
let hitRec = null, hitG = null;
{
    const t0 = performance.now(); const { g, r, b, rect, debris } = runOnce(15); const ms = performance.now() - t0; hitG = g;
    const imp = r.impacts[0]; hitRec = imp; const fp = D.footprint(g.world, rect);
    report(imp ? `impact at step ${r.impacts.length ? "?" : "-"}: ${imp.speedBefore.toFixed(1)} m/s before, ${imp.dv.toFixed(2)} m/s lost in one step, radius ${imp.radius.toFixed(2)}, ${imp.removed} voxels removed (${imp.lost} the building's, ${imp.crumbled} more by CityGen's crumble), hp ${imp.hpBefore} -> ${imp.hp} of ${imp.maxHp}, ${imp.rebar} rebar, ${imp.debris} debris, ${imp.chunks} chunks synced in ${imp.ms} ms; ${ms.toFixed(0)} ms in all` : "NO IMPACT");
    ok("*** the car loses more than the threshold in one step against the wall: one impact, and the blast is centred INSIDE the footprint on the first solid voxel along its heading ***", r.impacts.length === 1 && imp && imp.dv >= D.CRASH.speedLoss && imp.deepened && imp.point[0] >= rect.x && imp.point[0] <= rect.x + rect.w && imp.point[2] >= rect.z && imp.point[2] <= rect.z + rect.d, imp ? `${imp.dv.toFixed(2)} m/s at (${imp.point.map((v) => v.toFixed(1)).join(", ")})` : "");
    ok("*** voxels removed and six debris cubes spawned for each ***", imp && imp.removed > 10 && imp.debris === imp.removed * 6 && debris.totalSpawned === imp.removed * 6, imp ? `${imp.removed} voxels, ${debris.totalSpawned} spawned` : "");
    ok("*** the building is charged exactly the voxels its footprint lost, so its hit points ARE its standing voxels after ***", imp && imp.hp === imp.hpBefore - imp.lost - imp.crumbled && b.hp === fp.solid && b.hp < b.maxHp, imp ? `hp ${imp.hp} = ${imp.hpBefore} - ${imp.lost} - ${imp.crumbled}; standing ${fp.solid}` : "");
    ok("  the crater is air: the voxel at the blast centre and its neighbour toward the car", imp && g.world.voxelAt(Math.floor(imp.point[0]), Math.floor(imp.point[1]), Math.floor(imp.point[2])) === 0 && g.world.voxelAt(Math.floor(imp.point[0]) - 1, Math.floor(imp.point[1]), Math.floor(imp.point[2])) === 0);
    ok("  the building still stands: over the support share, state not toppled, the box still there", b.state !== "toppled" && D.support(g.world, rect) >= D.CRASH.support && !g.parked.has(RAM), `support ${D.support(g.world, rect).toFixed(2)}, ${b.state}`);
    const twin = matchesFreshPack(g.state);
    ok("  the device's slots equal a fresh pack of the carved world (the twin, per slot)", twin.same, twin.bad.slice(0, 3).join(", "));
    ok("  the car is stopped or thrown back by the wall, not through it", r.pose.pos[0] < rect.x && Math.abs(r.pose.speed) < 3, `x ${r.pose.pos[0].toFixed(2)}, speed ${r.pose.speed.toFixed(2)}`);
}

// ---------------------------------------------------------------------------------------------------------------------------------
sec("3. THE REBAR: the cage revealed on the cut, oriented and placed");
{
    const g = hitG, rect = g.rects[RAM], fp = D.footprint(g.world, rect);
    const rods = []; for (let x = rect.x; x < rect.x + rect.w; x++) for (let z = rect.z; z < rect.z + rect.d; z++) for (let y = 1; y <= rect.h; y++) if (g.world.voxelAt(x, y, z) === D.REBAR_ID) {
        const air = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]].some(([dx, dy, dz]) => g.world.voxelAt(x + dx, y + dy, z + dz) === 0);
        const rd = rebarDistance(x + 0.5, y + 0.5, z + 0.5, { ...D.CRASH.cage, offset: [rect.x + 0.5, D.CRASH.groundY + 1.5, rect.z + 0.5] });
        rods.push({ x, y, z, air, onRod: D.onRod(rect, x, y, z), axis: rd.axis }); }
    const xRods = rods.filter((r) => r.axis === "x").length, yRods = rods.filter((r) => r.axis === "y").length;
    report(`${rods.length} rebar voxels in the footprint (${fp.rebar} by the footprint count): ${xRods} on x-rods (cut square-on), ${yRods} on vertical rods; ${rods.filter((r) => r.air).length} touch air`);
    ok("*** steel is revealed: rebar voxels exist, every one lies on a rod of the building's own cage and touches the crater's air ***", rods.length > 0 && rods.length === fp.rebar && rods.every((r) => r.onRod && r.air), `${rods.length}`);
    ok("  and it is ORIENTED: both families are on the cut -- x-rods as cut ends, vertical rods down the face", xRods > 0 && yRods > 0, `${xRods} x, ${yRods} y`);
    ok("  the cage is rebar.mjs's: rods a pitch apart, a voxel thick, on the building's corner (a voxel one off a rod is not steel)", D.onRod(rect, rect.x, 1, rect.z) && !D.onRod(rect, rect.x + 1, 2, rect.z + 1) && D.onRod(rect, rect.x + 3, 1, rect.z) && D.onRod(rect, rect.x, 4, rect.z + 3));
    ok("  CONTROL: a building untouched by the car carries no steel", g.rects.filter((r, i) => i !== RAM).every((r) => D.footprint(g.world, r).rebar === 0));
}

// ---------------------------------------------------------------------------------------------------------------------------------
sec("4. BELOW THE THRESHOLD: 2 m/s to the wall, and the building is whole");
{
    const before = (() => { const g = make(); return D.footprint(g.world, g.rects[RAM]); })();
    const { g, r, b, rect, debris } = runOnce(2, 240); const fp = D.footprint(g.world, rect);
    let maxDv = 0; { const g2 = make(), { car } = D.launch(g2, RAM, { speed: 2, from: FROM }); for (let s = 0; s < 240; s++) { const q = quiet(() => D.crashStep(g2, car, surface, { throttle: 0, steer: 0, brake: 0 })); maxDv = Math.max(maxDv, q.dv); } }
    report(`the slow car ends at x ${r.pose.pos[0].toFixed(2)} (the wall at ${rect.x}), speed ${r.pose.speed.toFixed(2)}, the most it lost in one step ${maxDv.toFixed(3)} m/s; hp ${b.hp} of ${b.maxHp}, ${fp.solid} standing, ${debris.totalSpawned} debris`);
    ok("*** below the threshold: no impact, the building whole -- hit points, every voxel, no debris ***", r.impacts.length === 0 && b.hp === b.maxHp && fp.solid === before.solid && fp.rebar === 0 && debris.totalSpawned === 0 && maxDv < D.CRASH.speedLoss, `max loss ${maxDv.toFixed(3)} m/s`);
    ok("  the box still stands in its way: the car never passes the wall", r.pose.pos[0] < rect.x);
}

// ---------------------------------------------------------------------------------------------------------------------------------
sec("5. THE COLLAPSE: 25 m/s takes the ground floor, CityGen topples it, the box is parked, the car drives through");
{
    const ring = (g, rect) => { let n = 0; for (let x = rect.x - 10; x < rect.x + rect.w + 10; x++) for (let z = rect.z - 10; z < rect.z + rect.d + 10; z++) { if (x >= rect.x && x < rect.x + rect.w && z >= rect.z && z < rect.z + rect.d) continue; if (g.world.voxelAt(x, 1, z)) n++; } return n; };
    const ringBefore = (() => { const g = make(); return ring(g, g.rects[RAM]); })();
    const { g, car, r, b, rect } = runOnce(25, 90); const imp = r.impacts[0], fp = D.footprint(g.world, rect);
    report(imp ? `${imp.dv.toFixed(1)} m/s lost, radius ${imp.radius.toFixed(2)}, ${imp.removed} removed (${imp.lost} charged, ${imp.crumbled} crumbled), support then ${D.support(g.world, rect).toFixed(2)} -> collapsed ${imp.collapsed}, state ${b.state}, hp ${b.hp}; ${fp.solid} standing, rubble ring ${ringBefore} -> ${ring(g, rect)} voxels` : "NO IMPACT");
    ok("*** the ground floor goes under the support share and the building is charged the rest: hit points 0, toppled, the footprint empty ***", imp && imp.collapsed && imp.toppled && b.state === "toppled" && b.hp === 0 && fp.solid === 0, imp ? `support ${D.support(g.world, rect).toFixed(2)} < ${D.CRASH.support}` : "");
    ok("  CityGen's topple stamped rubble beside the footprint", ring(g, rect) > ringBefore, `${ringBefore} -> ${ring(g, rect)}`);
    ok("  the building's box is parked, and no other", g.parked.size === 1 && g.parked.has(RAM));
    const twin = matchesFreshPack(g.state);
    ok("  the slots equal a fresh pack after the topple", twin.same, twin.bad.slice(0, 3).join(", "));
    D.relaunch(g, car, RAM, { speed: 10, from: FROM }); const through = quiet(() => D.ram(g, car, surface, { steps: 200 }));
    ok("*** the same car relaunched drives THROUGH where the building stood: past its far face, no impact ***", through.pose.pos[0] > rect.x + rect.w && through.impacts.length === 0 && g.phys.bodyCount() === g.rects.length + 1, `x ${through.pose.pos[0].toFixed(1)} past ${rect.x + rect.w}; ${g.phys.bodyCount()} bodies`);
}

// ---------------------------------------------------------------------------------------------------------------------------------
sec("6. DETERMINISM: two fresh worlds, one fingerprint");
let FP = null;
{
    const a = runOnce(15), b = runOnce(15); FP = a.r.fingerprint;
    const same = (x, y) => x.removed === y.removed && x.lost === y.lost && x.hp === y.hp && x.rebar === y.rebar && Math.abs(x.dv - y.dv) < 1e-9;
    ok("*** the same launch in a fresh world is the same fingerprint and the same impact record ***", a.r.fingerprint === b.r.fingerprint && a.r.impacts.length === 1 && b.r.impacts.length === 1 && same(a.r.impacts[0], b.r.impacts[0]), a.r.fingerprint);
    ok("  a different speed is a different fingerprint", runOnce(16).r.fingerprint !== a.r.fingerprint);
}

// ---------------------------------------------------------------------------------------------------------------------------------
sec("7. IN THE BROWSER ON BOTH BACKENDS: the crater, the steel and the debris on the picture");
const W = 256, H = 256;
{
    const skip = webgpuSkipReason();
    if (skip) { console.log(`  SKIP  ${skip}`); report("*** NOT A PASS. ***"); fails++; }
    else {
        // the camera looks INTO the crater from the lane, at the revealed steel's centroid (node's, from section 3): a first draft
        // looked at the building from up and aside, and the six rebar voxels on the crater's inner faces were behind its rim
        const rect = hitG.rects[RAM]; const rv = []; for (let x = rect.x; x < rect.x + rect.w; x++) for (let z = rect.z; z < rect.z + rect.d; z++) for (let y = 1; y <= rect.h; y++) if (hitG.world.voxelAt(x, y, z) === D.REBAR_ID) rv.push([x + 0.5, y + 0.5, z + 0.5]);
        const target = rv.length ? rv.reduce((a, p) => [a[0] + p[0] / rv.length, a[1] + p[1] / rv.length, a[2] + p[2] / rv.length], [0, 0, 0]) : [rect.x + 1, 2, rect.z + rect.d / 2];
        const eye = [rect.x - 8, target[1] + 2.5, target[2]];
        const r = await runInEngineOrigin({ engineRoot: ENG, timeoutMs: 120000, args: { W, H, seed: SEED, ram: RAM, eye, target, from: FROM }, script: `async (a) => {
            const step = (w) => { globalThis.__swekStep = w; console.log("[swek-step] " + w); };
            const { requestDevice } = await import("/gfx/device.js"); const G = await import("/render/gpuDriven.mjs"); const L = await import("/render/litSphere.mjs");
            const D = await import("/world/crashDamage.mjs"); const T = await import("/world/raceTrack.mjs"); const C = await import("/physics/raceCar.mjs");
            const { CityGen } = await import("/world/CityGen.js"); const { VoxelDebrisSystem } = await import("/world/voxelDebrisSystem.js");
            const E = await import("/render/voxelDeviceEdit.mjs");
            const { box3d } = await import("/physics/box3d/box3dLoader.js"); const { worldFromModule } = await import("/render/slugTicker.mjs");
            const within = (ms, what, p) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(what + " did not resolve in " + ms + " ms")), ms))]);
            const b64 = (u8) => { let s = ""; for (let i = 0; i < u8.length; i += 8192) s += String.fromCharCode.apply(null, u8.subarray(i, i + 8192)); return btoa(s); };
            const quiet = console.log; console.log = (...m) => { if (!/^\\\\[CityGen\\\\]/.test(String(m[0]))) quiet(...m); };
            step("box3d.init"); const st = await box3d.init(); if (!st.ready) return { error: "box3d: " + st.reason };
            const track = T.generateTrack({ seed: a.seed }), surface = C.trackSurface(track), out = { backends: {} };
            const vp = { viewProj: G.multiply(G.perspective(0.9, a.W / a.H, 0.5, 600), G.lookAt(a.eye, a.target)), eye: a.eye };
            for (const bk of ["webgpu", "webgl2"]) {
                const cvs = document.createElement("canvas"); cvs.width = a.W; cvs.height = a.H; document.body.appendChild(cvs);
                let dev; step(bk + " requestDevice"); try { dev = await within(20000, bk + " requestDevice", requestDevice(cvs, { backend: bk, offscreen: bk === "webgpu" })); } catch (e) { out.backends[bk] = { error: e.message }; continue; }
                if (dev.backend !== bk) { out.backends[bk] = { error: "got " + dev.backend }; continue; }
                step(bk + " world"); const g = D.crashWorld(track, CityGen); D.buildingColliders(g, worldFromModule(box3d._mod, [0, -9.81, 0]));
                const debris = new VoxelDebrisSystem(), sc = D.crashScene(dev, g.state, debris, G, L);
                const shoot = async (scene) => { const raw = await within(30000, bk + " frame", scene.frame({ ...vp, read: true, clear: [0.03, 0.05, 0.08, 1] }).pixels); return raw.pixels; };
                const { car } = D.launch(g, a.ram, { speed: 15, from: a.from }); sc.setCar(C.carPose(g.phys, car));
                step(bk + " before"); const before = await shoot(sc.scene);
                let impact = null, h = 0x811c9dc5; const fold = (h0, v) => { let x = h0; for (let k = 0; k < 4; k++) { x ^= (v >>> (k * 8)) & 0xff; x = Math.imul(x, 0x01000193); } return x; };
                // full throttle, as node's ram() drives: a first draft coasted here and met the wall two voxels lighter
                for (let s = 0; s < 150 && !impact; s++) { const r = D.crashStep(g, car, surface, { throttle: 1, steer: 0, brake: 0 }, { debris }); h = fold(h, g.phys.stateHash()); if (r.impact) impact = r.impact; }
                for (let k = 0; k < 6; k++) debris.update(1 / 60); sc.setCar(C.carPose(g.phys, car));
                step(bk + " after"); const after = await shoot(sc.scene);
                for (let k = 0; k < 120; k++) debris.update(1 / 60); const gone = await shoot(sc.scene);
                // a fresh pack of the same carved world (the twin picture), and the same world with its steel turned back to stone
                const fresh = D.crashScene(dev, E.editState(g.world), new VoxelDebrisSystem(), G, L); fresh.setCar(C.carPose(g.phys, car)); const full = await shoot(fresh.scene);
                const rect = g.rects[a.ram]; let steel = 0; for (let x = rect.x; x < rect.x + rect.w; x++) for (let z = rect.z; z < rect.z + rect.d; z++) for (let y = 1; y <= rect.h; y++) if (g.world.voxelAt(x, y, z) === D.REBAR_ID) { g.world.setVoxel(x, y, z, 1); steel++; }
                const stone = D.crashScene(dev, E.editState(g.world), new VoxelDebrisSystem(), G, L); stone.setCar(C.carPose(g.phys, car)); const noSteel = await shoot(stone.scene);
                out.backends[bk] = { path: sc.scene.path, impact: impact ? { removed: impact.removed, lost: impact.lost, hp: impact.hp, rebar: impact.rebar, dv: impact.dv, debris: impact.debris } : null, steel, before: b64(before), after: b64(after), gone: b64(gone), full: b64(full), noSteel: b64(noSteel), fleets: sc.scene.fleetCount };
                if (bk === "webgpu") { try { dev.destroy(); } catch (e) {} }
            }
            step("done");
            return out;
        }` });
        if (!r.ok || !r.result || r.result.error) ok("the browser built, rammed and drew", false, (r.result && r.result.error) || r.reason || (r.pageErrors || []).join(" | "));
        else {
            const decode = (s) => Uint8Array.from(Buffer.from(s, "base64")), N = W * H;
            const apart = (A, B) => { let n = 0; for (let p = 0; p < N; p++) if (Math.abs(A[p * 4] - B[p * 4]) > 8 || Math.abs(A[p * 4 + 1] - B[p * 4 + 1]) > 8 || Math.abs(A[p * 4 + 2] - B[p * 4 + 2]) > 8) n++; return n; };
            const px = {};
            for (const bk of ["webgpu", "webgl2"]) {
                const row = r.result.backends[bk];
                if (!row || row.error) { ok(`${bk}: rendered`, false, row && row.error); continue; }
                px[bk] = { before: decode(row.before), after: decode(row.after), gone: decode(row.gone), full: decode(row.full), noSteel: decode(row.noSteel) };
                const P = px[bk];
                report(`${bk} (${row.path}, ${row.fleets} fleets): impact ${row.impact ? `${row.impact.removed} removed, hp ${row.impact.hp}, ${row.impact.rebar} rebar` : "NONE"}; before vs after ${apart(P.before, P.after)} apart, after vs fresh pack ${apart(P.after, P.full)}, gone vs fresh ${apart(P.gone, P.full)}, fresh vs no-steel ${apart(P.full, P.noSteel)} (${row.steel} steel voxels turned to stone)`);
                ok(`${bk}: *** the page's wasm rams to node's record: the same voxels removed, the same hit points, the same rebar ***`, row.impact && hitRec && row.impact.removed === hitRec.removed && row.impact.hp === hitRec.hp && row.impact.rebar === hitRec.rebar, row.impact ? `${row.impact.removed} / ${row.impact.hp} / ${row.impact.rebar}` : "no impact");
                ok(`${bk}: *** the frame after the impact differs from the one before, and the debris is on it: two seconds later it is EXACTLY a fresh pack of the carved world ***`, apart(P.before, P.after) > 30 && apart(P.after, P.gone) > 10 && apart(P.gone, P.full) === 0, `${apart(P.before, P.after)} / ${apart(P.after, P.gone)} / ${apart(P.gone, P.full)}`);
                ok(`${bk}: *** the steel is on the picture: the carved world with its rebar turned back to stone draws differently ***`, row.steel > 0 && apart(P.full, P.noSteel) > 0, `${apart(P.full, P.noSteel)} pixels from ${row.steel} voxels`);
            }
            if (px.webgpu && px.webgl2) ok("the two backends draw the carved world within 8 of 255 on all but edge pixels (under 3%)", apart(px.webgpu.gone, px.webgl2.gone) < N * 0.03, `${apart(px.webgpu.gone, px.webgl2.gone)} apart`);
        }
        // the page, in its own browser (v4528's finding)
        const rp = await runInEngineOrigin({ engineRoot: ENG, timeoutMs: 60000, script: `async () => {
            const f = document.createElement("iframe"); f.style.width = "900px"; f.style.height = "600px"; f.src = "/race-crash.html?webgl=1&ram=1"; document.body.appendChild(f);
            const pt = performance.now(); let d = null;
            while (performance.now() - pt < 30000) { await new Promise((r) => setTimeout(r, 250)); d = f.contentDocument; const el = d && d.getElementById("city"); if (el && /impacts [1-9]/.test(el.textContent)) break; }
            const txt = (id) => { const el = d && d.getElementById(id); return el ? el.textContent : ""; };
            return { be: txt("be"), tick: txt("tick"), city: txt("city"), car: txt("car"), pageMs: performance.now() - pt };
        }` });
        sec("8. THE PAGE: race-crash.html in its own browser, ramming on load");
        if (!rp.ok) ok("the page loaded", false, rp.reason);
        else {
            const p = rp.result;
            report(`${p.be} | ${p.tick.slice(0, 100)} | ${p.city.slice(0, 200)} | ${p.car.slice(0, 100)} (${p.pageMs.toFixed(0)} ms)`);
            ok("*** the page rams a building on load and names it: an impact, voxels removed, hit points, rebar revealed, debris ***", /device: webgl2/.test(p.be) && /impacts [1-9]/.test(p.city) && /voxels removed/.test(p.city) && /rebar/.test(p.city) && /standing/.test(p.city) && /fingerprint [0-9a-f]{8}/.test(p.car), p.city.slice(0, 120));
        }
    }
}

console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nall checks pass");
console.log("unchecked here: the collider shrinking with the crater (the static box stands until the topple; the blast deepens along the heading instead); debris that collides (the sandbox's does not either); the brain driving into buildings (the ram is a launch); CityGen's crumble side-bite direction, which is Math.random and not the seed's (the first impact's voxels are deterministic; a second bite's are not).");
process.exit(fails ? 1 : 0);
