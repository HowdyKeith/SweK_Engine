// WebGLEngine/physics/render/pathTracerWgsl.mjs -- v4290
//
// *** THE PATH TRACER'S FIRST RAY ON A GPU, AND THE TWO PLACES f32 AND f64 ARE NOT ALLOWED TO AGREE. ***
//
// physics/render/pathTracer.mjs renders at w=48, h=48, spp=64 BY DEFAULT, and the default is not a taste: it
// is what a CPU can finish. Every pixel is independent, every sample within a pixel is independent, and the
// accumulator is a sum -- the shape a compute shader was invented for. So the obvious round is "port it".
//
// THE OBVIOUS ROUND IS NOT AVAILABLE, AND THE REASON IS WORTH MORE THAN THE PORT WOULD HAVE BEEN. The tracer
// runs in f64. A GPU runs in f32. Those are different renderers, so "did the port work" has no answer until
// somebody says what agreement was supposed to look like -- and this tree has been bitten before by a
// comparison that could not have failed (v4284's border samples were all black, so the edge check divided by
// nothing; v4287's padding branch was unreachable at the one size it was tested at).
//
// So this file does not port the tracer. It ports the two pieces of it that are DECIDABLE, measures exactly
// where each one stops matching, and reports the magnitude that explains the match where there is one.
//
// ================================================================================================
// PIECE ONE: THE GENERATOR, WHOSE STATE MUST BE EXACT AND WHOSE VALUE MUST NOT BE
// ================================================================================================
//
// furnace.mjs's `rng` is a Lehmer/LCG:
//
//     s = (Math.imul(s, 1664525) + 1013904223) >>> 0;  return s / 4294967296;
//
// Both halves of that line are portable, and they are portable in OPPOSITE DIRECTIONS.
//
//   THE STATE IS EXACT. `Math.imul` is the low 32 bits of a 32-bit product; WGSL's u32 multiply wraps modulo
//   2^32 by specification. They are the same operation. A disagreement in the state sequence is a PORT BUG and
//   nothing else -- there is no floating point anywhere in it to blame.
//
//   THE VALUE CANNOT BE. `s / 4294967296` divides in f64 on the CPU, where a u32 is exact. On the GPU `f32(s)`
//   rounds first, because an f32 carries 24 mantissa bits and a u32 needs 32. *** 98.02% OF THE FIRST 65536
//   DRAWS DIFFER, and only 242 of those states are small enough to survive the conversion. *** The division
//   itself is exact either way -- 2^32 is a power of two -- so every bit of the disagreement is the cast.
//
// A gate that checked only "the random numbers match" would fail on a correct port. A gate that checked only
// "the random numbers are close" would pass a port whose state had desynchronised and then re-converged by
// luck. BOTH HALVES HAVE TO BE ASSERTED, IN OPPOSITE DIRECTIONS, OR NEITHER MEANS ANYTHING.
//
// A u32 does not survive an f32 buffer readback, which is the same problem one layer down. It is carried out
// as two 16-bit halves -- both below 2^24, both exact -- and reassembled on the way in. The seed goes in the
// same way for the same reason.
//
// ------------------------------------------------------------------------------------------------
// AND THEN THE VALUE DID NOT MATCH THE OBVIOUS f32 MODEL EITHER
// ------------------------------------------------------------------------------------------------
//
// The first run of this comparison asserted that the device returns Math.fround(Math.fround(s) / 2^32) -- the
// correctly-rounded f32 answer. IT MATCHED 472 OF 512 DRAWS, and the largest disagreement was 5.96e-8, which is
// 2^-24: TWICE the 2^-25 a single correct rounding can produce. The model was wrong, not the device.
//
// Every mismatch was exactly ONE ULP from the correctly-rounded value, always on the far side, and every one
// had s >= 2^31. That is the signature of a conversion that goes through the SIGNED path and therefore rounds
// TWICE:
//
//     f32(s)  implemented as  f32( f32(s - 2^31) + 2^31 )       for s >= 2^31
//
// which fits *** 4096 OF 4096 DRAWS EXACTLY ***. Over 65536 draws it lands on the other neighbour for 5475 of
// the 32669 high states -- 16.76% of them, 8.35% of all draws.
//
// *** AND IT IS CONFORMANT. *** WGSL specifies that converting a value with no exact f32 representation yields
// ONE OF THE TWO NEAREST representable values; which one is implementation-defined. A device that rounds to
// nearest and this one are both correct, and they return different random numbers.
//
// SO THE GATE MAY NOT ASSERT A VALUE, ON EITHER MODEL. The portable contract -- the one every conformant device
// owes -- is that the returned value is one of the two f32 neighbours bracketing the exact f64 answer, and that
// is what `bracketsF64` below tests. The double-rounding model is recorded as an OBSERVATION ABOUT THIS
// ADAPTER, with the count that fits it, and is never the pass condition. This is the whole practical finding:
// *** THE GENERATOR'S STATE IS PORTABLE AND ITS OUTPUT IS NOT PORTABLE EVEN BETWEEN CORRECT DEVICES. ***
//
// ================================================================================================
// PIECE TWO: THE INTERSECTION, WHERE THE SPHERE IS A DIFFERENT SIZE IN f32
// ================================================================================================
//
// occlusion.mjs's `raySphere` computes disc = b*b - 4c and takes its square root. Near the silhouette b*b and
// 4c converge, and their difference is catastrophic cancellation: the leading digits agree and subtract away,
// leaving the error. So the accuracy of a ray-sphere hit is not one number, it is a CURVE against grazing
// angle, and the useful question is where on that curve f32 stops being usable.
//
// Rendering the 48x48 furnace scene and diffing the coverage masks gives ZERO disagreements. That result is
// worthless on its own -- it is the shape of every check that cannot fail. What makes it worth printing is the
// companion measurement:
//
//   *** IN f32 THE SPHERE'S SILHOUETTE SITS 5.07e-7 FURTHER OUT IN IMPACT PARAMETER THAN IT DOES IN f64. ***
//
// f32 sees a very slightly larger sphere. The band between the two silhouettes is real, and every ray inside it
// is a hit on the GPU and a miss on the CPU. It is 6.68e-6 of a pixel wide at 48x48, so A 149667-PIXEL-WIDE
// IMAGE WOULD BE NEEDED FOR ONE RAY TO LAND IN IT. The masks agree because the disagreement is far below the
// sampling rate, which is a different and much stronger statement than "the masks agree", and it is the one
// that tells you what happens when somebody raises the resolution.
//
// The band is also the CONTROL. A ray aimed inside it makes the two disagree on demand, so the comparison is
// shown to be live in the same run that reports it found nothing.
//
// ================================================================================================
// WHAT IS NOT CLAIMED
// ================================================================================================
//
// THIS IS NOT A GPU PATH TRACER AND DOES NOT PRETEND TO BE ONE. `trace` is roughly three hundred lines of
// multiple importance sampling, microfacet lobes, Fresnel, energy compensation and Russian roulette, and it is
// assembled out of six modules that each have their own exact key. Porting it is a real round; porting it
// before anyone has established what f32 does to the primary ray would be building on an unmeasured floor.
//
// NO TIMING IS REPORTED. The adapter on this rig is google/SwiftShader, a software rasteriser. Every number
// here is an arithmetic fact, reproducible on any conformant device; a millisecond measured here would be a
// fact about a CPU pretending to be a GPU.
//
// THE CAMERA BASIS IS PART OF WHAT IS COMPARED, DELIBERATELY. The shader builds fwd/right/up from eye, look and
// up rather than receiving them precomputed, so a handedness or orthonormality error is inside the comparison
// rather than upstream of it -- that is the whole reason pathTracer.mjs's header gives for using an explicit
// basis instead of a matrix. The per-pixel ray direction is carried out alongside the hit so the basis can be
// read separately from the intersection when they disagree.
//
// `Math.hypot` IS A THIRD, SMALLER SOURCE. norm() uses it; WGSL's normalize() is v/sqrt(dot(v,v)). At unit
// magnitudes they agree to within an ulp but they are not the same function, and this file does not pretend
// the only difference between the two renderers is the width of a float.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const FURNACE_PATH = path.join(HERE, "furnace.mjs");
export const OCCLUSION_PATH = path.join(HERE, "occlusion.mjs");

// ================================================================================================
// THE CONSTANTS COME OUT OF THE FILES THAT SHIP THEM
// ================================================================================================
//
// Retyping 1664525 here would make this file a SECOND DECLARATION of the generator, and the gate below would
// then be comparing this file against itself while furnace.mjs drifted underneath both. Same rule bloomFused
// follows for the blur weights. A parse that fails RAISES rather than falling back to a remembered value: a
// default would let the constants diverge silently, which is the exact failure the parse exists to prevent.

function readOr(file) {
    try { return fs.readFileSync(file, "utf8"); } catch (e) {
        throw new Error("pathTracerWgsl: cannot read " + path.basename(file) + " -- " + e.message);
    }
}

/** The LCG's three constants, lifted from furnace.mjs's one-line body. */
export function parseLcg(src = readOr(FURNACE_PATH)) {
    const m = src.match(/Math\.imul\(\s*s\s*,\s*(\d+)\s*\)\s*\+\s*(\d+)\s*\)\s*>>>\s*0\s*;\s*return\s+s\s*\/\s*(\d+)/);
    if (!m) throw new Error("pathTracerWgsl: furnace.mjs rng body did not parse -- the generator moved");
    return { mul: Number(m[1]), inc: Number(m[2]), div: Number(m[3]) };
}

/** raySphere's surface epsilon, lifted from occlusion.mjs's signature. */
export function parseEps(src = readOr(OCCLUSION_PATH)) {
    const m = src.match(/export\s+function\s+raySphere\s*\([^)]*eps\s*=\s*([0-9.eE+-]+)/);
    if (!m) throw new Error("pathTracerWgsl: occlusion.mjs raySphere eps did not parse");
    return Number(m[1]);
}

export const LCG = parseLcg();
export const EPS = parseEps();

// ================================================================================================
// THE GENERATOR
// ================================================================================================

/**
 * The state sequence, in u32, exactly as furnace.mjs walks it. This is the ORACLE for the exact half -- it
 * deliberately returns the STATE and not the value, because the state is the part that has to match.
 */
export function lcgStatesCpu(seed, n, { mul = LCG.mul, inc = LCG.inc } = {}) {
    let s = seed >>> 0;
    const out = new Uint32Array(n);
    for (let i = 0; i < n; i++) { s = (Math.imul(s, mul) + inc) >>> 0; out[i] = s; }
    return out;
}

/** The value furnace.mjs actually returns for each of those states, in f64. */
export const lcgValuesCpu = (states, div = LCG.div) => Array.from(states, (s) => s / div);

/** What an f32 device must return instead: the cast rounds, the division by a power of two does not. */
export const lcgValuesF32 = (states, div = LCG.div) => Array.from(states, (s) => Math.fround(Math.fround(s) / div));

/**
 * The f32 value the device is OBSERVED to produce, via the signed conversion path that rounds twice.
 *
 * *** THIS IS A MODEL OF ONE ADAPTER, NOT A CONTRACT. *** It fits google/SwiftShader on 4096 of 4096 draws and
 * it is not what a round-to-nearest device returns. Nothing may PASS because it agrees with this.
 */
export const TWO31 = 2147483648;
export const lcgValuesDoubleRounded = (states, div = LCG.div) => Array.from(states,
    (s) => Math.fround((s < TWO31 ? Math.fround(s) : Math.fround(Math.fround(s - TWO31) + TWO31)) / div));

/**
 * The portable contract, and the only thing a gate is entitled to assert about a device's random VALUE: WGSL
 * promises one of the two nearest representable f32 values, and says nothing about which.
 *
 * Written as a bracket rather than a tolerance on purpose -- an absolute epsilon would have to be loose enough
 * to admit the far neighbour, and once it is that loose it also admits values that are not a neighbour at all.
 */
export function neighboursF32(x) {
    const near = Math.fround(x);
    const b = new DataView(new ArrayBuffer(4));
    b.setFloat32(0, near);
    const step = (d) => { b.setFloat32(0, near); b.setUint32(0, b.getUint32(0) + d); return b.getFloat32(0); };
    return near === x ? [x, x] : (near > x ? [step(-1), near] : [near, step(1)]);
}

/** True when `got` is one of the two f32 values bracketing the exact `want`. */
export function bracketsF64(got, want) {
    const [lo, hi] = neighboursF32(want);
    return got === lo || got === hi;
}

/**
 * Measured over the first 65536 draws from seed 1.
 *
 * `differ` counts draws where the device value CANNOT equal the f64 one. `otherNeighbour` counts where this
 * adapter's double rounding lands on the far side -- the number that proves the two models are distinguishable
 * and therefore that no single value model is portable.
 */
export const FLOAT_BOUNDARY = Object.freeze({
    seed: 1, draws: 65536,
    differ: 64240, differPct: 98.02,
    exact: 242, exactBecause: "state < 2^24, which an f32 mantissa holds without rounding",
    highStates: 32669, otherNeighbour: 5475, otherNeighbourPct: 16.76,
    maxNearest: 2.9802e-8, maxNearestIs: "2^-25 -- what one correct rounding can cost",
    maxDevice: 4.4471e-8, maxDeviceIs: "past 2^-25, which is how the single-rounding model was caught",
    adapter: "google/swiftshader", modelFits: 4096, modelOf: 4096,
    stateMustMatch: true, valueMustNot: true, valueModelIsNotPortable: true,
    spec: "WGSL: a value with no exact f32 representation converts to one of the two nearest; which is implementation-defined",
});

/**
 * WGSL for the generator. Each invocation walks the chain from the seed on its own, which is O(n^2) work and
 * deliberately so: a parallel-friendly jump-ahead would be a DIFFERENT generator, and the thing being tested
 * is whether this one survives the trip.
 *
 * Output is three floats per draw -- state high 16, state low 16, value -- because an f32 buffer cannot carry
 * a u32 and splitting it is the only way to bring the exact half home exactly.
 */
export function lcgWgsl({ mul = LCG.mul, inc = LCG.inc, div = LCG.div, workgroupSize = 64 } = {}) {
    return `
@group(0) @binding(0) var<storage, read_write> outBuf : array<f32>;
@group(0) @binding(1) var<uniform> U : array<vec4<f32>, 16>;

@compute @workgroup_size(${workgroupSize})
fn main(@builtin(global_invocation_id) gid : vec3<u32>) {
  let i = gid.x;
  let n = u32(U[0].z);
  if (i >= n) { return; }
  // The seed arrives as two halves for the same reason the state leaves as two: neither end of an f32
  // pipe can carry a u32 without rounding it.
  var s : u32 = (u32(U[0].x) << 16u) | u32(U[0].y);
  for (var k : u32 = 0u; k <= i; k = k + 1u) {
    s = s * ${mul}u + ${inc}u;
  }
  outBuf[i * 3u + 0u] = f32(s >> 16u);
  outBuf[i * 3u + 1u] = f32(s & 0xffffu);
  outBuf[i * 3u + 2u] = f32(s) / ${div}.0;
}
`;
}

/** Pack a seed and a draw count into the harness's uniform vec4 array. */
export function lcgUniforms(seed, n) {
    const u = new Float32Array(64);
    u[0] = (seed >>> 16) & 0xffff;
    u[1] = seed & 0xffff;
    u[2] = n;
    return u;
}

/** Reassemble the two halves the shader wrote. Refuses a half that is not an exact integer below 2^16. */
export function unpackState(hi, lo) {
    if (!Number.isInteger(hi) || !Number.isInteger(lo) || hi < 0 || lo < 0 || hi > 65535 || lo > 65535)
        throw new Error("pathTracerWgsl: state halves are not 16-bit integers -- got " + hi + ", " + lo);
    return ((hi << 16) >>> 0) + lo;
}

// ================================================================================================
// THE PRIMARY RAY
// ================================================================================================
//
// The CPU side of this comparison calls pathTracer.mjs's OWN `cameraBasis`, `pixelRay` and `intersect`. It does
// not re-derive any of them. v4290 extracted the first two out of `render` and `coverage`, which had held a
// copy each since v3473 -- a third copy here would have made this file grade its own arithmetic against itself
// while the renderer drifted underneath. The extraction is bit-identical: every buffer both functions returned
// before the split, they return after it.

import { intersect, cameraBasis, pixelRay } from "./pathTracer.mjs";
import { raySphere } from "./occlusion.mjs";

/**
 * A DIAGNOSTIC, and deliberately not part of any decision. `raySphere` does not return the discriminant, and
 * the discriminant is the conditioning number this whole comparison is indexed by -- it says how close to
 * tangent the ray passed. It is recomputed here for REPORTING; every hit-or-miss verdict on the CPU side comes
 * from the shipped `intersect`, so a bug in this line cannot make the comparison pass.
 */
export function discOf(orig, dir, centre, radius) {
    const ox = orig[0] - centre[0], oy = orig[1] - centre[1], oz = orig[2] - centre[2];
    const b = 2 * (dir[0] * ox + dir[1] * oy + dir[2] * oz);
    const c = ox * ox + oy * oy + oz * oz - radius * radius;
    return b * b - 4 * c;
}

/**
 * The scene. Two spheres so the nearest-hit loop is exercised rather than assumed, and the second one is placed
 * BEHIND the first along part of the view so "nearest" is a choice and not a formality.
 */
export const SCENE = Object.freeze([
    Object.freeze({ centre: [0, 0, 0], radius: 1, albedo: 0.8, emit: 0 }),
    Object.freeze({ centre: [0.9, 0.6, -1.4], radius: 0.7, albedo: 0.5, emit: 0 }),
]);

export const VIEW = Object.freeze({ w: 48, h: 48, eye: [0, 0, 5], look: [0, 0, 0], up: [0, 1, 0], fovDeg: 40 });

/** The f64 oracle: hit, t, direction and discriminant per pixel, all from the shipped renderer's own pieces. */
export function coverageCpu(scene = SCENE, opts = VIEW) {
    const { w, h } = opts;
    const B = cameraBasis(opts);
    const out = [];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const dir = pixelRay(x, y, 0.5, 0.5, w, h, B);
        const hit = intersect(B.eye, dir, scene);
        let disc = -Infinity;
        for (const s of scene) disc = Math.max(disc, discOf(B.eye, dir, s.centre, s.radius));
        out.push({ x, y, hit: hit ? 1 : 0, t: hit ? hit.t : -1, dir, disc });
    }
    return out;
}

/**
 * Pack the camera and up to four spheres into the harness's 16 x vec4 uniform block.
 *
 * *** `scale` GOES IN AS A NUMBER, AND THAT IS THE WHOLE POINT OF SHADER_TAN BELOW. *** The frustum half-width
 * is Math.tan(fovDeg * PI / 360) computed once per frame; computing it in the shader instead costs nothing and
 * ruins every ray in the image, for reasons the header records. It is passed in already evaluated, rounded to
 * f32 by the buffer write and by nothing else.
 */
export function coverageUniforms(scene = SCENE, opts = VIEW, eps = EPS) {
    if (scene.length > 4) throw new Error("pathTracerWgsl: the uniform block holds four spheres, got " + scene.length);
    const { w, h, eye, look, up, fovDeg } = opts;
    const u = new Float32Array(64);
    u.set([eye[0], eye[1], eye[2], fovDeg], 0);
    u.set([look[0], look[1], look[2], w], 4);
    u.set([up[0], up[1], up[2], h], 8);
    u.set([scene.length, eps, cameraBasis(opts).scale, 0], 12);
    scene.forEach((s, i) => u.set([s.centre[0], s.centre[1], s.centre[2], s.radius], 16 + i * 4));
    return u;
}

/**
 * *** THE BUILTINS THIS DEVICE IS ALLOWED TO GET WRONG, MEASURED. ***
 *
 * The first version of the shader below computed its own frustum scale with tan(). The rendered ray directions
 * then missed the f64 ones by 1.366e-5 per component -- roughly THREE HUNDRED ULPS, when an f32 operation costs
 * at most one -- and the t error refused to sort by discriminant, which is what gave it away: a conditioning
 * effect concentrates at the silhouette and this was everywhere at once.
 *
 * It is not an f32 problem and it is not a bug. WGSL specifies tight accuracy for arithmetic and for sqrt, and
 * specifies sin and cos only to an ABSOLUTE error near 2^-11; tan inherits that. SwiftShader spends the
 * allowance. A conformant device may do the same.
 *
 * So a camera constant computed inside a shader is a DIFFERENT CAMERA, legally. The value is per-frame and
 * uniform across every pixel, so there is no reason to ever compute it there.
 */
export const BUILTIN_ACCURACY = Object.freeze({
    adapter: "google/swiftshader", fovDeg: 40, angle: 0.3490658503988659,
    relErr: Object.freeze({ tan: 4.590e-5, sin: 6.680e-5, cos: 1.127e-4, sqrt: 1.711e-8, angle: 1.417e-7 }),
    f32Eps: 1.1920929e-7,
    tightlySpecified: Object.freeze(["sqrt", "arithmetic"]),
    looselySpecified: Object.freeze(["sin", "cos", "tan"]),
    verdict: "pass per-frame camera constants IN; never recompute a transcendental per pixel to save a uniform",
});

export const COVERAGE_STRIDE = 6;

/** Unpack what the shader wrote: hit, t, the three direction components, and the discriminant. */
export function decodeCoverage(values, w, h) {
    const out = [];
    for (let i = 0; i < w * h; i++) {
        const o = i * COVERAGE_STRIDE;
        out.push({ x: i % w, y: (i / w) | 0, hit: values[o], t: values[o + 1],
                   dir: [values[o + 2], values[o + 3], values[o + 4]], disc: values[o + 5] });
    }
    return out;
}

/**
 * WGSL for the primary ray. The basis is built HERE from eye/look/up rather than handed in precomputed, so a
 * handedness or orthonormality mistake lands inside the comparison instead of upstream of it. The direction
 * travels back out beside the hit for the same reason: when the two sides disagree, the basis and the
 * intersection can be told apart without a second run.
 */
export function coverageWgsl({ workgroupSize = 64, shaderTan = false } = {}) {
    return `
@group(0) @binding(0) var<storage, read_write> outBuf : array<f32>;
@group(0) @binding(1) var<uniform> U : array<vec4<f32>, 16>;

// norm()'s zero guard, kept: normalize(vec3(0)) is NaN and the CPU returns the vector unchanged.
fn nrm(v : vec3<f32>) -> vec3<f32> {
  let l = sqrt(dot(v, v));
  if (l == 0.0) { return v; }
  return v / l;
}

@compute @workgroup_size(${workgroupSize})
fn main(@builtin(global_invocation_id) gid : vec3<u32>) {
  let w = i32(U[1].w);
  let h = i32(U[2].w);
  let idx = i32(gid.x);
  if (idx >= w * h) { return; }
  let x = idx % w;
  let y = idx / w;

  let eye = U[0].xyz;
  let fwd = nrm(U[1].xyz - eye);
  let right = nrm(cross(fwd, U[2].xyz));
  let camUp = cross(right, fwd);
  // shaderTan IS A PARAMETER AND NOT AN EDITED COPY, so the planted run and the clean run take the same
  // code path -- v3467's rule, which pathTracer.mjs's own streamRng plant follows for the same reason.
  let scale = ${shaderTan ? "tan(U[0].w * 3.141592653589793 / 360.0)" : "U[3].z"};

  let u = ((f32(x) + 0.5) / f32(w) * 2.0 - 1.0) * scale * (f32(w) / f32(h));
  let v = (1.0 - (f32(y) + 0.5) / f32(h) * 2.0) * scale;
  let dir = nrm(fwd + (right * u + camUp * v));

  let nS = i32(U[3].x);
  let eps = U[3].y;
  var bestT = -1.0;
  var bestDisc = -3.4e38;
  for (var i = 0; i < nS; i = i + 1) {
    let sp = U[4 + i];
    let o = eye - sp.xyz;
    let b = 2.0 * dot(dir, o);
    let c = dot(o, o) - sp.w * sp.w;
    let disc = b * b - 4.0 * c;
    bestDisc = max(bestDisc, disc);
    if (disc < 0.0) { continue; }
    let sq = sqrt(disc);
    let t0 = (-b - sq) / 2.0;
    let t1 = (-b + sq) / 2.0;
    var t = -1.0;
    if (t0 > eps) { t = t0; } else if (t1 > eps) { t = t1; }
    if (t > 0.0 && (bestT < 0.0 || t < bestT)) { bestT = t; }
  }

  let o = u32(idx) * ${"6u"};
  outBuf[o + 0u] = select(0.0, 1.0, bestT > 0.0);
  outBuf[o + 1u] = bestT;
  outBuf[o + 2u] = dir.x;
  outBuf[o + 3u] = dir.y;
  outBuf[o + 4u] = dir.z;
  outBuf[o + 5u] = bestDisc;
}
`;
}

// ================================================================================================
// THE CONTROL: THE BAND WHERE THE TWO RENDERERS SEE DIFFERENT SPHERES
// ================================================================================================
//
// The coverage masks agree on every one of 2304 pixels. On its own that sentence is worth nothing -- it is the
// same shape as every check that cannot fail, and this tree has shipped two of those in the last six rounds.
//
// What makes it worth printing is knowing HOW FAR the comparison was from failing. A ray fired straight down
// +z from (0, y, -D) at a sphere of radius R on the origin has impact parameter exactly y and discriminant
// exactly 4(R^2 - y^2), so tangency is at y = R and nothing else in the setup varies. Sweeping y across R finds
// the exact impact parameter at which each renderer stops seeing the sphere. THEY ARE NOT THE SAME NUMBER, and
// every ray between them is a hit on one machine and a miss on the other.
//
// So the same run that reports "no disagreements" also produces disagreements to order. That is the difference
// between a null result and a measurement.

/** Rays down +z at impact parameter y. `hit` comes from the SHIPPED raySphere, not from a copy of it. */
export const grazeCpu = (ys, { D = 5, R = 1, eps = EPS } = {}) => ys.map(
    (y) => ({ y, t: raySphere([0, y, -D], [0, 0, 1], [0, 0, 0], R, { eps }) }));

/** A linear ladder of impact parameters straddling tangency, fine enough to resolve the band between them. */
export function grazeLadder({ R = 1, span = 1e-6, n = 60 } = {}) {
    return Array.from({ length: n }, (_, i) => R - span + (2 * span * i) / (n - 1));
}

export const GRAZE_STRIDE = 2;

export function grazeUniforms(ys, { D = 5, R = 1, eps = EPS } = {}) {
    if (ys.length > 60) throw new Error("pathTracerWgsl: the uniform block holds 60 impact parameters, got " + ys.length);
    const u = new Float32Array(64);
    u.set([ys.length, D, R, eps], 0);
    ys.forEach((y, i) => { u[4 + i] = y; });
    return u;
}

export function grazeWgsl({ workgroupSize = 64 } = {}) {
    return `
@group(0) @binding(0) var<storage, read_write> outBuf : array<f32>;
@group(0) @binding(1) var<uniform> U : array<vec4<f32>, 16>;

@compute @workgroup_size(${workgroupSize})
fn main(@builtin(global_invocation_id) gid : vec3<u32>) {
  let i = i32(gid.x);
  if (i >= i32(U[0].x)) { return; }
  let D = U[0].y;
  let R = U[0].z;
  let eps = U[0].w;
  let y = U[(i + 4) / 4][(i + 4) % 4];

  // Origin (0, y, -D), direction (0, 0, 1). raySphere's arithmetic, with a = 1 because the direction is unit.
  let o = vec3<f32>(0.0, y, -D);
  let b = 2.0 * o.z;
  let c = dot(o, o) - R * R;
  let disc = b * b - 4.0 * c;
  var t = -1.0;
  if (disc >= 0.0) {
    let sq = sqrt(disc);
    let t0 = (-b - sq) / 2.0;
    let t1 = (-b + sq) / 2.0;
    if (t0 > eps) { t = t0; } else if (t1 > eps) { t = t1; }
  }
  outBuf[u32(i) * 2u + 0u] = select(0.0, 1.0, t > 0.0);
  outBuf[u32(i) * 2u + 1u] = t;
}
`;
}

/** Where a hit/miss sequence stops hitting: the last index that hit, given a ladder that is increasing in y. */
export function flipIndex(hits) {
    let last = -1;
    for (let i = 0; i < hits.length; i++) if (hits[i]) last = i;
    return last;
}

/**
 * MEASURED, on google/SwiftShader, with the ladder above.
 *
 * The CPU stops seeing the sphere at an impact parameter 5.4237e-7 SMALLER than the GPU does. In f32 the sphere
 * is very slightly bigger. Sixteen of the sixty ladder rays fall between the two silhouettes, and every one of
 * them is a miss on the CPU and a hit on the GPU.
 */
export const SILHOUETTE = Object.freeze({
    D: 5, R: 1, ladder: 60, span: 1e-6, spacing: 3.390e-8,
    cpuLastHit: 0.99999998305084747, gpuLastHit: 1.0000005254237287,
    band: 5.4237e-7, raysInBand: 16, disagreements: 16,
    direction: "f32 sees the LARGER sphere -- every ray in the band hits on the GPU and misses on the CPU",
});

/**
 * How wide the disagreement band is in PIXELS, which is the number that says whether an image can ever see it.
 *
 * Derived rather than recorded: a stored figure would drift the moment VIEW or SILHOUETTE changed, and the
 * whole point of this quantity is that it explains a null result, so it has to stay tied to the run.
 */
export function bandInPixels(view = VIEW, band = SILHOUETTE.band, D = SILHOUETTE.D) {
    const worldPerPixel = 2 * cameraBasis(view).scale * D / view.w;
    return { worldPerPixel, pixels: band / worldPerPixel, widthToResolve: Math.ceil(worldPerPixel / band) };
}

/**
 * THE IMAGE COMPARISON, AND WHY ITS ZERO IS A RESULT RATHER THAN AN ABSENCE.
 *
 * 623 of 2304 pixels hit geometry and the two renderers agree about every one of them. They agree because the
 * band they disagree in is ~7.15e-6 of a pixel wide: an image would have to be about 139808 pixels across for
 * ONE RAY to land inside it. That is the claim -- not "the port is correct", which no finite image can show,
 * but "at this sampling rate the difference is four orders of magnitude below one sample".
 *
 * `maxDirErr` is below one f32 ulp (1.1920929e-7), so the camera basis is not merely close, it is as exact as
 * f32 permits. That is only true because `scale` is passed in; see BUILTIN_ACCURACY for what happens otherwise.
 */
export const MASK = Object.freeze({
    pixels: 2304, hits: 623, disagreements: 0,
    maxDirErr: 9.474e-8, maxDirErrIs: "below one f32 ulp -- the basis is exact, not approximate",
    maxRelT: 7.499e-6, maxRelTAtDisc: 1.414e-2,
    byDisc: Object.freeze([
        Object.freeze({ disc: "[0, 0.05)", n: 5, maxRelT: 7.50e-6 }),
        Object.freeze({ disc: "[0.05, 0.3)", n: 30, maxRelT: 3.87e-6 }),
        Object.freeze({ disc: "[0.3, 1)", n: 126, maxRelT: 2.08e-6 }),
        Object.freeze({ disc: "[1, 2)", n: 186, maxRelT: 2.61e-6 }),
        Object.freeze({ disc: "[2, inf)", n: 276, maxRelT: 5.78e-7 }),
    ]),
    spread: 13, spreadIs: "closest-to-tangent band over farthest -- the error is worst where disc is smallest",
    notMonotone: "the [1,2) band sits slightly above [0.3,1); two spheres of different radii share these bands, so the ordering is a tendency and is not claimed as a law",
});

/**
 * What the planted camera costs, measured in the same run against the same oracle. The two differ by ONE
 * PARAMETER and take the same code path.
 */
export const PLANT_COST = Object.freeze({
    plantMaxDirErr: 1.366e-5, cleanMaxDirErr: 9.474e-8, dirRatio: 144,
    plantMaxRelT: 1.475e-4, cleanMaxRelT: 7.499e-6, tRatio: 19.7,
    maskDisagreementsEither: 0,
    andTheMaskSTILLAGREES: "144x worse rays, and the coverage mask is identical -- which is exactly why a mask diff is not a test of a camera",
});

// ================================================================================================
// THE SURFACE EPSILON, WHICH A PRIMARY RAY CANNOT TEST
// ================================================================================================
//
// *** SETTING eps TO ZERO LEFT THIS GATE ENTIRELY GREEN. *** It is parsed out of occlusion.mjs, packed into
// both uniform blocks and read by both shaders, and not one of thirty-two checks could tell 1e-6 from 0.
//
// The reason is structural rather than an oversight in the checks: an eye outside the scene produces primary
// rays whose nearest root is t ~ 4, and `t0 > eps` compares 4 against 1e-6. Every ray in sections 5 to 7 clears
// the epsilon by six orders of magnitude. THE EPSILON EXISTS FOR THE RAYS THIS ROUND DOES NOT FIRE -- the
// secondary ones, which start ON a surface, where the near root is the surface the ray just left and accepting
// it is self-intersection.
//
// Recording that as a limitation would have been honest and would also have been lazy, because the case is
// reachable without a bounce. Put the origin a hair OUTSIDE the sphere along -z:
//
//     origin (0, 0, -d), direction +z, sphere radius R at the origin
//     b = -2d,  c = d^2 - R^2,  disc = 4R^2  (well conditioned -- nothing cancels)
//     t0 = d - R    exactly, and t1 = d + R
//
// So the near root is the gap, and the gap is a dial. With d - R = 5e-7 and eps = 1e-6 the near root is
// REFUSED and the ray comes out the far side at t ~ 2; with eps = 0 it is accepted at t ~ 5e-7. Four million
// times apart, from one constant, on a ray that needs no bounce to fire.
//
// d = 1 + 5e-7 is chosen to survive f32: an ulp at 1.0 is 1.19e-7, so it lands on 1 + 4.768e-7, still safely
// under the epsilon. Both machines must REJECT the near root, and that agreement is what section 9 asserts.

export const SURFACE = Object.freeze({
    R: 1, delta: 5e-7, d: 1 + 5e-7,
    nearRootF64: 5e-7, nearRootF32: 4.76837158203125e-7,
    epsRejects: true, farRoot: 2,
    withEpsZero: "the near root is accepted and t collapses from ~2 to ~5e-7",
    why: "eps guards SECONDARY rays; this fires a primary one that starts on the surface so the guard is reachable without a bounce",
});

/** The self-intersection probe, expressed in the graze sweep's own geometry: y = 0, D = R + delta. */
export const surfaceUniforms = ({ R = SURFACE.R, delta = SURFACE.delta, eps = EPS } = {}) =>
    grazeUniforms([0], { D: R + delta, R, eps });

export const surfaceCpu = ({ R = SURFACE.R, delta = SURFACE.delta, eps = EPS } = {}) =>
    raySphere([0, 0, -(R + delta)], [0, 0, 1], [0, 0, 0], R, { eps });

// v4468 -- THE PROBE MANIFEST (docs/GPU-KERNEL-CONTRACT.md), three kernels. The LCG is graded here: two exact 16-bit
// halves and a value that WGSL promises only to one of two neighbours, so the tolerance is the neighbour gap. The
// primary ray and the grazing ladder name their gate: a hit at the silhouette and a root at tangency are graded by
// BAND and by BRACKET in tools/ship/pathTracerWgsl-selfcheck.mjs, and an element-for-element tolerance would either
// admit a wrong pixel or refuse a right one.
export const PROBES = Object.freeze([
    Object.freeze({ id: "pathTracer.lcgWgsl", code: () => lcgWgsl(), entryPoint: "main", args: Object.freeze({ seed: 1, n: 512 }),
        pack: (a) => lcgUniforms(a.seed, a.n), outCount: (a) => a.n * 3, workgroups: (a) => Math.ceil(a.n / 64), tol: 1.2e-7,
        cpu: (a) => { const st = lcgStatesCpu(a.seed, a.n), v = lcgValuesF32(st), out = new Float32Array(3 * a.n);
            for (let i = 0; i < a.n; i++) { out[3 * i] = st[i] >>> 16; out[3 * i + 1] = st[i] & 0xffff; out[3 * i + 2] = v[i]; } return out; },
        key: () => ({ mul: LCG.mul, inc: LCG.inc, div: LCG.div }) }),
    Object.freeze({ id: "pathTracer.coverageWgsl", code: () => coverageWgsl(), entryPoint: "main", args: Object.freeze({}),
        pack: () => coverageUniforms(), outCount: VIEW.w * VIEW.h * COVERAGE_STRIDE, workgroups: Math.ceil(VIEW.w * VIEW.h / 64),
        cpu: () => { const c = coverageCpu(), out = new Float32Array(c.length * COVERAGE_STRIDE);
            c.forEach((p, i) => out.set([p.hit, p.t, p.dir[0], p.dir[1], p.dir[2], p.disc], i * COVERAGE_STRIDE)); return out; },
        graded: "tools/ship/pathTracerWgsl-selfcheck.mjs -- hits graded within the silhouette band, not element for element",
        key: () => ({ band: SILHOUETTE.band, pixels: bandInPixels() }) }),
    Object.freeze({ id: "pathTracer.grazeWgsl", code: () => grazeWgsl(), entryPoint: "main", args: Object.freeze({}),
        pack: () => grazeUniforms(grazeLadder()), outCount: 60 * GRAZE_STRIDE, workgroups: 1,
        cpu: () => { const g = grazeCpu(grazeLadder()), out = new Float32Array(g.length * GRAZE_STRIDE);
            g.forEach((r, i) => out.set([r.t !== null ? 1 : 0, r.t !== null ? r.t : -1], i * GRAZE_STRIDE)); return out; },
        graded: "tools/ship/pathTracerWgsl-selfcheck.mjs -- the flip index of a ladder straddling tangency, where f32 and f64 legitimately part",
        key: () => ({ R: SILHOUETTE.R || 1, eps: EPS }) }),
]);
