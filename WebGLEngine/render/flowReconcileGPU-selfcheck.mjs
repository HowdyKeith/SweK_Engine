#!/usr/bin/env node
// WebGLEngine/render/flowReconcileGPU-selfcheck.mjs -- v4685
//
// THE DEVICE MIRROR OF FSR3's RECONCILIATION, AND THE FIRST STEP OF A PATH THAT HAS BEEN CPU-ONLY SINCE v4676.
//
// Every gate in this arc from v4676 to v4684 closes by saying the same thing: the whole FSR3 path from
// reconciliation to pixels is CPU, so a generated frame costs a readback and fsr.html pays it every frame.
// This is the first of the three passes to come off the CPU.
//
// *** A FLOW FIELD IS A DECISION PER BLOCK, SO PARITY HERE HAS NO TOLERANCE TO HIDE BEHIND. *** `source` is one
// of three integers. A single block choosing differently is a different ANSWER, not a rounding difference --
// the property v4674 recorded when it mirrored the search, and the reason that round's parity row is worth more
// than most. The SADs are f32 against f64 and do carry a tolerance; the DECISIONS do not.
//
// THE ROWS, and each is a way the mirror could agree in shape and disagree in substance:
//   1. the kernel validates, and the runner refuses what the CPU refuses;
//   2. every block picks the SAME SOURCE on content where the two arms genuinely disagree -- if the scene made
//      them agree everywhere, the row would be measuring the scene;
//   3. the flat-content case, where `<=` instead of `<` hands the whole frame to a search that saw nothing;
//   4. the margin, driven across settings so a mirror that ignored it is visible;
//   5. the nearest-VALID-pixel rule, including a block whose nearest pixel is invalid;
//   6. the counts the kernel's atomics keep against the CPU's own census.
"use strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInEngineOrigin, webgpuSkipReason } from "../tools/ship/webgpuHarness.mjs";
import { validateWgsl } from "./wgslSpec.mjs";
import { RECONCILE_WGSL, RECONCILE_STRIDE } from "./flowReconcileWgsl.mjs";
import { reconcileFlowCPU, SRC_APP, SRC_FLOW_BEAT, SRC_FLOW_ONLY } from "./flowReconcile.mjs";
import { opticalFlowCPU } from "./opticalFlow.mjs";
import { motionVectorsCPU, mat4Invert, transform4 } from "./motionVectors.mjs";
import { viewProj } from "./rasterProbe.js";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const say = (s) => console.log(`  ----  ${s}`);
const threw = (fn) => { try { fn(); return null; } catch (e) { return e.message; } };

// ---- THE RIG: render/flowReconcile-selfcheck.mjs's wall, so both gates score the same content ------------
const W = 64, H = 64, B = 8, TAN = Math.tan(0.5), ASP = 1, NEAR = 0.1, FAR = 100, DIST = 8;
const VP = (ex) => viewProj([ex, -DIST, 0], [0, 1, 0], [1, 0, 0], [0, 0, 1], TAN, ASP, NEAR, FAR);
const TWs = 256, tex = new Float32Array(TWs * TWs);
{
    let s = 7; const rnd = () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    const raw = new Float32Array(TWs * TWs);
    for (let i = 0; i < TWs * TWs; i++) raw[i] = rnd();
    for (let y = 0; y < TWs; y++) for (let x = 0; x < TWs; x++) {
        let a = 0;
        for (let j = -2; j <= 2; j++) for (let i = -2; i <= 2; i++) a += raw[((y + j + TWs) % TWs) * TWs + ((x + i + TWs) % TWs)];
        tex[y * TWs + x] = a / 25;
    }
}
const samp = (wx, wz) => {
    const fx = wx * 8 + 128, fy = wz * 8 + 128, x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
    const g = (x, y) => tex[(((y % TWs) + TWs) % TWs) * TWs + (((x % TWs) + TWs) % TWs)];
    return (g(x0, y0) * (1 - tx) + g(x0 + 1, y0) * tx) * (1 - ty) + (g(x0, y0 + 1) * (1 - tx) + g(x0 + 1, y0 + 1) * tx) * ty;
};
function render(ex, slide) {
    const rgba = new Float32Array(W * H * 4), depth = new Float32Array(W * H), vp = VP(ex);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const u = (x + 0.5) / W, v = (y + 0.5) / H;
        const wx = ex + (2 * u - 1) * TAN * ASP * DIST, wz = (1 - 2 * v) * TAN * DIST;
        const c = samp(wx - slide, wz), i = y * W + x;
        rgba[i * 4] = c; rgba[i * 4 + 1] = c; rgba[i * 4 + 2] = c; rgba[i * 4 + 3] = 1;
        const q = transform4(vp, wx, 0, wz, 1);
        depth[i] = q[2] / q[3];
    }
    return { rgba, depth };
}
/** One case: the two frames, the app field, the colour flow, and the CPU's answer. */
function build({ dex = 0, slide = 0, margin = 0.05, flat = false, killValid = null } = {}) {
    let prev, cur;
    if (flat) {
        const g = new Float32Array(W * H * 4);
        for (let i = 0; i < W * H; i++) { g[i * 4] = 0.4; g[i * 4 + 1] = 0.4; g[i * 4 + 2] = 0.4; g[i * 4 + 3] = 1; }
        prev = { rgba: g, depth: new Float32Array(W * H).fill(0.5) };
        cur = { rgba: g, depth: new Float32Array(W * H).fill(0.5) };
    } else { prev = render(0, 0); cur = render(dex, slide); }
    const mv = flat
        ? (() => { const m = new Float32Array(W * H * 4);
                   for (let i = 0; i < W * H; i++) { m[i * 4] = -2 / W; m[i * 4 + 2] = 1; } return { data: m }; })()
        : motionVectorsCPU(cur.depth, W, H, mat4Invert(VP(dex)), VP(0));
    if (killValid) for (const j of killValid) mv.data[j * 4 + 2] = 0;
    const of = opticalFlowCPU({ cur: cur.rgba, prev: prev.rgba, w: W, h: H, block: B, searchRadius: 4, levels: flat ? 1 : 2 });
    const args = { cur: cur.rgba, prev: prev.rgba, w: W, h: H, flow: of.flow, conf: of.conf,
                   bw: of.bw, bh: of.bh, block: B, motion: mv.data, depth: cur.depth, margin };
    return { args, cpu: reconcileFlowCPU(args), n: of.bw * of.bh };
}

console.log("flowReconcileGPU-selfcheck -- the reconciliation on the device, and no tolerance on a decision\n");

console.log("1. THE KERNEL AND WHAT THE RUNNER REFUSES");
{
    const errs = validateWgsl(RECONCILE_WGSL);
    ok("the WGSL validates against the spec scanner", errs.length === 0, errs.join("; "));
    ok("the packed stride is declared beside the kernel rather than repeated in the runner",
       RECONCILE_STRIDE === 8, `${RECONCILE_STRIDE} floats per block: fx fy ax ay sadApp sadFlow sadStill source`);
    ok("*** the kernel names the arc's luma weights and not a second convention ***",
       /0\.25 \* cur\[i\*4u\] \+ 0\.5 \* cur\[i\*4u\+1u\] \+ 0\.25 \* cur\[i\*4u\+2u\]/.test(RECONCILE_WGSL),
       "0.25/0.5/0.25, which is render/temporalReject.mjs's luma and level 0 of render/luminancePyramid.mjs. " +
       "A mirror on 0.299/0.587/0.114 would pass every shape row and disagree on every block.");
}

const skip = await webgpuSkipReason();
if (skip) { ok("a WebGPU adapter is available", false, skip); }
else {

// Everything the device needs, built on the CPU and handed over as plain arrays.
const CASES = {
    geometry: build({ dex: 0.437 }),
    shader: build({ slide: 0.437 }),
    both: build({ dex: 0.3, slide: 0.6 }),
    flat: build({ flat: true, margin: 0 }),
    marginZero: build({ dex: 0.437, margin: 0 }),
    marginWide: build({ dex: 0.437, margin: 0.2 }),
    // one block (the first) with every pixel invalid, and one with all but a single pixel invalid
    // *** A SILHOUETTE, BUILT BY HAND, BECAUSE THE WALL HAS NO DEPTH VARIATION AND THE RIG THEREFORE CANNOT
    // REACH THE NEAREST-PIXEL RULE AT ALL. *** A sabotage taking the FARTHEST pixel instead of the nearest
    // scored 0 red against the rendered cases: the wall is perpendicular to the view at constant distance, so
    // every pixel of every block sits at one depth and the two rules choose the same pixel. render/
    // flowReconcile-selfcheck.mjs's own section 6 builds its silhouette by hand for the same reason.
    silhouette: (() => {
        let sd = 3; const rnd = () => (sd = (sd * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
        const img = new Float32Array(W * H * 4);
        for (let i = 0; i < W * H; i++) { const c = rnd(); img[i * 4] = c; img[i * 4 + 1] = c; img[i * 4 + 2] = c; img[i * 4 + 3] = 1; }
        const of2 = opticalFlowCPU({ cur: img, prev: img, w: W, h: H, block: B, searchRadius: 4, levels: 1 });
        const motion = new Float32Array(W * H * 4), depth = new Float32Array(W * H);
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
            const i = y * W + x, near = (x % B) < B / 2;
            motion[i * 4] = (near ? -1 : -6) / W; motion[i * 4 + 2] = 1;
            depth[i] = near ? 0.2 : 0.9;          // every block straddles a silhouette
        }
        const args = { cur: img, prev: img, w: W, h: H, flow: of2.flow, conf: of2.conf,
                       bw: of2.bw, bh: of2.bh, block: B, motion, depth, margin: 0.05 };
        return { args, cpu: reconcileFlowCPU(args), n: of2.bw * of2.bh };
    })(),
    invalid: build({ dex: 0.437, killValid: (() => { const k = [];
        for (let y = 0; y < B; y++) for (let x = 0; x < 2 * B; x++) k.push(y * W + x);
        return k.filter((j) => j !== 3 * W + B + 4); })() }),
};
const payload = {};
for (const [k, c] of Object.entries(CASES)) payload[k] = {
    cur: Array.from(c.args.cur), prev: Array.from(c.args.prev), w: W, h: H,
    flow: Array.from(c.args.flow), bw: c.args.bw, bh: c.args.bh, block: B,
    motion: Array.from(c.args.motion), depth: Array.from(c.args.depth), margin: c.args.margin };

const r = await runInEngineOrigin({ engineRoot: ENG, timeoutMs: 900000, args: { payload }, script: `async (a) => {
    const { requestDevice } = await import("/gfx/device.js");
    const { FlowReconcileGPU } = await import("/render/flowReconcileGPU.mjs");
    const cv = document.createElement("canvas"); cv.width = 8; cv.height = 8;
    const dev = await requestDevice(cv, { backend: "webgpu", offscreen: true });
    // the uncaptured-error channel every mirror in this arc listens on: a kernel that faulted and returned
    // zeros looks like a kernel that agreed with a zero-filled expectation
    const errs = [];
    if (dev.gpu && dev.gpu.addEventListener) dev.gpu.addEventListener("uncapturederror", (e) => errs.push(String(e.error && e.error.message).slice(0, 200)));
    const g = new FlowReconcileGPU(dev);
    const out = {};
    for (const [k, p] of Object.entries(a.payload)) {
        const res = await g.reconcile({ ...p, cur: Float32Array.from(p.cur), prev: Float32Array.from(p.prev),
                                        flow: Float32Array.from(p.flow), motion: Float32Array.from(p.motion),
                                        depth: Float32Array.from(p.depth) });
        out[k] = { flow: Array.from(res.flow), appFlow: Array.from(res.appFlow), source: Array.from(res.source),
                   sadApp: Array.from(res.sadApp), sadFlow: Array.from(res.sadFlow), sadStill: Array.from(res.sadStill),
                   counts: res.counts };
    }
    // and one refusal, driven on the device side so the runner's own guards are exercised there
    const bad = [];
    for (const [label, patch] of [["block", { block: 8.5 }], ["grid", { bw: 7 }], ["margin", { margin: 1 }],
                                  ["depth", { depth: null }], ["motion", { motion: new Float32Array(4) }]]) {
        const p = a.payload.geometry;
        try { await g.reconcile({ ...p, cur: Float32Array.from(p.cur), prev: Float32Array.from(p.prev),
                                  flow: Float32Array.from(p.flow), motion: Float32Array.from(p.motion),
                                  depth: Float32Array.from(p.depth), ...patch });
              bad.push([label, null]); }
        catch (e) { bad.push([label, String(e.message)]); }
    }
    // and the WebGL2 refusal, which cannot be driven from node
    let wrongBackend = null;
    try { const c2 = document.createElement("canvas");
          const d2 = await requestDevice(c2, { backend: "webgl2", offscreen: true });
          new FlowReconcileGPU(d2); }
    catch (e) { wrongBackend = String(e.message).slice(0, 160); }
    return { out, bad, backend: dev.backend, errs, wrongBackend };
}` });

if (!r.ok) { ok("the device ran", false, `${r.reason || "no result"} ${JSON.stringify(r.pageErrors || []).slice(0, 300)}`); }
else {
const G = r.result.out;
say(`adapter ${r.adapter ? (r.adapter.description || r.adapter.vendor) : "unknown"}${r.software ? " (SOFTWARE)" : ""}, backend ${r.result.backend}`);
ok("*** the kernel ran on a real WebGPU device with NO uncaptured errors -- a faulted dispatch returns zeros, which agrees with a zero expectation ***",
   r.result.backend === "webgpu" && r.result.errs.length === 0,
   `backend ${r.result.backend}; errors ${JSON.stringify(r.result.errs)}`);
ok("...and a non-webgpu device is refused at construction, which only a browser can drive",
   /needs a gfx\/device\.js device on the webgpu backend/.test(r.result.wrongBackend || ""), r.result.wrongBackend);

/** Compare one case: decisions exactly, SADs to a tolerance, and report both. */
const cmp = (key) => {
    const c = CASES[key].cpu, d = G[key], n = CASES[key].n;
    let srcDiff = 0, flowWorst = 0, appWorst = 0, sadWorst = 0, nanMismatch = 0;
    for (let i = 0; i < n; i++) {
        if (c.source[i] !== d.source[i]) srcDiff++;
        flowWorst = Math.max(flowWorst, Math.abs(c.flow[i * 2] - d.flow[i * 2]), Math.abs(c.flow[i * 2 + 1] - d.flow[i * 2 + 1]));
        for (const [a, b] of [[c.appFlow[i * 2], d.appFlow[i * 2]], [c.appFlow[i * 2 + 1], d.appFlow[i * 2 + 1]], [c.sadApp[i], d.sadApp[i]]]) {
            if (Number.isNaN(a) !== Number.isNaN(b)) nanMismatch++;
            else if (!Number.isNaN(a)) appWorst = Math.max(appWorst, Math.abs(a - b));
        }
        sadWorst = Math.max(sadWorst, Math.abs(c.sadFlow[i] - d.sadFlow[i]), Math.abs(c.sadStill[i] - d.sadStill[i]));
    }
    return { n, srcDiff, flowWorst, appWorst, sadWorst, nanMismatch, cpu: c, dev: d };
};

console.log("\n2. *** EVERY BLOCK PICKS THE SAME SOURCE, ON CONTENT WHERE THE TWO ARMS GENUINELY DISAGREE ***");
{
    const rows = ["geometry", "shader", "both"].map((k) => [k, cmp(k)]);
    for (const [k, x] of rows)
        say(`${k.padEnd(9)} ${x.n} blocks: source differs on ${x.srcDiff};  worst |flow| ${x.flowWorst.toExponential(2)} px, ` +
            `|appFlow| ${x.appWorst.toExponential(2)}, |sad| ${x.sadWorst.toExponential(2)};  ` +
            `CPU census app ${x.cpu.counts.app}/flow ${x.cpu.counts.flowBeat}/only ${x.cpu.counts.flowOnly}, device ${x.dev.counts.app}/${x.dev.counts.flowBeat}/${x.dev.counts.flowOnly}`);
    ok("*** the device picks the SAME SOURCE at every block of every case -- a decision has no tolerance to hide behind ***",
       rows.every(([, x]) => x.srcDiff === 0),
       rows.map(([k, x]) => `${k}: ${x.srcDiff} of ${x.n} differ`).join("; ") +
       ". source is one of three integers, so one differing block is a different ANSWER. v4674 recorded the same property for the search.");
    ok("*** ...and the cases really do disagree, so this is not a row measuring a scene where both arms say the same thing ***",
       rows.some(([, x]) => x.cpu.counts.app > 0 && x.cpu.counts.flowBeat > 0)
       && rows.find(([k]) => k === "shader")[1].cpu.counts.flowBeat === rows.find(([k]) => k === "shader")[1].n
       && rows.find(([k]) => k === "geometry")[1].cpu.counts.app > 0.9 * rows.find(([k]) => k === "geometry")[1].n,
       `the geometry scene gives the application ${rows.find(([k]) => k === "geometry")[1].cpu.counts.app} of ${rows.find(([k]) => k === "geometry")[1].n} blocks ` +
       `and the shader scene gives the flow all ${rows.find(([k]) => k === "shader")[1].n}. A mirror that always answered "application" would pass on one and fail on the other.`);
    ok("...and the vectors agree to f32, which is the tolerance a decision does not get",
       rows.every(([, x]) => x.flowWorst < 1e-4 && x.appWorst < 1e-4 && x.nanMismatch === 0),
       `worst |flow| ${Math.max(...rows.map(([, x]) => x.flowWorst)).toExponential(2)} px, worst |appFlow| ` +
       `${Math.max(...rows.map(([, x]) => x.appWorst)).toExponential(2)}, NaN placement mismatches ${rows.reduce((s, [, x]) => s + x.nanMismatch, 0)}`);
    ok("*** ...and the SADs agree too, which is what says the kernel's bilinear sampler is the CPU's and not merely close ***",
       rows.every(([, x]) => x.sadWorst < 2e-3),
       `worst |sad| ${Math.max(...rows.map(([, x]) => x.sadWorst)).toExponential(2)} over blocks of 64 samples each. ` +
       `f32 against f64 through 64 bilinear fetches and 64 absolute differences; a mirror sampling nearest instead would read orders of magnitude apart.`);
}

console.log("\n3. THE FLAT CASE, WHERE ONE CHARACTER HANDS THE FRAME TO A SEARCH THAT SAW NOTHING");
{
    const x = cmp("flat");
    say(`uniform grey, margin 0: CPU app ${x.cpu.counts.app}/${x.n}, device app ${x.dev.counts.app}/${x.n}; source differs on ${x.srcDiff}`);
    ok("*** on content with no signal at all, at margin ZERO, the device keeps every block with the application -- the STRICTLY-better rule survived the port ***",
       x.srcDiff === 0 && x.dev.counts.app === x.n && x.dev.counts.flowBeat === 0,
       `${x.dev.counts.app} of ${x.n} blocks to the application, ${x.dev.counts.flowBeat} to the flow. ` +
       `Every candidate ties here, so \`<=\` instead of \`<\` gives all of them to a search that reported no motion for want of anything to see. ` +
       `The CPU's gate measures the same 16 of 16 at 64x64; this is the port of that.`);
    ok("...and the reconciled vector there is the application's on the device too, not a plausible zero",
       Math.abs(x.dev.flow[0] - 2) < 1e-4 && x.dev.source[0] === SRC_APP,
       `flow[0] ${x.dev.flow[0]} against the application's +2 px, source ${x.dev.source[0]}`);
}

console.log("\n4. THE MARGIN, DRIVEN ACROSS SETTINGS");
{
    const z = cmp("marginZero"), d5 = cmp("geometry"), w2 = cmp("marginWide");
    say(`geometry scene, flow blocks won:  margin 0 -> CPU ${z.cpu.counts.flowBeat} device ${z.dev.counts.flowBeat};  ` +
        `0.05 -> ${d5.cpu.counts.flowBeat}/${d5.dev.counts.flowBeat};  0.20 -> ${w2.cpu.counts.flowBeat}/${w2.dev.counts.flowBeat}`);
    ok("*** the device's census tracks the CPU's across three margins, and the margin MOVES it -- a kernel ignoring the uniform would agree at one setting ***",
       [z, d5, w2].every((x) => x.srcDiff === 0)
       && z.dev.counts.flowBeat > d5.dev.counts.flowBeat && d5.dev.counts.flowBeat >= w2.dev.counts.flowBeat
       && z.dev.counts.flowBeat > w2.dev.counts.flowBeat,
       `flow blocks ${z.dev.counts.flowBeat} -> ${d5.dev.counts.flowBeat} -> ${w2.dev.counts.flowBeat} as the margin goes 0 -> 0.05 -> 0.20, ` +
       `and the source matches the CPU block for block at all three. The CPU's gate measures 7 -> 4 -> 2 on this scene.`);
}

console.log("\n5. THE NEAREST-VALID-PIXEL RULE, AND A BLOCK THE APPLICATION CANNOT ANSWER");
{
    const x = cmp("invalid");
    say(`one block fully invalid, one with a single valid pixel: CPU only ${x.cpu.counts.flowOnly}, device only ${x.dev.counts.flowOnly}; source differs on ${x.srcDiff}`);
    ok("*** a block with no valid vector reports SRC_FLOW_ONLY on the device too, and its appFlow and sadApp are NaN rather than zero ***",
       x.srcDiff === 0 && x.dev.source[0] === SRC_FLOW_ONLY && x.dev.counts.flowOnly === 1
       && Number.isNaN(x.dev.appFlow[0]) && Number.isNaN(x.dev.appFlow[1]) && Number.isNaN(x.dev.sadApp[0]),
       `source[0] ${x.dev.source[0]} (flow-only ${SRC_FLOW_ONLY}), ${x.dev.counts.flowOnly} unanswerable, ` +
       `appFlow (${x.dev.appFlow[0]}, ${x.dev.appFlow[1]}), sadApp ${x.dev.sadApp[0]}. ` +
       `The NaN is handed to the kernel through its uniform, because WGSL refuses a NaN CONSTANT at compile time -- so a caller reading these gets arithmetic it cannot mistake for a measurement, and the value is the CPU own NaN rather than one the kernel manufactured.`);
    ok("...and a block with ONE valid pixel among 63 invalid ones uses that pixel on the device, matching the CPU to f32",
       Math.abs(x.dev.appFlow[2] - x.cpu.appFlow[2]) < 1e-4 && x.dev.source[1] !== SRC_FLOW_ONLY,
       `device appFlow ${x.dev.appFlow[2]} against the CPU's ${x.cpu.appFlow[2]}, source ${x.dev.source[1]}. ` +
       `The kernel checks \`valid\` BEFORE depth, so an invalid pixel that happens to be nearest cannot win.`);
}

console.log("\n6. THE NEAREST-PIXEL RULE, ON A SILHOUETTE THE RENDERED SCENE CANNOT PROVIDE");
{
    const x = cmp("silhouette");
    say(`every block straddles a near half (+1 px, depth 0.2) and a far half (+6 px, depth 0.9): ` +
        `CPU appFlow[0] ${x.cpu.appFlow[0]}, device ${x.dev.appFlow[0]};  source differs on ${x.srcDiff}`);
    ok("*** the device takes the NEARER surface's vector, not the two surfaces' mean and not the farther one ***",
       Math.abs(x.dev.appFlow[0] - 1) < 1e-4 && x.srcDiff === 0,
       `device appFlow ${x.dev.appFlow[0]} -- the nearer surface's +1, against the farther's +6 and their mean of +3.5. ` +
       `A sabotage inverting the depth comparison scored 0 RED against the rendered cases, because the wall is ` +
       `perpendicular to the view at constant distance and every pixel of every block sits at ONE depth. This case is why.`);
}

console.log("\n7. WHAT THE RUNNER REFUSES, ON THE DEVICE");
{
    const bad = Object.fromEntries(r.result.bad);
    for (const [label, pat] of [["block", /whole number of pixels/], ["grid", /does not cover the frame/],
                                ["margin", /margin must be in/], ["depth", /depth must be w\*h/],
                                ["motion", /motion must be w\*h\*4/]])
        ok(`a bad ${label} is refused by the runner, in the page, with the CPU's own wording`,
           bad[label] !== null && pat.test(bad[label] || ""), bad[label]);
}
}
}

// ---- THE SABOTAGE LOG ------------------------------------------------------------------------------------
//
// *** A CONTROL THAT CANNOT FAIL IS DECORATION, SO EVERY ROW ABOVE WAS BROKEN ON PURPOSE AND WATCHED. ***
// Nine mutations of the kernel, each reverted.
//
//   U1  the challenger wins ties instead of losing them (`<` -> `<=`)   -> 2 red (3)
//   U2  the margin is applied to the CHALLENGER's score                 -> 4 red (2, 4, 5)
//   U3  the kernel uses a second luma convention                        -> 1 red (1)
//   U4  the SAD samples the nearest texel instead of bilinearly         -> 5 red (2, 4, 5)
//   U5  the block scan ignores the `valid` channel                     -> 1 red (5)
//   U7  the application's vector is not negated into the output sense    -> 6 red (2, 3, 4, 5)
//   U8  the flow arm is scored in the wrong sense                       -> 5 red (2, 4, 5)
//   U6  the block takes its FARTHEST pixel instead of its nearest        -> 1 red (6), AFTER A CASE WAS ADDED
//   U9  an unanswerable block reports zero instead of NaN               -> 1 red (5), same
//
// *** U6 SCORED 0 RED AND THE REASON IS THE RIG, NOT THE KERNEL. *** The wall is perpendicular to the view at
// constant distance, so every pixel of every block sits at ONE depth and "nearest" and "farthest" pick the same
// pixel. The nearest-valid-pixel rule -- one of the three things this file's header names as what a mirror most
// easily drops -- was therefore untested on the device by all six rendered cases. Section 6 builds a silhouette
// by hand, which is what render/flowReconcile-selfcheck.mjs's own section 6 does and for the same reason, and
// U6 then reddens. A parity gate whose content cannot exercise a rule is a parity gate that does not cover it.
//
// *** AND WGSL REFUSED TO LET THE KERNEL SPELL A NaN, WHICH TOOK A COMPILE-ERROR READ TO FIND. ***
// bitcast<f32>(0x7fc00000u) is const-folded and rejected -- "value nan cannot be represented as 'f32'" -- and
// 0.0/0.0 goes the same way. gfx/device.js surfaced this only as "Invalid ComputePipeline", so the shader
// module's own getCompilationInfo had to be read directly. The NaN now arrives through the uniform, which is
// also the better construction: it is the CPU's own NaN handed over, not one the kernel manufactured with an
// arithmetic trick a future compiler may fold.
//
// One sabotage (U9) also failed to APPLY before it failed to fire, because a shell layer mangled an apostrophe
// in the line it was matching. A script reporting 0 red without checking its edit landed is measuring nothing --
// the same trap v4684's log records, two rounds running.

console.log(`\nflowReconcileGPU-selfcheck: ${fails ? `${fails} FAILED` : "ALL GREEN"}`);
console.log("unchecked here: THE COLOUR FLOW, which is an INPUT and is computed on the CPU on purpose -- " +
    "render/opticalFlowGPU.mjs already mirrors the search, and chaining the two would leave a parity row unable " +
    "to tell a reconciliation defect from a search one, which is why v4674 built its pyramids on the CPU for the " +
    "same reason. THE REST OF THE CHAIN: render/frameInterp.mjs and render/holeFill.mjs are still CPU, so a " +
    "generated frame still costs a readback and fsr.html still pays it. NO TIMING CLAIM: this container's " +
    "adapter is SwiftShader, a software rasteriser, so nothing here says the device is faster -- v4561 recorded " +
    "what that costs a round that goes looking for a ratio. AND THE PACKED OUTPUT IS A LIMIT: eight floats per " +
    "block because WebGPU allows eight storage bindings, with `source` riding as an f32 the runner converts -- " +
    "if a future pass needs a ninth input, the packing has to change before the pass does.");
process.exit(fails ? 1 : 0);
