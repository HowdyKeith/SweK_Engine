// WebGLEngine/tools/ship/raceTurret-selfcheck.mjs -- v4588 (task 77): the turret copilot on race-brain.html
//
// Run: node tools/ship/raceTurret-selfcheck.mjs
//
// THE PAGE HALF of the turret round. physics/turret-selfcheck.mjs holds the mount and the shells, brain/gunnerPolicy-selfcheck.mjs
// holds the gunner, the duel, the knob and the race in node; this gate holds what a person sees: render/raceTurret.mjs's fleets
// and placements (pure), the browser running THE SAME race with gunners on its own wasm to node's fingerprint, the turret fleets
// drawing something on both backends (a frame with the turrets placed differs from one with them parked), and race-brain.html
// itself in the harness -- the page boots, says there is a turret on each car, and after a few seconds of the race its standings
// carry hits. Over the ship-time budget, as every page-boot gate of the racing line is (drivePolicy 63 s, raceKnob 33 s).
//
// v4681 -- SECTION 4: THE WORLD THE PAGE DRAWS IS EDITABLE. race-brain.html draws its city from world/crashDamage.mjs's worldFleet (the
// editable chunk slots) instead of baking it once, so a shell that carves a building (shellInto, through turretTick) is on the picture
// the frame it lands. Section 4 holds that in the page's own scene configuration on both backends -- a barrage's crater is on the
// picture and is EXACTLY a fresh pack of the carved world, a chunk that outgrows its slot is flagged and the scene built again from
// the repack draws it, an edit after the rebuild still reaches the picture -- and on the live page, on BOTH backends (WebGPU through
// ?offscreen=1, race-brain.html's hook for a device that never presents; the harness loses a presented WebGPU canvas): ?shell=12 lands a
// barrage with no repack, a repack forced from outside is answered by the PAGE building its scene again, a rebuild under a window
// readback in flight is not counted against the 3D windows, and each 3D window holds a picture read back on that backend. The two
// backends read the same pixels off the live page (54,363 for the voxels, 1,071 for the edit after the rebuild).
//
// SABOTAGE LOG -- v4588, each applied to the file named, the gate run (both harness browsers), the file restored.
//   A  render/raceTurret.mjs: the barrel record written at the dome's scale       -> 1 red: the placement row.
//   B  render/raceTurret.mjs: the barrel mesh half its length                     -> 1 red: the mesh spans [0, barrel].
//   C  race-brain.html: the page never ticking the turrets                         -> 1 red: hits 0 0 0 0 on the page.
//   D  race-brain.html: the scene without the turret fleets                        -> 2 red: the placements write past the
//      scene's records, the frame loop throws, the standings never carry hits.
// SABOTAGE LOG -- v4681 (section 4), each applied to the file named, the gate run, the file restored.
//   E  race-brain.html: the page never building the scene again on state.outgrown       -> 2 red: the page's answer to a repack, and the
//      rebuilt scene's picture (the cloud and the edit after it).
//   F  race-brain.html: buildScene() without wf.install(scene)                            -> 3 red: the boot row, the page's answer (nothing is
//      attached to flag an outgrown slot, so the flag is never raised) and the rebuilt-scene row.
//   G  race-brain.html: crashWorld without CD.ROOMY                                       -> 2 red: the boot row (a 12-shell barrage repacks the
//      world, the scene is built twice by the time the page has booted) and the page's answer (its scene counts are off by one).
//   H  world/crashDamage.mjs: the proxy writing the slot without the unit-space rescale   -> 4 red: both backends' "EXACTLY a fresh pack" and
//      "an edit AFTER the rebuild" rows (32,300 and 97,258 pixels apart).
//   I  race-brain.html: refreshViews without its era guard                                -> 1 red: "a rebuild under a window readback in flight is
//      NOT counted as a failed readback" -- the gate makes the old scene's pending window reads fail, and the page's note reads "view windows off".
//   R  race-brain.html: ?offscreen=1 asking WebGPU for a PRESENTED device (the hook ignored)  -> 1 red: the WebGPU page's boot row (mapAsync:
//      "A valid external Instance reference no longer exists" -- the harness lost the device at the first presented frame) and the page half
//      reports it did not run.
//   S  race-brain.html: refreshViews never putting a window's pixels (putImageData off)   -> 2 red: each backend's "3D car windows each hold a
//      picture" row (0.000 lit in all four after 20 s).
//   FINDING, in the page half's first draft: it read the live page's scene back with a camera built OUT HERE and a frame handed to the iframe.
//   The iframe's frame() takes viewProj and eye through its own realm's typed arrays; a matrix from this realm is not one, so the page kept its
//   LAST camera -- a car window's -- and every frame the gate read back was a first-person view of a street. An edit that moves 1,071 px read 0,
//   carving a whole building read 169 then 0, and a page left to run drifted by thousands of pixels with nothing done to it (a control run
//   with no edit at all drifted as much as the edited one). The camera is built from the iframe's Float32Array and Array now, and the page's
//   frame loop is stopped (requestAnimationFrame stubbed) after the rebuild so the picture is a function of the world alone.
//   FINDING, in the first draft of this gate: the page was booted in an iframe INSIDE the harness page that had just run the
//   race and drawn two device frames. It passed once and then froze that page's main thread past 300 s twice (the harness's
//   probe: "main thread frozen or renderer gone"); in a browser of its own, with a 400 x 300 canvas, the page boots in about
//   half a second and the whole gate runs in 11 s. The split is the fix, and the step markers (globalThis.__swekStep) are so
//   the next freeze names its step.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInEngineOrigin, webgpuSkipReason } from "./webgpuHarness.mjs";
import { initNode, mod } from "../../physics/box3d/box3dNode.mjs";
import { worldFromModule } from "../../render/slugTicker.mjs";
import * as D from "../../brain/drivePolicy.mjs";
import * as G from "../../brain/gunnerPolicy.mjs";
import * as U from "../../physics/turret.mjs";
import * as RT from "../../render/raceTurret.mjs";
import * as L from "../../render/litSphere.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const report = (s) => console.log(`  ----  ${s}`);
const sec = (s) => console.log("\n" + s);
const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;   // the records and meshes are Float32Arrays: 0.9 reads back as 0.89999997
const quiet = () => { const log = console.log; console.log = (...a) => { if (!/\[GLBParser\]|\[box3d\]|\[CityGen\]/.test(String(a[0]))) log(...a); }; };
quiet();
console.log("raceTurret-selfcheck -- the turret copilot on the race page: the fleets, the browser's lockstep, the page");

sec("1. THE FLEETS AND THE PLACEMENTS (pure)");
{
    const fleets = RT.turretFleets(3, U.TURRET.barrel, L, { light: [600, 1400, 400, 0.38] });
    ok("three fleets for three cars: domes, barrels, shells, with parked records and identity quaternions", fleets.length === 3 && fleets.map((f) => f.name).join() === "turret-domes,turret-barrels,shells" && fleets[0].records.length === 12 && fleets[2].records.length === RT.TURRET_DRAW.maxShells * 4 && fleets[0].records[1] === RT.TURRET_DRAW.park[1] && fleets[0].extras[3] === 1);
    const bm = RT.barrelMesh(U.TURRET.barrel); let zMin = Infinity, zMax = -Infinity, xMax = 0;
    for (let i = 0; i < bm.positions.length; i += 3) { zMin = Math.min(zMin, bm.positions[i + 2]); zMax = Math.max(zMax, bm.positions[i + 2]); xMax = Math.max(xMax, Math.abs(bm.positions[i])); }
    ok("!! the barrel mesh spans exactly [0, barrel] along +z at scale 1 (to float32), so the drawn muzzle is the physics muzzle", near(zMin, 0) && near(zMax, U.TURRET.barrel) && near(xMax, RT.TURRET_DRAW.barrelSide / 2), `z in [${zMin}, ${zMax.toFixed(6)}], half-side ${xMax.toFixed(6)}`);
    const base = 7, n = 3, scene = { kitRecords: new Float32Array((base + 2 * n + RT.TURRET_DRAW.maxShells) * 4), kitExtras: new Float32Array((base + 2 * n + RT.TURRET_DRAW.maxShells) * 4) };
    const poses = [0, 1, 2].map((i) => ({ pos: [i * 5, 1, 0], quat: [0, 0, 0, 1], yaw: 0, vel: [0, 0, 0] })), turrets = poses.map(() => U.createTurret()); turrets[1].yaw = 0.5;
    const shells = [{ x: 1, y: 2, z: 3 }, { x: 4, y: 5, z: 6 }];
    const lay = RT.placeTurrets(scene, base, poses, turrets, shells);
    const R = scene.kitRecords, mz1 = U.muzzle(poses[1], turrets[1]);
    ok("!! the dome sits at the pivot at domeScale, the barrel at the pivot at scale 1 with the turret's quaternion, the shells in their slots, the rest parked",
        lay.domes === base && lay.barrels === base + n && lay.shells === base + 2 * n && near(R[base * 4 + 3], RT.TURRET_DRAW.domeScale) && R[(base + n) * 4 + 3] === 1 &&
        near(R[(base + 1) * 4], mz1.pivot[0]) && near(scene.kitExtras[(base + n + 1) * 4 + 1], mz1.quat[1]) &&
        R[(base + 2 * n) * 4] === 1 && R[(base + 2 * n + 1) * 4 + 2] === 6 && R[(base + 2 * n + 2) * 4 + 1] === RT.TURRET_DRAW.park[1] && near(R[(base + 2 * n + 1) * 4 + 3], RT.TURRET_DRAW.shellScale),
        `dome scale ${R[base * 4 + 3].toFixed(4)}, barrel scale ${R[(base + n) * 4 + 3]}, shell slots ${R[(base + 2 * n) * 4]}, ${R[(base + 2 * n + 1) * 4 + 2]}, parked ${R[(base + 2 * n + 2) * 4 + 1]}`);
}

sec("2. NODE: THE RACE WITH GUNNERS, TEN SECONDS, THREE CARS");
const st = await initNode();
if (!st.ready) { console.log("  FAIL  box3d wasm: " + st.reason); console.log("\nraceTurret-selfcheck: 1 FAILED"); process.exit(1); }
const m = mod(), worldFrom = () => worldFromModule(m, [0, -9.81, 0]), fleet = D.machineFingerprint(m);
const drivers = [D.handWeights(), D.handWeights({ speed: 0.8 }), D.zeroWeights()], gunners = [G.handWeights(), G.handWeights(), G.zeroWeights()];
const nodeRace = G.raceWithGunners(worldFrom, drivers, gunners, { seed: 1, seconds: 10, fleet });
report(`node: fingerprint ${nodeRace.fingerprint}, order ${nodeRace.order.join(" > ")}, hits ${nodeRace.results.map((q) => q.hits + "/" + q.shots).join(" ")}`);
ok("the hand gunners hit in ten seconds and the zero gunner never fires", nodeRace.results[0].hits + nodeRace.results[1].hits > 0 && nodeRace.results[2].shots === 0);

sec("3. THE BROWSER: THE SAME RACE TO NODE'S FINGERPRINT, THE TURRETS DRAWN ON BOTH BACKENDS, THE PAGE ITSELF");
{
    const skip = webgpuSkipReason();
    if (skip) { console.log(`  SKIP  ${skip}`); report("*** NOT A PASS. ***"); fails++; }
    else {
        const W = 400, H = 400;
        const r = await runInEngineOrigin({ engineRoot: ENG, timeoutMs: 300000, args: { W, H, drivers: drivers.map((w) => Array.from(w)), gunners: gunners.map((w) => Array.from(w)), fleet }, script: `async (a) => {
            const { requestDevice } = await import("/gfx/device.js");
            const Gd = await import("/render/gpuDriven.mjs");
            const L = await import("/render/litSphere.mjs");
            const K = await import("/world/kenneyKit.mjs");
            const T = await import("/world/raceTrack.mjs");
            const C = await import("/physics/raceCar.mjs");
            const D = await import("/brain/drivePolicy.mjs");
            const G = await import("/brain/gunnerPolicy.mjs");
            const U = await import("/physics/turret.mjs");
            const RT = await import("/render/raceTurret.mjs");
            const V = await import("/render/voxelDevice.mjs");
            const { CityGen } = await import("/world/CityGen.js");
            const { box3d } = await import("/physics/box3d/box3dLoader.js");
            const { worldFromModule } = await import("/render/slugTicker.mjs");
            const { W, H } = a, out = {};
            globalThis.__swekStep = "box3d init";
            const ps = await box3d.init(); if (!ps.ready) return { error: "box3d: " + ps.reason };
            const worldFrom = () => worldFromModule(box3d._mod, [0, -9.81, 0]);
            const t0 = performance.now();
            const R = G.raceWithGunners(worldFrom, a.drivers.map((w) => Float32Array.from(w)), a.gunners.map((w) => Float32Array.from(w)), { seed: 1, seconds: 10, fleet: a.fleet });
            out.race = { fingerprint: R.fingerprint, order: R.order, hits: R.results.map((q) => q.hits), shots: R.results.map((q) => q.shots), ms: performance.now() - t0 };
            // one frame with the turrets placed against one with them parked, on both backends
            const readBytes = async (p) => { const r = await fetch("/" + p); if (!r.ok) throw new Error(p + ": HTTP " + r.status); return r.arrayBuffer(); };
            const readImage = async (p) => { const r = await fetch("/" + p); if (!r.ok) throw new Error(p + ": HTTP " + r.status); const bmp = await createImageBitmap(await r.blob(), { colorSpaceConversion: "none", premultiplyAlpha: "none" }); const cv = document.createElement("canvas"); cv.width = bmp.width; cv.height = bmp.height; const cx = cv.getContext("2d"); cx.drawImage(bmp, 0, 0); return K.imageToColormap(cx.getImageData(0, 0, bmp.width, bmp.height)); };
            globalThis.__swekStep = "loading the kit";
            const kit = await K.loadKit("racing", { readBytes, readImage, baseUrlOf: (p) => new URL("/" + p, location.href).href });
            const track = T.generateTrack({ seed: 1 }), placements = T.tilePlacements(track), world = V.miniWorld(); T.trackWorld(track, world, CityGen); const packed = V.meshWorld(world);
            const files = ["vehicle-truck-red.glb", "vehicle-truck-green.glb", "vehicle-truck-yellow.glb"], poses = R.results.map((q) => q.pose), trucks = poses.map((p, i) => ({ file: files[i], ...C.truckPlacement(p) }));
            const turrets = poses.map(() => U.createTurret()); turrets[0].yaw = 0.7; turrets[1].pitch = 0.4;
            const shells = [{ x: poses[0].pos[0], y: poses[0].pos[1] + 2, z: poses[0].pos[2] }];
            const lead = poses[R.order[0]].pos, eye = [lead[0] + 6, lead[1] + 5, lead[2] + 9], cam = { viewProj: Gd.multiply(Gd.perspective(0.9, W / H, 0.3, 800), Gd.lookAt(eye, [lead[0], lead[1] + 1, lead[2]])), eye };
            for (const backend of ["webgpu", "webgl2"]) {
                const cv = document.createElement("canvas"); cv.width = W; cv.height = H;
                const dev = await requestDevice(cv, { backend, offscreen: backend === "webgpu" });
                const errs = []; if (dev.gpu && dev.gpu.addEventListener) dev.gpu.addEventListener("uncapturederror", (e) => errs.push(String(e.error && e.error.message).slice(0, 300)));
                const worldFleet = { name: "world", mesh: packed.mesh, pipeline: L.litPipelineDesc({ cull: "none" }), bind: L.litBind(V.SUN), records: Float32Array.from([0, 0, 0, 1]), extras: new Float32Array(4) };
                const base = placements.length + trucks.length + 1;
                const sc = K.kitScene(dev, kit, [...placements, ...trucks], Gd, L, { light: V.SUN, dynamic: true, extraFleets: [worldFleet, ...RT.turretFleets(poses.length, U.TURRET.barrel, L, { light: V.SUN })] });
                const parked = await sc.frame({ ...cam, read: true, clear: [0, 0, 0, 1] }).pixels;
                RT.placeTurrets(sc, base, poses, turrets, shells);
                const placed = await sc.frame({ ...cam, read: true, clear: [0, 0, 0, 1] }).pixels;
                let diff = 0; for (let p = 0; p < W * H; p++) if (Math.abs(parked.pixels[p * 4] - placed.pixels[p * 4]) > 8 || Math.abs(parked.pixels[p * 4 + 1] - placed.pixels[p * 4 + 1]) > 8 || Math.abs(parked.pixels[p * 4 + 2] - placed.pixels[p * 4 + 2]) > 8) diff++;
                out[backend] = { path: sc.path, errs, diff };
                sc.destroy(); dev.destroy();
            }
            globalThis.__swekStep = "frames done";
            return out;
        }` });
        // the page in a browser of its own: a full race page (the kit, CityGen, box3d, a WebGPU canvas drawn every frame in
        // software) beside the race and the two device frames froze the harness's main thread past 300 s on this box twice
        // after passing once; a fresh browser and a 400 x 300 canvas keep the page's own frames cheap enough to answer
        const pg = await runInEngineOrigin({ engineRoot: ENG, timeoutMs: 300000, args: {}, script: `async () => {
            globalThis.__swekStep = "booting race-brain.html in an iframe";
            const f = document.createElement("iframe"); f.style.width = "400px"; f.style.height = "300px"; f.src = "/race-brain.html"; document.body.appendChild(f);
            await new Promise((res) => { f.onload = res; });
            const doc = f.contentDocument, txt = (id) => (doc.getElementById(id) || {}).textContent || "";
            const t1 = performance.now(); while (performance.now() - t1 < 150000 && !/a turret on each/.test(txt("tick")) && !/threw|HTTP/.test(txt("be") + txt("tick"))) { globalThis.__swekStep = "waiting for the page: " + txt("tick").slice(0, 80); await new Promise((res) => setTimeout(res, 250)); }
            const booted = /a turret on each/.test(txt("tick")), tBoot = performance.now() - t1;
            globalThis.__swekStep = "booted in " + tBoot.toFixed(0) + " ms, racing";
            const t2 = performance.now(); while (performance.now() - t2 < 8000) await new Promise((res) => setTimeout(res, 250));
            return { booted, tBoot, be: txt("be").slice(0, 200), tick: txt("tick").slice(0, 300), gun: txt("gun").slice(0, 200), racing: txt("racing").slice(0, 400) };
        }` });
        ok("the harness ran the race and drew two frames per backend", r.ok && r.result && !r.result.error && r.result.race && r.result.webgpu && r.result.webgl2, r.ok ? (r.result && r.result.error) || "" : String(r.reason || r.error || JSON.stringify(r)).slice(0, 300));
        ok("...and, in a browser of its own, booted race-brain.html", pg.ok && pg.result && pg.result.booted, pg.ok ? `booted in ${pg.result && pg.result.tBoot != null ? pg.result.tBoot.toFixed(0) : "?"} ms: ${pg.result ? pg.result.be.slice(0, 120) : ""}` : String(pg.reason || JSON.stringify(pg)).slice(0, 300));
        if (r.ok && r.result && r.result.race) {
            const R = r.result;
            report(`the browser raced 10 s in ${R.race.ms.toFixed(0)} ms: fingerprint ${R.race.fingerprint} (node ${nodeRace.fingerprint}), hits ${R.race.hits.join("/")}`);
            ok("!! *** the browser's race with gunners is node's: the same fingerprint, order and hits on the browser's wasm ***", R.race.fingerprint === nodeRace.fingerprint && R.race.order.join() === nodeRace.order.join() && R.race.hits.join() === nodeRace.results.map((q) => q.hits).join());
            for (const bk of ["webgpu", "webgl2"]) {
                const b = R[bk] || {};
                ok(`!! ${bk}: the turrets and a shell DRAW -- the frame with them placed differs from the parked frame, with no device error`, b.errs && b.errs.length === 0 && b.diff > 40, `${b.diff} pixels differ${b.errs && b.errs.length ? "; errors: " + b.errs.join(" | ") : ""} (${b.path})`);
            }
        }
        if (pg.ok && pg.result) {
            const p = pg.result;
            ok("!! race-brain.html boots with a turret on each car and, eight seconds in, its standings carry hits", p.booted && /hits of/.test(p.racing) && /hand gunner/.test(p.gun), `${p.tick.slice(0, 120)} | ${p.racing.slice(0, 200)}`);
            const hits = [...(p.racing || "").matchAll(/(\d+) hits of (\d+)/g)].map((mm) => +mm[1]);
            ok("...and at least one shell landed on the page in that time", hits.length >= 3 && hits.reduce((a, b) => a + b, 0) >= 1, `hits ${hits.join(" ")}`);
        }
    }
}

sec("4. THE WORLD IS EDITABLE (v4681): A SHELL'S CRATER IS ON THE PICTURE IN THE PAGE'S SCENE, AND A REPACK REBUILDS IT");
{
    const skip = webgpuSkipReason();
    if (skip) { console.log(`  SKIP  ${skip}`); report("*** NOT A PASS. ***"); fails++; }
    else {
        // race-brain.html draws its world from world/crashDamage.mjs's worldFleet, through the same kitScene its tiles, trucks and turrets
        // ride in, and writes a shell's crater into it in place (shellInto -> remeshChunks -> the proxy -> the fleet's vertex buffer). Two
        // browsers, as section 3 has: the SCENE CONFIGURATION on both backends (an offscreen device each: WebGPU cannot be read back from
        // the page's own presented canvas on this harness), and the PAGE ITSELF on WebGL2 with a repack forced from outside.
        const W = 320, H = 320;
        const r = await runInEngineOrigin({ engineRoot: ENG, timeoutMs: 300000, args: { W, H }, script: `async (a) => {
            const { requestDevice } = await import("/gfx/device.js");
            const Gd = await import("/render/gpuDriven.mjs"), L = await import("/render/litSphere.mjs"), K = await import("/world/kenneyKit.mjs"), T = await import("/world/raceTrack.mjs");
            const C = await import("/physics/raceCar.mjs"), U = await import("/physics/turret.mjs"), RT = await import("/render/raceTurret.mjs"), V = await import("/render/voxelDevice.mjs");
            const E = await import("/render/voxelDeviceEdit.mjs"), VD = await import("/render/voxelDamage.mjs"), D = await import("/world/crashDamage.mjs");
            const { CityGen } = await import("/world/CityGen.js");
            const quietLog = console.log; console.log = (...m) => { if (!/^\\\\[CityGen\\\\]/.test(String(m[0]))) quietLog(...m); };
            const b64 = (u8) => { let s = ""; for (let i = 0; i < u8.length; i += 8192) s += String.fromCharCode.apply(null, u8.subarray(i, i + 8192)); return btoa(s); };
            const readBytes = async (p) => { const r = await fetch("/" + p); if (!r.ok) throw new Error(p + ": HTTP " + r.status); return r.arrayBuffer(); };
            const readImage = async (p) => { const r = await fetch("/" + p); if (!r.ok) throw new Error(p + ": HTTP " + r.status); const bmp = await createImageBitmap(await r.blob(), { colorSpaceConversion: "none", premultiplyAlpha: "none" }); const cv = document.createElement("canvas"); cv.width = bmp.width; cv.height = bmp.height; const ctx = cv.getContext("2d"); ctx.drawImage(bmp, 0, 0); return K.imageToColormap(ctx.getImageData(0, 0, bmp.width, bmp.height)); };
            globalThis.__swekStep = "loading the kit";
            const kit = await K.loadKit("racing", { readBytes, readImage, baseUrlOf: (p) => new URL("/" + p, location.href).href });
            const track = T.generateTrack({ seed: 1 }), placements = T.tilePlacements(track), cp = T.checkpoints(track)[0];
            const files = ["vehicle-truck-red.glb", "vehicle-truck-green.glb", "vehicle-truck-yellow.glb", "vehicle-truck-purple.glb"];
            const trucks = files.map((file, i) => ({ file, ...C.truckPlacement({ pos: [cp.x + 5 - 4 * i, 1.2, cp.z], quat: [0, Math.SQRT1_2, 0, Math.SQRT1_2] }) }));
            const out = {};
            for (const backend of ["webgpu", "webgl2"]) {
                globalThis.__swekStep = backend + " device";
                const cv = document.createElement("canvas"); cv.width = a.W; cv.height = a.H;
                const dev = await requestDevice(cv, { backend, offscreen: backend === "webgpu" });
                const errs = []; if (dev.gpu && dev.gpu.addEventListener) dev.gpu.addEventListener("uncapturederror", (e) => errs.push(String(e.error && e.error.message).slice(0, 300)));
                // THE PAGE'S OWN RECIPE (race-brain.html's buildScene): the kit's placements and trucks, then the world fleet, the turrets, the slicks, the pickups
                const build = (state) => {
                    const wf = D.worldFleet(state, { light: V.SUN });
                    const sc = K.kitScene(dev, kit, [...placements, ...trucks], Gd, L, { light: V.SUN, dynamic: true, extraFleets: [wf, ...RT.turretFleets(4, U.TURRET.barrel, L, { light: V.SUN }), ...RT.slickFleets(L, { light: V.SUN }), ...RT.pickupFleets(L, { light: V.SUN })] });
                    wf.install(sc); return sc;
                };
                const g = D.crashWorld(track, CityGen, {}, D.ROOMY), rect = g.rects[0], mid = rect.z + rect.d / 2;
                const eye = [rect.x - 12, 6, mid + 5], cam = { viewProj: Gd.multiply(Gd.perspective(0.9, a.W / a.H, 0.5, 600), Gd.lookAt(eye, [rect.x, 3, mid])), eye, clear: [0.03, 0.05, 0.08, 1] };
                const shoot = async (sc) => b64((await sc.frame({ ...cam, read: true }).pixels).pixels);
                globalThis.__swekStep = backend + " before"; let sc = build(g.state); const before = await shoot(sc), builds0 = g.state.rebuilds;
                D.barrage(g, 0, { shells: 6, from: [rect.x - 20, mid] }); const after = await shoot(sc), repacksByShells = g.state.rebuilds - builds0;
                let fresh = build(E.editState(g.world, D.ROOMY)); const full = await shoot(fresh); fresh.destroy();
                // a lot of change at once, in front of the camera: isolated voxels, 36 vertices apiece, until one chunk's slot is outgrown
                globalThis.__swekStep = backend + " repack"; let placed = 0;
                for (let x = rect.x - 9; x <= rect.x - 4; x++) for (let z = rect.z - 1; z <= rect.z + 6; z++) for (let y = 1; y <= 7; y++) if ((x + y + z) % 2 === 0) { g.world.setVoxel(x, y, z, 1); placed++; }
                VD.syncDirty(g.state); const outgrown = g.state.outgrown === true, repacks = g.state.rebuilds;
                sc.destroy(); sc = build(g.state); const grown = await shoot(sc), clearedByRebuild = g.state.outgrown === false;
                // an edit AFTER the rebuild: it only reaches the picture if the new scene's world fleet was installed
                for (let x = rect.x - 8; x <= rect.x - 6; x++) for (let z = mid; z <= mid + 2; z++) for (let y = 3; y <= 5; y++) g.world.setVoxel(x, y, z, 2);
                VD.syncDirty(g.state); const after2 = await shoot(sc), repacksAfter = g.state.rebuilds;
                fresh = build(E.editState(g.world, D.ROOMY)); const full2 = await shoot(fresh); fresh.destroy(); sc.destroy();
                out[backend] = { path: sc.path, errs, before, after, full, grown, after2, full2, placed, outgrown, repacks, repacksByShells, clearedByRebuild, repacksAfter, writes: g.state.writes };
                if (backend === "webgpu") { try { dev.destroy(); } catch (e) {} }
            }
            globalThis.__swekStep = "done";
            return out;
        }` });
        if (!r.ok || !r.result || r.result.error) ok("the browser built the page's scene configuration and drew it", false, (r.result && r.result.error) || String(r.reason || r.error || (r.pageErrors || []).join(" | ")).slice(0, 400));
        else {
            const decode = (x) => Uint8Array.from(Buffer.from(x, "base64")), N = W * H;
            const apart = (A, B) => { let n = 0; for (let p = 0; p < N; p++) if (Math.abs(A[p * 4] - B[p * 4]) > 8 || Math.abs(A[p * 4 + 1] - B[p * 4 + 1]) > 8 || Math.abs(A[p * 4 + 2] - B[p * 4 + 2]) > 8) n++; return n; };
            for (const bk of ["webgpu", "webgl2"]) {
                const b = r.result[bk], px = {}; for (const k of ["before", "after", "full", "grown", "after2", "full2"]) px[k] = decode(b[k]);
                const d = { crater: apart(px.before, px.after), incremental: apart(px.after, px.full), cloud: apart(px.after, px.grown), edit: apart(px.grown, px.after2), twin2: apart(px.after2, px.full2) };
                report(`${bk} (${b.path}): crater ${d.crater} px, incremental vs fresh pack ${d.incremental}, ${b.placed} voxels placed -> repacked ${b.repacks - b.repacksByShells} time(s), rebuilt scene ${d.cloud} px from before, an edit after the rebuild ${d.edit} px, vs fresh pack ${d.twin2}; device errors ${b.errs.length}`);
                ok(`!! ${bk}: a barrage of shells carves the page's scene: the frame after differs from the one before, with ROOMY slots it repacks nothing, and no device error`, d.crater > 150 && b.repacksByShells === 0 && b.errs.length === 0, `${d.crater} pixels apart`);
                ok(`!! ${bk}: the crater written in place is EXACTLY a fresh pack of the carved world (the picture is the state)`, d.incremental === 0, `${d.incremental} pixels apart`);
                ok(`!! ${bk}: a chunk that outgrows its slot is flagged, not written -- and the scene built again from the repacked state draws it`, b.outgrown && b.repacks - b.repacksByShells >= 1 && b.clearedByRebuild && d.cloud > 150, `${b.placed} voxels, ${d.cloud} pixels`);
                ok(`!! ${bk}: an edit AFTER the rebuild still reaches the picture, exactly a fresh pack (the rebuilt scene's world fleet was installed)`, d.edit > 20 && d.twin2 === 0 && b.repacksAfter === b.repacks, `${d.edit} px from the rebuilt frame, ${d.twin2} from a fresh pack`);
            }
        }

        for (const [bk, qs] of [["WebGL2", "webgl=1"], ["WebGPU", "offscreen=1"]]) {
            // the page itself, on BOTH backends (v4681: WebGPU through ?offscreen=1, the page's hook for a device that never presents -- this
            // harness loses a presented WebGPU canvas, gfx/device.js Level 11): ?shell=12 puts a barrage on the building nearest
            // the lead car; then a repack is forced from OUTSIDE (isolated voxels, synced), and the page must build its scene again by itself
            const pg = await runInEngineOrigin({ engineRoot: ENG, timeoutMs: 300000, args: { qs }, script: `async (a) => {
                const VD = await import("/render/voxelDamage.mjs"), Gd = await import("/render/gpuDriven.mjs");
                globalThis.__swekStep = "booting race-brain.html?" + a.qs + "&shell=12 in an iframe";
                const f = document.createElement("iframe"); f.style.width = "400px"; f.style.height = "300px"; f.src = "/race-brain.html?" + a.qs + "&shell=12"; document.body.appendChild(f);
                await new Promise((res) => { f.onload = res; });
                const doc = f.contentDocument, txt = (id) => (doc.getElementById(id) || {}).textContent || "", errs = []; f.contentWindow.addEventListener("error", (e) => errs.push(String(e.message).slice(0, 200)));
                const t1 = performance.now(); while (performance.now() - t1 < 150000 && !/a turret on each/.test(txt("tick")) && !/threw|HTTP/.test(txt("be") + txt("tick"))) await new Promise((res) => setTimeout(res, 250));
                const booted = /a turret on each/.test(txt("tick")); await new Promise((res) => setTimeout(res, 1500));
                const rb = f.contentWindow.__raceBrain, c = rb && rb.cityCtx, out = { booted, errs };
                if (!rb || !c) return { ...out, error: "no window.__raceBrain" };
                out.hud1 = txt("racing"); out.builds1 = rb.sceneBuilds; out.outgrown1 = c.state.outgrown; out.repacks1 = c.state.rebuilds; out.impacts = c.impacts.length;
                out.world1 = rb.scene.fleets.some((q) => q.name === "world");
                // THE CAR WINDOWS ARE READBACKS OF THE PAGE'S SCENE: every 3D window's canvas holds a picture (some of it is lit) on this backend.
                // They fill one readback at a time, so the gate waits for the last of them (WebGPU's take longer than WebGL2's) rather than reading too soon.
                const litOf = () => rb.views.filter((v) => v.view !== "brain").map((v) => { const d = v.ctx.getImageData(0, 0, v.canvas.width, v.canvas.height).data; let lit = 0; for (let p = 0; p < d.length; p += 4) if (Math.max(d[p], d[p + 1], d[p + 2]) > 60) lit++; return { view: v.view, lit: lit / (d.length / 4) }; });
                const tw = performance.now(); while (performance.now() - tw < 20000 && !(litOf().length && litOf().every((w) => w.lit > 0.05))) await new Promise((res) => setTimeout(res, 100));
                out.windows = litOf(); out.windowsMs = performance.now() - tw;
                const i = c.rects.findIndex((q) => { const b = c.city.buildingAt(q.x + 0.5, q.z + 0.5); return b && b.hp === b.maxHp; }), r0 = c.rects[i], mid = r0.z + r0.d / 2;
                // THE CAMERA IS BUILT IN THE IFRAME'S OWN REALM: its frame() reads viewProj and eye through instanceof/typed-array checks, and a
                // matrix made out here is another realm's Float32Array -- the page quietly kept its last camera (a car window's) and every
                // "frame" this gate read back was somebody else's picture. Measured: an edit that moved 1,071 px read 0, and a page left to
                // run seemed to drift by thousands of pixels with nothing changed.
                const IW = f.contentWindow, eye = [r0.x - 12, 6, mid + 5], target = rb.device.texture({ width: 256, height: 256, render: true });
                const vp = { viewProj: IW.Float32Array.from(Gd.multiply(Gd.perspective(0.9, 1, 0.5, 600), Gd.lookAt(eye, [r0.x, 3, mid]))), eye: IW.Array.from(eye), clear: IW.Array.from([0.03, 0.05, 0.08, 1]), target, read: true };
                const shot = async () => Uint8Array.from((await rb.scene.frame(vp).pixels).pixels), apartOf = (A, B) => { let n = 0; for (let p = 0; p < A.length; p += 4) if (Math.abs(A[p] - B[p]) > 8 || Math.abs(A[p + 1] - B[p + 1]) > 8 || Math.abs(A[p + 2] - B[p + 2]) > 8) n++; return n; };
                const P0 = await shot(); out.hasShell = c.impacts.length;
                // A READBACK IN FLIGHT WHEN THE SCENE IS REBUILT: the page's car windows read their views back every few frames, and a rebuild destroys
                // the scene those reads were issued on. Simulate what that does (the old scene's reads reject once it is gone) on every window read
                // that is pending at the moment of the rebuild -- three counted failures would switch the 3D windows off for good, so the page must
                // not count one that a rebuild caused.
                let pending = 0, rebuilt = false; const oldScene = rb.scene, origFrame = oldScene.frame;
                oldScene.frame = function (o) { const fr = origFrame.call(this, o); if (!o || !o.target || o.target === target) return fr; pending++; return { ...fr, pixels: fr.pixels.then(async (r) => { const t = performance.now(); while (!rebuilt && performance.now() - t < 8000) await new Promise((res) => setTimeout(res, 20)); if (rebuilt) throw new Error("simulated: the old scene was destroyed under this readback"); return r; }) }; };
                const t2 = performance.now(); while (pending === 0 && performance.now() - t2 < 8000) await new Promise((res) => setTimeout(res, 20)); out.pending = pending;
                let placed = 0; for (let x = r0.x - 9; x <= r0.x - 4; x++) for (let z = r0.z - 1; z <= r0.z + 6; z++) for (let y = 1; y <= 7; y++) if ((x + y + z) % 2 === 0) { c.world.setVoxel(x, y, z, 1); placed++; }
                VD.syncDirty(c.state); out.placed = placed; out.outgrownNow = c.state.outgrown;
                const e0 = txt("racing").match(/^([0-9.]+) s:/), builds0 = rb.sceneBuilds, t3 = performance.now(); while (rb.sceneBuilds === builds0 && performance.now() - t3 < 8000) await new Promise((res) => setTimeout(res, 20));
                rebuilt = true; await new Promise((res) => setTimeout(res, 1500)); out.viewsNote = txt("viewsNote");
                out.builds2 = rb.sceneBuilds; out.outgrown2 = c.state.outgrown; out.repacks2 = c.state.rebuilds; out.hud2 = txt("racing"); out.world2 = rb.scene.fleets.some((q) => q.name === "world");
                const e1 = txt("racing").match(/^([0-9.]+) s:/); out.t0 = e0 ? +e0[1] : null; out.t1 = e1 ? +e1[1] : null;
                // the page's own frame loop stops here, so the picture is a function of the world alone (cars, shells and real craters elsewhere in the race stop moving)
                IW.requestAnimationFrame = () => 0; await new Promise((res) => setTimeout(res, 400));
                const P1 = await shot(), P1b = await shot(); out.cloudApart = apartOf(P0, P1); out.noise = apartOf(P1, P1b);
                for (let x = r0.x - 8; x <= r0.x - 6; x++) for (let z = mid; z <= mid + 2; z++) for (let y = 3; y <= 5; y++) c.world.setVoxel(x, y, z, 2);
                VD.syncDirty(c.state); const P2 = await shot(); out.editApart = apartOf(P1b, P2); out.pixels = P1.length / 4; out.builds3 = rb.sceneBuilds;
                return out;
            }` });
            ok(bk + " -- ...and the PAGE boots with ?shell=12: the barrage landed on a building, the roomy slots took it without a repack, the world fleet is in the scene", pg.ok && pg.result && !pg.result.error && pg.result.booted && /buildings: 12 hits/.test(pg.result.hud1) && !/repack/.test(pg.result.hud1) && pg.result.builds1 === 1 && pg.result.repacks1 === 0 && pg.result.outgrown1 === false && pg.result.world1, pg.ok && pg.result ? `${pg.result.error || ""} ${(pg.result.hud1 || "").slice(-90)}; scene built ${pg.result.builds1}x` : String(pg.reason || JSON.stringify(pg)).slice(0, 300));
            if (pg.ok && pg.result && !pg.result.error) {
                const q = pg.result;
                report(bk + ": the 3D car windows (lit fraction, after " + q.windowsMs.toFixed(0) + " ms) " + q.windows.map((w) => w.view + " " + w.lit.toFixed(3)).join(", "));
                ok(bk + " -- the page's 3D car windows each hold a picture of its scene (more than a twentieth lit), read back on this backend", q.windows.length >= 2 && q.windows.every((w) => w.lit > 0.05), q.windows.map((w) => w.lit.toFixed(3)).join(" ") + ` after ${q.windowsMs.toFixed(0)} ms`);
                report(`${bk}: the page after ${q.placed} isolated voxels: outgrown ${q.outgrownNow} -> scene built ${q.builds1}x -> ${q.builds2}x, repacks ${q.repacks1} -> ${q.repacks2}, the rebuilt scene is ${q.cloudApart} px from the one before (noise ${q.noise}), an edit after the rebuild moved ${q.editApart} of ${q.pixels} pixels, clock ${q.t0} -> ${q.t1} s, page errors ${q.errs.length}`);
                ok(bk + " -- !! a chunk outgrowing its slot on the live page is answered by the PAGE: the flag was raised, the scene was built again by itself, the flag is clear and the world fleet is back", q.outgrownNow === true && q.builds2 === q.builds1 + 1 && q.outgrown2 === false && q.repacks2 === q.repacks1 + 1 && q.world2 && /1 repack/.test(q.hud2), `scene built ${q.builds1}x -> ${q.builds2}x; HUD ${(q.hud2 || "").slice(-70)}`);
                ok(bk + " -- ...and a rebuild under a window readback in flight is NOT counted as a failed readback: the 3D windows stay on (no 'view windows off' note) after the old scene's reads were made to fail", q.pending >= 1 && !/view windows off/.test(q.viewsNote || ""), `${q.pending} readback(s) pending at the rebuild; note: "${(q.viewsNote || "").slice(0, 80)}"`);
                ok(bk + " -- ...the rebuilt scene draws what repacked it (the isolated voxels light the frame), the race kept running through it, and an edit after it reaches the page's own picture", q.cloudApart > 1000 && q.noise === 0 && q.t1 > q.t0 && q.editApart > 300 && q.builds3 === q.builds2 && q.errs.length === 0, `${q.cloudApart} px for the voxels (noise ${q.noise}), clock ${q.t0} -> ${q.t1} s, ${q.editApart} px from the edit, ${q.errs.length} page errors`);
            } else report(bk + ": the page half did not run: " + String(pg.reason || (pg.result && pg.result.error) || JSON.stringify(pg)).slice(0, 300));
        }
    }
}

console.log(fails ? `\nraceTurret-selfcheck: ${fails} FAILED` : "\nraceTurret-selfcheck: all checks pass");
// v4663 -- process.exitCode, NOT process.exit: this gate compiles a wasm module, and exiting while V8's
// background compiler still has work posts a task into a torn-down platform. tools/ship/wasmTeardown.mjs.
process.exitCode = fails ? 1 : 0;
