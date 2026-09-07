#!/usr/bin/env node
// WebGLEngine/tools/ship/drivePolicy-selfcheck.mjs -- Racing city 3 (task 66)
//
// THE BRAIN THAT LEARNS TO DRIVE: brain/drivePolicy.mjs behind race-brain.html, headless on the vendored wasm and then in the browser on
// both backends. Section 1, the shape: 98 weights split into the two layers mlpLayerCpu takes, the forward pass equal to a plain
// float32 relu MLP written here, the zero policy silent, the hand policy's rule readable off its outputs, the features of order one at
// the finish line. Section 2, the baselines: the zero policy stands still on seed 1 (no lap, under a metre), the hand policy laps seeds
// 1 to 4 inside 60 s with no wheel off the asphalt. Section 3, LEARNING: forty (1+1)-ES candidates from the hand at sigma 0.05 on the
// two train seeds accept several, raise the train score, cut seed 1's lap time and still lap the held-out seed; the same seed trains
// the same weights; from ZERO the search climbs over sixty iterations and does not lap, which is recorded, not hidden. Section 4, the
// auto-trainer: the store is a ratchet on the held-out score (a worse offer refused, a malformed one refused at the door), the audit
// seed is scored beside it without a vote, and regret is a number from the first attempt. Section 5, the race: trained, hand and
// zero drive one world in lockstep; the order is trained, hand, zero; a second run is the same fingerprint; the replay from the input
// log alone reaches the same fingerprint and results; two zero cars tie and the fleet fingerprint orders them the same way twice.
// Section 6, IN THE BROWSER ON BOTH BACKENDS: the same three-car race for 20 s in the page's wasm to node's fingerprint, and the
// three trucks (red, green, yellow) drawn at their poses on the track.
//
// MEASURED AT THE ROUND (v4526, this box): forward equals the gate's float32 relu MLP; the zero policy 0.00 m in 45 s; the hand laps
// seeds 1..4 in 57.6 / 56.5 / 56.3 / 58.9 s with 0 off-asphalt samples; 40 candidates from the hand at sigma 0.05 on seeds 1 and 4
// in 18.8 s: 10 accepted, 583 -> 1039, seed 1's lap 57.6 -> 30.6 s (2 laps in 60 s), held-out seed 2 lapped in 31.0 s with 66 off;
// from zero 60 candidates in 19.8 s climb -0 -> 6 monotone, 5 m, no lap; two auto-trainer attempts of 12 in 10.0 s, regret 5.27;
// machine fingerprint 0df0f92e; three cars for 60 s in 0.7 s: 752 m (30.8 s) / 389 m (58.1 s) / 4 m (the zero car shoved by the
// trained car coming round; 0.0000 m at 20 s), order 0 > 1 > 2, fingerprint 38f5c837 twice and from the log alone; the tie 1 > 0 here
// and 0 > 1 under fleet deadbeef; the browser's 20 s race 16e78e5c in 0.26 s = node's; the trucks 53 / 23 / 35 % of their windows on
// both backends. Three corrections while the gate was written: the zero car 'never moves' hold read the shove as driving (held under
// a metre at 20 s and under ten at 60 now); blobTrainer's mulberry import carried node:url into the browser (restated in the module);
// the camera at 230 m left the green truck 6 % of its window (120 m).
//
// SABOTAGE (the round): A the hand's heading sign flipped -> 1 red (the ES's held-out lap; the hand itself still laps on toLook
// alone -- the heading term is the small one, recorded, not hidden); B forward without tanh -> 2 red (the twin, the hand's rule);
// C the tie-break ignoring the fleet -> 1 red (deadbeef orders the same); D replay ignoring the log -> 1 red (fingerprint 455e28d1);
// E metresBetween returning 0 -> 3 red (no ES acceptance, no climb from zero, the determinism row).
//
// Run: node tools/ship/drivePolicy-selfcheck.mjs      (~2 min: the ES is the cost)
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInEngineOrigin, webgpuSkipReason } from "./webgpuHarness.mjs";
import { initNode, mod } from "../../physics/box3d/box3dNode.mjs";
import { worldFromModule } from "../../render/slugTicker.mjs";
import * as D from "../../brain/drivePolicy.mjs";
import * as C from "../../physics/raceCar.mjs";
import * as T from "../../world/raceTrack.mjs";
import * as G from "../../render/gpuDriven.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const report = (s) => console.log(`  ----  ${s}`);
const sec = (s) => console.log("\n" + s);
const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;
const quiet = () => { const log = console.log; console.log = (...a) => { if (!/\[GLBParser\]|\[box3d\]|\[CityGen\]/.test(String(a[0]))) log(...a); }; };
quiet();
const st = await initNode();
if (!st.ready) { console.log("  SKIP  box3d wasm: " + st.reason); console.log("\nFAIL -- the wasm is the substrate"); process.exit(1); }
const m = mod(), worldFrom = () => worldFromModule(m, [0, -9.81, 0]);
const timed = (f) => { const t0 = performance.now(); const r = f(); return { r, ms: performance.now() - t0 }; };

// ---------------------------------------------------------------------------------------------------------------------------------
sec("1. the shape: two MLP layers through the GPU kernel's f32 twin, the zero and the hand");
{
    ok("98 weights: 9 x 8 + 8 + 8 x 2 + 2", D.WEIGHT_COUNT === 98 && D.zeroWeights().length === 98 && D.FEATURE_NAMES.length === D.FEATURES);
    const [l1, l2] = D.layersOf(D.zeroWeights());
    ok("layersOf splits them into 9 -> 8 relu and 8 -> 2 none, the layer shape brain/mlp.js's kernel takes", l1.nIn === 9 && l1.nOut === 8 && l1.act === "relu" && l1.W.length === 72 && l1.b.length === 8 && l2.nIn === 8 && l2.nOut === 2 && l2.act === "none" && l2.W.length === 16 && l2.b.length === 2);
    // a plain relu MLP, written here, against the twin
    const w = D.perturb(D.zeroWeights(), 0.7, () => 0.37), x = [1, 0.3, -0.2, 0.1, -0.4, 0.2, 0.5, -0.1, 0];
    const plain = (() => { const f = Math.fround, [a, b] = D.layersOf(w), h = []; for (let o = 0; o < 8; o++) { let acc = f(a.b[o]); for (let k = 0; k < 9; k++) acc = f(acc + f(f(x[k]) * f(a.W[o * 9 + k]))); h.push(f(Math.max(0, acc))); } const y = []; for (let o = 0; o < 2; o++) { let acc = f(b.b[o]); for (let k = 0; k < 8; k++) acc = f(acc + f(f(h[k]) * f(b.W[o * 8 + k]))); y.push(Math.tanh(acc)); } return y; })();
    const got = D.forward(w, x);
    ok("forward equals a plain float32 relu MLP written here, then tanh", near(got[0], plain[0], 1e-6) && near(got[1], plain[1], 1e-6), `${got.map((v) => v.toFixed(5))} vs ${plain.map((v) => v.toFixed(5))}`);
    ok("the zero policy answers steer 0, drive 0 to anything", D.forward(D.zeroWeights(), x).every((v) => v === 0));
    const hand = D.handWeights(), h0 = D.forward(hand, [1, 0, 0, 0, 0.5, 0, 0, 0, 0]), h1 = D.forward(hand, [1, 0.65, 0, 0, 0, 0, 1, 0, 0]);
    ok("the hand policy's rule reads off its outputs: half a lookahead angle steers tanh(1.5), a standing car drives tanh(0.8); at 13 m/s into a full turn it brakes", near(h0[0], Math.tanh(1.5), 1e-6) && near(h0[1], Math.tanh(0.8), 1e-6) && h1[1] < 0, `${h0.map((v) => v.toFixed(3))}, drive into the turn ${h1[1].toFixed(3)}`);
    const surface = D.surfaceFor(1), cp = T.checkpoints(surface.track)[0], pose = { pos: [cp.x + 5, 2, cp.z], yaw: Math.PI / 2, speed: 0 };
    const f = D.features(surface, pose);
    ok("the features at the finish line, facing along the road: bias 1, speed 0, across 0, heading 0, on the asphalt, every one of order one", f.length === 9 && f[0] === 1 && f[1] === 0 && near(f[2], 0, 1e-6) && near(f[3], 0, 1e-6) && f[8] === 0 && f.every((v) => Math.abs(v) <= 2), f.map((v) => v.toFixed(3)).join(","));
    ok("  ...and a car pointed 45 degrees left of the road reads heading -0.5 (the road is to its right)", near(D.features(surface, { ...pose, yaw: Math.PI / 2 + Math.PI / 4 })[3], -0.5, 1e-6));
}

// ---------------------------------------------------------------------------------------------------------------------------------
sec("2. the baselines: zero stands still, the hand laps every seed");
const hand = D.handWeights();
let handLap1 = null;
{
    const z = D.episode(worldFrom, D.zeroWeights(), D.surfaceFor(1), { seconds: 45 });
    ok("*** the zero policy does not lap: no lap, under a metre of progress, every wheel on the asphalt ***", z.laps === 0 && Math.abs(z.metres) < 1 && z.off === 0, `${z.metres.toFixed(2)} m, score ${z.score.toFixed(2)}`);
    const rows = [1, 2, 3, 4].map((seed) => ({ seed, ...D.episode(worldFrom, hand, D.surfaceFor(seed), { seconds: 60 }) }));
    handLap1 = rows[0].lapTime;
    report("the hand policy: " + rows.map((r) => `seed ${r.seed} ${r.laps} lap in ${r.lapTime && r.lapTime.toFixed(1)} s, ${r.metres.toFixed(0)} m, ${r.off} off`).join("; "));
    ok("*** the hand policy laps seeds 1 to 4 inside 60 s with no wheel sample off the asphalt ***", rows.every((r) => r.laps >= 1 && r.lapTime < 60 && r.off === 0));
}

// ---------------------------------------------------------------------------------------------------------------------------------
sec("3. LEARNING: the ES from the hand cuts the lap time and generalises; from zero it climbs and does not lap");
let trained = null;
{
    const { r, ms } = timed(() => D.train(worldFrom, { seed: 7, iters: 40, seconds: 60, start: hand, sigma: 0.05 }));
    trained = r.weights;
    const e1 = D.episode(worldFrom, trained, D.surfaceFor(1), { seconds: 60 }), e2 = D.episode(worldFrom, trained, D.surfaceFor(2), { seconds: 60 });
    report(`40 candidates from the hand at sigma 0.05 on seeds ${D.TRAIN_SEEDS.join(", ")} in ${(ms / 1000).toFixed(1)} s: ${r.accepted} accepted, score ${r.history[0].score.toFixed(0)} -> ${r.trainScore.toFixed(0)}; seed 1: ${e1.laps} laps, first in ${e1.lapTime && e1.lapTime.toFixed(1)} s (hand ${handLap1.toFixed(1)}), ${e1.off} off; held-out seed 2: ${e2.laps} laps in ${e2.lapTime && e2.lapTime.toFixed(1)} s, ${e2.off} off`);
    ok("*** the ES accepts candidates, raises the train score, and the trained policy laps seed 1 FASTER than the hand ***", r.accepted >= 3 && r.trainScore > r.history[0].score && e1.laps >= 1 && e1.lapTime < handLap1 - 5);
    ok("  ...and still laps the held-out seed it never trained on", e2.laps >= 1 && e2.lapTime < 60, `${e2.lapTime && e2.lapTime.toFixed(1)} s`);
    ok("  sigma widens on a win and narrows on a loss, staying in [0.02, 1]", r.history.every((h) => h.sigma >= 0.02 && h.sigma <= 1) && r.history.length >= 5);
    const a = D.train(worldFrom, { seed: 11, iters: 8, seconds: 30, start: hand, sigma: 0.05 }), b = D.train(worldFrom, { seed: 11, iters: 8, seconds: 30, start: hand, sigma: 0.05 });
    ok("the same seed trains the same weights (hash) and the same history", D.weightsHash(a.weights) === D.weightsHash(b.weights) && JSON.stringify(a.history) === JSON.stringify(b.history), D.weightsHash(a.weights));
    const c = D.train(worldFrom, { seed: 12, iters: 8, seconds: 30, start: hand, sigma: 0.05 });
    ok("  a different seed, different weights", D.weightsHash(c.weights) !== D.weightsHash(a.weights));
    const { r: z, ms: zms } = timed(() => D.train(worldFrom, { seed: 7, iters: 60, seconds: 45 }));
    const ze = D.episode(worldFrom, z.weights, D.surfaceFor(1), { seconds: 45 });
    report(`from ZERO, 60 candidates at sigma 0.5 in ${(zms / 1000).toFixed(1)} s: ${z.accepted} accepted, score ${z.history.map((h) => h.score.toFixed(0)).join(" -> ")}; on seed 1 ${ze.metres.toFixed(0)} m, ${ze.laps} laps, ${ze.off} off`);
    ok("from zero the search CLIMBS (the score never falls and ends above 3) and does not lap in sixty candidates -- said, not hidden: the hand start is where the ES pays", z.history.every((h, i) => i === 0 || h.score >= z.history[i - 1].score) && z.trainScore > 3 && ze.laps === 0);
}

// ---------------------------------------------------------------------------------------------------------------------------------
sec("4. the auto-trainer: a ratchet on the held-out score, an audit that never votes, regret as a number");
{
    const store = D.driveStore();
    ok("an empty store holds nothing; a malformed offer is refused at the door", store.current() === null && store.offer({ weights: new Float32Array(3), score: 1 }).accepted === false && store.offer({ weights: D.zeroWeights().fill(NaN), score: 1 }).ok === false);
    const held = D.evaluate(worldFrom, hand, D.HELD_OUT_SEEDS, { seconds: 45 }).score;
    const first = store.offer({ weights: hand, score: held, by: "hand" }), worse = store.offer({ weights: D.zeroWeights(), score: held - 1, by: "zero" });
    ok("the hand is accepted into an empty store; a worse offer is refused and the hand kept", first.accepted && !worse.accepted && worse.reason === "kept the better policy" && store.current().hash === D.weightsHash(hand), `held ${held.toFixed(1)}`);
    const { r: at, ms } = timed(() => { const t = D.createAutoTrainer(worldFrom, { store, itersPerAttempt: 12, seconds: 45 }); t.attempt(1); t.attempt(2); return t; });
    const rep = at.report();
    report(`two attempts of 12 in ${(ms / 1000).toFixed(1)} s: ${JSON.stringify(at.history.map((h) => ({ held: +h.held.toFixed(1), audit: +h.audit.toFixed(1), accepted: h.accepted, regret: h.regret === null ? null : +h.regret.toFixed(2) })))}; report ${JSON.stringify({ ...rep, bestAuditEver: +rep.bestAuditEver.toFixed(1), heldAudit: +rep.heldAudit.toFixed(1), regret: +rep.regret.toFixed(2) })}`);
    ok("*** every attempt scores the held-out seed (the vote) and the audit seed (no vote), and regret is a number from the first attempt ***", at.history.length === 2 && at.history.every((h) => Number.isFinite(h.held) && Number.isFinite(h.audit) && Number.isFinite(h.regret)) && Number.isFinite(rep.regret) && rep.regret >= 0);
    ok("  the store still holds a lapping policy (the ratchet only opens upward)", store.current().score >= held);
    ok("machineFingerprint is stable across two runs of the canonical scene", D.machineFingerprint(m) === D.machineFingerprint(m), D.machineFingerprint(m));
}

// ---------------------------------------------------------------------------------------------------------------------------------
sec("5. the race: trained, hand and zero in one world in lockstep; the fingerprint; the replay; the tie-break");
const fleet = D.machineFingerprint(m);
let race20 = null;
{
    const { r: R, ms } = timed(() => D.race(worldFrom, [trained, hand, D.zeroWeights()], { seed: 1, seconds: 60, fleet }));
    report(`three cars, 60 s, ${ms.toFixed(0)} ms: ` + R.results.map((q) => `car ${q.car} ${q.laps} laps ${q.metres.toFixed(0)} m${q.lapTime ? " first in " + q.lapTime.toFixed(1) + " s" : ""}`).join("; ") + `; order ${R.order.join(" > ")}; fingerprint ${R.fingerprint}`);
    ok("*** the order is trained, hand, zero: the learned policy beats the hand it started from, and the zero car never drives (the metres it shows are the trained car shoving it as it comes round on its second lap) ***", R.order.join() === "0,1,2" && R.results[0].laps >= 1 && R.results[2].laps === 0 && R.results[2].metres < 10);
    const R2 = D.race(worldFrom, [trained, hand, D.zeroWeights()], { seed: 1, seconds: 60, fleet });
    ok("a second run is the same fingerprint, the same results", R2.fingerprint === R.fingerprint && JSON.stringify(R2.results.map((q) => [q.laps, q.metres])) === JSON.stringify(R.results.map((q) => [q.laps, q.metres])));
    const P = D.replay(worldFrom, R);
    ok("*** the replay from the input log alone, with no policies, reaches the same fingerprint and the same results ***", P.fingerprint === R.fingerprint && JSON.stringify(P.results.map((q) => [q.laps, +q.metres.toFixed(3)])) === JSON.stringify(R.results.map((q) => [q.laps, +q.metres.toFixed(3)])) && P.order.join() === R.order.join(), P.fingerprint);
    ok("  the log holds one input per car per tick, clamped to the contract", R.log.length === R.ticks && R.log.every((row) => row.length === 3 && row.every((u) => u.steer >= -1 && u.steer <= 1 && u.throttle >= 0 && u.throttle <= 1 && u.brake >= 0 && u.brake <= 1)));
    const tie = D.race(worldFrom, [D.zeroWeights(), D.perturb(D.zeroWeights(), 1e-7, () => 0.5)], { seed: 1, seconds: 3, fleet }), tie2 = D.race(worldFrom, [D.zeroWeights(), D.perturb(D.zeroWeights(), 1e-7, () => 0.5)], { seed: 1, seconds: 3, fleet: "deadbeef" });
    ok("two cars that tie (both still) are ordered by the fleet fingerprint folded with their policy hashes -- deterministic, and fleet deadbeef orders them the other way round from this machine's fleet (measured: 1 > 0 here, 0 > 1 there)", tie.order.length === 2 && tie.order.join() === D.race(worldFrom, [D.zeroWeights(), D.perturb(D.zeroWeights(), 1e-7, () => 0.5)], { seed: 1, seconds: 3, fleet }).order.join() && tie.order.join() !== tie2.order.join(), `fleet ${fleet}: ${tie.order.join(" > ")}; fleet deadbeef: ${tie2.order.join(" > ")}`);
    race20 = D.race(worldFrom, [trained, hand, D.zeroWeights()], { seed: 1, seconds: 20, fleet });
    ok("  before anyone comes round (20 s) the zero car has not moved a tenth of a metre", race20.results[2].laps === 0 && race20.results[2].metres < 0.1, `${race20.results[2].metres.toFixed(4)} m`);
}

// ---------------------------------------------------------------------------------------------------------------------------------
sec("6. IN THE BROWSER ON BOTH BACKENDS: the same three-car race to node's fingerprint, the three trucks at their poses");
{
    const skip = webgpuSkipReason();
    if (skip) { console.log(`  SKIP  ${skip}`); report("*** NOT A PASS. ***"); fails++; }
    else {
        const W = 400, H = 400, FOV = 0.9, eye = [0, 120, 0.5], target = [0, 0, 0];
        const r = await runInEngineOrigin({ engineRoot: ENG, args: { W, H, FOV, eye, target, trained: Array.from(trained), hand: Array.from(hand), fleet }, script: `async (a) => {
            const { requestDevice } = await import("/gfx/device.js");
            const G = await import("/render/gpuDriven.mjs");
            const L = await import("/render/litSphere.mjs");
            const K = await import("/world/kenneyKit.mjs");
            const T = await import("/world/raceTrack.mjs");
            const C = await import("/physics/raceCar.mjs");
            const D = await import("/brain/drivePolicy.mjs");
            const V = await import("/render/voxelDevice.mjs");
            const { CityGen } = await import("/world/CityGen.js");
            const { box3d } = await import("/physics/box3d/box3dLoader.js");
            const { worldFromModule } = await import("/render/slugTicker.mjs");
            const { W, H, FOV, eye, target } = a; const out = {};
            const ps = await box3d.init(); if (!ps.ready) return { error: "box3d: " + ps.reason };
            const worldFrom = () => worldFromModule(box3d._mod, [0, -9.81, 0]);
            const t0 = performance.now(), R = D.race(worldFrom, [Float32Array.from(a.trained), Float32Array.from(a.hand), D.zeroWeights()], { seed: 1, seconds: 20, fleet: a.fleet }), raceMs = performance.now() - t0;
            const readBytes = async (p) => { const r = await fetch("/" + p); if (!r.ok) throw new Error(p + ": HTTP " + r.status); return r.arrayBuffer(); };
            const readImage = async (p) => { const r = await fetch("/" + p); if (!r.ok) throw new Error(p + ": HTTP " + r.status); const bmp = await createImageBitmap(await r.blob(), { colorSpaceConversion: "none", premultiplyAlpha: "none" }); const oc = new OffscreenCanvas(bmp.width, bmp.height), ctx = oc.getContext("2d"); ctx.drawImage(bmp, 0, 0); return K.imageToColormap(ctx.getImageData(0, 0, bmp.width, bmp.height)); };
            const kit = await K.loadKit("racing", { readBytes, readImage, baseUrlOf: (p) => new URL("/" + p, location.href).href });
            const track = T.generateTrack({ seed: 1 }), placements = T.tilePlacements(track), world = V.miniWorld(); T.trackWorld(track, world, CityGen); const packed = V.meshWorld(world);
            const files = ["vehicle-truck-red.glb", "vehicle-truck-green.glb", "vehicle-truck-yellow.glb"], trucks = R.results.map((q, i) => ({ file: files[i], ...C.truckPlacement(q.pose) }));
            const cam = { viewProj: G.multiply(G.perspective(FOV, W / H, 0.5, 800), G.lookAt(eye, target)), eye };
            for (const backend of ["webgpu", "webgl2"]) {
                const cv = document.createElement("canvas"); cv.width = W; cv.height = H;
                const dev = await requestDevice(cv, { backend, offscreen: backend === "webgpu" });
                const errs = []; if (dev.gpu && dev.gpu.addEventListener) dev.gpu.addEventListener("uncapturederror", (e) => errs.push(String(e.error && e.error.message).slice(0, 300)));
                const sc = K.kitScene(dev, kit, [...placements, ...trucks], G, L, { light: V.SUN, extraFleets: [{ name: "world", mesh: packed.mesh, pipeline: L.litPipelineDesc({ cull: "none" }), bind: L.litBind(V.SUN), records: Float32Array.from([0, 0, 0, 1]), extras: new Float32Array(4) }] });
                const f = await sc.frame({ ...cam, read: true, clear: [0, 0, 0, 1] }).pixels;
                out[backend] = { path: sc.path, errs, pixels: Array.from(f.pixels) };
                sc.destroy(); dev.destroy();
            }
            return { ...out, fingerprint: R.fingerprint, order: R.order, results: R.results.map((q) => ({ laps: q.laps, metres: q.metres, pos: q.pose.pos })), raceMs, failed: kit.failed };
        }` });
        ok("the browser ran the race on its wasm and drew the trucks on both backends", r.ok && r.result && !r.result.error && r.result.webgpu && r.result.webgl2 && r.result.webgpu.errs.length === 0, r.ok ? (r.result.error || ((r.result.webgpu && r.result.webgpu.errs) || []).join(" | ")).slice(0, 300) : (r.reason || r.error || (r.pageErrors || []).join(" | ")).slice(0, 400));
        if (r.ok && r.result && r.result.webgpu && r.result.webgl2) {
            const R = r.result, N = W * H;
            report(`the browser raced 20 s in ${R.raceMs.toFixed(0)} ms: fingerprint ${R.fingerprint} (node ${race20.fingerprint}), order ${R.order.join(" > ")}`);
            ok("*** the browser's 20 s race is node's: the same fingerprint, the same order, the same results ***", R.fingerprint === race20.fingerprint && R.order.join() === race20.order.join() && R.results.every((q, i) => q.laps === race20.results[i].laps && near(q.metres, race20.results[i].metres, 1e-3)));
            const vp = G.multiply(G.perspective(FOV, W / H, 0.5, 800), G.lookAt(eye, target));
            const project = (p) => { const x = vp[0] * p[0] + vp[4] * p[1] + vp[8] * p[2] + vp[12], y = vp[1] * p[0] + vp[5] * p[1] + vp[9] * p[2] + vp[13], w = vp[3] * p[0] + vp[7] * p[1] + vp[11] * p[2] + vp[15]; return [Math.round((x / w * 0.5 + 0.5) * W), Math.round((1 - (y / w * 0.5 + 0.5)) * H)]; };
            const window_ = (px, cx, cy, half) => { const o = []; for (let y = cy - half; y <= cy + half; y++) for (let x = cx - half; x <= cx + half; x++) if (x >= 0 && y >= 0 && x < W && y < H) { const i = (y * W + x) * 4; o.push([px[i], px[i + 1], px[i + 2]]); } return o; };
            const hues = [(c) => c[0] > c[1] * 1.6 && c[0] > c[2] * 1.6 && c[0] > 90, (c) => c[1] > c[0] * 1.5 && c[1] > c[2] * 1.1 && c[1] > 90, (c) => c[0] > 150 && c[1] > 110 && c[2] < c[1] * 0.6];
            const apart = (A, B) => { let n = 0; for (let p = 0; p < N; p++) if (Math.abs(A[p * 4] - B[p * 4]) > 8 || Math.abs(A[p * 4 + 1] - B[p * 4 + 1]) > 8 || Math.abs(A[p * 4 + 2] - B[p * 4 + 2]) > 8) n++; return n; };
            for (const bk of ["webgpu", "webgl2"]) {
                const shares = R.results.map((q, i) => { const [cx, cy] = project([q.pos[0], 1, q.pos[2]]); const w = window_(R[bk].pixels, cx, cy, 4); return w.filter(hues[i]).length / Math.max(1, w.length); });
                ok(`${bk}: the red, green and yellow trucks are drawn at their cars' poses (${shares.map((v) => (v * 100).toFixed(0) + " %").join(", ")} of a 9 x 9 window in each hue)`, shares.every((v) => v > 0.1), R[bk].path);
            }
            ok("  the two backends agree within 8 of 255 on all but edge pixels (fewer than 3 %)", apart(R.webgpu.pixels, R.webgl2.pixels) < N * 0.03, `${apart(R.webgpu.pixels, R.webgl2.pixels)} apart`);
        }
        if (r && r.pageErrors && r.pageErrors.length) report("page errors: " + r.pageErrors.slice(0, 3).join(" | "));
    }
}

console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nall checks pass");
console.log("unchecked here: the policy's forward pass ON THE DEVICE (brain/mlp.js's BatchedMLP; the twin it is held to here is the CPU one the kernels gate holds bit for bit); a brain that laps from ZERO (sixty candidates climb and do not lap; the idle trainer's longer run is race-brain.html's, unmeasured beyond what section 3 records); cars that see each other (the features carry no other car); the page's idle loop (eyeballed).");
process.exit(fails ? 1 : 0);
