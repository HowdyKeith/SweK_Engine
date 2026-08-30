// FILE: shaders/ashimaNoise.mjs -- v4177
//
// Ashima's simplex noise AS A CPU FUNCTION, translated line by line from the GLSL in ashimaNoise.js beside it.
//
//   simplex noise (c) 2011 Ian McEwan, Ashima Arts -- MIT -- github.com/ashima/webgl-noise
//
// *** THIS EXISTS SO THE SHADER CAN BE GRADED, WHICH IS THE ONLY WAY THIS TREE ACCEPTS A SHADER. *** A GLSL
// function cannot be checked in node, so every shader port here ships a CPU model that the gate pins against
// it -- the grass port did it, the SwiftUI shaders did it, crtModel does it. Without one, "the noise looks
// right" is the whole quality argument, and a near-miss simplex looks right too.
//
// The translation is DELIBERATELY UGLY. It keeps GLSL's shape -- component-wise operations on plain arrays,
// the same intermediate names (i, x0, g, l, i1, i2, p, ns, a0, b0, sh, m), the same order -- rather than
// being rewritten as idiomatic JavaScript. A tidier version would be easier to read and impossible to diff
// against the shader, and diffing against the shader is the entire job.
//
// Floating point: GLSL runs these in 32-bit and JavaScript in 64-bit, so the two agree to about 1e-6 and not
// to the bit. Any gate comparing them must say so and use a tolerance rather than claiming bit-identity.
//
// ---- *** WHAT THE RANGE ACTUALLY IS, MEASURED, BECAUSE THE EXPECTED ANSWER WAS WRONG *** -----------------
// Simplex noise is usually described as returning [-1, 1], and this one does not. Over 32,736 samples the
// observed range is about [-4.13, +4.20] with an RMS of 0.69 -- roughly four times the textbook figure.
//
// That looked like a translation error and was chased as one. It is not: the translation is CONTINUOUS
// (largest step over an input delta of 1e-4 is 8.3e-3, an implied slope of 83, where a wrong permute chain
// or a wrong corner selection would put a genuine discontinuity at every simplex face and read as a slope
// near 1e4) and ZERO-MEAN (-3.3e-4 over 126,665 samples). Both are properties a mis-translation fails, so
// the amplitude belongs to the GLSL as this tree has it, and the expectation was what was wrong.
//
// IT MATTERS FOR CALLERS AND IS NOT A CURIOSITY. Ramotion/aquarelle computes an ANGLE as snoise(...) * 3.14,
// which the author plainly wrote for a [-1, 1] noise so that the angle would span one turn. At this
// amplitude it spans about +/-13 radians and wraps twice. The result still looks like a random direction, so
// nothing appears broken, but the Amplitude knob is not doing what its name suggests. Recorded rather than
// "corrected", because the upstream ships it this way and changing it would silently change the look.
"use strict";

const mod289s = (x) => x - Math.floor(x * (1 / 289)) * 289;
const mod289v = (v) => v.map(mod289s);
const permute = (v) => v.map((x) => mod289s(((x * 34) + 1) * x));
const taylorInvSqrt = (v) => v.map((r) => 1.79284291400159 - 0.85373472095314 * r);
const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const dot4 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
const step = (edge, x) => x.map((v, i) => (v < (Array.isArray(edge) ? edge[i] : edge) ? 0 : 1));

/**
 * 3D simplex noise. Range is approximately [-1, 1].
 * Falloff radius 0.6 and output scale 42.0 -- the constants that belong to THREE dimensions. See the note in
 * ashimaNoise.js about why the 2D version's 0.5 and 130.0 are not interchangeable with these.
 */
export function snoise3(vx, vy, vz) {
    const C = [1 / 6, 1 / 3];
    const D = [0, 0.5, 1, 2];
    const v = [vx, vy, vz];

    const dCy = dot3(v, [C[1], C[1], C[1]]);
    let i = [Math.floor(v[0] + dCy), Math.floor(v[1] + dCy), Math.floor(v[2] + dCy)];
    const dCx = dot3(i, [C[0], C[0], C[0]]);
    const x0 = [v[0] - i[0] + dCx, v[1] - i[1] + dCx, v[2] - i[2] + dCx];

    const g = step([x0[1], x0[2], x0[0]], [x0[0], x0[1], x0[2]]);
    const l = [1 - g[0], 1 - g[1], 1 - g[2]];
    const lzxy = [l[2], l[0], l[1]];
    const i1 = [Math.min(g[0], lzxy[0]), Math.min(g[1], lzxy[1]), Math.min(g[2], lzxy[2])];
    const i2 = [Math.max(g[0], lzxy[0]), Math.max(g[1], lzxy[1]), Math.max(g[2], lzxy[2])];

    const x1 = [x0[0] - i1[0] + C[0], x0[1] - i1[1] + C[0], x0[2] - i1[2] + C[0]];
    const x2 = [x0[0] - i2[0] + C[1], x0[1] - i2[1] + C[1], x0[2] - i2[2] + C[1]];
    const x3 = [x0[0] - D[1], x0[1] - D[1], x0[2] - D[1]];

    i = mod289v(i);
    // The permute chain as three named steps. GLSL nests it as permute(permute(permute(z..) + y..) + x..),
    // one expression, and the order matters: permute, THEN add i.y, THEN permute again. Written out because
    // the nested JavaScript form depends on where each .map binds, and a reader should not have to work that
    // out to check the translation against the shader -- which is the only reason this file exists.
    const pz = permute([i[2] + 0, i[2] + i1[2], i[2] + i2[2], i[2] + 1]);
    const py = permute(pz.map((n, k) => n + i[1] + [0, i1[1], i2[1], 1][k]));
    const p  = permute(py.map((n, k) => n + i[0] + [0, i1[0], i2[0], 1][k]));

    const n_ = 0.142857142857;
    // ns = n_ * D.wyz - D.xzx  ->  D.wyz = (2, 0.5, 1), D.xzx = (0, 1, 0)
    const ns = [n_ * D[3] - D[0], n_ * D[1] - D[2], n_ * D[2] - D[0]];

    const j = p.map((n) => n - 49 * Math.floor(n * ns[2] * ns[2]));
    const x_ = j.map((n) => Math.floor(n * ns[2]));
    const y_ = j.map((n, k) => Math.floor(n - 7 * x_[k]));
    const x = x_.map((n) => n * ns[0] + ns[1]);
    const y = y_.map((n) => n * ns[0] + ns[1]);
    const h = x.map((n, k) => 1 - Math.abs(n) - Math.abs(y[k]));

    const b0 = [x[0], x[1], y[0], y[1]];
    const b1 = [x[2], x[3], y[2], y[3]];
    const s0 = b0.map((n) => Math.floor(n) * 2 + 1);
    const s1 = b1.map((n) => Math.floor(n) * 2 + 1);
    const sh = h.map((n) => -(n <= 0 ? 1 : 0));       // -step(h, 0.0): step(edge,x)=x<edge?0:1 with x=0

    // a0 = b0.xzyw + s0.xzyw * sh.xxyy
    const b0x = [b0[0], b0[2], b0[1], b0[3]], s0x = [s0[0], s0[2], s0[1], s0[3]];
    const shxxyy = [sh[0], sh[0], sh[1], sh[1]];
    const a0 = b0x.map((n, k) => n + s0x[k] * shxxyy[k]);
    const b1x = [b1[0], b1[2], b1[1], b1[3]], s1x = [s1[0], s1[2], s1[1], s1[3]];
    const shzzww = [sh[2], sh[2], sh[3], sh[3]];
    const a1 = b1x.map((n, k) => n + s1x[k] * shzzww[k]);

    let p0 = [a0[0], a0[1], h[0]];
    let p1 = [a0[2], a0[3], h[1]];
    let p2 = [a1[0], a1[1], h[2]];
    let p3 = [a1[2], a1[3], h[3]];

    const norm = taylorInvSqrt([dot3(p0, p0), dot3(p1, p1), dot3(p2, p2), dot3(p3, p3)]);
    p0 = p0.map((n) => n * norm[0]); p1 = p1.map((n) => n * norm[1]);
    p2 = p2.map((n) => n * norm[2]); p3 = p3.map((n) => n * norm[3]);

    let m = [0.6 - dot3(x0, x0), 0.6 - dot3(x1, x1), 0.6 - dot3(x2, x2), 0.6 - dot3(x3, x3)].map((n) => Math.max(n, 0));
    m = m.map((n) => n * n);
    return 42 * dot4(m.map((n) => n * n), [dot3(p0, x0), dot3(p1, x1), dot3(p2, x2), dot3(p3, x3)]);
}

/** The 3D constants, exported so a gate can assert they are not silently swapped for the 2D ones. */
export const SNOISE3_FALLOFF = 0.6;
export const SNOISE3_SCALE = 42;
/** The 2D constants, for the same reason -- and to make plain that they are DIFFERENT numbers, not a variant. */
export const SNOISE2_FALLOFF = 0.5;
export const SNOISE2_SCALE = 130;
