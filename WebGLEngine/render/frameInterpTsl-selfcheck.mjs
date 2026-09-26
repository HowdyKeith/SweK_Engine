#!/usr/bin/env node
// WebGLEngine/render/frameInterpTsl-selfcheck.mjs -- v4736
//
// FRAME GENERATION AS TSL, HELD TO ITS MIRROR: render/frameInterpTsl.mjs's makeFrameInterp against render/frameInterp.mjs's
// interpolateFrameCPU (fill off), on both of three's backends -- the hole mask exactly, the splatted field and the depth
// it was settled on exactly, the generated frame to f32. The cases are render/frameInterpGPU-selfcheck.mjs's, which found
// what each one is for: flat depth makes EVERY contested pixel a tie, signed depth spans zero, prev and cur indexing
// differ by the whole displacement, t = 0 and t = 1 are exact copies, a declined block leaves its footprint a hole, and a
// whole-pixel flow at t = 0.5 lands every block on a half pixel. Two are new: a frame the block grid does not divide
// (the last column and row of blocks are clipped to the frame), and a PER-PIXEL field with a vector and a depth of its
// own at every pixel -- block 1, what a three.js motion field is.
"use strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInEngineOrigin, webgpuSkipReason } from "../tools/ship/webgpuHarness.mjs";
import { interpolateFrameCPU, crossFadeCPU } from "./frameInterp.mjs";
import * as FI from "./frameInterpTsl.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const say = (s) => console.log(`  ----  ${s}`);

console.log("\n1. WITHOUT A DEVICE: the refusals");
{
    const full = new Proxy({}, { get: () => () => {} });
    const refuse = (f) => { try { f(); return "no throw"; } catch (e) { return String(e.message); } };
    const a = refuse(() => FI.makeFrameInterp({}, full, { w: 8, h: 8, block: 8 }));
    ok("makeFrameInterp refuses a field whose indexing is not stated, as interpolateFrameCPU does", /indexedBy must be "prev" or "cur"/.test(a), a);
    const b = refuse(() => FI.makeFrameInterp({}, full, { w: 8, h: 8, block: 2.5, indexedBy: "cur" }));
    ok("  ...a fractional block", /block must be a whole number/.test(b), b);
    const c = refuse(() => FI.makeFrameInterp({}, full, { w: 8, h: 8, block: 8, indexedBy: "cur", t: 1.5 }));
    ok("  ...and a time outside [0, 1]", /t must be in \[0, 1\]/.test(c), c);
}

// ---- the cases: smoothed noise and a shift of it, a block field, and a depth per block ----
let sd = 17;
const rnd = () => (sd = (sd * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
function pair(W, H, shiftX, shiftY) {
    const P = 16, base = new Float32Array((W + 2 * P) * (H + 2 * P));
    for (let i = 0; i < base.length; i++) base[i] = rnd();
    const sm = new Float32Array(base.length), SW = W + 2 * P;
    for (let y = 2; y < H + 2 * P - 2; y++) for (let x = 2; x < SW - 2; x++) {
        let a = 0; for (let j = -2; j <= 2; j++) for (let i = -2; i <= 2; i++) a += base[(y + j) * SW + x + i]; sm[y * SW + x] = a / 25; }
    const at = (fx, fy) => { const x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
        const g = (x, y) => sm[Math.min(H + 2 * P - 1, Math.max(0, y + P)) * SW + Math.min(SW - 1, Math.max(0, x + P))];
        return (g(x0, y0) * (1 - tx) + g(x0 + 1, y0) * tx) * (1 - ty) + (g(x0, y0 + 1) * (1 - tx) + g(x0 + 1, y0 + 1) * tx) * ty; };
    const mk = (ox, oy, tint) => { const o = new Float32Array(W * H * 4);
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const c = at(x + ox, y + oy), i = y * W + x;
            o[i * 4] = c; o[i * 4 + 1] = c * tint; o[i * 4 + 2] = 1 - c; o[i * 4 + 3] = 1; } return o; };
    return { prev: mk(0, 0, 0.8), cur: mk(shiftX, shiftY, 0.8) };
}
function mkCase({ W = 64, H = 64, block = 8, shiftX = 3.4, shiftY = -1.6, depthMode = "checker", indexedBy = "cur", t = 0.5,
                  vary = null, decline = null, nearerIsLess = true, perPixel = false } = {}) {
    const { prev, cur } = pair(W, H, shiftX, shiftY);
    const bw = Math.ceil(W / block), bh = Math.ceil(H / block), n = bw * bh;
    const flow = new Float32Array(n * 2), depthBlock = new Float32Array(n);
    for (let i = 0; i < n; i++) {
        flow[i * 2] = perPixel ? Math.fround(shiftX + 4 * (rnd() - 0.5)) : shiftX;
        flow[i * 2 + 1] = perPixel ? Math.fround(shiftY + 4 * (rnd() - 0.5)) : shiftY;
        depthBlock[i] = depthMode === "flat" ? 0.5
            : depthMode === "checker" ? (((i % bw) + Math.floor(i / bw)) % 2 ? 0.9 : 0.2)
            : depthMode === "random" ? Math.fround(0.1 + 0.8 * rnd())
            : Math.fround(-0.9 + 1.8 * ((i * 37) % 101) / 101);
    }
    if (vary) for (const [i, vx, vy] of vary) { flow[i * 2] = vx; flow[i * 2 + 1] = vy; }
    if (decline) for (const i of decline) { flow[i * 2] = NaN; flow[i * 2 + 1] = NaN; }
    return { prev, cur, w: W, h: H, flow, bw, bh, block, depthBlock, indexedBy, t, nearerIsLess };
}
const CONTEST = [[9, 8, 0], [10, -8, 0], [17, 0, 8], [25, 0, -8]];
const CASES = {
    flat: mkCase({ depthMode: "flat" }),
    checker: mkCase({}),
    signed: mkCase({ depthMode: "signed" }),
    prevIndexed: mkCase({ indexedBy: "prev" }),
    t0: mkCase({ t: 0 }),
    t1: mkCase({ t: 1 }),
    contested: mkCase({ vary: CONTEST }),
    // *** FLAT DEPTH WITH BLOCKS THAT COLLIDE, BECAUSE FLAT DEPTH ALONE HAS NO TIES. *** The first draft's row said the
    // flat case made "every contested pixel a tie"; under a uniform flow no two blocks overlap, so it had none, and a
    // splat that let the LAST writer keep a tie would have passed. Here four blocks are aimed into their neighbours at
    // one depth, so every overlap is a tie and the first writer must keep it.
    contestedFlat: mkCase({ vary: CONTEST, depthMode: "flat" }),
    contestedQuarter: mkCase({ vary: CONTEST, t: 0.25 }),
    fartherWins: mkCase({ vary: CONTEST, nearerIsLess: false }),
    declined: mkCase({ decline: [0, 10, 63] }),
    zeroMotion: mkCase({ shiftX: 0, shiftY: 0, depthMode: "flat" }),
    tieHalf: mkCase({ shiftX: 3, shiftY: -1 }),
    ragged: mkCase({ W: 80, H: 40, block: 12, shiftX: -2.6, shiftY: 1.3 }),
    perPixel: mkCase({ W: 32, H: 32, block: 1, perPixel: true, depthMode: "random", shiftX: 1.5, shiftY: -0.7 }),
};
const cpu = {};
for (const [k, c] of Object.entries(CASES)) cpu[k] = interpolateFrameCPU(c);

// ---- v4744: THE ARC -- each block's displacement from its cur position to time t, given rather than taken as (1 - t) of
// the vector. "chord" gives exactly that, so the frame must be the chord's; "curve" bends it by up to 1.5 pixels a block,
// across the vector, as a turning body's path does; a declined displacement leaves its block a hole; and one goes through
// the fill, whose two passes must choose alike.
function arcOf(c, kind, decline = []) {
    const n = c.bw * c.bh, toT = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) {
        const fx = c.flow[i * 2], fy = c.flow[i * 2 + 1], cx = Math.fround(-(1 - c.t) * fx), cy = Math.fround(-(1 - c.t) * fy);
        const bend = kind === "curve" ? Math.fround(1.5 * Math.sin(i * 1.7)) : 0, len = Math.hypot(fx, fy) || 1;
        toT[i * 2] = Math.fround(cx - bend * fy / len); toT[i * 2 + 1] = Math.fround(cy + bend * fx / len);
    }
    for (const i of decline) { toT[i * 2] = NaN; toT[i * 2 + 1] = NaN; }
    return { ...c, toT };
}
const ARC = {
    arcChord: arcOf(CASES.checker, "chord"), arcCurve: arcOf(CASES.checker, "curve"), arcContested: arcOf(CASES.contested, "curve"),
    arcPerPixel: arcOf(CASES.perPixel, "curve"), arcDeclined: arcOf(CASES.checker, "curve", [3, 20, 41]),
    arcFilled: { ...arcOf(CASES.contested, "curve"), fill: { radius: 4, side: "blend" } },
};
const cpuArc = {};
for (const [k, c] of Object.entries(ARC)) cpuArc[k] = interpolateFrameCPU(c);
{
    // on the CPU: a displacement that IS the chord's reproduces the chord's frame, and a curved one does not
    const ch = cpuArc.arcChord.frame, base = cpu.checker.frame, cv = cpuArc.arcCurve.frame; let wc = 0, wv = 0;
    for (let i = 0; i < ch.length; i++) { wc = Math.max(wc, Math.abs(ch[i] - base[i])); wv = Math.max(wv, Math.abs(cv[i] - base[i])); }
    const refuse = (f) => { try { f(); return "no throw"; } catch (e) { return String(e.message); } };
    const r1 = refuse(() => interpolateFrameCPU({ ...ARC.arcChord, indexedBy: "prev" })), r2 = refuse(() => interpolateFrameCPU({ ...ARC.arcChord, fill: { side: "derived" } }));
    ok(`interpolateFrameCPU's arc: the chord's own displacement reproduces the chord's frame (worst ${wc.toExponential(2)}), a bent one moves it (${wv.toFixed(3)}); a prev-indexed field and a fill that is not "blend" are refused`,
       wc < 1e-6 && wv > 0.05 && /indexedBy "cur"/.test(r1) && /side must be "blend"/.test(r2), `${r1.slice(0, 50)} | ${r2.slice(0, 50)}`);
}
// how many of contestedFlat's pixels more than one block lands on -- the tie population, counted from the case
const TIES = (() => { const c = CASES.contestedFlat, hits = new Uint8Array(c.w * c.h);
    for (let by = 0; by < c.bh; by++) for (let bx = 0; bx < c.bw; bx++) { const i = by * c.bw + bx;
        const sx = Math.round(bx * c.block - (1 - c.t) * c.flow[i * 2]), sy = Math.round(by * c.block - (1 - c.t) * c.flow[i * 2 + 1]);
        for (let y = 0; y < c.block; y++) for (let x = 0; x < c.block; x++) { const px = sx + x, py = sy + y;
            if (px >= 0 && px < c.w && py >= 0 && py < c.h) hits[py * c.w + px]++; } }
    let n = 0; for (const v of hits) if (v > 1) n++; return n; })();

console.log("\n2. ON THE DEVICE: every case, the splat and the warp, on both backends");
const skip = webgpuSkipReason();
if (skip) { console.log(`  SKIP  ${skip}`); console.log("  ----  *** NOT A PASS. *** Section 1 is static."); fails++; }
else {
    const payload = {};
    for (const [k, c] of Object.entries(CASES)) {
        const field = new Array(c.bw * c.bh * 4);
        for (let i = 0; i < c.bw * c.bh; i++) { const ok = Number.isFinite(c.flow[i * 2]) && Number.isFinite(c.flow[i * 2 + 1]);
            field[i * 4] = ok ? c.flow[i * 2] : 0; field[i * 4 + 1] = ok ? c.flow[i * 2 + 1] : 0; field[i * 4 + 2] = c.depthBlock[i]; field[i * 4 + 3] = ok ? 1 : 0; }
        payload[k] = { w: c.w, h: c.h, block: c.block, bw: c.bw, bh: c.bh, indexedBy: c.indexedBy, t: c.t, nearerIsLess: c.nearerIsLess,
                       prev: Array.from(c.prev), cur: Array.from(c.cur), field };
    }
    const payloadArc = {};
    for (const [k, c] of Object.entries(ARC)) {
        const field = [], toT = [];
        for (let i = 0; i < c.bw * c.bh; i++) { const ok = Number.isFinite(c.flow[i * 2]); field.push(ok ? c.flow[i * 2] : 0, ok ? c.flow[i * 2 + 1] : 0, c.depthBlock[i], ok ? 1 : 0);
            const okT = Number.isFinite(c.toT[i * 2]); toT.push(okT ? c.toT[i * 2] : 0, okT ? c.toT[i * 2 + 1] : 0, 0, okT ? 1 : 0); }
        payloadArc[k] = { w: c.w, h: c.h, block: c.block, bw: c.bw, bh: c.bh, t: c.t, nearerIsLess: c.nearerIsLess, fill: c.fill || null,
                          prev: Array.from(c.prev), cur: Array.from(c.cur), field, toT };
    }
    const r = await runInEngineOrigin({ engineRoot: ENG, timeoutMs: 300000, args: { payload, payloadArc }, script: `async (a) => {
        const THREE = await import("/vendor/three-webgpu/three.webgpu.js"); const T = await import("/vendor/three-webgpu/three.tsl.js");
        const FI = await import("/render/frameInterpTsl.mjs");
        const out = {};
        for (const mode of ["webgpu", "webgl2"]) {
            try {
                const canvas = document.createElement("canvas"); canvas.width = 8; canvas.height = 8;
                const renderer = new THREE.WebGPURenderer({ canvas, forceWebGL: mode === "webgl2", antialias: false }); await renderer.init();
                const tex = (arr, w, h) => { const t = new THREE.DataTexture(new Float32Array(arr), w, h, THREE.RGBAFormat, THREE.FloatType); t.needsUpdate = true; return t; };
                const o = {};
                for (const [k, p] of Object.entries(a.payload)) {
                    const fi = FI.makeFrameInterp(THREE, T, { w: p.w, h: p.h, block: p.block, indexedBy: p.indexedBy, nearerIsLess: p.nearerIsLess, t: p.t });
                    const prev = tex(p.prev, p.w, p.h), cur = tex(p.cur, p.w, p.h), field = tex(p.field, p.bw, p.bh);
                    const outRT = new THREE.RenderTarget(p.w, p.h, { type: THREE.FloatType, depthBuffer: false });
                    await fi.splat(renderer, field); await fi.gather(renderer, prev, cur, outRT);
                    o[k] = { vec: Array.from(await renderer.readRenderTargetPixelsAsync(fi.targets.vec, 0, 0, p.w, p.h)),
                             frame: Array.from(await renderer.readRenderTargetPixelsAsync(outRT, 0, 0, p.w, p.h)) };
                    if (k === "checker") { const cf = FI.crossFadeNode(T, prev, cur, { t: p.t }); const m = new THREE.NodeMaterial(); m.fragmentNode = cf.node; m.blending = THREE.NoBlending;
                        const sc = new THREE.Scene(); sc.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), m)); renderer.setRenderTarget(outRT);
                        await renderer.renderAsync(sc, new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)); renderer.setRenderTarget(null);
                        o.crossFade = Array.from(await renderer.readRenderTargetPixelsAsync(outRT, 0, 0, p.w, p.h)); }
                    fi.dispose(); prev.dispose(); cur.dispose(); field.dispose(); outRT.dispose();
                }
                o.arc = {};
                for (const [k, p] of Object.entries(a.payloadArc)) {
                    const fi = FI.makeFrameInterp(THREE, T, { w: p.w, h: p.h, block: p.block, indexedBy: "cur", nearerIsLess: p.nearerIsLess, t: p.t, fill: p.fill, arc: true });
                    const prev = tex(p.prev, p.w, p.h), cur = tex(p.cur, p.w, p.h), field = tex(p.field, p.bw, p.bh), toT = tex(p.toT, p.bw, p.bh);
                    const outRT = new THREE.RenderTarget(p.w, p.h, { type: THREE.FloatType, depthBuffer: false });
                    await fi.splat(renderer, field, toT); await fi.gather(renderer, prev, cur, outRT);
                    const rd = async (rt) => Array.from(await renderer.readRenderTargetPixelsAsync(rt, 0, 0, p.w, p.h));
                    o.arc[k] = { cur: await rd(p.fill ? fi.targets.filled : fi.targets.vec), prev: await rd(p.fill ? fi.targets.filledPrev : fi.targets.vecPrev), frame: await rd(outRT) };
                    fi.dispose(); for (const x of [prev, cur, field, toT, outRT]) x.dispose();
                }
                // flowFromMotionNode: a synthetic motion field (uvPrev - uvCurr) with its top rows INVALID, and a depth
                {
                    const W = 16, H = 16, mo = new Float32Array(W * H * 4), de = new Float32Array(W * H * 4);
                    for (let i = 0; i < W * H; i++) { mo[i * 4] = ((i * 7) % 13 - 6) / 97; mo[i * 4 + 1] = ((i * 5) % 11 - 5) / 89; mo[i * 4 + 2] = i < 2 * W ? 0 : 1; mo[i * 4 + 3] = 0.3;
                        de[i * 4] = ((i * 3) % 17) / 17; }
                    const mt = tex(Array.from(mo), W, H), dt = tex(Array.from(de), W, H), rt = new THREE.RenderTarget(W, H, { type: THREE.FloatType, depthBuffer: false });
                    const fm = FI.flowFromMotionNode(T, mt, dt, { w: W, h: H }); const m = new THREE.NodeMaterial(); m.fragmentNode = fm.node; m.blending = THREE.NoBlending;
                    const sc = new THREE.Scene(); sc.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), m)); renderer.setRenderTarget(rt);
                    await renderer.renderAsync(sc, new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)); renderer.setRenderTarget(null);
                    o.flowFromMotion = { W, H, mo: Array.from(mo), de: Array.from(de), got: Array.from(await renderer.readRenderTargetPixelsAsync(rt, 0, 0, W, H)) };
                }
                out[mode] = o; renderer.dispose();
            } catch (err) { out[mode] = { err: String(err && err.stack || err).slice(0, 700) }; }
        }
        return out;
    }` });
    ok("the harness ran every case on BOTH backends", r.ok && r.result && !r.result.webgpu.err && !r.result.webgl2.err,
       r.ok ? `webgpu ${r.result.webgpu.err || "ok"}; webgl2 ${r.result.webgl2.err || "ok"}` : (r.reason || (r.pageErrors || []).join("; ")));
    if (r.ok && r.result) for (const mode of ["webgpu", "webgl2"]) {
        const o = r.result[mode]; if (!o || o.err) continue;
        const up = (px, w, h) => { if (mode === "webgpu") return px; const f = []; for (let y = h - 1; y >= 0; y--) f.push(...px.slice(y * w * 4, (y + 1) * w * 4)); return f; };
        const cmp = (k) => {
            const c = cpu[k], C = CASES[k], w = C.w, h = C.h, v = up(o[k].vec, w, h), f = up(o[k].frame, w, h);
            let holeDiff = 0, vecDiff = 0, zDiff = 0, frameW = 0;
            for (let i = 0; i < w * h; i++) {
                const hole = v[i * 4 + 3] < 0.5 ? 1 : 0;
                if (hole !== c.hole[i]) { holeDiff++; continue; }
                if (!hole) { if (v[i * 4] !== c.vec[i * 2] || v[i * 4 + 1] !== c.vec[i * 2 + 1]) vecDiff++; if (v[i * 4 + 2] !== c.zbuf[i]) zDiff++; }
                for (let q = 0; q < 4; q++) frameW = Math.max(frameW, Math.abs(f[i * 4 + q] - c.frame[i * 4 + q]));
            }
            return { holeDiff, vecDiff, zDiff, frameW, holes: c.holes };
        };
        const rows = Object.keys(CASES).map((k) => [k, cmp(k)]);
        for (const [k, x] of rows) say(`[${mode}] ${k.padEnd(16)} CPU ${String(x.holes).padStart(4)} holes; mask differs ${x.holeDiff}, vector ${x.vecDiff}, depth ${x.zDiff}; worst |frame| ${x.frameW.toExponential(2)}`);
        ok(`*** [${mode}] the SPLAT is interpolateFrameCPU's on every pixel of all ${rows.length} cases -- the hole mask, the vector and the depth it was settled on, exactly ***`,
           rows.every(([, x]) => x.holeDiff === 0 && x.vecDiff === 0 && x.zDiff === 0),
           "a depth-tested draw of one quad per block, strict less, in index order: the nearer block wins and a tie keeps the first writer, as the CPU's `d < zbuf[j]` does");
        ok(`*** [${mode}] and the GENERATED FRAME is its warp to f32 -- worst ${Math.max(...rows.map(([, x]) => x.frameW)).toExponential(2)} -- ZERO in every hole ***`,
           rows.every(([, x]) => x.frameW < 2e-6), "prev fetched back along the vector and cur forward, bilinear in fetch4's order, blended at t");
        const contested = rows.find(([k]) => k === "contested")[1], checker = rows.find(([k]) => k === "checker")[1];
        const pp = rows.find(([k]) => k === "perPixel")[1];
        ok(`  [${mode}] ...and the cases carry what they are for: ${TIES} pixels in contestedFlat are claimed by two blocks at one depth -- TIES, which the first writer keeps -- the contested blocks change the mask (${contested.holes} holes against ${checker.holes}), the per-pixel field leaves ${pp.holes}`,
           TIES > 0 && contested.holes !== checker.holes && pp.holes > 0 && cpu.t1.holes === 0 && cpu.t0.holes > 0,
           "t = 1 on a cur-indexed field is a copy with no hole; t = 0 is not");
        const cf = up(o.crossFade, 64, 64), ref = crossFadeCPU(CASES.checker); let cw = 0; for (let i = 0; i < cf.length; i++) cw = Math.max(cw, Math.abs(cf[i] - ref[i]));
        ok(`  [${mode}] the CONTROL ARM is crossFadeCPU's, worst ${cw.toExponential(2)}`, cw < 1e-6, "the cross-fade every generated frame has to beat");
        {
            // v4744, the arc: both offsets at every landed pixel exactly, and the frame to f32
            const rowsA = Object.entries(ARC).map(([k, c]) => {
                const x = cpuArc[k], d = o.arc[k], va = up(d.cur, c.w, c.h), vb = up(d.prev, c.w, c.h), f = up(d.frame, c.w, c.h);
                let holeD = 0, aD = 0, bD = 0, fw = 0;
                for (let i = 0; i < c.w * c.h; i++) {
                    const hole = va[i * 4 + 3] < 0.5 ? 1 : 0; if (hole !== x.hole[i]) { holeD++; continue; }
                    if (!hole) { if (va[i * 4] !== x.vec[i * 2] || va[i * 4 + 1] !== x.vec[i * 2 + 1]) aD++; if (vb[i * 4] !== x.vecPrev[i * 2] || vb[i * 4 + 1] !== x.vecPrev[i * 2 + 1]) bD++; }
                    for (let q2 = 0; q2 < 4; q2++) fw = Math.max(fw, Math.abs(f[i * 4 + q2] - x.frame[i * 4 + q2]));
                }
                return [k, { holeD, aD, bD, fw, holes: x.holes, filled: x.filled }];
            });
            for (const [k, x] of rowsA) say(`[${mode}] ${k.padEnd(13)} CPU ${String(x.holes).padStart(4)} holes${x.filled ? `, ${x.filled} filled` : ""}; mask differs ${x.holeD}, cur offset ${x.aD}, prev offset ${x.bD}; worst |frame| ${x.fw.toExponential(2)}`);
            ok(`*** [${mode}] the ARC is interpolateFrameCPU({ toT })'s on every pixel of all ${rowsA.length} cases -- the mask and BOTH offsets exactly, through the fill too, the frame to f32 ***`,
               rowsA.every(([, x]) => x.holeD === 0 && x.aD === 0 && x.bD === 0 && x.fw < 2e-6) && cpuArc.arcDeclined.holes > cpuArc.arcCurve.holes && cpuArc.arcFilled.filled > 0,
               "a second splat of the same blocks at the same depths settles the same winners, and the same fill over it chooses the same neighbours -- the blend's choice is the depth's");
        }
        { const q = o.flowFromMotion, g = up(q.got, q.W, q.H); let wv = 0, bad = 0, invalid = 0;
          for (let i = 0; i < q.W * q.H; i++) { const vx = Math.fround(-q.mo[i * 4] * q.W), vy = Math.fround(-q.mo[i * 4 + 1] * q.H), valid = q.mo[i * 4 + 2] === 0 ? 0 : 1;
              if (!valid) invalid++;
              wv = Math.max(wv, Math.abs(g[i * 4] - vx), Math.abs(g[i * 4 + 1] - vy)); if (g[i * 4 + 2] !== Math.fround(q.de[i * 4]) || g[i * 4 + 3] !== valid) bad++; }
          ok(`  [${mode}] flowFromMotionNode is the FORWARD displacement in pixels, -(du w, dv h), the depth carried and ${invalid} invalid pixels declined -- worst ${wv.toExponential(2)}, ${bad} depth or validity differences`,
             wv < 1e-6 && bad === 0 && invalid > 0, "render/temporalTsl.mjs's motion is uvPrev - uvCurr in uv; the splat wants prev -> cur in pixels, which is its negative scaled"); }
    }
}

// ---- v4736 SABOTAGE LOG ----------------------------------------------------------------------------------------
// Against render/frameInterpTsl.mjs:
//   F1  a tie goes to the LAST writer (LessEqual)      -> 4    F8  a hole blended instead of left at zero       -> 2
//   F2  the landing floored without the half            -> 4    F9  the blend weights swapped                    -> 2
//   F3  the landing by TSL round(), ties to even        -> 2    F10 cur sampled backwards, not forwards          -> 2
//   F4  a cur-indexed field advanced as prev-indexed    -> 4    F11 the fetch not clamped at the frame edge      -> 2
//   F5  the tail of an edge block not clipped           -> 2    F12 flowFromMotion keeps the motion's sign       -> 2
//   F6  a declined block splatted anyway                -> 4    F13 flowFromMotion declines nothing              -> 2
//   F7  the depth key ignores nearerIsLess              -> 4    F14 the depth written is the key, not the depth  -> 2
// *** THE FLAT CASE'S CLAIM WAS WRONG, AND SO WAS THE FIRST GUESS AT WHAT THAT COST. *** The first draft's row said flat
// depth made every contested pixel a tie; under its uniform flow no block overlaps another, so it had none. contestedFlat
// was added to give the tie rule a counted population (128 pixels). F1 was then checked against the FIRST fixture, on the
// expectation that it would have scored 0 red there -- and it did not: the checker-depth `contested` case already aims
// two same-parity blocks into each other, and the splat row reddened on it. So the defect was the ROW'S WORDS, not a
// blind spot; the row now counts its ties instead of asserting them.
// F3 is 2 and not 4 because TSL's round() and floor(x + 0.5) part only on tieHalf -- the case v4734 added to the WGSL
// kernel's gate for the same reason.
// v4744, the arc: A5-A11 in fx/fsr/fsrFrameGenArc-selfcheck.mjs's log redden the arc row here, two or three each.
console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: the FILL (render/holeFill.mjs), which interpolateFrameCPU runs between the two when asked and this module does not " +
    "yet carry; depths closer than the key's ~6e-8, which become ties; and a field on a real three.js scene, which the driver's gate draws.");
process.exitCode = fails ? 1 : 0;
