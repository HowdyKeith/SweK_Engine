#!/usr/bin/env node
// WebGLEngine/render/temporalRejectGPU-selfcheck.mjs -- v4593
//
// Run: node render/temporalRejectGPU-selfcheck.mjs
// RUNTIME 1775 ms ALONE (median of 2108/1750/1775/1738/1671 at v4595), against 2573 recorded at v4594 and 1862
// at v4593. *** THE THREE ARE NOT A TREND AND THIS FILE WILL NOT PRETEND THEY ARE. *** v4595 added CPU rows and
// removed none of the device work, so it cannot have got faster by 800 ms; five samples spread 1671 to 2108,
// which is 26% on a SOFTWARE ADAPTER with nothing pinned, and v4594's three-sample median sat at the top of
// that spread. The honest reading is that this gate's timing is noisy at the few-hundred-millisecond scale and
// a median of three was too few to say so. Still inside the 3000 ms sweep budget on every sample.
//
// SABOTAGE v4641 (the counters): 4 mutations, 4 caught, one red each and no 0-RED.
//   Y1 DISOCCLUSION_WGSL/mainCounted writing flagged into BOTH atomic slots -> the split row, which read back
//      device {flagged:192, noHistory:192} against the CPU's 192/64. This is the mutation the whole round is
//      about: the mask cannot tell those two apart, so nothing but a counter could catch it.
//   Y2 the rectify never counting a clamp (`if (any(hv3 != before))` -> `if (false)`) -> the six-counter row,
//      clamped device 0 vs CPU 6080. The other five stayed equal, so the row names the one that moved.
//   Y3 mainCounted scaling the picture by 0.99 -> the bit-for-bit row, worst 8.571e-3. A counted path that
//      also drifts the answer is worse than no counter; this is the row that says it does not.
//   Y4 an uncounted pass returning six zeroes instead of null -> the not-counted row. A frame that counted
//      nothing and a frame that measured zero must not read the same.
//
// SABOTAGE v4595 (the correction): 4 mutations, 4 caught -- one of them only after the gate stopped CRASHING.
//   X1 the occluder fixture put back the wrong way round, which is v4593's own mistake -> the corrected row.
//   X2 the perspective control's camera stopped moving -> the parallax row. No eye motion, no parallax, no
//      disocclusion, which is the claim stated as a mutation.
//   X4 disocclusionCPU stops reading zPrev and compares depth to itself -> 6 rows, including the chain's.
//   *** X3 put the perspective slab at the BACKGROUND'S depth and the gate EXITED 1 WITH NO FAIL LINE. *** A
//   zero depth gap makes the threshold zero, disocclusionCPU refuses a non-positive threshold, and the gate
//   died -- which is no verdict at all, not a catch. The degenerate fixture is a real thing to guard: a "near
//   slab" at the far plane occludes nothing and the control would read as a parallax demonstration while
//   demonstrating none. There is a row for it now, and X3 takes two.
//
// SABOTAGE v4594 (the factor kernel and the chain): 6 mutations, 6 caught, and TWO WENT 0-RED FIRST.
//   W1 the kernel uses max() instead of the product -> the row that pins the DECISION. The arithmetic is three
//      lines; which operator combines them is the thing render/temporalReject.mjs argues for, and a kernel is
//      free to get it wrong in a way that looks reasonable.
//   W3 reactive and shading bindings swapped in the runner -> the subset row. This is why the three fixture
//      masks DIFFER: fed the same values it would have given exactly the right answer.
//   W4 the chain's rectify reads a fresh zero factor rather than the one the factor pass wrote -> the
//      bit-identity row at 5.17e-1. That is v4593's original bug, and this row is what it would have failed.
//   W5 the chain skips the factor dispatch -> two rows, 5952 factor elements differing.
//   *** W2 dropping the clamp went 0-RED, AND THE MUTATION WAS AIMED WRONG. *** It removed the clamp on the
//   DISOCCLUSION term, whose mask is 0 or 1 by construction -- disocclusionCPU writes nothing else -- so the
//   clamp on that line is unobservable through that input, which is a property of the producer rather than a
//   gap here. Re-aimed at the REACTIVE term, whose fixture carries 1.4 and -0.2: two rows red at 4.0e-1.
//   *** W6 putting the corpus back to a hardcoded 2D dispatch for the 1D kernel went 0-RED AND NOTHING COULD
//   HAVE CAUGHT IT. *** crossBackend compares two harnesses against EACH OTHER, so both ran the same short
//   dispatch, both left the same half of the output untouched, and both agreed -- a comparison of two backends
//   cannot see an error they share. tools/ship/temporalCorpus.mjs now REFUSES at construction, by name, and a
//   pure invocation count would not have done it: [2,2] over @workgroup_size(64,1,1) is 256 invocations,
//   exactly the picture, and the kernel throws the y axis away. The axes the shader USES decide.
//
// SABOTAGE v4593: 6 mutations, 6 caught, no 0-RED -- but TWO OF THE SIX DID NOT APPLY ON THE FIRST ATTEMPT (a python
// quoting error and a wrong anchor) AND SCORED FAIL=0. Those are NO-OPS, NOT 0-REDs, the distinction v4587 paid
// for; scoring them as caught-nothing would have recorded the threshold refusal and the kernel's own test as
// exercised when nothing had touched either. Re-applied against the real lines:
//   V1 nearerIsLess inverted -- the sign that IS the test -> the mask row, 256 of 6144 disagreeing.
//   V2 the YCOCG flag dropped so rectify clamps in the wrong space -> 3 rows at 2.9e-1.
//   V3 HAS_FAC always set, so a caller passing no factor gets an all-zero one -> the no-factor row at 5.2e-1.
//      That is the exact bug the removed chain had, caught from the other side.
//   V4 a rejectAndAccumulate() put back -> the row asserting its absence. The method cannot return quietly.
//   V5 the threshold refusal replaced by a default of 0.05 -> 2 rows, one read and one driven on the device.
//   V6 the KERNEL's gap test forced false -> the mask row with 128 disagreements and 64 flagged, which is
//      exactly the genuine disocclusions gone and the offscreen column left. In the KERNEL rather than the
//      runner, because a runner gate that only breaks its own file has not shown it would notice what it wraps.
//
// *** FIVE OF THE SEVENTEEN, AND A HOLE BETWEEN THE TWO OF THEM. ***
//
// DISOCCLUSION_WGSL and RECTIFY_WGSL get a caller here, taking tools/ship/kernelReach.mjs's census to 12. Two
// things this gate asks that neither kernel's own gate can:
//
//   1. *** THE DETECTOR IS SHOWN FIRING AND SHOWN SILENT, AND v4595 CORRECTED WHICH IS WHICH. *** v4593 wrote
//      that fsr.html's flat scene was the reason nothing disoccludes, with "the same frame with a near slab:
//      384" as the control. THAT 384 WAS ITS FIXTURE'S PREV-DEPTH SHIFTED AGAINST THE MOTION. Placed
//      consistently the slab gives ZERO, the same as the flat scene -- because an ORTHOGRAPHIC PROJECTION HAS
//      NO PARALLAX and every pixel moves the same distance whatever its depth. The page's camera was the
//      binding constraint all along, not its content. The valid control is a PERSPECTIVE camera with the slab's
//      screen band PROJECTED from world space, which fires: 192 genuine.
//   2. THE TWO KERNELS CANNOT BE CHAINED, and the first draft of the runner shipped a method pretending they
//      could. DISOCCLUSION writes a MASK (1 = history is wrong); RECTIFY reads a FACTOR (1 = history trusted).
//      The inversion is historyFactorCPU and there is NO WGSL for it in the tree. The draft dispatched both,
//      bound an all-zero factor, and carried a comment claiming it fed the mask in -- code and comment
//      disagreeing, with the code meaning "discard all history". Removed; the absence is asserted below so it
//      cannot come back quietly.
"use strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import { runInEngineOrigin, webgpuSkipReason } from "../tools/ship/webgpuHarness.mjs";
import { motionVectorsCPU, mat4Invert } from "./motionVectors.mjs";
import { orthoPanVP } from "./motionVectorsGPU.mjs";
import { transform4 } from "./motionVectors.mjs";
import { viewProj } from "./rasterProbe.js";
import { disocclusionCPU, rectifiedAccumulateCPU, historyFactorCPU } from "./temporalReject.mjs";
import { RECTIFY_FLAGS, FACTOR_FLAGS } from "./temporalRejectGPU.mjs";
import { codeOnly } from "../tools/ship/sourceScan.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const say = (l, n = "") => console.log(`  ----  ${l}${n ? "   " + n : ""}`);

const D = 192, PAN = 0.75, TH = 0.05;
const mvAt = (depth, f) => motionVectorsCPU(depth, D, D, mat4Invert(orthoPanVP(f * PAN / D)), orthoPanVP((f - 1) * PAN / D)).data;
const FLAT = new Float32Array(D * D);
// a near slab over part of the frame, and where it was one pan-step ago
const slab = (sh) => { const d = new Float32Array(D * D);
    for (let y = 0; y < D; y++) for (let x = 0; x < D; x++) d[y * D + x] = ((x + sh) > 60 && (x + sh) < 130) ? 0.2 : 0.8;
    return d; };
// slab(sh) puts the slab at x + sh in (60, 130), i.e. at x in (60 - sh, 130 - sh): POSITIVE sh moves it LEFT.
// The motion is du = +PAN/D, so last frame every feature was at HIGHER x -- which is slab(-1), not slab(+1).
const OCC = slab(0), OCC_PREV = slab(-1), OCC_WRONG = slab(1);
const W2 = 96, H2 = 64;

console.log("temporalRejectGPU-selfcheck -- the detector, fired and silent\n");

console.log("1. *** AN ORTHOGRAPHIC PAN CANNOT DISOCCLUDE AT ALL -- AND v4593 SAID IT WAS THE CONTENT ***");
{
    // *** THE CORRECTION. *** v4593's second row claimed that fsr.html's flat scene was the reason nothing
    // disoccluded, and offered "the same frame with a near slab: 384 genuine" as the control that proved the
    // detector fires. THAT 384 WAS AN ARTEFACT OF THE FIXTURE, and it shipped in this gate, in the runner's
    // header and in the closing.
    //
    // The prev-depth buffer was shifted THE WRONG WAY. The motion says du = +PAN/D, so last frame every feature
    // sat at HIGHER x; the fixture put the slab at LOWER x, which is a camera panning the other way. The
    // reprojection then lands on the far side of the slab's edge and reports disocclusion that never happened.
    // Measured all three ways at v4595: slab one step LEFT gives the spurious 384, slab one step RIGHT (the
    // direction the motion actually implies) gives 0, and a slab that does not move at all gives 192.
    //
    // *** AND THE TRUE REASON IS STRONGER AND SIMPLER THAN THE ONE IT REPLACES: AN ORTHOGRAPHIC PROJECTION HAS
    // NO PARALLAX. *** Every pixel moves by the same screen amount whatever its depth, so the depth at the
    // reprojected position always matches and NOTHING is ever revealed -- with or without occluding geometry.
    // The page's scene being flat was never the binding constraint; its CAMERA is.
    const flat = disocclusionCPU({ motion: mvAt(FLAT, 7), prevDepth: FLAT, w: D, h: D, threshold: TH });
    const occ = disocclusionCPU({ motion: mvAt(OCC, 7), prevDepth: OCC_PREV, w: D, h: D, threshold: TH });
    say("fsr.html, flat scene", `${flat.flagged} flagged, ${flat.noHistory} of them the offscreen column`);
    say("fsr.html, WITH a near slab", `${occ.flagged} flagged, ${occ.noHistory} the column`);

    ok("!! *** an orthographic pan flags nothing beyond the offscreen column -- flat scene OR occluder ***",
       flat.flagged - flat.noHistory === 0 && flat.noHistory === D &&
       occ.flagged - occ.noHistory === 0 && occ.noHistory === D,
       `flat: ${flat.flagged - flat.noHistory} genuine. With an occluder, consistently placed: ` +
       `${occ.flagged - occ.noHistory} genuine. Both are ${D} flagged and both are the one revealed column. ` +
       "v4593 asserted 384 for the second and that number was its fixture's prev-depth shifted the wrong way.");
    ok("!! ...and the SPURIOUS number is reproducible on demand, which is what makes the correction checkable",
       (() => { const wrong = disocclusionCPU({ motion: mvAt(OCC, 7), prevDepth: OCC_WRONG, w: D, h: D, threshold: TH });
                return wrong.flagged - wrong.noHistory === 384; })(),
       "384 again, from a prev-depth shifted against the motion. Kept as a row rather than deleted: the number " +
       "went into a gate, a header and a closing, and an erratum nobody can re-run is a claim about a claim.");

    // ---- THE VALID CONTROL: A PERSPECTIVE CAMERA, WHERE PARALLAX IS REAL ------------------------------------
    // Everything here is DERIVED: the slab lives at a world position and its screen band is PROJECTED through
    // each camera, rather than shifted by a pixel count chosen to look right. That hand-shifting is exactly what
    // produced the number this section corrects.
    const TANF = Math.tan(0.5), ASP = W2 / H2, NEAR = 0.1, FAR = 100;
    const cam = (ex) => viewProj([ex, -2, 0], [0, 1, 0], [1, 0, 0], [0, 0, 1], TANF, ASP, NEAR, FAR);
    const proj = (vp, wx, wy) => { const q = transform4(vp, wx, wy, 0, 1);
                                   return { sx: (q[0] / q[3] + 1) * 0.5 * W2, z: q[2] / q[3] }; };
    const depthFrom = (vp) => {
        const a = proj(vp, -0.6, 2).sx, b = proj(vp, 0.6, 2).sx;
        const zN = proj(vp, 0, 2).z, zF = proj(vp, 0, 6).z;
        const d = new Float32Array(W2 * H2);
        for (let y = 0; y < H2; y++) for (let x = 0; x < W2; x++)
            d[y * W2 + x] = (x + 0.5 >= Math.min(a, b) && x + 0.5 < Math.max(a, b)) ? zN : zF;
        return { d, zN, zF };
    };
    const vpC = cam(0), vpP = cam(-0.4);
    const C = depthFrom(vpC), P = depthFrom(vpP);
    const pMot = motionVectorsCPU(C.d, W2, H2, mat4Invert(vpC), vpP).data;
    // *** THE FIXTURE'S OWN DEPTHS MUST DIFFER, AND A SABOTAGE FOUND THAT THE HARD WAY. *** Putting the slab at
    // the background's depth makes |zN - zF| zero, which makes the threshold zero, which makes disocclusionCPU
    // THROW -- and a gate that dies is a gate with no verdict, not a gate that caught something. The degenerate
    // fixture is a real thing to guard: a "near slab" at the far plane is geometry that occludes nothing, and
    // the control would be testing a scene with no occlusion in it while reading as a parallax demonstration.
    const zGap = Math.abs(C.zN - C.zF);
    ok("!! the perspective fixture's two surfaces are at DIFFERENT depths, which is what makes it an occluder",
       zGap > 1e-4,
       `clip-z gap ${zGap.toExponential(3)} between the slab at y=2 and the background at y=6. A slab at the ` +
       "background's depth occludes nothing, and without this row the gate CRASHES on the zero threshold " +
       "instead of reporting a degenerate fixture -- exit 1 with no FAIL line, which is no verdict at all.");
    const pers = zGap > 1e-4
        ? disocclusionCPU({ motion: pMot, prevDepth: P.d, w: W2, h: H2, threshold: zGap * 0.25 })
        : { flagged: 0, noHistory: 0 };
    say("a PERSPECTIVE camera, same slab, derived band", `${pers.flagged} flagged, ${pers.noHistory} the column`);
    ok("!! *** and with PARALLAX the detector fires: this is the control the wrong fixture was standing in for ***",
       pers.flagged - pers.noHistory > 0,
       `${pers.flagged - pers.noHistory} genuine disocclusion at ${W2}x${H2}. The near slab's screen band is ` +
       "PROJECTED from its world extent through each camera rather than nudged by a chosen pixel count -- the " +
       "nudging is what produced 384. A lateral eye move slides the near band across the far one, and the " +
       "background it uncovers has no history. THIS is what fsr.html would need: not geometry, a camera.");
    ok("...and the threshold is REQUIRED, not defaulted, on the GPU path as on the CPU",
       (() => { try { disocclusionCPU({ motion: mvAt(FLAT, 7), prevDepth: FLAT, w: D, h: D }); return false; } catch { return true; } })() &&
       /threshold must be a positive depth/.test(fs.readFileSync(path.join(ENG, "render", "temporalRejectGPU.mjs"), "utf8")),
       "no default could be right for both depth conventions -- render/temporalReject.mjs says so and the runner " +
       "repeats the refusal rather than inventing one.");
}

console.log("\n2. *** THE INVERSION THAT WAS MISSING, AND THE CHAIN IT UNBLOCKS ***");
{
    const src = fs.readFileSync(path.join(ENG, "render", "temporalRejectGPU.mjs"), "utf8");
    // codeOnly: the header discusses the method by name, so the raw file contains it either way. Sixth time this
    // trap has been paid for in the arc, and the instrument is the same one each time.
    ok("!! *** rejectAndAccumulate() EXISTS NOW, because FACTOR_WGSL closed the hole v4593 measured ***",
       /rejectAndAccumulate\s*\(/.test(codeOnly(src)) && /async factor\s*\(/.test(codeOnly(src)),
       "v4593 shipped this runner deliberately without it: DISOCCLUSION writes 1 where history is WRONG, RECTIFY " +
       "reads 1 where history is TRUSTED, and the inversion -- historyFactorCPU -- had no WGSL anywhere in the " +
       "tree. Its first draft HAD the method, dispatching both kernels over an all-zero factor under a comment " +
       "claiming it fed the mask in, which meant DISCARD ALL HISTORY on every pixel. It is three dispatches now.");
    ok("...and the three MULTIPLY rather than max(), which is a decision the kernel had to copy and not improve",
       /f \* \(1\.0 - clamp/.test(fs.readFileSync(path.join(ENG, "render", "temporalRejectWgsl.mjs"), "utf8")),
       "each mask is an independent probability that the history is wrong, so two weak reasons compound. A max() " +
       "would let the strongest hide the others -- and on a disoccluded transparent surface both are true and " +
       "the answer must be 'certainly not'. render/temporalReject.mjs argues it; the kernel mirrors it.");
    ok("...and the flag words are named, so a caller never passes a bare 7",
       RECTIFY_FLAGS.YCOCG === 1 && RECTIFY_FLAGS.CLAMP === 2 && RECTIFY_FLAGS.HAS_HIST === 4 && RECTIFY_FLAGS.HAS_FAC === 8 &&
       FACTOR_FLAGS.HAS_DISOCC === 1 && FACTOR_FLAGS.HAS_REACTIVE === 2 && FACTOR_FLAGS.HAS_SHADING === 4,
       "four for RECTIFY and three for FACTOR, the same numbers both kernels declare as WGSL consts");
}

console.log("\n3. ON THE DEVICE: both kernels against their CPU references");
const skip = webgpuSkipReason();
if (skip) { console.log(`  SKIP  ${skip}`); say("*** NOT A PASS. *** Nothing here has run."); fails++; }
else {
    const W = 96, H = 64;                       // NON-SQUARE, because v4592's sabotage found a square fixture
    const mkSlab = (sh) => { const d = new Float32Array(W * H);
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) d[y * W + x] = ((x + sh) > 30 && (x + sh) < 65) ? 0.2 : 0.8;
        return d; };
    const DEP = mkSlab(0), DEP_PREV = mkSlab(1);
    const MOT = motionVectorsCPU(DEP, W, H, mat4Invert(orthoPanVP(0.02)), orthoPanVP(0.01)).data;
    const CUR = new Float32Array(W * H * 4), HIS = new Float32Array(W * H * 4);
    for (let i = 0; i < W * H; i++) {
        CUR[i * 4] = (i % 7) / 7; CUR[i * 4 + 1] = 0.5; CUR[i * 4 + 2] = 1 - (i % 5) / 5; CUR[i * 4 + 3] = 1;
        HIS[i * 4] = 0.2; HIS[i * 4 + 1] = 0.9; HIS[i * 4 + 2] = 0.3; HIS[i * 4 + 3] = 1;
    }
    const cMask = disocclusionCPU({ motion: MOT, prevDepth: DEP_PREV, w: W, h: H, threshold: TH });
    const FAC = historyFactorCPU({ disocclusion: cMask.data, n: W * H });
    // two more masks, DIFFERENT from each other and from the disocclusion, and carrying values outside [0,1]:
    // fed identical inputs a kernel reading `reactive` where it means `shading` gives exactly the right answer,
    // and a clamp that never fires cannot be shown to fire.
    const REACT = new Float32Array(W * H), SHADE = new Float32Array(W * H);
    for (let i = 0; i < W * H; i++) { REACT[i] = (i % 9) < 3 ? 1.4 : -0.2; SHADE[i] = 0.05 * (i % 7); }

    const r = await runInEngineOrigin({ engineRoot: ENG, args: {
        W, H, TH, motion: Array.from(MOT), prevDepth: Array.from(DEP_PREV),
        cur: Array.from(CUR), hist: Array.from(HIS), fac: Array.from(FAC),
        mask: Array.from(cMask.data), react: Array.from(REACT), shade: Array.from(SHADE) }, script: `async (a) => {
        const { requestDevice } = await import("/gfx/device.js");
        const { TemporalRejectGPU } = await import("/render/temporalRejectGPU.mjs");
        const cv = document.createElement("canvas"); cv.width = 8; cv.height = 8;
        const dev = await requestDevice(cv, { backend: "webgpu", offscreen: true });
        const errs = []; if (dev.gpu && dev.gpu.addEventListener) dev.gpu.addEventListener("uncapturederror", (e) => errs.push(String(e.error && e.error.message).slice(0, 200)));
        const G = new TemporalRejectGPU(dev);
        const mask = await G.disocclusion({ motion: new Float32Array(a.motion), prevDepth: new Float32Array(a.prevDepth),
                                            w: a.W, h: a.H, threshold: a.TH });
        const base = { current: new Float32Array(a.cur), history: new Float32Array(a.hist),
                       motion: new Float32Array(a.motion), w: a.W, h: a.H, alpha: 0.1 };
        const rect = await G.rectify({ ...base, factor: new Float32Array(a.fac) });
        const rectNoFac = await G.rectify({ ...base });
        const rectRgb = await G.rectify({ ...base, factor: new Float32Array(a.fac), space: "rgb" });

        // the factor kernel alone, in four combinations, so the flag word is exercised rather than assumed
        const fD = await G.factor({ disocclusion: new Float32Array(a.mask), n: a.W * a.H });
        const fR = await G.factor({ reactive: new Float32Array(a.react), n: a.W * a.H });
        const fAll = await G.factor({ disocclusion: new Float32Array(a.mask), reactive: new Float32Array(a.react),
                                      shading: new Float32Array(a.shade), n: a.W * a.H });
        const fNone = await G.factor({ n: a.W * a.H });

        // *** THE CHAIN: three dispatches on one encoder, nothing crossing back between them. ***
        const chainArgs = {
            current: new Float32Array(a.cur), history: new Float32Array(a.hist), motion: new Float32Array(a.motion),
            prevDepth: new Float32Array(a.prevDepth), w: a.W, h: a.H, alpha: 0.1, threshold: a.TH };
        const chain = await G.rejectAndAccumulate({ ...chainArgs });
        // ...and the same chain through the mainCounted entry points, which is a DIFFERENT PAIR OF PIPELINES
        // over the same two kernel texts. Same arguments, so the picture below must come back identical.
        const counted = await G.rejectAndAccumulate({ ...chainArgs, counted: true });
        const maskCounted = await G.disocclusion({ motion: new Float32Array(a.motion), prevDepth: new Float32Array(a.prevDepth),
                                                   w: a.W, h: a.H, threshold: a.TH, counted: true });
        let refused = null, noThreshold = null;
        try { new TemporalRejectGPU({ backend: "webgl2" }); } catch (e) { refused = String(e.message).slice(0, 130); }
        try { await G.disocclusion({ motion: new Float32Array(a.motion), prevDepth: new Float32Array(a.prevDepth), w: a.W, h: a.H }); }
        catch (e) { noThreshold = String(e.message).slice(0, 110); }
        return { mask: Array.from(mask.data), rect: Array.from(rect.data), rectNoFac: Array.from(rectNoFac.data),
                 rectRgb: Array.from(rectRgb.data), refused, noThreshold, errs, backend: dev.backend,
                 fD: Array.from(fD.data), fR: Array.from(fR.data), fAll: Array.from(fAll.data), fNone: Array.from(fNone.data),
                 chain: Array.from(chain.data), chainMask: Array.from(chain.mask), chainFactor: Array.from(chain.factor),
                 chainStats: chain.stats, chainReason: chain.statsReason, chainDisocStats: chain.disocStats,
                 counted: Array.from(counted.data), countedStats: counted.stats, countedDisoc: counted.disocStats,
                 countedReason: counted.statsReason, maskCountedStats: maskCounted.stats,
                 maskUncountedStats: mask.stats, maskUncountedReason: mask.statsReason,
                 adapter: (dev.adapterInfo && (dev.adapterInfo.description || dev.adapterInfo.vendor)) || "unknown" };
    }` });

    ok("the runner ran on a real WebGPU device", r.ok && r.result && r.result.backend === "webgpu" && (r.result.errs || []).length === 0,
       r.ok ? `${r.result && r.result.backend}, adapter ${r.result && r.result.adapter}; errors ${(r.result && r.result.errs || []).join(" | ")}`
            : (r.reason || (r.pageErrors || []).join("; ")));

    if (r.ok && r.result) {
        const G = r.result;
        const flaggedCPU = cMask.flagged, flaggedGPU = G.mask.reduce((n, v) => n + (v !== 0 ? 1 : 0), 0);
        let maskDiff = 0;
        for (let i = 0; i < W * H; i++) if ((G.mask[i] !== 0) !== (cMask.data[i] !== 0)) maskDiff++;
        // *** AND THE SPLIT IS REPORTED, BECAUSE SECTION 1 IS BUILT ON IT. *** "192 flagged" would read the same
        // whether the fixture disoccludes or merely runs off the edge, and the whole point of the first section
        // is that those are different facts. This one is 64 offscreen and 128 GENUINE.
        const genuine = flaggedCPU - cMask.noHistory;
        ok("*** disocclusion() is disocclusionCPU's mask, pixel for pixel ***",
           maskDiff === 0 && flaggedGPU === flaggedCPU && genuine > 0 && flaggedCPU < W * H,
           `${maskDiff} of ${W * H} disagree; ${flaggedGPU} flagged on the device against ${flaggedCPU} on the CPU, ` +
           `of which ${cMask.noHistory} are the offscreen column and ${genuine} are GENUINE disocclusion at the ` +
           "slab's edges. A mask is a set, so the claim is set equality rather than a tolerance -- and a fixture " +
           "whose every flag was the offscreen column would pass this row while testing nothing the kernel does.");

        const worst = (a, b) => { let w = 0; for (let i = 0; i < W * H * 4; i++) w = Math.max(w, Math.abs(a[i] - b[i])); return w; };
        const cRect = rectifiedAccumulateCPU({ current: CUR, history: HIS, motion: MOT, factor: FAC, w: W, h: H, alpha: 0.1 });
        const cNoFac = rectifiedAccumulateCPU({ current: CUR, history: HIS, motion: MOT, w: W, h: H, alpha: 0.1 });
        const cRgb = rectifiedAccumulateCPU({ current: CUR, history: HIS, motion: MOT, factor: FAC, w: W, h: H, alpha: 0.1, space: "rgb" });
        const wR = worst(G.rect, cRect.data), wN = worst(G.rectNoFac, cNoFac.data), wG = worst(G.rectRgb, cRgb.data);
        ok(`*** rectify() is rectifiedAccumulateCPU's picture in YCoCg, to ${wR.toExponential(2)} ***`, wR < 1e-5,
           `worst ${wR.toExponential(3)} over ${W * H * 4} floats at ${W}x${H} -- an rgb/YCoCg round trip per tap, f32 against f64`);
        ok(`...and with NO factor, to ${wN.toExponential(2)}, which is a different flag word and a different answer`,
           wN < 1e-5 && worst(G.rect, G.rectNoFac) > 1e-3,
           `worst ${wN.toExponential(3)}, and the two GPU pictures differ by ${worst(G.rect, G.rectNoFac).toExponential(2)} -- ` +
           "a HAS_FAC bit that changed nothing would pass a parity row and mean nothing");
        ok(`...and in RGB space, to ${wG.toExponential(2)}, which is the other clamp space and also differs`,
           wG < 1e-5 && worst(G.rect, G.rectRgb) > 1e-4,
           `worst ${wG.toExponential(3)}, YCoCg against RGB differ by ${worst(G.rect, G.rectRgb).toExponential(2)} on ` +
           "the device. The box FSR rectifies in is the whole reason that flag exists.");

        // ---- THE FACTOR KERNEL, AGAINST historyFactorCPU ------------------------------------------------
        const fEq = (g, c) => { let w = 0; for (let i = 0; i < W * H; i++) w = Math.max(w, Math.abs(g[i] - c[i])); return w; };
        const cD = historyFactorCPU({ disocclusion: cMask.data, n: W * H });
        const cR = historyFactorCPU({ reactive: REACT, n: W * H });
        const cAll = historyFactorCPU({ disocclusion: cMask.data, reactive: REACT, shading: SHADE, n: W * H });
        const cNone = historyFactorCPU({ n: W * H });
        ok(`*** factor() is historyFactorCPU, to ${fEq(G.fAll, cAll).toExponential(2)}, with all three masks ***`,
           fEq(G.fAll, cAll) < 1e-6,
           `worst ${fEq(G.fAll, cAll).toExponential(3)} over ${W * H}. The three masks DIFFER from each other and ` +
           "carry values outside [0,1] -- identical inputs would let a kernel that read the wrong binding give " +
           "exactly the right answer, and a clamp that never fires cannot be shown to fire.");
        ok("...and each flag subset gives the CPU's answer for that subset, not for all of them",
           fEq(G.fD, cD) < 1e-6 && fEq(G.fR, cR) < 1e-6 && fEq(G.fNone, cNone) < 1e-6,
           `disocclusion only ${fEq(G.fD, cD).toExponential(2)}, reactive only ${fEq(G.fR, cR).toExponential(2)}, ` +
           `none ${fEq(G.fNone, cNone).toExponential(2)}. Three bound buffers whatever the caller passes, so a ` +
           "flag read wrongly would silently fold in a mask nobody asked for.");
        ok("!! ...and the four subsets are actually DIFFERENT, so the rows above are not one answer four times",
           fEq(G.fAll, G.fD) > 1e-3 && fEq(G.fD, G.fR) > 1e-3 && fEq(G.fNone, G.fD) > 1e-3 &&
           cNone.every((v) => v === 1),
           `all-vs-disocclusion ${fEq(G.fAll, G.fD).toExponential(2)}, disocclusion-vs-reactive ` +
           `${fEq(G.fD, G.fR).toExponential(2)}, none-vs-disocclusion ${fEq(G.fNone, G.fD).toExponential(2)}; ` +
           "the no-mask case is all ones, which is what 'trust the history entirely' means.");

        // ---- THE CHAIN v4593 REFUSED TO BUILD -----------------------------------------------------------
        let maskChainDiff = 0, facChainDiff = 0;
        for (let i = 0; i < W * H; i++) {
            if (G.chainMask[i] !== G.mask[i]) maskChainDiff++;
            if (Math.abs(G.chainFactor[i] - G.fD[i]) > 1e-6) facChainDiff++;
        }
        const chainWorst = (() => { let w = 0; for (let i = 0; i < W * H * 4; i++) w = Math.max(w, Math.abs(G.chain[i] - G.rect[i])); return w; })();
        ok("!! *** the chain's mask and factor are what the two passes produce alone ***",
           maskChainDiff === 0 && facChainDiff === 0,
           `${maskChainDiff} mask and ${facChainDiff} factor elements differ from the standalone dispatches. ` +
           "Neither intermediate crosses to the CPU inside the chain, so this is the row that says the second " +
           "and third passes read what the first two wrote rather than whatever the buffers held.");
        ok("!! *** and the chained picture is the standalone rectify's, bit for bit ***",
           chainWorst === 0,
           `worst ${chainWorst.toExponential(3)} over ${W * H * 4} floats. Same three kernels, same order, same ` +
           "device -- the only difference is where the mask and the factor live, so f32-against-f64 is no excuse " +
           "and equality is exact. THE FIRST DRAFT OF THIS METHOD, AT v4593, BOUND AN ALL-ZERO FACTOR: this row " +
           "is what that would have failed.");

        // ---- THE COUNTERS, WHICH THE MASK COULD NOT HAVE GIVEN --------------------------------------------
        //
        // *** THE PAGE IS WHY THESE EXIST. *** fsr.html prints "N genuine, M with no history at all", and
        // genuine = flagged - noHistory is UNRECOVERABLE from the mask: DISOCCLUSION_WGSL writes the same 1.0
        // for a disocclusion, for an invalid motion vector and for a reprojection that left the frame. This
        // runner's own comment used to tell callers to "count them from the mask", which recovers flagged and
        // nothing else. Until mainCounted there was no honest GPU path for the dolly camera at all.
        const cChain = rectifiedAccumulateCPU({ current: CUR, history: HIS, motion: MOT, factor: FAC, w: W, h: H, alpha: 0.1 });
        const KEYS = ["reused", "rejectedOffscreen", "rejectedInvalid", "clamped", "discarded", "relaxed"];
        const bad = G.countedStats ? KEYS.filter((k) => G.countedStats[k] !== cChain.stats[k]) : KEYS;
        ok("!! *** the rectify counters are rectifiedAccumulateCPU's six, EQUAL -- integers, not a tolerance ***",
           bad.length === 0 && G.countedStats && G.countedStats.reused > 0 && G.countedStats.rejectedOffscreen > 0 &&
           G.countedStats.clamped > 0 && G.countedStats.discarded > 0,
           bad.length ? bad.map((k) => `${k}: device ${G.countedStats[k]} vs CPU ${cChain.stats[k]}`).join(", ")
             : KEYS.map((k) => `${k} ${cChain.stats[k]}`).join(", ") +
               " -- and four of them are NON-ZERO on this fixture, so the row is not six zeroes agreeing with six zeroes. " +
               "relaxed is 0 on BOTH sides and that is a measurement: RECTIFY_WGSL has no relax binding and the CPU " +
               "was given relax = null, which is the same quantity, not an uncounted one.");

        const dBad = G.countedDisoc ? (G.countedDisoc.flagged !== cMask.flagged || G.countedDisoc.noHistory !== cMask.noHistory) : true;
        ok("!! *** and the disocclusion counters split flagged from noHistory, which the MASK CANNOT ***",
           !dBad && G.countedDisoc.noHistory > 0 && G.countedDisoc.flagged > G.countedDisoc.noHistory &&
           G.maskCountedStats && G.maskCountedStats.flagged === cMask.flagged && G.maskCountedStats.noHistory === cMask.noHistory,
           dBad ? `device ${JSON.stringify(G.countedDisoc)} vs CPU flagged ${cMask.flagged} noHistory ${cMask.noHistory}`
                : `flagged ${G.countedDisoc.flagged} = ${G.countedDisoc.noHistory} offscreen + ` +
                  `${G.countedDisoc.flagged - G.countedDisoc.noHistory} genuine, on the device and on the CPU alike; ` +
                  "disocclusion() counted alone agrees with the chain's. BOTH parts are non-zero here, so a kernel " +
                  "that wrote flagged into both slots would fail this row.");

        const countWorst = (() => { let w = 0; for (let i = 0; i < W * H * 4; i++) w = Math.max(w, Math.abs(G.counted[i] - G.chain[i])); return w; })();
        ok("!! *** and counting changed the PICTURE not at all -- bit for bit against the uncounted chain ***",
           countWorst === 0,
           `worst ${countWorst.toExponential(3)} over ${W * H * 4} floats. Two different pipelines over the same ` +
           "two kernel texts: each counted entry point shares its body with its plain twin and adds atomics only. " +
           "A counted path that also drifted the answer would be worse than no counter -- which is what " +
           "render/temporalGPU.mjs's header says about the pass it counts, and it is true here too.");

        ok("...and an UNCOUNTED pass says so rather than reporting zeroes",
           G.chainStats === null && typeof G.chainReason === "string" && /counting was not asked for/.test(G.chainReason) &&
           G.chainDisocStats === null && G.maskUncountedStats === null && typeof G.maskUncountedReason === "string" &&
           G.countedReason === null,
           `uncounted chain stats ${JSON.stringify(G.chainStats)}, disocStats ${JSON.stringify(G.chainDisocStats)}, ` +
           `reason present: ${typeof G.chainReason === "string"}; counted reason ${JSON.stringify(G.countedReason)}. ` +
           "A frame that disoccluded nothing and a frame nobody counted must not read the same -- the distinction " +
           "v4591 paid for on the accumulate side, kept here rather than re-learned.");

        ok("...and the threshold refusal is DRIVEN on the device, not read from the source",
           typeof G.noThreshold === "string" && /threshold/.test(G.noThreshold), G.noThreshold || "it did NOT throw");
        ok("...and the device refusal is DRIVEN: a non-webgpu device throws at construction",
           typeof G.refused === "string" && /webgpu/.test(G.refused), G.refused || "it did NOT throw");
    }
}

console.log(fails ? `\ntemporalRejectGPU-selfcheck: ${fails} FAILED` : "\ntemporalRejectGPU-selfcheck: ALL GREEN");
console.log("unchecked here: the REACTIVE and SHADING masks the factor kernel accepts -- nothing in this tree " +
            "produces a reactive mask at all, and the shading one is render/temporalLock.mjs's, so the chain is " +
            "exercised with the disocclusion term alone and the other two are held to historyFactorCPU on " +
            "fixtures rather than on anything a frame produced; `relax`, which RECTIFY_WGSL has no binding for " +
            "and the runner therefore refuses to accept rather than lerping on the CPU beside a kernel that does " +
            "not; WHETHER THE PAGE USES ANY OF THIS, which is not gradeable from here -- this gate drives the " +
            "CLASS, and fsr.html's use of it (the construction, the counted: true, the fallback that must not " +
            "stand in silently) is driven by tools/ship/fsrPage-selfcheck.mjs section 5, which loads the page " +
            "in an iframe on a device; and the temporal arc's last SIX unreachable kernels (RING_FLOOR, " +
            "RING_PUSH, SHADING_SHIFT and the three ridges), which tools/ship/kernelReach-selfcheck.mjs counts.");
// process.exit() would truncate everything above through a pipe -- see tools/ship/pipeTruncation-selfcheck.mjs.
process.exitCode = fails ? 1 : 0;
