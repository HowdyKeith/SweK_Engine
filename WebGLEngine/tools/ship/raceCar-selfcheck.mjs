#!/usr/bin/env node
// WebGLEngine/tools/ship/raceCar-selfcheck.mjs -- Racing city 2 (task 65)
//
// THE CAR ON box3d: physics/raceCar.mjs behind race-car.html, headless through physics/box3d/box3dNode.mjs (the vendored wasm) and then
// in the browser through box3dLoader on both backends. Section 1, the spec: the four wheels sit over Kenney's TRUCK_PARTS, the chassis
// density gives the spec's mass through box3d's own box mass, the ride height is half height plus rest length plus wheel radius, and
// the wasm really lacks the wheel joints this round declined (has() says so, by name). Section 2, the surface: asphalt on the finish
// line, the kerb band raised KERB_HEIGHT between HALF_WIDTH and the tile edge, grass on a free cell, void beyond the grid. Section 3,
// on the skidpad: the car settles at ROAD_Y + rideHeight less the static compression mg / 4k within a centimetre with all four wheels
// grounded; full throttle passes 10 m/s in three seconds and 20 in ten, straight (yaw and x unmoved); a full brake stops it inside
// four seconds; steer +1 and -1 turn the yaw by the same angle either way, the car upright throughout; grass under the same throttle
// is far slower. Section 4, on the track: a car straddling the kerb band leans (its up vector tilts sideways), a car driven at a
// building stops on its face (box3d's contact, not this module's), and the pursuit driver LAPS seed 1 -- every checkpoint in order,
// a lap time, a second lap, and every wheel sample on asphalt. Section 5, lockstep: two runs fold the same box3d state hashes into
// the same fingerprint; a different driver, a different fingerprint. Section 6, IN THE BROWSER ON BOTH BACKENDS: the same wasm runs
// the same 30 s pursuit to the same fingerprint and pose as node, and Kenney's red truck is drawn at that pose on the track through
// kitScene's quat mode -- red pixels where the pose projects, on both backends, agreeing.
//
// MEASURED AT THE ROUND: the car settles at 1.9346 (ROAD_Y + 1.0 - 0.0654), reaches 10.82 m/s in 3 s and 23.95 in 10 s straight, brakes
// to rest inside 4 s, turns 0.702 rad either way under steer +-1 with 1.20 m of lateral offset, stays at up.y 1.000 through four seconds
// of full throttle and full steer, and reaches 5.20 m/s on grass against 10.82 on asphalt; straddling the kerb it leans 0.148; driven
// at the first building it stops with its front at z -53.00 against the face at -53; the pursuit driver laps seed 1 in 51.3 s (103
// checkpoints and 2 laps in 120 s, all 28,800 wheel samples on asphalt) for 396 to 412 ms of compute; the 30 s fingerprint is f45fc963
// in node and in the browser (which drives the 30 s in 99 ms), fdd2c1ba for a driver 1 m/s slower and a3cadb44 for full throttle; the
// red truck is 17 to 19 % of a 9 x 9 window at its pose, 0 % forty pixels away, and 11 % at the new pose after its record is rewritten,
// the backends 327 pixels apart of 160,000. FOUR CORRECTIONS OF THE ROUND'S OWN DRAFTS: rolling resistance fed to the tyre model as a
// slip velocity (6000 N per m/s times 5 % of the speed on four wheels) held full throttle to 5.3 m/s in three seconds -- it is a
// fraction of the wheel's load now; tyre forces applied at the attach point (0.35 below the centre on a 1.1 m track) rolled the car
// onto its roof in the first steering run -- they act at the chassis height; the pursuit driver slowed only with the steer it was
// already using, met every corner at 14 m/s and left the grid (22,930 void samples) -- it reads the path's heading change 14 m ahead;
// and on WebGPU the dynamic record's buffer was written from the records' cpu(), which the GPU path never calls after the first
// upload -- the extras' cpu() writes it, as voxelBodies.sandboxScene does.
//
// SABOTAGE (the round; physics/raceCar.mjs md5 fc474e99ab59f07207d887225a9c795a before and after all five):
//   A  grass rolling like asphalt (0.25 -> 0.015)                 -> 1 red: 10.35 m/s on grass against 10.82 on asphalt.
//   B  tyre forces at the attach point (the full lever)           -> 2 red: the mirrored-steer hold (the car rolls) and full throttle with
//                                                                    full steer on its roof.
//   C  the steer sign flipped                                     -> 4 red: +1 turns the wrong way, the pursuit driver fights itself and does
//                                                                    not lap, and the truck is drawn off the pose on both backends.
//   D  the kerb band not raised                                   -> 2 red: the surface hold and the lean (0.012 instead of 0.148).
//   E  the fingerprint ignoring box3d's state hash               -> 1 red: three drivers, one fingerprint (90749445).
//   Each restored and the baseline re-run: 0 red.
//
// Run: node tools/ship/raceCar-selfcheck.mjs      (~30 s: the wasm headless, then both backends in the browser)
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInEngineOrigin, webgpuSkipReason } from "./webgpuHarness.mjs";
import { decodePNG } from "./pngCoverage.mjs";
import { initNode, mod, has } from "../../physics/box3d/box3dNode.mjs";
import { worldFromModule } from "../../render/slugTicker.mjs";
import { boxMass } from "../../physics/box3d/jointDrive.mjs";
import * as K from "../../world/kenneyKit.mjs";
import * as T from "../../world/raceTrack.mjs";
import * as C from "../../physics/raceCar.mjs";
import * as G from "../../render/gpuDriven.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const report = (s) => console.log(`  ----  ${s}`);
const sec = (s) => console.log("\n" + s);
const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;
const quiet = () => { const log = console.log; console.log = (...a) => { if (!/\[GLBParser\]|\[box3d\]|\[CityGen\]/.test(String(a[0]))) log(...a); }; };
quiet();
const GRAV = [0, -9.81, 0];
const st = await initNode();
if (!st.ready) { console.log("  SKIP  box3d wasm: " + st.reason); console.log("\nFAIL -- the wasm is the substrate"); process.exit(1); }
const m = mod();
const newWorld = () => worldFromModule(m, GRAV);
const P = (r) => `speed ${r.pose.speed.toFixed(2)}, pos ${r.pose.pos.map((v) => v.toFixed(2)).join(", ")}, yaw ${r.pose.yaw.toFixed(3)}, up.y ${r.pose.up[1].toFixed(3)}`;

// ---------------------------------------------------------------------------------------------------------------------------------
sec("1. the spec: Kenney's truck as a raycast car, and the wheel joints the wasm has not got");
{
    const ws = C.carWheels();
    ok("four wheels over TRUCK_PARTS' wheel positions at the chassis bottom: front steerable, rear driven", ws.length === 4 && ws[0].steerable && ws[1].steerable && !ws[2].steerable && ws[2].driven && ws[3].driven && !ws[0].driven && near(ws[0].attach[0], 0.55) && near(ws[0].attach[2], 0.857) && near(ws[2].attach[2], -0.657) && near(ws[0].attach[1], -C.CAR.half[1]));
    ok("the chassis density gives the spec's mass through box3d's own box mass", near(boxMass(C.CAR.half[0], C.CAR.half[1], C.CAR.half[2], C.chassisDensity()), C.CAR.mass, 1e-6), `${C.chassisDensity().toFixed(1)} kg/m^3 for ${C.CAR.mass} kg`);
    ok("the ride height is half height + rest length + wheel radius = 1.0", near(C.rideHeight(), 1.0));
    const missing = ["swk_wheel_spin", "swk_wheel_steer", "swk_wheel_state", "swk_body_sphere", "swk_world_cast_ray"].filter((n) => !has(n));
    ok("*** the vendored wasm has none of the wheel-joint, sphere or raycast exports -- which is why this car is the raycast model on an analytic ground ***", missing.length === 5, `${missing.length} of 5 absent; ${Object.keys(m).filter((k) => /^_swk_/.test(k)).length} swk_ exports present`);
    ok("  ...and it has what the car needs: a box body, impulses, transforms, velocities, a state hash", ["swk_body_box", "swk_body_impulse", "swk_body_ang_impulse", "swk_transforms", "swk_velocities", "swk_state_hash"].every((n) => has(n)));
    ok("clampInput holds the contract: throttle and steer in [-1, 1], brake in [0, 1], missing fields 0", JSON.stringify(C.clampInput({ throttle: 3, steer: -2, brake: 4 })) === JSON.stringify({ throttle: 1, steer: -1, brake: 1 }) && JSON.stringify(C.clampInput({})) === JSON.stringify({ throttle: 0, steer: 0, brake: 0 }));
    const w = C.angularVelocity([0, 0, 0, 1], C.yawQuat(0.1), 0.1);
    ok("angularVelocity reads a 0.1 rad yaw over 0.1 s as 1 rad/s about +y", near(w[1], 1, 1e-6) && near(w[0], 0) && near(w[2], 0), w.map((v) => v.toFixed(4)).join(","));
}

// ---------------------------------------------------------------------------------------------------------------------------------
sec("2. the surface: the flat track as a function of (x, z)");
const track = T.generateTrack({ seed: 1 }), surface = C.trackSurface(track), cp = T.checkpoints(track)[0];
{
    const fin = surface.at(cp.x, cp.z), kerb = surface.at(cp.x + 2, cp.z + 4.8), grass = surface.at(0, 0), out = surface.at(1000, 1000), edge = surface.at(cp.x + 2, cp.z + 4.4);
    ok("the finish line is asphalt at ROAD_Y with the asphalt grip", fin.kind === "asphalt" && fin.y === T.ROAD_Y && fin.grip === C.CAR.grip.asphalt);
    ok("4.8 off the centreline is the kerb band, raised KERB_HEIGHT; 4.4 is still asphalt", kerb.kind === "kerb" && near(kerb.y, T.ROAD_Y + C.KERB_HEIGHT) && edge.kind === "asphalt", `${kerb.kind} at ${kerb.y}, ${edge.kind}`);
    ok("the origin (a free block on seed 1) is grass at the floor's height with the grass grip and rolling", grass.kind === "grass" && grass.y === T.ROAD_Y && grass.grip === C.CAR.grip.grass && grass.rolling === C.CAR.rolling.grass);
    ok("beyond the grid is void, far below", out.kind === "void" && out.y < -50);
    ok("along() at the finish is lap parameter 0 at distance 0", near(surface.along(cp.x, cp.z).d, 0, 1e-9) && near(surface.along(cp.x, cp.z).s, 0, 1e-9));
}

// ---------------------------------------------------------------------------------------------------------------------------------
sec("3. on the skidpad: settle, accelerate, brake, steer both ways, and grass");
const flat = C.flatSurface();
let fpStraight = null;
{
    const world = newWorld(), car = C.createCar(world, { x: 0, z: 0, yaw: 0 });
    const settled = C.drive(world, car, flat, { throttle: 0 }, { seconds: 2 });
    const restY = T.ROAD_Y + C.rideHeight() - C.CAR.mass * 9.81 / (4 * C.CAR.stiffness);
    ok(`the car settles at ROAD_Y + rideHeight - mg / 4k = ${restY.toFixed(4)} within a centimetre, still, upright, all four wheels on asphalt`, near(settled.pose.pos[1], restY, 0.01) && Math.abs(settled.pose.speed) < 0.01 && settled.pose.up[1] > 0.999 && settled.kinds.asphalt === 4 * settled.steps && car.last.wheels.every((w) => w.grounded), P(settled));
    const t3 = C.drive(world, car, flat, { throttle: 1 }, { seconds: 3 });
    ok("*** full throttle passes 10 m/s in three seconds, straight: yaw and x unmoved ***", t3.pose.speed > 10 && Math.abs(t3.pose.yaw) < 1e-3 && Math.abs(t3.pose.pos[0]) < 0.01 && t3.pose.up[1] > 0.999, P(t3));
    const t10 = C.drive(world, car, flat, { throttle: 1 }, { seconds: 7 });
    ok("  ...and 20 m/s in ten", t10.pose.speed > 20 && t10.pose.speed < 30, P(t10));
    fpStraight = t10.fingerprint;
    const br = C.drive(world, car, flat, { throttle: 0, brake: 1 }, { seconds: 4 });
    ok("a full brake from there stops the car inside four seconds", Math.abs(br.pose.speed) < 0.05 && br.pose.up[1] > 0.999, P(br));
    world.destroy();
    const turn = (steer) => { const w = newWorld(), c = C.createCar(w, { x: 0, z: 0, yaw: 0 }); C.drive(w, c, flat, { throttle: 1 }, { seconds: 2 }); const r = C.drive(w, c, flat, { throttle: 0.5, steer }, { seconds: 3 }); w.destroy(); return r; };
    const L = turn(1), R = turn(-1);
    ok("*** steer +1 turns the yaw one way and -1 the other by the same angle, the car upright and off its line the same distance either side ***", L.pose.yaw < -0.3 && near(L.pose.yaw, -R.pose.yaw, 1e-3) && near(L.pose.pos[0], -R.pose.pos[0], 1e-3) && L.pose.up[1] > 0.99 && R.pose.up[1] > 0.99, `${P(L)} | ${P(R)}`);
    const hard = (() => { const w = newWorld(), c = C.createCar(w, { x: 0, z: 0, yaw: 0 }); C.drive(w, c, flat, { throttle: 1 }, { seconds: 4 }); const r = C.drive(w, c, flat, { throttle: 1, steer: 1 }, { seconds: 4 }); w.destroy(); return r; })();
    ok("full throttle with full steer for four seconds keeps the car on its wheels (the tyre forces act at the chassis height)", hard.pose.up[1] > 0.95 && hard.pose.speed > 5, P(hard));
    const grassPad = { ...flat, at: () => ({ y: T.ROAD_Y, kind: "grass", grip: C.CAR.grip.grass, rolling: C.CAR.rolling.grass }) };
    const g = (() => { const w = newWorld(), c = C.createCar(w, { x: 0, z: 0, yaw: 0 }); C.drive(w, c, grassPad, { throttle: 0 }, { seconds: 2 }); const r = C.drive(w, c, grassPad, { throttle: 1 }, { seconds: 3 }); w.destroy(); return r; })();
    ok("the same three seconds of throttle on grass reach under half the speed (rolling resistance a quarter of the load)", g.pose.speed > 0.5 && g.pose.speed < t3.pose.speed * 0.5 && g.kinds.grass === 4 * g.steps, `${g.pose.speed.toFixed(2)} on grass against ${t3.pose.speed.toFixed(2)} on asphalt`);
}

// ---------------------------------------------------------------------------------------------------------------------------------
sec("4. on the track: the kerb leans the car, a building stops it, the pursuit driver laps seed 1");
let lap = null;
{
    // straddling the kerb: the finish straight runs east along z = cp.z; the kerb band is 4.5 to 5 off it
    const w = newWorld(), c = C.createCar(w, { x: cp.x + 6, z: cp.z + 4.25, yaw: Math.PI / 2 });
    const r = C.drive(w, c, surface, { throttle: 0 }, { seconds: 2 }); w.destroy();
    const lean = Math.hypot(r.pose.up[0], r.pose.up[2]);
    ok("a car straddling the kerb band settles leaning: its up vector tilts sideways, one side's wheels on the kerb and the other's on asphalt", lean > 0.04 && r.kinds.kerb > 0 && r.kinds.asphalt > 0 && r.kinds.grass === 0, `lean ${lean.toFixed(3)}, kinds ${JSON.stringify(r.kinds)}`);
    // a building in the way: the first rect, the car 10 m south of its south face heading north at full throttle
    const rects = T.cityRects(track), b = rects[0], w2 = newWorld(), ids = C.addBuildings(w2, rects), face = b.z + b.d;
    const c2 = C.createCar(w2, { x: b.x + b.w / 2, z: face + 10, yaw: Math.PI });
    const gr = { ...flat };   // the skidpad under the car, so only the building can stop it
    const hit = C.drive(w2, c2, gr, { throttle: 1 }, { seconds: 4 });
    ok(`${ids.length} buildings are static boxes in box3d, and a car driven into one stops on its face (the chassis front never enters it)`, hit.pose.pos[2] - C.CAR.half[2] > face - 0.05 && hit.pose.pos[2] < face + 3 && Math.abs(hit.pose.speed) < 1.5, `front at z ${(hit.pose.pos[2] - C.CAR.half[2]).toFixed(2)} against the face at ${face}, ${P(hit)}`);
    w2.destroy();
    // the lap
    const w3 = newWorld(), c3 = C.createCar(w3, { x: cp.x + 5, z: cp.z, yaw: Math.PI / 2 }), tracker = C.lapTracker(surface);
    const t0 = performance.now(); lap = C.drive(w3, c3, surface, C.pursuitDriver(surface), { seconds: 120, tracker }); const ms = performance.now() - t0; w3.destroy();
    report(`the pursuit driver on seed 1 for 120 s: ${lap.laps} laps, ${lap.hit} checkpoints, first lap ${lap.lapTime && lap.lapTime.toFixed(1)} s, wheel samples ${JSON.stringify(lap.kinds)}, ${ms.toFixed(0)} ms of compute, fingerprint ${lap.fingerprint}`);
    ok("*** the pursuit driver laps seed 1: every checkpoint in order, a lap time under 90 s, a second lap under way, every wheel sample on asphalt ***", lap.laps >= 1 && lap.lapTime !== null && lap.lapTime < 90 && lap.hit >= track.cells.length + 1 && lap.kinds.asphalt === 4 * lap.steps && lap.pose.up[1] > 0.99);
    ok("  the tracker's checkpoints are the track's, the finish first, hit in index order", tracker.checkpoints.length === track.cells.length && tracker.checkpoints[0].index === 0 && tracker.checkpoints.every((q, i) => i === 0 || q.s > tracker.checkpoints[i - 1].s));
    ok("  120 seconds of car and box3d cost under two seconds here", ms < 2000, `${ms.toFixed(0)} ms`);
}

// ---------------------------------------------------------------------------------------------------------------------------------
sec("5. lockstep: the same inputs fold the same box3d state hashes");
let fp30 = null, pose30 = null;
{
    const run = (driver, seconds) => { const w = newWorld(), c = C.createCar(w, { x: cp.x + 5, z: cp.z, yaw: Math.PI / 2 }); const r = C.drive(w, c, surface, driver, { seconds }); w.destroy(); return r; };
    const a = run(C.pursuitDriver(surface), 30), b = run(C.pursuitDriver(surface), 30), c = run(C.pursuitDriver(surface, { vMax: 12 }), 30), d = run({ throttle: 1 }, 30);
    fp30 = a.fingerprint; pose30 = a.pose;
    ok("two pursuit runs of 30 s give one fingerprint and one final pose", a.fingerprint === b.fingerprint && a.pose.pos.every((v, i) => v === b.pose.pos[i]), a.fingerprint);
    ok("a driver one m/s slower gives another fingerprint, and a fixed full throttle another again", c.fingerprint !== a.fingerprint && d.fingerprint !== a.fingerprint && d.fingerprint !== c.fingerprint, `${a.fingerprint} / ${c.fingerprint} / ${d.fingerprint}`);
    ok("  the skidpad's fingerprint is not the track's", fpStraight !== a.fingerprint);
}

// ---------------------------------------------------------------------------------------------------------------------------------
sec("6. IN THE BROWSER ON BOTH BACKENDS: the same wasm, the same 30 s, the same fingerprint, the truck drawn at the pose");
{
    const skip = webgpuSkipReason();
    if (skip) { console.log(`  SKIP  ${skip}`); report("*** NOT A PASS. ***"); fails++; }
    else {
        const W = 400, H = 400, FOV = 0.9, eye = [0, 230, 0.5], target = [0, 0, 0];
        const r = await runInEngineOrigin({ engineRoot: ENG, args: { W, H, FOV, eye, target, startX: cp.x + 5, startZ: cp.z }, script: `async (a) => {
            const { requestDevice } = await import("/gfx/device.js");
            const G = await import("/render/gpuDriven.mjs");
            const L = await import("/render/litSphere.mjs");
            const K = await import("/world/kenneyKit.mjs");
            const T = await import("/world/raceTrack.mjs");
            const C = await import("/physics/raceCar.mjs");
            const V = await import("/render/voxelDevice.mjs");
            const { CityGen } = await import("/world/CityGen.js");
            const { box3d } = await import("/physics/box3d/box3dLoader.js");
            const { worldFromModule } = await import("/render/slugTicker.mjs");
            const { W, H, FOV, eye, target, startX, startZ } = a; const out = {};
            const ps = await box3d.init(); if (!ps.ready) return { error: "box3d: " + ps.reason };
            const readBytes = async (p) => { const r = await fetch("/" + p); if (!r.ok) throw new Error(p + ": HTTP " + r.status); return r.arrayBuffer(); };
            const readImage = async (p) => { const r = await fetch("/" + p); if (!r.ok) throw new Error(p + ": HTTP " + r.status); const bmp = await createImageBitmap(await r.blob(), { colorSpaceConversion: "none", premultiplyAlpha: "none" }); const oc = new OffscreenCanvas(bmp.width, bmp.height), ctx = oc.getContext("2d"); ctx.drawImage(bmp, 0, 0); return K.imageToColormap(ctx.getImageData(0, 0, bmp.width, bmp.height)); };
            const kit = await K.loadKit("racing", { readBytes, readImage, baseUrlOf: (p) => new URL("/" + p, location.href).href });
            const track = T.generateTrack({ seed: 1 }), surface = C.trackSurface(track), placements = T.tilePlacements(track), world = V.miniWorld(); T.trackWorld(track, world, CityGen); const packed = V.meshWorld(world);
            const t0 = performance.now(), phys = worldFromModule(box3d._mod, [0, -9.81, 0]), car = C.createCar(phys, { x: startX, z: startZ, yaw: Math.PI / 2 });
            const run = C.drive(phys, car, surface, C.pursuitDriver(surface), { seconds: 30 }); const driveMs = performance.now() - t0; phys.destroy();
            const truck = { file: "vehicle-truck-red.glb", ...C.truckPlacement(run.pose) };
            const cam = { viewProj: G.multiply(G.perspective(FOV, W / H, 0.5, 800), G.lookAt(eye, target)), eye };
            for (const backend of ["webgpu", "webgl2"]) {
                const cv = document.createElement("canvas"); cv.width = W; cv.height = H;
                const dev = await requestDevice(cv, { backend, offscreen: backend === "webgpu" });
                const errs = []; if (dev.gpu && dev.gpu.addEventListener) dev.gpu.addEventListener("uncapturederror", (e) => errs.push(String(e.error && e.error.message).slice(0, 300)));
                const sc = K.kitScene(dev, kit, [...placements, truck], G, L, { light: V.SUN, dynamic: true, extraFleets: [{ name: "world", mesh: packed.mesh, pipeline: L.litPipelineDesc({ cull: "none" }), bind: L.litBind(V.SUN), records: Float32Array.from([0, 0, 0, 1]), extras: new Float32Array(4) }] });
                const f = await sc.frame({ ...cam, read: true, clear: [0, 0, 0, 1] }).pixels;
                // the page's own route: the truck's record rewritten in place (40 m east) and the next frame drawn from the same scene
                const i = placements.length; sc.kitRecords[i * 4] += 40;
                const f2 = await sc.frame({ ...cam, read: true, clear: [0, 0, 0, 1] }).pixels;
                out[backend] = { path: sc.path, errs, pixels: Array.from(f.pixels), moved: Array.from(f2.pixels) };
                sc.destroy(); dev.destroy();
            }
            return { ...out, fingerprint: run.fingerprint, pose: run.pose, kinds: run.kinds, driveMs, truck };
        }` });
        ok("the browser ran box3d's wasm and drew the track with the truck on both backends", r.ok && r.result && !r.result.error && r.result.webgpu && r.result.webgl2 && r.result.webgpu.errs.length === 0, r.ok ? (r.result.error || ((r.result.webgpu && r.result.webgpu.errs) || []).join(" | ")).slice(0, 300) : (r.reason || r.error || (r.pageErrors || []).join(" | ")).slice(0, 400));
        if (r.ok && r.result && r.result.webgpu && r.result.webgl2) {
            const R = r.result, N = W * H;
            report(`the browser drove 30 s in ${R.driveMs.toFixed(0)} ms: fingerprint ${R.fingerprint}, pose ${R.pose.pos.map((v) => v.toFixed(3)).join(", ")}, wheel samples ${JSON.stringify(R.kinds)}`);
            ok("*** the browser's 30 s fingerprint and final pose are node's: one wasm, one float path, one answer in both runtimes ***", R.fingerprint === fp30 && R.pose.pos.every((v, i) => near(v, pose30.pos[i], 1e-4)), `browser ${R.fingerprint}, node ${fp30}`);
            const vp = G.multiply(G.perspective(FOV, W / H, 0.5, 800), G.lookAt(eye, target));
            const project = (p) => { const x = vp[0] * p[0] + vp[4] * p[1] + vp[8] * p[2] + vp[12], y = vp[1] * p[0] + vp[5] * p[1] + vp[9] * p[2] + vp[13], w = vp[3] * p[0] + vp[7] * p[1] + vp[11] * p[2] + vp[15]; return [Math.round((x / w * 0.5 + 0.5) * W), Math.round((1 - (y / w * 0.5 + 0.5)) * H)]; };
            const window_ = (px, cx, cy, half) => { const o = []; for (let y = cy - half; y <= cy + half; y++) for (let x = cx - half; x <= cx + half; x++) if (x >= 0 && y >= 0 && x < W && y < H) { const i = (y * W + x) * 4; o.push([px[i], px[i + 1], px[i + 2]]); } return o; };
            const isRed = (c) => c[0] > c[1] * 1.6 && c[0] > c[2] * 1.6 && c[0] > 90;
            const apart = (A, B) => { let n = 0; for (let p = 0; p < N; p++) if (Math.abs(A[p * 4] - B[p * 4]) > 8 || Math.abs(A[p * 4 + 1] - B[p * 4 + 1]) > 8 || Math.abs(A[p * 4 + 2] - B[p * 4 + 2]) > 8) n++; return n; };
            for (const bk of ["webgpu", "webgl2"]) {
                const [cx, cy] = project([R.pose.pos[0], 1, R.pose.pos[2]]), w = window_(R[bk].pixels, cx, cy, 4), red = w.filter(isRed).length / Math.max(1, w.length);
                const away = window_(R[bk].pixels, cx + 40, cy, 4).filter(isRed).length / 81;
                ok(`${bk}: red truck pixels where the pose projects (${(red * 100).toFixed(0)} % of a 9 x 9 window) and not 40 pixels away (${(away * 100).toFixed(0)} %)`, red > 0.15 && away < 0.05, `${R[bk].path}`);
                const [mx, my] = project([R.pose.pos[0] + 40, 1, R.pose.pos[2]]), redMoved = window_(R[bk].moved, mx, my, 4).filter(isRed).length / 81, redLeft = window_(R[bk].moved, cx, cy, 4).filter(isRed).length / 81;
                ok(`  ${bk}: the truck's record rewritten in place moves it 40 m east in the next frame (${(redMoved * 100).toFixed(0)} % red there, ${(redLeft * 100).toFixed(0)} % left behind against ${(red * 100).toFixed(0)} % before; the kerb's stripes are red too) -- the dynamic record reaches the device every frame`, redMoved > 0.1 && redLeft < red * 0.5);
            }
            ok("  the two backends agree within 8 of 255 on all but edge pixels (fewer than 3 %)", apart(R.webgpu.pixels, R.webgl2.pixels) < N * 0.03, `${apart(R.webgpu.pixels, R.webgl2.pixels)} apart`);
        }
        if (r && r.pageErrors && r.pageErrors.length) report("page errors: " + r.pageErrors.slice(0, 3).join(" | "));
    }
}

console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nall checks pass");
console.log("unchecked here: the wheel joints themselves (native-only until the wasm is rebuilt with emsdk; physics/wheelJoint.mjs holds their measurement); wheel spin and tyre slip curves (the tyre model is vehicle.mjs's linear-to-saturation one); the car against another car (round 3 races them); the page's live drive (eyeballed).");
process.exit(fails ? 1 : 0);
