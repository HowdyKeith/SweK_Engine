#!/usr/bin/env node
// WebGLEngine/tools/ship/deviceComputeDiag.mjs -- v4814
//
// Run: node tools/ship/deviceComputeDiag.mjs [--runs 3] [--all]
//
// A DIAGNOSTIC, NOT A GATE: it asserts nothing and always exits 0. It exists to answer one question the rig
// raised at v4813 that deviceCompute-selfcheck cannot: WHICH of two WebGPU paths is wrong, and how.
//
// deviceCompute-selfcheck holds the browser's WebGPU (Chromium's Dawn, launched with PARITY_ARGS) to node-webgpu
// (headless Dawn) byte for byte, and on the sandbox both are SwiftShader and agree. On Keith's rig both reach the
// GPU over D3D12 -- the same-adapter row passed -- and three kernels disagreed (rig clone verify of 228ff99e):
//
//   holeFillWgsl.FILL_WGSL           312/320, first differs at 4, max 1.0
//   splitSumWgsl.BRDF_LUT_WGSL       229/512, max 1.788e-7
//   fresnelF82Wgsl.F82_TINT_WGSL     22/33,   max 1.192e-7
//
// The corpus's holeFill field is 8x8 with a hole wherever i % 9 == 0 -- EIGHT holes -- and eight values differ,
// the first at index 4, which is pixel 0's hole flag (FILL_STRIDE 5: vecX vecY zbuf side hole). So on one path
// every filled hole keeps flag 1.0 while its vector, depth and side agree: the shape of the kernel's SECOND store
// to out[o+4] (0.0, "filled") being lost after its first (f32(holeIn[p]) = 1.0). That is a hypothesis, and this
// file is built to confirm or kill it rather than assume it:
//
//   1. every entry runs --runs times on EACH path, so a path that disagrees with itself is seen as such;
//   2. holeFill is also graded against render/holeFill.mjs's fillHolesCPU on the same inputs, so "which path is
//      wrong" is answered by a third, independent party rather than by majority;
//   3. a VARIANT of FILL_WGSL runs on both paths. Until v4814 it was the one-store form, and the rig showed it
//      identical on both where the original was not; v4814 shipped that form, so the variant is now the OLD
//      two-store form, kept as the standing evidence (see twoStore below);
//   4. the two 1-ulp kernels get a ulp-distance histogram, which separates "rounding differs" from a real
//      difference without guessing a tolerance.
//
// It prints both adapters, the browser's user agent and the node-webgpu module it resolved, because "the same
// GPU reached two ways" is two Dawn builds, and the version pair is half of any answer.
"use strict";

import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInEngineOrigin, webgpuSkipReason, PARITY_ARGS } from "./webgpuHarness.mjs";
import { runWgslComputeNative, headlessGpuSkipReason, storageWords } from "./headlessGpu.mjs";
import { corpus } from "./wgslCorpus.mjs";
import { FILL_STRIDE } from "../../render/holeFillWgsl.mjs";
import { fillHolesCPU } from "../../render/holeFill.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const argv = process.argv.slice(2);
const RUNS = Math.max(1, Number(argv[argv.indexOf("--runs") + 1]) || 3);
const ALL = argv.includes("--all");
const TARGETS = ["holeFillWgsl.FILL_WGSL", "splitSumWgsl.BRDF_LUT_WGSL", "fresnelF82Wgsl.F82_TINT_WGSL"];
const say = (s = "") => console.log(s);

// ---- the v4813 two-store form, kept as the variant -----------------------------------------------------------
// RIG RESULT (2026-10-05, GTX 1080 / D3D12, HeadlessChrome 153 against node-webgpu): both paths repeat themselves
// exactly; Chromium matches fillHolesCPU and node-webgpu does not, on the eight filled holes' flags only; and the
// ONE-STORE form was identical on both paths and matched the CPU. v4814 shipped the one-store form in
// render/holeFillWgsl.mjs, so the variant here is now the OLD two-store form, rebuilt from the new one -- run on a
// box that drops the second store, it should still disagree, which is the evidence the repair stands on.
function twoStore(code) {
    const steps = [
        ["  if (holeIn[p] == 0u) { out[o+4u] = 0.0; return; }", "  out[o+4u] = f32(holeIn[p]);\n  if (holeIn[p] == 0u) { return; }"],
        ["  if (bj < 0) { out[o+4u] = f32(holeIn[p]); return; }", "  if (bj < 0) { return; }"],
    ];
    let c = code;
    for (const [a, b] of steps) {
        if (c.split(a).length !== 2) throw new Error(`twoStore: expected exactly one ${JSON.stringify(a.trim())} in FILL_WGSL`);
        c = c.replace(a, b);
    }
    return c;
}

const f32bits = (x) => { const b = new DataView(new ArrayBuffer(4)); b.setFloat32(0, x); return b.getUint32(0); };
const hex = (x) => "0x" + f32bits(x).toString(16).padStart(8, "0");
// ulp distance between two float32 values; null when either is not finite
function ulps(a, b) {
    if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
    const ord = (x) => { const u = f32bits(x); return u & 0x80000000 ? -(u & 0x7fffffff) : u; };
    return Math.abs(ord(a) - ord(b));
}
const same = (a, b) => a === b || (Number.isNaN(a) && Number.isNaN(b));

function compare(a, b) {
    const diffs = [];
    const n = Math.max(a.length, b.length);
    for (let i = 0; i < n; i++) if (!same(a[i], b[i])) diffs.push(i);
    return diffs;
}

function pack(e, codeOverride = null) {
    return { id: e.id, code: codeOverride || e.opts.code, entryPoint: e.opts.entryPoint || "main", outCount: e.opts.outCount,
             workgroups: e.opts.workgroups || 1, uniforms: e.opts.uniforms ? Array.from(e.opts.uniforms) : null,
             inputs: e.opts.inputs ? e.opts.inputs.map((i) => ({ binding: i.binding, words: Array.from(storageWords(i.data)) })) : null,
             outInit: e.opts.outInit ? Array.from(storageWords(e.opts.outInit)) : null,
             outBinding: e.opts.outBinding ?? 0, uniformBinding: e.opts.uniformBinding ?? 1 };
}

// ---- the CPU's answer for the corpus's holeFill entry ---------------------------------------------------------
// The uniform block is P { w, h, radius, nearerIsLess, preferFarther, sideMode, pad, pad2, t, ... } and the inputs
// are bound 0 vec, 1 hole, 2 zbuf, 3 depthPrev, 4 depthCur -- read off the entry, not retyped.
function holeFillCPU(e) {
    // the corpus hands uniforms as a plain array of floats whose BITS carry the u32 fields (wgslCorpus's packU)
    const f = Float32Array.from(e.opts.uniforms), u = new Uint32Array(f.buffer, 0, 8), t = f[8];
    const by = (b) => e.opts.inputs.find((i) => i.binding === b).data;
    const sideName = { 1: "blend", 2: "prev", 3: "cur", 4: "depth" }[u[5]] || "derived";
    const w = u[0], h = u[1];
    const r = fillHolesCPU({ vec: by(0), hole: by(1), zbuf: by(2), w, h, radius: u[2] | 0,
                             prefer: u[4] === 1 ? "farther" : "nearer", side: sideName, nearerIsLess: u[3] === 1,
                             depthPrev: by(3), depthCur: by(4), t });
    const out = new Float32Array(w * h * FILL_STRIDE);
    for (let p = 0; p < w * h; p++) {
        out[p * 5] = r.vec[p * 2]; out[p * 5 + 1] = r.vec[p * 2 + 1]; out[p * 5 + 2] = r.zbuf[p];
        out[p * 5 + 3] = r.side[p]; out[p * 5 + 4] = r.hole[p];
    }
    return { values: Array.from(out), w, h, hole: by(1) };
}

say("deviceComputeDiag -- which of two WebGPU paths is wrong, and how. A diagnostic: it asserts nothing.");
say(`runs per path: ${RUNS}; node ${process.version} ${process.platform}`);
const bSkip = webgpuSkipReason(), nSkip = headlessGpuSkipReason();
if (bSkip || nSkip) { say(`SKIP  browser: ${bSkip || "ok"} | native: ${nSkip || "ok"} -- nothing to compare on this box`); process.exit(0); }

const all = corpus().filter((e) => !e.compileOnly && !e.texture);
const picked = ALL ? all : all.filter((e) => TARGETS.includes(e.id));
const fill = all.find((e) => e.id === "holeFillWgsl.FILL_WGSL");
const variant = fill ? { ...fill, id: "holeFillWgsl.FILL_WGSL [v4813 two-store form]", opts: { ...fill.opts, code: twoStore(fill.opts.code) } } : null;
const jobs = [...picked, ...(variant ? [variant] : [])];

// ---- the browser path: one page, every job RUNS times ---------------------------------------------------------
const r = await runInEngineOrigin({ launchArgs: PARITY_ARGS, engineRoot: ENG, args: { entries: jobs.map((e) => pack(e)), runs: RUNS }, script: `async (a) => {
    const C = await import("/render/computeRun.mjs"); const { requestDevice } = await import("/gfx/device.js");
    const cv = document.createElement("canvas"); cv.width = 8; cv.height = 8;
    const dev = await requestDevice(cv, { backend: "webgpu", offscreen: true });
    if (dev.backend !== "webgpu") return { noWebgpu: dev.backend };
    const out = { ua: navigator.userAgent, entries: {} };
    for (const e of a.entries) {
        out.entries[e.id] = [];
        for (let k = 0; k < a.runs; k++) {
            const opts = { code: e.code, entryPoint: e.entryPoint, outCount: e.outCount, workgroups: e.workgroups, uniforms: e.uniforms ? new Float32Array(e.uniforms) : null,
                           inputs: e.inputs ? e.inputs.map((i) => ({ binding: i.binding, data: new Uint32Array(i.words) })) : null, outInit: e.outInit ? new Uint32Array(e.outInit) : null,
                           outBinding: e.outBinding, uniformBinding: e.uniformBinding };
            const res = await C.runCorpusEntry(dev, opts);
            out.entries[e.id].push(res.ok ? { ok: true, values: Array.from(res.values) } : { ok: false, reason: res.reason });
        }
    }
    dev.destroy(); return out;
}`, timeoutMs: 300000 });
if (!r.ok || !r.result || r.result.noWebgpu) { say(`browser path did not run: ${r.ok ? "no webgpu: " + (r.result && r.result.noWebgpu) : r.reason}`); process.exit(0); }

// ---- the native path ------------------------------------------------------------------------------------------
const native = {};
let nAdapter = null, nFrom = null;
for (const e of jobs) {
    native[e.id] = [];
    for (let k = 0; k < RUNS; k++) {
        const n = await runWgslComputeNative(e.opts);
        if (n.adapter) nAdapter = n.adapter;
        if (n.from) nFrom = n.from;
        native[e.id].push(n.ok ? { ok: true, values: Array.from(n.values) } : { ok: false, reason: n.reason });
    }
}

const name = (a) => a ? [a.vendor, a.architecture, a.description].filter(Boolean).join(" / ") || "(unnamed)" : "(unread)";
say("");
say(`browser adapter : ${name(r.adapter)}`);
say(`browser UA      : ${r.result.ua}`);
say(`native adapter  : ${name(nAdapter)}`);
say(`native module   : ${nFrom || "(unread)"}`);

// ---- per job --------------------------------------------------------------------------------------------------
const cpu = fill ? holeFillCPU(fill) : null;
for (const e of jobs) {
    const B = r.result.entries[e.id] || [], N = native[e.id] || [];
    say("");
    say(`== ${e.id}  (${e.opts.outCount} values)`);
    const bad = [...B, ...N].find((x) => !x.ok);
    if (bad) { say(`   did not run: ${bad.reason}`); continue; }
    const selfB = B.slice(1).map((x) => compare(B[0].values, x.values).length);
    const selfN = N.slice(1).map((x) => compare(N[0].values, x.values).length);
    say(`   determinism  browser: ${selfB.every((d) => d === 0) ? "identical across " + B.length + " runs" : "DIFFERS between runs: " + selfB.join(", ") + " values"}` +
        `   native: ${selfN.every((d) => d === 0) ? "identical across " + N.length + " runs" : "DIFFERS between runs: " + selfN.join(", ") + " values"}`);
    const b = B[0].values, n = N[0].values;
    const d = compare(b, n);
    say(`   browser vs native: ${d.length === 0 ? "IDENTICAL" : d.length + " of " + n.length + " differ"}`);
    const isFill = e.id.startsWith("holeFillWgsl.FILL_WGSL");
    if (isFill && cpu) {
        const dB = compare(cpu.values, b), dN = compare(cpu.values, n);
        say(`   against fillHolesCPU: browser ${dB.length === 0 ? "MATCHES" : dB.length + " differ"}, native ${dN.length === 0 ? "MATCHES" : dN.length + " differ"}`);
        const slot = ["vecX", "vecY", "zbuf", "side", "hole"];
        for (const i of d.slice(0, 16)) {
            const p = Math.floor(i / FILL_STRIDE), s = i % FILL_STRIDE, x = p % cpu.w, y = Math.floor(p / cpu.w);
            say(`     [${i}] pixel ${p} (${x},${y}) ${slot[s]}: browser ${b[i]} (${hex(b[i])})  native ${n[i]} (${hex(n[i])})  cpu ${cpu.values[i]}` +
                `  holeIn ${cpu.hole[p]}  pixel row b=[${b.slice(p * 5, p * 5 + 5).join(", ")}] n=[${n.slice(p * 5, p * 5 + 5).join(", ")}]`);
        }
        if (d.length > 16) say(`     ... and ${d.length - 16} more`);
    } else if (d.length) {
        const hist = new Map();
        for (const i of d) { const u = ulps(b[i], n[i]); const k = u === null ? "non-finite" : u <= 4 ? String(u) : u <= 64 ? "5-64" : ">64"; hist.set(k, (hist.get(k) || 0) + 1); }
        say(`   ulp distance of the differing values: ${[...hist].map(([k, v]) => `${k} ulp x${v}`).join(", ")}`);
        for (const i of d.slice(0, 8)) say(`     [${i}] browser ${b[i]} (${hex(b[i])})  native ${n[i]} (${hex(n[i])})  ${ulps(b[i], n[i])} ulp`);
        if (d.length > 8) say(`     ... and ${d.length - 8} more`);
    }
}

say("");
say("READING IT: a path that DIFFERS between its own runs is a race or uninitialised read, not a compiler; a path that");
say("disagrees with fillHolesCPU on holeFill is the wrong one. Since v4814 the shipped kernel writes the flag once; the");
say("v4813 two-store form beside it should still disagree on a box whose compiler drops the second store.");
process.exit(0);
