// simulation/tomo/sinogramGPU.js -- the scan as one texture.
//
// Keith's Neo Geo observation, which is the right one: Doom on a machine with no framebuffer worked because the
// Neo Geo HAD sprite-scaling hardware, and a raycast column IS a vertically scaled sprite. Nobody ported a
// renderer; someone noticed the data already had the shape the hardware wanted, and the "wrong" hardware turned
// out to be exactly right.
//
// A SINOGRAM IS AN IMAGE. Detector across, angle down. Every pixel is one ray. Every ray is an independent sum of
// pow(u, 3.5) over blobs -- no interaction between rays, no ordering, no dependency. That is not "portable to a
// fragment shader"; that IS a fragment shader, described in different words. So one draw call computing one
// texture is the entire scan.
//
// BANDWIDTH IS NOT THE COST, which is the part Keith suspected and was right about: 64 views of 48 detectors is
// 12,288 bytes -- sendable sixty times a second over a modem from 1994. Even the big scan here, 256 x 180, is
// 180 KB. Nothing about this is wire-bound, so packing views into quadrants to save bandwidth would be solving a
// problem that does not exist.
//
// THE CASTING IS THE COST -- BUT NOT BY A FIXED FACTOR, and I said otherwise twice before measuring it properly.
// Casting is O(rays x blobs); back-projection is O(grid^2 x angles). Change either and the ratio moves. Measured
// at 256 x 180 into a 128^2 grid:
//
//     blobs     casting     reconstruct     ratio
//        8        33 ms        66 ms         0.50   <- the reconstruction dominates; a casting shader buys nothing
//       40       107 ms        51 ms         2.10
//      120       294 ms        51 ms         5.76
//      400      1010 ms        50 ms        20.20   <- the shader is buying essentially the whole frame
//
// So the crossover is around a dozen-odd blobs at this resolution, and the "10x" I quoted came from ONE
// configuration (16 views, 48 detectors, 110 blobs, a 32^2 grid) which I then repeated as though it were a
// property of the problem. It is a property of that afternoon. Past the crossover the case is overwhelming, and
// the expensive half is the embarrassingly parallel half -- but the honest claim is conditional.
//
// HONESTY ABOUT WHAT IS PROVEN HERE. I cannot run a GPU: no browser, no WebGL, no WebGPU in this sandbox. So the
// discipline is the one this engine already uses for every shader:
//   1. The GLSL and the JS twin below are transcriptions of ONE arithmetic, and share their constants literally --
//      SHADOW_K is interpolated into the shader source, so the two cannot drift apart without a syntax error.
//   2. The JS twin is verified HEADLESS against blobRadonAt, which is verified against the analytic Radon integral.
//      That chain is gated, so the arithmetic is proven correct even though the GPU running it is not.
//   3. The shader is RIG-ONLY correct-by-construction until the page adjudicates it. sinogram-gpu.html runs BOTH
//      and prints the worst disagreement, so the claim is settled on Keith's machine, by measurement, not by me.
//
// AND THE ADJUDICATOR EARNED ITS KEEP ON ITS FIRST RUN, v2490. Keith's GTX 1070/1080 measured 6.48e-4 against the
// twin where float32 alone predicts 1.2e-7 -- FIVE THOUSAND TIMES worse, and 6.10e-4 against the analytic shadow,
// so it was the GPU that was off and not the twin. NO HEADLESS TEST I CAN WRITE WOULD EVER HAVE FOUND THAT.
//   - First hypothesis, pow(): WRONG. Simulating exp2(y*log2(x)) in float32 gives 8.6e-7. Innocent.
//   - Second, sin/cos: GLSL ES places NO accuracy requirement on them AT ALL, and this shader recomputed the same
//     180 numbers 256 times each. Injecting a trig error and measuring: 1e-6 -> 1.19e-5, 1e-5 -> 1.15e-4,
//     1e-4 -> 1.15e-3. Keith's 6.48e-4 sits at a trig error of about 5e-5 -- squarely in range for an
//     unconstrained function, amplified by the 3.5 power.
// FIX: the CPU computes the 180 cos/sin once, correctly rounded, and uploads them. FALSIFIABLE PREDICTION for the
// rig: the adjudicator should fall from 6.48e-4 to about 1e-7. If it does not, this explanation is wrong and the
// real cause is still hiding.
"use strict";

// The one shadow constant, in one place. A Wyvill/poly6 blob of radius R and amplitude A casts, along a ray whose
// closest approach to the centre is c, a shadow of exactly (32/35) * A * R * u^3.5 with u = 1 - c^2/R^2.
// The 32/35 is not a fit: it is int_-1^1 (1-t^2)^3 dt = 32/35, and the exponent 3.5 is what the 3-power kernel
// integrates to along a chord. Verified to 3.8e-14 in v2478.
const SHADOW_K = 32 / 35;

// ---- the fragment shader. gl_FragCoord.x IS the detector, gl_FragCoord.y IS the angle. The frame IS the scan. --
const SINOGRAM_FS = `#version 300 es
precision highp float;
precision highp sampler2D;

uniform sampler2D uTrig;       // one texel per angle: rg = (cos, sin), computed on the CPU where they are exact
uniform sampler2D uBlobs;      // one texel per blob: rgba = (x, y, radius, amplitude)
uniform int   uBlobCount;
uniform int   uNDet;
uniform int   uNAngles;
uniform float uZ;              // slice height; blobs carry their own z in a second row
uniform sampler2D uBlobZ;      // r = z

out vec4 outShadow;   // RGBA32F, not R32F: R32F readback is implementation-dependent in WebGL2

const float SHADOW_K = ${SHADOW_K};

void main() {
    // THE WHOLE IDEA, IN TWO LINES: this pixel's column is which detector, this pixel's row is which angle.
    int di = int(gl_FragCoord.x);
    int ai = int(gl_FragCoord.y);
    float s = -1.0 + (float(di) + 0.5) * 2.0 / float(uNDet);
    // NOT cos(theta)/sin(theta). GLSL ES places NO accuracy requirement on sin and cos -- and this shader was
    // recomputing the same 180 numbers 256 times each, in a function nobody guarantees. Keith measured the
    // consequence on a GTX 1070/1080: 6.48e-4 against the twin, where float32 alone predicts 1.2e-7. A trig error
    // of ~5e-5 reproduces exactly that once the 3.5 power amplifies it. So the CPU computes them once, correctly
    // rounded, and hands them over. Fewer instructions AND more accuracy.
    vec2 cs = texelFetch(uTrig, ivec2(ai, 0), 0).rg;
    float ct = cs.x, st = cs.y;

    float acc = 0.0;
    for (int i = 0; i < 4096; i++) {
        if (i >= uBlobCount) break;
        vec4 b = texelFetch(uBlobs, ivec2(i, 0), 0);
        float bz = texelFetch(uBlobZ, ivec2(i, 0), 0).r;
        float perp = b.x * ct + b.y * st - s;
        float dz   = uZ - bz;
        float c2   = perp * perp + dz * dz;
        float R2   = b.z * b.z;
        if (c2 >= R2) continue;
        float u = 1.0 - c2 / R2;
        acc += SHADOW_K * b.w * b.z * pow(u, 3.5);
    }
    outShadow = vec4(acc, 0.0, 0.0, 1.0);
}`;

// ---- the JS twin. The SAME arithmetic, in the same order, from the same constant. This is what gets verified
// headless, and what the page adjudicates the GPU against.
// The angles' cos/sin, computed once, correctly rounded, in the one place both paths read them from.
function packTrig(nAngles) {
    const t = new Float32Array(nAngles * 4);
    for (let ai = 0; ai < nAngles; ai++) {
        const theta = Math.PI * ai / nAngles;
        t[ai*4] = Math.cos(theta); t[ai*4+1] = Math.sin(theta);
    }
    return t;
}

function sinogramCPU(blobs, nDet, nAngles, z = 0) {
    const out = new Float32Array(nDet * nAngles);
    const trig = packTrig(nAngles);   // the SAME numbers the shader is handed -- so the twin twins the fix too
    for (let ai = 0; ai < nAngles; ai++) {
        const ct = trig[ai*4], st = trig[ai*4+1];
        for (let di = 0; di < nDet; di++) {
            const s = -1 + (di + 0.5) * 2 / nDet;
            let acc = 0;
            for (const b of blobs) {
                const perp = b.x * ct + b.y * st - s;
                const dz = z - (b.z || 0);
                const c2 = perp * perp + dz * dz;
                const R2 = b.r * b.r;
                if (c2 >= R2) continue;
                acc += SHADOW_K * b.a * b.r * Math.pow(1 - c2 / R2, 3.5);
            }
            out[ai * nDet + di] = acc;
        }
    }
    return out;
}

// Pack blobs into the two texture rows the shader reads. Kept next to the shader on purpose: a packing that
// disagrees with the shader's texelFetch is the classic way these things break silently.
function packBlobs(blobs) {
    const n = blobs.length;
    const xyra = new Float32Array(n * 4), zs = new Float32Array(n * 4);
    blobs.forEach((b, i) => {
        xyra[i*4] = b.x; xyra[i*4+1] = b.y; xyra[i*4+2] = b.r; xyra[i*4+3] = b.a;
        zs[i*4] = b.z || 0;
    });
    return { xyra, zs, n };
}
export { SINOGRAM_FS, SHADOW_K, sinogramCPU, packBlobs, packTrig };
