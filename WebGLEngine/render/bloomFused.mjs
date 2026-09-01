// WebGLEngine/render/bloomFused.mjs -- v4284
//
// *** THE BLOOM CHAIN IS THREE FULL-SCREEN PASSES AND THREE TEXTURE ROUND TRIPS, AND WebGL2 CANNOT MAKE IT
// FEWER. *** render/bloomPass.js runs bright-extract -> blur-H -> blur-V, each a separate framebuffer bind and
// a separate gl.drawArrays, each writing a half-resolution RGBA texture that the next pass reads straight back.
// The intermediates exist for one reason: a fragment shader cannot hand a value to its neighbour, so the only
// channel between passes is memory.
//
// A compute shader can. WORKGROUP SHARED MEMORY IS THE CHANNEL WebGL2 DOES NOT HAVE, and it turns the two
// intermediate textures into an array in registers-adjacent storage that never leaves the multiprocessor.
// This module fuses all three into ONE dispatch: 3 round trips -> 1.
//
// ---- WHAT IS CLAIMED, AND WHAT IS DELIBERATELY NOT ---------------------------------------------------------
//
// CLAIMED, and measured by tools/ship/bloomFused-selfcheck.mjs on a real WebGPU device:
//   - the fused compute shader produces the same image as the three-pass chain, to a measured tolerance
//   - the round-trip count is 3 and becomes 1, which is a STRUCTURAL fact, countable in either source
//
// *** NOT CLAIMED: THAT IT IS FASTER. *** The only WebGPU device in this sandbox is google/swiftshader, a
// SOFTWARE rasteriser. Timing a memory-traffic optimisation on a CPU-backed implementation measures nothing
// about the hardware the optimisation is for, and a number produced that way would be worse than no number
// because it would look like evidence. The round-trip count is offered instead: it is exact, it is the thing
// the optimisation actually changes, and it does not depend on what silicon is present.
//
// ---- AND THE CONSTANTS ARE READ OUT OF THE SHIPPING SHADER, NOT RETYPED ------------------------------------
//
// Every number below -- the nine kernel weights, the luma coefficients, the soft-knee width -- is parsed from
// render/bloomPass.js at call time. A copy typed here would be a second declaration of a fact the tree already
// holds, which is this session's most-repeated defect; and it would go stale silently, because both files
// would still compile and both would still look right.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const BLOOM_SOURCE = "render/bloomPass.js";

const readBloom = () => fs.readFileSync(path.join(ENG, BLOOM_SOURCE), "utf8");
const sliceBetween = (src, a, b) => src.slice(src.indexOf(a), src.indexOf(b));

/** The nine-tap kernel as [W0, W1, W2, W3, W4], parsed from BLUR_FS. */
export function kernelWeights(src = readBloom()) {
    const blur = sliceBetween(src, "const BLUR_FS", "const SSAO_FS");
    const out = [];
    for (const m of blur.matchAll(/const float W(\d) = ([0-9.]+);/g)) out[+m[1]] = parseFloat(m[2]);
    if (out.length !== 5 || out.some((x) => !(x > 0))) throw new Error("bloomFused: could not parse W0..W4");
    return out;
}

/** [r, g, b] luma coefficients, parsed from BRIGHT_FS. */
export function lumaCoefficients(src = readBloom()) {
    const bright = sliceBetween(src, "const BRIGHT_FS", "const BLUR_FS");
    const m = /dot\(c, vec3\(([^)]+)\)\)/.exec(bright);
    if (!m) throw new Error("bloomFused: could not parse the luma vector");
    return m[1].split(",").map((s) => parseFloat(s.trim()));
}

/** The soft-threshold width: smoothstep(T, T + knee, lum). */
export function softKnee(src = readBloom()) {
    const bright = sliceBetween(src, "const BRIGHT_FS", "const BLUR_FS");
    const m = /smoothstep\(uThreshold, uThreshold \+ ([0-9.]+),/.exec(bright);
    if (!m) throw new Error("bloomFused: could not parse the soft-knee width");
    return parseFloat(m[1]);
}

// *** THE KERNEL DOES NOT SUM TO ONE, AND THAT IS RECORDED RATHER THAN CORRECTED. *** W0 + 2*(W1+W2+W3+W4)
// is 0.999999: the shipping blur loses a millionth of the light it is given. Rounding it to 1 would change
// every bloomed image the engine has ever produced, for a difference no eye can see, so the number is
// reported by the gate and left alone. A defect worth fixing and a defect worth KNOWING ABOUT are different.
export function kernelSum(w = kernelWeights()) {
    return w[0] + 2 * (w[1] + w[2] + w[3] + w[4]);
}

// *** THE FIRST VERSION OF THIS TABLE SAID THE CHAIN WAS THREE DRAWS AND ITS OWN GATE SAID FIVE. ***
// Between "Pass 1" and "Pass 4" render/bloomPass.js issues FIVE gl.drawArrays: bright, blur-H, blur-V, then
// SSAO and god rays. The last two are CONDITIONAL -- guarded on ssaoStrength and godRayStrength -- and they
// are not part of the bloom the fusion replaces, which is why they were easy to forget and why forgetting
// them would have understated the chain the reader was being told about. What this round fuses is the
// UNCONDITIONAL three; the other two are counted here so the number is the file's and not the claim's.
export const ROUND_TRIPS = Object.freeze({
    glsl: Object.freeze({ passes: 3, intermediateTextures: 2, roundTrips: 3,
                          names: Object.freeze(["bright", "blurH", "blurV"]),
                          drawsInSpan: 5, conditional: 2,
                          conditionalNames: Object.freeze(["ssao", "godRays"]) }),
    wgsl: Object.freeze({ passes: 1, intermediateTextures: 0, roundTrips: 1,
                          names: Object.freeze(["fused"]) }),
});

// The tile the fused shader works in. TILE is the output square; APRON is the 4 texels each side that a
// nine-tap kernel reaches. The shared array is (TILE + 2*APRON) rows of TILE columns, holding the
// bright-extracted, horizontally-blurred image -- the FIRST intermediate texture, living in the workgroup.
export const TILE = 8;
export const APRON = 4;
export const N = 64;                       // test image edge; the shader is written for any multiple of TILE

// *** THE SOURCE IMAGE IS COMPUTED, NOT UPLOADED, AND IT USES NO TRANSCENDENTAL. *** The harness binds an
// output buffer and a uniform buffer and nothing else, so the image is generated identically on both sides.
// It is built from integer remainders and squared distances only: sin and cos are NOT bit-identical between a
// JavaScript engine and a GPU, and seeding a comparison with a function that differs would put the difference
// in the fixture rather than in the thing being compared.
const f32 = Math.fround;
export function sourceTexel(x, y) {
    const a = f32(f32((x * 7 + y * 13) % 17) / 17);
    const b = f32(f32((x * 3 + y * 5) % 11) / 11);
    let r = f32(a * 0.35), g = f32(b * 0.35), bl = f32(f32(a + b) * 0.15);
    const d1 = (x - 20) * (x - 20) + (y - 18) * (y - 18);
    if (d1 < 25) { r = f32(r + 1.6); g = f32(g + 1.4); bl = f32(bl + 1.2); }
    const d2 = (x - 44) * (x - 44) + (y - 46) * (y - 46);
    if (d2 < 9) { r = f32(r + 0.9); g = f32(g + 1.9); bl = f32(bl + 0.8); }
    // *** A THIRD SOURCE, STRADDLING THE LEFT EDGE, AND IT IS HERE BECAUSE A SABOTAGE WENT 0 RED TWICE. ***
    // With both bright spots in the interior the whole border extracted to BLACK, so the edge comparison
    // divided by zero-ish values, skipped them, and passed no matter what the clamping did. An edge check on
    // an edge with no light in it is an assertion that cannot fail.
    const d3 = x * x + (y - 32) * (y - 32);
    if (d3 < 16) { r = f32(r + 1.5); g = f32(g + 1.1); bl = f32(bl + 1.7); }
    return [r, g, bl];
}

const clampi = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/**
 * The three-pass chain, in float32, in the SAME arithmetic order as the GLSL.
 *
 * This is the oracle, and it is only worth having because the gate checks it against the REAL BRIGHT_FS and
 * BLUR_FS running on a device. An oracle nobody validated is a second opinion from the same person.
 */
export function chainCpu({ n = N, threshold = 0.7, weights = kernelWeights(), luma = lumaCoefficients(),
                           knee = softKnee(), src = null } = {}) {
    const bright = brightCpu({ n, threshold, luma, knee, src });
    const h = blurCpu({ n, src: bright, dx: 1, dy: 0, weights });
    return { bright, h, out: blurCpu({ n, src: h, dx: 0, dy: 1, weights }) };
}

/** BRIGHT_FS on an RGB float image (or on sourceTexel when none is given). Float32 at every step. */
export function brightCpu({ n = N, threshold = 0.7, luma = lumaCoefficients(), knee = softKnee(),
                            src = null } = {}) {
    const bright = new Float32Array(n * n * 3);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
        const j = (y * n + x) * 3;
        const [r, g, b] = src ? [src[j], src[j + 1], src[j + 2]] : sourceTexel(x, y);
        const lum = f32(f32(f32(r * luma[0]) + f32(g * luma[1])) + f32(b * luma[2]));
        // smoothstep(e0, e1, v) as GLSL defines it, in f32 at every step
        const t = clampi(f32(f32(lum - threshold) / knee), 0, 1);
        const w = f32(f32(t * t) * f32(f32(3) - f32(2 * t)));
        bright[j] = f32(r * w); bright[j + 1] = f32(g * w); bright[j + 2] = f32(b * w);
    }
    return bright;
}

/** BLUR_FS along (dx,dy). Taps in the SHIPPING ORDER -- centre, +1, -1, +2, -2, ... -- so rounding matches. */
export function blurCpu({ n = N, src, dx, dy, weights = kernelWeights() } = {}) {
    const W = weights;
    const out = new Float32Array(n * n * 3);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
        for (let c = 0; c < 3; c++) {
            const tap = (k) => src[(clampi(y + dy * k, 0, n - 1) * n + clampi(x + dx * k, 0, n - 1)) * 3 + c];
            let s = f32(tap(0) * W[0]);
            for (let k = 1; k <= 4; k++) { s = f32(s + f32(tap(k) * W[k])); s = f32(s + f32(tap(-k) * W[k])); }
            out[(y * n + x) * 3 + c] = s;
        }
    }
    return out;
}

/**
 * The fused compute shader. ONE dispatch, no intermediate texture.
 *
 * Each workgroup owns a TILE x TILE output square. It first computes bright-extract + horizontal blur for
 * TILE + 2*APRON ROWS (the vertical kernel's reach) into `tileHBlur`, then every thread reads nine of those
 * rows from shared memory to finish the vertical blur. The two textures the GLSL chain writes and re-reads
 * are that array.
 */
export function fusedWgsl({ n = N, weights = kernelWeights(), luma = lumaCoefficients(), knee = softKnee() } = {}) {
    const [W0, W1, W2, W3, W4] = weights;
    const F = (v) => (Number.isInteger(v) ? v.toFixed(1) : String(v));
    const ROWS = TILE + 2 * APRON;
    return `
// Generated by render/bloomFused.mjs from ${BLOOM_SOURCE}. Constants are the shipping shader's own.
const N : i32 = ${n};
const TILE : i32 = ${TILE};
const APRON : i32 = ${APRON};
const ROWS : i32 = ${ROWS};
const W0 : f32 = ${F(W0)};
const W1 : f32 = ${F(W1)};
const W2 : f32 = ${F(W2)};
const W3 : f32 = ${F(W3)};
const W4 : f32 = ${F(W4)};
const LUMA : vec3<f32> = vec3<f32>(${F(luma[0])}, ${F(luma[1])}, ${F(luma[2])});
const KNEE : f32 = ${F(knee)};

@group(0) @binding(0) var<storage, read_write> outBuf : array<f32>;
@group(0) @binding(1) var<uniform> params : vec4<f32>;      // x = threshold

// The first intermediate texture of the GLSL chain, as workgroup memory. This array is the whole point.
var<workgroup> tileHBlur : array<vec3<f32>, ${ROWS * TILE}>;

fn clampi(v : i32, lo : i32, hi : i32) -> i32 { return max(lo, min(hi, v)); }

// Must match render/bloomFused.mjs sourceTexel EXACTLY. Integer remainders and squared distances only.
fn srcAt(xi : i32, yi : i32) -> vec3<f32> {
    let x = clampi(xi, 0, N - 1);
    let y = clampi(yi, 0, N - 1);
    let a = f32((x * 7 + y * 13) % 17) / 17.0;
    let b = f32((x * 3 + y * 5) % 11) / 11.0;
    var c = vec3<f32>(a * 0.35, b * 0.35, (a + b) * 0.15);
    let dx1 = x - 20; let dy1 = y - 18;
    if (dx1 * dx1 + dy1 * dy1 < 25) { c = c + vec3<f32>(1.6, 1.4, 1.2); }
    let dx2 = x - 44; let dy2 = y - 46;
    if (dx2 * dx2 + dy2 * dy2 < 9) { c = c + vec3<f32>(0.9, 1.9, 0.8); }
    let dy3 = y - 32;
    if (x * x + dy3 * dy3 < 16) { c = c + vec3<f32>(1.5, 1.1, 1.7); }
    return c;
}

// BRIGHT_FS, term for term.
fn brightAt(x : i32, y : i32, threshold : f32) -> vec3<f32> {
    let c = srcAt(x, y);
    let lum = c.r * LUMA.r + c.g * LUMA.g + c.b * LUMA.b;
    let t = clamp((lum - threshold) / KNEE, 0.0, 1.0);
    return c * (t * t * (3.0 - 2.0 * t));
}

// BLUR_FS horizontally, taps in the shipping order so the rounding matches term for term.
//
// *** THE TAPS ARE NOT CLAMPED HERE, AND THAT IS THE POINT. *** The first draft clamped every tap AND
// clamped again inside srcAt. Two layers, either sufficient, so removing one changed nothing -- a sabotage
// that deleted a clamp went ZERO RED, not because the gate was weak but because the other clamp caught it.
// Redundant defence reads as care and costs the ability to test either half. The boundary is srcAt's, once.
fn hBlurAt(x : i32, y : i32, threshold : f32) -> vec3<f32> {
    var s = brightAt(x, y, threshold) * W0;
    s = s + brightAt(x + 1, y, threshold) * W1;
    s = s + brightAt(x - 1, y, threshold) * W1;
    s = s + brightAt(x + 2, y, threshold) * W2;
    s = s + brightAt(x - 2, y, threshold) * W2;
    s = s + brightAt(x + 3, y, threshold) * W3;
    s = s + brightAt(x - 3, y, threshold) * W3;
    s = s + brightAt(x + 4, y, threshold) * W4;
    s = s + brightAt(x - 4, y, threshold) * W4;
    return s;
}

@compute @workgroup_size(${TILE}, ${TILE})
fn main(@builtin(workgroup_id) wg : vec3<u32>, @builtin(local_invocation_id) lid : vec3<u32>) {
    let tilesX = N / TILE;
    let tx = i32(wg.x) % tilesX;
    let ty = i32(wg.x) / tilesX;
    let x0 = tx * TILE;
    let y0 = ty * TILE;
    let lx = i32(lid.x);
    let ly = i32(lid.y);

    // ROWS x TILE entries filled by TILE x TILE threads: each thread does ROWS/TILE rows, striding by TILE.
    var r = ly;
    loop {
        if (r >= ROWS) { break; }
        let srcY = clampi(y0 + r - APRON, 0, N - 1);
        tileHBlur[r * TILE + lx] = hBlurAt(x0 + lx, srcY, params.x);
        r = r + TILE;
    }
    workgroupBarrier();

    // Vertical blur, reading the rows the neighbouring threads produced. No texture was written.
    let c = ly + APRON;
    var s = tileHBlur[c * TILE + lx] * W0;
    s = s + tileHBlur[(c + 1) * TILE + lx] * W1;
    s = s + tileHBlur[(c - 1) * TILE + lx] * W1;
    s = s + tileHBlur[(c + 2) * TILE + lx] * W2;
    s = s + tileHBlur[(c - 2) * TILE + lx] * W2;
    s = s + tileHBlur[(c + 3) * TILE + lx] * W3;
    s = s + tileHBlur[(c - 3) * TILE + lx] * W3;
    s = s + tileHBlur[(c + 4) * TILE + lx] * W4;
    s = s + tileHBlur[(c - 4) * TILE + lx] * W4;

    let gx = x0 + lx;
    let gy = y0 + ly;
    let o = (gy * N + gx) * 3;
    outBuf[o] = s.r;
    outBuf[o + 1] = s.g;
    outBuf[o + 2] = s.b;
}
`;
}
