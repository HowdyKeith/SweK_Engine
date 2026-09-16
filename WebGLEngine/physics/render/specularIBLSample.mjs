// WebGLEngine/physics/render/specularIBLSample.mjs -- v4578
// ---------------------------------------------------------------------------------------------------------------
// PACKING THE BAKED MIP CHAIN INTO ONE ATLAS, AND SAMPLING IT -- the CPU reference the WGSL twin
// (specularIBLWgsl.mjs) is graded against, same role splitSum.mjs plays for splitSumWgsl.mjs.
//
// ONE FLAT ATLAS, NOT A TEXTURE PER MIP: gfx/device.js has 2D textures and no cube type (probeLit.mjs's own
// finding), so the six faces of every mip are packed side by side into ONE 2D array -- faces across (six
// faceSize0-wide columns, left-aligned per mip so every mip's face f starts at the SAME x), mips stacked
// vertically, the BRDF LUT appended below the mip stack as one more region. A sampler needs one binding and a
// handful of offsets, not six-times-mipCount of them.
//
// MANUAL BILINEAR, NOT A HARDWARE SAMPLER, FOR THE SAME REASON probeLit.mjs GIVES: "the two backends' samplers
// disagree on addressing, integer reads do not." sampleSpecularAtlas below does the 2x2-per-mip, 2-mip blend by
// hand over integer-indexed texel fetches -- eight taps total, the same shape probeLit.mjs's eight-probe
// trilinear already uses for its own volume, not a new idiom.
"use strict";
import { faceTexelDir, dirToFace } from "../../render/cubeBake.js";
import { lookupLut, splitSumBrdf } from "./splitSum.mjs";

/**
 * Pack a bakeMipChain() result and a splitSum.brdfLut() result into one flat RGBA Float32Array atlas.
 * Layout: mip m's face f occupies the axis-aligned block [f*faceSize0 .. f*faceSize0+mipSize[m]) x
 * [mipYOffset[m] .. mipYOffset[m]+mipSize[m]); the LUT occupies [0..K) x [lutYOffset..lutYOffset+R), A in
 * channel 0, B in channel 1.
 */
export function packSpecularAtlas(mips, lut) {
    const faceSize0 = mips[0].size;
    const atlasWidth = Math.max(6 * faceSize0, lut.K);
    const mipYOffset = [];
    let y = 0;
    for (const m of mips) { mipYOffset.push(y); y += m.size; }
    const lutYOffset = y;
    const atlasHeight = y + lut.R;
    const data = new Float32Array(atlasWidth * atlasHeight * 4);
    const put = (x, yy, r, g, b, a) => { const o = (yy * atlasWidth + x) * 4; data[o] = r; data[o + 1] = g; data[o + 2] = b; data[o + 3] = a; };

    mips.forEach((m, mi) => {
        for (let f = 0; f < 6; f++) {
            const face = m.faces[f];
            for (let j = 0; j < m.size; j++) for (let i = 0; i < m.size; i++) {
                const o = (j * m.size + i) * 3;
                put(f * faceSize0 + i, mipYOffset[mi] + j, face[o], face[o + 1], face[o + 2], 1);
            }
        }
    });
    for (let j = 0; j < lut.R; j++) for (let i = 0; i < lut.K; i++) put(i, lutYOffset + j, lut.A[j * lut.K + i], lut.B[j * lut.K + i], 0, 1);

    return { data, width: atlasWidth, height: atlasHeight, faceSize0,
             mipCount: mips.length, mipYOffset, mipSize: mips.map((m) => m.size),
             lutYOffset, lutK: lut.K, lutR: lut.R };
}

function fetchTexel(atlas, x, y) {
    const cx = Math.min(atlas.width - 1, Math.max(0, x)), cy = Math.min(atlas.height - 1, Math.max(0, y));
    const o = (cy * atlas.width + cx) * 4;
    return [atlas.data[o], atlas.data[o + 1], atlas.data[o + 2]];
}

/** Bilinear fetch of one mip's face at (u, v) in [-1, 1] -- the inverse of faceTexelDir's own texel-centre
 *  convention: texel i's centre is at u = ((i + 0.5) / size) * 2 - 1, so the texel-space coordinate here is
 *  (u * 0.5 + 0.5) * size - 0.5. */
function bilinearFace(atlas, mip, face, u, v) {
    const size = atlas.mipSize[mip], x0off = face * atlas.faceSize0, y0off = atlas.mipYOffset[mip];
    const fx = (u * 0.5 + 0.5) * size - 0.5, fy = (v * 0.5 + 0.5) * size - 0.5;
    const x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
    const c00 = fetchTexel(atlas, x0off + Math.min(size - 1, Math.max(0, x0)), y0off + Math.min(size - 1, Math.max(0, y0)));
    const c10 = fetchTexel(atlas, x0off + Math.min(size - 1, Math.max(0, x0 + 1)), y0off + Math.min(size - 1, Math.max(0, y0)));
    const c01 = fetchTexel(atlas, x0off + Math.min(size - 1, Math.max(0, x0)), y0off + Math.min(size - 1, Math.max(0, y0 + 1)));
    const c11 = fetchTexel(atlas, x0off + Math.min(size - 1, Math.max(0, x0 + 1)), y0off + Math.min(size - 1, Math.max(0, y0 + 1)));
    const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
    return lerp(lerp(c00, c10, tx), lerp(c01, c11, tx), ty);
}

/** The prefiltered colour for a direction and a LINEAR roughness (0 mirror .. 1 fully rough): dirToFace picks
 *  the face and (u, v); roughness picks two adjacent mips (the SAME linear roughness->mip convention
 *  specularProbeBake.mjs's mipRoughness uses) and blends between their bilinear face samples. */
export function sampleSpecularAtlas(atlas, dir, roughness) {
    const { face, u, v } = dirToFace(dir);
    const mipF = Math.min(1, Math.max(0, roughness)) * (atlas.mipCount - 1);
    const m0 = Math.min(atlas.mipCount - 1, Math.max(0, Math.floor(mipF)));
    const m1 = Math.min(atlas.mipCount - 1, m0 + 1);
    const t = mipF - m0;
    const c0 = bilinearFace(atlas, m0, face, u, v), c1 = bilinearFace(atlas, m1, face, u, v);
    return [c0[0] + (c1[0] - c0[0]) * t, c0[1] + (c1[1] - c0[1]) * t, c0[2] + (c1[2] - c0[2]) * t];
}

/** The BRDF LUT's (A, B) at (mu, alpha), read straight out of the packed atlas -- splitSum.lookupLut's own
 *  bilinear formula, against the SAME data, not a second table. */
export function sampleAtlasLut(atlas, mu, alpha) {
    const fx = Math.min(atlas.lutK - 1, Math.max(0, mu * atlas.lutK - 0.5));
    const fy = Math.min(atlas.lutR - 1, Math.max(0, alpha * atlas.lutR - 0.5));
    const x0 = Math.floor(fx), y0 = Math.floor(fy);
    const x1 = Math.min(atlas.lutK - 1, x0 + 1), y1 = Math.min(atlas.lutR - 1, y0 + 1);
    const tx = fx - x0, ty = fy - y0;
    const at = (x, y) => fetchTexel(atlas, x, atlas.lutYOffset + y);
    const c00 = at(x0, y0), c10 = at(x1, y0), c01 = at(x0, y1), c11 = at(x1, y1);
    const mix = (i) => (c00[i] * (1 - tx) + c10[i] * tx) * (1 - ty) + (c01[i] * (1 - tx) + c11[i] * tx) * ty;
    return { A: mix(0), B: mix(1) };
}

/** The whole specular-IBL term for one shading point: prefiltered environment x (F0*A + B), per channel. */
export function evaluateSpecularIBL(atlas, dir, roughness, mu, F0rgb) {
    const env = sampleSpecularAtlas(atlas, dir, roughness);
    const { A, B } = sampleAtlasLut(atlas, mu, roughness);
    return [env[0] * splitSumBrdf(A, B, F0rgb[0]), env[1] * splitSumBrdf(A, B, F0rgb[1]), env[2] * splitSumBrdf(A, B, F0rgb[2])];
}

export { faceTexelDir, lookupLut };
