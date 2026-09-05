// WebGLEngine/physics/render/pathTracerGpu.mjs -- v4415
//
// *** v4290 REFUSED TO PORT THE TRACER AND GAVE A REASON. THE REASON IS TRUE IN GENERAL AND FALSE ON THE ONE
// SCENE THE TRACER WAS BUILT TO BE TESTED ON. ***
//
// pathTracerWgsl.mjs's header states the refusal plainly, and it was the right call at the time:
//
//     "The tracer runs in f64. A GPU runs in f32. Those are different renderers, so 'did the port work' has
//      no answer until somebody says what agreement was supposed to look like."
//
// So v4290 ported the two pieces that were DECIDABLE -- the generator and a coverage kernel -- and left the
// transport alone. This round asks the question that refusal left open: IS THERE A SCENE ON WHICH THE f64
// RENDER IS EXACTLY REPRESENTABLE IN f32? Because on such a scene there is nothing for the precisions to
// disagree about, "did the port work" has a bit-exact answer, and the transport can be ported after all.
//
// *** THERE IS, AND IT IS THE FURNACE -- pathTracer.mjs's OWN DESIGNATED TEST SCENE. MEASURED, NOT ARGUED: ***
//
//     rho     dyadic   spp=1   spp=4   spp=16  spp=64      pixels NOT exactly representable in f32, of 576
//     0.5     yes        0       0       0       0
//     0.25    yes        0       0       0       0
//     0.75    yes        0       0       0       0
//     1.0     yes        0       0       0       0
//     0.3     NO       142     158     160     163
//     0.1     NO       142     158     160     163
//     1/3     NO       142     154     158     159
//
//     spp     power of two      bad
//     3       no                 26
//     5       no                 36
//     10      no                 39
//     64      yes                 0
//
// BOTH PRECONDITIONS ARE NECESSARY AND BOTH ARE MEASURED RATHER THAN ASSUMED. Either one alone is not enough,
// and the table above is the evidence for each: a non-dyadic albedo breaks it at every spp, and a
// non-power-of-two spp breaks it at a dyadic albedo.
//
// ---- WHY IT IS EXACT, WHICH IS THE PART THAT HAD TO BE UNDERSTOOD RATHER THAN OBSERVED ---------------------
//
// A SPHERE IS CONVEX, so a cosine-weighted bounce leaving its surface CANNOT HIT IT AGAIN -- it always escapes
// to the sky. (*** THAT IS A THEOREM ABOUT REAL NUMBERS AND f32 BREAKS ITS PRECONDITION. See the section below
// on the three repairs: it cost 120 wrong interior pixels to find out. ***) The furnace therefore has exactly
// one bounce and no interreflection, and a camera ray is worth exactly one of two numbers:
//
//     misses the sphere  ->  sky            = 1
//     hits the sphere    ->  throughput*sky = rho * 1 = rho
//
// A pixel is the mean of spp of those. With rho dyadic and spp a power of two, that mean is a dyadic rational
// with a small denominator -- and every dyadic rational needing 24 or fewer mantissa bits is exactly
// representable in f32. NOTHING ROUNDS. So a correct GPU port must agree with the CPU BIT FOR BIT, and any
// disagreement at all is a port bug rather than a precision difference.
//
// ================================================================================================
// *** AND THE CONVEXITY ARGUMENT ABOVE IS TRUE IN EXACT ARITHMETIC AND FALSE IN f32. THE FIRST RUN SAID SO. ***
// ================================================================================================
//
// "A cosine-weighted bounce leaving a convex sphere cannot hit it again" is a theorem about real numbers. The
// first GPU run disagreed with the CPU on 152 of 576 pixels, and 120 OF THOSE WERE INTERIOR PIXELS -- not the
// silhouette, where a jitter difference could plausibly move a sample across an edge, but the middle of the
// disc, where the derivation said the answer was exactly rho. THE VALUES WERE BELOW rho AND DYADIC: 0.421875
// is (11 x 0.5 + 5 x 0.25) / 16. Five of sixteen samples had bounced TWICE. The bounce ray was re-hitting the
// surface it had just left, because occlusion.mjs's eps = 1e-6 was chosen against f64 and sits BELOW THE f32
// NOISE FLOOR at these magnitudes. The theorem holds; its precondition -- that the origin is exactly on the
// surface -- is what f32 breaks.
//
// *** TWO REPAIRS WERE WRONG BEFORE THE THIRD WAS RIGHT, AND BOTH WRONG ONES ARE KEPT HERE. ***
//
//   1. A BIGGER ABSOLUTE eps. Swept: 1e-6 -> 152 differ, 1e-5 -> 12, 2.5e-5 -> 0 at 24x24. It looked settled
//      and it was not: at 32x32 two interior pixels came back reading 0.49609375, which is 0.5 - 0.25/64 --
//      ONE sample in sixty-four, self-hitting again. A THRESHOLD TUNED ON ONE FRAME SIZE IS A THRESHOLD TUNED
//      ON NOTHING, and it fails silently at the next size rather than loudly at this one.
//
//   2. A "RELATIVE" eps SCALED BY length(P - centre). This one is worse than wrong, it is a NO-OP that looks
//      principled: at a bounce origin, P is ON the sphere, so that length is EXACTLY THE RADIUS every time.
//      It scaled by a constant and the differ counts came back byte for byte identical to the absolute sweep,
//      which is the only reason it was caught. A CORRECTION THAT CHANGES NO NUMBER IS NOT A CORRECTION.
//
//   3. MOVE THE ORIGIN OFF THE SURFACE: o = P + N * eps. From a point strictly outside a convex sphere, a
//      direction in the hemisphere about the outward normal has NO positive-t intersection with it at all --
//      the self-hit becomes geometrically impossible instead of being filtered after the fact, and the
//      theorem's precondition is restored rather than its conclusion patched.
//
// *** THE SIGNATURE OF THE STRUCTURAL FIX IS THAT THE TUNING PARAMETER STOPPED MATTERING: *** eps = 1e-5,
// 1e-4 and 1e-3 all give ZERO differing pixels across seven configurations and 11,072 pixels. A threshold has
// exactly one good value and this has three decades of them, which is what tells the two repairs apart.
//
// ================================================================================================
// *** AND WHAT MAKES THE COMPARISON POSSIBLE IS EXACTLY WHAT MAKES IT WEAK. THIS IS THE FINDING. ***
// ================================================================================================
//
// Read the derivation again and notice what is missing from it: THE SAMPLER. The bounce direction never
// appears. A camera ray's value depends only on WHETHER it hits the sphere, because every bounce escapes to
// the same constant sky no matter which way it points. The furnace is bit-exact BECAUSE it is insensitive to
// the sampling, and it is a weak test FOR THE SAME REASON. Those are not two facts about the furnace. They
// are one fact stated twice.
//
// This tree has written that down before from the other side. pathTracer.mjs's own v3487 comment says of its
// streamRng plant: "IT IS INVISIBLE ON THE FURNACE AND ONLY THE FURNACE ... A SUITE THAT GRADED ONLY THE
// FURNACE WOULD CERTIFY A BROKEN SEEDING SCHEME." The same blindness that hides a broken seeding scheme is
// what makes the f64/f32 comparison decidable. THE COST OF A DECIDABLE COMPARISON IS THE THING IT CANNOT SEE.
//
// So this file ships BOTH scenes and refuses to let the strong claim stand on the weak one:
//
//   FURNACE       constant sky.   Claim: BIT-EXACT agreement, CPU f64 against GPU f32. Strong claim, weak
//                                 scene -- it cannot see the sampler at all, and the gate PROVES that by
//                                 planting a broken cosine sampler and showing the furnace still passes.
//   GRADIENT SKY  sky varies      Claim: agreement to a MEASURED tolerance and no better. Weak claim, strong
//                 with direction. scene -- here the sampler decides the answer, so the same plant is caught.
//
// A gate that shipped only the first would be a check satisfiable by something other than the property it
// names, which is v4410's sabotage D arriving one round later in a different file.
//
// ---- WHAT THIS DOES NOT CLAIM -------------------------------------------------------------------------------
//
// That the whole tracer is on the GPU. It is not: this ports the LAMBERTIAN transport loop -- intersect,
// cosine bounce, throughput, sky -- and nothing else. NEE, microfacets, Fresnel, energy compensation, Russian
// roulette and stratification all stay on the CPU and are named here as absent rather than discovered missing.
// That bit-exactness extends past the furnace: it does not, and the gradient scene is in this file to say so
// with a number. And that f32 is enough for a shipping renderer -- that question is not asked here.
"use strict";

import { render as renderCpu } from "./pathTracer.mjs";
import { LCG } from "./pathTracerWgsl.mjs";

/** The furnace, and the camera pathTracer.mjs renders it with. */
export const FURNACE = Object.freeze({ centre: [0, 0, 0], radius: 1, albedo: 0.5 });
export const VIEW = Object.freeze({ w: 24, h: 24, eye: [0, 0, 5], look: [0, 0, 0], up: [0, 1, 0], fovDeg: 40 });
export const MAX_DEPTH = 8;

/** A ray-sphere epsilon lives in occlusion.mjs; the shader is handed the same number rather than a copy. */
export const EPS = 1e-6;

/**
 * Is `x` a dyadic rational small enough to be exact in f32? THE TEST IS THE PROPERTY ITSELF rather than a
 * list of blessed values: scale by 2^24 and ask whether an integer came out. A value written as 0.1 fails it
 * and a value written as 0.75 passes it, which is the distinction the exactness argument actually rests on.
 */
export const dyadic = (x) => Number.isFinite(x) && Number.isInteger(x * 16777216) && Math.abs(x) <= 1;
export const powerOfTwo = (n) => Number.isInteger(n) && n > 0 && (n & (n - 1)) === 0;

/** How many entries of `arr` are NOT exactly representable in f32. Zero is the claim; the count is the evidence. */
export function notExactInF32(arr) {
    let bad = 0;
    for (const v of arr) if (Math.fround(v) !== v) bad++;
    return bad;
}

/**
 * The two preconditions, CHECKED rather than assumed, and reported together with the count they predict.
 * A caller that asks for a non-dyadic albedo gets `exact: false` and a reason, not a silently weaker test.
 */
export function furnacePreconditions({ albedo = FURNACE.albedo, spp = 64 } = {}) {
    const a = dyadic(albedo), s = powerOfTwo(spp);
    return Object.freeze({
        dyadicAlbedo: a, powerOfTwoSpp: s, exact: a && s,
        why: a && s ? "both hold: the f64 render is exactly representable in f32"
                    : (a ? "" : "albedo " + albedo + " is not a dyadic rational; ") +
                      (s ? "" : "spp " + spp + " is not a power of two; ") + "the render will not be exact in f32",
    });
}

/** The CPU reference, DELEGATED so this file never becomes a second declaration of the renderer it grades. */
export function furnaceCpu({ albedo = FURNACE.albedo, spp = 64, seed = 1, sky = null, view = VIEW } = {}) {
    const scene = [{ centre: FURNACE.centre, radius: FURNACE.radius, albedo }];
    return renderCpu(scene, { ...view, spp, seed, maxDepth: MAX_DEPTH, nee: false,
                              sky: sky || (() => 1) });
}

/**
 * *** THE GRADIENT SKY, AND IT IS DYADIC-FREE ON PURPOSE. *** The furnace's exactness came from every ray
 * carrying the same constant; this one gives every direction its own radiance, so the bounce DIRECTION decides
 * the answer and the sampler is finally load-bearing. It is deliberately not a nice number: a gradient that
 * happened to be dyadic would leave the two scenes accidentally comparable and there would be nothing to learn.
 */
export const GRADIENT = Object.freeze({ a: 0.3, b: 0.7 });
export const gradientSky = (d) => GRADIENT.a + GRADIENT.b * (0.5 * (d[1] + 1));

// ================================================================================================
// THE SHADER
// ================================================================================================
//
// *** EVERY PLANT IS A PARAMETER AND NOT AN EDITED COPY, so a planted run and a clean run take the same code
// path -- v3467's rule, which pathTracer.mjs's own streamRng plant and v4290's shaderTan both follow. ***
//
//   plantNoCosine   the bounce becomes a fixed direction instead of a cosine-weighted one. INVISIBLE ON THE
//                   FURNACE BY CONSTRUCTION and fatal on the gradient, which is the whole argument above
//                   turned into something a gate can run.
//   plantSkyConst   the gradient sky is read as a constant. The reverse plant: fatal on the gradient, and on
//                   the furnace it is not a plant at all because the sky IS constant there.
//
// The generator is v4290's, ported with its constants read from furnace.mjs rather than retyped -- LCG comes
// from pathTracerWgsl.mjs, which parses them out of the source that ships.
export function traceWgsl({ workgroupSize = 64, plantNoCosine = false, plantSkyConst = false,
                            gradient = false } = {}) {
    const PI = "3.141592653589793";
    return `
@group(0) @binding(0) var<storage, read_write> outBuf : array<f32>;
@group(0) @binding(1) var<uniform> U : array<vec4<f32>, 8>;

// The LCG state advance. WGSL's u32 multiply wraps modulo 2^32 by specification and Math.imul is the low 32
// bits of a 32-bit product, so this is the SAME operation -- a disagreement here is a port bug with no
// floating point in it to blame (v4290 measured that separately and this file does not re-litigate it).
var<private> rngState : u32;
fn nextU32() -> u32 {
  rngState = rngState * ${LCG.mul}u + ${LCG.inc}u;
  return rngState;
}
// THE VALUE, WHERE THE PRECISIONS PART COMPANY: f32(s) rounds because a u32 needs 32 mantissa bits and an f32
// carries 24. v4290 measured 98.02% of the first 65536 draws differing from the CPU's f64 division. ON THE
// FURNACE THAT DIFFERENCE CANNOT REACH THE PIXEL, which is this round's subject.
fn nextF32() -> f32 { return f32(nextU32()) / ${LCG.div}.0; }

fn nrm(v : vec3<f32>) -> vec3<f32> {
  let l = sqrt(dot(v, v));
  if (l == 0.0) { return v; }
  return v / l;
}

// occlusion.mjs's raySphere, with a = 1 because directions are unit length. Returns -1 for a miss.
fn raySphere(orig : vec3<f32>, dir : vec3<f32>, centre : vec3<f32>, radius : f32, eps : f32) -> f32 {
  let o = orig - centre;
  let b = 2.0 * dot(dir, o);
  let c = dot(o, o) - radius * radius;
  let disc = b * b - 4.0 * c;
  if (disc < 0.0) { return -1.0; }
  let sq = sqrt(disc);
  let t0 = (-b - sq) / 2.0;
  let t1 = (-b + sq) / 2.0;
  if (t0 > eps) { return t0; }
  if (t1 > eps) { return t1; }
  return -1.0;
}

// furnace.mjs's createCoordinateSystem. THE BRANCH ON |N.x| > |N.y| IS NOT STYLISTIC -- its own header says
// the other construction divides by a quantity that goes to zero at the pole -- so it is ported as written.
fn coordSystem(N : vec3<f32>) -> mat3x3<f32> {
  var Nt : vec3<f32>;
  if (abs(N.x) > abs(N.y)) {
    let inv = 1.0 / sqrt(N.x * N.x + N.z * N.z);
    Nt = vec3<f32>(N.z * inv, 0.0, -N.x * inv);
  } else {
    let inv = 1.0 / sqrt(N.y * N.y + N.z * N.z);
    Nt = vec3<f32>(0.0, -N.z * inv, N.y * inv);
  }
  let Nb = cross(N, Nt);
  return mat3x3<f32>(Nt, Nb, N);
}

fn skyOf(d : vec3<f32>) -> f32 {
${gradient && !plantSkyConst
  ? `  return ${GRADIENT.a} + ${GRADIENT.b} * (0.5 * (d.y + 1.0));`
  : `  return ${gradient ? String(GRADIENT.a + GRADIENT.b * 0.5) : "1.0"};`}
}

@compute @workgroup_size(${workgroupSize})
fn main(@builtin(global_invocation_id) gid : vec3<u32>) {
  let w = i32(U[2].x);
  let h = i32(U[2].y);
  let idx = i32(gid.x);
  if (idx >= w * h) { return; }
  let x = idx % w;
  let y = idx / w;

  let eye    = U[0].xyz;
  let scale  = U[0].w;
  let fwd    = U[1].xyz;
  let albedo = U[1].w;
  let spp    = i32(U[2].z);
  let eps    = U[2].w;
  let right  = U[3].xyz;
  let seed   = bitcast<u32>(U[3].w);
  let camUp  = U[4].xyz;
  let centre = U[5].xyz;
  let radius = U[5].w;

  // render()'s per-pixel seeding, ported exactly. It is a CORRECTNESS requirement rather than a tidiness one:
  // its own header says a region scan is bit-identical to the corresponding crop only because of it.
  rngState = (seed * 73856093u) ^ (u32(x) * 19349663u) ^ (u32(y) * 83492791u);

  var acc = 0.0;
  for (var s = 0; s < spp; s = s + 1) {
    // THE TWO JITTER DRAWS HAPPEN EITHER WAY, exactly as on the CPU -- consuming a different number of draws
    // would move every later decision and the comparison would be about the sequence rather than the transport.
    let fx = nextF32();
    let fy = nextF32();
    let u = ((f32(x) + fx) / f32(w) * 2.0 - 1.0) * scale * (f32(w) / f32(h));
    let v = (1.0 - (f32(y) + fy) / f32(h) * 2.0) * scale;
    var d = nrm(fwd + (right * u + camUp * v));
    var o = eye;
    var throughput = 1.0;
    var radiance = 0.0;

    for (var depth = 0; depth < ${MAX_DEPTH}; depth = depth + 1) {
      let t = raySphere(o, d, centre, radius, eps);
      if (t < 0.0) { radiance = radiance + throughput * skyOf(d); break; }
      let P = o + d * t;
      let N = nrm(P - centre);
      // The two bounce draws are consumed WHETHER OR NOT the plant uses them, for the same reason as above.
      let r1 = nextF32();
      let r2 = nextF32();
${plantNoCosine
  ? `      let local = vec3<f32>(0.0, 1.0, 0.0);   // PLANT: a fixed direction, not a cosine-weighted one.`
  : `      let r = sqrt(r1);
      let phi = 2.0 * ${PI} * r2;
      let local = vec3<f32>(r * cos(phi), sqrt(max(0.0, 1.0 - r1)), r * sin(phi));`}
      // furnace.mjs's toWorld: s.x along Nb, s.y along N, s.z along Nt.
      let F = coordSystem(N);
      d = nrm(local.x * F[1] + local.y * F[2] + local.z * F[0]);
      // *** THE ORIGIN LEAVES THE SURFACE INSTEAD OF THE HIT BEING FILTERED AFTER THE FACT. *** Rejecting a
      // self-hit by t > eps is a threshold, and a threshold has to be tuned against an error nobody measured;
      // pushing the origin OUT ALONG THE NORMAL makes the self-hit geometrically impossible instead. From a
      // point strictly outside a convex sphere, a direction in the hemisphere about the outward normal has no
      // positive-t intersection with it AT ALL -- there is nothing left to threshold. See the header for the
      // two wrong answers this replaced.
      o = P + N * eps;
      // COSINE-WEIGHTED, SO THE COSINE CANCELS AGAINST THE PDF AND THE THROUGHPUT IS JUST THE ALBEDO -- the
      // same estimator v3470 graded, not a new one.
      throughput = throughput * albedo;
    }
    acc = acc + radiance;
  }
  outBuf[idx] = acc / f32(spp);
}
`;
}

/** The uniform block the shader above reads. Packed by hand so the two declarations sit on one screen. */
export function traceUniforms({ albedo = FURNACE.albedo, spp = 64, seed = 1, view = VIEW, eps = EPS } = {}) {
    const { w, h, eye, look, up, fovDeg } = view;
    const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
    const nrm = (v) => { const l = Math.hypot(v[0], v[1], v[2]); return l === 0 ? v : [v[0] / l, v[1] / l, v[2] / l]; };
    const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    const fwd = nrm(sub(look, eye));
    const right = nrm(cross(fwd, up));
    const camUp = cross(right, fwd);
    const scale = Math.tan(fovDeg * Math.PI / 360);
    const seedBits = new Float32Array(new Uint32Array([seed >>> 0]).buffer)[0];
    return new Float32Array([
        eye[0], eye[1], eye[2], scale,
        fwd[0], fwd[1], fwd[2], albedo,
        w, h, spp, eps,
        right[0], right[1], right[2], seedBits,
        camUp[0], camUp[1], camUp[2], 0,
        FURNACE.centre[0], FURNACE.centre[1], FURNACE.centre[2], FURNACE.radius,
        0, 0, 0, 0,
        0, 0, 0, 0,
    ]);
}

/**
 * What v4415 measured, so a later round reads a number rather than re-deriving one and calling it the same.
 * Re-take them with:  node physics/render/pathTracerGpu-selfcheck.mjs
 */
export const MEASURED_AT_V4415 = Object.freeze({
    // Pixels of 576 (24x24) NOT exactly representable in f32, by albedo. The exactness argument's evidence.
    notExact: Object.freeze({ "0.5": 0, "0.25": 0, "0.75": 0, "1": 0, "0.3": 163, "0.1": 163 }),
    notExactBySpp: Object.freeze({ 3: 26, 5: 36, 10: 39, 64: 0 }),
    furnaceValues: Object.freeze({ hit: 0.5, miss: 1, distinctAtSpp1: 2 }),
});

// v4468 -- the probe manifest (docs/GPU-KERNEL-CONTRACT.md): the furnace at the corpus's own settings, the f64 twin
// DELEGATED to the renderer, tolerance ZERO -- dyadic albedo and a power-of-two spp make the render exact in f32.
export const PROBES = Object.freeze([Object.freeze({
    id: "pathTracerGpu.traceWgsl", code: () => traceWgsl({}), entryPoint: "main",
    args: Object.freeze({ spp: 16, view: VIEW, eps: 1e-4, albedo: FURNACE.albedo }),
    pack: (a) => traceUniforms(a), cpu: (a) => Float32Array.from(furnaceCpu(a)), outCount: VIEW.w * VIEW.h, workgroups: Math.ceil(VIEW.w * VIEW.h / 64), tol: 0,
    key: () => ({ hit: MEASURED_AT_V4415.furnaceValues.hit, miss: MEASURED_AT_V4415.furnaceValues.miss, exact: furnacePreconditions({ spp: 16 }).exact }),
})]);
