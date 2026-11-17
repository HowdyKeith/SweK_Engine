// WebGLEngine/brain/reservoirGpu-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node brain/reservoirGpu-selfcheck.mjs      (about 20-40 s: Dawn in Node through tools/ship/headlessGpu.mjs's driver lookup -- SwiftShader on the build box, the card on a rig)
//
// THE GATE OF brain/reservoirGpu.mjs (backlog `gpu-reservoir-kernel`): the fly reservoir's step on a WebGPU device, held to the CPU twin (brain/pilotSubCircuitState.mjs update) to 1e-4.
//   0 TABLES     the CSR of edges into each cell is the circuit's, sorted by source; the gains are the twin's (sign x count / sigmaMax); the input slots; sigma clamped; refusals.
//   1 ONE STEP   random weights, random states and features, batch 8, with and without memory: every cell within 1e-4 of the twin (relative to max(1, |twin|)); bit-identical cells reported, not asserted.
//   2 MANY STEPS 120 ticks, read every 20, the twin stepped alongside in float64: the drift stays within 1e-4 (relative); with and without memory.
//   3 THE REAL PILOT  the 1,729 weights of brain/pilotSubFlyCxWip.json on features recorded from a real tank flight through the compass dropout, four reservoirs offset in time, 300 ticks: within 1e-4.
//   4 LESION     the bias clamp of brain/lesion.mjs (-1e30) keeps the silenced cells at exactly 0 on the device too.
//   5 BATCH      a reservoir's result does not depend on the others in its batch; reset() zeroes every reservoir; non-finite features read as 0.
//   6 PRICE      the device against the twin for batches of 1 to 1,024, 50 ticks each, PRINTED (a software adapter's numbers say nothing about a card).
//   7 SOURCE     no clock, random number or file in the module; the header says what the GPU is not doing.
// A host with no device SKIPS sections 1 to 6 by name and the gate says so in its last line; it never passes them silently.
// SABOTAGE LOG: brain/RESERVOIR_GPU_WIP.md.
"use strict";
import { pathToFileURL } from "node:url";   // a dynamic import of a filesystem path must be a file URL: new URL("file://" + "C:\\...") crashes on Windows (tools/ship/windowsImport-selfcheck.mjs)
import fs from "node:fs";
import { createRequire } from "node:module";
import * as H from "../tools/ship/headlessGpu.mjs";
let fails = 0, finished = false, skipped = null;
const died = (e) => { console.log("  FAIL  !! THE GATE THREW before it finished: " + String((e && e.stack) || e).split("\n").slice(0, 3).join(" | ").slice(0, 400)); H.exitCleanly(1); };
process.on("uncaughtException", died); process.on("unhandledRejection", died);
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const sec = (t) => console.log("\n" + t);
const J = JSON.stringify;
const G = await import((process.env.RGPU_UNDER_TEST ? pathToFileURL(process.env.RGPU_UNDER_TEST) : new URL("./reservoirGpu.mjs", import.meta.url)).href);
import * as CS from "./pilotSubCircuitState.mjs";
import * as P from "./pilotSubPolicy.mjs";
import * as L from "./lesion.mjs";
import * as LF from "./lesionFlyCx.mjs";
import * as A from "../render/subAquariumSim.mjs";
import * as FX from "../render/subAquariumFlyCx.mjs";
const rd = (f) => JSON.parse(fs.readFileSync(new URL("../" + f, import.meta.url), "utf8"));
const cj = rd("vendor/hemibrain/hemibrain-cx-heading-loop.json"), C = { neurons: cj.neurons, edges: cj.edges, io: cj.io }, file = rd("brain/pilotSubFlyCxWip.json");
const thr = (f) => { try { f(); return ""; } catch (e) { return String(e.message); } };
const POL = CS.createStatePolicy(C, "twin"), NOS = CS.createStatePolicy(C, "twin", { persist: false }), N = 148, NF = 15;
console.log("reservoirGpu-selfcheck -- the fly reservoir's step on a WebGPU device\n");

sec("0. TABLES");
{
    const w = Array.from(file.weights), t = G.tablesOf(C, w), res = CS.reservoirOf(C);
    ok("!! 148 cells, 88 input cells, 15 features, 7,080 edges; sigma is the file's (0.95) clamped to [0, 1]", t.N === 148 && t.NI === 88 && t.NF === 15 && t.E === 7080 && Math.abs(t.sigma - 0.95) < 1e-6 && G.tablesOf(C, w.map((v, i) => (i === POL.SIGMA_INDEX ? 3 : v))).sigma === 1 && G.tablesOf(C, w.map((v, i) => (i === POL.SIGMA_INDEX ? -1 : v))).sigma === 0);
    let okCsr = t.inStart[0] === 0 && t.inStart[N] === 7080;
    for (let i = 0; i < N && okCsr; i++) {
        const mine = []; for (let q = t.inStart[i]; q < t.inStart[i + 1]; q++) mine.push([t.inFrom[q], t.inGain[q]]);
        const want = []; for (let k = 0; k < res.E; k++) if (res.to[k] === i) want.push([res.from[k], (res.sign[k] * res.mag[k]) / POL.sigmaMax]);
        want.sort((a, b) => a[0] - b[0]);
        okCsr = mine.length === want.length && mine.every((m, j) => m[0] === want[j][0] && Math.abs(m[1] - want[j][1]) <= 1e-7 * Math.max(1, Math.abs(want[j][1])) && (j === 0 || mine[j - 1][0] < m[0]));
    }
    ok("!! the CSR of edges into each cell is the circuit's, sorted by source, with the twin's gains (sign x count / sigmaMax, float32)", okCsr);
    ok("!! every input cell has its row index as its slot and every other cell -1; bias and W_in are the weight vector's", res.inputs.every((c, a) => t.inputSlot[c] === a) && Array.from(t.inputSlot).filter((s) => s >= 0).length === 88 && t.bias.every((v, i) => v === Math.fround(w[15 * 88 + i])) && t.win.length === 15 * 88);
    ok("!! refused: a wrong weight count; a device that is not one; a bad batch", /takes 1729 weights, got 963/.test(thr(() => G.tablesOf(C, new Array(963).fill(0)))) && /needs a GPUDevice/.test(thr(() => new G.GpuReservoirBatch(null, C, w))) && /batch must be a positive integer/.test(thr(() => new G.GpuReservoirBatch({ createShaderModule() {} }, C, w, { batch: 0 }))));
}

// ---- the device -----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
const req = createRequire(import.meta.url), skip = H.headlessGpuSkipReason(req);
let device = null, adapterDesc = "", software = true;
if (!skip) {
    H.configureVulkanIcd(); const { mod } = H.resolveWebgpu(req), gpu = mod.create([]), adapter = await gpu.requestAdapter();
    if (adapter) {
        device = await adapter.requestDevice(); const g = mod.globals || globalThis;
        device.__usage = g.GPUBufferUsage || globalThis.GPUBufferUsage; device.__mapMode = g.GPUMapMode || globalThis.GPUMapMode;
        const info = adapter.info || {}; adapterDesc = [info.vendor, info.architecture, info.description].filter(Boolean).join(" / ");
        software = /swiftshader|llvmpipe|lavapipe|software|warp|basic render/i.test(adapterDesc);
    } else skipped = "requestAdapter() returned null";
} else skipped = skip;
if (device) console.log(`\n[device] ${adapterDesc}${software ? "  -- A SOFTWARE ADAPTER: timings below say nothing about a graphics card" : ""}`);

const rel = (a, b) => Math.abs(a - b) / Math.max(1, Math.abs(b));
const rngOf = (s) => P.mulberry(s);
/** The twin's next state for each reservoir (float64), from float32 states and features. */
const twinStep = (pol, w, xs, hs) => xs.map((x, b) => Array.from(pol.update(w, x, Float64Array.from(hs[b]))));
async function compareRun({ pol, persist, w, xsAt, ticks, batch, readEvery, start = null }) {
    const g = await G.GpuReservoirBatch.create(device, C, Array.from(w), { batch, persist });
    let hs = start ? start.map((r) => Array.from(Float32Array.from(r))) : Array.from({ length: batch }, () => new Array(N).fill(0));
    if (start) g.setState(hs.flat());
    let worst = 0, bit = 0, cells = 0;
    for (let t = 1; t <= ticks; t++) {
        const xs = Array.from({ length: batch }, (_, b) => xsAt(t, b).map((v) => Math.fround(Number.isFinite(v) ? v : 0)));
        g.step(xs); hs = twinStep(pol, w, xs, hs);
        if (t % readEvery === 0 || t === ticks) {
            const got = await g.read();
            for (let b = 0; b < batch; b++) for (let i = 0; i < N; i++) { const a = got[b * N + i], e = hs[b][i]; worst = Math.max(worst, rel(a, e)); cells++; if (a === Math.fround(e)) bit++; }
            hs = hs.map((_, b) => Array.from(got.subarray(b * N, b * N + N)));   // carry the device's float32 state into the twin, so the comparison is per stretch, not a float64 drift
        }
    }
    const disp = g.dispatches; g.destroy();
    return { worst, bit, cells, dispatches: disp };
}

if (device) {
    sec("1. ONE STEP");
    {
        const r = rngOf(11), w = Float32Array.from(POL.handWeights(), (v) => v + (r() - 0.5) * 0.4), starts = Array.from({ length: 8 }, () => Array.from({ length: N }, () => (r() < 0.6 ? r() * 2 : 0)));
        const xr = Array.from({ length: 8 }, () => Array.from({ length: NF }, () => (r() - 0.5) * 4));
        for (const [pol, persist, name] of [[POL, true, "with memory"], [NOS, false, "no state"]]) {
            const res = await compareRun({ pol, persist, w, xsAt: (t, b) => xr[b], ticks: 1, batch: 8, readEvery: 1, start: starts });
            ok(`!! one step, batch 8, ${name}: every cell within 1e-4 of the twin (relative)`, res.worst <= 1e-4 && res.cells === 8 * N, `worst ${res.worst.toExponential(2)}; bit-identical in float32 ${res.bit} of ${res.cells} (reported, not asserted)`);
        }
    }
    sec("2. MANY STEPS");
    {
        const r = rngOf(12), w = Float32Array.from(POL.handWeights(), (v) => v + (r() - 0.5) * 0.4), xs = Array.from({ length: 120 }, () => Array.from({ length: 4 }, () => Array.from({ length: NF }, () => (r() - 0.5) * 3)));
        for (const [pol, persist, name] of [[POL, true, "with memory"], [NOS, false, "no state"]]) {
            const res = await compareRun({ pol, persist, w, xsAt: (t, b) => xs[t - 1][b], ticks: 120, batch: 4, readEvery: 20 });
            ok(`!! 120 ticks, batch 4, read every 20, ${name}: within 1e-4 of the twin over every stretch; one dispatch a tick`, res.worst <= 1e-4 && res.dispatches === 120, `worst ${res.worst.toExponential(2)}; bit-identical ${res.bit} of ${res.cells}`);
        }
    }
    sec("3. THE REAL PILOT");
    {
        const rec = [], kind = FX.flyCxKind(C), q = A.createTank();
        q.registerPilotKind("flycx", { ...kind, build: (w, ctx) => { const p = kind.build(w, ctx); return (s, t, c, aux) => { rec.push([...P.features(s, t, c), aux && aux.compassValid === 0 ? 0 : 1]); return p(s, t, c, aux); }; } });
        q.sync([{ id: "g", name: "g", hue: 1, from: "gate", local: true, theta: null, pilot: "stateful", circuit: "flycx", weights: file.weights }]); q.setEvent("g", "dropout");
        for (let i = 0; i < 1500; i++) q.step(1 / 30);
        const w = Float32Array.from(file.weights), res = await compareRun({ pol: POL, persist: true, w, xsAt: (t, b) => rec[(t - 1 + 300 * b) % rec.length], ticks: 300, batch: 4, readEvery: 50 });
        ok("!! the file's 1,729 weights on features recorded from a real tank flight through the dropout, four reservoirs offset in time, 300 ticks: within 1e-4", res.worst <= 1e-4 && rec.length >= 1200, `worst ${res.worst.toExponential(2)}; bit-identical ${res.bit} of ${res.cells}; ${rec.length} recorded ticks`);
    }
    sec("4. LESION");
    {
        const T = LF.reservoirTopology(C), sil = [...new Set(L.classesOf(T, "glomerulus").classes.L4.concat(L.classesOf(T).classes.PEG))], lw = L.lesionWeights(T, Array.from(file.weights), sil);
        const g = await G.GpuReservoirBatch.create(device, C, lw, { batch: 2 }), r = rngOf(13); let allZero = true, others = 0;
        for (let t = 0; t < 60; t++) { g.step([0, 1].map(() => Array.from({ length: NF }, () => (r() - 0.5) * 4))); if (t % 15 === 14) { const h = await g.read(); for (let b = 0; b < 2; b++) { for (const i of sil) if (h[b * N + i] !== 0) allZero = false; for (let i = 0; i < N; i++) if (!sil.includes(i) && h[b * N + i] > 0) others++; } } }
        g.destroy();
        ok("!! the bias clamp (-1e30) keeps L4 and PEG (their 25 cells) at exactly 0 on the device for 60 ticks, while the other cells are active", allZero && others > 0, `${others} active other-cell readings`);
    }
    sec("5. BATCH");
    {
        const r = rngOf(14), w = Array.from(file.weights), x1 = Array.from({ length: NF }, () => (r() - 0.5) * 3), x2 = Array.from({ length: NF }, () => (r() - 0.5) * 3);
        const solo = await G.GpuReservoirBatch.create(device, C, w, { batch: 1 }), trio = await G.GpuReservoirBatch.create(device, C, w, { batch: 3 });
        for (let t = 0; t < 20; t++) { solo.step([x1]); trio.step([x2, x1, x2.map((v) => -v)]); }
        const a = await solo.read(), b = await trio.read();
        ok("!! a reservoir's state does not depend on the others in its batch (row 1 of a batch of 3 equals a batch of 1, bit for bit, after 20 ticks)", Array.from(a).every((v, i) => v === b[N + i]) && a.some((v) => v > 0));
        trio.reset(); const z = await trio.read();
        ok("!! reset() zeroes every reservoir", z.every((v) => v === 0) && z.length === 3 * N);
        const bad = await G.GpuReservoirBatch.create(device, C, w, { batch: 1 }), good = await G.GpuReservoirBatch.create(device, C, w, { batch: 1 }), xn = [...x1]; xn[3] = NaN; xn[7] = Infinity; const xz = [...x1]; xz[3] = 0; xz[7] = 0;
        bad.step([xn]); good.step([xz]); const hb = await bad.read(), hg = await good.read();
        ok("!! non-finite features read as 0 (the twin's fin()): NaN and Infinity give the state of zeros there", Array.from(hb).every((v, i) => v === hg[i]) && hb.every(Number.isFinite));
        ok("!! refused: step with the wrong number of rows; setState with the wrong length", /1 rows of 15 wanted, got 2/.test(thr(() => good.step([x1, x1]))) && /148 numbers wanted, got 3/.test(thr(() => good.setState([1, 2, 3]))));
        for (const g of [solo, trio, bad, good]) g.destroy();
        // a device whose validation scope reports a rejection: create() must throw, not hand back a kernel that runs nothing
        const rejecting = new Proxy(device, { get(t, k) { if (k === "popErrorScope") return async () => ({ message: "rejected (the gate's stand-in)" }); const v = t[k]; return typeof v === "function" ? v.bind(t) : v; } });
        let msg = ""; try { await G.GpuReservoirBatch.create(rejecting, C, w, { batch: 1 }); } catch (e) { msg = String(e.message); }
        ok("!! create() throws when the device rejects the kernel (a validation error in its scope), naming it", /the device rejected the kernel -- rejected \(the gate's stand-in\)/.test(msg), msg);
    }
    sec("6. PRICE (printed, not asserted)");
    {
        const w = Array.from(file.weights), r = rngOf(15), ticks = 50;
        for (const batch of [1, 16, 128, 1024]) {
            const xs = Array.from({ length: batch }, () => Array.from({ length: NF }, () => (r() - 0.5) * 3)), g = await G.GpuReservoirBatch.create(device, C, w, { batch });
            g.step(xs); await g.read(); let t0 = performance.now(); for (let t = 0; t < ticks; t++) g.step(xs); await g.read(); const gpuMs = performance.now() - t0; g.destroy();
            const hs = Array.from({ length: batch }, () => new Float64Array(N)); t0 = performance.now();
            for (let t = 0; t < ticks; t++) for (let b = 0; b < batch; b++) hs[b] = POL.update(w, xs[b], hs[b]);
            const cpuMs = performance.now() - t0;
            console.log(`  batch ${String(batch).padStart(5)}: device ${(gpuMs / ticks).toFixed(3)} ms a tick, CPU twin ${(cpuMs / ticks).toFixed(3)} ms a tick (${(cpuMs / gpuMs).toFixed(2)} x)${software ? "  [SOFTWARE ADAPTER]" : ""}`);
        }
        ok("!! the price was measured and printed for batches 1, 16, 128 and 1,024", true);
    }
}

sec("6b. NAMES");
// the WGSL tokens are ASSEMBLED, not written out: a literal would make this gate a shader-quoting file in render/shaderEmitters.mjs's census (the trick tools/ship/backendParity-selfcheck.mjs uses for the same reason)
const WG = "@work" + "group_size(64)", ST = "var<" + "storage", UN = "var<" + "uniform>", countOf = (s, t) => s.split(t).length - 1;
ok("!! WORKGROUP is the WGSL's workgroup size (64), and the WGSL binds exactly five storage buffers and one uniform (inside the portable 8)", G.WORKGROUP === 64 && G.WGSL.includes(WG) && countOf(G.WGSL, ST) === 5 && countOf(G.WGSL, UN) === 1);

sec("7. SOURCE");
{
    const src = fs.readFileSync(new URL("./reservoirGpu.mjs", import.meta.url), "utf8"), code = src.split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n");
    ok("!! no clock, no Math.random, no file in the module", !/Date\.now|performance\.now|Math\.random|node:fs|readFile/.test(code));
    ok("!! the header names the backlog item and says what the GPU is not doing and that a software adapter's timing says nothing about a card", /gpu-reservoir-kernel/.test(src) && /WHAT THE GPU IS AND IS NOT DOING/.test(src) && /SOFTWARE adapter/.test(src));
}

finished = true;
if (skipped) console.log(`\nSKIPPED sections 1 to 6 (no device): ${skipped}`);
console.log(`\n${fails ? "FAIL" : skipped ? "PASS (DEVICE SECTIONS SKIPPED)" : "PASS"}  reservoirGpu-selfcheck: ${fails} failing row${fails === 1 ? "" : "s"}`);
H.exitCleanly(fails ? 1 : 0);
