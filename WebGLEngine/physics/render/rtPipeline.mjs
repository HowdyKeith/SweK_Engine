// WebGLEngine/physics/render/rtPipeline.mjs -- v4418
//
// *** FOUR OF VULKAN'S FIVE RAY-TRACING SHADER STAGES WERE ALREADY IN v4417'S LOOP. THEY HAD NO NAMES. ***
//
// #164 offered two roads: the compute transplant, or WebRTX's hit shaders. v4417 took the first. This is the
// second, and the first thing to say is what it is NOT: codedhead/webrtx is NOT built or vendored here.
// ui/webrtxBrowser.js (v4118) already settled that -- upstream publishes no dist, so there is nothing to pin,
// and vendoring ~3.6 MB of build artefacts nobody can review in a diff was refused with reasons. MEASURED
// AGAIN THIS ROUND rather than assumed from that note: cargo 1.94.1 and node 22 are here, `wasm-pack` is NOT,
// and vendor/webrtx does not exist. The binary road is shut on this box.
//
// *** SO THIS TAKES THE STRUCTURE, WHICH IS THE PART WORTH TAKING ANYWAY. *** WebRTX's contribution is not a
// renderer, it is a SHAPE: Vulkan's ray-tracing pipeline -- raygen, intersection, any-hit, closest-hit, miss,
// dispatched through a SHADER BINDING TABLE -- expressed as plain WebGPU compute. And v4118's own honest note
// says what it never got to: "NO IMAGE WAS EVER RENDERED here -- no raygen shader was compiled and no pass was
// dispatched. 'The pipeline exists' is not 'it draws'." That gap is what this closes, from the other side.
//
// ---- WHAT WAS MEASURED BEFORE ANYTHING WAS WRITTEN --------------------------------------------------------
//
// Probing v4417's generated WGSL for each stage:
//
//     raygen        generate a camera ray            PRESENT   inlined, unnamed
//     intersection  procedural sphere hit            PRESENT   inlined, unnamed  (raySphere)
//     closest-hit   shade the hit and continue       PRESENT   inlined, unnamed  (throughput *= albedo)
//     miss          environment radiance             PRESENT   inlined, unnamed  (skyOf)
//     any-hit       alpha / transparency             ABSENT    genuinely not there
//
//     shader binding table                           ABSENT
//     geometries the shader can hold                 EXACTLY ONE -- centre and radius are scalars
//
// *** THE MONOLITH IS NOT MISSING THE STAGES. IT IS MISSING THE SEAMS. *** That is a much smaller and much
// more useful finding than "the tree has no ray tracing pipeline", and it is why this round is a REARRANGEMENT
// with a capability at the end of it rather than a rewrite.
//
// ---- THE CAPABILITY, AND WHY IT IS NOT COSMETIC -------------------------------------------------------------
//
// A refactor that changes no behaviour is a refactor, and this tree does not ship those on their own. The thing
// the seams buy is the thing the monolith cannot express AT ALL: MORE THAN ONE GEOMETRY WITH MORE THAN ONE
// SHADING RULE IN ONE DISPATCH. v4417's shader has `albedo` as a single uniform scalar; there is nowhere to put
// a second one. With a binding table the geometry index selects a RECORD, and the record carries which
// closest-hit runs and with what parameters -- which is precisely what an SBT is for.
//
// *** AND THE ORACLE SURVIVES THE SECOND GEOMETRY, WHICH IS WHY THIS ROUND IS CHECKABLE AT ALL. *** v4417's
// furnace is bit-exact because its values are dyadic. Two spheres INTERREFLECT -- a bounce off one can land on
// the other -- so a path's contribution becomes a PRODUCT of albedos rather than a single one. Measured before
// relying on it: with both albedos dyadic, every product is dyadic too, and a 24x24 two-sphere furnace has ZERO
// non-representable pixels at 16 spp (69 distinct values, minimum 0.132813, so the interreflection is really
// happening and not being dodged). THE BIT-EXACT COMPARISON THEREFORE EXTENDS TO THE MULTI-GEOMETRY CASE, and
// the new capability is graded by the same instrument as the old one rather than by a new tolerance.
//
// ---- WHERE THE ORACLE STOPS, AND IT WAS FOUND BY RUNNING RATHER THAN BY THINKING ---------------------------
//
// One geometry is bit-exact BY AN ARGUMENT. Two or more is bit-exact only AS AN OBSERVATION, and the argument
// that carried the first case is exactly what is missing: a bounce can now land on a NEIGHBOUR, so which route
// a path takes depends on a direction f32 and f64 disagree about. Measured:
//
//     two spheres, apart      24/16, 32/64, 48/16   ->  0, 0, 0 differing
//     two spheres, TOUCHING   24/16, 32/64, 48/16   ->  0, 0, 0 differing
//     THREE spheres           32x32 spp=64          ->  1 of 1024 differing
//
// *** THE BOUNDARY IS REAL AND IT IS REACHED AT THREE. *** And the one differing pixel is diagnosable rather
// than mysterious: its delta times spp is 1.578, so ONE SAMPLE OF SIXTY-FOUR TOOK A DIFFERENT ROUTE. A rounding
// drift would be ~1e-7. So the gate does not assert that multi-geometry agreement is perfect -- it asserts that
// the values stay dyadic (they do, 0 of 1024 non-representable), that agreement stays above 99.5%, and that
// EVERY disagreement has the shape of a whole flipped sample rather than of a drifting port.
//
// ---- AND THE FURNACE IS BLIND TO THE MATERIAL TOO, WHICH IS THE SAME FACT A THIRD TIME --------------------
//
// The first draft of the gate asserted that a mirror record and a lambertian record differ on more than 20
// pixels of 576. IT MEASURED 15. The guess was wrong and the reason is this family's own subject recurring:
// IN A UNIFORM ENVIRONMENT EVERY BOUNCE DIRECTION RETURNS THE SAME RADIANCE, so a mirror and a diffuse produce
// the same pixel; the 15 that differ are only the paths that happened to strike the other sphere. On a gradient
// sky the same pair differs on 70 -- 4.7x more.
//
//     the furnace cannot see the SAMPLER          v4417 section 4
//     the furnace cannot see a broken SEEDING     v3487, pathTracer.mjs's own comment
//     the furnace cannot see the MATERIAL         here
//
// Three sites, three rounds, ONE FACT: a constant environment makes the outgoing direction irrelevant. Both
// numbers are kept in the gate because the GAP between them is the evidence, not a detail.
//
// ---- WGSL HAS NO FUNCTION POINTERS, AND NEITHER DOES WEBRTX ------------------------------------------------
//
// A real SBT is an indirection: the record names a shader and the hardware jumps to it. WGSL cannot do that, so
// the dispatch here is a `switch` on the record's shader index. THAT IS NOT A SHORTCUT AROUND THE MECHANISM --
// it is what WebRTX does too, because it compiles the whole pipeline down to one compute kernel for exactly the
// same reason. The faithful part is that THE BINDING IS DATA: which shader runs for a geometry is a value in a
// buffer, not a branch written at the call site, so adding a geometry never edits the traversal.
//
// ---- WHAT THIS DOES NOT CLAIM -------------------------------------------------------------------------------
//
// That this is WebRTX, or compatible with it: no SPIR-V, no GLSL front end, no naga, and no Vulkan API surface.
// That there is a BVH: geometries are tested linearly, which is honest at four spheres and useless at four
// thousand -- the acceleration structure is the single biggest thing WebRTX has that this does not. That
// any-hit exists: it does not, and nothing here pretends the stage list is complete. And that any of it runs
// faster than v4417's monolith -- the seams are for expressiveness, and no timing claim is made.
"use strict";

import { render as renderCpu } from "./pathTracer.mjs";
import { LCG } from "./pathTracerWgsl.mjs";
import { VIEW, MAX_DEPTH, EPS, notExactInF32, dyadic, powerOfTwo } from "./pathTracerGpu.mjs";

export { VIEW, MAX_DEPTH, EPS };

/**
 * *** THE STAGE LIST IS DATA, SO THE GATE CAN ASSERT ON IT RATHER THAN ON PROSE. *** `implemented` is the
 * honest column: any-hit is false and stays false until somebody writes it, and a list that quietly dropped
 * the row would report a complete pipeline.
 */
export const STAGES = Object.freeze([
    Object.freeze({ id: "raygen", fn: "rtRaygen", implemented: true,
                    what: "generate the camera ray for a pixel and its sub-pixel sample" }),
    Object.freeze({ id: "intersection", fn: "rtIntersect", implemented: true,
                    what: "a PROCEDURAL primitive's hit test -- a sphere, which in Vulkan needs this stage " +
                          "because only triangles get the built-in intersector" }),
    Object.freeze({ id: "anyHit", fn: null, implemented: false,
                    what: "alpha / transparency: accept or reject a candidate hit before it becomes closest. " +
                          "NOT WRITTEN. Nothing in this tree's scenes is cut-out or translucent yet" }),
    Object.freeze({ id: "closestHit", fn: "rtClosestHit", implemented: true,
                    what: "shade the winning hit and produce the continuation ray" }),
    Object.freeze({ id: "miss", fn: "rtMiss", implemented: true,
                    what: "the environment's radiance along a ray that hit nothing" }),
]);

/** Which closest-hit shaders the table can name. Values are the switch indices the WGSL dispatches on. */
export const HIT_SHADERS = Object.freeze({ lambertian: 0, mirror: 1 });

/**
 * A shader binding table record: which geometry, which closest-hit shader, and that shader's parameters.
 *
 * *** THE POINT IS THAT THIS IS DATA. *** Adding a geometry with a different material appends a record; it does
 * not touch the traversal loop, which is the whole difference between this and v4417's `albedo` uniform.
 */
export function sbtRecord({ centre = [0, 0, 0], radius = 1, hit = "lambertian", albedo = 0.5 } = {}) {
    if (!(hit in HIT_SHADERS)) throw new Error("rtPipeline: no closest-hit shader named " + hit);
    return Object.freeze({ centre: centre.slice(), radius, hit, albedo });
}

export const MAX_GEOMETRY = 4;

/**
 * *** WHICH RECORDS THE CPU REFERENCE CAN EXPRESS AT ALL, AND IT IS NOT ALL OF THEM. ***
 *
 * pathTracer.mjs's scene is {centre, radius, albedo}: a Lambertian sphere and nothing else. A binding table
 * can name `mirror`, and THE REFERENCE RENDERER HAS NO SUCH MATERIAL. That is not a bug in either file -- it
 * is the honest edge of the oracle, and it has to be a REFUSAL rather than a note.
 *
 * *** THE FIRST DRAFT MADE IT A SILENT DROP AND THE MEASUREMENT WENT WRONG IMMEDIATELY. *** sceneFromSbt
 * mapped only {centre, radius, albedo}, so a mirror record arrived at the CPU as a Lambertian, and the gate
 * dutifully reported 15 of 576 pixels "differing" -- a GPU mirror against a CPU diffuse, a number with no
 * meaning that looked exactly like a small port bug. A CONVERSION THAT DROPS A FIELD IS A SECOND DECLARATION
 * OF THE SCENE, which is the defect this tree names more often than any other, committed inside the round
 * whose whole subject is that the material is DATA.
 */
export const CPU_EXPRESSIBLE = Object.freeze(["lambertian"]);
export const cpuComparable = (sbt) => sbt.every((r) => CPU_EXPRESSIBLE.includes(r.hit));

/** The scene in the CPU tracer's own shape. REFUSES a record it would have to flatten. */
export function sceneFromSbt(sbt) {
    const bad = sbt.filter((r) => !CPU_EXPRESSIBLE.includes(r.hit)).map((r) => r.hit);
    if (bad.length) throw new Error(
        "rtPipeline: pathTracer.mjs has no material for [" + bad.join(", ") + "] -- it renders Lambertian " +
        "spheres only. Converting anyway would compare a GPU " + bad[0] + " against a CPU diffuse and report " +
        "the difference as a port error. Use cpuComparable() to ask first.");
    return sbt.map((r) => ({ centre: r.centre, radius: r.radius, albedo: r.albedo }));
}

/** The CPU reference for a table, DELEGATED to pathTracer.mjs rather than restated. */
export function renderSbtCpu(sbt, { spp = 16, seed = 1, view = VIEW, sky = null } = {}) {
    return renderCpu(sceneFromSbt(sbt), { ...view, spp, seed, maxDepth: MAX_DEPTH, nee: false,
                                          sky: sky || (() => 1) });
}

/** Both of v4417's exactness preconditions, over a whole table rather than one albedo. */
export function tablePreconditions(sbt, spp) {
    const bad = sbt.filter((r) => !dyadic(r.albedo)).map((r) => r.albedo);
    return Object.freeze({
        dyadicAlbedos: bad.length === 0, powerOfTwoSpp: powerOfTwo(spp),
        exact: bad.length === 0 && powerOfTwo(spp), nonDyadic: Object.freeze(bad),
        why: bad.length === 0 && powerOfTwo(spp)
            ? "every albedo is dyadic and spp is a power of two, so every path product is dyadic too"
            : "a non-dyadic albedo or spp breaks representability; interreflection MULTIPLIES albedos, so one " +
              "bad entry contaminates every path that touches it",
    });
}

// ================================================================================================
// THE PIPELINE
// ================================================================================================
export function pipelineWgsl({ workgroupSize = 64, gradient = false,
                               plantSwapRecords = false, plantIgnoreRecord = false } = {}) {
    const PI = "3.141592653589793";
    return `
@group(0) @binding(0) var<storage, read_write> outBuf : array<f32>;
@group(0) @binding(1) var<uniform> U : array<vec4<f32>, 24>;

// U[0]  eye.xyz, tanHalfFov          U[1]  fwd.xyz, geometryCount
// U[2]  w, h, spp, eps               U[3]  right.xyz, seedBits
// U[4]  camUp.xyz, _                 U[8+i]  geometry i: centre.xyz, radius
// U[16+i] SBT record i: hitShaderIndex, albedo, _, _
const GEO_BASE : i32 = 8;
const SBT_BASE : i32 = 16;

var<private> rngState : u32;
fn nextU32() -> u32 { rngState = rngState * ${LCG.mul}u + ${LCG.inc}u; return rngState; }
fn nextF32() -> f32 { return f32(nextU32()) / ${LCG.div}.0; }

fn nrm(v : vec3<f32>) -> vec3<f32> { let l = sqrt(dot(v, v)); if (l == 0.0) { return v; } return v / l; }

// ---- STAGE: raygen -------------------------------------------------------------------------------------
// v4417's inlined camera arithmetic, unchanged and now named. It consumes the same two draws in the same
// order, because a stage that consumed a different number would move every later decision on the path and the
// bit-exact comparison would be about the sequence instead of the transport.
fn rtRaygen(x : i32, y : i32, w : i32, h : i32) -> vec3<f32> {
  let fx = nextF32();
  let fy = nextF32();
  let u = ((f32(x) + fx) / f32(w) * 2.0 - 1.0) * U[0].w * (f32(w) / f32(h));
  let v = (1.0 - (f32(y) + fy) / f32(h) * 2.0) * U[0].w;
  return nrm(U[1].xyz + (U[3].xyz * u + U[4].xyz * v));
}

// ---- STAGE: intersection -------------------------------------------------------------------------------
// A sphere is a PROCEDURAL primitive: in Vulkan this stage exists because only triangles get the built-in
// intersector. occlusion.mjs's raySphere with a = 1, unit directions. Returns -1 for a miss.
fn rtIntersect(orig : vec3<f32>, dir : vec3<f32>, centre : vec3<f32>, radius : f32, eps : f32) -> f32 {
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

// ---- TRAVERSAL: which record wins ----------------------------------------------------------------------
// Linear over the geometries. NO BVH -- honest at four spheres, useless at four thousand, and the header
// names that as the biggest thing WebRTX has that this does not.
struct Hit { t : f32, geo : i32 };
fn rtTraverse(orig : vec3<f32>, dir : vec3<f32>, n : i32, eps : f32) -> Hit {
  var best = Hit(-1.0, -1);
  for (var i = 0; i < n; i = i + 1) {
    let g = U[GEO_BASE + i];
    let t = rtIntersect(orig, dir, g.xyz, g.w, eps);
    if (t > 0.0 && (best.t < 0.0 || t < best.t)) { best = Hit(t, i); }
  }
  return best;
}

fn coordSystem(N : vec3<f32>) -> mat3x3<f32> {
  var Nt : vec3<f32>;
  if (abs(N.x) > abs(N.y)) {
    let inv = 1.0 / sqrt(N.x * N.x + N.z * N.z);
    Nt = vec3<f32>(N.z * inv, 0.0, -N.x * inv);
  } else {
    let inv = 1.0 / sqrt(N.y * N.y + N.z * N.z);
    Nt = vec3<f32>(0.0, -N.z * inv, N.y * inv);
  }
  return mat3x3<f32>(Nt, cross(N, Nt), N);
}

// ---- STAGE: closest-hit --------------------------------------------------------------------------------
// *** DISPATCHED BY THE BINDING TABLE, NOT BY A BRANCH AT THE CALL SITE. *** WGSL has no function pointers,
// so the jump is a switch on the record's shader index -- which is what WebRTX does too, and for the same
// reason. What makes it a binding table rather than an if-chain is that THE INDEX IS DATA IN A BUFFER:
// adding a geometry appends a record and the traversal above never changes.
struct Bounce { dir : vec3<f32>, weight : f32 };
fn rtClosestHit(shaderIndex : i32, albedo : f32, N : vec3<f32>, inDir : vec3<f32>) -> Bounce {
  // The two bounce draws are consumed for EVERY shader, so switching materials cannot desynchronise the
  // sequence -- the same rule v3467 set for plants and pathTracer.mjs follows for plantNoJitter.
  let r1 = nextF32();
  let r2 = nextF32();
  switch (shaderIndex) {
    case ${HIT_SHADERS.mirror}: {
      // A perfect specular bounce: no cosine draw is used, but both draws are still taken.
      return Bounce(nrm(inDir - 2.0 * dot(inDir, N) * N), albedo);
    }
    default: {
      let r = sqrt(r1);
      let phi = 2.0 * ${PI} * r2;
      let local = vec3<f32>(r * cos(phi), sqrt(max(0.0, 1.0 - r1)), r * sin(phi));
      let F = coordSystem(N);
      // Cosine-weighted, so the cosine cancels against the pdf and the weight is just the albedo.
      return Bounce(nrm(local.x * F[1] + local.y * F[2] + local.z * F[0]), albedo);
    }
  }
}

// ---- STAGE: miss ---------------------------------------------------------------------------------------
fn rtMiss(d : vec3<f32>) -> f32 {
${gradient ? `  return 0.3 + 0.7 * (0.5 * (d.y + 1.0));` : `  return 1.0;`}
}

@compute @workgroup_size(${workgroupSize})
fn main(@builtin(global_invocation_id) gid : vec3<u32>) {
  let w = i32(U[2].x);
  let h = i32(U[2].y);
  let idx = i32(gid.x);
  if (idx >= w * h) { return; }
  let x = idx % w;
  let y = idx / w;
  let spp = i32(U[2].z);
  let eps = U[2].w;
  let nGeo = i32(U[1].w);

  rngState = (bitcast<u32>(U[3].w) * 73856093u) ^ (u32(x) * 19349663u) ^ (u32(y) * 83492791u);

  var acc = 0.0;
  for (var s = 0; s < spp; s = s + 1) {
    var d = rtRaygen(x, y, w, h);
    var o = U[0].xyz;
    var throughput = 1.0;
    var radiance = 0.0;

    for (var depth = 0; depth < ${MAX_DEPTH}; depth = depth + 1) {
      let hit = rtTraverse(o, d, nGeo, eps);
      if (hit.geo < 0) { radiance = radiance + throughput * rtMiss(d); break; }
      let g = U[GEO_BASE + hit.geo];
      let P = o + d * hit.t;
      let N = nrm(P - g.xyz);
      // *** THE BINDING TABLE LOOKUP. *** plantSwapRecords reads the WRONG record for the hit geometry and
      // plantIgnoreRecord reads record 0 always -- both are PARAMETERS rather than edited copies, so a
      // planted run and a clean run take the same code path (v3467's rule).
      let rec = U[SBT_BASE + ${plantIgnoreRecord ? "0" : plantSwapRecords ? "(nGeo - 1 - hit.geo)" : "hit.geo"}];
      let b = rtClosestHit(i32(rec.x), rec.y, N, d);
      d = b.dir;
      o = P + N * eps;
      throughput = throughput * b.weight;
    }
    acc = acc + radiance;
  }
  outBuf[idx] = acc / f32(spp);
}
`;
}

/** The uniform block the pipeline reads, packed from the binding table. */
export function pipelineUniforms(sbt, { spp = 16, seed = 1, view = VIEW, eps = EPS } = {}) {
    if (sbt.length > MAX_GEOMETRY) throw new Error("rtPipeline: at most " + MAX_GEOMETRY + " geometries");
    const { w, h, eye, look, up, fovDeg } = view;
    const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
    const nrm = (v) => { const l = Math.hypot(v[0], v[1], v[2]); return l === 0 ? v : [v[0] / l, v[1] / l, v[2] / l]; };
    const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    const fwd = nrm(sub(look, eye));
    const right = nrm(cross(fwd, up));
    const camUp = cross(right, fwd);
    const seedBits = new Float32Array(new Uint32Array([seed >>> 0]).buffer)[0];
    const U = new Float32Array(24 * 4);
    U.set([eye[0], eye[1], eye[2], Math.tan(fovDeg * Math.PI / 360)], 0);
    U.set([fwd[0], fwd[1], fwd[2], sbt.length], 4);
    U.set([w, h, spp, eps], 8);
    U.set([right[0], right[1], right[2], seedBits], 12);
    U.set([camUp[0], camUp[1], camUp[2], 0], 16);
    sbt.forEach((r, i) => {
        U.set([r.centre[0], r.centre[1], r.centre[2], r.radius], (8 + i) * 4);
        U.set([HIT_SHADERS[r.hit], r.albedo, 0, 0], (16 + i) * 4);
    });
    return U;
}

export { notExactInF32 };

/** What v4418 measured. Re-take with: node physics/render/rtPipeline-selfcheck.mjs */
export const MEASURED_AT_V4418 = Object.freeze({
    stagesPresentInV4417Monolith: 4, stagesTotal: 5, missing: "anyHit",
    monolithGeometries: 1,
    twoSphereFurnace: Object.freeze({ nonDyadicPixels: 0, distinctValues: 69, min: 0.132813 }),
    // Differing pixels against the CPU f64 reference. The boundary is at THREE.
    differing: Object.freeze({ oneSphere: 0, twoApart: 0, twoTouching: 0, threeSpheres: 1, threeOf: 1024 }),
    // The one three-sphere disagreement, times spp: a whole flipped sample, not a rounding drift.
    threeSphereDeltaTimesSpp: 1.578125,
    // Mirror record against lambertian record, same geometry, two skies. The gap is the blindness.
    materialVisibility: Object.freeze({ constantSky: 15, gradientSky: 70, of: 576 }),
});

// v4468 -- the probe manifest (docs/GPU-KERNEL-CONTRACT.md): a two-record LAMBERTIAN table (the CPU tracer has no
// mirror), the twin delegated to pathTracer.mjs, tolerance zero on dyadic albedos. The corpus's mirror entry is the
// cross-backend claim; this one is the CPU claim.
const PROBE_SBT = Object.freeze([sbtRecord({ centre: [-1.2, 0, 0], radius: 0.6, albedo: 0.5 }), sbtRecord({ centre: [1.2, 0, 0], radius: 0.6, albedo: 0.25 })]);
export const PROBES = Object.freeze([Object.freeze({
    id: "rtPipeline.pipelineWgsl", code: () => pipelineWgsl({}), entryPoint: "main",
    args: Object.freeze({ sbt: PROBE_SBT, spp: 16, view: VIEW, eps: 1e-4 }),
    pack: (a) => pipelineUniforms(a.sbt, a), cpu: (a) => Float32Array.from(renderSbtCpu(a.sbt, a)), outCount: VIEW.w * VIEW.h, workgroups: Math.ceil(VIEW.w * VIEW.h / 64), tol: 0,
    key: () => ({ exact: tablePreconditions(PROBE_SBT, 16).exact, stages: STAGES.length }),
})]);
