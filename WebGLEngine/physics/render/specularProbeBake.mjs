// WebGLEngine/physics/render/specularProbeBake.mjs -- v4577
// ---------------------------------------------------------------------------------------------------------------
// THE CUBEMAP CAPTURE AND THE MIP CHAIN, WHICH splitSumWgsl.mjs's OWN HEADER NAMED AS STILL MISSING: "no cubemap
// capture of a real scene and no baked mip chain exist yet." This is the capture and the chain -- CPU-baked, on
// the SAME pattern render/splatProbes.mjs already established for the diffuse half rather than a fresh one:
//
//   splatProbes.bakeProbes(grid, radianceOf, faceSize)   diffuse: a radianceOf(pos, dir) function, six faces per
//                                                         probe, folded into SH.
//   bakeMipChain(radianceOf, pos, opts)   HERE            specular: the SAME SHAPE of radianceOf(pos, dir)
//                                                         function, six faces PER MIP LEVEL, each level
//                                                         prefiltered at a different roughness via
//                                                         splitSum.prefilterEnv rather than projected to SH.
//
// "Capture" and "prefilter" are not two steps here -- they are the SAME call. splitSum.mjs's prefilterEnv
// already takes an arbitrary env(dir) function and convolves it with the GGX lobe; mip 0 (alpha near 0, a lobe
// narrow enough to be nearly a delta) IS the capture, at the resolution and roughness that mip owns. There is no
// separate "raw capture texture" this module bakes and then reconvolves -- that would be a second declaration of
// the very radiance function being sampled.
//
// GEOMETRY IS REUSED, NOT REDERIVED: render/cubeBake.js's faceTexelDir is the same texel-direction function
// nebulaSkybox, proceduralStar and planetSurface already bake cubemaps through -- "the hinge the seamless
// property turns on," in that file's own words. This module does not duplicate it (splatProbes.mjs's local
// faceDirection is a second copy already in the tree; this one is not a third).
//
// ROUGHNESS -> ALPHA IS THIS ENGINE'S OWN CONVENTION, NOT A FRESH ONE: physics/render/principled.mjs's alphaOf
// (Disney's roughness^2) is imported directly. A mip chain that disagreed with the BRDF sampling it would light
// every material through the wrong lobe width -- the mismatch would be invisible until someone compared a
// roughness slider against the mip it actually landed on.
//
// *** WHAT THIS DOES NOT CLOSE, NAMED RATHER THAN LEFT IMPLICIT. *** This bakes on the CPU, in JS, at f64 --
// matching splatProbes.mjs's own diffuse bake, which is also CPU-side and later uploaded by a separate consumer
// (render/probeLit.mjs) for device-side SAMPLING, not device-side baking. The GPU prefilter shader
// (splitSumWgsl.mjs's PREFILTER_ENV_WGSL) reads an ANALYTIC env(dir) today, not a captured cubemap texture --
// wiring it to sample a real base cubemap would need tools/ship/headlessGpu.mjs to grow a cubemap-texture
// binding it does not have, which is real-time/dynamic-capture territory and a distinct, larger piece of work.
// Nothing in the live renderer calls this yet, same limit every module in this arc has named honestly.
"use strict";
import { faceTexelDir } from "../../render/cubeBake.js";
import { prefilterEnv } from "./splitSum.mjs";
import { alphaOf } from "./principled.mjs";

export const DEFAULT_BAKE = Object.freeze({ mipCount: 5, faceSize0: 8, minFaceSize: 2, samples: 48 });

/** Linear roughness for mip level `m` of `mipCount`, in [0, 1] -- mip 0 is the mirror end, the last mip alpha=1. */
export function mipRoughness(m, mipCount) { return mipCount <= 1 ? 0 : m / (mipCount - 1); }

/** Alpha for mip level `m`, through THIS ENGINE'S roughness->alpha convention (principled.mjs's alphaOf), so a
 *  material's roughness slider and the mip it samples agree by construction rather than by two conventions
 *  happening to match today. */
export function mipAlpha(m, mipCount) { return alphaOf(mipRoughness(m, mipCount)); }

/** Face size for mip level `m`: halves each level down to `minFaceSize`. A rough reflection does not need the
 *  spatial resolution a mirror one does -- the blur itself is where the missing detail goes, which is why real
 *  split-sum implementations shrink the mip alongside the roughness rather than keeping every level full-size. */
export function mipFaceSize(m, faceSize0, minFaceSize) {
    return Math.max(minFaceSize, Math.round(faceSize0 / Math.pow(2, m)));
}

/**
 * One RGB texel: prefilterEnv called once per channel, the SAME deterministic Hammersley walk each time (the
 * sequence is a pure function of the sample index, not of a seed carried between calls) -- reusing splitSum.mjs's
 * already-verified scalar function three times rather than writing a fresh vector-valued variant that would need
 * its own proof. Costs 3x the samples a shared-walk RGB version would; correctness over throughput for a bake
 * this module does not yet claim is fast enough to run every frame.
 */
export function prefilterEnvRGB(radianceOf, pos, dir, alpha, opts) {
    const channel = (c) => prefilterEnv((d) => radianceOf(pos, d)[c], dir, alpha, opts);
    return [channel(0), channel(1), channel(2)];
}

/** One face at one mip: size*size RGB texels, row-major (j*size+i), via cubeBake.js's faceTexelDir. */
export function bakeFace(radianceOf, pos, face, size, alpha, opts) {
    const out = new Float32Array(size * size * 3);
    for (let j = 0; j < size; j++) {
        for (let i = 0; i < size; i++) {
            const dir = faceTexelDir(face, i, j, size);
            const [r, g, b] = prefilterEnvRGB(radianceOf, pos, dir, alpha, opts);
            const o = (j * size + i) * 3;
            out[o] = r; out[o + 1] = g; out[o + 2] = b;
        }
    }
    return out;
}

/**
 * The mip chain for one probe position: `mipCount` levels, six faces each, alpha and size from this file's own
 * conventions above. Returns [{ level, roughness, alpha, size, faces: [6 Float32Array] }, ...], mip 0 first.
 */
export function bakeMipChain(radianceOf, pos, opts = {}) {
    const { mipCount, faceSize0, minFaceSize, samples } = { ...DEFAULT_BAKE, ...opts };
    const mips = [];
    for (let m = 0; m < mipCount; m++) {
        const alpha = mipAlpha(m, mipCount), size = mipFaceSize(m, faceSize0, minFaceSize);
        const faces = [];
        for (let f = 0; f < 6; f++) faces.push(bakeFace(radianceOf, pos, f, size, alpha, { samples }));
        mips.push({ level: m, roughness: mipRoughness(m, mipCount), alpha, size, faces });
    }
    return mips;
}

/** Luminance (Rec.709) of one texel `k` (0-based texel index, not byte offset) in a face's Float32Array. */
export function texelLuma(face, k) {
    const o = k * 3;
    return 0.2126 * face[o] + 0.7152 * face[o + 1] + 0.0722 * face[o + 2];
}

/** Population standard deviation of a face's luminance, for measuring how "flat" (blurred) a mip has become. */
export function faceLumaStdDev(face) {
    const n = face.length / 3;
    let sum = 0; for (let k = 0; k < n; k++) sum += texelLuma(face, k);
    const mean = sum / n;
    let ss = 0; for (let k = 0; k < n; k++) { const d = texelLuma(face, k) - mean; ss += d * d; }
    return Math.sqrt(ss / n);
}
