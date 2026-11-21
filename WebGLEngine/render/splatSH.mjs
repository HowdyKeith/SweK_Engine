// WebGLEngine/render/splatSH.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// A SPLAT'S COLOUR FROM WHERE YOU STAND. Backlog: render/BACKLOG_2026-11-21_PLAYCANVAS.md, `splat-sh` (PlayCanvas's gsplat spherical harmonics). Keith: "5".
// A 3DGS capture stores each splat's colour as spherical-harmonic coefficients: band 0 (f_dc_*, the colour from every side, which the engine has always
// read) and bands 1 to 3 (f_rest_*: 9, 24 or 45 numbers), which make a surface's shine and tint change as the camera moves round it. engine/splatParser.js
// now keeps the f_rest coefficients; render/splatRendererGPU.mjs adds them per splat, per frame, in the vertex shader.
//
//   colour = max(0, base + SUM over bands 1..degree of  C_lm Y_lm(d) * coefficient_lm)     d = the unit direction from the camera to the splat
//
// `base` is the band-0 colour the parser already gives (0.5 + SH_C0 * f_dc, clamped to 0..1); the reference 3DGS rasteriser adds the 0.5 and clamps at 0
// after the higher bands, so the two differ only where band 0 itself left 0..1. The constants and signs are the reference's (gaussian-splatting,
// cuda_rasterizer/forward.cu computeColorFromSH). shRest below is the CPU form, in f64, and SH_WGSL the card's -- written from the same table.
//
// THE COEFFICIENT LAYOUT. The file stores f_rest channel by channel (all of red's, then green's, then blue's); the parser hands out `sh` coefficient by
// coefficient, each an (r, g, b) triple: sh[(i * K + j) * 3 + c] = f_rest_(c * K + j), K = 3, 8 or 15 coefficients a channel.
"use strict";

export const SH_C0 = 0.28209479177387814;
export const SH_C1 = 0.4886025119029199;
export const SH_C2 = Object.freeze([1.0925484305920792, -1.0925484305920792, 0.31539156525252005, -1.0925484305920792, 0.5462742152960396]);
export const SH_C3 = Object.freeze([-0.5900435899266435, 2.890611442640554, -0.4570457994644658, 0.3731763325901154, -0.4570457994644658, 1.445305721320277, -0.5900435899266435]);
/** Coefficients a channel beyond band 0, by degree. */
export const SH_K = Object.freeze({ 0: 0, 1: 3, 2: 8, 3: 15 });
/** The degree a count of f_rest properties means (9, 24, 45), or 0 for any other count. Pure. */
export function degreeOfRest(n) { return n === 9 ? 1 : n === 24 ? 2 : n === 45 ? 3 : 0; }

/** The basis values for coefficients 1..K at the unit direction (x, y, z), each with its constant and sign. Pure. */
export function shBasis(K, x, y, z) {
    const b = [];
    if (K >= 3) b.push(-SH_C1 * y, SH_C1 * z, -SH_C1 * x);
    if (K >= 8) { const xx = x * x, yy = y * y, zz = z * z; b.push(SH_C2[0] * x * y, SH_C2[1] * y * z, SH_C2[2] * (2 * zz - xx - yy), SH_C2[3] * x * z, SH_C2[4] * (xx - yy)); }
    if (K >= 15) { const xx = x * x, yy = y * y, zz = z * z; b.push(SH_C3[0] * y * (3 * xx - yy), SH_C3[1] * x * y * z, SH_C3[2] * y * (4 * zz - xx - yy), SH_C3[3] * z * (2 * zz - 3 * xx - 3 * yy), SH_C3[4] * x * (4 * zz - xx - yy), SH_C3[5] * z * (xx - yy), SH_C3[6] * x * (xx - 3 * yy)); }
    return b;
}
/** The view-dependent part of splat i's colour, [r, g, b], from `sh` (K coefficients a channel) seen along `dir` (need not be unit). Pure, f64. */
export function shRest(sh, i, K, dir) {
    const l = Math.hypot(dir[0], dir[1], dir[2]) || 1, b = shBasis(K, dir[0] / l, dir[1] / l, dir[2] / l), out = [0, 0, 0];
    for (let j = 0; j < K; j++) for (let c = 0; c < 3; c++) out[c] += b[j] * sh[(i * K + j) * 3 + c];
    return out;
}
/** Every splat's colour from the camera at `eye`, the cloud placed at `origin` and `scale` -- what the card draws. Float32Array (n * 3). Pure. */
export function viewColors(splat, eye, { origin = [0, 0, 0], scale = 1 } = {}) {
    const n = splat.count, K = splat.sh ? SH_K[splat.shDegree] || 0 : 0, out = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
        const d = [0, 1, 2].map((k) => splat.positions[i * 3 + k] * scale + origin[k] - eye[k]), r = K ? shRest(splat.sh, i, K, d) : [0, 0, 0];
        for (let c = 0; c < 3; c++) out[i * 3 + c] = Math.max(0, splat.colors[i * 3 + c] + r[c]);
    }
    return out;
}

const f = (v) => { const s = String(v); return /[.e]/.test(s) ? s : s + ".0"; };
/** The card's form: shRest(i, K, d) over the storage buffer `shc`, the same table. */
export const SH_WGSL = `
fn shRest(i: u32, K: u32, d: vec3<f32>) -> vec3<f32> {
    if (K == 0u) { return vec3<f32>(0.0); }
    let x = d.x; let y = d.y; let z = d.z;
    var b: array<f32, 15>;
    b[0] = ${f(-SH_C1)} * y; b[1] = ${f(SH_C1)} * z; b[2] = ${f(-SH_C1)} * x;
    let xx = x * x; let yy = y * y; let zz = z * z;
    b[3] = ${f(SH_C2[0])} * x * y; b[4] = ${f(SH_C2[1])} * y * z; b[5] = ${f(SH_C2[2])} * (2.0 * zz - xx - yy); b[6] = ${f(SH_C2[3])} * x * z; b[7] = ${f(SH_C2[4])} * (xx - yy);
    b[8] = ${f(SH_C3[0])} * y * (3.0 * xx - yy); b[9] = ${f(SH_C3[1])} * x * y * z; b[10] = ${f(SH_C3[2])} * y * (4.0 * zz - xx - yy); b[11] = ${f(SH_C3[3])} * z * (2.0 * zz - 3.0 * xx - 3.0 * yy);
    b[12] = ${f(SH_C3[4])} * x * (4.0 * zz - xx - yy); b[13] = ${f(SH_C3[5])} * z * (xx - yy); b[14] = ${f(SH_C3[6])} * x * (xx - 3.0 * yy);
    var o = vec3<f32>(0.0);
    for (var j = 0u; j < K; j++) { let p = (i * K + j) * 3u; o += b[j] * vec3<f32>(shc[p], shc[p + 1u], shc[p + 2u]); }
    return o;
}`;
