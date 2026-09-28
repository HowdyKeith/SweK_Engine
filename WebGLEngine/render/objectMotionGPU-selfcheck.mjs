#!/usr/bin/env node
// WebGLEngine/render/objectMotionGPU-selfcheck.mjs -- v4646
//
// Run: node render/objectMotionGPU-selfcheck.mjs
// RUNTIME: 779 ms median of five (758, 769, 779, 785, 793) -- it spawns a browser origin and a real adapter.
// Five samples rather than three because v4594 recorded a median of three as though it were a trend and the spread
// turned out to be wider than the number it reported.
//
// *** MOTION VECTORS FOR THINGS THAT MOVE. THE ARC HAS NEVER HAD ANY. ***
//
// render/motionVectors.mjs reprojects a depth buffer through the CAMERA's two matrices, which is exactly right
// for a surface that did not move and quietly wrong for one that did -- the vector it returns is well-formed,
// finite and valid, and points at the wrong pixel. Every temporal result in this arc was measured on fsr.html,
// where nothing moves but the camera, so nothing has paid for that yet.
//
// The two rows this gate is built on, measured before the module was written:
//
//     static camera, slab translating 0.30/frame   cameraOnly is 2.51 px from the truth
//     camera pans, slab still                      cameraOnly is 0.00 px from the truth (1.7e-8)
//
// The second row matters as much as the first: motionVectors.mjs is not broken, it is exact on its whole
// domain. This module covers the rest of the domain, and the gate holds BOTH -- the new path must beat the old
// one where objects move AND must be bit-identical to it where they do not.
//
// SABOTAGE, seven mutations, six caught on the first pass and the seventh caught THIS FIXTURE:
//   Y1  kernel reads invMVPCur[0] instead of invMVPCur[id]        0-RED at first; now FAIL, parity 5.96e-8 -> 1.31e-2
//   Y2  kernel clamps an out-of-range id to the last object       FAIL  the rejection row
//   Y3  kernel drops the intermediate perspective divide          FAIL  2 rows, parity to 4.06e-1
//   Y4  the two matrix tables swapped at the runner's bindings    FAIL  parity to 9.06e-2
//   Y5  objectMotionCPU clamps the id instead of rejecting it     FAIL  the rejection row
//   Y6  buildObjectMatrices' singular-model check removed         FAIL  the refusal row
//   Y7  kernel's ndc y flip removed                               FAIL  3 rows
//
// *** Y1 WAS A 0-RED AND THE FIXTURE WAS THE REASON. *** A kernel that ignored the id entirely on the CURRENT
// side passed every row, because the first draft gave the two objects models [IDENT, translate(0)] -- and
// translate(0) IS the identity, so both objects' current matrices were the same matrix and the invMVPCur[id]
// lookup was never exercised. Only the PREVIOUS table varied by id, which is why the "two objects get different
// vectors" row stayed green under the mutation and still does: it reads the prev table, which Y1 leaves alone.
// The repair is at the fixture below -- the same net motion split across BOTH frames, so both tables vary by id.
// The general shape is worth keeping: a table indexed by id is only under test if its entries DIFFER, and an
// identity written as an operation that happens to be the identity looks like it differs.
"use strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInEngineOrigin, webgpuSkipReason } from "../tools/ship/webgpuHarness.mjs";
import { motionVectorsCPU, mat4Invert, mat4Multiply, transform4 } from "./motionVectors.mjs";
import { objectMotionCPU, buildObjectMatrices } from "./objectMotion.mjs";
import { flattenMatrixTable } from "./objectMotionGPU.mjs";
import { viewProj } from "./rasterProbe.js";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const say = (l, n = "") => console.log(`  ----  ${l}${n ? "   " + n : ""}`);

// NON-SQUARE, because v4592's sabotage found a square fixture could not see a w/h swap.
const W = 96, H = 64, TAN = Math.tan(0.5), ASP = W / H;
const cam = (ex) => viewProj([ex, -4, 0], [0, 1, 0], [1, 0, 0], [0, 0, 1], TAN, ASP, 0.1, 100);
const IDENT = Float32Array.from([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
const translate = (tx) => Float32Array.from([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, tx, 0, 0, 1]);
const OBJ_DX = 0.30;
const vpCur = cam(0), vpPrev = cam(-0.2);

// a slab at y=3 over a band of the frame (object 1), background at y=9 (object 0)
const M0 = mat4Multiply(vpCur, IDENT);   // the band is measured in object-0 space; the slab keeps its own model below
const sxOf = (wx) => { const q = transform4(M0, wx, 3, 0, 1); return (q[0] / q[3] + 1) * 0.5 * W; };
const bandA = Math.min(sxOf(-1), sxOf(1)), bandB = Math.max(sxOf(-1), sxOf(1));
const zSlab = (() => { const q = transform4(M0, 0, 3, 0, 1); return q[2] / q[3]; })();
const zBack = (() => { const q = transform4(vpCur, 0, 9, 0, 1); return q[2] / q[3]; })();
const DEPTH = new Float32Array(W * H), IDS = new Uint32Array(W * H);
let slabPixels = 0;
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const on = x + 0.5 >= bandA && x + 0.5 < bandB;
    DEPTH[y * W + x] = on ? zSlab : zBack;
    IDS[y * W + x] = on ? 1 : 0;
    if (on) slabPixels++;
}
// *** THE MOVING OBJECT IS OFFSET IN BOTH FRAMES, NOT JUST THE PREVIOUS ONE, AND A SABOTAGE FOUND THAT. ***
// The first fixture used models [IDENT, translate(0)] -- and translate(0) IS the identity, so both objects had
// the SAME current matrix and the invMVPCur[id] lookup was never exercised. A kernel that ignored the id on the
// current side passed every row. Split across both frames instead: the net motion is the same OBJ_DX, and now
// each table genuinely varies by id.
const CUR_MODELS = [IDENT, translate(OBJ_DX / 2)];
const PREV_MODELS = [IDENT, translate(-OBJ_DX / 2)];
const MATS = buildObjectMatrices({ vpCur, vpPrev, models: CUR_MODELS, prevModels: PREV_MODELS });

/** The analytic answer for a pixel on object `id`: unproject through its current MVP, reproject through its previous. */
function truthAt(x, y, models, prevModels, id) {
    const u = (x + 0.5) / W, v = (y + 0.5) / H;
    const inv = mat4Invert(mat4Multiply(vpCur, models[id]));
    const prev = mat4Multiply(vpPrev, prevModels[id]);
    const p = transform4(inv, 2 * u - 1, 1 - 2 * v, DEPTH[y * W + x], 1);
    const q = transform4(prev, p[0] / p[3], p[1] / p[3], p[2] / p[3], 1);
    return [(q[0] / q[3] + 1) * 0.5 - u, (1 - q[1] / q[3]) * 0.5 - v];
}

console.log("objectMotionGPU-selfcheck -- motion vectors for things that move\n");

console.log("1. *** THE CAMERA-ONLY PATH IS EXACT ON ITS DOMAIN AND 2.5 PIXELS WRONG OFF IT ***");
{
    const camOnly = motionVectorsCPU(DEPTH, W, H, mat4Invert(vpCur), vpPrev);
    const objAware = objectMotionCPU({ depth: DEPTH, ids: IDS, w: W, h: H, ...MATS });

    let wCam = 0, wObj = 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        if (IDS[y * W + x] !== 1) continue;                       // the moving object's pixels only
        const i = y * W + x, [tu, tv] = truthAt(x, y, CUR_MODELS, PREV_MODELS, 1);
        wCam = Math.max(wCam, Math.abs(camOnly.data[i * 4] - tu), Math.abs(camOnly.data[i * 4 + 1] - tv));
        wObj = Math.max(wObj, Math.abs(objAware.data[i * 4] - tu), Math.abs(objAware.data[i * 4 + 1] - tv));
    }
    say("the moving object", `${slabPixels} pixels of ${W * H}, translating ${OBJ_DX} world units per frame`);
    ok("!! *** camera-only motion is WRONG on a moving object, by pixels rather than by epsilon ***",
       wCam * W > 1.0,
       `worst ${wCam.toExponential(3)} uv = ${(wCam * W).toFixed(2)} px. A temporal pass fetches history at ` +
       "uv + velocity, so this is the history landing two and a half pixels off the surface it is following. " +
       "The row is stated as a FLOOR -- if it ever drops below a pixel this fixture has stopped exercising " +
       "the thing the module exists for.");
    ok("!! *** ...and the object-aware path is the analytic answer ***",
       wObj * W < 1e-4,
       `worst ${wObj.toExponential(3)} uv = ${(wObj * W).toFixed(6)} px, against camera-only's ` +
       `${(wCam * W).toFixed(2)}. The residue is the f64 round trip through a matrix inverse, not a method.`);

    // *** AND THE OLD PATH MUST STILL BE EXACT WHERE IT WAS. *** A module that fixed moving objects by making
    // static ones worse would pass the row above and be a regression.
    const identMats = buildObjectMatrices({ vpCur, vpPrev, models: [IDENT], prevModels: [IDENT] });
    const asCamera = objectMotionCPU({ depth: DEPTH, ids: new Uint32Array(W * H), w: W, h: H, ...identMats });
    let floatDiff = 0, validDiff = 0;
    for (let i = 0; i < W * H * 4; i++) if (asCamera.data[i] !== camOnly.data[i]) floatDiff++;
    for (let i = 0; i < W * H; i++) if (asCamera.valid[i] !== camOnly.valid[i]) validDiff++;
    ok("!! *** with an IDENTITY model the two are BIT-IDENTICAL, so no convention was quietly redefined ***",
       floatDiff === 0 && validDiff === 0,
       `${floatDiff} of ${W * H * 4} floats and ${validDiff} of ${W * H} valid flags differ. The camera-only ` +
       "case IS this one with identity models -- same four conventions, same guards, same order -- and the " +
       "whole arc downstream reads those conventions, so equality here is exact or the claim is empty.");
}

console.log("\n2. THE TABLE, AND WHAT IT REFUSES");
{
    ok("!! an id off the end of the table is REJECTED and COUNTED, not clamped to object 0",
       (() => { const bad = new Uint32Array(W * H).fill(7);
                const r = objectMotionCPU({ depth: DEPTH, ids: bad, w: W, h: H, ...MATS });
                return r.outOfRange === W * H && r.valid.every((v) => v === 0); })(),
       "clamping would hand the pixel the FIRST object's motion -- a well-formed vector for the wrong surface, " +
       "which is the exact class of wrongness this module exists to remove.");
    ok("...and mismatched model/prevModel counts are refused at build time",
       (() => { try { buildObjectMatrices({ vpCur, vpPrev, models: [IDENT, IDENT], prevModels: [IDENT] }); return false; }
                catch { return true; } })(),
       "an object present in one frame and not the other has no motion vector, and pairing it with its " +
       "neighbour's matrix is a silent wrong answer rather than a missing one.");
    ok("...and a singular model matrix is refused rather than inverted to infinities",
       (() => { const zero = Float32Array.from([0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,1]);
                try { buildObjectMatrices({ vpCur, vpPrev, models: [zero], prevModels: [IDENT] }); return false; }
                catch (e) { return /singular/.test(e.message); } })(),
       "a zero scale on a model matrix does this, and mat4Invert returns null rather than a matrix of " +
       "infinities precisely so a caller can say which object it was.");
    ok("...and the flat table the GPU binding needs is 16 floats per object, built in ONE place",
       flattenMatrixTable([IDENT, translate(1)]).length === 32 &&
       flattenMatrixTable([translate(2)]).slice(12, 14).join(",") === "2,0",
       "objectMotion.mjs keeps the tables as arrays of Float32Array(16) so an off-by-sixteen reads as a " +
       "different object rather than as a crash; the flattening happens at the binding, once.");
}

console.log("\n3. ON THE DEVICE: the kernel against objectMotionCPU");
const skip = webgpuSkipReason();
if (skip) { console.log(`  SKIP  ${skip}`); say("*** NOT A PASS. *** Nothing here has run."); fails++; }
else {
    const r = await runInEngineOrigin({ engineRoot: ENG, args: {
        W, H, depth: Array.from(DEPTH), ids: Array.from(IDS),
        invCur: MATS.invMVPCur.map((m) => Array.from(m)), prev: MATS.mvpPrev.map((m) => Array.from(m)),
    }, script: `async (a) => {
        const { requestDevice } = await import("/gfx/device.js");
        const { ObjectMotionGPU } = await import("/render/objectMotionGPU.mjs");
        const cv = document.createElement("canvas"); cv.width = 8; cv.height = 8;
        const dev = await requestDevice(cv, { backend: "webgpu", offscreen: true });
        const errs = []; if (dev.gpu && dev.gpu.addEventListener) dev.gpu.addEventListener("uncapturederror", (e) => errs.push(String(e.error && e.error.message).slice(0, 200)));
        const G = new ObjectMotionGPU(dev);
        const invCur = a.invCur.map((m) => Float32Array.from(m)), prev = a.prev.map((m) => Float32Array.from(m));
        const out = await G.motion({ depth: new Float32Array(a.depth), ids: new Uint32Array(a.ids),
                                     w: a.W, h: a.H, invMVPCur: invCur, mvpPrev: prev });
        // the same call with every id off the end of the table: every pixel must come back invalid
        const bad = await G.motion({ depth: new Float32Array(a.depth), ids: new Uint32Array(a.W * a.H).fill(9),
                                     w: a.W, h: a.H, invMVPCur: invCur, mvpPrev: prev });
        let refused = null, emptyTable = null;
        try { new ObjectMotionGPU({ backend: "webgl2" }); } catch (e) { refused = String(e.message).slice(0, 130); }
        try { await G.motion({ depth: new Float32Array(a.depth), ids: new Uint32Array(a.W * a.H), w: a.W, h: a.H, invMVPCur: [], mvpPrev: [] }); }
        catch (e) { emptyTable = String(e.message).slice(0, 110); }
        return { out: Array.from(out.data), bad: Array.from(bad.data), refused, emptyTable, errs, backend: dev.backend,
                 adapter: (dev.adapterInfo && (dev.adapterInfo.description || dev.adapterInfo.vendor)) || "unknown" };
    }` });

    ok("the runner ran on a real WebGPU device", r.ok && r.result && r.result.backend === "webgpu" && (r.result.errs || []).length === 0,
       r.ok ? `${r.result && r.result.backend}, adapter ${r.result && r.result.adapter}; errors ${(r.result && r.result.errs || []).join(" | ")}`
            : (r.reason || (r.pageErrors || []).join("; ")));

    if (r.ok && r.result) {
        const G = r.result;
        const C = objectMotionCPU({ depth: DEPTH, ids: IDS, w: W, h: H, ...MATS });
        let worst = 0, movingWorst = 0;
        for (let i = 0; i < W * H; i++) {
            for (let c = 0; c < 4; c++) worst = Math.max(worst, Math.abs(G.out[i * 4 + c] - C.data[i * 4 + c]));
            if (IDS[i] === 1) movingWorst = Math.max(movingWorst, Math.abs(G.out[i * 4] - C.data[i * 4]));
        }
        ok(`*** motion() is objectMotionCPU's field, to ${worst.toExponential(2)}, over TWO objects with different motion ***`,
           worst < 1e-5,
           `worst ${worst.toExponential(3)} over ${W * H * 4} floats at ${W}x${H} -- f32 on the device against ` +
           `f64 in JS through two matrix transforms and two divides. ${slabPixels} of those pixels belong to ` +
           "the moving object and take a different matrix pair from their neighbours, which is the whole point " +
           "of the id buffer: a single-object fixture would exercise none of it.");
        // *** THE TWO OBJECTS MUST ACTUALLY GET DIFFERENT VECTORS, AND THE FIRST DRAFT OF THIS ROW DID NOT SAY
        // SO. *** It compared each moving pixel against its wrapped-around neighbour and asked whether ANY pair
        // differed -- which two objects sharing one motion field would also satisfy, since a perspective camera
        // gives neighbouring pixels slightly different vectors anyway. What separates the two objects is the
        // MEAN over each set, and the gap has to be bigger than the spread within either set or it is noise.
        const meanDu = (want) => { let s = 0, n = 0;
            for (let i = 0; i < W * H; i++) if (IDS[i] === want) { s += G.out[i * 4]; n++; }
            return s / n; };
        const m0 = meanDu(0), m1 = meanDu(1);
        const spread = (want) => { let lo = Infinity, hi = -Infinity;
            for (let i = 0; i < W * H; i++) if (IDS[i] === want) { lo = Math.min(lo, G.out[i * 4]); hi = Math.max(hi, G.out[i * 4]); }
            return hi - lo; };
        const gap = Math.abs(m1 - m0), widest = Math.max(spread(0), spread(1));
        ok("!! ...and the two objects really do get DIFFERENT vectors, so the id buffer is not decoration",
           gap > widest,
           `mean du: background ${m0.toExponential(3)}, moving object ${m1.toExponential(3)} -- a gap of ` +
           `${gap.toExponential(3)} against the widest within-object spread of ${widest.toExponential(3)}. ` +
           "An id buffer every pixel ignored would give both sets ONE field and collapse that gap to inside " +
           "the spread, which the first draft of this row -- a neighbour comparison -- would not have noticed.");
        ok("!! ...and every pixel with an out-of-range id comes back INVALID on the device too",
           (() => { for (let i = 0; i < W * H; i++) if (G.bad[i * 4 + 2] !== 0) return false; return true; })(),
           "valid = 0 in channel 2 for all " + W * H + " pixels. The kernel counts nothing -- v4591's rule, an " +
           "uncounted quantity reported as zero is worse than not reported -- so the rejection is visible " +
           "where every consumer already reads validity from.");
        ok("...and an EMPTY table is refused rather than rejecting every pixel silently",
           typeof G.emptyTable === "string" && /empty matrix table/.test(G.emptyTable), G.emptyTable || "it did NOT throw");
        ok("...and the device refusal is DRIVEN: a non-webgpu device throws at construction",
           typeof G.refused === "string" && /webgpu/.test(G.refused), G.refused || "it did NOT throw");
    }
}

console.log(fails ? `\nobjectMotionGPU-selfcheck: ${fails} FAILED` : "\nobjectMotionGPU-selfcheck: ALL GREEN");
console.log("unchecked here: where the ID BUFFER COMES FROM -- this module consumes one and nothing in the tree " +
            "rasterises one yet, which is the next rung and the reason fsr.html still uses the camera-only path; " +
            "SKINNED and deforming geometry, whose motion is per-VERTEX and cannot be carried by a per-object " +
            "matrix at all; and the count of rejected pixels on the device, which wants an atomic buffer the way " +
            "render/temporalAccumulateWgsl.mjs got one at v4591.");
process.exit(fails ? 1 : 0);
