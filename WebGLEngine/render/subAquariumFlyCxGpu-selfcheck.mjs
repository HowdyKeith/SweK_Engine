// WebGLEngine/render/subAquariumFlyCxGpu-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node render/subAquariumFlyCxGpu-selfcheck.mjs      (a few seconds; a software adapter is enough; with no device the device sections are SKIPPED and said so)
//
// THE GATE OF render/subAquariumFlyCxGpu.mjs (PART B of "A TANK PILOT TYPE ON THE DEVICE, ONE TICK LATE", brain/RESERVOIR_GPU_WIP.md). It flies TRAINING dives only, never auditSets(90000).
//   1 REFUSALS     no device; a wrong weight count.
//   2 ONE TICK     in a harness that awaits every read, the device pilot's controls equal brain/pilotLateness.mjs's delayed(1) of the tank's CPU type to 1e-4 at every tick of a recorded
//                  flight; the first tick is the PD autopilot exactly; lateness reads 1 after it.
//   3 A NEW DIVE   a new target object (no sub): the autopilot for one tick, then delayed(1) again, which restarts there too; with a sub, a fresh target object every tick is NOT a new dive
//                  (only the sub's wandering target is).
//   4 NOT AWAITED  a read still in flight: the pilot keeps the newest controls it has and lateness grows; a read from the old dive that lands after a dive change is discarded.
//   5 DESTROY      destroy() frees every pilot's buffers.
//   6 THE SOURCE   no clock, no Math.random.
// SABOTAGE LOG (each broken in render/subAquariumFlyCxGpu.mjs, run, restored; red = failing rows):
//   B1 no device reset at a new dive 1 | B2 the old dive's controls kept at a new dive 3 | B3 a read from the old dive not discarded 1 | B4 lateness always 1 1
//   B5 the target object taken as the dive even with a sub 1 | B6 the compass bit dropped (always 1): 0 red at first -- no training dive passes aux -- the dark-compass row added, then 1
//   B7 pitch and yaw swapped coming back 2 | B8 a pilot's destroy() not untracked 1 | B9 the weight count unchecked 1
"use strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import * as H from "../tools/ship/headlessGpu.mjs";
import * as G from "./subAquariumFlyCxGpu.mjs";
import * as L from "../brain/pilotLateness.mjs";
import * as T from "../brain/subTask.mjs";
import * as AP from "../brain/autopilotSub.mjs";
import * as Y from "../tools/ship/latenessStudy.mjs";
let fails = 0, skipped = null;
const died = (e) => { console.log("  FAIL  !! THE GATE THREW before it finished: " + String((e && e.stack) || e).split("\n").slice(0, 3).join(" | ").slice(0, 400)); H.exitCleanly(1); };
process.on("uncaughtException", died); process.on("unhandledRejection", died);
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const sec = (t) => console.log("\n" + t);
const thr = (f) => { try { f(); return ""; } catch (e) { return String(e.message); } };
const KEYS = ["pitch", "yaw", "thrust", "ballast"], diff = (a, b) => Math.max(...KEYS.map((k) => Math.abs(a[k] - b[k])));
const C = Y.circuit(), W = Y.weights();
console.log("subAquariumFlyCxGpu-selfcheck -- the fly pilot on the device, one tick late\n");

sec("1. REFUSALS");
{
    ok("!! no device is refused by name", /needs a GPUDevice/.test(thr(() => G.flyCxGpuKind(C, null))) && /needs a GPUDevice/.test(thr(() => G.flyCxGpuKind(C, {}))));
    const k = G.flyCxGpuKind(C, { createBuffer() {} });
    ok("!! a wrong weight count is refused before the device is touched; the kind says it is on the device and takes the CPU type's 1729 weights", /takes exactly 1729 weights, got 963/.test(thr(() => k.build(new Float32Array(963)))) && k.weightCount === 1729 && k.onDevice === true && k.circuit === "flycx");
}

// ---- the device ----
const req = createRequire(import.meta.url), skip = H.headlessGpuSkipReason(req);
let device = null, gpuKeep = null;
if (!skip) {
    H.configureVulkanIcd(); const { mod } = H.resolveWebgpu(req); gpuKeep = mod.create([]); const adapter = await gpuKeep.requestAdapter();   // the instance is kept alive (headlessGpu.mjs v4691)
    if (adapter) { device = await adapter.requestDevice(); const g = mod.globals || globalThis; device.__usage = g.GPUBufferUsage || globalThis.GPUBufferUsage; device.__mapMode = g.GPUMapMode || globalThis.GPUMapMode; }
    else skipped = "requestAdapter() returned null";
} else skipped = skip;

/** One recorded flight's (state, target, current, aux) per tick, flown by the CPU type on time. */
const record = (dive) => { const st = [], p = Y.tankPilot(C, W); T.fly((s, t, c, a) => { st.push([s, t, c, a]); return p(s, t, c, a); }, dive); return st; };

if (device) {
    const kind = G.flyCxGpuKind(C, device);
    sec("2. ONE TICK");
    {
        const states = record(T.TRAIN_SET[1]), ref = L.delayedPilot(Y.tankPilot(C, W), 1), p = kind.build(Float32Array.from(W), {});
        const okReady = await p.ready; let worst = 0, first = null, late = new Set();
        for (let n = 0; n < states.length; n++) { const [s, t, c, a] = states[n], u = p(s, t, c, a), v = ref(s, t, c, a); if (n === 0) first = [u, AP.decide(s, t, c)]; else { worst = Math.max(worst, diff(u, v)); late.add(p.lateness); } await p.settle(); }
        ok("!! awaiting every read, the device pilot is delayed(1) of the CPU type to 1e-4 at every tick of a recorded flight", okReady && states.length > 100 && worst <= 1e-4, `${states.length} ticks, worst ${worst.toExponential(2)}`);
        ok("!! the first tick is the PD autopilot exactly; after it the pilot is one tick late, every tick", JSON.stringify(first[0]) === JSON.stringify(first[1]) && p.stats.autopilot === 1 && late.size === 1 && late.has(1) && p.stats.reads === states.length);
        p.destroy();
        const dark = states.slice(0, 300).map(([s, t, c], n) => [s, t, c, { compassValid: n >= 100 && n < 200 ? 0 : 1 }]), refD = L.delayedPilot(Y.tankPilot(C, W), 1), pd = kind.build(Float32Array.from(W), {}); await pd.ready; let wd = 0;
        for (const [s, t, c, a] of dark) { wd = Math.max(wd, diff(pd(s, t, c, a), refD(s, t, c, a))); await pd.settle(); }
        ok("!! a dark compass (aux.compassValid 0 for ticks 100 to 199) reaches the device as the 15th feature: still delayed(1) of the CPU type to 1e-4", wd <= 1e-4, `worst ${wd.toExponential(2)}`);
        pd.destroy();
    }
    sec("3. A NEW DIVE");
    {
        const s1 = record(T.TRAIN_SET[2]).slice(0, 120), s2 = record(T.TRAIN_SET[3]).slice(0, 120), states = [...s1, ...s2];
        const ref = L.delayedPilot(Y.tankPilot(C, W), 1), p = kind.build(Float32Array.from(W), {}); await p.ready; let worst = 0, apAt = [];
        for (let n = 0; n < states.length; n++) { const [s, t, c, a] = states[n], u = p(s, t, c, a), v = ref(s, t, c, a); if (p.lateness === null) apAt.push(n); worst = Math.max(worst, diff(u, v)); await p.settle(); }
        ok("!! a new target object: the autopilot for one tick (ticks 0 and 120), then delayed(1) again -- the device memory restarted where the CPU's did", JSON.stringify(apAt) === JSON.stringify([0, 120]) && worst <= 1e-4, `worst ${worst.toExponential(2)}`);
        p.destroy();
        const sub = { target: {} }, q = kind.build(Float32Array.from(W), { sub }), st = s1.slice(0, 40); await q.ready; const ap = [];
        for (let n = 0; n < st.length; n++) { const [s, t, c, a] = st[n]; q(s, { ...t }, c, a); if (q.lateness === null) ap.push(n); if (n === 20) sub.target = {}; await q.settle(); }
        ok("!! with a sub, a fresh target object each tick is NOT a new dive; the sub's wandering target changing is (the autopilot at ticks 0 and 21 only)", JSON.stringify(ap) === JSON.stringify([0, 21]), JSON.stringify(ap));
        q.destroy();
    }
    sec("4. NOT AWAITED");
    {
        const st = record(T.TRAIN_SET[4]).slice(0, 30), p = kind.build(Float32Array.from(W), {}); await p.ready;
        const [s, t, c, a] = st[0]; p(s, t, c, a); await p.settle(); p(...st[1]); p(...st[2]); const l2 = p.lateness; p(...st[3]); const l3 = p.lateness;
        ok("!! with a read in flight, the pilot keeps the newest controls it has: lateness 2 then 3 ticks", l2 === 2 && l3 === 3, `${l2}, ${l3}`);
        await p.settle(); const t2 = {}; const d0 = p.stats.discarded; p(s, t, c, a); p(s, t2, c, a); const apNow = p.lateness === null; await p.settle();
        ok("!! a read from the old dive that lands after a dive change is discarded: the new dive flies the autopilot, not the old dive's controls", apNow && p.stats.discarded === d0 + 1 && p.lateness === null);
        p.destroy();
    }
    sec("5. DESTROY");
    {
        const k2 = G.flyCxGpuKind(C, device), a = k2.build(Float32Array.from(W), {}), b = k2.build(Float32Array.from(W), {}); await a.ready; await b.ready; const n = k2.pilots; a.destroy(); const n1 = k2.pilots; k2.destroy();
        ok("!! each pilot's buffers are tracked; one destroy() frees one, the kind's destroy() the rest", n === 2 && n1 === 1 && k2.pilots === 0);
    }
} else sec(`2 to 5 SKIPPED (no device): ${skipped}`);

sec("6. THE SOURCE");
{
    const code = fs.readFileSync(new URL("./subAquariumFlyCxGpu.mjs", import.meta.url), "utf8").split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
    ok("!! no clock and no Math.random", !/Math\.random|Date\.now|new Date|performance\.now/.test(code));
}

console.log(`\n${fails ? "FAIL" : skipped ? "PASS (DEVICE SECTIONS SKIPPED)" : "all checks pass"}  subAquariumFlyCxGpu-selfcheck: ${fails} failing row${fails === 1 ? "" : "s"}`);
H.exitCleanly(fails ? 1 : 0);
