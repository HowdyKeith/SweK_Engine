#!/usr/bin/env node
// WebGLEngine/render/flowReconcile-selfcheck.mjs -- v4676
//
// THE GATE FOR FSR3'S SECOND PASS: PICKING BETWEEN THE APPLICATION'S MOTION AND THE COLOUR'S.
//
// render/opticalFlow.mjs (v4673-v4675) estimates motion from two frames of colour. render/motionVectors.mjs
// gets it from the application. FSR3's frame generation needs ONE field, and neither source is right
// everywhere: the application is EXACT on geometry and SILENT on everything else, the flow sees everything
// and guesses. render/flowReconcile.mjs decides per block, by measuring which candidate the two frames
// actually support rather than by a heuristic on confidence.
//
// *** THE ROWS ARE BUILT SO THAT NO SINGLE ARM CAN PASS THEM. *** Two scenes with the same machinery and the
// same known displacement: one where the camera moves and the texture does not (the application is right to
// the last bit, the flow is guessing) and one where the camera is still and the texture slides (the
// application reports exactly zero with full confidence, and is wrong by the whole displacement). A pass that
// always took the application fails the second; one that always took the flow fails the first. The headline
// row is that the reconciled field beats BOTH single arms, on both scenes, at once.
//
// The content is rendered analytically rather than rasterised: a wall perpendicular to the view at constant
// distance, so every pixel's world point is an affine function of its UV and the image is one texture lookup.
// The application's vectors come from motionVectorsCPU through the real matrices -- a reprojection -- while
// the images come from the world-to-UV map. Two paths from one camera, which is what makes their agreement a
// check and not a tautology.
"use strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { opticalFlowCPU } from "./opticalFlow.mjs";
import { reconcileFlowCPU, reconciledPixelFieldCPU, reconcilePixelsCPU, SRC_APP, SRC_FLOW_BEAT, SRC_FLOW_ONLY } from "./flowReconcile.mjs";
import { motionVectorsCPU, mat4Invert, transform4 } from "./motionVectors.mjs";
import { viewProj } from "./rasterProbe.js";

let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const report = (s) => console.log(`  ----  ${s}`);
const threw = (fn) => { try { fn(); return null; } catch (e) { return e.message; } };

// ---- THE SCENE -------------------------------------------------------------------------------------------
const W = 64, H = 64, BLOCK = 8, TAN = Math.tan(0.5), ASP = 1, NEAR = 0.1, FAR = 100, DIST = 8;
/** The camera: eye at (ex, -DIST, 0), looking down +Y, right +X, up +Z -- motionVectors-selfcheck's rig. */
const VP = (ex) => viewProj([ex, -DIST, 0], [0, 1, 0], [1, 0, 0], [0, 0, 1], TAN, ASP, NEAR, FAR);
/** Pixels of screen per world unit on the wall. The scenes' known displacements are stated in world units. */
const PX_PER_UNIT = W / (2 * TAN * ASP * DIST);

// A smoothed non-periodic world texture. SMOOTHED on purpose: white noise gives a block matcher a SAD
// surface with no usable curvature, so the sub-pixel refinement v4675 built would have nothing to fit and
// the flow arm would be handicapped by the content rather than by the method.
const TW = 256, tex = new Float32Array(TW * TW);
{
    let s = 7;
    const rnd = () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    const raw = new Float32Array(TW * TW);
    for (let i = 0; i < TW * TW; i++) raw[i] = rnd();
    for (let y = 0; y < TW; y++) for (let x = 0; x < TW; x++) {
        let a = 0;
        for (let j = -2; j <= 2; j++) for (let i = -2; i <= 2; i++) a += raw[((y + j + TW) % TW) * TW + ((x + i + TW) % TW)];
        tex[y * TW + x] = a / 25;
    }
}
const sampleTex = (wx, wz) => {
    const fx = wx * 8 + 128, fy = wz * 8 + 128;
    const x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
    const g = (x, y) => tex[(((y % TW) + TW) % TW) * TW + (((x % TW) + TW) % TW)];
    return (g(x0, y0) * (1 - tx) + g(x0 + 1, y0) * tx) * (1 - ty) + (g(x0, y0 + 1) * (1 - tx) + g(x0 + 1, y0 + 1) * tx) * ty;
};
/** The wall through the camera at `ex`, with the texture slid `slide` world units in +x. */
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
/**
 * One scene. `dex` moves the camera, `slide` moves the texture. The PICTURE moves by (slide - dex) world
 * units, which is the truth frame generation needs; the application's vector describes -dex of it and
 * nothing of the slide.
 */
function scene({ dex = 0, slide = 0, margin = 0.05, levels = 2 } = {}) {
    const prev = render(0, 0), cur = render(dex, slide);
    const vpPrev = VP(0), vpCur = VP(dex);
    const mv = motionVectorsCPU(cur.depth, W, H, mat4Invert(vpCur), vpPrev);
    const of = opticalFlowCPU({ cur: cur.rgba, prev: prev.rgba, w: W, h: H, block: BLOCK, searchRadius: 4, levels });
    const rc = reconcileFlowCPU({ cur: cur.rgba, prev: prev.rgba, w: W, h: H, ...of,
                                  motion: mv.data, depth: cur.depth, margin });
    return { prev, cur, mv, of, rc, truthX: (slide - dex) * PX_PER_UNIT, n: rc.bw * rc.bh };
}
/** Mean distance from a block field to the scene's one true vector, in pixels. */
const meanErr = (field, n, tx) => { let e = 0; for (let i = 0; i < n; i++) e += Math.hypot(field[i * 2] - tx, field[i * 2 + 1]); return e / n; };

console.log("\n1. THE TWO FIELDS POINT IN OPPOSITE DIRECTIONS, AND opticalFlow.mjs's HEADER SAID THEY DID NOT");
{
    // *** MEASURED, NOT READ OFF THE COMMENTS. *** From v4673 to v4675 opticalFlow.mjs's header said its
    // negation put its output in "the same sense render/motionVectors.mjs uses". Both fields are computed
    // here for ONE displacement and compared; the header is corrected in this same commit.
    const g = scene({ dex: 0.437 });
    // the application's per-pixel vector, in pixels, in ITS OWN sense (uvPrev - uvCurr, cur -> prev)
    const appOwnSense = g.mv.data[(32 * W + 32) * 4] * W;
    const flowOut = g.of.flow[(4 * g.rc.bw + 4) * 2];
    report(`camera slid +0.437 world units: the picture moved ${g.truthX.toFixed(4)} px`);
    report(`motionVectorsCPU says ${appOwnSense.toFixed(4)} px (its own sense);  opticalFlowCPU says ${flowOut.toFixed(4)} px`);
    ok("*** the two fields are NEGATIVES of each other, which is the opposite of what opticalFlow's header claimed for three rounds ***",
       appOwnSense * flowOut < 0 && Math.abs(appOwnSense + flowOut) < 0.6,
       `app ${appOwnSense.toFixed(4)}, flow ${flowOut.toFixed(4)}, sum ${(appOwnSense + flowOut).toFixed(4)} -- a sum near zero and a product below it`);
    ok("...and it is the FLOW's sense that matches the picture's forward motion, so that is the sense the reconciled field keeps",
       Math.sign(flowOut) === Math.sign(g.truthX),
       `picture moved ${g.truthX.toFixed(4)} px, flow reports ${flowOut.toFixed(4)}, application reports ${appOwnSense.toFixed(4)}`);
    // and the reconciled output is in that same sense, having negated the application on the way in
    const app0 = g.rc.appFlow[(4 * g.rc.bw + 4) * 2];
    ok("...and reconcileFlowCPU's `appFlow` is the application's vector brought INTO that sense, at one site",
       Math.abs(app0 + appOwnSense) < 1e-4, `appFlow ${app0.toFixed(4)} against the application's own ${appOwnSense.toFixed(4)}`);
}

console.log("\n2. THE SCENE WHERE THE APPLICATION IS EXACTLY RIGHT AND THE FLOW IS GUESSING");
let geom;
{
    geom = scene({ dex: 0.437 });
    const eApp = meanErr(geom.rc.appFlow, geom.n, geom.truthX);
    const eFlow = meanErr(geom.of.flow, geom.n, geom.truthX);
    const eRec = meanErr(geom.rc.flow, geom.n, geom.truthX);
    report(`truth ${geom.truthX.toFixed(4)} px;  mean |err| app ${eApp.toFixed(4)}  flow ${eFlow.toFixed(4)}  reconciled ${eRec.toFixed(4)} px`);
    report(`sources: ${geom.rc.counts.app} application, ${geom.rc.counts.flowBeat} flow-beat, ${geom.rc.counts.flowOnly} flow-only, of ${geom.n}`);
    ok("the application's vector is EXACT here -- it is a reprojection, not an estimate, and the independent world-to-UV render agrees with it to Float32",
       eApp < 1e-3, `mean |err| ${eApp.toExponential(3)} px over ${geom.n} blocks`);
    ok("*** and the reconciled field keeps it: the pass takes the application on the large majority of blocks and lands an order of magnitude closer to the truth than the flow alone ***",
       geom.rc.counts.app > geom.n * 0.9 && eRec < eFlow / 10,
       `${geom.rc.counts.app}/${geom.n} application; ${eRec.toFixed(4)} px against the flow's ${eFlow.toFixed(4)} -- ${(eFlow / eRec).toFixed(0)}x`);
}

console.log("\n3. THE SCENE WHERE THE APPLICATION IS SILENT AND CONFIDENT, WHICH IS WHY FSR3 HAS THIS PASS AT ALL");
let shade;
{
    // Static camera, sliding texture: a shadow crossing a wall, a scrolling material, a reflection tracking.
    // The geometry did not move, so every application vector is EXACTLY zero and every `valid` is 1.
    shade = scene({ slide: 0.437 });
    let worstApp = 0, invalid = 0;
    for (let i = 0; i < W * H; i++) {
        if (!shade.mv.data[i * 4 + 2]) { invalid++; continue; }
        worstApp = Math.max(worstApp, Math.abs(shade.mv.data[i * 4]), Math.abs(shade.mv.data[i * 4 + 1]));
    }
    const eApp = meanErr(shade.rc.appFlow, shade.n, shade.truthX);
    const eFlow = meanErr(shade.of.flow, shade.n, shade.truthX);
    const eRec = meanErr(shade.rc.flow, shade.n, shade.truthX);
    report(`the application's field is zero to ${worstApp.toExponential(2)} on all ${W * H} pixels, ${invalid} invalid -- and the picture moved ${shade.truthX.toFixed(4)} px`);
    report(`mean |err| app ${eApp.toFixed(4)}  flow ${eFlow.toFixed(4)}  reconciled ${eRec.toFixed(4)} px`);
    report(`sources: ${shade.rc.counts.app} application, ${shade.rc.counts.flowBeat} flow-beat, ${shade.rc.counts.flowOnly} flow-only, of ${shade.n}`);
    ok("the application reports zero motion on every pixel with valid = 1 -- it is not uncertain, it is wrong, and nothing in its own output says so",
       worstApp < 1e-6 && invalid === 0, `worst ${worstApp.toExponential(3)}, ${invalid} invalid`);
    ok("*** and the reconciled field overrules it on EVERY block, landing within a third of a pixel where the application is wrong by the whole displacement ***",
       shade.rc.counts.flowBeat === shade.n && eRec < 0.5 && eApp > 3,
       `${shade.rc.counts.flowBeat}/${shade.n} flow; reconciled ${eRec.toFixed(4)} px against the application's ${eApp.toFixed(4)}`);
    ok("*** NEITHER ARM PASSES BOTH SCENES AND THE RECONCILED FIELD PASSES BOTH -- which is the entire claim of this pass ***",
       eRec < meanErr(shade.rc.appFlow, shade.n, shade.truthX)
       && meanErr(geom.rc.flow, geom.n, geom.truthX) < meanErr(geom.of.flow, geom.n, geom.truthX),
       `geometry scene: reconciled ${meanErr(geom.rc.flow, geom.n, geom.truthX).toFixed(4)} < flow ${meanErr(geom.of.flow, geom.n, geom.truthX).toFixed(4)};  ` +
       `shader scene: reconciled ${eRec.toFixed(4)} < application ${eApp.toFixed(4)}`);
}

console.log("\n4. THE SELECTION BIAS IS REAL, AND `margin` IS MEASURED AGAINST IT RATHER THAN ASSERTED");
{
    // *** THE FLOW ARM WAS FITTED ON THE STATISTIC THAT JUDGES IT. *** opticalFlowCPU minimised SAD over 81
    // candidates per block; the application got one shot. On the geometry scene the application is exactly
    // right, so EVERY block the flow takes is a block it stole, and the count is the bias's size in blocks.
    const sweep = [0, 0.02, 0.05, 0.10, 0.20].map((m) => {
        const s = scene({ dex: 0.437, margin: m });
        return { m, ...s.rc.counts, err: meanErr(s.rc.flow, s.n, s.truthX), n: s.n };
    });
    for (const r of sweep) report(`margin ${r.m.toFixed(2)}   application ${String(r.app).padStart(2)}  flow ${String(r.flowBeat).padStart(2)}   mean |err| ${r.err.toFixed(4)} px`);
    const naive = sweep[0], shipped = sweep.find((r) => r.m === 0.05), wide = sweep.find((r) => r.m === 0.10);
    ok("*** at margin 0 the flow takes blocks from an application that is EXACTLY right, so the naive lower-SAD-wins rule is measurably biased and not merely arguably so ***",
       naive.flowBeat > 0 && naive.err > 0,
       `${naive.flowBeat}/${naive.n} blocks stolen, mean |err| ${naive.err.toFixed(4)} px against the application's 0`);
    ok("...and the margin monotonically buys them back, which is what it is for",
       sweep.every((r, i) => i === 0 || r.flowBeat <= sweep[i - 1].flowBeat) && shipped.err < naive.err,
       `flow blocks ${sweep.map((r) => r.flowBeat).join(" -> ")} as margin goes ${sweep.map((r) => r.m).join(" -> ")}`);
    // *** AND THE COST ON THE OTHER SIDE IS MEASURED TOO, OR THE MARGIN WOULD BE FREE, WHICH NOTHING IS. ***
    const other = [0.05, 0.10, 0.20, 0.50, 0.90].map((m) => {
        const s = scene({ slide: 0.437, margin: m });
        return { m, ...s.rc.counts, err: meanErr(s.rc.flow, s.n, s.truthX), n: s.n };
    });
    for (const r of other) report(`shader scene, margin ${r.m.toFixed(2)}   application ${String(r.app).padStart(2)}  flow ${String(r.flowBeat).padStart(2)}   mean |err| ${r.err.toFixed(4)} px`);
    ok("...and on the scene where the application is silent the margin costs NOTHING until it is very large, so the two sides of the trade are not symmetric",
       other.filter((r) => r.m <= 0.20).every((r) => r.flowBeat === r.n) && other[other.length - 1].app > 0,
       `flow keeps every block to margin 0.20 and loses ${other[other.length - 1].app}/${other[other.length - 1].n} of them at 0.90`);
    // *** WHAT THIS SWEEP DOES NOT DO IS SET THE DEFAULT, AND SAYING SO IS THE POINT OF THIS ROW. ***
    ok("*** the shipped default is NOT tuned on this sweep, and this row exists so that a later round cannot pretend it was ***",
       shipped.m === 0.05 && wide.flowBeat === 0,
       `0.10 zeroes the theft on this ONE synthetic scene at ONE displacement, 64 blocks. That is a data point, not a calibration, ` +
       `and a default chosen from it would be fitted to a wall with a smoothed noise texture. The shipped 0.05 is a declared prior; ` +
       `where it could honestly be set is a paired measurement on fsr.html, which is the round that wires this pass.`);
}

console.log("\n5. WHAT PROTECTS THE FLAT REGION -- AND IT IS NOT `conf`");
{
    // opticalFlow.mjs's header warns that a caller reading its vectors without `conf` is confidently wrong
    // across every flat region. This pass never reads `conf`. What answers the warning is the comparison
    // being STRICTLY better: on flat content every candidate ties, so the challenger cannot clear the bar.
    const flat = new Float32Array(W * H * 4);
    for (let i = 0; i < W * H; i++) { flat[i * 4] = 0.4; flat[i * 4 + 1] = 0.4; flat[i * 4 + 2] = 0.4; flat[i * 4 + 3] = 1; }
    const of = opticalFlowCPU({ cur: flat, prev: flat, w: W, h: H, block: BLOCK, searchRadius: 4, levels: 1 });
    const motion = new Float32Array(W * H * 4), depth = new Float32Array(W * H).fill(0.5);
    for (let i = 0; i < W * H; i++) { motion[i * 4] = -2 / W; motion[i * 4 + 2] = 1; }
    const rc = reconcileFlowCPU({ cur: flat, prev: flat, w: W, h: H, ...of, motion, depth, margin: 0 });
    let maxConf = 0; for (let i = 0; i < of.bw * of.bh; i++) maxConf = Math.max(maxConf, of.conf[i]);
    report(`uniform grey pair, ${rc.bw * rc.bh} blocks: flow confidence at most ${maxConf}; sadApp ${rc.sadApp[0]}, sadFlow ${rc.sadFlow[0]}`);
    ok("*** on content with no signal at all the application keeps every block AT MARGIN ZERO, because the challenger must be STRICTLY better and a tie is not ***",
       rc.counts.app === rc.bw * rc.bh && rc.counts.flowBeat === 0 && maxConf === 0,
       `${rc.counts.app}/${rc.bw * rc.bh} application, ${rc.counts.flowBeat} flow, every block reporting confidence 0`);
    ok("...and the reconciled vector there IS the application's, not a plausible-looking zero from a search that saw nothing",
       Math.abs(rc.flow[0] - 2) < 1e-6 && rc.source[0] === SRC_APP,
       `flow[0] ${rc.flow[0]} against the application's +2 px, source ${rc.source[0]}`);
}

console.log("\n6. THE BLOCK'S APPLICATION VECTOR IS ITS NEAREST PIXEL'S -- dilate.mjs's RULE AT BLOCK SCALE");
{
    let s = 3; const rnd = () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    const img = new Float32Array(W * H * 4);
    for (let i = 0; i < W * H; i++) { const c = rnd(); img[i * 4] = c; img[i * 4 + 1] = c; img[i * 4 + 2] = c; img[i * 4 + 3] = 1; }
    const of = opticalFlowCPU({ cur: img, prev: img, w: W, h: H, block: BLOCK, searchRadius: 4, levels: 1 });
    // every block straddles a silhouette: its left half is NEARER and moving slowly, its right half is far
    // and moving fast. Their mean is +3.5, which describes neither surface.
    const motion = new Float32Array(W * H * 4), depth = new Float32Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const i = y * W + x, near = (x % BLOCK) < BLOCK / 2;
        motion[i * 4] = (near ? -1 : -6) / W; motion[i * 4 + 2] = 1;
        depth[i] = near ? 0.2 : 0.9;
    }
    const a = reconcileFlowCPU({ cur: img, prev: img, w: W, h: H, ...of, motion, depth });
    const b = reconcileFlowCPU({ cur: img, prev: img, w: W, h: H, ...of, motion, depth, nearerIsLess: false });
    ok("*** a block straddling a silhouette takes the NEARER surface's vector, not the two surfaces' mean, which would describe no surface at all ***",
       Math.abs(a.appFlow[0] - 1) < 1e-4, `appFlow ${a.appFlow[0]} -- nearer surface +1, farther +6, mean +3.5`);
    ok("...and `nearerIsLess` reverses it, so the flag is load-bearing rather than a parameter nothing reads",
       Math.abs(b.appFlow[0] - 6) < 1e-4, `with nearerIsLess false: ${b.appFlow[0]}`);
}

console.log("\n7. \"THE FLOW WON\" IS TWO DIFFERENT THINGS AND THE CODES SAY WHICH");
{
    let s = 9; const rnd = () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    const img = new Float32Array(W * H * 4);
    for (let i = 0; i < W * H; i++) { const c = rnd(); img[i * 4] = c; img[i * 4 + 1] = c; img[i * 4 + 2] = c; img[i * 4 + 3] = 1; }
    const of = opticalFlowCPU({ cur: img, prev: img, w: W, h: H, block: BLOCK, searchRadius: 4, levels: 1 });
    const motion = new Float32Array(W * H * 4), depth = new Float32Array(W * H).fill(0.5);
    for (let i = 0; i < W * H; i++) { motion[i * 4] = -2 / W; motion[i * 4 + 2] = 1; }
    // block 0 entirely invalid; block 1 invalid but for one pixel, which says +5
    for (let y = 0; y < BLOCK; y++) for (let x = 0; x < 2 * BLOCK; x++) motion[(y * W + x) * 4 + 2] = 0;
    { const j = 3 * W + BLOCK + 4; motion[j * 4 + 2] = 1; motion[j * 4] = -5 / W; }
    const rc = reconcileFlowCPU({ cur: img, prev: img, w: W, h: H, ...of, motion, depth });
    // the frames are IDENTICAL, so the flow reports zero motion with SAD 0 and takes every block it can
    report(`identical frames, application claiming +2 px everywhere: ${rc.counts.app} application, ${rc.counts.flowBeat} flow-beat, ${rc.counts.flowOnly} flow-only`);
    ok("*** a block the application could not answer reports SRC_FLOW_ONLY, not SRC_FLOW_BEAT -- the two hold the same vector and mean opposite things ***",
       rc.source[0] === SRC_FLOW_ONLY && rc.counts.flowOnly === 1 && rc.counts.flowBeat === rc.bw * rc.bh - 1,
       `source[0] ${rc.source[0]} (flow-only ${SRC_FLOW_ONLY}, flow-beat ${SRC_FLOW_BEAT}); ${rc.counts.flowOnly} of ${rc.bw * rc.bh} unanswerable`);
    ok("...and its `appFlow` and `sadApp` are NaN rather than zero, so a caller reading them gets arithmetic it cannot mistake for a measurement",
       Number.isNaN(rc.appFlow[0]) && Number.isNaN(rc.appFlow[1]) && Number.isNaN(rc.sadApp[0]),
       `appFlow (${rc.appFlow[0]}, ${rc.appFlow[1]}), sadApp ${rc.sadApp[0]}`);
    ok("...and a block with ONE valid pixel among 63 invalid ones uses that pixel, rather than falling back to a centre that has no answer",
       Math.abs(rc.appFlow[2] - 5) < 1e-4 && rc.source[1] !== SRC_FLOW_ONLY,
       `appFlow ${rc.appFlow[2]} from the single valid pixel's +5, source ${rc.source[1]}`);
}

console.log("\n8. WHAT IT REFUSES");
{
    const base = () => ({ cur: new Float32Array(W * H * 4), prev: new Float32Array(W * H * 4), w: W, h: H,
                          flow: new Float32Array(8 * 8 * 2), conf: new Float32Array(64), bw: 8, bh: 8, block: BLOCK,
                          motion: new Float32Array(W * H * 4), depth: new Float32Array(W * H) });
    ok("a fractional block is refused", /whole number of pixels/.test(threw(() => reconcileFlowCPU({ ...base(), block: 8.5 })) || ""),
       threw(() => reconcileFlowCPU({ ...base(), block: 8.5 })));
    ok("a block grid that does not cover the frame is refused, with both shapes named",
       /does not cover the frame/.test(threw(() => reconcileFlowCPU({ ...base(), bw: 7 })) || ""),
       threw(() => reconcileFlowCPU({ ...base(), bw: 7 })));
    ok("a margin outside [0, 1) is refused -- at 1 the challenger can never win and the pass would silently become a pass-through",
       /margin must be in/.test(threw(() => reconcileFlowCPU({ ...base(), margin: 1 })) || "")
       && /margin must be in/.test(threw(() => reconcileFlowCPU({ ...base(), margin: -0.1 })) || ""),
       threw(() => reconcileFlowCPU({ ...base(), margin: 1 })));
    ok("a missing depth buffer is refused rather than silently switched to a centre-pixel rule",
       /depth must be w\*h/.test(threw(() => reconcileFlowCPU({ ...base(), depth: null })) || ""),
       threw(() => reconcileFlowCPU({ ...base(), depth: null })));
    ok("a three-channel motion buffer is refused, naming all four channels",
       /du, dv, valid, zPrev/.test(threw(() => reconcileFlowCPU({ ...base(), motion: new Float32Array(W * H * 3) })) || ""),
       threw(() => reconcileFlowCPU({ ...base(), motion: new Float32Array(W * H * 3) })));
}

console.log("\n9. v4741 -- PER PIXEL, FOR A GENERATOR THAT SPLATS ONE VECTOR A PIXEL");
{
    // reconciledPixelFieldCPU: the block's decision, each pixel's own vector where the application kept the block
    const g = scene({ dex: 0.437 }), sh = scene({ slide: 0.437 });
    const F = reconciledPixelFieldCPU({ rc: sh.rc, motion: sh.mv.data, depth: sh.cur.depth, w: W, h: H });
    let blockV = 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = y * W + x, b = Math.floor(y / BLOCK) * sh.rc.bw + Math.floor(x / BLOCK);
        if (sh.rc.source[b] !== SRC_APP && F[i * 4] === sh.rc.flow[b * 2] && F[i * 4 + 3] === 1) blockV++; }
    ok("reconciledPixelFieldCPU carries a flow block's vector to every pixel of it, valid, on the sliding texture",
       blockV === W * H && sh.rc.counts.flowBeat === sh.n, `${blockV} of ${W * H} pixels; render/flowReconcileTsl-selfcheck.mjs holds the application's side, pixel by pixel`);
    // reconcilePixelsCPU at its default margins: the camera scene is the application's everywhere, the slide the flow's
    // away from the edge the new content enters at. v4745: the slide's vectors are exactly zero -- the wall did not move on
    // screen -- so it is judged at `marginStill`, 0.5, and 0.9 is asked for by name
    const args = (sc) => ({ cur: sc.cur.rgba, prev: sc.prev.rgba, w: W, h: H, flow: sc.of.flow, bw: sc.of.bw, bh: sc.of.bh, block: BLOCK, motion: sc.mv.data, depth: sc.cur.depth });
    const pg = reconcilePixelsCPU(args(g)), ps = reconcilePixelsCPU(args(sh));
    const innerOf = (r) => { let n = 0; for (let y = 8; y < H - 8; y++) for (let x = 8; x < W - 8; x++) if (r.source[y * W + x] === SRC_FLOW_BEAT) n++; return n; };
    let lead = 0, leadN = 0, innerN = 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = y * W + x;
        if (x < 4) { leadN++; if (ps.source[i] === SRC_APP) lead++; } else if (x >= 8 && x < W - 8 && y >= 8 && y < H - 8) innerN++; }
    report(`per pixel at the defaults: the camera scene ${pg.counts.app}/${pg.counts.flowBeat}/${pg.counts.flowOnly}, the slide ${ps.counts.app}/${ps.counts.flowBeat}/${ps.counts.flowOnly} (kept / beaten / alone)`);
    const inner = innerOf(ps), inner9 = innerOf(reconcilePixelsCPU({ ...args(sh), marginStill: 0.9 })), innerLow = innerOf(reconcilePixelsCPU({ ...args(sh), margin: 0.05, marginStill: 0.05 }));
    ok("*** reconcilePixelsCPU keeps the application's exact vector at every pixel where the CAMERA moved, and gives the flow over half the slide's interior ***",
       pg.counts.app === W * H && inner9 > innerN / 2 && inner > inner9 && innerLow >= inner,
       `${pg.counts.app} of ${W * H} kept on the camera scene; ${inner} of ${innerN} interior pixels of the slide to the flow at its default (the still surface's 0.5), ${inner9} at 0.9, ${innerLow} at 0.05. ` +
       "The margin asks for a window explained so many times better, and on this wall's near-pixel-scale texture a 3 x 3 window often is not -- the pixels it leaves keep a vector of zero, which is the vectors-only answer; the reasons for 0.9 and 0.5 are measurements, in the function's own note");
    // v4745: which margin a pixel gets is read off ITS OWN vector. The camera scene's are 3.2 pixels, so a marginStill of
    // 0.05 changes nothing there -- unless stillPx is raised past them, when the exact vectors are handed to the flow
    const gStill = reconcilePixelsCPU({ ...args(g), marginStill: 0.05 }), gAll = reconcilePixelsCPU({ ...args(g), marginStill: 0.05, stillPx: 10 });
    ok("  ...and v4745's still-surface margin is chosen by the pixel's OWN vector: 0.05 for still surfaces leaves the moving camera scene untouched, and the same 0.05 with every vector counted still hands the flow what it does not deserve",
       gStill.counts.app === W * H && gAll.counts.flowBeat > W * H / 10,
       `${gStill.counts.app} of ${W * H} kept with marginStill 0.05; ${gAll.counts.flowBeat} beaten when stillPx is 10 pixels and the camera's 3.2-pixel vectors count as still`);
    ok("...and the slide's LEADING edge stays the application's, because the flow's evidence there was read off the frame",
       lead === leadN, `${lead} of ${leadN} pixels in the first four columns: the texture moves right 3.2 pixels, so their windows carried back along the flow start left of pixel 0`);
    const threwP = (patch) => threw(() => reconcilePixelsCPU({ ...args(g), ...patch })) || "";
    ok("...and it refuses what its block sibling refuses, a window wider than nine pixels, and a still-surface margin or threshold that is not one",
       /whole number of pixels, at least 2/.test(threwP({ block: 8.5 })) && /margin must be in/.test(threwP({ margin: 1 })) && /radius must be a whole number/.test(threwP({ radius: 5 }))
       && /does not cover the frame/.test(threwP({ bw: 7 })) && /marginStill must be in/.test(threwP({ marginStill: 1 })) && /marginStill must be in/.test(threwP({ marginStill: null }))
       && /stillPx must be/.test(threwP({ stillPx: -1 })), `${threwP({ radius: 5 })} | ${threwP({ stillPx: -1 })}`);
}

// ---- THE SABOTAGE LOG ------------------------------------------------------------------------------------
//
// *** A CONTROL THAT CANNOT FAIL IS DECORATION, SO EVERY ROW ABOVE WAS BROKEN ON PURPOSE AND WATCHED. ***
// Eleven mutations, each reverted. Every row in this file is reddened by at least one of them.
//
//   X1  the application's vector is NOT negated on the way in            -> 10 red (1, 2, 4, 5, 6, 7)
//   X2  `margin` is accepted and ignored (hardwired to 0)                ->  4 red (2, 4)
//   X3  the block speaks through its CENTRE pixel, not its nearest       ->  3 red (6, 7)
//   X4  flow-because-absent is recorded as flow-because-better           ->  1 red (7)
//   X5  the challenger wins ties instead of losing them (`<` -> `<=`)    ->  2 red (5)
//   X6  the score samples the nearest texel instead of bilinearly        ->  6 red (2, 3, 4, 7)
//   X7  the flow arm is scored in the wrong sense (`ox - fx` -> `ox + fx`) -> 4 red (3, 4)
//   X8  the aggregation ignores the `valid` channel                      ->  3 red (7)
//   X9  render/opticalFlow.mjs stops negating, so the two fields really  ->  7 red (1, 3, 4)
//       DO share a sense -- the only mutation outside this pass, and the
//       only one that can reach section 1's first two rows, because those
//       rows grade the two OTHER modules' conventions and not this one
//   X11 each of the five guards in turn                                  ->  1 red each (8)
//
// *** AND ONE MUTATION IS OF THE RIG, WHICH IS A WEAKER CLASS AND IS LABELLED AS ONE. ***
//
//   X10 the shader scene's camera is nudged by 0.001 world units         ->  1 red (3)
//
// Section 3's first row asserts a PREMISE of its own scene -- that the application really is silent -- rather
// than anything render/flowReconcile.mjs does, so no mutation of the pass can reach it. What reaches it is a
// mutation of the scene, and a thousandth of a world unit of camera movement is enough. That row is therefore
// a guard against this FILE lying to itself about what it is measuring, which is a real job and not the same
// job as the others.
//
// A first attempt at X10 leaked the texture slide into the world-point computation instead of into the
// camera, which moved the picture without moving the matrices: the application stayed genuinely silent, the
// row stayed green, and it was RIGHT to. Recorded because the near miss is the useful part -- a sabotage that
// scores 0 red because it did not touch what the row measures is not evidence about the row.

// ---- v4745 SABOTAGE LOG: THE STILL-SURFACE MARGIN ----------------------------------------------------------------
// Against reconcilePixelsCPU, here and in render/flowReconcileTsl-selfcheck.mjs:
//   M1  marginStill ignored, every pixel at `margin`           -> 2 here, 4 there
//   M2  the still test against stillPx, not its square         -> 1 here, 4 there
//   M3  a marginStill that is not a number accepted            -> 1 here, 0 there
// *** THE ROW M1 REDS FIRST WAS RED BEFORE IT WAS SABOTAGED. *** Section 9's headline compared the slide at "the default
// 0.9" with 0.05, and the slide's vectors are all zero: with the still-surface margin both calls ran at 0.5 and read the
// same 2300 pixels. The comparison now names 0.9 as marginStill, and a row of its own holds which margin a pixel gets.
// M3 is `null >= 0`, which JavaScript calls true: the first refusal let null through as a margin of zero.

console.log(`\nflowReconcile-selfcheck: ${fails ? `${fails} FAILED` : "ALL GREEN"}`);
console.log("unchecked here: THE DEVICE. render/opticalFlowGPU.mjs mirrors the search on WebGPU and this pass has no mirror, so " +
    "the reconciliation is CPU-only and a wired pipeline would have to read the flow back. TEMPORAL BEHAVIOUR: every row here is a " +
    "single pair of frames, and a selection that flickered between the two arms on alternate frames would pass all of them while " +
    "producing exactly the judder frame generation exists to remove. REAL CONTENT: a wall at constant depth with a smoothed noise " +
    "texture is the easiest thing either arm ever sees -- no silhouettes moving against a background, no rotation, no disocclusion, " +
    "and the nearest-pixel row constructs its silhouette by hand rather than rendering one. And FRAME INTERPOLATION, which is what " +
    "the reconciled field is FOR and still does not exist: nothing in this tree yet turns a motion field into a frame between two " +
    "frames, so every number here grades an input to a pass that has not been built.");
process.exit(fails ? 1 : 0);
