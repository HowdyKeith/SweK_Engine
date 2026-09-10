#!/usr/bin/env node
// WebGLEngine/render/motionVectors-selfcheck.mjs -- v4548
//
// THE PREREQUISITE RUNG FOR THE TEMPORAL PATH, AND USEFUL WITHOUT IT. fx/fsr/fsr-selfcheck.mjs closes by saying
// FSR2/3 cannot start here: it wants depth, per-pixel motion vectors and a jittered projection with history, and
// this tree kept no previous-frame matrix and computed no velocity at all. render/motionVectors.mjs is the first
// two of those -- the history holder and the velocity buffer -- and a velocity buffer is what temporal AA, motion
// blur and any reprojection want, not only FSR.
//
// A motion vector here is: for the surface visible at a pixel THIS frame, where that same surface point was on
// screen LAST frame, in UV units, so history(uv + velocity) samples it. The sign is asserted, not assumed.
//
// The rows are the three things a motion vector must do and one thing it must refuse:
//   * a STATIC camera must give EXACTLY zero, whatever the depth field -- this is the unproject/reproject round
//     trip, and it catches a transposed matrix, a wrong multiply order and a missed y-flip all at once;
//   * a known camera move must give the displacement an INDEPENDENT projection of the same point computes, by a
//     different path (world -> prev clip) than the kernel's (uv + depth -> world -> prev clip);
//   * parallax must go as 1/distance -- that IS what a motion vector encodes, and a velocity that ignored depth
//     would pass the first two rows and fail this one;
//   * a point BEHIND the previous eye has no answer and must come back invalid rather than plausible.
"use strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInEngineOrigin, webgpuSkipReason } from "../tools/ship/webgpuHarness.mjs";
import { validateWgsl } from "./wgslSpec.mjs";
import { motionVectorsCPU, mat4Invert, mat4Multiply, transform4, makeMotionState, advance, hasHistory } from "./motionVectors.mjs";
import { MOTION_WGSL } from "./motionVectorsWgsl.mjs";
import { viewProj } from "./rasterProbe.js";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const report = (s) => console.log(`  ----  ${s}`);

const W = 16, H = 16, TAN = Math.tan(0.5), ASP = 1, NEAR = 0.1, FAR = 100;
/** GL-style: render/rasterProbe.js's own builder, clip z in [-1, 1]. */
const glVP = (ex) => viewProj([ex, -8, 0], [0, 1, 0], [1, 0, 0], [0, 0, 1], TAN, ASP, NEAR, FAR);
/** WebGPU-style: the same camera with the z row mapped to [0, 1], which is what gfx/device.js's depth target holds. */
function gpuVP(ex) {
    const gl = glVP(ex);
    // z01 = (z11 + w) / 2, so scale the third ROW by 1/2 and add half the fourth row (column-major: index c*4 + r)
    const out = Float32Array.from(gl);
    for (let c = 0; c < 4; c++) out[c * 4 + 2] = 0.5 * gl[c * 4 + 2] + 0.5 * gl[c * 4 + 3];
    return out;
}
const proj = (m, p) => { const q = transform4(m, p[0], p[1], p[2], 1); return { u: (q[0] / q[3] + 1) * 0.5, v: (1 - q[1] / q[3]) * 0.5, z: q[2] / q[3], w: q[3] }; };

console.log("\n1. THE MATRIX WORK, HELD TO ITS OWN DEFINITION");
{
    ok("the WGSL validates against the spec scanner", validateWgsl(MOTION_WGSL).length === 0, validateWgsl(MOTION_WGSL).join("; "));
    // mat4Invert is graded by what an inverse IS, not by a reading of its cofactors
    const vp = glVP(1.7), I = mat4Multiply(vp, mat4Invert(vp));
    let worstI = 0;
    for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) worstI = Math.max(worstI, Math.abs(I[c * 4 + r] - (c === r ? 1 : 0)));
    ok(`mat4Invert IS an inverse: VP * inv(VP) is the identity to ${worstI.toExponential(2)} (Float32 through a projection matrix)`, worstI < 1e-4, worstI.toExponential(3));
    ok("  and a singular matrix comes back null rather than a matrix of infinities", mat4Invert(new Float32Array(16)) === null);

    // *** THE FIRST FRAME HAS NO PREVIOUS FRAME, AND "ZERO VELOCITY" THERE IS A LIE A TEMPORAL PASS WILL BELIEVE. ***
    const st = makeMotionState();
    const p0 = advance(st, glVP(0)), h0 = hasHistory(st);
    const p1 = advance(st, glVP(1)), h1 = hasHistory(st);
    ok("the history holder says NO HISTORY on the first frame and yields the previous matrix from the second on -- zero velocity and no-velocity are different answers",
       p0 === null && h0 === false && p1 !== null && h1 === true && p1[12] === glVP(0)[12], `frame1 prev=${p0}, hasHistory=${h0}; frame2 prev=${p1 ? "matrix" : null}, hasHistory=${h1}`);
}

console.log("\n2. WHAT A MOTION VECTOR MUST DO");
const depthField = new Float32Array(W * H).map((_, i) => -0.9 + 1.8 * ((i * 37) % 101) / 101);
{
    // *** A STATIC CAMERA MUST GIVE EXACTLY ZERO, and on BOTH clip conventions, because the module claims to be
    // agnostic in z and a claim nothing exercises is prose. The GL builder maps z to [-1, 1] and gpuVP to [0, 1];
    // the depth field is fed in each one's own range.
    for (const [name, mk, dz] of [["GL-style, clip z in [-1,1]", glVP, depthField],
                                  ["WebGPU-style, clip z in [0,1]", gpuVP, depthField.map((d) => (d + 1) * 0.5)]]) {
        const vp = mk(0), st = motionVectorsCPU(dz, W, H, mat4Invert(vp), vp);
        let worst = 0, bad = 0;
        for (let i = 0; i < W * H; i++) { if (!st.valid[i]) { bad++; continue; }
            worst = Math.max(worst, Math.abs(st.data[i * 4]), Math.abs(st.data[i * 4 + 1])); }
        ok(`*** a STATIC camera gives zero velocity on every one of ${W * H} pixels, ${name} -- worst ${worst.toExponential(2)}, ${bad} invalid ***`,
           worst < 1e-6 && bad === 0, `worst ${worst.toExponential(3)}, ${bad} invalid`);
    }

    // *** THE KERNEL'S ANSWER AGAINST AN INDEPENDENT PROJECTION OF THE SAME POINT. *** The kernel goes
    // uv + depth -> world -> previous clip. The expectation goes world -> previous clip directly, from the world
    // point the pixel centre's ray reaches. Two paths, one number.
    const vpPrev = glVP(0), vpCur = glVP(0.5), invCur = mat4Invert(vpCur);
    const P = [1.5, 4.0, 0.8];
    const cur = proj(vpCur, P);
    const px = Math.floor(cur.u * W), py = Math.floor(cur.v * H);
    const d1 = new Float32Array(W * H); d1[py * W + px] = cur.z;
    const mv = motionVectorsCPU(d1, W, H, invCur, vpPrev);
    const cu = (px + 0.5) / W, cv = (py + 0.5) / H;
    const wp = transform4(invCur, 2 * cu - 1, 1 - 2 * cv, cur.z, 1);
    const qp = proj(vpPrev, [wp[0] / wp[3], wp[1] / wp[3], wp[2] / wp[3]]);
    const gotU = mv.data[(py * W + px) * 4], gotV = mv.data[(py * W + px) * 4 + 1];
    const wantU = qp.u - cu, wantV = qp.v - cv;
    ok(`*** a known camera move gives the displacement an INDEPENDENT projection computes: (${gotU.toFixed(6)}, ${gotV.toFixed(6)}) against (${wantU.toFixed(6)}, ${wantV.toFixed(6)}) ***`,
       Math.abs(gotU - wantU) < 1e-6 && Math.abs(gotV - wantV) < 1e-6, `got ${gotU},${gotV} want ${wantU},${wantV}`);
    ok(`  and the SIGN is the one a history sample wants: the camera moved +x, so the surface was to the RIGHT last frame (du = ${gotU.toFixed(4)} > 0) and history(uv + velocity) reaches it`,
       gotU > 0.01, `du ${gotU}`);

    // *** PARALLAX GOES AS 1/DISTANCE, WHICH IS THE WHOLE POINT. *** A velocity that ignored depth entirely would
    // pass both rows above -- a static camera still gives zero and a known move still gives one number -- and fail
    // only here. Measured across a 64x range of distances, |velocity| * distance must be one constant.
    const centre = Math.floor(H / 2) * W + Math.floor(W / 2);
    const rows = [1, 2, 4, 8, 16, 64].map((zw) => {
        const c = proj(vpCur, [0, -8 + zw, 0]);
        const dd = new Float32Array(W * H); dd[centre] = c.z;
        const m2 = motionVectorsCPU(dd, W, H, invCur, vpPrev);
        const mag = Math.hypot(m2.data[centre * 4], m2.data[centre * 4 + 1]);
        return { zw, mag, product: mag * zw };
    });
    const p0 = rows[0].product, drift = Math.max(...rows.map((r) => Math.abs(r.product - p0) / p0));
    ok(`*** PARALLAX goes as 1/distance: |velocity| * distance is constant to ${(drift * 100).toExponential(1)}% across distances ${rows.map((r) => r.zw).join(", ")} -- ${rows.map((r) => r.mag.toExponential(2)).join(", ")} ***`,
       drift < 1e-3 && rows[0].mag > 0.1, rows.map((r) => `${r.zw}:${r.product.toFixed(5)}`).join(" "));

    // *** AND A POINT BEHIND THE PREVIOUS EYE HAS NO ANSWER. *** A caller that reads the vector without reading
    // `valid` would get a plausible zero for a surface that was not on screen at all last frame, which is exactly
    // how a temporal pass smears geometry that has just come into view.
    const behindPrev = viewProj([0, 6, 0], [0, 1, 0], [1, 0, 0], [0, 0, 1], TAN, ASP, NEAR, FAR);   // eye AHEAD of the surface
    const cNear = proj(vpCur, [0, 0, 0]);
    const dB = new Float32Array(W * H); dB[centre] = cNear.z;
    const mb = motionVectorsCPU(dB, W, H, invCur, behindPrev);
    ok(`a surface BEHIND the previous eye comes back invalid, not zero (valid=${mb.valid[centre]}, channel z=${mb.data[centre * 4 + 2]})`,
       mb.valid[centre] === 0 && mb.data[centre * 4 + 2] === 0, `valid ${mb.valid[centre]}`);
}

console.log("\n3. ON THE DEVICE: the WGSL through gfx/device.js, held to the CPU reference");
const skip = webgpuSkipReason();
if (skip) { console.log(`  SKIP  ${skip}`); report("*** NOT A PASS. *** Sections 1 and 2 are CPU only; nothing here has run the kernel."); fails++; }
else {
    // the WebGPU-convention matrices, because that is the pair a caller reading gfx/device.js's depth target holds
    const vpPrev = gpuVP(0), vpCur = gpuVP(0.5), invCur = mat4Invert(vpCur);
    const dz = depthField.map((d) => (d + 1) * 0.5);
    const CPU = motionVectorsCPU(dz, W, H, invCur, vpPrev);
    const r = await runInEngineOrigin({ engineRoot: ENG, args: { W, H, depth: Array.from(dz), invCur: Array.from(invCur), vpPrev: Array.from(vpPrev) }, script: `async (a) => {
        const { requestDevice } = await import("/gfx/device.js");
        const { MOTION_WGSL } = await import("/render/motionVectorsWgsl.mjs");
        const cv = document.createElement("canvas"); cv.width = 8; cv.height = 8;
        const dev = await requestDevice(cv, { backend: "webgpu", offscreen: true });
        const errs = []; if (dev.gpu && dev.gpu.addEventListener) dev.gpu.addEventListener("uncapturederror", (e) => errs.push(String(e.error && e.error.message).slice(0, 200)));
        const depth = dev.buffer({ data: new Float32Array(a.depth), usage: ["storage"] });
        const dst = dev.buffer({ data: new Float32Array(a.W * a.H * 4), usage: ["storage"] });
        // struct P { invVPCur : mat4x4<f32>, vpPrev : mat4x4<f32>, dims : vec4<u32> } -- 64 + 64 + 16 bytes
        const ub = new ArrayBuffer(144);
        new Float32Array(ub, 0, 16).set(a.invCur); new Float32Array(ub, 64, 16).set(a.vpPrev);
        new Uint32Array(ub, 128, 4).set([a.W, a.H, 0, 0]);
        const u = dev.buffer({ data: new Uint32Array(ub), usage: "uniform" });
        const p = dev.compute({ wgsl: MOTION_WGSL });
        p.bind("depth", depth).bind("dst", dst).bind("u", u);
        dev.frame(({ pass }) => { pass.dispatch(p, [Math.ceil(a.W / 8), Math.ceil(a.H / 8)]); pass.clear([0, 0, 0, 1]); }, { offscreen: true });
        return { out: Array.from(new Float32Array(await dev.read(dst))), errs, backend: dev.backend };
    }` });
    ok("the harness ran the kernel on a real WebGPU device", r.ok && r.result && r.result.backend === "webgpu" && r.result.errs.length === 0 && r.result.out.length === W * H * 4,
       r.ok ? `${r.result && r.result.backend}; errors ${(r.result && r.result.errs || []).join(" | ")}` : (r.reason || (r.pageErrors || []).join("; ")));
    if (r.ok && r.result && r.result.out.length === W * H * 4) {
        const G = r.result.out;
        let worst = 0, validBad = 0;
        for (let i = 0; i < W * H; i++) {
            for (let c = 0; c < 2; c++) worst = Math.max(worst, Math.abs(G[i * 4 + c] - CPU.data[i * 4 + c]));
            if (G[i * 4 + 2] !== CPU.valid[i]) validBad++;
        }
        // *** THE TOLERANCE IS IN PIXELS, AND IT IS NOT THE ONE THE FSR GATES USE. *** fx/fsr holds its kernels to
        // 1e-6 because their arithmetic is a weighted average of nearby texels -- well conditioned, and f32 against
        // f64 barely shows. This is an unprojection through an INVERSE projection matrix followed by a difference of
        // two nearly equal uv values: catastrophic cancellation by construction, and 1e-6 was a number copied from a
        // different problem. MEASURED here: 1.5e-5 in uv, which on this buffer is 2.4e-4 of a PIXEL -- the unit a
        // motion vector is actually read in, and the unit the bound is stated in.
        const worstPx = worst * Math.max(W, H);
        ok(`*** the device's velocity buffer is the CPU reference's to ${worstPx.toExponential(2)} of a PIXEL (${worst.toExponential(2)} in uv) on every one of ${W * H * 2} components, and agrees about validity on all ${W * H} pixels ***`,
           worstPx < 0.01 && validBad === 0, `worst ${worstPx.toExponential(3)} px / ${worst.toExponential(3)} uv, ${validBad} validity disagreements`);

        // ---- *** THE FOURTH CHANNEL, WHICH v4552 ADDED AND WHICH THIS ROW EXISTS BECAUSE NOBODY CHECKED. ***
        // zPrev is the depth this surface would have had last frame; render/temporalReject.mjs's disocclusion
        // test is one subtraction from it. It arrived with the row above comparing channels 0, 1 and 2 and
        // NOTHING reading channel 3 -- so blanking `dst[o+3u] = 0.0` in the WGSL went 0-RED across this gate
        // AND across temporalReject's, whose device section uploads a CPU-built motion buffer and never runs
        // this kernel. A channel two gates consume and neither one measures.
        let worstZ4 = 0, zCount = 0;
        for (let i = 0; i < W * H; i++) {
            if (!CPU.valid[i]) continue;
            worstZ4 = Math.max(worstZ4, Math.abs(G[i * 4 + 3] - CPU.data[i * 4 + 3]));
            if (Math.abs(CPU.data[i * 4 + 3]) > 1e-6) zCount++;
        }
        ok(`*** and the device's zPrev channel matches the CPU's to ${worstZ4.toExponential(2)} on all ${zCount} pixels that have a depth to compare -- the channel render/temporalReject.mjs's disocclusion test reads ***`,
           worstZ4 < 1e-5 && zCount > W * H * 0.5, `worst ${worstZ4.toExponential(3)}, ${zCount} pixels with a nonzero zPrev`);
        // and the device's OWN buffer must show the static-camera zero, because a mirror is not a measurement
        const rz = await runInEngineOrigin({ engineRoot: ENG, args: { W, H, depth: Array.from(dz), invCur: Array.from(mat4Invert(gpuVP(0))), vpPrev: Array.from(gpuVP(0)) }, script: `async (a) => {
            const { requestDevice } = await import("/gfx/device.js");
            const { MOTION_WGSL } = await import("/render/motionVectorsWgsl.mjs");
            const cv = document.createElement("canvas"); cv.width = 8; cv.height = 8;
            const dev = await requestDevice(cv, { backend: "webgpu", offscreen: true });
            const depth = dev.buffer({ data: new Float32Array(a.depth), usage: ["storage"] });
            const dst = dev.buffer({ data: new Float32Array(a.W * a.H * 4), usage: ["storage"] });
            const ub = new ArrayBuffer(144);
            new Float32Array(ub, 0, 16).set(a.invCur); new Float32Array(ub, 64, 16).set(a.vpPrev);
            new Uint32Array(ub, 128, 4).set([a.W, a.H, 0, 0]);
            const u = dev.buffer({ data: new Uint32Array(ub), usage: "uniform" });
            const p = dev.compute({ wgsl: MOTION_WGSL }); p.bind("depth", depth).bind("dst", dst).bind("u", u);
            dev.frame(({ pass }) => { pass.dispatch(p, [Math.ceil(a.W / 8), Math.ceil(a.H / 8)]); pass.clear([0,0,0,1]); }, { offscreen: true });
            return Array.from(new Float32Array(await dev.read(dst)));
        }` });
        let worstZ = 0, nz = 0;
        if (rz.ok) for (let i = 0; i < W * H; i++) { worstZ = Math.max(worstZ, Math.abs(rz.result[i * 4]), Math.abs(rz.result[i * 4 + 1])); if (rz.result[i * 4 + 2] !== 1) nz++; }
        // the CPU reaches 8.1e-9 on the same test and the device 1.5e-6 -- about two hundred times looser, which is
        // f32 against f64 through the same cancellation and is worth printing rather than hiding behind one bound
        const worstZPx = worstZ * Math.max(W, H);
        ok(`  and the DEVICE's own buffer gives zero for a static camera: ${worstZPx.toExponential(2)} of a pixel (${worstZ.toExponential(2)} uv, against the CPU's 8.1e-9 -- f32 against f64), ${nz} invalid. Asserted on the device's output, not inherited from the CPU's`,
           rz.ok && worstZPx < 1e-3 && nz === 0, rz.ok ? `worst ${worstZPx.toExponential(3)} px / ${worstZ.toExponential(3)} uv` : rz.reason);
    }
}

// SABOTAGE LOG -- applied to render/motionVectors.mjs and render/motionVectorsWgsl.mjs, gate run, red count read,
// both files restored and md5-verified. Baseline 0 red. MEASURED at v4548.
//   AF the y-flip dropped on both sides                     -> 5 red. uv's y runs down and clip's runs up; without it
//      even a STATIC camera reads 9.4e-1, which is most of the screen.
//   AG the DEPTH ignored, clip z pinned to the near plane    -> 2 red, and this is the row that earns its place: the
//      static-camera rows stay GREEN (prev == cur still round-trips whatever z you feed it) and only the parallax
//      row catches it, at 6.3e+3% drift. A velocity that ignores depth is not a motion vector, and two of the four
//      properties cannot tell.
//   AH the velocity's sign flipped                           -> 2 red, including the row that exists to pin the sign.
//   AI the perspective divide skipped after the unprojection -> 6 red, the whole section.
//   AJ the behind-the-eye refusal removed                    -> 1 red: a surface that was not on screen last frame
//      comes back valid with a plausible number, which is how a temporal pass smears new geometry.
//   AK the history holder returning a zero matrix instead of null on the first frame -> 1 red. A zero matrix is a
//      lie that reads as "no motion"; null is the truth, which is "no history".
//   AL the matrices multiplied in the WGSL ONLY as row-vectors -> 2 red, caught by the CPU mirror at 74.7 PIXELS.
//   No 0-RED among the seven.
console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: a MOVING OBJECT -- every row moves the camera and holds the world still, so this measures " +
    "camera motion only and a per-object previous model matrix is its own rung; DYNAMIC DEPTH, since the depth field is " +
    "handed in rather than rendered, so nothing here reads gfx/device.js's depth target through dev.depthTexture(); the " +
    "JITTERED projection FSR's temporal path also wants, which is the third of the three prerequisites and untouched; and " +
    "DISOCCLUSION -- a surface revealed this frame reprojects to wherever the occluder was, and `valid` catches only the " +
    "behind-the-eye case, not that one.");
process.exit(fails ? 1 : 0);
