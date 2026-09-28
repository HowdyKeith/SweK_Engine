#!/usr/bin/env node
// WebGLEngine/render/opticalFlowTsl-selfcheck.mjs -- v4740
//
// OPTICAL FLOW AS TSL, HELD TO ITS MIRRORS: render/opticalFlowTsl.mjs's makeLumaPyramid against render/luminancePyramid.mjs's
// luminancePyramidCPU, and its makeOpticalFlow against render/opticalFlow.mjs's opticalFlowCPU, on both of three's backends.
// The cases are render/opticalFlow-selfcheck.mjs's: a rigid shift of a smoothed random field at one, three and five levels,
// two displacements one level cannot reach, the two v4734 fixtures that put a block's ORIGIN on a half pixel, a flat field
// (the seed-and-tie rule, and the refinement on a degenerate surface), a metamer (whose luma), fractional shifts (the
// refinement), and shifts at the edge of the window (the half-pixel clamp).
//
// *** THE PYRAMIDS ARE BUILT ON THE DEVICE HERE, AND render/opticalFlowGPU.mjs DELIBERATELY DID NOT. *** v4674 built its
// pyramids on the CPU because "a parity row over two device chains could not tell a flow defect from a pyramid one". This
// module is one pipeline and has to build its own, so section 2 grades every level of the chain on its own first; a
// flow row that goes red with section 2 green is the search's.
"use strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInEngineOrigin, webgpuSkipReason } from "../tools/ship/webgpuHarness.mjs";
import { luminancePyramidCPU } from "./luminancePyramid.mjs";
import { opticalFlowCPU } from "./opticalFlow.mjs";
import * as OF from "./opticalFlowTsl.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const say = (s) => console.log(`  ----  ${s}`);

console.log("\n1. WITHOUT A DEVICE: the refusals");
{
    const full = new Proxy({}, { get: () => () => {} });
    let n = 0; const got = [];
    for (const a of [{ block: 1 }, { block: 8.5 }, { searchRadius: 0 }, { searchRadius: 1.5 }, { levels: 0 }, { levels: 2.5 }, { refineRadius: 0 }, { refineRadius: 1.5 }, { grid: "levels" }])
        try { OF.makeOpticalFlow({}, full, { w: 64, h: 64, ...a }); got.push("no throw"); } catch (e) { if (/must be a whole number|must be "block" or "level"/.test(e.message)) n++; got.push(e.message.slice(0, 60)); }
    ok("makeOpticalFlow refuses a fractional or too-small block, radius, level count or (v4748) refinement radius, and (v4753) a grid that is not \"block\" or \"level\", as opticalFlowCPU does", n === 9, `${n} of 9`);
    let m = 0; const gm = [];
    for (const a of [{ retryRadius: 3 }, { retryRadius: 0 }, { retryRadius: 7.5 }])
        try { OF.makeOpticalFlow({}, full, { w: 64, h: 64, ...a }); gm.push("no throw"); } catch (e) { if (/retryRadius must be an even whole number/.test(e.message)) m++; gm.push(e.message.slice(0, 60)); }
    ok("  ...and (v4768) a retry radius that is odd, under 2 or fractional -- the second window is walked every second pixel", m === 3, `${m} of 3`);
}

// ---- render/opticalFlow-selfcheck.mjs's fixtures ----
const W = 64, H = 64, N = W * H, PAD = 32;
let seed = 12345;
const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
const base = new Float32Array((W + 2 * PAD) * (H + 2 * PAD));
for (let i = 0; i < base.length; i++) base[i] = rnd();
const smooth = (x, y) => { let s = 0;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) s += base[(y + PAD + dy) * (W + 2 * PAD) + (x + PAD + dx)];
    return s / 25; };
const bil = (x, y) => { const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
    return smooth(x0, y0) * (1 - fx) * (1 - fy) + smooth(x0 + 1, y0) * fx * (1 - fy) + smooth(x0, y0 + 1) * (1 - fx) * fy + smooth(x0 + 1, y0 + 1) * fx * fy; };
const img = (f) => { const o = new Float32Array(N * 4);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const [r, g, b] = f(x, y), i = (y * W + x) * 4; o[i] = r; o[i + 1] = g; o[i + 2] = b; o[i + 3] = 1; }
    return o; };
const shifted = (ox, oy) => img((x, y) => { const v = smooth(x - ox, y - oy); return [v, v, v]; });
const fracShift = (ox, oy) => img((x, y) => { const v = bil(x - ox, y - oy); return [v, v, v]; });
const flat = () => img(() => [0.5, 0.5, 0.5]);
// content constant along the diagonal x + y: a smoothed random signal of x + y alone. Every candidate whose offset has the
// same dx + dy reads the SAME values at every tap away from the frame's edge, so their SADs are bitwise equal on any device
// and the scan order alone picks among them -- the aperture problem with nothing left to hide it
const diag = (ox, oy) => img((x, y) => { const v = smooth(x + y - ox - oy, 7); return [v, v, v]; });
const metamer = (ox) => img((x, y) => { const r = smooth(x - ox, y); return [r, 0.5, 1 - r]; });
// a colour image for the pyramid, at a size that halves oddly all the way down (45 -> 23 -> 12 -> 6 -> 3 -> 2 -> 1)
const PW = 45, PH = 27, pyrSrc = new Float32Array(PW * PH * 4);
for (let i = 0; i < PW * PH; i++) { pyrSrc[i * 4] = rnd(); pyrSrc[i * 4 + 1] = rnd(); pyrSrc[i * 4 + 2] = rnd(); pyrSrc[i * 4 + 3] = 1; }

const zero = shifted(0, 0);
// v4753: two motions -- a 24-pixel square of another part of the field moving (+6, +3) over the field moving (-3, 0)
const twoMotions = (k) => img((x, y) => { const sx = 20 + 6 * k, sy = 18 + 3 * k, inSq = x >= sx && x < sx + 24 && y >= sy && y < sy + 24;
    const v = inSq ? smooth(x - 6 * k - 28, y - 3 * k - 28) : smooth(x + 3 * k, y); return [v, v, v]; });
const two0 = twoMotions(0), two1 = twoMotions(1);
// v4759: a 16 px square of another part of the field standing still at (24, 24) over the field moving (16, 0)
const stillSquare = (k) => img((x, y) => { const inSq = x >= 24 && x < 40 && y >= 24 && y < 40; const v = inSq ? smooth(x - 28, y - 28) : smooth(x - 16 * k, y); return [v, v, v]; });
const stillSq0 = stillSquare(0), stillSq1 = stillSquare(1);
// v4768: a 16 px square of another part of the field moving (16, 4) over the field standing still, landing on one level-1 block
const movingSquare = (k) => img((x, y) => { const sx = 16 + 16 * k, sy = 12 + 4 * k, inSq = x >= sx && x < sx + 16 && y >= sy && y < sy + 16;
    const v = inSq ? smooth(x - 16 * k - 28, y - 4 * k - 28) : smooth(x, y); return [v, v, v]; });
const movSq0 = movingSquare(0), movSq1 = movingSquare(1);
// v4758: a seed -- render/temporalTsl.mjs's motion field, (du, dv, valid, 0) in uv, for content that moved (fx, fy) pixels
// an invalid pixel carries a JUNK vector, (40, -30), so nothing but the validity keeps it out
const seedField = (fx, fy, validAt) => img((x, y) => (validAt(x, y) ? [-fx / W, -fy / H, 1] : [-40 / W, 30 / H, 0]));
// [name, cur, prev, block, levels, subpixel] -- the first six are v4674's device cases, the last two v4734's half-pixel origins
const CASES = [
    ["(3, -2) one level", shifted(3, -2), zero, 8, 1, true], ["(3, -2) three levels", shifted(3, -2), zero, 8, 3, true],
    ["(9, -7) three levels", shifted(9, -7), zero, 8, 3, false], ["(14, 11) three levels", shifted(14, 11), zero, 8, 3, false],
    ["(9, -7) one level", shifted(9, -7), zero, 8, 1, false],
    ["diagonal (2, 1)", diag(2, 1), diag(0, 0), 8, 1, false], ["flat", flat(), flat(), 8, 1, true], ["still", zero, zero, 8, 1, true], ["metamer (3, 0)", metamer(3), metamer(0), 8, 1, false],
    ["(3.4, -1.6) refined", fracShift(3.4, -1.6), fracShift(0, 0), 8, 1, true], ["(3.4, -1.6) whole", fracShift(3.4, -1.6), fracShift(0, 0), 8, 1, false],
    ["(4.7, -4) window edge", fracShift(4.7, -4), fracShift(0, 0), 8, 1, true], ["(-4, 4) window edge", fracShift(-4, 4), fracShift(0, 0), 8, 1, true],
    ["(3, -2) five levels, block 8", shifted(3, -2), zero, 8, 5, true], ["(5, 3) four levels, block 12", shifted(5, 3), zero, 12, 4, true],
    // v4748: the levels below the coarsest refining within a smaller window -- the last element is refineRadius
    ["(14, 11) three levels, refining within 1", shifted(14, 11), zero, 8, 3, false, 1], ["(9, -7) three levels, refining within 2", shifted(9, -7), zero, 8, 3, true, 2],
    // v4753: each level on its own grid -- the last element is the grid; two motions, so a neighbour's guess is taken somewhere
    ["(9, -7) three levels, level grid", shifted(9, -7), zero, 8, 3, true, null, "level"], ["(14, 11) three levels, level grid, refining within 2", shifted(14, 11), zero, 8, 3, false, 2, "level"],
    ["(5, 3) four levels, block 12, level grid", shifted(5, 3), zero, 12, 4, true, null, "level"], ["(3, -2) five levels, level grid", shifted(3, -2), zero, 8, 5, true, null, "level"],
    ["two motions, level grid", two1, two0, 8, 3, true, null, "level"], ["two motions, block grid", two1, two0, 8, 3, true],
    // v4758: seeded with the application's field -- the last element the seed: (24, 1) is past three levels' reach here, and a
    // camera's (21, 0) brings it in; and the seed invalid over the left half, where the search must do without it
    ["(24, 1) seeded by (21, 0), level grid", shifted(24, 1), zero, 8, 3, true, null, "level", seedField(21, 0, () => true)],
    ["(24, 1) seeded by (21, 0), block grid", shifted(24, 1), zero, 8, 3, true, null, "block", seedField(21, 0, () => true)],
    // valid from x = 40, inside the coarsest level's second block (32 to 63): its centre, 48, is seeded and its corner is not
    ["(24, 1) seeded on the right half only", shifted(24, 1), zero, 8, 3, true, null, "level", seedField(21, 0, (x) => x >= 40)],
    // v4759: standing still as a guess below the coarsest level -- the element after the seed -- on a 16 px square that stands still
    // over a background moving 16 px, on both grids
    ["still square over a moving background, standing still guessed", stillSq1, stillSq0, 8, 3, true, null, "level", null, true],
    ["still square over a moving background, block grid, standing still guessed", stillSq1, stillSq0, 8, 3, true, null, "block", null, true],
    // v4768: the blocks the window did not explain searched again -- the element after standing still the retry's radius, and
    // after it its ratio: the moving square it is for, on both grids; two motions; and a ratio that retries more, whole-pixel
    ["square moving 16 px over a still field, retrying within 8", movSq1, movSq0, 8, 3, true, null, "level", null, false, 8],
    ["square moving 16 px over a still field, block grid, retrying within 8", movSq1, movSq0, 8, 3, true, null, "block", null, false, 8],
    ["two motions, level grid, retrying within 8 and standing still guessed", two1, two0, 8, 3, true, null, "level", null, true, 8],
    ["(9, -7) three levels, level grid, retrying within 4 at 0.3", shifted(9, -7), zero, 8, 3, false, 2, "level", null, false, 4, 0.3],
];
// *** TWO CASES ARE NOT IN THE PARITY ROW'S "EVERY BLOCK", AND THE FIXTURES ARE WHY. *** The METAMER is flat in the tree's luma
// in exact arithmetic, so every candidate TIES and the vector is whichever rounding of 0.25r + 0.5g + 0.25b is lowest -- f64
// in JS, f32 on the device, and 56 of 64 blocks disagree by up to four pixels about nothing; its confidence is what it is
// here for, and that row holds it. And the first draft's window-edge shift was (4.5, -4): a bilinear half-pixel shift makes
// the SAD at 4 and at 5 EQUAL, which puts the parabola's vertex exactly on the half-pixel clamp, and 7 blocks went to either
// side of `<= 0.5` by one rounding. It is (4.7, -4) now, where the vertex is 0.2 past the clamp and the clamp decides.
const NOT_PARITY = new Set(["metamer (3, 0)"]);
const tallies = CASES.map(() => ({ scores: 0, reads: 0, neighbours: 0 }));
const cpu = CASES.map(([, cur, prev, block, levels, subpixel, refineRadius = null, grid = "block", seed = null, stillGuess = false, retryRadius = null, retryRatio = 0.5], c) =>
    opticalFlowCPU({ cur, prev, w: W, h: H, block, searchRadius: 4, levels, subpixel, refineRadius, grid, seed, stillGuess, retryRadius, retryRatio, tally: tallies[c] }));
const cpuPyr = luminancePyramidCPU({ src: pyrSrc, w: PW, h: PH });

// the populations the parity row needs in order to see the refinement and its clamp at all
{
    const at = (name) => cpu[CASES.findIndex((c) => c[0] === name)];
    const ref = at("(3.4, -1.6) refined"), whole = at("(3.4, -1.6) whole"), edge = at("(4.7, -4) window edge");
    let frac = 0, clamped = 0;
    for (let k = 0; k < ref.bw * ref.bh; k++) if (ref.flow[k * 2] !== whole.flow[k * 2] || ref.flow[k * 2 + 1] !== whole.flow[k * 2 + 1]) frac++;
    for (let k = 0; k < edge.bw * edge.bh; k++) if (Number.isInteger(edge.flow[k * 2])) clamped++;
    // the diagonal: a y-outer scan meets the tied line first at its lowest dy, (1, -4) in the search's sense, which is (-1, 4)
    // forward; an x-outer scan would meet it at (-4, 1)
    const dg = at("diagonal (2, 1)");
    let yFirst = 0; for (let k = 0; k < dg.bw * dg.bh; k++) if (dg.flow[k * 2] === -1 && dg.flow[k * 2 + 1] === 4) yFirst++;
    ok(`the fixtures reach what they are for: the refinement moves ${frac} of 64 blocks off the integer, at (4.7, -4) the half-pixel clamp keeps the integer at ${clamped} of 64, and on the diagonal ${yFirst} of 64 blocks report the tied line's first candidate in y-outer order, (-1, 4), for a true (2, 1)`,
       frac > 50 && clamped > 50 && yFirst > 30,
       "a parity row over fixtures where the parabola never fires, the clamp never decides or no two candidates tie would pass a module without any of them; " +
       "the diagonal's answer is WRONG and is the mirror's -- six candidates explain the block equally well and a block matcher cannot know which");
}

const skip = webgpuSkipReason();
if (skip) { console.log(`  SKIP  ${skip}`); console.log("  ----  *** NOT A PASS. *** Section 1 is static."); fails++; }
else {
    // the distinct frames, sent once each
    const frames = [], index = new Map(), ref = (f) => { if (!index.has(f)) { index.set(f, frames.length); frames.push(Array.from(f)); } return index.get(f); };
    const cases = CASES.map(([name, cur, prev, block, levels, subpixel, refineRadius = null, grid = "block", seed = null, stillGuess = false, retryRadius = null, retryRatio = 0.5]) =>
        ({ name, cur: ref(cur), prev: ref(prev), block, levels, subpixel, refineRadius, grid, seed: seed ? ref(seed) : null, stillGuess, retryRadius, retryRatio }));
    const r = await runInEngineOrigin({ engineRoot: ENG, timeoutMs: 300000, args: { W, H, frames, cases, PW, PH, pyrSrc: Array.from(pyrSrc) }, script: `async (a) => {
        const THREE = await import("/vendor/three-webgpu/three.webgpu.js"); const T = await import("/vendor/three-webgpu/three.tsl.js");
        const OF = await import("/render/opticalFlowTsl.mjs");
        const out = {};
        for (const mode of ["webgpu", "webgl2"]) {
            try {
                const canvas = document.createElement("canvas"); canvas.width = 8; canvas.height = 8;
                const renderer = new THREE.WebGPURenderer({ canvas, forceWebGL: mode === "webgl2", antialias: false }); await renderer.init();
                const tex = (arr, w, h) => { const t = new THREE.DataTexture(new Float32Array(arr), w, h, THREE.RGBAFormat, THREE.FloatType); t.needsUpdate = true; return t; };
                // tight rows, top first: WebGPU pads a row to 256 bytes, WebGL2 reads bottom first
                const read = async (rt, w, h) => { const px = await renderer.readRenderTargetPixelsAsync(rt, 0, 0, w, h), s = mode === "webgpu" ? Math.ceil(w / 16) * 16 : w, o = [];
                    for (let y = 0; y < h; y++) { const row = mode === "webgpu" ? y : h - 1 - y; for (let x = 0; x < w * 4; x++) o.push(px[row * s * 4 + x]); } return o; };
                const texs = a.frames.map((f) => tex(f, a.W, a.H));
                const o = { pyr: [], flow: [] };
                const P = OF.makeLumaPyramid(THREE, T, { w: a.PW, h: a.PH }), ps = tex(a.pyrSrc, a.PW, a.PH);
                await P.build(renderer, ps);
                for (let k = 0; k < P.levels; k++) { const [lw, lh] = P.sizes[k]; o.pyr.push(await read(P.targets[k], lw, lh)); }
                o.pyrSizes = P.sizes; P.dispose(); ps.dispose();
                const makers = new Map();
                for (const c of a.cases) {
                    const key = c.block + "|" + c.levels + "|" + c.subpixel + "|" + c.refineRadius + "|" + c.grid + "|" + (c.seed !== null) + "|" + c.stillGuess + "|" + c.retryRadius + "|" + c.retryRatio;
                    if (!makers.has(key)) makers.set(key, OF.makeOpticalFlow(THREE, T, { w: a.W, h: a.H, block: c.block, searchRadius: 4, levels: c.levels, subpixel: c.subpixel, refineRadius: c.refineRadius, grid: c.grid, seed: c.seed !== null, stillGuess: c.stillGuess, retryRadius: c.retryRadius, retryRatio: c.retryRatio }));
                    const F = makers.get(key);
                    await F.flow(renderer, texs[c.cur], texs[c.prev], c.seed !== null ? texs[c.seed] : null);
                    o.flow.push({ px: await read(F.target, F.bw, F.bh), bw: F.bw, bh: F.bh, levels: F.levels });
                }
                for (const F of makers.values()) F.dispose(); for (const t of texs) t.dispose();
                out[mode] = o; renderer.dispose();
            } catch (err) { out[mode] = { err: String(err && err.stack || err).slice(0, 700) }; }
        }
        return out;
    }` });
    ok("the harness ran every case on BOTH backends", r.ok && r.result && !r.result.webgpu.err && !r.result.webgl2.err,
       r.ok ? `webgpu ${r.result.webgpu.err || "ok"}; webgl2 ${r.result.webgl2.err || "ok"}` : (r.reason || (r.pageErrors || []).join("; ")));

    console.log("\n2. ON THE DEVICE: the pyramid, every level, at a size that halves oddly all the way down");
    if (r.ok && r.result) for (const mode of ["webgpu", "webgl2"]) {
        const o = r.result[mode]; if (!o || o.err) continue;
        let worst = 0, sizesSame = o.pyr.length === cpuPyr.levels;
        for (let k = 0; k < Math.min(o.pyr.length, cpuPyr.levels); k++) {
            const [lw, lh] = cpuPyr.sizes[k]; if (o.pyrSizes[k][0] !== lw || o.pyrSizes[k][1] !== lh) sizesSame = false;
            for (let i = 0; i < lw * lh; i++) worst = Math.max(worst, Math.abs(o.pyr[k][i * 4] - cpuPyr.mips[k][i]));
        }
        ok(`*** [${mode}] every level of the chain is luminancePyramidCPU's -- ${cpuPyr.sizes.map(([x, y]) => x + "x" + y).join(" -> ")}, worst |gpu - cpu| ${worst.toExponential(2)} ***`,
           sizesSame && worst < 2e-6,
           "the tree's luma at the base, a 2 x 2 average above it with the last row and column read twice at an odd size, summed in the mirror's order; f32 on the device against f64 stored to f32 in JS");
    }

    console.log("\n3. ON THE DEVICE: the search, against opticalFlowCPU");
    if (r.ok && r.result) for (const mode of ["webgpu", "webgl2"]) {
        const o = r.result[mode]; if (!o || o.err) continue;
        let blocks = 0, differ = 0, worstF = 0, worstC = 0, tieOrigins = 0;
        for (let c = 0; c < CASES.length; c++) {
            const x = cpu[c], d = o.flow[c], [name, , , block, , subpixel] = CASES[c];
            let cd = 0, wf = 0, wc = 0;
            for (let k = 0; k < x.bw * x.bh; k++) {
                const ex = Math.abs(d.px[k * 4] - x.flow[k * 2]), ey = Math.abs(d.px[k * 4 + 1] - x.flow[k * 2 + 1]);
                // a whole-pixel field is integers and is held EXACTLY; a refined one to 1e-4 of a pixel, as v4674's device row
                if (subpixel ? ex > 1e-4 || ey > 1e-4 : ex !== 0 || ey !== 0) cd++;
                wf = Math.max(wf, ex, ey); wc = Math.max(wc, Math.abs(d.px[k * 4 + 2] - x.conf[k]));
            }
            if (NOT_PARITY.has(name)) { say(`[${mode}] ${name}: ${cd} of ${x.bw * x.bh} vectors differ, every one a tie in exact arithmetic -- not graded`); continue; }
            for (let lv = 0; lv < x.levels; lv++) for (let b = 0; b < Math.max(x.bw, x.bh); b++) {
                const v = (b * block) / (1 << lv), f = Math.floor(v); if (v - f === 0.5 && f % 2 === 0) tieOrigins++; }
            blocks += x.bw * x.bh; differ += cd; worstF = Math.max(worstF, wf); worstC = Math.max(worstC, wc);
            if (cd) say(`[${mode}] ${name}: ${cd} of ${x.bw * x.bh} blocks differ`);
        }
        say(`[${mode}] ${blocks} blocks over ${CASES.length - NOT_PARITY.size} cases; worst |flow| ${worstF.toExponential(2)}, worst |confidence| ${worstC.toExponential(2)}`);
        ok(`*** [${mode}] the SAME VECTOR as opticalFlowCPU at every block of ${CASES.length - NOT_PARITY.size} cases -- ${tieOrigins} block origins on a half pixel among them ***`,
           differ === 0 && worstC < 1e-5 && tieOrigins > 0 && o.flow.every((d, c) => d.bw === cpu[c].bw && d.bh === cpu[c].bh && d.levels === cpu[c].levels),
           `${differ} of ${blocks} differ. A flow field's integer part is an answer, so one differing block is a different ANSWER: the level walk, the ` +
           "guess carried down, the seed, the strict tie, the origin's floor(x + 0.5) and the parabola, over a chain built on the device");
        const at = (name) => o.flow[CASES.findIndex((c) => c[0] === name)];
        {   // v4753: the level grid's cases are in the row above; what they reach
            const ti = CASES.findIndex((c) => c[0] === "two motions, level grid"), L = at("two motions, level grid"), B = at("two motions, block grid");
            let differ2 = 0; for (let k = 0; k < L.bw * L.bh; k++) if (L.px[k * 4] !== B.px[k * 4] || L.px[k * 4 + 1] !== B.px[k * 4 + 1]) differ2++;
            ok(`  [${mode}] ...and v4753's level grid is among them where it is not the block grid: on two motions a neighbour's guess won at ${tallies[ti].neighbours || 0} blocks of the levels below the coarsest, and the two grids answer differently at ${differ2} of ${L.bw * L.bh} blocks`,
               (tallies[ti].neighbours || 0) > 0 && differ2 > 0, "each level its own target at its own grid, the parent read at half the block's index and its three neighbours on the block's side, clamped");
        }
        {   // v4758: the seeded cases -- where the seed takes a shift past the reach, and where half of it is invalid
            const cnt = (d, fx, fy) => { let k = 0; for (let q = 0; q < d.bw * d.bh; q++) if (Math.abs(d.px[q * 4] - fx) < 0.75 && Math.abs(d.px[q * 4 + 1] - fy) < 0.75) k++; return k; };
            const S = at("(24, 1) seeded by (21, 0), level grid"), U = at("(9, -7) three levels, level grid"), half = at("(24, 1) seeded on the right half only");
            // unseeded, on the mirror: the same frames without the seed
            const plain = opticalFlowCPU({ cur: shifted(24, 1), prev: zero, w: W, h: H, levels: 3, grid: "level" });
            let un = 0; for (let q = 0; q < plain.bw * plain.bh; q++) if (Math.abs(plain.flow[q * 2] - 24) < 0.75 && Math.abs(plain.flow[q * 2 + 1] - 1) < 0.75) un++;
            ok(`  [${mode}] ...and v4758's seed is among them where it matters: a (24, 1) shift found at ${cnt(S, 24, 1)} of ${S.bw * S.bh} blocks seeded by (21, 0), and at ${un} unseeded -- and at ${cnt(half, 24, 1)} with the seed on the right half only`,
               cnt(S, 24, 1) >= 35 && un === 0 && cnt(half, 24, 1) >= 35 && U,
               "the coarsest level's second guess: the vector at the block's centre, taken only where it is valid and explains the block better than standing still. Half a seed does as well as all of it here: the level grid's neighbour guesses carry the seeded answer into the unseeded half. The blocks it misses see content from past the frame's edge");
        }
        {   // v4759: standing still guessed -- the square's blocks, which the plain level grid gives the background's 16 px
            const SQ = at("still square over a moving background, standing still guessed"), plain = opticalFlowCPU({ cur: stillSq1, prev: stillSq0, w: W, h: H, levels: 3, grid: "level" });
            const inSq = (q, bw) => { const bx = q % bw, by = (q / bw) | 0; return bx >= 3 && bx <= 4 && by >= 3 && by <= 4; };
            let got = 0, was = 0; for (let q = 0; q < SQ.bw * SQ.bh; q++) if (inSq(q, SQ.bw)) { if (Math.abs(SQ.px[q * 4]) < 0.75 && Math.abs(SQ.px[q * 4 + 1]) < 0.75) got++; if (Math.abs(plain.flow[q * 2]) < 0.75 && Math.abs(plain.flow[q * 2 + 1]) < 0.75) was++; }
            const ti = CASES.findIndex((c) => c[0] === "still square over a moving background, standing still guessed");
            ok(`  [${mode}] ...and v4759's standing still is among them where it matters: the still square's 4 blocks right at ${got} with it and at ${was} without; standing still taken at ${tallies[ti].still || 0} blocks`,
               got === 4 && was === 0 && (tallies[ti].still || 0) > 0, "the one more score a block below the coarsest level, kept only on a STRICT improvement");
        }
        {   // v4768: the retry -- the moving square's blocks, which no window reaches without it
            const names = ["square moving 16 px over a still field, retrying within 8", "square moving 16 px over a still field, block grid, retrying within 8", "two motions, level grid, retrying within 8 and standing still guessed", "(9, -7) three levels, level grid, retrying within 4 at 0.3"];
            const inSq = (q, bw) => { const bx = q % bw, by = (q / bw) | 0; return bx >= 4 && bx <= 5 && by >= 2 && by <= 3; };
            const right = (px, q) => Math.abs(px[q * 4] - 16) < 0.75 && Math.abs(px[q * 4 + 1] - 4) < 0.75;
            const L = at(names[0]), Bk = at(names[1]), plain = opticalFlowCPU({ cur: movSq1, prev: movSq0, w: W, h: H, levels: 3, grid: "level" });
            let got = 0, gotB = 0, was = 0; for (let q = 0; q < L.bw * L.bh; q++) if (inSq(q, L.bw)) { if (right(L.px, q)) got++; if (right(Bk.px, q)) gotB++; if (Math.abs(plain.flow[q * 2] - 16) < 0.75 && Math.abs(plain.flow[q * 2 + 1] - 4) < 0.75) was++; }
            const tl = names.map((nm) => tallies[CASES.findIndex((c) => c[0] === nm)]);
            ok(`  [${mode}] ...and v4768's retry is among them where it matters: the moving square's 4 blocks right at ${got} on the level grid with it and at ${was} without -- ${gotB} on the block grid; blocks retried ${tl.map((t) => t.retried || 0).join(", ")} and won ${tl.map((t) => t.retryWon || 0).join(", ")} over its four cases`,
               got === 4 && was === 0 && gotB > 0 && tl.every((t) => (t.retried || 0) > 0 && (t.retryWon || 0) > 0),
               "the energy's two scores, the second window walked every second offset outside the first, and the eight about its winner, each kept only on a STRICT improvement -- in the mirror's order. The block grid's coarse patch starts at its block's corner (v4753), so its level-1 blocks are not the square's");
        }
        const flatD = at("flat"), stillD = at("still"), metaD = at("metamer (3, 0)");
        ok(`  [${mode}] ...and the rules the shifts cannot see hold on the device: a flat field reports NO motion and no confidence (not the window's corner), a still texture no confidence, and a metamer in the tree's luma nothing`,
           flatD.px.every((v, i) => i % 4 === 3 || v === 0) && stillD.px.every((v, i) => i % 4 !== 2 || v === 0) && metaD.px.every((v, i) => i % 4 !== 2 || v < 1e-6),
           "every candidate ties on flat content, so only the seed decides the vector; confidence is how much better than standing still, which a still texture cannot be; and 0.25r + 0.5g + 0.25b is constant on the metamer");
        const one = at("(9, -7) one level"), three = at("(9, -7) three levels");
        const exact = (d) => { let n = 0; for (let k = 0; k < d.bw * d.bh; k++) if (d.px[k * 4] === 9 && d.px[k * 4 + 1] === -7) n++; return n; };
        ok(`  [${mode}] ...and the pyramid is what reaches a displacement past the radius: (9, -7) exactly at ${exact(one)} blocks at one level, ${exact(three)} at three`,
           exact(one) === 0 && exact(three) > 25, "the coarsest level searches +-4 of ITS pixels, +-16 of the frame's");
    }
}

// ---- v4740 SABOTAGE LOG ----------------------------------------------------------------------------------------
// Against render/opticalFlowTsl.mjs, each run against this gate (and Q4-Q6 against render/shaderRound-selfcheck.mjs too):
//   Q1  the sense not negated                        -> 4    Q10 the vertex's sign flipped                  -> 2
//   Q2  `best` seeded with a large number            -> 4    Q11 `target` the first pass's buffer           -> 2
//   Q3  nearer-or-equal                              -> 4    Q12 the pyramid drops the odd column's clamp   -> 1
//   Q4  the origin by round()                        -> 2    Q13 a Rec.709 luma                             -> 4
//   Q5  the origin floored without the half          -> 2    Q14 confidence 1 wherever a match was found    -> 2
//   Q6  the guess carried down by round()            -> 0    Q15 the patch clamped to lw, not lw - 1        -> 2
//   Q7  the patch shrinks with the mip               -> 4    Q16 the window scanned x-outer                 -> 2
//   Q8  refined at every level, not the finest       -> 2    Q17 standing still measured at the guess       -> 2
//   Q9  the half-pixel clamp removed                 -> 2    Q18 the loops unnamed again                    -> 0
//                                                            Q19 the offsets not made variables             -> 0
// *** Q6 IS ARITHMETIC, AS v4734's T4 WAS. *** A level's guess is the coarser level's whole answer, doubled: never a tie,
// so round() and floor(x + 0.5) agree on every value it can take. render/shaderRound-selfcheck.mjs said "unchecked here:
// TSL" and could not hold it either; it reads *Tsl.mjs files now, and Q4 and Q6 are 2 red there, Q5 1.
// *** Q16 SCORED 0 FIRST. *** No two candidates tie exactly on a smoothed random field, so the order the window is walked
// in was invisible. The diagonal fixture -- content that is a function of x + y alone -- ties six candidates bitwise on any
// device, and the scan order is the only thing that picks one: 64 blocks differ with it reversed.
// *** Q18 AND Q19 ARE 0 EACH, AND TOGETHER THEY ARE THE FIRST DRAFT. *** The draft had neither the loop names nor the offsets
// as variables, and was wrong at 693 of 868 blocks; either alone is enough, and the module says so and keeps both.
// *** Q12 AND Q15 ARE RED ON WEBGL2 ONLY. *** Dawn clamps an out-of-range textureLoad into the texture, which is the mirror's
// clamp, so on WebGPU the coordinate clamp is not what makes the answer right; WebGL2's texelFetch returns something else,
// and there it is. A clamp that one backend makes redundant is still the one the other backend needs.
// And the first run was NaN on WebGPU: this gate's readback took the row pitch from the buffer's length, and a WebGPU
// readback pads every row but the last to 256 bytes.
// v4753: the level grid's sabotages, T1-T7 and the mirror's M1-M7, are logged in fx/fsr/fsrFlowGrid-selfcheck.mjs.
// v4758: the seed's sabotages are logged in fx/fsr/fsrFlowSeed-selfcheck.mjs.
// v4759: standing still's are logged in fx/fsr/fsrFlowStill-selfcheck.mjs.
// v4768: the retry's are logged in fx/fsr/fsrFlowRetry-selfcheck.mjs.
console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: the field reconciled with the application's motion vectors, which is render/flowReconcile.mjs's and a " +
    "later round's; real content, where a rigid shift of a random field is the easiest case a block matcher ever sees; and " +
    "frame generation driven by this field, which fx/fsr/fsrFrameGenTsl.mjs does not do yet.");
process.exitCode = fails ? 1 : 0;
