// WebGLEngine/render/deformTexture.mjs -- UNNUMBERED (the version is chosen at ship time).
//
// THE DEFORMATION FIELD AS A FILTERABLE TEXTURE. The snow frame read the footprint field out of a storage buffer through textureSampleLevelWrap: a manual bilinear, four wrapped buffer loads a tap, and the beauty fragment
// takes five taps (the centre and four neighbours) wherever a footprint's falloff is non-zero -- the whole 20 m window around the walker. On the rig's Intel gen-9 that one term (`deform`, takeSnowFrameTiming --ablate) was 20 ms
// of a 65 ms beauty pass at 1280x720 (32%). The state does not need to be read that way: each frame, after the deform step, a small compute pass copies the field into an rgba16float STORAGE TEXTURE, and the vertex and
// fragment stages sample it with the GPU's own bilinear filter and a REPEAT sampler (the field is toroidal, so repeat is the wrap). Five samples, not twenty loads.
//
// WHAT IT COSTS IN PRECISION, SAID PLAINLY. rgba16float keeps 11 bits of mantissa (a depth of 0.3 m to ~0.00015 m) and the hardware filter weights are fixed point (8 bits of sub-texel on the GPUs measured), where the manual
// path was f32 end to end. The field's values are metres of depression and berm and 0..1 compression and ice, smooth over a 0.16 m texel: the error is a fraction of a millimetre in height and ~1e-3 in a slope. The gate
// (render/deformTexture-selfcheck.mjs) holds the texture path to the CPU bilinear twin below within a stated limit and prints the worst as a reading for the real-hardware report.
"use strict";

/** The compute kernel that copies the f32 state buffer (res x res texels of 4 floats, row-major, the layout the deform step writes) into the storage texture, one thread a texel. */
export function packWgsl(res) {
    return /* wgsl */ `
const RES: u32 = ${res}u;
@group(0) @binding(0) var<storage, read> src: array<f32>;
@group(0) @binding(1) var dst: texture_storage_2d<rgba16float, write>;
@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) id: vec3u) {
    if (id.x >= RES || id.y >= RES) { return; }
    let o = (id.y * RES + id.x) * 4u;
    textureStore(dst, vec2i(id.xy), vec4f(src[o], src[o + 1u], src[o + 2u], src[o + 3u]));
}
`;
}

/** The declarations and the function the vertex and fragment stages read the field through: the SAME name and meaning as the buffer version it replaced (uv in [0,1) wraps; texel centres at (i + 0.5) / res). */
export function deformSampleWgsl(group, bindTex, bindSamp) {
    return /* wgsl */ `
@group(${group}) @binding(${bindTex}) var deformTex: texture_2d<f32>;
@group(${group}) @binding(${bindSamp}) var deformSamp: sampler;
fn textureSampleLevelWrap(uv: vec2f) -> vec4f {
    return textureSampleLevel(deformTex, deformSamp, uv, 0.0);
}
`;
}

/** The sampler the declarations above expect: bilinear, REPEAT (the field is a torus). */
export const DEFORM_SAMPLER = Object.freeze({ addressModeU: "repeat", addressModeV: "repeat", addressModeW: "repeat", magFilter: "linear", minFilter: "linear", mipmapFilter: "nearest" });

// ---- the CPU twins
/** Round a number to the nearest IEEE half-float value (ties to even), as the texture stores it. */
export function f16round(v) {
    if (!Number.isFinite(v) || v === 0) return v;
    const a = Math.abs(v);
    if (a >= 65520) return Math.sign(v) * Infinity;
    let e = Math.floor(Math.log2(a));
    if (e < -14) e = -14;                              // subnormal: a fixed step of 2^-24
    const step = 2 ** (e - 10), q = a / step, r = Math.floor(q), d = q - r, up = d > 0.5 || (d === 0.5 && r % 2 === 1);
    return Math.sign(v) * (up ? r + 1 : r) * step;
}
/** The manual bilinear the buffer path did (upstream's textureSampleLevel with a wrapped address), on a Float32Array(res*res*4): [r, g, b, a] at uv. */
export function bilinearWrapCpu(state, res, u, v) {
    const px = u * res - 0.5, py = v * res - 0.5, bx = Math.floor(px), by = Math.floor(py), fx = px - bx, fy = py - by, w = (i) => ((i % res) + res) % res;
    const at = (ix, iy, k) => state[(w(iy) * res + w(ix)) * 4 + k], out = [0, 0, 0, 0];
    for (let k = 0; k < 4; k++) {
        const a = at(bx, by, k) * (1 - fx) + at(bx + 1, by, k) * fx, b = at(bx, by + 1, k) * (1 - fx) + at(bx + 1, by + 1, k) * fx;
        out[k] = a * (1 - fy) + b * fy;
    }
    return out;
}
