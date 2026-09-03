// WebGLEngine/physics/render/furnaceWgsl.mjs -- v4387
//
// *** THE FURNACE ON A DEVICE, HELD TO ITS ANALYTIC KEY RATHER THAN TO THE CPU. ***
//
// physics/render/pathTracerWgsl.mjs (v4290) established the floor this needs and said what it was for: it
// ported the two DECIDABLE pieces of the tracer -- the generator and the ray-sphere intersection -- and closed
// by naming what it would not attempt. "`trace` is roughly three hundred lines of multiple importance sampling,
// microfacet lobes, Fresnel, energy compensation and Russian roulette... Porting it is a real round; porting it
// before anyone has established what f32 does to the primary ray would be building on an unmeasured floor."
//
// This is not that port either. It is the piece of the tracer whose answer is a CLOSED FORM, which is the one
// piece that can cross to a device without anybody having to invent a tolerance first.
//
// ---- WHY AN ANALYTIC KEY IS THE WHOLE POINT HERE --------------------------------------------------------------
//
// Every device round before this one compared a GPU against a CPU and had to say what agreement meant:
//   v4370  smooth f32 arithmetic         -> bit-identical, and the claim would have survived at 1e-6
//   v4380  a decision ending in floor()  -> exact set equality against an f32 mirror, discontinuity measured
//   v4382  integer end to end            -> zero tolerance, because the kernel's own contract says so
//   v4385  a quadrature with sqrt in it  -> a measured f32 floor, earned before the first failure
//
// *** THIS ONE CANNOT DO ANY OF THAT, AND DOES NOT NEED TO. *** physics/render/furnace.mjs's estimator is a
// Monte Carlo integral whose answer is known exactly: a white furnace returns the albedo, and each named fault
// returns the albedo times a constant with no free parameters --
//
//     EXPECTED        = { clean: 1, noPdf: 1 / (2 PI), noCosine: 2, badSampler: 4 / PI }
//     EXPECTED_COSINE = { clean: 1, wrongPdf: 4 / 3 }
//
// -- so the device is graded against SIX CONSTANTS, not against another renderer. f32 against f64 never enters
// it. What enters instead is sampling noise, which is a property of the estimator rather than of the hardware,
// and which both machines pay.
//
// *** AND v4290 PROVED THE DEVICE CANNOT DRAW THE SAME RANDOM NUMBERS, WHICH IS WHY THIS IS WORTH DOING. ***
// That round measured it: the generator's STATE is portable and its OUTPUT is not portable even between
// conformant devices -- 98.02% of the first 65536 draws differ from the CPU's, because f32(u32) rounds and WGSL
// leaves which of the two neighbours you get implementation-defined. A comparison against the CPU's pixels
// would therefore be measuring the RNG. A comparison against 4/PI is not, and it is the same claim whichever
// neighbour the adapter picks.
//
// SO THE PORT DELIBERATELY DOES NOT REPRODUCE THE CPU'S SAMPLE STREAM. The CPU walks one sequential stream;
// this splits the work across lanes and gives each its own seed. That would be a defect if the key were the
// CPU's answer. It is not, and stating it here is cheaper than someone later discovering it and assuming it was
// an accident.
//
// EVERY FAULT IS A PARAMETER, exactly as furnace.mjs has them, so a planted run and a clean run are the SAME
// SHADER and a difference cannot be an accident of which copy ran. That is furnace.mjs's own rule, kept.
//
// Gated in physics/render/furnaceWgsl-selfcheck.mjs.
"use strict";

/** The fault bits the shader reads out of its uniform. Names match furnace.mjs's option names exactly. */
export const FAULT = Object.freeze({ noPdf: 1, noCosine: 2, badSampler: 4, cosine: 8, wrongPdf: 16 });

/**
 * One lane per parallel chain; each draws `perLane` samples and writes an f32 partial sum. The host adds the
 * partials in f64 and applies albedo/PI, exactly as furnace.mjs's last line does.
 *
 * *** THE REDUCTION IS ON THE HOST ON PURPOSE. *** WGSL has no f32 atomic, and the alternatives are a
 * fixed-point accumulator (which tools/roundhouse/magmapGpu.mjs shows costs a measured amount of resolution)
 * or a tree reduction in workgroup memory (which would put a second thing under test in the same round). A
 * partial per lane is the smallest thing that answers the question being asked.
 */
export const FURNACE_WGSL = /* wgsl */ `
// furnace.wgsl -- physics/render/furnace.mjs's estimator, term for term. No constant is retyped: albedo and the
// sample counts arrive in the uniform, and the only literals here are the ones furnace.mjs itself writes
// (1664525, 1013904223, and 2 PI in the samplers).
struct Params {
  seed      : u32,
  perLane   : u32,
  faults    : u32,
  laneCount : u32,
};
@group(0) @binding(0) var<uniform>             P    : Params;
@group(0) @binding(1) var<storage, read_write> part : array<f32>;

const PI : f32 = 3.14159265358979323846;

// furnace.mjs rng(): the state is exact (u32 multiply wraps by specification, and Math.imul is the same
// operation); the VALUE is not portable, which v4290 measured and this file's key does not depend on.
fn nextState(s : u32) -> u32 { return s * 1664525u + 1013904223u; }
fn toUnit(s : u32) -> f32 { return f32(s) / 4294967296.0; }

fn uniformSampleHemisphere(r1 : f32, r2 : f32) -> vec3<f32> {
  let sinTheta = sqrt(max(0.0, 1.0 - r1 * r1));
  let phi = 2.0 * PI * r2;
  return vec3<f32>(sinTheta * cos(phi), r1, sinTheta * sin(phi));
}
fn uniformThetaHemisphere(r1 : f32, r2 : f32) -> vec3<f32> {      // the NAMED wrong sampler
  let theta = r1 * PI / 2.0;
  let phi = 2.0 * PI * r2;
  return vec3<f32>(sin(theta) * cos(phi), cos(theta), sin(theta) * sin(phi));
}
fn cosineSampleHemisphere(r1 : f32, r2 : f32) -> vec3<f32> {      // Malley's method
  let r = sqrt(r1);
  let phi = 2.0 * PI * r2;
  return vec3<f32>(r * cos(phi), sqrt(max(0.0, 1.0 - r1)), r * sin(phi));
}

@compute @workgroup_size(64)
fn furnace(@builtin(global_invocation_id) gid : vec3<u32>) {
  let lane = gid.x;
  if (lane >= P.laneCount) { return; }

  // THE BASIS IS BUILT HERE rather than received -- but NOT for the reason pathTracerWgsl gives about the
  // camera, and saying so is the honest version. That file puts the camera basis inside the comparison because
  // a handedness error would show. HERE IT WOULD NOT: the furnace integrand is azimuthally symmetric, so the
  // estimator sees only cos(theta) = dot(dir, N), and ANY orthonormal tangent frame gives the same answer.
  // MEASURED as a sabotage: swapping Nt from +Z to +X -- a different, left-handed, still-orthonormal frame --
  // moves nothing at all, 0 red. What the key CAN see is N itself: leaving it non-unit at 0.9 moves four of
  // the six cases to 1.90e-1. The basis is built here so the port is the same code as furnace.mjs, which is
  // worth doing; it is not a thing this key checks, and the gate says which.
  let N  = vec3<f32>(0.0, 1.0, 0.0);
  let Nt = vec3<f32>(0.0, 0.0, 1.0);                    // createCoordinateSystem's else-branch at N = +Y
  let Nb = vec3<f32>(N.y * Nt.z - N.z * Nt.y, N.z * Nt.x - N.x * Nt.z, N.x * Nt.y - N.y * Nt.x);

  let useCosine  = (P.faults & 8u)  != 0u;
  let wrongPdf   = (P.faults & 16u) != 0u;
  let noPdf      = (P.faults & 1u)  != 0u;
  let noCosine   = (P.faults & 2u)  != 0u;
  let badSampler = (P.faults & 4u)  != 0u;

  // each lane its own stream -- see this module's header on why that is allowed and deliberate
  var s : u32 = nextState(P.seed + lane * 2654435761u);
  var sum : f32 = 0.0;
  for (var i : u32 = 0u; i < P.perLane; i = i + 1u) {
    s = nextState(s); let r1 = toUnit(s);
    s = nextState(s); let r2 = toUnit(s);
    var sv : vec3<f32>;
    if (badSampler)      { sv = uniformThetaHemisphere(r1, r2); }
    else if (useCosine)  { sv = cosineSampleHemisphere(r1, r2); }
    else                 { sv = uniformSampleHemisphere(r1, r2); }
    let dir = vec3<f32>(sv.x * Nb.x + sv.y * N.x + sv.z * Nt.x,
                        sv.x * Nb.y + sv.y * N.y + sv.z * Nt.y,
                        sv.x * Nb.z + sv.y * N.z + sv.z * Nt.z);
    // the cosine is read from the DIRECTION, never from r1 -- furnace.mjs's own note, and taking the shortcut
    // would hide half the badSampler fault by making the estimator self-consistent
    let cosT = max(0.0, dot(dir, N));
    var pdf : f32;
    if (useCosine && !wrongPdf) { pdf = cosT / PI; } else { pdf = 1.0 / (2.0 * PI); }
    var contrib : f32 = 1.0;                            // radiance() is the constant 1 furnace
    if (!noCosine) { contrib = contrib * cosT; }
    if (!noPdf)    { contrib = contrib / max(pdf, 1.1754944e-38); }
    sum = sum + contrib;
  }
  part[lane] = sum;
}
`;

/** Pack the uniform. Field order and types match struct Params above. */
export function packFurnaceParams({ seed = 1, perLane, faults = 0, laneCount }) {
    const buf = new ArrayBuffer(16), u = new Uint32Array(buf);
    u[0] = seed >>> 0; u[1] = perLane >>> 0; u[2] = faults >>> 0; u[3] = laneCount >>> 0;
    return buf;
}

/** furnace.mjs's last line, applied to the summed partials: (albedo / PI) * (sum / samples). */
export function estimateFrom(partials, { albedo = 1, samples }) {
    let sum = 0;
    for (let i = 0; i < partials.length; i++) sum += partials[i];
    return (albedo / Math.PI) * (sum / samples);
}

/** The fault word for a named option set, so a caller never assembles bits by hand. */
export function faultBits({ noPdf = false, noCosine = false, badSampler = false, strategy = "uniform", wrongPdf = false } = {}) {
    return (noPdf ? FAULT.noPdf : 0) | (noCosine ? FAULT.noCosine : 0) | (badSampler ? FAULT.badSampler : 0)
         | (strategy === "cosine" ? FAULT.cosine : 0) | (wrongPdf ? FAULT.wrongPdf : 0);
}
