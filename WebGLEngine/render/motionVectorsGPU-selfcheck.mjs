#!/usr/bin/env node
// WebGLEngine/render/motionVectorsGPU-selfcheck.mjs -- v4592
//
// Run: node render/motionVectorsGPU-selfcheck.mjs
// RUNTIME 1618 ms ALONE (median of 1685/1618/1582) -- inside the 3000 ms sweep budget: it spawns a browser
// origin and a real adapter but dispatches three small pictures rather than timing a loop.
//
// SABOTAGE: 6 mutations. 4 caught outright; TWO WENT 0-RED AND BOTH WERE THIS GATE'S FIXTURES RATHER THAN ITS
// DETECTORS, which is the useful half of the pass.
//   U1 the pan camera's translation sign flipped -- v4586's own bug, moved into the matrix -> 3 rows red.
//   U2 the translation dropped entirely (a camera that does not pan) -> 3 rows red.
//   U3 the two matrices written at each other's uniform offsets -> 3 rows red.
//   U5 the device refusal removed -> the driven refusal row.
//   *** U4 dims packed as [h, w] instead of [w, h] -> NOTHING. Every fixture was SQUARE: 96x96 and the page's
//   192x192, so swapping the two changed no arithmetic anywhere. A caller with a non-square target would have
//   got garbage and this gate would have passed it. Fixture now 96x64, and U4 takes two rows.
//   *** U6 the kernel forced to report EVERY pixel valid -> NOTHING. An orthographic pair over a flat scene has
//   w = 1 everywhere and never produces an invalid pixel, so the valid-agreement row was comparing all-ones to
//   all-ones. Then the obvious repair -- the eye position render/motionVectors-selfcheck.mjs uses for its
//   single-pixel invalid case -- put the WHOLE surface behind the previous camera: 6144 of 6144 invalid, both
//   sides writing invalidTo = 0, and the row compared all-zeros to all-zeros at a triumphant 0.000e+0. ONE
//   VACUOUS FIXTURE TRADED FOR ANOTHER INSIDE THE ROW ADDED TO FIX THE FIRST. Measured across eight eye
//   positions to find the one that straddles; U6 now fails with 4818 mismatches, which is the invalid count.
//   And that straddling fixture is pathological for NUMBERS -- |du| to 57 UV units near the projection
//   singularity, f32 to 2.1e-3 -- so parity moved to a third, well-conditioned camera. Two fixtures, because
//   one cannot answer both questions and a tolerance wide enough to cover both is a number chosen to fit.
//
// *** THREE OF THE SEVENTEEN, AND THE ROUND'S PREMISE WAS WRONG BEFORE IT STARTED. ***
//
// v4591 closed by proposing that fsr.html "writes its motion vectors by hand, which is a second implementation
// of motionVectorsCPU". It is not: that function takes a DEPTH BUFFER and two 4x4 matrices and reprojects every
// pixel through them, and the page had neither -- it panned a 2D scene and wrote a constant du. Two different
// things, and the duplicate-rule finding would have been invented rather than measured. SECOND HAND-OFF CLAIM
// IN FOUR ROUNDS THAT ITS OWN PRIOR-ART CHECK REFUTED.
//
// What is true is smaller and worth more. The page's constant was DECLARED. This round makes it DERIVED, and
// the first row below is why that is safe: the tree's own gated producer, driven by an orthographic pan camera,
// reproduces the hand-written field exactly. A number that happens to be right is not a number something
// derives -- and this one was WRONG ONCE, the sign, at v4586, caught by a counter rather than by a check.
"use strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInEngineOrigin, webgpuSkipReason } from "../tools/ship/webgpuHarness.mjs";
import { motionVectorsCPU, mat4Invert } from "./motionVectors.mjs";
import { temporalAccumulateCPU } from "./temporalAccumulate.mjs";
import { orthoPanVP, packMotionUniform } from "./motionVectorsGPU.mjs";
import { viewProj } from "./rasterProbe.js";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const say = (l, n = "") => console.log(`  ----  ${l}${n ? "   " + n : ""}`);

const D = 192, PAN = 0.75;                     // fsr.html's display size and its pan, so this is ITS camera
const FLAT = new Float32Array(D * D);          // a flat scene: the page has no depth, every pixel at one plane

console.log("motionVectorsGPU-selfcheck -- the page's constant, derived\n");

console.log("1. *** THE ORTHOGRAPHIC PAN CAMERA REPRODUCES THE HAND-WRITTEN FIELD, WHICH IS WHAT MAKES THE");
console.log("   PAGE SAFE TO CHANGE ***");
{
    const want = PAN / D;                      // exactly what fsr.html wrote: motion[i*4] = PAN / D
    let worstU = 0, worstV = 0, invalid = 0, frames = 0;
    for (const frame of [1, 7, 23, 64]) {
        const mv = motionVectorsCPU(FLAT, D, D, mat4Invert(orthoPanVP(frame * PAN / D)), orthoPanVP((frame - 1) * PAN / D));
        for (let i = 0; i < D * D; i++) {
            worstU = Math.max(worstU, Math.abs(mv.data[i * 4] - want));
            worstV = Math.max(worstV, Math.abs(mv.data[i * 4 + 1]));
            if (mv.data[i * 4 + 2] === 0) invalid++;
        }
        frames++;
    }
    ok("!! *** the derived du is the page's constant, EXACTLY, at every frame tested ***",
       worstU === 0 && worstV < 1e-15 && invalid === 0,
       `worst |du - ${want.toExponential(6)}| = ${worstU.toExponential(3)}, worst |dv| = ${worstV.toExponential(3)}, ` +
       `${invalid} invalid, over ${frames} frames x ${D * D} pixels. Zero, not "close": a pan of a flat scene ` +
       "through an orthographic pair is an exact translation, and anything else would mean the matrix is not " +
       "the camera the page has.");

    // *** AND THE ROW ABOVE MUST BE ABLE TO FAIL, WHICH A WRONG CAMERA IS THE CONTROL FOR. ***
    // The page's own bug was the SIGN. A camera panning the other way produces -du and nothing else changes,
    // so this is the exact mistake v4586 cost a round to find, driven here instead of waited for.
    const back = motionVectorsCPU(FLAT, D, D, mat4Invert(orthoPanVP(7 * PAN / D)), orthoPanVP(8 * PAN / D));
    ok("...and a camera panning the OTHER WAY gives exactly the negated field, which is v4586's bug as a control",
       Math.abs(back.data[0] + want) < 1e-12 && back.data[0] < 0,
       `du = ${back.data[0].toExponential(6)} against ${(-want).toExponential(6)}. THE PAGE SHIPPED THIS SIGN ` +
       "for a round: the panning pane scored 11.5 dB against bilinear's 14.8 and the accumulate's offscreen " +
       "counter said so before the picture did. A derived field cannot get it wrong for free.");

    ok("...and the uniform packs to the 144 bytes the kernel's struct declares",
       packMotionUniform(orthoPanVP(0), orthoPanVP(0), D, D).byteLength === 144,
       "struct P { invVPCur : mat4x4<f32>, vpPrev : mat4x4<f32>, dims : vec4<u32> } -- 64 + 64 + 16. A uniform " +
       "laid out by hand against a struct declared in another file is worth one row on its own.");
}

console.log("\n2. ON THE DEVICE: MOTION_WGSL through the runner, against motionVectorsCPU");
const skip = webgpuSkipReason();
if (skip) { console.log(`  SKIP  ${skip}`); say("*** NOT A PASS. *** Nothing here has run."); fails++; }
else {
    // *** THE DEVICE FIXTURE IS NON-SQUARE AND PERSPECTIVE, AND BOTH OF THOSE WERE SABOTAGE FINDINGS. ***
    //
    // It started 96x96 orthographic, and two mutations went 0-RED against it:
    //   - packing `dims` as [h, w] instead of [w, h] changed NOTHING, because every fixture was square. A
    //     caller with a non-square target would have got garbage and this gate would have passed.
    //   - forcing the kernel to report EVERY pixel valid changed nothing either, because an orthographic pair
    //     over a flat scene has w = 1 everywhere and never produces an invalid pixel. The valid-agreement row
    //     was comparing all-ones to all-ones: a control that cannot fail.
    // So: 96 x 64, and a PERSPECTIVE pair whose previous eye sits AHEAD of the surface, which is the shape
    // render/motionVectors-selfcheck.mjs already uses to make q.w <= 0 -- a surface that was not on screen at
    // all last frame, which is how a temporal pass smears geometry that has just come into view.
    const W = 96, H = 64, TAN = Math.tan(0.5), NEAR = 0.1, FAR = 100;
    const DEPTH = new Float32Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) DEPTH[y * W + x] = 0.2 + 0.6 * ((x + y) / (W + H));
    const vpCur = viewProj([0, -8, 0], [0, 1, 0], [1, 0, 0], [0, 0, 1], TAN, W / H, NEAR, FAR);
    // *** TWO PREVIOUS CAMERAS, BECAUSE ONE FIXTURE CANNOT ANSWER BOTH QUESTIONS -- WHICH TOOK THREE TRIES. ***
    //
    //   1. [0, 6, 0] is where render/motionVectors-selfcheck.mjs puts an eye to make ONE pixel invalid. At this
    //      frame size it puts the WHOLE surface behind: 6144 of 6144 invalid, both sides writing invalidTo = 0
    //      everywhere, and the parity row comparing all-zeros to all-zeros at a triumphant 0.000e+0. One vacuous
    //      fixture traded for another, inside the row added to fix the first.
    //   2. [0, -7.5, 0] straddles -- 4818 invalid, 1326 valid, measured across eight eye positions -- which is
    //      what the VALIDITY row needs. But it is pathological for NUMBERS: those valid pixels sit near the
    //      previous camera's plane, |du| runs to 57 UV units (fifty-seven screen widths), and the divide
    //      amplifies f32 to 2.1e-3 absolute. That is not a divergence, it is a fixture chosen for one property
    //      being read for another.
    //   3. [0.5, -8, 0] is a modest lateral move: 0 invalid, |du| up to 1.22, well conditioned, which is what
    //      the PARITY row needs.
    //
    // So the parity is measured on (3) and the validity on (2). The alternative was one fixture and a tolerance
    // wide enough to cover its worst case, which is a number chosen to fit the answer.
    const vpPrevStraddle = viewProj([0, -7.5, 0], [0, 1, 0], [1, 0, 0], [0, 0, 1], TAN, W / H, NEAR, FAR);
    const vpPrev = viewProj([0.5, -8, 0], [0, 1, 0], [1, 0, 0], [0, 0, 1], TAN, W / H, NEAR, FAR);
    const invCur = mat4Invert(vpCur);

    const r = await runInEngineOrigin({ engineRoot: ENG, args: { W, H, depth: Array.from(DEPTH), invCur: Array.from(invCur), vpPrev: Array.from(vpPrev), vpPrevStraddle: Array.from(vpPrevStraddle), PAN, D }, script: `async (a) => {
        const { requestDevice } = await import("/gfx/device.js");
        const { MotionVectorsGPU, orthoPanVP } = await import("/render/motionVectorsGPU.mjs");
        const cv = document.createElement("canvas"); cv.width = 8; cv.height = 8;
        const dev = await requestDevice(cv, { backend: "webgpu", offscreen: true });
        const errs = []; if (dev.gpu && dev.gpu.addEventListener) dev.gpu.addEventListener("uncapturederror", (e) => errs.push(String(e.error && e.error.message).slice(0, 200)));
        const G = new MotionVectorsGPU(dev);
        const depth = new Float32Array(a.depth);
        const out = await G.motion(depth, a.W, a.H, new Float32Array(a.invCur), new Float32Array(a.vpPrev));
        const straddle = await G.motion(depth, a.W, a.H, new Float32Array(a.invCur), new Float32Array(a.vpPrevStraddle));
        // and the page's own case at its own size, flat, so the number the page will use is the number measured
        const flat = await G.pan({ depth: new Float32Array(a.D * a.D), w: a.D, h: a.D, tCur: 7 * a.PAN / a.D, tPrev: 6 * a.PAN / a.D });
        const flatAll = Array.from(flat.data);
        let refused = null;
        try { new MotionVectorsGPU({ backend: "webgl2" }); } catch (e) { refused = String(e.message).slice(0, 140); }
        return { out: Array.from(out.data), straddle: Array.from(straddle.data), flatDu: flat.data[0], flatDv: flat.data[1], flatValid: flat.data[2], flatAll,
                 errs, backend: dev.backend, refused,
                 adapter: (dev.adapterInfo && (dev.adapterInfo.description || dev.adapterInfo.vendor)) || "unknown" };
    }` });

    ok("the runner ran on a real WebGPU device", r.ok && r.result && r.result.backend === "webgpu" && (r.result.errs || []).length === 0,
       r.ok ? `${r.result && r.result.backend}, adapter ${r.result && r.result.adapter}; errors ${(r.result && r.result.errs || []).join(" | ")}`
            : (r.reason || (r.pageErrors || []).join("; ")));

    if (r.ok && r.result) {
        const G = r.result;
        const C = motionVectorsCPU(DEPTH, W, H, invCur, vpPrev);                 // well conditioned: parity
        const S = motionVectorsCPU(DEPTH, W, H, invCur, vpPrevStraddle);         // straddling: validity
        const invalidInFixture = S.valid.reduce((n, v) => n + (v === 0 ? 1 : 0), 0);
        let worst = 0, validMismatch = 0, maxDu = 0;
        for (let i = 0; i < W * H; i++) {
            for (let c = 0; c < 4; c++) worst = Math.max(worst, Math.abs(G.out[i * 4 + c] - C.data[i * 4 + c]));
            maxDu = Math.max(maxDu, Math.abs(C.data[i * 4]));
            // *** THE CPU CARRIES `valid` TWICE AND THE KERNEL ONCE. *** The convention is (du, dv, valid,
            // zPrev); motionVectorsCPU ALSO fills a Uint8Array beside it for its own callers. The two must not
            // disagree, and the row that would catch it is this one rather than the tolerance above.
            if ((G.straddle[i * 4 + 2] !== 0) !== (S.valid[i] === 1)) validMismatch++;
        }
        ok(`*** motion() is motionVectorsCPU's field, to ${worst.toExponential(2)}, on a scene with real depth variation ***`,
           worst < 1e-5,
           `worst ${worst.toExponential(3)} over ${W * H * 4} floats at ${W}x${H}, on a field whose own |du| ` +
           `reaches ${maxDu.toFixed(3)} -- a perspective divide per pixel, where f32 against f64 shows. The ` +
           "fixture varies z across the frame BECAUSE the page's own case is flat, and a flat scene cannot tell " +
           "a correct reprojection from one that ignores depth.");
        ok("!! ...and the kernel's valid CHANNEL agrees with the CPU's valid ARRAY on every pixel",
           validMismatch === 0 && invalidInFixture > 0 && invalidInFixture < W * H,
           `${validMismatch} of ${W * H} disagree; ${invalidInFixture} invalid and ${W * H - invalidInFixture} ` +
           "valid, which is the half that matters. An orthographic pair over a flat scene is ALL-valid and a " +
           "camera fully past the surface is ALL-invalid, and BOTH were 0-REDs here before the eye was tuned to " +
           "straddle. The convention writes validity into channel 2 and the CPU keeps a second copy in a " +
           "side-array; two representations of one fact are held equal rather than assumed.");
        // *** THE CPU's ZERO IS AN f64 ARTEFACT, AND THE FIRST DRAFT OF THIS ROW READ IT AS A STRONGER TRUTH. ***
        // Section 1 measures the derived du against the page's constant at EXACTLY zero, because the matrices are
        // f32 but JS does the arithmetic in f64 and the translation comes out exact. The kernel does the same
        // arithmetic in f32, through an inverse-VP transform, a VP-prev transform and a divide -- and lands 1.0e-8
        // away. The row was written at 1e-9 straight after reading section 1's zero, and went red. SAME MISTAKE
        // AS v4590's copy-through row, one round later: an exact claim is exact against the arithmetic that
        // produced it, and carrying a tolerance across a precision boundary is not a tightening, it is a category
        // error. What is asserted here is an f32 bound, and what the detail reports is the measurement.
        const dErr = Math.abs(G.flatDu - PAN / D);
        ok("!! *** and the page's OWN case, at its own size, on the device: the constant it shipped ***",
           dErr < 1e-7 && Math.abs(G.flatDv) < 1e-7 && G.flatValid === 1,
           `du ${G.flatDu.toExponential(6)} against ${(PAN / D).toExponential(6)} -- off by ${dErr.toExponential(2)}, ` +
           `dv ${G.flatDv.toExponential(2)}, valid ${G.flatValid}. Section 1's zero is f64 doing an exact ` +
           "translation; this is f32 through two matrix transforms and a divide, and 1e-8 is about an ulp at 3.9e-3.");

        // *** AND A 1e-8 DIFFERENCE IN A MOTION VECTOR IS NOT AUTOMATICALLY NOTHING, BECAUSE THE ACCUMULATE
        // TESTS A BOUND WITH IT. *** `hu < 0 || hu >= 1` decides whether a pixel has history at all, so a shift
        // of one ulp could in principle move a pixel across it and change the offscreen count -- which is the
        // counter this page's whole diagnostic rests on. Measured rather than dismissed: both motion fields
        // through the same accumulate, counts compared.
        const cpuFlat = motionVectorsCPU(new Float32Array(D * D), D, D,
                                         mat4Invert(orthoPanVP(7 * PAN / D)), orthoPanVP(6 * PAN / D)).data;
        const cur = new Float32Array(D * D * 4).fill(0.5), hist = new Float32Array(D * D * 4).fill(0.25);
        const withCPU = temporalAccumulateCPU({ current: cur, history: hist, motion: cpuFlat, w: D, h: D, alpha: 0.1 });
        const withGPU = temporalAccumulateCPU({ current: cur, history: hist, motion: new Float32Array(G.flatAll), w: D, h: D, alpha: 0.1 });
        ok("!! ...and that ulp does NOT move a pixel across the accumulate's offscreen bound",
           withCPU.stats.rejectedOffscreen === withGPU.stats.rejectedOffscreen &&
           withCPU.stats.reused === withGPU.stats.reused,
           `offscreen ${withCPU.stats.rejectedOffscreen} on both, reused ${withCPU.stats.reused} on both. ` +
           "The bound is hu < 0 || hu >= 1 and the field is 3.9e-3 from either engine, so an ulp is nowhere near " +
           "it here -- but the page's counters are the diagnostic, and 'nowhere near' is a measurement rather " +
           "than an assumption. A camera panning a whole texel per frame would sit much closer to it.");
        ok("...and the refusal is DRIVEN: a non-webgpu device throws at construction",
           typeof G.refused === "string" && /webgpu/.test(G.refused), G.refused || "it did NOT throw");
    }
}

console.log(fails ? `\nmotionVectorsGPU-selfcheck: ${fails} FAILED` : "\nmotionVectorsGPU-selfcheck: ALL GREEN");
console.log("unchecked here: a PERSPECTIVE camera through this runner -- render/motionVectors-selfcheck.mjs " +
            "drives the kernel with one and holds it to the CPU, and what is added here is the ORTHOGRAPHIC pan " +
            "case the page needed; DISOCCLUSION, which is what the zPrev channel is FOR and which " +
            "render/temporalReject.mjs owns; and the temporal arc's other SEVEN unreachable kernels, which " +
            "tools/ship/kernelReach-selfcheck.mjs counts at 14.");
process.exit(fails ? 1 : 0);
