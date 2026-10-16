// WebGLEngine/brain/pilotFlightGpu-selfcheck.mjs
//
// Run: node brain/pilotFlightGpu-selfcheck.mjs      (~10 s)
//
// THE GPU BRAIN FLYING, GRADED ON A REAL WebGPU DEVICE: brain/pilotFlightGpu.mjs runs brain/pilotFlightMlp.mjs's network through brain/mlp.js's BatchedMLP (headless Chromium via tools/ship/webgpuHarness.mjs -- on this build
// box that device is SwiftShader, the same one every GPU gate in the tree runs on; on a GPU machine it is the card) and this file holds it to the CPU twin the pilot was trained on.
//
//   1  the device's outputs against the CPU twin: random networks and random features, every output within 1e-4 of the twin's (float32 on the device, double in the twin), and the number of cells that are BIT-identical to
//      render/brainTsl.mjs's f32 mirror reported (all of them where the compiler does not fuse a multiply-add; fewer where it does -- brainKernels-selfcheck.mjs has the account), never asserted
//   2  the machinery: a whole fleet decides in ONE dispatch; a batch larger than the cap is split into the dispatches it needs and the answers are the same as one big batch's; weights are hot-swapped without rebuilding;
//      a non-finite feature is read as 0 and an output past a control's range is clamped, as on the CPU
//   3  THE FLEET FLOWN: brain/pilotFlightGpu.mjs flyFleet() (the lockstep flyer: one batched decision per tick) is held to brain/flightTask.mjs fly() to the BIT with a CPU decider, on all 18 baseline scenarios; and with the
//      DEVICE deciding, the same scenarios end the same way (the same statuses, scores within 2e-3, final altitudes within 1 m) -- one dispatch per tick for the whole fleet
//   4  the constructor and the flyer refuse what they cannot run (no device, the wrong number of weights, a decider that answers the wrong number of controls)
//
// SABOTAGE LOG (v4870) -- ELEVEN, each applied to brain/pilotFlightGpu.mjs in a scratch worktree, the gate run, the worktree restored; every one red by name (the number is how many rows went red):
//   G1 a non-finite feature not read as 0 on the device 1 | G2 a batch larger than the cap skips rows 1 | G3 setWeights does not reach the device 1 | G4 calls do not queue 1 | G5 decide() does not clamp 1 | G6 the fingerprint sampled every 31 ticks 3 |
//   G7 flyFleet flies in still air 6 | G8 an ended flight stays in the fleet 1 | G9 a decider that answers the wrong number is not refused 1 | G10 the constructor takes any number of weights 1 | G11 the flight's wind sample uses the previous tick 2.
//   G8 WENT 0 RED THE FIRST TIME: a flight that has ended but stays in the fleet is stepped again from its ended state, which ends again, so every number fly() reports is unchanged -- the only difference is that the device is asked for a
//   decision it does not need. The row that now counts the rows the decider is asked for (the ticks each flight flew plus the one on which it ended) is the one that sees it.
//   G4 is the finding of the round: the page's frame loop and a caller of its hook both stepped one brain, the two forward() calls fought over a buffer that was already mapped, the page treated the error as a lost device and gave its seats
//   back to the hand weights. The queue is in raw(); the overlap row is the one that fails without it.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInEngineOrigin, webgpuSkipReason } from "../tools/ship/webgpuHarness.mjs";
import * as G from "./pilotFlightGpu.mjs";
import * as M from "./pilotFlightMlp.mjs";
import * as T from "./flightTask.mjs";
import * as PB from "./peerBrain.mjs";
import { mlpLayerCpu } from "../render/brainTsl.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let fails = 0;
function ok(name, cond, detail) { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "   " + detail : ""}`); if (!cond) fails++; }
function report(name, detail) { console.log(`  ----  ${name}   ${detail}`); }
const mulberry = (a) => () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const throwsAsync = async (fn) => { try { await fn(); return null; } catch (e) { return e.message; } };
const KEYS = ["pitch", "roll", "yaw", "throttle"];

console.log("pilotFlightGpu-selfcheck -- the GPU Brain flying\n");

console.log("0. WHAT NEEDS NO DEVICE");
{
    const w = M.handWeights(), stub = { createShaderModule() {} };
    const e1 = await throwsAsync(() => new G.GpuPilotBrain(null, w)), e2 = await throwsAsync(() => new G.GpuPilotBrain(stub, w.subarray(0, 100))), e3 = await throwsAsync(() => new G.GpuPilotBrain(stub, null));
    ok("!! the constructor refuses what it cannot run: no device, the wrong number of weights, no weights -- each by name, before any GPU object is made", /needs a GPUDevice/.test(e1) && /needs 1796 weights, got 100/.test(e2) && /needs 1796 weights, got none/.test(e3), [e1, e2, e3].join(" | "));
    const scs = T.BASELINE_SET, cpu = async (rows) => rows.map((r) => M.forward(w, r));
    const fleet = await G.flyFleet(cpu, scs), solo = scs.map((sc) => T.fly(M.pilotFor(w), sc));
    const same = fleet.filter((r, i) => JSON.stringify(r) === JSON.stringify(solo[i])).length;
    ok("!! *** flyFleet() IS fly() *** all 18 baseline scenarios flown in lockstep with a CPU decider give, field for field and bit for bit, the result fly() gives (score, errors, status, ticks, minV, maxAlpha, final state, fingerprint)", same === 18, `${same} of 18 identical`);
    const bolder = M.perturb(w, 0.15, mulberry(9)), f2 = await G.flyFleet(async (rows) => rows.map((r) => M.forward(bolder, r)), scs), s2 = scs.map((sc) => T.fly(M.pilotFor(bolder), sc));
    const early = f2.filter((r) => r.status !== "airborne").length;
    let rowsAsked = 0; const f2b = await G.flyFleet(async (rows) => { rowsAsked += rows.length; return rows.map((r) => M.forward(bolder, r)); }, scs);
    ok("!! A FLIGHT THAT HAS ENDED IS NOT ASKED FOR ANOTHER DECISION: the rows the decider is asked for over the whole fleet are, flight by flight, the ticks it flew plus the one on which it ended (1,200 for a flight that did not end) -- so a fleet that loses six of eighteen flights does not go on paying the device for them", rowsAsked === f2b.reduce((a, r) => a + (r.status === "airborne" ? 1200 : r.ticks + 1), 0) && rowsAsked < 18 * 1200, `${rowsAsked} rows against ${18 * 1200} for a fleet that all flew on`);
    ok("!! ...and with noisy weights that END SOME FLIGHTS EARLY but not all (the lockstep drops a flight when it ends and goes on with the rest, so later ticks decide for fewer rows): still identical, every field, 6 of the 18 ended early", f2.every((r, i) => JSON.stringify(r) === JSON.stringify(s2[i])) && early === 6, `${early} ended early`);
    const dead = M.zeroWeights(), f3 = await G.flyFleet(async (rows) => rows.map((r) => M.forward(dead, r)), scs.slice(0, 6)), s3 = scs.slice(0, 6).map((sc) => T.fly(M.pilotFor(dead), sc));
    ok("a fleet that ALL ends early (the zero weights) ends the loop and still matches fly(), bit for bit", f3.every((r, i) => JSON.stringify(r) === JSON.stringify(s3[i])) && f3.every((r) => r.status !== "airborne"));
    let calls = 0; const e4 = await throwsAsync(() => G.flyFleet(async (rows) => { calls++; return rows.slice(1).map((r) => M.forward(w, r)); }, scs.slice(0, 3)));
    ok("flyFleet refuses a decider that answers the wrong number of controls, by name, on the first tick", /answered 2 controls for 3 flights/.test(e4) && calls === 1, e4);
    let asked = []; await G.flyFleet(async (rows) => { asked.push(rows.length); return rows.map((r) => M.forward(w, r)); }, scs.slice(0, 5), { seconds: 1 });
    ok("one decision per tick for the whole fleet: 5 flights for 1 s (30 ticks) ask the decider 30 times, each time for 5 rows of 18 features", asked.length === 30 && asked.every((n) => n === 5));
}

const skip = webgpuSkipReason();
if (skip) { console.log(`\n1. SKIP  ${skip}`); fails++; }
else {
    const rnd = mulberry(77), W = [0, 1, 2, 3].map((i) => M.perturb(M.handWeights(), 0.4 + 0.1 * i, mulberry(500 + i)));
    const rows = Array.from({ length: 64 }, () => Array.from({ length: 18 }, () => (rnd() * 2 - 1) * 3)), big = Array.from({ length: 100 }, (_, i) => rows[i % 64].map((v, k) => v * (1 + (i % 5) * 0.1) + k * 0.001));
    const bigBias = M.zeroWeights(); bigBias.set([5, -5, 5, -5], 1792);
    const scs = T.BASELINE_SET, hand = M.handWeights(), noisy = M.perturb(hand, 0.05, mulberry(21));
    const shippedFile = path.join(ENG, "brain", "pilotFlightMlpWeightsDefault.json"), shippedW = fs.existsSync(shippedFile) ? (() => { const r = PB.importBrain(PB.describePolicy("pilotFlightMlp", M), JSON.parse(fs.readFileSync(shippedFile, "utf8"))); return r.ok ? Array.from(r.weights) : []; })() : [];
    const r = await runInEngineOrigin({
        engineRoot: ENG, timeoutMs: 240000,
        args: { W: W.map((w) => Array.from(w)), rows, big, hand: Array.from(hand), noisy: Array.from(noisy), shipped: shippedW, bigBias: Array.from(bigBias), scs: scs.map((s) => ({ seed: s.seed, kind: s.kind })) },
        script: `async (a) => {
            const { requestDevice } = await import("/gfx/device.js");
            const G = await import("/brain/pilotFlightGpu.mjs"), M = await import("/brain/pilotFlightMlp.mjs"), T = await import("/brain/flightTask.mjs");
            const cv = document.createElement("canvas"); cv.width = 8; cv.height = 8;
            const dev = await requestDevice(cv, { backend: "webgpu", offscreen: true });
            if (!dev.gpu) return { noGpu: dev.backend };
            let adapter = null; try { adapter = dev.adapterInfo || null; } catch {}
            const out = { backend: dev.backend, adapter };
            // 1: raw outputs of four random networks on 64 random rows
            out.raw = []; for (const w of a.W) { const g = new G.GpuPilotBrain(dev.gpu, Float32Array.from(w), { batchCap: 64 }); out.raw.push(await g.raw(a.rows)); }
            // 2: machinery
            const gh = new G.GpuPilotBrain(dev.gpu, Float32Array.from(a.hand), { batchCap: 64 });
            const d0 = gh.dispatches; await gh.decide(a.rows.slice(0, 10)); out.oneDispatch = gh.dispatches - d0;
            const small = new G.GpuPilotBrain(dev.gpu, Float32Array.from(a.hand), { batchCap: 32 });
            const s0 = small.dispatches; out.splitRaw = await small.raw(a.big); out.splitDispatches = small.dispatches - s0;
            const wide = new G.GpuPilotBrain(dev.gpu, Float32Array.from(a.hand), { batchCap: 128 }); out.wideRaw = await wide.raw(a.big); out.wideDispatches = wide.dispatches;
            const before = await gh.raw(a.rows.slice(0, 8)); gh.setWeights(Float32Array.from(a.W[1])); const after = await gh.raw(a.rows.slice(0, 8)); gh.setWeights(Float32Array.from(a.hand)); const back = await gh.raw(a.rows.slice(0, 8));
            out.swap = { before, after, back };
            out.badSwap = null; try { gh.setWeights(new Float32Array(10)); } catch (e) { out.badSwap = e.message; }
            const nanRow = a.rows[0].slice(); nanRow[11] = NaN; const zeroRow = a.rows[0].slice(); zeroRow[11] = 0;
            out.nan = await gh.decide([nanRow, zeroRow]);
            const gb = new G.GpuPilotBrain(dev.gpu, Float32Array.from(a.bigBias), { batchCap: 8 }); out.clamp = await gb.decide([a.rows[0]]);
            // calls that OVERLAP (a page's frame loop and a caller of its hook, found at v4870): three at once, then the same three one after another
            const gc = new G.GpuPilotBrain(dev.gpu, Float32Array.from(a.hand), { batchCap: 64 }), parts = [a.rows.slice(0, 16), a.rows.slice(16, 40), a.rows.slice(40, 64)];
            const together = await Promise.all(parts.map((p) => gc.raw(p))); const apart = []; for (const p of parts) apart.push(await gc.raw(p));
            out.concurrent = { same: JSON.stringify(together) === JSON.stringify(apart), lengths: together.map((t) => t.length) };
            // 3: the fleet flown with the device deciding, through the page's own scenario constructor
            const sc = a.scs.map((s) => T.scenario(s.seed, s.kind));
            const g1 = new G.GpuPilotBrain(dev.gpu, Float32Array.from(a.hand), { batchCap: 64 }); const t0 = performance.now();
            out.fleetHand = await G.flyFleet((r) => g1.decide(r), sc); out.fleetHandDispatches = g1.dispatches; out.fleetMs = performance.now() - t0;
            const g2 = new G.GpuPilotBrain(dev.gpu, Float32Array.from(a.noisy), { batchCap: 64 });
            out.fleetNoisy = await G.flyFleet((r) => g2.decide(r), sc);
            if (a.shipped.length === 1796) { const g3 = new G.GpuPilotBrain(dev.gpu, Float32Array.from(a.shipped), { batchCap: 64 }); out.fleetShipped = await G.flyFleet((r) => g3.decide(r), sc); }
            return out;
        }`,
    });
    ok("!! the harness ran the GPU Brain's pilot on a real WebGPU device (and no page error)", r.ok && r.result && !r.result.noGpu && (r.pageErrors || []).length === 0, r.ok ? (r.result && r.result.noGpu ? "no gpu: " + r.result.noGpu : "") : (r.reason || (r.pageErrors || []).join("; ")));
    if (r.ok && r.result && !r.result.noGpu) {
        const o = r.result, sw = !!(o.adapter && /swiftshader|llvmpipe|software/i.test(JSON.stringify(o.adapter)));
        report("the device", `${o.backend}${o.adapter ? " " + JSON.stringify(o.adapter).slice(0, 120) : ""}${sw ? " (a SOFTWARE adapter: a gate's device, not the brain's)" : ""}`);
        console.log("\n1. THE DEVICE'S OUTPUTS AGAINST THE CPU TWIN");
        let worst = 0, cells = 0, bitsame = 0, worstMirror = 0;
        W.forEach((w, n) => rows.forEach((x, i) => {
            const cpu = M.raw(w, x); let h = Float32Array.from(x); for (const l of M.layersOf(w)) h = mlpLayerCpu(l, h, 1);
            for (let k = 0; k < 4; k++) { const g = o.raw[n][i][k]; worst = Math.max(worst, Math.abs(g - cpu[k])); worstMirror = Math.max(worstMirror, Math.abs(g - h[k])); cells++; if (Math.fround(g) === h[k]) bitsame++; }
        }));
        ok("!! *** the device's raw outputs agree with the CPU twin the pilot was trained on *** over 4 random networks x 64 random rows x 4 outputs (1,024 cells) every one is within 1e-4 (float32 on the device, double in the twin)", worst < 1e-4 && cells === 1024, `worst ${worst.toExponential(2)} over ${cells} cells`);
        ok("...and within 1e-5 of render/brainTsl.mjs's f32 mirror of the kernel (the same arithmetic: a device that fuses a multiply-add differs in the last bits, a device that does not matches it exactly)", worstMirror < 1e-5, `worst ${worstMirror.toExponential(2)}`);
        report("cells BIT-identical to the f32 mirror", `${bitsame} of ${cells}${bitsame === cells ? " (this device does not fuse)" : " (this device contracts multiply-adds: brainKernels-selfcheck.mjs has the account)"}`);
        console.log("\n2. THE MACHINERY");
        ok("!! a whole fleet decides in ONE dispatch: ten rows, one dispatch", o.oneDispatch === 1, `${o.oneDispatch}`);
        ok("!! a batch larger than the cap is split into the dispatches it needs (100 rows at a cap of 32 is 4; at a cap of 128 it is 1) and the answers are the same either way, bit for bit", o.splitDispatches === 4 && o.wideDispatches === 1 && o.splitRaw.length === 100 && JSON.stringify(o.splitRaw) === JSON.stringify(o.wideRaw), `${o.splitDispatches} and ${o.wideDispatches} dispatches`);
        const maxd = (a, b) => Math.max(...a.flatMap((row, i) => row.map((v, k) => Math.abs(v - b[i][k]))));
        const cpuHand = rows.slice(0, 8).map((x) => M.raw(M.handWeights(), x)), cpuW1 = rows.slice(0, 8).map((x) => M.raw(W[1], x));
        ok("!! setWeights() hot-swaps the weights on the device: the outputs become the new network's (within 1e-4 of its CPU twin and far from the old one's), and swapping back restores the old ones exactly", maxd(o.swap.after, cpuW1) < 1e-4 && maxd(o.swap.after, cpuHand) > 1e-2 && maxd(o.swap.before, cpuHand) < 1e-4 && JSON.stringify(o.swap.back) === JSON.stringify(o.swap.before));
        ok("setWeights() refuses a vector of the wrong length by name and leaves the device's weights alone", /needs 1796 weights, got 10/.test(o.badSwap || ""), o.badSwap);
        ok("!! a NaN feature is read as 0 on the device as on the CPU: the row with the NaN and the row with a 0 there give identical controls", KEYS.every((k) => o.nan[0][k] === o.nan[1][k]));
        ok("!! CALLS THAT OVERLAP QUEUE: three decisions started together on one brain (a page's frame loop and a caller of its hook did exactly that) give, each, the answer it gives alone -- the activation and staging buffers are shared, and without the queue they fight over a buffer that is already mapped", o.concurrent.same && o.concurrent.lengths.join() === "16,24,24", JSON.stringify(o.concurrent));
        ok("!! the device's outputs are CLAMPED to each control's range by the same function the CPU twin uses (output biases of +5, -5, +5, -5 give 1, -1, 1, 0)", JSON.stringify(o.clamp[0]) === JSON.stringify({ pitch: 1, roll: -1, yaw: 1, throttle: 0 }), JSON.stringify(o.clamp[0]));
        console.log("\n3. THE FLEET FLOWN, WITH THE DEVICE DECIDING");
        const cpuHandFlights = scs.map((sc) => T.fly(M.pilotFor(hand), sc)), cpuNoisy = scs.map((sc) => T.fly(M.pilotFor(noisy), sc));
        const cmp = (gpu, cpu) => ({ status: gpu.every((g, i) => g.status === cpu[i].status), score: Math.max(...gpu.map((g, i) => Math.abs(g.score - cpu[i].score))), alt: Math.max(...gpu.map((g, i) => Math.abs(g.final.alt - cpu[i].final.alt))), ticks: gpu.every((g, i) => g.ticks === cpu[i].ticks) });
        const ch = cmp(o.fleetHand, cpuHandFlights), cn = cmp(o.fleetNoisy, cpuNoisy);
        ok("!! the hand weights flown by the DEVICE end the way the CPU twin's flights end on all 18 baseline scenarios: the same statuses and ticks, scores within 2e-3, final altitudes within 1 m", ch.status && ch.ticks && ch.score < 2e-3 && ch.alt < 1, `score ${ch.score.toExponential(2)}, altitude ${ch.alt.toExponential(2)} m`);
        ok("!! ...and so do noise-0.05 weights (a pilot whose weights are not the autopilot's)", cn.status && cn.ticks && cn.score < 2e-3 && cn.alt < 1, `score ${cn.score.toExponential(2)}, altitude ${cn.alt.toExponential(2)} m`);
        if (o.fleetShipped) {
            const cs = scs.map((sc) => T.fly(M.pilotFor(Float32Array.from(shippedW)), sc)), cShip = cmp(o.fleetShipped, cs);
            ok("!! THE SHIPPED GPU PILOT flown by the DEVICE ends the way the CPU twin it was trained on ends, on all 18 baseline scenarios: the same statuses and ticks, scores within 2e-3, final altitudes within 1 m -- the weights the search found on the CPU fly the same flights on the GPU", cShip.status && cShip.ticks && cShip.score < 2e-3 && cShip.alt < 1, `score ${cShip.score.toExponential(2)}, altitude ${cShip.alt.toExponential(2)} m; ${(o.fleetShipped.reduce((a, g) => a + g.score, 0) / o.fleetShipped.length).toFixed(4)} against the autopilot's -0.3577`);
        }
        const mean = o.fleetHand.reduce((a, g) => a + g.score, 0) / o.fleetHand.length;
        ok("!! the GPU-flown hand weights score the autopilot's pinned -0.3577 on the 18 baseline scenarios (to 1e-3), none ending early", Math.abs(mean - -0.3577) < 1e-3 && o.fleetHand.every((g) => g.status === "airborne"), mean.toFixed(4));
        ok("!! one dispatch per TICK for the whole fleet: 18 aircraft for 1,200 ticks took 1,200 dispatches (not 21,600)", o.fleetHandDispatches === 1200, `${o.fleetHandDispatches} dispatches in ${(o.fleetMs / 1000).toFixed(1)} s`);
    }
}

console.log(fails ? `\npilotFlightGpu-selfcheck: ${fails} FAILED` : "\npilotFlightGpu-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
