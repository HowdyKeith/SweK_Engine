// WebGLEngine/physics/render/microfacetWgsl.mjs -- v4408
//
// *** THE MICROFACET LOBES ON A DEVICE -- AND THE WGSL IS GENERATED FROM THE SHIPPED GLSL RATHER THAN
// RETYPED BESIDE IT. ***
//
// render/microfacetShader.js has carried the GGX lobe in GLSL since v3494 and has never run on a GPU. Its own
// header says so, in the plainest terms this tree uses:
//
//     "WHAT THIS FILE CANNOT ANSWER: whether a real driver agrees. highp is a MINIMUM guarantee and a vendor
//      may carry more, may fold expressions differently, or may not honour highp in a fragment shader at all.
//      THE SANDBOX MODELS binary32; THE GPU IS THE AUTHORITY, and the page reads the numbers back to ask it."
//
// The sandbox has a device now (v4405 was the first kernel to use it). This asks.
//
// ---- WHY THE SHADER TEXT IS TRANSLATED RATHER THAN COPIED ------------------------------------------------------
//
// v3494's whole design is that the GLSL is EXTRACTABLE: "every line the gate reads is a SINGLE ASSIGNMENT in a
// subset that is valid JavaScript once PI and the two intrinsics are substituted". That let it grade the
// shader by evaluating the shipped expression with Math.fround -- a MODEL of binary32 -- rather than by
// trusting a second copy.
//
// *** A HAND-WRITTEN WGSL COPY WOULD THROW THAT AWAY AT THE EXACT MOMENT IT FINALLY MATTERED. *** The whole
// point of asking a device is that the device is the authority on binary32; if the device is running a
// different transcription of the lobe, the answer is about the transcription. So the WGSL here is BUILT FROM
// `FRAG_SRC_GGX`'s own text: `glslFnToWgsl` lifts each `float name(args){...}` out of the shipped source and
// rewrites it, and the gate proves the rewriter on a fixture whose answer is known before pointing it at the
// shipping shader -- v3450's rule, and `evalGlsl`'s own rule, kept.
//
// The substitution set is deliberately tiny and is the whole difference between the two languages here:
//
//     float                -> f32              in both the signature and each local
//     float f(a,b){...}    -> fn f(a:f32,b:f32) -> f32 {...}
//     c ? t : e            -> select(e, t, c)   ONE ternary, no nesting; a second one is refused
//     + - * / sqrt max     -> unchanged, and numeric literals are spelled the same way in both
//
// *** THE TERNARY IS THE ONLY REAL TRANSLATION AND select() TAKES ITS ARMS IN THE OTHER ORDER, which is
// exactly the kind of swap that leaves a plausible picture and a wrong number. The gate checks it on a
// fixture where the two arms are 7 and 9 before it is allowed near D. ***
//
// ---- WHAT A DEVICE CAN BE ASKED THAT THE MODEL CANNOT --------------------------------------------------------
//
// v3494's finding is a claim about binary32 arithmetic made by a MODEL of binary32:
//
//     the textbook denominator      t = cos^2 (a^2 - 1) + 1        a difference of numbers near 1
//     the rewrite this tree ships   t = (1 - cos^2) + a^2 cos^2    a sum of positives
//
// -- measured with Math.fround at 2.60e-2 against 1.33e-7 at roughness 0.001, five orders, and INDISTINGUISHABLE
// at f64. Math.fround rounds after every operation. A device is not obliged to: WGSL permits an implementation
// to contract a multiply and an add into one fused operation and to reassociate, and if it does, the
// cancellation the rewrite exists to avoid is a different size than the model says. So the model's number is a
// PREDICTION about hardware and this is the first round in a position to score it.
//
// ---- THE THREE IDENTITIES, WHICH THE GLSL PROBE CANNOT REACH AT ALL ------------------------------------------
//
// microfacet.mjs's keys are INTEGRALS, and a fragment shader that writes one lobe value per pixel cannot take
// an integral -- v3494 shipped the lobe and left the identities on the CPU. A compute pass can:
//
//   (1) INT D(m)(n.m) dm  = 1   over the hemisphere, at every roughness
//   (2) INT D(wh) G1(wo)/(4|cos_o|) dwi = 1   over the FULL SPHERE, at every roughness AND every view angle
//   (3) E(wo) = INT D G2/(4 cos_o) dwi       over the hemisphere: a MEASURED CURVE, not a constant
//
// (1) and (2) are ANALYTIC KEYS with no free parameter, which is v4407's claim shape and the reason this port
// does not need a tolerance invented for it. (3) is not, and is graded as a trend rather than as a number.
//
// ---- ONE DEPARTURE FROM THE CPU THAT IS REAL AND IS NOT f32 ---------------------------------------------------
//
// *** microfacet.mjs normalises the half-vector with Math.hypot, AND NO SHADING LANGUAGE HAS hypot. *** hypot is
// specified to avoid the intermediate overflow and the extra rounding of sqrt(x*x+y*y+z*z); WGSL's length() is
// the plain form and is what any port must use. At f64 the difference is ~1e-16 and nobody would find it. It is
// named here because it is a difference between the reference and the port that has nothing to do with the
// hardware, and a floor measured without knowing about it would be attributing it to the GPU.
//
// EVERY FAULT IS A PARAMETER OR A DECLARED STRING REPLACE, never a second copy of the shader:
//   noJacobian, separable, beckmann  -- uniform bits, read by the kernel around the lobe
//   textbook, noPi                   -- produced from the shipped text by replace(), and the replace is ASSERTED
//                                       to have happened, which is FRAG_SRC_GGX_NAIVE's own rule
//
// Gated in physics/render/microfacetWgsl-selfcheck.mjs.
"use strict";

import { FRAG_SRC_GGX, T_LINES } from "../../render/microfacetShader.js";

/** Uniform bits. Names match microfacet.mjs's option names exactly, so a planted run reads the same either side. */
export const FAULT = Object.freeze({ noJacobian: 1, separable: 2, beckmann: 4 });

/** Integrand modes. 0 and 1 have analytic answers; 2 is a curve. */
export const MODE = Object.freeze({ ndf: 0, weak: 1, strong: 2 });

/**
 * Lift `float name(a, b){ ... }` out of GLSL and rewrite the body as WGSL.
 *
 * Returns null when the function is not there, rather than throwing: "the shipped shader no longer has this
 * function" is a finding the gate should name, not a stack trace it should survive. THROWS only for the one
 * case that would be a SILENT wrong answer -- a second ternary, which this translator cannot see the shape of.
 */
export function glslFnToWgsl(src, name) {
    const m = src.match(new RegExp("float\\s+" + name + "\\s*\\(([^)]*)\\)\\s*\\{([\\s\\S]*?)\\n\\}"));
    if (!m) return null;
    const args = m[1].split(",").map((s) => s.trim()).filter(Boolean)
        .map((s) => s.replace(/^float\s+/, "") + " : f32").join(", ");
    const body = m[2].split("\n").map((line) => {
        const t = line.trim();
        if (!t) return "";
        if (t.startsWith("//")) return "  " + t;
        if (t.startsWith("return ")) return "  return " + ternary(t.slice(7).replace(/;$/, "")) + ";";
        const a = t.match(/^float\s+(\w+)\s*=\s*([\s\S]+);$/);
        if (a) return `  let ${a[1]} : f32 = ${ternary(a[2])};`;
        throw new Error("glslFnToWgsl: unhandled line in " + name + ": " + t);
    }).filter((s) => s !== "").join("\n");
    return `fn ${name}(${args}) -> f32 {\n${body}\n}`;
}

/**
 * `c ? t : e`  ->  `select(e, t, c)`.
 *
 * *** THE ARMS SWAP. *** select's first argument is the FALSE one, which is the reverse of every C-family
 * ternary, and getting it backwards produces a shader that compiles, runs, and is wrong only where the
 * condition bites. The split is paren-aware and refuses a second `?` outright rather than guessing at nesting.
 */
function ternary(expr) {
    // *** COUNTED OVER THE WHOLE EXPRESSION, NOT AT TOP LEVEL. *** The first draft asked whether a SECOND `?`
    // sat at depth 0, which a nested ternary never does -- it is inside the parentheses of an arm. The check
    // then passed, the split found the wrong `:`, and the output carried a live `?` into WGSL. Refusing on the
    // COUNT is the invariant that cannot be evaded by nesting, and the post-condition below proves it held.
    const count = (expr.match(/\?/g) || []).length;
    if (count > 1) throw new Error("glslFnToWgsl: more than one ternary in an expression is out of scope");
    const q = topLevel(expr, "?");
    if (q < 0) return expr;
    const c = topLevel(expr.slice(q + 1), ":");
    if (c < 0) throw new Error("glslFnToWgsl: ternary with no ':'");
    const cond = expr.slice(0, q).trim(), then = expr.slice(q + 1, q + 1 + c).trim(), els = expr.slice(q + 2 + c).trim();
    const out = `select(${els}, ${then}, ${cond})`;
    if (out.includes("?")) throw new Error("glslFnToWgsl: a ternary survived the rewrite: " + out);
    return out;
}

/** Index of the first `ch` at paren depth 0, or -1. */
function topLevel(s, ch) {
    let d = 0;
    for (let i = 0; i < s.length; i++) {
        if (s[i] === "(") d++;
        else if (s[i] === ")") d--;
        else if (s[i] === ch && d === 0) return i;
    }
    return -1;
}

/**
 * The GLSL the WGSL is built from, with a plant applied or not.
 *
 * `textbook` puts back the cancellation-prone denominator using microfacetShader.js's OWN two lines, so the
 * planted and clean shaders differ by exactly one line by construction. `noPi` drops the normalising constant
 * and the NDF integral must then read exactly PI -- a predicted factor with no free parameter.
 *
 * *** THE REPLACE IS ASSERTED, NOT ASSUMED. A silent no-op replace leaves the plant equal to the clean text and
 * every comparison reports a comfortable zero -- which is FRAG_SRC_GGX_NAIVE's stated reason for existing. ***
 */
export function plantedGlsl({ textbook = false, noPi = false } = {}) {
    let src = FRAG_SRC_GGX;
    if (textbook) {
        if (!src.includes(T_LINES.stable)) throw new Error("plantedGlsl: the stable denominator line is not in the shipped shader");
        src = src.replace(T_LINES.stable, T_LINES.naive);
    }
    if (noPi) {
        const PI_MUL = "3.141592653589793 * t * t";
        if (!src.includes(PI_MUL)) throw new Error("plantedGlsl: the normalising pi is not where noPi expects it");
        src = src.replace(PI_MUL, "1.0 * t * t");
    }
    return src;
}

/** The kernel around the lobe. The three lobe functions are spliced in from the shipped GLSL, never retyped. */
/**
 * The lobe itself: the three functions translated out of the shipped GLSL, plus the masking helpers built on
 * them. Exported SEPARATELY from the kernels so a second module can compose the same lobe without a second
 * translation -- physics/render/microfacetSampleWgsl.mjs does, and a lobe copied for it could have drifted.
 */
export function lobeWgsl(plant = {}) {
    const src = plantedGlsl(plant);
    const fns = ["ggxD", "ggxLambda", "ggxG2"].map((n) => {
        const f = glslFnToWgsl(src, n);
        if (!f) throw new Error("lobeWgsl: " + n + " is not in the shipped shader");
        return f;
    });
    return fns.join("\n\n") + "\n" + LOBE_HELPERS;
}

export function buildWgsl(plant = {}) {
    return WGSL_HEAD + "\n\n" + lobeWgsl(plant) + "\n" + WGSL_TAIL;
}

const WGSL_HEAD = /* wgsl */ `
// microfacet.wgsl -- GENERATED. ggxD, ggxLambda and ggxG2 below are render/microfacetShader.js's own GLSL
// text, rewritten by physics/render/microfacetWgsl.mjs. Editing them here edits a copy that nothing ships.
struct Params {
  mode      : u32,
  faults    : u32,
  laneCount : u32,
  nTheta    : u32,
  nPhi      : u32,
  hostTrig  : u32,
  alpha     : f32,
  cosO      : f32,
};
@group(0) @binding(0) var<uniform>             P    : Params;
@group(0) @binding(1) var<storage, read_write> part : array<f32>;
// The theta grid's sine and cosine, computed on the HOST. Read only when P.hostTrig is 1, and the whole
// subject of this round: see TRIG_ABS_ERR in the module below.
@group(0) @binding(2) var<storage, read>       trig : array<f32>;

const PI : f32 = 3.141592653589793;`;

const LOBE_HELPERS = /* wgsl */ `
// Abramowitz-Stegun 7.1.26, needed only by the beckmann plant. microfacet.mjs's erf(), constant for constant.
fn erfA(x0 : f32) -> f32 {
  let s = sign(x0);
  let x = abs(x0);
  let t = 1.0 / (1.0 + 0.3275911 * x);
  let y = 1.0 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * exp(-x * x);
  return s * y;
}

// Smith's Lambda for the BECKMANN distribution. A real function, correctly implemented, belonging to a
// different microfacet distribution -- which is the mistake the weak furnace test was invented to catch.
fn lambdaBeckmann(cosW : f32, a : f32) -> f32 {
  let c2 = cosW * cosW;
  let tan2 = (1.0 - c2) / max(c2, 1.0e-16);
  let d = a * sqrt(tan2);
  let ai = 1.0 / select(d, 1.0e-16, d == 0.0);
  return (erfA(ai) - 1.0) / 2.0 + exp(-ai * ai) / (2.0 * ai * sqrt(PI));
}

fn lam(cosW : f32, a : f32) -> f32 {
  return select(ggxLambda(cosW, a), lambdaBeckmann(cosW, a), (P.faults & 4u) != 0u);
}
fn g1(cosW : f32, a : f32) -> f32 { return 1.0 / (1.0 + lam(cosW, a)); }
fn g2(cosO : f32, cosI : f32, a : f32) -> f32 {
  let sep = g1(cosO, a) * g1(cosI, a);
  let hc  = 1.0 / (1.0 + lam(cosO, a) + lam(cosI, a));
  return select(hc, sep, (P.faults & 2u) != 0u);
}

`;

const WGSL_TAIL = /* wgsl */ `
// ndfIntegral: one lane per stripe of the theta grid, striding by laneCount. The host adds the partials in
// f64 and applies the 2 PI, exactly as microfacet.mjs's last line does.
fn ndfPartial(lane : u32) -> f32 {
  let n = P.nTheta;
  let dth = (PI / 2.0) / f32(n);
  var s : f32 = 0.0;
  var i = lane;
  loop {
    if (i >= n) { break; }
    let th = (f32(i) + 0.5) * dth;
    // *** THE ONE LINE THIS ROUND IS ABOUT. *** WGSL bounds sin and cos by an ABSOLUTE error of 2^-11 inside
    // [-PI, PI], so near theta = 0 a conformant cos is only correct to about four decimals -- and ggxD's
    // (1.0 - c2) is then wrong by orders, because it is the difference of two numbers within 2^-11 of 1.
    // hostTrig reads the same grid computed in f64 instead, which is what tells the two apart.
    let c = select(cos(th), trig[i * 2u + 1u], P.hostTrig == 1u);
    let st = select(sin(th), trig[i * 2u], P.hostTrig == 1u);
    s = s + ggxD(c, P.alpha) * c * st * dth;
    i = i + P.laneCount;
  }
  return s;
}

// furnaceIntegral: the weak and strong forms differ by ONE TERM and by their domain, so they are one loop with
// one flag here as they are one loop there.
fn furnacePartial(lane : u32) -> f32 {
  let strong = P.mode == 2u;
  let so = sqrt(max(0.0, 1.0 - P.cosO * P.cosO));
  let wo = vec3<f32>(so, 0.0, P.cosO);
  let thMax = select(PI, PI / 2.0, strong);
  let dth = thMax / f32(P.nTheta);
  let dph = PI / f32(P.nPhi);
  // *** length() AND NOT hypot(): microfacet.mjs normalises with Math.hypot and no shading language has it.
  // Named in this module's header; the departure is the port's, not the hardware's.
  let jac = select(4.0, 1.0, (P.faults & 1u) != 0u);
  var s : f32 = 0.0;
  var i = lane;
  loop {
    if (i >= P.nTheta) { break; }
    let th = (f32(i) + 0.5) * dth;
    let ct = cos(th);
    let st = sin(th);
    var j : u32 = 0u;
    loop {
      if (j >= P.nPhi) { break; }
      let ph = (f32(j) + 0.5) * dph;
      let wi = vec3<f32>(st * cos(ph), st * sin(ph), ct);
      let h = wo + wi;
      let hl = sqrt(dot(h, h));
      if (hl >= 1.0e-9) {
        let wh = h / hl;
        let mask = select(select(0.0, g1(P.cosO, P.alpha), dot(wo, wh) / P.cosO > 0.0),
                          g2(P.cosO, ct, P.alpha), strong);
        s = s + ggxD(wh.z, P.alpha) * mask / (jac * abs(P.cosO)) * st * dth * dph;
      }
      j = j + 1u;
    }
    i = i + P.laneCount;
  }
  return s;
}

@compute @workgroup_size(64)
fn integrate(@builtin(global_invocation_id) gid : vec3<u32>) {
  let lane = gid.x;
  if (lane >= P.laneCount) { return; }
  part[lane] = select(furnacePartial(lane), ndfPartial(lane), P.mode == 0u);
}

// What the DEVICE'S OWN sin and cos are on the theta grid, read back rather than assumed. Two numbers per
// lane, on the same bindings as every other entry point here -- a diagnostic shader with a binding shape of
// its own was this gate's first draft, and an auto layout that did not match the bind group left the buffer
// untouched, so the check read zeros and reported cos off by exactly 1.0. A wrong number, not a failure to run.
@compute @workgroup_size(64)
fn trigProbe(@builtin(global_invocation_id) gid : vec3<u32>) {
  let k = gid.x;
  if (k >= P.laneCount) { return; }
  let dth = (PI / 2.0) / f32(P.nTheta);
  let th = (f32(k) + 0.5) * dth;
  part[k * 2u]      = sin(th);
  part[k * 2u + 1u] = cos(th);
}

// The v3494 probe, unchanged in intent: one lane per (roughness, cos) pair, three numbers out and no picture.
@compute @workgroup_size(64)
fn probe(@builtin(global_invocation_id) gid : vec3<u32>) {
  let lane = gid.x;
  if (lane >= P.laneCount) { return; }
  let c = part[lane * 3u];
  let a = part[lane * 3u + 1u];
  part[lane * 3u]      = ggxD(c, a);
  part[lane * 3u + 1u] = ggxLambda(c, a);
  part[lane * 3u + 2u] = ggxG2(c, c, a);
}`;

/** The uniform, packed the way the struct is laid out: five u32 then three f32, all scalars, 32 bytes. */
export function packParams({ mode, faults = 0, laneCount, nTheta = 0, nPhi = 0, hostTrig = 0, alpha = 0, cosO = 0 }) {
    const buf = new ArrayBuffer(32), u = new Uint32Array(buf), f = new Float32Array(buf);
    u[0] = mode; u[1] = faults; u[2] = laneCount; u[3] = nTheta; u[4] = nPhi; u[5] = hostTrig;
    f[6] = alpha; f[7] = cosO;
    return { buf, u32: u, f32: f };
}

/**
 * The theta grid's sine and cosine at the SAME midpoints the kernel would compute, taken in f64 and stored as
 * f32 -- so the only thing that changes between a hostTrig run and a built-in run is WHERE the transcendental
 * was evaluated. Everything else, including the storage precision, is identical.
 */
export function trigTable(nTheta) {
    const t = new Float32Array(nTheta * 2), dth = Math.fround(Math.fround(Math.fround(Math.PI) / 2) / Math.fround(nTheta));
    for (let i = 0; i < nTheta; i++) {
        const th = Math.fround(Math.fround(Math.fround(i) + 0.5) * dth);
        t[i * 2] = Math.sin(th); t[i * 2 + 1] = Math.cos(th);
    }
    return t;
}

/**
 * *** WGSL's OWN BOUND, AND IT IS THE REASON THIS ROUND EXISTS. *** The specification's builtin-accuracy table
 * gives sin and cos an ABSOLUTE error of 2^-11 inside [-PI, PI] -- not a relative one, and not an ULP count.
 * So a conformant device may return cos(x) up to 4.88e-4 away from the true value, and near x = 0 that is four
 * correct decimals in a quantity whose interesting part is the fifth onward.
 */
export const TRIG_ABS_ERR = Math.pow(2, -11);

/**
 * The host half of the reduction: add the f32 partials in f64 and apply the constant the CPU applies last.
 * ndfIntegral multiplies by 2 PI; furnaceIntegral doubles, because phi runs over half the range.
 */
export function reduce(partials, mode) {
    let s = 0;
    for (let i = 0; i < partials.length; i++) s += partials[i];
    return mode === MODE.ndf ? s * 2 * Math.PI : s * 2;
}

/**
 * The f32 MIRROR of the device's ndf partition -- same stripes, same order, Math.fround after every operation
 * and a Float32Array for the partials.
 *
 * *** THE STORE IS PART OF THE MODEL. *** v4405 shipped a floor measured one rounding short of the kernel
 * because the mirror kept its partials in f64 while `array<f32>` did not, and the gate that caught it was the
 * one written to assert the drift. The Float32Array here is that lesson and not a decoration.
 */
export function ndfEmulated(alpha, { nTheta = 4000, laneCount = 64 } = {}) {
    const fr = Math.fround, part = new Float32Array(laneCount);
    const dth = fr(fr(fr(Math.PI) / 2) / fr(nTheta));
    for (let lane = 0; lane < laneCount; lane++) {
        let s = 0;
        for (let i = lane; i < nTheta; i += laneCount) {
            const th = fr(fr(fr(i) + 0.5) * dth);
            const c = fr(Math.cos(th));
            s = fr(s + fr(fr(fr(dEmulated(c, alpha)) * c) * fr(fr(Math.sin(th)) * dth)));
        }
        part[lane] = s;
    }
    return reduce(part, MODE.ndf);
}

/** microfacetShader.js's ggxD, in the sum-of-positives form the shader ships, at binary32. */
export function dEmulated(cosM, alpha) {
    const fr = Math.fround;
    if (cosM <= 0) return 0;
    const a2 = fr(alpha * alpha), c2 = fr(cosM * cosM);
    const t = fr(fr(1 - c2) + fr(a2 * c2));
    return fr(a2 / fr(fr(Math.PI) * fr(t * t)));
}
