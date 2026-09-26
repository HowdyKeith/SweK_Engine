#!/usr/bin/env node
// WebGLEngine/render/flowReconcileTsl-selfcheck.mjs -- v4741
//
// WHICH MOTION TO BELIEVE, AS TSL, HELD TO ITS MIRROR: render/flowReconcileTsl.mjs's makeFlowReconcile against
// render/flowReconcile.mjs's reconcileFlowCPU -- the source of every block and the vector it chose exactly, the three
// scores to f32 -- and its per-pixel field against reconciledPixelFieldCPU exactly, on both of three's backends. The cases
// are render/flowReconcileGPU-selfcheck.mjs's, on render/flowReconcile-selfcheck.mjs's wall: the camera moving (the
// application exactly right), the texture sliding (the application exactly zero and wrong), both, flat grey at margin 0 (the
// strict rule), three margins, a hand-built silhouette under both depth conventions (the nearest-pixel rule), and a block
// with no valid vector beside one with a single valid pixel.
//
// The luma is the device's: render/opticalFlowTsl.mjs's makeLumaPyramid, which v4740 graded, at one level. The colour flow
// is opticalFlowCPU's, uploaded, so a red row here is the reconciliation's and not the search's.
"use strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInEngineOrigin, webgpuSkipReason } from "../tools/ship/webgpuHarness.mjs";
import { reconcileFlowCPU, reconciledPixelFieldCPU, reconcilePixelsCPU, SRC_APP, SRC_FLOW_BEAT, SRC_FLOW_ONLY } from "./flowReconcile.mjs";
import { opticalFlowCPU } from "./opticalFlow.mjs";
import { motionVectorsCPU, mat4Invert, transform4 } from "./motionVectors.mjs";
import { viewProj } from "./rasterProbe.js";
import * as RT from "./flowReconcileTsl.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const say = (s) => console.log(`  ----  ${s}`);

console.log("\n1. WITHOUT A DEVICE: the refusals, and the per-pixel rule on the CPU");
{
    const full = new Proxy({}, { get: () => () => {} });
    const refuse = (f) => { try { f(); return "no throw"; } catch (e) { return String(e.message); } };
    const a = refuse(() => RT.makeFlowReconcile({}, full, { w: 64, h: 64, block: 8.5 })), b = refuse(() => RT.makeFlowReconcile({}, full, { w: 64, h: 64, margin: 1 }));
    ok("makeFlowReconcile refuses a fractional block and a margin outside [0, 1), as reconcileFlowCPU does", /block must be a whole number/.test(a) && /margin must be in \[0, 1\)/.test(b), `${a} | ${b}`);
}

// ---- render/flowReconcileGPU-selfcheck.mjs's rig: render/flowReconcile-selfcheck.mjs's wall ----
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
function build({ dex = 0, slide = 0, margin = 0.05, flat = false, killValid = null, nearerIsLess = true } = {}) {
    let prev, cur;
    if (flat) {
        const g = new Float32Array(W * H * 4);
        for (let i = 0; i < W * H; i++) { g[i * 4] = 0.4; g[i * 4 + 1] = 0.4; g[i * 4 + 2] = 0.4; g[i * 4 + 3] = 1; }
        prev = { rgba: g, depth: new Float32Array(W * H).fill(0.5) }; cur = { rgba: g, depth: new Float32Array(W * H).fill(0.5) };
    } else { prev = render(0, 0); cur = render(dex, slide); }
    const mv = flat ? (() => { const m = new Float32Array(W * H * 4); for (let i = 0; i < W * H; i++) { m[i * 4] = -2 / W; m[i * 4 + 2] = 1; } return { data: m }; })()
                    : motionVectorsCPU(cur.depth, W, H, mat4Invert(VP(dex)), VP(0));
    if (killValid) for (const j of killValid) mv.data[j * 4 + 2] = 0;
    const of = opticalFlowCPU({ cur: cur.rgba, prev: prev.rgba, w: W, h: H, block: B, searchRadius: 4, levels: flat ? 1 : 2 });
    return { cur: cur.rgba, prev: prev.rgba, w: W, h: H, flow: of.flow, conf: of.conf, bw: of.bw, bh: of.bh, block: B, motion: mv.data, depth: cur.depth, margin, nearerIsLess };
}
// *** A SILHOUETTE BY HAND, because the wall sits at one depth and cannot reach the nearest-pixel rule (v4685 found a
// farthest-pixel sabotage scoring 0 against the rendered cases). Every block straddles a near half moving 1 px and a far
// half moving 6; the two images are one random field, so the colour saw nothing move and the flow and the SADs are a
// function of which half's vector the block took.
function silhouette(nearerIsLess) {
    let sd = 3; const rnd = () => (sd = (sd * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    const img = new Float32Array(W * H * 4);
    for (let i = 0; i < W * H; i++) { const c = rnd(); img[i * 4] = c; img[i * 4 + 1] = c; img[i * 4 + 2] = c; img[i * 4 + 3] = 1; }
    const of = opticalFlowCPU({ cur: img, prev: img, w: W, h: H, block: B, searchRadius: 4, levels: 1 });
    const motion = new Float32Array(W * H * 4), depth = new Float32Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = y * W + x, near = (x % B) < B / 2;
        motion[i * 4] = (near ? -1 : -6) / W; motion[i * 4 + 2] = 1; depth[i] = near ? 0.2 : 0.9; }
    return { cur: img, prev: img, w: W, h: H, flow: of.flow, conf: of.conf, bw: of.bw, bh: of.bh, block: B, motion, depth, margin: 0.05, nearerIsLess };
}
// the application right, and its field varied from pixel to pixel by a hundredth of a pixel: the blocks stay the
// application's and their pixels no longer share one vector, which the per-pixel field has to keep
function jittered() {
    const c = build({ dex: 0.437 }); let sd = 11; const rnd = () => (sd = (sd * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    c.motion = Float32Array.from(c.motion); for (let i = 0; i < W * H; i++) { c.motion[i * 4] += Math.fround((rnd() - 0.5) * 0.02 / W); c.motion[i * 4 + 1] += Math.fround((rnd() - 0.5) * 0.02 / H); }
    return c;
}
const CASES = {
    geometry: build({ dex: 0.437 }), shader: build({ slide: 0.437 }), both: build({ dex: 0.3, slide: 0.6 }),
    flat: build({ flat: true, margin: 0 }), marginZero: build({ dex: 0.437, margin: 0 }), marginWide: build({ dex: 0.437, margin: 0.2 }),
    nearer: silhouette(true), farther: silhouette(false), jittered: jittered(),
    invalid: build({ dex: 0.437, killValid: (() => { const k = []; for (let y = 0; y < B; y++) for (let x = 0; x < 2 * B; x++) k.push(y * W + x); return k.filter((j) => j !== 3 * W + B + 4); })() }),
};
const cpu = {}, cpuField = {};
for (const [k, c] of Object.entries(CASES)) { cpu[k] = reconcileFlowCPU(c); cpuField[k] = reconciledPixelFieldCPU({ rc: cpu[k], motion: c.motion, depth: c.depth, w: W, h: H }); }
// the per-pixel rule's cases: the same scenes, its own margins and windows -- the default 0.9, the block rule's 0.05 (where
// the flow takes the most), a 5 x 5 window, a single pixel, and margin 0 on flat grey
const PIX = {
    geometry: { ...CASES.geometry, margin: 0.9, radius: 1 }, shader: { ...CASES.shader, margin: 0.9, radius: 1 },
    shaderLow: { ...CASES.shader, margin: 0.05, radius: 1 }, bothLow: { ...CASES.both, margin: 0.05, radius: 2 },
    jitteredLow: { ...CASES.jittered, margin: 0.05, radius: 0 }, flat: { ...CASES.flat, margin: 0, radius: 1 },
    invalid: { ...CASES.invalid, margin: 0.05, radius: 1 },
};
const cpuPix = {};
for (const [k, c] of Object.entries(PIX)) cpuPix[k] = reconcilePixelsCPU(c);

{
    // the per-pixel rule on the CPU, on a decision laid out by hand: the three sources in turn, every pixel its own vector
    // and depth, one in five invalid
    let sd = 5; const rnd = () => (sd = (sd * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    const bw = W / B, bh = H / B, rc = { bw, bh, block: B, source: new Int32Array(bw * bh), flow: new Float32Array(bw * bh * 2) };
    for (let b = 0; b < bw * bh; b++) { rc.source[b] = [SRC_APP, SRC_FLOW_BEAT, SRC_FLOW_ONLY][b % 3]; rc.flow[b * 2] = Math.fround(rnd() * 8 - 4); rc.flow[b * 2 + 1] = Math.fround(rnd() * 8 - 4); }
    const motion = new Float32Array(W * H * 4), depth = new Float32Array(W * H);
    for (let i = 0; i < W * H; i++) { motion[i * 4] = Math.fround((rnd() - 0.5) / 8); motion[i * 4 + 1] = Math.fround((rnd() - 0.5) / 8); motion[i * 4 + 2] = rnd() < 0.2 ? 0 : 1; depth[i] = Math.fround(rnd()); }
    const f = reconciledPixelFieldCPU({ rc, motion, depth, w: W, h: H });
    let own = 0, ownN = 0, blk = 0, blkN = 0, dep = 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = y * W + x, b = Math.floor(y / B) * bw + Math.floor(x / B);
        if (f[i * 4 + 2] === depth[i]) dep++;
        if (rc.source[b] === SRC_APP) { ownN++; if (f[i * 4] === Math.fround(-motion[i * 4] * W) && f[i * 4 + 1] === Math.fround(-motion[i * 4 + 1] * H) && f[i * 4 + 3] === motion[i * 4 + 2]) own++; }
        else { blkN++; if (f[i * 4] === rc.flow[b * 2] && f[i * 4 + 1] === rc.flow[b * 2 + 1] && f[i * 4 + 3] === 1) blk++; } }
    ok(`reconciledPixelFieldCPU: where the application kept the block every pixel carries ITS OWN vector and validity (${own} of ${ownN}), where the flow took it the block's flow, valid (${blk} of ${blkN}), and every pixel its own depth (${dep} of ${W * H})`,
       own === ownN && blk === blkN && dep === W * H && ownN > 0 && blkN > 0,
       "the decision is the block's and the vector is the pixel's: reducing a three.js scene's exact per-pixel field to blocks would cost every silhouette");
}

const skip = webgpuSkipReason();
if (skip) { console.log(`  SKIP  ${skip}`); console.log("  ----  *** NOT A PASS. *** Section 1 is static."); fails++; }
else {
    const payload = {};
    for (const [k, c] of Object.entries(CASES)) {
        const fl = []; for (let i = 0; i < c.bw * c.bh; i++) fl.push(c.flow[i * 2], c.flow[i * 2 + 1], c.conf[i], 1);
        const d4 = []; for (let i = 0; i < W * H; i++) d4.push(c.depth[i], 0, 0, 1);
        payload[k] = { cur: Array.from(c.cur), prev: Array.from(c.prev), flow: fl, bw: c.bw, bh: c.bh, motion: Array.from(c.motion), depth: d4, margin: c.margin, nearerIsLess: c.nearerIsLess };
    }
    const payloadPix = {};
    for (const [k, c] of Object.entries(PIX)) {
        const base = Object.keys(CASES).find((q) => CASES[q].cur === c.cur && CASES[q].motion === c.motion);
        payloadPix[k] = { of: base, margin: c.margin, radius: c.radius };
    }
    const r = await runInEngineOrigin({ engineRoot: ENG, timeoutMs: 300000, args: { W, H, B, payload, payloadPix }, script: `async (a) => {
        const THREE = await import("/vendor/three-webgpu/three.webgpu.js"); const T = await import("/vendor/three-webgpu/three.tsl.js");
        const OF = await import("/render/opticalFlowTsl.mjs"); const RT = await import("/render/flowReconcileTsl.mjs");
        const out = {};
        for (const mode of ["webgpu", "webgl2"]) {
            try {
                const canvas = document.createElement("canvas"); canvas.width = 8; canvas.height = 8;
                const renderer = new THREE.WebGPURenderer({ canvas, forceWebGL: mode === "webgl2", antialias: false }); await renderer.init();
                const tex = (arr, w, h) => { const t = new THREE.DataTexture(new Float32Array(arr), w, h, THREE.RGBAFormat, THREE.FloatType); t.needsUpdate = true; return t; };
                // tight rows, top first: WebGPU pads a row to 256 bytes, WebGL2 reads bottom first
                const read = async (rt, w, h) => { const px = await renderer.readRenderTargetPixelsAsync(rt, 0, 0, w, h), s = mode === "webgpu" ? Math.ceil(w / 16) * 16 : w, o = [];
                    for (let y = 0; y < h; y++) { const row = mode === "webgpu" ? y : h - 1 - y; for (let x = 0; x < w * 4; x++) o.push(px[row * s * 4 + x]); } return o; };
                const pc = OF.makeLumaPyramid(THREE, T, { w: a.W, h: a.H, levels: 1 }), pp = OF.makeLumaPyramid(THREE, T, { w: a.W, h: a.H, levels: 1 });
                const recs = new Map(), o = {};
                for (const [k, p] of Object.entries(a.payload)) {
                    const key = p.margin + "|" + p.nearerIsLess;
                    if (!recs.has(key)) recs.set(key, RT.makeFlowReconcile(THREE, T, { w: a.W, h: a.H, block: a.B, margin: p.margin, mode: "block", nearerIsLess: p.nearerIsLess, audit: true }));
                    const R = recs.get(key), cur = tex(p.cur, a.W, a.H), prev = tex(p.prev, a.W, a.H), flow = tex(p.flow, p.bw, p.bh), motion = tex(p.motion, a.W, a.H), depth = tex(p.depth, a.W, a.H);
                    await pc.build(renderer, cur); await pp.build(renderer, prev);
                    await R.reconcile(renderer, { lumaCur: pc.targets[0].texture, lumaPrev: pp.targets[0].texture, flow, motion, depth });
                    o[k] = { decision: await read(R.targets.decision, R.bw, R.bh), app: await read(R.targets.app, R.bw, R.bh), sad: await read(R.targets.sad, R.bw, R.bh),
                             field: await read(R.targets.field, a.W, a.H) };
                    for (const t of [cur, prev, flow, motion, depth]) t.dispose();
                }
                o.pix = {};
                for (const [k, q] of Object.entries(a.payloadPix)) {
                    const p = a.payload[q.of], key = "pix|" + q.margin + "|" + q.radius;
                    if (!recs.has(key)) recs.set(key, RT.makeFlowReconcile(THREE, T, { w: a.W, h: a.H, block: a.B, margin: q.margin, mode: "pixel", radius: q.radius, audit: true }));
                    const R = recs.get(key), cur = tex(p.cur, a.W, a.H), prev = tex(p.prev, a.W, a.H), flow = tex(p.flow, p.bw, p.bh), motion = tex(p.motion, a.W, a.H), depth = tex(p.depth, a.W, a.H);
                    await pc.build(renderer, cur); await pp.build(renderer, prev);
                    await R.reconcile(renderer, { lumaCur: pc.targets[0].texture, lumaPrev: pp.targets[0].texture, flow, motion, depth });
                    o.pix[k] = { field: await read(R.targets.field, a.W, a.H), pixel: await read(R.targets.pixel, a.W, a.H) };
                    for (const t of [cur, prev, flow, motion, depth]) t.dispose();
                }
                for (const R of recs.values()) R.dispose(); pc.dispose(); pp.dispose();
                out[mode] = o; renderer.dispose();
            } catch (err) { out[mode] = { err: String(err && err.stack || err).slice(0, 700) }; }
        }
        return out;
    }` });
    ok("the harness ran every case on BOTH backends", r.ok && r.result && !r.result.webgpu.err && !r.result.webgl2.err,
       r.ok ? `webgpu ${r.result.webgpu.err || "ok"}; webgl2 ${r.result.webgl2.err || "ok"}` : (r.reason || (r.pageErrors || []).join("; ")));

    console.log("\n2. ON THE DEVICE: every block's decision, and every pixel's vector");
    if (r.ok && r.result) for (const mode of ["webgpu", "webgl2"]) {
        const o = r.result[mode]; if (!o || o.err) continue;
        let srcD = 0, vecD = 0, appD = 0, foundD = 0, sadW = 0, fieldD = 0, blocks = 0;
        const census = { [SRC_APP]: 0, [SRC_FLOW_BEAT]: 0, [SRC_FLOW_ONLY]: 0 }, per = [];
        for (const [k, c] of Object.entries(CASES)) {
            const x = cpu[k], d = o[k]; let cs = 0;
            if (!d) continue;
            for (let i = 0; i < x.bw * x.bh; i++) {
                blocks++; census[x.source[i]]++;
                if (d.decision[i * 4 + 2] !== x.source[i]) { srcD++; cs++; }
                if (d.decision[i * 4] !== x.flow[i * 2] || d.decision[i * 4 + 1] !== x.flow[i * 2 + 1]) vecD++;
                const found = !Number.isNaN(x.appFlow[i * 2]);
                if ((d.app[i * 4 + 2] === 1) !== found) foundD++;
                else if (found && (d.app[i * 4] !== x.appFlow[i * 2] || d.app[i * 4 + 1] !== x.appFlow[i * 2 + 1])) appD++;
                if (found) sadW = Math.max(sadW, Math.abs(d.sad[i * 4] - x.sadApp[i]));
                sadW = Math.max(sadW, Math.abs(d.sad[i * 4 + 1] - x.sadFlow[i]), Math.abs(d.sad[i * 4 + 2] - x.sadStill[i]));
            }
            const f = cpuField[k]; for (let i = 0; i < W * H * 4; i++) if (d.field[i] !== f[i]) fieldD++;
            per.push(`${k} ${x.counts.app}/${x.counts.flowBeat}/${x.counts.flowOnly}${cs ? ` (${cs} differ)` : ""}`);
        }
        say(`[${mode}] kept / beaten / flow alone, by case: ${per.join("; ")}`);
        ok(`*** [${mode}] the SAME SOURCE as reconcileFlowCPU at every one of ${blocks} blocks, and the same vector exactly -- ${census[SRC_APP]} kept, ${census[SRC_FLOW_BEAT]} beaten, ${census[SRC_FLOW_ONLY]} the flow's alone ***`,
           srcD === 0 && vecD === 0 && census[SRC_APP] > 0 && census[SRC_FLOW_BEAT] > 0 && census[SRC_FLOW_ONLY] > 0,
           `${srcD} sources and ${vecD} vectors differ. A source is one of three integers and the vector is a copy of one of two inputs, so neither gets a tolerance`);
        ok(`  [${mode}] ...the application's vector is its nearest VALID pixel's, exactly (${appD} differ, ${foundD} disagree on whether there was one), and the three scores agree to ${sadW.toExponential(2)}`,
           appD === 0 && foundD === 0 && sadW < 1e-3,
           "the bilinear SAD in the mirror's order, f32 against f64 through 64 samples of four taps -- and the sample position, the block's origin less a vector, rounds to f32 here and not in the mirror, a few 1e-6 of a pixel a tap; render/flowReconcileGPU-selfcheck.mjs holds the WGSL kernel to 2e-3");
        const own = (() => { const x = cpu.jittered, c = CASES.jittered; let n = 0;
            for (let y = 0; y < H; y++) for (let xx = 0; xx < W; xx++) { const i = y * W + xx, b = (y >> 3) * x.bw + (xx >> 3);
                if (x.source[b] === SRC_APP && Math.fround(-c.motion[i * 4] * W) !== x.flow[b * 2]) n++; } return n; })();
        ok(`  [${mode}] ...and the PER-PIXEL field is reconciledPixelFieldCPU's at every pixel of all ${Object.keys(CASES).length} cases -- ${fieldD} components differ, ${own} of them pixels whose own vector is not their block's`,
           fieldD === 0 && own > 3000, "the vector, the depth and the validity a frame generator splats");
        const src = (k) => o[k].decision.filter((_, i) => i % 4 === 2);
        ok(`  [${mode}] ...and the rules the census cannot show: flat grey at margin 0 is the application's at every block (${src("flat").filter((v) => v === SRC_APP).length} of 64); the margin moves the flow's share (${[["marginZero", 0], ["geometry", 0.05], ["marginWide", 0.2]].map(([k, m]) => `${m}: ${src(k).filter((v) => v === SRC_FLOW_BEAT).length}`).join(", ")}); the silhouette's two depth conventions pick different halves`,
           src("flat").every((v) => v === SRC_APP) && src("marginZero").filter((v) => v === SRC_FLOW_BEAT).length > src("marginWide").filter((v) => v === SRC_FLOW_BEAT).length
           && o.nearer.app.some((v, i) => i % 4 === 0 && v !== o.farther.app[i]),
           "every candidate ties on flat content and the strict rule keeps the application; the nearest pixel of a straddling block is the near half's, the farthest the far half's");
    }

    console.log("\n3. ON THE DEVICE: the decision per PIXEL, against reconcilePixelsCPU");
    if (r.ok && r.result) for (const mode of ["webgpu", "webgl2"]) {
        const o = r.result[mode]; if (!o || o.err || !o.pix) continue;
        let srcD = 0, fieldD = 0, sadW = 0, px = 0, edgeKept = 0;
        const census = { [SRC_APP]: 0, [SRC_FLOW_BEAT]: 0, [SRC_FLOW_ONLY]: 0 }, per = [];
        for (const [k, c] of Object.entries(PIX)) {
            const x = cpuPix[k], d = o.pix[k]; let cs = 0;
            for (let i = 0; i < W * H; i++) {
                px++; census[x.source[i]]++;
                if (d.pixel[i * 4] !== x.source[i]) { srcD++; cs++; }
                for (let q = 0; q < 4; q++) if (d.field[i * 4 + q] !== x.field[i * 4 + q]) fieldD++;
                if (!Number.isNaN(x.sadApp[i])) sadW = Math.max(sadW, Math.abs(d.pixel[i * 4 + 1] - x.sadApp[i]));
                sadW = Math.max(sadW, Math.abs(d.pixel[i * 4 + 2] - x.sadFlow[i]));
            }
            per.push(`${k} ${x.counts.app}/${x.counts.flowBeat}/${x.counts.flowOnly}${cs ? ` (${cs} differ)` : ""}`);
        }
        // the leading edge of the slide -- the texture moves RIGHT by 3.2 pixels, so new content enters on the LEFT: there the
        // window, carried back along the flow, leaves the frame, and the application keeps the pixel
        { const x = cpuPix.shaderLow; for (let y = 8; y < H - 8; y++) for (let xx = 0; xx < 4; xx++) if (x.source[y * W + xx] === SRC_APP) edgeKept++; }
        say(`[${mode}] kept / beaten / flow alone, by case: ${per.join("; ")}`);
        ok(`*** [${mode}] the SAME SOURCE as reconcilePixelsCPU at every one of ${px} pixels, and the same field exactly -- ${census[SRC_APP]} kept, ${census[SRC_FLOW_BEAT]} beaten, ${census[SRC_FLOW_ONLY]} the flow's alone ***`,
           srcD === 0 && fieldD === 0 && census[SRC_APP] > 0 && census[SRC_FLOW_BEAT] > 0 && census[SRC_FLOW_ONLY] > 0,
           `${srcD} sources and ${fieldD} field components differ; the scores agree to ${sadW.toExponential(2)}`);
        const beat = (k) => cpuPix[k].counts.flowBeat;
        ok(`  [${mode}] ...and the per-pixel rules reach their populations: the margin moves the flow's share on the sliding texture (${beat("shaderLow")} pixels at 0.05, ${beat("shader")} at 0.9), flat grey at margin 0 is the application's everywhere (${cpuPix.flat.counts.app} of ${W * H}), and the slide's leading edge keeps the application where the flow's evidence left the frame (${edgeKept} of ${4 * (H - 16)} pixels in its first four columns, against ${(() => { let n = 0; const x = cpuPix.shaderLow; for (let y = 8; y < H - 8; y++) for (let xx = 8; xx < 12; xx++) if (x.source[y * W + xx] === SRC_APP) n++; return n; })()} four columns in)`,
           beat("shaderLow") > beat("shader") && beat("shader") > 0 && cpuPix.flat.counts.app === W * H && edgeKept === 4 * (H - 16) && sadW < 1e-3,
           "the incumbent keeps a pixel on a tie and wherever the challenger's window was read off the frame");
    }
}

// ---- v4741 SABOTAGE LOG ----------------------------------------------------------------------------------------
// Against render/flowReconcileTsl.mjs:
//   R1  pixel: the in-frame rule removed               -> 2    R8  block: pixels past the frame counted       -> 0
//   R2  pixel: nearer-or-equal                         -> 2    R9  the chosen vector by mix() again           -> 6
//   R3  pixel: the application not negated             -> 4    R10 block field: an invalid pixel made valid   -> 2
//   R4  pixel: the window not centred on the pixel     -> 4    R11 the bilinear weights swapped               -> 10
//   R5  pixel: the block index rounded, not floored    -> 4    R12 block: standing still scored at the flow   -> 2
//   R6  block: the FARTHEST valid pixel                -> 4    R13 the pixel mode's default margin 0.05       -> 0 here, 5 in
//   R7  block: invalid pixels counted                  -> 6        fx/fsr/fsrFrameGenFlow-selfcheck.mjs, whose arms read it
// And against render/flowReconcile.mjs, here and in render/flowReconcile-selfcheck.mjs: C1 the per-pixel in-frame rule
// removed -> 4 here, 1 there; C2 its default margin 0.05 -> 0 here (every case names its margin), 1 there; C3 a pixel's
// validity taken from its vector in reconcilePixelsCPU's field -> 2 here, 0 there; C4 reconciledPixelFieldCPU giving a
// flow block's pixels their own vectors -> 3 here, 1 there.
// *** R8 IS AN EQUIVALENT MUTANT, AND NOT BECAUSE THE FRAME DIVIDES INTO BLOCKS. *** A pixel past the frame's edge reads,
// through the clamp, a copy of the edge pixel of its own block, which the y-outer, x-inner scan has always visited first;
// a copy is never STRICTLY nearer than its original, so it never takes the block. The bounds test is the mirror's and
// stays, as v4737's L9 did.
console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: what reconciling buys a generated frame, which fx/fsr/fsrFrameGenFlow-selfcheck.mjs measures against a frame " +
    "rendered at the midpoint; and widths that are not a power of two, where -du * w rounds once in f32 and once in f64 and the application's " +
    "vector is equal to f32 rather than exactly -- every case here is 64 wide.");
process.exitCode = fails ? 1 : 0;
