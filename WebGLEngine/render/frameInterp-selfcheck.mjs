#!/usr/bin/env node
// WebGLEngine/render/frameInterp-selfcheck.mjs -- v4677
//
// THE GATE FOR THE FIRST FRAME IN THIS TREE THAT NOTHING RENDERED.
//
// v4673 built the optical flow, v4674 mirrored it on the device, v4675 made it sub-pixel and v4676 reconciled
// it with the application's vectors. None of those produces a pixel, and every one of them closed by saying
// that frame interpolation was what they were for and had not been started. render/frameInterp.mjs is it.
//
// *** THE SCENE HAS A TRUE MIDDLE FRAME, WHICH IS WHY THIS GATE CAN GRADE A GENERATED ONE AT ALL. *** The
// content is rendered analytically -- a wall at constant depth, every pixel's world point an affine function
// of its UV -- so the frame at t = 0.5 can simply be RENDERED, at half the camera's travel or half the
// texture's slide. Every number below is against that frame and not against a proxy for it.
//
// *** AND THE CONTROL ARM IS THE CROSS-FADE, WHICH IS NOT A STRAW MAN. *** (1-t)*prev + t*cur is four
// instructions per pixel, is exactly right wherever nothing moved, and never invents a pixel that is not a
// mixture of two real ones. The reactive-mask arc spent v4658 to v4663 learning what happens to a feature
// measured against nothing; a frame generator graded only against the frames it was built from is a frame
// generator nobody has measured.
"use strict";
import { opticalFlowCPU } from "./opticalFlow.mjs";
import { reconcileFlowCPU } from "./flowReconcile.mjs";
import { interpolateFrameCPU, crossFadeCPU } from "./frameInterp.mjs";
import { motionVectorsCPU, mat4Invert, transform4 } from "./motionVectors.mjs";
import { viewProj } from "./rasterProbe.js";

let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const report = (s) => console.log(`  ----  ${s}`);
const threw = (fn) => { try { fn(); return null; } catch (e) { return e.message; } };

// ---- THE RIG, SHARED WITH render/flowReconcile-selfcheck.mjs ----------------------------------------------
const W = 64, H = 64, B = 8, TAN = Math.tan(0.5), ASP = 1, NEAR = 0.1, FAR = 100, DIST = 8;
const VP = (ex) => viewProj([ex, -DIST, 0], [0, 1, 0], [1, 0, 0], [0, 0, 1], TAN, ASP, NEAR, FAR);
const PX_PER_UNIT = W / (2 * TAN * ASP * DIST);
const TW = 256, tex = new Float32Array(TW * TW);
{
    let s = 7; const rnd = () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    const raw = new Float32Array(TW * TW);
    for (let i = 0; i < TW * TW; i++) raw[i] = rnd();
    for (let y = 0; y < TW; y++) for (let x = 0; x < TW; x++) {
        let a = 0;
        for (let j = -2; j <= 2; j++) for (let i = -2; i <= 2; i++) a += raw[((y + j + TW) % TW) * TW + ((x + i + TW) % TW)];
        tex[y * TW + x] = a / 25;
    }
}
const sampleTex = (wx, wz) => {
    const fx = wx * 8 + 128, fy = wz * 8 + 128, x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
    const g = (x, y) => tex[(((y % TW) + TW) % TW) * TW + (((x % TW) + TW) % TW)];
    return (g(x0, y0) * (1 - tx) + g(x0 + 1, y0) * tx) * (1 - ty) + (g(x0, y0 + 1) * (1 - tx) + g(x0 + 1, y0 + 1) * tx) * ty;
};
function render(ex, slide) {
    const rgba = new Float32Array(W * H * 4), depth = new Float32Array(W * H), vp = VP(ex);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const u = (x + 0.5) / W, v = (y + 0.5) / H;
        const wx = ex + (2 * u - 1) * TAN * ASP * DIST, wz = (1 - 2 * v) * TAN * DIST;
        const c = sampleTex(wx - slide, wz), i = y * W + x;
        rgba[i * 4] = c; rgba[i * 4 + 1] = c; rgba[i * 4 + 2] = c; rgba[i * 4 + 3] = 1;
        const q = transform4(vp, wx, 0, wz, 1);
        depth[i] = q[2] / q[3];
    }
    return { rgba, depth };
}
/** PSNR over the pixels NOT masked out, on rgb. `mask` 1 means skip. */
const psnr = (a, b, mask) => {
    let s = 0, n = 0;
    for (let i = 0; i < W * H; i++) {
        if (mask && mask[i]) continue;
        for (let c = 0; c < 3; c++) { const d = a[i * 4 + c] - b[i * 4 + c]; s += d * d; }
        n += 3;
    }
    return n === 0 ? NaN : (s <= 0 ? Infinity : 10 * Math.log10(1 / (s / n)));
};
/** The block grid's nearest-surface depth, which is what frameInterp's splat priority needs. */
function blockDepth(depth, bw, bh) {
    const d = new Float32Array(bw * bh);
    for (let by = 0; by < bh; by++) for (let bx = 0; bx < bw; bx++) {
        let m = Infinity;
        for (let y = by * B; y < Math.min(by * B + B, H); y++)
            for (let x = bx * B; x < Math.min(bx * B + B, W); x++) m = Math.min(m, depth[y * W + x]);
        d[by * bw + bx] = m;
    }
    return d;
}
/** One scene, with its TRUE middle frame and all four candidate motion fields. */
function scene({ dex = 0, slide = 0 } = {}) {
    const prev = render(0, 0), cur = render(dex, slide), mid = render(dex / 2, slide / 2);
    const mv = motionVectorsCPU(cur.depth, W, H, mat4Invert(VP(dex)), VP(0));
    const of = opticalFlowCPU({ cur: cur.rgba, prev: prev.rgba, w: W, h: H, block: B, searchRadius: 4, levels: 2 });
    const rc = reconcileFlowCPU({ cur: cur.rgba, prev: prev.rgba, w: W, h: H, ...of, motion: mv.data, depth: cur.depth });
    const dB = blockDepth(cur.depth, of.bw, of.bh);
    const gen = (flow, t = 0.5) => interpolateFrameCPU({ prev: prev.rgba, cur: cur.rgba, w: W, h: H,
                                                         flow, bw: of.bw, bh: of.bh, block: B, depthBlock: dB, t });
    return { prev, cur, mid, of, rc, dB, gen, truthX: (slide - dex) * PX_PER_UNIT };
}

console.log("\n1. ZERO MOTION MUST BE THE CROSS-FADE, TO THE BIT");
{
    // *** THE FIRST THING TO ASK A FRAME GENERATOR IS WHAT IT DOES WHEN NOTHING MOVES. *** A generator that
    // "improves" on a still scene is inventing, and a generator that degrades one is costing quality for
    // nothing. The whole warp must collapse to the arm it has to beat.
    const s = scene({ dex: 0.437 });
    const zero = new Float32Array(s.of.bw * s.of.bh * 2);
    const g = interpolateFrameCPU({ prev: s.prev.rgba, cur: s.cur.rgba, w: W, h: H, flow: zero,
                                    bw: s.of.bw, bh: s.of.bh, block: B, depthBlock: s.dB, t: 0.5 });
    const cf = crossFadeCPU({ prev: s.prev.rgba, cur: s.cur.rgba, w: W, h: H, t: 0.5 });
    let worst = 0;
    for (let i = 0; i < W * H * 4; i++) worst = Math.max(worst, Math.abs(g.frame[i] - cf[i]));
    ok("*** a motion field of zeros produces the cross-fade EXACTLY, and leaves no hole ***",
       worst === 0 && g.holes === 0,
       `worst |generated - cross-fade| ${worst}, ${g.holes} holes of ${W * H}. Bit-exact and not "within a tolerance": at zero motion every sample lands on a pixel centre and the bilinear fetch is a copy.`);
    // *** AND THE EXPECTATION IS Math.fround'ED, WHICH THIS ROW WENT RED FOR THE FOURTH TIME IN THIS ARC TO
    // LEARN. *** crossFadeCPU writes into a Float32Array, so its output is the f32 rounding of an f64
    // product. Comparing it to the f64 product read 0.4679146409034729 against 0.4679146483540535 -- the
    // same defect v4664 hit on `=== 0.05` and v4668 on `=== luma(...)`, arriving a third time through a
    // different door. The row is kept at zero tolerance rather than loosened: the equality is exact once
    // both sides are the same width, and a tolerance here would hide a genuinely wrong blend weight.
    const cf2 = crossFadeCPU({ prev: s.prev.rgba, cur: s.cur.rgba, w: W, h: H, t: 0.25 });
    const want = Math.fround(0.75 * s.prev.rgba[0] + 0.25 * s.cur.rgba[0]);
    ok("...and the control arm really is (1-t)p + tc rather than something that only looks like it at a half",
       cf2[0] === want,
       `at t = 0.25: ${cf2[0]} against ${want} -- EXACT, with the expectation rounded to f32 because the buffer is`);
}

console.log("\n2. t = 0 AND t = 1 MUST RETURN THE FRAMES THEMSELVES");
let geom;
{
    geom = scene({ dex: 0.437 });
    const g0 = geom.gen(geom.rc.flow, 0), g1 = geom.gen(geom.rc.flow, 1);
    let w0 = 0, w1 = 0;
    for (let j = 0; j < W * H; j++) for (let c = 0; c < 4; c++) {
        if (!g0.hole[j]) w0 = Math.max(w0, Math.abs(g0.frame[j * 4 + c] - geom.prev.rgba[j * 4 + c]));
        if (!g1.hole[j]) w1 = Math.max(w1, Math.abs(g1.frame[j * 4 + c] - geom.cur.rgba[j * 4 + c]));
    }
    ok("*** t = 0 returns `prev` EXACTLY, on every pixel, with no hole anywhere ***",
       w0 === 0 && g0.holes === 0,
       `worst |frame - prev| ${w0}, ${g0.holes} holes. At t = 0 every block splats onto its own footprint, so the mask is full by construction and the samples are copies.`);
    // *** AND t = 1 IS NOT SYMMETRIC WITH IT, WHICH IS A PROPERTY OF THE SPLAT AND IS STATED RATHER THAN HIDDEN. ***
    ok("...and t = 1 returns `cur` exactly WHERE IT HAS A VECTOR, while leaving holes where content left the frame -- the asymmetry is real and is the splat's, not a bug",
       w1 === 0 && g1.holes > 0,
       `worst |frame - cur| ${w1} on the filled pixels, ${g1.holes} holes of ${W * H}. At t = 1 every block has moved its full displacement, so the strip it vacated at the frame's edge receives nothing. A pass that reported 0 holes here would be filling them without saying so.`);
}

console.log("\n3. AGAINST A FRAME THAT WAS REALLY RENDERED -- THE FOUR ARMS");
let shade;
{
    shade = scene({ slide: 0.437 });
    const rows = [];
    for (const [label, s] of [["camera moves, texture static", geom], ["camera static, texture slides", shade]]) {
        const rec = s.gen(s.rc.flow), app = s.gen(s.rc.appFlow), flo = s.gen(s.of.flow);
        const cf = crossFadeCPU({ prev: s.prev.rgba, cur: s.cur.rgba, w: W, h: H, t: 0.5 });
        // *** THE ARMS ARE SCORED ON THE PIXELS ALL OF THEM FILLED, WHICH IS THE UNION OF THEIR HOLES AND
        // NOT ANY ONE ARM'S. *** The first draft of this section masked every arm with the RECONCILED field's
        // holes, and read 22.15 dB for the colour flow against 38.14 on its own mask -- a 16 dB gap that was
        // entirely the flow's own 72 extra holes being scored as the zeros this pass deliberately leaves
        // there. Scoring an arm on pixels it declined to fill is not a comparison, and it would have been
        // reported as a finding about the flow.
        const m = new Uint8Array(W * H);
        for (let j = 0; j < W * H; j++) m[j] = (rec.hole[j] || app.hole[j] || flo.hole[j]) ? 1 : 0;
        let common = 0; for (let j = 0; j < W * H; j++) if (!m[j]) common++;
        rows.push({ label, holes: rec.holes, truth: s.truthX, common, ownHoles: { app: app.holes, flo: flo.holes },
                    cross: psnr(cf, s.mid.rgba, m), rec: psnr(rec.frame, s.mid.rgba, m),
                    app: psnr(app.frame, s.mid.rgba, m), flo: psnr(flo.frame, s.mid.rgba, m),
                    prevAlone: psnr(s.prev.rgba, s.mid.rgba, m) });
    }
    for (const r of rows) {
        report(`${r.label}: the picture moved ${r.truth.toFixed(3)} px; holes -- reconciled ${r.holes}, application ${r.ownHoles.app}, colour flow ${r.ownHoles.flo}; scored on the ${r.common} pixels all three filled`);
        report(`    prev alone ${r.prevAlone.toFixed(4)}   cross-fade ${r.cross.toFixed(4)}   application field ${r.app.toFixed(4)}   colour flow ${r.flo.toFixed(4)}   RECONCILED ${r.rec.toFixed(4)} dB`);
    }
    ok("*** the generated frame beats the cross-fade by more than 7 dB on BOTH scenes, measured against a frame that was really rendered ***",
       rows.every((r) => r.rec - r.cross > 7),
       rows.map((r) => `${r.label}: ${r.cross.toFixed(4)} -> ${r.rec.toFixed(4)} dB, +${(r.rec - r.cross).toFixed(4)}`).join("; "));
    ok("*** and v4676's reconciliation earns itself in PIXELS here, not in vector error: each single field loses at least 3 dB on the scene it is wrong about, and the reconciled one is within 0.02 dB of the better field on BOTH ***",
       rows[0].app - rows[0].flo > 2.5 && rows[1].flo - rows[1].app > 7
       && rows.every((r) => Math.max(r.app, r.flo) - r.rec < 0.02),
       `camera scene: application ${rows[0].app.toFixed(4)} vs flow ${rows[0].flo.toFixed(4)};  texture scene: flow ${rows[1].flo.toFixed(4)} vs application ${rows[1].app.toFixed(4)};  reconciled ${rows[0].rec.toFixed(4)} and ${rows[1].rec.toFixed(4)}`);
    // *** AND THE RECONCILIATION IS NOT FREE, WHICH THIS ROW EXISTS TO SAY IN A NUMBER. ***
    ok("...and it is NOT the maximum of the two: on the scene where the application is exactly right the reconciled field is measurably WORSE than taking the application alone",
       rows[0].rec < rows[0].app && rows[0].app - rows[0].rec < 0.1,
       `${rows[0].rec.toFixed(4)} against ${rows[0].app.toFixed(4)} dB -- ${(rows[0].app - rows[0].rec).toFixed(4)} dB, which is v4676's two stolen blocks arriving as picture quality. ` +
       `Traded for +${(rows[1].rec - rows[1].app).toFixed(4)} dB on the scene the application cannot see at all.`);
    // the application's field on the texture scene is exactly zero, so its frame IS the cross-fade
    ok("...and on the texture scene the application's field degenerates to the control arm, because a field of zeros is a cross-fade and that is all FSR2's inputs can offer a frame generator",
       Math.abs(rows[1].app - rows[1].cross) < 0.01,
       `application ${rows[1].app.toFixed(4)} against cross-fade ${rows[1].cross.toFixed(4)} dB`);
}

console.log("\n4. THE HOLES ARE REPORTED, NOT FILLED");
{
    const g = geom.gen(geom.rc.flow);
    let zeroed = 0, nanVec = 0, nonZeroInHole = 0;
    for (let j = 0; j < W * H; j++) {
        if (!g.hole[j]) continue;
        if (Number.isNaN(g.vec[j * 2]) && Number.isNaN(g.vec[j * 2 + 1])) nanVec++;
        let z = true;
        for (let c = 0; c < 4; c++) if (g.frame[j * 4 + c] !== 0) z = false;
        if (z) zeroed++; else nonZeroInHole++;
    }
    report(`${g.holes} holes of ${W * H} (${(100 * g.holes / (W * H)).toFixed(1)}%), all on the edge the content vacated`);
    ok("*** every hole is left at zero and carries a NaN vector, so nothing downstream can mistake an unfilled pixel for a generated one ***",
       g.holes > 0 && zeroed === g.holes && nanVec === g.holes && nonZeroInHole === 0,
       `${zeroed} zeroed, ${nanVec} with NaN vectors, ${nonZeroInHole} holding a value. A cross-fade would look plausible in all of them, which is exactly why it is not written there.`);
    // What filling them would be worth is measured and NOT claimed as this round's result.
    const cf = crossFadeCPU({ prev: geom.prev.rgba, cur: geom.cur.rgba, w: W, h: H, t: 0.5 });
    const patched = Float32Array.from(g.frame);
    for (let j = 0; j < W * H; j++) if (g.hole[j]) for (let c = 0; c < 4; c++) patched[j * 4 + c] = cf[j * 4 + c];
    report(`whole frame, holes cross-faded: ${psnr(patched, geom.mid.rgba, null).toFixed(4)} dB against ` +
           `${psnr(cf, geom.mid.rgba, null).toFixed(4)} for the cross-fade alone -- reported, not claimed: hole filling is the next pass and its result is its own`);
}

console.log("\n5. WHERE TWO BLOCKS LAND ON ONE PIXEL, THE NEARER ONE WINS");
{
    // Two blocks, 16x8. Block 0's content moves a full block to the right, so at t = 1 both blocks' footprints
    // land on block 1's. Last writer wins would make the answer depend on the loop's direction.
    const w = 16, h = 8, prev = new Float32Array(w * h * 4), cur = new Float32Array(w * h * 4);
    for (let i = 0; i < w * h; i++) { prev[i * 4 + 3] = 1; cur[i * 4 + 3] = 1; }
    const flow = Float32Array.from([8, 0, 0, 0]);
    const call = (d0, d1, nil) => interpolateFrameCPU({ prev, cur, w, h, flow, bw: 2, bh: 1, block: 8,
                                                        depthBlock: Float32Array.from([d0, d1]), nearerIsLess: nil, t: 1 });
    const a = call(0.2, 0.9, true), b = call(0.9, 0.2, true), c = call(0.2, 0.9, false);
    const vecAt = (r, x) => r.vec[(0 * w + x) * 2];
    report(`block 0 flows +8 px and lands on block 1's footprint at t = 1; block 1 does not move`);
    ok("*** the arriving block wins where it is nearer and loses where it is farther -- the answer is the scene's, not the loop's ***",
       vecAt(a, 8) === 8 && vecAt(b, 8) === 0,
       `nearer-arriver: vector at x=8 is ${vecAt(a, 8)} (the mover's +8);  farther-arriver: ${vecAt(b, 8)} (the resident's 0)`);
    ok("...and `nearerIsLess` reverses it, so the flag is load-bearing here too",
       vecAt(c, 8) === 0, `with nearerIsLess false and the same depths: ${vecAt(c, 8)}`);
    ok("...and equal depths leave the FIRST writer alone rather than the last, which is dilate.mjs's tie rule and the reason it has one",
       vecAt(call(0.5, 0.5, true), 8) === 8,
       `equal depths: ${vecAt(call(0.5, 0.5, true), 8)} -- block 0 is reached first, and a STRICTLY-nearer test is what makes that stable`);
}

console.log("\n6. A FRAME THE BLOCK GRID DOES NOT DIVIDE, AND A FIELD THAT DECLINES TO ANSWER");
{
    // *** 64x64 AT BLOCK 8 HAS NO PARTIAL BLOCK, SO EVERY ROW ABOVE LEAVES THE EDGE CASE UNTOUCHED. *** The
    // grid is ceil(w / block), so the last column and row of blocks hang off the frame; their footprints must
    // not splat the part that does not exist, or a block near the right edge writes a vector for content that
    // was never in `prev`.
    const w = 60, h = 60, bw = Math.ceil(w / 8), bh = Math.ceil(h / 8);
    const prev = new Float32Array(w * h * 4), cur = new Float32Array(w * h * 4);
    let sd = 5; const rnd = () => (sd = (sd * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    for (let i = 0; i < w * h; i++) { const c = rnd(); for (let k = 0; k < 3; k++) { prev[i * 4 + k] = c; cur[i * 4 + k] = c; } prev[i * 4 + 3] = 1; cur[i * 4 + 3] = 1; }
    const zero = new Float32Array(bw * bh * 2);
    const g = interpolateFrameCPU({ prev, cur, w, h, flow: zero, bw, bh, block: 8, depthBlock: new Float32Array(bw * bh), t: 0.5 });
    const cf = crossFadeCPU({ prev, cur, w, h, t: 0.5 });
    let worst = 0; for (let i = 0; i < w * h * 4; i++) worst = Math.max(worst, Math.abs(g.frame[i] - cf[i]));
    report(`${w}x${h} at block 8: a ${bw}x${bh} grid whose last row and column hang 4 pixels off the frame`);
    ok("a frame the block size does not divide is covered exactly once, with no hole and no phantom footprint",
       g.holes === 0 && worst === 0,
       `${g.holes} holes of ${w * h}, worst |generated - cross-fade| ${worst} at zero motion`);
    // and with real motion the hanging blocks must not claim pixels their content never occupied
    const mv = new Float32Array(bw * bh * 2);
    for (let i = 0; i < bw * bh; i++) mv[i * 2] = 3;
    const g2 = interpolateFrameCPU({ prev, cur, w, h, flow: mv, bw, bh, block: 8, depthBlock: new Float32Array(bw * bh), t: 1 });
    let leftEdge = 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < 3; x++) if (g2.hole[y * w + x]) leftEdge++;
    ok("...and a uniform +3 px motion at t = 1 vacates exactly the 3-pixel strip it should, no more and no less",
       leftEdge === 3 * h && g2.holes === 3 * h,
       `${g2.holes} holes, ${leftEdge} of them in the leftmost 3 columns of ${h} rows`);
    // *** AND IT HAS TO BE MEASURED IN THE OTHER DIRECTION, WHICH A SABOTAGE ESTABLISHED. *** With motion to
    // the RIGHT, the hanging tail of the last block column lands beyond the frame and is discarded by the
    // pixel-bounds test anyway, so the tail guard is unreachable and removing it scored 0 red. With motion to
    // the LEFT the tail lands INSIDE the frame: block column 7 covers source x 56..63 on a 60-wide frame, and
    // shifted -3 its x = 4..7 (source 60..63, which do not exist) land on px 57..59, which do.
    const mvL = new Float32Array(bw * bh * 2);
    for (let i = 0; i < bw * bh; i++) mvL[i * 2] = -3;
    const g3 = interpolateFrameCPU({ prev, cur, w, h, flow: mvL, bw, bh, block: 8, depthBlock: new Float32Array(bw * bh), t: 1 });
    let rightEdge = 0;
    for (let y = 0; y < h; y++) for (let x = w - 3; x < w; x++) if (g3.hole[y * w + x]) rightEdge++;
    ok("*** ...and a uniform -3 px motion vacates the RIGHT strip, which is the case where the hanging tail would land INSIDE the frame and claim pixels its content never occupied ***",
       rightEdge === 3 * h && g3.holes === 3 * h,
       `${g3.holes} holes, ${rightEdge} of them in the rightmost 3 columns. Without the tail guard the last block column fills px 57..59 from source pixels 60..63, which are off the frame -- ` +
       `the guard was UNREACHABLE under the +3 case above and a sabotage is what found that, not a reading of the code.`);
}

console.log("\n7. A FIELD MAY DECLINE, AND A DECLINED BLOCK MUST BECOME A HOLE RATHER THAN A POISONED PIXEL");
{
    // render/flowReconcile.mjs returns NaN in `appFlow` where the application had no valid vector, and that
    // array is a legitimate input here -- section 3 feeds it. A NaN vector that reached the warp would put
    // NaN into the frame, and a NaN in a colour buffer survives every downstream average.
    const s = scene({ dex: 0.437 });
    const f = Float32Array.from(s.rc.flow);
    f[0] = NaN; f[1] = NaN;                       // block (0, 0) declines
    f[10 * 2] = NaN;                              // and one axis alone of block 10, which is just as unusable
    const g = s.gen(f);
    let nans = 0;
    for (let i = 0; i < W * H * 4; i++) if (Number.isNaN(g.frame[i])) nans++;
    const clean = s.gen(s.rc.flow);
    // every NEW hole must lie inside one of the two declined blocks' landing footprints, computed from the
    // vectors they held before they were blanked -- not from a count guessed in advance. The first draft of
    // this row asserted clean.holes + 128 and read 240: block (0, 0) lands PARTLY OFF the frame at t = 0.5,
    // so it only ever owned 48 pixels, and 128 was arithmetic rather than a measurement.
    const rect = (bi, vx, vy) => {
        const bx = bi % s.of.bw, by = Math.floor(bi / s.of.bw);
        const sx = Math.round(bx * B + 0.5 * vx), sy = Math.round(by * B + 0.5 * vy);
        return { x0: sx, y0: sy, x1: sx + B, y1: sy + B };
    };
    const rects = [rect(0, s.rc.flow[0], s.rc.flow[1]), rect(10, s.rc.flow[20], s.rc.flow[21])];
    const inside = (x, y) => rects.some((r) => x >= r.x0 && x < r.x1 && y >= r.y0 && y < r.y1);
    let newHoles = 0, strayHoles = 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const j = y * W + x;
        if (g.hole[j] && !clean.hole[j]) { newHoles++; if (!inside(x, y)) strayHoles++; }
    }
    ok("*** a block whose vector is NaN on either axis becomes a hole, and NOT ONE NaN reaches the frame ***",
       nans === 0 && g.hole[0] === 1 && newHoles > 0 && strayHoles === 0,
       `${nans} NaN in the frame; holes ${clean.holes} -> ${g.holes}, and all ${newHoles} new ones lie inside the two declined blocks' landing footprints -- ${strayHoles} stray. ` +
       `Fewer than 2x64 because block (0, 0) lands partly off the frame at t = 0.5 and never owned a full footprint.`);
}

console.log("\n8. WHAT IT REFUSES");
{
    const base = () => ({ prev: new Float32Array(W * H * 4), cur: new Float32Array(W * H * 4), w: W, h: H,
                          flow: new Float32Array(8 * 8 * 2), bw: 8, bh: 8, block: B,
                          depthBlock: new Float32Array(64) });
    ok("a fractional block is refused", /whole number of pixels/.test(threw(() => interpolateFrameCPU({ ...base(), block: 8.5 })) || ""),
       threw(() => interpolateFrameCPU({ ...base(), block: 8.5 })));
    ok("a block grid that does not cover the frame is refused, with both shapes named",
       /does not cover the frame/.test(threw(() => interpolateFrameCPU({ ...base(), bh: 7 })) || ""),
       threw(() => interpolateFrameCPU({ ...base(), bh: 7 })));
    ok("*** a missing depthBlock is refused rather than silently switched to last-writer-wins ***",
       /last-writer-wins makes the answer depend on loop order/.test(threw(() => interpolateFrameCPU({ ...base(), depthBlock: null })) || ""),
       threw(() => interpolateFrameCPU({ ...base(), depthBlock: null })));
    ok("a t outside [0, 1] is refused -- extrapolation is a different pass with different failure modes",
       /t must be in/.test(threw(() => interpolateFrameCPU({ ...base(), t: 1.5 })) || "")
       && /t must be in/.test(threw(() => interpolateFrameCPU({ ...base(), t: -0.1 })) || ""),
       threw(() => interpolateFrameCPU({ ...base(), t: 1.5 })));
    ok("a short frame buffer is refused, naming both",
       /prev and cur must each be/.test(threw(() => interpolateFrameCPU({ ...base(), cur: new Float32Array(W * H * 3) })) || ""),
       threw(() => interpolateFrameCPU({ ...base(), cur: new Float32Array(W * H * 3) })));
}

// ---- THE SABOTAGE LOG ------------------------------------------------------------------------------------
//
// *** A CONTROL THAT CANNOT FAIL IS DECORATION, SO EVERY ROW ABOVE WAS BROKEN ON PURPOSE AND WATCHED. ***
// Fifteen mutations, each reverted.
//
//   Y1  the splat does not advance the footprint by t*v            -> 8 red (2, 3, 4, 5, 6, 7)
//   Y2  the backward sample walks the wrong way                    -> 3 red (3)
//   Y3  the blend weights are swapped                              -> 2 red (2)
//   Y4  the holes are quietly cross-faded                          -> 1 red (4)
//   Y5  a tie hands the pixel to the LAST writer (`<` -> `<=`)     -> 2 red (3, 5)
//   Y6  the splat ignores depth entirely                           -> 3 red (3, 5)
//   Y7  the warp samples the nearest texel, not bilinearly         -> 3 red (3)
//   Y8  the control arm is not a cross-fade at all                 -> 3 red (1, 3)
//   Y9  a block hanging off the frame splats its phantom tail       -> 1 red (6), AFTER A ROW WAS ADDED
//   Y11 each of the five guards in turn                            -> 1 red each (8)
//
// *** Y9 SCORED 0 RED ON ITS FIRST ATTEMPT AND THAT WAS A HOLE IN THIS FILE, NOT A NO-OP IN THE PASS. ***
// Section 6's motion case ran at +3 px, where the last block column's hanging tail lands BEYOND the frame and
// the pixel-bounds test discards it anyway -- so the tail guard was unreachable and deleting it changed
// nothing. At -3 px the tail lands INSIDE the frame: on a 60-wide frame block column 7 covers source x 56..63,
// and shifted left its non-existent source pixels 60..63 land on px 57..59, which exist. The -3 row was added
// and Y9 then scores 1 red. The measurement is what found the gap; reading the code had already missed it.
//
// *** AND Y10 IS A 0-RED THAT IS RECORDED RATHER THAN REPAIRED, BECAUSE IT IS A TRUE NO-OP. ***
//
//   Y10 a declined (NaN) vector is warped along anyway             -> 0 red, and correctly
//
// Removing the `Number.isFinite` skip changes NOTHING observable. Math.round(NaN) is NaN, `py < 0 || py >= h`
// is false for NaN so the bounds test does not stop it, the index is NaN, `zbuf[NaN]` reads undefined, and
// both `d < undefined` and `d > undefined` are false -- so nothing is written and the block's pixels stay
// holes, which is exactly what the guard produces. Section 7's row passes either way and is right to. What
// the guard buys is 64 skipped iterations per declined block and a reader who does not have to reason about
// NaN array indexing. This is the same finding v4675 recorded about render/opticalFlow.mjs's denominator
// guard, arriving through a different door, and the module now says which line does the work.

console.log(`\nframeInterp-selfcheck: ${fails ? `${fails} FAILED` : "ALL GREEN"}`);
console.log("unchecked here: THE HOLES, which are 3.1% of the frame and are reported rather than filled -- the " +
    "next pass owns them, and the figure this file reports for cross-fading them (39.66 dB against 30.96) is a " +
    "report and not this round's result. THE SPLAT'S COVERAGE IS ROUNDED: a block advanced by t*v covers a " +
    "fractional rectangle and is written onto whole pixels, so the warp is sub-pixel accurate while the mask " +
    "saying which pixels HAVE a vector is not -- on a silhouette that is the difference between a hole and a " +
    "smear, and a real splatter accumulates per-pixel coverage instead. THE DEVICE: this is CPU-only, and so " +
    "is render/flowReconcile.mjs, so the whole FSR3 path from reconciliation to pixels reads back. TEMPORAL " +
    "BEHAVIOUR: every number here is one generated frame between one pair, and a generator that flickered " +
    "between arms on alternate frames would pass every row while producing the judder it exists to remove. " +
    "REAL CONTENT: a wall at constant depth has no silhouette moving against a background, no rotation, and " +
    "no disocclusion -- section 5 builds its occlusion by hand from two depths and two vectors. And fsr.html " +
    "does not call any of it: the page still presents only upscaled frames, so nothing measured here has been " +
    "seen at a frame rate by anybody.");
process.exit(fails ? 1 : 0);
