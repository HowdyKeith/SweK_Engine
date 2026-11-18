// WebGLEngine/brain/reservoirPilotGpu-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node brain/reservoirPilotGpu-selfcheck.mjs      (about 4 s on the build box's SwiftShader: Dawn in Node through tools/ship/headlessGpu.mjs's driver lookup; the card on a rig)
//
// THE GATE OF brain/reservoirPilotGpu.mjs (backlog `gpu-reservoir-kernel`, the note's NOT DONE "the readout and the autopilot's laws on the device"): the WHOLE fly pilot on a WebGPU device
// for a batch, held to the CPU pilot (brain/pilotSubCircuitState.mjs step) to 1e-4 in every control.
//   0 TABLES       (no device) the law read off the CPU policy is LINEAR (two probe sizes agree), is the PD autopilot's laws term for term (AS.AUTOPILOT_SUB), has no compassValid column;
//                  the readout's W2, b2 and output cells are the weight vector's and the circuit's; a wrong weight count is refused.
//   1 CONTROLS     random features, batch 8, 100 ticks, with memory and NO STATE: every control within 1e-4 of the CPU pilot's.
//   2 THE REAL PILOT the file's 1,729 weights on features recorded from a real tank flight through the compass dropout, four reservoirs offset in time, 300 ticks.
//   3 THE CLAMP    a readout bias of +5 / -5 saturates at exactly +1 / -1; unsaturated outputs still match.
//   3b NON-FINITE  readout weights of +-Inf and NaN give the CPU's fin() (those controls 0); a finite feature beyond float32's range is refused by step.
//   4 RESET ONE    resetSome([1]) mid-run: reservoir 1 follows the CPU pilot restarted from zero activity (a new target), the others the CPU pilot that was not; [0, 2] then [1]; a list
//                  with a bad index throws and resets nothing; a bad index is refused.
//   5 INDEPENDENT  a reservoir's controls do not depend on its batch-mates (bit for bit against a batch of 1).
//   6 READ-BACK    controls() returns batch x 4 numbers; the activity is still readable for a gate.
//   7 REFUSAL      a device whose validation scope reports a rejection makes create() throw.
//   8 THE PRICE    (printed, NOT asserted; a software adapter's numbers say nothing about a card) a pilot tick with its 16-byte read-back, against the CPU pilot.
//   9 SOURCE       no clock, no Math.random, no file.
// A host with no device SKIPS sections 1 to 8 by name and says so in its last line; it never passes them silently.
// SABOTAGE LOG (2026-11-17; 15 mutants of brain/reservoirPilotGpu.mjs, each alone, restored byte-identical; every one red): G1 one readout workgroup (1), G2 the x4 dropped from
//   the readout dispatch (1), G3 the law read from a fresh policy, not the one handed in (1), G4 the keep mask ignored (1), G5 keep always 1 (2), G6 resetSome resets only the
//   first (1), G7 resetSome writes before it checks (1), G8 the float32 range check removed (1), G9 the readout on the stale buffer (10), G10 b2 not added (1), G11 W2 transposed
//   (10), G12 every reservoir reads reservoir 0's features (9), G13 destroy() skips the controls buffer (1), G14 non-finite weights sent as they are (1), G15 the law's sign (12).
// AN INDEPENDENT REVIEW (a workflow of three reviewers and a refuting verifier per finding, 2026-11-17) found what the first version of this gate missed. 12 findings were
//   confirmed, and each is now a row or a fix: G1/G2 survived (no asserted batch above 16: a batch-64 row added); G3 survived (the law row compared with the gate's own retyped
//   copy: a row now hands in a policy with a doubled thrust law); multi-index and atomic resets (rows added, resetSome made atomic); non-finite readout weights saturated a control
//   that the CPU zeroes (the keep mask, a row); a feature beyond float32's range poisoned every control (refused by step, a row); most pitch and yaw values were saturated in
//   section 1 (an unsaturated row, 85% unsaturated); section 7's proxy left a validation scope open (it now pops the real one), AND it bound Dawn's GPUBufferUsage class into a
//   function so every buffer usage was 0 (found while adding the destroy() row; passThrough fixes both proxies); the header promised a log that did not exist and a run time
//   five to fifteen times too long. Two were refuted: the constructor-throw leak (not reachable on a conforming device) and the batch-4096 run time (slow, not wrong).
"use strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import * as H from "../tools/ship/headlessGpu.mjs";
import { gateReport } from "../tools/ship/gateReport.mjs";
import * as GP from "./reservoirPilotGpu.mjs";
import * as CS from "./pilotSubCircuitState.mjs";
import * as P from "./pilotSubPolicy.mjs";
import * as AS from "./autopilotSub.mjs";
import * as A from "../render/subAquariumSim.mjs";
import * as FX from "../render/subAquariumFlyCx.mjs";
let fails = 0, skipped = null;
const died = (e) => { console.log("  FAIL  !! THE GATE THREW before it finished: " + String((e && e.stack) || e).split("\n").slice(0, 3).join(" | ").slice(0, 400)); H.exitCleanly(1); };
process.on("uncaughtException", died); process.on("unhandledRejection", died);
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const sec = (t) => console.log("\n" + t);
const J = JSON.stringify;
// v4926: the price table as a report (tools/ship/gateReport.mjs), so the numbers outlive the terminal; an empty table when no device ran
const REPORT = gateReport("brain/reservoirPilotGpu-selfcheck.mjs"), PRICE = [];
const thr = (f) => { try { f(); return ""; } catch (e) { return String(e.message); } };
const rd = (f) => JSON.parse(fs.readFileSync(new URL("../" + f, import.meta.url), "utf8"));
const cj = rd("vendor/hemibrain/hemibrain-cx-heading-loop.json"), C = { neurons: cj.neurons, edges: cj.edges, io: cj.io }, file = rd("brain/pilotSubFlyCxWip.json");
const POL = CS.createStatePolicy(C, "twin"), NOS = CS.createStatePolicy(C, "twin", { persist: false }), NF = CS.FEATURES, KEYS = ["pitch", "yaw", "thrust", "ballast"];
const W = Float32Array.from(file.weights);
console.log("reservoirPilotGpu-selfcheck -- the whole fly pilot on a WebGPU device, for a batch\n");

sec("0. TABLES");
{
    const L = GP.lawMatrixOf(C), K = AS.AUTOPILOT_SUB;
    // linearity: the same matrix from a probe ten times smaller
    const pol = CS.createStatePolicy(C, "x"), w0 = pol.zeroWeights(), h0 = new Float64Array(pol.HIDDEN), small = (f, o) => { const x = new Array(NF).fill(0); x[f] = 1e-4; return pol.step(w0, x, h0).controls[KEYS[o]] / 1e-4; };
    let lin = 0; for (let o = 0; o < 4; o++) for (let f = 0; f < NF; f++) lin = Math.max(lin, Math.abs(small(f, o) - L[o][f]) / Math.max(1, Math.abs(L[o][f])));
    ok("!! the law read off the CPU policy is linear: a probe ten times smaller gives the same matrix (to 1e-9)", lin < 1e-9, lin.toExponential(2));
    const want = [[[2, 0.3 * K.kTheta], [3, -0.2 * K.kQ]], [[4, Math.PI * K.kHdg], [5, -0.2 * K.kR], [6, -0.2 * K.kBeta]], [[1, 1], [7, K.kSpd]], [[8, 10 * K.kBalD], [9, 0.5 * K.kBalV]]];
    const termOk = want.every((terms, o) => { const m = new Map(terms); return Array.from({ length: NF }, (_, f) => f).every((f) => Math.abs(L[o][f] - (m.get(f) || 0)) < 1e-9 * Math.max(1, Math.abs(m.get(f) || 0))); });
    ok("!! it is the PD autopilot's laws term for term (pitch 0.3 kTheta x2 - 0.2 kQ x3; yaw pi kHdg x4 - 0.2 kR x5 - 0.2 kBeta x6; thrust x1 + kSpd x7; ballast 10 kBalD x8 + 0.5 kBalV x9), every other entry 0, the compassValid column 0", termOk && L.every((row) => row[NF - 1] === 0));
    const twice = { ...pol, step: (w, x, h) => { const r = pol.step(w, x, h); return { ...r, controls: { ...r.controls, thrust: 2 * r.controls.thrust } }; } }, L2 = GP.lawMatrixOf(C, { policy: twice });
    ok("!! the law is READ FROM the policy, not retyped: a policy whose thrust law is doubled gives a doubled thrust row and the other rows unchanged", L2[2].every((v, f) => Math.abs(v - 2 * L[2][f]) < 1e-9) && [0, 1, 3].every((o) => L2[o].every((v, f) => v === L[o][f])));
    const t = GP.readoutTablesOf(C, Array.from(W)), res = CS.reservoirOf(C), off = POL.SIGMA_INDEX + 1;
    ok("!! the readout's tables: the output cells are the circuit's, W2 and b2 the weight vector's slices after sigma (4 x NO, then 4), float32", t.NO === res.outputs.length && Array.from(t.outputs).join() === res.outputs.join() && t.w2.length === 4 * t.NO && t.w2.every((v, i) => v === Math.fround(W[off + i])) && t.b2.every((v, o) => v === Math.fround(W[off + 4 * t.NO + o])) && off + 4 * t.NO + 4 === POL.WEIGHT_COUNT);
    const nf = Array.from(W); nf[off + 4 * t.NO] = Infinity; nf[off + 4 * t.NO + 1] = -Infinity; nf[off + 2] = NaN; const tn = GP.readoutTablesOf(C, nf);
    ok("!! a non-finite readout weight: that output's keep is 0 and its weights go to the device as 0 (the CPU's fin() zeroes it every tick); the others keep 1", J(Array.from(tn.keep)) === J([0, 0, 1, 1]) && tn.b2[0] === 0 && tn.b2[1] === 0 && tn.w2[2] === 0 && J(Array.from(t.keep)) === J([1, 1, 1, 1]));
    ok("  OUTPUTS is the CPU pilot's 4 controls (pitch, yaw, thrust, ballast): the law has OUTPUTS rows and the keep mask OUTPUTS entries", GP.OUTPUTS === 4 && GP.OUTPUTS === CS.OUTPUTS && L.length === GP.OUTPUTS && t.keep.length === GP.OUTPUTS && t.b2.length === GP.OUTPUTS);
    const Lp = Array.from({ length: GP.OUTPUTS }, (_, o) => Array.from({ length: NF }, (_, f) => { const x = new Array(NF).fill(0); x[f] = GP.LAW_PROBE; return pol.step(w0, x, h0).controls[KEYS[o]] / GP.LAW_PROBE; }));
    ok("  LAW_PROBE is 1e-3 and the law is control(LAW_PROBE x e_f) / LAW_PROBE: recomputed here it is lawMatrixOf's matrix exactly", GP.LAW_PROBE === 1e-3 && Lp.every((row, o) => row.every((v, f) => v === L[o][f])));
    ok("  F32_MAX is float32's largest finite value: fround keeps it, and the next float64 up rounds to Infinity", GP.F32_MAX === 3.4028234663852886e38 && Math.fround(GP.F32_MAX) === GP.F32_MAX && Math.fround(GP.F32_MAX * (1 + 2 ** -23)) === Infinity && 1e39 > GP.F32_MAX);
    ok("  READOUT_WGSL: the kernel's entry is main, its workgroup the reservoir's, OUTPUTS spliced in as 4u (no ${} left), six bindings, the clamp to [-1, 1] behind the keep mask", typeof GP.READOUT_WGSL === "string" && /fn main\(/.test(GP.READOUT_WGSL) && /@workgroup_size\(64\)/.test(GP.READOUT_WGSL) && /q\.batch \* 4u/.test(GP.READOUT_WGSL) && !/\$\{/.test(GP.READOUT_WGSL) && (GP.READOUT_WGSL.match(/@binding\(\d\)/g) || []).length === 6 && /select\(0\.0, clamp\(y, -1\.0, 1\.0\)/.test(GP.READOUT_WGSL));
    ok("!! refused: a wrong weight count; a device that is not one", /takes 1729 weights, got 963/.test(thr(() => GP.readoutTablesOf(C, new Array(963).fill(0)))) && /needs a GPUDevice/.test(thr(() => new GP.GpuPilotBatch(null, C, Array.from(W)))));
}

// ---- the device ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
const req = createRequire(import.meta.url), skip = H.headlessGpuSkipReason(req);
let device = null, adapterDesc = "", software = true;
if (!skip) {
    H.configureVulkanIcd(); const { mod } = H.resolveWebgpu(req), gpu = mod.create([]), adapter = await gpu.requestAdapter();   // `gpu` is kept: dropping the instance under a live device segfaults Dawn (tools/ship/headlessGpu.mjs v4691)
    if (adapter) {
        device = await adapter.requestDevice(); const g = mod.globals || globalThis;
        device.__usage = g.GPUBufferUsage || globalThis.GPUBufferUsage; device.__mapMode = g.GPUMapMode || globalThis.GPUMapMode;
        const info = adapter.info || {}; adapterDesc = [info.vendor, info.architecture, info.description].filter(Boolean).join(" / ");
        software = /swiftshader|llvmpipe|lavapipe|software|warp|basic render/i.test(adapterDesc);
    } else skipped = "requestAdapter() returned null";
} else skipped = skip;
if (device) console.log(`\n[device] ${adapterDesc}${software ? "  -- A SOFTWARE ADAPTER: timings below say nothing about a graphics card" : ""}`);

/** Fly the device pilot and the CPU pilot side by side: `xsAt(t, b)` the features; `resetAt(t)` the reservoirs reset before tick t. Returns { worst, cells, bit }. */
async function compare({ pol, persist, w, xsAt, ticks, batch, resetAt = () => [] }) {
    const g = await GP.GpuPilotBatch.create(device, C, Array.from(w), { batch, persist }), hs = Array.from({ length: batch }, () => new Float64Array(pol.HIDDEN));
    let worst = 0, cells = 0, bit = 0;
    for (let t = 1; t <= ticks; t++) {
        const rs = resetAt(t); if (rs.length) { g.resetSome(rs); for (const b of rs) hs[b] = new Float64Array(pol.HIDDEN); }
        const xs = Array.from({ length: batch }, (_, b) => xsAt(t, b)); g.step(xs); const u = await g.controls();
        xs.forEach((x, b) => { const r = pol.step(w, x, hs[b]); hs[b] = r.h; KEYS.forEach((k, o) => { const d = Math.abs(u[b * 4 + o] - r.controls[k]); worst = Math.max(worst, d); cells++; if (u[b * 4 + o] === Math.fround(r.controls[k])) bit++; }); });
    }
    g.destroy(); return { worst, cells, bit };
}
const rngOf = (s) => P.mulberry(s);
// a proxy's pass-through: methods bound to the real device; the __usage / __mapMode it carries are CLASSES in Dawn (typeof "function") and must not be bound, or their flags vanish
const passThrough = (t, k) => { const v = t[k]; return typeof v === "function" && !String(k).startsWith("__") ? v.bind(t) : v; };
if (device) {
    sec("1. CONTROLS");
    {
        const r = rngOf(11), xs = Array.from({ length: 100 }, () => Array.from({ length: 8 }, () => Array.from({ length: NF }, () => (r() - 0.5) * 3)));
        const a = await compare({ pol: POL, persist: true, w: W, xsAt: (t, b) => xs[t - 1][b], ticks: 100, batch: 8 }), n = await compare({ pol: NOS, persist: false, w: W, xsAt: (t, b) => xs[t - 1][b], ticks: 100, batch: 8 });
        ok("!! random features, batch 8, 100 ticks, WITH MEMORY: every control within 1e-4 of the CPU pilot's", a.worst <= 1e-4, `worst ${a.worst.toExponential(2)}; bit-identical ${a.bit} of ${a.cells}`);
        ok("!! the same with NO STATE", n.worst <= 1e-4, `worst ${n.worst.toExponential(2)}; bit-identical ${n.bit} of ${n.cells}`);
        // features small enough that the controls are NOT saturated, so W2 and the law are read, not hidden by the clamp
        const r2 = rngOf(12), small = Array.from({ length: 100 }, () => Array.from({ length: 8 }, () => Array.from({ length: NF }, () => (r2() - 0.5) * 0.4)));
        let inside = 0, all = 0; { const hs = Array.from({ length: 8 }, () => new Float64Array(POL.HIDDEN)); for (const row of small) row.forEach((x, b) => { const q = POL.step(W, x, hs[b]); hs[b] = q.h; KEYS.forEach((k) => { all++; if (Math.abs(q.controls[k]) < 0.999) inside++; }); }); }
        const u = await compare({ pol: POL, persist: true, w: W, xsAt: (t, b) => small[t - 1][b], ticks: 100, batch: 8 });
        ok("!! with features small enough that at least 80% of the CPU's controls are NOT saturated, every control still within 1e-4 (the clamp hides nothing here)", inside / all >= 0.8 && u.worst <= 1e-4, `${((100 * inside) / all).toFixed(0)}% unsaturated; worst ${u.worst.toExponential(2)}`);
        const r3 = rngOf(13), big = Array.from({ length: 10 }, () => Array.from({ length: 64 }, () => Array.from({ length: NF }, () => (r3() - 0.5) * 0.4)));
        const b64 = await compare({ pol: POL, persist: true, w: W, xsAt: (t, b) => big[t - 1][b], ticks: 10, batch: 64 });
        ok("!! batch 64 (256 readout threads, four workgroups): every reservoir to the last within 1e-4 (a readout dispatch too small leaves the late reservoirs stale)", b64.worst <= 1e-4, `worst ${b64.worst.toExponential(2)}`);
    }
    sec("2. THE REAL PILOT");
    {
        const rec = [], kind = FX.flyCxKind(C), q = A.createTank();
        q.registerPilotKind("flycx", { ...kind, build: (w, ctx) => { const p = kind.build(w, ctx); return (s, t, c, aux) => { rec.push([...P.features(s, t, c), aux && aux.compassValid === 0 ? 0 : 1]); return p(s, t, c, aux); }; } });
        q.sync([{ id: "g", name: "g", hue: 1, from: "gate", local: true, theta: null, pilot: "stateful", circuit: "flycx", weights: file.weights }]); q.setEvent("g", "dropout");
        for (let i = 0; i < 1500; i++) q.step(1 / 30);
        const res = await compare({ pol: POL, persist: true, w: W, xsAt: (t, b) => rec[(t - 1 + 300 * b) % rec.length], ticks: 300, batch: 4 });
        ok("!! the file's 1,729 weights on features recorded from a real tank flight through the dropout, four reservoirs offset in time, 300 ticks: every control within 1e-4", res.worst <= 1e-4 && rec.length >= 1200, `worst ${res.worst.toExponential(2)}; bit-identical ${res.bit} of ${res.cells}; ${rec.length} recorded ticks`);
    }
    sec("3. THE CLAMP");
    {
        const w = Float32Array.from(W), off = POL.SIGMA_INDEX + 1 + 4 * GP.readoutTablesOf(C, Array.from(W)).NO; w[off] = 5; w[off + 1] = -5;
        const r = rngOf(5), xs = Array.from({ length: 20 }, () => Array.from({ length: NF }, () => (r() - 0.5) * 0.2)), g = await GP.GpuPilotBatch.create(device, C, Array.from(w), { batch: 1 });
        let sat = true; for (const x of xs) { g.step([x]); const u = await g.controls(); sat = sat && u[0] === 1 && u[1] === -1; }
        g.destroy(); const m = await compare({ pol: POL, persist: true, w, xsAt: (t) => xs[t - 1], ticks: 20, batch: 1 });
        ok("!! a readout bias of +5 / -5 saturates pitch at exactly +1 and yaw at exactly -1, every tick; the rest still match the CPU pilot", sat && m.worst <= 1e-4, `worst ${m.worst.toExponential(2)}`);
    }
    sec("3b. NON-FINITE AND OUT OF RANGE");
    {
        const off = POL.SIGMA_INDEX + 1, NO = GP.readoutTablesOf(C, Array.from(W)).NO, w = Array.from(W); w[off + 4 * NO] = Infinity; w[off + 4 * NO + 1] = -Infinity; w[off + 2 * NO + 3] = NaN;
        const xs = Array.from({ length: 10 }, (_, k) => new Array(NF).fill(0.1 + 0.01 * k)), m = await compare({ pol: POL, persist: true, w, xsAt: (t) => xs[t - 1], ticks: 10, batch: 1 });
        ok("!! readout weights of +Inf, -Inf and NaN: the device gives what the CPU's fin() gives (those controls 0), and the fourth control still matches", m.worst <= 1e-4, `worst ${m.worst.toExponential(2)}`);
        const g = await GP.GpuPilotBatch.create(device, C, Array.from(W), { batch: 2 }), x = new Array(NF).fill(0.1); x[2] = 1e39;
        ok("!! a finite feature beyond float32's range (1e39) is REFUSED by step, by name, for plain and typed rows; NaN still reads as 0 as the CPU's fin() does", /beyond float32's range/.test(thr(() => g.step([x, new Array(NF).fill(0)]))) && /beyond float32's range/.test(thr(() => g.step([Float64Array.from(x), new Float64Array(NF)]))) && thr(() => g.step([new Array(NF).fill(NaN), new Array(NF).fill(0)])) === "");
        g.destroy();
    }
    sec("4. RESET ONE");
    {
        const r = rngOf(7), xs = Array.from({ length: 60 }, () => Array.from({ length: 3 }, () => Array.from({ length: NF }, () => (r() - 0.5) * 3)));
        const res = await compare({ pol: POL, persist: true, w: W, xsAt: (t, b) => xs[t - 1][b], ticks: 60, batch: 3, resetAt: (t) => (t === 31 ? [1] : []) });
        // and the reset must MATTER: a run that does not reset reservoir 1 on the device while the CPU does, differs
        const wrong = await (async () => { const g = await GP.GpuPilotBatch.create(device, C, Array.from(W), { batch: 3 }), hs = [0, 1, 2].map(() => new Float64Array(POL.HIDDEN)); let d = 0;
            for (let t = 1; t <= 60; t++) { if (t === 31) hs[1] = new Float64Array(POL.HIDDEN); g.step(xs[t - 1]); const u = await g.controls(); xs[t - 1].forEach((x, b) => { const q = POL.step(W, x, hs[b]); hs[b] = q.h; if (b === 1) KEYS.forEach((k, o) => { d = Math.max(d, Math.abs(u[4 + o] - q.controls[k])); }); }); }
            g.destroy(); return d; })();
        ok("!! resetSome([1]) at tick 31: reservoir 1 follows the CPU pilot restarted from zero activity, 0 and 2 the CPU pilot that was not (all within 1e-4); without the device reset reservoir 1 is off by more than 1e-3", res.worst <= 1e-4 && wrong > 1e-3, `worst ${res.worst.toExponential(2)}; no-reset miss ${wrong.toExponential(2)}`);
        const g = await GP.GpuPilotBatch.create(device, C, Array.from(W), { batch: 2 });
        const multi = await compare({ pol: POL, persist: true, w: W, xsAt: (t, b) => xs[t - 1][b], ticks: 60, batch: 3, resetAt: (t) => (t === 20 ? [0, 2] : t === 45 ? [1] : []) });
        ok("!! resetSome([0, 2]) at tick 20 and [1] at 45: every reservoir follows the CPU pilot reset at the same ticks (within 1e-4)", multi.worst <= 1e-4, `worst ${multi.worst.toExponential(2)}`);
        const ga = await GP.GpuPilotBatch.create(device, C, Array.from(W), { batch: 3 }), hs = [0, 1, 2].map(() => new Float64Array(POL.HIDDEN)); let atomicMiss = 0;
        for (let t = 1; t <= 10; t++) { if (t === 6) thr(() => ga.resetSome([0, 9])); ga.step(xs[t - 1]); const u = await ga.controls(); xs[t - 1].forEach((x, b) => { const q = POL.step(W, x, hs[b]); hs[b] = q.h; KEYS.forEach((k, o) => { atomicMiss = Math.max(atomicMiss, Math.abs(u[b * 4 + o] - q.controls[k])); }); }); }
        ga.destroy();
        ok("!! resetSome is atomic: [0, 9] throws and resets NOTHING (reservoir 0 goes on as the CPU pilot that was never reset)", atomicMiss <= 1e-4, `worst ${atomicMiss.toExponential(2)}`);
        ok("  refused: a reservoir outside the batch, or not a whole number", /not in 0\.\.1/.test(thr(() => g.resetSome([2]))) && /not in 0\.\.1/.test(thr(() => g.resetSome([0.5]))) && /not in 0\.\.1/.test(thr(() => g.resetSome([-1]))));
        g.destroy();
    }
    sec("5. INDEPENDENT");
    {
        const r = rngOf(9), xs = Array.from({ length: 30 }, () => Array.from({ length: 4 }, () => Array.from({ length: NF }, () => (r() - 0.5) * 3)));
        const big = await GP.GpuPilotBatch.create(device, C, Array.from(W), { batch: 4 }), one = await GP.GpuPilotBatch.create(device, C, Array.from(W), { batch: 1 }); let same = true;
        for (const row of xs) { big.step(row); one.step([row[2]]); const a = await big.controls(), b = await one.controls(); for (let o = 0; o < 4; o++) same = same && a[8 + o] === b[o]; }
        big.destroy(); one.destroy();
        ok("!! reservoir 2 of a batch of 4 gives the same controls, bit for bit, as a batch of 1 flying its features alone", same);
    }
    sec("6. READ-BACK");
    {
        const g = await GP.GpuPilotBatch.create(device, C, Array.from(W), { batch: 5 }); g.step(Array.from({ length: 5 }, () => new Array(NF).fill(0.1)));
        const u = await g.controls(), h = await g.read();
        ok("!! controls() reads back batch x 4 numbers (16 bytes a reservoir), all in [-1, 1]; the activity (batch x 148) is still readable", u.length === 20 && u.every((v) => v >= -1 && v <= 1) && h.length === 5 * 148);
        ok("  a tick is two dispatches (the step and the readout)", g.dispatches === 2);
        g.destroy();
    }
    sec("7. REFUSAL");
    {
        const fake = new Proxy(device, { get: (t, k) => (k === "popErrorScope" ? async () => { await t.popErrorScope(); return { message: "a rejection the gate made up" }; } : passThrough(t, k)) });   // the real scope is popped too: none is left open
        let msg = ""; try { await GP.GpuPilotBatch.create(fake, C, Array.from(W), { batch: 1 }); } catch (e) { msg = e.message; }
        ok("!! a device whose validation scope reports a rejection makes create() throw, naming it", /device rejected a kernel -- a rejection the gate made up/.test(msg), msg);
    }
    {
        const made = [], gone = new Set(), counting = new Proxy(device, { get: (t, k) => (k === "createBuffer" ? (d) => { const b = t.createBuffer(d), real = b.destroy.bind(b); b.destroy = () => { gone.add(b); real(); }; made.push(b); return b; } : passThrough(t, k)) });
        const g = await GP.GpuPilotBatch.create(counting, C, Array.from(W), { batch: 3 }); g.step(Array.from({ length: 3 }, () => new Array(NF).fill(0.1))); await g.controls(); const kept = made.length; g.destroy();
        ok("  destroy() releases every buffer the batch made (the read-backs release their own)", made.length === kept && made.every((b) => gone.has(b)), `${gone.size} of ${made.length}`);
    }
    sec("8. THE PRICE (printed, not asserted)");
    {
        const lines = [];
        for (const batch of [1, 16, 128, 1024]) {
            const r = rngOf(batch), xs = Array.from({ length: batch }, () => Array.from({ length: NF }, () => (r() - 0.5) * 3)), g = await GP.GpuPilotBatch.create(device, C, Array.from(W), { batch }), ticks = batch >= 1024 ? 5 : 20;
            g.step(xs); await g.controls();
            let t0 = performance.now(); for (let k = 0; k < ticks; k++) { g.step(xs); await g.controls(); } const dev = (performance.now() - t0) / ticks; g.destroy();
            const hs = xs.map(() => new Float64Array(POL.HIDDEN)); t0 = performance.now(); for (let k = 0; k < ticks; k++) xs.forEach((x, b) => { hs[b] = POL.step(W, x, hs[b]).h; }); const cpu = (performance.now() - t0) / ticks;
            PRICE.push([batch, Number(dev.toFixed(3)), Number(cpu.toFixed(3)), software ? "software" : "hardware"]);
            lines.push(`batch ${batch}: device ${dev.toFixed(3)} ms a tick (step, readout and the controls read back), CPU pilot ${cpu.toFixed(3)} ms`);
        }
        for (const l of lines) console.log("  " + l + (software ? "   [software adapter]" : ""));
    }
}

sec("9. SOURCE");
{
    const src = fs.readFileSync(new URL("./reservoirPilotGpu.mjs", import.meta.url), "utf8"), code = src.split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n");
    ok("!! no clock, no Math.random, no file in the module; the header names the backlog item and says it is not yet a tank pilot kind", !/Date\.now|performance\.now|Math\.random|node:fs|readFile/.test(code) && /gpu-reservoir-kernel/.test(src) && /WHAT IT IS NOT: a pilot kind for the tank/.test(src));
}

if (skipped) console.log(`\nSKIPPED sections 1 to 8 (no device): ${skipped}`);
if (PRICE.length) REPORT.table("the price: ms a tick on the device (step, readout, controls read back) against the CPU pilot, by batch", ["batch", "device ms", "CPU ms", "adapter"], PRICE, "printed, not asserted; a software adapter says nothing about a graphics card");
else REPORT.skip("the price table", skipped ? "no WebGPU device here: " + skipped : "section 8 did not run");
REPORT.write();
console.log(`\n${fails ? "FAIL" : skipped ? "PASS (DEVICE SECTIONS SKIPPED)" : "PASS"}  reservoirPilotGpu-selfcheck: ${fails} failing row${fails === 1 ? "" : "s"}`);
H.exitCleanly(fails ? 1 : 0);
