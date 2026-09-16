#!/usr/bin/env node
// WebGLEngine/render/temporalRejectGPU-selfcheck.mjs -- v4593
//
// Run: node render/temporalRejectGPU-selfcheck.mjs
// RUNTIME 1862 ms ALONE (median of 1860/1862/1898) -- inside the 3000 ms sweep budget.
//
// SABOTAGE: 6 mutations, 6 caught, no 0-RED -- but TWO OF THE SIX DID NOT APPLY ON THE FIRST ATTEMPT (a python
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
//   1. *** THE DETECTOR IS SHOWN FIRING AND SHOWN SILENT, ON THE PAGE'S OWN CONTENT. *** A disocclusion test
//      over a FLAT scene cannot flag anything -- nothing is hidden, so nothing is revealed -- and fsr.html's
//      scene is a continuous function of (u, v) with no z at all. Measured at the page's size, pan and camera:
//      192 flagged of 36,864 and all 192 are the offscreen column, genuine disocclusion ZERO. The same frame
//      with a near slab over part of it: 384. That pair is why the page is NOT wired to this and the runner
//      says so in its header, rather than shipping a pass whose output is provably the column the accumulate
//      already had.
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
import { disocclusionCPU, rectifiedAccumulateCPU, historyFactorCPU } from "./temporalReject.mjs";
import { RECTIFY_FLAGS } from "./temporalRejectGPU.mjs";
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
const OCC = slab(0), OCC_PREV = slab(1);

console.log("temporalRejectGPU-selfcheck -- the detector, fired and silent\n");

console.log("1. *** THE PAGE'S OWN CONTENT CANNOT DISOCCLUDE, AND THAT IS WHY IT IS NOT WIRED ***");
{
    const flat = disocclusionCPU({ motion: mvAt(FLAT, 7), prevDepth: FLAT, w: D, h: D, threshold: TH });
    const occ = disocclusionCPU({ motion: mvAt(OCC, 7), prevDepth: OCC_PREV, w: D, h: D, threshold: TH });
    say("fsr.html's scene, as it ships", `${flat.flagged} flagged, ${flat.noHistory} of them the offscreen column`);
    say("the same frame with a near slab", `${occ.flagged} flagged, ${occ.noHistory} the column`);

    ok("!! *** on a FLAT scene the test flags nothing beyond the offscreen column ***",
       flat.flagged - flat.noHistory === 0 && flat.noHistory === D,
       `genuine disocclusion ${flat.flagged - flat.noHistory} of ${D * D}; the ${flat.noHistory} flagged are ` +
       `exactly one column of ${D}. A continuous function of (u, v) has no z, so nothing is hidden and nothing ` +
       "is revealed. Wiring this to the page would add a pass whose output is the column the accumulate already " +
       "rejected -- a control that cannot fire, on a page that exists to show things firing.");
    ok("!! ...and WITH an occluder it fires, which is what says the row above is about the content",
       occ.flagged - occ.noHistory === 384,
       `genuine disocclusion ${occ.flagged - occ.noHistory} -- the two vertical edges of the slab, ${D} rows ` +
       "each, where background is uncovered as it pans. Without this half, the row above would read as 'the " +
       "detector finds nothing' rather than 'this content contains nothing to find'.");
    ok("...and the threshold is REQUIRED, not defaulted, on the GPU path as on the CPU",
       (() => { try { disocclusionCPU({ motion: mvAt(FLAT, 7), prevDepth: FLAT, w: D, h: D }); return false; } catch { return true; } })() &&
       /threshold must be a positive depth/.test(fs.readFileSync(path.join(ENG, "render", "temporalRejectGPU.mjs"), "utf8")),
       "no default could be right for both depth conventions -- render/temporalReject.mjs says so and the runner " +
       "repeats the refusal rather than inventing one.");
}

console.log("\n2. *** THE TWO KERNELS CANNOT BE CHAINED, AND THE ABSENCE IS ASSERTED ***");
{
    const src = fs.readFileSync(path.join(ENG, "render", "temporalRejectGPU.mjs"), "utf8");
    // codeOnly: the header EXPLAINS why there is no such method, so the raw file contains the name. Fifth time
    // this trap has been paid for in this arc, and the instrument is the same one each time.
    ok("!! *** no rejectAndAccumulate(): the mask-to-factor inversion has no WGSL ***",
       !/rejectAndAccumulate\s*\(/.test(codeOnly(src)),
       "DISOCCLUSION writes 1 where history is WRONG, RECTIFY reads 1 where history is TRUSTED. historyFactorCPU " +
       "inverts and multiplies in the reactive and shading terms, and there is no kernel for it: " +
       "render/temporalRejectWgsl.mjs exports DISOCCLUSION_WGSL, RECTIFY_WGSL and a YCoCg fragment, nothing else. " +
       "The first draft dispatched both and bound an all-zero factor under a comment claiming it fed the mask " +
       "in -- which meant DISCARD ALL HISTORY on every pixel.");
    ok("...and the reason is recorded where the method would have been",
       /no WGSL[\s*]+for it anywhere in the tree/.test(src) && /its own rung/.test(src),
       "an absent method with no note reads as an oversight, and the next person writes the broken one again.");
    ok("...and the flag words are named, so a caller never passes a bare 7",
       RECTIFY_FLAGS.YCOCG === 1 && RECTIFY_FLAGS.CLAMP === 2 && RECTIFY_FLAGS.HAS_HIST === 4 && RECTIFY_FLAGS.HAS_FAC === 8,
       "the same four the kernel declares as WGSL consts");
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

    const r = await runInEngineOrigin({ engineRoot: ENG, args: {
        W, H, TH, motion: Array.from(MOT), prevDepth: Array.from(DEP_PREV),
        cur: Array.from(CUR), hist: Array.from(HIS), fac: Array.from(FAC) }, script: `async (a) => {
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
        let refused = null, noThreshold = null;
        try { new TemporalRejectGPU({ backend: "webgl2" }); } catch (e) { refused = String(e.message).slice(0, 130); }
        try { await G.disocclusion({ motion: new Float32Array(a.motion), prevDepth: new Float32Array(a.prevDepth), w: a.W, h: a.H }); }
        catch (e) { noThreshold = String(e.message).slice(0, 110); }
        return { mask: Array.from(mask.data), rect: Array.from(rect.data), rectNoFac: Array.from(rectNoFac.data),
                 rectRgb: Array.from(rectRgb.data), refused, noThreshold, errs, backend: dev.backend,
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

        ok("...and the threshold refusal is DRIVEN on the device, not read from the source",
           typeof G.noThreshold === "string" && /threshold/.test(G.noThreshold), G.noThreshold || "it did NOT throw");
        ok("...and the device refusal is DRIVEN: a non-webgpu device throws at construction",
           typeof G.refused === "string" && /webgpu/.test(G.refused), G.refused || "it did NOT throw");
    }
}

console.log(fails ? `\ntemporalRejectGPU-selfcheck: ${fails} FAILED` : "\ntemporalRejectGPU-selfcheck: ALL GREEN");
console.log("unchecked here: the FACTOR KERNEL that does not exist -- inverting a mask and multiplying in the " +
            "reactive and shading terms is historyFactorCPU's job and has no WGSL, which is what stops these two " +
            "kernels chaining on one encoder and is its own rung; `relax`, which RECTIFY_WGSL has no binding for " +
            "and the runner therefore refuses to accept; and the temporal arc's last FIVE unreachable kernels " +
            "(RING_FLOOR and temporalLock's four), which tools/ship/kernelReach-selfcheck.mjs counts at 12.");
process.exit(fails ? 1 : 0);
