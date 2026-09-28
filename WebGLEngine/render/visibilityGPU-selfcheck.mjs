#!/usr/bin/env node
// WebGLEngine/render/visibilityGPU-selfcheck.mjs -- v4648
//
// Run: node render/visibilityGPU-selfcheck.mjs
// RUNTIME: 870 ms median of five (836 862 870 875 927) -- it spawns a browser origin and a real adapter.
//
// *** THE ID BUFFER v4646 CONSUMED AND NOTHING PRODUCED. ***
//
// render/objectMotionGPU.mjs takes a per-pixel object id and turns it into motion vectors that are right for
// things that MOVE. Its gate's closing line named what was missing: "where the ID BUFFER COMES FROM -- this
// module consumes one and nothing in the tree rasterises one yet". Measured before this round started, over
// every .mjs and .js outside vendor: ZERO files mention an object id, primitive id or visibility buffer, and
// render/rasterProbe.js -- the tree's only rasteriser -- is a WebGL2 vertex/fragment pair that writes colour
// and depth and no identity at all.
//
// So the LAST SECTION of this gate is the point of the round: the ids this module produces are fed straight
// into objectMotionCPU, and the camera-only path is measured against the truth on a scene that was RASTERISED
// rather than hand-built. Every number A3 reported came from a fixture that declared its own id buffer.
//
// SABOTAGE, nine mutations. Eight are defects and ALL EIGHT ARE CAUGHT; the ninth turned out not to be a
// defect at all, which is a finding about this file's own header rather than about the gate:
//   V1  packKey spelled ((key << ID_BITS) | id) >>> 0   NO-OP, not a 0-RED -- see below
//   V1b the same WITHOUT the >>> 0                      FAIL  3 rows
//   V2  kernel DEPTH_STEPS drifts by one                FAIL  2 rows, every word differs
//   V3  kernel atomicMin -> atomicMax                   FAIL  4 rows, coverage 0 against 6144
//   V4  runner clears the buffer to 0, not EMPTY        FAIL  3 rows
//   V5  kernel packs the id into the HIGH bits          FAIL  3 rows
//   V6  kernel drops the w <= 0 rejection               0-RED at first; now FAIL, rejected 0 against 1
//   V7  kernel drops the ndc y flip                     0-RED at first; now FAIL, 3 rows
//   V8  kernel uses flat depth, not barycentric         0-RED at first; now FAIL, the one-step row
//   V9  CPU edge test accepts everything                FAIL  2 rows
//
// *** V1 IS A NO-OP AND NOT A 0-RED, AND THE DIFFERENCE MATTERS. *** The mutation applied and the gate stayed
// green because the rewritten line COMPUTES THE SAME NUMBER: measured at five depths spanning the range, the
// multiply and the shift-plus->>>0 are bit-identical. render/visibility.mjs's header claimed the multiply
// itself was load-bearing; it is not, the unsigned coercion is, and that header is corrected at its own site.
// A gate cannot be blamed for missing a change that did not happen -- but a header that told a reader the
// wrong thing had to be found by trying it.
//
// *** THE THREE 0-REDS WERE ALL THIS FIXTURE, AND ALL THREE ARE THE SAME SHAPE: AN AXIS WITH NO STRUCTURE
// ON IT. *** Both quads were fronto-parallel, so depth was CONSTANT across each (spread 0.00e+0 over 2,368
// and 3,776 pixels) and a flat per-triangle depth was indistinguishable from an interpolated one. The slab
// spanned the frame's full height, so the id buffer was exactly y-symmetric (0 of 6,144 ids differ under a
// vertical flip) and the y flip was invisible. And nothing in the DEVICE fixture crossed the eye, so the
// rejection count was compared 0 against 0 -- two agreeing absences. The repairs are recorded at the fixture
// site below. This is the THIRD round running that sabotage has found the fixture rather than the code:
// v4646's translate(0), v4647's scale = strength and its one-pixel features, and now these. The pattern has
// earned a name -- A CONTROL IS ONLY A CONTROL ALONG AN AXIS THE FIXTURE ACTUALLY VARIES.
"use strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInEngineOrigin, webgpuSkipReason } from "../tools/ship/webgpuHarness.mjs";
import { rasterVisibilityCPU, unpackVisibility, packKey, unpackId, unpackDepth,
         EMPTY, MAX_OBJECTS, NO_OBJECT, DEPTH_STEPS, ID_BITS } from "./visibility.mjs";
import { VISIBILITY_WGSL } from "./visibilityWgsl.mjs";
import { flattenMvps } from "./visibilityGPU.mjs";
import { buildObjectMatrices, objectMotionCPU } from "./objectMotion.mjs";
import { motionVectorsCPU, mat4Invert, mat4Multiply } from "./motionVectors.mjs";
import { viewProj } from "./rasterProbe.js";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const say = (l, n = "") => console.log(`  ----  ${l}${n ? "   " + n : ""}`);

// NON-SQUARE, because v4592's sabotage found a square fixture cannot see a w/h swap.
const W = 96, H = 64;
const TAN = Math.tan(0.5), ASP = W / H, NEAR = 0.1, FAR = 100;
const cam = (ex) => viewProj([ex, -6, 0], [0, 1, 0], [1, 0, 0], [0, 0, 1], TAN, ASP, NEAR, FAR);

// *** THE GEOMETRY IS OFF THE PIXEL CENTRES ON PURPOSE. *** The two mirrors run the same edge functions in
// f64 and f32, so an edge passing EXACTLY through a pixel centre is decided by the last bit and the coverage
// masks part company there -- the same class of thing as v4559's bounds tie, and not this gate's subject.
// The offsets below are irrational multiples of a pixel, so no edge lands on a centre and coverage is exact.
const J = 0.31830988618 / W;

/** A quad spanning [x0,x1] x [z0,z1], with y running from ya at x0 to yb at x1 -- TILTED when ya != yb. */
const quad = (ya, yb, x0, x1, z0, z1) => [
    x0, ya, z0,  x1, yb, z0,  x1, yb, z1,
    x0, ya, z0,  x1, yb, z1,  x0, ya, z1,
];
// *** THE FIXTURE'S SHAPE IS THREE SABOTAGE FINDINGS, NOT AN ARRANGEMENT. *** Its first draft was two
// fronto-parallel quads, and three kernel mutations scored ZERO failing rows against it:
//
//   * the background is TILTED (y runs 0 to -1.6 across x) because with both quads parallel to the image
//     plane the depth was CONSTANT across each -- measured, spread 0.00e+0 over 2,368 and 3,776 pixels -- so
//     replacing the barycentric depth interpolation with a flat per-triangle depth changed nothing at all.
//     A z-buffer fixture with no slope tests no interpolation.
//   * the slab does NOT span the frame's height. It used to: z from -2.1 to 1.9 against a visible half-extent
//     of 1.64 at that distance, so it was a vertical BAND and the id buffer was exactly y-symmetric --
//     measured, 0 of 6,144 ids differ under a vertical flip -- and dropping the kernel's ndc y flip was
//     invisible. It is the same lesson as the non-square fixture one rung up, generalised: a fixture with no
//     structure along an axis cannot see an error on that axis.
//   * object 2 crosses the eye, so the DEVICE path has a triangle to reject. The rejection was driven on the
//     CPU only and the device's count was compared 0 against 0, which is two agreeing absences.
const POS = new Float32Array([
    ...quad(0, -1.6, -6 + J, 6 + J, -6, 6),            // object 0: far, TILTED
    ...quad(-3, -3, -1.7 + J, 1.3 + J, -1.4, 0.3),     // object 1: near slab, inside the frame on BOTH axes
    0, -20, 0,  1, -20, 0,  1, 20, 0,                  // object 2: crosses the eye, must be refused whole
]);
const IDX = new Uint32Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]);
const TRI_OBJ = new Uint32Array([0, 0, 1, 1, 2]);
const Z_RANGE = [-1, 1];                       // rasterProbe's viewProj is GL-style -- motionVectors.mjs's header

const OBJ_DX = 0.42;
const IDENT = Float32Array.from([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
const translate = (tx) => Float32Array.from([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, tx, 0, 0, 1]);
// v4646's Y1: split the motion across BOTH frames so BOTH matrix tables vary by id. translate(0) IS identity.
const CUR_MODELS = [IDENT, translate(OBJ_DX / 2), IDENT];
const PREV_MODELS = [IDENT, translate(-OBJ_DX / 2), IDENT];

const vpCur = cam(0), vpPrev = cam(-0.25);
const mvpsCur = CUR_MODELS.map((m) => mat4Multiply(vpCur, m));
const cpu = rasterVisibilityCPU({ positions: POS, indices: IDX, triObject: TRI_OBJ, mvps: mvpsCur, w: W, h: H, zRange: Z_RANGE });
const cpuUn = unpackVisibility(cpu);

// ---- 1. THE PACKING, WHICH BOTH MIRRORS MUST AGREE ABOUT EXACTLY --------------------------------------------
console.log("\n1. THE PACKED WORD");
say("layout", `${ID_BITS} bits of id (${MAX_OBJECTS} objects, ${NO_OBJECT} reserved for "no object"), ` +
    `${32 - ID_BITS} of depth (${DEPTH_STEPS + 1} steps)`);
ok("!! *** the kernel's packing constants are the module's, to the digit ***",
   VISIBILITY_WGSL.includes(`const ID_BITS:u32 = ${ID_BITS}u;`)
   && VISIBILITY_WGSL.includes(`const MAX_OBJECTS:u32 = ${MAX_OBJECTS}u;`)
   && VISIBILITY_WGSL.includes(`const DEPTH_STEPS:f32 = ${DEPTH_STEPS}.0;`),
   "the three constants are DUPLICATED into the WGSL because a kernel cannot import, and a packing the two " +
   "mirrors disagree about is wrong on every pixel past the halfway depth while reading as a parity failure " +
   "rather than as a constant. This row is the import the language does not have.");
ok("!! ...and the packed word is UNSIGNED, which is the property and not the spelling",
   (() => {
       const near = packKey(0.99, 7);
       // the same arithmetic spelled with a shift, which is what a reader would write first
       const key = Math.floor(0.99 * DEPTH_STEPS);
       const shifted = key << ID_BITS;
       return near > 0 && near < 4294967296 && shifted < 0;
   })(),
   (() => { const key = Math.floor(0.99 * DEPTH_STEPS); return `packKey(0.99, 7) = ${packKey(0.99, 7)} while the ` +
     `same value spelled (key << ${ID_BITS}) is ${key << ID_BITS} -- NEGATIVE, because JavaScript's shift is a ` +
     "SIGNED 32-bit operator and WGSL's u32 shift is not. *** WHAT THIS ROW HOLDS IS THE UNSIGNED RESULT AND " +
     "NOT THE ABSENCE OF A SHIFT, and the distinction was MEASURED rather than assumed: rewriting packKey as " +
     "((key << ID_BITS) | id) >>> 0 is BIT-IDENTICAL at every depth tried and scores ZERO failing rows, " +
     "because >>> 0 undoes the sign. Drop the >>> 0 and THREE rows fail -- this one, the round trip and the " +
     "ordering. So the hazard lives in the coercion, and a row asserting \"no <<\" would have been a rule " +
     "about spelling wearing a correctness row's clothes."; })());
ok("...and pack/unpack round-trips the id exactly and the depth to within one step",
   (() => {
       for (const [d, id] of [[0, 0], [0.5, 1], [0.999999, 4094], [1, 3], [0.25, 2047]]) {
           const k = packKey(d, id);
           if (unpackId(k) !== id) return false;
           if (Math.abs(unpackDepth(k) - d) > 1 / DEPTH_STEPS) return false;
       }
       return true;
   })(), `five pairs; the depth step is ${(1 / DEPTH_STEPS).toExponential(3)}`);
ok("!! ...and that step is far below the tightest depth threshold this tree DERIVES",
   1 / DEPTH_STEPS < 0.0250250 / 4 / 1000,
   `${(1 / DEPTH_STEPS).toExponential(3)} against fsr.html's disocclusion threshold of ` +
   `${(0.0250250 / 4).toExponential(3)} -- a factor of ${Math.round((0.0250250 / 4) / (1 / DEPTH_STEPS))}. ` +
   "The quantisation is real and this is the number that says whether it matters, rather than a claim that " +
   "it does not.");
ok("...and an id outside the budget is REFUSED at pack time, not wrapped",
   (() => { try { packKey(0.5, MAX_OBJECTS); return false; } catch (e) { return /outside 0\.\./.test(e.message); } })(),
   "wrapping would silently relabel object 4096 as object 0, which is a well-formed id for the wrong surface.");

// ---- 2. THE CPU RASTERISER, AGAINST THINGS THAT ARE TRUE OF ANY RASTERISER -----------------------------------
console.log("\n2. THE CPU RASTERISER");
say("coverage", `${cpuUn.covered} of ${W * H} pixels covered; ${cpu.drawn} triangles drew, ${cpu.rejected} rejected`);
const idCount = {};
for (const v of cpuUn.ids) idCount[v] = (idCount[v] || 0) + 1;
say("ids", Object.entries(idCount).map(([k, n]) => `${k === String(NO_OBJECT) ? "empty" : "obj " + k}: ${n}`).join(", "));
ok("*** BOTH objects are visible and the near one OCCLUDES the far one ***",
   idCount[0] > 200 && idCount[1] > 200,
   `object 0 (far plane) ${idCount[0]}, object 1 (near slab) ${idCount[1]}. A fixture where the near object ` +
   "missed the frame, or covered it entirely, would make every occlusion row below vacuous.");
ok("!! ...and the near object wins the depth test WHERE THEY OVERLAP, which is the z-buffer working",
   (() => {
       // every object-1 pixel must be nearer than the far plane's depth at the same pixel
       const farOnly = rasterVisibilityCPU({ positions: POS, indices: IDX.slice(0, 6), triObject: TRI_OBJ.slice(0, 2), mvps: mvpsCur, w: W, h: H, zRange: Z_RANGE });
       const f = unpackVisibility(farOnly);
       let overlap = 0, nearer = 0;
       for (let i = 0; i < W * H; i++) {
           if (cpuUn.ids[i] === 1 && f.ids[i] === 0) { overlap++; if (cpuUn.depth[i] < f.depth[i]) nearer++; }
       }
       say("  overlap", `${overlap} pixels where the slab covers the plane, ${nearer} of them nearer`);
       return overlap > 200 && nearer === overlap;
   })(),
   "rendered the far plane ALONE and compared: every pixel the slab took from it is strictly nearer. A " +
   "rasteriser that wrote whichever triangle came last would pass a coverage row and fail this one.");
ok("...and order does not matter: reversing the triangle list gives the SAME buffer, bit for bit",
   (() => {
       const rIdx = new Uint32Array([12, 13, 14, 9, 10, 11, 6, 7, 8, 3, 4, 5, 0, 1, 2]);
       const rObj = new Uint32Array([2, 1, 1, 0, 0]);
       const r = rasterVisibilityCPU({ positions: POS, indices: rIdx, triObject: rObj, mvps: mvpsCur, w: W, h: H, zRange: Z_RANGE });
       for (let i = 0; i < W * H; i++) if (r.words[i] !== cpu.words[i]) return false;
       return true;
   })(),
   "an atomicMin over a packed key is order-independent BY CONSTRUCTION, which is the property the packing " +
   "exists for. The naive two-buffer form -- atomicMin the depth, then write the id where it matched -- is " +
   "not: two surfaces at bit-identical depth both match and the survivor is whichever thread ran last.");
ok("!! ...and on an EXACT depth tie the LOWER id wins, deterministically, which a z-buffer does not promise",
   (() => {
       // two coincident quads at the same plane, given to two different objects
       const tie = new Float32Array([...quad(-3, -3, -1, 1, -1, 1), ...quad(-3, -3, -1, 1, -1, 1)]);
       const r = rasterVisibilityCPU({ positions: tie, indices: new Uint32Array([0,1,2,3,4,5,6,7,8,9,10,11]),
           triObject: new Uint32Array([1, 1, 0, 0]),
           // *** BOTH IDS TAKE THE SAME MATRIX, WHICH THE FIRST DRAFT GOT WRONG AND THE ROW CAUGHT. ***
           // Passing mvpsCur gave object 1 the TRANSLATED model matrix, so the two quads were coincident in
           // object space and a fifth of a pixel apart in clip space -- 160 of 1760 pixels resolved to the
           // higher id and the row read as a tie-break failure when the fixture simply had no tie in it.
           mvps: [mvpsCur[0], mvpsCur[0]], w: W, h: H, zRange: Z_RANGE });
       const u = unpackVisibility(r);
       let covered = 0, lower = 0;
       for (let i = 0; i < W * H; i++) if (r.words[i] !== EMPTY) { covered++; if (u.ids[i] === 0) lower++; }
       say("  tie", `${covered} coincident pixels, ${lower} resolved to the lower id`);
       return covered > 200 && lower === covered;
   })(),
   "object 1's triangles are listed FIRST and object 0 still wins every pixel, because the id sits in the low " +
   "bits of the same word the depth is compared on. This is more determinism than hardware offers, and it is " +
   "the reason the two fields share a word rather than two buffers.");
ok("...and a triangle crossing the eye is REJECTED WHOLE and COUNTED, not projected",
   (() => {
       const behind = new Float32Array([...quad(0, 0, -6, 6, -6, 6), 0, -20, 0,  1, -20, 0,  1, 20, 0]);
       const r = rasterVisibilityCPU({ positions: behind, indices: new Uint32Array([0,1,2,3,4,5,6,7,8]),
           triObject: new Uint32Array([0, 0, 1]), mvps: mvpsCur, w: W, h: H, zRange: Z_RANGE });
       return r.rejected === 1;
   })(), "rejected 1 of 3. A vertex at w <= 0 projects to a point that is not on the screen at all, and " +
   "drawing the triangle anyway puts a surface where none is -- so it refuses, and says how many.");
ok("...and mismatched triangle/object counts are refused",
   (() => { try { rasterVisibilityCPU({ positions: POS, indices: IDX, triObject: new Uint32Array([0, 0, 1]), mvps: mvpsCur, w: W, h: H, zRange: Z_RANGE }); return false; }
            catch (e) { return /one per triangle/.test(e.message); } })(),
   "a mesh cannot half-belong to an object, and pairing a triangle with its neighbour's id is a silent wrong " +
   "answer rather than a missing one.");
ok("...and an inverted zRange is refused rather than producing an inverted depth order",
   (() => { try { rasterVisibilityCPU({ positions: POS, indices: IDX, triObject: TRI_OBJ, mvps: mvpsCur, w: W, h: H, zRange: [1, -1] }); return false; }
            catch (e) { return /empty or inverted/.test(e.message); } })(),
   "the range maps clip z into the packing's [0,1]; inverted, every depth test runs backwards and the FARTHEST " +
   "surface wins every pixel, which looks like a rendered image of the inside of the scene.");

// ---- 3. ON THE DEVICE ---------------------------------------------------------------------------------------
console.log("\n3. THE KERNEL against rasterVisibilityCPU, on a real adapter");
const skip = await webgpuSkipReason();
if (skip) { ok("a WebGPU adapter is available", false, skip); }
else {
const r = await runInEngineOrigin({ engineRoot: ENG, args: {
        W, H, positions: Array.from(POS), indices: Array.from(IDX), triObject: Array.from(TRI_OBJ),
        mvps: Array.from(flattenMvps(mvpsCur)), zRange: Z_RANGE,
    }, script: `async (a) => {
    const { requestDevice } = await import("/gfx/device.js");
    const { VisibilityGPU } = await import("/render/visibilityGPU.mjs");
    const cv = document.createElement("canvas"); cv.width = 8; cv.height = 8;
    const dev = await requestDevice(cv, { backend: "webgpu", offscreen: true });
    const errs = []; if (dev.gpu && dev.gpu.addEventListener) dev.gpu.addEventListener("uncapturederror", (e) => errs.push(String(e.error && e.error.message).slice(0, 200)));
    const g = new VisibilityGPU(dev);
    const mvps = []; for (let i = 0; i * 16 < a.mvps.length; i++) mvps.push(new Float32Array(a.mvps.slice(i * 16, i * 16 + 16)));
    const common = { positions: new Float32Array(a.positions), indices: new Uint32Array(a.indices),
                     triObject: new Uint32Array(a.triObject), mvps, w: a.W, h: a.H, zRange: a.zRange };
    const out = await g.raster(common);
    // ORDER INDEPENDENCE on the device, where the threads really are concurrent
    const rev = await g.raster({ ...common, indices: new Uint32Array([9,10,11,6,7,8,3,4,5,0,1,2]),
                                 triObject: new Uint32Array([1, 1, 0, 0]) });
    // TWICE, to catch a resolve that depends on scheduling rather than on the key
    const again = await g.raster(common);

    const refuse = async (fn) => { try { await fn(); return null; } catch (e) { return String(e.message).slice(0, 180); } };
    const rCounts = await refuse(() => g.raster({ ...common, triObject: new Uint32Array([0, 0, 1]) }));
    const rRange = await refuse(() => g.raster({ ...common, zRange: [1, -1] }));
    let rBackend = null;
    try { const c2 = document.createElement("canvas"); const d2 = await requestDevice(c2, { backend: "webgl2", offscreen: true }); new VisibilityGPU(d2); }
    catch (e) { rBackend = String(e.message).slice(0, 180); }

    return { backend: dev.backend, errs,
             words: Array.from(out.words), ids: Array.from(out.ids), depth: Array.from(out.depth),
             rejected: out.rejected, covered: out.covered,
             revWords: Array.from(rev.words), againWords: Array.from(again.words),
             rCounts, rRange, rBackend };
}` });

ok("the kernel ran on a real WebGPU device",
   r.ok && r.result && r.result.backend === "webgpu" && r.result.errs.length === 0,
   r.ok ? `${r.result && r.result.backend}; errors ${(r.result && r.result.errs || []).join(" | ")}` : (r.reason || (r.pageErrors || []).join("; ")));

if (r.ok && r.result) {
    const R = r.result;
    let wordDiff = 0, idDiff = 0, worstD = 0;
    for (let i = 0; i < W * H; i++) {
        if (R.words[i] !== cpu.words[i]) wordDiff++;
        if (R.ids[i] !== cpuUn.ids[i]) idDiff++;
        worstD = Math.max(worstD, Math.abs(R.depth[i] - cpuUn.depth[i]));
    }
    say("parity", `${wordDiff} words differ of ${W * H}, ${idDiff} ids, worst depth gap ${worstD.toExponential(2)}`);
    ok("!! *** the kernel's ID buffer is rasterVisibilityCPU's, EXACTLY: not one pixel differs ***",
       idDiff === 0,
       `${idDiff} of ${W * H}. An id is an integer label and there is no epsilon for it -- either the two ` +
       "rasterisers covered the same pixels with the same surfaces or they did not. The fixture's geometry " +
       "sits at irrational offsets so no edge passes through a pixel centre, which is what makes exactness " +
       "the right bar here rather than a tolerance.");
    // *** THIS ROW FIRST ASSERTED THE WORDS WERE IDENTICAL AND THAT IS SIMPLY NOT TRUE. *** It read
    // "they land in the same depth bucket at every pixel", which was written before it was measured; 218 of
    // 6,144 do not. The bound that IS true is one step, and the interesting fact is the one the ids row above
    // reports beside it: 3.5% of the packed words differ and ZERO of the ids do. That is the packing's
    // behaviour under f32-against-f64, not a lucky fixture -- a one-step depth wobble moves the high bits,
    // but the surface it is competing against is thousands of steps away, so the winner never changes.
    ok("!! ...and where the packed words DIFFER they differ by exactly one depth step, never more",
       worstD <= 1.0000001 / DEPTH_STEPS,
       `${wordDiff} of ${W * H} words differ (${(100 * wordDiff / (W * H)).toFixed(1)}%), worst depth gap ` +
       `${worstD.toExponential(2)} against a step of ${(1 / DEPTH_STEPS).toExponential(2)} -- so exactly one ` +
       "bucket, from f32 on the device against f64 in JS through a projection, a divide and a barycentric " +
       "interpolation. The id survives that wobble at every one of those pixels, which is the whole reason " +
       "the id is the product here and the packed word is the mechanism.");
    ok("...and the device counted the same coverage the CPU did",
       R.covered === cpuUn.covered && R.rejected === cpu.rejected,
       `covered ${R.covered} vs ${cpuUn.covered}, rejected ${R.rejected} vs ${cpu.rejected}`);
    ok("!! ...and the resolve is ORDER-INDEPENDENT on a device where the threads really are concurrent",
       (() => { for (let i = 0; i < W * H; i++) if (R.revWords[i] !== R.words[i]) return false; return true; })(),
       "the same scene with its triangle list reversed and its objects relabelled gives the same buffer, bit " +
       "for bit. On the CPU this row is arithmetic; here it is a claim about atomics under real contention.");
    ok("...and running it TWICE gives the same buffer, so nothing depends on scheduling",
       (() => { for (let i = 0; i < W * H; i++) if (R.againWords[i] !== R.words[i]) return false; return true; })(),
       "a resolve that raced would be free to differ between two identical dispatches on the same device.");

    console.log("\n4. THE REFUSALS, each driven");
    ok("mismatched triangle/object counts are refused", /one per triangle/.test(R.rCounts || ""), R.rCounts || "NOT REFUSED");
    ok("...and an inverted zRange is refused", /empty or inverted/.test(R.rRange || ""), R.rRange || "NOT REFUSED");
    ok("...and a non-webgpu device throws at construction",
       /needs a gfx\/device\.js device on the webgpu backend/.test(R.rBackend || ""), R.rBackend || "NOT REFUSED");

    // ---- 5. THE POINT OF THE ROUND --------------------------------------------------------------------------
    console.log("\n5. THE IDS DRIVE objectMotionCPU, on a scene that was RASTERISED");
    const MATS = buildObjectMatrices({ vpCur, vpPrev, models: CUR_MODELS, prevModels: PREV_MODELS });
    const invVPCur = mat4Invert(vpCur);
    const camOnly = motionVectorsCPU(cpuUn.depth, W, H, invVPCur, vpPrev);
    const objAware = objectMotionCPU({ depth: cpuUn.depth, ids: new Uint32Array(R.ids), w: W, h: H,
                                       invMVPCur: MATS.invMVPCur, mvpPrev: MATS.mvpPrev });
    // compare only where a surface was actually drawn AND both paths produced a valid vector
    let n = 0, worstCam = 0, worstObj = 0, movingPix = 0;
    for (let i = 0; i < W * H; i++) {
        if (cpuUn.ids[i] === NO_OBJECT) continue;
        if (!camOnly.valid[i] || !objAware.valid[i]) continue;
        n++;
        if (cpuUn.ids[i] === 1) {
            movingPix++;
            const gap = Math.hypot(camOnly.data[i * 4] - objAware.data[i * 4], camOnly.data[i * 4 + 1] - objAware.data[i * 4 + 1]);
            worstCam = Math.max(worstCam, gap);
        } else {
            const gap = Math.hypot(camOnly.data[i * 4] - objAware.data[i * 4], camOnly.data[i * 4 + 1] - objAware.data[i * 4 + 1]);
            worstObj = Math.max(worstObj, gap);
        }
    }
    say("motion", `${n} valid pixels, ${movingPix} on the moving slab`);
    say("  on the MOVING object", `camera-only differs from object-aware by ${worstCam.toExponential(3)} uv = ${(worstCam * W).toFixed(2)} px`);
    say("  on the STATIC background", `${worstObj.toExponential(3)} uv = ${(worstObj * W).toFixed(2)} px`);
    ok("!! *** the rasterised id buffer reproduces A3's finding on real geometry: camera-only is WRONG BY PIXELS on the moving object ***",
       worstCam * W > 1.0 && movingPix > 200,
       `${(worstCam * W).toFixed(2)} px over ${movingPix} pixels of slab. v4646 measured 2.51 px on a fixture ` +
       "that DECLARED its own id buffer; this is the same statement with the ids rasterised from geometry by " +
       "the module under test. Stated as a FLOOR -- if it drops below a pixel this fixture has stopped " +
       "exercising the thing the arc built objectMotion for.");
    ok("!! ...and it is ZERO on the static background, so the id buffer is selecting and not just perturbing",
       worstObj * W < 1e-3,
       `${(worstObj * W).toExponential(2)} px. Object 0's model matrix is the identity, so object-aware and ` +
       "camera-only are the same computation there and must agree to the round trip. A buffer that labelled " +
       "pixels at random would move BOTH numbers; only a correct one moves exactly one of them.");
}
}

console.log(fails ? `\nvisibilityGPU-selfcheck: ${fails} FAILED` : "\nvisibilityGPU-selfcheck: ALL GREEN");
console.log("unchecked here: the THREAD IMBALANCE -- one thread per triangle means a big triangle's thread " +
            "outlives its workgroup, and the fix is a tiled binning pass that is not this round; CLIPPING, " +
            "which this refuses rather than performs, so a camera inside the geometry renders nothing where a " +
            "real rasteriser would render a cross-section; whether any PAGE calls this -- fsr.html builds its " +
            "scene analytically and already knows which plane it hit, so the page's next rung is to STOP " +
            "throwing that away rather than to rasterise; and MULTISAMPLING, absent by design since the " +
            "consumer wants the id of the surface at the pixel centre.");
process.exit(fails ? 1 : 0);
