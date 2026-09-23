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
// SABOTAGE LOG -- v4588, each applied to the file named, the gate run (both harness browsers), the file restored.
//   A  render/raceTurret.mjs: the barrel record written at the dome's scale       -> 1 red: the placement row.
//   B  render/raceTurret.mjs: the barrel mesh half its length                     -> 1 red: the mesh spans [0, barrel].
//   C  race-brain.html: the page never ticking the turrets                         -> 1 red: hits 0 0 0 0 on the page.
//   D  race-brain.html: the scene without the turret fleets                        -> 2 red: the placements write past the
//      scene's records, the frame loop throws, the standings never carry hits.
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

console.log(fails ? `\nraceTurret-selfcheck: ${fails} FAILED` : "\nraceTurret-selfcheck: all checks pass");
// v4661 -- process.exitCode, NOT process.exit: this gate compiles a wasm module, and exiting while V8's
// background compiler still has work posts a task into a torn-down platform. tools/ship/wasmTeardown.mjs.
process.exitCode = fails ? 1 : 0;
