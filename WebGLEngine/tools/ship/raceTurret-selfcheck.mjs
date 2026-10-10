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
// v4822 -- SECTION 4: THE WORLD THE PAGE DRAWS IS EDITABLE. race-brain.html draws its city from world/crashDamage.mjs's worldFleet (the
// editable chunk slots) instead of baking it once, so a shell that carves a building (shellInto, through turretTick) is on the picture
// the frame it lands. Section 4 holds that in the page's own scene configuration on both backends -- a barrage's crater is on the
// picture and is EXACTLY a fresh pack of the carved world, a chunk that outgrows its slot is flagged and the scene built again from
// the repack draws it, an edit after the rebuild still reaches the picture -- and on the live page, on BOTH backends (WebGPU through
// ?offscreen=1, race-brain.html's hook for a device that never presents; the harness loses a presented WebGPU canvas): ?shell=12 lands a
// barrage with no repack, a repack forced from outside is answered by the PAGE building its scene again, a rebuild under a window
// readback in flight is not counted against the 3D windows, each 3D window holds a picture read back on that backend, and the cubes a
// barrage bursts (render/voxelDamage.mjs's debris, a VoxelDebrisSystem on the city, drawn as the page's debris fleet) are on the picture,
// placed by the page's own frame loop and aged by its sim ticks; and a building the shells bring down is a box3d body in the page's physics
// world (world/buildingTopple.mjs, race-crash.html's since v4591), its block a reserved fleet in the page's scene: on the picture, still on it
// after the scene is built again, and shattered into rubble and cubes once it has fallen and rests. The two
// backends read the same pixels off the live page (54,363 for the voxels, 1,071 for the edit after the rebuild).
//
// SABOTAGE LOG -- v4588, each applied to the file named, the gate run (both harness browsers), the file restored.
//   A  render/raceTurret.mjs: the barrel record written at the dome's scale       -> 1 red: the placement row.
//   B  render/raceTurret.mjs: the barrel mesh half its length                     -> 1 red: the mesh spans [0, barrel].
//   C  race-brain.html: the page never ticking the turrets                         -> 1 red: hits 0 0 0 0 on the page.
//   D  race-brain.html: the scene without the turret fleets                        -> 2 red: the placements write past the
//      scene's records, the frame loop throws, the standings never carry hits.
// SABOTAGE LOG -- v4822 (section 4), each applied to the file named, the gate run, the file restored.
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
//   T  world/crashDamage.mjs: shellInto reading only ctx.debris, not the city's g.debris          -> in crashDamage-selfcheck.mjs, 1 red there.
//   U  race-brain.html: the frame loop never CD.placeDebris()ing                                   -> 2 red: each backend's "the cubes a shell bursts are
//      on the PAGE's picture" (0 px apart: the page's own loop never put them in the scene; the particles are alive, the HUD says 400).
//   V  race-brain.html: the debris system not hung on the city (cityCtx.debris unset)              -> 2 red: the same rows, 0 cubes live after the barrage.
//   X  race-brain.html: debris.update() never called                                               -> 2 red: each backend's "the cubes AGE" (age 0.0000 s
//      after 240 animation frames). A first version counted the cubes left a second later and PASSED this sabotage: the pool holds 400, a later
//      shell's burst evicts the oldest, and a page that never stepped its cubes looked as if it had -- the age of one particle is the measurement.
//   Z1 race-brain.html: BT.stepTopple never called                                                    -> 2 red: each backend's "a block fallen over and at rest SHATTERS".
//   Z2 race-brain.html: BT.placeBlocks never called                                                   -> 4 red: each backend's "the block is on the PAGE's picture"
//      (0 px apart) and "a scene built AGAIN ... still draws it".
//   Z3 race-brain.html: BT.bindKit never called (the block's mesh never reaches the scene)            -> 4 red: the same rows.
//   Z4 world/buildingTopple.mjs: bindKit writing only a block with no mesh yet                       -> 2 red: each backend's "a scene built AGAIN ... still draws it"
//      (the rebuilt scene's buffers are empty; the block stays invisible). Also buildingTopple-selfcheck.mjs's bind rows.
//   AA race-brain.html: no backpressure (the main view submitted every animation frame whether or not the last had finished)  -> 3 red, WebGPU: "the page does not
//      outrun its GPU" (3 reads in 12 s, the slowest minutes behind), and both rows downstream of a window read that never comes back.
//   AB race-brain.html: refreshViews without its readback watchdog (settleWithin)                  -> 4 red, both backends: "a window readback that NEVER settles ... is
//      given up on" and "a rebuild under a window readback in flight" (viewBusy held for the page's life, so no read is ever in flight again).
//   AC brain/gunnerPolicy.mjs: turretTick handing stepShells no blocks                             -> 2 red: each backend's "a shell dropped onto it hits the BLOCK".
//   AD world/buildingTopple.mjs: leanUp 0 (a block at rest and tilted never settles)               -> 2 red: each backend's "LEANING SHATTERS by itself" (the page's block rests
//      at up.y 0.969; the gate no longer lays it flat).
//   AE brain/gunnerPolicy.mjs: raceWithGunners's city race never calling BT.stepTopple          -> 1 red: "the demolition happened" (the block's pose is never read back, so it
//      never rests and never shatters: bodies 1, shattered 0). The fingerprints still agree between runtimes, as they would on any consistent bug.
//   AF world/buildingTopple.mjs: demolitionScript shooting at a Math.random() offset              -> 2 red: node's two runs differ (8b8598c4 / 5fb0e024) and the browser's fall
//      is not node's; the demolition row stays green, the shot still brings the building down.
//   AG world/buildingTopple.mjs: the chip not making the mesh again (the voxels come off the record, the picture does not) -> 2 red, each backend: "a cataclysm on the
//      falling block CHIPS it on the page" (61 removed, the hit points drop, 0 px apart). The node-level sabotages of the chip (L-P) are in world/buildingTopple-selfcheck.mjs.
//   FINDING, THE FLAKE IN "a rebuild under a window readback in flight" (0 pending, a window read busy, 1,201 page frames in 20 s) WAS NOT A HUNG READ AND NOT THE
//   GATE'S: it was a queue. WebGPU has no backpressure of its own and this harness's GPU is software; the page submitted a frame per animation frame to a device that
//   draws slower than that, so frames piled up and every window readback -- which resolves when the queue has drained to its own submission -- waited behind a deeper
//   queue than the last: 0.3, 0.9, 2.5, 4.1, 6.5 s over 33 s, until it looked stuck. Whether the gate's stage fell on a read still pending was a matter of how long the
//   page had been running (so: two flakes in about six runs, and none in the five that ran at idle with fewer stages). The page draws its main view only when the last
//   one it submitted has finished now (queue.onSubmittedWorkDone), and a window read takes 10 to 60 ms and comes round every four frames, 295 in twelve seconds; the
//   sim, the records and the pace of the race are untouched. The watchdog stays: a read that never settles is a counted failure after 5 s, uncounted when the scene
//   was built again under it.
//   FINDING, the "built AGAIN" row's first run read 306 px on WebGL2 where the first read 4,342: the rebuilt scene drew the city as it stood
//   BEFORE the shells -- the toppled building back in it -- because worldUnit() meshed state.mesh, the born pack (crashDamage-selfcheck.mjs Y).
//   FINDING, a block that stands on what the shells left (a 7 x 7 x 11 building on one remaining column leans, up.y 0.97, on its stub and the
//   road) never shatters: the page's block row lays it flat on the road with setTransform (fallen, up.y < 0.5) and lets the page's own
//   rest rule shatter it (263 / 174 rubble voxels, 88 cubes). The fall itself, box3d's, is held headless by world/buildingTopple-selfcheck.mjs.
//   FINDING, a first draft of the cubes row aimed at the LAST whole building and read 0 px apart: it was 7 x 3 x 5, and 400 cubes inside its own
//   crater are hidden by the wall around them. The biggest whole building shows them (about 3,000 px).
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
import * as BT from "../../world/buildingTopple.mjs";
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
// v4822 -- THE SAME RACE THROUGH A SCRIPTED DEMOLITION: the real city, shells into the biggest building's ground floor until CityGen topples it, the block a box3d body that
// tips, rests leaning, takes a shell dropped on it and shatters into rubble -- twelve seconds, three cars, the fingerprint folding box3d's state hash, the turrets,
// the slicks, the ammo and the city's hit points. Run twice in node here and once in the browser's wasm below: the nearest this tree has to two machines in lockstep.
const cityRace = () => { let script = null; return G.raceWithGunners(worldFrom, drivers, gunners, { seed: 1, seconds: 12, fleet, city: { script: (t, ctx) => { if (!script) script = BT.demolitionScript(ctx.cityCtx); script(t, ctx); } } }); };
const cityA = cityRace(), cityB = cityRace(), cs = cityA.city;
report(`node, the demolition race: fingerprint ${cityA.fingerprint} (${cityB.fingerprint} again), ${cs.impacts} impacts, topple ${JSON.stringify(cs.topple)}`);
ok("!! a race through a scripted demolition is deterministic in node: two runs, one fingerprint and one city summary (the damage stream is CityGen's own seeded one)", cityA.fingerprint === cityB.fingerprint && JSON.stringify(cityA.city) === JSON.stringify(cityB.city), `${cityA.fingerprint} / ${cityB.fingerprint}`);
const calmRace = G.raceWithGunners(worldFrom, drivers, gunners, { seed: 1, seconds: 12, fleet, city: { script: null } });
ok("...and the fingerprint CARRIES the fall: the same race through the same city with nobody shooting it gives another one (so two runtimes agreeing on it is not agreeing on nothing)", calmRace.fingerprint !== cityA.fingerprint && calmRace.city.topple.fallen === 0 && calmRace.city.impacts === 0, `${calmRace.fingerprint} vs ${cityA.fingerprint}`);
ok("...and the demolition happened: a building toppled into a body, a spark and then a cataclysm dropped on it were BLOCK hits that chipped voxels off it (the second a bite big enough that the body was made again from what was left: v4826), it came to rest and shattered into rubble (no body left)", cs.topple.fallen === 1 && cs.topple.shellHits === 2 && cs.topple.shattered === 1 && cs.topple.chipped > 3 && cs.topple.rebuilt === 1 && cs.topple.rubble > 0 && cs.topple.bodies === 0 && cs.topple.events[0] === "topple" && cs.topple.events[1] === "refit" && /^shatter@/.test(cs.topple.events[2]), JSON.stringify(cs.topple));

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
            { const BT = await import("/world/buildingTopple.mjs"); let script = null;
              const CR = G.raceWithGunners(worldFrom, a.drivers.map((w) => Float32Array.from(w)), a.gunners.map((w) => Float32Array.from(w)), { seed: 1, seconds: 12, fleet: a.fleet, city: { script: (t, ctx) => { if (!script) script = BT.demolitionScript(ctx.cityCtx); script(t, ctx); } } });
              out.cityRace = { fingerprint: CR.fingerprint, city: CR.city }; }
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
            report(`the browser's demolition race: fingerprint ${R.cityRace && R.cityRace.fingerprint} (node ${cityA.fingerprint}), topple ${R.cityRace && JSON.stringify(R.cityRace.city && R.cityRace.city.topple)}`);
            ok("!! *** the browser's FALL is node's: the scripted demolition race gives the same fingerprint (box3d's state with the block and its stubs, the turrets, the city's hit points) and the same city summary -- topple, block hit, rest, shatter, rubble count -- on the browser's wasm ***", !!R.cityRace && R.cityRace.fingerprint === cityA.fingerprint && JSON.stringify(R.cityRace.city) === JSON.stringify(cityA.city), `${R.cityRace && R.cityRace.fingerprint} vs ${cityA.fingerprint}`);
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

sec("4. THE WORLD IS EDITABLE (v4822): A SHELL'S CRATER IS ON THE PICTURE IN THE PAGE'S SCENE, AND A REPACK REBUILDS IT");
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
            const { CityGen } = await import("/world/CityGen.js"), { VoxelDebrisSystem } = await import("/world/voxelDebrisSystem.js");
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
                // THE PAGE'S OWN RECIPE (race-brain.html's buildScene): the kit's placements and trucks, then the world fleet, the debris, the turrets, the slicks, the pickups
                const build = (state) => {
                    const wf = D.worldFleet(state, { light: V.SUN }), df = D.debrisFleet({ light: V.SUN });
                    const sc = K.kitScene(dev, kit, [...placements, ...trucks], Gd, L, { light: V.SUN, dynamic: true, extraFleets: [wf, df, ...RT.turretFleets(4, U.TURRET.barrel, L, { light: V.SUN }), ...RT.slickFleets(L, { light: V.SUN }), ...RT.pickupFleets(L, { light: V.SUN })] });
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
                // THE DEBRIS: a city with a VoxelDebrisSystem on it bursts cubes when a shell carves; the frame with them placed (CD.placeDebris, what
                // the page does each frame) differs from the same frame with them parked, and the cubes are what differ
                globalThis.__swekStep = backend + " debris";
                const gd = D.crashWorld(track, CityGen, {}, D.ROOMY); gd.debris = new VoxelDebrisSystem();
                const scd = build(gd.state), dBase = placements.length + trucks.length + 1;
                D.barrage(gd, 0, { shells: 3, from: [rect.x - 20, mid] }); const parkedPx = await shoot(scd);
                const live = gd.debris.particles.length, placedN = D.placeDebris(scd, dBase, gd.debris), flyingPx = await shoot(scd);
                gd.debris.particles.length = 0; D.placeDebris(scd, dBase, gd.debris); const clearedPx = await shoot(scd); scd.destroy();
                out[backend] = { path: sc.path, errs, debris: { live, placedN, parkedPx, flyingPx, clearedPx }, before, after, full, grown, after2, full2, placed, outgrown, repacks, repacksByShells, clearedByRebuild, repacksAfter, writes: g.state.writes };
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
                const dz = b.debris, dpx = { parked: decode(dz.parkedPx), flying: decode(dz.flyingPx), cleared: decode(dz.clearedPx) }, dd = { cubes: apart(dpx.parked, dpx.flying), back: apart(dpx.parked, dpx.cleared) };
                report(`${bk}: ${dz.live} cubes live after a 3-shell barrage, ${dz.placedN} placed; the frame with them differs from the parked one by ${dd.cubes} px, and clearing them puts it back to ${dd.back} px apart`);
                ok(`!! ${bk}: the cubes a barrage bursts are on the picture -- the frame with them placed differs from the frame with them parked, and clearing the particles parks them again`, dz.live > 30 && dz.placedN === dz.live && dd.cubes > 100 && dd.back === 0, `${dz.live} cubes, ${dd.cubes} px, ${dd.back} px after clearing`);
            }
        }

        for (const [bk, qs] of [["WebGL2", "webgl=1"], ["WebGPU", "offscreen=1"]]) {
            // the page itself, on BOTH backends (v4822: WebGPU through ?offscreen=1, the page's hook for a device that never presents -- this
            // harness loses a presented WebGPU canvas, gfx/device.js Level 11): ?shell=12 puts a barrage on the building nearest
            // the lead car; then a repack is forced from OUTSIDE (isolated voxels, synced), and the page must build its scene again by itself
            const pg = await runInEngineOrigin({ engineRoot: ENG, timeoutMs: 300000, args: { qs }, script: `async (a) => {
                const VD = await import("/render/voxelDamage.mjs"), Gd = await import("/render/gpuDriven.mjs"), CD = await import("/world/crashDamage.mjs");
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
                // THE PAGE HAS BACKPRESSURE: it draws its main view only once the last one it submitted has finished. WebGPU's queue has none, and on a GPU
                // slower than the page's frame rate (this harness's software one) every frame piled up and each window readback, which resolves when the
                // queue drains to its own submission, waited behind a deeper one: measured 0.3, 0.9, 2.5, 4.1, 6.5 s over 33 s -- the cause of a flake in
                // the "readback in flight" row that looked like a hung read. Twelve seconds of the page's own window reads, timed from issue to answer.
                {
                    const sc0 = rb.scene, of0 = sc0.frame, lat = [];
                    sc0.frame = function (o) { const fr = of0.call(this, o); if (o && o.read && fr && fr.pixels) { const t = performance.now(); fr.pixels.then(() => lat.push(performance.now() - t), () => {}); } return fr; };
                    await new Promise((res) => setTimeout(res, 12000)); sc0.frame = of0;
                    out.lat = { n: lat.length, max: Math.max(0, ...lat), last: lat.length ? lat[lat.length - 1] : null };
                }
                // THE CUBES A SHELL BURSTS ARE ON THE PAGE'S PICTURE, put there by the PAGE's own frame loop: a barrage into the BIGGEST whole building (a small one hides the
                // cubes inside its own crater: the first try, the last building, was 7 x 3 x 5 and read 0 px apart), two animation frames of the page (it places the particles each frame), then a picture of that wall with the
                // cubes where the page put them and another with the particles cleared and parked -- the cubes are what differ. The page's loop is running.
                {
                    const IW0 = f.contentWindow, whole = c.rects.map((q, k) => { const b = c.city.buildingAt(q.x + 0.5, q.z + 0.5); return b && b.hp === b.maxHp ? k : -1; }).filter((k) => k >= 0), i1 = whole.reduce((a, k) => (c.rects[k].w * c.rects[k].d * c.rects[k].h > c.rects[a].w * c.rects[a].d * c.rects[a].h ? k : a), whole[0]), q1 = c.rects[i1], m1 = q1.z + q1.d / 2;
                    const eye1 = [q1.x - 12, 6, m1 + 5], t1x = rb.device.texture({ width: 256, height: 256, render: true });
                    const vp1 = { viewProj: IW0.Float32Array.from(Gd.multiply(Gd.perspective(0.9, 1, 0.5, 600), Gd.lookAt(eye1, [q1.x, 3, m1]))), eye: IW0.Array.from(eye1), clear: IW0.Array.from([0.03, 0.05, 0.08, 1]), target: t1x, read: true };
                    const shot1 = async () => Uint8Array.from((await rb.scene.frame(vp1).pixels).pixels), apart1 = (A, B) => { let n = 0; for (let p = 0; p < A.length; p += 4) if (Math.abs(A[p] - B[p]) > 8 || Math.abs(A[p + 1] - B[p + 1]) > 8 || Math.abs(A[p + 2] - B[p + 2]) > 8) n++; return n; };
                    out.debrisBefore = rb.debris.particles.length;
                    CD.barrage(c, i1, { shells: 3, from: [q1.x - 14, m1] });
                    await new Promise((res) => IW0.requestAnimationFrame(res)); await new Promise((res) => IW0.requestAnimationFrame(res));
                    out.debrisLive = rb.debris.particles.length;
                    // a particle's age moves with the page's sim ticks (VoxelDebrisSystem.update): wait for the first tick after the burst. (A count of cubes left after
                    // a second would not do -- the pool holds 400 and a later shell's burst evicts the oldest, so a page that never stepped them would look right.)
                    const p0 = rb.debris.particles[0], age0 = p0 ? p0.age : null; for (let k = 0; k < 240 && p0 && p0.age === age0; k++) await new Promise((res) => IW0.requestAnimationFrame(res));
                    out.debrisAged = p0 ? p0.age - age0 : null; out.debrisHud = /debris flying/.test(txt("racing"));
                    const pD = await shot1(); rb.debris.particles.length = 0; CD.placeDebris(rb.scene, rb.debrisBase, rb.debris); const pN = await shot1(), pN2 = await shot1();
                    out.debrisApart = apart1(pD, pN); out.debrisNoise = apart1(pN, pN2); out.debrisBuilding = i1;
                }
                // A BUILDING A SHELL BRINGS DOWN FALLS OVER AS A BOX3D BODY (world/buildingTopple.mjs, race-crash.html's since v4591), AND THE PAGE DRAWS IT.
                // Shells at the ground floor of the biggest whole building until CityGen topples it (the support collapse shellInto already had): the block
                // above the ground floor is a dynamic body in the PAGE's physics world on what the shells left of the ground floor, and a reserved fleet in
                // its scene. Three claims, the page running: (1) the block is on the picture -- a frame with its record where the page put it against a
                // frame with the record parked, issued back to back so no page frame falls between them; (2) a scene built AGAIN (a repack) with the
                // block in the air still draws it -- bindKit writes the block into the new scene's buffers; (3) a block that has fallen over or come to rest
                // leaning shatters BY ITSELF (the rest rule; no setTransform): rubble in the world and cubes, its record parked, the HUD counting it.
                {
                    const IW2 = f.contentWindow, rAF2 = () => new Promise((res) => IW2.requestAnimationFrame(res));
                    const whole2 = c.rects.map((q, k) => { const b = c.city.buildingAt(q.x + 0.5, q.z + 0.5); return b && b.hp === b.maxHp ? k : -1; }).filter((k) => k >= 0), i2 = whole2.reduce((a, k) => (c.rects[k].w * c.rects[k].d * c.rects[k].h > c.rects[a].w * c.rects[a].d * c.rects[a].h ? k : a), whole2[0]), q2 = c.rects[i2], m2 = q2.z + q2.d / 2;
                    const gy = CD.CRASH.groundY + 1.5, rr = CD.blastRadius(40), T = c.topple;
                    for (let x = q2.x + 0.5; x < q2.x + q2.w; x += 3) for (let z = q2.z + 0.5; z < q2.z + q2.d; z += 3) { if (c.city.buildingAt(q2.x + 0.5, q2.z + 0.5).state === "toppled") break; CD.shellInto(c, i2, [x, gy, z], rr, { x: 1, z: 0 }); }
                    out.topEvents = T.events.map((e) => e.kind); out.topBodies = T.bodies.length; out.topBuilding = i2;
                    await rAF2(); await rAF2(); out.topHud = /fell over as bodies/.test(txt("racing"));
                    const eye2 = [q2.x - 22, 10, m2 + 16], ta = rb.device.texture({ width: 256, height: 256, render: true }), tb = rb.device.texture({ width: 256, height: 256, render: true });
                    const cam2 = { viewProj: IW2.Float32Array.from(Gd.multiply(Gd.perspective(0.9, 1, 0.5, 600), Gd.lookAt(eye2, [q2.x - 3, 4, m2]))), eye: IW2.Array.from(eye2), clear: IW2.Array.from([0.03, 0.05, 0.08, 1]), read: true };
                    const apart2 = (A, B) => { let n = 0; for (let p = 0; p < A.length; p += 4) if (Math.abs(A[p] - B[p]) > 8 || Math.abs(A[p + 1] - B[p + 1]) > 8 || Math.abs(A[p + 2] - B[p + 2]) > 8) n++; return n; };
                    // the block's picture against the same scene with its record parked, both issued before the page's next frame
                    const blockPair = async () => {
                        const rec = T.bodies[0]; if (!rec) return -1;
                        const o = (rb.blockBase + rec.slot) * 4, sc = rb.scene, fa = sc.frame({ ...cam2, target: ta }); sc.kitRecords.set([0, -500, 0, 1], o); const fb = sc.frame({ ...cam2, target: tb });
                        return apart2(Uint8Array.from((await fa.pixels).pixels), Uint8Array.from((await fb.pixels).pixels));
                    };
                    // THE SIM IS FROZEN THROUGH THE PICTURES, THE HUNG READ AND THE REBUILD, the page still rendering: a lean-to settles in about a second and a half
                    // of the race's own clock, and a WebGPU readback awaited from here spans several page frames of four ticks each -- the first version of this
                    // stage found the block shattered before it could be photographed twice. The page's rAF timestamp is held at its last real value (dt 0: no tick,
                    // no shell flies, the block does not move), frames and window reads go on; it runs free again for the shell and the settle.
                    const rafReal = IW2.requestAnimationFrame.bind(IW2); let lastT = 0, frozenT = null;
                    IW2.requestAnimationFrame = (cb) => rafReal((t) => { if (frozenT === null) lastT = t; cb(frozenT === null ? t : frozenT); });
                    await rAF2(); frozenT = lastT;
                    const slot0 = T.bodies[0] ? T.bodies[0].slot : -1; out.leanUp = T.bodies[0] && T.bodies[0].up ? T.bodies[0].up[1] : null;
                    out.blockApart = await blockPair();
                    // A WINDOW READBACK THAT NEVER SETTLES, under the scene the page is about to build again: a window read on the old scene is made to hang for
                    // good (no answer, no rejection -- what the ship harness's WebGPU did to a real one, and froze the windows for the page's life: viewBusy
                    // stuck, no read on any scene afterwards). The page must give up on it, and the windows must read the NEW scene.
                    const oldS = rb.scene, oldFrame = oldS.frame, isWindow = (o) => o && o.target && o.target !== ta && o.target !== tb; let hung = 0, resumed = 0;
                    oldS.frame = function (o) { if (isWindow(o)) { hung++; return { pixels: new Promise(() => {}) }; } return oldFrame.call(this, o); };
                    for (let k = 0; k < 600 && hung === 0; k++) await rAF2();
                    const builds0 = rb.sceneBuilds; c.state.outgrown = true;   // the flag a repack raises: the page builds its scene again from the state, with the block in the air
                    for (let k = 0; k < 120 && rb.sceneBuilds === builds0; k++) await rAF2();
                    await rAF2(); out.topRebuilt = rb.sceneBuilds - builds0; out.blockApartRebuilt = await blockPair();
                    { const ns = rb.scene, nf = ns.frame; ns.frame = function (o) { if (isWindow(o)) resumed++; return nf.call(this, o); }; }
                    { const t6 = performance.now(); while (resumed === 0 && performance.now() - t6 < 25000) await rAF2(); }
                    out.hang = { hung, resumed, note: txt("viewsNote") };
                    // A CATACLYSM ON THE BLOCK'S TOP, the sim still frozen: voxels come off it, its hit points drop, and the picture changes -- the new mesh went into the REBUILT
                    // scene's buffer through the page's own onBlock (bindKit). Nothing else moves between the two pictures.
                    if (T.bodies[0]) {
                        const BTm = await import("/world/buildingTopple.mjs"), rec1 = T.bodies[0], n0 = rec1.count, chipped0 = T.chipped || 0, topAt = [rec1.pose.pos[0], rec1.pose.pos[1] + rec1.half[1], rec1.pose.pos[2]];
                        const pic = async (tg) => Uint8Array.from((await rb.scene.frame({ ...cam2, target: tg }).pixels).pixels);
                        const pA = await pic(ta), res = BTm.shellOnBlock(T, rec1.slot, topAt, CD.blastRadius(40)), pB = await pic(tb);
                        out.chip = { removed: res.removed, loose: res.loose, n0, n1: rec1.count, hp: res.hp, chipped: (T.chipped || 0) - chipped0, apart: apart2(pA, pB), shattered: res.shattered };
                    } else out.chip = { removed: 0, noBlock: true };
                    frozenT = null;   // the race runs again
                    // a shell dropped onto the falling block from above (nothing between): the PAGE's own turretTick sees a BLOCK hit, not a hole
                    if (T.bodies[0]) {
                        const rec0 = T.bodies[0], p0 = rec0.pose.pos, hits0 = T.shellHits || 0, imp0 = c.impacts.length, cubes0 = rb.debris.totalSpawned;
                        rb.shells.push({ x: p0[0], y: p0[1] + rec0.half[1] + 6, z: p0[2], vx: 0, vy: -30, vz: 0, t: 0, owner: 0, ammo: "spark" });
                        for (let k = 0; k < 90 && (T.shellHits || 0) === hits0 && T.bodies[0]; k++) await rAF2();
                        out.blockShot = { hits: (T.shellHits || 0) - hits0, impacts: c.impacts.length - imp0, cubes: rb.debris.totalSpawned - cubes0 };
                    } else out.blockShot = { hits: 0, impacts: 0, cubes: 0, noBlock: true };
                    // the block the shells left LEANING on its one column of ground floor and the road (up.y about 0.97) settles by itself: it is at rest
                    // and tilted past TOPPLE.leanUp, so the page's own rest rule shatters it -- no help from this gate (the first version laid it flat with
                    // setTransform, because a lean-to used to stay a body for ever)
                    const t5 = performance.now(); while (T.shattered < 1 && performance.now() - t5 < 60000) await rAF2();
                    out.shattered = T.shattered; out.rubbleVoxels = T.rubble; out.burst = T.burst; out.topBodiesAfter = T.bodies.length; out.shatterEvent = T.events.filter((e) => e.kind === "shatter").map((e) => ({ fell: e.fell, up: e.up && e.up[1], rubble: e.rubble, burst: e.burst, lost: e.lost }));
                    await rAF2(); await rAF2(); out.slotParked = slot0 >= 0 && rb.scene.kitRecords[(rb.blockBase + slot0) * 4 + 1] === -500; out.hudShattered = /shattered/.test(txt("racing"));
                    out.builds1b = rb.sceneBuilds;   // the scene was built again once for the block stage's flag (and boot's build): the repack stage below counts from here
                }
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
                const t2 = performance.now(), vf0 = rb.viewFrame; while (pending === 0 && performance.now() - t2 < 20000) await new Promise((res) => setTimeout(res, 20)); out.pending = pending; out.viewDiag = { busy: rb.viewBusy, frames: rb.viewFrame - vf0, ms: Math.round(performance.now() - t2) };
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
                ok(bk + " -- !! the page does not outrun its GPU: twelve seconds of its window readbacks all come back within 1.5 s (no queue piling up behind a slow device), and there are plenty of them", q.lat.n >= 20 && q.lat.max < 1500, `${q.lat.n} reads, slowest ${q.lat.max.toFixed(0)} ms, last ${q.lat.last == null ? "-" : q.lat.last.toFixed(0)} ms`);
                ok(bk + " -- the page's 3D car windows each hold a picture of its scene (more than a twentieth lit), read back on this backend", q.windows.length >= 2 && q.windows.every((w) => w.lit > 0.05), q.windows.map((w) => w.lit.toFixed(3)).join(" ") + ` after ${q.windowsMs.toFixed(0)} ms`);
                report(`${bk}: the page's cubes -- ${q.debrisBefore} live before, ${q.debrisLive} after a 3-shell barrage into building ${q.debrisBuilding}, the HUD says so: ${q.debrisHud}; the wall's picture with them vs without: ${q.debrisApart} px apart (noise ${q.debrisNoise})`);
                ok(bk + " -- the cubes AGE on the page: a particle's age moves with the race's own sim ticks (the page steps its debris), by a tick or two and no more", q.debrisAged > 0 && q.debrisAged < 0.2, `${q.debrisAged == null ? "no particle" : q.debrisAged.toFixed(4) + " s"} after the first tick`);
                report(`${bk}: the falling block -- building ${q.topBuilding}: ${q.topEvents.join(",")}, ${q.topBodies} body, HUD says so ${q.topHud}; the block on the picture ${q.blockApart} px, after the scene was built again (${q.topRebuilt}x) ${q.blockApartRebuilt} px; laid flat it shattered ${q.shattered}x (${q.rubbleVoxels} rubble voxels, ${q.burst} cubes, ${JSON.stringify(q.shatterEvent)}), its record parked ${q.slotParked}, HUD says so ${q.hudShattered}`);
                ok(bk + " -- !! a building a shell brings down becomes a box3d body in the PAGE's physics world (the shells took the ground floor, CityGen's topple raised the block) and the HUD says it fell over", /topple|drop/.test((q.topEvents || []).join(",")) && q.topBodies === 1 && q.topHud === true, `events ${(q.topEvents || []).join(",")}, ${q.topBodies} body`);
                ok(bk + " -- !! a cataclysm on the falling block CHIPS it on the page: voxels come off and its hit points drop to what is left, and its PICTURE changes with the sim frozen (the new mesh reached the rebuilt scene's buffer)", q.chip.removed > 0 && q.chip.n1 === q.chip.n0 - q.chip.removed - q.chip.loose && q.chip.chipped === q.chip.removed + q.chip.loose && q.chip.apart > 200 && !q.chip.shattered, `${q.chip.removed} removed + ${q.chip.loose} loose of ${q.chip.n0}, hp ${q.chip.hp && q.chip.hp.toFixed(3)}, ${q.chip.apart} px apart`);
                ok(bk + " -- ...and a shell dropped onto it hits the BLOCK on the page (turretTick's block hit: counted, cubes burst, no second hit on the city), not the hole the building left", q.blockShot.hits === 1 && q.blockShot.impacts === 0 && q.blockShot.cubes > 0, JSON.stringify(q.blockShot));
                ok(bk + " -- !! a window readback that NEVER settles (hung under the scene being built again) is given up on: the windows read the NEW scene afterwards (the page does not hold viewBusy for ever), and nothing says 'view windows off'", q.hang.hung >= 1 && q.hang.resumed >= 1 && !/view windows off/.test(q.hang.note || ""), `${q.hang.hung} read(s) hung, ${q.hang.resumed} window read(s) on the new scene after; note "${(q.hang.note || "").slice(0, 60)}"`);
                ok(bk + " -- ...the block is on the PAGE's picture: a frame with its record where the page put it differs from the same frame with the record parked", q.blockApart > 300, `${q.blockApart} px apart`);
                ok(bk + " -- ...and a scene built AGAIN with the block in the air still draws it (a repack must not lose a falling building)", q.topRebuilt === 1 && q.blockApartRebuilt > 300, `scene rebuilt ${q.topRebuilt}x, ${q.blockApartRebuilt} px apart`);
                ok(bk + " -- ...a block that fell over or came to rest LEANING SHATTERS by itself (the page's rest rule, nobody laying it down): rubble in the world and cubes, the body gone, its fleet record parked, the HUD counting it", q.shattered === 1 && q.rubbleVoxels > 0 && q.topBodiesAfter === 0 && q.slotParked === true && q.hudShattered === true, `it came to rest at up.y ${q.shatterEvent && q.shatterEvent[0] && q.shatterEvent[0].up != null ? q.shatterEvent[0].up.toFixed(3) : "?"}, ${q.shattered} shattered, ${q.rubbleVoxels} rubble voxels, ${q.burst} cubes, ${q.topBodiesAfter} bodies left, parked ${q.slotParked}`);
                ok(bk + " -- the cubes a shell bursts are on the PAGE's picture: its own frame loop placed them, and the wall looks different with them than with the particles parked", q.debrisLive > 30 && q.debrisApart > 300 && q.debrisNoise < 100, `${q.debrisLive} cubes, ${q.debrisApart} px apart, noise ${q.debrisNoise}`);
                report(`${bk}: the page after ${q.placed} isolated voxels: outgrown ${q.outgrownNow} -> scene built ${q.builds1b}x -> ${q.builds2}x, repacks ${q.repacks1} -> ${q.repacks2}, the rebuilt scene is ${q.cloudApart} px from the one before (noise ${q.noise}), an edit after the rebuild moved ${q.editApart} of ${q.pixels} pixels, clock ${q.t0} -> ${q.t1} s, page errors ${q.errs.length}`);
                ok(bk + " -- !! a chunk outgrowing its slot on the live page is answered by the PAGE: the flag was raised, the scene was built again by itself, the flag is clear and the world fleet is back", q.outgrownNow === true && q.builds2 === q.builds1b + 1 && q.outgrown2 === false && q.repacks2 === q.repacks1 + 1 && q.world2 && /1 repack/.test(q.hud2), `scene built ${q.builds1b}x -> ${q.builds2}x; HUD ${(q.hud2 || "").slice(-70)}`);
                ok(bk + " -- ...and a rebuild under a window readback in flight is NOT counted as a failed readback: the 3D windows stay on (no 'view windows off' note) after the old scene's reads were made to fail", q.pending >= 1 && !/view windows off/.test(q.viewsNote || ""), `${q.pending} readback(s) pending at the rebuild; note: "${(q.viewsNote || "").slice(0, 80)}"` + (q.pending >= 1 ? "" : `; page frames ${q.viewDiag.frames} in ${q.viewDiag.ms} ms, a window readback busy: ${q.viewDiag.busy}`));
                ok(bk + " -- ...the rebuilt scene draws what repacked it (the isolated voxels light the frame), the race kept running through it, and an edit after it reaches the page's own picture", q.cloudApart > 1000 && q.noise === 0 && q.t1 > q.t0 && q.editApart > 300 && q.builds3 === q.builds2 && q.errs.length === 0, `${q.cloudApart} px for the voxels (noise ${q.noise}), clock ${q.t0} -> ${q.t1} s, ${q.editApart} px from the edit, ${q.errs.length} page errors`);
            } else report(bk + ": the page half did not run: " + String(pg.reason || (pg.result && pg.result.error) || JSON.stringify(pg)).slice(0, 300));
        }
    }
}

console.log(fails ? `\nraceTurret-selfcheck: ${fails} FAILED` : "\nraceTurret-selfcheck: all checks pass");
// v4663 -- process.exitCode, NOT process.exit: this gate compiles a wasm module, and exiting while V8's
// background compiler still has work posts a task into a torn-down platform. tools/ship/wasmTeardown.mjs.
process.exitCode = fails ? 1 : 0;
