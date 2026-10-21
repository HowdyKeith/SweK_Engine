// WebGLEngine/render/deformRead.mjs -- UNNUMBERED (the version is chosen at ship time).
//
// *** SLICE 2 OF snowflow-lift: THE READ SIDE OF THE DEFORMATION FIELD -- DISPLACEMENT, THE BAND-LIMITING FILTER AND THE FALLOFF. ***
// render/toroidalDeform.mjs writes the field; whoever draws the surface (a terrain clipmap's vertex stage, a shadow pass, a physics probe) must read it THE SAME WAY or the surface acne-shadows against
// itself. This is upstream's vendor/snowflow/src/shaders/lib/deform.wgsl as (1) a CPU twin (deformHeight) and (2) a compute kernel over the same storage buffer the write kernel fills (READ_KERNEL_WGSL).
//   deformUV       world xz -> the buffer's uv: fract(world / size) (the toroidal address);
//   deformFalloff  1 near the focus, smoothstep to 0 between 0.80 and 0.96 of the half-window, so the straight edge of the window is never seen and the wrapped content never shows at any weight;
//   deformHeight   the net height offset (piled mass minus depression), band-limited to what a lattice of `spacing` metres can carry: a separable 3x3 binomial [1 2 1]x[1 2 1]/16 with taps one
//                  `spacing` apart, times `scale`, times the falloff.
// UPSTREAM'S COMMENT CLAIMS, MEASURED IN THE GATE (not taken on trust): the filter's first zero is exactly at the lattice Nyquist (a wavelength of 2 x spacing is removed), and "a broad trench at 8 x spacing
// still passes at 85%" (the exact figure is (2 + 2 cos(2 pi / 8)) / 4 = 0.8536).
//
// NOT DONE: drawing from this on a GPU in a vertex stage (the page snow-deform.html reads it on the CPU), and the WGSL kernel is run on the software adapter only.
"use strict";

const smoothstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const fract = (x) => x - Math.floor(x);

/** world xz -> uv: the toroidal address (the sampler must wrap). */
export const deformUV = (x, z, size) => [fract(x / size), fract(z / size)];

/** how much of the buffer's authority applies at a world position, 0..1 */
export function deformFalloff(x, z, centre, size) {
    const d = Math.max(Math.abs(x - centre[0]), Math.abs(z - centre[1])) / (size * 0.5);
    return 1 - smoothstep(0.80, 0.96, d);
}

/** bilinear, wrap, texel centres at integers: what the sampler does for uv * res - 0.5 */
function sample(state, res, u, v, ch) {
    const px = u * res - 0.5, py = v * res - 0.5, x0 = Math.floor(px), y0 = Math.floor(py), fx = px - x0, fy = py - y0, w = (i) => ((i % res) + res) % res, at = (x, y) => (w(y) * res + w(x)) * 4 + ch;
    return (state[at(x0, y0)] * (1 - fx) + state[at(x0 + 1, y0)] * fx) * (1 - fy) + (state[at(x0, y0 + 1)] * (1 - fx) + state[at(x0 + 1, y0 + 1)] * fx) * fy;
}

/**
 * The net height offset at a world position, upstream's deformHeight: 0 where the falloff is 0, else (sum over the 3x3 taps spacing apart of (berm - depression) * binomial weight) * scale * falloff.
 * `state` is the field's Float32Array(res*res*4); `centre` is [x, z] of the window.
 */
export function deformHeight(state, res, x, z, centre, size, scale, spacing) {
    const w = deformFalloff(x, z, centre, size);
    if (w <= 0) return 0;
    const [bu, bv] = deformUV(x, z, size), r = spacing / size;
    let acc = 0;
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
        const wt = (2 - Math.abs(i)) * (2 - Math.abs(j)) * (1 / 16), u = bu + i * r, v = bv + j * r;
        acc += (sample(state, res, u, v, 1) - sample(state, res, u, v, 0)) * wt;
    }
    return acc * scale * w;
}

/**
 * The same read as a compute kernel: one thread per query. Bindings: 0 out (rw f32 per query), 1 params (uniform: centre.xy, size, res), 2 state (ro f32, res*res*4), 3 queries (ro f32, 4 per query:
 * world x, world z, scale, spacing). Dispatch ceil(n / 64).
 */
export const READ_KERNEL_WGSL = /* wgsl */ `
struct Params { centre: vec2f, size: f32, res: f32 };
@group(0) @binding(0) var<storage, read_write> outBuf: array<f32>;
@group(0) @binding(1) var<uniform> U: Params;
@group(0) @binding(2) var<storage, read> stateBuf: array<f32>;
@group(0) @binding(3) var<storage, read> queries: array<f32>;

fn texelAt(ix: i32, iy: i32) -> vec4f {
    let r = i32(U.res);
    let x = ((ix % r) + r) % r;
    let y = ((iy % r) + r) % r;
    let o = u32((y * r + x) * 4);
    return vec4f(stateBuf[o], stateBuf[o + 1u], stateBuf[o + 2u], stateBuf[o + 3u]);
}
fn textureSampleLevelWrap(uv: vec2f) -> vec4f {
    let p = uv * U.res - 0.5;
    let b = floor(p);
    let f = p - b;
    let x0 = i32(b.x);
    let y0 = i32(b.y);
    return mix(mix(texelAt(x0, y0), texelAt(x0 + 1, y0), f.x), mix(texelAt(x0, y0 + 1), texelAt(x0 + 1, y0 + 1), f.x), f.y);
}

// ---- upstream lib/deform.wgsl, bodies unchanged except the texture fetch
fn deformUV(worldXZ: vec2f, size: f32) -> vec2f {
    return fract(worldXZ / size);
}
fn deformFalloff(worldXZ: vec2f, centre: vec2f, size: f32) -> f32 {
    let d = abs(worldXZ - centre) / (size * 0.5);
    return 1.0 - smoothstep(0.80, 0.96, max(d.x, d.y));
}
fn deformHeight(worldXZ: vec2f, centre: vec2f, size: f32, scale: f32, spacing: f32) -> f32 {
    let w = deformFalloff(worldXZ, centre, size);
    if (w <= 0.0) { return 0.0; }
    let base = deformUV(worldXZ, size);
    let r = spacing / size;
    var acc = 0.0;
    for (var j = -1; j <= 1; j++) {
        for (var i = -1; i <= 1; i++) {
            let wt = f32((2 - abs(i)) * (2 - abs(j))) * (1.0 / 16.0);
            let uv = base + vec2f(f32(i), f32(j)) * r;
            let s = textureSampleLevelWrap(uv);
            acc += (s.g - s.r) * wt;
        }
    }
    return acc * scale * w;
}

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3u) {
    let i = gid.x;
    if (i >= arrayLength(&queries) / 4u) { return; }
    let q = vec4f(queries[i * 4u], queries[i * 4u + 1u], queries[i * 4u + 2u], queries[i * 4u + 3u]);
    outBuf[i] = deformHeight(q.xy, U.centre, U.size, q.z, q.w);
}
`;

export function reportLines() {
    const L = ["[deformRead] the read side of the toroidal field: a 3x3 binomial (taps one lattice spacing apart) times the falloff (1 to 0 between 0.80 and 0.96 of the half-window)"];
    L.push("  first zero of the filter at the lattice Nyquist (wavelength 2 x spacing); a trench of 8 x spacing passes at " + (100 * (2 + 2 * Math.cos(Math.PI / 4)) / 4).toFixed(1) + "%");
    return L;
}
