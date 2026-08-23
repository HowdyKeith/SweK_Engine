// physics/mpm/gpuKernel.mjs -- v3809
//
// *** THE 2D MPM LOOP AS A WebGPU COMPUTE KERNEL. physics/mpm/step.mjs is the graded loop; this is the same
// loop for hardware that can run 65,536 particles instead of 36. IT IS A SECOND IMPLEMENTATION OF GRADED
// PHYSICS, WHICH IS THE MOST DANGEROUS THING THIS TREE BUILDS: the gates all point at the .mjs modules, so a
// kernel that drifts from them would keep every gate green while the page everybody actually looks at showed
// something else. Everything in this file is arranged around that one risk. ***
//
// WHAT I COULD NOT DO, STATED FIRST. There is no GPU and no browser in the sandbox this was written in. That
// used to mean this kernel had never been run at all; it no longer does. wgsl_reflect ships a WGSL
// INTERPRETER, so physics/mpm/gpuKernelInterp.mjs executes the shipped source on the CPU and compares it to
// step.mjs particle by particle. MEASURED: free fall, the collapsing column and the Drucker-Prager pile all
// agree with the graded loop to about 1e-7 relative over 15 steps with no NaN and no saturation, the kernel
// earns the discrete free-fall parabola by itself at 4.7e-6 over 120 steps with a sideways drift of exactly
// zero, and two identical runs come back BIT-IDENTICAL.
//
// *** WHAT THAT STILL DOES NOT ESTABLISH, AND IT IS THE INTERESTING HALF. *** An interpreter is not a driver.
// It does not prove the shader COMPILES on real hardware, it runs invocations one after another so IT CANNOT
// SEE A RACE, and it does not reproduce a vendor's f32. The LBM kernel had the same shape of problem at v2977
// and the answer was an adjudicator that runs on Keith's machine: mpm-gpu-check.html does that here, and until
// it has been opened once the honest status of this file is CORRECT ON AN INTERPRETER, UNTRIED ON A GPU.
//
// *** AND THE FIRST THING THE INTERPRETER FOUND WAS A BUG IN ITSELF. *** It disagreed with the CPU loop by
// exactly one particle's mass, and the temptation was to go looking through the scatter. At workgroup_size(64)
// it runs 24 of 64 invocations; at 8 and below it runs all of them. THE TOOL WAS WRONG AND THE KERNEL WAS
// RIGHT, and an hour would have gone into the kernel if the harness had not been asked to count to sixty-four
// first.
//
// THREE THINGS *CAN* BE GRADED WITHOUT A GPU, AND physics/mpm/gpuKernel-selfcheck.mjs GRADES ALL THREE:
//
//   1. THE STENCIL, NUMERICALLY. The nine B-spline weights and their gradients are the one piece of arithmetic
//      that had to be retyped into WGSL -- everything else arrives through a uniform. So the gate PARSES THE
//      WEIGHT EXPRESSIONS BACK OUT OF THIS SOURCE TEXT, evaluates them as JavaScript, and compares them to
//      transfer.mjs's quadWeights and forces.mjs's quadWeightsGrad over a sweep of positions and cell sizes.
//      Not "does it look the same" -- does it COMPUTE the same, to the last bit, on the source that ships.
//
//   2. THE FIXED-POINT ACCUMULATION, WHICH IS THE ONE THING THE CPU LOOP NEVER HAD. See below.
//
//   3. THAT THERE IS NOTHING ELSE TO DRIFT. *** THIS KERNEL CONTAINS NO MATERIAL CONSTANT AT ALL. *** No mu,
//      no lambda, no friction angle, no clamp limit. Every number the physics depends on is computed by the
//      graded module in JavaScript and arrives as a uniform at run time, so there is nothing to retype and
//      therefore nothing that can silently disagree. The clamp limits are not even read from plasticity.mjs's
//      source -- they are MEASURED from returnMap() itself by clampLimits() below.
//
// *** WHY FIXED POINT, AND WHY IT IS AN IMPROVEMENT RATHER THAN A COMPROMISE. ***
// P2G is a scatter: nine nodes per particle, and neighbouring particles hit the same node. WGSL has atomics on
// i32 and u32 and NONE ON f32, so the momentum has to land somewhere addable. Fixed point is the usual answer
// and it buys something the float version could not have had: INTEGER ADDITION IS ASSOCIATIVE, so the total at
// a node does not depend on the order the workgroups happen to finish in. THE KERNEL IS BIT-DETERMINISTIC RUN
// TO RUN, which f32 atomics -- if they existed -- would not be. mpm-gpu-check.html checks exactly that by
// running it twice.
//
// *** AND THE PRICE IS MEASURED, NOT ASSUMED. *** gpuKernel-selfcheck runs the GRADED CPU LOOP with every
// scatter quantised exactly the way this kernel quantises it, and reads the free-fall key off the result. It
// costs the key its round-off floor: 3.8e-15 in clean f64, 2.6e-7 quantised -- AND 4.2e-7 IF THE SAME POINTS
// ARE MERELY ROUNDED TO f32. So the fixed point is not what limits this kernel; the hardware's single
// precision is, and it would have limited it just as much with float atomics. That is the whole defence of the
// design and it is a measurement, not an argument.
//
// *** THE SCALES ARE CHOSEN ON RANGE, NOT ON THAT ERROR NUMBER, AND THE REASON MATTERS. *** The quantised key
// is NOT MONOTONE in the scale: 2^26/2^24/2^22 reads 1.18e-6 while the COARSER-RANGED 2^26/2^23/2^20 reads
// 2.6e-7. Quantisation error is pseudo-random and partially cancels, so which scale "wins" on one fixture is
// luck. TUNING THE SCALE TO THAT NUMBER WOULD BE FITTING TO NOISE. The rule below is range-based, uniform
// across all three channels, and deterministic; the error is then CONFIRMED acceptable rather than optimised.
//
// *** AND ONE ACCUMULATOR CAME BACK OUT, WHICH IS THE MOST USEFUL THING THE INTERPRETER FOUND. *** The centre
// of mass was accumulated in fixed point too, in the same scatter, for free. It carried about 2.5e-5 of its
// own rounding noise against a 2.6e-7 physics floor -- A READOUT A HUNDRED TIMES COARSER THAN THE CLAIM IT
// EXISTS TO DISPLAY -- and the arithmetic in comAccumulatorPossible() says that is not fixable at this scale:
// resolution and range pull apart as the particle count grows, and they part company at about 16,384. It works
// on every fixture small enough to check against the CPU and fails only where nothing could check it. The host
// reads the particles back and sums them in f64 instead.
//
// SATURATION IS DETECTED, BECAUSE THE FAILURE IS OTHERWISE INVISIBLE. An i32 accumulator that overflows does
// not crash: it wraps, and the material does something plausible and wrong. The kernel counts every scatter
// that would clip and the page reads the count, so "the scale was too small" is a sentence somebody gets told
// rather than a shape somebody squints at.

import { quadWeights } from "./transfer.mjs";
import { quadWeightsGrad } from "./forces.mjs";
import { returnMap } from "./plasticity.mjs";

/**
 * *** THE PLASTIC CLAMP LIMITS, MEASURED FROM THE GRADED FUNCTION RATHER THAN COPIED OUT OF ITS SIGNATURE. ***
 *
 * returnMap's thetaC and thetaS are DEFAULT PARAMETERS, not exports, so there is nothing to import. Retyping
 * 0.025 and 0.0075 here would put the numbers in two places and this tree has found that defect nine times in
 * one session. Instead: hand returnMap a deformation whose singular values are far outside any plausible
 * clamp -- 10 and 0.001 -- and both come back clamped to the limits themselves. The limits are then READ OFF
 * THE GRADED FUNCTION'S OWN OUTPUT, so changing plasticity.mjs changes this automatically and cannot drift.
 */
export function clampLimits() {
    const r = returnMap([10, 0, 0, 0.001], [1, 0, 0, 1]);
    const hi = r.clampedSingulars[0], lo = r.clampedSingulars[1];
    return { thetaC: 1 - lo, thetaS: hi - 1, lo, hi };
}

/**
 * *** THE MEASURED PEAKS THE FIXED-POINT RANGE HAS TO COVER. ***
 *
 * The largest value ever accumulated at a single node, over 600 steps of each of the three scenes mpm.html
 * ships (free fall, collapsing column, granular pile), taken from the graded CPU loop. gpuKernel-selfcheck
 * RE-MEASURES these and fails if the shipped numbers no longer bound what the loop actually produces -- so a
 * change to the material that made the forces bigger would fail a gate rather than silently clip a kernel.
 */
export const MEASURED_PEAKS = { mass: 0.8046, mom: 5.595, force: 57.51 };

/** The cell size those peaks were measured at. Everything below scales away from this. */
export const H_REF = 0.5;

/**
 * *** THE PEAKS ARE A FUNCTION OF CELL SIZE AND THE FIRST VERSION OF THIS FILE FORGOT IT. ***
 *
 * The scales above were measured on mpm.html's grid, h = 0.5. This page runs h as small as 0.03125, and at
 * that cell size the same physics puts about 256 TIMES LESS MASS on a node -- so a scale derived at h = 0.5
 * would have thrown away eight bits of resolution and quietly made the fixed point several hundred times
 * worse than f32, having been measured as COMPARABLE to f32 at the cell size it was derived on. A CONSTANT
 * THAT IS RIGHT ON THE FIXTURE IT WAS TAKEN FROM AND WRONG EVERYWHERE ELSE IS THE HARDEST KIND TO NOTICE.
 *
 * The exponents are dimensional and were CHECKED against the graded loop rather than assumed: node mass is a
 * density times a cell area, so h^2; node momentum is that times a velocity the physics fixes independently
 * of the grid, so h^2 as well; and the force scatter carries vol0 * P * grad(w) = (h^2/4) * P * (1/h), so h^1.
 * MEASURED by halving h four times at FIXED PHYSICAL TIME: mass 3.19, 2.73, 3.98 against a predicted 4;
 * momentum 4.45, 4.87, 2.82 against 4; force 1.52, 1.55, 1.97 against 2. Noisy, because a peak over a
 * collapse is a maximum of a transient -- and comfortably inside the headroom below, which is the point of
 * having headroom rather than a fit.
 */
export const PEAK_EXPONENT = { mass: 2, mom: 2, force: 1 };

/** How much bigger than the worst expected value the accumulator's range must be. */
export const HEADROOM = 32;

/** The peaks expected at cell size h, scaled from the measurement at H_REF. */
export function peaksAt(h, peaks = MEASURED_PEAKS) {
    const r = h / H_REF;
    return { mass: peaks.mass * r ** PEAK_EXPONENT.mass,
             mom: peaks.mom * r ** PEAK_EXPONENT.mom,
             force: peaks.force * r ** PEAK_EXPONENT.force };
}

/**
 * The largest power-of-two scale whose i32 range still covers `peak * headroom`.
 * Power of two on purpose: it makes the multiply and divide exact in binary floating point, so the ONLY error
 * introduced is the rounding to integer and not a second one from the scaling itself.
 */
export function scaleFor(peak, headroom = HEADROOM) {
    const need = Math.abs(peak) * headroom;
    // *** THE CAP IS 40 AND THE ASYMMETRY IS DELIBERATE. *** Too coarse a scale loses precision SILENTLY; too
    // fine a scale saturates, and saturation is COUNTED and reported. Given one failure is detected and the
    // other is not, the rule leans toward the fine end and lets the counter be the backstop.
    let k = 40;
    while (k > 0 && 2147483647 / 2 ** k < need) k--;
    return 2 ** k;
}

/**
 * Every fixed-point scale the kernel uses. Three, and there is no fourth: the centre of mass is computed in
 * f64 on the host from a periodic readback, for the reason comAccumulatorPossible() states in arithmetic.
 */
export function fixedPointScales({ h = H_REF, peaks = MEASURED_PEAKS, headroom = HEADROOM } = {}) {
    const p = peaksAt(h, peaks);
    return {
        mass: scaleFor(p.mass, headroom),
        mom: scaleFor(p.mom, headroom),
        force: scaleFor(p.force, headroom),
        expectedPeaks: p,
    };
}

/**
 * *** WHY THE CENTRE OF MASS IS NOT ACCUMULATED ON THE GPU, AS ARITHMETIC RATHER THAN AS A PREFERENCE. ***
 *
 * It WAS, and the first interpreter run caught it: the readout carried about 2.5e-5 of its own noise while the
 * physics floor it exists to display is 2.6e-7. THE INSTRUMENT WAS A HUNDRED TIMES COARSER THAN THE THING IT
 * WAS MEASURING, which is the shape that invites somebody to tune a correct loop until the number on screen
 * looks better.
 *
 * The reason is structural and worth keeping. A fixed-point add rounds by up to half a step REGARDLESS OF THE
 * MAGNITUDE being added, so N contributions cost about sqrt(N)/(2*scale) in the sum -- while the RANGE must
 * still cover M*ymax. Those two pull apart as N grows:
 *
 *     resolution wants   scale >= sqrt(N) / (2 * eps * M)
 *     range allows       scale <= 2^31 / (M * ymax)
 *
 * and at 25 particles both hold comfortably, at 16,384 they no longer can, and at 65,536 -- the size this page
 * exists to run -- the requirement exceeds the allowance by about five times. *** THE ACCUMULATOR WOULD HAVE
 * WORKED ON EVERY FIXTURE SMALL ENOUGH TO CHECK IT AGAINST THE CPU AND FAILED ONLY WHERE NOTHING COULD CHECK
 * IT. *** Returns true when a single i32 accumulator could actually do the job.
 */
export function comAccumulatorPossible({ n, totalMass, ymax, eps = 1e-7 } = {}) {
    const needScale = Math.sqrt(n) / (2 * eps * totalMass);
    const maxScale = 2 ** 31 / (totalMass * ymax);
    return { possible: needScale <= maxScale, needScale, maxScale };
}

/**
 * The JavaScript mirror of the kernel's quantiser, for anything that wants to predict what the GPU will do.
 * *** ROUND, NOT TRUNCATE, AND THE DIFFERENCE IS NOT COSMETIC. *** Truncation biases every contribution toward
 * zero by up to half a step; nine of those per particle over 65,536 particles is a SYSTEMATIC MASS LOSS of
 * order 1e-3 relative, which would look exactly like a leaky transfer. Rounding is unbiased.
 * (WGSL's round() breaks ties to even and Math.round breaks them upward. A tie is a measure-zero event on one
 * scatter in a hundred million and it is named here so nobody has to rediscover why the mirror is not bitwise.)
 */
export const quantise = (v, scale) => Math.round(v * scale) / scale;

// ------------------------------------------------------------------------------------------------------------
// THE KERNEL
// ------------------------------------------------------------------------------------------------------------
//
// Four entry points, one per stage of step.mjs, dispatched in this order every step:
//
//     clear   ->   p2g   ->   grid   ->   g2p
//
// and the mapping to the graded loop is one-to-one:
//
//     p2g   = transfer.mjs p2g (APIC)  +  forces.mjs stressForces  +  constitutive.mjs firstPiola
//     grid  = gridSolve.mjs normalise, then the f/m*dt kick, then applyBodyForce, then enforceWalls
//     g2p   = transfer.mjs g2p  +  constitutive.mjs advanceF  +  plasticity.mjs returnMap
//                                                              or druckerPrager.mjs dpReturn
//
// *** THE ORDER INSIDE `grid` IS THE WHOLE OF gridSolve.mjs's KEY AND IT IS EASY TO GET WRONG HERE. *** The
// body force must land on a VELOCITY field, which means AFTER the divide by mass. On a momentum field the same
// line gives every node the same momentum kick regardless of its mass, so the total impulse becomes
// (node count)*g*dt instead of M*g*dt: right units, plausible motion, and it scales with grid resolution
// instead of with the material. gpuKernel-selfcheck checks the divide appears before the gravity line IN THIS
// SOURCE TEXT, because that is the one property of this kernel a reader can verify without hardware.

const WGSL = `
// ============================================================================================================
// SweK MPM -- 2D material point method, WebGPU compute.
// Generated by physics/mpm/gpuKernel.mjs. NO MATERIAL CONSTANT APPEARS IN THIS FILE: mu, lambda, the friction
// coefficient and the plastic clamp limits all arrive through Params, computed by the graded JS modules.
// ============================================================================================================

struct Params {
    nx: u32, ny: u32, nParticles: u32, plasticMode: u32,
    h: f32, dt: f32, gx: f32, gy: f32,
    mu: f32, lambda: f32, alpha: f32, pmass: f32,
    pvol: f32, thetaC: f32, thetaS: f32, wallsOn: u32,
    wallLo: i32, wallHi: i32, sMass: f32, sMom: f32,
    sForce: f32, pad0: f32, pad1: f32, pad2: f32,
};

// One particle. Flat f32s rather than vec2/mat2 so the struct has no padding surprises across backends:
// 16 floats, 64 bytes, and the host writes it with a plain Float32Array view.
struct Particle {
    px: f32, py: f32, vx: f32, vy: f32,
    cxx: f32, cxy: f32, cyx: f32, cyy: f32,
    f00: f32, f01: f32, f10: f32, f11: f32,
    p00: f32, p01: f32, p10: f32, p11: f32,
};

@group(0) @binding(0) var<uniform> P: Params;
@group(0) @binding(1) var<storage, read_write> parts: array<Particle>;
// Five fixed-point accumulators per node -- mass, mvx, mvy, fx, fy. Node k occupies 5k..5k+4, and there is
// nothing after them: see the header on why the centre of mass is NOT accumulated here.
@group(0) @binding(2) var<storage, read_write> acc: array<atomic<i32>>;
// The grid AFTER the solve: vx, vy, mass, unused. Float, because nothing scatters into it.
@group(0) @binding(3) var<storage, read_write> gv: array<vec4<f32>>;
// [0] counts scatters that would have clipped the i32 range. See the header: an overflow is otherwise silent.
@group(0) @binding(4) var<storage, read_write> flags: array<atomic<u32>>;

fn nodeCount() -> u32 { return (P.nx + 1u) * (P.ny + 1u); }

// The clip limit sits below i32's true maximum so that the CHECK fires before the CONVERSION is undefined:
// float-to-int out of range is an indeterminate value in WGSL, not a wrap, so it must never be reached.
const CLIP: f32 = 2100000000.0;

fn fpAdd(slot: u32, value: f32, scale: f32) {
    let x = value * scale;
    if (abs(x) > CLIP) { atomicAdd(&flags[0], 1u); }
    atomicAdd(&acc[slot], i32(round(clamp(x, -CLIP, CLIP))));
}

// ---- the stencil -------------------------------------------------------------------------------------------
// *** THE ONE PIECE OF ARITHMETIC IN THIS FILE THAT ALSO EXISTS IN JAVASCRIPT. *** transfer.mjs quadWeights
// and forces.mjs quadWeightsGrad. gpuKernel-selfcheck parses w0..w2 and d0..d2 out of this text, runs them as
// JS, and compares against those two functions -- so this block is graded as NUMBERS, not as a resemblance.
// Written once and used by both p2g and g2p, so there is one copy to check rather than two to keep in step.
struct Wts { base: i32, w0: f32, w1: f32, w2: f32, d0: f32, d1: f32, d2: f32 };

fn wts(x: f32, h: f32) -> Wts {
    let xi = x / h;
    let base = i32(floor(xi - 0.5));
    let fx = xi - f32(base);
    var o: Wts;
    o.base = base;
    o.w0 = 0.5 * (1.5 - fx) * (1.5 - fx);
    o.w1 = 0.75 - (fx - 1.0) * (fx - 1.0);
    o.w2 = 0.5 * (fx - 0.5) * (fx - 0.5);
    o.d0 = (fx - 1.5) / h;
    o.d1 = (-2.0 * (fx - 1.0)) / h;
    o.d2 = (fx - 0.5) / h;
    return o;
}

fn wAt(o: Wts, i: i32) -> f32 { if (i == 0) { return o.w0; } if (i == 1) { return o.w1; } return o.w2; }
fn dAt(o: Wts, i: i32) -> f32 { if (i == 0) { return o.d0; } if (i == 1) { return o.d1; } return o.d2; }

// ---- 2x2 matrices as vec4, laid out (m00, m01, m10, m11) exactly like constitutive.mjs's arrays ------------
fn mul2(A: vec4<f32>, B: vec4<f32>) -> vec4<f32> {
    return vec4<f32>(A.x * B.x + A.y * B.z, A.x * B.y + A.y * B.w,
                     A.z * B.x + A.w * B.z, A.z * B.y + A.w * B.w);
}
fn tr2(A: vec4<f32>) -> vec4<f32> { return vec4<f32>(A.x, A.z, A.y, A.w); }

// *** JAVASCRIPT DEFINES atan2(0, 0) AS 0. WGSL LEAVES IT UNDEFINED. ***
// That is not a footnote here: an undeformed particle has F = identity, which gives atan2(0, 0) on BOTH
// half-angles, so on a backend that returns NaN there EVERY PARTICLE AT REST WOULD GO NaN ON THE FIRST STEP
// and the page would show nothing with no error anywhere. The guard reproduces JavaScript's defined value and
// touches nothing else -- atan2 is well defined the moment either argument is non-zero.
fn satan2(y: f32, x: f32) -> f32 {
    if (x == 0.0 && y == 0.0) { return 0.0; }
    return atan2(y, x);
}

struct Svd { u: vec4<f32>, s: vec2<f32>, v: vec4<f32> };

// A transliteration of plasticity.mjs svd2, including the sign fix-up that keeps both singular values
// non-negative by absorbing the sign into U.
fn svd2(A: vec4<f32>) -> Svd {
    let a = A.x; let b = A.y; let c = A.z; let d = A.w;
    let e = (a + d) * 0.5;
    let f = (a - d) * 0.5;
    let g = (c + b) * 0.5;
    let hh = (c - b) * 0.5;
    let q = length(vec2<f32>(e, hh));
    let r = length(vec2<f32>(f, g));
    let a1 = satan2(g, f);
    let a2 = satan2(hh, e);
    let theta = (a2 - a1) * 0.5;
    let phi = (a2 + a1) * 0.5;
    var U = vec4<f32>(cos(phi), -sin(phi), sin(phi), cos(phi));
    let V = vec4<f32>(cos(theta), -sin(theta), sin(theta), cos(theta));
    var s0 = q + r;
    var s1 = q - r;
    if (s1 < 0.0) { s1 = -s1; U = vec4<f32>(U.x, -U.y, U.z, -U.w); }
    var o: Svd;
    o.u = U; o.s = vec2<f32>(s0, s1); o.v = V;
    return o;
}

fn fromSvd(U: vec4<f32>, S: vec2<f32>, V: vec4<f32>) -> vec4<f32> {
    return mul2(mul2(U, vec4<f32>(S.x, 0.0, 0.0, S.y)), V);
}

// ---- stage 1: clear ----------------------------------------------------------------------------------------
// The saturation flag is NOT cleared here. It is a property of the whole run, not of one step: a scale that
// clipped once during a collapse must still be reported afterwards, when the material has settled and the
// evidence would otherwise have been erased by the next clear.
@compute @workgroup_size(64)
fn clear(@builtin(global_invocation_id) gid: vec3<u32>) {
    let i = gid.x;
    if (i < nodeCount() * 5u) { atomicStore(&acc[i], 0); }
}

// ---- stage 2: particles to grid ----------------------------------------------------------------------------
// transfer.mjs p2g (affine/APIC) and forces.mjs stressForces in one pass over the particles. They are separate
// functions on the CPU because they were graded separately; they share a stencil and a loop, and combining
// them here changes no arithmetic -- the force does not read the grid, and the transfer does not read the
// stress.
@compute @workgroup_size(64)
fn p2g(@builtin(global_invocation_id) gid: vec3<u32>) {
    let pi = gid.x;
    if (pi >= P.nParticles) { return; }
    let p = parts[pi];
    let h = P.h;
    let m = P.pmass;

    let X = wts(p.px, h);
    let Y = wts(p.py, h);

    // first Piola-Kirchhoff, constitutive.mjs firstPiola. The scatter wants -V0 * P * F0^T and F0 is the
    // identity for every fixture this kernel is used with (see the gate: it checks restBlock's F0), so S = P.
    var S = vec4<f32>(0.0, 0.0, 0.0, 0.0);
    var hasStress = false;
    let J = p.f00 * p.f11 - p.f01 * p.f10;
    if (J > 0.0) {
        // F^-T for a 2x2 is (1/J)[d, -c; -b, a]
        let it = vec4<f32>(p.f11 / J, -p.f10 / J, -p.f01 / J, p.f00 / J);
        let lnJ = log(J);
        S = vec4<f32>(P.mu * (p.f00 - it.x) + P.lambda * lnJ * it.x,
                      P.mu * (p.f01 - it.y) + P.lambda * lnJ * it.y,
                      P.mu * (p.f10 - it.z) + P.lambda * lnJ * it.z,
                      P.mu * (p.f11 - it.w) + P.lambda * lnJ * it.w);
        hasStress = true;
    }
    // An inverted particle contributes NO FORCE and still contributes its mass and momentum, which is exactly
    // what the CPU pair does: p2g scatters every particle, stressForces skips the ones with J <= 0.

    for (var a: i32 = 0; a < 3; a = a + 1) {
        let i = X.base + a;
        if (i < 0 || i > i32(P.nx)) { continue; }
        let wx = wAt(X, a);
        let dwx = dAt(X, a);
        let dx = f32(i) * h - p.px;
        for (var b: i32 = 0; b < 3; b = b + 1) {
            let j = Y.base + b;
            if (j < 0 || j > i32(P.ny)) { continue; }
            let wy = wAt(Y, b);
            let dwy = dAt(Y, b);
            let dy = f32(j) * h - p.py;
            let w = wx * wy;
            let k = u32(j) * (P.nx + 1u) + u32(i);

            // APIC: the momentum carried to a node is m*w*(v + C*(x_i - x_p)). Without the C term this is PIC
            // and angular momentum bleeds away while linear momentum stays perfect.
            let avx = p.vx + (p.cxx * dx + p.cxy * dy);
            let avy = p.vy + (p.cyx * dx + p.cyy * dy);
            fpAdd(k * 5u + 0u, w * m, P.sMass);
            fpAdd(k * 5u + 1u, w * m * avx, P.sMom);
            fpAdd(k * 5u + 2u, w * m * avy, P.sMom);

            if (hasStress) {
                let ggx = dwx * wy;
                let ggy = wx * dwy;
                fpAdd(k * 5u + 3u, -P.pvol * (S.x * ggx + S.y * ggy), P.sForce);
                fpAdd(k * 5u + 4u, -P.pvol * (S.z * ggx + S.w * ggy), P.sForce);
            }
        }
    }

    // *** THE CENTRE OF MASS IS DELIBERATELY NOT ACCUMULATED HERE. It was, and it had to come out. See the
    // header: one i32 accumulator cannot hold both the range and the resolution the free-fall key needs once
    // the particle count is large, and it fails at exactly the scale this kernel exists for. ***
}

// ---- stage 3: the grid solve --------------------------------------------------------------------------------
// gridSolve.mjs normalise -> the stress kick -> applyBodyForce -> enforceWalls, in that order and for the
// reason in this file's header.
@compute @workgroup_size(64)
fn grid(@builtin(global_invocation_id) gid: vec3<u32>) {
    let k = gid.x;
    if (k >= nodeCount()) { return; }
    let m = f32(atomicLoad(&acc[k * 5u + 0u])) / P.sMass;
    var vx = 0.0;
    var vy = 0.0;
    if (m > 0.0) {
        // normalise: momentum becomes velocity. An empty node is LEFT AT ZERO rather than divided, because
        // 0/0 would put NaN into a field every later gather reads.
        vx = (f32(atomicLoad(&acc[k * 5u + 1u])) / P.sMom) / m;
        vy = (f32(atomicLoad(&acc[k * 5u + 2u])) / P.sMom) / m;
        let fx = f32(atomicLoad(&acc[k * 5u + 3u])) / P.sForce;
        let fy = f32(atomicLoad(&acc[k * 5u + 4u])) / P.sForce;
        vx = vx + (fx / m) * P.dt;
        vy = vy + (fy / m) * P.dt;
        // the body force, on the VELOCITY field, which is what makes the total impulse M*g*dt
        vx = vx + P.gx * P.dt;
        vy = vy + P.gy * P.dt;
    }
    if (P.wallsOn == 1u) {
        let i = i32(k % (P.nx + 1u));
        let j = i32(k / (P.nx + 1u));
        let onX = (i < P.wallLo) || (i > i32(P.nx) - P.wallHi);
        let onY = (j < P.wallLo) || (j > i32(P.ny) - P.wallHi);
        // free slip: only the normal component goes. A corner is sticky in this branch too, which is
        // gridSolve.mjs's documented behaviour and not an accident here.
        if (onX) { vx = 0.0; }
        if (onY) { vy = 0.0; }
    }
    gv[k] = vec4<f32>(vx, vy, m, 0.0);
}

// ---- stage 4: grid to particles, then the material ---------------------------------------------------------
@compute @workgroup_size(64)
fn g2p(@builtin(global_invocation_id) gid: vec3<u32>) {
    let pi = gid.x;
    if (pi >= P.nParticles) { return; }
    var p = parts[pi];
    let h = P.h;
    let X = wts(p.px, h);
    let Y = wts(p.py, h);

    var vx = 0.0;
    var vy = 0.0;
    var cxx = 0.0;
    var cxy = 0.0;
    var cyx = 0.0;
    var cyy = 0.0;
    for (var a: i32 = 0; a < 3; a = a + 1) {
        let i = X.base + a;
        if (i < 0 || i > i32(P.nx)) { continue; }
        let wx = wAt(X, a);
        let dx = f32(i) * h - p.px;
        for (var b: i32 = 0; b < 3; b = b + 1) {
            let j = Y.base + b;
            if (j < 0 || j > i32(P.ny)) { continue; }
            let k = u32(j) * (P.nx + 1u) + u32(i);
            let node = gv[k];
            // an empty node CONTRIBUTES NOTHING; it does not contribute zero
            if (node.z <= 0.0) { continue; }
            let w = wx * wAt(Y, b);
            let dy = f32(j) * h - p.py;
            vx = vx + w * node.x;
            vy = vy + w * node.y;
            cxx = cxx + w * node.x * dx;
            cxy = cxy + w * node.x * dy;
            cyx = cyx + w * node.y * dx;
            cyy = cyy + w * node.y * dy;
        }
    }
    // 4/h^2 is the inverse second moment of the QUADRATIC spline -- a property of the kernel, not a tuning
    // constant, and the cubic kernel's factor is different.
    let dInv = 4.0 / (h * h);
    p.vx = vx; p.vy = vy;
    p.cxx = dInv * cxx; p.cxy = dInv * cxy;
    p.cyx = dInv * cyx; p.cyy = dInv * cyy;

    // constitutive.mjs advanceF: F <- (I + dt*C) F
    let A = vec4<f32>(1.0 + P.dt * p.cxx, P.dt * p.cxy, P.dt * p.cyx, 1.0 + P.dt * p.cyy);
    var F = mul2(A, vec4<f32>(p.f00, p.f01, p.f10, p.f11));
    var Fp = vec4<f32>(p.p00, p.p01, p.p10, p.p11);

    if (P.plasticMode == 1u) {
        // plasticity.mjs returnMap: clamp the singular values, and let F_p absorb exactly what was removed.
        let total = mul2(F, Fp);
        let d = svd2(F);
        let lo = 1.0 - P.thetaC;
        let hi = 1.0 + P.thetaS;
        let Sc = vec2<f32>(clamp(d.s.x, lo, hi), clamp(d.s.y, lo, hi));
        F = fromSvd(d.u, Sc, d.v);
        let inv = mul2(mul2(tr2(d.v), vec4<f32>(1.0 / Sc.x, 0.0, 0.0, 1.0 / Sc.y)), tr2(d.u));
        Fp = mul2(inv, total);
    } else if (P.plasticMode == 2u) {
        // druckerPrager.mjs dpReturn. Fp is NOT tracked by this surface on any projecting path -- the CPU
        // returns null there and step.mjs leaves p.Fp alone -- so Fp is untouched in every branch below.
        let d = svd2(F);
        let e0 = log(d.s.x);
        let e1 = log(d.s.y);
        let trace = e0 + e1;
        let dev = vec2<f32>(e0 - trace * 0.5, e1 - trace * 0.5);
        let devNorm = length(dev);
        let yf = devNorm + P.alpha * (2.0 * P.mu + 2.0 * P.lambda) / (2.0 * P.mu) * trace;
        // A VOLUME-PRESERVING DEFORMATION IS NOT EXPANSION. Written as a strict trace > 0 this sends pure
        // shear to the apex, because a determinant of exactly 1 lands a hair positive in floating point and
        // every shearing particle would detach. The tolerance is scaled by the deviator so it means
        // "negligible volume change relative to the shear being done".
        let expanding = trace > 1e-12 * max(1.0, devNorm);
        if (expanding) {
            F = fromSvd(d.u, vec2<f32>(1.0, 1.0), d.v);
        } else if (yf > 0.0) {
            if (devNorm > 0.0) {
                let shrink = (devNorm - yf) / devNorm;
                F = fromSvd(d.u, vec2<f32>(exp(dev.x * shrink + trace * 0.5),
                                           exp(dev.y * shrink + trace * 0.5)), d.v);
            } else {
                // hydrostatic loading has no deviator and dividing by it gives NaN, which is useless as a
                // signal because it cannot be compared to anything
                F = fromSvd(d.u, vec2<f32>(1.0, 1.0), d.v);
            }
        }
    }

    p.f00 = F.x; p.f01 = F.y; p.f10 = F.z; p.f11 = F.w;
    p.p00 = Fp.x; p.p01 = Fp.y; p.p10 = Fp.z; p.p11 = Fp.w;
    p.px = p.px + p.vx * P.dt;
    p.py = p.py + p.vy * P.dt;
    parts[pi] = p;
}
`;

export const MPM_WGSL = WGSL;

/** Byte size of one Particle: 16 f32. The host writes the buffer through a Float32Array, so this is the stride. */
export const PARTICLE_FLOATS = 16;

/** Field offsets into that stride, so the host never counts on its fingers. */
export const PF = { px: 0, py: 1, vx: 2, vy: 3, cxx: 4, cxy: 5, cyx: 6, cyy: 7,
                    f00: 8, f01: 9, f10: 10, f11: 11, p00: 12, p01: 13, p10: 14, p11: 15 };

/** Uniform block: 24 scalars, 96 bytes, a multiple of 16 as the uniform address space requires. */
export const PARAM_SCALARS = 24;

/**
 * Pack the uniform block. Everything physical in here was computed by a graded module; this function only
 * places the numbers, which is why it can be read at a glance and why nothing in the WGSL needs a constant.
 */
export function packParams({ nx, ny, nParticles, plasticMode, h, dt, gx, gy,
                             mu, lambda, alpha, pmass, pvol, thetaC, thetaS,
                             walls, scales }) {
    const buf = new ArrayBuffer(PARAM_SCALARS * 4);
    const u = new Uint32Array(buf), f = new Float32Array(buf), i = new Int32Array(buf);
    u[0] = nx; u[1] = ny; u[2] = nParticles; u[3] = plasticMode;
    f[4] = h; f[5] = dt; f[6] = gx; f[7] = gy;
    f[8] = mu; f[9] = lambda; f[10] = alpha; f[11] = pmass;
    f[12] = pvol; f[13] = thetaC; f[14] = thetaS; u[15] = walls ? 1 : 0;
    i[16] = walls ? walls.lo : 0; i[17] = walls ? walls.hi : 0;
    f[18] = scales.mass; f[19] = scales.mom;
    f[20] = scales.force; f[21] = 0; f[22] = 0; f[23] = 0;
    return buf;
}

// A tiny self-demo so the module has a front door of its own from the command line: it cannot run the kernel,
// so it prints the things about it that ARE knowable here.
// *** GUARDED, BECAUSE THIS MODULE IS LOADED BY A BROWSER AND `process` IS A NODE GLOBAL. *** Unguarded,
// this line threw ReferenceError at module scope, which kills the WHOLE import graph -- so mpm.html
// rendered its headings and then nothing at all. VERIFIED IN A REAL CHROMIUM at v3809, before and after.
// v3941 -- SEPARATOR-TOLERANT AND ANCHORED. `split("/")` returns THE WHOLE PATH on Windows, so this
// guard was false and the block below never ran there. The leading "/" matters too: without it
// `.../loopScope.mjs`.endsWith("Scope.mjs") is true, and a sibling could wake somebody else's main
// block. THIS FILE MAY NOT IMPORT node:url -- a browser page imports it -- so a basename compare is
// the strongest form available here, and winPathGuard re-derives that exemption rather than trusting it.
if (typeof process !== "undefined" && process.argv[1] && import.meta.url.endsWith("/" + process.argv[1].split(/[\\/]/).pop())) {
    const cl = clampLimits();
    const s = fixedPointScales();
    console.log("[mpm-gpu] clamp limits measured from returnMap: thetaC " + cl.thetaC + "  thetaS " + cl.thetaS);
    console.log("[mpm-gpu] fixed-point scales: mass 2^" + Math.log2(s.mass) + "  mom 2^" + Math.log2(s.mom) +
                "  force 2^" + Math.log2(s.force));
    console.log("[mpm-gpu] WGSL " + MPM_WGSL.length + " chars, entry points: clear, p2g, grid, g2p");
    const w = quadWeights(3.37, 0.5), gwt = quadWeightsGrad(3.37, 0.5);
    console.log("[mpm-gpu] the JS stencil this kernel is graded against: w sum " +
                (w.w[0] + w.w[1] + w.w[2]).toFixed(15) + "   dw sum " +
                (gwt.dw[0] + gwt.dw[1] + gwt.dw[2]).toExponential(3));
}
