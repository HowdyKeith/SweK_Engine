#!/usr/bin/env node
// WebGLEngine/render/holeFillTsl-selfcheck.mjs -- v4737
//
// THE FILL AS TSL, HELD TO ITS MIRROR: render/holeFillTsl.mjs's fillHolesNodes against render/holeFill.mjs's fillHolesCPU on
// both of three's backends -- the side code, the vector, the depth and the mask exactly, and the abstentions counted.
// Section 2 feeds the fill a field directly, with render/holeFillGPU-selfcheck.mjs's fixtures: a strip of holes between a
// background and an occluder that pulled away from it, in every side mode, both preferences, both depth conventions, a
// radius that does not reach, the depth mode's half-pixel tie (v4734) and the occluder that wraps the hole (v4678, the
// scan-order tie-break). Section 3 runs the whole of render/frameInterpTsl.mjs's makeFrameInterp with the fill on --
// splat, fill, warp -- against interpolateFrameCPU({ fill }).
"use strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInEngineOrigin, webgpuSkipReason } from "../tools/ship/webgpuHarness.mjs";
import { fillHolesCPU, SIDE_BLEND, SIDE_PREV, SIDE_CUR } from "./holeFill.mjs";
import { interpolateFrameCPU } from "./frameInterp.mjs";
import * as HF from "./holeFillTsl.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const say = (s) => console.log(`  ----  ${s}`);

console.log("\n1. WITHOUT A DEVICE: the refusals");
{
    const full = new Proxy({}, { get: () => () => {} });
    const refuse = (f) => { try { f(); return "no throw"; } catch (e) { return String(e.message); } };
    const a = refuse(() => HF.fillHolesNodes(full, null, { w: 8, h: 8, radius: HF.MAX_FILL_RADIUS + 1 }));
    ok(`fillHolesNodes refuses a radius past its bound (above ${HF.MAX_FILL_RADIUS})`, /radius must be a whole number of pixels from 1/.test(a), a);
    const b = refuse(() => HF.fillHolesNodes(full, null, { w: 8, h: 8, side: "depth" }));
    ok("  ...the depth side mode without the two depths, as fillHolesCPU refuses it", /side "depth" needs depthPrev and depthCur/.test(b), b);
    const c = refuse(() => HF.fillHolesNodes(full, null, { w: 8, h: 8, prefer: "closer" })), d = refuse(() => HF.fillHolesNodes(full, null, { w: 8, h: 8, side: "left" }));
    ok(`  ...and a preference or a side mode it does not have -- the five are ${HF.FILL_SIDES.join(", ")}`, /prefer must be/.test(c) && /side must be one of/.test(d), `${c} | ${d}`);
}

// ---- section 2's fixtures: render/holeFillGPU-selfcheck.mjs's strip, and the wrapped occluder ----
const W = 48, H = 48;
function mkCase({ radius = 4, prefer = "farther", side = "derived", nearerIsLess = true, stripW = 4, occVec = 6, bgVec = 0,
                  unreachable = false, prevStart = null, curStart = null } = {}) {
    const vec = new Float32Array(W * H * 2).fill(NaN), hole = new Uint8Array(W * H), zbuf = new Float32Array(W * H);
    const depthPrev = new Float32Array(W * H).fill(0.9), depthCur = new Float32Array(W * H).fill(0.9);
    const x0 = 20, x1 = x0 + stripW;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const i = y * W + x;
        if (x >= (prevStart === null ? x0 - 2 : prevStart) && x < x1) depthPrev[i] = 0.2;
        if (curStart !== null && x >= curStart && x < x1 + 2) depthCur[i] = 0.25;
        if (x >= x0 && x < x1) { hole[i] = 1; zbuf[i] = nearerIsLess ? Infinity : -Infinity; continue; }
        const occ = x >= x1;
        vec[i * 2] = occ ? occVec : bgVec; vec[i * 2 + 1] = 0; zbuf[i] = occ ? 0.2 : 0.9;
    }
    if (unreachable) for (let y = 0; y < H; y++) for (let x = 4; x < 44; x++) {
        const i = y * W + x; hole[i] = 1; zbuf[i] = nearerIsLess ? Infinity : -Infinity; vec[i * 2] = NaN; vec[i * 2 + 1] = NaN; }
    return { vec, hole, zbuf, w: W, h: H, radius, prefer, side, nearerIsLess, depthPrev, depthCur, t: 0.5 };
}
const CASES = {
    derived: mkCase({ side: "derived" }), depth: mkCase({ side: "depth" }), blend: mkCase({ side: "blend" }),
    prevSide: mkCase({ side: "prev" }), curSide: mkCase({ side: "cur" }), nearer: mkCase({ prefer: "nearer" }),
    radius2: mkCase({ radius: 2, stripW: 7 }), reversed: mkCase({ nearerIsLess: false }), unreachable: mkCase({ unreachable: true, radius: 3 }),
    depthTie: mkCase({ side: "depth", bgVec: 5, prevStart: 19, curStart: 20 }),
    // v4678's nine-by-nine wrapped occluder, set in a 16 x 16 frame so its rows read back unpadded on WebGPU; the radius-4
    // window about the hole at (4, 4) is the same 9 x 9 it was
    wrapped: (() => {
        const n = 16, N = n * n, vec = new Float32Array(N * 2), hole = new Uint8Array(N), zbuf = new Float32Array(N).fill(0.9);
        for (let i = 0; i < N; i++) vec[i * 2] = 1;
        hole[4 * n + 4] = 1; zbuf[4 * n + 4] = Infinity; vec[(4 * n + 4) * 2] = NaN; vec[(4 * n + 4) * 2 + 1] = NaN;
        for (const [x, y] of [[0, 0], [5, 4]]) zbuf[y * n + x] = 0.2;
        return { vec, hole, zbuf, w: n, h: n, radius: 4, prefer: "farther", side: "derived", nearerIsLess: true,
                 depthPrev: new Float32Array(N).fill(0.9), depthCur: new Float32Array(N).fill(0.9), t: 0.5 };
    })(),
};
const cpu = {};
for (const [k, c] of Object.entries(CASES)) cpu[k] = fillHolesCPU(c);

// ---- section 3's fixtures: whole interpolations, with the fill on ----
let sd = 23;
const rnd = () => (sd = (sd * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
function frames(Wf, Hf, sx, sy) {
    const img = (ox, oy) => { const o = new Float32Array(Wf * Hf * 4);
        for (let y = 0; y < Hf; y++) for (let x = 0; x < Wf; x++) { const X = x + ox, Y = y + oy, i = y * Wf + x;
            const c = 0.5 + 0.3 * Math.sin(X * 0.41 + Y * 0.13) + 0.15 * Math.sin(X * 0.11 - Y * 0.37);
            o[i * 4] = c; o[i * 4 + 1] = 0.6 * c + 0.2; o[i * 4 + 2] = 1 - c; o[i * 4 + 3] = 1; } return o; };
    return { prev: img(0, 0), cur: img(sx, sy) };
}
function mkInterp({ Wf = 64, Hf = 64, block = 8, fill, perPixel = false, t = 0.5 }) {
    const { prev, cur } = frames(Wf, Hf, 3.4, -1.6);
    const bw = Math.ceil(Wf / block), bh = Math.ceil(Hf / block), n = bw * bh;
    const flow = new Float32Array(n * 2), depthBlock = new Float32Array(n);
    for (let i = 0; i < n; i++) {
        // a foreground square moving right over a still background, so the splat opens a disocclusion behind it
        const bx = i % bw, by = Math.floor(i / bw), fg = perPixel ? (bx >= 10 && bx < 20 && by >= 8 && by < 22) : (bx >= 2 && bx < 5 && by >= 2 && by < 6);
        flow[i * 2] = fg ? (perPixel ? 5 : 11) : Math.fround(0.3 * (rnd() - 0.5)); flow[i * 2 + 1] = fg ? 1 : 0;
        // the per-pixel case's background sits at EXACTLY the depth its frames record, so the depth side mode compares like
        // with like; a random background depth against a fixed record made it abstain on every hole in the first draft
        depthBlock[i] = fg ? 0.2 : perPixel ? 0.85 : Math.fround(0.8 + 0.1 * rnd());
    }
    const dp = new Float32Array(Wf * Hf).fill(0.85), dc = new Float32Array(Wf * Hf).fill(0.85);
    for (let y = 0; y < Hf; y++) for (let x = 0; x < Wf; x++) { const bx = Math.floor(x / block), by = Math.floor(y / block);
        if (perPixel ? (x >= 10 && x < 20 && y >= 8 && y < 22) : (bx >= 2 && bx < 5 && by >= 2 && by < 6)) dc[y * Wf + x] = 0.2;
        if (perPixel ? (x >= 5 && x < 15 && y >= 7 && y < 21) : (x >= 5 && x < 29 && y >= 15 && y < 47)) dp[y * Wf + x] = 0.2; }
    return { prev, cur, w: Wf, h: Hf, flow, bw, bh, block, depthBlock, indexedBy: "cur", t, nearerIsLess: true,
             fill: { ...fill, depthPrev: fill.side === "depth" ? dp : null, depthCur: fill.side === "depth" ? dc : null } };
}
const INTERP = {
    derivedBlock8: mkInterp({ fill: { radius: 4, side: "derived" } }),
    depthPerPixel: mkInterp({ Wf: 32, Hf: 32, block: 1, perPixel: true, fill: { radius: 3, side: "depth" } }),
    nearerQuarter: mkInterp({ fill: { radius: 4, side: "derived", prefer: "nearer" }, t: 0.25 }),
};
const cpuI = {};
for (const [k, c] of Object.entries(INTERP)) cpuI[k] = interpolateFrameCPU(c);

const skip = webgpuSkipReason();
if (skip) { console.log(`  SKIP  ${skip}`); console.log("  ----  *** NOT A PASS. *** Section 1 is static."); fails++; }
else {
    const payload = {}, payloadI = {};
    for (const [k, c] of Object.entries(CASES)) {
        const splat = new Array(c.w * c.h * 4);
        for (let i = 0; i < c.w * c.h; i++) { const land = c.hole[i] ? 0 : 1;
            splat[i * 4] = land ? c.vec[i * 2] : 0; splat[i * 4 + 1] = land ? c.vec[i * 2 + 1] : 0; splat[i * 4 + 2] = land ? c.zbuf[i] : 0; splat[i * 4 + 3] = land; }
        const d4 = (d) => { const o = new Array(c.w * c.h * 4).fill(0); for (let i = 0; i < c.w * c.h; i++) o[i * 4] = d[i]; return o; };
        payload[k] = { w: c.w, h: c.h, radius: c.radius, prefer: c.prefer, side: c.side, nearerIsLess: c.nearerIsLess, t: c.t, splat, dp: d4(c.depthPrev), dc: d4(c.depthCur) };
    }
    for (const [k, c] of Object.entries(INTERP)) {
        const field = [];
        for (let i = 0; i < c.bw * c.bh; i++) field.push(c.flow[i * 2], c.flow[i * 2 + 1], c.depthBlock[i], 1);
        const d4 = (d) => { if (!d) return null; const o = new Array(c.w * c.h * 4).fill(0); for (let i = 0; i < c.w * c.h; i++) o[i * 4] = d[i]; return o; };
        payloadI[k] = { w: c.w, h: c.h, block: c.block, bw: c.bw, bh: c.bh, t: c.t, prev: Array.from(c.prev), cur: Array.from(c.cur), field,
                        fill: { radius: c.fill.radius, side: c.fill.side, prefer: c.fill.prefer || "farther" }, dp: d4(c.fill.depthPrev), dc: d4(c.fill.depthCur) };
    }
    const r = await runInEngineOrigin({ engineRoot: ENG, timeoutMs: 300000, args: { payload, payloadI }, script: `async (a) => {
        const THREE = await import("/vendor/three-webgpu/three.webgpu.js"); const T = await import("/vendor/three-webgpu/three.tsl.js");
        const HF = await import("/render/holeFillTsl.mjs"); const FI = await import("/render/frameInterpTsl.mjs");
        const out = {};
        for (const mode of ["webgpu", "webgl2"]) {
            try {
                const canvas = document.createElement("canvas"); canvas.width = 8; canvas.height = 8;
                const renderer = new THREE.WebGPURenderer({ canvas, forceWebGL: mode === "webgl2", antialias: false }); await renderer.init();
                const tex = (arr, w, h) => { const t = new THREE.DataTexture(new Float32Array(arr), w, h, THREE.RGBAFormat, THREE.FloatType); t.needsUpdate = true; return t; };
                const ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
                const draw = async (node, rt) => { const m = new THREE.NodeMaterial(); m.fragmentNode = node; m.blending = THREE.NoBlending;
                    const sc = new THREE.Scene(); sc.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), m)); renderer.setRenderTarget(rt); await renderer.renderAsync(sc, ortho); renderer.setRenderTarget(null); m.dispose(); };
                const o = { fill: {}, interp: {} };
                for (const [k, p] of Object.entries(a.payload)) {
                    const sp = tex(p.splat, p.w, p.h), dp = tex(p.dp, p.w, p.h), dc = tex(p.dc, p.w, p.h);
                    const n = HF.fillHolesNodes(T, sp, { w: p.w, h: p.h, radius: p.radius, prefer: p.prefer, side: p.side, nearerIsLess: p.nearerIsLess, t: p.t, depthPrev: dp, depthCur: dc });
                    const rt = new THREE.RenderTarget(p.w, p.h, { type: THREE.FloatType, depthBuffer: false });
                    await draw(n.fieldNode, rt); const field = Array.from(await renderer.readRenderTargetPixelsAsync(rt, 0, 0, p.w, p.h));
                    await draw(n.sideNode, rt); const side = Array.from(await renderer.readRenderTargetPixelsAsync(rt, 0, 0, p.w, p.h));
                    o.fill[k] = { field, side }; rt.dispose(); sp.dispose(); dp.dispose(); dc.dispose();
                }
                for (const [k, p] of Object.entries(a.payloadI)) {
                    const dp = p.dp ? tex(p.dp, p.w, p.h) : null, dc = p.dc ? tex(p.dc, p.w, p.h) : null;
                    const fi = FI.makeFrameInterp(THREE, T, { w: p.w, h: p.h, block: p.block, indexedBy: "cur", t: p.t, fill: { ...p.fill, depthPrev: dp, depthCur: dc } });
                    const prev = tex(p.prev, p.w, p.h), cur = tex(p.cur, p.w, p.h), field = tex(p.field, p.bw, p.bh);
                    const rt = new THREE.RenderTarget(p.w, p.h, { type: THREE.FloatType, depthBuffer: false });
                    await fi.splat(renderer, field); await fi.gather(renderer, prev, cur, rt);
                    o.interp[k] = { frame: Array.from(await renderer.readRenderTargetPixelsAsync(rt, 0, 0, p.w, p.h)),
                                    filled: Array.from(await renderer.readRenderTargetPixelsAsync(fi.targets.filled, 0, 0, p.w, p.h)),
                                    side: Array.from(await renderer.readRenderTargetPixelsAsync(fi.targets.side, 0, 0, p.w, p.h)) };
                    fi.dispose(); rt.dispose(); prev.dispose(); cur.dispose(); field.dispose(); if (dp) { dp.dispose(); dc.dispose(); }
                }
                out[mode] = o; renderer.dispose();
            } catch (err) { out[mode] = { err: String(err && err.stack || err).slice(0, 700) }; }
        }
        return out;
    }` });
    console.log("\n2. ON THE DEVICE: the fill alone, on every fixture, on both backends");
    ok("the harness ran every fixture on BOTH backends", r.ok && r.result && !r.result.webgpu.err && !r.result.webgl2.err,
       r.ok ? `webgpu ${r.result.webgpu.err || "ok"}; webgl2 ${r.result.webgl2.err || "ok"}` : (r.reason || (r.pageErrors || []).join("; ")));
    if (r.ok && r.result) for (const mode of ["webgpu", "webgl2"]) {
        const o = r.result[mode]; if (!o || o.err) continue;
        const up = (px, w, h) => { if (mode === "webgpu") return px; const f = []; for (let y = h - 1; y >= 0; y--) f.push(...px.slice(y * w * 4, (y + 1) * w * 4)); return f; };
        const rows = [];
        for (const [k, c] of Object.entries(CASES)) {
            const x = cpu[k], f = up(o.fill[k].field, c.w, c.h), s = up(o.fill[k].side, c.w, c.h);
            let sideD = 0, holeD = 0, vecD = 0, zD = 0, abst = 0, filled = 0;
            for (let i = 0; i < c.w * c.h; i++) {
                const hole = f[i * 4 + 3] < 0.5 ? 1 : 0; if (hole !== x.hole[i]) { holeD++; continue; }
                if (s[i * 4] !== x.side[i]) sideD++;
                if (!hole && (f[i * 4] !== x.vec[i * 2] || f[i * 4 + 1] !== x.vec[i * 2 + 1])) vecD++;
                if (!hole && f[i * 4 + 2] !== x.zbuf[i]) zD++;
                abst += s[i * 4 + 1]; filled += s[i * 4 + 2];
            }
            rows.push([k, { sideD, holeD, vecD, zD, abst, filled, x }]);
            say(`[${mode}] ${k.padEnd(11)} filled ${String(filled).padStart(4)}/${x.filled}, abstained ${abst}/${x.abstained}; side differs ${sideD}, hole ${holeD}, vector ${vecD}, depth ${zD}`);
        }
        ok(`*** [${mode}] the FILL is fillHolesCPU's on every pixel of all ${rows.length} fixtures -- the side code, the mask, the vector and the depth, exactly ***`,
           rows.every(([, v]) => v.sideD === 0 && v.holeD === 0 && v.vecD === 0 && v.zD === 0),
           "the neighbourhood searched in the mirror's order with the mirror's strict comparisons, so both of its tie rules -- the chosen vector's and the occluder's -- keep the first found");
        ok(`  [${mode}] ...and it COUNTS what the mirror counts: every fixture's filled pixels and abstentions agree`,
           rows.every(([, v]) => v.filled === v.x.filled && v.abst === v.x.abstained), rows.map(([k, v]) => `${k} ${v.filled}/${v.abst}`).join("; "));
        const byK = Object.fromEntries(rows);
        const sides = (k) => new Set(Array.from(byK[k].x.side).filter((v, i) => CASES[k].hole[i]));
        ok(`  [${mode}] ...and the fixtures reach what they are for: the derived rule decides every hole of the plain strip and abstains on ${byK.radius2.x.abstained} of the wider one's, the depth mode picks BOTH sides on its tie fixture, nearer and farther choose differently, and a hole out of reach stays one (${byK.unreachable.x.hole.reduce((s, v) => s + v, 0)} left)`,
           byK.derived.x.abstained === 0 && byK.radius2.x.abstained > 0 && byK.radius2.x.abstained < byK.radius2.x.filled && sides("depthTie").has(SIDE_PREV) && sides("depthTie").has(SIDE_CUR)
           && Array.from(cpu.nearer.vec).some((v, i) => v !== cpu.derived.vec[i] && !Number.isNaN(v)) && byK.unreachable.x.hole.some((v) => v === 1),
           "each is a population a sabotage needs in order to be seen");
    }
    console.log("\n3. ON THE DEVICE: splat, fill and warp together, against interpolateFrameCPU({ fill })");
    if (r.ok && r.result) for (const mode of ["webgpu", "webgl2"]) {
        const o = r.result[mode]; if (!o || o.err) continue;
        const up = (px, w, h) => { if (mode === "webgpu") return px; const f = []; for (let y = h - 1; y >= 0; y--) f.push(...px.slice(y * w * 4, (y + 1) * w * 4)); return f; };
        for (const [k, c] of Object.entries(INTERP)) {
            const x = cpuI[k], d = o.interp[k], fr = up(d.frame, c.w, c.h), fl = up(d.filled, c.w, c.h), sd2 = up(d.side, c.w, c.h);
            let frameW = 0, holeD = 0, sideD = 0, oneSided = 0;
            for (let i = 0; i < c.w * c.h; i++) {
                if ((fl[i * 4 + 3] < 0.5 ? 1 : 0) !== x.hole[i]) holeD++;
                if (sd2[i * 4] !== x.side[i]) sideD++; if (x.side[i] !== SIDE_BLEND) oneSided++;
                for (let q = 0; q < 4; q++) frameW = Math.max(frameW, Math.abs(fr[i * 4 + q] - x.frame[i * 4 + q]));
            }
            ok(`*** [${mode}] ${k}: the generated frame WITH THE FILL is interpolateFrameCPU's -- ${x.filled} pixels filled, ${oneSided} drawn from one frame only; mask ${holeD}, side ${sideD} differences, worst |frame| ${frameW.toExponential(2)} ***`,
               holeD === 0 && sideD === 0 && frameW < 2e-6 && x.filled > 0 && oneSided > 0,
               `${c.fill.side} side mode at block ${c.block}, t ${c.t}: a filled pixel whose content is in one frame takes that frame alone`);
        }
    }
}

// ---- v4737 SABOTAGE LOG ----------------------------------------------------------------------------------------
// L1-L12 against render/holeFillTsl.mjs, L13-L14 against render/frameInterpTsl.mjs's side-aware gather:
//   L1  the scan column-major, not row-major           -> 2    L8  the depth mode's two frames swapped          -> 4
//   L2  prefer ignored, always the farther             -> 4    L9  taps off the frame counted as candidates     -> 0
//   L3  a candidate taken on an EQUAL depth            -> 2    L10 the derived rule's abstention flag inverted  -> 2
//   L4  the occluder's distance tie-break dropped      -> 4    L11 a landed pixel refilled too                  -> 10
//   L5  the occluder the FARTHEST surface              -> 8    L12 the neighbourhood one tap narrower           -> 8
//   L6  the derived rule's sign flipped                -> 6    L13 the gather's side weights swapped            -> 6
//   L7  the depth fetch floored without the half       -> 2    L14 the gather ignores the side                  -> 6
// *** L9 IS AN EQUIVALENT MUTANT, AND WHY IS WORTH HAVING. *** An off-frame tap reads, through the clamp, a copy of an edge
// pixel whose real self is ALWAYS strictly nearer the hole; the vector rule keeps the first of two identical offers and the
// occluder rule's strict distance tie-break always ends on the real one. So the bounds test changes nothing the output can
// show -- it is kept because it is the mirror's, and because a clamp that ever stopped being a clamp would make it matter.
// L4 first CRASHED: the sabotage's own text was unbalanced. That is the sabotage's syntax, not the gate's sight, and it was
// re-run.
// *** TWO DRAFTS OF THE GATHER FAILED ON WEBGL2 AND THE SECOND ONE IS NEW. *** The side-aware gather chose its frame first
// with a vec4 select nested in a vec4 select -- v4733's known defect -- and then with SCALAR selects, which failed too: a
// TSL build error on WebGL2 alone ("Cannot read properties of undefined (reading 'addToStack')"), so the draw never ran
// and the target kept its clear colour, (0, 0, 0, 1). Isolated by building the gather with and without the side read.
// The weights are arithmetic now. And the first draft of the fill UNROLLED its 81 taps and took 48 s to compile across
// the fixtures; it is one loop, 7.6 s.
console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: growth \"ring\", which render/holeFill.mjs keeps only to reproduce the measurement that it is worse than doing " +
    "nothing, and which render/holeFillGPU.mjs refuses too; radii above 8, which the search refuses at (2r + 1)^2 taps a pixel; and what the fill buys a three.js " +
    "scene against the truth -- the driver's gate measures that.");
process.exitCode = fails ? 1 : 0;
